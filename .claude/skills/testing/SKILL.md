---
name: testing
description: Rules for testing Second Growth on Cole's Mac without hogging it, and the gotchas of headless, seeded and browser checks (tools/*-check.mjs, tools/*-browser-check.mjs, preview tabs, headless Chrome). Read before opening a preview, running headless Chrome, or writing or debugging a check.
---

# Testing on Cole's Mac

Cole works on the same machine while agents test, and the 3D game is heavy.

## Sharing the machine

- Close browser preview tabs and stop the dev server as soon as a visual check is done. A forgotten preview tab has run the game at ~100% CPU for hours.
- When the work is finished, start a preview server for the checkout the changes are in and leave it open, so Cole can check them himself. Tell him the URL.
- Run headless Chrome under `nice -n 15`, throttle `requestAnimationFrame` when no screenshot is needed, and delete each temp profile afterwards (old `$TMPDIR/sg-chrome-*` folders once reached 5 GB).
- A hidden preview tab can stop `requestAnimationFrame` entirely, so the game never finishes loading and frame rates read there mean nothing. For CPU-side timing, measure `game.update`, `Flora.rebuild` and `Actors.update` in node instead.
- Prefer one or two targeted crash sweeps over all maps unless the change is shared engine code.
- Cole may be playing in a preview tab. Ask before reloading it.
- When sending Cole links to `tools/*.html` review pages, use `http://localhost:8347/tools/...` with the server running. File links open the raw file and the ES modules never run.

## Browser checks

- In a `tools/*-browser-check.mjs`, send `Page.enable` before `Page.addScriptToEvaluateOnNewDocument`. Without it the script never runs, so seeded settings and `second-growth-pending` are ignored and the farm selector (which can't be dismissed) stays open.
- `browser-session.mjs` `navigate` waits until the new document has replaced the old one. `Page.navigate` alone returns as loading starts, and on CI the next `evaluate` ran in the previous page (`getElementById` null).
- "does not provide an export named …" means the browser cached an old module. Refetch with `cache: 'reload'` or clear the site's cache.
- Animals small on screen draw from their species pool's distant model (`fauna.species.get(key).far`). Animals large on screen draw from its close-up model (`.close`, see 0018). A check that counts drawn animals must add `far.count` and `close.count` to `count`.

## Seeded checks

- The simulation draws its own random numbers (`simRandom()`, `js/sim/sim-random.js`, decision 0035): wildlife and visitors use `game.wildRng`, seeded from the run seed, and weather, fire and events use `game.rng`. Seeding or calling `Math.random` changes neither, and neither does drawing or a new model (`sim-rng-check` proves it). `Math.random` in a check now only seeds the check's own placements.
- To vary a run, pass a run seed (`newGame(seed, mode, difficulty, map, runSeed)`, `restoredGame(map, seed, runSeed)`) or call `g.wildRng.setState(n)` after making the game. A check that varies only `Math.random` gets the same simulation every time.
- To force a branch (`() => 0`) or share one seeded stream across games, use `forceSimRandom(fn)` and put back `forcedSimRandom()` after, never `Math.random = ...`.
- A limit on a noisy number (a share of time, a median stalk, a stall) judges the median of three run seeds, not one run: see `hunt-check`, `primate-stall-check` and `home-range-check`. Vary the check's placements as well as the run seed: one fixed placement can sit well off the average however the sim draws.
