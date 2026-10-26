/** @typedef {{start: string, end: string}} Slot */

export function weekDates(firstDay, week) {
  const date = new Date(firstDay + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + week * 7);
  return Array.from({ length: 7 }, () => {
    const key = date.toISOString().slice(0, 10);
    date.setUTCDate(date.getUTCDate() + 1);
    return key;
  });
}

/** Group only API-provided instants; a wall-time cell may contain two DST occurrences.
 * @param {Slot[]} slots
 * @param {string} timezone
 * @param {string[]} dates
 */
export function buildTimetable(slots, timezone, dates) {
  if (!slots.length) return [];
  const dateFormat = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const timeFormat = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const entries = slots.map(slot => {
    const date = new Date(slot.start);
    const [hour, minute] = timeFormat.format(date).split(':').map(Number);
    return { slot, day: dateFormat.format(date), minute: hour * 60 + minute };
  });
  const visible = entries.filter(entry => dates.includes(entry.day));
  const range = visible.length ? visible : entries;
  const first = Math.min(...range.map(entry => entry.minute));
  const last = Math.max(...range.map(entry => entry.minute));
  const minutes = new Set(range.map(entry => entry.minute));
  for (let minute = first; minute <= last; minute += 30) minutes.add(minute);
  return [...minutes].sort((a, b) => a - b).map(minute => ({
    minute,
    label: new Date(Date.UTC(2000, 0, 1, 0, minute)).toLocaleTimeString('en-US', {
      timeZone: 'UTC', hour: 'numeric', minute: '2-digit',
    }),
    cells: dates.map(day => visible
      .filter(entry => entry.day === day && entry.minute === minute)
      .map(entry => entry.slot)
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))),
  }));
}
