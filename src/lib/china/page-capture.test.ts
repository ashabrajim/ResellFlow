import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { bookmarkletHref, EXTRACTOR_SOURCE, parseCapture } from "./page-capture.ts";

const good = {
  v: 1,
  url: "https://item.taobao.com/item.htm?id=1065706862585",
  title: "耐克运动鞋",
  description: "desc",
  images: ["//img.alicdn.com/a.jpg", "javascript:alert(1)", "https://img.alicdn.com/a.jpg"],
  price: 199.5,
  currency: "cny",
  options: [
    { name: "尺码", values: ["40", "41", "41", ""] },
    { name: "", values: ["x"] },
  ],
};

test("parseCapture : charge valide -> saisie de produit nettoyée", () => {
  const r = parseCapture(JSON.stringify(good));
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.input.price, 199.5);
  assert.equal(r.input.currency, "CNY");
  assert.deepEqual(r.input.images, ["https://img.alicdn.com/a.jpg"]);
  assert.deepEqual(r.input.options, [{ name: "尺码", values: ["40", "41"] }]);
  assert.equal(r.input.titleOriginal, "耐克运动鞋");
});

test("parseCapture : refuse le contenu invalide", () => {
  assert.deepEqual(parseCapture("  "), { ok: false, code: "EMPTY" });
  assert.deepEqual(parseCapture("bonjour"), { ok: false, code: "NOT_JSON" });
  assert.deepEqual(parseCapture('{"a":1}'), { ok: false, code: "NOT_CAPTURE" });
  assert.deepEqual(parseCapture(JSON.stringify({ ...good, url: "javascript:alert(1)" })), {
    ok: false,
    code: "BAD_URL",
  });
  assert.deepEqual(parseCapture(JSON.stringify({ ...good, title: "" })), {
    ok: false,
    code: "NO_TITLE",
  });
});

test("parseCapture : prix invalide -> null (jamais inventé)", () => {
  for (const price of [0, -3, "abc", null, 1e12]) {
    const r = parseCapture(JSON.stringify({ ...good, price }));
    assert.ok(r.ok);
    if (r.ok) assert.equal(r.input.price, null);
  }
});

test("le script de page est du JS valide et produit un JSON lisible par parseCapture", () => {
  let copied = "";
  const doc = {
    title: "耐克 - 淘宝网",
    querySelector: (s: string) => (s.includes("og:title") ? { content: "耐克运动鞋" } : null),
    querySelectorAll: (s: string) =>
      s === "img"
        ? [
            {
              getAttribute: () => null,
              currentSrc: "https://img.alicdn.com/x.jpg_400x400.jpg",
              naturalWidth: 800,
            },
          ]
        : [],
  };
  const ctx = {
    document: doc,
    location: {
      href: "https://item.taobao.com/item.htm?id=1065706862585",
      hostname: "item.taobao.com",
    },
    navigator: {
      clipboard: { writeText: (t: string) => ((copied = t), { then: () => undefined }) },
    },
    window: { prompt: () => undefined },
    alert: () => undefined,
  };
  vm.runInNewContext(EXTRACTOR_SOURCE, ctx);
  const r = parseCapture(copied);
  assert.ok(r.ok, copied);
  if (!r.ok) return;
  assert.equal(r.input.title, "耐克运动鞋");
  assert.equal(r.input.currency, "CNY");
  assert.deepEqual(r.input.images, ["https://img.alicdn.com/x.jpg"]);
});

test("bookmarkletHref commence par javascript: et s’encode sans guillemets bruts", () => {
  const h = bookmarkletHref();
  assert.ok(h.startsWith("javascript:"));
  assert.ok(!/["\s]/.test(h));
});
