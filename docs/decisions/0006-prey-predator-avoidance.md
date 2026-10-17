# 0006 Prey vigilance and escape choices

2026-10-17. Cole requested better predator avoidance after the cross-map clustering fixes.

## Findings

Shared lookout ran mostly when choosing a new destination. Resting/walking prey
could miss an approaching hunter; juveniles were excluded. A predator's own target
was explicitly held still until the rush. Fleeing took the first legal direction,
could run toward another hunter, and stopped when a short timer expired even if
pursuit continued. The rush also capped target speed at half the predator sprint.
Aquatic prey mainly reacted after a rush/missed catch, and reef walking ignored
the escape pace multiplier that those reactions set.

## Decision

- Reuse `watch`, `bolt`, bird alarms, diet relationships, `preyCover`, terrain
  policy and existing aquatic/canopy escape paths. Vigilance runs every 0.2 game
  days through the ordinary wildlife update, including offscreen animals. It
  interrupts idle, walking, feeding, social activities and play for real danger.
  Young animals participate. Fire evacuation retains priority.
- Build the actual-predator candidate list once per vigilance interval; cache no
  per-prey paths or all-world danger field. Lookout retains its six-tile range.
  Immediate danger is a hunter inside three tiles or an active hunt inside the
  lookout range. Targeted hunters receive priority over comparable nearby threats;
  feeding hunters are ignored. Existing bird recognition still handles incidental
  raptors/cats/snakes outside the modeled diet.
- Let targets flee during approach/stalking at their species' escape pace. Hunting
  phases, predator sprint speed/duration, contact catches and catch rolls remain.
- For ground escapes, evaluate nine steering directions using clearance from all
  nearby applicable hunters, a small cover preference and turn continuity. Sample
  the full movement/lookahead segment at intervals no larger than 0.2 tiles to
  prevent tunneling through obstacles or diagonal corners at long simulation steps.
  Prefer non-burning routes; preserve the existing fire fallback and play/retreat
  behavior. Steering smoothing uses elapsed time rather than a per-frame constant.
- Continue fleeing while a close threat or the active pursuit persists, then return
  to ordinary behavior. Clear interrupted trip/meal/social goals. Preserve useful
  aquatic/canopy escape paths instead of replacing them every vigilance interval.
  Aquatic evasion stays in passable water/terrain and rejects burning destinations;
  reef swimming now applies its existing escape pace.
- Birds launch immediately, select legal non-burning landing sites farther from
  danger and consider cover. If none is sampled, remain airborne and retry rather
  than choosing an invalid final sample.

No population, habitat, hunger or catch-probability formulas change. Different
movement and hunt outcomes can change ecosystem trajectories. Existing saves need
no migration: the existing threat/escape fields are reused, and transient vigilance
state resets when the agent list is replaced or loaded. Canopy escapes still issue
path intents using the existing locomotion system; no renderer position edits.

## Verification

- `node tools/prey-avoidance-check.mjs`: 17 seeded regressions, covering stalked and
  juvenile prey, activity interruptions, threat priority, birds and legal landings,
  aquatic awareness, effective reef speed, pursuit continuity/release, multiple
  predators, cover, frame-step consistency, connected canopy, swept barriers/fire,
  pause/fire priority and difficulty changes. It also exercises all 139 modeled
  predator-prey relationships across the seven maps.
- Existing animal life (11), Challenging ecology (26), cervid behavior (28), animal
  positioning (26), bird behavior (17), and wildlife behavior (15) checks pass.
  The ecology suite verifies contact catches for all 139 relationships, guarding
  against invulnerable prey.
- `node tools/animal-clustering-soak.mjs`: seven restored maps, two seeds each,
  20 simulation days, no prolonged walking stalls or invalid reef shore crossings.
- `node --import ./tools/avoidance-seed.mjs tools/balance-sim.mjs restore 15` was
  run before/after with `Math.random = mulberry32(73621)` in a scratch seed loader.
  Both completed the restoration goals and retained predator/prey populations.
  Changed trajectories prevent treating runtime/population differences as an
  output-preserving performance benchmark.

This is headless behavior validation, not an exhaustive visual or ecological
realism review. Refuge and escape opportunities improve prey survival without
making escape or a catch guaranteed.
