---
name: perf
description: Measure whether a change made the game slower, or find where frame time goes, against the budget in docs/performance-review-2026-10-23.md. Use for new graphics or simulation features, and when Cole says the game feels slow or laggy.
---

# Performance check

## 1. Check the machine first

```bash
pmset -g custom | grep lowpowermode; pmset -g batt; sysctl -n vm.loadavg
```

Low Power Mode, battery (the game's Auto frame rate caps at 30 fps on battery, `js/main.js`) or a load average above ~4 have all looked like "the game got slower" before. If any applies, tell Cole and say the numbers below are suspect, or ask him to plug in, turn it off, or close other agents' preview tabs.

## 2. Pick the measurement

| Question | Tool |
| --- | --- |
| Whole frame: simulation vs drawing vs GPU | `node tools/play-profile.mjs [maps] [quality] [years]` (default serengeti,sumatra,amazon,pnw high 3; writes `tools/release-output/play-profile.json`) |
| Simulation only, headless | time `game.update`, `wildlife.update`, `Flora.rebuild`, `Actors.update` in node; `balance-sim` prints `ms/day` |
| Loading | `node tools/boot-profile.mjs 4 1` |
| Plants / spacing / climbing monkeys | `tools/flora-rebuild-bench.mjs`, `spacing-bench.mjs`, `canopy-bench.mjs` (they print output signatures, so check those match too) |

Run headless Chrome under `nice -n 15` and delete `$TMPDIR/sg-chrome-*` profiles afterwards. Don't read frame rates from a hidden preview tab.

## 3. Before and after

Measure HEAD and the change the same way. For an A/B against another checkout use `PLAY_ROOT=<checkout>` (and `FLORA_ROOT`, `SPACING_ROOT`, `CANOPY_ROOT` for the benches). `play-profile` games diverge ecologically between checkouts, so compare phases, not single numbers, and run twice if a difference is under ~10%.

## 4. Compare with the budget

Ceilings per frame on the M5 at Retina High, normal speed (see the review for why):

| Part | Ceiling |
| --- | ---: |
| Simulation, normal speed | 3 ms |
| Simulation, top speed | 10 ms |
| Drawing on the processor | 8 ms |
| GPU | 11 ms |
| Slowest frame, normal speed | 33 ms |

Rules from the review: keep per-animal work linear with nearby spatial queries; whole-map work at most once a day and only on changed tiles; nothing costly in `wildlife.update`; new full-screen effects behind the quality setting (off on Fast); added detail in wide views needs distant simplification.

## Report to Cole

One short table (before, after, ceiling) for the parts that changed, then a plain verdict: fits, fits on High only, or over budget and what to do about it. Say what you could not measure (e.g. the low-end Intel target is only estimated at ~3× slower CPU, 10×+ GPU).
