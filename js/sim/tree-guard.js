// Wire tree guards (ideas phone-creeks-fish s10): a cage of wire mesh round a tree, as restoration crews
// put round riparian plantings. A guarded tree isn't felled by beavers or browsed, trodden or frayed by
// deer and elk; elephants still push it over. The guard comes off by itself once the trunk has outgrown
// it (GUARD_YEARS of the tree's age), so grown forest is never protected for good.
//
// w.guard per tile (saved; undo carries it): 0 none, PLANTED a tree the player planted (only so the
// guards can be offered after the first one beavers cut), GUARDED. It means something only while the
// tile has a tree: removeTree and World.clearPlants clear it, and updatePlants takes it off with age.

export const PLANTED = 1, GUARDED = 2;
// Beavers fell grown cottonwood and alder too (measured on the opening's planting: most of the trees
// they took were full grown, years 4 to 10), and a cottonwood's trunk fills a loose cage in about this long.
export const GUARD_YEARS = 8;
export const GUARD_COST = 5; // a dollar or two of wire mesh and a stake, beside $16–22 for the tree

export const guarded = (w, i) => w.guard[i] === GUARDED;

// (price: the tool's price at the farm's difficulty)
export const guardOffer = price => `Beavers have cut down one of the trees you planted. They eat the wild ones along the creek as well, and that is fine. To keep yours, brush Habitat → Tree guard over them: a wire cage for $${price} a tree that keeps off deer and elk too, and comes off by itself once the tree has outgrown it.`;
