// The selected catalog is a compatibility default for standalone worlds and previews.
// Live farms retain their own catalog; selecting another map never changes that object.

/**
 * Shared definitions for one map, separate from the live farm's arrays and counters.
 * Tools and campaign chapters are attached by their builders when the map is selected.
 * @typedef {Object} MapCatalog
 * @property {import('./contracts.js').MapDefinition} definition Climate, layout, hooks and appearance.
 * @property {Array<import('./contracts.js').PlantDefinition|null>} plants Indexed by the IDs stored in world layers.
 * @property {Object<string,import('./contracts.js').PlantDefinition>} plant Plants by stable species key.
 * @property {import('./contracts.js').SeedMix[]} mixes
 * @property {Object<string,import('./contracts.js').SeedMix>} mix
 * @property {import('./contracts.js').AnimalDefinition[]} animals Indexed by the species numbers stored on agents.
 * @property {Object<string,import('./contracts.js').AnimalDefinition>} animal Animals by stable species key.
 * @property {string[]} animalGroups
 * @property {import('./contracts.js').GoalDefinition[]} goals
 * @property {Object<string,Object>} structures
 * @property {Object[]} habitatInfo
 * @property {string[]} terrainNames
 * @property {Object<string,import('./contracts.js').ToolDefinition>} [tools]
 * @property {import('./contracts.js').ChapterDefinition[]} [chapters]
 */

/** @type {MapCatalog|null} */
export let activeCatalog = null;
export function selectCatalog(catalog) { activeCatalog = catalog; }
