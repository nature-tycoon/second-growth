# Search and AI discovery

The public origin is `https://secondgrowth.earth/`. GitHub Pages serves the output of `tools/build-website.mjs`, not the raw `website/` directory. No crawler-specific rendering, runtime service, paid submission tool or external dependency is needed.

## Responsibilities

- `website/index.html` holds the approved game introduction, landscape data, ecological-process descriptions and player questions. `website/visuals.html` provides readable descriptions for all seven landscapes, plus the image staging notes. These facts are accessible without executing JavaScript or loading the game.
- `website/robots.txt` allows compliant crawlers through one wildcard group and advertises the canonical sitemap. Search bots such as OAI-SearchBot inherit the rule; adding a named group would require repeating the applicable rules. This retains the site's existing public crawl policy, including training crawlers. Discovery is not a guarantee of indexing or citation.
- `website/llms.txt` is a concise guide to official pages, the generated Markdown companion, the game and the source/feedback links. The filename has two initial lowercase L characters: `llms.txt`. It follows a community proposal, not a universal crawler requirement.
- `tools/website-discovery.mjs` extracts the authored homepage facts and generates `/index.md`, `/sitemap.xml` and inline Schema.org JSON-LD during the existing packaging step. The graph identifies the WebSite, WebPage, free VideoGame/WebApplication and visible questions. Questions and answers are derived from the same HTML, rather than maintained in a separate marketing copy. No ratings, endorsements, review counts or release dates are invented. FAQ markup does not imply eligibility for Google FAQ rich results.
- Canonical, Open Graph and Twitter metadata use the apex HTTPS domain and approved fresh hero. Each content page links to `llms.txt`; the homepage also declares the Markdown alternate. The sitemap contains the homepage, playable game and image notes, with no artificial modification dates or fragment URLs.

## Maintenance and acceptance criteria

Keep the homepage's map button attributes and player-question HTML consistent with the small extraction contract in `website-discovery.mjs`. When regional descriptions change, update the visible gallery copy too; the check catches drift. Generated files are build artifacts and should not be edited directly. A full-content duplicate `llms-full.txt` is unnecessary for this small site; `/index.md` already consolidates its game facts.

Run `node tools/website-check.mjs`. It checks that release HTML permits indexing, canonical URLs agree, all local guide and sitemap targets exist, robots allows public crawling, Markdown and structured answers match visible facts, fresh images match provenance, and `/play/` remains byte-identical to the game source. Browser checks cover image selectors, text panels, keyboard controls, disclosures, desktop/phone layout and lack of game-engine requests on the homepage. After deployment, verify real HTTPS responses, content types, canonical URLs and the game entry point.

Search Console verification and sitemap submission require the owner's account. No verification token should be guessed, and obsolete search-engine sitemap ping endpoints should not be used. The sitemap is discoverable through `robots.txt` without account setup. If an owner later connects Search Console or Bing Webmaster Tools, submit `https://secondgrowth.earth/sitemap.xml` there and use their indexing reports to measure discovery. No account-level verification is claimed by this release.

## Primary references checked October 17, 2026

- [Google: AI features and your website](https://developers.google.com/search/docs/appearance/ai-features): normal crawlability, helpful text, links and matching structured data remain the foundation; no special AI file is required.
- [OpenAI crawler documentation](https://developers.openai.com/api/docs/bots): OAI-SearchBot controls search discovery separately from GPTBot's training role.
- [The llms.txt proposal](https://llmstxt.org/): concise Markdown guidance, discovery links and optional Markdown page companions.
- [Schema.org VideoGame](https://schema.org/VideoGame) and [WebApplication](https://schema.org/WebApplication): metadata for a browser-based game. Markup must describe the actual visible product.
