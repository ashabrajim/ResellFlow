import type { Product } from "../../lib/china/types.ts";
import { createRateLimiter, createTtlCache } from "./cache.ts";
import { createImporter, type Translator } from "./import-product.ts";
import { createRatesService } from "./rates.ts";
import { translateToFrench } from "./translate.ts";
import { fetchApifyProduct, APIFY_ACTORS } from "./apify.ts";
import { env } from "./env.ts";
import { ImportError } from "./errors.ts";
import { firecrawlScrape } from "./firecrawl.ts";

// Singletons du serveur (mémoire de l'instance). Les secrets (clés de traduction) restent ici :
// ils ne sont jamais envoyés au navigateur.

export const translator: Translator = (texts) => translateToFrench(texts, { env: env() });

// Plafond quotidien d'appels au connecteur (coût maîtrisé) : APIFY_DAILY_LIMIT, 300 par défaut.
const apifyDailyLimit = Math.max(1, Number(env()["APIFY_DAILY_LIMIT"]) || 300);
const apifyLimiter = createRateLimiter({ limit: apifyDailyLimit, windowMs: 24 * 60 * 60 * 1000 });

export const importer = createImporter({
  translate: translator,
  cache: createTtlCache<Product>({ ttlMs: 30 * 60 * 1000, max: 300 }),
  // 30 récupérations réseau / 10 min / client — largement au-dessus d'un usage normal (12+ articles).
  limiter: createRateLimiter({ limit: 30, windowMs: 10 * 60 * 1000 }),
  provider: {
    supports: (platform) => platform.id in APIFY_ACTORS,
    fetch: async (platform, canonicalUrl) => {
      const token = env()["APIFY_API_TOKEN"] ?? "";
      if (!token)
        throw new ImportError(
          "HTTP_ERROR",
          "Import automatique non activé : le jeton Apify (APIFY_API_TOKEN) n’est pas renseigné sur le serveur. Voir le README.",
        );
      if (!apifyLimiter.take("global"))
        throw new ImportError(
          "RATE_LIMITED",
          "Limite quotidienne d’imports automatiques atteinte. Réessaie demain ou saisis le produit manuellement.",
        );
      return fetchApifyProduct(platform, canonicalUrl, { token });
    },
  },
  scrape: async (url) => {
    const key = env()["FIRECRAWL_API_KEY"];
    if (!key) return null;
    try {
      return await firecrawlScrape(url, key);
    } catch (e) {
      console.error("Firecrawl error", e);
      return null;
    }
  },
});

export const rates = createRatesService();

// Limiteur séparé pour les appels de traduction manuelle et de taux.
export const toolsLimiter = createRateLimiter({ limit: 60, windowMs: 10 * 60 * 1000 });
