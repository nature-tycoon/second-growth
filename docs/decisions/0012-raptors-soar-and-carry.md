# 0012 Raptors soar, and carry off what they can lift

Decided 2026-10-18 by Cole.

## Context

Hawks only perched, hopped between trees and wheeled for about a second before a stoop, though the field guide says the red-tailed hawk "circles over open country". After a catch, the prey vanished and the bird "ate" for about a second with nothing in its feet. A fish taken over water vanished in mid-air.

## Decision

- **Soaring** (`def.soar`, the two hawks). An idle, fed hawk sometimes picks open ground near it with suitable habitat, and circles over it for 20–40 s on a 2.5–4 tile radius. It flies higher than ordinary flight (alt up to 1.6), holds its wings out with a short flapping bout now and then, and leans into the turn (`SOAR_BANK` in `render3d/actors.js`). A hungry hawk breaks off and the hunt starts from up there. Flight and hunting now ease alt down from above 1 instead of clamping, so it doesn't jump.
- **Carrying** (`def.carries`, every raptor and owl that hunts). After a catch, `carryCatch` in `sim/bird-behavior.js` decides what happens:
  - Prey it can lift: listed in `carries`, or a juvenile of any species. On open ground it mantles over the prey for about a second, then flies low and slow with it to the nearest perch within 10 tiles and eats it there. With no perch in reach it eats on the ground. A fish, or a monkey taken in a crown, is lifted in one movement.
  - Prey too heavy to lift is eaten where it fell. A fish too heavy to lift is dragged low across the water to the nearest bank.
  - Owls swallow small prey (length ≤ 14) whole in 1.5–3 s. Hawks, eagles and falcons pluck and tear for 4–8 s plus a little more for bigger prey.
  - `a.prey` is drawn in the talons in flight (a fish level, back up) and under the feet while it eats. It is never drawn longer than 0.85× the bird, because the display boost on small animals would otherwise hand a hawk a vole its own size.
- What each species can lift as an adult (roughly half its own mass or less, from field accounts):

| Predator | Carries | Eats on the ground / drags |
|---|---|---|
| Red-tailed hawk (1.1 kg) | vole, garter snake | brush rabbit |
| Great horned owl | vole, squirrel, rabbit | |
| Bald eagle | cutthroat trout | coho (dragged to the bank) |
| Barred owl | chipmunk, toad, peeper | |
| Red-shouldered hawk (0.6 kg) | chipmunk, toad, anole | rat snake |
| Harpy eagle | sloth, howler, spider monkey | |
| Laughing falcon (0.6 kg) | young boas and iguanas only | adult boa, iguana |
| Barn owl | woodrat | |
| Crested serpent eagle | flying frog, young pythons and monitors | adult python, monitor |

- The data contract checks that `carries` only names prey the species hunts.

## Consequences

- Catch odds, hunger and population ecology are unchanged. On the Hollis restore run over 3 seeds, hawks, owls and their prey stay within seed noise.
- Herons, kingfishers and otters still eat on the spot. Adding them would be a separate change (in reality they carry fish in the bill).
- `tools/bird-behavior-check.mjs` covers the carry table, the mantle → carry → perch → eat sequence (including a save made mid-carry), eating on the ground, owls swallowing whole, and the eagle with trout and coho.

## Amendment 2026-10-20: the catch comes at the bottom of the dive

Cole saw hawks "picking a vole out of the top of a tree" and flying to another tree to eat it.
A flier caught its prey as soon as it was within half a tile horizontally, whatever its height,
and the drawn drop (`a.stoop`) came from distance alone. A hawk perched beside a vole, or right
above one, took it at crown height. The mantle check also looked at the hawk's tile (a tree) instead
of the prey's, so it lifted straight off to another tree. In a PNW community every raptor and owl
catch (9 of 9 hawk, 12 of 12 owl) happened before the dive was finished.

Now, in `huntStep` (`sim/animal-life.js`):

- A flier catches only once `a.stoop` reaches 1. The dive reaches the ground as the bird comes over
  its prey and falls at most 8 per sim-day (about a quarter-second on screen).
- A raptor that starts a hunt from a perch (`hunt.perch`, set in `startHunt`) drops straight on
  instead of circling first.
- `carryCatch` mantles by where the prey was: on the ground, not a fish, not a tree animal. The lift
  starts from low altitude.

Catch counts held (hawk 9 → 9, owl 12 → 14). `bird-behavior-check` covers a hawk and an owl perched
beside a vole and a hawk directly above one. `challenging-ecology-check` gives fliers up to four
steps to finish the dive on contact.
