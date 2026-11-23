# Time-lapse, take 2: short, automatic, after real planting

Cole's playtest notes on the first version (s4): during the 10-year skip the camera follows animals
and they move far too fast; the skip takes too long and is too much watching; and the player should
plant more before it, because no trees grow and the blackberry just spreads.

## Done

- **A fuller first planting, guided** (`js/ui/opening.js`, plans in the new `js/ui/opening-plan.js`).
  After the culvert, three short prompts, each one button with a result seen at once. Each can be
  done by hand instead or closed with ×.
  1. "Himalayan blackberry has the creek banks, and birds spread its seeds. First, pull out every
     stand on the farm." **Pull out the blackberry ($2,768)**. This pulls every invasive shrub on the
     farm, fence lines included.
  2. "The banks are bare. Trees along the creek shade the water…" **Plant trees along the creek
     (about $1,900)**. Pioneer trees go two tiles either side of the whole creek.
  3. "Last, a meadow beside them… drag across the field to sow it." Plant opens with the upland
     meadow mix chosen, so the player can drag it on. Or **Sow it here (about $250)** sows a 12 × 9
     patch beside the trees.

  The camera stays on the stretch of creek with the most blackberry. With the fence and culvert,
  about **$19,800 of the $30,000** is left. A step that would leave under $5,000 is skipped. The
  steps are generic (invasive shrubs, the cheapest tree mix, the first groundcover mix, the creek),
  so other maps get whichever of them apply. A map with no fence or culvert goes straight to them.
  The quiet first minutes (s2) are unchanged. New event: `opening_step { step, how: button|hand|skipped, seconds }`.
- **The time-lapse plays on its own**, 3 s after the meadow, once per farm (`flags.lapseOffered`).
  On a map without the guided steps it plays after the first planting. There's no offer note any
  more. "Watch 10 years" stays in the Menu and now uses the same fast lapse. Any click, key or wheel
  ends it at once, back at normal speed.
- **Speed: the game's own lapse clock** (`Game.startLapse` / `lapseDay` / `stopLapse`). Each day is
  stepped exactly as a headless run steps it: the day's work, then the animals in ten tenth-of-a-day
  steps, as `balance-sim` does. So the ecology is the same, and seeded `/balance` wasn't needed. The
  days go in parts between drawn frames, as much per frame as a budget allows. The budget grows
  while frames come faster than 30 a second and shrinks below that, with a cap of 60 game days a
  second. Monthly autosaves wait for the end (otherwise 40 saves in 20 s). The time-lapse stops
  after 45 s however many years it has reached, and the line says how many.
- **Camera on the land**: one slow drift round the guided steps' spot (from the Menu, the thickest
  part of the planting). The turn eases in after a 3 s glide, and it never follows an animal.
  Animals, carcasses and visitors aren't drawn while it runs (`Actors.hidden`).
- **The end**: the clock goes back to normal speed and the animals come back. The camera frames one
  newcomer that arrived meanwhile (a ground animal near the planting is preferred) for 6 s, with its
  name in the caption. Then control comes back with one line, for example "Ten years on: 52 trees
  and 7 shrubs stand where you planted, and Brush rabbit, Douglas squirrel, Roosevelt elk and 17 more
  have moved in. Health 15 → 53." That line is now a goal-style note, because at phone size the
  notices arriving just after pushed it off the two-note stack. The Story offer no longer drops in
  over it: watching doesn't count as idle.
- Events: `timelapse_started { from: auto|menu }`. `timelapse_watched` now also carries `fps` and
  `days_per_s`. `timelapse_offered` is retired. Decisions 0020 and 0053 have their Rules updated.

## Numbers

Real Chrome with the GPU, Fast quality, PNW, the guided steps by button (`tools/timelapse-probe.mjs`, new):

| | this Mac | CPU x4 |
|---|---|---|
| lapse length | **20.7 s** for 10 years | 45 s cap, **5.5 years** |
| game days a second | 57.8 | 14.7 |
| frame rate | **46 fps** (median 16.7 ms, p90 33 ms, 14 frames over 50 ms, worst 83 ms) | **31 fps** (median 33 ms, p90 67 ms, worst 200 ms) |
| ground across the screen | 0.043 widths/s | 0.038 |
| turn | 6.2 °/s | 7.3 °/s |

The film check's limits are 0.35 widths/s for a map pan and 40 °/s for a turn, so the camera is
under both by a wide margin. In the headless browser suite (software GL) the lapse manages only
3–5 days a second. The check doesn't time it, it moves the clock on.

Headless costs per game day on this Mac: the day's work 4.7 ms (p90 10.5, worst 30 at a month's
turn), plus the animals' ten steps about 6.5 ms. So 60 days a second costs about 0.7 s of
simulation per second, which is why it holds about 45 fps rather than 60. At CPU x4 the days
themselves are the limit. I tried letting slow machines drop to 20 fps for more days: 11.5 → 12.9
days a second for 30 → 21 fps, not worth it, so I took it out.

**Does it read as success** (`tools/opening-lapse-check.mjs`, new, headless suite): PNW, the real
guided plans, ten years stepped as the lapse steps them, run seeds 5/7/11, judged on the median:

- Trees within 3 tiles of the creek: 0 → **57** (53–60), average growth **0.74** (0.65–0.84).
- Blackberry along the creek: 51 → **0** (0–6). On the whole farm: 271 → **312** (261–316). Birds
  bring seed in from the neighbours.
- For comparison: untended, the farm's blackberry grew 271 → 4,480 and the creek's 51 → 370 (seed 5).
  Pulling only the creek's stands (my first plan) let it come back 51 → 129. Missing just the 18
  stands on fence lines brought the whole farm back to ~3,200. So the pull step takes every stand,
  fence lines included. I adjusted the steps, not the ecology.

Checks: `first-minutes-browser-check` (rewritten for the guided steps and the automatic lapse)
passes at 812×375 and 1280×800. Also passing: `opening-lapse-check`, `play-analytics-browser-check`,
`watch-lock-browser-check`, `watch-check`, `sim-rng-check`, `tool-actions-check`, `sandbox-check`,
`perf-guard-check`, `species-name-count` and `analytics-privacy-check`. Not run:
`motion-sweep-check` (movement code is unchanged; the lapse only steps it in 0.1-day steps, as
headless runs do).

## Open questions for Cole

1. **On a slow laptop (CPU x4) the lapse stops at 45 s with about five and a half years, and the
   line says "Five years on".** My recommendation: keep it. The alternatives are 90+ s of watching
   (your note 2) or skipping animal steps, which would change the ecology.
2. **The pull step takes every invasive shrub on the farm (about $2,800), not just the creek's.**
   Pulling only the creek let it come back worse than it started. My recommendation: keep it. It's
   real restoration practice (clear the seed sources first), and money is still about $19,800 after
   all the steps.
3. **The three steps are buttons, and only the meadow asks the player to drag.** My recommendation:
   keep the buttons for speed, and watch `opening_step { how }`. If most players press "Sow it here"
   rather than drag, the brush isn't being learned, and the meadow could require the drag.
4. **"Watch 10 years" from the Menu now uses the same fast lapse, animals hidden.** My
   recommendation: keep one kind of time-lapse. The old top-speed one had exactly the
   animals-streaking problem.
5. **The summary lists many newcomers ("… and 17 more").** My recommendation: name the three most
   striking (elk, owl, bear before rabbits) in a later pass. That's a small change to `summary`.

## New ideas

- Name the newcomer's arrival in the end beat ("Roosevelt elk came down to the creek in year 6").
  That would need the year each species arrived, which the wildlife state already has (`since`).
- A seasons sound bed during the lapse (spring birdsong, winter quiet) instead of the usual mix.
- A before/after card at the end: day one and year ten of the same view.
- Show the leaves turning during the lapse: at 60 days a second the land redraws a few times a
  second, so a year's colour shows as a quick flicker. A smoother blend between redraws could look
  lovely.
