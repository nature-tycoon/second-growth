# Backend setup: feedback email, newsletter signup, ratings

Second Growth has one small backend: a Cloudflare Worker in [`server/`](../server/). It does four things:

- **Feedback**: the game's (and later the website's) feedback form sends to it, and it emails the note to info@secondgrowth.earth through Resend. If the player left an email address, pressing Reply in Gmail answers them.
- **Newsletter**: the signup forms send an email address to it, and it adds the person to Kit (ConvertKit) with a tag saying where they signed up (website or game). You write and send the monthly email in Kit yourself; nothing here sends newsletters.
- **Ratings**: it keeps the 1–5 face rating from each feedback note, and the website asks it for the average.
- **Shared farms**: "Share this farm" in the game sends a compressed copy of the farm; the Worker keeps it for a year and gives back a link (`secondgrowth.earth/play/?farm=…`) that opens a copy. No accounts. Design: [decision 0047](decisions/0047-accounts-sharing-and-home.md).

Everything below runs on free plans (Cloudflare Workers, D1 and KV free tier, Resend 3,000 emails a month, Kit free up to 10,000 subscribers). Part 1 is for Cole, start to finish, about 45 minutes plus waiting for DNS. Part 2 is the contract the game and website code follow.

---

## Part 1: step by step for Cole

You type commands in the Terminal app. Each one goes on its own line; press Return after it. Where it says *paste*, use what the website gave you.

### 1. Make three accounts

1. **Cloudflare**: sign up at dash.cloudflare.com (free plan). Nothing else to set up there yet.
2. **Resend**: sign up at resend.com (free plan).
3. **Kit**: sign up at kit.com (free "Newsletter" plan).

Use info@secondgrowth.earth or your Gmail for all three; either is fine.

### 2. Let Resend send email as secondgrowth.earth (Porkbun DNS)

Resend has to prove it's allowed to send mail for your domain. You add a few DNS records at Porkbun; they don't touch the website or your info@ forwarding.

1. In Resend: **Domains → Add Domain**, type `secondgrowth.earth`, region **North Virginia (us-east-1)**, then **Add**.
2. Resend now shows a table of records (usually an **MX** and a **TXT** for `send`, a **TXT** for `resend._domainkey`, and a suggested **TXT** for `_dmarc`). Keep this tab open.
3. In Porkbun: **Domain Management**, find secondgrowth.earth, click **DNS**.
4. For each row in Resend's table, add a record in Porkbun:
   - **Type**: the same (MX or TXT).
   - **Host**: only the part Resend shows in its *Name* column, without `.secondgrowth.earth` (for example `send` or `resend._domainkey`).
   - **Answer**: copy Resend's *Value* exactly (the long DKIM one too; use Resend's copy button).
   - **Priority** (MX only): the number Resend shows, usually `10`.
   - **TTL**: leave the default.
5. Don't delete or change any record that's already there (GitHub Pages and the email forwarding use them). If a `_dmarc` record already exists, skip Resend's DMARC row.
6. Back in Resend, click **Verify DNS Records**. It can take a few minutes, occasionally a few hours. Wait until the domain says **Verified**.
7. In Resend: **API Keys → Create API Key**, name `second-growth-worker`, permission **Sending access**, domain `secondgrowth.earth`. Copy the key (it starts `re_`) into a note for step 5: Resend shows it only once.

### 3. Set up Kit

1. In Kit: **Grow → Subscribers**, then **+ Add tag** (or **Create a tag**). Make two tags: `source: website` and `source: game`.
2. Click each tag. The page address ends in a number, like `…/subscribers?tag_id=1234567`. Note both numbers.
3. **Settings → Developer → API Keys (V4) → Add a new key**, name it `second-growth-worker`. Copy the key into your note. (Use a **V4** key, not the older "API Key"/"API Secret" pair.)
4. Optional but worth it: in **Settings → Advanced → Email**, set your sending address and mailing address (Kit needs them before you can send a broadcast).

### 4. Install and log in (once)

You already have Node (the game's tools use it). In Terminal:

```bash
cd ~/Desktop/"Second Growth"/server
```

```bash
npx wrangler@4 login
```

A browser window opens; click **Allow**. (`npx wrangler@4` downloads Cloudflare's tool the first time; answer `y` if it asks.)

### 5. Create the ratings database

```bash
npx wrangler@4 d1 create second-growth
```

It prints a block with `database_id = "…"`. Open `server/wrangler.toml` in any text editor and replace `PASTE-THE-ID-FROM-wrangler-d1-create` with that id (keep the quotes). While the file is open, put your two Kit tag numbers between the quotes of `KIT_TAG_WEBSITE` and `KIT_TAG_GAME`. Save. Then create the table:

```bash
npx wrangler@4 d1 execute second-growth --remote --file=schema.sql
```

### 5b. Create the store for shared farms

```bash
npx wrangler@4 kv namespace create FARMS
```

It prints a block with `id = "…"`. In `server/wrangler.toml`, replace `PASTE-THE-ID-FROM-wrangler-kv-namespace-create` with that id (keep the quotes) and save. (KV needs no payment card. It holds about 3,000 shared farms on the free plan; decision 0047 says what to do if it fills.)

### 6. Deploy, then add the two keys

```bash
npx wrangler@4 deploy
```

At the end it prints the address, like `https://second-growth-api.YOUR-NAME.workers.dev`. Write it down: that's the backend's address. Now give it the two keys (each command asks you to paste one, and nothing shows while you paste; press Return):

```bash
npx wrangler@4 secret put RESEND_API_KEY
```

```bash
npx wrangler@4 secret put KIT_API_KEY
```

Keys take effect straight away; no second deploy needed. Never put a key in `wrangler.toml` or anywhere in the repository.

### 7. Its address: keep workers.dev (recommended for now)

The `…workers.dev` address works as it is, with no DNS changes. A nicer `api.secondgrowth.earth` needs the whole domain's DNS moved from Porkbun to Cloudflare (Cloudflare copies the records, then you change the nameservers at Porkbun), which risks the website and email forwarding for an hour if a record is missed. It's worth doing one day, not now. If you do it later: add the domain in Cloudflare, check every record it imported against Porkbun's list, switch nameservers, then uncomment the `routes = …` line in `wrangler.toml` and deploy again. The game and website keep the address in one place each, so switching is a one-line change.

### 8. Test it

Replace `ADDRESS` with your workers.dev address in each command.

Feedback (you should get an email at info@secondgrowth.earth within a minute; check Gmail's spam folder the first time and mark it **Not spam**):

```bash
curl -X POST ADDRESS/feedback -H "Origin: https://secondgrowth.earth" -H "Content-Type: application/json" -d '{"rating":5,"message":"Test from the setup doc","contact":"you@example.com","map":"serengeti"}'
```

It should answer `{"ok":true}`. Newsletter (use your own address; it should appear in Kit under Subscribers with the website tag):

```bash
curl -X POST ADDRESS/subscribe -H "Origin: https://secondgrowth.earth" -H "Content-Type: application/json" -d '{"email":"YOUR-EMAIL","source":"website"}'
```

Ratings (should show your test 5):

```bash
curl ADDRESS/ratings
```

Shared farms (the answer has an `id`, a `url` and a `deleteKey`; the second command opens it again and should print `200`):

```bash
printf 'test' | gzip | curl -X POST "ADDRESS/farms?map=pnw" -H "Origin: https://secondgrowth.earth" -H "Content-Type: application/octet-stream" --data-binary @-
```

```bash
curl -s -o /dev/null -w "%{http_code}\n" ADDRESS/farms/THE-ID-IT-GAVE
```

Remove that test farm (from the `server` folder):

```bash
npx wrangler@4 kv key delete --binding=FARMS --remote "farm:THE-ID-IT-GAVE"
```

Then remove the test rating so it doesn't count:

```bash
npx wrangler@4 d1 execute second-growth --remote --command "DELETE FROM ratings"
```

If a test answers with an error, the table in Part 2 says what it means (`misconfigured` means a key is missing: repeat step 6; `send_failed` usually means the domain isn't verified in Resend yet).

### 9. Hand the address to the game and website

Tell the next agent session the workers.dev address. The game and website code keep it in one constant and fall back to their old behaviour (email link, PostHog) until it's set.

### Day to day

- **See what it's doing**: `npx wrangler@4 tail` (from the `server` folder) shows each request live. It never shows what players wrote or their addresses, only counts and statuses.
- **Change something**: after editing `server/`, run `node tools/backend-check.mjs`, then `npx wrangler@4 deploy` from `server/`.
- **Replace a key** (if one leaks): make a new one in Resend or Kit, run the `secret put` command again, then delete the old key there.
- **A reported farm**: the report email has the link to look at it and the exact command to remove it (`npx wrangler@4 kv key delete --binding=FARMS --remote "farm:<id>"`, from the `server` folder).
- **How full the farm store is**: Cloudflare dashboard → Storage & Databases → KV → FARMS. Past about 700 MB, see decision 0047 (move to R2, or shorten how long farms are kept).
- **Look at the ratings**: `npx wrangler@4 d1 execute second-growth --remote --command "SELECT rating, COUNT(*) FROM ratings GROUP BY rating"`.

---

## Part 2: the contract (for the game and website code)

**Base URL**: the workers.dev address from step 6 (later maybe `https://api.secondgrowth.earth`). Keep it in one constant per codebase. When it's empty, fall back gracefully (game: the old PostHog send and a mailto link; website: a mailto link).

**Origins allowed for POST** (CORS): `https://secondgrowth.earth`, `https://www.secondgrowth.earth`, `https://nature-tycoon.github.io`, `https://html-classic.itch.zone`, `http://localhost:8347`, `http://127.0.0.1:8347`. A POST from any other origin, or with no Origin header, gets `403`. `GET /ratings` is open to everyone (`Access-Control-Allow-Origin: *`).

**Content Security Policy**: pages with a CSP need the base URL in `connect-src` (the website's pages and the field-guide generator list it explicitly).

**Bodies**: JSON, at most 16 KB. Send `Content-Type: application/json`; `text/plain` with a JSON body is also accepted (no preflight, works with `navigator.sendBeacon`).

**Honeypot**: every form has a hidden text input named `website` (off-screen, `tabindex="-1"`, `autocomplete="off"`, `aria-hidden="true"`), sent as the `website` field. People leave it empty; when a bot fills it, the server answers `{"ok":true}` and does nothing.

**Rate limit**: 5 requests a minute per IP, separately for `/feedback`, `/subscribe`, `POST /farms` and farm reports. Over that: `429 rate_limited` with `Retry-After: 60`.

Every response is JSON with `ok: true` or `ok: false` plus `error` (one of the codes below).

### `POST /feedback`

```json
{
  "rating": 4,
  "message": "The beavers flooded my meadow and I loved it",
  "contact": "player@example.com",
  "map": "serengeti",
  "source": "game",
  "player": "p_k3j9x0qz7a",
  "website": "",
  "game_year": 12, "game_month": 4, "score": 812, "species": 31, "money": 15200, "visitors": 340,
  "game_version": "0.5", "release": "abc123"
}
```

- `rating`: integer 1–5, or `null`/missing. Either a rating or a non-empty `message` is required.
- `message`: string, trimmed, cut at 4000 characters.
- `contact`: optional string (email or Reddit name), cut at 200. When it's a valid email it becomes the email's Reply-To.
- `map`: optional map id. `source`: `"game"` (default) or `"website"`.
- `player`: optional anonymous id the client makes once and keeps (8–64 letters, digits, `_` or `-`; for example `"p_" + random`). With it, a player's later rating replaces their earlier one, so one person can't drag the average. Never derive it from anything personal.
- Any other top-level field with a short name and a number, boolean or short string value (the game's snapshot) is listed in the email under "Game details": at most 30, strings cut at 200, nested objects and arrays dropped.
- Success: `200 {"ok":true}` once the email is accepted by Resend. On any failure, keep what the player wrote on screen so they can retry or copy it.

### `POST /subscribe`

```json
{ "email": "player@example.com", "source": "game", "website": "" }
```

- `email`: required, valid-looking address (trimmed and lower-cased). `source`: `"website"` (default) or `"game"`; it picks the Kit tag.
- Success: `200 {"ok":true}`, also when they were already subscribed. Subscribers are added as confirmed (no double opt-in email); say on the form that they can unsubscribe from any email.

### `GET /ratings`

```json
{ "ok": true, "average": 4.3, "count": 57, "distribution": { "1": 1, "2": 2, "3": 5, "4": 18, "5": 31 } }
```

- Only ratings given in the game count (`source: "game"`), the latest one per `player`.
- `average` has one decimal, or is `null` when `count` is 0. Cached for 10 minutes (`Cache-Control: public, max-age=600`).
- The website shows it only once `count` is at least 20 (`MIN_RATINGS` in `website/site.js`, Cole asked for about 20), and otherwise shows nothing (no "0 ratings").

### Shared farms (decision 0047)

The share file is the game's farm (`js/share-file.js`): gzip of `SGF1`, the save's JSON part and its landscape arrays. It holds nothing personal and no typed text.

**`POST /farms?map=<map id>&v=<save version>`**: body is the share file, `Content-Type: application/octet-stream`, at most 2 MB. Allowed origins only. At most 400 shares a day in all (then `503 sharing_paused` until the next UTC day), so a script can't fill the free plan.

```json
{ "ok": true, "id": "k3j9x0qz7a", "url": "https://secondgrowth.earth/play/?farm=k3j9x0qz7a", "deleteKey": "<32 hex>", "expires": "2027-11-13" }
```

Status `201`. The game keeps `id`, `deleteKey` and the map in localStorage (`second-growth-shared`); the Worker keeps only a SHA-256 of the key. Ids are 10 characters from `23456789abcdefghjkmnpqrstuvwxyz`.

**`GET /farms/<id>`**: open to every origin. `200` with the share file as sent (`application/octet-stream`), headers `X-Farm-Map` and `X-Farm-Version` (exposed to pages), cached a day. `404 not_found` when it never existed, expired or was removed.

**`DELETE /farms/<id>`** with header `X-Delete-Key`: allowed origins only. `200 {"ok":true}`, `403 wrong_key`, `404 not_found`.

**`POST /farms/<id>/report`** with `{"reason": "…"}` (optional, cut at 200): emails Cole the id, map, reason, a link and the command to remove it. `200`, or `404 not_found`, `502 send_failed`.

### Error codes

| Status | `error` | Meaning / what the client does |
|---|---|---|
| 400 | `invalid_json` | Body isn't a JSON object. A bug in the client. |
| 400 | `invalid_rating` | `rating` isn't an integer 1–5 or null. |
| 400 | `invalid_message` | `message` isn't a string. |
| 400 | `empty` | Neither a rating nor a message. Ask for one. |
| 400 | `invalid_source` | `source` isn't `game` or `website`. |
| 400 | `invalid_email` | `/subscribe` address doesn't look valid (or Kit refused it). Ask them to check it. |
| 400 | `invalid_map` | `POST /farms` with a map id the game doesn't have. A bug in the client. |
| 400 | `invalid_farm` | The shared farm isn't a gzip file. A bug in the client. |
| 403 | `wrong_key` | `DELETE /farms/<id>` with a delete key that isn't this farm's. |
| 403 | `origin_not_allowed` | Page origin isn't in the list above. |
| 404 | `not_found` | Unknown path. |
| 405 | `method_not_allowed` | Wrong method for the path. |
| 413 | `too_large` | Body over 16 KB (over 2 MB for a shared farm). |
| 429 | `rate_limited` | Too many tries; ask them to wait a minute. |
| 500 | `misconfigured` | A key, the database or the farm store isn't set up (Part 1, steps 5–6). Offer the fallback. |
| 500 | `server_error` | Unexpected failure. Offer the fallback. |
| 502 | `send_failed` | Resend didn't take the email. Offer retry or the fallback. |
| 502 | `subscribe_failed` | Kit didn't take the signup. Offer retry. |
| 503 | `sharing_paused` | The day's shares are used up; sharing works again tomorrow (UTC). Offer the farm file instead. |

A network failure (offline, blocked) has no response at all: treat it like `server_error`.

### Privacy

The Worker never logs a message, contact or email address; logs hold only statuses and counts. Feedback is stored only as an email in Cole's inbox; the database keeps just the rating, source, map, time and the anonymous player id. Keys live in Cloudflare secrets, never in the repository.

### Code and checks

- `server/src/worker.js`: the whole Worker. `server/wrangler.toml`: its settings (the `FARMS` KV namespace, `SHARE_BASE`). `server/schema.sql`: the ratings table.
- `node tools/backend-check.mjs` runs the Worker headless with Resend, Kit, the database and KV mocked (part of the headless suite). It also fails if an error code or origin in the Worker is missing from this page, so keep the two in step.
