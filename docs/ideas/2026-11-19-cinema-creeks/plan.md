# Idea batch 2026-11-19 cinema-creeks

Branch: `claude/ideas-cinema-creeks` (cut from origin/main 382bb46). Sessions run one at a time in this checkout.

## Ideas, grouped

- **Updates / web**: when a new version is live, the installed app (secondgrowth.earth → Install, desktop icon) loads it instead of a stale copy.
- **Camera & cinema mode**: show time of year; click an animal to lock onto it; two-finger rotate on phones.
- **Wildlife movement bugs**: deer sometimes walk very slowly again; animals keep clumping and no check catches it.
- **Creeks**: fish get stuck in the creek; trees survive standing in creeks.
- **Beaver dams**: water backs up behind the dam; the dam spans the whole creek.
- **Waterfalls**: natural falls where a creek drops over a step, fed by a spring, pools fill to the lowest bank and never flood.
- **Plants**: winter→spring leaf-out is gradual, not every bush on one day; shrub and grass distribution looks more natural.
- **Serengeti herds**: herd route follows green grass and water, so it varies from year to year.

## Nature check / changes from Cole's wording

- Force refresh → the game checks for a newer version at launch and loads it before play; mid-game a "new version, reload" banner shows after an autosave. Never reload under the player. (The game has no service worker; `worker-src 'none'`. The stale copy is HTTP or browser caching in the installed app window.)
- Leaf-out: real leaf-out spreads over 2–4 weeks, staggered by species, individual and warmth (early shrubs first, oaks late).
- Shrubs/grass: real ground cover is patchy. Clumps spread from parents and gather on edges and in gaps, with bare and mixed patches, not even noise.
- Trees in creeks (Cole picked): trees in flowing channels die; wet-tolerant species (willow, alder and the like) live on soggy banks and survive a while in standing pond water.
- Herds (Cole picked): follow the greenest grass and water within a broad seasonal loop, like the real Serengeti migration.
- Waterfall (Cole picked): natural falls on creeks over steep steps, spring-fed. No player-placed waterfall tool.
- Clumping: add detection to the motion sweep first, then fix what it finds, so clumping stops slipping through.

## Sessions

| # | Title | Ideas | Model | Size | Status |
|---|---|---|---|---|---|
| 1 | Fresh version on launch | force refresh | sonnet | S | [ ] |
| 2 | Cinema mode & touch camera | time of year, click-to-lock, two-finger rotate | default | M | [ ] |
| 3 | Movement bugs | slow deer, clumping + check | default | M | [ ] |
| 4 | Creek fixes | fish stuck, trees in creeks | default | M | [ ] |
| 5 | Beaver dams hold water | dam spans creek, water backs up | default | M–L | [ ] |
| 6 | Waterfalls | natural spring-fed falls | default | L | [ ] |
| 7 | Plants look natural | gradual leaf-out, patchy shrubs/grass | default | M | [ ] |
| 8 | Serengeti herd routes | herds follow green grass | default | M | [ ] |

Sessions 5 and 6 both change water flow; 6 builds on 5.
