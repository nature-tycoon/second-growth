# secondgrowth.earth

The public homepage is in `website/`. The playable game stays in the repository root for development, tests and itch.io. `node tools/build-website.mjs` assembles `dist/website/` with the homepage at `/` and an unchanged copy of the game at `/play/`. The homepage reuses actual game map images and the existing logo. Its small `site.js` landscape picker switches seven previews without loading the simulation or a WebGL canvas. Selected state, image, region and story change together after the requested image decodes; a newer selection cancels older pending results. Keep the visible landscape descriptions useful without launching the game.

`website/art/` holds a river scene and transparent animal/plant portraits exported from the production renderer. Regenerate with `nice -n 15 node tools/capture-website-art.mjs`; the helper uses a seeded restoration fixture and an isolated browser, then closes it and removes the profile. These are game assets, not generated concept art. The homepage uses forest/moss backgrounds, warm peach controls and reduced-motion-safe CSS; it never runs a frame loop.

`node tools/website-check.mjs` builds and checks local asset links, play buttons, app manifest scope, the custom domain and byte-identical game packaging. The headless release runner discovers this check automatically. The website workflow runs it again before publishing. Simulation code and the itch.io packaging paths are unchanged.

The `Publish secondgrowth.earth` workflow publishes the assembled directory to GitHub Pages on pushes to main. Repository Settings → Pages must use **GitHub Actions** as the source and **secondgrowth.earth** as the custom domain. The generated CNAME documents the domain but Actions hosting uses the repository setting.

Porkbun DNS uses an apex ALIAS to `nature-tycoon.github.io` and a `www` CNAME to the same hostname. The ALIAS flattens to GitHub Pages' A and AAAA addresses. The original apex parking ALIAS and wildcard parking CNAME were replaced with these two records; no wildcard remains. Retain any future email and verification records. Set the custom domain on GitHub before pointing DNS at it, then enable HTTPS when its certificate is issued. GitHub documentation: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site

Browser saves belong to an origin, not a URL path. Moving from github.io to secondgrowth.earth creates a separate save store; farms cannot migrate automatically across domains. Moving the game between paths on the same domain retains its save store. Never claim old-domain saves migrated.

Preview the packaged site with `python3 -m http.server 8348 --bind 127.0.0.1 --directory dist/website` and visit http://localhost:8348/. Stop the server and close game tabs after checking. Test the packaged `/play/` path as well as the homepage because relative module, sound, thumbnail and manifest URLs must still resolve.
