---
name: balance
description: Check a change to ecology balance (js/data/*.js, js/sim/) headless, before and after, and report what moved. Use when tuning populations, plant growth, predation, fire, grazing or anything that changes how the ecosystem plays out over years.
---

# Balance check

`tools/balance-sim.mjs` runs the game headless for N years and prints a line per year (score, natural %, invasives, forest, mature trees, visitors, fires, floods) plus each species' count/capacity. It is unseeded, so seed `Math.random` to compare two versions:

```bash
SEED='data:text/javascript,let s=7;Math.random=()=>(s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296'
node --import "$SEED" tools/balance-sim.mjs restore 15 > "$TMPDIR/balance-before.txt"
```

## Steps

1. **Baseline first.** Before editing, run the seeded `restore 15` into a scratch file. If the change is already made, get the baseline from HEAD with `git stash` only when every uncommitted change is yours; otherwise make a worktree at HEAD (`git worktree add <scratch>/base HEAD`) and run it there.
2. Make the change.
3. Run the same seeded command into `after.txt`. Also run `idle 10` (farm left alone) if the change could affect an untended farm.
4. Run the check script for the area touched. Most decisions in `docs/decisions/` name one (`tools/*-check.mjs`); `grep -l <file you changed> tools/*-check.mjs` finds others.
5. One seed can mislead, since ecology is chaotic. If a result hinges on a few animals, repeat with two more seeds (`s=11`, `s=23`) and report the range.
6. Remove the scratch worktree if you made one.

## Report to Cole

Plain language, no raw dumps. A small table of years 5, 10 and 15, before vs after, for: score, natural %, forest, mature trees, and the species whose numbers moved most. Then a sentence on whether that is what the change was meant to do, and anything that moved that shouldn't have (a species dying out, invasives climbing, fires every year). Note `ms/day` if it rose more than ~10%.
