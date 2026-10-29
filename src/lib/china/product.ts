/* eslint-disable no-control-regex -- suppression volontaire des caractères de contrôle dans les textes importés */
import { extractUrlCandidate, MAX_URL_LENGTH } from "./url.ts";
import { platformForHost, platformLabel, shortLinkPlatformForHost } from "./platforms.ts";
import type { Product, ProductOption, ProductPlatform, ProductVariant } from "./types.ts";

export const SUPPORTED_CURRENCIES = [
  "CNY",
  "EUR",
  "USD",
  "GBP",
  "HKD",
  "JPY",
  "CAD",
  "AUD",
] as const;

const SIZE_RE = /(taille|size|pointure|尺码|尺寸|尺碼|尺)/i;
const COLOR_RE = /(couleur|colou?r|coloris|颜色|顏色|色)/i;

export function isSizeOption(name: string): boolean {
  return SIZE_RE.test(name);
}
export function isColorOption(name: string): boolean {
  return COLOR_RE.test(name);
}

/** Hash FNV-1a 32 bits, stable, pour fabriquer un identifiant de produit manuel. */
export function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Lien http(s) quelconque (pas de liste blanche : il n'est JAMAIS requêté, seulement affiché/envoyé). */
export function parseLooseHttpUrl(raw: string): URL | null {
  const candidate = extractUrlCandidate(raw);
  if (!candidate || candidate.length > MAX_URL_LENGTH) return null;
  try {
    const u = new URL(candidate);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password) return null;
    return u;
  } catch {
    return null;
  }
}

/** Normalise une URL d'image (protocole relatif, http->https). null si inutilisable. */
export function normalizeImageUrl(raw: string, base?: string): string | null {
  const s = raw.trim();
  if (!s || s.startsWith("data:")) return null;
  try {
    const u = new URL(s.startsWith("//") ? `https:${s}` : s, base);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password) return null;
    if (u.protocol === "http:") u.protocol = "https:";
    return u.href;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Sélection de variantes
// ---------------------------------------------------------------------------

export type Selection = Record<string, string>;

export function isSelectionComplete(product: Product, selection: Selection): boolean {
  return product.options.every((o) => {
    const v = selection[o.name];
    return typeof v === "string" && o.values.some((x) => x.label === v);
  });
}

/** Variante dont toutes les options correspondent à la sélection. */
export function findVariant(product: Product, selection: Selection): ProductVariant | null {
  if (product.variants.length === 0) return null;
  return (
    product.variants.find((variant) =>
      Object.entries(variant.options).every(([name, value]) => selection[name] === value),
    ) ?? null
  );
}

export type UnitPriceResolution = {
  price: number | null;
  /** d'où vient le prix proposé — sert à afficher « prix à confirmer » si c'est une fourchette. */
  source: "variant" | "single" | "range_min" | "none";
};

export function resolveUnitPrice(product: Product, selection: Selection): UnitPriceResolution {
  const variant = findVariant(product, selection);
  if (variant?.price !== undefined && variant.price > 0)
    return { price: variant.price, source: "variant" };
  if (product.price) {
    if (product.price.min === product.price.max)
      return { price: product.price.min, source: "single" };
    return { price: product.price.min, source: "range_min" };
  }
  return { price: null, source: "none" };
}

export function resolveImage(product: Product, selection: Selection): string | null {
  const variant = findVariant(product, selection);
  if (variant?.image) return variant.image;
  for (const opt of product.options) {
    const chosen = opt.values.find((v) => v.label === selection[opt.name]);
    if (chosen?.image) return chosen.image;
  }
  return product.images[0] ?? null;
}

// ---------------------------------------------------------------------------
// Création / édition manuelle
// ---------------------------------------------------------------------------

export type ManualProductInput = {
  sourceUrl: string;
  title: string;
  titleOriginal?: string;
  description?: string;
  price: number | null;
  currency: string;
  images: string[];
  /** `originals` : libellés d'origine alignés par index sur `values` (ex. 黑色 pour « Noir »). */
  options: { name: string; values: string[]; originals?: string[] }[];
};

export type ManualFieldError = "url" | "title" | "price" | "currency" | "images" | "options";

export type ManualResult =
  { ok: true; product: Product } | { ok: false; errors: Partial<Record<ManualFieldError, string>> };

function clean(s: string, max: number): string {
  return s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim()
    .slice(0, max);
}

export function buildManualProduct(
  input: ManualProductInput,
  opts: { now?: Date; base?: Product | null } = {},
): ManualResult {
  const errors: Partial<Record<ManualFieldError, string>> = {};

  const url = parseLooseHttpUrl(input.sourceUrl);
  if (!url) errors.url = "INVALID_URL";

  const title = clean(input.title, 300);
  if (!title) errors.title = "REQUIRED";

  const currency = input.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) errors.currency = "INVALID_CURRENCY";

  let price: Product["price"] = null;
  if (input.price !== null) {
    if (!Number.isFinite(input.price) || input.price <= 0 || input.price > 10_000_000)
      errors.price = "INVALID_PRICE";
    else price = { min: input.price, max: input.price };
  }

  const images: string[] = [];
  for (const raw of input.images) {
    if (!raw.trim()) continue;
    const n = normalizeImageUrl(raw);
    if (!n) {
      errors.images = "INVALID_IMAGE";
      break;
    }
    if (!images.includes(n)) images.push(n);
  }
  if (images.length > 12) errors.images = "TOO_MANY_IMAGES";

  const options: ProductOption[] = [];
  for (const o of input.options) {
    const name = clean(o.name, 60);
    const pairs: { label: string; original: string }[] = [];
    o.values.forEach((v, i) => {
      const label = clean(v, 80);
      if (!label || pairs.some((p) => p.label === label)) return;
      pairs.push({ label, original: clean(o.originals?.[i] ?? "", 80) });
    });
    const values = pairs.map((p) => p.label);
    if (!name && values.length === 0) continue;
    if (!name || values.length === 0 || values.length > 60) {
      errors.options = "INVALID_OPTION";
      break;
    }
    if (options.some((x) => x.name.toLowerCase() === name.toLowerCase())) {
      errors.options = "DUPLICATE_OPTION";
      break;
    }
    options.push({
      name,
      values: pairs.map((p) =>
        p.original && p.original !== p.label
          ? { label: p.label, labelOriginal: p.original }
          : { label: p.label },
      ),
    });
  }
  if (options.length > 6) errors.options = "TOO_MANY_OPTIONS";

  if (Object.keys(errors).length > 0 || !url) return { ok: false, errors };

  const direct = platformForHost(url.hostname) ?? shortLinkPlatformForHost(url.hostname);
  const platform: ProductPlatform = direct?.id ?? "other";
  const itemId =
    direct && !direct.shortHosts.includes(url.hostname) ? direct.extractItemId(url) : null;
  const base = opts.base ?? null;

  const product: Product = {
    id:
      base?.id ?? (direct && itemId ? `${direct.id}:${itemId}` : `manual:${hashString(url.href)}`),
    platform,
    platformLabel: platformLabel(platform),
    sourceUrl: url.href,
    itemId,
    title,
    titleOriginal: input.titleOriginal
      ? clean(input.titleOriginal, 300) || null
      : (base?.titleOriginal ?? null),
    description: input.description ? clean(input.description, 5000) || null : null,
    descriptionOriginal: base?.descriptionOriginal ?? null,
    images,
    currency,
    price,
    options,
    // Les variantes détaillées d'un import auto ne survivent à l'édition que si les options sont inchangées.
    variants:
      base &&
      JSON.stringify(base.options.map((o) => [o.name, o.values.map((v) => v.label)])) ===
        JSON.stringify(options.map((o) => [o.name, o.values.map((v) => v.label)]))
        ? base.variants
        : [],
    rating: base?.rating ?? null,
    reviews: base?.reviews ?? [],
    availability: base?.availability ?? "unknown",
    seller: base?.seller ?? null,
    origin: base ? base.origin : "manual",
    fetchedAt: (opts.now ?? new Date()).toISOString(),
    warnings: [],
  };
  return { ok: true, product };
}
