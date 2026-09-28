# Second Growth

A rewilding tycoon game shown as an isometric 3D diorama, with three maps: a worn-out dairy farm in the Pacific Northwest foothills, a cattle ranch cut from the Amazon rainforest, and an overgrazed range on the edge of the Serengeti. You don't buy animals or upgrades. You shape water and soil, brush in native plants, pull invasives, and tear out the old farm. Wildlife then follows its own rules: it wanders in from the surrounding forest, river and farms when there's room, raises young, hunts, and moves on when there isn't enough.

## Running it

There's no build step. The game is plain JavaScript modules plus a vendored copy of [three.js](https://threejs.org) (MIT, in `vendor/three/`), so it just needs a local web server:

```bash
python3 -m http.server 8347
```

Then open http://localhost:8347. The game autosaves to browser storage every in-game month.

## Controls

- **Campaign or Free Play.** The campaign walks you through eight chapters on the same farm (fields, water, opening the gates, shading the creek, wildlife homes, fire and flood, visitors, reintroductions). Each chapter has three goals and unlocks the next set of tools; wildfires and floods begin in Chapter 6. Free Play has every tool from the start.
- Pick a tool on the left, then click and drag to brush it. `[` and `]` change the brush size, and each tool group remembers the size you last used.
- Right-drag or `WASD` / arrow keys to pan, scroll wheel or `+`/`-` to zoom, `Q`/`E` to rotate the view.
- `Space` pauses, `1`–`3` set the speed. `T` sees through trees, `H` toggles the habitat overlay, `G` opens the field guide, `Tab` hides the side panels.
- Panels collapse with their `−` button, and fade out while you paint.
- Use **Inspect** to click a tile or an animal. The **Overlay** menu shows moisture, soil, sunlight, fish passage, or where a given species could live. In the field guide, the pin on any species that lives here jumps the camera to one of them and follows it.
- **On a phone or tablet:** drag one finger to brush, tap to place or inspect, two fingers to move the map and pinch to zoom, and the arrow buttons rotate the view. Phones play in landscape (portrait shows a "turn your phone" screen); full screen or Add to Home Screen gives the most room.
- The gear button opens **Settings**: audio (lo-fi music and nature sounds, each with a volume), gameplay (difficulty, autosave, pausing on wildfires and floods, notification level), graphics, controls and privacy. The speaker button or `M` mutes everything.
- **Difficulty:** Relaxed, Standard or Challenging. It scales starting money, grants, what work costs, how often fire and flood come, and how hard invasive seeds press in from the neighbours. Pick it for a new game, or change it any time in Settings.
- **Music** is a shuffled, crossfaded set of public-domain (CC0) lo-fi tracks by HoliznaCC0 in `assets/music/` (listed with their sources in `js/audio/tracks.js`). Nature sounds are synthesized live with Web Audio and follow the weather and seasons.

## Maps

- **Hollis Farm** (Cascade foothills, Washington): 33 plants and 34 animals, salmon runs, beavers, winter floods and snow, summer fires. Has the eight-chapter campaign and Free Play.
- **Fazenda Esperança** (Pará, Brazil): an old cattle ranch where African pasture grass (braquiária) runs fence to fence and burns every dry season, with the rainforest waiting just beyond the north and east fences. 27 plants (cecropia, ingá, açaí and buriti palms, Brazil nut, kapok, ipê, heliconia, bamboo, and the invasive grasses) and 26 animals (jaguar, tapir, howler and spider monkeys, sloth, giant otter, toucan, scarlet macaw, harpy eagle, caiman, anaconda, pink river dolphin, arapaima and more). Sow the muvuca seed mix, shade out the grass, keep fire off the young forest, and reconnect the canopy so arboreal animals can move in through the treetops. Agoutis are the only animals that spread Brazil nuts. Has its own eight-chapter campaign (from pulling the first pasture grass to the jaguar's return) and Free Play with its own milestone goals.

- **Enkare Conservancy** (Serengeti, Tanzania): a communal grazing range where generations of too many cattle have left bare, crusted hardpan, gullies, famine weed (parthenium), prickly pear hedges and mesquite thickets, with a wire fence across the old migration route. 26 plants (dropseed, star grass, red oat grass, umbrella thorn, fever tree, baobab, sausage tree, candelabra euphorbia, aloe, and the invasives) and 26 animals (wildebeest and zebra that pass through with the dry-season migration, giraffe, elephant, black rhino, buffalo, hippo, lion, cheetah, leopard, hyena, ostrich, vultures, secretary bird, crowned crane, ground hornbill, Nile crocodile, dung beetles and more). Rip the hardpan and dig half-moon pits to catch the rain, sow soil builders, beat back the famine weed, and let red oat grass return once the soil has. Vultures and dung beetles only live here once there are herds to follow. It stays open savanna rather than turning to woodland: grass fires sweep through most dry seasons and kill saplings, thick grass starves woody seedlings of water, herds trample them, and grown trees keep their neighbours at a distance (only along the water do trees close up into a riverine strip). Each dry season the migrating wildebeest and zebra swim the river at the crossing in the middle of the map (crocodiles gather there while they cross) and pass on north to the park, which they only do once the north fence is down. Herds (wildebeest, zebra, gazelle, impala, buffalo, elephants, giraffe) move together behind a leader, and every animal walks or flies to water every few days to drink. Has its own eight-chapter campaign and Free Play.

The map picker and welcome screen show every map pinned on a world map (`js/ui/worldmap.js`, hand-traced coastlines). Each map keeps its own save. Choosing a different map reloads the page into it.

## How the ecosystem works

(Described for the Hollis farm; the Amazon and Serengeti maps run the same rules with their own species, seasons and climate.)

- **Time:** 1 game day per second at normal speed, 10 days a month, 120 days a year. Seasons change growth, moisture, blooming, fruiting and migration.
- **Plants** (33 PNW species) each have moisture, light and soil ranges. They grow where conditions suit them and decline where they don't. Once mature they spread seed. Seeds also drift in from the forest edges, from the river in floods, and (blackberry, broom, canarygrass) from the neighbouring farms.
- **Succession:** nitrogen fixers (red alder, lupine, Scotch broom) rebuild soil. Canopy shade shifts the understory to ferns and salal, and shade-tolerant cedar and hemlock replace short-lived alders. Dead trees become snags, then logs, then soil.
- **Water:** moisture falls off with distance from water. Creek shade sets water quality. Fish can only reach water that connects to the river, and the old culvert blocks it.
- **Wildlife** (34 species): each species rates every tile's habitat. Carrying capacity is the total suitable habitat divided by the home-range size, limited by needs across the whole property: prey for predators, snags for woodpeckers and bats, berries for bears, fish for otters and herons. Animals breed in season when there's room, die or leave when there isn't, and immigrate from their source edge. Deer and elk are blocked by the boundary fences.
- **Special behaviour:** beavers coppice willow, fell alder and build dams that flood new wetlands. Coho run up connected, shaded creeks each October, spawn, die and feed the soil, and their fry return three years later. Migratory birds leave in fall and come back if the habitat is still there.
- **Scale:** the farm is 120×90 tiles. Plants are smooth, instanced low-poly models that sway in the wind, with simpler versions used when zoomed out; animals and visitors are high-resolution sprites you can zoom right in on.
- **Terrain:** the valley slopes from the northern foothills down to the river. Hollows are wetter and ridges drier. Digging water carves the ground, and the Raise and Lower tools reshape it.
- **Snow:** Dec–Feb storms sometimes come in cold. A snowpack builds on snowy days, lingers on high open ground, stays thin under trees, and melts in rain and spring warmth.
- **Fire:** in late-summer droughts, lightning or a visitor's spark can start a wildfire. It spreads through dry grass, broom and blackberry, and runs uphill faster. Trails, water and bare ground stop it, and rain puts it out. Douglas-fir and oak usually survive; young trees and most shrubs don't, while native meadow plants resprout. Send a fire crew to fight it, or use controlled burns to cut the fuel ahead of time. Once every few years at most, a fire in a deep drought turns into a **crown fire** that burns through the forest canopy. It leaves standing snags, and fireweed, lupine and native grasses turn the burn into meadow until the forest returns.
- **Floods:** long winter rains push the river over low ground beside the river and creeks. Seedlings drown, fresh silt enriches the soil, floodplain seeds (willow, cottonwood, and canarygrass too) arrive, and beaver dams can wash out. Marshes and ponds absorb part of every flood.
- **Visitors:** build a trailhead parking lot beside a road and connect trails to it (within two tiles), with boardwalks over wetlands, viewing blinds and a visitor center. The rating depends on the wildlife seen from the trails, the scenery along them and their length. Visitors pay per head, trails cost upkeep, and people on the trails disturb shy species (elk, cougar, bear, heron, pond turtle) nearby.
- **Funding:** money is tight at first ($30,000). The land trust's monthly grant scales with the ecosystem health score and the number of species present, but only modestly; visitor donations become the main income once trails run through good habitat (Amazon eco-tourists give more per visit). Goals and chapters pay one-off grants (shown at the amount actually paid), and each new species a small discovery grant.
- **Wildlife pacing:** a species needs its habitat to stay suitable for months before it finds the farm, so returns spread out over years rather than arriving all at once. Difficulty sets how readily they come.

## Project layout

```
index.html, styles.css      page shell and UI styling
js/config.js                constants, terrain / feature / habitat enums
js/biome.js                 the active map: swaps species, goals, climate and look
js/maps/pnw.js, amazon.js, serengeti.js  each map's story, climate, seasons, look, goals and generator hooks
js/maps/amazon-world.js     the ranch layout and its rainforest surroundings
js/maps/serengeti-world.js  the grazing range, kopjes, lugga and the park beyond the fence
js/data/plants.js           plant registry (species in plants-pnw.js, plants-amazon.js, plants-serengeti.js)
js/data/animals.js          animal registry (species in animals-pnw.js, animals-amazon.js, animals-serengeti.js)
js/world.js                 map arrays, farm generation, surroundings
js/sim/environment.js       water, moisture, canopy, distance fields, habitat classes, food
js/sim/plants.js            growth, seeding, competition, soil
js/sim/animals.js           wildlife agents, population dynamics, beavers, salmon
js/sim/goals.js             score, grants, goals
js/game.js                  clock, events, save/load
js/tools.js                 player tools
js/render3d/                three.js scene: terrain mesh, instanced plants, buildings, lighting
js/render3d/fauna.js        3D wildlife and visitors: built from soft primitives, instanced, animated in a vertex shader
js/render3d/portraits.js    field-guide portraits (animals and tropical plants) rendered from the 3D models
js/render3d/focus.js        see-through cover around the selected animal
js/render3d/snow.js         winter snow on the ground, plants and roofs
js/audio/music.js           procedural lo-fi music and nature ambience (Web Audio)
js/render/sprites.js        procedural 2D art: terrain textures, fire and smoke, fallback portraits
assets/logo.svg             the Second Growth emblem (loading screen, top bar, favicon)
assets/maps/                preview images of each map (welcome screen and map picker), rendered in-game
js/sim/visitors.js          trails, visitor numbers, rating and income
js/sim/events.js            wildfires and floods
vendor/three/               three.js 0.186 and its BufferGeometryUtils addon (MIT)
js/ui/                      DOM interface (worldmap.js: the map picker's world map)
tools/balance-sim.mjs       headless balance simulator (node tools/balance-sim.mjs restore 15)
tools/campaign-sim.mjs      scripted campaign playthrough: days per chapter (node tools/campaign-sim.mjs 14)
tools/campaign-sim-amazon.mjs  the same for the Amazon campaign (node tools/campaign-sim-amazon.mjs 14 standard)
tools/campaign-sim-serengeti.mjs  and for the Serengeti campaign (node tools/campaign-sim-serengeti.mjs 14 standard)
js/sim/campaign.js          campaign chapters per map: story, goals, unlocks (Amazon and Serengeti chapters in campaign-amazon.js, campaign-serengeti.js)
```

Most tuning lives in `js/data/*.js` (species ranges, growth, spread, home ranges) and `js/sim/goals.js` (economy). Run `tools/balance-sim.mjs` after tuning to see how a farm develops over decades in a few seconds.
