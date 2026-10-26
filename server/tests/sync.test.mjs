import test from "node:test";
import assert from "node:assert/strict";
import { syncReservations } from "../lib/booking/sync.mjs";
test("batch sync uses one listing for many bookings and retains pending writes", async () => {
  const bookings = Array.from({ length: 100 }, (_, i) => ({
    id: String(i),
    eventId: `b${String(i).padStart(5, "0")}`,
    status: "confirmed",
    start: "2026-10-26T14:00:00Z",
    end: "2026-10-26T14:30:00Z",
  }));
  bookings.push({
    id: "pending",
    eventId: "bfffff",
    status: "pending",
    start: "2026-10-26T15:00:00Z",
    end: "2026-10-26T15:30:00Z",
  });
  let lists = 0,
    gets = 0;
  const provider = {
    listManagedEvents: async () => {
      lists++;
      return bookings
        .filter((b) => b.status === "confirmed")
        .map((b) => ({
          id: b.eventId,
          start: { dateTime: b.start },
          end: { dateTime: b.end },
        }));
    },
    getEvent: async () => {
      gets++;
      return null;
    },
  };
  const result = await syncReservations(
    bookings,
    { provider, store: {} },
    0,
    1,
  );
  assert.equal(lists, 1);
  assert.equal(gets, 0);
  assert.equal(result.length, 101);
});
test("missing batch entries require individual verification; changed end updates reservation", async () => {
  const a = {
      id: "a",
      eventId: "b00001",
      status: "confirmed",
      start: "2026-10-26T14:00:00Z",
      end: "2026-10-26T15:00:00Z",
    },
    pending = { ...a, id: "p", status: "pending" };
  let updated,
    cancelled = false;
  const context = {
    provider: {
      listManagedEvents: async () => [],
      getEvent: async () => ({
        id: a.eventId,
        start: { dateTime: a.start },
        end: { dateTime: "2026-10-26T14:30:00Z" },
      }),
    },
    store: {
      updateInterval: async (b, start, end) => {
        updated = { ...b, start, end };
        return updated;
      },
      setStatus: async () => {
        cancelled = true;
      },
    },
  };
  const result = await syncReservations([a, pending], context, 0, 1);
  assert.equal(result[0].end, "2026-10-26T14:30:00Z");
  assert.equal(result[1].end, pending.end);
  assert.equal(cancelled, false);
  assert.ok(updated);
  context.provider.getEvent = async () => null;
  await syncReservations([a], context, 0, 1);
  assert.equal(cancelled, true);
});
test("failed listing never releases any held interval", async () => {
  let touched = false;
  await assert.rejects(
    syncReservations(
      [{ id: "a", status: "confirmed" }],
      {
        provider: {
          listManagedEvents: async () => {
            throw new Error("upstream");
          },
        },
        store: {
          setStatus: async () => {
            touched = true;
          },
        },
      },
      0,
      1,
    ),
  );
  assert.equal(touched, false);
});
