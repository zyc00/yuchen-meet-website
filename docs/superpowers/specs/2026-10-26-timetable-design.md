# Meeting timetable

Replace the separate date picker and time-button list with a restrained weekly timetable, as requested. Keep the homepage paper, ink, teal and fonts. Use seven date columns and 30-minute start-time rows, previous/next week controls, muted unavailable cells and a clear selected cell. Every enabled cell must correspond to an API-provided absolute start time. A 60-minute meeting still supports starts on the existing 30-minute grid.

The existing booking request, calendar integration and recovery behavior remain unchanged. Show the selected date/time below the table with a Continue action to the details form. On narrow screens, scroll the timetable horizontally while keeping date headers and time labels visible; avoid making the whole page overflow.

Approach: a semantic HTML table with native buttons fits the requested timetable and the existing lightweight frontend. A third-party calendar library would add unnecessary UI and dependencies; retaining the separate day/time pickers would not meet the request. Week paging, compact cell styling and responsive dimensions are implementation choices.

Timezone conversion must retain every actual slot, including repeated wall times during DST and quarter-hour offsets. Empty, loading, closed and failed availability must remain honest and non-bookable. No live test invitations.
