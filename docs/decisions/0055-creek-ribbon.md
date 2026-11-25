# 0055 Creek ribbon: a one-tile creek's water ends at a smooth ribbon along its course, drawing only

2026-11-24, ideas batch phone-creeks-fish, session 6. Cole: a tight S dug with the creek brush at size 1
draws in tile steps; he chose "Yes, smooth ribbon" over raising dug creeks' banks (s2.md).

## Rules

- **Drawing only.** `creekRibbon(w)` (`js/render3d/creek-ribbon.js`) gives every world corner how far inside
  a ribbon along the creek it lies (tiles; `RIBBON_CAP` where it doesn't govern). `buildWater` passes
  `edge(k, depth)` as `aRibbon`; the water shader takes `shoreD = min(shoreD, vRibbon)`, so the alpha
  fade and foam follow whichever is nearer, the ground's waterline or the ribbon's edge. Nothing else
  moves: water levels, vertex heights, `aCurrent`/flow, `waterAt` (animals swim by it), `shoreVertices`,
  banks, falls, the sim, fish, plants, land. Every other mesh on the water material (floodwater) passes
  `aRibbon` 99: a missing attribute reads 0 and would hide it.
- **The course is found again from the tiles every rebuild** (courses aren't saved): `creekCourses` over
  one-tile creek tiles, centres smoothed along each chain (Gaussian, σ 1 tile, ends and the tiles within
  two of a junction pinned: Sumatra's canals keep their right angles, 0054), then corner-cut twice.
  Half-width `RIBBON_HALF` 0.9 (a dug bed lies within ~0.7 of the course, the corners the shore pass
  lifts at ~1.06); it narrows to `RIBBON_HEAD` 0.5 over the last 2.5 tiles into a head, so heads still
  narrow (0054).
- **Where it governs:** a corner whose 4x4 tiles hold a course tile and no other wet tile (pond, marsh,
  river, a creek two wide, a fall, a beaver pond standing over the creek, a dug stub with no course).
  Off the map (the creek beyond the north fence) the farm's field isn't laid: that creek has its own
  ribbon along `border.north`'s line (0054, `northCreekAt`), and the fence row's corners with no farm water take the lower of the two. Elsewhere the water keeps
  its own waterline, so a mouth flares over a tile into the pond or river it meets.
- **Bed guard:** at a corner of a course tile the ribbon never hides water deeper than `RIBBON_DEEP`
  0.2 (`RIBBON_DEEP_HEAD` 0.28 on a head's last three tiles, so the end still narrows): no dry pits
  beside the water. Not on bank-only corners: a deep strip of bank flooded downhill stays cut. (Without
  the guard on heads, the ribbon's 0.5 end cut a dug head's 0.32-deep corners dry: diff review.)
- **Check:** `tools/creek-ribbon-check.mjs` (headless suite) works the outline out as the shader does,
  on every creek map as generated and with a tight brush-1 S dug through ToolActions: S sharp share
  under 4%, no deep bed outside it (heads included), heads narrow but keep their water, field under 40 ms. `water-shape-check`'s `drawnWater`
  measures the ground's waterline alone (no ribbon): its ceilings still hold, and the ribbon only trims.

## History

Before (s2, 2026-11-23): a creek's banks sit 0.03 over its water (0054: beaver ponds and floods spread
over them), so the waterline ran out ~0.9 tile along the next tiles' edges; a brush-1 S's outline turned
over 60° within a tile at 12-20% of its samples. Raising dug creeks' banks was measured and not built
(it fixed nothing on PNW's cross-slopes and stopped beaver ponds spreading). Measured with the ribbon
(2026-11-24, seed 1987, dug S, outline sharp share before -> after): pnw 23.4 -> 3.3%, amazon 6.1 -> 3.3%,
serengeti 15.5 -> 2.7%, atlanta 7.3 -> 2.1%, chinandega 20.4 -> 2.7%, sumatra 8.1 -> 2.7%; whole maps as
generated no worse (atlanta 5.1 -> 3.0%, chinandega 8.2 -> 6.0%). Dug heads' width at the end tile over
three tiles back: 0.92-0.97 -> 0.59 (pnw 0.19, a steep head). Field cost warm: 2-5 ms per water
rebuild (pnw, amazon, sumatra).

Not built: a spoil bank piled on a cross-slope creek's downhill side (a real ditch's). The ribbon already
trims the flooded strip there; a raised bank would mean sim terrain heights (animals walk on them), so
it's logged as an open question in the batch notes (s6.md).
