# After the time-lapse: the next goal, and other places to restore

Cole asked whether a screen should pop up after the time-lapse, asking players to keep going or try
another map. We decided against a pop-up. In the event trails, interruptions came before most early
exits. Switching maps also throws away a farm the player has just put work into, and the other maps
don't have the guided opening. Only 4–8 new players a week try a map other than PNW today. So this
session did two smaller things.

## Done

- **The next goal stands out after the time-lapse** (`spotlightGoal` and `renderGoalTracker` in
  `js/ui/ui.js`, called from `Timelapse.stop`). When control comes back, the goal tracker at the top
  glows for 10 s. It names the next step toward the cougar and adds one line on what helps and where
  that stands, for example: "An owl hunts the meadow · Open meadow beside young forest… · Habitat 40%
  of what it needs". After 10 s it folds back to its usual one line on its own. There's no modal and
  nothing to press.
  For those 10 s the simulation's routine news (good news, discoveries, seasons) goes to the journal
  only, and the Story offer waits. Alarms (fire, flood, warnings) still show. It doesn't run when the
  lapse stopped for fire or low money, since those need the screen. It works the same after
  "Watch 10 years" from the Menu. New event: `goal_spotlight { map, next }`.
- **Other places to restore** (`js/ui/other-places.js`, new; Menu → "Other places to restore"). It
  lists the six other maps. Each card has its keystone picture (the same `assets/maps/*.jpg` the map
  picker uses, loaded lazily), its region and farm name, its one-line `blurb` from the map's own
  definition, and a button. A map with no farm yet says **Start here →**. One with a saved farm says
  **Continue there (year N) →**.
  The top line says "Your farm at Hollis Farm stays saved, year 11 and all. Come back to it any time
  from this list on another farm, or from the start menu." Start goes through the usual
  `switchMap`, which saves the farm on screen first and stays put if that save fails. A new place
  starts in Free play at the current difficulty (sandbox carried over). Nothing is replaced: a map
  with a save gets Continue, never a fresh start. Starting over on a map stays in "Start a new game".
- **When it appears: once the time-lapse has been watched or the farm has had a full game year,
  and always for a returning player** (`otherPlacesReady`). On a first visit that's right after the
  lapse. By
  then the player has opened the fence, cleared the blackberry, planted, watched ten years and seen
  their next goal. That's a full first session, and it costs nothing to show it there because the
  Menu only opens when the player asks. On a map with no guided opening, it appears after the first
  game year (about 3 minutes at normal speed). It's hidden on a `?farm=` visit.
- **The note, once per device** (`watchOtherPlacesNote`): "Six other places need restoring too:
  Menu → Other places." It has a **See them** button and fades after 12 s. It becomes due at the
  first new year's turn the player *plays through*. A first visit's first new year happens during
  the time-lapse, so in practice the note comes at the next New Year, up to about 3 minutes of play
  after the lapse. That's a natural pause, and well after the summary and the goal spotlight.
  If the turn is busy, it waits for a calm month: never in the quiet first minutes (s2), the
  opening, the time-lapse, a modal, a moment, watch or photo mode, or while the goal stands out. It
  never comes within 60 s of the Story offer, either way round: the Story offer also waits 60 s after
  the note.
- **Events** (listed in `js/analytics.js` and `docs/posthog-review-2026-11.md`):
  `other_places_shown { map, where: menu|note }`, sent once per page load for each place.
  `other_places_opened { map, from: menu|note }`.
  `other_place_started { map, from, resume }`, where `map` is the place chosen and `from` is the
  farm being left. `map_switch` still follows, as before.
- **Phones in landscape**: the cards put the picture beside the words (30% wide at heights of 520 px
  or less), and the list scrolls inside the dialog. Spanish for the fixed parts (Chinandega players see the
  menu in Spanish); the blurbs stay English, as in the map picker.
- **Checks.** `first-minutes-browser-check` now checks both sizes after the lapse hands back
  control. The goal stands out on screen with a "what helps" line and a progress line, there's no
  modal, `goal_spotlight` is sent, routine news is held, and the tracker folds back on its own. It
  then checks Other places: the Menu entry, six cards each with a picture, name, line and Start, the
  dialog inside the screen, a scroll that reaches the last card, the events, and Start going through
  `switchMap` (stubbed). Last it checks the note: its text, See them, once per device, and no Story
  offer next to it. `phone-review.mjs` adds shots `6b-other-places` and `6c-other-places-end`.

## Open questions for Cole

1. **Show Other places after the lapse, or wait for the end of a played year?** I chose after the
   lapse for the Menu entry, because it's only seen by someone who opens the Menu, and the note at
   the next New Year they play through. My recommendation: keep it. Read `other_places_shown` against
   `other_places_opened` after a week. If players open it and then leave PNW for good, move the
   entry later (year 13, for example).
2. **Should the start menu for returning players list Other places too?** It already has "New farm
   (another place, mode or difficulty)", which reaches every map through the full chooser. My
   recommendation: not yet. A fifth button there is clutter, and the in-game Menu has it.
3. **New places start in Free play.** First visits start that way too, and the Story offer follows
   the first goal there as well. Players who want Campaign go through "Start a new game". My
   recommendation: keep it.
4. **The note has a See them button.** The brief asked for a plain note. A button that opens a list
   doesn't block anything, and it makes `other_places_opened { from: note }` worth reading. My
   recommendation: keep it. Drop it if it reads like an offer.

## New ideas

- **A "what's special" line per map that's shorter than the blurb.** The blurbs say what's broken
  ("overgrazed to bare, crusted earth…"). A line on the keystone animal ("bring back the wildebeest
  crossing") might pull harder. It would need a new `pitch` field per map and copy from Cole.
- **The other maps' guided openings.** The opening's steps are generic. Sumatra (sambar at the fence)
  and the Serengeti (the fence on the migration route) would gain the most. That's its own session
  per map.
- **Before/after on the cards for maps the player has a farm on**: the saved farm's thumbnail in place of
  the keystone still, once saves carry one.
- `goal_spotlight` is followed by `goal_tracker_opened` within 30 s how often? That says whether the
  glow draws the eye or just decorates.
