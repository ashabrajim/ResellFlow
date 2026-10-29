import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  chunkByBytes,
  clearTranslationCache,
  looksFrench,
  pickProvider,
  translateToFrench,
} from "./translate.ts";
import { json, mockFetch } from "./test-helpers.ts";

beforeEach(() => clearTranslationCache());

test("choix du fournisseur selon les variables d’environnement", () => {
  assert.equal(pickProvider({}), "mymemory");
  assert.equal(pickProvider({ GOOGLE_TRANSLATE_API_KEY: "g" }), "google");
  assert.equal(pickProvider({ DEEPL_API_KEY: "d", GOOGLE_TRANSLATE_API_KEY: "g" }), "deepl");
});

test("MyMemory : traduit le chinois, envoie zh-CN|fr, encode correctement", async () => {
  const m = mockFetch({
    "https://api.mymemory.translated.net/get": () =>
      json({ responseStatus: 200, responseData: { translatedText: "Chaussures de course" } }),
  });
  const r = await translateToFrench(["跑步鞋"], { fetchImpl: m.fn, env: {} });
  assert.deepEqual(r, { results: ["Chaussures de course"], ok: true, provider: "mymemory" });
  const u = new URL(m.calls[0]?.url ?? "");
  assert.equal(u.searchParams.get("langpair"), "zh-CN|fr");
  assert.equal(u.searchParams.get("q"), "跑步鞋");
});

test("MyMemory : anglais -> en|fr ; e-mail optionnel transmis", async () => {
  const m = mockFetch({
    "https://api.mymemory.translated.net/get": () =>
      json({ responseStatus: 200, responseData: { translatedText: "Chaussures" } }),
  });
  await translateToFrench(["Running shoes"], {
    fetchImpl: m.fn,
    env: { MYMEMORY_EMAIL: "a@b.fr" },
  });
  const u = new URL(m.calls[0]?.url ?? "");
  assert.equal(u.searchParams.get("langpair"), "en|fr");
  assert.equal(u.searchParams.get("de"), "a@b.fr");
});

test("MyMemory : quota dépassé -> texte d’origine conservé, ok=false", async () => {
  const m = mockFetch({
    "https://api.mymemory.translated.net/get": () =>
      json({
        responseStatus: 200,
        responseData: {
          translatedText: "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY",
        },
      }),
  });
  const r = await translateToFrench(["跑步鞋"], { fetchImpl: m.fn, env: {} });
  assert.deepEqual(r.results, ["跑步鞋"]);
  assert.equal(r.ok, false);
});

test("DeepL : clé gratuite -> api-free, en-tête d’autorisation, un seul appel groupé", async () => {
  const m = mockFetch({
    "https://api-free.deepl.com/v2/translate": (_u, init) => {
      const body = JSON.parse(String(init?.body)) as { text: string[]; target_lang: string };
      assert.equal(body.target_lang, "FR");
      return json({ translations: body.text.map((t) => ({ text: `FR(${t})` })) });
    },
  });
  const r = await translateToFrench(["跑步鞋", "", "黑色", "跑步鞋"], {
    fetchImpl: m.fn,
    env: { DEEPL_API_KEY: "abc:fx" },
  });
  assert.equal(m.calls.length, 1);
  assert.equal(
    (m.calls[0]?.init?.headers as Record<string, string>)["authorization"],
    "DeepL-Auth-Key abc:fx",
  );
  assert.deepEqual(r.results, ["FR(跑步鞋)", "", "FR(黑色)", "FR(跑步鞋)"]);
  assert.equal(
    JSON.parse(String(m.calls[0]?.init?.body)).text.length,
    2,
    "doublons et vides non envoyés",
  );
});

test("Google : clé dans l’en-tête (jamais dans l’URL)", async () => {
  const m = mockFetch({
    "https://translation.googleapis.com/language/translate/v2": () =>
      json({ data: { translations: [{ translatedText: "Rouge" }] } }),
  });
  const r = await translateToFrench(["红色"], {
    fetchImpl: m.fn,
    env: { GOOGLE_TRANSLATE_API_KEY: "SECRET" },
  });
  assert.deepEqual(r.results, ["Rouge"]);
  assert.ok(!m.calls[0]?.url.includes("SECRET"));
  assert.equal((m.calls[0]?.init?.headers as Record<string, string>)["x-goog-api-key"], "SECRET");
});

test("erreurs réseau / HTTP / réponse invalide : jamais d’exception, originaux conservés", async () => {
  const cases = [
    mockFetch({
      "https://api.mymemory.translated.net/get": () =>
        Promise.reject(new TypeError("fetch failed")),
    }),
    mockFetch({
      "https://api.mymemory.translated.net/get": () => new Response("nope", { status: 500 }),
    }),
    mockFetch({
      "https://api.mymemory.translated.net/get": () => new Response("pas du json", { status: 200 }),
    }),
  ];
  for (const m of cases) {
    clearTranslationCache();
    const r = await translateToFrench(["跑步鞋"], { fetchImpl: m.fn, env: {} });
    assert.deepEqual(r.results, ["跑步鞋"]);
    assert.equal(r.ok, false);
  }
});

test("texte déjà français ou vide : aucun appel", async () => {
  const m = mockFetch({});
  const r = await translateToFrench(
    ["Chaussures de course pour les hommes et les femmes", "  ", ""],
    { fetchImpl: m.fn, env: {} },
  );
  assert.equal(m.calls.length, 0);
  assert.equal(r.ok, true);
  assert.equal(looksFrench("Chaussures de course pour les hommes"), true);
  assert.equal(looksFrench("Running shoes for men"), false);
  assert.equal(looksFrench("跑步鞋"), false);
});

test("cache : un texte déjà traduit n’est pas redemandé", async () => {
  const m = mockFetch({
    "https://api.mymemory.translated.net/get": () =>
      json({ responseStatus: 200, responseData: { translatedText: "Noir" } }),
  });
  await translateToFrench(["黑色"], { fetchImpl: m.fn, env: {} });
  const r = await translateToFrench(["黑色"], { fetchImpl: m.fn, env: {} });
  assert.equal(m.calls.length, 1);
  assert.deepEqual(r.results, ["Noir"]);
});

test("découpage des longs textes sans perte et sous la limite d’octets", () => {
  const long = "这是一个很长的句子。".repeat(80) + "End. " + "a".repeat(1200);
  const chunks = chunkByBytes(long, 450);
  assert.ok(chunks.length > 1);
  for (const c of chunks) assert.ok(new TextEncoder().encode(c).length <= 450);
  assert.equal(chunks.join(""), long);
  assert.deepEqual(chunkByBytes("court", 450), ["court"]);
});
