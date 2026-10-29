import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chinaEn, chinaFr } from "./i18n-china.ts";

const root = new URL("..", import.meta.url).pathname;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    if (d.isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(d.name) && !/\.test\./.test(d.name) ? [p] : [];
  });
}

test("FR et EN ont exactement les mêmes clés, sans texte vide", () => {
  assert.deepEqual(Object.keys(chinaEn).sort(), Object.keys(chinaFr).sort());
  for (const [k, v] of Object.entries(chinaFr)) assert.ok(v.trim(), `FR vide : ${k}`);
  for (const [k, v] of Object.entries(chinaEn)) assert.ok(v.trim(), `EN vide : ${k}`);
});

test("les variables {x} sont les mêmes en FR et en EN", () => {
  const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const k of Object.keys(chinaFr) as (keyof typeof chinaFr)[]) {
    assert.deepEqual(vars(chinaEn[k]), vars(chinaFr[k]), k);
  }
});

test("toute clé cn.* / nav.china* utilisée littéralement dans le code existe", () => {
  const known = new Set(Object.keys(chinaFr));
  const missing: string[] = [];
  for (const f of sourceFiles(root)) {
    if (f.endsWith("i18n-china.ts")) continue;
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/t\(\s*'((?:cn\.|nav\.china)[\w.]*)'/g)) {
      if (!known.has(m[1] as string)) missing.push(`${f.replace(root, "")}: ${m[1]}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("les clés construites dynamiquement ont toutes une entrée", () => {
  const known = new Set(Object.keys(chinaFr));
  const dynamic = [
    ...["EMPTY_INPUT", "INVALID_URL", "UNSUPPORTED_PLATFORM"].map((c) => `cn.import.err.${c}`),
    ...["untested", "tested"].map((s) => `cn.import.status.${s}`),
    ...["in_stock", "out_of_stock", "unknown"].map((a) => `cn.product.availability.${a}`),
    ...["translation_unavailable", "partial_data", "no_price", "no_images", "no_options"].map(
      (w) => `cn.product.warn.${w}`,
    ),
    ...[
      "INVALID_URL",
      "REQUIRED",
      "INVALID_CURRENCY",
      "INVALID_PRICE",
      "INVALID_IMAGE",
      "TOO_MANY_IMAGES",
      "INVALID_OPTION",
      "DUPLICATE_OPTION",
      "TOO_MANY_OPTIONS",
      "NETWORK",
    ].map((e) => `cn.err.${e}`),
  ];
  for (const k of dynamic) assert.ok(known.has(k), k);
});
