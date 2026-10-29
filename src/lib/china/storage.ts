import { sanitizeLines } from "./cart.ts";
import type { CartLine, Product, RateInfo } from "./types.ts";

// Format persisté dans le localStorage (versionné, validé à la lecture).
export const CHINA_STORAGE_KEY = "resellflow.china.v1";
export const HISTORY_MAX = 20;

export type PersistedChina = {
  version: 1;
  cart: CartLine[];
  agentPhone: string;
  agentFeePercent: number;
  history: Product[];
  rates: Record<string, RateInfo>;
};

export const EMPTY_PERSISTED: PersistedChina = {
  version: 1,
  cart: [],
  agentPhone: "+1 310 484 8602",
  agentFeePercent: 0,
  history: [],
  rates: {},
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isProductLike(v: unknown): v is Product {
  return (
    isRecord(v) &&
    typeof v["id"] === "string" &&
    typeof v["title"] === "string" &&
    typeof v["sourceUrl"] === "string" &&
    typeof v["currency"] === "string" &&
    Array.isArray(v["images"]) &&
    Array.isArray(v["options"]) &&
    Array.isArray(v["variants"]) &&
    Array.isArray(v["reviews"]) &&
    Array.isArray(v["warnings"])
  );
}

function isRateLike(v: unknown): v is RateInfo {
  return (
    isRecord(v) &&
    typeof v["rate"] === "number" &&
    Number.isFinite(v["rate"]) &&
    v["rate"] > 0 &&
    typeof v["date"] === "string" &&
    typeof v["fetchedAt"] === "string" &&
    typeof v["source"] === "string" &&
    typeof v["from"] === "string"
  );
}

/** Lit et valide la chaîne stockée. Ne lève jamais : une donnée corrompue donne un état vide. */
export function parsePersisted(raw: string | null): PersistedChina {
  if (!raw) return EMPTY_PERSISTED;
  try {
    const d: unknown = JSON.parse(raw);
    if (!isRecord(d) || d["version"] !== 1) return EMPTY_PERSISTED;
    const fee =
      typeof d["agentFeePercent"] === "number" && Number.isFinite(d["agentFeePercent"])
        ? d["agentFeePercent"]
        : 0;
    const rates: Record<string, RateInfo> = {};
    if (isRecord(d["rates"]))
      for (const [k, v] of Object.entries(d["rates"])) if (isRateLike(v)) rates[k] = v;
    return {
      version: 1,
      cart: sanitizeLines(d["cart"]),
      agentPhone: typeof d["agentPhone"] === "string" ? d["agentPhone"].slice(0, 40) : "",
      agentFeePercent: Math.min(100, Math.max(0, fee)),
      history: Array.isArray(d["history"])
        ? d["history"].filter(isProductLike).slice(0, HISTORY_MAX)
        : [],
      rates,
    };
  } catch {
    return EMPTY_PERSISTED;
  }
}

export function serializePersisted(state: PersistedChina): string {
  return JSON.stringify(state);
}

/** Ajoute/remonte un produit en tête de l'historique (sans doublon, borné). */
export function pushHistory(history: Product[], product: Product): Product[] {
  return [product, ...history.filter((p) => p.id !== product.id)].slice(0, HISTORY_MAX);
}
