# 0041 Simulation in a Web Worker (proposed, awaiting Cole's review)

## Rules

- **Status: proposed, not built.** Recommendation: no-go for now. Revisit when the trigger below is met. Nothing in the game uses a worker. `tools/sim-worker-spike.mjs` is design evidence only.
- Trigger to build it: the processor's frame work (simulation plus drawing) is longer than the graphics chip's time, by more than the simulation's own cost, on the laptop class in PostHog or `play-profile`. At normal speed today the graphics chip is the limit for every class, so moving the simulation to a worker buys almost nothing. At top speed and in zoomed-out rainforest views the processor is the limit.
- If it is built: the worker owns the one real `Game` (sim, tools, undo, saves). The main thread keeps a read-only mirror with the same field names (`game.world.*`, `game.wildlife.viewAgents`, `game.day`...), so drawing and UI code read it unchanged. No SharedArrayBuffer: GitHub Pages and itch.io don't send the isolation headers.
- Every main-thread write to game state becomes a message to the worker (tools, undo, speed, selection, flags, introduce, burns, new game, load, save). Nothing on the main thread writes the mirror except applying worker messages.
- The animal fields drawing reads are a contract, kept in one list. A field that drawing or UI starts reading must join that list, or it reads `undefined`. A parity check (below) enforces it.
- Headless checks (`tools/*-check.mjs`, `balance-sim`, `calibrate`, the motion sweep) keep calling `Game` directly in one thread. The worker is a thin host around the same code, so seeded results don't change.
- Keep the in-thread path working (`?worker=0`, and as the fallback when the worker fails to start). Browser checks that drive `window.secondGrowth.game` need it.

## History

Asked 2026-11-10 by the session working through [the PostHog review](../posthog-review-2026-11.md) performance move 4: "simulation on a second core". Decision [0004](0004-ecosystem-performance.md) asked for a measured bottleneck and a reviewed design before any worker. This record is that design plus a measured spike. Cole has not reviewed it yet.

### Why look at it

PostHog, 30 days: on built-in-graphics laptops the simulation is 4.3 ms of a frame (Sumatra 6.6 ms), drawing on the processor 15.1 ms and the graphics chip 18.5 ms, at 25 fps. The simulation runs before drawing on the same thread (`createFrameLoop` steps in `js/main.js`: simulation, input, render, interface). A worker would let the simulation run during drawing.

### The measurement that decides it

The graphics chip works alongside the processor, so a frame takes roughly the longer of the two, not their sum. Moving the simulation out shortens only the processor side:

| Players (30 d) | Processor now (sim + drawing) | With a worker (drawing + ~1 ms receive) | Graphics chip | Limit after |
| --- | ---: | ---: | ---: | --- |
| Built-in laptops | 4.3 + 15.1 = 19.4 | ~16.5 | 18.5 | chip: ~5% at best |
| Phones | 2.5 + 9.9 = 12.4 | ~11 | not measured (the "missing 27 ms", move 5) | chip, most likely |
| Macs | 2.0 + 6.5 = 8.5 | ~7.5 | 11.5 | chip: nothing |
| Discrete cards | 1.4 + 4.9 = 6.3 | ~5.5 | 5.7 | nothing to small |

At normal speed the gain is about 0–5% of frame time. Where the processor is the limit it pays: top speed (M5, [2026-10-23 review](../performance-review-2026-10-23.md): Sumatra sim 23 ms + drawing 134 ms; Serengeti 7 + 15 vs chip 11) and zoomed-out rainforest (drawing 31 ms vs chip 20). There the worker hides the simulation's share, about 15–30% of the frame. Most of the remaining top-speed drawing is the daily plant redraw, which the GPU-growth work (performance move 3) targets. After that and the far-tree impostors (move 2), the chip's share falls, and the simulation becomes a larger share of what limits the frame. That is when to revisit.

### Spike: `node tools/sim-worker-spike.mjs [map=sumatra] [years=3]`

Sumatra release fixture 'forest' with 3 years of wildlife arriving and breeding (as `play-profile`), day 380, 351 animals plus flyovers (441 drawn agents later in the run), 10,800 tiles. Node 22 on the M5. **The machine was under heavy load (load average 15–18 from other sessions)**, so absolute times are high and noisy. Ratios hold.

| What | Result |
| --- | --- |
| Simulation per frame (`game.update(1/60)`), normal / fast / top speed | mean 1.8–2.5 / 2.6–3.0 / 8.1–11.9 ms; p95 4.3–5.2 / 7–8 / 14–24 |
| Animal fields drawing reads (`Actors.update` over 900 frames, through Proxies) | 35: `state x y bird id phase birdGround passing age juvenile prey fruitMeal heading passageDef lag bugleT cache sp greetT alertT run drinkT flying alt stoop forage tx headUp carry ty move hunt flightY passage target`. Of these, 6 are objects it reads into (`hunt.phase/lunge/stumble/leap.u/arc`, `prey.sp/age/juvenile/fish`, `carry.phase/low`, `forage.food/i`, `fruitMeal.elapsed`, `bird.kind`, `passage.swoop`, plus `passageDef`, a catalog definition, which goes as its key) |
| Fields drawing writes into simulation state | none |
| Game / world / wildlife fields `Actors.update` reads | `catalog world wildlife month selectedAgent speed border residents visitors`; `terrain heightAt tree treeG feature featureAge shrub shrubG distWater waterManaged corners vert`; `agents viewAgents carcasses` |
| Per-frame snapshot (27 numbers in a Float32 stride, 2 text fields as Uint8 codes, sparse objects) | 53 KB for 441 animals; packing 0.7–0.8 ms median (in the worker) |
| Naive alternative: structured-clone every animal with all its fields | 15 ms per frame: ruled out |
| Post with transfer to a real `worker_threads` worker and back (same V8 serializer as browser `postMessage`) | send 0.03 ms; round trip 0.17 ms median, 0.5–1.3 ms p95 |
| Unpacking on the main thread into one mirror object per animal | 0.2 ms median, 0.5–0.7 p95 |
| Whole world, saved arrays + derived (`distWater`, `habitat`, `nectar`, `canopy`...) | 1.56 + 0.59 = 2.16 MB |
| World change per game day | 41 arrays change; as changed arrays whole 1.7 MB (transfer, zero copy; `.set()` into the mirror), as index+value 0.55 MB; diffing costs 3–4 ms (in the worker). Largest: `trailDensity` 19.8k values, `soil` 8.5k, `moist` 7k, `canopy` 6.9k, `treeAge` 5.4k |
| World change between frames inside a day | only trail wear: `trailDensity` 36, `trod` 2.7, `trailE/S` 0.5 values a frame, ~310 bytes. Grazing, browsing and fire land in the day's work |

On a laptop about 3× slower on the processor, the main thread's added work is about 1 ms a frame (receive and unpack), plus ~0.5–1 ms once a game day (apply the day's arrays). The simulation is about 4–7 ms. The worker's own extra work (pack, diff) is off the main thread.

What the census does not cover: it ran without plant models (no `Flora` headless, so climbers and perched birds took the plain path), without a follow camera, and without the UI. The animal panel, the follow camera, `eating-pose`, sound (`ambience`) and the overlays read more fields. The parity check below finds them.

### Proposed split (if built)

**Worker (`js/sim-worker.js`, a module worker):** `Game` and everything it owns: `world`, `wildlife`, `visitors`, `events`, `water`, `undo`, `tools`/`tool-actions`, campaign, goals, `saves` (IndexedDB works in workers; small preferences stay in `localStorage` on the main thread and are passed in). It imports the same modules as today. Its few `render3d` imports (`animal-scale`, `groves`, `tree-shapes`, `tree-stature`) are pure data.

**Main thread:** drawing, input, UI, sound, analytics, settings. It holds a `MirrorGame` with the fields the census lists. It builds the same `catalog` and `border` from the map id (static data). Its world typed arrays are created once and updated in place, so `FloraChanges` and the terrain see the same array identity they rely on today.

**Clock, pipelined lockstep.** On frame N the main thread posts `{step: dt}`, then draws from snapshot N−1, while the worker runs `game.update(dt)` and posts snapshot N. The simulation's code and its dt clamp are unchanged, so the calendar runs as fast as today. If snapshot N hasn't arrived by the next frame, the main thread draws N−1 again and adds the next dt to the following step. The worker is never more than one step behind and never queues work.

**Messages, worker → main:**
- every frame (~53 KB for 441 animals, transferred): the animal stride and codes, sparse objects, removed ids, visitors and residents the same way, and scalars (`day`, `acc`, `speed`, `weather`, `snow`, `money`, `dayRun` set or not). Also the frame's emitted events (`notify`, `day`, `month`, `moment`, `chapter`, `tool`, `event`, `reset`, `badge`, `invasive`, discoveries) as a list the mirror re-emits through `game.on`.
- every frame, tiny: the trail-wear changes (index+value, ~300 bytes).
- when a day's work finishes, or a tool stroke lands: the world arrays that changed, whole (copied in the worker, transferred). The main thread `.set()`s them into the mirror. A day's work already yields across frames (0038), so this message waits for the run to finish.
- monthly or on request: `cache.score`, `cache.eco`, `history`, `stats`, `flags`, `ledger`, `wildlife.state` (structured clone, small).
- for the selected animal only: its full field set, a few times a second, for the animal panel.

**Messages, main → worker:** `step`, tool stroke start/sample/end (the stroke code runs in the worker, as today in `tool-actions.js`), undo/redo, `speed`, `select`, flag and stat writes the UI makes today (about 25 sites: `game.flags.* =`, `game.stats.* =`, `invasives`, `autosave`, `campaign.startDay`), `introduce`, `breakDam`, `igniteRx`, `extinguish`, `newGame`, `load`, `save`. Plus requests that answer later: overlay data (`wildlife.suit[sp]`, `events.floodRisk()`), `updateEco` when the report opens, the save blob for export.

**Latency and smoothness.** Drawing is one frame behind the simulation (16–33 ms). `Actors.update` already eases every pose toward the simulated position and heading (`k = frameDt * 6`), so a one-frame lag is invisible. Tool edits appear one frame after the click. The brush preview stays on the main thread and reads the mirror (`plantSuit` on mirrored arrays). A late worker shows as a repeated simulation frame that the easing smooths. If the motion sweep shows `drawJump` rising, interpolate between the last two snapshots by time.

**Determinism.** The simulation code and its order are unchanged, so headless seeded checks are unaffected and keep running in-thread. In the browser today, drawing's own `Math.random` calls (ambience, scene, lightning, pollinators, actors) share the generator with the simulation, so a seeded browser run's ecology depends on what was drawn. In a worker they would no longer share it. Browser checks that seed `Math.random` in the page must also seed it in the worker (a `seed` message). A save made in the worker must load identically in-thread and in the worker.

**Checks to add with it:**
- *mirror parity* (headless, in-process, no worker needed): each frame, draw `Actors.update` once from the real `Game` and once from a `MirrorGame` filled by pack→`structuredClone`→unpack. The pose maps must match exactly. A dev-mode Proxy on mirror animals throws on a field not in the contract. Run on every map with Flora when it exists headless.
- *motion sweep through the mirror*: the same counts as direct, with a one-frame offset.
- *save round trip*: worker save → in-thread load → same `saveData()`.
- *perf*: `play-profile` with and without the worker, all four views. Accept only if top speed and zoomed-out rainforest improve by at least the simulation's share, and normal views don't get worse.

**Failure modes and what to do.**
- Worker fails to start (old Safari without module workers, a CSP, an exception at load): fall back to in-thread and report `worker_failed` to analytics.
- Worker throws during `update`: same as today's simulation error (`game.speed = 0`, `saveReady = false`, notify). The worker posts the error and the mirror is frozen at the last snapshot.
- Mirror drift (a field drawing reads but isn't sent): caught by the parity check and the dev Proxy, not in play.
- A message lost or out of order can't happen within one worker (in order, reliable). A new game or load bumps an epoch, and stale snapshots are dropped.
- Memory: two copies of the world (2.2 MB on Sumatra; the largest maps several times that) plus the mirror animals. Small.
- Tab hidden: rAF stops, so no `step` messages, and the simulation pauses as it does today.
- Debug hooks and browser checks (`play-profile` calls `game.dailyTick()` in the page) need `?worker=0` or a `run` message.

**Cost.** Large: about 2–4 focused sessions (worker host and mirror; commands for the ~35 main-thread write and call sites; saves, load, new game and map switch; then-and-now, which builds a day-one world on the main thread and can stay there; parity checks), then a standing tax. Every new UI action becomes a message. Every new drawn animal field joins the contract. Two run modes need testing.

### Recommendation

No-go now. The expected gain at normal speed is 0–5% of frame time on every device class, because the graphics chip, not the processor, is the limit there. The cost is large, with a permanent tax on every UI and drawing change. It would pay at top speed (about 15–30% of the frame) and in zoomed-out rainforest. Revisit when, after the GPU-growth and impostor work, `play-profile` or PostHog show the processor side longer than the chip by more than the simulation's cost. Rerun the spike then on the largest map (`node tools/sim-worker-spike.mjs amazon 3`) on an idle machine.
