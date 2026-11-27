# PostHog events: what the game sends and what it answers

PostHog project 630638. Everything goes through `track` / `trackExit` / `trackOnce` in `js/analytics.js`
(nothing on localhost without `?ph`, nothing when the player opts out or the browser asks not to be
tracked; `tools/analytics-privacy-check.mjs`). No names, emails or typed text, ever: properties are
game state, settings and device class. Testers carry `tester` (`?tester=dev|tester`) and the
project's test-account filter leaves them out. Performance fields: [posthog-player-perf.md](posthog-player-perf.md).

Dashboard: **Player drop-off**, https://us.posthog.com/project/630638/dashboard/2423211 (2026-11-27).

## The funnel, step by step

| Step | Event | Since |
| --- | --- | --- |
| Opens the page | `$pageview` (PostHog's own) | start |
| Loading | `game_loaded { load_ms, steps, map, quality, gpu, first_visit }`; left: `loading_left { stage, seconds }`; broken: `load_failed`, `webgl_context_lost`; **died**: `page_crashed { stage, map, seconds, minutes_ago }` | `first_visit` and `page_crashed` 2026-11-27 |
| Intro film (first visit) | `intro_started`, `intro_skipped`, `intro_finished`, `intro_failed`, `intro_not_offered` | 2026-11-23/24 |
| Game starts | `game_start { mode, map, first_visit? }` (`mode: 'continue'` for a return) | start |
| First animal | `first_animal_seen { seconds, species, beyond_fence? }` (first visit) | 2026-11-21 |
| Opening (0053) | `opening_prompt { step, map, seconds }` as each prompt shows (fence, culvert, pull, trees, meadow); `farm_opened { how: fence\|culvert, prompted }`; `opening_step { step, how }` (`skipped` for × on any prompt, fence and culvert included from 2026-11-27) | `opening_prompt` 2026-11-27 |
| Time-lapse | `timelapse_started`, `timelapse_watched` | 2026-11-22 |
| First tool / each tool | `first_tool`, `tool_used { tool, category, tiles, cost }`, `tool_failed { reason }`, `undo` | start |
| Play time | **`play_milestone { minutes: 1\|3\|10\|30, map, first_visit, opening_stage, last_tool, last_panel, fps_band, quality, tools_session, rewards_session, game_year, ... }`**, once each per page load; `play_heartbeat` every 5 active minutes | `play_milestone` 2026-11-27 |
| Rewards | `goal_completed`, `species_discovered`, `objective_done`, `chapter_complete`, `moment` | start / 2026-11-09 |
| Years | `year_reached` (each new game year, `game_year`) | start |
| Panels | `panel_opened { panel }`, `panel_closed { panel, seconds }` | start / 2026-11-09 |
| Leaving | `went_idle` (4 min untouched), `game_left { reason, active_minutes, session_minutes, ..., open_panel, last_panel, opening_stage, last_tool, first_visit, fps_band, quality, fps }` | where-fields 2026-11-27 |
| Coming back | a later `game_start` from the same person (Retention tile) | start |

"Active" time counts seconds with the tab visible and an input in the last two minutes.
`fps_band`: `under_15`, `15_25`, `25_40`, `40_up` (the last sample's frame rate; read against the
30 cap on phones and battery). `opening_stage`: `fence`, `culvert`, `pull`, `trees`, `meadow`, `done`, or null (not a first visit's farm).

## What it can and can't answer

Can: where a first visit stops in the opening, and whether the prompt was ever seen; how long
people play by device, map and frame rate; what was open or last touched when they left; who
leaves while loading; whose page died (from the next visit: a page that never comes back is never
counted); who comes back.

Can't, or only roughly:
- **What a player looked at** (no replays, on purpose: they cost frame rate). `last_panel` and
  `category` are the nearest.
- **Returns on iPhone Safari** when PostHog's id is lost: one player in Nov 2026 showed as ~25
  people, each a lone `panel_opened` "Welcome back" with no `$pageview` (see s5 notes). Count
  returns on desktop; read phone retention as a floor.
- **Why** someone left: the fields are circumstances, not reasons. The feedback form is the
  only "why".
- A crash with no next visit, and a crash in a private window (no storage).

## Adding an event

Name it `noun_verb` or `thing_reached`, add its properties here, never send free text a player
typed, extend `tools/play-analytics-browser-check.mjs` (fires in the real game) and, if it reads
or stores anything new, `tools/analytics-privacy-check.mjs`.
