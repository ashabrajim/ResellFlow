import test from "node:test";
import assert from "node:assert/strict";
import {
  convertToCents,
  formatEurCents,
  formatIsoDateFr,
  formatOriginal,
  formatRate,
  parseAmount,
  toCents,
} from "./money.ts";

test("toCents évite les erreurs de flottants", () => {
  assert.equal(toCents(1.005), 101);
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(toCents(19.99), 1999);
  assert.equal(toCents(Number.NaN), 0);
});

test("conversion CNY -> EUR arrondie au centime", () => {
  assert.equal(convertToCents(90, 0.1234), 1111); // 11,106 -> 11,11 €
  assert.equal(convertToCents(0, 0.12), 0);
  assert.equal(convertToCents(12.5, 0.1), 125);
});

test("formats français", () => {
  assert.equal(formatEurCents(1111), "11,11 €");
  assert.equal(formatEurCents(123456), "1 234,56 €");
  assert.equal(formatEurCents(5), "0,05 €");
  assert.equal(formatEurCents(-250), "-2,50 €");
  assert.equal(formatOriginal(90, "CNY"), "90,00 CNY");
  assert.equal(formatRate(0.12345), "0,1235");
  assert.equal(formatIsoDateFr("2026-10-27"), "27/10/2026");
});

test("parseAmount comprend les saisies courantes", () => {
  assert.equal(parseAmount("12,5"), 12.5);
  assert.equal(parseAmount("1 200.50"), 1200.5);
  assert.equal(parseAmount("1.200,50"), 1200.5);
  assert.equal(parseAmount("1,200.50"), 1200.5);
  assert.equal(parseAmount("abc"), null);
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount("-5"), null);
});
