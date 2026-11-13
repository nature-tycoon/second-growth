# secondgrowth.earth: the next website

A plan, November 2026. Nothing here is built yet.

## Where the site stands

The site is one page (`website/index.html`) plus an image notes page (`visuals.html`). It was last redesigned on 17 October; since then about 260 commits have changed the game. The page is calm, accurate and well made, but it sells the October game, and it reads like a museum placard more than a game.

**What's good and worth keeping**
- Every picture is a real game render, captured by script (`tools/capture-site-content.mjs`, `tools/website-scenes.mjs`). That honesty is rare and worth making a selling point.
- The creek before/after slider, the landscape picker with its keystone moments, the FAQ, `llms.txt`, the sitemap and the structured data.
- Fast, no frameworks, strict security policy.

**What's out of date**
- Nothing moves. Every real game page leads with motion. Ours leads with a still overhead diorama.
- The biggest new things in the game aren't mentioned at all: eye level (walk among the animals), watch mode and watch pace, continuous hunts, weather, lightning and thunder, the real moon, beaver ponds, carcass decay, the Ecosystem Report and its badges, photo-mode postcards, phone play, Spanish.
- The copy undersells the depth: "200+ animal appearances, each with its own needs" is a hook; "Every plant and animal follows its own needs" is a sentence people skim.

**What's missing for a "real game" feel**
- A trailer, a soundtrack moment, a press kit, a news/devlog page, a way to follow the game (newsletter, socials, community), platform badges (browser, phone, itch.io), and a "Play this map" button that drops you straight into a landscape.

**Why it went stale (the real problem)**
The site's media is captured by hand-run scripts, so it only gets refreshed when someone remembers. The fix is structural: the site should be regenerated from the game on every release, so it can't fall behind again. That is Phase 1 below, and everything else builds on it.

## The idea in one line

**The game is the trailer.** Every image, clip, number and species page on the site is produced by the game itself, on each release, and the landing page feels like stepping into one of the landscapes.

## Phase 1: a media pipeline that renders the site from the game

Extend the existing capture tools so one command (and the Pages deploy) produces:

1. **Video loops.** Scripted camera paths recorded from the real renderer at a fixed timestep (canvas `captureStream` + `MediaRecorder`, or frame dumps encoded with ffmpeg), 6 to 12 seconds, muted, in WebM and MP4 with a still poster frame. Target 2–5 MB each.
2. **Stills and per-page share images** (1200×630) for every page the site generates.
3. **Field-guide portraits** of every species from the close-up models (`tools/animal-closeup-capture.mjs` already does this for the release checks).
4. **Numbers from the data**: counts of species, maps, recordings, so the copy never goes stale.

`tools/website-check.mjs` then warns when site media was captured from a much older game release (the release stamp is already in `js/release.js`).

### Image tools: ChatGPT (and Adobe) for art and touch-ups

The capture pipeline gives honest, current game footage. ChatGPT's image model (and the Adobe tools available to Claude: generative expand, background removal, lens blur, upscaling) cover the rest. Use them for two kinds of work:

1. **Original art that isn't a game scene.** Key art for the hero's poster frame, store capsules (itch.io, a future Steam page), the logo lockup and wordmark, press-kit illustrations, social and share cards, newsletter headers, blog post headers for Sim Diaries, wallpapers with a painted look, and title cards for the trailer.
2. **Finishing real screenshots.** Extend a capture to a wider or taller frame (2:1 hero, 9:16 Shorts, 1200×630 share card), remove a UI overlay or a stray artifact, soften the background behind an animal, upscale, colour-grade a set so the landscapes match.

**The one rule:** anything the site presents as *a scene from the game* stays a real capture. Light finishing is fine: crop, extend the frame with plain scenery, grade, upscale, remove an artifact. Adding or changing animals, plants or effects is not. Generated art is labelled as art ("Illustration", or kept to places nobody reads as gameplay, like the logo). This keeps the site's strongest promise true, and it's what `website-check` already enforces for the homepage's game imagery.

**How it works in practice:** Claude writes the prompt and picks the source capture, Cole runs it in ChatGPT, and the result goes in `website/art/` with a line in a provenance file (tool, prompt, source image, date) like the game captures already have. A check keeps generated art out of the slots meant for game captures.

**Constraints**: videos and captures are heavy on Cole's Mac, so capture runs `nice`d and headless, and stays a local/manual step at first rather than a CI job (CI's software renderer would make poor footage). GitHub Pages limits files to 100 MB and the site to 1 GB, which is plenty for short loops.

## Phase 2: the new landing page

Section by section, top to bottom. Design stays in the current family (Fraunces + Nunito, deep greens, cream), pushed further: darker and more cinematic at the top, each landscape bringing its own palette as you explore.

1. **Hero: you land inside a landscape.** A full-screen eye-level loop: dawn mist over the Hollis creek, elk crossing, a heron lifting off. A slow pull up to the overhead diorama so the first 10 seconds show both ways to play. Title, one line ("Bring a broken place back to life, then walk through it"), one big **Play free** button and a **Watch the trailer** link. A small "Updated 9 Nov: siamangs now leap between crowns" pill fed by the latest release, which proves the game is alive. Optional sound button that plays the scene's real field recording.
2. **"From the map to the forest floor."** The signature moment: as you scroll, a scrubbed video descends from the god's-eye view into eye level among the animals. This is the thing no other restoration game does, and it's the new graphics' best showcase.
3. **The loop in three beats**: Fix the land → Wildlife finds it → Watch it live. Each a short clip with real UI visible (brush, overlays, the Ecosystem Report), because players want to see what playing looks like, not just the scenery.
4. **Creek restoration, upgraded**: keep the slider, but add a 10-year time-lapse through the seasons, from the same save.
5. **Seven landscapes**: keep the picker; each map gets a loop instead of a still, its species roster as portrait chips, and a **Play this landscape** button. (Needs a small game change: a `?map=amazon` link that opens that map's start screen.)
6. **Moments reel**: a grid of autoplaying muted clips of keystone moments: the rut, a lion's stalk and charge, hatchlings running for the sea, a beaver dam turning into a meadow, a lightning storm at eye level, a carcass going back to bones over weeks.
7. **"It's a real ecosystem"**: a few systems with one clip and one sentence each (hunts and the landscape of fear, succession and fire, beaver ponds, grazing pressure), with numbers from the data.
8. **Your farm's report card**: the Ecosystem Report, badges and a photo-mode postcard, with "Share your postcard".
9. **Play anywhere**: browser, phone in landscape, itch.io; English and Español.
10. **Follow along**: newsletter, community link, devlog, closing Play button.

**Quality bar**: largest image or poster on screen within 2.5 s on a mid phone; videos load only once visible and never on Save-Data or reduced-motion; every clip has a still fallback; phone layout designed at 844×390 landscape first.

**Professional signals to add**: a proper logo lockup and wordmark, a studio/maker name, a `/press` page (fact sheet, logo pack, screenshots, trailer, contact), a short trailer with music (the CC0 soundtrack can carry it), and platform badges.

## Phase 3: discovery and fresh content

One landing page can't rank for much. The way to be found is lots of genuinely useful pages, and the game already contains most of the material. Ordered by payoff for the effort.

### 1. The Living Field Guide (the main search engine play)
A generated page for every species in the game, animals and plants: its game portrait, a short clip of it doing its thing, its real call (the licensed recordings from decision 0002), what it needs in the game, how it behaves, which landscape it lives in, and its real-world status and range. Built at deploy time from `js/data/`, so it grows every time a species is added.

Hundreds of pages, each a long-tail search ("roosevelt elk sounds", "what eats a capybara", "native shrubs for salmon streams"), each ending in "Meet it in Second Growth".

### 2. Sim Diaries: the devlog that's already written
The 41 decision records in `docs/decisions/` are fascinating raw material: how prey learn to fear kill sites, why lions stalk from cover, how carcasses decay, why beaver ponds turn into meadows. Rewrite each as a short illustrated post with clips and the real science behind it. These are what get shared on Reddit (r/simulationgames, r/ecology, r/gamedev, r/proceduralgeneration), Hacker News and science newsletters, and they earn links from educators.

One post a week is sustainable, because the work behind each one is already done.

### 3. The real places: each map's real-world twin
This is your real-projects idea, made bigger. Every landscape gets a page pairing the game with the real place and the real restoration work like it: culvert removals and salmon return in Washington, Atlantic/Amazon reforestation and pasture recovery in Brazil, wildlife corridors and fences in Tanzania, suburban native gardens in Georgia, sea turtle hatcheries and silvopasture in Nicaragua, coral gardening on the Great Barrier Reef, peat rewetting and orangutan corridors in Sumatra.

Each page links to real projects and to ways to help. Then **reach out to those organisations**: a free, accurate game about their work is something they're glad to share, and links from conservation groups are exactly the backlinks that help ranking. (Never imply a partnership until one exists.)

### 4. Restoration recipes
Short guides that are both strategy tips and plain-language explanations of real techniques: "How to bring coho back to Hollis" is also "Why culvert removal works". The Atlanta map is a real guide to Georgia native gardens: "Native plants for monarchs in the Southeast" is a big real search, and the page can link to native plant societies.

### 5. Slow TV: watch mode on YouTube
Watch pace was built for sitting and watching. Record long ambient videos ("3 hours of dusk on the Serengeti", "A rainy morning on a restored salmon creek") with the real field recordings. Ambient nature videos get big audiences and almost no game does them. The same pipeline cuts 15-second keystone moments for Shorts/TikTok/Reels.

### 6. Weekly seed challenge
Each game already has a run seed (decision 0035). Every week, publish one seed and one goal ("Bring coho back to Hollis within 5 years on Challenging"), scored by the Ecosystem Report. The site's challenge page is fresh content every week and a reason for players to return. Start with players posting their postcards; a real leaderboard needs a small backend later.

### 7. Postcard gallery and photo contests
The game already makes beautiful postcards. Run a monthly theme ("best predator moment", "the wettest meadow"), curate the best into a gallery page. Start by collecting through the community (Discord or the itch.io community) rather than building uploads.

### 8. The world's restored acres
A live-ish banner from aggregated, anonymous PostHog data refreshed at deploy: "Players have planted 1.4 million native trees and brought salmon back to 3,100 creeks." Social proof that's also feel-good and newsworthy.

### 9. For classrooms
Free, browser-based, no accounts: Second Growth is unusually school-friendly. A `/teach` page with one lesson per landscape tied to middle-school ecology standards (food webs, succession, human impact), worksheets that use the overlays and the Ecosystem Report. Teachers are a big, loyal discovery channel (Common Sense Education, ISTE, teacher Facebook groups). Needs one check first: how it runs on school Chromebooks.

### 10. Small things that compound
- **Soundscapes page**: listen to each landscape's dawn chorus from the game's recordings (check each licence allows it).
- **Wallpapers**: desktop and phone wallpapers from the renders.
- **Spanish site**: the game speaks Spanish already; a Spanish landing page (with `hreflang`) opens Latin America and the Nicaragua map's home audience.
- **Technical SEO**: per-page share images, `VideoObject` and `VideoGame` structured data, the generated pages in the sitemap.
- **Storefronts**: refresh the itch.io page with the new media; list on Newgrounds and game discovery sites; consider a Steam page later (wishlists are the biggest discovery lever for indie games, even for a game that's also free in the browser).

## Measuring it

GTM is on the site and PostHog is in the game. Track the funnel end to end: land → Play → game loaded → first native planted → 10-minute session → came back within a week. Tag every outside link with UTM parameters (Reddit post, YouTube video, partner page) so each channel shows what it brings. A good first target: double the share of visitors who press Play, and get the field guide and devlog to 30% of site traffic within three months.

## Order of work

| Step | What | Size |
|---|---|---|
| 1 | Refresh copy and stills for the current game; add `?map=` play links | Small |
| 2 | Video capture pipeline + freshness warning | Medium |
| 3 | New landing page (hero video, map-to-eye-level scroll, loop clips, moments reel) | Large |
| 4 | Press kit, logo lockup and key art (ChatGPT), trailer, newsletter, community link | Medium (press kit, follow links and art rules built; art and trailer to do, see below) |
| 5 | Living Field Guide generator | Medium |
| 6 | Sim Diaries devlog (first 4 posts) and real-places pages, plus outreach | Ongoing |
| 7 | Slow TV videos and Shorts from the pipeline | Ongoing |
| 8 | Weekly seed challenge, postcard gallery, classroom page, Spanish site | Medium each |

Steps 1 and 2 come first because everything else uses them. Step 3 is the big visible change.

### Step 4 status (12 Nov)

- **Built:** `/press/` (fact sheet with species counts checked against the game data, short and long descriptions, features, footage and stills to download, logo, credits and licences, contact), a "Follow along" block on the homepage and the press kit, and the generated-art rules: `website/art/art-provenance.json` and `website-check` keeping generated art out of game-capture slots.
- **Decided:** "a game by Cole Weiler"; press contact info@secondgrowth.earth (Porkbun forwards it to Cole's Gmail, and Gmail sends as it); news by following on itch.io (itch emails followers when a devlog is posted), so no newsletter service and no change to the site's security policy; community is the itch.io comments; no social accounts yet.
- **Key art and logo lockup:** the ChatGPT prompt pack is [docs/key-art-prompts.md](key-art-prompts.md). Cole runs it; Claude sizes the results and adds them as labelled illustrations.
- **Trailer (not built yet):** its raw material is the clips from `tools/capture-site-video.mjs` (the list in `tools/website-video-clips.mjs`; add trailer shots there so they're filmed the same way), plus a CC0 track by HoliznaCC0 from `assets/music/` and a title card from the key art. The press kit's footage section says a trailer is coming.

## Decisions for Cole

- **Newsletter and community**: which services (each needs the site's security policy widened for it)? Discord or the itch.io community?
- **Steam**: worth a page eventually, or browser and itch.io only?
- **Name on the door**: is there a studio name, or "a game by Cole Weiler"? A press kit needs one.
- **Outreach**: happy to contact restoration organisations and teachers once the real-places and classroom pages exist?
- **Trailer**: generated from the pipeline, or worth paying an editor for a launch trailer once the clips exist?
