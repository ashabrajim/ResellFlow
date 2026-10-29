// Secours anti-robot : Firecrawl lit la page dans un vrai navigateur et renvoie le HTML rendu.
// Appel direct à api.firecrawl.dev avec votre propre clé (aucune dépendance à Lovable).
export async function firecrawlScrape(
  url: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ html: string; finalUrl: string } | null> {
  const res = await fetchImpl("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      formats: ["rawHtml"],
      onlyMainContent: false,
      waitFor: 3000,
      timeout: 45000,
      location: { country: "CN", languages: ["zh-CN"] },
    }),
  });
  if (!res.ok) {
    console.error(`Firecrawl [${res.status}]: ${(await res.text()).slice(0, 300)}`);
    return null;
  }
  const j = (await res.json()) as {
    data?: { rawHtml?: string; html?: string; metadata?: { url?: string; sourceURL?: string } };
  };
  const d = j.data ?? {};
  const html = d.rawHtml ?? d.html ?? "";
  return html ? { html, finalUrl: d.metadata?.url ?? d.metadata?.sourceURL ?? url } : null;
}
