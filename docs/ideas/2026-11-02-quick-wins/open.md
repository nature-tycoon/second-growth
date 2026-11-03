# Open questions and new ideas, batch 2026-11-02 quick-wins

All 5 sessions landed on `claude/ideas-quick-wins` (c0008c2..f338096). Not pushed.

## Decided as built (recommendations stand unless Cole says otherwise)
- Invasives off: invasives already on the land stay; you clear them as usual (s2).
- Keystone moments off: a small notification still shows (s2).
- A click during a moment does nothing; Continue/Esc exits (s2).
- Lens: woodpecker behind its trunk still gets a see-through hole; tighter clearing round followed animals (s3, Cole agreed).
- Catch puff stays faint, close-up only (s5).
- Herd single-file travel: leave for now, see if the stride fix is enough (s4).

## Try in play and report
- Tree brush density (s1): if still thin, raise the `plantTool` skip rate (0.78) toward 1.
- Butterflies at a distance (s1): if too hard to spot zoomed out, boost the far view only.

## Next batch (recommended additions to the deferred list in plan.md)
- Reef: 3–4 healthy colourful bommies at map start as a "what you're restoring" preview (s5).
- Reef: anthias schools as a new species (s5).
- Fix `animal-steering-check` on Atlanta (antler racks in trunks, failing before this batch) (s4).
- Keystone glide on real time so it's the same length on slow computers (s2).
- Small "Invasives off" tag in the Ecosystem Report (s2).
- Climbing monkeys set their trunk as support for the lens, like woodpeckers (s3).
- Serengeti herds held up 55–70% of steps (s4 probe): real slowdown worth a look with the refactor audit.
- Fishing birds leave tree crowns cleanly (Amazon kingfisher perch exit) (s4).
- Seabirds float on the surface over deep water instead of the seabed (s5; may be test-spawn only).
- Nature-checked, lower priority: salmon leap height by current and spawning season (s1); brush preview of poor tiles (s1); chromis diving into staghorn when a hunter comes near, as a moment (s5).

## Beaver dam flooding (Cole's playtest)
- Found (also on main): on one flat stretch of the Hollis creek (tile 55,45) even the lowest dam flooded 1,296 tiles (8.3 ha, an eighth of the farm), because the dam-height search fell back to a 35 cm dam with no size check. Separately, a standing dam kept its height while the ground round it changed, so its pond could grow past the 60-tile cap (95 to 131 tiles in a seeded run).
- Fixed in `sim/hollis-water.js`: beavers no longer dam a stretch that would flood more than 60 tiles (0.38 ha) even at the lowest dam, and a standing dam is lowered whenever its pond would outgrow that. Ponds still fill only connected ground upstream of the dam, below its crest. Meadow succession unchanged.
- Seeded 15-year restore run: largest dam pond 81 wet tiles (0.52 ha) before, 43 (0.28 ha) after; the 8.3 ha site is now never chosen.
- Open question: should big ponds be possible? Real beaver ponds reach 1–5 ha, but the farm is only ~69 ha, so 60 tiles (0.4 ha) per pond keeps a chain of ponds without drowning the farm. Recommend keeping 60.
