export const MINUTE = 60000;
export const DAY = 86400000;
export class BookingError extends Error {
  constructor(message, status = 400, code = "invalid") {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function defaultSettings() {
  return {
    enabled: false,
    timezone: "America/New_York",
    hours: {},
    excludedDates: [],
    horizonDays: 21,
  };
}
export function validTimezone(tz) {
  try {
    return (
      typeof tz === "string" &&
      tz.length < 100 &&
      !!new Intl.DateTimeFormat("en-US", { timeZone: tz }).format()
    );
  } catch {
    return false;
  }
}
const fail = (message) => {
  throw new BookingError(message);
};
export function validateSettings(input) {
  if (
    !input ||
    typeof input.enabled !== "boolean" ||
    input.timezone !== "America/New_York"
  )
    fail("Use the New York schedule timezone.");
  if (
    !input.hours ||
    typeof input.hours !== "object" ||
    Array.isArray(input.hours)
  )
    fail("Invalid weekly hours.");
  const hours = {};
  const minutes = (value) => {
    if (
      typeof value !== "string" ||
      !/^(?:[01]\d|2[0-3]):(?:00|30)$|^24:00$/.test(value)
    )
      fail("Hours must use 30-minute increments.");
    const [h, m] = value.split(":").map(Number);
    return h * 60 + m;
  };
  for (const [day, windows] of Object.entries(input.hours)) {
    if (!/^[0-6]$/.test(day) || !Array.isArray(windows) || windows.length > 4)
      fail("Invalid weekly hours.");
    let last = -1;
    hours[day] = windows.map((w) => {
      if (!Array.isArray(w) || w.length !== 2) fail("Invalid hours.");
      const a = minutes(w[0]),
        b = minutes(w[1]);
      if (a >= b || a < last) fail("Hours must be ordered and cannot overlap.");
      last = b;
      return [...w];
    });
  }
  if (
    !Array.isArray(input.excludedDates) ||
    input.excludedDates.length > 100 ||
    input.excludedDates.some(
      (d) =>
        typeof d !== "string" ||
        !/^\d{4}-\d\d-\d\d$/.test(d) ||
        Number.isNaN(Date.parse(d)) ||
        new Date(d).toISOString().slice(0, 10) !== d,
    )
  )
    fail("Invalid excluded dates.");
  return {
    enabled: input.enabled,
    timezone: "America/New_York",
    hours,
    excludedDates: [...new Set(input.excludedDates)],
    horizonDays: 21,
  };
}
function localParts(ms, formatter) {
  const p = Object.fromEntries(
    formatter.formatToParts(ms).map((x) => [x.type, x.value]),
  );
  return {
    day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday),
    date: `${p.year}-${p.month}-${p.day}`,
    minute: Number(p.hour) * 60 + Number(p.minute),
  };
}
export function overlaps(a, b) {
  return (
    +new Date(a.start) < +new Date(b.end) &&
    +new Date(a.end) > +new Date(b.start)
  );
}
export function computeSlots(settings, busy, now = Date.now(), duration = 30) {
  if (![30, 60].includes(duration)) fail("Choose a 30 or 60 minute meeting.");
  if (!settings.enabled || !Object.values(settings.hours).some((w) => w.length))
    return [];
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: settings.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const open = (ms) => {
    const p = localParts(ms, formatter);
    if (settings.excludedDates.includes(p.date)) return false;
    return (settings.hours[p.day] || []).some(([a, b]) => {
      const [ah, am] = a.split(":").map(Number),
        [bh, bm] = b.split(":").map(Number);
      return p.minute >= ah * 60 + am && p.minute < bh * 60 + bm;
    });
  };
  const output = [],
    limit = now + 21 * DAY;
  for (
    let start = (Math.floor(now / (30 * MINUTE)) + 1) * 30 * MINUTE;
    start + duration * MINUTE <= limit;
    start += 30 * MINUTE
  ) {
    const end = start + duration * MINUTE;
    if (!open(start) || !open(end - MINUTE)) continue;
    if (duration === 60 && !open(start + 30 * MINUTE)) continue;
    const slot = {
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
    };
    if (!busy.some((b) => overlaps(slot, b))) output.push(slot);
  }
  return output;
}
export function validateBooking(input, settings, now = Date.now()) {
  if (!input || typeof input !== "object") fail("Invalid booking.");
  const text = (value, min, max) => {
    if (
      typeof value !== "string" ||
      value.trim().length < min ||
      value.length > max ||
      /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)
    )
      fail("Check your name and meeting topic.");
    return value.trim();
  };
  const name = text(input.name, 1, 100),
    topic = text(input.topic || "", 0, 1500);
  if (
    typeof input.email !== "string" ||
    input.email.length > 254 ||
    !/^\S+@[^\s@]+\.[^\s@]+$/.test(input.email) ||
    /[\r\n<>;,]/.test(input.email)
  )
    fail("Enter a valid email address.");
  if (!validTimezone(input.timezone)) fail("Choose a valid timezone.");
  if (
    typeof input.key !== "string" ||
    !/^[a-zA-Z0-9_-]{20,100}$/.test(input.key) ||
    typeof input.token !== "string" ||
    !/^[a-zA-Z0-9_-]{40,150}$/.test(input.token)
  )
    fail("Refresh the page and try again.");
  if (
    typeof input.start !== "string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(input.start)
  )
    fail("Choose a valid time.");
  const start = Date.parse(input.start);
  const slot = computeSlots(settings, [], now, input.duration).find(
    (s) => Date.parse(s.start) === start,
  );
  if (!slot)
    throw new BookingError(
      "This time is no longer available. Please choose another.",
      409,
      "unavailable",
    );
  return {
    ...slot,
    name,
    email: input.email.toLowerCase(),
    topic,
    duration: input.duration,
    timezone: input.timezone,
    key: input.key,
    token: input.token,
  };
}
const escapeICS = (s) =>
  String(s)
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
const stamp = (s) =>
  new Date(s)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
function fold(line) {
  let rows = [],
    row = "",
    size = 0;
  for (const c of line) {
    const n = new TextEncoder().encode(c).length;
    if (size + n > 75) {
      rows.push(row);
      row = " ";
      size = 1;
    }
    row += c;
    size += n;
  }
  rows.push(row);
  return rows.join("\r\n");
}
export function calendarInvite(b, zoomUrl) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Yuchen Zhou//Meeting//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${b.eventId || b.id}@google.com`,
    `DTSTAMP:${stamp(b.created)}`,
    `DTSTART:${stamp(b.start)}`,
    `DTEND:${stamp(b.end)}`,
    `SUMMARY:${escapeICS("Meeting with Yuchen Zhou")}`,
    `DESCRIPTION:${escapeICS(`${b.name}\n${b.topic}\nJoin on Zoom: ${zoomUrl}`)}`,
    `LOCATION:${escapeICS(zoomUrl)}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ]
    .map(fold)
    .join("\r\n");
}
