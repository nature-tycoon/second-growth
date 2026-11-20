# SEO check and traffic plan, 2026-11-19

Data: Google Search Console (`sc-domain:secondgrowth.earth`) and Bing Webmaster Tools, read through Windsor.ai (trial, so the last 28 days only: 2026-10-23 to 2026-11-17). No GA4 is connected to Windsor; player numbers live in PostHog.

## Where search traffic stands

- **46 clicks in 28 days, all of them people who already knew the name.** "second growth game" 12 clicks (40% CTR, position 3.2), "second growth" 1. The homepage takes 33 clicks, `/play/` 6.
- **No clicks at all from anyone searching for a kind of game.** Nobody reached the site through searches like "ecosystem game", "rewilding game" or "nature restoration game". The site isn't ranking for them yet.
- **The field guide was just indexed.** Daily impressions jumped from about 5 to 39 (Nov 16) and 218 (Nov 17), almost all on `/guide/<species>/` pages for plain species searches ("crown of thorns starfish", "where does salal grow", "balsa tree sapling"). Those average position 40–80 (page 4–8), up against Wikipedia, iNaturalist and the big extension sites, and got 0 clicks.
- A few guide pages already sit on page 1 for rare searches: `jaragua grass` (7), `red oat grass` (6), `madroño tree nicaragua` (5), `paradoxurus` (5), `giant trevally caranx ignobilis` (4), `/guide/plains-zebra/` and `/guide/serengeti-aloe/` (1). These are proof the guide can rank where competition is thin.
- Sitemap: 414 URLs, 0 errors, last read by Google Nov 16. Mostly desktop; US, Canada, Australia, Germany and Brazil bring the clicks.

## Bing (Bing Webmaster Tools, same 28 days)

Bing matters more than its share of searches suggests: it also supplies the results for DuckDuckGo, Yahoo, Copilot and ChatGPT's web search.

- **9 clicks from 50 impressions.** That's small, but Bing already sends what Google doesn't: **people searching for a kind of game.** "ecosytem development game" got 2 clicks at position 4, and "bring a forest ecosystem back to life game online free", "a game where animals work to take back land from humans" and "old environment restoration browser game" all show at positions 1–4. These long, natural-language searches look like people asking a chat assistant, so the site's plain wording and `llms.txt` are working.
- **Bing has indexed only the homepage and `/play/`.** No field guide page has shown up in Bing yet (Google added them on Nov 16–17).
- "second growth" alone ranks 8th, because the name is also a forestry term (second-growth forest). "second growth game" ranks 2nd. Use "Second Growth game" in titles and links from other sites.
- **A player searched for help:** "in second growth game what do i do if most of my farm is under water and it won't go away". The site has no help or how-to pages, so there's nothing for that search to land on.

## What the site already gets right

Every page has a title, description, canonical, Open Graph tags and structured data. `robots.txt` allows everything and points to the sitemap. There's an `llms.txt`, and the pages load fast and are small (homepage 47 KB of HTML). This is a strong base. The gaps are what the pages say and who links to them.

## Gaps found

1. **`/play/` is tagged as a bare "Second Growth".** Its title says nothing else, and it has no canonical, no Open Graph tags and no robots tag (it's the game's `index.html`). It's the second-most-clicked page, and it's what people paste into Discord and Reddit, so the link shows up without a preview card.
2. **Guide pages are thin.** About 150 words each, and half of that is navigation. The only species-specific line is the one-sentence `desc`. The page title "Baobab (Adansonia digitata) · Second Growth field guide" and the description "...in Second Growth:" read as a game page to someone researching a plant, so even page-1 positions get no clicks.
3. **No pages target the searches players make for a game.** "ecosystem restoration game", "rewilding game", "games like Terra Nil", "free browser nature game", "ecology game for students": nothing on the site is about these. The homepage title ("a game about bringing land back to life") is good for people, but those words aren't how anyone searches.
4. **Hardly anything links to the site.** For a 6-week-old domain, links from other sites matter more than anything on the page. The itch.io page and GitHub are almost the only ones.
5. The sitemap has no `<lastmod>`, so Google can't tell which of the 414 pages changed.

## Plan, in order of payoff for effort

### Now (a day of work, all in `tools/build-*` and `index.html`)

Built 2026-11-19 (branch `claude/seo-fixes`): 1–5, and the first help page (`/help/flooding/`). The guide pages now run 60–120 words of species text, not the 300–500 hoped for: only what the game's data makes true. More words need real-world facts written per species. Submitting the sitemap in Bing Webmaster Tools is Cole's step.

1. **Fix `/play/`'s head:** title "Play Second Growth: free ecosystem restoration game in your browser", canonical to `https://secondgrowth.earth/play/`, the same `og:`/`twitter:` tags as the homepage with `share.jpg`. Keep the CSP hash in mind (`website-security-check`).
2. **Rewrite guide titles and descriptions to answer the search first:** "Baobab (Adansonia digitata): size, water, pollinators | Second Growth". Lead the description with the real fact; put the game second.
3. **Make guide pages worth reading**, using data the game already has: what it eats and what eats it (from the sim's diet and prey tables), what it needs to return (habitat, water, nesting), breeding months, which other species depend on it, invasive status and why, and a short "In the game" paragraph (what brings it back on that map). Link the species both ways (predator ↔ prey, plant ↔ the animals that eat it). That makes each page richer and links the guide pages to each other, which helps Google rank them. Aim for 300–500 real words per page.
4. **Add `<lastmod>`** to the sitemap from each page's build date or the species data's git date.
5. **Get the guide into Bing:** submit `sitemap.xml` in Bing Webmaster Tools (Sitemaps). Then add IndexNow: a key file in `website/`, plus one request after each deploy that lists the changed URLs. Bing, Yandex and others then fetch the new pages within hours.
6. **Help pages for common player problems**, starting with water: "My farm is flooded", "Why aren't animals coming back", "How to bring salmon back". They answer searches players make, and they keep players playing.

### Next (1–2 weeks)

7. **Topic pages for searches where the guide can win:** one page per landscape and question, built from the same data. Examples: "Native plants for a Pacific Northwest salmon creek", "What lives on a restored coral reef", "Serengeti food web", "Georgia native plants for pollinators" (the Atlanta map; big real search). The website plan (Phase 3) already lists these. They pull in searches where Wikipedia isn't the obvious answer.
8. **Pages for people searching for a kind of game:** "Ecosystem restoration game", "Rewilding game", "Games like Terra Nil / Eco / Equilinox (free, in your browser)", and a `/teach/` page ("ecology game for middle school", from Phase 3). Each one is short, honest, with a clip and a Play button.
9. **`VideoGame` structured data** on the homepage and `/play/` (free, browser, genre, `playMode`, screenshots), and `VideoObject` for the hero and reel clips so they can show in video results. Change the guide pages' `og:type` to `article`.

### Ongoing: links and listings (where most game traffic actually comes from)

10. **Browser-game portals:** list on CrazyGames, Poki (by application), Newgrounds and itch.io's browser-game tags. These are search engines in their own right, and each one links back to the site.
11. **Communities, one honest post each with a clip:** r/WebGames, r/incremental_games (if it fits), r/indiegaming, r/rewilding, r/ecology, r/NativePlantGardening (Atlanta/PNW guide pages), and Pacific Northwest and Georgia native-plant society newsletters. Native-plant groups linking to a guide page are exactly the links that help those pages rank.
12. **YouTube Shorts / TikTok** from the existing 9:16 clips (`capture-site-video.mjs --vertical`), each linking a guide page or `/play/?map=`.
13. **Teachers:** Common Sense Education and teacher resource lists, once `/teach/` exists.
14. **A Steam page** later, for wishlists (Phase 3 notes it).

### How to measure

- Search Console and Bing Webmaster every 2 weeks: clicks from searches that don't include the game's name (now 0 on Google, 5 on Bing), the number of guide pages on page 1, CTR on guide pages.
- Turn on PostHog's web analytics for `secondgrowth.earth` → `/play/` and how often people go from a guide page to Play. That shows whether search visitors become players, which is the real goal. (PostHog needs to be authorized in Claude Code with `/mcp` before an agent can read it.)
- Windsor's free trial only covers 30 days. To compare periods later, Search Console's own Performance report covers 16 months for free.

Targets for 90 days: 20+ guide pages on page 1, 300+ non-branded clicks a month, 10+ links from other sites.
