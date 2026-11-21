# Batch waterfall-polish: open questions and new ideas

Sessions 1–7 merged to main in PR #120 (with cinema-creeks). 7b (browser suite fixes) and 9 (movement fixes) are on `claude/ideas-waterfall-polish-2`, not pushed. Session 8 was skipped (Cole). Sources: s1–s7, s7b, s9, usage-2026-11-20.md. Unless Cole says otherwise, each recommendation stands.

**Cole, 2026-11-21:** push 7b + 9 live; for the waterfall and dipper sounds an agent finds public-domain/CC clips it can fetch without a sign-in; refresh the release reference pictures; no preference on the next batch's focus.

## Open questions

### Usage and what's next (s1)
- Returning players next, ahead of more polish? Only ~8% return within 7 days and nothing has moved it. *Recommend: yes: a "while you were away" summary and a clear next goal at exit.*
- itch.io first 2 minutes: 13 of 22 new itch desktop players leave inside 2 min. *Recommend: watch 5 itch replays and check the embed's first 30 s.*
- Free Play first, Story offered after a second, bigger goal. *Recommend: yes.*
- Tag Cole's own play (`?internal=1`) so it stays out of the numbers. *Recommend: yes.*

### Sounds (s6, s7: downloads need Cole's OK, 0002)
- Real waterfall recording: innov8ting's CC0 small cascade on Freesound (needs a sign-in, so Cole may need to fetch the file). Until then the fall plays the stream recording. *Recommend: yes, the CC0 one.*
- Real dipper song (xeno-canto / Commons / Freesound, PD or CC). The dipper is silent until then. *Recommend: yes.*

### Release and CI (s7b)
- Refresh the other release reference pictures (PNW, Serengeti, Amazon forest 7–15% changed from bush clumps, leaf-out, falls, dams); while stale they can hide a real regression. *Recommend: yes, after a glance at review.html.*
- Chinandega reference now shows the bare forest just before leaf-out. *Recommend: keep.*
- Push 7b + 9 so main's browser shards confirm the two CI-only fixes and itch.io updates. *Recommend: yes.*

### Settings (s2)
- Merge mute and the two volume sliders into one Sound section? *Recommend: no.*
- Remove "Carcass decay" and "Wind in the plants"? *Recommend: keep, they're folded under More.*

### Water: ponds, dams, falls (s3, s4, s5, s6)
- Ponds already sunk in old saves aren't repaired. *Recommend: leave; fill and re-dig fixes it.*
- A pond widened along a sloping creek settles at the creek's lowest joined point; strip between creek and pond stays marshy; sedge margin at the bank foot. *Recommend: keep all three (realistic).*
- Creek below a full dam keeps its level. *Recommend: leave.*
- Dams reach full height in two building seasons. *Recommend: keep; longer-lived colonies are the lever if wanted.*
- Big trees at a dam's end come down as logs. *Recommend: keep.*
- Fall stays ~5 m and slightly sloped; mist faint and close-up only; dam spills unevenly. *Recommend: keep all three.*
- Ice is subtle and follows lying snow, not temperature. *Recommend: keep.*

### Wildlife (s7, s9)
- Draw a dipper nest (moss ball on the ledge, April–May)? *Recommend: later, small.*
- One or two dippers per creek (real density). *Recommend: keep; a "Find next" hint helps players see them.*
- Half of lead waits end on the one-day limit; a standing herd mate no longer slows the lead. *Recommend: accept both.*

## New ideas (nature-checked)

- **Gentler cut when widening a pond uphill**: bank sloped over two tiles. Natural. (s3)
- **"Fills with rain" hint on the dig tool.** (s3)
- **River case in the pond-widening check.** (s3)
- **Saplings at a full dam's end** cut by a yearly check. Natural, beavers keep clearing. (s4)
- **Spill round a dam's end** where the bank holds it lower. Natural. (s4)
- **Streak/foam shader for cascades and rapids.** Natural, cheap reuse. (s5)
- **Snow on the fall's rock ledge** in winter. Natural. (s5)
- **Thin edge ice on still ponds** in snowy winters, drawing only. Natural. (s6)
- **Fade creek/river sound with zoom** like the fall. (s6)
- **Dipper perches on the ledge wings.** Natural. (s5)
- **Dipper and ducks dive to escape hawks.** Natural, real dippers dive. (s7)
- **Fast steep water scores as clean creek** (oxygen). Natural: helps dippers and trout. (s7)
- **Waders space out along creeks**; herons displace smaller birds. Natural. (s7)
- **PNW coyote crawl** (12 per 1000) needs its own look. (s9)
- **Sweep checks a waiting lead's legs stop.** (s9)
- **`species-name-count --update`** to lock in the lower counts. (s9)
- **Shared `stubUI` for review pages; test pages choose their own strongest seed.** (s7b)
- **Check `loading_left` / `load_failed` / newsletter prompt events still fire.** (s1)
- **Upright-phone first screen** or a friendlier rotate prompt: 8 of 9 early phone leavers saw it. (s1)
- **Weak-laptop frame rate**: 34% of desktop players under 20 fps (was 19%); re-check after the old-forest lag fix. (s1)
