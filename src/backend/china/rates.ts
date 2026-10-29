import type { RateInfo } from "../../lib/china/types.ts";
import type { Clock } from "./cache.ts";
import { RatesError } from "./errors.ts";
import type { FetchLike } from "./fetcher.ts";

// Taux de change vers l'euro, jamais codés en dur.
//  1. Frankfurter (taux de référence de la BCE, sans clé)  https://frankfurter.dev
//  2. open.er-api.com (secours, sans clé)
// Les taux sont indicatifs (taux de référence, pas le taux appliqué par une banque ou un agent).

export type RatesService = {
  getRates(currencies: string[]): Promise<Record<string, RateInfo>>;
};

type Entry = { info: RateInfo; fetchedAtMs: number };

const TTL_MS = 6 * 60 * 60 * 1000;
const STALE_MAX_MS = 7 * 24 * 60 * 60 * 1000;

function validRate(r: unknown): r is number {
  return typeof r === "number" && Number.isFinite(r) && r > 0 && r < 1000;
}

async function getJson(f: FetchLike, url: string, timeoutMs: number): Promise<unknown> {
  const res = await f(url, {
    method: "GET",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function frankfurter(
  from: string,
  f: FetchLike,
  timeoutMs: number,
): Promise<{ rate: number; date: string }> {
  const json = (await getJson(
    f,
    `https://api.frankfurter.dev/v1/latest?base=${from}&symbols=EUR`,
    timeoutMs,
  )) as { date?: unknown; rates?: { EUR?: unknown } };
  const rate = json.rates?.EUR;
  if (!validRate(rate) || typeof json.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(json.date)) {
    throw new Error("Frankfurter: réponse inattendue");
  }
  return { rate, date: json.date };
}

async function erApi(
  from: string,
  f: FetchLike,
  timeoutMs: number,
): Promise<{ rate: number; date: string }> {
  const json = (await getJson(f, `https://open.er-api.com/v6/latest/${from}`, timeoutMs)) as {
    result?: unknown;
    time_last_update_utc?: unknown;
    rates?: { EUR?: unknown };
  };
  const rate = json.rates?.EUR;
  if (json.result !== "success" || !validRate(rate)) throw new Error("er-api: réponse inattendue");
  const d =
    typeof json.time_last_update_utc === "string" ? new Date(json.time_last_update_utc) : null;
  const date = d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : "";
  if (!date) throw new Error("er-api: date manquante");
  return { rate, date };
}

export function createRatesService(
  opts: { fetchImpl?: FetchLike; now?: Clock; timeoutMs?: number } = {},
): RatesService {
  const f: FetchLike = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  const now = opts.now ?? Date.now;
  const timeoutMs = opts.timeoutMs ?? 6000;
  const store = new Map<string, Entry>();
  const inflight = new Map<string, Promise<RateInfo>>();

  async function fetchOne(from: string): Promise<RateInfo> {
    const providers: [string, () => Promise<{ rate: number; date: string }>][] = [
      ["Frankfurter (BCE)", () => frankfurter(from, f, timeoutMs)],
      ["open.er-api.com", () => erApi(from, f, timeoutMs)],
    ];
    for (const [source, run] of providers) {
      try {
        const { rate, date } = await run();
        const t = now();
        const info: RateInfo = {
          from,
          to: "EUR",
          rate,
          date,
          fetchedAt: new Date(t).toISOString(),
          source,
          stale: false,
        };
        store.set(from, { info, fetchedAtMs: t });
        return info;
      } catch {
        // on tente la source suivante
      }
    }
    const old = store.get(from);
    if (old && now() - old.fetchedAtMs < STALE_MAX_MS) return { ...old.info, stale: true };
    throw new RatesError(`Taux de change ${from}→EUR indisponible.`);
  }

  async function one(from: string): Promise<RateInfo> {
    const cached = store.get(from);
    if (cached && now() - cached.fetchedAtMs < TTL_MS) return cached.info;
    const running = inflight.get(from);
    if (running) return running;
    const p = fetchOne(from).finally(() => inflight.delete(from));
    inflight.set(from, p);
    return p;
  }

  return {
    async getRates(currencies) {
      const out: Record<string, RateInfo> = {};
      const wanted = [...new Set(currencies.map((c) => c.toUpperCase()))].filter(
        (c) => c !== "EUR",
      );
      const settled = await Promise.allSettled(wanted.map((c) => one(c)));
      settled.forEach((r, i) => {
        if (r.status === "fulfilled") out[wanted[i] as string] = r.value;
      });
      if (wanted.length > 0 && Object.keys(out).length === 0)
        throw new RatesError("Taux de change indisponibles.");
      return out;
    },
  };
}
