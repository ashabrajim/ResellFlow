import type { PlatformId, ProductPlatform } from "./types.ts";

/**
 * Registre des plateformes. Une entrée = un « adaptateur » côté serveur
 * (voir src/backend/china/adapters.ts) : hôtes autorisés, extraction de
 * l'identifiant produit, URL canonique.
 *
 * `status` reflète honnêtement l'état de l'intégration :
 *  - 'untested' : l'extraction repose sur les métadonnées publiques de la page
 *    (JSON-LD / Open Graph) et N'A PAS été validée sur la vraie plateforme.
 *  Ne jamais passer à 'tested' sans test réel documenté.
 */
export type PlatformStatus = "untested" | "tested";

export type PlatformDef = {
  id: PlatformId;
  label: string;
  /** Hôtes (et leurs sous-domaines) autorisés pour les pages produit. */
  hosts: string[];
  /** Hôtes de liens courts : on suit la redirection, puis on revalide l'hôte final. */
  shortHosts: string[];
  defaultCurrency: string | null;
  status: PlatformStatus;
  extractItemId: (url: URL) => string | null;
  canonicalUrl: (itemId: string) => string;
  /** Ce que l'adaptateur peut (en théorie) récupérer, pour l'affichage des limites. */
  limits: string;
};

const ID_RE = /^\d{6,20}$/;

function qp(url: URL, ...names: string[]): string | null {
  for (const n of names) {
    const v = url.searchParams.get(n);
    if (v && ID_RE.test(v)) return v;
  }
  return null;
}

export const PLATFORMS: PlatformDef[] = [
  {
    id: "taobao",
    label: "Taobao",
    hosts: ["taobao.com"],
    shortHosts: ["tb.cn", "e.tb.cn", "m.tb.cn"],
    defaultCurrency: "CNY",
    status: "untested",
    extractItemId: (u) => qp(u, "id", "itemId", "item_id"),
    canonicalUrl: (id) => `https://item.taobao.com/item.htm?id=${id}`,
    limits:
      "Avec le connecteur d’import automatique (jeton APIFY_API_TOKEN) : titre, prix en yuans, images, variantes avec prix et stock. Sans connecteur, Taobao bloque la lecture depuis un serveur (connexion / anti-robot). Pas d’avis clients ni de note.",
  },
  {
    id: "tmall",
    label: "Tmall",
    hosts: ["tmall.com", "tmall.hk"],
    shortHosts: [],
    defaultCurrency: "CNY",
    status: "untested",
    extractItemId: (u) => qp(u, "id", "itemId", "item_id"),
    canonicalUrl: (id) => `https://detail.tmall.com/item.htm?id=${id}`,
    limits:
      "Mêmes limites que Taobao (même groupe) : accès souvent protégé, variantes et avis non accessibles sans API officielle.",
  },
  {
    id: "weidian",
    label: "Weidian",
    hosts: ["weidian.com"],
    shortHosts: ["youshop10.com", "k.youshop10.com"],
    defaultCurrency: "CNY",
    status: "untested",
    extractItemId: (u) => qp(u, "itemID", "itemId", "itemid", "id"),
    canonicalUrl: (id) => `https://weidian.com/item.html?itemID=${id}`,
    limits:
      "Avec le connecteur d’import automatique (jeton APIFY_API_TOKEN) : titre, prix en yuans, images, variantes avec prix et stock. Sans connecteur, les métadonnées publiques sont souvent minimales. Pas d’avis clients ni de note.",
  },
  {
    id: "1688",
    label: "1688",
    hosts: ["1688.com"],
    shortHosts: ["qr.1688.com"],
    defaultCurrency: "CNY",
    status: "untested",
    extractItemId: (u) => {
      const m = u.pathname.match(/\/offer\/(\d{6,20})\.html?$/i);
      return m?.[1] ?? qp(u, "offerId", "id");
    },
    canonicalUrl: (id) => `https://detail.1688.com/offer/${id}.html`,
    limits:
      "1688 impose une connexion pour la plupart des pages. Les prix par palier et variantes ne sont pas accessibles sans API officielle.",
  },
  {
    id: "aliexpress",
    label: "AliExpress",
    hosts: ["aliexpress.com", "aliexpress.us"],
    shortHosts: ["a.aliexpress.com", "s.click.aliexpress.com"],
    defaultCurrency: null,
    status: "untested",
    extractItemId: (u) => {
      const m = u.pathname.match(/\/(?:item|i)\/(\d{6,20})\.html?$/i);
      return m?.[1] ?? qp(u, "productId");
    },
    canonicalUrl: (id) => `https://www.aliexpress.com/item/${id}.html`,
    limits:
      "Les pages AliExpress sont rendues en JavaScript : seules les métadonnées publiques (titre, image, prix si présent) peuvent être lues. Variantes et avis non garantis.",
  },
];

export function getPlatform(id: ProductPlatform): PlatformDef | null {
  return PLATFORMS.find((p) => p.id === id) ?? null;
}

export function platformLabel(id: ProductPlatform): string {
  return getPlatform(id)?.label ?? "Autre plateforme";
}

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Plateforme dont les hôtes de pages produit contiennent `host`. */
export function platformForHost(host: string): PlatformDef | null {
  const h = host.toLowerCase().replace(/\.$/, "");
  return PLATFORMS.find((p) => p.hosts.some((d) => hostMatches(h, d))) ?? null;
}

/** Plateforme dont `host` est un hôte de lien court. */
export function shortLinkPlatformForHost(host: string): PlatformDef | null {
  const h = host.toLowerCase().replace(/\.$/, "");
  return PLATFORMS.find((p) => p.shortHosts.some((d) => hostMatches(h, d))) ?? null;
}

/** Tous les hôtes autorisés (pages produit + liens courts), pour la liste blanche SSRF. */
export function isAllowedHost(host: string): boolean {
  return platformForHost(host) !== null || shortLinkPlatformForHost(host) !== null;
}
