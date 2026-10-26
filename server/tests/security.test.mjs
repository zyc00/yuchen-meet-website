import test from "node:test";
import assert from "node:assert/strict";
import { memoryDb } from "./helpers.mjs";
import {
  requireSameOrigin,
  readBoundedJson,
  encrypt,
  decrypt,
  ownerIdentity,
  consumeState,
  rateLimit,
  verifyCapability,
} from "../lib/booking/security.mjs";
import { digest } from "../lib/booking/store.mjs";
test("cross-origin/missing origin and oversized JSON rejected", async () => {
  for (const origin of [null, "https://evil.test"])
    assert.throws(
      () =>
        requireSameOrigin(
          new Request("https://meet.test/api/book", {
            method: "POST",
            headers: origin ? { origin } : {},
          }),
          ["https://meet.test"],
        ),
      { status: 403 },
    );
  requireSameOrigin(
    new Request("https://meet.test/api/book", {
      method: "POST",
      headers: { origin: "https://meet.test" },
    }),
    ["https://meet.test"],
  );
  await assert.rejects(
    readBoundedJson(
      new Request("https://meet.test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: " ".repeat(9000),
      }),
    ),
    { status: 413 },
  );
});
test("AES-GCM token encryption and capability validation", async () => {
  const key = "01".repeat(32),
    value = await encrypt("secret token", key);
  assert.ok(!value.includes("secret"));
  assert.equal(await decrypt(value, key), "secret token");
  await assert.rejects(decrypt(value, "02".repeat(32)));
  assert.equal(
    await verifyCapability(
      { capHash: await digest("a".repeat(64)) },
      "a".repeat(64),
    ),
    true,
  );
  assert.equal(
    await verifyCapability(
      { capHash: await digest("a".repeat(64)) },
      "b".repeat(64),
    ),
    false,
  );
});
test("OAuth state single-use, owner-bound and expires; limits shared across calls", async () => {
  const db = memoryDb();
  await db
    .prepare("INSERT INTO oauth_states VALUES (?,?,?,?)")
    .bind("state", "owner", "verifier", 100)
    .run();
  assert.equal(await consumeState(db, "state", "other", 50), null);
  assert.equal(
    (await consumeState(db, "state", "owner", 50)).verifier,
    "verifier",
  );
  assert.equal(await consumeState(db, "state", "owner", 50), null);
  await db
    .prepare("INSERT INTO oauth_states VALUES (?,?,?,?)")
    .bind("old", "owner", "v", 40)
    .run();
  assert.equal(await consumeState(db, "old", "owner", 50), null);
  await rateLimit(db, "visitor", 2, 60, 1);
  await rateLimit(db, "visitor", 2, 60, 2);
  await assert.rejects(rateLimit(db, "visitor", 2, 60, 3), { status: 429 });
  await rateLimit(db, "visitor", 2, 60, 70);
});
