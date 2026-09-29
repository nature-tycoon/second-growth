import { biome } from '../biome.js';

// Keystone moments: the handful of big natural events each map builds toward. They aren't
// scripted: each one fires the first time the simulation gets there on its own (the salmon find
// the freed creek, the herds reach the river), and the interface turns it into a short
// cinematic with a journal page. Once per farm.

export const MOMENTS = {
  salmon: {
    title: 'The salmon are home',
    text: 'Coho salmon are leaping up the creek you opened, back from years at sea to spawn in the gravel where they hatched. The bears have come down from the hills to meet them, and what the bears leave on the banks will feed the forest for a year.',
  },
  dam: {
    title: "The beavers' first dam",
    text: 'The beavers have built their first dam. Water is backing up behind it, and in a year or two this stretch of creek will be a pond and a marsh, full of frogs, ducks and young trout. You did the planting; they are doing the engineering.',
  },
  jaguar: {
    title: 'A jaguar in the forest',
    text: 'A jaguar has come in from the rainforest and made your young forest part of its range. It only stays where the forest is big and full of prey, so its tracks by the stream are the best sign yet that Fazenda Esperança is rainforest again.',
  },
  howler: {
    title: 'Howlers in the canopy',
    text: 'Howler monkeys have travelled in through the treetops without once touching the ground. The canopy you grew now joins the rainforest to the ranch, and at dawn their roaring carries for kilometres.',
  },
  crossing: {
    title: 'The great crossing',
    text: 'The migration has reached the river. Thousands of hooves churn the water as the wildebeest and zebra swim for the far bank, and the crocodiles are waiting. The herds come through Enkare again because the grass is back and the route is open.',
  },
  monarchs: {
    title: 'The monarchs stop over',
    text: 'A cloud of monarchs has come down into the gardens, drinking from the flowers and laying eggs on the milkweed. Some of these butterflies are on their way to the mountains of Mexico, 2,000 miles south. The milkweed you planted is the only thing their caterpillars can eat.',
  },
  fireflies: {
    title: 'A night full of fireflies',
    text: 'The meadows are lit up. Firefly larvae spend a year or two in the leaf litter and the roots of plants that come back every summer, eating slugs and snails, and mowing, leaf blowers and lawn chemicals kill them. Your gardens have been left to grow long enough for them to hatch, all at once, on a warm June night.',
    night: true,
  },
  elephant: {
    title: 'The elephants come home',
    text: 'An elephant family has come to Enkare. They will open up the thornbush, dig for water in the dry lugga, and carry seeds for kilometres. Where elephants feel safe, the whole savanna is healthier.',
  },
};

// Which species' first arrival is a moment of its own.
export const ARRIVAL_MOMENTS = { jaguar: 'jaguar', howler: 'howler', elephant: 'elephant' };

// Fire a moment, once per farm. focus: { x, y } in tiles, or an animal to look at.
export function moment(game, key, focus) {
  const done = game.flags.moments || (game.flags.moments = {});
  const m = MOMENTS[key] || biome.moments?.[key]; // (a map can bring moments of its own)
  if (done[key] != null || !m) return false;
  done[key] = game.day;
  game.emit('moment', { key, ...m, x: focus.x, y: focus.y, agent: focus.id != null ? focus : null });
  return true;
}
