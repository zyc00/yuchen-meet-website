# GitHub Pages Migration Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan in this session.

**Goal:** Publish the existing plain meeting UI from `zyc00/yuchen-meet-website` on GitHub Pages.

**Architecture:** Static React/Vite UI with an explicit independent API origin. No backend connection means closed availability, never simulated production bookings. Backend migration follows the user's provider choice.

**Tech Stack:** React 19, Vite 8, TypeScript, GitHub Pages.

**Spec:** docs/superpowers/specs/2026-10-26-github-pages-design.md

## Global Constraints
- Preserve the plain visual design and booking behavior.
- No OpenAI Sites runtime, deployment plugin, secrets or account metadata in the new repository.
- Custom domain is meet.yuchenzh.com; DNS target is zyc00.github.io.
- No paid service enrollment or invitations during testing.

## Review Focus
- Missing backend must stay closed, including direct booking submissions.
- Browser credentials must never target an insecure or malformed API URL.
- All four booking requests must use the same configured API origin.
- Public bundle must contain no OAuth tokens or private backend configuration.
- Existing homepage deployment must remain intact.

### Task 1: Static application
- [x] Copy booking component, styles and browser-only helpers into the isolated new repository.
- [x] Add API adapter tests for closed mode, secure origin validation and forwarded requests; run red, then implement.
- [x] Create Vite entry, metadata, CNAME and minimal dependencies.
- [x] Run tests, typecheck, production build and browser visual check.

### Task 2: Publication
- [x] Review public source, initialize independent Git repository, commit and create zyc00/yuchen-meet-website.
- [x] Publish built assets to gh-pages and configure Pages for meet.yuchenzh.com.
- [x] Verify deployment and report any DNS/backend dependencies.
- [x] Migrate backend after provider choice; retire prior Sites hosting after replacement is ready.

## Deployment status
- Source and gh-pages branches are published to zyc00/yuchen-meet-website.
- DNS points to GitHub Pages and the independent Vultr API.
- Prior Sites domain binding is removed and its audience is owner-only.
- GitHub Pages HTTPS is enabled and the allowed Penn calendar is connected. Public 30/60-minute availability checks passed.
- The local network resolver still caches the old Sites CNAME; authoritative DNS and public resolvers point to GitHub Pages. HTTPS was verified against the GitHub endpoint without disabling certificate verification.
