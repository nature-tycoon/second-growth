-- Ratings from the feedback form. Run once after creating the database (docs/backend-setup.md):
--   npx wrangler@4 d1 execute second-growth --remote --file=schema.sql
-- player is the game's random, anonymous player id (or NULL): one current rating per player.
CREATE TABLE IF NOT EXISTS ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player TEXT UNIQUE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  source TEXT NOT NULL DEFAULT 'game',
  map TEXT,
  created_at TEXT NOT NULL
);
