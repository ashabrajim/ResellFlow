import test from "node:test";
import assert from "node:assert/strict";
import { addToCart, cartTotals } from "./cart.ts";
import type { CartLine } from "./types.ts";
import { makeProduct } from "./test-helpers.ts";
import { buildOrderMessage, normalizePhone, whatsappLink } from "./whatsapp.ts";

let n = 0;
const id = () => `W${++n}`;
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
  assert.ok(r.ok);
  return r.lines;
}

test("message : format conforme à la spécification", () => {
  let lines = add(
    [],
    makeProduct({
      currency: "EUR",
      platform: "taobao",
      title: "Baskets",
      options: [
        { name: "Taille", values: [{ label: "42" }] },
        { name: "Couleur", values: [{ label: "Noir" }] },
      ],
    }),
    { Taille: "42", Couleur: "Noir" },
    3,
    12,
  );
  lines = add(
    lines,
    makeProduct({
      id: "weidian:2222222",
      platform: "weidian",
      platformLabel: "Weidian",
      sourceUrl: "https://weidian.com/item.html?itemID=2222222",
      title: "T-shirt",
      currency: "EUR",
      options: [
        { name: "Taille", values: [{ label: "L" }] },
        { name: "Couleur", values: [{ label: "Gris" }] },
      ],
    }),
    { Taille: "L", Couleur: "Gris" },
    2,
    5,
  );
  const { full, parts } = buildOrderMessage(cartTotals(lines, {}));
  assert.equal(parts.length, 1);
  assert.equal(parts[0], full);
  assert.match(full, /^Bonjour, voici ma commande\./);
  assert.match(
    full,
    /ARTICLE 1\nProduit : Baskets\nPlateforme : Taobao\nLien : https:\/\/item\.taobao\.com\/item\.htm\?id=123456789\nQuantité : 3\nTaille : 42\nCouleur : Noir\nPrix unitaire estimé : 12,00 €\nSous-total estimé : 36,00 €/,
  );
  assert.match(
    full,
    /ARTICLE 2\nProduit : T-shirt\nPlateforme : Weidian\nLien : https:\/\/weidian\.com\/item\.html\?itemID=2222222\nQuantité : 2\nTaille : L\nCouleur : Gris\nPrix unitaire estimé : 5,00 €\nSous-total estimé : 10,00 €/,
  );
  assert.match(
    full,
    /TOTAL ESTIMÉ DES PRODUITS : 46,00 €\nNOMBRE DE RÉFÉRENCES : 2\nNOMBRE TOTAL D’UNITÉS : 5/,
  );
  assert.match(
    full,
    /Merci de confirmer la disponibilité, les prix définitifs et les frais supplémentaires\.$/,
  );
});

test("message : prix d’origine et libellés chinois conservés pour l’agent", () => {
  const lines = add([], makeProduct(), { Taille: "42", Couleur: "Noir" }, 2, 90);
  const { full } = buildOrderMessage(cartTotals(lines, { CNY: { rate: 0.1234 } }));
  assert.match(full, /Couleur : Noir \(黑色\)/);
  assert.match(full, /Prix unitaire estimé : 11,11 € \(90,00 CNY\)/);
  assert.match(full, /Sous-total estimé : 22,22 €/);
});

test("message : taux manquant -> pas de total inventé", () => {
  const lines = add([], makeProduct());
  const { full } = buildOrderMessage(cartTotals(lines, {}));
  assert.match(full, /TOTAL ESTIMÉ DES PRODUITS : indisponible \(taux de change manquant : CNY\)/);
  assert.match(full, /conversion en euros indisponible/);
});

test("lien wa.me : accents, chinois, espaces et retours à la ligne survivent à l’encodage", () => {
  const text =
    "Bonjour, voici ma commande.\n\nProduit : Chaussures été – 黑色 运动鞋\nQuantité : 3 & plus ? 100 % #1";
  const link = whatsappLink("8613800138000", text);
  assert.ok(link.startsWith("https://wa.me/8613800138000?text="));
  const encoded = link.split("?text=")[1] as string;
  assert.equal(decodeURIComponent(encoded), text);
  assert.ok(!/[\s\n]/.test(link));
  assert.equal(new URL(link).searchParams.get("text"), text);
});

test("messages longs : découpés par article, chaque lien reste sous la limite, rien ne se perd", () => {
  let lines: CartLine[] = [];
  for (let i = 0; i < 30; i++) {
    const p = makeProduct({
      id: `taobao:${3000000 + i}`,
      sourceUrl: `https://item.taobao.com/item.htm?id=${3000000 + i}`,
      title: `Produit numéro ${i} 很长的名字 ${"x".repeat(20)}`,
    });
    lines = add(lines, p, { Taille: "42", Couleur: "Noir" }, 2, 50 + i);
  }
  const totals = cartTotals(lines, { CNY: { rate: 0.1234 } });
  const { full, parts } = buildOrderMessage(totals);
  assert.ok(parts.length > 1, "doit être découpé");
  for (const p of parts) {
    assert.ok(
      encodeURIComponent(p).length <= 1800,
      `partie trop longue : ${encodeURIComponent(p).length}`,
    );
    assert.ok(whatsappLink("33612345678", p).length < 2000 + 40);
  }
  const joined = parts.join("\n");
  for (let i = 1; i <= 30; i++)
    assert.ok(joined.includes(`ARTICLE ${i}\n`), `ARTICLE ${i} manquant`);
  assert.match(parts[0] as string, /partie 1\/\d+/);
  assert.match(parts[parts.length - 1] as string, /NOMBRE TOTAL D’UNITÉS : 60/);
  assert.match(full, /NOMBRE DE RÉFÉRENCES : 30/);
  // chaque lien source est présent une seule fois
  for (let i = 0; i < 30; i++) assert.equal(joined.split(`id=${3000000 + i}`).length - 1, 1);
});

test("numéro WhatsApp : normalisation et validation", () => {
  assert.deepEqual(normalizePhone("+86 138 0013 8000"), {
    ok: true,
    digits: "8613800138000",
    display: "+8613800138000",
  });
  assert.deepEqual(normalizePhone("0086 138-0013-8000"), {
    ok: true,
    digits: "8613800138000",
    display: "+8613800138000",
  });
  assert.deepEqual(normalizePhone("+33 (0)6 12 34 56 78"), {
    ok: true,
    digits: "33612345678",
    display: "+33612345678",
  });
  assert.deepEqual(normalizePhone("+1 (415) 555-2671"), {
    ok: true,
    digits: "14155552671",
    display: "+14155552671",
  });
  assert.equal(normalizePhone("").ok, false);
  assert.deepEqual(normalizePhone("06 12 34 56 78"), { ok: false, code: "LOCAL_FORMAT" });
  assert.deepEqual(normalizePhone("+12"), { ok: false, code: "LENGTH" });
  assert.deepEqual(normalizePhone("+1234567890123456"), { ok: false, code: "LENGTH" });
  assert.deepEqual(normalizePhone("+33 abc"), { ok: false, code: "INVALID" });
  assert.deepEqual(normalizePhone("+33; rm -rf /"), { ok: false, code: "INVALID" });
});
