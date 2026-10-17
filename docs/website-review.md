# Ecology website review

Status: **approved for release on October 17, 2026**. Cole approved the design and fresh images and explicitly authorized publishing. The public homepage has no review banner or noindex restriction. This document retains the capture workflow and provenance decisions.

## Content and layout

The review replaces promotional slogans with a direct introduction to ecological restoration, a creek-restoration example, seven regional starting conditions and species lists, ecological processes, a model-scope note, project/feedback and credit links, and practical play/save guidance. The shorter 700 px desktop header retains translucent panels, curved section boundaries and a closer Pacific Northwest wildlife scene. The substantive copy is preserved while the image placeholders have been replaced.

The existing static homepage and game packaging are reused. `site.js` switches regional images and descriptions, and the three creek stages. It never imports the simulation or accesses player saves. All non-header imagery is lazy loaded; regional images are requested when selected. Images have explicit dimensions and descriptive alt text. Native buttons expose one selected option with `aria-pressed`, support keyboard activation, and update their captions together with the image. No simulation, save-schema, framework or runtime dependency changes are involved.

## Fresh image set

Cole excluded all existing visual assets as outdated. No previous screenshot, portrait, logo, favicon or social image is used by the review homepage. The text wordmark remains. `website/review-media/` now contains 15 fresh images:

- Two separately framed Pacific Northwest headers: desktop 2400 × 1200 and phone 1200 × 1600. The restored habitat fixture has a thinned foreground bank and posed elk, deer, beaver, heron and wood ducks at normal model scale.
- Three creek images, 1800 × 1200, from the same evolving game save and camera. Begin in May, Year 1 (day 20), use actual `ToolActions`, and advance 240 daily ticks with wildlife movement to May, Year 3. Remove the culvert, pull invasives, loosen and mulch the nearby bank soil, plant native shrubs, pioneer trees and meadow plants. There are 292 successful plantings, including eight trees. No further planting or animal staging occurs between the intervention and later capture. Fish access is recorded as blocked before and open afterward.
- Seven regional keystone-moment close-ups, 1800 × 1200. Each uses its current map, seed 1987 and a staged habitat/encounter fixture. The production behavior helpers and moment triggers establish the elk antler-contact beat, howler fruit meal, elephant family browse, monarch stopover, olive ridley hatching event, manta cleaning encounter and orangutan fruit meal. The moment title and stage are recorded in image provenance. Selected-animal canopy reveal and model-centred framing match the real cinematic approach. Setups are explicitly labeled as studies, rather than unassisted campaign outcomes.
- Three close views, 1800 × 1200: Pacific Northwest woodland layers, a posed great blue heron at the creek, and Great Barrier Reef coral, fish and substrate. Captions describe habitat rather than inventing an observed feeding or hunting interaction.

`website/visuals.html` is the completed public capture gallery and source-note companion. It distinguishes staged scenes from the actual creek sequence. The optional gameplay video and any new logo are outside this image set.

Each regional image has a translucent glass panel with a short version of its production keystone-moment description. Its `data-moment-layout` follows the selected map: PNW, Nicaragua and reef use a shallow lower band; Serengeti uses an upper band to leave the herd and calf visible; Amazon and Sumatra use upper-left corners; Atlanta uses the lower-left space among the flowers. Bands place the heading beside the description on wider screens. Phones stack the text and use the upper or lower edge; the Serengeti crop is taller to preserve space beneath its caption. The panel has a solid fallback for reduced transparency or unsupported blur. Sumatra uses an actual supported, near-level branch and a face-aligned camera for an upright orangutan portrait; the capture records its branch and camera placement. The reef cleaning scene includes a normal-scale whitetip reef shark and parrotfish alongside the manta and cleaner wrasse. These are capture-only staging changes.

## Reproduction and provenance

Run `nice -n 15 node tools/capture-header-review.mjs` for the header. Run `nice -n 15 node tools/capture-site-content.mjs` for the creek sequence and habitat details, then `nice -n 15 node tools/capture-site-content.mjs --maps=pnw,amazon,serengeti,atlanta,chinandega,reef,sumatra --moments` for the regional keystone close-ups. `--maps=` also supports regenerating only selected maps. Successful captures are recorded even when a later scene fails, so their image hashes remain consistent. Both use isolated Chrome, close it in `finally`, and delete its temporary profile. `tools/website-scenes.html`, `.mjs` and `website-moment-fixtures.mjs` are an offline capture studio using production game modules, with no animation loop or player-save access. They are excluded from the website package.

`header-provenance.json` and `content-provenance.json` record source revision, camera, scene staging and image SHA-256 hashes. The content record includes keystone moment keys, camera beats and staged encounter notes. It also includes sequence dates, intervention counts/costs, fish access, and save hashes. Full source saves are retained locally under ignored `dist/website-capture-source/`, outside `dist/website/`. Re-running captures regenerates them. The game save arrays contain binary `Uint8Array` data: serialize those arrays as base64 before JSON export, as `restoreSave` accepts binary arrays or base64 strings rather than JSON numeric-key objects.

Capture gotcha: Atlanta’s monarch migration event marks ordinary wildlife agents as `passing` without a bird-passage trajectory. The renderer expects `a.passage` for passing agents. The frozen review fixture clears only that flag for those generated butterflies; it does not change the production map, actors or behavior. The native garden patch and migration setup are staged and documented.

Do not reuse `website/art/` or `tools/capture-website-art.mjs` outputs; these are legacy assets from the previous design. The review only requests images with fresh provenance.

## Verification and release

`node tools/website-check.mjs --review` checks image hashes, the complete 13-image content set, sequence invariants, file sizes, asset paths, all play links, manifest scope, custom domain and byte-identical game packaging. It also rejects image placeholders. A normal check deliberately blocks review markers, preventing accidental publication.

For visual review, check desktop, tablet and narrow phone widths, both image selectors by pointer and keyboard, alt text/captions, lazy-image decoding, links, disclosures and reduced motion. The homepage must not load the game engine or old artwork. Preserve Cole's existing game tab and port 8348 server; use a separate website tab and an isolated browser for checks.

For future releases, obtain Cole's publication instruction and run the normal package and relevant browser checks. Cole authorized this image set on October 17, 2026; review notices/noindex/review markers are removed. No scientific validation or educational endorsement is claimed. Simulation outcomes are not forecasts for real restoration sites.
