
import { isMaleVariant } from '../data/animals.js';
import { DAYS_PER_YEAR } from '../config.js';

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
    title: 'The forest holds its breath',
    text: 'A jaguar crouches into a stalk, following prey through the forest you grew. Cover lets the cat approach unseen; connected woodland gives its prey somewhere to escape. Fazenda Esperança is supporting both sides of a hunt again.',
  },
  howler: {
    title: 'A living canopy',
    text: 'The howlers have stopped to feed in your canopy. Leaves and fruit now support a troop above the old pasture, and joined treetops let them travel on without coming down to the ground. The forest is becoming a home, not just a collection of trees.',
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
    night: true, fireflies: true,
  },
  elephant: {
    title: 'The elephant family at work',
    text: 'An elephant has stopped to browse, with its family close behind. Every mouthful changes the woodland: young branches feed the herd, gaps let light reach the grass, and seeds travel on with the elephants. Enkare has room for animals that shape the landscape again.',
  },
  elkRut: {
    title: 'The autumn rut',
    text: 'Two bull elk have met in the autumn meadow. Bugles bring rivals together; now they lower their heads and contest the ground with their antlers. The cows graze nearby, and the winner of this bout may take over the harem. An open valley gives the whole herd room to gather.',
  },
  lionHunt: {
    title: 'A hunt in the tall grass',
    text: 'A lion is closing on a wildebeest. The grass you restored feeds the herd and hides the hunter. Watch the stalk become a chase: if the lion makes a kill, the same carcass can feed its pride, hyenas and vultures in turn.',
  },
};

// Which species' first arrival is a moment of its own.
export const ARRIVAL_MOMENTS = { jaguar: 'jaguar', howler: 'howler', elephant: 'elephant' };

// These used to be simple arrival cards. Wait for something worth watching, with no
// time-based fallback to an idle animal. Check between daily ticks so short meals count.
const BEHAVIOR_MOMENTS = {
  jaguar: ['jaguar', 'hunt'], howler: ['howler', 'canopy'], elephant: ['elephant', 'family'],
  orangutans: ['orangutan', 'canopy'], gajah: ['gajah', 'family'], harimau: ['tiger', 'hunt'],
  congos: ['congo', 'canopy'], manta: ['manta', 'cleaning'], humphead: ['humphead', 'starfish'],
};
const living = a => a && !a.leaving && !a.fromFire;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const byId = (game, id) => game.wildlife.agents.find(a => a.id === id);
const huntInView = (game, a) => {
  const prey = byId(game, a.target);
  return a.state === 'hunt' && !a.assist && living(prey) && distance(a, prey) < 8;
};
function interesting(game, key, a) {
  const type = BEHAVIOR_MOMENTS[key]?.[1], agents = game.wildlife.agents;
  if (type === 'hunt') return huntInView(game, a);
  if (type === 'canopy') return a.state === 'primate' && !!a.fruitMeal || a.state === 'forage' && ['leaves', 'fruit'].includes(a.forage?.food);
  if (type === 'family') return a.state === 'forage' && a.forage?.food === 'browse' && agents.some(b => b !== a && b.sp === a.sp && living(b) && distance(a, b) < 6);
  if (type === 'starfish') return a.state === 'forage' && a.forage?.food === 'starfish';
  if (type === 'cleaning') {
    const partner = byId(game, a.forage?.partner);
    return a.state === 'forage' && a.forage?.food === 'cleaned' && living(partner) && game.catalog.animals[partner.sp]?.key === 'cleaner' &&
      partner.state === 'forage' && partner.forage?.food === 'cleaning' && partner.forage?.partner === a.id;
  }
  return true;
}

// An arrival moment waits until the newcomers are well inside the property, not just stepping
// in over the edge: one of them has to be at least a sixth of the map from every side (and not
// leaving). If they keep to the edges for half a year, it plays on the most central one anyway.
// Call it every day once the species is here; it returns true when the moment has played.
export function arrivalMoment(game, key, def) {
  const done = game.flags.moments || (game.flags.moments = {});
  if (done[key] != null || !def) return done[key] != null;
  const w = game.world, inset = Math.round(Math.min(w.w, w.h) / 6);
  const room = a => Math.min(a.x, a.y, w.w - a.x, w.h - a.y);
  const here = game.wildlife.agents.filter(a => a.sp === def.index && living(a));
  if (!here.length) return false;
  const seen = game.flags.arrivalSeen || (game.flags.arrivalSeen = {});
  seen[key] ??= game.day;
  const candidates = here.filter(a => interesting(game, key, a));
  if (!candidates.length) return false;
  const best = candidates.reduce((a, b) => (room(b) > room(a) ? b : a));
  if (room(best) < inset && game.day - seen[key] < 60) return false;
  if (!momentFree(game)) return false; // (and never on top of another moment)
  return moment(game, key, best, BEHAVIOR_MOMENTS[key] ? { live: true, prey: best.target, partner: best.forage?.partner, tile: best.forage?.i } : {});
}

export function momentsUpdate(game) {
  if (!momentFree(game)) return;
  for (const [key, [species]] of Object.entries(BEHAVIOR_MOMENTS)) {
    if (!(MOMENTS[key] || game.catalog.definition.moments?.[key])) continue;
    if (arrivalMoment(game, key, game.catalog.animal[species])) {
      if (!momentFree(game)) return;
    }
  }
  const agents = game.wildlife.agents;
  if (game.catalog.animal.elk && game.flags.moments?.elkRut == null && [6, 7, 8].includes(game.month)) {
    const adultBull = a => living(a) && a.sp === game.catalog.animal.elk.index && !a.juvenile && a.age >= game.catalog.animal.elk.mature * DAYS_PER_YEAR && isMaleVariant(game.catalog.animal.elk, a);
    const a = agents.find(a => adultBull(a) && a.state === 'spar' && !a.sparLight && adultBull(byId(game, a.sparWith)) &&
      agents.some(c => living(c) && (c.haremOf === a.id || c.haremOf === a.sparWith) && distance(a, c) < 10));
    if (a) { moment(game, 'elkRut', a, { live: true, rival: a.sparWith, loser: a.sparLoser }); return; }
  }
  // (a blacktip after a longtom over the lagoon flats: the longtom's escape leaps are drawn by the renderer)
  if (game.catalog.animal.blacktip && game.flags.moments?.sharkHunt == null) {
    const a = agents.find(a => living(a) && a.sp === game.catalog.animal.blacktip.index && huntInView(game, a) &&
      game.catalog.animals[byId(game, a.target).sp]?.key === 'longtom');
    if (a) { moment(game, 'sharkHunt', a, { live: true, prey: a.target }); return; }
  }
  if (game.catalog.animal.lion && game.flags.moments?.lionHunt == null) {
    const a = agents.find(a => living(a) && a.sp === game.catalog.animal.lion.index && huntInView(game, a) &&
      game.catalog.animals[byId(game, a.target).sp]?.key === 'wildebeest');
    if (a) moment(game, 'lionHunt', a, { live: true, prey: a.target });
  }
}

// Keystone moments never pile up: each is at least MOMENT_GAP game days after the last. One that
// comes up too soon waits its turn (momentsDaily plays it once the gap has passed).
export const MOMENT_GAP = 20;
const lastDay = game => game.flags.lastMomentDay ?? -1e9;
// Whether a moment could play today (for events a map times around its moment, like a hatching).
export const momentFree = game => game.day - lastDay(game) >= MOMENT_GAP && !game.flags.momentQueue?.length && game.canPlayMoment?.() !== false;

// Fire a moment, once per farm. focus: { x, y } in tiles, or an animal to look at.
export function moment(game, key, focus, story = {}) {
  const done = game.flags.moments || (game.flags.moments = {});
  const m = MOMENTS[key] || game.catalog.definition.moments?.[key]; // (a map can bring moments of its own)
  if (done[key] != null || !m || story.live && !momentFree(game)) return false;
  done[key] = game.day;
  const ev = { key, x: focus.x, y: focus.y, id: focus.id ?? null, sp: focus.sp ?? null, ...story };
  if (!momentFree(game)) (game.flags.momentQueue ||= []).push(ev);
  else playMoment(game, ev);
  return true;
}
function playMoment(game, ev) {
  game.flags.lastMomentDay = game.day;
  const m = MOMENTS[ev.key] || game.catalog.definition.moments?.[ev.key];
  if (!m) return; // (a retired moment still waiting in an old save's queue)
  const agent = ev.id != null ? game.wildlife.agents.find(a => a.id === ev.id) || null : null;
  game.emit('moment', { ...m, ...ev, x: agent ? agent.x : ev.x, y: agent ? agent.y : ev.y, agent });
}
// Each day: play the next waiting moment once the gap since the last one has passed.
export function momentsDaily(game) {
  const q = game.flags.momentQueue;
  if (q?.length && game.day - lastDay(game) >= MOMENT_GAP && game.canPlayMoment?.() !== false) playMoment(game, q.shift());
}

// Camera beats read the actual encounter. They never hold animals in place, guarantee
// a catch, add scavengers, or extend a carcass's life. IDs keep a new hunt or rival from
// silently replacing the one the player was watching.
export function momentScene(game, m) {
  if (!m.live) return null;
  if (m.finishedScene) {
    const s = m.finishedScene, a = s.agent;
    return { ...s, agent: living(a) && game.wildlife.agents.includes(a) ? a : null, x: a?.x ?? s.x, y: a?.y ?? s.y };
  }
  const a = byId(game, m.id), prey = byId(game, m.prey);
  const shot = (stage, caption, text, focus = a, zoom = 2.7, follow = true) => ({
    stage, caption, text, x: focus?.x ?? m.x, y: focus?.y ?? m.y,
    agent: living(focus) && game.wildlife.agents.includes(focus) ? focus : null, zoom, follow,
  });
  const finish = scene => (m.finishedScene = scene); // don't turn a later meal or bout into this encounter
  if (m.key === 'elkRut') {
    const rival = byId(game, m.rival);
    const mid = a && rival ? { x: (a.x + rival.x) / 2, y: (a.y + rival.y) / 2 } : a;
    if (living(a) && living(rival) && a.state === 'spar' && a.sparWith === rival.id && rival.state === 'spar') {
      const ready = b => !b.sparPath?.length && b.sparAt && Math.hypot(b.x - b.sparAt[0], b.y - b.sparAt[1]) < 0.05;
      return ready(a) && ready(rival)
        ? shot('antlers', 'Antlers lock', 'Heads down, the bulls push against each other, break apart and meet again. The contest is happening among the cows of the autumn herd.', mid, 3, false)
        : shot('challenge', 'The challenge', 'The bulls move into a head-to-head stance. Nearby cows belong to a harem; a successful challenger can take it over.', mid, 2.6, false);
    }
    const loser = byId(game, m.loser), winner = m.loser === m.id ? rival : a;
    if (living(loser) && living(winner) && loser.state === 'flee' && !loser.play) {
      const cows = game.wildlife.agents.filter(c => living(c) && c.haremOf === winner.id).length;
      return finish(shot('retreat', 'One bull gives ground', cows
        ? 'The beaten bull retreats. The winner stands his ground, and the cows now gather around him. The harem will break up when the rut ends.'
        : 'The beaten bull retreats while the winner stands and watches. The contest is settled for now; the autumn herd keeps grazing.', winner, 2.5));
    }
    return finish(shot('after', 'The herd carries on', 'The bulls have separated. Autumn contests happen within the wider life of the herd: grazing, drinking and gathering again before winter.', living(a) ? a : null, 2.3));
  }
  if (m.key === 'sharkHunt') {
    // small prey is eaten on the spot: a longtom that has gone from the reef was caught
    if (living(a) && living(prey) && a.state === 'hunt' && a.target === m.prey) {
      return a.hunt?.phase === 'rush'
        ? shot('chase', 'The longtom skips for its life', 'The shark charges, and the longtom leaps clear of the water and skips across the surface on its tail, again and again, where the shark can\u2019t follow it.', prey, 2.6)
        : shot('patrol', 'A blacktip on the flats', 'A blacktip reef shark cruises the shallows over the seagrass and singles out a longtom feeding at the surface.', a, 2.6);
    }
    if (!byId(game, m.prey)) return finish(shot('catch', 'The shark makes its catch', 'This time the blacktip caught the longtom. A lagoon that can feed sharks has plenty of fish in it, and that starts with the seagrass.', living(a) ? a : null, 2.5));
    return finish(shot('escape', 'The longtom gets away', 'The longtom escaped. The shark will hunt again; the longtoms will keep feeding at the surface over the meadow.', living(prey) ? prey : null, 2.5));
  }
  if (m.key === 'lionHunt' || BEHAVIOR_MOMENTS[m.key]?.[1] === 'hunt') {
    const c = game.wildlife.carcasses.find(c => c.id === m.prey && c.by === m.sp && c.t > 0);
    if (c) {
      const visitors = game.wildlife.agents.filter(b => living(b) && b.state === 'feed' && b.carcass === c.id && ['hyena', 'vulture'].includes(game.catalog.animals[b.sp]?.key));
      // Remember visitors who actually took a meal, even if they finish at different times.
      const seen = m.scavengers ||= [];
      for (const b of visitors) { const key = game.catalog.animals[b.sp].key; if (!seen.includes(key)) seen.push(key); }
      if (seen.length) {
        const both = seen.includes('hyena') && seen.includes('vulture');
        return shot(both ? 'foodweb' : 'scavengers', both ? 'Hyenas and vultures share the kill' : seen.includes('hyena') ? 'Hyenas take a meal' : 'Vultures take a meal',
          both ? 'Hyenas and vultures have both fed from the lion’s kill. One wildebeest has provided meals for several species: the restored grassland supports a whole food web.'
            : `The ${seen.includes('hyena') ? 'hyenas' : 'vultures'} have reached the carcass and fed. The hunter’s meal is becoming food for other animals, with no second hunt needed.`, c, 2.5, false);
      }
      return shot('kill', 'The hunt becomes a meal', 'The catch has left a carcass where the prey fell. The hunter feeds first; any hungry companions or scavengers that reach it can share the remaining meals.', c, 2.8, false);
    }
    if (living(a) && living(prey) && a.state === 'hunt' && a.target === m.prey) {
      return a.hunt?.phase === 'rush'
        ? shot('chase', 'The chase', 'The hunter breaks into a rush and the prey runs. This chase can still end in an escape.', a, 2.4)
        : shot('stalk', 'The stalk', 'The hunter closes the distance before committing to a rush. Cover, distance and the prey’s response will decide the outcome.', a, 2.7);
    }
    if (living(prey)) return finish(shot('escape', 'The prey survives', 'This pursuit has ended with the prey still alive. An escape is part of a working food web too: the hunter must try another day.', prey, 2.5));
    return finish(shot('after', 'Life moves on', 'The encounter is over. Food passes through this landscape in brief, real exchanges; the animals return to the wider life of the habitat.', living(a) ? a : null, 2.3));
  }
  const type = BEHAVIOR_MOMENTS[m.key]?.[1];
  if (type === 'cleaning') {
    const partner = byId(game, m.partner);
    if (living(a) && living(partner) && a.state === 'forage' && a.forage?.partner === partner.id) {
      return shot('cleaning', 'A giant and its cleaner', 'The manta pauses while a tiny cleaner wrasse works over it. The old coral head supports a meeting between animals of very different sizes.', a, 2.6);
    }
    return finish(shot('after', 'A place to return to', 'The cleaning visit has ended. Old coral heads and their cleaner fish make the reef a useful stop for animals travelling through open water.', living(a) ? a : null, 2.3));
  }
  if (type === 'starfish') {
    if (living(a) && a.state === 'forage' && a.forage?.food === 'starfish') {
      return shot('meal', 'Spines and all', 'The wrasse noses down onto a crown-of-thorns starfish and eats it, venomous spines and all. Every starfish it eats is one fewer eating the coral.', a, 3);
    }
    const w = game.world, gone = m.tile != null && w.shrub[m.tile] !== game.catalog.plant.cots?.id;
    return finish(gone
      ? shot('after', 'One fewer starfish', 'That starfish is gone, and the coral it was eating can grow back. The wrasse cruises on, looking for the next one.', living(a) ? a : null, 2.5)
      : shot('after', 'Back for more', 'The wrasse has swum off for now, but it will be back: it keeps returning to this stretch of reef while there are starfish to eat.', living(a) ? a : null, 2.5));
  }
  if (type === 'canopy') {
    if (living(a) && interesting(game, m.key, a)) return shot('meal', 'A meal in the treetops', 'Watch the hands and mouth as the animal feeds. A connected canopy now offers both food and a route through the restored forest.', a, 3.1);
    return finish(shot('after', 'More than a way through', 'The feeding pause has ended. These trees provide places to eat and rest, joined to the forest beyond the property.', living(a) ? a : null, 2.5));
  }
  if (type === 'family') {
    return living(a) && interesting(game, m.key, a)
      ? shot('browse', 'A family shapes the woodland', 'The herd feeds together. Browsing opens gaps among the young trees, while connected habitat gives the elephants room to move onward.', a, 2.2)
      : finish(shot('after', 'Room for the herd', 'The browsing pause has ended. The corridor connects feeding places, shelter and water across a landscape large enough for a family to use.', living(a) ? a : null, 2.2));
  }
  return null;
}
