import test from "node:test";
import assert from "node:assert/strict";
import { createRatesService } from "./rates.ts";
import { RatesError } from "./errors.ts";
import { json, mockFetch } from "./test-helpers.ts";

const FF = "https://api.frankfurter.dev/v1/latest";
const ER = "https://open.er-api.com/v6/latest/";
const ffOk =
  (rate = 0.1234, date = "2026-10-27") =>
  () =>
    json({ amount: 1, base: "CNY", date, rates: { EUR: rate } });

test("Frankfurter (BCE) : taux, date de publication et source renvoyés", async () => {
  const m = mockFetch({ [FF]: ffOk() });
  const svc = createRatesService({
    fetchImpl: m.fn,
    now: () => Date.parse("2026-10-27T18:00:00Z"),
  });
  const out = await svc.getRates(["CNY"]);
  assert.deepEqual(out["CNY"], {
    from: "CNY",
    to: "EUR",
    rate: 0.1234,
    date: "2026-10-27",
    fetchedAt: "2026-10-27T18:00:00.000Z",
    source: "Frankfurter (BCE)",
    stale: false,
  });
  assert.match(m.calls[0]?.url ?? "", /base=CNY&symbols=EUR/);
});

test("cache 6 h : pas de nouvel appel ; renouvellement après expiration", async () => {
  let t = Date.parse("2026-10-27T10:00:00Z");
  let rate = 0.12;
  const m = mockFetch({ [FF]: () => json({ date: "2026-10-27", rates: { EUR: rate } }) });
  const svc = createRatesService({ fetchImpl: m.fn, now: () => t });
  await svc.getRates(["CNY"]);
  t += 5 * 3600_000;
  await svc.getRates(["CNY"]);
  assert.equal(m.calls.length, 1);
  t += 2 * 3600_000;
  rate = 0.13;
  const out = await svc.getRates(["CNY"]);
  assert.equal(m.calls.length, 2);
  assert.equal(out["CNY"]?.rate, 0.13);
});

test("appels simultanés dédoublonnés", async () => {
  const m = mockFetch({ [FF]: ffOk() });
  const svc = createRatesService({ fetchImpl: m.fn });
  await Promise.all([svc.getRates(["CNY"]), svc.getRates(["CNY"]), svc.getRates(["cny"])]);
  assert.equal(m.calls.length, 1);
});

test("secours : si Frankfurter échoue, open.er-api.com prend le relais", async () => {
  const m = mockFetch({
    [FF]: () => new Response("boom", { status: 503 }),
    [ER]: () =>
      json({
        result: "success",
        time_last_update_utc: "Tue, 27 Oct 2026 00:02:31 +0000",
        rates: { EUR: 0.125 },
      }),
  });
  const out = await createRatesService({ fetchImpl: m.fn }).getRates(["CNY"]);
  assert.equal(out["CNY"]?.rate, 0.125);
  assert.equal(out["CNY"]?.date, "2026-10-27");
  assert.equal(out["CNY"]?.source, "open.er-api.com");
});

test("toutes les sources en panne : taux périmé réutilisé (marqué stale), sinon erreur", async () => {
  let t = Date.parse("2026-10-27T10:00:00Z");
  let up = true;
  const m = mockFetch({
    [FF]: () =>
      up
        ? json({ date: "2026-10-27", rates: { EUR: 0.12 } })
        : Promise.reject(new TypeError("fetch failed")),
    [ER]: () => new Response("x", { status: 500 }),
  });
  const svc = createRatesService({ fetchImpl: m.fn, now: () => t });
  await svc.getRates(["CNY"]);
  up = false;
  t += 10 * 3600_000;
  const out = await svc.getRates(["CNY"]);
  assert.equal(out["CNY"]?.stale, true);
  assert.equal(out["CNY"]?.rate, 0.12);

  const none = createRatesService({
    fetchImpl: mockFetch({
      [FF]: () => Promise.reject(new Error("x")),
      [ER]: () => Promise.reject(new Error("x")),
    }).fn,
  });
  await assert.rejects(none.getRates(["CNY"]), RatesError);
});

test("taux aberrants ou réponses invalides rejetés", async () => {
  for (const body of [
    { date: "2026-10-27", rates: { EUR: 0 } },
    { date: "2026-10-27", rates: { EUR: -1 } },
    { date: "2026-10-27", rates: { EUR: "abc" } },
    { date: "hier", rates: { EUR: 0.1 } },
    { date: "2026-10-27", rates: {} },
    { rates: { EUR: 1e9 } },
  ]) {
    const svc = createRatesService({
      fetchImpl: mockFetch({ [FF]: () => json(body), [ER]: () => json({ result: "error" }) }).fn,
    });
    await assert.rejects(svc.getRates(["CNY"]), RatesError, JSON.stringify(body));
  }
});

test("EUR ignoré ; plusieurs devises ; échec partiel toléré", async () => {
  const m = mockFetch({
    "https://api.frankfurter.dev/v1/latest?base=CNY": ffOk(0.12),
    "https://api.frankfurter.dev/v1/latest?base=USD": () => new Response("x", { status: 500 }),
    [ER]: () => new Response("x", { status: 500 }),
  });
  const out = await createRatesService({ fetchImpl: m.fn }).getRates(["EUR", "CNY", "USD"]);
  assert.deepEqual(Object.keys(out), ["CNY"]);
  assert.deepEqual(await createRatesService({ fetchImpl: m.fn }).getRates(["EUR"]), {});
});

test("délai dépassé sur la première source -> bascule sur la seconde", async () => {
  const m = mockFetch({
    [FF]: () => new Promise<Response>((r) => setTimeout(() => r(json({})), 500)),
    [ER]: () =>
      json({
        result: "success",
        time_last_update_utc: "Tue, 27 Oct 2026 00:02:31 +0000",
        rates: { EUR: 0.11 },
      }),
  });
  const out = await createRatesService({ fetchImpl: m.fn, timeoutMs: 50 }).getRates(["CNY"]);
  assert.equal(out["CNY"]?.rate, 0.11);
});
