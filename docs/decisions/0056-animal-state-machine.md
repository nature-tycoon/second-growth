# 0056 Animal state machine: one table of states (`js/sim/animal-states.js`)

## Rules

- An animal's `a.state` is one of the states in `ANIMAL_STATES` (`js/sim/animal-states.js`). Adding a state means adding it there first, with what it means, what steps it (`step`) and the fields that belong to it.
- `Wildlife.update`'s `switch (a.state)` (`animals.js`) steps every listed state, except one whose `step` names another function (`dormant`: `updateDormancy`, before the switch). Its `default` sends an unlisted state back to idle (from an old save or a typo); never remove it, because an unstepped state freezes the animal for the rest of the game.
- Never rename a state without a load step in `Wildlife.load` that maps the old name: saves store `a.state`.
- `fields` document which fields only mean something in that state. They are not enforced: clearing them is still each transition's job, as it was (`clearActivities` in `animal-dormancy.js` is the full reset).
- Flyovers (`bird-passage.js`, `wildlife.flyovers`) are not agents. Their `'passage'` is `FLYOVER_STATE`, kept out of the table.
- Check: `node tools/animal-state-check.mjs` (headless suite, about 40 s). It scans `js/` for every state written or compared (`x.state = / === / !== 'v'`, `[...].includes(x.state)`) and fails on a name not in the table, or a listed state no code uses. It checks that the switch covers the table and still has its `default`, that an unknown state goes back to idle, and that 120 seeded days on every map only show listed states.
- Sub-states (`a.fishing.phase`, a hunt's `H.phase`, a howler's `jump.phase`, `territory.mode`) are their own small machines inside one state and are not in this table.

## History

2026-11-24. Cole asked for every implicit state machine in the game, and for the change that helps players, developers and agents most without breaking anything.

What was found:

| Machine | Where | Form | Verdict |
|---|---|---|---|
| Animal behaviour, 16 states | `a.state`, written in ~100 places across `js/sim/` | strings, no list anywhere; side fields set by hand at each write | **made explicit here** |
| Save status | `game.saveStatus.state` (idle, saving, saved, error) | already one field, four values, one reader (`save-controls.js`) | fine as is |
| First-visit opening | `ui/opening.js` `this.stage` (fence, culvert, done) | already one field | fine as is |
| Intro film | `ui/intro.js`: `started`, `ready`, `ended`, `fading`, `closed`, `playCalled`, `failSent` | booleans. The lifecycle is buffering, playing, fading, closed; `ready` and `ended` are separate facts, not states | works, and is covered by the intro and intro-browser checks. A `phase` field would replace the `closed \|\| fading` guards; next candidate if the intro changes again |
| Watch mode | `ui/watch.js`: `on`, `walking`, `locked`, `eyeLevel`, `shot` | booleans | candidate; couple it with any watch rework |
| Touch and mouse gestures | `input.js`: `stroke`, `pan`, `pinch`, `fling`, `touching` | which one is non-null says the gesture | candidate if a gesture bug turns up |
| Animal sub-states | `fishing.phase`, hunt `H.phase`, `jump.phase`, `territory.mode` | small, one owner each | fine as is |

Why the animal one: it is the largest (16 states, ~100 writes and ~250 reads across sim, drawing and sound). It is the one agents edit most, and it had a silent failure: a state the switch doesn't know (a typo, a state from an older save) left the animal standing still forever, with no error. The other machines are small, have one owner, or are already one field.

Why a table and a fallback, not a full `enterState()` rework: moving every transition through one function that clears the other states' fields would change what each of ~100 writes leaves behind. Some keep fields on purpose (dormancy keeps `path` and `state` through `clearActivities`; the social greeting restores the old state and path). That is a behaviour change across movement, hunting and save/load, for a gain the table and check already give: one place to read, and typos caught. If a bug turns up from a stale field carried across a transition, that's the time for `enterState` on the states involved.

Verified: the new check passes. `animal-life`, `animal-positioning`, `bird-landing`, `reef-movement`, `wildlife-diagnostics`, `animal-dormancy` and `species-name-count` pass. A seeded `balance-sim restore 2 --run-seed=7` gives byte-identical output before and after (the fallback never fires in a normal game).
