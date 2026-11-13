# Open questions and new ideas, batch 2026-11-09 wave3

Branch `claude/ideas-wave3`, not pushed. s1–s6 landed (s3, s5, s6 from their own worktrees, merged). Not yet in: s6's palm and giant-clam far models (9ba390a on `claude/wave3-s6-posthog-review-26d0c0`), wave2's fix 5 (`claude/ideas-wave2` a963a0f). Fix 8 (split the two giant files) waits for both.

## Before pushing
- Watch in the game (nothing was checked live): a jink chase at watch pace (s1), male anthias school (s3), fish depth from above on PNW and Serengeti (s4), the lens on a small animal (s5).
- Headless failures, same on untouched code (s4): `animal-culling-check`, `animal-eyes-check` (anaconda eyes 4.3% of head, from s3's model change), `canopy-support-check`, `wildlife-additions-check`, `wildlife-diagnostics-check`; plus `canopy-reveal-browser-check` oilpalm 13.6% (s5). One fix session before shipping.
- `play-profile` owed for s3 and s5 (timings were taken with sessions in parallel).

## Recommendations (stand unless Cole objects)
- Cheetahs keep landing most lunges; jinks show on leopards, foxes, coyotes, raptors (s1). PNW rabbit swing is seed noise; recheck in play (s1). hunt-check notes a limit only one seed can judge (s1).
- Noddies fish only once the cay has pisonia (s2). ~1 male anthias per school (0.12) (s3).
- Trout and salmon may show a back in riffles; catfish out of marsh for now (s4).
- Lens gap still wide on big animals; no see-through fade (cost on the low-end target) (s5).
- Ship the new PostHog events with the next push (s6).

## Choices for Cole
- Start new players in Free Play, story offered after? s6: yes, after one week of the new `panel_closed`/`objective_done` data.
- Bigger performance moves as their own design-first sessions: impostor far trees, plant growth on the GPU, simulation in a worker (0004) (s6).

## Next-batch candidates (nature-checked)
- Boobies, kingfishers and herons show the fish going down the bill; kingfishers go under with a splash (s2). Real.
- Fishing moves fully to the `fishes` trait, `BY_KEY` deleted (s2, refactor).
- More fruit birds: magpie-jay, PNW waxwings and robins in berry shrubs (needs a shrub `fruitAt`) (s2). Real.
- Anacondas also take caiman, birds and fish (s3). Real; balance.
- River current shared from the drawing to the sim, so salmon and trout face upstream in rivers (s4); the "fish frozen at a creek lip" stall is the next fish fix (s4).
- After a missed grab the hunter falls back a step instead of overlapping the prey (s1).
- Lens gap hugs the body, not tail or antlers (s5).
- First-minute payoff (sprouts or a visitor on the first stroke); "unsuitable ground" shows the reason at the cursor; drop the ResizeObserver error noise (s6).
- A flier motion sweep (height jumps, pitch snaps) (s2); predation-soak on 6 seeds by default (s1).
