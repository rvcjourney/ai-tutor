CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_progress (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  current_state TEXT NOT NULL,
  last_completed_state TEXT,
  module_id TEXT,
  sub_topic_id TEXT,
  status TEXT NOT NULL DEFAULT 'in_progress',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  state_id TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  is_correct INTEGER NOT NULL,
  attempt_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sub_topic_completions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  module_id TEXT NOT NULL,
  sub_topic_id TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, module_id, sub_topic_id)
);

-- Tracks the furthest Q/MCQ item reached within a sub-topic (1-based position),
-- separately from sub_topic_completions (which only flips once the whole thing is
-- done). Lets the UI show a real "6 of 15 covered" bar for a sub-topic that's
-- in-progress, and survives the learner navigating back to a menu mid-way through
-- (unlike current_state, which just points at wherever they are right now).
CREATE TABLE IF NOT EXISTS sub_topic_item_progress (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  module_id TEXT NOT NULL,
  sub_topic_id TEXT NOT NULL,
  items_seen INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, module_id, sub_topic_id)
);

-- Published content (what used to be backend/src/conversations/*.json on disk).
-- One row per file, storing the exact same JSON shape (`{"states": [...]}` or
-- `{"modules": [...]}`) as before — this is a relocation of the existing data
-- model into a persistent store, not a redesign into relational tables.
CREATE TABLE IF NOT EXISTS conversation_files (
  filename TEXT PRIMARY KEY,
  content JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
