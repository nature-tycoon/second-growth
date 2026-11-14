---
name: ideas
description: Turn a rough list of game ideas from Cole into a batch of right-sized Claude Code sessions that run one after another on their own, then collect every open question and new idea they raised. Use when Cole pastes or sends a list of game ideas, or says "/ideas resume" to pick up a batch.
---

# Ideas → session batch

Cole's ideas are rough. Your job: sort them, sanity-check them against nature, ask only what blocks the work, then run them as a chain of small sessions while this session stays thin. Token use matters more than speed: this session reads little and writes short briefs; each worker session starts fresh with only what it needs.

## 1. Sort (this session, cheap)

1. Read only the AGENTS.md decision index (already in context) and [0001](../../../docs/decisions/0001-nature-driven-wildlife.md). Don't read code or other decision records here; the worker sessions do that.
2. Split each idea into single changes. "Wolves hunt in packs and howl at night" is two.
3. Group by subsystem, using the index's areas: wildlife behavior (`sim/`), ecology balance (`data/`, `sim/`), plants and terrain, fire and weather, animal and close-up drawing (`render3d/`), sound, UI and menus, website, performance. Merge duplicates. Drop nothing silently.
4. Nature check each change. The rule is what real ecosystems do (0001): if an idea contradicts real behavior or ecology, say so in one line and propose the realistic version that gets Cole what he's after. Also propose a simpler or sturdier route where one exists (AGENTS.md principles). Mark which ideas you changed and why.

## 2. Ask (once, batched)

Ask only questions whose answer changes what a session builds. Everything else becomes a stated assumption in the brief.

- Use AskUserQuestion: up to 4 questions per call, at most 2 calls. Put your recommended option first.
- Ask about: which of two real behaviors he means, scope (small tweak vs whole feature), your nature-check rewrites he might reject, and anything touching money, the website, or analytics.
- Don't ask about implementation details, file layout, or tuning numbers.

## 3. Plan the batch

Write `docs/ideas/<YYYY-MM-DD>-<slug>/plan.md`: the grouped ideas, the nature-check notes, Cole's answers, the assumptions, and the session list below. This file lets `/ideas resume` restart the chain from a fresh session if this one is closed.

Right-size each session:

- One subsystem per session, so it reads one or two decision records and one area of code. Typically 2–5 small related changes, or one substantial feature.
- Split a session if its brief needs more than two decision records, touches more than two subsystems, or would need both `balance-sim` and `play-profile` at length.
- Merge tiny one-file tweaks in the same area into one session rather than paying a session's start-up cost for each.
- Model: `sonnet` for data tuning, copy, small UI and website changes; default (Opus) for new behavior, rendering, or anything design-heavy.

Order:

- Sessions run **one at a time** in this checkout on one batch branch `claude/ideas-<slug>` (create it from `main`; check `git status` first and tell Cole about other agents' work). Sequential means later sessions build on earlier commits and nothing conflicts.
- Order by dependency, then foundations first (sim before the drawing that shows it), then cheap sessions early so failures surface fast.
- Parallel sessions only when two sessions touch disjoint files **and** neither runs a browser check, `play-profile` or a long `balance-sim` (they'd skew each other's timings and load Cole's Mac). Give the parallel one `use_worktree: true` and note its branch in the plan. At most two at once.

Show Cole the plan in a short table (session, ideas, model, est. size) and start without waiting unless step 2 left something unresolved.

## 4. Run the chain

Load `mcp__ccd_session__start_session` with ToolSearch if needed. Start session 1 with `initiation: "user_asked"`, `context: "fresh"`, `use_worktree: false`, and the brief below. When its note arrives (a `<side-sessions-event>`), check the commit landed (`git log --oneline -3`, nothing more), tick it in `plan.md`, and start the next. Don't read the worker's diff or transcript; that's what keeps this session small. If a worker reports it's blocked or failed, record it in `plan.md`, skip sessions that depend on it, and carry on.

If the chain stops (the app pauses auto-continue after many events without Cole), Cole says "continue" or runs `/ideas resume`, which reads `plan.md` and starts the first unticked session.

### Worker brief template

Keep it under ~250 words. Workers start with no memory of this conversation.

```
Second Growth idea batch <slug>, session <N>/<total>: <title>.
Branch: claude/ideas-<slug> (already checked out; commit here, don't push, don't branch).

Build:
- <change 1, with the realistic behavior it should match>
- <change 2>
Cole's answers / assumptions: <only the relevant ones>

Read first: AGENTS.md, docs/decisions/<record>.md. Code area: <files/dirs>.
Done when: <observable result>; checks: <tools/*-check.mjs, balance-sim, play-profile as fits>.

Rules:
- Run slow checks (balance-sim, play-profile, browser checks) with run_in_background and work on a non-conflicting part (the next change in other files, the decision record) while they run. Don't start extra sessions or subagents for this.
- If an idea turns out unnatural or much bigger than expected, build the realistic or smaller version and log why. Don't stop to ask; log the question.
- Close preview tabs and stop any server when your check is done. Don't leave a preview open.
- Commit only your own hunks (see /ship), then write docs/ideas/<slug>/s<N>.md with three lists: Done, Open questions for Cole (each with your recommended answer), New ideas noticed. Commit it with your work.
- End with a 2-line report: what landed, and how many open questions.
```

## 5. Catalog (after the last session)

1. Read every `docs/ideas/<slug>/s*.md` (for a worktree session, from its worktree path).
2. Merge into `docs/ideas/<slug>/open.md`: open questions grouped by subsystem, each with the session's recommended answer; new ideas below, nature-checked the same way as step 1. Drop duplicates and anything a later session already settled.
3. Show Cole: a 3–5 line summary of what landed (sessions done, skipped, failed, branch name), then the questions. Ask choice-shaped ones through AskUserQuestion (recommended first), list the rest briefly.
4. Start one preview on port 8347 for the batch branch and leave it open (AGENTS.md), and commit `plan.md` and `open.md`. Don't push.
5. Offer to run Cole's answers and the new ideas as the next batch.
