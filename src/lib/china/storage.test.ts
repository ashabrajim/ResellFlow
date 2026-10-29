import test from "node:test";
import assert from "node:assert/strict";
import { addToCart } from "./cart.ts";
import {
  EMPTY_PERSISTED,
  HISTORY_MAX,
  parsePersisted,
  pushHistory,
  serializePersisted,
} from "./storage.ts";
import { makeProduct } from "./test-helpers.ts";
import type { RateInfo } from "./types.ts";

const rate: RateInfo = {
  from: "CNY",
  to: "EUR",
  rate: 0.12,
  date: "2026-10-27",
  fetchedAt: "2026-10-27T10:00:00.000Z",
  source: "Frankfurter (BCE)",
  stale: false,
};

test("le panier, le numéro, les taux et l’historique survivent à un « rechargement de page »", () => {
  const p = makeProduct();
  const added = addToCart([], {
    product: p,
    selection: { Taille: "42", Couleur: "Noir" },
    quantity: 3,
    unitPrice: 90,
  });
  assert.ok(added.ok);
  const state = {
    version: 1 as const,
    cart: added.lines,
    agentPhone: "+86 138 0013 8000",
    agentFeePercent: 5,
    history: [p],
    rates: { CNY: rate },
  };
  const restored = parsePersisted(serializePersisted(state));
  assert.deepEqual(restored, state);
});

test("données absentes, corrompues ou d’une autre version : état vide, sans exception", () => {
  assert.deepEqual(parsePersisted(null), EMPTY_PERSISTED);
  assert.deepEqual(parsePersisted(""), EMPTY_PERSISTED);
  assert.deepEqual(parsePersisted("{pas du json"), EMPTY_PERSISTED);
  assert.deepEqual(parsePersisted("[]"), EMPTY_PERSISTED);
  assert.deepEqual(parsePersisted(JSON.stringify({ version: 99, cart: [1] })), EMPTY_PERSISTED);
});

test("valeurs invalides nettoyées individuellement", () => {
  const dirty = JSON.stringify({
    version: 1,
    cart: [{ nope: true }],
    agentPhone: 42,
    agentFeePercent: 9999,
    history: [{ id: "x" }, makeProduct()],
    rates: { CNY: { rate: -1 }, USD: rate },
  });
  const r = parsePersisted(dirty);
  assert.deepEqual(r.cart, []);
  assert.equal(r.agentPhone, "");
  assert.equal(r.agentFeePercent, 100);
  assert.equal(r.history.length, 1);
  assert.deepEqual(Object.keys(r.rates), ["USD"]);
});

test("historique : sans doublon, le plus récent en tête, borné", () => {
  let h = [] as ReturnType<typeof pushHistory>;
  for (let i = 0; i < HISTORY_MAX + 5; i++) h = pushHistory(h, makeProduct({ id: `taobao:${i}` }));
  assert.equal(h.length, HISTORY_MAX);
  assert.equal(h[0]?.id, `taobao:${HISTORY_MAX + 4}`);
  h = pushHistory(h, makeProduct({ id: "taobao:10", title: "maj" }));
  assert.equal(h.filter((p) => p.id === "taobao:10").length, 1);
  assert.equal(h[0]?.title, "maj");
});
