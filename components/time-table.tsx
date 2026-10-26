import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { calendarDays } from "../lib/client/calendar.mjs";
import { buildTimetable, weekDates } from "../lib/client/timetable.mjs";

type Slot = { start: string; end: string };
type Props = {
  slots: Slot[];
  busy: Slot[];
  timezone: string;
  now: number;
  duration: number;
  selected: Slot | null;
  locked: boolean;
  onSelect: (slot: Slot | null) => void;
  onContinue: () => void;
};
const dateLabel = (day: string, options: Intl.DateTimeFormatOptions) =>
  new Date(day + "T12:00:00Z").toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
const timeLabel = (iso: string, timezone: string, offset = false) =>
  new Date(iso).toLocaleTimeString("en-US", {
    timeZone: timezone, hour: "numeric", minute: "2-digit",
    ...(offset ? { timeZoneName: "shortOffset" as const } : {}),
  });

export function TimeTable({ slots, busy, timezone, now, duration, selected, locked, onSelect, onContinue }: Props) {
  const [week, setWeek] = useState(0);
  const [clock, setClock] = useState({ source: now, elapsed: 0 });
  const currentNow = now + (clock.source === now ? clock.elapsed : 0);
  useEffect(() => {
    const receivedAt = Date.now();
    setClock({ source: now, elapsed: 0 });
    const tick = () => setClock(previous => ({ source: now,
      elapsed: Math.max(previous.source === now ? previous.elapsed : 0, Date.now() - receivedAt),
    }));
    const timer = setInterval(tick, 30000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [now]);
  const scroll = useRef<HTMLDivElement>(null);
  const days = useMemo(() => calendarDays(now, timezone), [now, timezone]);
  const firstDay = days[0];
  const maxWeek = Math.ceil(days.length / 7) - 1;
  const page = Math.min(week, maxWeek);
  const dates = useMemo(() => weekDates(firstDay, page), [firstDay, page]);
  const rows = useMemo(() => buildTimetable(slots, timezone, dates, {
    busy, now: currentNow, validDates: days, horizonEnd: now + 21 * 86400000,
  }), [slots, busy, timezone, dates, currentNow, days, now]);
  const hasOpenTimes = rows.some(row => row.cells.some(cell => cell.length));
  useEffect(() => { setWeek(0); }, [timezone, firstDay]);
  useEffect(() => {
    if (selected && !locked && Date.parse(selected.start) <= currentNow) onSelect(null);
  }, [selected, locked, currentNow, onSelect]);
  function changeWeek(next: number) {
    setWeek(next);
    if (scroll.current) scroll.current.scrollLeft = 0;
  }
  const differentYear = dates[0].slice(0, 4) !== dates[6].slice(0, 4);
  return (
    <div className="timetable">
      <div className="timetable-toolbar">
        <h3 aria-live="polite">
          {dateLabel(dates[0], { month: "short", day: "numeric", ...(differentYear ? { year: "numeric" } : {}) })}
          <span className="range-dash">–</span>
          {dateLabel(dates[6], { month: "short", day: "numeric", year: "numeric" })}
        </h3>
        <div className="week-navigation" aria-label="Timetable navigation">
          <button type="button" className="today-button" onClick={() => changeWeek(0)} disabled={page === 0 || locked}>Today</button>
          <button type="button" aria-label="Previous week" onClick={() => changeWeek(page - 1)} disabled={page === 0 || locked}><ChevronLeft size={18} /></button>
          <button type="button" aria-label="Next week" onClick={() => changeWeek(page + 1)} disabled={page === maxWeek || locked}><ChevronRight size={18} /></button>
        </div>
      </div>
      <div className="timetable-scroll" ref={scroll} role="region" aria-label="Weekly meeting start times" tabIndex={0}>
        <table className="time-table">
          <caption className="sr-only">Available {duration}-minute meetings. All times in {timezone.replaceAll("_", " ")}.</caption>
          <thead><tr>
            <th className="time-axis" scope="col"><span className="sr-only">Time</span></th>
            {dates.map(day => <th key={day} scope="col" className={`${day === firstDay ? "is-today" : ""} ${!days.includes(day) ? "outside-horizon" : ""}`}>
              <span className="day-name">{dateLabel(day, { weekday: "short" })}</span>
              <span className="day-number">{dateLabel(day, { day: "numeric" })}</span>
              {day === firstDay && <span className="sr-only">Today</span>}
            </th>)}
          </tr></thead>
          <tbody>
            {rows.map((row, rowIndex) => <tr key={row.minute} className={rowIndex % 2 === 0 ? "hour-row" : "half-hour-row"}>
              <th scope="row" className="time-axis"><span>{row.label}</span></th>
              {row.cells.map((cell, column) => <td key={dates[column]}>
                {cell.length ? <div className="time-cell-options">{cell.map(slot => {
                  const isSelected = selected?.start === slot.start;
                  const label = `${dateLabel(dates[column], { weekday: "long", month: "long", day: "numeric" })}, ${timeLabel(slot.start, timezone, true)} to ${timeLabel(slot.end, timezone, true)}`;
                  return <button key={slot.start} type="button" disabled={locked}
                    className={`time-cell available ${isSelected ? "selected" : ""} ${cell.length > 1 ? "repeated-time" : ""}`}
                    aria-label={label} aria-pressed={isSelected} title={label}
                    onClick={() => onSelect(slot)}>
                  </button>;
                })}</div> : <span className={`time-cell ${row.states[column]}`} role="img"
                  aria-label={row.states[column] === "past" ? "Past time" : row.states[column] === "busy" ? "Busy" : "Unavailable"}
                  title={`${dateLabel(dates[column], { weekday: "short", month: "short", day: "numeric" })}, ${row.label} · ${row.states[column] === "past" ? "This time has passed" : row.states[column] === "busy" ? "Calendar busy" : `Not available for a ${duration}-minute meeting`}`} />}
              </td>)}
            </tr>)}
          </tbody>
        </table>
      </div>
      {!hasOpenTimes && <p className="subtle-text" role="status">No open times this week. Try another week or a shorter meeting.</p>}
      <div className="timetable-key">
        <span><i className="available-key" /> Available</span>
        <span><i className="busy-key" /> Busy</span>
        <span><i className="unavailable-key" /> Unavailable</span>
        <span className="start-time-note">Choose a {duration}-minute start time<span className="mobile-scroll-hint"> · Swipe for more days</span></span>
      </div>
      {selected && <div className="time-selection">
        <div aria-live="polite">
          <span>{new Date(selected.start).toLocaleDateString("en-US", { timeZone: timezone, weekday: "short", month: "short", day: "numeric" })}</span>
          <strong>{timeLabel(selected.start, timezone)} – {timeLabel(selected.end, timezone)}<small>{timezone.replaceAll("_", " ")}</small></strong>
        </div>
        <button type="button" className="primary-button" onClick={onContinue}>Continue <ArrowRight size={16} /></button>
      </div>}
    </div>
  );
}
