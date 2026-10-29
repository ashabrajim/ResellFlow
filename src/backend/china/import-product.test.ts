import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter, createTtlCache } from "./cache.ts";
import { clientKeyFromHeaders, createImporter } from "./import-product.ts";
import { clearTranslationCache, translateToFrench } from "./translate.ts";
import { html, json, mockFetch, PRODUCT_HTML, redirect } from "./test-helpers.ts";
import type { Product } from "../../lib/china/types.ts";

beforeEach(() => clearTranslationCache());

const URL_TB = "https://item.taobao.com/item.htm?id=612345678901&spm=a21";
const CANON = "https://item.taobao.com/item.htm?id=612345678901";
const MM = "https://api.mymemory.translated.net/get";
const frTable: Record<string, string> = {
  跑步鞋男夏季透气运动鞋: "Chaussures de running homme été respirantes",
  "透气 轻便 & 耐磨": "Respirant, léger et résistant",
  质量很好: "Très bonne qualité",
};

function setup(
  routes: Parameters<typeof mockFetch>[0],
  opts: { limit?: number; translate?: "real" | "fail" } = {},
) {
  const m = mockFetch({
    [MM]: (u) => {
      const q = new URL(u).searchParams.get("q") ?? "";
      return json({ responseStatus: 200, responseData: { translatedText: frTable[q] ?? q } });
    },
    ...routes,
  });
  const importer = createImporter({
    fetchImpl: m.fn,
    translate:
      opts.translate === "fail"
        ? async (texts) => ({ results: texts, ok: false })
        : (texts) => translateToFrench(texts, { fetchImpl: m.fn, env: {} }),
    cache: createTtlCache<Product>({ ttlMs: 60_000, max: 50 }),
    limiter: createRateLimiter({ limit: opts.limit ?? 30, windowMs: 60_000 }),
    now: () => new Date("2026-10-27T18:00:00Z"),
  });
  return { importer, m };
}
const pageCalls = (m: ReturnType<typeof mockFetch>) =>
  m.calls.filter((c) => c.url.startsWith("https://item.taobao.com") || c.url.includes("e.tb.cn"));

test("import complet : produit traduit, lien canonique, données réellement lues uniquement", async () => {
  const { importer } = setup({ "https://item.taobao.com/": () => html(PRODUCT_HTML) });
  const r = await importer.importProduct(URL_TB, "ip1");
  assert.ok(r.ok);
  const p = r.product;
  assert.equal(r.cached, false);
  assert.equal(p.id, "taobao:612345678901");
  assert.equal(p.platform, "taobao");
  assert.equal(p.sourceUrl, CANON);
  assert.equal(p.title, "Chaussures de running homme été respirantes");
  assert.equal(p.titleOriginal, "跑步鞋男夏季透气运动鞋");
  assert.equal(p.description, "Respirant, léger et résistant");
  assert.equal(p.currency, "CNY");
  assert.deepEqual(p.price, { min: 88, max: 128 });
  assert.equal(p.images.length, 2);
  assert.deepEqual(p.rating, { average: 4.8, count: 1523 });
  assert.equal(p.reviews[0]?.text, "Très bonne qualité");
  assert.equal(p.reviews[0]?.textOriginal, "质量很好");
  assert.deepEqual(p.options, [], "aucune variante inventée");
  assert.deepEqual(p.variants, []);
  assert.ok(!p.warnings.includes("translation_unavailable"));
  assert.equal(p.fetchedAt, "2026-10-27T18:00:00.000Z");
});

test("la traduction est indisponible : texte d’origine + avertissement, import conservé", async () => {
  const { importer } = setup(
    { "https://item.taobao.com/": () => html(PRODUCT_HTML) },
    { translate: "fail" },
  );
  const r = await importer.importProduct(URL_TB, "ip1");
  assert.ok(r.ok);
  assert.equal(r.product.title, "跑步鞋男夏季透气运动鞋");
  assert.equal(r.product.titleOriginal, null);
  assert.ok(r.product.warnings.includes("translation_unavailable"));
});

test("cache : le 2e import du même produit (autre URL, même id) ne refait aucune requête", async () => {
  const { importer, m } = setup({ "https://item.taobao.com/": () => html(PRODUCT_HTML) });
  await importer.importProduct(URL_TB, "ip1");
  const before = m.calls.length;
  const r = await importer.importProduct(
    "https://item.taobao.com/item.htm?id=612345678901&utm=zzz",
    "ip1",
  );
  assert.ok(r.ok && r.cached);
  assert.equal(m.calls.length, before);
});

test("doublons : deux imports simultanés = une seule récupération", async () => {
  const { importer, m } = setup({
    "https://item.taobao.com/": () =>
      new Promise<Response>((res) => setTimeout(() => res(html(PRODUCT_HTML)), 30)),
  });
  const [a, b] = await Promise.all([
    importer.importProduct(URL_TB, "ip1"),
    importer.importProduct(URL_TB, "ip2"),
  ]);
  assert.ok(a.ok && b.ok);
  assert.equal(pageCalls(m).length, 1);
});

test("lien court : redirection suivie, produit identifié par l’id final, mis en cache", async () => {
  const { importer, m } = setup({
    "https://e.tb.cn/": () => redirect("https://item.taobao.com/item.htm?id=612345678901"),
    "https://item.taobao.com/": () => html(PRODUCT_HTML),
  });
  const r = await importer.importProduct("【淘宝】https://e.tb.cn/h.abc 点击链接直接打开", "ip1");
  assert.ok(r.ok);
  assert.equal(r.product.id, "taobao:612345678901");
  const again = await importer.importProduct(URL_TB, "ip1");
  assert.ok(again.ok && again.cached);
  assert.equal(pageCalls(m).length, 2); // e.tb.cn + page produit, une seule fois
});

test("lien court qui redirige vers un hôte interne : refusé", async () => {
  const { importer, m } = setup({
    "https://e.tb.cn/": () => redirect("http://169.254.169.254/latest/meta-data/"),
  });
  const r = await importer.importProduct("https://e.tb.cn/h.evil", "ip1");
  assert.ok(!r.ok);
  assert.ok(["UNSUPPORTED_PLATFORM", "INVALID_URL"].includes(r.code));
  assert.ok(!m.calls.some((c) => c.url.includes("169.254")));
});

test("liens invalides / non pris en charge : messages explicites, aucune requête réseau", async () => {
  const { importer, m } = setup({});
  const cases: [unknown, string][] = [
    ["", "EMPTY_INPUT"],
    [42, "INVALID_URL"],
    ["bonjour", "INVALID_URL"],
    ["https://www.amazon.fr/dp/B000", "UNSUPPORTED_PLATFORM"],
    ["http://localhost:3000/admin", "INVALID_URL"],
    ["https://item.taobao.com/", "INVALID_URL"], // pas d'identifiant produit
  ];
  for (const [input, code] of cases) {
    const r = await importer.importProduct(input, "ip1");
    assert.ok(!r.ok, String(input));
    assert.equal(r.code, code, String(input));
    assert.ok(r.message.length > 10);
  }
  assert.equal(m.calls.length, 0);
});

test("page protégée -> BLOCKED avec lien conservé pour la saisie manuelle", async () => {
  const { importer } = setup({
    "https://item.taobao.com/": () => html("<title>登录</title>请登录"),
  });
  const r = await importer.importProduct(URL_TB, "ip1");
  assert.ok(!r.ok);
  assert.equal(r.code, "BLOCKED");
  assert.equal(r.platform, "taobao");
  assert.match(r.sourceUrl ?? "", /612345678901/);
});

test("erreurs réseau / HTTP / blocage 403 remontées sans plantage", async () => {
  for (const [handler, code] of [
    [() => Promise.reject(new TypeError("fetch failed")), "NETWORK"],
    [() => html("", 403), "BLOCKED"],
    [() => html("", 500), "HTTP_ERROR"],
    [() => html("<html><body>vide</body></html>"), "NO_DATA"],
  ] as const) {
    const { importer } = setup({ "https://item.taobao.com/": handler });
    const r = await importer.importProduct(URL_TB, "ip1");
    assert.ok(!r.ok);
    assert.equal(r.code, code);
  }
});

test("limitation de débit par client (les hits de cache ne comptent pas)", async () => {
  const { importer } = setup(
    { "https://item.taobao.com/": () => html(PRODUCT_HTML) },
    { limit: 2 },
  );
  const u = (n: number) => `https://item.taobao.com/item.htm?id=${700000000000 + n}`;
  assert.ok((await importer.importProduct(u(1), "ip1")).ok);
  assert.ok((await importer.importProduct(u(2), "ip1")).ok);
  const third = await importer.importProduct(u(3), "ip1");
  assert.ok(!third.ok && third.code === "RATE_LIMITED");
  assert.ok((await importer.importProduct(u(1), "ip1")).ok, "cache : pas de décompte");
  assert.ok((await importer.importProduct(u(3), "autre-client")).ok);
});

test("clé client : CF-Connecting-IP puis X-Forwarded-For", () => {
  assert.equal(
    clientKeyFromHeaders(
      new Headers({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }),
    ),
    "1.2.3.4",
  );
  assert.equal(
    clientKeyFromHeaders(new Headers({ "x-forwarded-for": "5.6.7.8, 10.0.0.1" })),
    "5.6.7.8",
  );
  assert.equal(clientKeyFromHeaders(new Headers()), "unknown");
});
