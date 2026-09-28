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
  if (done[key] != null || !MOMENTS[key]) return false;
  done[key] = game.day;
  game.emit('moment', { key, ...MOMENTS[key], x: focus.x, y: focus.y, agent: focus.id != null ? focus : null });
  return true;
}
