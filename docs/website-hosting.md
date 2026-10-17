# secondgrowth.earth

Cole approved the ecology-focused website and authorized publication on October 17, 2026. See [website-review.md](website-review.md) for the image capture workflow and [website-discovery.md](website-discovery.md) for search and AI discovery. Review notices and indexing restrictions have been removed.

The public homepage source lives in `website/`. The playable game stays in the repository root for development, tests and itch.io. `node tools/build-website.mjs` assembles `dist/website/` with the homepage at `/` and an unchanged copy of the game at `/play/`.

The homepage excludes all previous game imagery, including the old logo. Its compact landscape header uses fresh desktop and portrait captures under `website/review-media/`, with source provenance. Seven fresh keystone-moment close-ups, a same-save creek sequence and three habitat details now fill the rest of the page. Its small `site.js` controls switch regional images and descriptions and compare three creek stages. It does not import the simulation, create a WebGL canvas or access player saves. `website/visuals.html` is the public image gallery, with staging notes, regional descriptions and the same-save creek sequence. All seven landscape descriptions are readable without JavaScript.

`website/art/` and `tools/capture-website-art.mjs` are legacy assets and an export helper from the previous pass. They are excluded from the published homepage package; game assets remain under `/play/`. Do not reuse them without explicit approval of newly captured material from the current game revision.

`node tools/website-check.mjs` builds and checks public indexing, canonical URLs, discovery files, structured data, links, play buttons, app manifest scope, the custom domain, fresh image hashes, sequence invariants, exclusion of old homepage artwork, and byte-identical game packaging. The optional `--review` flag permits indexing restrictions during future local design reviews; release checks reject those restrictions. The headless release runner discovers that check automatically, and the website workflow runs it before publishing. Simulation code and the itch.io packaging paths are unchanged.

The `Publish secondgrowth.earth` workflow publishes the assembled directory to GitHub Pages on pushes to main. Repository Settings → Pages must use **GitHub Actions** as the source and **secondgrowth.earth** as the custom domain. The generated CNAME documents the domain but Actions hosting uses the repository setting.

Porkbun DNS uses an apex ALIAS to `nature-tycoon.github.io` and a `www` CNAME to the same hostname. The ALIAS flattens to GitHub Pages' A and AAAA addresses. The original apex parking ALIAS and wildcard parking CNAME were replaced with these two records; no wildcard remains. Retain any future email and verification records. Set the custom domain on GitHub before pointing DNS at it, then enable HTTPS when its certificate is issued. GitHub documentation: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site

Browser saves belong to an origin, not a URL path. Moving from github.io to secondgrowth.earth creates a separate save store; farms cannot migrate automatically across domains. Moving the game between paths on the same domain retains its save store. Never claim old-domain saves migrated.

Preview the packaged site with `python3 -m http.server 8348 --bind 127.0.0.1 --directory dist/website` and visit http://localhost:8348/. Stop the server and close game tabs after checking. Test the packaged `/play/` path as well as the homepage because relative module, sound, thumbnail and manifest URLs must still resolve.
