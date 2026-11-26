# Aesthetics batch, 2026-11-26

The rest of the [aesthetics plan](../../aesthetics-plan-2026-11-26.md) (its session 1, the horizon, is
built: decision 0058). Cole: "Do all the sessions first", then push everything as one PR.

Branch: `claude/coyote-perf-horizon` (worktree `.claude/worktrees/combined-ship`), already holding the
coyote fix (`early-wildlife-check`), the perf-deep-dive work and the horizon. Sessions run one at a
time here, so each builds on the last; no pushing until the batch is done.

Assumptions (no blocking questions; taste picks are logged as open questions for Cole):

- Every change stays inside the GPU budget: colours, constants, vertex/instance colours and the
  shared shader patch only; no new shader programs (`first-frame-profile`), geometry within
  `perf-guard-check`.
- Look choices are made conservatively and shown as before/after pictures in each session's notes,
  so Cole can pick or roll back.
- The intro film is re-filmed last, once the look is final (its last frame must still match the
  start view: `intro-film-check`).

| # | Session | Plan items | Model | Size |
| --- | --- | --- | --- | --- |
| s2 | Value and colour pass per map | 2 | Opus | medium |
| s3 | Canopy variety, Serengeti soil, reef | 3, 4 | Opus | small–medium |
| s4 | Light instead of overlay washes, water glint at golden hour | 6, 7 | Opus | medium |
| s5 | Animal rim, glass menus on weak GPUs, restoration contrast | 8, 9, 11 | Opus | small–medium |
| s6 | Re-stage the intro film's first shot, re-film | 10 | Opus | medium (long film runs) |

- [x] s2
- [ ] s3
- [ ] s4
- [ ] s5
- [ ] s6
- [ ] catalog (`open.md`), then one PR
