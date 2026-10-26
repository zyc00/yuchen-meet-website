import { BookingError, validateBooking, overlaps } from "./domain.mjs";
import { digest } from "./store.mjs";
const fingerprint = (b) =>
  JSON.stringify([
    b.name?.trim(),
    b.email?.toLowerCase(),
    b.topic?.trim() || "",
    b.start ? new Date(b.start).toISOString() : "",
    b.duration,
    b.timezone,
  ]);
async function match(existing, input) {
  if (
    existing.capHash !== (await digest(input.token || "")) ||
    existing.fingerprint !== (await digest(fingerprint(input)))
  )
    throw new BookingError(
      "This request was already used. Please start a new booking.",
      409,
      "replay",
    );
  return existing;
}
export async function reconcileBooking(b, { provider, store }) {
  if (b.status !== "pending") return b;
  try {
    const event = await provider.getEvent(b.eventId);
    if (event && event.status !== "cancelled") return store.markConfirmed(b.id);
    if (event?.status === "cancelled") return store.markFailed(b.id);
  } catch {
    /* An uncertain write keeps its reservation until the event can be verified. */
  }
  return b;
}
export async function bookMeeting(
  input,
  { settings, store, provider, now = Date.now(), zoomUrl },
) {
  const existing =
    typeof input?.key === "string" ? await store.getByKey(input.key) : null;
  if (existing)
    return reconcileBooking(await match(existing, input), { store, provider });
  const valid = validateBooking(input, settings, now),
    id = crypto.randomUUID().replaceAll("-", "");
  const { token, ...safe } = valid;
  const booking = {
    ...safe,
    id,
    eventId: `b${id}`,
    created: now,
    fingerprint: await digest(fingerprint(valid)),
    capHash: await digest(token),
  };
  const held = await store.reserve(booking);
  if (!held) {
    const replay = await store.getByKey(input.key);
    if (replay)
      return reconcileBooking(await match(replay, input), { store, provider });
    throw new BookingError(
      "Someone just booked this time. Please choose another.",
      409,
      "unavailable",
    );
  }
  // Nothing has been sent yet: any failure here can safely release the reservation.
  try {
    const busy = await provider.busy(
      Date.parse(held.start),
      Date.parse(held.end),
    );
    if (busy.some((b) => overlaps(held, b)))
      throw new BookingError(
        "This time is no longer available. Please choose another.",
        409,
        "unavailable",
      );
  } catch (e) {
    await store.markFailed(held.id);
    throw e;
  }
  try {
    const event = await provider.createEvent(held, zoomUrl);
    if (event?.id !== held.eventId)
      throw new Error("Unconfirmed calendar response");
    return await store.markConfirmed(held.id);
  } catch (e) {
    if (e.definitive) {
      await store.markFailed(held.id);
      throw new BookingError(
        "The calendar could not accept this booking. Please try again later.",
        503,
        "calendar",
      );
    }
    return reconcileBooking(held, { provider, store });
  }
}
