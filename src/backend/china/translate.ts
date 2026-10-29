import type { FetchLike } from "./fetcher.ts";

// Traduction vers le français. Fournisseur choisi par variables d'environnement :
//   DEEPL_API_KEY            -> DeepL (clé gratuite « :fx » ou Pro)
//   GOOGLE_TRANSLATE_API_KEY -> Google Cloud Translation v2
//   (aucune)                 -> MyMemory (gratuit, sans clé, quota quotidien limité, qualité moyenne)
//   MYMEMORY_EMAIL           -> (optionnel) e-mail qui relève le quota MyMemory
// Si la traduction échoue, le texte d'origine est conservé et l'échec est signalé : rien n'est inventé.

export type TranslateEnv = Record<string, string | undefined>;

export type TranslateOptions = {
  fetchImpl?: FetchLike;
  env?: TranslateEnv;
  timeoutMs?: number;
};

export type TranslateOutcome = {
  results: string[];
  /** false si au moins un texte à traduire n'a pas pu l'être. */
  ok: boolean;
  provider: "deepl" | "google" | "mymemory";
};

const CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/;
const FRENCH_HINTS = /\b(le|la|les|des|du|de|et|pour|avec|sans|une|un|est|dans|sur|vous|nous)\b/gi;

export function hasCjk(s: string): boolean {
  return CJK.test(s);
}

/** Heuristique : le texte est-il déjà en français ? (évite des appels inutiles) */
export function looksFrench(s: string): boolean {
  if (CJK.test(s)) return false;
  const hits = s.match(FRENCH_HINTS)?.length ?? 0;
  return hits >= 2;
}

const cache = new Map<string, string>();
const CACHE_MAX = 2000;

function cacheSet(key: string, value: string) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

export function clearTranslationCache() {
  cache.clear();
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** Découpe un texte en morceaux d'au plus `maxBytes` octets UTF-8, aux frontières de phrases. */
export function chunkByBytes(text: string, maxBytes: number): string[] {
  if (byteLength(text) <= maxBytes) return [text];
  const sentences = text.split(/(?<=[。！？.!?;；\n])/u);
  const chunks: string[] = [];
  let cur = "";
  const push = () => {
    if (cur) chunks.push(cur);
    cur = "";
  };
  for (const s of sentences) {
    if (byteLength(s) > maxBytes) {
      push();
      let piece = "";
      for (const ch of Array.from(s)) {
        if (byteLength(piece + ch) > maxBytes) {
          chunks.push(piece);
          piece = "";
        }
        piece += ch;
      }
      cur = piece;
      continue;
    }
    if (byteLength(cur + s) > maxBytes) push();
    cur += s;
  }
  push();
  return chunks;
}

async function postJson(
  fetchImpl: FetchLike,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
): Promise<unknown> {
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function viaDeepL(
  texts: string[],
  key: string,
  f: FetchLike,
  timeoutMs: number,
): Promise<string[]> {
  const base = key.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
  const out: string[] = [];
  for (let i = 0; i < texts.length; i += 40) {
    const batch = texts.slice(i, i + 40);
    const json = (await postJson(
      f,
      `${base}/v2/translate`,
      { authorization: `DeepL-Auth-Key ${key}` },
      { text: batch, target_lang: "FR" },
      timeoutMs,
    )) as { translations?: { text?: string }[] };
    const tr = json.translations;
    if (!Array.isArray(tr) || tr.length !== batch.length)
      throw new Error("DeepL: réponse inattendue");
    for (const t of tr) {
      if (typeof t.text !== "string") throw new Error("DeepL: réponse inattendue");
      out.push(t.text);
    }
  }
  return out;
}

async function viaGoogle(
  texts: string[],
  key: string,
  f: FetchLike,
  timeoutMs: number,
): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100);
    const json = (await postJson(
      f,
      "https://translation.googleapis.com/language/translate/v2",
      { "x-goog-api-key": key },
      { q: batch, target: "fr", format: "text" },
      timeoutMs,
    )) as { data?: { translations?: { translatedText?: string }[] } };
    const tr = json.data?.translations;
    if (!Array.isArray(tr) || tr.length !== batch.length)
      throw new Error("Google: réponse inattendue");
    for (const t of tr) {
      if (typeof t.translatedText !== "string") throw new Error("Google: réponse inattendue");
      out.push(t.translatedText);
    }
  }
  return out;
}

async function myMemoryOne(
  text: string,
  email: string | undefined,
  f: FetchLike,
  timeoutMs: number,
): Promise<string> {
  const source = hasCjk(text) ? "zh-CN" : "en";
  const params = new URLSearchParams({ q: text, langpair: `${source}|fr` });
  if (email) params.set("de", email);
  const res = await f(`https://api.mymemory.translated.net/get?${params.toString()}`, {
    method: "GET",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as {
    responseStatus?: number | string;
    responseData?: { translatedText?: string };
  };
  const out = json.responseData?.translatedText;
  if (Number(json.responseStatus) !== 200 || typeof out !== "string" || !out)
    throw new Error("MyMemory: échec");
  if (/MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID LANGUAGE/i.test(out))
    throw new Error("MyMemory: quota atteint");
  return out;
}

async function viaMyMemory(
  texts: string[],
  email: string | undefined,
  f: FetchLike,
  timeoutMs: number,
): Promise<string[]> {
  const out: string[] = [];
  for (const t of texts) {
    const parts = chunkByBytes(t, 450);
    const translated: string[] = [];
    for (const p of parts) translated.push(await myMemoryOne(p, email, f, timeoutMs));
    out.push(translated.join(""));
  }
  return out;
}

export function pickProvider(env: TranslateEnv): TranslateOutcome["provider"] {
  if (env["DEEPL_API_KEY"]) return "deepl";
  if (env["GOOGLE_TRANSLATE_API_KEY"]) return "google";
  return "mymemory";
}

/**
 * Traduit une liste de textes en français. Les textes vides ou déjà français sont renvoyés tels quels.
 * Ne lève jamais : en cas d'échec, renvoie les originaux avec `ok: false`.
 */
export async function translateToFrench(
  texts: string[],
  opts: TranslateOptions = {},
): Promise<TranslateOutcome> {
  const env = opts.env ?? {};
  const f: FetchLike = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  const timeoutMs = opts.timeoutMs ?? 8000;
  const provider = pickProvider(env);

  const results = [...texts];
  const todo: { index: number; text: string }[] = [];
  texts.forEach((text, index) => {
    const trimmed = text.trim();
    if (!trimmed || looksFrench(trimmed)) return;
    const hit = cache.get(`${provider}|${trimmed}`);
    if (hit !== undefined) results[index] = hit;
    else todo.push({ index, text: trimmed });
  });
  if (todo.length === 0) return { results, ok: true, provider };

  // Dédoublonnage des textes identiques dans un même appel.
  const unique = [...new Set(todo.map((x) => x.text))];
  try {
    let translated: string[];
    if (provider === "deepl")
      translated = await viaDeepL(unique, env["DEEPL_API_KEY"] as string, f, timeoutMs);
    else if (provider === "google")
      translated = await viaGoogle(unique, env["GOOGLE_TRANSLATE_API_KEY"] as string, f, timeoutMs);
    else translated = await viaMyMemory(unique, env["MYMEMORY_EMAIL"], f, timeoutMs);

    const map = new Map<string, string>();
    unique.forEach((u, i) => {
      const t = (translated[i] ?? "").trim();
      if (t) {
        map.set(u, t);
        cacheSet(`${provider}|${u}`, t);
      }
    });
    let ok = true;
    for (const { index, text } of todo) {
      const t = map.get(text);
      if (t) results[index] = t;
      else ok = false;
    }
    return { results, ok, provider };
  } catch {
    return { results, ok: false, provider };
  }
}
