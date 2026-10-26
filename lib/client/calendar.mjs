export function calendarDays(now, timezone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const first = formatter.format(new Date(now)),
    last = formatter.format(new Date(now + 21 * 86400000));
  const cursor = new Date(first + "T12:00:00Z"),
    days = [];
  for (let i = 0; i < 23; i++) {
    const key = cursor.toISOString().slice(0, 10);
    days.push(key);
    if (key >= last) break;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}
