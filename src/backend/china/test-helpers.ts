import type { FetchLike } from "./fetcher.ts";

export type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

/** fetch factice : route par préfixe d'URL, enregistre les appels. Respecte l'AbortSignal. */
export function mockFetch(routes: Record<string, Handler>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn: FetchLike = async (input, init) => {
    calls.push(init ? { url: input, init } : { url: input });
    const key = Object.keys(routes).find((k) => input.startsWith(k));
    if (!key) throw new TypeError(`fetch failed: route non simulée ${input}`);
    const handler = routes[key] as Handler;
    const result = handler(input, init);
    const signal = init?.signal;
    if (!signal) return result;
    return Promise.race([
      Promise.resolve(result),
      new Promise<Response>((_, reject) => {
        const onAbort = () => reject(signal.reason);
        if (signal.aborted) onAbort();
        else signal.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  };
  return { fn, calls };
}

export const html = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const redirect = (location: string, status = 302) =>
  new Response(null, { status, headers: { location } });

// Réponse qui n'arrive (quasi) jamais. Le minuteur « ref » garde la boucle d'événements active
// pendant que AbortSignal.timeout (minuteur « unref » dans Node) fait son travail.
export const never: Handler = () =>
  new Promise<Response>((resolve) => setTimeout(() => resolve(new Response("trop tard")), 400));

export const PRODUCT_HTML = `<!doctype html><html><head>
<title>跑步鞋男夏季 - 淘宝网</title>
<meta property="og:title" content="跑步鞋男夏季透气运动鞋">
<meta property="og:image" content="//img.alicdn.com/imgextra/a.jpg">
<meta property="og:description" content="透气 轻便 &amp; 耐磨">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"跑步鞋男夏季透气运动鞋",
 "image":["//img.alicdn.com/imgextra/a.jpg","https://img.alicdn.com/imgextra/b.jpg"],
 "description":"透气 轻便 &amp; 耐磨",
 "offers":{"@type":"AggregateOffer","lowPrice":"88.00","highPrice":"128.00","priceCurrency":"CNY","availability":"https://schema.org/InStock"},
 "aggregateRating":{"@type":"AggregateRating","ratingValue":"4.8","reviewCount":"1523"},
 "review":[{"@type":"Review","author":{"@type":"Person","name":"小明"},"reviewRating":{"ratingValue":"5"},"reviewBody":"质量很好","datePublished":"2026-09-01"}]}
</script></head><body>…</body></html>`;
