# 0002 Real animal recordings over synthesis

Decided 2026-10-11 by Cole.

## Context

The synthesized elk bugle and antler clashes were rejected because they didn't sound right, even though they matched the published acoustics on paper. Synthesized animal voices have sounded wrong to Cole repeatedly.

## Decision

New animal sounds use real field recordings that are public domain, CC0 or CC BY. The game is published on itch.io, so NC (non-commercial) licences are out.

The first ones shipped this way: NPS Yellowstone elk bugles (public domain) and antler clashes cut from Wikimedia's "Red deer rut" (CC BY 2.0).

## How to add one

1. Look in NPS sound libraries, Wikimedia Commons, or Freesound filtered to CC0/CC BY.
2. Ask Cole before downloading. Give him the filename, source and size.
3. Trim, then encode as 96 kbps mono AAC (`.m4a`) in `assets/sounds/`.
4. Register it in `js/audio/sounds.js`.
5. Credit it in `assets/sounds/LICENSES.md`, Settings > Audio, and the README.
6. Run the audio asset checks (`tools/field-audio-check.mjs` and similar).
