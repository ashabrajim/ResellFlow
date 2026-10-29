import { normalizeImageUrl } from "../../lib/china/product.ts";
import type { PlatformDef } from "../../lib/china/platforms.ts";
import type { PlatformId } from "../../lib/china/types.ts";
import type { ParsedPage, ParsedSku } from "./adapters.ts";
import { ImportError } from "./errors.ts";
import type { FetchLike } from "./fetcher.ts";

/**
 * Fournisseur de données produit « Apify » (acteurs communautaires facturés à l'usage).
 *
 * Pourquoi : Taobao et Weidian n'exposent ni les variantes ni les prix par variante dans leurs
 * pages publiques, et bloquent les lectures depuis un serveur. Un acteur Apify renvoie ces
 * données déjà structurées (titre, prix en yuans, images, SKU avec prix et stock).
 *
 * Formats de réponse : repris de la documentation publique des acteurs (pages Apify), voir
 * README § « Import automatique ». Ce connecteur n'a PAS été exécuté contre l'API réelle depuis
 * l'environnement de développement (pas d'accès réseau à Apify) : il est couvert par des tests
 * sur les exemples de la documentation, pas par un appel réel.
 *
 * Contrat : on ne renvoie que ce que l'acteur a effectivement fourni. Rien n'est inventé
 * (pas d'avis, pas de note : ces acteurs n'en renvoient pas).
 */

/** Acteur utilisé par plateforme. Une plateforme absente = pas de connecteur (Tmall, 1688, AliExpress). */
export const APIFY_ACTORS: Partial<Record<PlatformId, string>> = {
  taobao: "pizani~taobao-product-scraper",
  weidian: "pizani~weidian-product-detail-api",
};

const MAX_SKUS = 300;
const MAX_IMAGES = 20;
const MAX_ATTRIBUTES = 30;

type Json = unknown;

function isObj(v: Json): v is Record<string, Json> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function str(v: Json): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}
/** Nombre positif depuis un nombre ou une chaîne (« 68.00 »). Rien d'autre n'est deviné. */
function money(v: Json): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}
function count(v: Json): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Les jetons Apify sont ASCII : tout autre caractère ferait échouer fetch (en-tête invalide). */
export function isValidApifyToken(token: string): boolean {
  return /^[\x21-\x7e]{8,200}$/.test(token);
}

export type ApifyCallOptions = {
  actor: string;
  productUrl: string;
  token: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  /** Marge ajoutée au délai HTTP par rapport au délai de l'acteur (défaut 5 s). */
  graceMs?: number;
};

/** Lance l'acteur et attend ses résultats (endpoint « run-sync-get-dataset-items »). */
export async function callApifyActor(opts: ApifyCallOptions): Promise<unknown[]> {
  if (!isValidApifyToken(opts.token)) {
    throw new ImportError(
      "HTTP_ERROR",
      "Le service d’import automatique est mal configuré (jeton Apify invalide).",
    );
  }
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const f: FetchLike = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(opts.actor)}/run-sync-get-dataset-items?timeout=${Math.ceil(timeoutMs / 1000)}`;
  let res: Response;
  try {
    res = await f(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${opts.token}`, // en-tête (jamais dans l'URL : évite les fuites dans les logs)
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ product_url: opts.productUrl }),
      signal: AbortSignal.timeout(timeoutMs + (opts.graceMs ?? 5_000)),
    });
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new ImportError(
      timedOut ? "TIMEOUT" : "NETWORK",
      timedOut
        ? "Le service d’import automatique a mis trop de temps à répondre."
        : "Impossible de joindre le service d’import automatique.",
    );
  }
  if (!res.ok) {
    // Le corps peut décrire l'erreur ; on le garde dans les logs serveur uniquement.
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 200);
    } catch {
      /* ignoré */
    }
    console.error(`Apify [${res.status}] ${opts.actor}: ${detail}`);
    if (res.status === 401 || res.status === 403)
      throw new ImportError(
        "HTTP_ERROR",
        "Le service d’import automatique est mal configuré (jeton Apify refusé).",
      );
    if (res.status === 402)
      throw new ImportError("HTTP_ERROR", "Le crédit du service d’import automatique est épuisé.");
    if (res.status === 408)
      throw new ImportError(
        "TIMEOUT",
        "Le service d’import automatique a mis trop de temps à répondre.",
      );
    if (res.status === 429)
      throw new ImportError(
        "RATE_LIMITED",
        "Le service d’import automatique est saturé, réessaie dans un instant.",
      );
    throw new ImportError(
      "NO_DATA",
      "Le service d’import n’a pas pu lire ce produit (retiré, indisponible ou lien incorrect).",
    );
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ImportError("BAD_CONTENT", "Réponse illisible du service d’import automatique.");
  }
  if (!Array.isArray(json)) {
    throw new ImportError("BAD_CONTENT", "Réponse inattendue du service d’import automatique.");
  }
  return json;
}

/** Convertit un élément du jeu de données Apify (format documenté) en page produit. */
export function parseApifyItem(item: unknown, platform: PlatformDef): ParsedPage {
  if (!isObj(item) || !isObj(item["productInfo"])) {
    throw new ImportError(
      "NO_DATA",
      `Aucune donnée produit reçue pour ce lien ${platform.label} (produit retiré ou indisponible).`,
    );
  }
  const p = item["productInfo"];
  const seller = isObj(item["sellerInfo"]) ? str(item["sellerInfo"]["shopTitle"]) : null;

  const titleCN = str(p["titleCN"]);
  const titleEN = str(p["title"]);
  const title = (titleCN ?? titleEN)?.slice(0, 300) ?? null;

  // Images : galerie uniquement (les images de description sont des visuels marketing longs).
  const imgs: string[] = [];
  if (Array.isArray(p["imgList"])) {
    for (const raw of p["imgList"]) {
      const u = typeof raw === "string" ? normalizeImageUrl(raw) : null;
      if (u && !imgs.includes(u)) imgs.push(u);
      if (imgs.length >= MAX_IMAGES) break;
    }
  }

  // SKU : « options » = une entrée par variante vendue.
  const skus: ParsedSku[] = [];
  let truncated = false;
  if (Array.isArray(p["options"])) {
    for (const o of p["options"]) {
      if (!isObj(o)) continue;
      const label = str(o["name"]);
      if (!label) continue;
      if (skus.length >= MAX_SKUS) {
        truncated = true;
        break;
      }
      const stock = count(o["stock"]);
      const image = typeof o["imgUrl"] === "string" ? normalizeImageUrl(o["imgUrl"]) : null;
      skus.push({
        label: label.slice(0, 200),
        price: money(o["priceCNY"]),
        available: stock === null ? null : stock > 0,
        image,
      });
    }
  }

  // Nom de l'axe : Weidian fournit « atributtes » dérivé des SKU (un seul groupe = le nom de l'axe).
  // Taobao ne donne pas les noms d'axes (couleur / taille…) : un seul sélecteur « Variante ».
  const attrs = isObj(p["atributtes"]) ? p["atributtes"] : {};
  const attrEntries = Object.entries(attrs).filter(
    (e): e is [string, string] => typeof e[1] === "string" && e[1].trim() !== "",
  );
  const groupName =
    platform.id === "weidian" && attrEntries.length === 1 ? (attrEntries[0]?.[0] ?? null) : null;

  // Description : la fiche technique (clé : valeur), uniquement quand elle existe réellement (Taobao).
  let description: string | null = null;
  if (platform.id !== "weidian" && attrEntries.length > 0) {
    description = attrEntries
      .slice(0, MAX_ATTRIBUTES)
      .map(([k, v]) => `${k} : ${v}`.slice(0, 200))
      .join("\n");
  }

  // Prix : fourchette des SKU si elle existe, sinon le prix affiché de l'acteur.
  const skuPrices = skus.map((s) => s.price).filter((x): x is number => x !== null);
  const base = money(p["priceCNY"]);
  const price = skuPrices.length
    ? { min: Math.min(...skuPrices), max: Math.max(...skuPrices) }
    : base
      ? { min: base, max: base }
      : null;

  const stock = count(p["totalStock"]);
  const availability = stock === null ? "unknown" : stock > 0 ? "in_stock" : "out_of_stock";

  const warnings: ParsedPage["warnings"] = [];
  if (!title || !price || imgs.length === 0 || truncated) warnings.push("partial_data");
  if (!price) warnings.push("no_price");
  if (imgs.length === 0) warnings.push("no_images");
  if (skus.length === 0) warnings.push("no_options");

  if (!title && !price && imgs.length === 0) {
    throw new ImportError(
      "NO_DATA",
      `Aucune information produit lisible pour ce lien ${platform.label}.`,
    );
  }

  return {
    title,
    titleFallback: titleCN && titleEN ? titleEN.slice(0, 300) : null,
    description,
    images: imgs,
    price,
    currency: "CNY", // priceCNY : prix réel du vendeur, en yuans
    availability,
    rating: null, // ces acteurs ne renvoient ni note ni avis : on n'en invente pas
    reviews: [],
    seller,
    warnings,
    skus: skus.length ? { groupName, items: skus } : undefined,
  };
}

/** Récupère et convertit un produit via l'acteur de la plateforme. */
export async function fetchApifyProduct(
  platform: PlatformDef,
  canonicalUrl: string,
  opts: { token: string; fetchImpl?: FetchLike; timeoutMs?: number },
): Promise<ParsedPage> {
  const actor = APIFY_ACTORS[platform.id];
  if (!actor) throw new ImportError("INTERNAL", "Aucun connecteur pour cette plateforme.");
  const items = await callApifyActor({
    actor,
    productUrl: canonicalUrl,
    token: opts.token,
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
    ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
  });
  return parseApifyItem(items[0], platform);
}
