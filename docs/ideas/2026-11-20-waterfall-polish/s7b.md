# Session 7b: Browser suite green

The browser suite on main (CI run 44871673374) had 8 failures, so the itch.io upload was skipped.
Five were older: they also failed on run 44663267887 and before. Three were new with PR #120.
None of the eight was a bug in the game. Five came from checks that had fallen behind intended
game changes. Two came from CI's slower software graphics, and one from a test page that didn't
exist. Each is fixed below. One work budget was raised, for a reason recorded in decision 0051.

## Done

New with PR #120:

1. **release-browser-check, chinandega-forest-fast and -high: "draw_calls exceeds reviewed work budget".**
   Cause: leaf-out by the day (0051). The release scenes are set on day 20. That is the first day
   of the month the Chinandega dry forest leafs out in. By the month, all 1,331 deciduous trees
   were drawn leafing out. By the day, they are all still bare: they leaf out on days 21–28. Bare
   trees have their own model for each species and variant, so draw calls went from 75 to 89.
   Triangles stayed about the same (Fast 0.49M → 0.48M, High 0.94M → 0.97M).
   Fix: this is the intended look for the end of the dry season, and the rise is small next to
   the triangle and pixel costs in the performance review. I looked at the new picture against
   the old one, then refreshed only these two references (images and work budgets). The rise is
   recorded in 0051's History.
2. **impostor-browser-check: "amazon: 731340 triangles with cards, 560756 without".**
   It passes locally, on the GPU and in CI mode (software graphics, 3× time limits): 0.56M →
   0.31M, the same as every earlier CI run. CI frames take several seconds each, so the "with
   cards" count was most likely taken while plant regions were still being redrawn and the
   shadow map with them. Fix (check only): wait until no plant region is still queued for
   redrawing, then count only frames that didn't redraw the shadow map
   (`renderer.lastShadowRedraw`). The game is unchanged.
3. **moments-sweep-browser-check: "sumatra/gajah: card shown".** It passes locally. On CI, the
   moment started and failed 3.7 s later. The title card comes in on a 1.5 s timer, and slow
   frames (the first close-up elephant frames under software graphics) held it past the check's
   fixed 3.5 s pause. Fix (check only): after the pause, wait up to 10 s (30 s on CI) for the card.

Older:

4. **release-browser-check, reef-animals-high: "Landscape tool failed".** The reef's animal
   gallery is all water (creek tiles). The check picked the first tile that wasn't a river and
   raised it. Since the terrain-edit rework (0048), Raise refuses water, which is correct. Fix
   (check only): pick dry, open ground. If a scene has none, the check first makes one
   off-screen corner tile dry.
5. **cervid-groups-browser-check: "Cannot read properties of undefined (reading 'overlay')".** The
   review page builds a minimal UI object without `state`. Since 4b7ab3f (Habitat button
   toggles), the animal inspector reads `state.overlay`. Fix (test page only): give the stub a
   `state`. I made the same fix to `bird-behavior-review.html`, which had the same gap.
6. **animal-trails-browser-check: "visible ground tracks in Fast".** The review page replays a
   fixed elk run seed that had been picked because it wears a strong trail (about 150 tiles).
   e5a1a53 (herds stop braking for animals they're stepping round) changed how elk walk, and that
   seed now wears 90 faint tiles. I found this with `git bisect`. The trail drawing is fine. Fix
   (test page only): a new seed (24×7919) that wears 149 tiles, with a comment on how to re-pick
   one.
7. **website-security-browser-check: "Timed out: the first page loads".** Every browser check
   opens its tab on `/assets/logo.svg`. The built website has no such file, so its tab landed on
   Chrome's 404 error page, which never has the test server's origin. Fix (shared
   `browser-session.mjs`): the test server now serves a small blank page at `/__check-blank`
   under every root, and each tab opens there.
**Verified locally:** all six failing browser checks pass (impostor also in CI mode). The full
release check was run again with the new references. The headless suite passes (135 checks). No
game code changed, so the regression reviewer wasn't needed.

**Not verified:** CI itself. Fixes 2 and 3 address CI's slowness, which I could only approximate
locally. The next main run will show whether they hold.

## Open questions for Cole

1. **Refresh the other release reference pictures?** The release check reports many intended
   changes since the references were last taken. These are reported for review, not failures:
   PNW forest 9–11% of pixels, Serengeti forest 11–15%, Amazon forest 7%, PNW animals 7%, Sumatra
   3–4% and the reef 1–2%. They come from bush clumps, leaf-out, falls and dams. While they stay
   unrefreshed, a real rendering regression in those scenes would be hidden among them.
   *Recommend: yes. Glance at `http://localhost:8347/tools/release-output/review.html` (with the
   server running), then have an agent run `node tools/release-browser-check.mjs --update-visuals`
   and commit.*
2. **Should the Chinandega release reference show a bare forest?** It does now, because day 20 is
   just before leaf-out. The other option is to move every map's release scene to a mid-month
   day, so Chinandega shows leaves again. That would change every reference picture.
   *Recommend: keep it bare. It's the first reference that covers bare-tree drawing, and nothing
   else changes.*
3. **Push now?** The fixes for 2 and 3 can only be fully confirmed on CI.
   *Recommend: yes. Push this branch with the next batch PR and look at the next main run's
   browser shards.*

## New ideas noticed

- Hand-picked run seeds in test pages break every time movement changes (the trail page, and
  perhaps others). The trail page could pick the strongest of a few seeds itself when it loads.
- Three review pages build a stub `UI` object by hand, and each breaks when the inspector reads a
  new field. A small shared `stubUI(game, renderer)` in `tools/` would keep them in step.
- `tools/capture-site-video.mjs` still opens `/assets/logo.svg`. It works there because the game
  root has that file, but it could use `/__check-blank` too.
