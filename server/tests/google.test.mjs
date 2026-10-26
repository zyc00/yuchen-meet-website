import test from "node:test";
import assert from "node:assert/strict";
import { googleProvider } from "../lib/booking/google.mjs";
test("freebusy errors and malformed intervals fail closed", async () => {
  for (const data of [
    { calendars: { owner: { errors: [{ reason: "notFound" }] } } },
    { calendars: {} },
    { calendars: { owner: { busy: [{ start: "bad", end: "bad" }] } } },
  ]) {
    const p = googleProvider({
      calendarId: "owner",
      accessToken: async () => "fake",
      fetchImpl: async () => Response.json(data),
    });
    await assert.rejects(p.busy(0, 86400000));
  }
});
test("event creation uses stable ID, Zoom, sends invite, escapes HTML and omits Meet", async () => {
  let request;
  const p = googleProvider({
    calendarId: "owner@example.com",
    accessToken: async () => "fake",
    fetchImpl: async (url, options) => {
      request = { url, ...options };
      return Response.json({ id: "b0123" });
    },
  });
  await p.createEvent(
    {
      id: "0123",
      eventId: "b0123",
      name: "Alice",
      email: "alice@example.com",
      topic: "<b>topic</b>",
      start: "2026-10-26T13:00:00Z",
      end: "2026-10-26T13:30:00Z",
    },
    "https://zoom.us/j/123",
  );
  assert.ok(request.url.includes("sendUpdates=all"));
  const body = JSON.parse(request.body);
  assert.equal(body.id, "b0123");
  assert.equal(body.location, "https://zoom.us/j/123");
  assert.ok(body.description.includes("&lt;b&gt;"));
  assert.equal(body.conferenceData, undefined);
  assert.equal(body.attendees[0].email, "alice@example.com");
});
test("write 5xx is uncertain, validation/auth failures definitive, 409 requires reconciliation", async () => {
  for (const status of [400, 401, 403, 409, 500]) {
    const p = googleProvider({
      calendarId: "owner",
      accessToken: async () => "fake",
      fetchImpl: async () => new Response("secret", { status }),
    });
    await assert.rejects(
      p.createEvent({ eventId: "b0123" }),
      (err) =>
        err.definitive === [400, 401, 403].includes(status) &&
        !err.message.includes("secret"),
    );
  }
});
test("managed events listing follows pagination and uses a fixed origin marker", async () => {
  let requests = [];
  const p = googleProvider({
    calendarId: "owner",
    accessToken: async () => "fake",
    fetchImpl: async (url) => {
      requests.push(new URL(url));
      return requests.length === 1
        ? Response.json({ items: [{ id: "first" }], nextPageToken: "next" })
        : Response.json({ items: [{ id: "second" }] });
    },
  });
  assert.deepEqual(
    (await p.listManagedEvents(0, 86400000)).map((e) => e.id),
    ["first", "second"],
  );
  assert.equal(requests.length, 2);
  assert.equal(
    requests[0].searchParams.get("privateExtendedProperty"),
    "bookingSite=yuchen",
  );
  assert.equal(requests[1].searchParams.get("pageToken"), "next");
});
