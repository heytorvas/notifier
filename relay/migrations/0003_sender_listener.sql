ALTER TABLE inboxes ADD COLUMN sender_listener_up INTEGER NOT NULL DEFAULT 0;
ALTER TABLE inboxes ADD COLUMN sender_listener_at INTEGER;
