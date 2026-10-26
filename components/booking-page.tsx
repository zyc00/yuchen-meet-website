import { apiFetch } from "../lib/client/api.mjs";
import { TimeTable } from "./time-table";
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
  const [selected, setSelected] = useState<Slot | null>(null);
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
  useEffect(() => {
    if (frozen || !selected || !data) return;
    if (!data.slots.some(slot => slot.start === selected.start)) setSelected(null);
  }, [data, frozen, selected]);
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
    <main className="page-shell booking-page">
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
            <h2 className="sr-only">Choose a time</h2>
            <div className="booking-settings">
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
                  {n} min
                </button>
              ))}
            </div>
            <label className="timezone-control">
              <span className="sr-only">Timezone</span>
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
                }}
              >
                {timezones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            </div>
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
                <TimeTable
                  slots={data.slots}
                  busy={data.busy}
                  timezone={tz}
                  now={data.now}
                  duration={duration}
                  selected={selected}
                  locked={locked}
                  onSelect={(slot) => {
                    setSelected(slot);
                    setError("");
                  }}
                  onContinue={() => {
                    document.getElementById("booking-details")?.scrollIntoView({
                      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
                      block: "start",
                    });
                    document.getElementById("booking-name")?.focus({ preventScroll: true });
                  }}
                />
              )}
            </div>
          </section>
          {(selected || frozen) && (
            <section className="card details-card" id="booking-details">
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
                      id="booking-name"
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
