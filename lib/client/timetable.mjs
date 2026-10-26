/** @typedef {{start: string, end: string}} Slot */

export function mondayOfWeek(day) {
  const date = new Date(day + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}

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
 * @param {{busy?: Slot[], now?: number, validDates?: string[], horizonEnd?: number}} [options]
 */
export function buildTimetable(slots, timezone, dates, {
  busy = [], now = -Infinity, validDates = dates, horizonEnd = Infinity,
} = {}) {
  if (!slots.length) return [];
  const dateFormat = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const timeFormat = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const local = instant => {
    const date = new Date(instant);
    const [hour, minute] = timeFormat.format(date).split(':').map(Number);
    return { day: dateFormat.format(date), minute: hour * 60 + minute };
  };
  const entries = slots.map(slot => ({slot, ...local(slot.start)}));
  const visible = entries.filter(entry => dates.includes(entry.day));
  const range = visible.length ? visible : entries;
  const first = Math.min(...range.map(entry => entry.minute));
  const last = Math.max(...range.map(entry => entry.minute));
  const minutes = new Set(range.map(entry => entry.minute));
  for (let minute = first; minute <= last; minute += 30) minutes.add(minute);

  // Enumerate the API's UTC half-hour grid, then map it into local wall times.
  // This preserves both DST occurrences and never invents a spring-forward time.
  // Candidates classify disabled cells only; bookable slots still come from the API.
  const halfHour = 30 * 60000, dayMs = 86400000;
  const occurrences = new Map();
  const firstInstant = Date.parse(dates[0] + 'T00:00:00Z') - dayMs;
  const lastInstant = Date.parse(dates.at(-1) + 'T00:00:00Z') + 2 * dayMs;
  for (let instant = firstInstant; instant < lastInstant; instant += halfHour) {
    const {day, minute} = local(instant);
    if (!dates.includes(day) || !minutes.has(minute)) continue;
    const key = `${day}/${minute}`;
    if (!occurrences.has(key)) occurrences.set(key, []);
    occurrences.get(key).push(instant);
  }
  const busyIntervals = busy.map(interval => ({start: Date.parse(interval.start), end: Date.parse(interval.end)}));
  return [...minutes].sort((a, b) => a - b).map(minute => {
    const cells = dates.map(day => visible
      .filter(entry => entry.day === day && entry.minute === minute)
      .map(entry => entry.slot)
      .filter(slot => Date.parse(slot.start) > now && validDates.includes(day))
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start)));
    const states = dates.map((day, column) => {
      if (!validDates.includes(day)) return 'unavailable';
      if (cells[column].length) return 'available';
      const instants = occurrences.get(`${day}/${minute}`) || [];
      if (instants.length && instants.every(start => start <= now)) return 'past';
      const future = instants.filter(start => start > now && start + halfHour <= horizonEnd);
      return future.some(start => busyIntervals.some(interval =>
        start < interval.end && start + halfHour > interval.start)) ? 'busy' : 'unavailable';
    });
    return {
      minute,
      label: new Date(Date.UTC(2000, 0, 1, 0, minute)).toLocaleTimeString('en-US', {
        timeZone: 'UTC', hour: 'numeric', minute: '2-digit',
      }),
      cells,
      states,
    };
  });
}

/** Compact the visual overview without changing the actual bookable starts.
 * @param {ReturnType<typeof buildTimetable>} rows
 */
export function hourlyTimetable(rows) {
  const hours = [...new Set(rows.map(row => Math.floor(row.minute / 60) * 60))];
  return hours.map(minute => {
    const members = rows.filter(row => Math.floor(row.minute / 60) * 60 === minute);
    return {
      minute,
      label: new Date(Date.UTC(2000, 0, 1, 0, minute)).toLocaleTimeString('en-US', {
        timeZone: 'UTC', hour: 'numeric',
      }),
      cells: members[0].cells.map((_, column) => ({
        slots: members.flatMap(row => row.cells[column]).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start)),
        parts: members.map(row => ({minute: row.minute, state: row.states[column], slots: row.cells[column]})),
      })),
    };
  });
}
