import { convertToCents, toCents } from "./money.ts";
import { isColorOption, isSizeOption, resolveImage, type Selection } from "./product.ts";
import type { CartLine, Product, ProductPlatform } from "./types.ts";

export const MAX_LINES = 100;
export const MAX_QTY = 999;

export type NewLineInput = {
  product: Product;
  selection: Selection;
  quantity: number;
  unitPrice: number;
};

export type AddResult =
  | { ok: true; lines: CartLine[]; merged: boolean; lineId: string }
  | {
      ok: false;
      code: "CART_FULL" | "INVALID_QUANTITY" | "INVALID_PRICE" | "INCOMPLETE_SELECTION";
    };

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/** Clé d'unicité d'une ligne : même produit + mêmes choix + même prix unitaire (au centime) + même devise. */
export function lineKey(
  l: Pick<CartLine, "productId" | "selection" | "unitPrice" | "currency">,
): string {
  const sel = Object.entries(l.selection)
    .map(([k, v]) => [k.trim(), v.trim()] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return `${l.productId}|${sel}|${toCents(l.unitPrice)}|${l.currency}`;
}

export function clampQuantity(q: number): number {
  if (!Number.isFinite(q)) return 1;
  return Math.min(MAX_QTY, Math.max(1, Math.floor(q)));
}

export function addToCart(
  lines: CartLine[],
  input: NewLineInput,
  opts: { now?: number; id?: () => string } = {},
): AddResult {
  const { product, selection } = input;
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > MAX_QTY) {
    return { ok: false, code: "INVALID_QUANTITY" };
  }
  if (!Number.isFinite(input.unitPrice) || input.unitPrice <= 0)
    return { ok: false, code: "INVALID_PRICE" };
  const complete = product.options.every(
    (o) => typeof selection[o.name] === "string" && selection[o.name] !== "",
  );
  if (!complete) return { ok: false, code: "INCOMPLETE_SELECTION" };

  const chosen: Selection = {};
  const original: Selection = {};
  for (const o of product.options) {
    const label = selection[o.name] as string;
    chosen[o.name] = label;
    const v = o.values.find((x) => x.label === label);
    if (v?.labelOriginal && v.labelOriginal !== label) original[o.name] = v.labelOriginal;
  }

  const candidate: CartLine = {
    lineId: "",
    productId: product.id,
    platform: product.platform,
    platformLabel: product.platformLabel,
    sourceUrl: product.sourceUrl,
    title: product.title,
    titleOriginal: product.titleOriginal,
    image: resolveImage(product, chosen),
    selection: chosen,
    selectionOriginal: original,
    size: null,
    color: null,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    currency: product.currency,
    addedAt: opts.now ?? Date.now(),
  };
  for (const [name, value] of Object.entries(chosen)) {
    if (candidate.size === null && isSizeOption(name)) candidate.size = value;
    if (candidate.color === null && isColorOption(name)) candidate.color = value;
  }

  const key = lineKey(candidate);
  const existing = lines.find((l) => lineKey(l) === key);
  if (existing) {
    const next = lines.map((l) =>
      l.lineId === existing.lineId
        ? { ...l, quantity: clampQuantity(l.quantity + input.quantity) }
        : l,
    );
    return { ok: true, lines: next, merged: true, lineId: existing.lineId };
  }
  if (lines.length >= MAX_LINES) return { ok: false, code: "CART_FULL" };
  candidate.lineId = (opts.id ?? uid)();
  return { ok: true, lines: [...lines, candidate], merged: false, lineId: candidate.lineId };
}

export function setLineQuantity(lines: CartLine[], lineId: string, quantity: number): CartLine[] {
  return lines.map((l) => (l.lineId === lineId ? { ...l, quantity: clampQuantity(quantity) } : l));
}

export function removeLine(lines: CartLine[], lineId: string): CartLine[] {
  return lines.filter((l) => l.lineId !== lineId);
}

// ---------------------------------------------------------------------------
// Totaux
// ---------------------------------------------------------------------------

export type RateLookup = Record<string, { rate: number } | undefined>;

export type LineTotals = {
  line: CartLine;
  rate: number | null;
  unitCents: number | null;
  subtotalCents: number | null;
};

export type CartTotals = {
  lines: LineTotals[];
  productsCents: number;
  /** false si au moins une ligne n'a pas pu être convertie (taux manquant). */
  complete: boolean;
  missingCurrencies: string[];
  references: number;
  units: number;
  agentFeePercent: number;
  agentFeeCents: number;
};

export function cartTotals(lines: CartLine[], rates: RateLookup, agentFeePercent = 0): CartTotals {
  const missing = new Set<string>();
  let productsCents = 0;
  const out: LineTotals[] = lines.map((line) => {
    const rate = line.currency === "EUR" ? 1 : (rates[line.currency]?.rate ?? null);
    if (rate === null) {
      missing.add(line.currency);
      return { line, rate: null, unitCents: null, subtotalCents: null };
    }
    const unitCents = convertToCents(line.unitPrice, rate);
    const subtotalCents = unitCents * line.quantity;
    productsCents += subtotalCents;
    return { line, rate, unitCents, subtotalCents };
  });
  const pct = Number.isFinite(agentFeePercent) ? Math.min(100, Math.max(0, agentFeePercent)) : 0;
  return {
    lines: out,
    productsCents,
    complete: missing.size === 0,
    missingCurrencies: [...missing],
    references: lines.length,
    units: lines.reduce((s, l) => s + l.quantity, 0),
    agentFeePercent: pct,
    agentFeeCents: Math.round((productsCents * pct) / 100),
  };
}

export function cartCurrencies(lines: CartLine[]): string[] {
  return [...new Set(lines.map((l) => l.currency))].filter((c) => c !== "EUR");
}

// ---------------------------------------------------------------------------
// Persistance : validation de ce qui revient du localStorage
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function strRecord(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isRecord(v)) return out;
  for (const [k, val] of Object.entries(v)) if (typeof val === "string") out[k] = val;
  return out;
}

const PLATFORM_IDS: ProductPlatform[] = [
  "taobao",
  "tmall",
  "weidian",
  "1688",
  "aliexpress",
  "other",
];

export function sanitizeLines(raw: unknown): CartLine[] {
  if (!Array.isArray(raw)) return [];
  const out: CartLine[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    if (!isRecord(r)) continue;
    const unitPrice = r["unitPrice"];
    const quantity = r["quantity"];
    if (
      typeof r["lineId"] !== "string" ||
      typeof r["productId"] !== "string" ||
      typeof r["sourceUrl"] !== "string" ||
      typeof r["title"] !== "string" ||
      typeof r["currency"] !== "string" ||
      typeof unitPrice !== "number" ||
      !Number.isFinite(unitPrice) ||
      unitPrice <= 0 ||
      typeof quantity !== "number" ||
      !Number.isFinite(quantity)
    )
      continue;
    const platform = PLATFORM_IDS.includes(r["platform"] as ProductPlatform)
      ? (r["platform"] as ProductPlatform)
      : "other";
    if (seen.has(r["lineId"])) continue;
    seen.add(r["lineId"]);
    out.push({
      lineId: r["lineId"],
      productId: r["productId"],
      platform,
      platformLabel:
        typeof r["platformLabel"] === "string" ? r["platformLabel"] : "Autre plateforme",
      sourceUrl: r["sourceUrl"],
      title: r["title"].slice(0, 300),
      titleOriginal:
        typeof r["titleOriginal"] === "string" ? r["titleOriginal"].slice(0, 300) : null,
      image: typeof r["image"] === "string" ? r["image"] : null,
      selection: strRecord(r["selection"]),
      selectionOriginal: strRecord(r["selectionOriginal"]),
      size: typeof r["size"] === "string" ? r["size"] : null,
      color: typeof r["color"] === "string" ? r["color"] : null,
      quantity: clampQuantity(quantity),
      unitPrice,
      currency: r["currency"].toUpperCase().slice(0, 3),
      addedAt: typeof r["addedAt"] === "number" ? r["addedAt"] : 0,
    });
    if (out.length >= MAX_LINES) break;
  }
  return out;
}
