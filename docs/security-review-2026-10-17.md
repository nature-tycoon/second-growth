# Website security review — October 17, 2026

Reviewed the live `https://secondgrowth.earth/`, `/play/`, and `/visuals.html`, the GitHub Pages redirect, publishable files in `dist/website`, website/game input paths, analytics, and Pages/itch.io workflows. Local unpublished UI revisions were included in source inspection. This was a source and passive configuration review, not a full penetration test or a guarantee that vulnerabilities are absent. No production settings, application code, or deployments were changed.

## Findings, in priority order

### 1. Analytics opt-out still loads third-party executable code — medium, confirmed

Remediation status: fixed after this review and approved for publication on October 17, 2026. Cold opt-out and browser Do Not Track / Global Privacy Control prevent SDK insertion. Enabling sharing lazily initializes once; later opt-out calls the SDK opt-out API and gates application capture, exit events, context registration, and the SDK `before_send` callback. Explicitly submitted feedback remains available and is unlinked from the SDK identity when sharing is disabled. Enabling sharing refreshes current game context, including when restoring default settings.

`node tools/analytics-privacy-check.mjs` exercises the production ES modules with inert browser/network APIs and verifies the saved preference, lazy initialization, repeated initialization, queued events during SDK loading, opt-out after SDK replacement, browser privacy signals, local testing, and feedback. No test analytics is transmitted. `node tools/website-check.mjs` validates packaging. An SDK already executed cannot be unloaded by toggling a setting; the cold-load fix prevents it from executing on subsequent opted-out visits. Already transmitted or in-flight requests cannot be recalled.

`js/analytics.js:40–45` loads and initializes PostHog before consulting `settings.analytics`. A returning player who has turned off play-data sharing still causes the remote SDK to be inserted into the document; the opt-out call is queued afterward. This exposes that visit to the SDK delivery host and unnecessarily gives third-party code the page's privileges, including access to same-origin browser storage. Automatic pageview capture is enabled during initialization, but this review did **not** establish that a pageview is transmitted after opt-out.

Evidence: the live analytics file is byte-identical to the reviewed source. Executing that file with a minimal DOM in an isolated Node VM injected `https://us-assets.i.posthog.com/static/array.js` for both `analytics: false` and `analytics: true`. With the false preference, the queue contained `register` followed by `opt_out_capturing`. No analytics requests were sent by the reproduction.

Recommended fix: check the saved preference before loading the SDK; load it lazily when a player enables sharing. Preserve opt-out behavior for an SDK already loaded during the visit, and preserve explicitly submitted feedback separately. Verify cold-load opt-out, opt-in after load, later opt-out, and persisted settings. Disabling sharing cannot revoke the privileges of a script already executed in that document.

### 2. Deployment executes an unverified moving binary — medium, confirmed configuration risk

`.github/workflows/itch.yml:29–39` downloads Butler from a `LATEST` URL, unzips and executes it without a pinned release or digest, then runs the same executable with `BUTLER_API_KEY` in its environment. A compromised upstream download could publish modified game files or steal the itch.io publishing credential. There is no evidence that this has happened.

Recommended fix: pin an audited release and verify an expected digest stored in the repository before executing it. Resolve GitHub Actions references to reviewed full commit SHAs as additional supply-chain hardening; Pages and release workflows currently use version tags. GitHub documents why [immutable action pinning matters](https://docs.github.com/en/actions/reference/security/secure-use).

### 3. Live pages have no CSP or framing restrictions — lower-priority hardening gap, confirmed

Remediation status: document-level CSP and an explicit referrer policy are implemented in the approved release for the homepage, gallery and game; see `docs/browser-protections.md`. The policies restrict script and network origins, deny inline JavaScript handlers/eval, and explicitly hash the two existing game inline blocks. Response-header protections, including restrictions on other sites embedding our pages, remain open because the current static deployment does not configure response headers. No unsupported meta-header substitutes are used.

Successful HTTPS responses for `/`, `/play/`, and `/visuals.html` lacked `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and `Strict-Transport-Security`. The downloaded homepage and game HTML also have no CSP meta policy. A separate CSP on GitHub's **404** responses does not protect these successful pages.

This does not establish an exploitable XSS issue. It means an injection or third-party compromise has fewer browser restrictions, and the pages lack an explicit defense against unwanted cross-origin framing. The game loads an unversioned remote analytics script, making its trust boundary relevant.

Recommended fix: define separate policies for the static website and game, allow only required asset/network origins, and add appropriate response headers using hosting/edge configuration that can emit them. Preserve deliberate game embedding where required. A tested meta CSP can cover some restrictions on static hosting, but **cannot** enforce `frame-ancestors`; that directive requires an HTTP header. See [MDN's directive reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors). Account for the existing import map, inline loading-screen script, generated style attributes, Google Fonts, and optional analytics before enforcing CSP.

## Checks that passed

- HTTP redirects to HTTPS. macOS curl validates the live TLS connection. GitHub's Pages API reports `https_enforced: true`, the expected custom domain, and an approved certificate expiring January 14, 2027. Python's local CA bundle failed validation; that local tool failure was not treated as a site certificate defect.
- Public `/.git/HEAD` and `/.env` return 404. The build copies an explicit list of game paths and publishes neither repository metadata nor deployment tools.
- Pattern inspection of 298 publishable files found no private keys, GitHub tokens, AWS access-key identifiers, PostHog personal tokens, or live Stripe secret keys. This is a bounded pattern scan, not exhaustive secret discovery. The `phc_` PostHog ingestion key is intentionally public and is not an administrator credential.
- The homepage uses `textContent` for changing captions and takes its content from authored HTML attributes. No URL-to-HTML injection, `eval`, dynamic function construction, or cross-window message handler was found in the reviewed application JavaScript. Game HTML rendering mostly uses authored game data; no remote save-upload or user-content publishing endpoint was found.
- Anonymous public static assets use wildcard CORS. With no credentialed endpoint found, that header alone is not a data-access vulnerability.

## Additional observations and limits

`tools/serve.py:13` binds to all network interfaces, and a development server currently listens on `*:8347`; the website review server on `8348` is loopback-only. Prefer `127.0.0.1` for local development unless LAN access is intentional. No servers were stopped or reconfigured, and LAN/internet reachability was not tested.

The in-game privacy description mentioned session recordings even though the SDK configuration disables them. The approved remediation corrects this description and its Spanish translation.

Registrar security, domain/account MFA, branch/environment approval protections, certificate renewal behavior, upstream dependency advisories, and the externally hosted itch.io page were not comprehensively audited. No critical issue was confirmed within the reviewed scope. Finding 2 and the response-header portion of finding 3 remain open. Finding 1 and the document-policy portion of finding 3 have verified remediations in the approved release.
