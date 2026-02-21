-- Updated Messages Table Schema with all required fields

-- Drop old messages table if exists
DROP TABLE IF EXISTS messages;

-- Create new messages table with all fields
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  text TEXT NOT NULL,
  profile_image_url TEXT,
  timestamp TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index for auto-cleanup of old messages
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
