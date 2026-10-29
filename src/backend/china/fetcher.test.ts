import test from "node:test";
import assert from "node:assert/strict";
import { ImportError } from "./errors.ts";
import { safeFetchHtml } from "./fetcher.ts";
import { html, mockFetch, never, redirect } from "./test-helpers.ts";

const U = (s: string) => new URL(s);
const TB = "https://item.taobao.com/item.htm?id=612345678901";

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    assert.ok(e instanceof ImportError, `erreur inattendue : ${String(e)}`);
    return e.code;
  }
  return "NO_ERROR";
}

test("récupère une page valide (requête manuelle, UA honnête, pas de credentials)", async () => {
  const m = mockFetch({ [TB]: () => html("<html>ok</html>") });
  const r = await safeFetchHtml(U(TB), { fetchImpl: m.fn });
  assert.equal(r.html, "<html>ok</html>");
  assert.equal(m.calls.length, 1);
  assert.equal(m.calls[0]?.init?.redirect, "manual");
  const headers = m.calls[0]?.init?.headers as Record<string, string>;
  assert.match(headers["user-agent"] ?? "", /ResellFlowImporter/);
  assert.ok(!("cookie" in headers) && !("authorization" in headers));
});

test("en-têtes HTTP valides : ASCII uniquement (sinon fetch lève « Cannot convert argument to a ByteString »)", async () => {
  const m = mockFetch({ [TB]: () => html("<html>ok</html>") });
  await safeFetchHtml(U(TB), { fetchImpl: m.fn });
  const headers = m.calls[0]?.init?.headers as Record<string, string>;
  for (const [name, value] of Object.entries(headers)) {
    assert.match(value, /^[\x20-\x7e]*$/, `en-tête « ${name} » contient un caractère non ASCII`);
  }
  assert.doesNotThrow(() => new Headers(headers)); // même contrôle que le vrai fetch
});

test("suit un lien court vers un domaine autorisé", async () => {
  const m = mockFetch({
    "https://e.tb.cn/h.abc": () => redirect("https://m.intl.taobao.com/detail?id=612345678901"),
    "https://m.intl.taobao.com/": () => html("<html>final</html>"),
  });
  const r = await safeFetchHtml(U("https://e.tb.cn/h.abc"), { fetchImpl: m.fn });
  assert.equal(r.finalUrl.hostname, "m.intl.taobao.com");
  assert.equal(m.calls.length, 2);
});

test("SSRF : une redirection vers un hôte interne ou non autorisé est refusée AVANT toute requête", async () => {
  const targets = [
    "http://169.254.169.254/latest/meta-data/",
    "http://localhost:8080/admin",
    "http://127.0.0.1/",
    "http://10.0.0.5/",
    "https://evil.example.com/",
    "https://taobao.com.evil.com/",
    "file:///etc/passwd",
  ];
  for (const t of targets) {
    const m = mockFetch({ [TB]: () => redirect(t) });
    const c = await code(safeFetchHtml(U(TB), { fetchImpl: m.fn }));
    assert.ok(["UNSUPPORTED_PLATFORM", "INVALID_URL"].includes(c), `${t} -> ${c}`);
    assert.equal(m.calls.length, 1, `aucune requête ne doit partir vers ${t}`);
  }
});

test("redirection relative suivie ; trop de redirections refusées", async () => {
  const ok = mockFetch({
    [TB]: () => redirect("/item2.htm?id=612345678901"),
    "https://item.taobao.com/item2.htm": () => html("fin"),
  });
  assert.equal((await safeFetchHtml(U(TB), { fetchImpl: ok.fn })).html, "fin");

  const loop = mockFetch({ "https://item.taobao.com/": () => redirect("/loop") });
  assert.equal(
    await code(safeFetchHtml(U(TB), { fetchImpl: loop.fn, maxRedirects: 3 })),
    "TOO_MANY_REDIRECTS",
  );
  assert.equal(loop.calls.length, 4);
});

test("lien de départ non autorisé refusé", async () => {
  const m = mockFetch({});
  assert.equal(
    await code(safeFetchHtml(U("http://169.254.169.254/"), { fetchImpl: m.fn })),
    "INVALID_URL",
  );
  assert.equal(
    await code(safeFetchHtml(U("https://example.com/"), { fetchImpl: m.fn })),
    "UNSUPPORTED_PLATFORM",
  );
  assert.equal(m.calls.length, 0);
});

test("blocages et erreurs HTTP", async () => {
  for (const status of [401, 403, 429]) {
    const m = mockFetch({ [TB]: () => html("no", status) });
    assert.equal(await code(safeFetchHtml(U(TB), { fetchImpl: m.fn })), "BLOCKED", String(status));
  }
  assert.equal(
    await code(safeFetchHtml(U(TB), { fetchImpl: mockFetch({ [TB]: () => html("", 404) }).fn })),
    "HTTP_ERROR",
  );
  assert.equal(
    await code(safeFetchHtml(U(TB), { fetchImpl: mockFetch({ [TB]: () => html("", 502) }).fn })),
    "HTTP_ERROR",
  );
  // redirection sans Location
  assert.equal(
    await code(
      safeFetchHtml(U(TB), {
        fetchImpl: mockFetch({ [TB]: () => new Response(null, { status: 302 }) }).fn,
      }),
    ),
    "HTTP_ERROR",
  );
});

test("erreurs réseau et délai dépassé", async () => {
  const down = mockFetch({ [TB]: () => Promise.reject(new TypeError("fetch failed")) });
  assert.equal(await code(safeFetchHtml(U(TB), { fetchImpl: down.fn })), "NETWORK");
  const slow = mockFetch({ [TB]: never });
  assert.equal(await code(safeFetchHtml(U(TB), { fetchImpl: slow.fn, timeoutMs: 60 })), "TIMEOUT");
});

test("contenu non HTML et page trop volumineuse refusés", async () => {
  const pdf = mockFetch({
    [TB]: () => new Response("%PDF", { headers: { "content-type": "application/pdf" } }),
  });
  assert.equal(await code(safeFetchHtml(U(TB), { fetchImpl: pdf.fn })), "BAD_CONTENT");

  const big = mockFetch({ [TB]: () => html("x".repeat(5000)) });
  assert.equal(
    await code(safeFetchHtml(U(TB), { fetchImpl: big.fn, maxBytes: 1000 })),
    "TOO_LARGE",
  );

  const declared = mockFetch({ [TB]: () => html("x", 200, { "content-length": "99999999" }) });
  assert.equal(
    await code(safeFetchHtml(U(TB), { fetchImpl: declared.fn, maxBytes: 1000 })),
    "TOO_LARGE",
  );
});

test("décodage : UTF-8 par défaut, charset déclaré respecté (GBK)", async () => {
  const utf8 = mockFetch({ [TB]: () => html("<title>淘宝</title>") });
  assert.match((await safeFetchHtml(U(TB), { fetchImpl: utf8.fn })).html, /淘宝/);

  const gbkBytes = new Uint8Array([0xd6, 0xd0, 0xce, 0xc4]); // « 中文 » en GBK
  const gbk = mockFetch({
    [TB]: () => new Response(gbkBytes, { headers: { "content-type": "text/html; charset=gbk" } }),
  });
  assert.equal((await safeFetchHtml(U(TB), { fetchImpl: gbk.fn })).html, "中文");
});
