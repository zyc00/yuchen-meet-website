import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultSettings,
  validateSettings,
  computeSlots,
  validateBooking,
  calendarInvite,
} from "../lib/booking/domain.mjs";
const settings = (hours = { 1: [["09:00", "17:00"]] }) => ({
  ...defaultSettings(),
  enabled: true,
  hours,
});
const now = Date.parse("2026-10-26T12:50:00Z");
test("unset hours are closed; no 24-hour notice; elapsed starts excluded", () => {
  assert.deepEqual(computeSlots(defaultSettings(), [], now, 30), []);
  const slots = computeSlots(settings(), [], now, 30);
  assert.equal(slots[0].start, "2026-10-26T13:00:00.000Z");
  assert.ok(
    computeSlots(settings(), [], Date.parse(slots[0].start), 30).every(
      (s) => Date.parse(s.start) > Date.parse(slots[0].start),
    ),
  );
});
test("interval overlap and closing boundary for 30/60 minutes", () => {
  const busy = [{ start: "2026-10-26T13:30:00Z", end: "2026-10-26T14:00:00Z" }];
  assert.equal(
    computeSlots(settings(), busy, now, 60)[0].start,
    "2026-10-26T14:00:00.000Z",
  );
  assert.equal(
    computeSlots(settings(), busy, now, 30)[0].start,
    "2026-10-26T13:00:00.000Z",
  );
  const sameDay = computeSlots(settings(), [], now, 60).filter((s) =>
    s.start.startsWith("2026-10-26"),
  );
  assert.equal(sameDay.at(-1).end, "2026-10-26T21:00:00.000Z");
});
test("DST handles missing/repeated wall times by preserving absolute instants", () => {
  const s = settings({ 0: [["01:00", "04:00"]] });
  const spring = computeSlots(
    s,
    [],
    Date.parse("2026-03-08T05:00:00Z"),
    30,
  ).filter((s) => s.start.startsWith("2026-03-08"));
  assert.equal(spring.length, 4);
  const fall = computeSlots(
    s,
    [],
    Date.parse("2026-11-01T04:00:00Z"),
    30,
  ).filter((s) => s.start.startsWith("2026-11-01"));
  assert.equal(fall.length, 8);
  assert.equal(new Set(fall.map((s) => s.start)).size, 8);
});
test("settings reject invalid timezone, intervals, dates and durations", () => {
  assert.throws(() =>
    validateSettings({ ...settings(), timezone: "Not/a_zone" }),
  );
  assert.throws(() => validateSettings(settings({ 1: [["17:00", "09:00"]] })));
  assert.throws(() =>
    validateSettings({ ...settings(), excludedDates: ["2026-02-30"] }),
  );
  assert.throws(() => computeSlots(settings(), [], now, 45));
});
test("booking validation checks exact instant, email and future availability", () => {
  const input = {
    name: "Alice",
    email: "alice@example.com",
    topic: "Robotics",
    start: "2026-10-26T13:00:00Z",
    duration: 30,
    timezone: "Asia/Shanghai",
    key: crypto.randomUUID(),
    token: crypto.randomUUID() + crypto.randomUUID(),
  };
  assert.equal(validateBooking(input, settings(), now).duration, 30);
  for (const bad of [
    { email: "a\n@b.c" },
    { duration: 45 },
    { start: "2026-10-26T13:01:00Z" },
    { name: " " },
    { timezone: "bad" },
  ])
    assert.throws(() => validateBooking({ ...input, ...bad }, settings(), now));
});
test("ICS escapes text and folds lines without injected properties", () => {
  const ics = calendarInvite(
    {
      id: "abc",
      start: "2026-10-26T13:00:00Z",
      end: "2026-10-26T13:30:00Z",
      name: "Alice\r\nATTENDEE:evil",
      topic: "a,b;c\\d\n" + "中文".repeat(50),
      created: now,
    },
    "https://zoom.us/j/123",
  );
  assert.ok(!ics.includes("\r\nATTENDEE:evil"));
  assert.ok(ics.includes("a\\,b\\;c\\\\d\\n"));
  for (const line of ics.split("\r\n"))
    assert.ok(Buffer.byteLength(line) <= 75);
});
