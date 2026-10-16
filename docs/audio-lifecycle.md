# Audio startup and map reloads

`Music.prepare()` creates the context and media elements before the welcome click,
then wires the mixer, each music deck, and nature gains in separate browser tasks.
It is idempotent and does not play or fetch recordings. `Music.start()` unlocks
the context and both media elements on the gesture stack; an early click can
unlock them while preparation continues. Once ready, playback uses the latest
settings and land sample. Keep real-track `play()` calls on the gesture stack
when the graph is already ready, for browsers that require activation.

Map selection deliberately reloads the page to clear map-specific rendering
caches. The old AudioContext and gesture listeners do not survive that reload.
`main.js` must call `music.start()` after applying the pending map and sampling
its soundscape. Browsers that permit autoplay on the previously used origin can
resume immediately. Where autoplay is blocked, the regular pointer/key listeners
retry context and media playback; no mute toggle is needed. Device recovery also
retries the `interrupted` context state, as well as `suspended`.

The minute-long rain noise buffer is generated lazily in 16,384-sample chunks,
yielding to input and rendering between chunks. One shared promise caches the
result. Completion rechecks the current weather, mute and nature settings before
starting the loop, so an obsolete request cannot start rain after conditions
change. `makeRainBuffer()` / `Music.rainBuffer()` remain synchronous for offline
audio review; the game's startup and weather changes use `prepareRainBuffer()`.

Regression checks:

- `node tools/audio-startup-check.mjs`: task boundaries, early/repeated starts,
  settings during preparation, rain caching, denied autoplay and device recovery.
- `node tools/field-audio-check.mjs` and `node tools/rut-audio-check.mjs`: recordings,
  rain waveform and wildlife playback.
- `nice -n 15 node tools/field-audio-browser-check.mjs`: real decoding/playback,
  startup at 6x CPU slowdown, and actual UI map reloads with no further gestures.
  Uses an isolated Chrome profile, throttles game rendering and cleans up on exit.
