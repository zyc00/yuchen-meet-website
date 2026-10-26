# Meeting timetable

Replace the separate date picker and time-button list with a restrained weekly timetable, as requested. Keep the homepage paper, ink, teal and fonts. Use seven date columns and 30-minute start-time rows, previous/next week controls, muted unavailable cells and a clear selected cell. Every enabled cell must correspond to an API-provided absolute start time. A 60-minute meeting still supports starts on the existing 30-minute grid.

The existing booking request, calendar integration and recovery behavior remain unchanged. Show the selected date/time below the table with a Continue action to the details form. On narrow screens, scroll the timetable horizontally while keeping date headers and time labels visible; avoid making the whole page overflow.

Approach: a semantic HTML table with native buttons fits the requested timetable and the existing lightweight frontend. A third-party calendar library would add unnecessary UI and dependencies; retaining the separate day/time pickers would not meet the request. Week paging, compact cell styling and responsive dimensions are implementation choices.

Timezone conversion must retain every actual slot, including repeated wall times during DST and quarter-hour offsets. Empty, loading, closed and failed availability must remain honest and non-bookable. No live test invitations.

Visual refinement: following the user's feedback and the overview at meet.jiayuanm.com, keep all time text on the left axis. Grid cells contain color only, including the selected cell. Use compact rectangular blocks, small gutters, pale green availability and muted unavailable slots. Exact times remain in accessible names/native tooltips and the selection summary below the calendar. Keep the page narrow, place duration/timezone controls on one row, and remove redundant explanatory rows.

Occupancy correction: a missing available start does not imply a calendar event. Only future half-hour intervals overlapping the API's actual `busy` intervals use the blue Busy color. Past starts are faded gray; other disabled starts (closed hours, insufficient room for the chosen duration, horizon boundaries) are gray. Available starts use cream and selection uses light blue. Enumerate UTC half-hours for disabled-state classification so DST and quarter-hour offsets remain correct; only API-provided slots can become buttons.

Keep a server-relative clock advancing while the page is open, including across sleep and refocus. Remove expired buttons and clear an expired selection unless a booking request is already locked. Regression coverage includes elapsed/current starts, duration padding, real interval overlap, cross-midnight and quarter-hour timezones, DST repetitions/gaps, and excluded dates.
