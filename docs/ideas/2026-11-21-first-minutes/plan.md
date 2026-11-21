# Plan: the first minutes (2026-11-21, revised)

A plan only. Nothing here is built yet. Written from Cole's cougar-and-deer intro idea, the usage
review of 2026-11-20 (`docs/ideas/2026-11-20-waterfall-polish/usage-2026-11-20.md`), the event
trails of the itch.io players who left inside 2 minutes (below), a look at the current start code,
and outside research on how games hook new players.

The first draft decorated the start (an intro, a livelier field, captions) but didn't change what a
new player does in their first minutes: paint seed, then wait. This revision puts that at the centre.

## Cole's answers (2026-11-21)

- Opening: a **short intro plus a quicker payoff** after it, not the intro alone.
- Start state: **a more alive start**: a few common animals from day 1 and an old forest edge they
  come from. The rare ones (salmon, beavers, cougar) are still earned.
- The intro plays on the **first visit only**, skippable, with "Watch intro" in the menu after.
- Also in scope: **the itch.io page and embed**, **minutes 5–15**, **phones and slow laptops**.
- Coming back the next day is not a feature of its own (see "Left out").
- Ideas must be things players actually want, not stock game features ("while you were away",
  daily nudges, cheerful captions). Cole found those corny.
- Session recordings stay off; the itch quick leavers were read from their event trails instead.
- Testers are tagged (Cole and Jacob, the tester in Denmark) so their play leaves the player numbers.

## The problem, in numbers (new players, Nov 13–20)

| | Now |
|---|---|
| Leave inside 2 minutes | 45% (33 of 73), was 37% |
| ...of those, never used a tool | about half |
| itch.io desktop players leaving inside 2 minutes | 13 of 22 |
| Stay 15 minutes or more | 21%, was 36% |
| Finish the first goal | 66% |
| Phones: start → use a tool → reach year 1 | 16 → 12 → 6 |
| Desktop players under 20 fps | 34% |
| First-visit load | about 8 s median, 18 s for the slowest tenth |

## What the itch quick leavers did (event trails, Nov 15–21)

26 players opened the game on itch.io for the first time in the last 30 days (all in Nov 15–21,
all PNW, 24 on computers). 12 left inside 2 minutes. Their trails, one line each:

| Player | What happened |
|---|---|
| 1 | Loading took 37 s (weak laptop, set to Fast). Left 1 s after it finished. |
| 2 | Loading took 26 s. Left 4 s in, before it finished. |
| 3 | Loaded in 5 s. Left 9 s later without touching anything. |
| 4 | Loaded in 4 s. Left at 28 s without touching anything. |
| 5 | Loaded in 6 s. Left at 63 s without touching anything. |
| 6 | Dug a pond, undid it twice, left at 50 s. |
| 7 | Planted five seed mixes, placed rocks and a snag, tried the visitor center, was refused twice ("has to sit beside a road", "not enough clear, dry ground"), left 4 s later. |
| 8 | Painted forest floor 15 times in 25 s. Got "deer tried to wander in, but the old boundary fence stopped them". Tried the creek tool, left at 89 s. |
| 9 | Watched for 52 s before touching anything. Painted meadow, got two goals, left 2 s after the Story offer appeared. |
| 10 | Planted meadow and streamside mixes, got the meadow goal, left right after (71 s). |
| 11 | Played hard at a higher speed: 3 game years in under 2 minutes, about 20 species found and lost, 4 floods, a wildfire, three warnings (two fences, invasives), introduced cutthroat trout, left at 113 s. |
| 12 | Took the Story offer: the game reloaded into Chapter 1, finished it in 50 s, left on the Chapter 2 panel. |

What this says (12 players, so these are leads, not proof):

1. **Slow loading costs players before they see anything.** 2 of 12 were lost to 25–37 s loads,
   and a third waited 45 s and stayed. These are weak laptops the game moved to Fast. The 8 s
   median hides them. `loading_left` didn't fire for the player who left mid-load, so that event is
   broken (the usage review suspected it).
2. **The first 10 seconds are choppy.** The 10-second frame-rate sample was 12–25 fps for 8 of the
   12, rising to 35–60 by 30 seconds. The first impression is the worst-running part of the game.
3. **3 looked and left without touching anything** (at 9, 28 and 63 s). Nothing on screen pulled them in.
4. **The ones who played weren't starved of rewards.** Several got 2–3 goals in a minute and left
   right after. Notices aren't a payoff; seeing the land and animals change is.
5. **The game says no, or says too much, at the worst moment.** A refused building, an undo, a
   fence warning, a flood, species lost, the Story offer: most of the players who played left within
   seconds of one of these. Player 11 got about 30 notices in under 2 minutes.
6. **The fence warning is the best hook the game already has, used as a complaint.** "Deer tried to
   wander in, but the old boundary fence stopped them" is exactly the cougar-and-deer story Cole
   wants to tell. Today it's a yellow warning.
7. **Taking the Story offer reloads the game** mid-play.

## What the code has today

- **A first visit goes straight into Free Play** on PNW (`js/main.js`, `ui.startMode(..., { firstVisit: true })`)
  in March, Year 1, with a "Try it" tip. The first goal (`sprout`) pays within seconds of a stroke.
  64 of 71 new players last week started on PNW, so PNW is the map to get right first.
- **The farm is walled off on purpose.** PNW's story (`js/sim/campaign.js`) says: a culvert under
  the river road blocks fish, the boundary fence stops deer and elk, and blackberry creeps in.
  Demolish already removes the fence and the one culvert, and a goal already asks for the fence
  (`js/sim/goals.js`). Deer and elk already try to wander in and are turned back
  (`js/sim/wildlife-population.js`, the fence warning).
- **The farm isn't empty of animals, it only looks it.** A fresh PNW farm has 17: voles, robins,
  tree frogs, two mallards, a raccoon. All small, hidden or nocturnal. The neighbouring land
  (`game.border`) has trees on only about 18% of its cells, so the edge reads as thin.
- **Time:** a game year is 120 days. At normal speed it takes about 2.8 minutes, at top speed
  about 15 seconds (`SPEEDS` in `js/config.js`). Ten years fit in about 2.5 minutes at top speed.
- **The cougar exists** on PNW, hunts run continuously (decision 0026), and watch mode follows any
  animal at eye level (`js/ui/watch.js`, `render3d/eye-camera.js`).
- **Keystone moments** (`js/sim/moments.js`, `js/ui/cinematics.js`) already do letterbox, a camera
  glide and a card, fired by the simulation.
- **Grown-farm fixtures** (`restoredGame` in `tools/map-audit-fixtures.mjs`, `releaseGame` in
  `tools/release-fixtures.mjs`) can build this same farm restored, and the website has a video
  and stills pipeline (`docs/website-notes.md`).

## What good games do (research, short)

- **The first 30–90 seconds decide it**, and the first action should come before reading
  (Roblox's onboarding guidance; itch.io developers measuring time to first click).
- **First-day play time predicts coming back.** Players with 30+ minutes on day one were about 3
  times as likely to return as those under 5 minutes (Meta). So the first session is the return lever.
- **One action, a big visible result.** Townscaper's first click makes something lovely at once, no
  tutorial. Restoration games (Terra Nil) hook on watching land turn green.
- **Show what you're working toward.** The "taste of power" opening; Terra Nil starts on a
  wasteland but you know what it becomes. Terra Nil was also criticised for making players watch a
  drone before play: intros that delay play cost players.
- **Many players skip intros**, and festival players give each game 1–5 minutes. itch players
  behave the same way.

Sources at the end.

## The ideas, rated honestly

| Idea | Chance it moves the numbers | Why |
|---|---|---|
| **Open the farm to the wild** (fence and culvert as the first big actions) | High | One click, a big visible result, and it's the game's own story. Evidence: player 8. |
| **Watch it grow** (a time-lapse after the first planting) | High | The transformation is the payoff; today nobody waits long enough to see it. |
| **Quiet, smooth first minutes** (fewer notices, no mid-play offers, faster loading, no stutter) | High | 2 of 12 lost to loading; most others left right after a refusal or a notice. |
| **The intro film, ending on this farm grown** | Medium | Shows the promise and hides loading; but it adds time before play and many skip intros. |
| **A livelier start** (visible animals, old forest edge) | Medium | Fixes "looks dead"; doesn't give the player anything to do on its own. |
| **Follow an animal at eye level early** | Medium | The most beautiful view in the game, shown in minute one instead of minute twenty. |
| ~~Captions like "a robin found your meadow"~~ | Dropped | The same kind of corny as the return ideas. |

## The new opening, minute by minute (PNW, first visit)

1. **While it loads (0–40 s): the film.** Old forest at eye level, the deer, the cougar, the chase
   to the top of the waterfall. The deer bolts out over the bare field; the cougar stops at the
   last trees (cougars hunt from cover). Then the camera rises over **this farm 30 years on**: old
   forest, the creek running free, elk in the meadow. It rewinds to the bare farm at the same angle
   and hands over to the live game. Skip from the first second.
2. **The first action: open the farm.** The view settles on the fence line with deer standing just
   beyond it in the forest edge, and the road culvert below. The one prompt: tear out the fence.
   The fence comes down and, within seconds, the deer step through onto the field. Then the culvert:
   the creek runs free, the sound changes, and fish move up toward the falls over the next seasons.
   Real restoration starts exactly this way (fence removal and culvert removal are the classic first
   moves).
3. **The second action: plant.** The brush and seed mixes, as today, with the first goal.
4. **Watch it grow.** After the first planting, a single "Watch 10 years" control runs the farm at
   time-lapse with the panels tucked away and the camera drifting over what was planted: seedlings,
   then shrubs, then young trees, deer moving through. It stops on its own (or on any click) and says
   what changed in one line. The player sees their own work become a young forest in session one.
5. **Then the game opens up**: the next goal is on screen, the cougar shown in the film is the long
   goal (cover, then deer, then the cougar returns), and the Story offer waits until the player pauses
   or stops, never mid-stroke.

## Changes from Cole's wording, and why

1. **The intro is a short film recorded from the game, not played live.** It plays while the game
   loads (2 of 12 quick leavers were lost to 25–37 s loads), plays smoothly on weak laptops (the
   first 10 s run at 12–25 fps today), can be staged until the chase is perfect without breaking
   decision 0001 (wildlife is never scripted in play), and doubles as the itch and website trailer.
   Cost: about 3–5 MB, and re-filming when the look changes a lot. If it hasn't arrived when the
   game is ready, it's skipped.
2. **The film ends on this farm grown, not on the bare farm.** Showing the player's own land 30
   years on makes the promise personal; the rewind to bare at the same angle hands over to play.
3. **It ends in the farm, not on a menu.** The mode choice was where most new players used to
   leave. Returning players keep a trimmed menu (Continue, New farm, Watch intro, Settings).
4. **The cougar's stop at the forest edge is the lesson**, and the cougar becomes the long goal.

## The plan, in order

Sizes: S is a few hours of agent work, M a session, L more than one session.

### 1. Measure and tag testers (S)

- Events: `intro_started`, `intro_skipped` (at which second), `intro_finished`; `farm_opened`
  (fence or culvert out, seconds in); `timelapse_started` / `timelapse_watched` (how long);
  `first_animal_seen` (a larger animal on screen, seconds in); seconds to first tool.
- Fix `loading_left` (it didn't fire for a player who left mid-load).
- Tag testers so their play leaves the player numbers: a one-time link (`?tester=dev` for Cole,
  `?tester=tester` for Jacob) stores a flag on that browser and sends it with every event (a role
  label, not a name). Each opens it once on every device and browser they play on; clearing site
  data loses it. Jacob's sessions stay available on their own for testing. For past data, Jacob is
  most likely the only player in Denmark, so a country filter separates most of his history. Check
  first how PostHog's existing "internal" cohort is defined.

### 2. Quiet, smooth first minutes (M)

- **Hold the noise for the first few minutes of a first visit**: species lost, invasives, floods and
  other warnings are still simulated but not announced (or shown small), until the player has had a
  few minutes. The fence warning is replaced by step 3's moment.
- **No mid-play interruptions**: the Story offer waits until the player pauses or stops, and taking
  it no longer reloads the page if that can be avoided.
- **Refusals in the first minutes say what to do instead**, never just "no" (the visitor center case).
- **The first 10 seconds**: find why frames are 12–25 fps for the first 10 s and fix it
  (shader warm-up and the first plant and land builds are the suspects;
  `tools/first-frame-profile.mjs`, `tools/play-profile.mjs`).
- **Loading on weak laptops**: why 25–45 s on machines moved to Fast; what can load after the first
  frame.

### 3. Open the farm to the wild (M)

- The first visit's view and first prompt point at the fence with deer waiting beyond it.
- Tearing out the fence lets the waiting deer (and later elk) walk in within seconds, through the
  real wildlife rules: they were already trying to come in. Check the timing in the code: today they
  try now and then; on a first visit the first try should come soon after the fence is out.
- Pulling the culvert: the creek and its sound change at once; fish follow in their season.
- Costs: check what Demolish costs at the start ($30k economy) so the first big action is affordable.
- Check: seeded balance before and after (`/balance`), since earlier deer arrival changes browsing.

### 4. A more alive start (M)

- Visible animals from day 1 through habitat rules (decision 0001): deer at the forest edge at dusk,
  a red-tailed hawk hunting the voles that are already there, crows or ravens, a coyote passing.
- An old forest round the farm: the neighbouring land thick with big conifers, so the farm reads as a
  clearing in an old forest.
- Risks: deer browsing the first seedlings (decision 0033); the thicker edge must stay inside the
  frame budget (`play-profile`, `perf-guard-check`), since it's the first view every player sees.
- Starts after the movement fixes in the other chat land (same wildlife files, and it would muddy
  their motion checks).

### 5. Watch it grow (M)

- "Watch 10 years": after the first planting, top speed with the panels tucked, a slow camera drift
  over what the player planted (watch mode's director already picks shots), stops on its own after
  about 2–3 minutes or on any click, then one line on what changed.
- Check: money can't run out silently during it, fires and floods during it show as part of the
  story rather than alarms, and frame rate holds at top speed on weak laptops.
- Check how many years until the cougar can return in a typical game (seeded runs). If it's too far
  off, the long goal shows a nearer step first (the first owl, a deer fawn, the salmon).

### 6. Follow an animal at eye level, early (S)

- Once the deer walk in, offer to follow one at eye level (watch mode, eye camera). One button,
  no reading. The player sees the farm from the ground in minute two.

### 7. Film the intro (L)

- A tool page like `tools/release-scenes.mjs` builds a grown PNW forest (from `restoredGame`),
  places the deer and cougar, runs the hunt and the eye-level camera on a fixed path and saves frames;
  frames joined into a 720p film (and 1080p for the website and itch). Plus the same farm restored
  for the last shot, and the rewind.
- Filmed at the quality most players see, so the game doesn't disappoint after the film.
- Sound from the game's real recordings (decision 0002).
- Waits until the other chat is done with `tools/release-scenes.mjs`.

### 8. Play the intro on a first visit (M)

- Plays over the loading screen; the game loads underneath; the last frame matches the live view.
- Skip, Esc and tap at any moment; muted autoplay with a sound button where the browser requires it.
- "Watch intro" in the menu; the returning-player menu trimmed.
- Check: a browser check that a first visit plays it, a skip lands in the farm, and a second visit
  doesn't.

### 9. itch.io page and embed (S, partly Cole by hand)

- The film at the top of the itch page and a short GIF of the chase as the cover animation.
- The embed size against the HUD, the "Run game" click, fullscreen, sound.
- One sentence on what you do: "Turn a worn-out farm back into wild forest, and watch the animals
  come home."

### 10. Minutes 5–15 (M)

- Read the leave-reason events (running since Nov 12) and fix the top one or two.
- Money: a refused stroke says when money comes next and what earns it.
- Losing a species: present a natural crash as nature, and only warn for losses the player can act on.

### 11. Phones and slow laptops (S–M)

- The film plays upright; at its end, "Turn your phone to play" with the farm behind it.
- Slow laptops: covered by step 2 (loading, first 10 seconds) and the film.

## Order and why

- **Now, alongside the other chat (in its own worktree):** 1, 2, 3, 5, 6. They change the first
  minutes for every player, including those who skip the film, and touch different files from the
  CI and movement work.
- **After the movement fixes land:** 4 (wildlife files and motion checks).
- **After the other chat is done with the release-scene tool:** 7, then 8, then 9.
- 10 and 11 fit in between.

## Batch sessions

Branch `claude/ideas-first-minutes`, cut from origin/main f4daa1f (after PR #121: browser suite
green and the movement fixes, so the wildlife files and `tools/release-scenes.mjs` are free).
Sessions run one at a time in this checkout. "Step" is the step number above.

| # | Title | Steps | Model | Size | Status |
|---|---|---|---|---|---|
| 1 | Measure and tag testers | 1 | sonnet | S | [x] be9fa92 |
| 2 | Quiet first minutes | 2 (notices, Story offer, refusals) | default | M | [x] 00902f5 |
| 3 | Open the farm to the wild | 3 | default | M | [ ] |
| 4 | Watch it grow + follow a deer | 5, 6 | default | M | [ ] |
| 5 | Visible animals at the start | 4 (animals) | default | M | [ ] |
| 6 | Old forest edge | 4 (edge forest) | default | M | [ ] |
| 7 | Smooth first 10 s, faster weak-laptop loading | 2 (frames, loading) | default | M–L | [ ] |
| 8 | Film the intro | 7 | default | L | [ ] |
| 9 | Play the intro, trimmed menu, upright phones, itch embed | 8, 9 (embed), 11 | default | M | [ ] |
| 10 | Minutes 5–15 | 10 | default | M | [ ] |

Order: cheap and core hooks first; the frame-rate session after the start view's new animals and
edge forest, so it measures the view players will see; the film after the opening is settled, so it
can end on the real start. Sessions 3, 5 and 6 (wildlife, balance, the first view) run
`regression-reviewer` on the plan and the diff. Long checks go to `checker`. The itch page itself
(film at the top, GIF, one-line pitch) is Cole's by hand after session 8.

## Before shipping: playtest, then ship one bundle

- **Playtest with 3–5 people who have never seen the game** (not Jacob, who knows it). Watch them
  play the first 5 minutes without helping. Note where they hesitate, what they click, where they'd
  leave. This catches most misses in a day instead of a week of data.
- **Ship the first-minutes changes together** and read them after 2–3 weeks. At about 70 new players
  a week, small changes are invisible; a drop from 45% to 30% in 2-minute leavers is about the
  smallest change you can trust after 2 weeks. Bold changes, read once, beat weekly tweaks.

## What "it worked" means

Read 2–3 weeks after the bundle goes live, against the baseline above.

| Measure | Now | Target |
|---|---|---|
| New players leaving inside 2 minutes | 45% | 30% or less |
| itch desktop leaving inside 2 minutes | 13 of 22 | under half |
| Staying 15 minutes or more | 21% | 35% or more |
| Opened the farm (fence or culvert) in the first 2 minutes | none yet | most new players |
| Watched at least 5 years of the time-lapse | none yet | half of those offered |
| Intro watched to the end | none yet | 60% or more |
| Frame rate in the first 10 seconds | 12–25 fps for most | 30 or more |
| Phones reaching year 1 | 6 of 16 | half or more |
| New players back within 7 days | about 8% | a measure of the above, not a target of its own |

## Risks

- **The intro delays play.** Skip from the first second; if most skip in the first 5 s, cut it shorter.
- **The film looks better than the game.** Film at the common quality, in the real start light.
- **Deer that walk in eat the first seedlings.** Seeded balance checks; some browsing is true and fine,
  wiping out a first meadow is not.
- **The time-lapse runs into trouble** (money, fire) while the player isn't steering. Stop it on
  anything that needs the player.
- **The cougar promise is too far off.** Measure first; promise a nearer step if needed.
- **Quieting notices hides real problems.** Only for the first few minutes of a first visit.

## Left out

- **Return features of their own** (left out by Cole). About 1 new player in 12 returns within a
  week. Something players only see when they come back doesn't help players who never planned to
  come back, and the usual ideas (a "while you were away" summary, a goal on exit, a newsletter
  nudge) are corny. Coming back is treated as a result of the first session: players return for a
  farm they've put work into and something they want to see happen.
- **Other maps' openings** (the Serengeti crossing, Sumatra's canopy, the reef). PNW first.
- **Session recordings** (Cole: off; event trails instead).

## Sources

- Roblox, onboarding: https://create.roblox.com/docs/production/game-design/onboarding
- Meta Horizon, new user onboarding (day-one play time and retention): https://developers.meta.com/horizon/blog/growth-insights-series-building-competency-new-user-onboarding/
- Unity, first-time user experience tips: https://unity.com/how-to/10-first-time-user-experience-tips-games
- "A Taste of Power": https://medium.com/khan-academy-early-product-development/unrealized-game-metaphor-57-a-taste-of-power-11d0a92679d0
- Terra Nil review (drone before play, tutorial): https://mssv.net/2023/04/11/terra-nil/ and https://www.gameinformer.com/review/terra-nil/a-new-approach-to-saving-the-world
- Why players skip: https://fredzed.substack.com/p/why-do-players-skip
- Steam Next Fest playtime: https://howtomarketagame.com/2024/11/04/how-was-the-october-2024-steam-next-fest/
- Townscaper's design: https://pcgamer.com/townscapers-developer-on-how-its-radically-casual-design-is-inspiring-a-new-wave-of-low-stress-builders-to-adapt-the-blueprint
