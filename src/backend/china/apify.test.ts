import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PLATFORMS } from "../../lib/china/platforms.ts";
import type { Product } from "../../lib/china/types.ts";
import { callApifyActor, fetchApifyProduct, isValidApifyToken, parseApifyItem } from "./apify.ts";
import { createRateLimiter, createTtlCache } from "./cache.ts";
import { ImportError } from "./errors.ts";
import { createImporter } from "./import-product.ts";
import { clearTranslationCache } from "./translate.ts";
import { html, json, mockFetch, never } from "./test-helpers.ts";

beforeEach(() => clearTranslationCache());

const TOKEN = "apify_api_TESTTOKEN12345";
const taobao = PLATFORMS.find((p) => p.id === "taobao")!;
const weidian = PLATFORMS.find((p) => p.id === "weidian")!;
const tmall = PLATFORMS.find((p) => p.id === "tmall")!;
const ACT_TB =
  "https://api.apify.com/v2/acts/pizani~taobao-product-scraper/run-sync-get-dataset-items";
const ACT_WD =
  "https://api.apify.com/v2/acts/pizani~weidian-product-detail-api/run-sync-get-dataset-items";

// Exemples repris de la documentation publique des acteurs (pages Apify).
const TAOBAO_ITEM = {
  sellerInfo: {
    shopTitle: "A电遇体育服饰",
    shopID: "339788445",
    shopLink: "https://shop339788445.taobao.com",
  },
  productInfo: {
    urlproduct: "https://item.taobao.com/item.htm?id=692815138312",
    itemId: "692815138312",
    title: "Retro Brazilian Sports Fan Jersey",
    titleCN: "复古巴西运动球迷球衣",
    price: "11.88",
    priceCurrency: "USD",
    priceCNY: "68.00",
    imgList: [
      "https://img.alicdn.com/a.png",
      "//img.alicdn.com/b.png",
      "https://img.alicdn.com/a.png",
    ],
    descriptionImages: ["https://img.alicdn.com/desc1.jpg"],
    totalStock: 20509,
    atributtes: { Brand: "Nike", Material: "Polyester" },
    options: [
      {
        name: "Yellow / S",
        imgUrl: "https://img.alicdn.com/y.png",
        price: "11.88",
        priceCNY: "68.00",
        stock: 120,
        skuId: "1",
      },
      { name: "Yellow / M", imgUrl: null, price: "12.50", priceCNY: "72.00", stock: 0, skuId: "2" },
      { name: "Blue / S", imgUrl: null, price: "11.88", priceCNY: "68.00", stock: 5, skuId: "3" },
    ],
  },
};
const WEIDIAN_ITEM = {
  sellerInfo: { shopTitle: "H12纯原总仓", shopID: "1826085585" },
  productInfo: {
    title: "N378310",
    titleCN: "🔑N378310",
    priceCNY: "210.0",
    shippingFee: "10",
    totalStock: 9986,
    imgList: ["https://si.geilicdn.com/x_1080_1620.jpg"],
    atributtes: { "Model Size-NK/AJ": "36, 36.5, 38" },
    options: [
      { name: "36", imgUrl: null, priceCNY: "210.0", stock: 666, skuNo: "124463963907" },
      { name: "36.5", imgUrl: null, priceCNY: "210.0", stock: 10, skuNo: "124463963908" },
    ],
  },
};

// ---- parseApifyItem ---------------------------------------------------------------------

test("Taobao : titre, prix en yuans, images dédoublonnées, SKU avec prix et stock", () => {
  const p = parseApifyItem(TAOBAO_ITEM, taobao);
  assert.equal(p.title, "复古巴西运动球迷球衣"); // l'original chinois est traduit par notre traducteur
  assert.equal(p.titleFallback, "Retro Brazilian Sports Fan Jersey");
  assert.equal(p.currency, "CNY");
  assert.deepEqual(p.price, { min: 68, max: 72 });
  assert.deepEqual(p.images, ["https://img.alicdn.com/a.png", "https://img.alicdn.com/b.png"]);
  assert.equal(p.seller, "A电遇体育服饰");
  assert.equal(p.availability, "in_stock");
  assert.equal(p.skus?.groupName, null);
  assert.deepEqual(
    p.skus?.items.map((s) => [s.label, s.price, s.available]),
    [
      ["Yellow / S", 68, true],
      ["Yellow / M", 72, false],
      ["Blue / S", 68, true],
    ],
  );
  assert.match(p.description ?? "", /Brand : Nike/);
  assert.deepEqual(p.reviews, []); // jamais d'avis inventés
  assert.equal(p.rating, null);
  assert.ok(!p.warnings.includes("no_options"));
});

test("Weidian : l'axe porte le nom du groupe, pas de fiche technique en description", () => {
  const p = parseApifyItem(WEIDIAN_ITEM, weidian);
  assert.equal(p.skus?.groupName, "Model Size-NK/AJ");
  assert.equal(p.description, null);
  assert.deepEqual(p.price, { min: 210, max: 210 });
});

test("sans SKU : prix unique, avertissement no_options, pas de variantes inventées", () => {
  const p = parseApifyItem(
    { productInfo: { titleCN: "鞋", priceCNY: "12.5", imgList: [] } },
    taobao,
  );
  assert.deepEqual(p.price, { min: 12.5, max: 12.5 });
  assert.equal(p.skus, undefined);
  assert.ok(p.warnings.includes("no_options") && p.warnings.includes("no_images"));
});

test("stock à 0 sur tout le produit = rupture ; stock absent = inconnu", () => {
  assert.equal(
    parseApifyItem({ productInfo: { titleCN: "x", priceCNY: "1", totalStock: 0 } }, taobao)
      .availability,
    "out_of_stock",
  );
  assert.equal(
    parseApifyItem({ productInfo: { titleCN: "x", priceCNY: "1" } }, taobao).availability,
    "unknown",
  );
});

test("réponses invalides : NO_DATA, jamais de plantage", () => {
  for (const bad of [undefined, null, "x", [], {}, { productInfo: "x" }, { error: "removed" }]) {
    assert.throws(
      () => parseApifyItem(bad, taobao),
      (e) => e instanceof ImportError && e.code === "NO_DATA",
    );
  }
  assert.throws(
    () => parseApifyItem({ productInfo: {} }, taobao),
    (e) => e instanceof ImportError,
  );
});

test("prix invalides ou négatifs ignorés ; URLs d'images dangereuses ignorées", () => {
  const p = parseApifyItem(
    {
      productInfo: {
        titleCN: "x",
        priceCNY: "-5",
        imgList: [
          "javascript:alert(1)",
          "data:image/png;base64,AAA",
          "https://u:p@evil.com/a.png",
          "https://ok.com/a.png",
        ],
        options: [{ name: "A", priceCNY: "abc", stock: "n/a" }],
      },
    },
    taobao,
  );
  assert.equal(p.price, null);
  assert.deepEqual(p.images, ["https://ok.com/a.png"]);
  assert.equal(p.skus?.items[0]?.price, null);
  assert.equal(p.skus?.items[0]?.available, null);
});

test("plafond de 300 SKU avec avertissement partial_data", () => {
  const options = Array.from({ length: 350 }, (_, i) => ({
    name: `V${i}`,
    priceCNY: "10",
    stock: 1,
  }));
  const p = parseApifyItem(
    { productInfo: { titleCN: "x", priceCNY: "10", imgList: ["https://a.com/i.png"], options } },
    taobao,
  );
  assert.equal(p.skus?.items.length, 300);
  assert.ok(p.warnings.includes("partial_data"));
});

// ---- appel HTTP -------------------------------------------------------------------------

test("jeton : validation (ASCII visible uniquement)", () => {
  assert.equal(isValidApifyToken(TOKEN), true);
  assert.equal(isValidApifyToken("court"), false);
  assert.equal(isValidApifyToken("jeton avec espace 1234"), false);
  assert.equal(isValidApifyToken("jetoné12345678"), false);
});

test("appel : jeton dans l'en-tête Authorization (jamais dans l'URL), en-têtes valides, corps correct", async () => {
  const m = mockFetch({ [ACT_TB]: () => json([TAOBAO_ITEM], 201) });
  const items = await callApifyActor({
    actor: "pizani~taobao-product-scraper",
    productUrl: "https://item.taobao.com/item.htm?id=692815138312",
    token: TOKEN,
    fetchImpl: m.fn,
  });
  assert.equal(items.length, 1);
  const call = m.calls[0]!;
  assert.ok(!call.url.includes(TOKEN));
  const headers = call.init?.headers as Record<string, string>;
  assert.equal(headers["authorization"], `Bearer ${TOKEN}`);
  assert.doesNotThrow(() => new Headers(headers));
  assert.deepEqual(JSON.parse(String(call.init?.body)), {
    product_url: "https://item.taobao.com/item.htm?id=692815138312",
  });
  assert.equal(call.init?.method, "POST");
});

test("appel : codes d'erreur Apify convertis en messages clairs", async () => {
  const cases: [number, string, RegExp][] = [
    [401, "HTTP_ERROR", /jeton Apify refusé/],
    [403, "HTTP_ERROR", /jeton Apify refusé/],
    [402, "HTTP_ERROR", /crédit/],
    [408, "TIMEOUT", /trop de temps/],
    [429, "RATE_LIMITED", /saturé/],
    [400, "NO_DATA", /retiré/],
    [500, "NO_DATA", /retiré/],
  ];
  for (const [status, code, msg] of cases) {
    const m = mockFetch({ [ACT_TB]: () => json({ error: { message: "x" } }, status) });
    await assert.rejects(
      callApifyActor({
        actor: "pizani~taobao-product-scraper",
        productUrl: "u",
        token: TOKEN,
        fetchImpl: m.fn,
      }),
      (e) => e instanceof ImportError && e.code === code && msg.test(e.message),
      `status ${status}`,
    );
  }
});

test("appel : délai dépassé, réseau coupé, réponse non-JSON ou non-tableau", async () => {
  const slow = mockFetch({ [ACT_TB]: never });
  await assert.rejects(
    callApifyActor({
      actor: "pizani~taobao-product-scraper",
      productUrl: "u",
      token: TOKEN,
      fetchImpl: slow.fn,
      timeoutMs: 10,
      graceMs: 0,
    }),
    (e) => e instanceof ImportError && e.code === "TIMEOUT",
  );
  const down = mockFetch({});
  await assert.rejects(
    callApifyActor({
      actor: "pizani~taobao-product-scraper",
      productUrl: "u",
      token: TOKEN,
      fetchImpl: down.fn,
    }),
    (e) => e instanceof ImportError && e.code === "NETWORK",
  );
  for (const body of ["pas du json", JSON.stringify({ a: 1 })]) {
    const m = mockFetch({ [ACT_TB]: () => new Response(body, { status: 200 }) });
    await assert.rejects(
      callApifyActor({
        actor: "pizani~taobao-product-scraper",
        productUrl: "u",
        token: TOKEN,
        fetchImpl: m.fn,
      }),
      (e) => e instanceof ImportError && e.code === "BAD_CONTENT",
    );
  }
  await assert.rejects(
    callApifyActor({ actor: "a", productUrl: "u", token: "é", fetchImpl: down.fn }),
    (e) => e instanceof ImportError && /jeton Apify invalide/.test(e.message),
  );
});

test("fetchApifyProduct : résultat vide = produit introuvable ; plateforme sans acteur refusée", async () => {
  const m = mockFetch({ [ACT_TB]: () => json([], 201) });
  await assert.rejects(
    fetchApifyProduct(taobao, "https://item.taobao.com/item.htm?id=1", {
      token: TOKEN,
      fetchImpl: m.fn,
    }),
    (e) => e instanceof ImportError && e.code === "NO_DATA",
  );
  await assert.rejects(
    fetchApifyProduct(tmall, "https://detail.tmall.com/item.htm?id=1", {
      token: TOKEN,
      fetchImpl: m.fn,
    }),
    (e) => e instanceof ImportError,
  );
});

// ---- intégration importateur --------------------------------------------------------------

const URL_TB = "https://item.taobao.com/item.htm?id=692815138312&spm=a21";
const frTable: Record<string, string> = {
  复古巴西运动球迷球衣: "Maillot de supporter brésilien rétro",
  "Yellow / S": "Jaune / S",
  "Yellow / M": "Jaune / M",
  "Blue / S": "Jaune / S", // collision volontaire : deux SKU avec la même traduction
  Brand: "Marque",
};

function setup(
  routes: Parameters<typeof mockFetch>[0],
  opts: { withProvider?: boolean; translateOk?: boolean } = {},
) {
  const m = mockFetch(routes);
  const importer = createImporter({
    fetchImpl: m.fn,
    translate: async (texts) =>
      opts.translateOk === false
        ? { results: texts, ok: false }
        : { results: texts.map((t) => frTable[t] ?? t), ok: true },
    cache: createTtlCache<Product>({ ttlMs: 60_000, max: 50 }),
    limiter: createRateLimiter({ limit: 30, windowMs: 60_000 }),
    now: () => new Date("2026-10-29T10:00:00Z"),
    ...(opts.withProvider === false
      ? {}
      : {
          provider: {
            supports: (p) => p.id === "taobao" || p.id === "weidian",
            fetch: (p, url) => fetchApifyProduct(p, url, { token: TOKEN, fetchImpl: m.fn }),
          },
        }),
  });
  return { importer, m };
}

test("import Taobao complet : fiche en français avec variantes, prix par variante, sans toucher Taobao", async () => {
  const { importer, m } = setup({ [ACT_TB]: () => json([TAOBAO_ITEM], 201) });
  const r = await importer.importProduct(URL_TB, "c1");
  assert.ok(r.ok);
  if (!r.ok) return;
  const p = r.product;
  assert.equal(p.title, "Maillot de supporter brésilien rétro");
  assert.equal(p.titleOriginal, "复古巴西运动球迷球衣");
  assert.equal(p.sourceUrl, "https://item.taobao.com/item.htm?id=692815138312");
  assert.equal(p.currency, "CNY");
  assert.deepEqual(p.price, { min: 68, max: 72 });
  assert.equal(p.options.length, 1);
  assert.equal(p.options[0]?.name, "Variante");
  // libellés uniques malgré la collision de traduction
  assert.deepEqual(
    p.options[0]?.values.map((v) => v.label),
    ["Jaune / S", "Jaune / M", "Jaune / S (2)"],
  );
  assert.equal(p.options[0]?.values[0]?.labelOriginal, "Yellow / S");
  assert.deepEqual(
    p.variants.map((v) => [v.options["Variante"], v.price, v.available]),
    [
      ["Jaune / S", 68, true],
      ["Jaune / M", 72, false],
      ["Jaune / S (2)", 68, true],
    ],
  );
  assert.match(p.description ?? "", /Nike/);
  assert.equal(p.reviews.length, 0);
  assert.equal(p.rating, null);
  assert.equal(p.origin, "auto");
  assert.equal(p.warnings.includes("no_options"), false);
  assert.ok(m.calls.every((c) => c.url.startsWith("https://api.apify.com"))); // aucune requête vers Taobao
});

test("import Weidian : l'axe garde le nom du groupe", async () => {
  const { importer } = setup({ [ACT_WD]: () => json([WEIDIAN_ITEM], 201) });
  const r = await importer.importProduct("https://weidian.com/item.html?itemID=7331453669", "c1");
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.product.options[0]?.name, "Model Size-NK/AJ");
    assert.equal(r.product.variants.length, 2);
    assert.equal(r.product.variants[0]?.price, 210);
  }
});

test("cache : le 2e import du même produit ne rappelle pas Apify (coût maîtrisé)", async () => {
  const { importer, m } = setup({ [ACT_TB]: () => json([TAOBAO_ITEM], 201) });
  await importer.importProduct(URL_TB, "c1");
  const r2 = await importer.importProduct(URL_TB, "c1");
  assert.ok(r2.ok && r2.cached);
  assert.equal(m.calls.filter((c) => c.url.startsWith("https://api.apify.com")).length, 1);
});

test("traduction indisponible : titre anglais de la source plutôt que le chinois, avertissement affiché", async () => {
  const { importer } = setup({ [ACT_TB]: () => json([TAOBAO_ITEM], 201) }, { translateOk: false });
  const r = await importer.importProduct(URL_TB, "c1");
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.product.title, "Retro Brazilian Sports Fan Jersey");
    assert.ok(r.product.warnings.includes("translation_unavailable"));
  }
});

test("connecteur en échec (jeton refusé) : message du connecteur, jamais de fausses données", async () => {
  const { importer } = setup({
    [ACT_TB]: () => json({ error: "unauthorized" }, 401),
    "https://item.taobao.com": () => html("<html><title>登录</title></html>"),
  });
  const r = await importer.importProduct(URL_TB, "c1");
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.message, /jeton Apify refusé/);
    assert.equal(r.platform, "taobao");
  }
});

test("connecteur en échec mais page publique lisible : la lecture directe prend le relais", async () => {
  const PAGE = `<html><head><title>跑鞋 - 淘宝网</title><meta property="og:title" content="跑鞋"><meta property="og:image" content="https://img.alicdn.com/z.jpg"></head></html>`;
  const { importer } = setup({
    [ACT_TB]: () => json({}, 500),
    "https://item.taobao.com": () => html(PAGE),
  });
  const r = await importer.importProduct(URL_TB, "c1");
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.product.options.length, 0);
    assert.ok(r.product.warnings.includes("no_options"));
  }
});

test("sans connecteur configuré : comportement inchangé (lecture directe uniquement)", async () => {
  const { importer, m } = setup(
    { "https://item.taobao.com": () => html("<html><title>登录</title></html>") },
    { withProvider: false },
  );
  const r = await importer.importProduct(URL_TB, "c1");
  assert.equal(r.ok, false);
  assert.ok(m.calls.every((c) => !c.url.startsWith("https://api.apify.com")));
});

test("plateforme sans connecteur (Tmall) : le connecteur n'est pas appelé", async () => {
  const { importer, m } = setup({
    "https://detail.tmall.com": () => html("<html><title>登录</title></html>"),
  });
  await importer.importProduct("https://detail.tmall.com/item.htm?id=612345678901", "c1");
  assert.ok(m.calls.every((c) => !c.url.startsWith("https://api.apify.com")));
});

test("jeton absent côté serveur : message explicite au lieu d'un faux « connexion requise »", async () => {
  const m = mockFetch({
    "https://item.taobao.com": () => html("<html><title>登录</title></html>"),
  });
  const importer = createImporter({
    fetchImpl: m.fn,
    translate: async (texts) => ({ results: texts, ok: true }),
    cache: createTtlCache<Product>({ ttlMs: 60_000, max: 10 }),
    limiter: createRateLimiter({ limit: 30, windowMs: 60_000 }),
    provider: {
      supports: (p) => p.id === "taobao",
      fetch: async () => {
        throw new ImportError(
          "HTTP_ERROR",
          "Import automatique non activé : le jeton Apify (APIFY_API_TOKEN) n’est pas renseigné sur le serveur. Voir le README.",
        );
      },
    },
  });
  const r = await importer.importProduct(URL_TB, "c1");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /APIFY_API_TOKEN/);
});
