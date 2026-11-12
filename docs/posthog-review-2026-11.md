# PostHog review, 2026-11

Read 2026-11-09 from PostHog project 630638: the last 30 days (Oct 10 – Nov 9), internal cohort
left out, counted per player. About 150 players started a game, so a group under ~10 is a hint.

## Summary for Cole

**Why players stop.** The game loses most people in the first two minutes, before the ecosystem
does anything interesting:
- Of 97 computer players who started a game, 18 never used a tool, 20 more never finished a goal,
  and 34 reached 10 minutes. On phones: 50 → 38 → 28 → 18.
- **Story mode loses twice as many people as Free Play.** Of 49 players whose first game was the
  campaign, 27% reached 10 minutes and 8% came back another day. For Free Play it was 40% and 20%.
  Half of the PNW players who open Chapter 1 ("Wake up the fields") never finish it.
- **30 players opened the game, read the mode choice and the chapter story, and left after
  under a minute without touching anything.**
- On phones, about 1 in 5 stop at "Turn your phone sideways".
- Fires and floods don't drive people away (3 of 29 players left within 3 minutes of a crown fire).
  Running out of money is common in long games but isn't what ends short ones.

What the data couldn't say until now: which chapter step players stall on, what the game told
them just before they left, how long they read each panel, how long loading takes, and which
species they found. `species_discovered` has sent the species *count* instead of its name since
the start. **The new events below now record all of that.**

**Performance.** Most of the frame time players lose goes to a few specific causes:
- In Sumatra's opening view, **oil-palm crowns alone are 70% of everything drawn** (1.75M of 2.5M
  triangles), because palms never got a far model.
- Phones draw few pixels and spend only ~13 ms of a 40 ms frame on the processor. The other
  ~27 ms is the graphics chip or the browser, and nothing measures it yet.
- On ordinary laptops, both the processor's drawing work (15 ms) and the graphics chip (18 ms)
  are over budget; the simulation is 4 ms.

There are bigger moves than settings tweaks that keep the look: give palms a far model, draw
distant trees as baked pictures of the real models, grow plants on the graphics chip instead of
redrawing them, and run the simulation on a second processor core. They're ranked below.

## Why players stop: the evidence

| Step (30 days) | Computers | Phones |
| --- | ---: | ---: |
| Started a game | 97 | 50 |
| Used a tool | 79 | 38 |
| Finished a first goal | 59 | 28 |
| Five goals | 41 | 21 |
| 10 active minutes | 34 | 18 |
| Came back another day | 19 of 98 | 5 of 49 |

- **Leaving before touching anything (30 players).** Their median active time was 0.7 min. The
  panels they had opened: "How do you want to play?" and, for the campaign, "Chapter 1: Wake up the
  fields". On exit, 91 departures were closing the tab with the mode choice still open, and 52 with
  "Welcome to Second Growth" open. The first screen asks for a decision and reading before anything
  moves.
- **Trying a little, then leaving (31 players).** About 9 brush strokes, no goal, gone at about
  2 minutes. Rarely "not enough money" or "unsuitable ground" in that window: they weren't
  blocked, they just didn't see anything happen. The first rewards come in game years (the
  `plant` goal at year 1, `species12` at year 2), so the land looks unchanged at first.
- **Campaign vs Free Play (first game):** campaign 49 players → 22 first goal, 13 ten minutes,
  4 returned; Free Play 96 → 62, 38, 19. PNW Chapter 1: 41 started, 21 finished (median 66 game
  days). Its three objectives are inspect a tile, loosen 60 tiles and sow 150 tiles: setup
  chores before any reward. Later chapters keep most of the players who reach them (Ch. 2: 16 → 13).
- **Long players hit walls but stay.** Among players who played 30+ minutes, 69% had been refused
  for money and the median was 34 refusals for unsuitable ground. Most refused: `mix_meadow`
  (18 players), `mix_wet`, `mix_groundcover`, `mix_pioneer`; for money: `pull`, `demolish`, `pond`.
  It's friction, not a reason to quit, but the "unsuitable" count suggests the brush preview
  isn't read.
- **Maps:** first-map players reaching 10 minutes: Chinandega 8/12, Atlanta 6/9, PNW 25/82,
  Sumatra 3/16. Sumatra is also the slowest map. Small groups, but worth watching.

### New events (this commit)

| Event | When | Fields | Answers |
| --- | --- | --- | --- |
| `game_loaded` | first frame drawn | `load_ms`, `steps` (each loading step's start, ms), map, quality, gpu | how long loading really takes and which step is slow |
| `loading_left` | tab closed during loading | `stage`, `seconds` | who gives up on the loading screen |
| `load_failed` | load error shown | `stage`, `message` | broken loads |
| `panel_closed` | any panel closed | `panel`, `seconds` | whether the welcome, mode choice and chapter story get read or skipped |
| `objective_done` | each campaign objective ticked | chapter, `chapter_key`, `objective` (1–3), `desc`, `days_in_chapter`, `active_minutes` | which step of Chapter 1 players stall on |
| `quest_help` | "Need help? Where and how" opened | chapter, `objectives_done` | where players are confused |
| `warning_shown` | a game warning, once per wording a session (max 8) | `text` (numbers as #) | what the game was saying before people left |
| `species_lost` | a wild species gone since last month (max 5) | `species` | whether losing animals drives people away |
| `perf_sample` at 10 s | as before, plus a 10 s sample | — | the opening view apart from later play |
| `game_left` / `went_idle` gain | — | `tools_session`, `fails_money_session`, `fails_unsuitable_session`, `rewards_session`, `seconds_since_tool`/`_fail`/`_reward`/`_fire`/`_flood`, `paused_seconds`, `fast_seconds`, `last_month_net`, `zoom`, `species_lost_session`, `warnings_session`, campaign `objectives_done`/`objectives`/`next_objective`/`next_objective_progress`, or Free Play `goals_open` | what the player was doing, waiting for and stuck on when they left |

Fixed: `species_discovered.species` is now the species' key (the old value was the count, now in
`species_present`). Check: `node tools/play-analytics-browser-check.mjs` (in the browser suite).

Read them a week after this goes live. The questions to ask:
- Do quitters' `seconds_since_reward` look long?
- Which `next_objective` do campaign players leave on?
- Is `panel_closed.seconds` on the welcome under 3 s, meaning nobody reads it?
- Does `warning_shown` come just before exits?

## What to fix next for players (ranked)

1. **First two minutes: show something happening (M). Done 2026-11-11:** a first visit (no saved
   farm) starts straight in Free Play with a "Try it" tip, and returning players keep the chooser.
   The first goal on every map, `sprout` ("First sprouts", 10 plants, `FIRST_GOAL` in `goals.js`),
   is checked daily (`daily: true`), so one stroke pays within about 2 seconds. Its follow-up
   offers Story mode once per device, and the menu has a Story mode entry. Groundcover seedlings
   are drawn at least as large as at growth 0.3 (`SPROUT_G` in `flora.js`, drawing only), so a
   sown strip shows from the default zoom. PNW Chapter 1 now opens with "sow your first 10 tiles"
   in place of "inspect a tile", and has smaller chores (loosen 40, sow 120). Ticked objectives show
   a toast. Measure it with `game_start.first_visit`, `goal_completed` for `sprout` and the time
   it takes, `story_offered` / `story_offer_taken`, `objective_done` objective 1 on `fields`, and
   `seconds_since_reward` on `game_left`. Check: `tools/first-minutes-browser-check.mjs`.
   Ideas, best first:
   - Start Free Play by default and offer the story as a choice later. The mode screen is
     where people leave, and Free Play keeps twice as many.
   - Make the first stroke pay off within seconds: a quick visual (sprouts, a bird landing on the
     new meadow) and a small early goal reachable in the first minute.
   - Shorten Chapter 1 to one action with an immediate payoff before the chores.

   The new `objective_done`, `panel_closed` and `seconds_since_reward` events will show which
   matters most. Code: `js/ui/ui.js` (start flow, `openChapter`), `js/sim/campaign.js`
   (`pnwChapters`), `js/sim/goals.js`.
2. **Phones stuck at "turn sideways" (S). Done 2026-11-10:** a rotation-lock hint and "Play upright anyway" (remembered per device; `rotate_prompt_cleared` gains `upright`), and the screen is centred. 14 of 75 phone players never turned the phone; 13 never
   started. Add a rotation-lock hint and "Play upright anyway". `#rotate-hint` in `index.html`.
3. **Unsuitable-ground refusals (S–M). Done 2026-11-10.** The warning after a refused stroke leads with the unlocked tool of the same layer that suits the spot, then the reasons (`refusal` in `js/tool-actions.js`: `plantLimits` and `suitedTool`), so a phone's two-line toast still shows it. Before the stroke, the brush cursor tip adds a second line on a tile the tool would refuse ("too shady, too wet · try Forest floor mix"; `refusalTip` in `js/input.js`, worked out only when the hovered tile changes). Touch has no hover, so phones get it from the first refused tap's warning. Worth rechecking `fails_unsuitable_session` after a release.

## Performance: bigger moves that keep the look (ranked by expected gain)

| Players (30 d) | fps | Simulation | Drawing (processor) | Graphics chip | Triangles |
| --- | ---: | ---: | ---: | ---: | ---: |
| Built-in Intel/AMD laptops, Chromebooks (55) | 25 | 4.3 ms | 15.1 ms | 18.5 ms | 0.8M |
| Phones and tablets (48) | 25 | 2.5 | 9.9 | not measured | 0.8M |
| Macs (24) | 29 | 2.0 | 6.5 | 11.5 | 1.4M |
| Discrete graphics cards (10) | 55 | 1.4 | 4.9 | 5.7 | 1.4M |

Sumatra on computers: 18 fps, drawing 26 ms, chip 24 ms, 3.6M triangles (7M after 15 minutes).
Amazon: chip 39 ms.

1. **Far models for palms (S–M, Sumatra 2–3× fewer triangles). Done 2026-11-10, with giant clams (decision 0022).** Measured in a fresh Sumatra game
   on Fast: 2,474+ oil-palm crowns at 476 triangles each = 1.75M of the view's 2.5M triangles.
   `far-models.js` skips palms, bamboo and corals ("keeps its distant model"). A far palm with
   about 40 triangles (crossed fronds) looks the same at the size palms are drawn zoomed out (a few
   pixels). Expected: Sumatra's opening view ~2.5M → ~0.9M, and palm shadows shrink by the same
   share. Check with `far-model-check` and `far-vegetation-review`.
2. **Baked pictures of distant trees ("impostors", M–L, rainforest 5–10× fewer triangles).** At
   load, render each tree model from a few angles into a small texture, including the colour and
   the surface direction so it still lights correctly through the day. Then draw far trees as one
   flat card each (2 triangles). The camera has a fixed tilt, so few angles are needed. Zoomed-out
   rainforest goes from millions of triangles to tens of thousands, with the same pixels on screen.
   This is what large open-world games use for forests.
3. **Grow plants on the graphics chip (M, cuts the daily redraw).** Today every growing plant
   changes daily, so nearly every plant region is re-sent each game day (perf review finding 2(b);
   `flora.js`, `flora-changes.js`). Instead, send each plant's planting day and growth rate once
   and let the vertex shader compute its size from the game day. The drawing is exactly as now,
   with no stepped sizes (the prototype Cole dropped), and the processor no longer replays growth.
4. **Simulation on a second core (L).** On laptops the simulation is 4–7 ms of every frame (Sumatra
   6.6 ms) and most of the top-speed cost, and it runs in turn with drawing. A Web Worker running
   `game.update` and sending positions back would let both run at once. Decision 0004 asked for a
   measured bottleneck first, and this is the measurement. Catch: shared memory needs special
   server headers that GitHub Pages and itch.io don't send, so the worker would post a compact
   snapshot (animal positions, changed tiles) each frame. Needs a design review first.
   **Designed 2026-11-10, [0045](decisions/0045-simulation-worker.md): no-go for now.** At normal speed the
   graphics chip is the limit on every device class, so the gain is 0–5%. Revisit after moves 2–3.
5. **Find the phones' missing 27 ms (S to measure).** Phones draw only 0.36 megapixels and spend
   ~13 ms on the processor, yet frames take ~40 ms. iOS hides graphics-chip timing. Measure on a
   real iPhone with Safari's timeline, and test the suspects: foliage wind and leaf lighting
   computed per pixel (`plant-materials.js`), alpha-tested leaf overdraw, and the shadow pass.
   Only then pick a fix.
6. **Rough first 30 seconds.** Every map runs slower at 30 s than at 2 min, still after the Nov 2
   release. Amazon goes from 21 to 25 fps, Sumatra from 16 to 24. Fix 1 removes most of Sumatra's
   case. The new 10 s sample and `game_loaded.steps` will show the rest.

Not recommended: lowering the drawing resolution (it changes the look, and decision 0004's target
is native resolution).

## Errors

Rare. The bird `passage.swoop` crash (`actors.js:390`) was fixed Oct 31 (`429f012`); it shows
only from the cached Oct 25 release. "ResizeObserver loop completed" (44 players) is a harmless
browser warning, now filtered in `reportError` (`js/analytics.js`). Singles: "Maximum call stack
size exceeded" (Nov 5, current release), "Unable to decode audio data" (Nov 8).

## Load time

Not measured until `game_loaded`. Since Oct 18 the browser's largest-paint time is p50 1.5–3.5 s and
p90 10–13 s, against 0.6–0.9 s and 3–4 s before, on every host. That may only be the new loading
screen (`e7cf210`) changing what counts as "largest". Players take a median 56 s (computers) and
37 s (phones) from page load to their first tool.

## How to repeat

PostHog MCP connector, HogQL via `execute-sql`, excluding cohort 595715. Device class from `$os`
(iOS/Android = phone) and `gpu` (NVIDIA/Arc = discrete). Events are listed in
[posthog-player-perf.md](posthog-player-perf.md).
