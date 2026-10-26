import { apiFetch } from "../lib/client/api.mjs";
import { calendarDays } from "../lib/client/calendar.mjs";
import { safeStorage } from "../lib/client/storage.mjs";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
type Slot = { start: string; end: string };
type Availability = {
  ready: boolean;
  demo?: boolean;
  slots: Slot[];
  busy: Slot[];
  timezone: string;
  now: number;
};
type Result = Slot & {
  id: string;
  status: string;
  duration: number;
  timezone: string;
  zoomUrl?: string;
};
type Attempt = {
  name: string;
  email: string;
  topic: string;
  website: string;
  start: string;
  duration: number;
  timezone: string;
  key: string;
  token: string;
};
const dayKey = (date: Date | string, tz: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
const dateObject = (key: string) => new Date(key + "T12:00:00Z");
const dateLabel = (key: string, options: Intl.DateTimeFormatOptions) =>
  dateObject(key).toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
const time = (iso: string, tz: string) =>
  new Date(iso).toLocaleTimeString("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  });
const fullDate = (iso: string, tz: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    timeZone: tz,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
export function BookingPage() {
  const [duration, setDuration] = useState(30),
    [tz, setTz] = useState("America/New_York"),
    [data, setData] = useState<Availability | null>(null),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [refresh, setRefresh] = useState(0);
  const [selectedDay, setDay] = useState(""),
    [selected, setSelected] = useState<Slot | null>(null);
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [topic, setTopic] = useState(""),
    [website, setWebsite] = useState(""),
    [error, setError] = useState(""),
    [sending, setSending] = useState(false),
    [result, setResult] = useState<Result | null>(null),
    [frozen, setFrozen] = useState(false),
    [previewConfirmed, setPreviewConfirmed] = useState(false);
  const attempt = useRef<Attempt | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    let timezone =
      Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
    const preference = safeStorage(
      () => localStorage,
      "getItem",
      "yuchen-meeting-timezone",
    );
    if (preference) {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: preference }).format();
        timezone = preference;
      } catch {}
    }
    setTz(timezone);
    try {
      const saved = JSON.parse(
        safeStorage(
          () => sessionStorage,
          "getItem",
          "yuchen-meeting-attempt",
        ) || "null",
      );
      if (saved?.token && saved?.key) {
        attempt.current = saved;
        setFrozen(true);
        setName(saved.name);
        setEmail(saved.email);
        setTopic(saved.topic);
        setDuration(saved.duration);
        setSelected({
          start: saved.start,
          end: new Date(
            Date.parse(saved.start) + saved.duration * 60000,
          ).toISOString(),
        });
        setError(
          "A previous request may still be processing. Check its status before booking again.",
        );
      }
    } catch {}
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    apiFetch(`/api/availability?duration=${duration}`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        const body = (await r.json()) as Availability & { error?: string };
        if (!r.ok) throw new Error(body.error);
        return body;
      })
      .then((body) => {
        setData(body);
        setLoading(false);
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setLoadError(e.message || "Unable to load available times.");
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [duration, refresh]);
  const today = dayKey(new Date(data?.now || Date.now()), tz);
  const days = useMemo(
    () => calendarDays(data?.now || Date.now(), tz),
    [data?.now, tz],
  );
  const byDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const slot of data?.slots || []) {
      const key = dayKey(slot.start, tz);
      map.set(key, [...(map.get(key) || []), slot]);
    }
    return map;
  }, [data, tz]);
  useEffect(() => {
    if (frozen) return;
    const first =
      selected &&
      byDay
        .get(dayKey(selected.start, tz))
        ?.some((s) => s.start === selected.start);
    if (selected && !first) setSelected(null);
    setDay((d) => (byDay.has(d) ? d : byDay.keys().next().value || ""));
  }, [byDay, frozen, selected, tz]);
  const timezones = useMemo(() => {
    const all =
      typeof Intl.supportedValuesOf === "function"
        ? Intl.supportedValuesOf("timeZone")
        : [
            "America/New_York",
            "America/Los_Angeles",
            "Europe/London",
            "Asia/Shanghai",
            "Asia/Tokyo",
          ];
    return Array.from(new Set([tz, "UTC", ...all]));
  }, [tz]);
  function clearAttempt() {
    attempt.current = null;
    setFrozen(false);
    safeStorage(() => sessionStorage, "removeItem", "yuchen-meeting-attempt");
  }
  async function pollBooking(id: string, token: string, tries = 0) {
    try {
      const response = await apiFetch(`/api/bookings/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await response.json()) as Result & { error?: string };
      if (!response.ok) throw new Error(body.error);
      setResult(body);
      if (body.status === "confirmed") {
        setError("");
        safeStorage(
          () => sessionStorage,
          "removeItem",
          "yuchen-meeting-attempt",
        );
        return;
      }
      if (body.status === "failed" || body.status === "cancelled") {
        setResult(null);
        clearAttempt();
        setError(
          "The calendar did not confirm this booking. Please choose a new time.",
        );
        setSelected(null);
        setRefresh((v) => v + 1);
        return;
      }
      if (tries < 10)
        timer.current = setTimeout(
          () => void pollBooking(id, token, tries + 1),
          5000,
        );
      else
        setError(
          "Confirmation is taking longer than usual. Keep this page open and check again shortly. Your time remains reserved.",
        );
    } catch {
      setError(
        "Unable to check confirmation right now. Your request has been kept; please check again.",
      );
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected && !attempt.current) return;
    setError("");
    if (data?.demo) {
      setPreviewConfirmed(true);
      return;
    }
    setSending(true);
    if (!attempt.current && selected) {
      attempt.current = {
        name,
        email,
        topic,
        website,
        start: selected.start,
        duration,
        timezone: tz,
        key: crypto.randomUUID(),
        token: crypto.randomUUID() + crypto.randomUUID(),
      };
    }
    const current = attempt.current!;
    setFrozen(true);
    safeStorage(
      () => sessionStorage,
      "setItem",
      "yuchen-meeting-attempt",
      JSON.stringify(current),
    );
    try {
      const response = await apiFetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(current),
      });
      const body = (await response.json()) as Result & { error?: string };
      if (!response.ok) {
        if ([400, 409, 415].includes(response.status)) {
          clearAttempt();
          if (response.status === 409) {
            setSelected(null);
            setRefresh((v) => v + 1);
          }
        }
        throw new Error(body.error || "Unable to complete your request.");
      }
      setResult(body);
      if (body.status === "pending") void pollBooking(body.id, current.token);
      else if (body.status === "confirmed")
        safeStorage(
          () => sessionStorage,
          "removeItem",
          "yuchen-meeting-attempt",
        );
      else {
        setResult(null);
        clearAttempt();
        setError(
          "The calendar did not confirm this booking. Choose another time and try again.",
        );
        setSelected(null);
        setRefresh((v) => v + 1);
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Connection interrupted. Check your booking status before trying a new time.",
      );
    } finally {
      setSending(false);
    }
  }
  const locked = frozen || sending;
  const selectedSlots = byDay.get(selectedDay) || [];
  const [icsError, setIcsError] = useState("");
  async function downloadInvite() {
    if (!result || !attempt.current) return;
    try {
      const r = await apiFetch(`/api/bookings/${result.id}/calendar`, {
        headers: { Authorization: `Bearer ${attempt.current.token}` },
      });
      if (!r.ok) throw new Error();
      const href = URL.createObjectURL(await r.blob()),
        a = document.createElement("a");
      a.href = href;
      a.download = "meeting-with-yuchen.ics";
      a.click();
      URL.revokeObjectURL(href);
    } catch {
      setIcsError("Could not download the invitation. Please try again.");
    }
  }
  return (
    <main className="page-shell">
      <header className="hero">
        <h1>Meet with Yuchen Zhou</h1>
      </header>
      {data?.demo && (
        <div className="demo-banner">
          Local preview · Sample availability · No invitations are sent
        </div>
      )}
      {result || previewConfirmed ? (
        <section className="card confirmation" aria-live="polite">
          <h2>
            {previewConfirmed
              ? "Preview complete"
              : result?.status === "confirmed"
                ? "Meeting confirmed"
                : "Confirming your meeting…"}
          </h2>
          <p>
            {previewConfirmed
              ? "This is a preview. No meeting was booked and no invitation was sent."
              : result?.status === "confirmed"
                ? `A calendar invitation is on its way to ${email}.`
                : "Your time is reserved while we verify the invitation. Please don’t submit another booking."}
          </p>
          <div className="confirmation-details">
            <div>
              <strong>{fullDate(result?.start || selected!.start, tz)}</strong>
              <span>
                {time(result?.start || selected!.start, tz)} –{" "}
                {time(result?.end || selected!.end, tz)} ·{" "}
                {tz.replaceAll("_", " ")}
              </span>
            </div>
          </div>
          {result?.status === "confirmed" && (
            <div className="confirmation-actions">
              <a
                className="primary-button"
                href={result.zoomUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open Zoom{" "}
              </a>
              <button
                className="secondary-button"
                onClick={() => void downloadInvite()}
              >
                Download calendar invite
              </button>
            </div>
          )}
          {result?.status === "pending" && (
            <button
              className="secondary-button"
              onClick={() => {
                setError("");
                void pollBooking(result.id, attempt.current!.token);
              }}
            >
              Check confirmation
            </button>
          )}
          {previewConfirmed && (
            <button
              className="secondary-button"
              onClick={() => setPreviewConfirmed(false)}
            >
              Back to preview
            </button>
          )}
          {(error || icsError) && (
            <p className="error-message" role="alert">
              {error || icsError}
            </p>
          )}
          <p className="fine-print">
            {result?.status === "confirmed"
              ? "Need to make a change? Reply to the calendar invitation."
              : "All times are shown in your selected timezone."}
          </p>
        </section>
      ) : (
        <>
          <section className="card booking-card">
            <h2>Choose a time</h2>
            <div className="duration-picker" aria-label="Meeting duration">
              {[30, 60].map((n) => (
                <button
                  key={n}
                  disabled={locked}
                  aria-pressed={duration === n}
                  className={duration === n ? "active" : ""}
                  onClick={() => {
                    setDuration(n);
                    setSelected(null);
                  }}
                >
                  {n} minutes
                </button>
              ))}
            </div>
            <label className="timezone-control">
              <span>Timezone</span>
              <select
                value={tz}
                onChange={(e) => {
                  setTz(e.target.value);
                  safeStorage(
                    () => localStorage,
                    "setItem",
                    "yuchen-meeting-timezone",
                    e.target.value,
                  );
                  if (selected) setDay(dayKey(selected.start, e.target.value));
                }}
              >
                {timezones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <div aria-live="polite" aria-busy={loading}>
              {loading ? (
                <div className="empty-state">
                  <LoaderCircle className="spin" size={22} />
                  <p>Finding available times…</p>
                </div>
              ) : loadError ? (
                <div className="empty-state">
                  <p>{loadError}</p>
                  <button
                    className="text-button"
                    onClick={() => setRefresh((v) => v + 1)}
                  >
                    Try again
                  </button>
                </div>
              ) : !data?.ready ? (
                <div className="empty-state">
                  <p>Booking is not available yet. Please check back soon.</p>
                </div>
              ) : (
                <>
                  <div className="calendar-title">
                    <strong>
                      {dateLabel(days[0], { month: "long" })}
                      {dateLabel(days[0], { month: "long" }) !==
                      dateLabel(days.at(-1)!, { month: "long" })
                        ? ` – ${dateLabel(days.at(-1)!, { month: "long" })}`
                        : ""}{" "}
                      <span>{dateLabel(days[0], { year: "numeric" })}</span>
                    </strong>
                    <small>Next 3 weeks</small>
                  </div>
                  <div className="date-grid">
                    {days.map((day, i) => {
                      const available = byDay.has(day);
                      return (
                        <button
                          key={day}
                          disabled={!available || locked}
                          aria-pressed={selectedDay === day}
                          aria-label={
                            dateLabel(day, {
                              weekday: "long",
                              month: "long",
                              day: "numeric",
                            }) + (available ? "" : ", unavailable")
                          }
                          className={`date-cell ${selectedDay === day ? "selected" : ""} ${day === today ? "today" : ""}`}
                          onClick={() => {
                            setDay(day);
                            setSelected(null);
                          }}
                        >
                          <span>{dateLabel(day, { weekday: "short" })}</span>
                          <strong>{dateLabel(day, { day: "numeric" })}</strong>
                        </button>
                      );
                    })}
                  </div>
                  <div className="times-heading">
                    <h3>
                      {selectedDay
                        ? dateLabel(selectedDay, {
                            weekday: "long",
                            month: "short",
                            day: "numeric",
                          })
                        : "No open times"}
                    </h3>
                    <span>{selectedSlots.length} available</span>
                  </div>
                  <div className="times-grid">
                    {selectedSlots.map((slot) => (
                      <button
                        key={slot.start}
                        disabled={locked}
                        className={
                          selected?.start === slot.start ? "selected" : ""
                        }
                        aria-pressed={selected?.start === slot.start}
                        onClick={() => {
                          setSelected(slot);
                          setError("");
                        }}
                      >
                        {time(slot.start, tz)}
                      </button>
                    ))}
                  </div>
                  {!selectedSlots.length && (
                    <p className="subtle-text">
                      There are no open times on this date. Try another day or a
                      shorter meeting.
                    </p>
                  )}
                </>
              )}
            </div>
            {data?.ready && (
              <p className="card-note">Same-day bookings welcome.</p>
            )}
          </section>
          {(selected || frozen) && (
            <section className="card details-card">
              <h2>Your details</h2>
              <div className="selected-summary">
                <span>
                  {fullDate(attempt.current?.start || selected!.start, tz)}
                  <strong>
                    {time(attempt.current?.start || selected!.start, tz)} ·{" "}
                    {attempt.current?.duration || duration} minutes · Zoom
                  </strong>
                </span>
              </div>
              <form onSubmit={submit}>
                <div className="form-row">
                  <label>
                    Your name
                    <input
                      name="name"
                      autoComplete="name"
                      required
                      maxLength={100}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={locked}
                    />
                  </label>
                  <label>
                    Email address
                    <input
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      maxLength={254}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={locked}
                    />
                  </label>
                </div>
                <label>
                  What would you like to talk about? <span>Optional</span>
                  <textarea
                    name="topic"
                    rows={3}
                    maxLength={1500}
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    disabled={locked}
                  />
                </label>
                <div className="honeypot" aria-hidden="true">
                  <label>
                    Website
                    <input
                      name="website"
                      tabIndex={-1}
                      autoComplete="off"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                    />
                  </label>
                </div>
                {error && (
                  <p className="error-message" role="alert">
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  className="primary-button book-button"
                  disabled={sending}
                >
                  {sending ? (
                    <>
                      <LoaderCircle size={17} className="spin" />
                      Confirming…
                    </>
                  ) : frozen ? (
                    "Check previous booking"
                  ) : (
                    "Confirm meeting"
                  )}
                </button>
                <p className="fine-print">
                  You’ll receive a calendar invitation with the Zoom link.
                </p>
              </form>
            </section>
          )}
        </>
      )}
      <footer>
        <span>© 2023–{new Date().getFullYear()} Yuchen Zhou</span>
      </footer>
    </main>
  );
}
