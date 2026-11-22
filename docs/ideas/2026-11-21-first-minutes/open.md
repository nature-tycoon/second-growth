# Batch first-minutes: open questions and new ideas

All 10 sessions landed on `claude/ideas-first-minutes` (s1 be9fa92 … s10 b9890ed). Nothing pushed.
Each question has the session's recommended answer. "Keep" means the session built it that way.

## Need Cole's decision

1. **Download two real bird calls** (decision 0002: only with Cole's OK). An American crow call
   (CC0, about 50 KB) for the new crows (s5), and a common raven (CC0/CC BY, a few hundred KB) for
   the film's opening and the forest edge (s8; a Steller's jay stands in today). Recommended: yes, both.
2. **The film's line** (s9): "The forest stops at the fence. Bring it back." Alternatives: "This
   was forest once. Bring it back." / "Thirty years from now, it could look like that." Recommended: keep.
3. **Leaving testers out of reports** (s1). PostHog's "Internal / Test users" cohort (595715) is
   people marked `$internal_or_test_user` by hand. The new `tester` tag is separate. Recommended: add
   "`tester` is not set" to the project's test-account filter in PostHog (a PostHog setting change,
   not code), and open `?tester=dev` / `?tester=tester` once on each device.
4. **Crows count toward the farm's health score** (s5): the score starts about 2 points higher and the
   PNW 15-year median went 70 → 76. Recommended: keep (they really live there); the alternative marks
   crows as not counting, since they thrive on degraded land.
5. **Make the game download faster for itch.io and the website** (s7): the game is 5.8 MB in 239
   files, sent as written. Recommended: first check whether itch serves files compressed; if not, a
   minify step in the build (its own session).

## Opening and intro (keep unless Cole objects)

- s9: the film costs a first visit up to 40 s before play, skippable from the first second. Read
  `intro_skipped.second` after a week; if most skip within 10 s, cut to the chase and rewind (~20 s).
- s9: "Watch intro" on every map's menu; only a first visit to PNW plays it on its own. Keep.
- s9: a first visit through a `?map=` link to another map gets no film. Fine for now.
- s9: the turn-your-phone prompt is now see-through everywhere. Keep.
- s9: the returning menu's "New farm" still replaces the save after a second click. Keep.
- s8: the doe jumps the fence in the film; in play, deer wait at it. Keep (a chase vs everyday movement).
- s8: the waterfall reads best in the rise, not the top-of-falls shot. Fine for now.
- s8: sound credits: one line under the film on itch and the website linking the credits. Do it with
  the itch page update.
- s8: the 1080p WebM (8.8 MB) isn't used yet. Keep until the website plays the film.
- s8: the start camera is (44, 38), not the intended map middle; the film matches what players see. Leave it.

## Opening the farm (s3)

- One button tears out the whole north and east fence ($500 net after the goal). Keep.
- Waiting deer stand still while the prompt is up. Fine; add a slow browse if playtests show long waits.
- `farm_opened` collides with the shared-farm event of the same name. Rename the share one to
  `shared_farm_opened` (small follow-up).
- Fence-blocked arrivals now wait at the edge on every map, not only first visits; all seven maps
  within 1 calibrate point. Keep.
- Amazon and Serengeti skip the fence step (the land can't hold tapirs yet; herds come by the river). Keep.

## Quiet minutes and goals (s2, s10)

- Quiet for a flat 5 minutes, not ended early by tool use. Keep.
- The fence warning's `keep` tag: session 3 replaced it on a first visit with the invitation. Drop the tag if unused.
- Taking Story mid-farm keeps the farm and may tick Chapter 1 at once. Keep.
- The cougar step stays the head of the goal tracker. Keep; revisit if `goal_tracker_opened` is rare.
- "Deer on the field" as its own goal (pays when the deer actually walk in). Keep.
- Natural losses go to the journal only. Keep.
- Chain grants $600 / $1,200 / $1,800 / $2,400; balance didn't move. Keep.
- Story players get the chain's grants too. Keep; pay only in free play if it feels noisy.

## Time-lapse (s4)

- In the Menu only, not on the speed bar (tight on phones). Keep; add a button if people look for it.
- Returns to normal speed after. Keep.
- Follow-a-deer can delay the culvert prompt by up to 12 s. Fine.
- On slow laptops fewer than ten years fit before the 3.5-minute cap; the summary says the real count. Keep.
- The summary line is thin after a single stroke. Fine for now (see before/after card below).

## Wildlife and the edge forest (s5, s6)

- Coyotes settle in year 1 instead of 1–2. Keep.
- The new `ranges` trait is on the PNW coyote only. Leave other maps until a calibrate run each.
- Story text says "second-growth forest to the north and east"; mature second growth looks like the
  new edge. Leave it.
- The border floor is mossy turf at eye level. Keep; look once in watch mode.
- The edge costs 10 draw calls and ~0.4 ms GPU. Keep.
- Other maps' borders unchanged. Leave until their first views matter.

## Measuring (s1, s7)

- "Larger animal" for `first_animal_seen` is 10 kg and up. Keep.
- `game_left` is no longer sent for loading-only visits (`loading_left` replaces it), so exit reports
  may count fewer short visits. Keep; note it when comparing.
- The 10 s / 30 s frame samples count from partway through loading. Change to count from the end of
  loading, as its own change after this batch's numbers are read (`from_ready: true`).
- Field-guide portraits opened in the first 30 s draw on the spot. Keep.

## New ideas (nature-checked)

Opening and film
- A real rewind in the film: flash the farm at years 20, 10 and 5 during the dissolve (s8).
- Film the player's real farm 30 years on from a seeded time-lapse, not the fixture (s8).
- A 9:16 cut of the chase and rise for Shorts/TikTok (s8).
- Preload the film's first second from `index.html` (needs a CSP hash change) (s9).
- A poster frame inside itch's "Run game" splash (s9).
- A "Sound on" button that pulses once in the first 3 s (s9).
- A PostHog funnel of `intro_skipped.second` against the film's beats (s9).
- The cougar's ear and tail idle while it watches from the edge (s8).

Animals
- Crows mobbing the hawk (real and very visible on farms; traits exist) (s5).
- Ravens in the foothill forest, distinct from field crows (s5).
- Waiting deer browse slowly along the fence; deer step through at a trot and pause to look (s3).
- The follow offer returns for the first elk or bear, once per species (s4).
- The owl moment waits for a twilight hunt (owls hunt at dusk) (s10).
- Real dippers fly low along the creek when alarmed; today they bolt any direction (s5).
- On Atlanta, a box turtle or fox waiting at a yard fence (s3).

Forest and look
- Snags and nurse logs in the border forest (most "old forest" per triangle; needs `Border.feature`) (s6, s8).
- A soft mossy fringe where turf meets the forest floor along the fence (s6).
- A second canopy layer of young hemlock on the east side (check the cost) (s6).
- An opening camera with a little more sky, so the hawk shows on phones (s5).

Time-lapse
- A before/after card of the planted patch (s4).
- Hold a beat on a new species the first time it's seen (s4).
- A fast-changing seasonal sound bed (s4).

Interface
- Brush shows the green preview before the first stroke of a new mix ("unsuitable ground" is still
  the top failure: 28 of 62 mid-session leavers) (s10).
- The HUD species count drops every fall when migrants leave: show "(+3 away for winter)" (s10).
- The invasives warning in year 1 names the tool that pulls them (s10).
- Other refusals point at a place that works, as the visitor center now does (s2).
- The visitor center footprint greys out where it won't fit, before the click (s2).
- Count held notices on `game_left` to see how noisy first visits are (s2).

Speed and loading (s7)
- Warm the sun's shadow programs during 'Catching the light' (2.7 s first draw on a weak chip).
- Profile 'Welcoming the wild' on Chromebooks (4–8 s vs 0.3 s here).
- Start `warmAnimals` / `warmRemains` a few seconds later on Fast.
- Skip the pixel read-back in `thumbnails.js` `trim`.
- A PostHog view of p90 per loading step (s1).
