# Intro film: smooth playback and the title drop (2026-11-22)

Cole watched the intro locally and it seemed to buffer. Measured first, then fixed; the title drop
("Second Growth" over the rise) was added in the same pass.

## How it was measured

`nice -n 15 node tools/intro-playback-probe.mjs [fast,cpu4,4g,4g-cpu4,3g] [--size=1440x900] [--dpr=1]`:
a first visit (`?intro=1`) in headless Chrome on this Mac's own graphics chip, served by
`tools/serve.py` (byte ranges, like GitHub Pages), cache off. It records the video's
`waiting`/`stalled` events with the loading step showing at each, `getVideoPlaybackQuality()`,
gaps over 100 ms between presented frames (`requestVideoFrameCallback`), long tasks by loading step,
and the film's requests. Network presets are Chrome DevTools' Fast 4G (9 Mbit/s, 60 ms) and Slow 3G
(400 kbit/s, 400 ms). 1440×900 at 1× picks the 1080p. Game ready = the loading bar's "Ready".

## Before and after

| Condition | Before: film | start / ready (s) | waits | dropped | worst hitch | After: film | start / ready (s) | waits | dropped | worst hitch |
|---|---|---|---|---|---|---|---|---|---|---|
| This Mac, unthrottled | 1080p, finished | 1.2 / 1.1 | 0 | 0 / 954 | 0 | 1080p, finished | 1.8 / 1.0 | 0 | 0 / 954 | 0 |
| CPU ×4 | 1080p, finished | 2.4 / 2.4 | 0 | 0 / 954 | 0 | 1080p, finished | 3.1 / 2.2 | 0 | 0 / 954 | 0 |
| 4G | **never played** (dropped 4 s after ready) | – / 7.0 | – | – | – | 1080p, finished | 8.1 / 6.9 | 0 | 0 / 954 | 0 |
| 4G + CPU ×4 | **never played** | – / 8.2 | – | – | – | 1080p, finished | 9.5 / 8.1 | 0 | 0 / 954 | 0 |
| Slow 3G | 720p WebM, **5 stalls**, cut at 11 s by the watchdog | 131.8 / 130.5 | 5 | 5 / 348 | 6.6 s | not played: loading screen held, farm opens 4 s after ready | – / 130.6 | – | – | – |

Long tasks while the film played: at most two, ≤ 67 ms, before and after (the heavy steps, up to
1.2 s at CPU ×4 in "Welcoming the wild", all finish before the film starts). The film's download
never competed with the game's: the game's ~6 MB of modules load before `boot()` runs, so by the
time the film is requested only ~0.1 MB of game files are still coming.

## What was wrong

1. **The MP4s weren't interleaved** (the cause). `tools/video-mux.mjs` wrote all the video, then all
   the sound, in one `mdat`: the sound started at 92–95% of the file. A browser needs both tracks'
   first samples to start, so Chrome fetched ~95% of the film (7.1 MB of the 1080p) before its first
   frame, even with the index at the front. On localhost that's half a second; on 4G it is ~7 s, past
   the game being ready plus the 4 s grace, so the film was silently dropped. Safari, which reads by
   range requests, would have to jump back and forth 7 MB for every second (likely what Cole saw as
   buffering; not tested in Safari here). The WebM was already interleaved.
2. **The film started on whatever was buffered** (`play()` at once), so on a slow link it stuttered
   (slow 3G: 5 stalls in 11 s) before the watchdog cut it.
3. **The farm showed for a moment** between the game being ready and the film starting: the loading
   screen faded as soon as the game was ready.

The game's loading work on the main thread and GPU was not starving the film: no dropped frames in
any condition, before or after.

## What changed

- `muxMp4` interleaves a second of video with that second's sound (video-only loops keep one chunk).
  `tools/remux-mp4.mjs` re-wrapped the three existing MP4s (game 720p, game 1080p, website 1080p)
  without re-encoding: every sample checked byte for byte, +344 bytes each, `intro-film.json` hashes
  updated. The 1080p now shows its first frame 0.17 s after the request on 4G.
- `IntroFilm.whenBuffered` (js/ui/intro.js): the film starts only when it is all here, or its
  download (measured while arriving, over 1 s) outruns playback by 1.3× with 2 s in hand, or the
  browser stops fetching by its own choice (Chrome caps a paused video's prefetch at ~4 MB, and from
  a server without byte ranges, like the browser checks' own, takes only ~2 s of it; waiting longer
  gets nothing more, and that pause is not read as a slow link). A 1080p arriving slower than 1.6 film-seconds a
  second switches to the 720p (`intro_started.downsized`). The 4 s grace after the game is ready and
  the 6 s stall watchdog stay: a film that can't make it is dropped, never holding the farm.
- main.js keeps the loading screen up until the film plays or is dropped (`IntroFilm.decided`).
- Title drop: `.intro-title`, the loading screen's wordmark (Bricolage Grotesque 700, the fir "o"),
  live HTML over the video, fades in at 23.4 s as the camera starts to rise, holds through the
  dissolve to 30 years on, fades from 28.4 s, gone by 29.2 s, a second before the last shot (30.2 s)
  and the line over the farm. 90 px at 1440×900, 37.5 px at 812×375. `intro-film-check` holds the
  times to the cut's layers. Screenshots: the session notes folder, `title-1440x900.jpg`,
  `title-812x375.jpg`.

## Checks

intro-film-check (now also holds the title times), intro-browser-check, first-minutes-browser-check,
play-analytics-browser-check, intro-film-motion-browser-check, analytics-privacy-check: all pass.

## Not done / uncertain

- Safari and real phones not measured (headless Chrome only). The interleave should help Safari most.
- Lowering the 1080p bitrate wasn't needed: at 9 Mbit/s it starts in ~1.2 s and never waits.
- The website's 1080p copy got the same re-wrap; the website doesn't yet draw the title over it
  (it would need the same overlay in `website/`; the times are `TITLE_IN/OUT` in js/ui/intro.js).
- Slow 3G: the game itself takes 130 s to load there; the film is skipped rather than stuttering.

## Questions for Cole

1. **Title over the dissolve?** The brief said the title fades before the 30-years-on dissolve, but
   the rise before the dissolve is only 2.4 s, too short for a fade in, a hold and a fade out. I let
   it hold through the dissolve (23.4–29.2 s) so it reads for about 4 s, with the farm turning green
   under the words "Second Growth". Recommended: keep it. The other way, it shows fully for under a
   second.
2. **The website's 1080p film**: add the same title overlay there? Recommended: yes, when the site's
   film player is next touched (small: one positioned element timed off `currentTime`).
3. **A second 1080p at a lower bitrate?** Not needed by these numbers. Recommended: no.
