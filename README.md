# Yuchen's meeting website

Public website for https://meet.yuchenzh.com, hosted on GitHub Pages alongside the academic homepage. The interface follows the homepage's colors and fonts.

## Development

Requires Node 22.13 or newer.

```sh
npm ci
npm run dev
npm test
npm run build
```

The `main` branch holds source code; `gh-pages` holds the built `dist/` assets. GitHub Pages serves `gh-pages` at `/`, with custom domain `meet.yuchenzh.com`. DNS: CNAME `meet` to `zyc00.github.io`.

## Booking API

The frontend uses `VITE_BOOKING_API_ORIGIN=https://meet-api.yuchenzh.com` for all calendar and booking requests. This is a public HTTPS URL, never a credential. Until Google Calendar is connected, the website keeps booking closed.

Google credentials and private calendar information belong in the backend, never in this repository or its published bundle. Google Calendar integration and Zoom invitations remain server-side responsibilities. No OpenAI Sites service is used by this frontend.

## Backend deployment

The Node server runs on Vultr, behind Nginx, using a persistent SQLite database. Deployment templates are in `deploy/`. Deploy `server/{index.mjs,app.mjs,database.mjs,lib,migrations,static}` plus the `oauth4webapi` runtime package. Build both interfaces locally with `npm run build`.

The systemd service runs as `yuchen-meeting` from `/opt/yuchen-meeting/app` and listens only on `127.0.0.1:8318`. Its root-owned environment file is `/etc/yuchen-meeting.env` (mode 600); the database lives in `/var/lib/yuchen-meeting/`. Keep the encryption key with encrypted database backups. Use SQLite's backup API or stop the service before copying the database; a live database copy alone can omit WAL transactions.

DNS: A record `meet-api` points to the backend server. First use the HTTP-only ACME configuration; it does not expose administration. Obtain a certificate for `meet-api.yuchenzh.com`, then switch to the HTTPS configuration and validate Nginx before reloading. Existing server blocks must remain intact.

Private administration is at `https://meet-api.yuchenzh.com/admin`, protected by a separate random password. Configure a Google OAuth web client with redirect URI `https://meet-api.yuchenzh.com/api/google/callback` and enable the Calendar API. The connection accepts only the configured Penn calendar identity. Required scopes: OpenID, email, owned calendar events, and calendar free/busy. A Google OAuth app in Testing mode may require reauthorization after seven days; use the appropriate production setup for ongoing personal use.

Open hours are 10:00–23:00 every day in America/New_York. Bookings use 30- or 60-minute durations, with no minimum notice, and include the owner's Zoom URL. The service checks Google busy times again before writing and stores durable reservations to prevent overlapping concurrent bookings. Tests use mocked Google responses and never send real invitations.
