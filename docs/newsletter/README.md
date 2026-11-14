# Monthly update notes

Once a month Cole writes the newsletter in Kit himself. This folder holds the raw material, never a finished email, and nothing is sent automatically.

## Each month

1. Run `node tools/monthly-notes.mjs` (last month) or `node tools/monthly-notes.mjs 2026-11` for a named month. Or ask an agent: "draft this month's newsletter notes". It writes `docs/newsletter/<YYYY-MM>.md`.
2. Open the file. Under "What is new in the game", keep the five to eight things a player would care about most and delete the rest. The sentences are reworded from commit subjects by a simple script, so fix wording freely (an agent can polish the whole file if you ask).
3. Fill in "Rewilding news": two or three real stories with a link and one line on why each fits the game. The tool does not search the web.
4. Pick pictures from "Pictures you could use" (paths in `website/review-media/` and `website/guide-media/`).
5. Paste into a Kit template and send it yourself.

Species names link to their field guide page (`secondgrowth.earth/guide/<species>/`); landscapes link to `secondgrowth.earth/play/?map=<id>`, because landscapes have no guide page.

The tool reads `git log main` only: it works from the checkout's local `main`, so pull first. Re-running overwrites the month's file.

## Tone

Match the website: calm, natural, specific. Say what a player can now see or do ("bears fish for salmon at the run"), not how it was built. One or two warm sentences from you at the start, plain verbs, no exclamation marks, no "huge", "epic" or "revolutionary". Credit the real world (real recordings, real animals) where it applies. Rewilding news should be hopeful but honest: say what happened and link the source.
