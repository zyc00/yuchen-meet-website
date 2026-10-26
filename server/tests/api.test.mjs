import { createHash } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { memoryDb } from "./helpers.mjs";
import { handleApi } from "../lib/server/api.mjs";
const origin = "https://meet.test";
const adminEnv = {ADMIN_USERNAME:"owner",ADMIN_PASSWORD_HASH:createHash("sha256").update("test-password").digest("hex")};
const adminHeaders = {authorization:"Basic "+Buffer.from("owner:test-password").toString("base64")};
const request = (path, options = {}) => new Request(origin + path, options);
test("unconfigured production has no slots or personal Zoom; demo cannot run on public host", async () => {
  const response = await handleApi(request("/api/availability"), {
    DB: memoryDb(),
    DEMO_MODE: "1",
    MEETING_URL: "https://secret.example.com",
  });
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.ok(!text.includes("secret.example.com"));
  const data = JSON.parse(text);
  assert.equal(data.ready, false);
  assert.deepEqual(data.slots, []);
  assert.equal(data.demo, undefined);
});
test("public cannot read owner details or connect Google; closed booking cannot write", async () => {
  const env = {
    DB: memoryDb(),
    SITE_ORIGIN: origin,
    ...adminEnv,
  };
  assert.equal((await handleApi(request("/api/admin"), env)).status, 401);
  assert.equal(
    (
      await handleApi(
        request("/api/google/start", { method: "POST", headers: { origin } }),
        env,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await handleApi(
        request("/api/book", {
          method: "POST",
          headers: { origin, "Content-Type": "application/json" },
          body: "{}",
        }),
        env,
      )
    ).status,
    503,
  );
  assert.equal(
    (
      await handleApi(
        request("/api/book", {
          method: "POST",
          headers: { origin: "https://evil.test" },
        }),
        env,
      )
    ).status,
    403,
  );
});
test("owner identity is pinned; settings persist without opening booking before OAuth", async () => {
  const env = {
      DB: memoryDb(),
      SITE_ORIGIN: origin,
      ...adminEnv,
    },
    headers = {
      ...adminHeaders,
      origin,
      "Content-Type": "application/json",
    };
  assert.equal(
    (await handleApi(request("/api/admin", { headers }), env)).status,
    200,
  );
  assert.equal(
    (
      await handleApi(
        request("/api/admin", {
          headers: { ...headers, authorization: "Basic "+Buffer.from("other:test-password").toString("base64") },
        }),
        {...env, ADMIN_USERNAME:"other"},
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await handleApi(
        request("/api/admin/settings", {
          method: "POST",
          headers,
          body: JSON.stringify({
            enabled: true,
            timezone: "America/New_York",
            hours: { 1: [["09:00", "17:00"]] },
            excludedDates: [],
          }),
        }),
        env,
      )
    ).status,
    200,
  );
  assert.equal(
    (await (await handleApi(request("/api/availability"), env)).json()).ready,
    false,
  );
});
test("approved weekly hours are every day 10:00–23:00 New York", async () => {
  const response = await handleApi(
    request("/api/admin", {
      headers: {
        ...adminHeaders,
      },
    }),
    { DB: memoryDb(), ...adminEnv },
  );
  const { settings } = await response.json();
  assert.equal(settings.timezone, "America/New_York");
  for (let day = 0; day < 7; day++)
    assert.deepEqual(settings.hours[day], [["10:00", "23:00"]]);
});
test("loopback fixture mode never accepts a real booking write", async () => {
  const response = await handleApi(
    new Request("http://localhost:5173/api/book", {
      method: "POST",
      headers: {
        origin: "http://localhost:5173",
        "Content-Type": "application/json",
      },
      body: "{}",
    }),
    { DEMO_MODE: "1" },
  );
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "preview");
});
test("confirmed idempotent replay remains recoverable after owner pauses/disconnects", async () => {
  const { createStore } = await import("../lib/booking/store.mjs");
  const { bookMeeting } = await import("../lib/booking/service.mjs");
  const { initialSchedule } = await import("../lib/server/api.mjs");
  const db = memoryDb(),
    store = createStore(db),
    now = Date.parse("2026-10-26T12:50:00Z");
  const input = {
    name: "Alice",
    email: "alice@example.com",
    topic: "Research",
    start: "2026-10-26T14:00:00Z",
    duration: 30,
    timezone: "America/New_York",
    key: crypto.randomUUID(),
    token: crypto.randomUUID() + crypto.randomUUID(),
  };
  const created = await bookMeeting(input, {
    store,
    settings: initialSchedule(),
    now,
    zoomUrl: "https://zoom.test",
    provider: {
      busy: async () => [],
      createEvent: async (b) => ({ id: b.eventId }),
      getEvent: async () => null,
    },
  });
  await store.putSetting("schedule", { ...initialSchedule(), enabled: false });
  const response = await handleApi(
    request("/api/book", {
      method: "POST",
      headers: { origin, "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    { DB: db, SITE_ORIGIN: origin, MEETING_URL: "https://zoom.test" },
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).id, created.id);
  const bad = await handleApi(
    request("/api/book", {
      method: "POST",
      headers: { origin, "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, token: "a".repeat(64) }),
    }),
    { DB: db, SITE_ORIGIN: origin },
  );
  assert.equal(bad.status, 409);
});
test("closed availability still cleans old completed records; owner sees past pending writes", async () => {
  const { createStore } = await import("../lib/booking/store.mjs");
  const db = memoryDb(),
    store = createStore(db),
    now = Date.now(),
    old = now - 100 * 86400000;
  const make = (id, offset) => ({
    id,
    eventId: "b" + id,
    key: id.repeat(32),
    fingerprint: "fingerprint",
    capHash: "hash",
    created: old,
    start: new Date(old + offset).toISOString(),
    end: new Date(old + offset + 1800000).toISOString(),
    name: "Pending visitor",
    email: "preview@example.com",
  });
  await store.reserve(make("a", 0));
  await store.markFailed("a");
  await store.reserve(make("b", 3600000));
  await handleApi(request("/api/availability"), { DB: db });
  assert.equal(await store.getBooking("a"), null);
  assert.equal((await store.getBooking("b")).status, "pending");
  const response = await handleApi(
    request("/api/admin", {
      headers: {
        ...adminHeaders,
      },
    }),
    { DB: db, ...adminEnv },
  );
  assert.equal((await response.json()).pending[0].id, "b");
});
