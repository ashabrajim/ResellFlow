import { hashString } from "../../lib/china/product.ts";
import { checkImportUrl } from "../../lib/china/url.ts";
import type { PlatformDef } from "../../lib/china/platforms.ts";
import type {
  ImportErrorCode,
  ImportResult,
  Product,
  ProductOption,
  ProductVariant,
} from "../../lib/china/types.ts";
import { parseProductPage, type ParsedPage } from "./adapters.ts";
import type { RateLimiter, TtlCache } from "./cache.ts";
import { ImportError } from "./errors.ts";
import { safeFetchHtml, type FetchLike } from "./fetcher.ts";
import { translateToFrench, type TranslateOutcome } from "./translate.ts";

export type Translator = (texts: string[]) => Promise<Pick<TranslateOutcome, "results" | "ok">>;

export type ImporterDeps = {
  fetchImpl?: FetchLike;
  translate: Translator;
  cache: TtlCache<Product>;
  limiter: RateLimiter;
  now?: () => Date;
  /** Secours anti-robot : renvoie le HTML rendu d'une page (ex. Firecrawl). */
  scrape?: (url: string) => Promise<{ html: string; finalUrl: string } | null>;
  /**
   * Fournisseur de données structurées (variantes, prix par variante) pour les plateformes
   * qui bloquent la lecture directe. Essayé en premier ; la lecture directe sert de secours.
   */
  provider?: {
    supports(platform: PlatformDef): boolean;
    fetch(platform: PlatformDef, canonicalUrl: string): Promise<ParsedPage>;
  };
};

const FALLBACK_CODES = new Set<ImportErrorCode>([
  "BLOCKED",
  "NO_DATA",
  "HTTP_ERROR",
  "TIMEOUT",
  "NETWORK",
  "BAD_CONTENT",
]);

export type Importer = {
  importProduct(rawUrl: unknown, clientKey: string): Promise<ImportResult>;
};

const MAX_DESCRIPTION = 2000;
const MAX_REVIEWS_TRANSLATED = 5;
const MAX_SKU_TRANSLATED = 120;
const DEFAULT_OPTION_NAME = "Variante";

function fail(
  code: ImportErrorCode,
  message: string,
  extra: Partial<Extract<ImportResult, { ok: false }>> = {},
): ImportResult {
  return { ok: false, code, message, ...extra };
}

/** Clé d'unicité (cache + dédoublonnage des requêtes simultanées) : plateforme + identifiant produit. */
function productKey(platform: PlatformDef, itemId: string | null, url: URL): string {
  return itemId
    ? `${platform.id}:${itemId}`
    : `${platform.id}:u:${hashString(`${url.hostname}${url.pathname}${url.search}`)}`;
}

export function createImporter(deps: ImporterDeps): Importer {
  const now = deps.now ?? (() => new Date());
  const inflight = new Map<string, Promise<ImportResult>>();

  /** Traduit puis assemble la fiche produit (titre, description, avis, variantes). */
  async function buildProduct(
    parsed: ParsedPage,
    finalPlatform: PlatformDef,
    itemId: string | null,
    finalHref: string,
  ): Promise<Product> {
    // Traduction groupée (une seule requête fournisseur pour titre, description, avis et variantes).
    const texts: string[] = [
      parsed.title ?? "",
      (parsed.description ?? "").slice(0, MAX_DESCRIPTION),
    ];
    const reviewSlice = parsed.reviews.slice(0, MAX_REVIEWS_TRANSLATED);
    for (const rv of reviewSlice) texts.push(rv.text.slice(0, 500));
    const skuStart = texts.length;
    const sk = parsed.skus && parsed.skus.items.length > 0 ? parsed.skus : null;
    if (sk) {
      texts.push(sk.groupName ?? "");
      for (const it of sk.items.slice(0, MAX_SKU_TRANSLATED)) texts.push(it.label);
    }
    let tr: Pick<TranslateOutcome, "results" | "ok">;
    try {
      tr = await deps.translate(texts);
    } catch {
      tr = { results: texts, ok: false };
    }
    const [tTitle = "", tDesc = "", ...rest] = tr.results;
    const tReviews = rest.slice(0, reviewSlice.length);

    const translatedTitle = tTitle && tTitle !== parsed.title ? tTitle : "";
    const title = parsed.title ? translatedTitle || parsed.titleFallback || parsed.title : "";
    const description = parsed.description ? tDesc || parsed.description : null;
    const warnings = [...parsed.warnings];
    if (!tr.ok) warnings.push("translation_unavailable");

    // Variantes : un seul sélecteur (les sources ne donnent pas toujours les axes couleur / taille).
    let options: ProductOption[] = [];
    let variants: ProductVariant[] = [];
    if (sk) {
      const trSku = tr.results.slice(skuStart);
      const groupT = (trSku[0] ?? "").trim();
      const optionName = sk.groupName ? groupT || sk.groupName : DEFAULT_OPTION_NAME;
      const used = new Set<string>();
      const entries = sk.items.map((it, i) => {
        const translated = i < MAX_SKU_TRANSLATED ? (trSku[i + 1] ?? "").trim() : "";
        const base = translated || it.label;
        let label = base;
        for (let n = 2; used.has(label); n++) label = `${base} (${n})`; // libellés uniques
        used.add(label);
        return { it, label };
      });
      options = [
        {
          name: optionName,
          values: entries.map(({ it, label }) => ({
            label,
            ...(label !== it.label ? { labelOriginal: it.label } : {}),
            ...(it.image ? { image: it.image } : {}),
          })),
        },
      ];
      variants = entries.map(({ it, label }) => ({
        options: { [optionName]: label },
        ...(it.price !== null ? { price: it.price } : {}),
        ...(it.available !== null ? { available: it.available } : {}),
        ...(it.image ? { image: it.image } : {}),
      }));
    }

    const sourceUrl = itemId ? finalPlatform.canonicalUrl(itemId) : finalHref;
    return {
      id: itemId ? `${finalPlatform.id}:${itemId}` : `${finalPlatform.id}:${hashString(finalHref)}`,
      platform: finalPlatform.id,
      platformLabel: finalPlatform.label,
      sourceUrl,
      itemId,
      title: title || "Produit sans titre",
      titleOriginal: parsed.title && title && title !== parsed.title ? parsed.title : null,
      description,
      descriptionOriginal:
        parsed.description && description && description !== parsed.description
          ? parsed.description
          : null,
      images: parsed.images,
      currency: parsed.currency ?? finalPlatform.defaultCurrency ?? "CNY",
      price: parsed.price,
      options,
      variants,
      rating: parsed.rating,
      reviews: parsed.reviews.map((rv, i) => {
        const translated = tReviews[i];
        return i < reviewSlice.length && translated && translated !== rv.text
          ? { ...rv, text: translated, textOriginal: rv.text }
          : rv;
      }),
      availability: parsed.availability,
      seller: parsed.seller,
      origin: "auto",
      fetchedAt: now().toISOString(),
      warnings,
    };
  }

  async function run(
    platform: PlatformDef,
    startUrl: URL,
    key: string,
    known: boolean,
  ): Promise<ImportResult> {
    // 1) Connecteur de données structurées (variantes, prix par variante), quand il est configuré.
    let providerError: ImportError | null = null;
    const providerItemId = known ? platform.extractItemId(startUrl) : null;
    if (deps.provider && providerItemId && deps.provider.supports(platform)) {
      const canonical = platform.canonicalUrl(providerItemId);
      try {
        const parsedP = await deps.provider.fetch(platform, canonical);
        const product = await buildProduct(parsedP, platform, providerItemId, canonical);
        deps.cache.set(key, product);
        return { ok: true, product, cached: false };
      } catch (e) {
        providerError =
          e instanceof ImportError
            ? e
            : new ImportError("INTERNAL", "Erreur inattendue du service d’import automatique.");
      }
    }
    const providerFail = (err: ImportError, url: URL, pf: PlatformDef): ImportResult =>
      fail(err.code, err.message, { sourceUrl: url.href, platform: pf.id });

    // 2) Lecture directe de la page (métadonnées publiques), puis service de lecture en secours.
    type Fetched = { html: string; finalUrl: URL };
    const attempt = async (
      getPage: () => Promise<Fetched>,
    ): Promise<
      | {
          ok: true;
          fetched: Fetched;
          finalPlatform: PlatformDef;
          itemId: string | null;
          finalKey: string;
          parsed: ReturnType<typeof parseProductPage>;
        }
      | { ok: false; res: ImportResult; code: ImportErrorCode }
      | { ok: "cached"; res: ImportResult }
    > => {
      let fetched: Fetched;
      try {
        fetched = await getPage();
      } catch (e) {
        if (e instanceof ImportError)
          return {
            ok: false,
            code: e.code,
            res: fail(e.code, e.message, { sourceUrl: startUrl.href, platform: platform.id }),
          };
        return {
          ok: false,
          code: "INTERNAL",
          res: fail("INTERNAL", "Erreur inattendue pendant la récupération.", {
            sourceUrl: startUrl.href,
            platform: platform.id,
          }),
        };
      }
      const finalCheck = checkImportUrl(fetched.finalUrl.href);
      const finalPlatform = finalCheck.ok ? finalCheck.platform : platform;
      const itemId = finalCheck.ok ? finalCheck.itemId : null;
      const finalKey = productKey(finalPlatform, itemId, fetched.finalUrl);
      if (!known) {
        const hit = deps.cache.get(finalKey);
        if (hit) return { ok: "cached", res: { ok: true, product: hit, cached: true } };
      }
      try {
        const parsed = parseProductPage(finalPlatform, fetched.html, fetched.finalUrl);
        return { ok: true, fetched, finalPlatform, itemId, finalKey, parsed };
      } catch (e) {
        const code: ImportErrorCode = e instanceof ImportError ? e.code : "INTERNAL";
        const msg =
          e instanceof ImportError ? e.message : "Erreur inattendue pendant l’analyse de la page.";
        return {
          ok: false,
          code,
          res: fail(code, msg, { sourceUrl: fetched.finalUrl.href, platform: finalPlatform.id }),
        };
      }
    };

    let r = await attempt(() =>
      safeFetchHtml(startUrl, deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    );
    if (r.ok === false && deps.scrape && FALLBACK_CODES.has(r.code)) {
      const scrape = deps.scrape;
      const r2 = await attempt(async () => {
        const page = await scrape(startUrl.href);
        if (!page || !page.html)
          throw new ImportError("BLOCKED", "Le service de lecture n’a pas pu ouvrir la page.");
        return { html: page.html, finalUrl: new URL(page.finalUrl || startUrl.href) };
      });
      if (r2.ok !== false) r = r2;
    }
    if (r.ok === "cached") return r.res;
    if (r.ok === false)
      return providerError ? providerFail(providerError, startUrl, platform) : r.res;
    const { fetched, finalPlatform, itemId, finalKey, parsed } = r;
    const product = await buildProduct(parsed, finalPlatform, itemId, fetched.finalUrl.href);
    deps.cache.set(finalKey, product);
    if (finalKey !== key) deps.cache.set(key, product);
    return { ok: true, product, cached: false };
  }

  return {
    async importProduct(rawUrl, clientKey) {
      if (typeof rawUrl !== "string") return fail("INVALID_URL", "Lien invalide.");
      const check = checkImportUrl(rawUrl);
      if (!check.ok) {
        if (check.code === "EMPTY_INPUT")
          return fail("EMPTY_INPUT", "Colle un lien produit pour commencer.");
        if (check.code === "UNSUPPORTED_PLATFORM") {
          return fail(
            "UNSUPPORTED_PLATFORM",
            "Cette plateforme n’est pas prise en charge pour l’import automatique. Tu peux saisir le produit manuellement.",
          );
        }
        return fail(
          "INVALID_URL",
          "Ce lien n’est pas valide. Colle l’adresse complète du produit (https://…).",
        );
      }

      const key = productKey(check.platform, check.isShort ? null : check.itemId, check.url);
      const known = !check.isShort && check.itemId !== null;
      if (!check.isShort) {
        const hit = deps.cache.get(key);
        if (hit) return { ok: true, product: hit, cached: true };
      }
      if (!check.isShort && !check.itemId) {
        return fail(
          "INVALID_URL",
          `Impossible de trouver l’identifiant du produit dans ce lien ${check.platform.label}. Ouvre la fiche produit et copie son adresse complète.`,
          { sourceUrl: check.url.href, platform: check.platform.id },
        );
      }

      // Requêtes simultanées pour le même produit : une seule récupération.
      const running = inflight.get(key);
      if (running) return running;

      if (!deps.limiter.take(clientKey)) {
        return fail(
          "RATE_LIMITED",
          "Trop d’imports en peu de temps. Patiente quelques minutes avant de réessayer.",
        );
      }
      const p = run(check.platform, check.url, key, known).finally(() => inflight.delete(key));
      inflight.set(key, p);
      return p;
    },
  };
}

export function clientKeyFromHeaders(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf.trim().slice(0, 64);
  const xff = headers.get("x-forwarded-for");
  if (xff) return (xff.split(",")[0] ?? "").trim().slice(0, 64) || "unknown";
  return "unknown";
}

export { translateToFrench };
