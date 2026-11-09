---
name: balance
description: Check a change to ecology balance (js/data/*.js, js/sim/) headless, before and after, and report what moved. Use when tuning populations, plant growth, predation, fire, grazing or anything that changes how the ecosystem plays out over years.
---

# Balance check

`tools/calibrate.mjs <map|all> [years=15] [seeds=3]` is the before/after command. It runs `tools/balance-sim.mjs` once per seed (7, 11, 23, ...; seed 7 is the old single-seed `/balance` run, number for number) in parallel child processes under `nice`, takes the medians, and compares them with the map's reference ecosystem (`js/data/eco-reference.js`, the Ecosystem Report's vital signs, decision 0031). Hollis runs the scripted restoration (`restore`); the other maps run untended (`idle`; `--idle` makes Hollis idle too). It prints one line per map (score and its range over the seeds, the six vital signs), then only what is out of range:

- a vital sign that ended lower than it started
- a habitat (meadow, shrub, forest, wetland, deadwood, coral, seagrass...) past 1.5x the reference
- invasives over 15% of the plants
- large-herbivore kg/ha outside the reference range (decision 0033)
- top predators absent, species absent where the habitat holds at least one (K >= 1), species over 1.5x their carrying capacity

and a `since last:` line: findings that came or went, the score, vital signs and species that moved, and `ms/day` if it rose over 25%, against the last run of the same command (saved in `tools/release-output/calibrate.json`, gitignored). Falling short of the reference is not a finding: no farm reaches old growth in 15 years. `all 15 3` takes about 3 minutes; one map about 30-60 s.

## Steps

1. **Baseline first.** Before editing, run `node tools/calibrate.mjs <map> 15 3` (the maps the change can reach, or `all` for shared ecology code). If the change is already made, get the baseline from HEAD in a worktree (`git worktree add <scratch>/base HEAD`, then run `tools/calibrate.mjs` from there: it saves into that worktree's `tools/release-output/`, so copy its `calibrate.json` across before step 3), or `git stash` only when every uncommitted change is yours.
2. Make the change.
3. Run the same command. The `since last:` line is the before/after.
4. Run the check script for the area touched. Most decisions in `docs/decisions/` name one (`tools/*-check.mjs`); `grep -l <file you changed> tools/*-check.mjs` finds others.
5. Ecology is chaotic: if a verdict hinges on a few animals, rerun with more seeds (`... 15 5`) before trusting it. For a year-by-year look at one seed, `balance-sim` still prints a line a year, seeded the same way:

```bash
SEED='data:text/javascript,let s=7;Math.random=()=>(s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296'
node --import "$SEED" tools/balance-sim.mjs restore 15            # Hollis
node --import "$SEED" tools/balance-sim.mjs idle 15 --map=serengeti
```

6. Remove the scratch worktree if you made one.

## Report to Cole

Plain language, no raw dumps (calibrate's output is short enough to paste into a session note). A small before/after table of the score, the vital signs and the species whose numbers moved most, plus any out-of-range finding that came or went. Then a sentence on whether that is what the change was meant to do, and anything that moved that shouldn't have (a species dying out, invasives climbing, fires every year). Note `ms/day` if it rose more than ~10%.
