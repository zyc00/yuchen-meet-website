import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, LoaderCircle } from "lucide-react";
type Settings = {
  enabled: boolean;
  timezone: string;
  hours: Record<string, string[][]>;
  excludedDates: string[];
};
type Status = {
  settings: Settings;
  connected: boolean;
  reconnectRequired: boolean;
  configured: boolean;
  calendar: string;
  oauthReady: boolean;
  redirectUri: string | null;
  pending: {
    id: string;
    start: string;
    end: string;
    name: string;
    email: string;
  }[];
};
const names = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
export function AdminPage() {
  const [data, setData] = useState<Status | null>(null),
    [settings, setSettings] = useState<Settings | null>(null),
    [exclusions, setExclusions] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [signedOut, setSignedOut] = useState(false),
    [loading, setLoading] = useState(true),
    [working, setWorking] = useState(false);
  async function load() {
    try {
      const r = await fetch("/api/admin");
      const b = (await r.json()) as Status & { error?: string };
      if (r.status === 401) setSignedOut(true);
      if (!r.ok) throw new Error(b.error);
      setData(b);
      setSettings(b.settings);
      setExclusions(b.settings.excludedDates.join("\n"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load settings.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    const params = new URLSearchParams(window.location.search);
    if (params.has("connected"))
      setNotice("Google Calendar is connected. Your schedule is ready.");
    if (params.has("connection_error"))
      setError(
        params.get("connection_error") === "identity"
          ? "Please connect the listed Google account. Other calendars cannot be connected."
          : "The Google connection was not completed. Verify the OAuth settings and grant both calendar permissions, then try again.",
      );
  }, []);
  async function post<T = unknown>(path: string, body: unknown = {}) {
    const r = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const value = (await r.json()) as T & { error?: string };
    if (!r.ok) throw new Error(value.error);
    return value;
  }
  async function action(fn: () => Promise<void>) {
    setError("");
    setNotice("");
    setWorking(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setWorking(false);
    }
  }
  const updateHours = (day: number, index: number, value: string) => {
    if (!settings) return;
    setSettings({
      ...settings,
      hours: {
        ...settings.hours,
        [day]: [
          [
            ...(settings.hours[day]?.[0] || ["10:00", "23:00"]).map((v, i) =>
              i === index ? value : v,
            ),
          ],
        ],
      },
    });
  };
  return (
    <main className="page-shell admin-shell">
      <a className="back-link" href="https://meet.yuchenzh.com">
        <ArrowLeft size={14} /> Back to booking page
      </a>
      <header className="hero">
        <h1>Meeting settings</h1>
        <p>Manage your calendar connection and open hours.</p>
      </header>
      {loading ? (
        <div className="card empty-state">
          <LoaderCircle className="spin" />
          <p>Loading settings…</p>
        </div>
      ) : signedOut ? (
        <section className="card">
          <h2>Sign in to manage availability</h2>
          <p className="admin-note">
            This area is only accessible to the website owner.
          </p>
          <a href="/admin" className="primary-button">Sign in</a>
        </section>
      ) : null}
      {error && !signedOut && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="admin-message" role="status">
          {notice}
        </p>
      )}
      {data && settings && (
        <>
          <section className="card">
            <h2>Google Calendar</h2>
            <p className="admin-note">{data.calendar}</p>
            <div
              className={`admin-status ${data.connected ? "connected" : ""}`}
            >
              <i />
              {data.reconnectRequired
                ? "Permission expired or revoked — reconnect Google Calendar"
                : data.connected
                  ? "Connected"
                  : "Not connected"}
            </div>
            {!data.oauthReady && (
              <p className="admin-note">
                Set the Google OAuth client ID, client secret and encryption key
                in your hosting environment before connecting. Register this
                authorized redirect URI:
                <br />
                <code>
                  {data.redirectUri ||
                    "https://meet-api.yuchenzh.com/api/google/callback"}
                </code>
              </p>
            )}
            <div className="admin-actions">
              <button
                disabled={!data.oauthReady || working}
                className="primary-button"
                onClick={() =>
                  void action(async () => {
                    const result = await post<{ url: string }>(
                      "/api/google/start",
                    );
                    window.location.assign(result.url);
                  })
                }
              >
                {data.connected
                  ? "Reconnect Google Calendar"
                  : "Connect Google Calendar"}{" "}
                <ArrowUpRight size={15} />
              </button>
              {data.connected && (
                <button
                  className="secondary-button"
                  disabled={working}
                  onClick={() =>
                    void action(async () => {
                      await post("/api/admin/disconnect");
                      await load();
                      setNotice("Calendar disconnected. Booking is paused.");
                    })
                  }
                >
                  Disconnect & pause
                </button>
              )}
            </div>
            <p className="admin-note">
              Meetings use your personal Zoom link. Calendar titles and guest
              details are never shown on the public page.
            </p>
          </section>
          <form
            className="card"
            onSubmit={(event) => {
              event.preventDefault();
              void action(async () => {
                const next = {
                  ...settings,
                  excludedDates: exclusions
                    .split(/[\n,]/)
                    .map((s) => s.trim())
                    .filter(Boolean),
                };
                await post("/api/admin/settings", next);
                setSettings(next);
                setNotice("Your availability has been saved.");
              });
            }}
          >
            <h2>Weekly availability</h2>
            <p className="admin-note">
              All hours below are in New York time. Visitors see their own
              timezone. No advance notice or buffer is required.
            </p>
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) =>
                  setSettings({ ...settings, enabled: e.target.checked })
                }
              />
              Accept new bookings once Google Calendar is connected
            </label>
            <div className="hours-editor">
              {[1, 2, 3, 4, 5, 6, 0].map((day) => {
                const active = !!settings.hours[day]?.length;
                return (
                  <div className="hours-row" key={day}>
                    <label>
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            hours: {
                              ...settings.hours,
                              [day]: e.target.checked
                                ? [["10:00", "23:00"]]
                                : [],
                            },
                          })
                        }
                      />
                      {names[day]}
                    </label>
                    {active ? (
                      <>
                        <input
                          aria-label={`${names[day]} opening time`}
                          type="time"
                          step={1800}
                          required
                          value={settings.hours[day][0][0]}
                          onChange={(e) => updateHours(day, 0, e.target.value)}
                        />
                        <span>to</span>
                        <input
                          aria-label={`${names[day]} closing time`}
                          type="time"
                          step={1800}
                          required
                          value={settings.hours[day][0][1]}
                          onChange={(e) => updateHours(day, 1, e.target.value)}
                        />
                      </>
                    ) : (
                      <span className="subtle-text">Unavailable</span>
                    )}
                  </div>
                );
              })}
            </div>
            <label>
              Dates to keep free <span>Optional</span>
              <textarea
                value={exclusions}
                onChange={(e) => setExclusions(e.target.value)}
                rows={3}
                placeholder={"2026-12-25\n2027-01-01"}
              />
            </label>
            <p className="admin-note">
              One date per line, in YYYY-MM-DD format. These dates will be
              unavailable for booking.
            </p>
            <button type="submit" className="primary-button" disabled={working}>
              {working ? "Saving…" : "Save availability"}
            </button>
          </form>
          {data.pending.length > 0 && (
            <section className="card">
              <h2>Awaiting calendar confirmation</h2>
              <p className="admin-note">
                These requests remain reserved because a calendar response was
                interrupted. Check Google Calendar before making manual changes.
                Confirmed events will be recovered when the visitor checks their
                booking.
              </p>
              {data.pending.map((b) => (
                <div key={b.id} className="pending-item">
                  <strong>
                    {b.name} · {b.email}
                  </strong>
                  <span>
                    {new Date(b.start).toLocaleString("en-US", {
                      timeZone: "America/New_York",
                    })}{" "}
                    New York
                  </span>
                </div>
              ))}
            </section>
          )}
        </>
      )}
      <footer>
        <span>Meet with Yuchen Zhou</span>
        <a href="https://meet.yuchenzh.com">
          Public booking page <ArrowUpRight size={12} />
        </a>
      </footer>
    </main>
  );
}
