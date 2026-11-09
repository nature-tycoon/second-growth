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

- Seed `Math.random` before `restoredGame` (or `newGame`) in a seeded check: the first animals draw on it, so seeding after left `wildlife-additions-check` passing or failing by luck.
- Seeded headless checks (`mulberry32` on `Math.random`) take a different path whenever any animal model gains or loses a geometry, because three.js draws `Math.random` for every geometry's UUID. A bird reshape once flipped `primate-stall-check`. When a seeded check breaks after an unrelated change, run it on a few other seeds before blaming that change.
