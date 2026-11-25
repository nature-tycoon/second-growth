# Idea batch 2026-11-23: creeks-fps follow-ups

From [2026-11-22-creeks-fps/open.md](../2026-11-22-creeks-fps/open.md): Cole's answers plus the new
ideas the first batch noticed. Cole said "start next batch" (2026-11-23).

Branch: continues on `claude/ideas-creeks-fps` (not cut from main), because every session here builds
on the first batch's creek shape, flood cut-off and frame-rate code, none of which is on main yet. One
PR later carries both batches.

## Included

| Change | From | Area |
|---|---|---|
| Big floods spread along creeks above a culvert, not only fish-connected ones | Cole's answer | water sim |
| Shore pass for beaver ponds as they grow/shrink, and rounding pond-to-creek corners once a pond drains | s5, s6 | terrain |
| Rounded creek heads and mouths instead of square stubs | s5 | terrain |
| Smooth the creek beyond the north fence; creek sound carries past the fence | s9 | terrain, sound |
| One-time hint when the creek tool stops short ("Creeks bend gently: swing the stroke wider") | s5 Q3 | UI |
| A fresh flood cut gets a journal line and a short-lived map marker | s6 | UI |
| Flood-risk overlay recolours immediately after a ground edit | s3 | UI |
| Send feedback and Get updates share one Contact page | s2 | UI |
| Regression check: followed bird's meal shows through cover | s4 | checks |
| One-time notice for software-rendering players: how to turn on hardware acceleration | s7 | performance UI |
| Gentle "plugging in makes it smoother" hint after a slow spell on battery | s7 | performance UI |
| Check Apple `gpu_frame_ms` in PostHog; stop it blocking step-ups if unreliable | s8 | performance |
| play-profile's synced timing in its normal output on Macs | s8 | tools |

Nature check: all fit real water behaviour (floods spread wherever water runs, beaver-pond shores are
smooth, creek heads taper). No rewrites needed.

## Left out (waiting or conditional)

- Step down at 26 FPS and Sharp at 1.75 pixels a point on 2x screens: wait for two weeks of PostHog after
  session 7's rules ship (about 2026-12-07 if it ships this week).
- Intel-laptop tester test and its hidden no-antialiasing switch: only if PostHog shows weak Intel
  laptops still at 20–30 on Fast.
- Night-only coarser sun step: only if weak chips turn out to pay for shadow redraws.
- Safari profile for Macs: needs Safari driven by hand; later.
- Flood-risk overlay showing where a flood might cut a bend: speculative; revisit after players see cuts.
- Chinandega crater lake rim: next time that map's terrain is touched.

## Sessions

| S | Title | Model | Size | Status |
|---|---|---|---|---|
| 1 | UI follow-ups: creek-tool hint, flood-cut note and marker, overlay recolour, Contact page, meal check | sonnet | M | done (not checked by eye) |
| 2 | Floods spread above culverts | opus | M | done 85e1f78 |
| 3 | Creek shape polish: beaver-pond shores, creek heads, creek beyond fence and its sound | opus | M–L | done d7addd1 (fence-creek staircase left open) |
| 4 | Frame-rate follow-ups: software-render and battery notices, Apple GPU timer, synced timing | opus | M | done |

Order: cheap UI first, water sim before the shape polish that draws on it, frame rate last so its
measuring runs alone. Sessions 2 and 3 run `regression-reviewer` on plan and diff.
