// Variables d'environnement du serveur (jamais envoyées au navigateur).
export function env(): Record<string, string | undefined> {
  return typeof process !== "undefined" && process.env
    ? (process.env as Record<string, string | undefined>)
    : {};
}

/** État de configuration, sans aucune valeur secrète : uniquement des booléens. */
export function importStatus() {
  const e = env();
  return {
    apifyConnector: Boolean(e["APIFY_API_TOKEN"]),
    translation: e["DEEPL_API_KEY"]
      ? "deepl"
      : e["GOOGLE_TRANSLATE_API_KEY"]
        ? "google"
        : "mymemory",
    firecrawl: Boolean(e["FIRECRAWL_API_KEY"]),
    platformsWithConnector: ["taobao", "weidian"],
  };
}
