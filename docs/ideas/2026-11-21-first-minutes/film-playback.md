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

## Picture quality: the second pass (same day)

Watched again in the app's browser pane, the film still looked like it was buffering and losing
resolution, though that pane played the 720p WebM with no waits and no dropped frames. The cause was the
encode: target bitrates far too low for moving foliage (720p 0.85 Mbit/s MP4, 0.76 WebM; 1080p 1.75),
so busy shots smeared, and the VP9 WebM (what Chrome played at 720p) was much sharper on each keyframe
than on the frames before it, a pulse every 2 s.

Measured with `nice -n 15 node tools/intro-film-quality.mjs [files] [--gop=N]`: every frame decoded in
Chrome and compared on luma with the frame the encoder was given (PSNR, and SSIM on 8×8 windows); the
worst frames, each shot's minimum, and the keyframe pulse (the PSNR jump at each keyframe over the frame
before it, within a shot). Source frames are the filmed 1920×1080 JPEGs at quality 0.93 (not 0.8);
they were reused, not re-filmed, so the film's content is unchanged.

| File | Size | PSNR mean / worst (dB) | SSIM mean / worst | Keyframe pulse median / max (dB) | Forest overviews (rise30, start) PSNR / SSIM | Stalk PSNR / SSIM |
|---|---|---|---|---|---|---|
| Before: 720p WebM (Chrome's) | 3.5 MB | 36.6 / 26.0 | 0.909 / 0.652 | **2.28 / 8.23** | 26.0 / 0.65, 28.2 / 0.76 | 32.9 / 0.88 |
| Before: 720p MP4 | 3.8 MB | 37.1 / 25.7 | 0.917 / 0.648 | 1.02 / 1.54 | 25.7 / 0.65, 28.7 / 0.73 | 34.0 / 0.92 |
| Before: 1080p MP4 | 7.5 MB | 37.4 / 25.8 | 0.917 / 0.655 | 0.92 / 1.90 | 25.8 / 0.66, 27.8 / 0.71 | 35.4 / 0.94 |
| After: 720p MP4 | 15.5 MB | 41.5 / 37.3 | 0.973 / 0.943 | **0.08 / 0.69** | 37.3 / 0.96, 39.0 / 0.94 | 39.6 / 0.97 |
| After: 1080p MP4 | 28.0 MB | 40.5 / 35.0 | 0.966 / 0.921 | 0.10 / 0.95 | 35.0 / 0.93, 36.6 / 0.92 | 39.0 / 0.96 |

What changed:
- **Constant quality, not a bitrate**: WebCodecs' `bitrateMode: 'quantizer'`, one H.264 quantizer for
  every frame (720p 27, 1080p 29), finer on the wide forest overviews (rise −2/−1, rise30 −4/−3, start
  −6/−5). Keyframes and the frames between them now look alike (pulse ≤ 1 dB everywhere, 0.1 median).
- **A keyframe every 10 s**, not 2 (nothing but the review page seeks the film).
- **No WebM**: VP9 in quantizer mode came out 34–50 MB at 720p for similar quality, and in its
  bitrate mode it pulsed 8 dB. Every browser plays the H.264 MP4. The website's 1080p WebM was removed
  too.
- Budgets: 720p 16.5 MB, 1080p 29 MB (`film-intro.mjs`), caps 17 / 30 MB in `intro-film-check` and the
  website check.
- **The start rule judges by bytes**: the bytes now sit unevenly in time (the forest overviews, 26–31 s,
  are ~60% of the file), so `intro-film.json` records each file's KB to every second (`kbBySecond`) and
  the game checks a measured download keeps ahead of playback to the end with 25% to spare. Chromium
  reports a paused film's `buffered` as its bytes spread evenly over its length (1.45 MB of 15.5 reads
  as 3.0 s, measured), so there the buffered end is read as bytes; Safari and Firefox report film time.

Targets against the request: no keyframe pulse (met: ≤ 1 dB). Worst-frame SSIM ≥ 0.95: met in every shot
except the two wide forest overviews at the end (720p 0.94, 1080p 0.92–0.93). There, PSNR stays at 37–39 dB
(720p) and 35–37 (1080p), where H.264 blocking is no longer visible to the eye (the old encode was 26 dB
there). Even at quantizer 21 the final overview reached only 0.943 at 720p; going finer would push the
720p well past 16 MB, since the overviews are already 60% of the bytes. SSIM is strict on sub-pixel conifer needles moving with the wind.

Playback at the new sizes (`intro-playback-probe`, 1440×900):

| Condition | Film | Start / ready (s) | Waits | Dropped |
|---|---|---|---|---|
| This Mac, unthrottled | 1080p, finished | 2.2 / 1.3 | 0 | 0 / 954 |
| CPU ×4 | 1080p, finished | 3.9 / 3.0 | 0 | 0 / 954 |
| 4G | 720p (1080p judged too slow), finished | 9.5 / 7.1 | 0 | 0 / 954 |
| 4G + CPU ×4 | 1080p, finished | 10.2 / 9.0 | 0 | 0 / 954 |
| Slow 3G | not played, loading screen held | – / 130.8 | – | – |

Checks: intro-film-check, website-check, analytics-privacy, intro-browser-check, first-minutes (one
failed run that didn't reproduce; it doesn't play the film), play-analytics, intro-film-motion: pass.

More questions for Cole:

3. **The wind in the overviews.** The forest overviews are 60% of the film's bytes and its lowest
   quality, because every needle moves every frame. Filming those two shots with the wind calmer
   would let them reach SSIM 0.95 in less space. It changes the look a little. Recommended: try it on
   the next re-film and judge by eye.
4. **Download size.** The game's film went from 3.8 to 15.5 MB (720p), and the 1080p from 7.5 to 28
   MB, which only downloads where the connection carries it. Recommended: keep it. The start rule
   skips the film on links that can't carry it, and the picture was the complaint. On metered phones
   the 720p is about 4x what it was.
5. **Git size.** Each re-encode adds ~70 MB of video to the repository (game copies plus the website's
   1080p). Recommended: keep the website's 1080p only on the site build (not in git) the next time the
   film is re-made.
