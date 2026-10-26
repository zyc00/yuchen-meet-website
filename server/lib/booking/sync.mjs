// Batch-read the site's confirmed events. An absent list entry is only a hint:
// verify it individually before releasing anything. Pending writes are untouched.
export async function syncReservations(
  bookings,
  { provider, store },
  start,
  end,
) {
  const confirmed = bookings.filter((b) => b.status === "confirmed");
  const events = confirmed.length
    ? await provider.listManagedEvents(start, end)
    : [];
  const byId = new Map(events.map((event) => [event.id, event]));
  const blocking = [];
  for (let booking of bookings) {
    if (booking.status === "confirmed") {
      const event =
        byId.get(booking.eventId) || (await provider.getEvent(booking.eventId));
      if (!event || event.status === "cancelled") {
        await store.setStatus(booking.id, "cancelled");
        continue;
      }
      const nextStart = event.start?.dateTime,
        nextEnd = event.end?.dateTime;
      if (
        nextStart &&
        nextEnd &&
        (Date.parse(nextStart) !== Date.parse(booking.start) ||
          Date.parse(nextEnd) !== Date.parse(booking.end))
      ) {
        booking = await store.updateInterval(booking, nextStart, nextEnd);
      }
    }
    blocking.push({ start: booking.start, end: booking.end });
  }
  return blocking;
}
