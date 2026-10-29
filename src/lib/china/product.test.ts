import test from "node:test";
import assert from "node:assert/strict";
import {
  buildManualProduct,
  findVariant,
  isSelectionComplete,
  normalizeImageUrl,
  resolveImage,
  resolveUnitPrice,
  type ManualProductInput,
} from "./product.ts";
import { makeProduct } from "./test-helpers.ts";

const base: ManualProductInput = {
  sourceUrl: "https://item.taobao.com/item.htm?id=987654321",
  title: "Veste",
  price: 120,
  currency: "cny",
  images: ["//img.alicdn.com/x.jpg", "http://img.alicdn.com/y.jpg", "//img.alicdn.com/x.jpg"],
  options: [
    { name: "Taille", values: ["M", "L", "L", ""] },
    { name: "", values: [] },
  ],
};

test("produit manuel : plateforme détectée, images normalisées, options nettoyées", () => {
  const r = buildManualProduct(base, { now: new Date("2026-10-27T10:00:00Z") });
  assert.ok(r.ok);
  const p = r.product;
  assert.equal(p.platform, "taobao");
  assert.equal(p.id, "taobao:987654321");
  assert.equal(p.origin, "manual");
  assert.equal(p.currency, "CNY");
  assert.deepEqual(p.images, ["https://img.alicdn.com/x.jpg", "https://img.alicdn.com/y.jpg"]);
  assert.deepEqual(p.options, [{ name: "Taille", values: [{ label: "M" }, { label: "L" }] }]);
  assert.deepEqual(p.price, { min: 120, max: 120 });
});

test("produit manuel : plateforme inconnue acceptée (lien jamais requêté), id stable", () => {
  const a = buildManualProduct({ ...base, sourceUrl: "https://www.exemple.cn/p/42" });
  const b = buildManualProduct({ ...base, sourceUrl: "https://www.exemple.cn/p/42" });
  assert.ok(a.ok && b.ok);
  assert.equal(a.product.platform, "other");
  assert.equal(a.product.platformLabel, "Autre plateforme");
  assert.equal(a.product.id, b.product.id);
  assert.match(a.product.id, /^manual:[0-9a-f]{8}$/);
});

test("produit manuel : validations", () => {
  const bad = (over: Partial<ManualProductInput>) => {
    const r = buildManualProduct({ ...base, ...over });
    assert.equal(r.ok, false);
    return r.ok ? {} : r.errors;
  };
  assert.ok(bad({ sourceUrl: "javascript:alert(1)" }).url);
  assert.ok(bad({ sourceUrl: "" }).url);
  assert.ok(bad({ title: "   " }).title);
  assert.ok(bad({ price: -3 }).price);
  assert.ok(bad({ price: 0 }).price);
  assert.ok(bad({ currency: "EURO" }).currency);
  assert.ok(bad({ images: ["javascript:alert(1)"] }).images);
  assert.ok(bad({ images: ["data:image/png;base64,AAAA"] }).images);
  assert.ok(bad({ options: [{ name: "Taille", values: [] }] }).options);
  assert.ok(
    bad({
      options: [
        { name: "Taille", values: ["M"] },
        { name: "taille", values: ["L"] },
      ],
    }).options,
  );
});

test("produit manuel : le prix peut rester vide (à renseigner avant ajout au panier)", () => {
  const r = buildManualProduct({ ...base, price: null });
  assert.ok(r.ok && r.product.price === null);
});

test("édition d’un import : les variantes détaillées survivent si les options sont inchangées", () => {
  const imported = makeProduct({
    options: [{ name: "Taille", values: [{ label: "M" }, { label: "L" }] }],
    variants: [{ options: { Taille: "M" }, price: 100 }],
  });
  const same = buildManualProduct(
    { ...base, options: [{ name: "Taille", values: ["M", "L"] }] },
    { base: imported },
  );
  assert.ok(same.ok);
  assert.equal(same.product.variants.length, 1);
  assert.equal(same.product.id, imported.id);
  const changed = buildManualProduct(
    { ...base, options: [{ name: "Taille", values: ["M", "L", "XL"] }] },
    { base: imported },
  );
  assert.ok(changed.ok);
  assert.equal(changed.product.variants.length, 0);
});

test("prix par variante, fourchette et sélection complète", () => {
  const p = makeProduct({
    price: { min: 80, max: 120 },
    options: [
      { name: "Taille", values: [{ label: "M", image: "https://i/m.jpg" }, { label: "L" }] },
    ],
    variants: [{ options: { Taille: "L" }, price: 110 }],
  });
  assert.deepEqual(resolveUnitPrice(p, { Taille: "L" }), { price: 110, source: "variant" });
  assert.deepEqual(resolveUnitPrice(p, { Taille: "M" }), { price: 80, source: "range_min" });
  assert.deepEqual(resolveUnitPrice(makeProduct(), {}), { price: 90, source: "single" });
  assert.deepEqual(resolveUnitPrice(makeProduct({ price: null }), {}), {
    price: null,
    source: "none",
  });
  assert.equal(findVariant(p, { Taille: "L" })?.price, 110);
  assert.equal(findVariant(p, { Taille: "M" }), null);
  assert.equal(isSelectionComplete(p, {}), false);
  assert.equal(isSelectionComplete(p, { Taille: "M" }), true);
  assert.equal(isSelectionComplete(p, { Taille: "XXL" }), false);
  assert.equal(resolveImage(p, { Taille: "M" }), "https://i/m.jpg");
  assert.equal(resolveImage(p, { Taille: "L" }), "https://img.alicdn.com/a.jpg");
});

test("normalizeImageUrl", () => {
  assert.equal(normalizeImageUrl("//cdn.x.com/a.jpg"), "https://cdn.x.com/a.jpg");
  assert.equal(normalizeImageUrl("/a.jpg", "https://shop.x.com/p"), "https://shop.x.com/a.jpg");
  assert.equal(normalizeImageUrl("javascript:alert(1)"), null);
  assert.equal(normalizeImageUrl("data:image/gif;base64,R0lG"), null);
  assert.equal(normalizeImageUrl(""), null);
});

test("produit manuel : libellés d’origine conservés pour les options", () => {
  const r = buildManualProduct({
    ...base,
    options: [
      { name: "Couleur", values: ["Noir", "Gris", "Noir"], originals: ["黑色", "灰色", "黑色"] },
    ],
  });
  assert.ok(r.ok);
  assert.deepEqual(r.product.options[0]?.values, [
    { label: "Noir", labelOriginal: "黑色" },
    { label: "Gris", labelOriginal: "灰色" },
  ]);
});
