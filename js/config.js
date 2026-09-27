// Core constants shared by every module.

export const MAP_W = 120;
export const MAP_H = 90;
export const TILE = 32;          // world units per tile
export const SPR = 64;           // sprite pixels per tile (sprites are pre-rendered at 2x)
export const BORDER = 14;        // decorative tiles drawn around the property

export const DAYS_PER_MONTH = 10;
export const MONTHS_PER_YEAR = 12;
export const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR;

// Month 0 is March so that the game (and year 1) starts in spring.
export const MONTH_NAMES = ['March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December', 'January', 'February'];
export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
export const seasonOfMonth = m => Math.floor(m / 3);

// How much plants grow and spread in each month (March..February).
export const GROWTH_BY_MONTH = [0.75, 1.0, 1.0, 0.9, 0.65, 0.55, 0.6, 0.4, 0.15, 0.04, 0.04, 0.3];
export const SPREAD_BY_MONTH = [0.3, 0.5, 0.8, 1.0, 1.2, 1.3, 1.3, 1.0, 0.4, 0.05, 0.05, 0.1];
// Seasonal wetness offset: soggy winters, dry summers.
export const MOIST_BY_MONTH = [0.07, 0.05, 0.0, -0.05, -0.12, -0.15, -0.08, 0.02, 0.09, 0.12, 0.12, 0.1];

// Game days per real second at each speed setting.
export const SPEEDS = [0, 1, 3, 8];

// Terrain
export const T = {
  PASTURE: 0, FIELD: 1, SOIL: 2, GRAVEL: 3, MUD: 4,
  MARSH: 5, POND: 6, CREEK: 7, RIVER: 8, ROAD: 9, DUFF: 10, TRAIL: 11,
};
export const TERRAIN_NAMES = ['Old pasture', 'Plowed field', 'Loosened soil', 'Gravel', 'Mud',
  'Shallow marsh', 'Pond', 'Creek', 'River', 'Farm road', 'Forest floor', 'Nature trail'];
export const isWater = t => t === T.MARSH || t === T.POND || t === T.CREEK || t === T.RIVER;
export const isDeepWater = t => t === T.POND || t === T.CREEK || t === T.RIVER;

// Tile features
export const F = {
  NONE: 0, SNAG: 1, LOG: 2, ROCKS: 3, BRUSH: 4, NESTBOX: 5,
  FENCE: 6, CULVERT: 7, DAM: 8, BOARDWALK: 9, BLIND: 10,
};
export const FEATURE_NAMES = ['', 'Snag (standing dead tree)', 'Fallen log', 'Rock pile', 'Brush pile',
  'Nest box', 'Old fence', 'Road culvert', 'Beaver dam', 'Boardwalk', 'Wildlife viewing blind'];

// Terrain height: tiles are 1 unit wide, heights are in "levels".
export const LEVEL = 0.3;        // scene units per height level

// Habitat classes (computed from terrain + vegetation)
export const H = {
  BARE: 0, FARM: 1, INVASIVE: 2, MEADOW: 3, SHRUB: 4, YOUNG_FOREST: 5,
  MATURE_FOREST: 6, RIPARIAN: 7, MARSH: 8, POND: 9, CREEK: 10, RIVER: 11, DEVELOPED: 12,
};
export const HABITAT_INFO = [
  { name: 'Bare ground', color: '#a88b62' },
  { name: 'Degraded farmland', color: '#c9b77a' },
  { name: 'Invasive thicket', color: '#8a3b5c' },
  { name: 'Native meadow', color: '#b8cf5a' },
  { name: 'Shrubland', color: '#6f9e4a' },
  { name: 'Young forest', color: '#3f8a4e' },
  { name: 'Mature forest', color: '#1f5a36' },
  { name: 'Riparian thicket', color: '#4fa383' },
  { name: 'Marsh', color: '#6fb3a1' },
  { name: 'Pond', color: '#3d7fa6' },
  { name: 'Creek', color: '#58a6c9' },
  { name: 'River', color: '#2f6690' },
  { name: 'Structures & roads', color: '#8c8680' },
];

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const money = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
