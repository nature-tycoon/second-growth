# 0011 Grazing pressure and where elk spend their time

Decided 2026-10-17 by Cole (shipped).

## Context

Grazing used to do little to the land. A "grass" meal on land left the plants untouched (only seagrass was cropped). Browsers nibbled the shrub on their own tile once a day, and in Challenging they also browsed saplings. On the savanna, big herbivores trampled seedlings. On the Hollis restore run, meadow peaked at about 2,150 tiles in year 8 and fell to 230–720 by year 15, with 35–40 elk and deer on the farm. Native shrubs and invasives took the rest.

There were two reasons. Pressure only landed on the tile an animal stood on. And herds kept the feed/rest range they picked on arrival (0010), so elk that came in from the north never used the meadows sown further south.

## Decision

- `sim/grazing.js` keeps a per-tile `w.grazed` field (saved with the farm, decays 1.5% a day). Each day every ground grazer or browser spreads one day's intake over its feeding range: radius √hr, at most 8 tiles, weighted by its habitat suitability × the grass or browse there × how fresh the grass is. Weight is (body length / deer)², at most 2. Each map scales it with `grazing`.
- Woody seedlings in a grazed sward: natural recruitment odds × (1 − 3p), and wild seedlings under 0.1 are sometimes lost. Young shrubs and saplings under 0.4 keep only (1 − 2p) of their growth. p fades among trees (`nbCanopy`), drops by the water (0.4) and on bare ground (0.5), and is mostly blocked by brush or a fence line (0.15). Invasives, aquatics and mangroves are exempt. Planted nursery stock starts at 0.1, above the seedling-loss threshold.
- Grass is only cropped back where pressure is above 0.75, and never below 0.15. That is overstocking.
- Herds score feed sites by fresh grass, move on when their feed site passes 0.6, and grass-first feeders (now including elk) search 28 tiles for a feeding ground instead of 20.
- Where elk spend their time decides where the pressure lands. Cole saw elk clustering at the top of the map and lingering at the water. Headless, they spent 79% of their time in the north third (16–38% of their habitat is there) and 63% within 2 tiles of water (about 10% of their habitat). There were three causes, each fixed in `sim/animals.js` / `sim/animal-trails.js`:
  - Roaming (0003) is skipped once a family holds a feed/rest range (0010), so a herd stayed where it arrived. Now a settled family-herd leader moves on to another patch about once a year (daily roll, 1/120). It doesn't happen in the rut for bulls, or for juveniles.
  - Overland roam routes broke ties along the property's outer ring. Elk walked the north boundary for weeks, wore the strongest trail there, and trail preference kept them on it. Now walkers that aren't leaving keep off the outer ring.
  - Drinking held deer and elk at the bank for 2–5 time units out of every 5–9, and half their rest sites were on the creek bank. Now they drink for 0.8–1.6 and rest sites within 1 tile of water score ×0.4. Elk now look for grass before browse, so they feed out on the meadows.
- Map strengths: pnw 1, chinandega 0.5, serengeti 0.25 (trampling and fire already keep it open, and giraffe need young acacias), amazon/sumatra 0.3, atlanta 0 and reef 0.

## Consequences

- Hollis restore, 4 seeds (12345, 777, 99, 4242), with everything above: in years 8–15, elk time in the north/middle/south thirds goes from 79/18/3% to 37/32/30%, and time within 2 tiles of water from 63% to 37%. Elk numbers at year 15 are 19/15/18/19 before and 18/17/15/19 after. Meadow at year 15 averages 528 tiles before and 956 after. Young forest goes from 254 to 206.
- Forcing families to relocate every ~45 days lowered elk numbers (3–6 for years in 2 of 3 seeds), so relocation is kept at about once a year.
- Shrub is unchanged at about 4,000, because most of it comes up on bare old fields and forb patches that grazers don't use, and invasives are left to the player.
- Serengeti, Chinandega and Sumatra are within seed noise on idle runs. Atlanta at 0.3 halved young forest, which is why it is now 0.
