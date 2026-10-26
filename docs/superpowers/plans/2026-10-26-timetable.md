# Meeting Timetable Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline, following the established execution workflow.

**Goal:** Give visitors a clear weekly grid of selectable meeting start times.

**Architecture:** A pure timetable grouping helper feeds a focused React component. The existing booking page owns selection and submission. CSS supplies sticky table headers, cell states and contained scrolling.

**Tech Stack:** Existing React, TypeScript and CSS; no new dependencies.

**Spec:** docs/superpowers/specs/2026-10-26-timetable-design.md

## Global Constraints
- Preserve homepage colors/fonts, actual API slots, 30/60 minutes, timezone selection and recovery behavior.
- Do not change backend booking rules, authentication, DNS or calendar permissions.
- Test selection locally without sending real invitations; publish through the existing GitHub Pages branch.

## Review Focus
- A week/date boundary must not omit the final bookable date.
- Repeated DST wall times must retain distinct absolute instants.
- Non-hour timezone offsets must preserve exact displayed start times.
- Empty/unavailable cells must never synthesize a bookable time.
- Mobile scrolling, selection visibility and keyboard access must remain usable.

### Task 1: Timetable and booking integration
- [x] Add failing helper tests for missing cells, week filtering, quarter-hour offsets and repeated DST times.
- [x] Implement lib/client/timetable.mjs and components/time-table.tsx.
- [x] Replace date/time pickers in components/booking-page.tsx; keep all submit/recovery code intact.
- [x] Style the week grid in src/styles.css; add selected-time summary and Continue action.
- [x] Run tests/build and inspect desktop/mobile, duration/timezone changes, paging and selection in a read-only local fixture.
- [ ] Review changes, commit/push source and publish gh-pages; verify deployed assets.

## Verification record
- 44 tests and both production builds passed.
- Independent review found no Critical/Important issues.
- Actual browser navigation reached the final partial week (November 16), with Next disabled afterward; this supplements the pure helper tests.
- Keyboard selection, Continue focus, 30/60-minute switching, New York/Shanghai/Katmandu conversion and a 390px viewport were checked.
- Mobile page width stayed 390px while only the timetable scrolled; its time axis remained fixed after horizontal scrolling.
- UI checks used read-only snapshots of public availability with all booking writes blocked.
