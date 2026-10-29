import { createServerFn } from "@tanstack/react-start";
import type { ImportResult, RatesResult } from "../../lib/china/types.ts";

// Fonctions serveur appelées depuis le navigateur. Les modules serveur (service.ts) sont
// importés dynamiquement dans les handlers pour qu'ils n'atterrissent jamais dans le bundle client.

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// Import dynamique : le code serveur (et l'accès à la requête) ne doit jamais entrer dans le bundle client.
async function clientKey(): Promise<string> {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { clientKeyFromHeaders } = await import("./import-product.ts");
    return clientKeyFromHeaders(getRequest().headers);
  } catch {
    return "unknown";
  }
}

export const importProductFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!isRecord(data) || typeof data["url"] !== "string" || data["url"].length > 4000) {
      throw new Error("Requête invalide");
    }
    return { url: data["url"] };
  })
  .handler(async ({ data }): Promise<ImportResult> => {
    const { importer } = await import("./service.ts");
    return importer.importProduct(data.url, await clientKey());
  });

export const getRatesFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!isRecord(data) || !Array.isArray(data["currencies"]) || data["currencies"].length > 8) {
      throw new Error("Requête invalide");
    }
    const currencies = data["currencies"].filter(
      (c): c is string => typeof c === "string" && /^[A-Za-z]{3}$/.test(c),
    );
    return { currencies: currencies.map((c) => c.toUpperCase()) };
  })
  .handler(async ({ data }): Promise<RatesResult> => {
    const { rates, toolsLimiter } = await import("./service.ts");
    if (!toolsLimiter.take(`rates:${await clientKey()}`)) {
      return {
        ok: false,
        code: "RATE_LIMITED",
        message: "Trop de requêtes, réessaie dans quelques minutes.",
      };
    }
    try {
      return { ok: true, rates: await rates.getRates(data.currencies) };
    } catch {
      return {
        ok: false,
        code: "RATES_UNAVAILABLE",
        message: "Taux de change momentanément indisponibles.",
      };
    }
  });

export type TranslateResult =
  | { ok: true; texts: string[]; complete: boolean }
  | { ok: false; code: "RATE_LIMITED" | "INVALID_INPUT"; message: string };

export const translateTextsFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!isRecord(data) || !Array.isArray(data["texts"]) || data["texts"].length > 60) {
      throw new Error("Requête invalide");
    }
    const texts = data["texts"].map((t) => (typeof t === "string" ? t.slice(0, 2000) : ""));
    return { texts };
  })
  .handler(async ({ data }): Promise<TranslateResult> => {
    const { translator, toolsLimiter } = await import("./service.ts");
    if (!toolsLimiter.take(`tr:${await clientKey()}`)) {
      return {
        ok: false,
        code: "RATE_LIMITED",
        message: "Trop de requêtes, réessaie dans quelques minutes.",
      };
    }
    const out = await translator(data.texts);
    return { ok: true, texts: out.results, complete: out.ok };
  });
