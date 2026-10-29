import test from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter, createTtlCache } from "./cache.ts";

test("cache TTL : expiration et éviction du plus ancien", () => {
  let t = 0;
  const c = createTtlCache<string>({ ttlMs: 100, max: 2, now: () => t });
  c.set("a", "1");
  c.set("b", "2");
  c.set("c", "3");
  assert.equal(c.get("a"), undefined);
  assert.equal(c.get("b"), "2");
  t = 101;
  assert.equal(c.get("b"), undefined);
  assert.equal(c.size(), 1);
});

test("limiteur : fenêtre glissante par clé", () => {
  let t = 0;
  const l = createRateLimiter({ limit: 3, windowMs: 1000, now: () => t });
  assert.deepEqual([l.take("a"), l.take("a"), l.take("a"), l.take("a")], [true, true, true, false]);
  assert.equal(l.take("b"), true, "les clients sont indépendants");
  t = 1001;
  assert.equal(l.take("a"), true);
});
