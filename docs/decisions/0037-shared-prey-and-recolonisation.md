# 0037 Shared prey, cover for stalkers, search images, and recolonisation

## Rules

- All rules are general, every map. Shared prey (`Wildlife.sharePrey`, after `computeSuitability`): each prey animal is split between the hunting species that eat it. A hunter's own share is set by its habitat room (`min(max, K) × preyPer`); others claim only what they eat now (`min(room, pop) × preyPer`); an absent hunter eats nothing. `preyK` is never above the old unshared count.
- A new hunter's `preyPer` assumes it shares its prey; set it for its share, not the whole stock.
- Stalking cats (`closeIn > 0`, not cheetahs) prefer prey near cover (`stalkCoverAt`, reusing `preyCover`). Prey see a hunter in the open from further (`watch`, up to 8.4 tiles). Chasers ignore cover by design.
- Search image: `a.searchImage` (set in `startFeed`) makes other kinds count 1.5× as far, so rare prey persist. It isn't cleared.
- Arrivals from off-map use the existing `mig`/`sources` rule (rhino `mig: 0.01`). Rare species (hartebeest, topi) depend on arrivals, as in life.
- Trunk keep-out keeps at least 0.55 of the body's half-width clear beside a thick trunk (`r + half × 0.55`, `ground-obstacles.js`).
- Seed `Math.random` before `restoredGame` in a seeded check (its first animals draw on it).
- Checks: `wildlife-diagnostics-check`, `wildlife-additions-check`, `hunt-check`, `animal-life`, `prey-avoidance`, `challenging-ecology`, `scavenger-arrival`, `animal-steering-check`; seeded `balance-sim restore 15`.

## History

2026-11-01. Workstream F. Cole agreed the design on 2026-11-01. He dropped the new species (bison,
moose, brown bear) for a later map: none of them fits the Hollis valley's real range (moose live in
northeast Washington, bison never lived west of the Cascades), and only bison fits Atlanta.

### Context

Two reports: on an untended Serengeti, rhino, cheetah and spotted hyena were gone and never came
back; and Coke's hartebeest died out on the integration work.

**Recolonisation already exists.** A species arrives from its `sources` edges at `mig` a month once
its capacity reaches `minK`, after a "finding" ramp (`arrivalFinding`). On this branch, in a
400-year untended Serengeti (seed 7), cheetah and hyena went locally extinct several times and came
back every time. The savanna grass fires of 0035 keep the plains open. The rhino never came back
because its data said `mig: 0` (introduction only).

**Hartebeest died out from predation, not habitat.** They had room for 6 (the cap) the whole time,
and habitat for 12–20. Measured over 40 years per head per year (seed 7): hunted 3.6 times, killed
1.09, born 0.10. Gazelle were killed 0.42, impala 0.24 and buffalo 0.20. With lions and hyenas
removed, hartebeest held at about 5. Two causes:

1. **Predators didn't share their prey.** Each hunting species set its capacity from every prey
   animal it eats (`prey / preyPer`) as if it had them alone. Lions (1 per 7), hyenas (1 per 5),
   cheetahs (1 per 6) and leopards all counted the same gazelle, so the farm carried about one
   hunter for every six prey. The Serengeti runs closer to one per 100–200 (Schaller 1972; Sinclair
   & Norton-Griffiths 1979). Warthogs were killed faster than they bred, and gazelle crashed to 1 now
   and then.
2. **Hunts landed on the open-plains grazers.** A hunter goes for the nearest prey, and the hunters
   live on the grassland. Plains grazers were hunted 7–10 times as often per head as impala or buffalo
   in the bush. In the field it's the other way round. Lions catch prey where cover lets them stalk
   close: near water, thickets and tall grass, not where prey are most numerous (Hopcraft, Sinclair &
   Packer 2005, *J. Anim. Ecol.* 74). Hartebeest, topi and gazelle keep to open short grass because
   they can see a hunter coming.

With herds of 2–3, one kill leaves too few to breed.

### Decision

All three rules are general, on every map:

- **Shared prey** (`Wildlife.sharePrey`, after `computeSuitability`). Each prey animal is split
  between the hunting species that eat it. A hunter's share is how many prey it would need to fill
  the room its habitat gives it (`min(max, K) × preyPer`), so a hunter with no habitat here claims
  nothing. `preyK` is never more than the old unshared count.
- **Stalkers need cover** (`stalkCoverAt` in `animal-life.js`). A ground hunter whose style creeps
  in under cover (`closeIn > 0`: the cats, but not cheetahs, which run prey down in the open) counts
  prey out on open short grass as up to twice as far when it picks a target. Cover is the existing
  `preyCover` at the prey's spot and one step back toward the hunter.
- **A hunter in the open is seen from further.** Prey's lookout (`watch`) reaches 6 tiles ×
  (1.4 − 0.4 × the hunter's own cover), up to 8.4 tiles, then shrinks with a stalker's hide as
  before (0026).
- **Search image** (`a.searchImage`, set in `startFeed`). A hunter with more than one prey species
  counts kinds other than its last catch as 1.5× as far. Rare prey get passed over for the common
  kind: the classic prey-switching refuge (Tinbergen 1960; Murdoch 1969). This was added after
  measuring that hyenas, which chase in the open and ignore cover, had become the hartebeest's main
  hunter (83 of 108 hunts on them in 30 years).
- **Rhino** wanders in from the north (`mig: 0.01`, one at a time), the rarest arrival on the map.
  Black rhino are very rare in the Serengeti (a few dozen in the park).

Hartebeest and topi stay naturally rare. 73 ha holds one or two hartebeest in the wild (1–3/km²), so
they depend on arrivals from the population beyond the farm's edge, as they would in life.

### Results

`balance-sim`-style seeded runs, untended, 40 years, mean count and kills per head per year
(before → after all four rules):

| Serengeti | Seed 7 | Seed 11 |
|---|---|---|
| Hartebeest | 1.8, killed 0.78 → 4.3, killed 0.22 | 3.0, killed 0.40 → 3.4, killed 0.24 |
| Topi | 2.7, 0.53 → 4.0, 0.23 | 3.4, 0.41 → 3.1, 0.39 |
| Gazelle | 19 → 33 | 22 → 34 |
| Warthog | 4.9, 1.41 → 10.4, 0.72 | 7.6, 1.08 → 17.6, 0.44 |
| Buffalo | 11 → 17 | 14 → 19 |
| Lion / hyena / cheetah / leopard | 4.7 / 4.7 / 2.7 / 2.4 → 3.4 / 3.4 / 1.5 / 1.6 | 5.7 / 5.6 / 2.5 / 2.8 → 3.6 / 3.6 / 0.9 / 1.9 |

Every predator stays; there are about a third fewer. The other maps (seed 7, 40 years, shared prey and
cover only) moved in the same direction: PNW rabbits 12 → 21 and squirrels 2 → 6, with bobcats 2.9 → 1.6
and hawks 2.4 → 1.4; Atlanta chipmunks 8 → 17; Sumatra leopard cats 12 → 4 and pythons 1 → 3;
Amazon anacondas 4.3 → 1.3.

Hollis `balance-sim restore 15`, seeded `s=7`, all four rules: score at years 5/10/16 was 64.6/62.2/61.3
and is now 60.7/72.3/75.1. Natural cover at year 16 went 54% → 62%, forest 168 → 191 tiles, and
mature trees 43 → 51. Rabbits 7 → 13 and elk 13 → 18; bobcats 4 → 1 and owls 3 → 1. Every restoration
goal is still met. ms/day is unchanged: 8.0 against 9.0–9.5 for base, timed back to back on 5-year runs.

### Verification

- `wildlife-diagnostics-check` now checks the shared `preyK` (never above the unshared count) instead of
  the old formula.
- `animal-life`, `prey-avoidance`, `challenging-ecology`, `hunt-check` (within the 0026 limits),
  `animal-behavior` and `scavenger-arrival` checks pass. In `check-release --headless`, everything
  passes except `animal-steering-check`. Base also failed it on the Serengeti (seed 1987: 10 sparring
  steps stuck). With the hunting rules, it tripped on bodies inside a trunk instead: 0.62 → 2.12 per
  1000 (limit 2). These were hartebeest feeding beside a baobab, and an elephant beside one. Base had
  almost no hartebeest alive, so it never showed.
- **The trunk gap, fixed** (`ground-obstacles.js`). A walker's keep-out round a trunk was capped at
  `max(KEEP_MAX, r + 0.02)`, so there is always a way between thin trunks in a dense stand. Beside a
  thick trunk (a baobab, r 0.3) the cap left 0.02 to spare, and half the body stood inside it. The cap
  now keeps at least 0.55 of the body's half-width clear (`r + half × 0.55`), and the same for an
  antler rack. Thin trunks are unchanged (KEEP_MAX still decides there). Serengeti bodies in trunks,
  seeds 1987 / 7 / 11: 2.12 / 3.39 / 0.16 → 0.03 / 0.53 / 0.40, with no more squeezing.
  `animal-steering-check` passes on every map except Atlanta. There, at seed 1987 only, 6.67 racks per
  1000 sit in a trunk (limit 5; base 1.67). They are bucks sparring among thin trunks, where the cap is
  meant to leave room. Seeds 7 / 11 / 23 read 0 / 0.12 / 0 (base: 0 / 0 / 1.9), so it's the few
  antlered bucks in this short check, not a trend. `ground-obstacles`, `cervid-behavior` and
  `animal-positioning` checks pass.

### What the others eat (2026-11-02)

`wildlife-additions-check` ("atlanta/otter: natural arrivals are attainable") failed about 2 runs in
5 after this decision, and always on a fixed seed. Two causes:

- **The claims.** Every hunter claimed its full habitat room (`min(max, K) × preyPer`), present or
  not, and even when there weren't that many prey. Atlanta's bass claimed room for ten bass, 50
  bluegill, where the creek held about 15, so the otter's share of the creek's fish was half an otter
  (K 0.5, below `minK` 1), and otters could never settle on a restored Atlanta. Now a hunter's own
  share is still set by its room, but the others claim only what they eat now: `min(room, pop) ×
  preyPer`. An absent hunter eats nothing. When every hunter is at its room the split is the same as
  before.
- **The otter's appetite.** `preyPer` 12 was set when the otter counted every fish in the creek as
  its own. It shares them with the bass, and on Challenging with the herons, so it is 6 now. With
  that, the otter's K on the check's restored creek sits at its habitat limit (median 1.37, as on main
  before this decision).

Otters arrive within ten years on all three difficulties in 30 of 30 runs (Math.random seeds 1–10).
The check was also not repeatable: it seeded `Math.random` after `restoredGame`, whose first animals
draw on it, so each run started with 17 to 19 of them. It now seeds before.

`balance-sim restore 15`, seeds 7 / 11 / 23, same code with the old and new claims: score at year 15
59.9 / 62.5 / 61.1 → 64.7 / 64.8 / 61.4, the same predators (coyote 2–4, bobcat 1–2, hawk 1–2,
owl 1–2). Against the base the same seeds read 73.7 / 68.7 / 59.1. That gap comes from the steering
fixes in the same change (0025), which move every map's random sequence; three seeds spread this
widely can't tell it from chance.

### Known limits

- Predator numbers are lower on every map, as intended. A predator whose prey is mostly someone
  else's (Sumatra's leopard cat shares rodents with pythons, owls and civets) loses the most.
- Hyenas, coyotes and other chasers ignore cover by design. Only the search image protects rare
  prey from them.
- `searchImage` isn't cleared. A hunter whose last catch has gone from the map treats every kind alike,
  but looks only 8 tiles out rather than 12 until it catches something.
