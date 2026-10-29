import test from "node:test";
import assert from "node:assert/strict";
import { checkImportUrl, extractUrlCandidate } from "./url.ts";

function platformOf(raw: string) {
  const r = checkImportUrl(raw);
  return r.ok ? r.platform.id : r.code;
}

test("détecte automatiquement chaque plateforme", () => {
  assert.equal(platformOf("https://item.taobao.com/item.htm?id=612345678901"), "taobao");
  assert.equal(platformOf("https://detail.tmall.com/item.htm?id=612345678901&spm=a1"), "tmall");
  assert.equal(platformOf("https://weidian.com/item.html?itemID=1234567890"), "weidian");
  assert.equal(platformOf("https://shop123.v.weidian.com/item.html?itemID=1234567890"), "weidian");
  assert.equal(platformOf("https://detail.1688.com/offer/712345678901.html"), "1688");
  assert.equal(platformOf("https://www.aliexpress.com/item/1005001234567890.html"), "aliexpress");
  assert.equal(
    platformOf("https://fr.aliexpress.com/item/1005001234567890.html?spm=x"),
    "aliexpress",
  );
});

test("extrait l’identifiant produit", () => {
  const t = checkImportUrl("https://item.taobao.com/item.htm?spm=a21&id=612345678901&skuId=1");
  assert.ok(t.ok && t.itemId === "612345678901");
  const w = checkImportUrl("https://weidian.com/item.html?itemID=1234567890");
  assert.ok(w.ok && w.itemId === "1234567890");
  const a = checkImportUrl("https://detail.1688.com/offer/712345678901.html?x=1");
  assert.ok(a.ok && a.itemId === "712345678901");
  const x = checkImportUrl("https://www.aliexpress.com/item/1005001234567890.html");
  assert.ok(x.ok && x.itemId === "1005001234567890");
});

test("reconnaît les liens courts (redirection à suivre)", () => {
  const r = checkImportUrl("https://e.tb.cn/h.abc123");
  assert.ok(r.ok && r.isShort && r.platform.id === "taobao");
  const s = checkImportUrl("https://a.aliexpress.com/_abc");
  assert.ok(s.ok && s.isShort && s.platform.id === "aliexpress");
});

test("extrait le lien d’un texte de partage chinois", () => {
  const share = "【淘宝】https://e.tb.cn/h.abc123?tk=XYZ 「超好看的鞋子」点击链接直接打开";
  assert.equal(extractUrlCandidate(share), "https://e.tb.cn/h.abc123?tk=XYZ");
  assert.equal(platformOf(share), "taobao");
});

test("accepte un lien sans schéma et force https", () => {
  const r = checkImportUrl("item.taobao.com/item.htm?id=612345678901");
  assert.ok(r.ok);
  assert.equal(r.url.protocol, "https:");
  const h = checkImportUrl("http://item.taobao.com/item.htm?id=612345678901");
  assert.ok(h.ok && h.url.protocol === "https:");
});

test("rejette les entrées vides et invalides", () => {
  assert.equal(platformOf(""), "EMPTY_INPUT");
  assert.equal(platformOf("   "), "EMPTY_INPUT");
  assert.equal(platformOf("pas un lien"), "INVALID_URL");
  assert.equal(platformOf("javascript:alert(1)"), "INVALID_URL");
  assert.equal(platformOf("file:///etc/passwd"), "INVALID_URL");
  assert.equal(platformOf("ftp://item.taobao.com/x"), "INVALID_URL");
  assert.equal(platformOf("https://item.taobao.com/" + "a".repeat(3000)), "INVALID_URL");
});

test("SSRF : refuse hôtes internes, IP, identifiants, ports, sosies de domaine", () => {
  const bad = [
    "http://localhost/item.htm?id=123456",
    "http://127.0.0.1/item.htm?id=123456",
    "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.1/",
    "http://192.168.1.1/",
    "http://2130706433/",
    "http://0x7f.0.0.1/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "https://taobao.com@evil.com/item.htm?id=123456",
    "https://user:pw@item.taobao.com/item.htm?id=123456",
    "https://item.taobao.com:8080/item.htm?id=123456",
    "https://evil-taobao.com/item.htm?id=123456",
    "https://taobao.com.evil.com/item.htm?id=123456",
    "https://evil.com/?u=https://item.taobao.com/item.htm?id=123456",
  ];
  for (const u of bad) {
    const r = checkImportUrl(u);
    assert.equal(r.ok, false, `devrait être refusé : ${u}`);
  }
});

test("plateforme non gérée -> UNSUPPORTED_PLATFORM", () => {
  assert.equal(platformOf("https://www.amazon.fr/dp/B000000000"), "UNSUPPORTED_PLATFORM");
  assert.equal(platformOf("https://www.temu.com/x.html"), "UNSUPPORTED_PLATFORM");
});
