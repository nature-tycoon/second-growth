# Ideas batch: players (2026-11-13)

Branch: `claude/ideas-players` (from main e23b833). Sessions run one at a time in this checkout.

## Ideas, as Cole sent them
1. Beach counts as bare ground and is lost for good to Fill & grade.
2. Feedback on the website and in the game should email Cole, not go to GitHub or PostHog.
3. Newsletter signup on the website, and a subtle in-game prompt after a while, first play only. Monthly update with new features and rewilding news.
4. Explore login (don't build).
5. Share maps players made (probably needs login).
6. Ratings of the game on the website.
7. Move away from itch.io, play on the website instead?

## Nature check / changes from the request
- No wildlife or ecology here; 0001 not affected. Beach fix keeps real beaches as they are (a crew can't grade a dune away by accident).
- 2: the in-game form already sends to PostHog (GitHub is only a fallback link); ad blockers drop some. A Worker on Cole's domain emails him instead.
- 5: sharing can work by short link without login; the design doc weighs that first.
- 7: answered in chat (keep itch for discovery, make the website the main link); goes into the S5 doc, nothing built.

## Cole's answers
- Backend: Cloudflare Worker + Resend.
- Newsletter: Cole writes rich, marketing-style emails himself. Assumption: Kit (free to 10k, visual editor and templates); the Worker adds signups to Kit by API. The monthly update is a notes draft for Cole, never sent automatically.
- Ratings: the average of the in-game face ratings plus quotes Cole picks.
- Login and sharing: design doc only.

## Assumptions
- Cole creates the Cloudflare, Resend and Kit accounts and secrets; sessions write code and a step-by-step setup doc, and the forms fall back gracefully until the Worker is live.
- Feedback goes to info@secondgrowth.earth.

## Sessions
- [x] S0 (here): Fill & grade leaves natural gravel alone — 1465bcc
- [x] S1 Opus: Worker backend (`server/`): feedback email, Kit signup, ratings store and average, setup doc — 4d1ea0e
- [x] S2 sonnet: Game: feedback form to Worker, email fallback, first-play newsletter prompt — f43d913
- [x] S3 sonnet: Website: feedback form, newsletter signup, ratings block, FAQ text — 998d1b1
- [x] S4 sonnet: Monthly update notes tool (released features from git log + rewilding news prompts) — cf59eda
- [x] S5 Opus: Decision record: login, map sharing without login, itch vs website — 487764d
