# Idea batch 2026-11-08 wave2

Branch: `claude/ideas-wave2` (from main d3f319f). Ideas deferred from 2026-11-02-quick-wins (see its plan.md and open.md), cheapest first.

## Cole's standing answers
- Refactor: audit report first (read-only, ranked shared fixes); Cole picks what to build.
- Prefer shared rules over per-species or per-map patches; no frame-time regressions.

## Nature-check notes
- Pounces: stalkers (cats, some small canids like foxes mousing) pounce; wolves, wild dogs and hyenas run down and grab. Snakes strike from ambush.
- Anaconda: ambush at the water's edge, constrict, eat every few weeks; check it works, keep it rare.
- Eating: grazers crop, browsers strip, birds peck, fish snap; simple visible actions, no complex chewing.
- Reef start: degraded on purpose; a few healthy bommies show what's being restored. Anthias: orange-pink schools hovering over coral heads, diving in when threatened.
- Terrain slope: affects every map, water, balance and saves; design proposal only this batch.

## Sessions (sequential, this checkout)
| # | Title | Ideas | Model | Size | Status |
|---|---|---|---|---|---|
| 1 | Small fixes | Atlanta `animal-steering-check` (antler racks in trunks); "Invasives off" tag in Ecosystem Report; keystone glide on real time; climbing monkeys set trunk as lens support; seabirds float over deep water | sonnet | S | [x] |
| 2 | Reef start and anthias | 3–4 healthy colourful bommies at map start; anthias schools (new species) | opus | M | [x] |
| 3 | Snakes | every snake proportioned and moving like the anaconda; bigger, natural heads; anaconda catches prey (rare) | opus | M | [x] |
| 4 | Rich hunts | stalkers pounce/leap at prey; other natural hunt touches | opus | M | [x] |
| 5 | Eating for every animal | simple eating actions where easy | opus | M | [x] |
| 6 | Flower and fruit audit | find blob flowers/fruit, fix where cheap | opus | S–M | [x] |
| 7 | Serengeti soundscape | more species, real recordings (0002) | opus | M | [x] |
| 8 | Refactor audit (report only) | shared rules vs patches, perf, test/calibration cost, token efficiency | opus | M | [x] |
| 9 | Terrain slope proposal (design only) | more slope on maps, future water flow | opus | S | [x] |
| 10 | Blossoms and hanging fruit (Cole approved s6 recs) | showy trees get blossom heads (crepe myrtle, cortés, macuelizo, genízaro, sausage tree); jícaro, inga, açaí hang fruit; close-up only; play-profile on mains, within the Amazon GPU ceiling | opus | S–M | [x] |

## Later (lower priority, from open.md)
- Serengeti herds held up 55–70% of steps; fishing birds leave crowns cleanly; salmon leap by current and season; brush preview of poor tiles; chromis dive into staghorn as a moment; herd side-by-side travel.

## Owed checks
- `play-profile` for s5 (eating, ran on battery) and s6 (flowers, skipped at 13% battery): rerun on mains power before pushing.
