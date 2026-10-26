import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { calendarDays } from "../lib/client/calendar.mjs";
import { buildTimetable, hourlyTimetable, mondayOfWeek, weekDates } from "../lib/client/timetable.mjs";

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
  const [openHour, setOpenHour] = useState<{day: string; minute: number} | null>(null);
  const choicesRef = useRef<HTMLDivElement>(null);
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
  const firstMonday = mondayOfWeek(firstDay);
  const maxWeek = Math.floor((Date.parse(days[days.length - 1]) - Date.parse(firstMonday)) / (7 * 86400000));
  const page = Math.min(week, maxWeek);
  const dates = useMemo(() => weekDates(firstMonday, page), [firstMonday, page]);
  const rows = useMemo(() => hourlyTimetable(buildTimetable(slots, timezone, dates, {
    busy, now: currentNow, validDates: days, horizonEnd: now + 21 * 86400000,
  })), [slots, busy, timezone, dates, currentNow, days, now]);
  const hasOpenTimes = rows.some(row => row.cells.some(cell => cell.slots.length));
  const hourChoices = openHour ? rows.find(row => row.minute === openHour.minute)?.cells[dates.indexOf(openHour.day)]?.slots || [] : [];
  const showOffsets = new Set(hourChoices.map(slot=>timeLabel(slot.start,timezone))).size < hourChoices.length;
  useEffect(() => { setWeek(0); setOpenHour(null); }, [timezone, firstDay]);
  useEffect(() => {
    choicesRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }, [openHour]);
  useEffect(() => {
    if (selected && !locked && Date.parse(selected.start) <= currentNow) onSelect(null);
  }, [selected, locked, currentNow, onSelect]);
  function changeWeek(next: number) {
    setWeek(next);
    setOpenHour(null);
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
            {rows.map(row => <tr key={row.minute}>
              <th scope="row" className="time-axis"><span>{row.label}</span></th>
              {row.cells.map((cell, column) => {
                const isSelected = cell.slots.some(slot => slot.start === selected?.start);
                const isExpanded = openHour?.day === dates[column] && openHour.minute === row.minute;
                const colors = cell.parts.map(part => `var(--time-${part.slots.some(slot => slot.start === selected?.start) ? "selected" : part.state})`);
                const background = colors.length === 1 ? colors[0] : `linear-gradient(to bottom, ${colors.map((color,index)=>`${color} ${index/colors.length*100}% ${(index+1)/colors.length*100}%`).join(", ")})`;
                const label = `${dateLabel(dates[column], { weekday: "long", month: "long", day: "numeric" })}, ${row.label}`;
                const states = new Set(cell.parts.map(part=>part.state));
                const stateLabel = states.has("busy") ? states.size > 1 ? "Partly busy" : "Busy" : states.size === 1 && states.has("past") ? "Past time" : "Unavailable";
                return <td key={dates[column]}>
                  {cell.slots.length ? <button type="button" disabled={locked}
                    className={`time-cell available ${isSelected ? "selected" : ""} ${isExpanded ? "expanded" : ""}`}
                    style={{background}} aria-label={`${label}, choose a start time${states.has("busy") ? ", partly busy" : ""}`} aria-pressed={isSelected}
                    aria-expanded={isExpanded && hourChoices.length > 1} title={`${label} · ${cell.slots.length} available start times${states.has("busy") ? " · Partly busy" : ""}`}
                    onClick={() => {
                      setOpenHour({day: dates[column], minute: row.minute});
                      if (cell.slots.length === 1) onSelect(cell.slots[0]);
                      else if (!isSelected) onSelect(null);
                    }} /> : <span className="time-cell unavailable" style={{background}} role="img"
                    aria-label={stateLabel} title={`${label} · ${stateLabel}`} />}
                </td>;
              })}
            </tr>)}
          </tbody>
        </table>
      </div>
      {!hasOpenTimes && <p className="subtle-text" role="status">No open times this week. Try another week or a shorter meeting.</p>}
      <div className="timetable-key">
        <span><i className="available-key" /> Available</span>
        <span><i className="busy-key" /> Busy</span>
        <span><i className="unavailable-key" /> Unavailable</span>
        <span className="start-time-note">Select an hour</span>
      </div>
      {openHour && hourChoices.length > 1 && <div className="hour-choices" ref={choicesRef} role="group" aria-label="Choose a start time">
        <p>{dateLabel(openHour.day, {weekday: "short", month: "short", day: "numeric"})}<span>Choose a start time</span></p>
        <div>{hourChoices.map(slot => <button key={slot.start} type="button" disabled={locked}
          aria-pressed={selected?.start === slot.start}
          aria-label={`${timeLabel(slot.start,timezone,true)} to ${timeLabel(slot.end,timezone,true)}`}
          className={selected?.start === slot.start ? "selected" : ""}
          onClick={()=>onSelect(slot)}>{timeLabel(slot.start,timezone,showOffsets)}</button>)}</div>
      </div>}
      {selected && <div className="time-selection">
        <div aria-live="polite">
          <span>{new Date(selected.start).toLocaleDateString("en-US", { timeZone: timezone, weekday: "short", month: "short", day: "numeric" })}</span>
          <strong>{timeLabel(selected.start, timezone, showOffsets)} – {timeLabel(selected.end, timezone, showOffsets)}<small>{timezone.replaceAll("_", " ")}</small></strong>
        </div>
        <button type="button" className="primary-button" onClick={onContinue}>Continue <ArrowRight size={16} /></button>
      </div>}
    </div>
  );
}
