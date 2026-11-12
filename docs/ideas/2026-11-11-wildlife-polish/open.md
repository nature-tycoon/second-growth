# wildlife-polish: open questions and new ideas

All four sessions landed on `claude/ideas-wildlife-polish` (aed7cd7, 2cf4495, f86d41c, 1e26e09). Details in `s1.md`–`s4.md`.

## Open questions (recommended answer in bold)

**Small animals**
- A garter snake that never moves couldn't be reproduced (snakes walk ~75% of warm months now). **If seen again, click it and screenshot its status line.**
- Cover only protects prey at Challenging difficulty. **Leave it; a separate change if wanted (affects every map).**

**Birds and fish**
- Birds hold treetop height ~1.5 s over a clearing before gliding down. **Keep (real gap-crossing); knobs `HOLD`/`GLIDE` in `flight-clearance.js`.**
- Eye-level camera under the sea still steps over bumps right under the eye. **Leave unless seen.**
- Floating ducks' legs hang in a standing pose under clear water. **Later polish: tuck legs while afloat.**

**Lens hole**
- Older unmerged lens branch `claude/wave3-s5-tracker-lens-aaed29` edits the same lines. **Keep this batch's lens, close that branch** (rim width can go to 0 if the clumpy rim still reads "old school").
- How wide near-camera foliage opens (`0.7`), and rim width (outer third). **Keep both; tune after watching.**
- Trunks rising past the animal's feet can still be cut. **Leave.**

**Monkeys**
- Chose piece-by-piece fixes over the canopy rewrite (29k lines, 307 commits stale, its own audit "rollout blocked"). Decision 0041.
- Orangutans stall at crown gaps ~1/3 of the time. **Next session: crown-connectivity map so a gap they can't reach becomes climb down, walk, climb up.**
- Monkeys trail ~2 tiles at speed 2+. **Leave.**
- Delete `monkey/canopy-rewrite-wip`? **Keep until the orangutan fix, then delete.**

**Pre-existing**
- `animal-culling-check` fails on main too (zebra leg clock, `tools/animal-culling-check.mjs:89`). **Fix in a small session.**

## New ideas (nature-checked)
- Garter snakes also eat slugs, earthworms and rough-skinned newts (real; they tolerate the newt toxin). Balance change.
- Brush rabbit "freeze, then dash into the thicket" escape (real brush rabbit behavior).
- Mallards tip up to dabble now and then, head under, tail up (real; pose + timer).
- Per-species primate rest budget: howlers rest ~2/3 of the day, all rest through midday heat (real; like 0014).
- Capuchin/colobus forward snaps in patchy stands, trace with `tools/monkey-movement-measure.mjs`.
- Lens soft rim shared with see-through tree mode; finer close-up shrub model at eye level.
- Precomputed blurred canopy-height grid for flight look-ahead (only if flier counts grow).

## Cole's answers (2026-11-11)
- Lens: keep this batch's depth-based lens with the soft rim; close `claude/wave3-s5-tracker-lens-aaed29` (not deleted yet).
- Orangutan crown-gap fix: yes, next batch.
- Next batch also takes: primate rest budget, mallard dabbling + tucked legs, brush rabbit freeze-and-dash, fix `animal-culling-check`.
