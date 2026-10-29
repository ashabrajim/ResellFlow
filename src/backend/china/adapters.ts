import { PLATFORMS, type PlatformDef } from "../../lib/china/platforms.ts";
import type { Availability, ProductRating, ProductWarning, Review } from "../../lib/china/types.ts";
import { ImportError } from "./errors.ts";
import { extractFromHtml, looksBlocked } from "./html-extract.ts";

/**
 * Adaptateurs de plateforme.
 *
 * Contrat : `parseProductPage(platform, html, finalUrl)` renvoie uniquement ce qui a été
 * réellement lu dans la page, ou lève ImportError('BLOCKED' | 'NO_DATA'). Rien n'est inventé.
 *
 * ÉTAT D'INTÉGRATION (voir `PlatformDef.status`) : toutes les plateformes sont « untested ».
 * Les adaptateurs lisent les métadonnées publiques (JSON-LD / Open Graph) ; aucun ne lit
 * les variantes, les prix par variante ou les avis, car ces données ne sont pas exposées
 * publiquement et leur extraction exigerait une API officielle (voir README).
 * Pour ajouter une plateforme : ajouter une entrée dans PLATFORMS (src/lib/china/platforms.ts)
 * et, si besoin, une règle de nettoyage de titre ci-dessous.
 */

/** Une variante vendue (taille / couleur / modèle…) telle que lue chez la source. */
export type ParsedSku = {
  label: string;
  /** Prix unitaire en unités majeures de la devise de la page. */
  price: number | null;
  /** null = stock inconnu (on ne devine pas). */
  available: boolean | null;
  image: string | null;
};

export type ParsedPage = {
  title: string | null;
  /** Titre alternatif (ex. anglais fourni par la source) utilisé si la traduction échoue. */
  titleFallback?: string | null;
  description: string | null;
  images: string[];
  price: { min: number; max: number } | null;
  currency: string | null;
  availability: Availability;
  rating: ProductRating | null;
  reviews: Review[];
  seller: string | null;
  warnings: ProductWarning[];
  /** Variantes lues chez la source (absent pour les pages HTML publiques). */
  skus?: { groupName: string | null; items: ParsedSku[] } | undefined;
};

const SITE_SUFFIX =
  /\s*[-|–—_·]\s*(淘宝网|淘寶網|淘宝|天猫|tmall\.com天猫|tmall\.com|tmall|1688\.com|阿里巴巴|aliexpress(?:\.com)?|weidian(?:\.com)?|微店|taobao(?:\.com)?)\s*$/i;
const GENERIC_TITLES = new Set([
  "淘宝网",
  "淘寶網",
  "淘宝",
  "天猫",
  "tmall",
  "tmall.com",
  "1688.com",
  "阿里巴巴",
  "aliexpress",
  "aliexpress.com",
  "weidian",
  "微店",
  "taobao",
  "taobao.com",
  "淘宝网 - 淘！我喜欢",
  "淘！我喜欢",
]);

export function cleanTitle(raw: string | null): string | null {
  if (!raw) return null;
  let t = raw.trim();
  for (let i = 0; i < 3 && SITE_SUFFIX.test(t); i++) t = t.replace(SITE_SUFFIX, "").trim();
  if (!t || GENERIC_TITLES.has(t.toLowerCase())) return null;
  return t.slice(0, 300);
}

export function parseProductPage(platform: PlatformDef, html: string, finalUrl: URL): ParsedPage {
  const ex = extractFromHtml(html, finalUrl.href);
  const title = cleanTitle(ex.title);

  const hasUsefulData = title !== null || ex.images.length > 0 || ex.price !== null;
  if (!ex.hasStructuredProduct && looksBlocked(html, finalUrl, ex.title)) {
    throw new ImportError(
      "BLOCKED",
      `${platform.label} demande une connexion ou une vérification anti-robot : le produit ne peut pas être lu automatiquement.`,
    );
  }
  if (!hasUsefulData) {
    throw new ImportError(
      "NO_DATA",
      `Aucune information produit lisible sur cette page ${platform.label} (page rendue en JavaScript ou protégée).`,
    );
  }

  // Devise : celle de la page, sinon celle de la plateforme si elle est connue (CNY pour les plateformes chinoises).
  let currency = ex.currency ?? platform.defaultCurrency;
  let price = ex.price;
  if (price && !currency) price = null; // prix sans devise : on ne devine pas

  const warnings: ProductWarning[] = [];
  if (!title || !price || ex.images.length === 0) warnings.push("partial_data");
  if (!price) warnings.push("no_price");
  if (ex.images.length === 0) warnings.push("no_images");
  warnings.push("no_options"); // jamais lues automatiquement (cf. en-tête)
  if (!price) currency = currency ?? platform.defaultCurrency;

  return {
    title,
    description: ex.description,
    images: ex.images,
    price,
    currency,
    availability: ex.availability,
    rating: ex.rating,
    reviews: ex.reviews,
    seller: ex.seller,
    warnings,
  };
}

export function listAdapters() {
  return PLATFORMS.map((p) => ({ id: p.id, label: p.label, status: p.status, limits: p.limits }));
}
