# Browser protections

Status: approved for publication on October 17, 2026. These protections cover the homepage, capture gallery, root game, and the game's copied `/play/` package. The source game remains runnable without a build step.

## Current policies

Each HTML document declares Content Security Policy immediately after its charset and before any scripts, stylesheets, or images. The homepage and gallery allow local scripts/images, Google Fonts stylesheets/font files, and Google Tag Manager (container `GTM-PF75LGQ5`, added October 25, 2026): its script from `www.googletagmanager.com`, Google Analytics beacons and images on `*.google-analytics.com`, `*.analytics.google.com` and `*.googletagmanager.com`, and its no-JavaScript frame, the only frame these pages may load. `website/gtm.js` loads the container instead of Google's inline snippet so inline scripts stay blocked, and skips it for Global Privacy Control, Do Not Track and local previews. Tag Manager is never added to the game at `/play/`, whose analytics stay opt-in. Tags added inside the container that inject inline code or call other hosts are blocked by this policy until their origins are reviewed and added. The game allows local modules, assets and save-related code, generated canvas images, local/data/blob audio, Google Fonts, and the two explicitly named US PostHog origins required for optional analytics and feedback.

All pages deny plugins, outgoing frames (except that one website frame), workers, native form submissions, base URL replacement, and inline JavaScript event handlers. Scripts cannot use `unsafe-inline` or `unsafe-eval`. The game's existing import map and loading-tip block have exact SHA-256 permissions; changed inline content must be reviewed and its matching hash updated. These hashes identify the exact allowed inline blocks; they are not nonces or protection against a compromised same-origin source file. The static homepage's generated JSON-LD is a non-executable data block.

The game permits inline **styles** because menus, inspectors, progress bars, canvases, and generated cards use style attributes and programmatic styles throughout the existing UI. This is deliberately narrower than permitting inline JavaScript. Removing that style allowance would require a separate UI refactor. The static website does not need the allowance. The creek comparison slider keeps its initial `--pos: 50%` in CSS and updates individual style properties from its trusted script, which works under this policy.

All three pages declare `strict-origin-when-cross-origin` referrer policy: ordinary cross-origin HTTPS requests share the site origin rather than the full page path/query. This makes the policy explicit; many modern browsers already use this default. It does not conceal information that application code deliberately sends, such as player-submitted feedback.

The policies constrain allowed origins, not the behavior of trusted code. Allowing PostHog's script host grants its scripts normal page privileges when the player enables analytics; CSP cannot sandbox an allowed script. The separate analytics opt-out gate prevents loading that SDK on opted-out visits.

## Hosting limitations

The GitHub Pages workflow publishes static files and currently has no configurable response-header layer. Only protections supported in HTML are claimed here. In particular:

- `frame-src 'none'` prevents our pages from loading frames. It does **not** prevent another site from embedding our pages.
- Clickjacking defenses (`frame-ancestors` and `X-Frame-Options`), HSTS, MIME sniffing protection (`X-Content-Type-Options`), and Permissions Policy still need actual HTTP response headers. Fake `http-equiv` tags do not implement them.
- HTTPS enforcement is already enabled in GitHub Pages. That redirect is separate from HSTS.
- Do not add frame-busting JavaScript, globally deny fullscreen, or broadly block legitimate game embedding to imitate a response header. A future host/proxy configuration should set appropriate route-specific framing rules and preserve the separate itch.io distribution's intentional embedding.

Supporting those response-header protections requires a hosting/edge configuration change; this pass makes no DNS, registrar, proxy, hosting-account, or live deployment changes. See [MDN's meta-header limitations](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/http-equiv) and [frame-ancestors restrictions](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors).

## Verification and maintenance

`node tools/website-security-check.mjs` verifies policy coverage, early placement, exact inline hashes and narrow script/network permissions. The Pages workflow runs it before packaging/deploying; the release runner includes it in the headless suite for the standalone game too.

`nice -n 15 node tools/website-security-browser-check.mjs` builds the exact public package and checks Chromium enforcement, static page interactions, game startup, generated UI/thumbnail styles, save/restore, image export, local audio, fullscreen, analytics opt-out and the allowed optional SDK origin. The check blocks all PostHog network traffic and uses a disposable browser profile. Intentional blocked-script/network/frame probes are expected to produce CSP console messages near the end of the test.

The isolated check server serves files directly, so the game test uses `/play/index.html`; production continues to use `/play/`. Scroll lazy gallery/map images into view before awaiting `decode()`. Wait for the loading-tip script to fill its text rather than only waiting for the preceding HTML element to exist. Those test-harness details are distinct from CSP failures.

`node tools/analytics-privacy-check.mjs` covers analytics consent behavior without network traffic. `node tools/website-check.mjs` ensures the packaged game still matches source and public assets/discovery data remain valid.

When an approved inline script changes, compute SHA-256 over the script's exact text (including leading/trailing newlines) and replace only its corresponding `'sha256-…'` permission in the source `index.html`. Do not solve a hash mismatch by adding `unsafe-inline`. When changing external providers, inspect their required origins and add only the necessary permissions; avoid wildcard scheme/host allowlists.
