import test from "node:test";
import assert from "node:assert/strict";
import { PLATFORMS } from "../../lib/china/platforms.ts";
import { cleanTitle, parseProductPage } from "./adapters.ts";
import { ImportError } from "./errors.ts";
import { decodeEntities, extractFromHtml } from "./html-extract.ts";
import { PRODUCT_HTML } from "./test-helpers.ts";

const taobao = PLATFORMS.find((p) => p.id === "taobao")!;
const ali = PLATFORMS.find((p) => p.id === "aliexpress")!;
const U = new URL("https://item.taobao.com/item.htm?id=612345678901");

test("lit JSON-LD : titre, images, fourchette de prix, devise, stock, note, avis", () => {
  const e = extractFromHtml(PRODUCT_HTML, U.href);
  assert.equal(e.hasStructuredProduct, true);
  assert.equal(e.title, "跑步鞋男夏季透气运动鞋");
  assert.equal(e.description, "透气 轻便 & 耐磨");
  assert.deepEqual(e.images, [
    "https://img.alicdn.com/imgextra/a.jpg",
    "https://img.alicdn.com/imgextra/b.jpg",
  ]);
  assert.deepEqual(e.price, { min: 88, max: 128 });
  assert.equal(e.currency, "CNY");
  assert.equal(e.availability, "in_stock");
  assert.deepEqual(e.rating, { average: 4.8, count: 1523 });
  assert.deepEqual(e.reviews, [
    { text: "质量很好", author: "小明", rating: 5, date: "2026-09-01" },
  ]);
});

test("repli Open Graph quand il n’y a pas de JSON-LD ; rien n’est inventé", () => {
  const h = `<head><title>Chaussure - AliExpress</title>
    <meta property="og:title" content="Chaussure &amp; sac">
    <meta property="og:image" content="https://ae01.alicdn.com/kf/x.jpg">
    <meta property="product:price:amount" content="12.50"><meta property="product:price:currency" content="usd"></head>`;
  const e = extractFromHtml(h, "https://www.aliexpress.com/item/1005001234567890.html");
  assert.equal(e.title, "Chaussure & sac");
  assert.deepEqual(e.price, { min: 12.5, max: 12.5 });
  assert.equal(e.currency, "USD");
  assert.equal(e.rating, null);
  assert.deepEqual(e.reviews, []);
  assert.equal(e.availability, "unknown");
  assert.equal(e.hasStructuredProduct, false);
});

test("JSON-LD invalide ou @graph : pas de plantage", () => {
  const broken = `<script type="application/ld+json">{ceci n'est pas du json</script><title>X</title>`;
  assert.doesNotThrow(() => extractFromHtml(broken, U.href));
  const graph = `<script type="application/ld+json">{"@graph":[{"@type":"WebSite"},{"@type":["Product"],"name":"Gadget","offers":[{"price":"5","priceCurrency":"EUR"},{"price":"9","priceCurrency":"EUR"}]}]}</script>`;
  const e = extractFromHtml(graph, U.href);
  assert.equal(e.title, "Gadget");
  assert.deepEqual(e.price, { min: 5, max: 9 });
});

test("note hors échelle ignorée ; avis sans texte ignorés", () => {
  const h = `<script type="application/ld+json">{"@type":"Product","name":"A","aggregateRating":{"ratingValue":"9.5","reviewCount":"3"},"review":[{"reviewBody":""},{"author":"x"}]}</script>`;
  const e = extractFromHtml(h, U.href);
  assert.equal(e.rating, null);
  assert.deepEqual(e.reviews, []);
});

test("décodage des entités HTML", () => {
  assert.equal(
    decodeEntities("a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39; &#x4e2d; &unknown;"),
    "a & b <c> \"d\" 'e' 中 &unknown;",
  );
  assert.equal(decodeEntities("&#99999999999;"), "&#99999999999;");
});

test("nettoyage du titre : suffixes de site retirés, titres génériques écartés", () => {
  assert.equal(cleanTitle("跑步鞋 - 淘宝网"), "跑步鞋");
  assert.equal(cleanTitle("Sneakers | AliExpress"), "Sneakers");
  assert.equal(cleanTitle("淘宝网"), null);
  assert.equal(cleanTitle("AliExpress"), null);
  assert.equal(cleanTitle(null), null);
});

test("adaptateur : produit complet, avertissements honnêtes (aucune variante lue)", () => {
  const p = parseProductPage(taobao, PRODUCT_HTML, U);
  assert.equal(p.title, "跑步鞋男夏季透气运动鞋");
  assert.equal(p.currency, "CNY");
  assert.ok(p.warnings.includes("no_options"));
  assert.ok(!p.warnings.includes("partial_data"));
});

test("adaptateur : page de connexion / anti-robot -> BLOCKED (jamais contourné)", () => {
  const pages: [string, string][] = [
    ["<title>登录</title><body>请登录</body>", "https://item.taobao.com/item.htm?id=612345678901"],
    ["<title>淘宝网</title>", "https://login.taobao.com/member/login.jhtml"],
    ["<title>验证码拦截</title>", "https://item.taobao.com/item.htm?id=612345678901"],
    [
      '<title>x</title><div id="nocaptcha">滑动验证</div>',
      "https://item.taobao.com/item.htm?id=612345678901",
    ],
    [
      "<title>Captcha Interception</title>",
      "https://www.aliexpress.com/item/1005001234567890.html",
    ],
  ];
  for (const [h, u] of pages) {
    assert.throws(
      () => parseProductPage(taobao, h, new URL(u)),
      (e: unknown) => e instanceof ImportError && e.code === "BLOCKED",
      u,
    );
  }
});

test("adaptateur : page vide ou générique -> NO_DATA", () => {
  assert.throws(
    () => parseProductPage(taobao, "<html><title>淘宝网</title></html>", U),
    (e: unknown) => e instanceof ImportError && e.code === "NO_DATA",
  );
  assert.throws(
    () =>
      parseProductPage(
        ali,
        "<html><body>chargement…</body></html>",
        new URL("https://www.aliexpress.com/item/1005001234567890.html"),
      ),
    (e: unknown) => e instanceof ImportError && e.code === "NO_DATA",
  );
});

test("adaptateur : données partielles signalées ; prix sans devise (AliExpress) écarté", () => {
  const h = `<title>Montre connectée</title><meta property="og:price:amount" content="19.99">`;
  const p = parseProductPage(
    ali,
    h,
    new URL("https://www.aliexpress.com/item/1005001234567890.html"),
  );
  assert.equal(p.title, "Montre connectée");
  assert.equal(p.price, null);
  assert.ok(
    p.warnings.includes("partial_data") &&
      p.warnings.includes("no_price") &&
      p.warnings.includes("no_images"),
  );
});

test("un produit qui mentionne « login » dans son menu n’est pas pris pour une page de blocage", () => {
  const p = parseProductPage(
    taobao,
    PRODUCT_HTML.replace("</body>", '<a href="/login">Sign in</a></body>'),
    U,
  );
  assert.equal(p.title, "跑步鞋男夏季透气运动鞋");
});
