# Phone review, 2026-11-14

How the game plays on a phone on its side, checked without a real phone: headless Chrome emulating
an iPhone (`node tools/phone-review.mjs`) and real iPhone Safari in the iOS Simulator (Xcode).

## How to look at the game on a phone without one

- **Layouts, quickly:** `node tools/phone-review.mjs [844x390,667x375,750x340]` saves the HUD and
  each panel to `tools/release-output/phone/`. Chrome with touch on (`pointer: coarse`), 3x pixels,
  iPhone user agent. It can't show Safari's own bars.
- **Real Safari:** with the dev server running, open `http://localhost:8347/` in the iOS Simulator's
  Safari and turn it sideways (Claude Code: the iOS Simulator tool's `open_url` and `rotate`). Shows
  Safari's address bar (about 60 of 402 points of height on an iPhone 17 in landscape), the notch's
  safe area, and how loading looks. Press Home when done: a game left open there keeps drawing.
- **Neither measures phone speed.** Both draw with the Mac's GPU. Chrome's CPU throttling
  (`Emulation.setCPUThrottlingRate`, 4x) approximates a phone's processor only, and only on an
  otherwise idle Mac. The phone's graphics chip is the open question (perf review move 5); count
  triangles as the stand-in, and read real phones from PostHog (`perf_sample`, `webgl_context_lost`).

## Found and fixed

1. Short screens, touch: an open tool panel covered by the thumbstick and floating Undo (the turtle
   card in Wildlife). They now step away while a panel is open; a touch on the map folds the panel
   and brings them back.
2. Notifications covered the camera buttons and Undo, and cut the first "Try it" hint off after two
   lines. They now sit between the left-hand controls and the Map button, the camera buttons stand
   above them, and three lines show.
3. The thumbstick and floating Undo showed through dialogs and the map chooser.
4. Returning players: "Continue your saved Hollis Farm farm" was two screens down below the world
   map. It is now "Continue at Hollis Farm", right under the map (every screen size, Cole's choice).
5. The loading bar's half-second slide only ran when the page was idle, which during loading it
   never is: on the phone the bar sat near the start while the text read "Growing the landscape".
6. Frosted blur on notifications, the Watch menu and keystone cards over the moving view, on touch
   screens (panels already had it off): the blur is redone every frame on a phone's graphics chip.
7. Fast at one pixel a point (every phone, 1x laptop screens) switches to far plant models and tree
   cards at zoom 0.75 instead of 0.5, the same ~34 device pixels a tile as a 1.5x laptop (decision
   0022). Phones open on them. Grown farms, phone emulation, opening zoom: Amazon 1.09M -> 0.40M
   triangles, Sumatra 0.89M -> 0.66M. Processor time unchanged; the gain is on the graphics chip,
   which nothing here can measure.
8. `webgl_context_lost` is now tracked: the simulator dropped the 3D view once while loading
   (about 30 s on "Ready"), and nothing told us whether real phones do.

## Measured, not changed

- Fresh PNW farm at 4x CPU throttle: holds the 30 fps phone cap (drawing 9 ms, simulation 1 ms).
- Grown Amazon (2 years): 25-29 fps, drawing 20 ms with slow frames at 33-37 ms. Grown Sumatra:
  14-16 fps, drawing ~40 ms and simulation ~12 ms at 4x: Sumatra is processor-bound on a slow phone.
  The Mac was heavily loaded (load average 9-12), so treat these as rough.
- The 2D effects layer (`#fx`: sun wash and vignette, redrawn full screen every frame on top of the
  3D view) costs about 0.6 ms of processor; its compositing cost on a phone's graphics chip is a
  suspect for the phones' missing GPU time, along with per-pixel foliage lighting and shadows. Needs
  a real iPhone and Safari's timeline before changing.
- Photo mode's full-screen `backdrop-filter: blur(3px)` is costly on phones too; left, as it's a look.
