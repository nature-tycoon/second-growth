# Batch 2026-11-22 creeks-fps: open questions and new ideas

All 9 sessions landed. Sessions 1–8 are on `claude/ideas-creeks-fps`; session 9 is on
`claude/ideas-creeks-fps-s9-4515f5` (e55e49a), not yet merged in. Nothing pushed.

## Already answered by Cole (2026-11-23)

- Fast hint for a slow chosen Sharp: once ever (keep).
- Sharp at 1.75 pixels a point on 2x screens: wait for two weeks of PostHog numbers.
- Intel-laptop tester run: not now. If PostHog shows weak Intel laptops still at 20–30 on Fast after
  session 7's step-up rules ship, ask him for a two-link test (needs a hidden no-antialiasing switch,
  small, next batch).
- Antialiasing off and fewer shadow redraws (s7 Q4–5): measured no gain on the Mac; not shipped.
- Step down at 26 (s7 Q6, s8 item 5): after two weeks of the new telemetry.
- Session 9 merged into the batch branch (0ac85de).
- Floods spread along creeks above a culvert too (open Q1): yes, next batch.
- PNW's steep run past the fence (open Q2): keep.
- Phones and Sharp (open Q9): computers only count toward Sharp; phones judged by holding 30 on Fast.
- The rest below: going with the recommended answer unless Cole says otherwise.

## Open, by area (recommended answer first)

### Creeks and terrain
1. Flood map spreads along creeks above a culvert too, not only fish-connected creeks (s6). **Yes**, as its own small change with a calibrate run.
2. PNW's creek drops in a broad steep run right past the fence (s9). **Keep** (foothill creek); else a small rocky falls.
3. Creek tool stops short of the cursor on a too-tight turn (s5). **Keep**, plus a one-time hint "Creeks bend gently: swing the stroke wider".
4. Dug creek lags the cursor ~5 tiles while dragging (s5). **Keep**; faint preview line if it feels odd.
5. Old farms keep jagged shores and square ditch corners until edited or flooded; old PNW farms don't get the creek beyond the fence (s5, s6, s9). **Leave** (old saves load unchanged).
6. Sumatra's canals stay straight with right-angle junctions (s5). **Keep** (real palm-oil canals).
7. Oxbow left as marsh, not open water; one bend per big flood at 50%, ≤8 tiles (s6). **Keep.**
8. Other maps' creek is an open gap in the north fence (s9). **Leave.**

### Frame rate
9. Phones count toward the Sharp goal? (s7). **No**: phones judged by holding 30 on Fast; only computers count toward Sharp.
10. Keep the 30 FPS cap on battery and phones (s7). **Keep.**
11. Fable needs usage credits (s7). **Not needed** for this; enable only for big cross-system designs.

### UI
12. Keystone hold is 90 real seconds after any time-lapse, not game days (s1). **Keep.**
13. Settings moved under Help in the ☰ menu; how-to bullets stay as written (s2). **Keep.**
14. Overlay legend has a × to turn it off; phone picker hides hints (s3). **Keep.**

### Drawing
15. Small catches stay real size while followed (s4). **Keep.**
16. Future held-item models show through cover the same way (s4). **Yes.**

## New ideas (nature-checked)

Creeks and water
- Beaver ponds' changing shores and pond-to-creek corners get the shore pass monthly (s5, s6). Sound: real pond edges are smooth.
- Rounded creek heads and mouths instead of square stubs (s5).
- Smooth the creek beyond the fence; carry creek sound past the fence so the first shot's creek is heard (s9).
- Chinandega's crater lake rim still steppy (s5). Next time that map's terrain is touched.
- Show a fresh flood cut: a journal line or short-lived marker; flood-risk overlay could show likely cuts (s6).
- Flood-risk overlay recolours immediately on edits (s3).

Frame rate
- One-time notice for software-rendering players on how to turn on hardware acceleration (s7). Likely the cheapest win for the slowest tenth.
- Gentle "plugging in makes it smoother" hint after a slow spell on battery (s7).
- Check Apple `gpu_frame_ms` in PostHog before the step-down change: the timer is unreliable there and may block step-ups (s8).
- Use play-profile's synced timing in its normal output on Macs (s8).
- Night-only coarser sun step if weak chips pay for shadow redraws (s8).
- Safari profile for Macs running slower than their work suggests (s7).

UI and drawing
- Send feedback and Get updates share one Contact page (s2).
- Regression check for a followed bird's meal in `lens-depth-browser-check` (s4).
