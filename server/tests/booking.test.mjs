import test from "node:test";
import assert from "node:assert/strict";
import { memoryDb } from "./helpers.mjs";
import { createStore } from "../lib/booking/store.mjs";
import { bookMeeting, reconcileBooking } from "../lib/booking/service.mjs";
import { defaultSettings } from "../lib/booking/domain.mjs";

const now = Date.parse("2026-10-26T12:50:00Z"),
  settings = {
    ...defaultSettings(),
    enabled: true,
    hours: { 1: [["09:00", "17:00"]] },
  };
const input = (extra = {}) => ({
  name: "Alice",
  email: "alice@example.com",
  topic: "Research",
  start: "2026-10-26T13:00:00Z",
  duration: 60,
  timezone: "Asia/Shanghai",
  key: crypto.randomUUID(),
  token: crypto.randomUUID() + crypto.randomUUID(),
  ...extra,
});
function setup(
  provider = {
    busy: async () => [],
    createEvent: async (b) => ({ id: b.eventId, status: "confirmed" }),
    getEvent: async () => null,
  },
) {
  return {
    settings,
    now,
    zoomUrl: "https://zoom.us/j/test",
    store: createStore(memoryDb()),
    provider,
  };
}
test("atomic overlapping concurrent bookings have one winner", async () => {
  const c = setup();
  const results = await Promise.allSettled([
    bookMeeting(input(), c),
    bookMeeting(input({ start: "2026-10-26T13:30:00Z", duration: 30 }), c),
  ]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(results.find((x) => x.status === "rejected").reason.status, 409);
});
test("same idempotency key replays; changed content/token cannot access it", async () => {
  let calls = 0;
  const c = setup();
  c.provider.createEvent = async (b) => {
    calls++;
    return { id: b.eventId };
  };
  const a = input();
  const first = await bookMeeting(a, c);
  assert.equal(
    (await bookMeeting(a, { ...c, now: now + 2 * 86400000 })).id,
    first.id,
  );
  assert.equal(calls, 1);
  await assert.rejects(bookMeeting({ ...a, topic: "different" }, c), {
    status: 409,
  });
  await assert.rejects(bookMeeting({ ...a, token: "a".repeat(64) }, c), {
    status: 409,
  });
});
test("known rejection frees reservation; uncertain outcome blocks and recovers", async () => {
  const c = setup();
  c.provider.createEvent = async () => {
    throw Object.assign(new Error("Rejected"), { definitive: true });
  };
  await assert.rejects(bookMeeting(input(), c));
  assert.equal((await c.store.listBlocking(now, now + 86400000)).length, 0);
  let saved;
  c.provider.createEvent = async (b) => {
    saved = b;
    throw new Error("timeout");
  };
  const b = await bookMeeting(input(), c);
  assert.equal(b.status, "pending");
  assert.equal((await c.store.listBlocking(now, now + 86400000)).length, 1);
  await assert.rejects(bookMeeting(input(), c), { status: 409 });
  assert.equal((await reconcileBooking(b, c)).status, "pending");
  c.provider.getEvent = async (id) => ({ id, status: "confirmed" });
  const recovered = await reconcileBooking(b, c);
  assert.equal(recovered.status, "confirmed");
  assert.equal(recovered.eventId, saved.eventId);
});
test("fresh Google busy prevents stale slot booking", async () => {
  const c = setup();
  c.provider.busy = async () => [
    { start: "2026-10-26T13:30:00Z", end: "2026-10-26T14:00:00Z" },
  ];
  await assert.rejects(bookMeeting(input(), c), { status: 409 });
  assert.equal((await c.store.listBlocking(now, now + 86400000)).length, 0);
});
test("Google changes to start/end update the actual durable interval and preserve replay identity", async () => {
  const c = setup(),
    a = input(),
    b = await bookMeeting(a, c);
  const next = await c.store.updateInterval(b, b.start, "2026-10-26T13:30:00Z");
  assert.equal(next.duration, 30);
  assert.equal(next.end, "2026-10-26T13:30:00Z");
  assert.equal(next.fingerprint, b.fingerprint);
  const second = await bookMeeting(
    input({ start: "2026-10-26T13:30:00Z", duration: 30 }),
    c,
  );
  assert.equal(second.status, "confirmed");
});
