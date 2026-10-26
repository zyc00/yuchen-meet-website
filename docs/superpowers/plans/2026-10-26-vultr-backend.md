# Vultr Booking Backend Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline.

**Goal:** Run the tested booking service on the user's existing Vultr server, with the public UI on GitHub Pages.

**Architecture:** Node.js HTTP adapter and SQLite preserve the existing service/domain/Google code. Nginx terminates HTTPS at meet-api.yuchenzh.com and proxies to a loopback service. Admin uses HTTP Basic authentication with a dedicated random password hash; Google OAuth callback is authorized by a single-use state created from the authenticated admin endpoint and validated for the exact Penn email.

**Tech Stack:** Node.js >=22.13, node:sqlite, OAuth4WebAPI, nginx, systemd, GitHub Pages.

**Spec:** User selected their server 108.61.10.140, GitHub repository zyc00/yuchen-meet-website, Google Cloud project under zyc200187@gmail.com, calendar zyc0187@engineering.upenn.edu.

## Global Constraints
- Preserve all existing reservation/idempotency/calendar tests, 30/60 minutes, daily10:00–23:00 America/New_York, zero lead time, supplied Zoom link.
- Do not modify existing nginx server blocks, existing application files or ports; no OS upgrades/reboots.
- No OpenAI Sites dependency. No passwords/tokens in git or logs.
- Isolated service user, data directory and systemd service; listen only on loopback.
- Restrict browser API access to the frontend's exact origin, with preflight handling and bounded request bodies.

## Review Focus
- Forged identity/proxy headers must not unlock administration or bypass IP limits.
- OAuth callback must still require a stored expiring single-use state and the Penn email.
- Concurrent bookings and uncertain Google writes must preserve durable holds across restart.
- Cross-origin browser requests, cancellation and invitation downloads must remain usable.
- Existing hosted services must remain healthy after nginx reload.

### Task 1: Server adapter and authentication
- [x] Copy tested booking domain/server and migrations; implement SQLite adapter.
- [x] Update owner authentication to dedicated password and remove Sites headers/UI.
- [x] Add tests for missing/wrong auth, accepted auth, forged headers, CORS and body limits; run before/after implementation.
- [x] Add Node server, private admin build and systemd/nginx templates.
- [x] Run all booking tests, build and independent review.

### Task 2: Deploy and connect
- [x] Install a supported Node runtime on the existing server, deploy app and private environment, apply SQLite migration.
- [x] Add isolated nginx server block, obtain certificate after DNS A meet-api is present.
- [x] Configure Google OAuth client under the user's personal project; obtain action-time approvals for credential creation/Google consent as required by browser policy.
- [ ] Connect the allowed Penn calendar and verify read-only availability; do not send a test invitation without an actual requested attendee/time.
- [ ] Publish GitHub Pages UI with API origin, check both hostnames, remove prior Sites domain binding/close old public access.

## Verification
- 39 automated tests passed; public and private admin production builds passed.
- Independent review completed; real meeting URL was removed from the public environment template before the initial commit.
- Isolated systemd service is running; existing services remain active.
- Backend HTTPS is active with automatic certificate renewal; unauthenticated administration returns 401.
- Google OAuth client and Calendar API are configured under the personal Cloud project; OAuth publishing status is In production.
- No live test invitations have been sent.
