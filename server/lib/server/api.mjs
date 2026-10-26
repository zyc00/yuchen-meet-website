import {
  BookingError,
  defaultSettings,
  validateSettings,
  computeSlots,
  calendarInvite,
  DAY,
} from "../booking/domain.mjs";
import { createStore, digest } from "../booking/store.mjs";
import { bookMeeting, reconcileBooking } from "../booking/service.mjs";
import { googleProvider } from "../booking/google.mjs";
import { syncReservations } from "../booking/sync.mjs";
import {
  requireSameOrigin,
  readBoundedJson,
  ownerIdentity,
  rateLimit,
  verifyCapability,
} from "../booking/security.mjs";
import {
  CALENDAR_ID,
  tokenSupplier,
  beginGoogle,
  completeGoogle,
} from "./oauth.mjs";
export const initialSchedule = () => ({
  ...defaultSettings(),
  enabled: true,
  hours: Object.fromEntries(
    [0, 1, 2, 3, 4, 5, 6].map((d) => [d, [["10:00", "23:00"]]]),
  ),
});
const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
const json = (value, status = 200) => Response.json(value, { status, headers });
const local = (url) =>
  ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
const publicBooking = (b, env) => ({
  id: b.id,
  status: b.status,
  start: b.start,
  end: b.end,
  duration: b.duration,
  timezone: b.timezone,
  ...(b.status === "confirmed" ? { zoomUrl: env.MEETING_URL } : {}),
});
export async function handleApi(request, env, clientIp = "shared") {
  const url = new URL(request.url),
    path = url.pathname,
    now = Date.now();
  try {
    const origins = [
      env.SITE_ORIGIN,
      env.API_ORIGIN,
      ...(local(url) ? [url.origin] : []),
    ].filter(Boolean);
    if (request.method === "POST") requireSameOrigin(request, origins);
    // A loopback-only visual fixture cannot write to a calendar or durable records.
    if (
      local(url) &&
      env.DEMO_MODE === "1" &&
      path === "/api/book" &&
      request.method === "POST"
    ) {
      throw new BookingError(
        "This is a preview. No meeting will be booked.",
        403,
        "preview",
      );
    }
    if (
      local(url) &&
      env.DEMO_MODE === "1" &&
      path === "/api/availability" &&
      request.method === "GET"
    ) {
      const s = initialSchedule();
      const all = computeSlots(s, [], now, 30),
        busy = all.filter((_, i) => i % 9 === 3 || i % 9 === 4);
      return json({
        ready: true,
        demo: true,
        timezone: s.timezone,
        slots: computeSlots(
          s,
          busy,
          now,
          Number(url.searchParams.get("duration") || 30),
        ),
        busy,
        now,
      });
    }
    if (!env.DB) {
      if (path === "/api/availability")
        return json({
          ready: false,
          slots: [],
          busy: [],
          timezone: "America/New_York",
          now,
        });
      throw new BookingError(
        "The booking service is being set up.",
        503,
        "setup",
      );
    }
    const db = env.DB,
      store = createStore(db);
    const ip = clientIp;
    await rateLimit(db, `read:${ip}`, 300, 600000, now);
    const settings = validateSettings(
      (await store.getSetting("schedule")) || initialSchedule(),
    );
    const reconnectRequired =
      (await store.getSetting("google-health")) === "reconnect_required";
    const connected =
      !!(await store.getSetting("google")) && !reconnectRequired;
    const configured = !!(
      env.GOOGLE_CLIENT_ID &&
      env.GOOGLE_CLIENT_SECRET &&
      env.TOKEN_ENCRYPTION_KEY &&
      env.OAUTH_REDIRECT_URI &&
      env.MEETING_URL
    );
    const ready =
      connected &&
      configured &&
      settings.enabled &&
      Object.values(settings.hours).some((w) => w.length);
    const provider = googleProvider({
      calendarId: CALENDAR_ID,
      accessToken: tokenSupplier(env, store),
    });
    const context = {
      settings,
      store,
      provider,
      now,
      zoomUrl: env.MEETING_URL,
    };
    async function owner() {
      const id = ownerIdentity(request.headers, env);
      await db
        .prepare(
          "INSERT INTO settings (id,value) VALUES ('owner',?) ON CONFLICT(id) DO NOTHING",
        )
        .bind(JSON.stringify(id))
        .run();
      if ((await store.getSetting("owner")) !== id)
        throw new BookingError(
          "This account is not the configured owner.",
          403,
        );
      return id;
    }
    // The callback is authorized by the expiring, single-use state created by
    // an authenticated admin. It never trusts browser-supplied identity headers.
      if (path === "/api/google/callback" && request.method === "GET") {
        try {
          await completeGoogle(request, env, db, store, "owner:" + (env.ADMIN_USERNAME || "yuchen"));
          return Response.redirect(
            new URL("/admin?connected=1", url.origin),
            303,
          );
        } catch (e) {
          const code = e instanceof BookingError ? e.code : "oauth";
          if (env.NODE_ENV === "production") {
            const safeCode = (value) => typeof value === "string" && /^[A-Za-z_]{1,80}$/.test(value) ? value : "unknown";
            console.warn("Google connection failed", {
              type: safeCode(e?.name), code: safeCode(e?.code), providerError: safeCode(e?.error),
            });
          }
          return Response.redirect(
            new URL(
              `/admin?connection_error=${encodeURIComponent(code)}`,
              url.origin,
            ),
            303,
          );
        }
      }
    if (path.startsWith("/api/admin") || path.startsWith("/api/google")) {
      const id = await owner();
      if (path === "/api/admin" && request.method === "GET")
        return json({
          settings,
          connected,
          reconnectRequired,
          configured,
          calendar: CALENDAR_ID,
          oauthReady: !!(
            env.GOOGLE_CLIENT_ID &&
            env.GOOGLE_CLIENT_SECRET &&
            env.TOKEN_ENCRYPTION_KEY &&
            env.OAUTH_REDIRECT_URI
          ),
          redirectUri: env.OAUTH_REDIRECT_URI || null,
          pending: (await store.listPending()).map((b) => ({
            id: b.id,
            start: b.start,
            end: b.end,
            name: b.name,
            email: b.email,
          })),
        });
      if (path === "/api/admin/settings" && request.method === "POST") {
        const next = validateSettings(await readBoundedJson(request));
        await store.putSetting("schedule", next);
        return json({ settings: next });
      }
      if (path === "/api/google/start" && request.method === "POST")
        return json({ url: await beginGoogle(env, db, id) });
      if (path === "/api/admin/disconnect" && request.method === "POST") {
        await store.putSetting("google", null);
        await store.putSetting("google-health", null);
        await store.putSetting("schedule", { ...settings, enabled: false });
        return json({ disconnected: true });
      }
    }
    if (path === "/api/availability" && request.method === "GET") {
      const duration = Number(url.searchParams.get("duration") || 30);
      if (![30, 60].includes(duration))
        throw new BookingError("Invalid duration.");
      await store.cleanup(now);
      if (!ready)
        return json({
          ready: false,
          slots: [],
          busy: [],
          timezone: settings.timezone,
          now,
        });
      const held = await store.listBlocking(now, now + 21 * DAY);
      const blocking = await syncReservations(
        held,
        { provider, store },
        now,
        now + 21 * DAY,
      );
      const busy = [...(await provider.busy(now, now + 21 * DAY)), ...blocking];
      return json({
        ready: true,
        slots: computeSlots(settings, busy, now, duration),
        busy,
        timezone: settings.timezone,
        now,
      });
    }
    if (path === "/api/book" && request.method === "POST") {
      const input = await readBoundedJson(request);
      if (!input || typeof input !== "object" || input.website)
        throw new BookingError("Unable to submit booking.");
      // Recovery is independent of whether the owner is accepting NEW bookings.
      if (
        typeof input.key === "string" &&
        input.key.length <= 100 &&
        (await store.getByKey(input.key))
      ) {
        const result = await bookMeeting(input, context);
        return json(
          publicBooking(result, env),
          result.status === "pending" ? 202 : 200,
        );
      }
      if (!ready)
        throw new BookingError(
          "Booking is not open yet. Please check back soon.",
          503,
          "setup",
        );
      await rateLimit(db, `book:${ip}`, 10, 3600000, now);
      await rateLimit(db, "book:global", 100, 3600000, now);
      await rateLimit(
        db,
        `email:${await digest(String(input.email).toLowerCase())}`,
        6,
        3600000,
        now,
      );
      const result = await bookMeeting(input, context);
      return json(
        publicBooking(result, env),
        result.status === "pending" ? 202 : 200,
      );
    }
    const bookingPath = path.match(
      /^\/api\/bookings\/([a-f0-9]{32})(\/calendar)?$/,
    );
    if (bookingPath && request.method === "GET") {
      let b = await store.getBooking(bookingPath[1]);
      const token =
        request.headers.get("authorization")?.replace(/^Bearer /, "") ||
        url.searchParams.get("token");
      if (!(await verifyCapability(b, token)))
        throw new BookingError("Booking not found.", 404);
      b = await reconcileBooking(b, context);
      if (bookingPath[2]) {
        if (b.status !== "confirmed")
          throw new BookingError(
            "Your booking has not been confirmed yet.",
            409,
          );
        return new Response(calendarInvite(b, env.MEETING_URL), {
          headers: {
            ...headers,
            "Content-Type": "text/calendar; charset=utf-8",
            "Content-Disposition":
              'attachment; filename="meeting-with-yuchen.ics"',
          },
        });
      }
      return json(publicBooking(b, env));
    }
    throw new BookingError("Not found.", 404);
  } catch (error) {
    const known = error instanceof BookingError;
    return json(
      {
        error: known
          ? error.message
          : "The calendar is temporarily unavailable. Please try again later.",
        code: known ? error.code : "unavailable",
      },
      known ? error.status : 503,
    );
  }
}
