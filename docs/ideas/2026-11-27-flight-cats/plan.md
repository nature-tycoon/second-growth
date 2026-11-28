# Ideas batch flight-cats (2026-11-27)

Branch: `claude/ideas-flight-cats` (from origin/main 1f3b1ad). Sessions run one at a time in the main checkout.

## Ideas, split and nature-checked

| # | Idea (Cole) | Change(s) | Nature / route note |
|---|---|---|---|
| 1 | PostHog tracking of where people drop out | Audit events; add milestone events; drop-off funnel + retention dashboard; report from existing data | Analytics: keep `analytics-privacy-check` passing, no personal data |
| 2 | Improve Interaction to Next Paint | Measure INP (PostHog web vitals + local profiling of click/key handlers), fix the worst handlers | It's a question: the session answers it and fixes what it can |
| 3 | Birds flap when landing, not just drop | Landing flare: wings beat to brake, body pitches up, legs reach forward | Real: birds flare and beat hard to brake before touchdown |
| 4 | Birds swoop up/down and side to side smoothly (hawk as start) | Smooth banked turns for all; flight style by trait | Changed (Cole agreed): by real style, not all like the hawk. Raptors soar/glide in wide banks; small birds bound (flap, fold, dip); swallows swoop and weave; ducks/geese straight and steady. Must keep 0039's steady flight (no jitter) |
| 5 | Flooding looks blotchy | Smooth flood water's look | Drawing only; water rules 0034/0048 |
| 6 | See fish under water in Amazon when tracking | Tracking lens draws the followed fish faintly through the water surface | Cole chose this; reverses 0040's "never through water" for the followed fish only; Amazon water stays murky |
| 7 | Caiman front arms point up on land | Forelimbs sprawl out and forward, elbows bent, feet flat on ground | Real crocodilian sprawl / high walk |
| 8 | Upgrade other deer | White-tailed deer, Roosevelt elk, sambar; lesser mouse-deer | Mouse-deer is a chevrotain, not a true deer: fit it to chevrotain photos (no antlers, tusks on males) |
| 9 | Upgrade all other cats | Shared feline fixes from the cougar, then bobcat, ocelot, leopard cat, jaguar, leopard, Sumatran tiger, Sunda clouded leopard, lion, cheetah | Split over three sessions |
| 10 | Upgrade black bear | American black bear (sun bear gains any shared bear fixes) | |

## Cole's answers (2026-11-27)

- Upgrades: solo pass per the animal-model checklist (`.claude/skills/animal-model/SKILL.md`) against real photos with the overlay tool, before/after pictures saved; Cole reviews all at the end, rejects get reverted and redone with him.
- Fish: faint outline through water (like the lens through leaves).
- Analytics: new milestone events + funnel/retention dashboard + report from existing data.
- Bird flight: by real flight style.

## Assumptions

- Upgrade sessions skip the checklist's "show Cole and wait" step and instead leave a review list (URLs, before/after shots) in their s<N>.md.
- PostHog project 630638 (docs/posthog-player-perf.md, docs/posthog-review-2026-11.md). Dashboards created in PostHog count as outward-facing but internal to Cole's project: fine.

## Sessions

| # | Title | Ideas | Model | Size | Status |
|---|---|---|---|---|---|
| 1 | Amazon water animals: caiman arms, fish through water | 6, 7 | Opus | S–M | [x] d188441 |
| 2 | Bird flight: landing flare, swoops by flight style | 3, 4 | Opus | M | [x] 1da116e (not eyeballed in game) |
| 3 | Flood water look | 5 | Opus | S–M | [x] 902fb1c (seen in review page only) |
| 4 | Interaction to Next Paint | 2 | Opus | M | [x] fb86017 (A/B needs 2 weeks of data) |
| 5 | PostHog drop-off tracking | 1 | Opus | M | [x] e51e8f6 (dashboard 2423211) |
| 6 | Deer upgrades | 8 | Opus | L | [x] 5d191b7 6ed2188 b39095e 7055781 |
| 7 | Cats 1: shared feline fixes + bobcat, ocelot, leopard cat | 9 | Opus | L | reverted (Cole: cats back to old models) |
| 8 | Cats 2: jaguar, leopard, tiger, clouded leopard | 9 | Opus | L | reverted (Cole: cats back to old models) |
| 9 | Cats 3: lion, cheetah | 9 | Opus | M | dropped (hit usage limit; cats reverted) |
| 10 | Black bear | 10 | Opus | M | not run (Cole shipped the batch first) |

Regression-reviewer on plan and diff: sessions 1, 2, 3 (movement, water, drawing through water).
