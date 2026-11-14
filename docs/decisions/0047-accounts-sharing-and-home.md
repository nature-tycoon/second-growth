# 0047 Accounts, sharing farms, and where the game lives

Status: decided 2026-11-13. Cole took every recommendation. Sharing by link and farm files are
built (`js/share-file.js`, `js/ui/share.js`, `/farms` in `server/`), live once the Worker is
deployed with its `FARMS` store; login is not built. Written for Cole first: plain words, the
reasoning, then the parts for whoever builds on it.

## Rules

- **No login for now.** "Free, no account, saves stay in your browser" stays true and stays on the site. Revisit only on one of the triggers in *Login* below, and if it ever comes, start with an email magic link from a hosted sign-in service, never our own passwords.
- **Share by link without login (built)**: *Share this farm* (menu) sends the share file to the Worker, which keeps it in Cloudflare KV for a year and returns `secondgrowth.earth/play/?farm=<id>`; opening that link visits a copy. The same dialog saves and opens `.sgfarm` files with no server (the only part that works until the Worker is live). Contract: `docs/backend-setup.md` Part 2. Checks: `tools/share-file-check.mjs` (every map round-trips to the same `saveChecksum`), `tools/backend-check.mjs`.
- Every farm opens through a page load (`sharedFarmAtBoot` in `main.js`; a file waits in sessionStorage), so a farm from another map gets that map's catalog. Never restore a shared farm into a live game of another map.
- A shared farm holds **no free text and nothing personal**: no farm names, notes, player names, player ids or timestamps beyond the game date. Adding any typed text to a shared farm needs moderation first and is a new decision. This is also what keeps sharing clear of COPPA.
- Opening a shared farm **never overwrites the player's own farm silently**: it opens as a visit (`game.visiting`: `Game.save` refuses, autosave and the save label say so); "Make it my farm" asks first when the player has a farm on that map and offers to save theirs as a file, because the backups rotate within minutes of play and are no safe home for it.
- A shared save is untrusted input: the game decompresses it with a size cap, then loads it only through `restoreSnapshot` (validated off to the side), exactly as a damaged local save would be rejected.
- Each share keeps a secret delete key in the sharer's browser (`second-growth-shared` in localStorage). That list is also how a later login would adopt farms shared before it existed.
- Share links always point at secondgrowth.earth, never itch.io: itch runs the game in an iframe on another address and drops the link's `?farm=`.
- **Home**: the website is the main link everywhere (socials, newsletter, press, feedback replies); itch.io stays as a storefront for its discovery; a Steam page is the real next step for reach. Check the decision with the PostHog queries in *Where the game lives* before moving anything.
- When the Worker gets farms, keep `docs/backend-setup.md` Part 2 and `tools/backend-check.mjs` in step, as for the existing endpoints.

## History

### What Cole asked (2026-11-13)

Explore login (don't build it), let players share maps they made (assumed to need login), and
whether to move players from itch.io to the website. Cole chose a design doc only.

### Today

- Saves live only in the browser (`js/saves.js`): IndexedDB, one farm per landscape, the latest
  plus two backups, falling back to localStorage. No accounts anywhere.
- The Worker (`server/`, `docs/backend-setup.md`) already does feedback email (Resend), newsletter
  signups (Kit) and ratings (D1), with per-IP rate limits, an origin list and a honeypot. The game
  makes an anonymous random player id for ratings, never derived from anything personal.
- Players arrive mostly at secondgrowth.earth/play (posthog-player-perf.md), with itch.io as the
  second door.

---

## Login

### What it would give

1. **The same farm on every device.** Start on the laptop, carry on on the phone. Today a farm is
   stuck in one browser, and clearing site data or a private window loses it.
2. **Names on shared farms**, a profile page, likes or follows: the things a public gallery needs.
3. **A safer home for saves** than the browser, which can throw data away when storage runs low
   (the game already asks for persistent storage to reduce that).

### What it would cost

- **Running accounts is a job, forever.** Password resets, "I didn't get the email", locked-out
  players, account deletion on request, export of someone's data on request, and keeping all of it
  secure. A leak of accounts is the worst thing that could happen to a one-person project.
- **GDPR (Europe) and the UK's rules**: an account is personal data. You need a privacy policy that
  says what is kept and why, a way to delete an account fully, and a processor list (the sign-in
  service, Cloudflare). Not hard on paper, but it's real paperwork and real promises.
- **COPPA (US, children under 13)**: Second Growth is an educational nature game that kids and
  classrooms will play. If a service collects personal information (an email address counts) from
  children it knows are under 13, or is aimed at children, it needs verifiable *parental* consent
  first. The practical answers are an age question before sign-up (under 13: no account), or no
  accounts at all. Schools are especially wary of games that ask kids for email addresses. (The
  UK's Age Appropriate Design Code pushes the same way.)
- **"No account" is a selling point today.** "Free in your browser, nothing to sign up for" is what
  gets a teacher or a curious visitor to press Play. A sign-in box at the start costs players; even
  an optional one adds a decision to the first minute.
- **itch.io's iframe** runs the game on another address, where browsers block the cookies a login
  needs (third-party cookies). Login would work on the website only.
- Money: small. Hosted sign-in services are free at this size (Clerk and Supabase Auth both have
  free tiers well above our players); Sign in with Apple needs Apple's $99 a year developer account.

### Options

| Option | For the player | For Cole | Fit |
|---|---|---|---|
| **None** (today) | Nothing to sign up for. Farm stays in one browser. | Nothing to run. | Best now. |
| **Email magic link** via a hosted service (Clerk, Supabase Auth, or similar) | Type an email, click the link in it. No password to forget. | The service sends the email, stores accounts, handles deletion; we keep only an account id. Still the GDPR/COPPA work above. | The one to pick if login comes. |
| **Sign in with Google / Apple** | One tap, no email round trip. | Same service can offer it. Apple costs $99/yr; Google is free. Kids' school Google accounts often block third-party sign-in. | A second button next to the email link, later. |
| Our own passwords | Familiar. | We'd store password hashes and build resets. Too much risk for one person. | No. |

### When it would be worth it

Build login only when one of these is true:

1. **Players keep asking for cross-device saves** in feedback (say, more than a handful a month
   after the share link below exists, since the share link already moves a farm between devices).
2. **A public gallery with names** is wanted (browse other people's farms, credit the maker), and
   sharing by link has shown people actually share.
3. **Not for Steam**: a Steam version gets accounts and Steam Cloud saves from Steam itself, with
   none of the work above. If Steam is coming, wait for it.

Until then, two cheaper things cover most of what login would give:

- The **share link** below doubles as a "move my farm to my phone" link: share, open it on the other
  device, "Make it mine".
- An **Export / Import farm file** button (download a `.sgfarm` file, open it elsewhere) needs no
  server at all and is a good backup habit. It reuses the same encoding as sharing.

**Recommendation:** no login now. Build sharing by link first; revisit login against the triggers
above in six months, or when a Steam decision is made.

---

## Sharing farms without login

Sharing doesn't need accounts. The link itself is the key, like a Google Docs "anyone with the link"
link. Cole's assumption that it needs login is the usual one, and a fine thing to drop.

### What a save holds (privacy)

`Game.saveData()` (js/game.js): the landscape arrays (terrain, water, plants, growth, features),
structures, wildlife, money, the game date, goals done, the farm's history graph, the ledger,
weather, events, visitor numbers, story progress (`flags`), the difficulty and mode, and the run
seeds. Checked 2026-11-13: **no names, no typed text, no player id, no device or location data.**
The only timestamp (`savedAt`) is added by the save store, not by `saveData`, and the share format
leaves it out. So a shared farm says nothing about who made it, which is what lets sharing stay out
of GDPR and COPPA trouble. The Worker sees the sharer's IP address for rate limiting only and
doesn't store it with the farm.

### How big a shared farm is (measured)

Measured headless on 2026-11-13 with `Game.saveData()` on all seven maps, at the start and after
15 game years left to grow (run seed 7). "Raw" is the save's JSON part plus its binary arrays;
"gzip" is that compressed, as the browser's built-in `CompressionStream('gzip')` would send it.

| Map | Start, raw | Start, gzip | 15 years, raw | 15 years, gzip |
|---|---|---|---|---|
| Hollis (pnw) | 733 KB | 169 KB | 1.8 MB | 333 KB |
| Amazon | 689 KB | 185 KB | 1.8 MB | 267 KB |
| Serengeti | 692 KB | 180 KB | 2.0 MB | 485 KB |
| Atlanta (smaller map) | 291 KB | 89 KB | 861 KB | 158 KB |
| Chinandega | 700 KB | 178 KB | 1.9 MB | 474 KB |
| Reef | 693 KB | 163 KB | 1.2 MB | 230 KB |
| Sumatra | 703 KB | 199 KB | 2.1 MB | 412 KB |

The landscape arrays are 0.7–1.5 MB of the raw size; wildlife (each animal) is most of the rest and
grows with the farm (Sumatra's wildlife is 500 KB of JSON at 15 years). A well-restored farm played
for decades could be roughly double. So: **plan for about 150–500 KB per farm, cap uploads at
2 MB compressed and 12 MB uncompressed.**

### Where it's stored: Cloudflare KV (start), R2 (if it fills)

- **KV** (key-value store) needs no payment card, keeps each farm with a built-in expiry (no
  clean-up job), allows values up to 25 MB, and is free up to 1 GB stored, 1,000 writes and
  100,000 reads a day. At ~300 KB a farm, 1 GB holds about 3,000 shared farms at once; with a
  one-year expiry that's plenty until sharing is popular.
- **R2** (file storage) is free up to 10 GB (~30,000 farms) but asks for a payment card on the
  Cloudflare account even on the free tier. Move to it when KV passes ~70% full; the endpoint
  contract doesn't change.
- D1 (already used for ratings) is not a good fit for 300 KB blobs.

### Abuse and limits

There's no typed text in a farm, so the main risks are storage spam, broken or hostile files, and
someone drawing something rude with fences or paths.

- **Size**: over 2 MB compressed → `413 too_large`. The game also stops decompressing past 12 MB.
- **Rate limits**: 10 shares an hour per IP; a global cap of 500 shares a day that switches sharing
  off with `503 sharing_paused` (protects the free tier from a script). Opening links is not
  limited beyond Cloudflare's own protection, and responses are cached.
- **Checks the Worker can do**: gzip header present, map id one of the seven, size within limits,
  origin allowed (the same list as feedback). It can't run the game, so it can't check the farm
  itself; the game does that on open (`restoreSnapshot` validates off to the side and rejects a
  bad save without touching anything).
- **Report**: a small "Report this farm" link in the visit banner posts to the Worker, which emails
  Cole the farm id through Resend (same as feedback). Cole removes it with one `wrangler kv` command
  (to go in backend-setup.md). Low traffic expected; no automatic hiding in v1.
- **Expiry**: one year after sharing (KV's expiry). The share dialog says so. A player who wants it
  longer can re-share.
- **Removal by the sharer**: each share returns a secret delete key that only the sharer's browser
  keeps; "Stop sharing" in a small "Farms you've shared" list sends it.
- **Ids**: 10 random characters from a 32-letter alphabet without look-alikes (no 0/O, 1/l/I), about
  50 bits: unguessable, so farms are unlisted (only people with the link see them). Short enough to
  read out to a classmate.

### Endpoint contract (sketch, for docs/backend-setup.md Part 2)

Same origins, JSON error shape and error codes as the existing endpoints, plus `sharing_paused` and
`gone`.

`POST /farms?map=<map id>&v=<save version>&release=<release>`
- Body: the gzip-compressed share file (below), `Content-Type: application/octet-stream`, at most
  2 MB. Honeypot not needed (no form); the origin and rate limits do that job.
- `201 {"ok":true,"id":"k3j9x0qz7a","url":"https://secondgrowth.earth/play/?farm=k3j9x0qz7a","deleteKey":"<32 random chars>","expires":"2027-11-13"}`
- Errors: `400 invalid_map`, `400 invalid_farm` (not gzip), `403 origin_not_allowed`,
  `413 too_large`, `429 rate_limited`, `503 sharing_paused`, `500 misconfigured` (no KV bound).
- Stored as KV key `farm:<id>`, value = the body as sent, metadata `{map, v, release, size, created,
  delHash}` where `delHash` is a SHA-256 of the delete key (the key itself is never stored).

`GET /farms/<id>`
- `200` with the gzip bytes, `Content-Type: application/octet-stream`, headers `X-Farm-Map`,
  `X-Farm-Version`, `Cache-Control: public, max-age=86400, immutable`.
- `404 not_found` (never existed, expired, or removed). Open to every origin, like `/ratings`.

`DELETE /farms/<id>` with header `X-Delete-Key: <deleteKey>`
- `200 {"ok":true}`; `403 wrong_key`; `404 not_found`.

`POST /farms/<id>/report` with `{"reason":"rude drawing"}` (optional, cut at 200)
- `200 {"ok":true}`; emails Cole the id and reason; same 5-a-minute IP limit as feedback.

### The share file

One gzip stream of: a 4-byte tag `SGF1`, the length of the JSON part, the JSON part (`saveData()`
without `world.arrays`, without `savedAt`), then each landscape array's raw bytes in the order the
JSON lists them. This is what was measured above. It avoids base64 (which adds a third to the size
before compression) and reuses `compactSave`'s array layout, so the loader rebuilds exactly the
object `restoreSnapshot` already accepts. The same file, downloaded, is the `.sgfarm` export.

### Game-side flow

1. **Share**: a "Share this farm" button in the menu (and on the photo-mode postcard and the
   Ecosystem Report, where people already feel proud). It finishes the day, encodes and compresses
   the farm, posts it, and shows the link with Copy and, on phones, the system share sheet. The
   dialog says: "Anyone with this link can open a copy. Your farm stays yours. The link lasts a
   year." The share's `{id, deleteKey, map, day}` is added to `second-growth-shared` in
   localStorage. Without a backend address (`js/backend.js` empty), the button offers the
   `.sgfarm` download instead.
2. **Open**: `main.js` reads `?farm=` next to the existing `?map=`. It fetches the farm, decompresses
   it with the cap, rebuilds the save and loads it through `restoreSnapshot` into the game with
   **autosave off** and a banner: "You're visiting a shared Serengeti farm, year 12. Nothing you
   change here is saved." Buttons: **Make it my Serengeti farm** (asks first: "This replaces your
   own Serengeti farm"; if they have none, no question), **Back to my farm**, and **Report**.
   A bad or missing farm says so plainly and offers the map's start screen.
3. **Analytics**: `farm_shared` (map, game year, size), `farm_opened` (map, ok or the reason it
   failed), `farm_adopted`. No ids of farms in PostHog.
4. **Checks**: `tools/backend-check.mjs` grows the farm endpoints (KV mocked); a headless check
   round-trips every map's save through the share file and back to an identical `saveChecksum`; a
   browser check opens a `?farm=` link against a stub and confirms the player's own farm is
   untouched until "Make it mine".

Open design point, kept small on purpose: one farm per landscape is how saves work today, so "Make
it mine" replaces. Farm slots (several farms per landscape) would be nicer and are a separate,
bigger change to `js/saves.js`; not needed for v1.

### How a later login would adopt shared farms

Each browser's `second-growth-shared` list holds `{id, deleteKey}` for the farms it shared. After
someone signs in for the first time, the game sends that list to `POST /me/farms/adopt`; the Worker
checks each key against `delHash` and records the account as the owner. Anonymous shares keep
working; nothing has to be migrated, and farms shared from another browser can be adopted from
that browser later. The same list is where a future "my shared farms" page reads from.

### Size of the work

- **Worker** (one session, Opus): four routes, KV binding, the global daily cap, report email,
  backend-check additions, Part 1 steps for Cole (create a KV namespace: one `wrangler` command and
  a line in `wrangler.toml`; about 10 minutes).
- **Game** (one to two sessions): share file encode/decode with the round-trip check, share dialog
  and shared list, `?farm=` visit mode with the banner, export/import file, browser check at phone
  landscape size, Spanish strings.
- About three sessions in all, after the Worker from the 2026-11 batch is live. Free to run at
  today's scale.

---

## Where the game lives: itch.io or the website

### What each gives

**itch.io**
- Discovery: itch's browse pages, tags (simulation, nature, educational), "new and popular", jams
  and collections other people make. People find games there who'd never search for one.
- Follows and devlogs: itch followers get devlog posts in their feed; ratings and comments.
- Trust for some players: a known site, and the place many indie players keep their library.
- Costs: the game runs in an iframe on `html-classic.itch.zone`, so links like `?map=` and the
  coming `?farm=` don't reach it, saves are kept for that address separately from the website's,
  sign-in cookies would be blocked, and the analytics and newsletter are one step removed.

**secondgrowth.earth**
- Control: every link and parameter works, one save store, the newsletter signup, feedback and
  ratings right next to the game, and the field guide pages bringing search traffic straight into
  play.
- Analytics: one address, clean referrers, the first seconds of a visit measurable.
- It's yours: no platform changes, and the address in every email and press piece stays the same.
- Costs: no built-in audience; people only come from search, links and the newsletter.

### What PostHog can tell (queries for Cole)

PostHog isn't connected to this session, so these are written to paste into PostHog's **SQL**
editor (project 630638, "Default project"). `$host` is the page's address: `secondgrowth.earth`,
`html-classic.itch.zone` (itch), or `nature-tycoon.github.io` (the old link).

1. **Where players play** (players and sessions by door, last 60 days):
   ```sql
   SELECT properties.$host AS door, count(DISTINCT distinct_id) AS players, count(DISTINCT properties.$session_id) AS sessions
   FROM events WHERE event = 'game_start' AND timestamp > now() - INTERVAL 60 DAY
   GROUP BY door ORDER BY players DESC
   ```
2. **How players get to each door** (referring site of the first page view, 60 days):
   ```sql
   SELECT properties.$host AS door, properties.$referring_domain AS came_from, count(DISTINCT distinct_id) AS players
   FROM events WHERE event = '$pageview' AND timestamp > now() - INTERVAL 60 DAY
   GROUP BY door, came_from ORDER BY players DESC LIMIT 40
   ```
3. **Do they stay** (median active minutes per player, and share past 10 minutes, by door):
   ```sql
   SELECT door, count() AS players, quantile(0.5)(mins) AS median_minutes, countIf(mins >= 10) / count() AS share_past_10
   FROM (SELECT distinct_id, any(properties.$host) AS door, max(toFloat(properties.active_minutes)) AS mins
         FROM events WHERE event = 'game_left' AND timestamp > now() - INTERVAL 60 DAY GROUP BY distinct_id)
   GROUP BY door
   ```
4. **Do they come back** (players seen on two or more days, by door):
   ```sql
   SELECT door, count() AS players, countIf(days >= 2) / count() AS returned
   FROM (SELECT distinct_id, any(properties.$host) AS door, count(DISTINCT toDate(timestamp)) AS days
         FROM events WHERE event = 'game_start' AND timestamp > now() - INTERVAL 90 DAY GROUP BY distinct_id)
   GROUP BY door
   ```
5. **Visitors who start a game** (page view to `game_start`, by door and phone or not):
   ```sql
   SELECT properties.$host AS door, properties.$device_type AS device,
          count(DISTINCT if(event = '$pageview', distinct_id, NULL)) AS visitors,
          count(DISTINCT if(event = 'game_start', distinct_id, NULL)) AS started
   FROM events WHERE event IN ('$pageview', 'game_start') AND timestamp > now() - INTERVAL 60 DAY
   GROUP BY door, device ORDER BY visitors DESC
   ```
6. **Newsletter by door** (once the signup prompt is live):
   ```sql
   SELECT properties.$host AS door, countIf(event = 'newsletter_shown') AS shown, countIf(event = 'newsletter_subscribed') AS subscribed
   FROM events WHERE event IN ('newsletter_shown', 'newsletter_subscribed') AND timestamp > now() - INTERVAL 60 DAY
   GROUP BY door
   ```

The website's own pages (homepage, field guide) aren't tracked in PostHog, so query 2's
`secondgrowth.earth` rows include the click from the homepage into `/play`. itch.io's own dashboard
(Analytics on the game's page) shows views, plays, downloads and referrers on itch's side; compare
its "views" with query 1's itch players. What would change the recommendation: if itch brings most
*new* players from its own browse pages (itch's referrer list, and query 2 showing itch.io as the
referrer on `html-classic.itch.zone`), itch is earning its place as a storefront; if almost all
itch players arrive from links Cole posted himself, those links should point to the website instead.

### Recommendation

- **Keep itch.io as a storefront**, not the home. It costs nothing to keep, its browse pages find
  players the website can't, and some players prefer it. Keep the build up to date (the deploy
  workflow already does).
- **Make the website the main link** everywhere Cole controls: Reddit posts, socials, the
  newsletter, press, email signatures, replies to feedback, the itch page's own description.
  Share links, the field guide and newsletter all work best there.
- **Steam later is the real step** for reach: wishlists, the discovery queue, reviews, and
  accounts and cloud saves for free. It needs a desktop wrapper (Electron or Tauri), a $100 fee,
  a store page with capsule art (the key-art prompts are a start) and a few weeks of work. Worth a
  decision record of its own once the website and newsletter have a following to announce it to.

### Built (2026-11-13, after Cole said "do the recommended")

- Worker: `POST /farms`, `GET`/`DELETE /farms/<id>`, `POST /farms/<id>/report` (`server/src/worker.js`), `FARMS` KV namespace and `SHARE_BASE` in `wrangler.toml`, Part 1 step 5b and Part 2 in `docs/backend-setup.md`. Differences from the sketch above: the share rate limit is the existing 5 a minute per IP (Cloudflare's limiter only counts per 10 or 60 seconds), and the daily cap is 400, not 500, because each share is two KV writes (the farm and the day's count) under the free 1,000.
- Game: `js/share-file.js` (the SGF1 format), `js/ui/share.js` (dialog, list of this browser's shares with Stop sharing, visit card with Make it my farm / Back to my farm / Report, file export and import), `?farm=` in `main.js`, `Game.save` refusing while visiting, Spanish strings, a line on the privacy page.
- Checked: `share-file-check` on all seven maps (86–222 KB a year in); `backend-check`; in the browser at 844×390 against a local stand-in for the Worker: share → link, open the link (same map and Sumatra from an Atlanta session), nothing saved after 30 s of visiting, Make it my farm with and without a farm of one's own, save own farm as a file first, Report (email sent), Stop sharing (link then 404), opening a farm file, and a missing farm's message.
- Not yet: no browser check script for it (the manual run above); not tried against the real Worker and KV, which needs Cole's deploy (step 5b).

### Small steps (in order, each an hour or less)

1. Run PostHog queries 1–3 and itch's analytics page; note the split here under History.
2. On the itch page: put "Play the newest version at secondgrowth.earth" and the newsletter link in
   the description, and link the field guide. Keep the embedded game.
3. Post devlogs on itch from the monthly notes (`tools/monthly-notes.mjs`), each ending with the
   website link: itch followers get them in their feed.
4. Change Cole's social and Reddit profile links to secondgrowth.earth.
5. Make sure the in-game share link (when built) and the newsletter always point to the website.
6. Check itch's tags and "educational" classification so its browse pages show the game.
