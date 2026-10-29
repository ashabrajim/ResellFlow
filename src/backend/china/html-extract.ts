import { normalizeImageUrl } from "../../lib/china/product.ts";
import { parseAmount } from "../../lib/china/money.ts";
import type { Availability, ProductRating, Review } from "../../lib/china/types.ts";

// Extraction à base de regex : pas de DOMParser disponible sur Cloudflare Workers.
// On ne lit QUE des données publiques et structurées (JSON-LD schema.org, Open Graph).

export type Extracted = {
  title: string | null;
  description: string | null;
  images: string[];
  price: { min: number; max: number } | null;
  currency: string | null;
  availability: Availability;
  rating: ProductRating | null;
  reviews: Review[];
  seller: string | null;
  canonical: string | null;
  hasStructuredProduct: boolean;
};

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, g: string) => {
    if (g[0] === "#") {
      const code =
        g[1]?.toLowerCase() === "x" ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return m;
      try {
        return String.fromCodePoint(code);
      } catch {
        return m;
      }
    }
    return ENTITIES[g.toLowerCase()] ?? m;
  });
}

function parseAttrs(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag)) !== null) {
    const key = (m[1] as string).toLowerCase();
    if (!(key in attrs)) attrs[key] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return attrs;
}

type Metas = Map<string, string[]>;

function collectMetas(html: string): Metas {
  const metas: Metas = new Map();
  const re = /<meta\s+([^>]*?)\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const a = parseAttrs(m[1] as string);
    const key = (a["property"] ?? a["name"] ?? a["itemprop"] ?? "").toLowerCase();
    const content = a["content"];
    if (!key || content === undefined || content.trim() === "") continue;
    const list = metas.get(key) ?? [];
    list.push(content.trim());
    metas.set(key, list);
  }
  return metas;
}

function firstMeta(metas: Metas, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = metas.get(k)?.[0];
    if (v) return v;
  }
  return null;
}

function documentTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const t = m?.[1] ? decodeEntities(m[1]).replace(/\s+/g, " ").trim() : "";
  return t || null;
}

function canonicalLink(html: string): string | null {
  const re = /<link\s+([^>]*?)\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const a = parseAttrs(m[1] as string);
    if ((a["rel"] ?? "").toLowerCase() === "canonical" && a["href"]) return a["href"];
  }
  return null;
}

type Json = unknown;
function isObj(v: Json): v is Record<string, Json> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function asArray(v: Json): Json[] {
  return v === undefined || v === null ? [] : Array.isArray(v) ? v : [v];
}
function str(v: Json): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}
function num(v: Json): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") return parseAmount(v.replace(/[^\d.,\s]/g, ""));
  return null;
}

function jsonLdNodes(html: string): Json[] {
  const nodes: Json[] = [];
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed: Json = JSON.parse((m[1] as string).trim());
      const stack: Json[] = asArray(parsed);
      while (stack.length) {
        const n = stack.pop();
        if (!isObj(n)) continue;
        nodes.push(n);
        if (n["@graph"]) stack.push(...asArray(n["@graph"]));
      }
    } catch {
      // JSON-LD invalide : on l'ignore
    }
  }
  return nodes;
}

function isProductNode(n: Record<string, Json>): boolean {
  return asArray(n["@type"]).some(
    (t) => typeof t === "string" && /^(Individual)?Product(Group)?$/i.test(t),
  );
}

function availabilityOf(v: Json): Availability {
  const s = (str(v) ?? "").toLowerCase();
  if (/instock|limitedavailability|onlineonly|instoreonly/.test(s)) return "in_stock";
  if (/outofstock|soldout|discontinued/.test(s)) return "out_of_stock";
  return "unknown";
}

function imagesOf(v: Json): string[] {
  const out: string[] = [];
  for (const x of asArray(v)) {
    if (typeof x === "string") out.push(x);
    else if (isObj(x)) {
      const u = str(x["url"]) ?? str(x["contentUrl"]);
      if (u) out.push(u);
    }
  }
  return out;
}

function reviewsOf(v: Json): Review[] {
  const out: Review[] = [];
  for (const r of asArray(v)) {
    if (!isObj(r)) continue;
    const text = str(r["reviewBody"]) ?? str(r["description"]);
    if (!text) continue;
    const author = isObj(r["author"]) ? str(r["author"]["name"]) : str(r["author"]);
    const rr = isObj(r["reviewRating"]) ? num(r["reviewRating"]["ratingValue"]) : null;
    const rev: Review = { text: decodeEntities(text).slice(0, 1000) };
    if (author) rev.author = author.slice(0, 80);
    if (rr !== null && rr >= 0 && rr <= 5) rev.rating = rr;
    const date = str(r["datePublished"]);
    if (date) rev.date = date.slice(0, 40);
    out.push(rev);
    if (out.length >= 20) break;
  }
  return out;
}

export function extractFromHtml(html: string, baseUrl: string): Extracted {
  const metas = collectMetas(html);
  const nodes = jsonLdNodes(html);
  const product =
    nodes.find((n): n is Record<string, Json> => isObj(n) && isProductNode(n)) ?? null;

  let title: string | null = null;
  let description: string | null = null;
  const rawImages: string[] = [];
  let priceMin: number | null = null;
  let priceMax: number | null = null;
  let currency: string | null = null;
  let availability: Availability = "unknown";
  let rating: ProductRating | null = null;
  let reviews: Review[] = [];
  let seller: string | null = null;

  if (product) {
    title = str(product["name"]);
    description = str(product["description"]);
    rawImages.push(...imagesOf(product["image"]));

    const prices: number[] = [];
    const offerNodes: Json[] = [];
    for (const o of asArray(product["offers"])) {
      offerNodes.push(o);
      if (isObj(o)) offerNodes.push(...asArray(o["offers"]));
    }
    for (const o of offerNodes) {
      if (!isObj(o)) continue;
      for (const key of ["price", "lowPrice", "highPrice"]) {
        const p = num(o[key]);
        if (p !== null && p > 0) prices.push(p);
      }
      currency = currency ?? str(o["priceCurrency"]);
      if (availability === "unknown") availability = availabilityOf(o["availability"]);
      if (!seller && isObj(o["seller"])) seller = str(o["seller"]["name"]);
    }
    if (prices.length) {
      priceMin = Math.min(...prices);
      priceMax = Math.max(...prices);
    }

    if (isObj(product["aggregateRating"])) {
      const avg = num(product["aggregateRating"]["ratingValue"]);
      const count =
        num(product["aggregateRating"]["reviewCount"]) ??
        num(product["aggregateRating"]["ratingCount"]);
      if (avg !== null && avg >= 0 && avg <= 5) {
        rating = { average: avg, count: count !== null && count >= 0 ? Math.round(count) : null };
      }
    }
    reviews = reviewsOf(product["review"]);
    if (!seller)
      seller = isObj(product["brand"]) ? str(product["brand"]["name"]) : str(product["brand"]);
  }

  title = title ?? firstMeta(metas, "og:title", "twitter:title") ?? documentTitle(html);
  description =
    description ?? firstMeta(metas, "og:description", "description", "twitter:description");
  rawImages.push(...(metas.get("og:image") ?? []), ...(metas.get("twitter:image") ?? []));

  if (priceMin === null) {
    const p = num(firstMeta(metas, "product:price:amount", "og:price:amount"));
    if (p !== null && p > 0) {
      priceMin = p;
      priceMax = p;
    }
    currency = currency ?? firstMeta(metas, "product:price:currency", "og:price:currency");
  }

  const images: string[] = [];
  for (const r of rawImages) {
    const n = normalizeImageUrl(decodeEntities(r), baseUrl);
    if (n && !images.includes(n)) images.push(n);
    if (images.length >= 12) break;
  }

  const cur = currency?.trim().toUpperCase() ?? null;
  return {
    title: title ? decodeEntities(title).replace(/\s+/g, " ").trim() || null : null,
    description: description ? decodeEntities(description).trim() || null : null,
    images,
    price: priceMin !== null && priceMax !== null ? { min: priceMin, max: priceMax } : null,
    currency: cur && /^[A-Z]{3}$/.test(cur) ? cur : null,
    availability,
    rating,
    reviews,
    seller: seller ? seller.slice(0, 120) : null,
    canonical: canonicalLink(html),
    hasStructuredProduct: product !== null,
  };
}

const BLOCK_TITLE =
  /(登录|登錄|验证码|驗證碼|安全验证|滑动验证|请按住滑块|captcha|sign\s?in|log\s?in|access denied|just a moment|security check|unusual traffic|robot)/i;
const BLOCK_BODY =
  /(nocaptcha|baxia-punish|_____tmd_____|slide to verify|请按住滑块|nc_iconfont|punish-component)/i;
const BLOCK_URL =
  /(^|\.)(login|passport|sec|pass)\.[^/]+$|\/(login|punish|captcha|verify)(\/|\.|\?|$)/i;

/** Détecte une page de connexion / anti-robot (sans jamais chercher à la contourner). */
export function looksBlocked(html: string, finalUrl: URL, title: string | null): boolean {
  if (BLOCK_URL.test(finalUrl.hostname) || BLOCK_URL.test(finalUrl.pathname)) return true;
  if (title && BLOCK_TITLE.test(title)) return true;
  return BLOCK_BODY.test(html.slice(0, 300_000));
}
