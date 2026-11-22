// The intro film's motion check in the browser suite (it runs before each itch.io upload): a game
// change that breaks the staged film (trees moved, a drawing change, plants over the subject, a
// sky over the land) fails here before release. The check itself, its limits and how to read it:
// tools/intro-film-motion.mjs. Fix the staging (tools/intro-film-plan.mjs) and re-film when it fails
// (docs/ideas/2026-11-21-first-minutes/f3.md).
await import('./intro-film-motion.mjs');
