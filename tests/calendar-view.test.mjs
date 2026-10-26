import test from "node:test";
import assert from "node:assert/strict";
import { calendarDays } from "../lib/client/calendar.mjs";
import { computeSlots } from "../server/lib/booking/domain.mjs";
import { initialSchedule } from "../server/lib/server/api.mjs";
test("calendar displays every bookable date through the last partial horizon day across timezones", () => {
  const now = Date.parse("2026-10-26T17:00:00Z"),
    slots = computeSlots(initialSchedule(), [], now, 30);
  for (const tz of ["America/New_York", "Asia/Shanghai", "Pacific/Honolulu"]) {
    const dates = calendarDays(now, tz);
    for (const slot of slots) {
      const date = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(slot.start));
      assert.ok(dates.includes(date), `${tz}: missing ${date}`);
    }
  }
});
