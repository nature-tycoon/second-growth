# Batch cinema-creeks: open questions and new ideas

All 9 sessions (plus 4b) landed on `claude/ideas-cinema-creeks`. Each question carries the session's recommended answer; unless Cole says otherwise, the recommendation stands. Sources: s1–s9.md.

**Cole, 2026-11-20:** all recommendations accepted. Next batch: beaver dam polish, Serengeti balance (incl. resident grazers on green grass), waterfall extras (sound, mist, ice, dipper), small movement fixes (waiting family leads, coati in trunk, sweep catches walkers stuck on water).

## Open questions

### Updates / web
- Persistent "new version" banner instead of a toast? *Recommend: no; the next launch loads the new version anyway.* (s1)
- First release with the check still needs one stale launch to arrive. *Recommend: just ship it.* (s1)

### Camera & cinema mode (s2)
- A keystone moment (hunt cinematic) drops your lock. *Recommend: leave it.*
- Two-finger twist inside cinema mode. *Recommend: leave it; it would fight the director's drift.*
- Esc takes two presses while locked. *Recommend: keep it.*

### Movement
- Walkers ease past grazing herd mates at 0.65 pace instead of queueing. *Recommend: keep it.* (s3)
- The crawl limit (4 per 1000) is at seed-noise level on two seeds. *Recommend: keep the limit; judge movement changes by `tools/herd-crawl-probe.mjs` over 20 seeds; the two-seed sweep stays the CI gate.* (s9)
- Hippo crawl 0.27 → 0.51 per 1000. *Recommend: noise, don't tune.* (s9)
- PNW family leads (deer, elk) crawl while waiting for their family (`rangePaces`). *Recommend: small follow-up: a waiting lead stops and looks back instead of creeping.* (s9)
- Same-day fish routes after a new dam use yesterday's water. *Recommend: accept.* (s4)

### Water: dams and falls
- Creek below a dam keeps its level (the game tracks level, not flow). *Recommend: leave it; optionally draw an overflow trickle.* (s5)
- A new dam once drew only after a forced redraw. *Recommend: a short check that a dam is drawn one day after it's built.* (s5)
- Trees where a dam's ends land can stand through the mound. *Recommend: fell woody plants there when the dam is built.* (s5)
- Two dams within ~4 tiles can make a pond slightly bigger than predicted. *Recommend: leave it.* (s5)
- Fall reads as a steep horsetail, not a sheer drop. *Recommend: leave it; a rock-ledge face is a drawing-only session if wanted.* (s6)
- Falls on Atlanta / Amazon? *Recommend: no; it would mean reshaping their land.* (s6)
- Old PNW saves have no fall; fish can't go down the fall. *Recommend: leave both.* (s6)

### Plants (s7)
- Red alder and black cottonwood wet-tolerant? *Recommend: no; real ones drown in a permanent pond within a few years.*
- Leaf-out redraws 28–42% more plant regions in spring/autumn, no frame-time change. *Recommend: keep it, accept the new perf-guard baseline.*
- Shade and fruit still flip by the month while leaves come by the day. *Recommend: leave the sim on the month.*
- Ground grass tint still greens on the 1st. *Recommend: leave it.*

### Serengeti
- Herds reach only mid-range before leaving north. *Recommend: leave it; real herds also stay near water.* (s8)
- Arrival timing by the year's rain. *Recommend: not now.* (s8)
- Resident grazers (gazelle, topi, buffalo) follow green grass too. *Recommend: yes, later, own session with calibrate.* (s8)
- Serengeti herbivore biomass 696–750 kg/ha vs a 100–200 reference (older than this batch). *Recommend: a `/balance` session for Serengeti grazers.* (s9)

## New ideas (nature-checked)

- **Waterfall sound, mist and spray** at the foot of the fall (real recordings, 0002). Natural. (s6)
- **Drawn spill over a full beaver dam**, reusing the fall's whitewater. Natural: full dams overtop. (s5, s6)
- **Beavers raise dams over the years** instead of building to full height at once. Natural: real dams grow over decades. (s5)
- **American dipper** feeding in the plunge pool and nesting behind the fall. Real PNW waterfall bird. (s6)
- **Fall ices at the edges in winter.** Natural for PNW cold snaps. (s6)
- **Ghost forests**: grey bleached snags standing in beaver ponds. Natural, very recognisable. (s7)
- **Blackberry takeover**: idle Hollis ends ~60% bush, nine tenths blackberry. Real Himalayan blackberry does this; worth a look as an invasive question rather than a bug. (s7)
- **Bare-ground makers**: gopher and mole mounds, wallows, frost heave opening gaps for seedlings. Natural. (s7)
- **"Burn to bring the herds"**: early dry-season burns already pull migrants to the green flush; say so in the fire tool's text and field guide. Real Serengeti practice. (s8)
- **Sweep counts land walkers stuck on water tiles** whatever their state (missed the stuck buffalo). (s9)
- **Chinandega coati in a trunk** (114–122 per 1000 on some seeds), older than this batch. (s9)
- **Herd-crawl probe filters and baseline diff** to make before/after quicker. (s9)
- **Snappers swimming sideways** while stalled; Atlanta bluegill/bass "stuck" share needs a baseline. (s4)
