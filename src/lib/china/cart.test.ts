import test from "node:test";
import assert from "node:assert/strict";
import {
  addToCart,
  cartCurrencies,
  cartTotals,
  lineKey,
  removeLine,
  sanitizeLines,
  setLineQuantity,
  MAX_QTY,
} from "./cart.ts";
import type { CartLine } from "./types.ts";
import { makeProduct } from "./test-helpers.ts";

let n = 0;
const id = () => `L${++n}`;

function add(
  lines: CartLine[],
  p = makeProduct(),
  sel: Record<string, string> = { Taille: "42", Couleur: "Noir" },
  qty = 1,
  price = 90,
) {
  const r = addToCart(
    lines,
    { product: p, selection: sel, quantity: qty, unitPrice: price },
    { id },
  );
  assert.ok(r.ok, JSON.stringify(r));
  return r;
}

test("conserve toutes les informations nécessaires à la commande", () => {
  const r = add([], makeProduct(), { Taille: "42", Couleur: "Noir" }, 3);
  const l = r.lines[0] as CartLine;
  assert.equal(l.title, "Baskets de running");
  assert.equal(l.sourceUrl, "https://item.taobao.com/item.htm?id=123456789");
  assert.equal(l.platform, "taobao");
  assert.equal(l.platformLabel, "Taobao");
  assert.equal(l.image, "https://img.alicdn.com/a.jpg");
  assert.equal(l.size, "42");
  assert.equal(l.color, "Noir");
  assert.deepEqual(l.selectionOriginal, { Couleur: "黑色" });
  assert.equal(l.quantity, 3);
  assert.equal(l.unitPrice, 90);
  assert.equal(l.currency, "CNY");
});

test("même produit + même variante -> les quantités s’additionnent", () => {
  const a = add([], makeProduct(), { Taille: "42", Couleur: "Noir" }, 2);
  const b = add(a.lines, makeProduct(), { Taille: "42", Couleur: "Noir" }, 3);
  assert.equal(b.merged, true);
  assert.equal(b.lines.length, 1);
  assert.equal(b.lines[0]?.quantity, 5);
});

test("variantes différentes d’un même produit ne sont jamais mélangées", () => {
  let lines: CartLine[] = [];
  lines = add(lines, makeProduct(), { Taille: "42", Couleur: "Noir" }).lines;
  lines = add(lines, makeProduct(), { Taille: "41", Couleur: "Noir" }).lines;
  lines = add(lines, makeProduct(), { Taille: "42", Couleur: "Gris" }).lines;
  assert.equal(lines.length, 3);
});

test("un prix unitaire différent crée une ligne distincte", () => {
  let lines: CartLine[] = [];
  lines = add(lines, makeProduct(), { Taille: "42", Couleur: "Noir" }, 1, 90).lines;
  lines = add(lines, makeProduct(), { Taille: "42", Couleur: "Noir" }, 1, 95).lines;
  assert.equal(lines.length, 2);
});

test("refuse une sélection incomplète, une quantité ou un prix invalide", () => {
  const p = makeProduct();
  assert.deepEqual(
    addToCart([], { product: p, selection: { Taille: "42" }, quantity: 1, unitPrice: 90 }),
    {
      ok: false,
      code: "INCOMPLETE_SELECTION",
    },
  );
  assert.equal(
    addToCart([], {
      product: p,
      selection: { Taille: "42", Couleur: "Noir" },
      quantity: 0,
      unitPrice: 90,
    }).ok,
    false,
  );
  assert.equal(
    addToCart([], {
      product: p,
      selection: { Taille: "42", Couleur: "Noir" },
      quantity: 1.5,
      unitPrice: 90,
    }).ok,
    false,
  );
  assert.equal(
    addToCart([], {
      product: p,
      selection: { Taille: "42", Couleur: "Noir" },
      quantity: 1,
      unitPrice: 0,
    }).ok,
    false,
  );
  assert.equal(
    addToCart([], {
      product: p,
      selection: { Taille: "42", Couleur: "Noir" },
      quantity: 1,
      unitPrice: Number.NaN,
    }).ok,
    false,
  );
});

test("produit sans option : ajout direct", () => {
  const p = makeProduct({ options: [] });
  const r = addToCart([], { product: p, selection: {}, quantity: 2, unitPrice: 10 }, { id });
  assert.ok(r.ok);
  assert.equal(r.lines[0]?.size, null);
});

test("accepte au moins 12 articles différents (et jusqu’à 100)", () => {
  let lines: CartLine[] = [];
  for (let i = 0; i < 12; i++) {
    const p = makeProduct({ id: `taobao:${1000000 + i}`, title: `Produit ${i}` });
    lines = add(lines, p).lines;
  }
  assert.equal(lines.length, 12);
  for (let i = 12; i < 100; i++)
    lines = add(lines, makeProduct({ id: `taobao:${1000000 + i}` })).lines;
  const full = addToCart(lines, {
    product: makeProduct({ id: "taobao:999999999" }),
    selection: { Taille: "42", Couleur: "Noir" },
    quantity: 1,
    unitPrice: 1,
  });
  assert.deepEqual(full, { ok: false, code: "CART_FULL" });
});

test("modifier la quantité, supprimer, plafonner", () => {
  const lines = add([], makeProduct(), undefined, 2).lines;
  const lineId = (lines[0] as CartLine).lineId;
  assert.equal(setLineQuantity(lines, lineId, 7)[0]?.quantity, 7);
  assert.equal(setLineQuantity(lines, lineId, 0)[0]?.quantity, 1);
  assert.equal(setLineQuantity(lines, lineId, 99999)[0]?.quantity, MAX_QTY);
  assert.equal(setLineQuantity(lines, lineId, Number.NaN)[0]?.quantity, 1);
  assert.equal(removeLine(lines, lineId).length, 0);
  assert.equal(removeLine(lines, "inconnu").length, 1);
});

test("totaux multi-plateformes, multi-devises, arrondis par ligne", () => {
  let lines: CartLine[] = [];
  lines = add(lines, makeProduct(), { Taille: "42", Couleur: "Noir" }, 3, 90).lines; // taobao CNY
  lines = add(
    lines,
    makeProduct({
      id: "weidian:555555555",
      platform: "weidian",
      platformLabel: "Weidian",
      options: [],
      sourceUrl: "https://weidian.com/item.html?itemID=555555555",
    }),
    {},
    2,
    40,
  ).lines;
  lines = add(
    lines,
    makeProduct({
      id: "aliexpress:1005001",
      platform: "aliexpress",
      platformLabel: "AliExpress",
      currency: "USD",
      options: [],
    }),
    {},
    1,
    10,
  ).lines;

  const t = cartTotals(lines, { CNY: { rate: 0.1234 }, USD: { rate: 0.92 } });
  assert.equal(t.references, 3);
  assert.equal(t.units, 6);
  assert.equal(t.complete, true);
  // CNY 90 -> 11,106 -> 1111 c ; x3 = 3333 ; CNY 40 -> 4,936 -> 494 c ; x2 = 988 ; USD 10 -> 9,20 -> 920
  assert.equal(t.lines[0]?.unitCents, 1111);
  assert.equal(t.lines[0]?.subtotalCents, 3333);
  assert.equal(t.lines[1]?.subtotalCents, 988);
  assert.equal(t.lines[2]?.subtotalCents, 920);
  assert.equal(t.productsCents, 3333 + 988 + 920);
  assert.deepEqual(cartCurrencies(lines).sort(), ["CNY", "USD"]);
});

test("taux manquant : total incomplet, jamais inventé", () => {
  const lines = add([], makeProduct(), undefined, 1).lines;
  const t = cartTotals(lines, {});
  assert.equal(t.complete, false);
  assert.deepEqual(t.missingCurrencies, ["CNY"]);
  assert.equal(t.productsCents, 0);
  assert.equal(t.lines[0]?.unitCents, null);
});

test("EUR : taux 1 sans appel de change ; commission agent séparée", () => {
  const p = makeProduct({ currency: "EUR", options: [] });
  const lines = add([], p, {}, 2, 12.5).lines;
  const t = cartTotals(lines, {}, 10);
  assert.equal(t.productsCents, 2500);
  assert.equal(t.agentFeeCents, 250);
  assert.equal(cartTotals(lines, {}, -5).agentFeeCents, 0);
  assert.equal(cartTotals(lines, {}, 500).agentFeePercent, 100);
});

test("persistance : le panier survit à une sérialisation JSON", () => {
  let lines: CartLine[] = [];
  lines = add(lines, makeProduct(), { Taille: "42", Couleur: "Noir" }, 3).lines;
  lines = add(lines, makeProduct(), { Taille: "41", Couleur: "Gris" }, 1).lines;
  const restored = sanitizeLines(JSON.parse(JSON.stringify(lines)));
  assert.deepEqual(restored, lines);
  assert.equal(lineKey(restored[0] as CartLine), lineKey(lines[0] as CartLine));
});

test("sanitizeLines écarte les données corrompues", () => {
  const good = add([], makeProduct()).lines[0] as CartLine;
  const dirty = [
    null,
    "x",
    { ...good, lineId: "A", unitPrice: -1 },
    { ...good, lineId: "B", quantity: "beaucoup" },
    { ...good, lineId: "C", title: 42 },
    { ...good, lineId: "D", quantity: 100000, platform: "inconnue", currency: "cnyxx" },
    { ...good, lineId: "D" }, // doublon d'identifiant
  ];
  const out = sanitizeLines(dirty);
  assert.equal(out.length, 1);
  assert.equal(out[0]?.quantity, MAX_QTY);
  assert.equal(out[0]?.platform, "other");
  assert.equal(out[0]?.currency, "CNY");
  assert.deepEqual(sanitizeLines("pas un tableau"), []);
});
