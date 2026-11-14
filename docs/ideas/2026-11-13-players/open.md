# Open questions and new ideas: players batch (2026-11-13)

All six sessions landed on `claude/ideas-players` (S0 1465bcc, S1 4d1ea0e, S2 f43d913, S3 998d1b1, S4 cf59eda, S5 487764d). Nothing deployed or pushed.

## To switch it on (Cole, one time)
- Follow `docs/backend-setup.md` (Cloudflare, Resend, Kit accounts; Resend DNS at Porkbun; D1; deploy; curl tests). Kit's API was written from memory: the subscribe curl test is its first real check.
- Then set the address in one commit: `BACKEND_URL` in `js/backend.js` and `website/site.js`, and `connect-src` in the game's `index.html` and `website/index.html`. Until then the game and site behave as before, plus email fallbacks.

## Open questions (recommended answer first)
### Backend
- Address: workers.dev now; api.secondgrowth.earth only if DNS ever moves to Cloudflare. (S1)
- Newsletter opt-in: single opt-in now, Kit's confirmation email if spam signups appear. (S1)
- Only in-game ratings count in the average; website ratings still email Cole. (S1)
- Website shows the average from 20 ratings (S1's contract said 10; S3 used 20). Keep 20. (S1, S3)
### Game
- No newsletter card while a campaign chapter is active; the menu entry covers campaign players. Keep. (S2)
- "First play" = no saved settings on the device; rare repeat shows accepted. (S2)
### Website
- Quote only players who agreed by email. (S3)
- Form says "Cole reads every message": keep if true, else "I read". (S3)
### Newsletter
- Keep every item in the monthly notes for now; Cole prunes. (S4)
- Landscapes link to `play/?map=`. Yes. (S4)
- A monthly reminder on the 1st (calendar or scheduled task). Yes. (S4)
- Keep `docs/newsletter/2026-10.md`; regenerate 2026-11 on 1 December. (S4)
- Add "13 or older, or ask a parent" to signups and a short privacy page saying what Kit holds. Yes, before the list grows. (S5)
### Sharing, login, itch (0047)
- Build share-by-link next, once the Worker is live: two sessions (Worker, then game). (S5)
- Store shared farms in KV now, R2 if it fills. (S5)
- Links last a year; re-sharing renews. (S5)
- "Make it mine" replaces your farm on that landscape, with a warning. (S5)
- Add Export/Import farm file alongside sharing. (S5)
- Run 0047's PostHog queries and itch analytics before changing any links. (S5)
- Login: not now; revisit in ~6 months or with Steam. (S5)

## New ideas (nature check: none touch wildlife or ecology)
- Ask for a rating at the same natural pause as the newsletter card: one prompt, not two. (S2)
- Subscribe card on the end-of-campaign screen. (S2)
- Feedback form on field guide pages ("this species looks wrong"), tagged with the species. (S3)
- Ratings per landscape once there are enough. (S1)
- `Players:` line in commit bodies for player-visible changes, so monthly notes read better; an agent pass to turn notes into a first Kit draft (never sent). (S4)
- Share links double as "move my farm to my phone"; teachers can share a starting farm with a class; hand-picked player farms on the homepage. (S5)
- itch.io may also serve from `html.itch.zone`: add that origin if itch feedback gets 403. (S1)
- Compact wildlife encoding would shrink saves and shares (up to 500 KB of wildlife JSON). (S5)
