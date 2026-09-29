// Georgia Piedmont plants (the Magnolia Ridge subdivision map, outside Atlanta).
// Months: 0=Mar 1=Apr 2=May 3=Jun 4=Jul 5=Aug 6=Sep 7=Oct 8=Nov 9=Dec 10=Jan 11=Feb
// moist / light are preferred ranges on a 0..1 scale. soil = minimum soil health.
// grow = maturity gained per day in ideal conditions. spread = daily seeding chance once mature.
// exotic: a non-native ornamental that isn't invasive but feeds almost nothing (lawn, boxwood,
// crepe myrtle). host: a caterpillar food plant (milkweed for monarchs, and so on).

export default function buildAtlantaPlants(def, mix, get) {
  // ---------- Groundcover ----------
  // sod: a lawn so thick nothing can be planted into it, and fire won't shift it. Pull it up first.
  def({ key: 'turf', name: 'Bermuda grass lawn', sci: 'Cynodon dactylon', layer: 0, native: false, invasive: true, sod: true, weedy: true,
    moist: [0.05, 0.75], light: [0.55, 1], grow: 0.03, spread: 0.01, radius: 1, life: 30, compete: 0.5, graze: 0.4, cost: 1,
    look: { type: 'grass', leaf: '#7cae4c', dry: '#b7b26e' },
    desc: 'INVASIVE. The standard-issue lawn: mown short, sprayed and watered. Nothing lives in it, nothing can be planted into it, and it creeps back into any bed left bare. Lift it with Remove → Pull invasives, then plant straight away.' });
  def({ key: 'bluestem', name: 'Little bluestem', sci: 'Schizachyrium scoparium', layer: 0, moist: [0.0, 0.6], light: [0.6, 1],
    grow: 0.02, spread: 0.022, radius: 2, life: 15, graze: 0.6, cost: 3,
    look: { type: 'grass', leaf: '#8aa67c', dry: '#c0844a' },
    desc: 'A blue-green bunchgrass that turns copper in autumn. Bumblebees nest in its old clumps and sparrows eat the seed.' });
  def({ key: 'switchgrass', name: 'Switchgrass', sci: 'Panicum virgatum', layer: 0, moist: [0.3, 0.95], light: [0.5, 1],
    grow: 0.024, spread: 0.02, radius: 2, life: 15, graze: 0.5, cost: 3,
    look: { type: 'tallgrass', leaf: '#6f9a58', dry: '#c8b07a' },
    desc: 'A tall prairie grass that soaks up stormwater with roots ten feet deep. Good in rain gardens.' });
  def({ key: 'coneflower', name: 'Purple coneflower', sci: 'Echinacea purpurea', layer: 0, moist: [0.1, 0.65], light: [0.55, 1],
    grow: 0.02, spread: 0.02, radius: 2, life: 8, cost: 4,
    look: { type: 'forb', leaf: '#5f8a48', flower: '#c86aa8', bloom: [2, 3, 4, 5] },
    desc: 'The classic summer garden flower. Butterflies and bees feed on it all summer, and goldfinches strip the seed heads in fall.' });
  def({ key: 'blackeyed', name: 'Black-eyed Susan', sci: 'Rudbeckia hirta', layer: 0, moist: [0.05, 0.65], light: [0.55, 1],
    grow: 0.026, spread: 0.028, radius: 2, life: 3, cost: 3,
    look: { type: 'forb', leaf: '#6a8f4a', flower: '#f0b420', bloom: [3, 4, 5, 6] },
    desc: 'Tough, cheerful and quick to establish. Blooms from early summer into fall.' });
  def({ key: 'butterflyweed', name: 'Butterfly weed', sci: 'Asclepias tuberosa', layer: 0, moist: [0.0, 0.5], light: [0.6, 1],
    grow: 0.016, spread: 0.016, radius: 2, life: 15, cost: 5,
    look: { type: 'forb', leaf: '#5c8a3e', flower: '#f07a1e', bloom: [2, 3, 4] },
    desc: 'A bright orange milkweed. Monarch caterpillars can only eat milkweeds, so no milkweed means no monarchs.' });
  def({ key: 'swampmilkweed', name: 'Swamp milkweed', sci: 'Asclepias incarnata', layer: 0, moist: [0.55, 1], light: [0.5, 1], wetOK: true,
    grow: 0.018, spread: 0.016, radius: 2, life: 8, cost: 5,
    look: { type: 'tallforb', leaf: '#5a8a48', flower: '#e07aa4', bloom: [3, 4, 5] },
    desc: 'A pink milkweed for wet ground and rain gardens. Monarchs lay their eggs on it.' });
  def({ key: 'mountainmint', name: 'Mountain mint', sci: 'Pycnanthemum tenuifolium', layer: 0, moist: [0.1, 0.75], light: [0.45, 1],
    grow: 0.02, spread: 0.022, radius: 2, life: 10, cost: 4,
    look: { type: 'forb', leaf: '#8aa87a', flower: '#ece8f2', bloom: [4, 5, 6] },
    desc: 'Plain little white flowers, but more kinds of bees, wasps and beetles visit it than almost any other plant.' });
  def({ key: 'beebalm', name: 'Wild bergamot', sci: 'Monarda fistulosa', layer: 0, moist: [0.1, 0.7], light: [0.5, 1],
    grow: 0.022, spread: 0.022, radius: 2, life: 8, cost: 4,
    look: { type: 'forb', leaf: '#6a8a58', flower: '#b88ad0', bloom: [3, 4] },
    desc: 'Lavender pompoms full of nectar. Bumblebees and hummingbirds work it all day.' });
  def({ key: 'coreopsis', name: 'Lanceleaf coreopsis', sci: 'Coreopsis lanceolata', layer: 0, moist: [0.0, 0.55], light: [0.6, 1],
    grow: 0.024, spread: 0.025, radius: 2, life: 6, cost: 3,
    look: { type: 'forb', leaf: '#6f9450', flower: '#f4c62c', bloom: [1, 2, 3] },
    desc: 'The first yellow daisy of spring. Grows in poor, dry clay where little else will.' });
  def({ key: 'goldenrod', name: 'Wrinkleleaf goldenrod', sci: 'Solidago rugosa', layer: 0, moist: [0.2, 0.85], light: [0.5, 1],
    grow: 0.024, spread: 0.026, radius: 3, life: 10, cost: 3,
    look: { type: 'tallforb', leaf: '#5f8a46', flower: '#e8c01e', bloom: [6, 7] },
    desc: 'Golden plumes in September and October. Bees and migrating monarchs fuel up on it before winter. It does not cause hay fever.' });
  def({ key: 'aster', name: 'Aromatic aster', sci: 'Symphyotrichum oblongifolium', layer: 0, moist: [0.0, 0.6], light: [0.55, 1],
    grow: 0.02, spread: 0.02, radius: 2, life: 10, cost: 4,
    look: { type: 'forb', leaf: '#6a8a5a', flower: '#8a68d8', bloom: [7, 8] },
    desc: 'A haze of violet flowers in October and November, the last big meal for bees before frost.' });
  def({ key: 'phlox', name: 'Woodland phlox', sci: 'Phlox divaricata', layer: 0, moist: [0.3, 0.85], light: [0.05, 0.7], soil: 0.2,
    grow: 0.016, spread: 0.018, radius: 2, life: 10, cost: 4,
    look: { type: 'forb', leaf: '#5a8a4a', flower: '#a8a2ec', bloom: [0, 1] },
    desc: 'Pale blue flowers under the trees in early spring, when the first bumblebee queens wake up hungry.' });
  def({ key: 'joepye', name: 'Joe-Pye weed', sci: 'Eutrochium fistulosum', layer: 0, moist: [0.5, 1], light: [0.4, 1], wetOK: true,
    grow: 0.024, spread: 0.02, radius: 2, life: 10, cost: 4,
    look: { type: 'tallforb', leaf: '#5a8248', flower: '#c890b4', bloom: [4, 5, 6] },
    desc: 'Head-high and crowned with dusty pink flowers. Swallowtails love it. Perfect for a soggy corner or a rain garden.' });
  def({ key: 'cardinalflower', name: 'Cardinal flower', sci: 'Lobelia cardinalis', layer: 0, moist: [0.6, 1], light: [0.3, 1], wetOK: true, soil: 0.1,
    grow: 0.016, spread: 0.014, radius: 2, life: 5, cost: 6,
    look: { type: 'forb', leaf: '#4a7a3a', flower: '#d81e28', bloom: [5, 6] },
    desc: 'Scarlet spikes by the water in late summer, pollinated almost only by ruby-throated hummingbirds.' });
  def({ key: 'fern', name: 'Christmas fern', sci: 'Polystichum acrostichoides', layer: 0, moist: [0.3, 0.9], light: [0.0, 0.6], soil: 0.2,
    grow: 0.012, spread: 0.012, radius: 3, life: 40, cost: 5,
    look: { type: 'fern', leaf: '#2f6a3a' },
    desc: 'An evergreen fern for shade. It holds soil on slopes under trees and stays green all winter.' });
  def({ key: 'sedge', name: 'Fox sedge', sci: 'Carex vulpinoidea', layer: 0, moist: [0.55, 1], light: [0.2, 1], wetOK: true,
    grow: 0.022, spread: 0.02, radius: 2, life: 10, graze: 0.4, cost: 3,
    look: { type: 'sedge', leaf: '#6a9a50', dry: '#b8aa70' },
    desc: 'A tough native sedge for wet spots and rain gardens. Its seed feeds ducks and sparrows.' });
  def({ key: 'ivy', name: 'English ivy', sci: 'Hedera helix', layer: 0, native: false, invasive: true,
    moist: [0.2, 0.9], light: [0.0, 0.9], grow: 0.016, spread: 0.016, radius: 2, life: 60, compete: 0.7, cost: 0,
    look: { type: 'fern', leaf: '#2c4e2a' },
    desc: 'INVASIVE. Sold as groundcover, it smothers the forest floor and climbs trees until they fall. Shade doesn\'t stop it.' });
  def({ key: 'kudzu', name: 'Kudzu', sci: 'Pueraria montana', layer: 0, native: false, invasive: true, nfix: true,
    moist: [0.1, 0.85], light: [0.55, 1], grow: 0.04, spread: 0.03, radius: 3, life: 40, compete: 0.9, cost: 0,
    look: { type: 'tallforb', leaf: '#4f8a38', flower: '#8a4aa0', bloom: [5] },
    desc: 'INVASIVE. "The vine that ate the South." It grows a foot a day in summer and buries whole woodland edges. Pull it every year; shade finally kills it.' });
  def({ key: 'honeysuckle', name: 'Japanese honeysuckle', sci: 'Lonicera japonica', layer: 0, native: false, invasive: true,
    moist: [0.1, 0.85], light: [0.25, 1], grow: 0.02, spread: 0.018, radius: 2, life: 30, compete: 0.6, cost: 0,
    look: { type: 'forb', leaf: '#4a7a3a', flower: '#f4efd8', bloom: [2, 3] },
    desc: 'INVASIVE. Sweet-smelling and everywhere. It tangles over shrubs and young trees, and birds spread the berries.' });

  // ---------- Shrubs ----------
  def({ key: 'beautyberry', name: 'American beautyberry', sci: 'Callicarpa americana', layer: 1, moist: [0.2, 0.8], light: [0.2, 1],
    grow: 0.012, spread: 0.012, radius: 3, life: 25, browse: 0.4, cost: 9,
    look: { type: 'shrub', leaf: '#6a9a48', flower: '#eab0d2', bloom: [3, 4], berry: '#a040c8', fruit: [6, 7], deciduous: true },
    desc: 'Clusters of startling purple berries in fall that catbirds, mockingbirds and thrashers strip clean.' });
  def({ key: 'hydrangea', name: 'Oakleaf hydrangea', sci: 'Hydrangea quercifolia', layer: 1, moist: [0.3, 0.8], light: [0.1, 0.85], soil: 0.15,
    grow: 0.01, spread: 0.008, radius: 3, life: 40, cost: 11,
    look: { type: 'shrub', leaf: '#5a8a42', flower: '#f4f0e0', bloom: [2, 3], fall: '#a8302a', deciduous: true },
    desc: 'A Georgia native with big white flower cones and wine-red autumn leaves. Handsome enough for any front yard.' });
  def({ key: 'azalea', name: 'Piedmont azalea', sci: 'Rhododendron canescens', layer: 1, moist: [0.3, 0.85], light: [0.1, 0.8], soil: 0.2,
    grow: 0.009, spread: 0.008, radius: 3, life: 50, cost: 12,
    look: { type: 'shrub', leaf: '#6a9a50', flower: '#f4a8c8', bloom: [0, 1], deciduous: true },
    desc: 'The wild azalea: fragrant pink trumpets in March, just as the hummingbirds get back from Central America.' });
  def({ key: 'spicebush', name: 'Spicebush', sci: 'Lindera benzoin', layer: 1, moist: [0.4, 0.95], light: [0.0, 0.8], soil: 0.15,
    grow: 0.01, spread: 0.01, radius: 3, life: 40, browse: 0.3, cost: 10,
    look: { type: 'shrub', leaf: '#6f9a4a', flower: '#e4de3a', bloom: [0], berry: '#d0202a', fruit: [6], fall: '#e4c43a', deciduous: true },
    desc: 'Tiny yellow flowers before the leaves in March, red berries for migrating thrushes, and food for spicebush swallowtail caterpillars.' });
  def({ key: 'elderberry', name: 'American elderberry', sci: 'Sambucus canadensis', layer: 1, moist: [0.35, 1], light: [0.4, 1],
    grow: 0.016, spread: 0.014, radius: 3, life: 15, browse: 0.4, cost: 8,
    look: { type: 'shrub', leaf: '#6a9a50', flower: '#f4f0dc', bloom: [2, 3], berry: '#2e1e3c', fruit: [4, 5], deciduous: true },
    desc: 'Fast-growing, with flat white flower heads and dark berries that feed dozens of birds.' });
  def({ key: 'buttonbush', name: 'Buttonbush', sci: 'Cephalanthus occidentalis', layer: 1, moist: [0.65, 1], light: [0.4, 1], wetOK: true,
    grow: 0.012, spread: 0.01, radius: 3, life: 30, cost: 9,
    look: { type: 'shrub', leaf: '#5f9048', flower: '#f2eee0', bloom: [3, 4], deciduous: true },
    desc: 'White pincushion flowers at the water\'s edge that butterflies can\'t resist. Happy standing in a pond.' });
  def({ key: 'sweetspire', name: 'Virginia sweetspire', sci: 'Itea virginica', layer: 1, moist: [0.45, 1], light: [0.2, 1], wetOK: true,
    grow: 0.011, spread: 0.01, radius: 2, life: 30, cost: 9,
    look: { type: 'shrub', leaf: '#5a8a44', flower: '#f4f2e6', bloom: [1, 2], fall: '#b02a2a', deciduous: true },
    desc: 'Drooping white flower tails in spring and scarlet leaves in fall. Tough in wet clay and rain gardens.' });
  def({ key: 'privet', name: 'Chinese privet', sci: 'Ligustrum sinense', layer: 1, native: false, invasive: true,
    moist: [0.2, 0.95], light: [0.1, 1], grow: 0.016, spread: 0.016, radius: 2, life: 40, compete: 0.75, cost: 0,
    look: { type: 'bramble', leaf: '#4a6e36', flower: '#f4f2e8', bloom: [1], berry: '#2a2a40', fruit: [8, 9, 10] },
    desc: 'INVASIVE. Planted as hedges, it has swallowed the creek bottoms of the South in solid thickets. Birds spread the berries.' });
  def({ key: 'nandina', name: 'Nandina', sci: 'Nandina domestica', layer: 1, native: false, invasive: true,
    moist: [0.1, 0.85], light: [0.1, 1], grow: 0.01, spread: 0.008, radius: 2, life: 40, compete: 0.5, cost: 0,
    look: { type: 'shrub', leaf: '#6e8a3a', berry: '#d42a2a', fruit: [8, 9, 10, 11] },
    desc: 'INVASIVE. "Heavenly bamboo" from the garden center. Its bright red berries are toxic to cedar waxwings.' });
  def({ key: 'boxwood', name: 'Boxwood', sci: 'Buxus sempervirens', layer: 1, native: false, exotic: true,
    moist: [0.2, 0.8], light: [0.2, 1], grow: 0.008, spread: 0, radius: 1, life: 60, cost: 0,
    look: { type: 'holly', leaf: '#3a5a2e' },
    desc: 'The builder\'s foundation shrub, clipped into a green box. Evergreen and tidy, but no flowers, berries or insects to speak of.' });

  // ---------- Trees ----------
  def({ key: 'whiteoak', name: 'White oak', sci: 'Quercus alba', layer: 2, moist: [0.1, 0.7], light: [0.45, 1],
    grow: 0.0026, spread: 0.006, radius: 4, life: 300, mast: 1, cost: 26,
    look: { type: 'oak', leaf: '#5b8040', fall: '#9a4a2a', deciduous: true, bark: '#8a8478' },
    desc: 'The keystone tree of the Piedmont. Over 500 kinds of caterpillars eat oak leaves, and those caterpillars feed nearly every songbird\'s nestlings.' });
  def({ key: 'willowoak', name: 'Willow oak', sci: 'Quercus phellos', layer: 2, moist: [0.3, 1], light: [0.45, 1],
    grow: 0.0036, spread: 0.006, radius: 4, life: 150, mast: 0.8, cost: 22,
    look: { type: 'ash', leaf: '#5f8a44', fall: '#b89a3a', deciduous: true, bark: '#6d665a' },
    desc: 'The great street tree of Atlanta, with narrow leaves and a wide, shady crown over the sidewalk. Tough in compacted clay.' });
  def({ key: 'tulippoplar', name: 'Tulip poplar', sci: 'Liriodendron tulipifera', layer: 2, moist: [0.3, 0.85], light: [0.5, 1],
    grow: 0.0048, spread: 0.009, radius: 5, life: 200, cost: 22,
    look: { type: 'cottonwood', leaf: '#6a9a48', fall: '#e8c83a', deciduous: true, bark: '#8a8a7a' },
    desc: 'Tall, straight and fast, with orange-and-green tulip flowers that feed bees in spring. Food plant of the tiger swallowtail, Georgia\'s state butterfly.' });
  def({ key: 'redmaple', name: 'Red maple', sci: 'Acer rubrum', layer: 2, moist: [0.3, 1], light: [0.3, 1], wetOK: true,
    grow: 0.0045, spread: 0.01, radius: 4, life: 90, cost: 18,
    look: { type: 'maple', leaf: '#5f9048', fall: '#d0302a', deciduous: true, bark: '#8a8680' },
    desc: 'Red flowers in February feed the first bees of the year; scarlet leaves in October. Grows almost anywhere.' });
  def({ key: 'sweetgum', name: 'Sweetgum', sci: 'Liquidambar styraciflua', layer: 2, moist: [0.3, 0.95], light: [0.5, 1],
    grow: 0.005, spread: 0.012, radius: 4, life: 120, cost: 16,
    look: { type: 'maple', leaf: '#4f8a3e', fall: '#8a2a4a', deciduous: true, bark: '#6a6258' },
    desc: 'Star-shaped leaves that turn wine and gold, and spiky gumballs goldfinches pick apart for the seed.' });
  def({ key: 'loblolly', name: 'Loblolly pine', sci: 'Pinus taeda', layer: 2, moist: [0.1, 0.85], light: [0.55, 1], conifer: true,
    grow: 0.0055, spread: 0.012, radius: 6, life: 150, cost: 16,
    look: { type: 'fir', leaf: '#3f6a3a', bark: '#7a5a44' },
    desc: 'The fast-growing pine of every Georgia old field. Brown-headed nuthatches and pine warblers live in it.' });
  def({ key: 'dogwood', name: 'Flowering dogwood', sci: 'Cornus florida', layer: 2, moist: [0.3, 0.8], light: [0.1, 0.8], soil: 0.15,
    grow: 0.0034, spread: 0.008, radius: 3, life: 80, cost: 18,
    look: { type: 'alder', leaf: '#5f8a48', flower: '#f6f2ea', bloom: [1], bloomTint: 0.55, berry: '#d8202a', fall: '#a82a2a', deciduous: true, bark: '#6a5a4a' },
    desc: 'White blossoms in April and red berries in fall for thrushes and bluebirds. A small tree that fits under power lines.' });
  def({ key: 'redbud', name: 'Eastern redbud', sci: 'Cercis canadensis', layer: 2, moist: [0.15, 0.75], light: [0.25, 1],
    grow: 0.004, spread: 0.009, radius: 3, life: 50, cost: 15,
    look: { type: 'alder', leaf: '#6a9a50', flower: '#d062aa', bloom: [0], crownBloom: true, fall: '#d8c048', deciduous: true, bark: '#5a4a40' },
    desc: 'Bare branches turn magenta in March, a feast for early bees. Small, tough and fine near houses.' });
  def({ key: 'blackcherry', name: 'Black cherry', sci: 'Prunus serotina', layer: 2, moist: [0.15, 0.75], light: [0.45, 1],
    grow: 0.0045, spread: 0.01, radius: 4, life: 100, cost: 18,
    look: { type: 'ash', leaf: '#4f8a3e', flower: '#f4f2e8', bloom: [1], bloomTint: 0.35, berry: '#2a1a2a', fall: '#d8a03a', deciduous: true, bark: '#4a3a34' },
    desc: 'After oaks, the tree that feeds the most caterpillars. Its summer cherries feed dozens of birds.' });
  def({ key: 'magnolia', name: 'Southern magnolia', sci: 'Magnolia grandiflora', layer: 2, moist: [0.3, 0.9], light: [0.2, 1],
    grow: 0.003, spread: 0.006, radius: 4, life: 120, cost: 24,
    look: { type: 'oak', leaf: '#2f5a32', flower: '#f6f2e2', bloom: [2, 3], bloomTint: 0.2, bark: '#7a7468' },
    desc: 'Glossy evergreen leaves and dinner-plate flowers. The subdivision is named for it; the builder cut the last one down.' });
  def({ key: 'sycamore', name: 'American sycamore', sci: 'Platanus occidentalis', layer: 2, moist: [0.55, 1], light: [0.5, 1], wetOK: true,
    grow: 0.0055, spread: 0.009, radius: 5, life: 200, cost: 20,
    look: { type: 'cottonwood', leaf: '#6a9a50', fall: '#b89a4a', deciduous: true, bark: '#e2ddd0' },
    desc: 'Ghost-white limbs along the river. Grows huge and shades the water cool for fish.' });
  def({ key: 'riverbirch', name: 'River birch', sci: 'Betula nigra', layer: 2, moist: [0.55, 1], light: [0.5, 1], wetOK: true,
    grow: 0.0055, spread: 0.01, radius: 4, life: 60, cost: 16,
    look: { type: 'alder', leaf: '#6f9a4a', fall: '#e0c040', deciduous: true, bark: '#c8a88a' },
    desc: 'Peeling cinnamon bark, and roots that hold the riverbank together through floods.' });
  def({ key: 'callery', name: 'Bradford pear', sci: 'Pyrus calleryana', layer: 2, native: false, invasive: true,
    moist: [0.05, 0.85], light: [0.35, 1], grow: 0.006, spread: 0.012, radius: 4, life: 25, compete: 0.6, cost: 0,
    look: { type: 'ash', leaf: '#4f7e3a', flower: '#f6f4ee', bloom: [0], crownBloom: true, fall: '#a8302a', deciduous: true, bark: '#5a524a' },
    desc: 'INVASIVE. The builder planted one in every front yard. Clouds of white (and foul-smelling) blossom in March, weak limbs that split in storms, and wild seedlings everywhere. Georgia now bans its sale.' });
  def({ key: 'crepemyrtle', name: 'Crepe myrtle', sci: 'Lagerstroemia indica', layer: 2, native: false, exotic: true,
    moist: [0.05, 0.75], light: [0.55, 1], grow: 0.005, spread: 0, radius: 2, life: 50, cost: 0,
    look: { type: 'alder', leaf: '#5a8a44', flower: '#e068a8', bloom: [3, 4, 5], bloomTint: 0.6, fall: '#d86a2a', deciduous: true, bark: '#b8906a' },
    desc: 'Pink summer flowers on every Southern street. Pretty, but few native insects can use it, and it never grows big enough to shade the street.' });

  // ---------- Seed mixes ----------
  for (const m of [
    { key: 'mix_pollinator', name: 'Pollinator garden', layer: 0, cost: 4, density: 0.8,
      species: ['coreopsis', 'butterflyweed', 'coneflower', 'beebalm', 'blackeyed', 'mountainmint', 'goldenrod', 'aster', 'bluestem'],
      desc: 'Something in flower from April to November: coreopsis, milkweed, coneflower, bergamot, mountain mint, goldenrod and aster.' },
    { key: 'mix_meadow', name: 'Piedmont meadow', layer: 0, cost: 3, density: 0.75,
      species: ['bluestem', 'switchgrass', 'goldenrod', 'aster', 'blackeyed', 'coreopsis'],
      desc: 'Native grasses and tough wildflowers for big open spaces: common ground, easements, the retention pond slopes.' },
    { key: 'mix_raingarden', name: 'Rain garden', layer: 0, cost: 5, density: 0.75,
      species: ['swampmilkweed', 'joepye', 'cardinalflower', 'switchgrass', 'sedge'],
      desc: 'For wet hollows that catch roof and street runoff. It soaks up the water, and hummingbirds and swallowtails come for the flowers.' },
    { key: 'mix_woodland', name: 'Woodland garden', layer: 0, cost: 5, density: 0.65,
      species: ['phlox', 'fern', 'sedge'],
      desc: 'Spring wildflowers and ferns for the shade under trees.' },
    { key: 'mix_hedgerow', name: 'Native hedge', layer: 1, cost: 10, density: 0.45,
      species: ['beautyberry', 'elderberry', 'hydrangea', 'azalea', 'spicebush'],
      desc: 'Flowering, fruiting shrubs to replace the boxwood and privet: cover and food for birds right next to the house.' },
    { key: 'mix_wetshrubs', name: 'Wet-ground shrubs', layer: 1, cost: 10, density: 0.45,
      species: ['buttonbush', 'sweetspire', 'elderberry'],
      desc: 'For pond edges, ditches and rain gardens.' },
    { key: 'mix_canopy', name: 'Shade trees', layer: 2, cost: 22, density: 0.3,
      species: ['willowoak', 'whiteoak', 'tulippoplar', 'redmaple', 'blackcherry'],
      desc: 'The big trees that build a canopy: oaks, tulip poplar, red maple and black cherry. Plant them where their crowns will touch.' },
    { key: 'mix_smalltrees', name: 'Small flowering trees', layer: 2, cost: 16, density: 0.3,
      species: ['dogwood', 'redbud'],
      desc: 'Dogwood and redbud for tight spots near houses and under power lines.' },
    { key: 'mix_bottomland', name: 'Bottomland trees', layer: 2, cost: 20, density: 0.3,
      species: ['sycamore', 'riverbirch', 'redmaple'],
      desc: 'Trees for the floodplain and the creek banks.' },
  ]) mix(m);

  // behaviour flags the simulation reads (fire, floods, seed dispersal, nectar, caterpillar hosts)
  for (const k of ['sycamore', 'riverbirch']) get(k).gravelOK = true;
  for (const k of ['privet', 'nandina', 'honeysuckle', 'callery']) get(k).birdSpread = true;
  for (const k of ['beautyberry', 'elderberry', 'spicebush', 'buttonbush', 'sweetspire', 'azalea', 'hydrangea', 'privet', 'honeysuckle', 'kudzu']) get(k).resprout = true;
  Object.entries({ loblolly: 0.8, whiteoak: 0.85, willowoak: 0.6, sweetgum: 0.4, redmaple: 0.35, tulippoplar: 0.5, sycamore: 0.5 })
    .forEach(([k, v]) => { get(k).fireSurvival = v; });
  get('redmaple').nectar = { months: [11, 0], amount: 0.35 };                         // February–March, the first flowers of the year
  get('tulippoplar').nectar = { months: [1, 2], amount: 0.5 };
  get('blackcherry').nectar = { months: [1], amount: 0.35 };
  get('redbud').nectar = { months: [0], amount: 0.4 };
  get('dogwood').nectar = { months: [1], amount: 0.2 };
  get('callery').nectar = { months: [0], amount: 0.1 };
  for (const k of ['butterflyweed', 'swampmilkweed']) get(k).host = 'monarch';
  for (const k of ['tulippoplar', 'blackcherry', 'spicebush']) get(k).host = 'swallowtail';
  for (const k of ['whiteoak', 'willowoak', 'blackcherry']) get(k).caterpillars = true; // keystone trees: the insect food songbirds raise their young on
}
