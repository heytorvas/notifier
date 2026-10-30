CREATE TABLE inboxes (
  id TEXT PRIMARY KEY,
  owner_token_hash TEXT NOT NULL,
  pairing_token_hash TEXT,
  sender_token_hash TEXT,
  fid TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX inboxes_updated_at_idx ON inboxes(updated_at);

CREATE TABLE delivered_messages (
  inbox_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  delivered_at INTEGER NOT NULL,
  PRIMARY KEY (inbox_id, message_id),
  FOREIGN KEY (inbox_id) REFERENCES inboxes(id) ON DELETE CASCADE
);

CREATE INDEX delivered_messages_delivered_at_idx ON delivered_messages(delivered_at);
