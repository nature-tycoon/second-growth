# Aesthetics batch: open questions for Cole

Every session made a mild, reversible choice and logged it here. Each line's default (what shipped) is
the session's recommendation; details and pictures in each `sN.md`.

| # | From | Question | Shipped (recommended) | To change |
| --- | --- | --- | --- | --- |
| 1 | s2 | Push contrast harder? | Mild grade; brighter paths and soil come from material colours instead | contrast ~1.18 clips sand and snow |
| 2 | s2, s4 | Bluer shade on open ground? | Sky left alone (0032) | tiny blue lift on dark values in the grade |
| 3 | s2 | PNW spring meadow fresher green | Keep | PNW pasture saturation back in `js/maps/pnw.js` |
| 4 | s3 | Rainforest crown variety | Keep the mix (grey emergents, dark figs, new-leaf yellow-green) | `crownVary.hue` 0.045 → 0.03; drop `morphs` if new leaf looks like disease |
| 5 | s3 | Temperate crowns vary a little more (±8.5%) | Keep | the default in flora |
| 6 | s3 | Serengeti laterite: soft red-brown, pale ring at patch edges | Keep; the ring needs the ground shader's edge blend changed for every map | a later pass |
| 7 | s3, s4 | Reef still pale green at play zoom | Untouched | a deeper `look.underwater.shallow`, looked at alone |
| 8 | s4 | Night brightness (same median, deeper shadows, no navy haze) | Keep | `WASH_NIGHT` 0.12 up for bluer and darker |
| 9 | s4 | Season tint strength | `WASH_SEASON` 0.6 | toward 1 for stronger seasons |
| 10 | s4 | Sun wash, vignette, rain dimming still 2D | Left | a later pass |
| 11 | s5 | Animal sky rim strength | Faint (`SKY_RIM`) | 9–10 to make deer pop in grass |
| 12 | s5 | Degraded pasture duller than restored | Keep (the land gets richer) | `DEGRADED.sat` to 1 |
| 13 | s5 | Solid HUD panels on phones | Keep | the `@media (pointer: coarse)` background line |
| 14 | s5 | About 11% fewer flowers, in drifts | Keep | raise the drift floor (0.35 in `flora.js`) |
| 15 | s6 | Cougar face markings soft | Keep | darken `patch` in `plainFace` |
| 16 | s6 | Other cats (bobcat, leopard, cheetah, ocelot, jaguar) still the old cat shape | Next: bobcat, with the animal-model checklist | a session per cat |
| 17 | s7 | Deer ear insides dark grey | Keep (every mammal's cupped ears) | a lighter crease floor for ears |
| 18 | s7 | White-tailed deer (Atlanta, Chinandega) | Next: turn on `slender`, its own face and white-fringed tail | a session |
| 19 | s7 | Elk and sambar still the old deer shape | Next: the elk | a session |
| 20 | s7 | Deer head carriage between walking and alert | Keep | lower a little |
| 21 | s8 | Warmer dawn for the film's forest | Misty morning (`tod` 0.07) | 0.04 for the opening only |
| 22 | s8 | Thin stems over the cougar's face drawn see-through (the lens, F3) | Keep for plants; trunks are solid | a film-only gap through stems (`clearShrubs`) |
| 23 | s8 | Shot 2 moved 2 m south, framed between alders | Keep | `tools/intro-film-plan.mjs` |

After the batch: the buck's antlers moved forward onto the crown (s7.md, "After the batch"); the
intro film was filmed just before, a small difference.

New ideas the sessions noticed are in each `sN.md` ("New ideas").
