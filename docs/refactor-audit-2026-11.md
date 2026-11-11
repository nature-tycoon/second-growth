# Refactor audit, 2026-11-08

Read-only review of why changes go wrong and cost so much, with shared fixes ranked for Cole to pick from. No code was changed. Measured on branch `claude/ideas-wave2` at `5f024c6`.

## Measurements

| What | Number |
| --- | --- |
| Game code | 209 files, 49k lines in `js/` |
| Biggest files | `sim/animals.js` 125 KB (~31k tokens), `render3d/animals/quadrupeds.js` 91 KB, `render3d/actors.js` 75 KB, `sim/animal-life.js` 72 KB |
| `Actors.update` | one function, lines 174–893 of `actors.js` (720 lines) |
| Code that names a species (`=== 'elk'` etc., outside the species data) | 154 comparisons, 92 more lines that list 3+ species; 71 of the comparisons in `render3d/` (`animals/animal-model.js` 27, `render/sprites.js` 20, `canopy-motion.js` 15, `actors.js` 11) |
| One-species motion modules | `howler-*`, `siamang-swing`, `orangutan-motion`, `sloth-bridge`, `canopy-*`: 2,400 lines |
| Code that names a map | 13 comparisons, mostly audio. Map differences already live in data (`dungSeed`, `disturbance`, `stones`) |
| Fields for which way an animal faces | four: `a.hd` (44 uses), `a.orientation` (23), `a.heading` (13), `a.facing` (8) |
| Places the renderer turns an animal | 8 in `actors.js`, at rates `k*1.6`, `k*3`, `k*0.7` (orangutan only) and a clamped step |
| Tools | 245 files, 136 `*-check.mjs`; 73 seed `Math.random` |
| Speed of typical checks | `animal-steering-check` 3 s, `hunt-check` 8 s, `pounce-probe` 4 s, `balance-sim restore 2` years ~1 s (PNW, 7.6 ms per game day) |
| CI | headless suite 8–12 min; browser suite on main 30–70 min (its limit was raised to 90). 3 of the last 5 headless runs failed (`animal-culling-check`); `hunt-check` fails today on its default seed (cheetah stalk 0.62 d < 1.5, known since s4) |
| Agent start-up reading | `AGENTS.md` 17 KB (~4.3k tokens, read every session); decision records 412 KB (~100k tokens), of which `0028` alone is 89 KB (~22k) |

## Root causes by concern

**1. Movement turns glitchy.** *Architectural.* Decision 0025 gave ground walkers one order (intent, steer, move, spacing, settle), but it stops at ground walkers: swimming (`swimToward`), gliding (`glide`), reef moves (`reefMoveSafe` in `animals.js` and `animal-territory.js`), `animal-positioning.js` and bout snapping (`animal-life.js:1007`) still write `a.x/a.y` themselves. Facing is worse: the simulation stores it in four fields, and the renderer re-derives and smooths it in eight places with different rates (`actors.js` 270, 418, 419, 489, 517, 648, 735, 845). Any new behaviour has to pick a field and a smoothing site, and two sites can fight over one animal, which reads as snapping or spinning. There is no check that watches *all* species for the visible symptoms (jumps, spins, sliding feet, standing in a trunk); each check covers the behaviour it was written for.

**2. Fixes land per animal or per map.** *Architectural.* Behaviour and drawing look up species by name: `GRAZERS` (`sim/steering.js:18`), `NIBBLERS` (`render3d/eating-pose.js:13`), `WALLOWERS` (`sim/wallows.js`), plus the 154 comparisons above and 2,400 lines of one-species motion. A fix written where the bug was seen (one species) is the natural edit. When the code instead asks a trait (`def.move`, `def.kg`, `browse`), fixes are general: the tracking lens became one rule for every species (`66d22ce`) once it asked "what supports this animal" instead of "is it a howler". Per-map code is *not* a problem: map branches are rare and map data already carries the differences.

**3. Fixes slow the game.** *Architectural, with bugs on top.* No automated guard measures cost: `play-profile` and the GPU timer queries run only when an agent remembers, in a browser, and their numbers are noisy enough that +2 ms on Amazon (s7) needed two rounds to see. The past large regressions were bugs that a counter would have caught early (young primates re-outlining every frame, every footstep marking plant regions dirty; see the 2026-10-23 review). Triangle and draw counts are deterministic and cheap, but nothing records them per change.

**4. Calibration time.** *Mostly tooling, partly a bug.* The simulation itself is fast (two game years in about a second). Time goes into (a) seeded checks that change answers whenever any model gains a geometry, because three.js draws `Math.random` for UUIDs (AGENTS gotcha; `primate-stall-check` and `hunt-check` both flip by seed); (b) single-seed verdicts on noisy ecology; (c) a slow browser suite run only after merging; (d) a red suite, which teaches agents to ignore failures and re-investigate known ones.

**5. Token cost.** *Structural.* Every session reads 4.3k tokens of `AGENTS.md`, then a decision record (up to 22k), then one of four 70–125 KB files to change one behaviour. Most decision text is history (findings, before/after tables) rather than rules a new edit must follow.

## Shared fixes, ranked

| # | Fix | Payoff | Size | Risk | How to check |
| --- | --- | --- | --- | --- | --- |
| 1 | **Motion sanity sweep for every species.** One headless tool that runs each map for N days and records, per species, frame-to-frame position jumps, yaw change per frame, foot slide (drawn speed vs gait), time inside a trunk or water, and stalls. Prints a table with limits; joins the headless suite. | Catches concern 1 everywhere before Cole sees it; makes fixes 2 and 4 safe | S–M | Low (read-only) | It flags today's known glitches when run on a commit before their fixes |
| 2 | **One facing, one smoother.** The simulation owns a single `a.heading` plus a per-species turn rate in data; `actors.js` interpolates position and heading through one function. Retire `hd`, `orientation`, `facing`. Extend 0025's settle step to swimmers, gliders and reef animals. | Removes the commonest cause of snapping; new behaviours can't pick the wrong field | M | Medium (touches every animal's drawing) | Sweep (1) before/after; `animal-steering-check`, `hunt-check`, screenshots of a turning herd |
| 3 | **Perf guard in CI from counts, not timings.** For fixed fixtures per map: triangles, draw calls, instance counts and plant rebuilds per 100 frames, plus node `game.update`/`Actors.update` ms with a wide margin. Stored baselines; a PR fails if a count rises over 10% without a baseline update in the same commit. | Turns "fixes slow the game" into a red line at the time of the change; the s6 fruit would have shown as a triangle jump | S–M | Low; timing part can be noisy, so counts decide | Re-run on `a831040^` vs `a831040` (s6): must flag Amazon |
| 4 | **Traits instead of species names.** Move `GRAZERS`, `NIBBLERS`, `WALLOWERS` and the `animal-model.js`/`canopy-motion.js`/`actors.js` name checks into fields on the species definition (`eat`, `idle`, `turn`, `climb`, `wallow`). Do it file by file as pure moves. | A fix applies to every animal with the trait; new species need data only | M | Low if outputs are identical | Seeded checks give identical output; the species-name count script falls from 154 |
| 5 | **Separate simulation randomness from three.js.** The simulation draws from its own seeded stream (`rng.js` exists) instead of `Math.random`, which `js/sim/` still calls 178 times; checks judge the median of 3 seeds. Fix or re-baseline `hunt-check` and `animal-culling-check` so the suite is green. | Checks stop flipping on unrelated model changes; fewer wasted investigations | M | Medium: changes every seeded result once | Add a geometry to one model: seeded check output must not change |
| 6 | **One calibration command per map.** `tools/calibrate.mjs <map> [years] [seeds]`: seeded `balance-sim` on 3 seeds, compared with `eco-reference.js` targets, printing only what is out of range and the diff from the last saved run. | Replaces ad-hoc balance runs; one table per change for Cole | S | Low | Matches today's `/balance` numbers |
| 7 | **Slim the start-up docs.** Each decision record starts with a 5–15 line *Rules* block (what an edit must keep, the check to run); findings and tables move under *History*, which agents read only when needed. `AGENTS.md` index entries cut to one short line, testing gotchas moved to a skill. | Roughly 3k tokens off every session and 10–20k off any session that opens a big record | S | Low; risk is dropping a gotcha, so keep every gotcha in *Rules* | Token count before/after; next sessions still cite the rule they needed |
| 8 | **Split the two giant movers.** `Actors.update` into per-mode drawers (ground, climb, fly, swim, reef) and `sim/animals.js` into per-mode movers behind 0025's order. | Agents read 15–25 KB instead of 75–125 KB; fewer accidental cross-effects | L | Medium | Pure moves: every seeded check identical, sweep (1) unchanged. Done 2026-11-10, outputs identical: file map in 0025's Rules. |
| 9 | **Incremental daily environment update** (open finding 3 of the 2026-10-23 review). Done 2026-11-09, exactly: see the review's finding 3 section. | Top-speed simulation on wet maps (21 ms daily tick in Sumatra) | L | Medium: changes ecology timing | `/balance` before/after on all maps |

## Do first

Build **1 (motion sweep)** and **3 (perf guard)** first, in that order. Both are small, change no behaviour, and turn Cole's two most frequent complaints (glitchy movement, slower game) into numbers that every later change is checked against automatically. Then **7** (cheap, saves tokens on every session from then on) and **5** (a green, stable suite). With those guards in place, **2** and **4** can be done safely, and they are where the per-animal pattern actually ends. Leave **8** and **9** until the guards have been running for a while.

The Amazon GPU at the 11 ms ceiling (s7) is a separate quick question, not a refactor: one A/B with the s6 fruit shapes off tells whether to draw fruit only on close-up plant models.
