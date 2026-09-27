# Second Growth

A rewilding tycoon game set on a worn-out farm in the Pacific Northwest foothills, shown as an isometric 3D diorama. You don't buy animals or upgrades. You shape water and soil, brush in native plants, pull invasives, and tear out the old farm. Wildlife then follows its own rules: it wanders in from the surrounding forest, river and farms when there's room, raises young, hunts, and moves on when there isn't enough.

## Running it

There's no build step. The game is plain JavaScript modules plus a vendored copy of [three.js](https://threejs.org) (MIT, in `vendor/three/`), so it just needs a local web server:

```bash
python3 -m http.server 8347
```

Then open http://localhost:8347. The game autosaves to browser storage every in-game month.

## Controls

- Pick a tool on the left, then click and drag to brush it. `[` and `]` change the brush size.
- Right-drag or `WASD` / arrow keys to pan, scroll wheel or `+`/`-` to zoom, `Q`/`E` to rotate the view.
- `Space` pauses, `1`–`3` set the speed. `T` sees through trees, `H` toggles the habitat overlay, `G` opens the field guide, `Tab` hides the side panels.
- Panels collapse with their `−` button, and fade out while you paint.
- Use **Inspect** to click a tile or an animal. The **Overlay** menu shows moisture, soil, sunlight, fish passage, or where a given species could live.

## How the ecosystem works

- **Time:** 1 game day per second at normal speed, 10 days a month, 120 days a year. Seasons change growth, moisture, blooming, fruiting and migration.
- **Plants** (33 PNW species) each have moisture, light and soil ranges. They grow where conditions suit them and decline where they don't. Once mature they spread seed. Seeds also drift in from the forest edges, from the river in floods, and (blackberry, broom, canarygrass) from the neighbouring farms.
- **Succession:** nitrogen fixers (red alder, lupine, Scotch broom) rebuild soil. Canopy shade shifts the understory to ferns and salal, and shade-tolerant cedar and hemlock replace short-lived alders. Dead trees become snags, then logs, then soil.
- **Water:** moisture falls off with distance from water. Creek shade sets water quality. Fish can only reach water that connects to the river, and the old culvert blocks it.
- **Wildlife** (34 species): each species rates every tile's habitat. Carrying capacity is the total suitable habitat divided by the home-range size, limited by needs across the whole property: prey for predators, snags for woodpeckers and bats, berries for bears, fish for otters and herons. Animals breed in season when there's room, die or leave when there isn't, and immigrate from their source edge. Deer and elk are blocked by the boundary fences.
- **Special behaviour:** beavers coppice willow, fell alder and build dams that flood new wetlands. Coho run up connected, shaded creeks each October, spawn, die and feed the soil, and their fry return three years later. Migratory birds leave in fall and come back if the habitat is still there.
- **Scale:** the farm is 120×90 tiles. Plants are smooth, instanced low-poly models that sway in the wind, with simpler versions used when zoomed out; animals and visitors are high-resolution sprites you can zoom right in on.
- **Terrain:** the valley slopes from the northern foothills down to the river. Hollows are wetter and ridges drier. Digging water carves the ground, and the Raise and Lower tools reshape it.
- **Fire:** in late-summer droughts, lightning or a visitor's spark can start a wildfire. It spreads through dry grass, broom and blackberry, and runs uphill faster. Trails, water and bare ground stop it, and rain puts it out. Douglas-fir and oak usually survive; young trees and most shrubs don't, while native meadow plants resprout. Send a fire crew to fight it, or use controlled burns to cut the fuel ahead of time.
- **Floods:** long winter rains push the river over low ground beside the river and creeks. Seedlings drown, fresh silt enriches the soil, floodplain seeds (willow, cottonwood, and canarygrass too) arrive, and beaver dams can wash out. Marshes and ponds absorb part of every flood.
- **Visitors:** build a trailhead parking lot beside a road and connect trails to it (within two tiles), with boardwalks over wetlands, viewing blinds and a visitor center. The rating depends on the wildlife seen from the trails, the scenery along them and their length. Visitors pay per head, trails cost upkeep, and people on the trails disturb shy species (elk, cougar, bear, heron, pond turtle) nearby.
- **Funding:** money is tight at first ($30,000). A monthly grant scales with the ecosystem health score and the number of species present, visitors add donations, and each new species and restoration goal pays a bonus.

## Project layout

```
index.html, styles.css      page shell and UI styling
js/config.js                constants, terrain / feature / habitat enums
js/data/plants.js           plant species, seed mixes
js/data/animals.js          animal species and their habitat rules
js/world.js                 map arrays, farm generation, surroundings
js/sim/environment.js       water, moisture, canopy, distance fields, habitat classes, food
js/sim/plants.js            growth, seeding, competition, soil
js/sim/animals.js           wildlife agents, population dynamics, beavers, salmon
js/sim/goals.js             score, grants, goals
js/game.js                  clock, events, save/load
js/tools.js                 player tools
js/render3d/                three.js scene: terrain mesh, instanced low-poly plants, buildings, sprites, lighting
js/render/sprites.js        procedural 2D art: terrain textures, animal and visitor sprites, UI thumbnails
js/sim/visitors.js          trails, visitor numbers, rating and income
js/sim/events.js            wildfires and floods
vendor/three/               three.js 0.186 and its BufferGeometryUtils addon (MIT)
js/ui/                      DOM interface
tools/balance-sim.mjs       headless balance simulator (node tools/balance-sim.mjs restore 15)
```

Most tuning lives in `js/data/*.js` (species ranges, growth, spread, home ranges) and `js/sim/goals.js` (economy). Run `tools/balance-sim.mjs` after tuning to see how a farm develops over decades in a few seconds.
