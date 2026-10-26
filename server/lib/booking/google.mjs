import { BookingError } from "./domain.mjs";
const html = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
export function googleProvider({ calendarId, accessToken, fetchImpl = fetch }) {
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  async function request(url, method = "GET", body) {
    let token;
    try {
      token = await accessToken();
    } catch {
      throw Object.assign(
        new BookingError(
          "Calendar connection needs attention.",
          503,
          "calendar",
        ),
        { definitive: true },
      );
    }
    const response = await fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(12000),
    });
    if (method === "GET" && [404, 410].includes(response.status)) return null;
    if (!response.ok)
      throw Object.assign(
        new BookingError(
          "Calendar is temporarily unavailable.",
          503,
          "calendar",
        ),
        {
          definitive: [400, 401, 403, 404, 422, 429].includes(response.status),
        },
      );
    return response.json();
  }
  return {
    async busy(start, end) {
      const data = await request(
        "https://www.googleapis.com/calendar/v3/freeBusy",
        "POST",
        {
          timeMin: new Date(start).toISOString(),
          timeMax: new Date(end).toISOString(),
          items: [{ id: calendarId }],
        },
      );
      const calendar = data.calendars?.[calendarId];
      if (
        !calendar ||
        calendar.errors?.length ||
        !Array.isArray(calendar.busy) ||
        calendar.busy.some(
          (b) =>
            !Number.isFinite(Date.parse(b.start)) ||
            !Number.isFinite(Date.parse(b.end)) ||
            Date.parse(b.end) <= Date.parse(b.start),
        )
      )
        throw new BookingError(
          "Calendar is temporarily unavailable.",
          503,
          "calendar",
        );
      return calendar.busy.map(({ start, end }) => ({ start, end }));
    },
    async createEvent(b, zoomUrl) {
      return request(`${base}?sendUpdates=all`, "POST", {
        id: b.eventId,
        summary: `Yuchen Zhou / ${b.name}`,
        description: `${html(b.topic)}<br><br>Join on Zoom: ${html(zoomUrl)}`,
        location: zoomUrl,
        start: { dateTime: b.start, timeZone: "America/New_York" },
        end: { dateTime: b.end, timeZone: "America/New_York" },
        attendees: [{ email: b.email, displayName: b.name }],
        guestsCanInviteOthers: false,
        guestsCanModify: false,
        guestsCanSeeOtherGuests: false,
        extendedProperties: {
          private: { bookingId: b.id, bookingSite: "yuchen" },
        },
      });
    },
    async listManagedEvents(start, end) {
      const events = [];
      let pageToken;
      for (let page = 0; page < 4; page++) {
        const url = new URL(base);
        for (const [key, value] of Object.entries({
          timeMin: new Date(start).toISOString(),
          timeMax: new Date(end).toISOString(),
          singleEvents: "true",
          maxResults: "2500",
          privateExtendedProperty: "bookingSite=yuchen",
          fields: "items(id,status,start,end),nextPageToken",
          ...(pageToken ? { pageToken } : {}),
        }))
          url.searchParams.set(key, value);
        const data = await request(url.href);
        if (!data || !Array.isArray(data.items))
          throw new BookingError(
            "Calendar is temporarily unavailable.",
            503,
            "calendar",
          );
        events.push(...data.items);
        if (!data.nextPageToken) return events;
        pageToken = data.nextPageToken;
      }
      throw new BookingError(
        "Calendar synchronization is temporarily unavailable.",
        503,
        "calendar",
      );
    },
    async getEvent(id) {
      if (!/^[a-v0-9]{5,100}$/.test(id)) throw new Error("Invalid event ID");
      return request(`${base}/${id}`);
    },
  };
}
