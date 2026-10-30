ALTER TABLE inboxes ADD COLUMN claimed_at INTEGER;
ALTER TABLE inboxes ADD COLUMN receiver_brand TEXT NOT NULL DEFAULT '';
ALTER TABLE inboxes ADD COLUMN receiver_model TEXT NOT NULL DEFAULT '';

UPDATE inboxes
SET claimed_at = created_at
WHERE sender_token_hash IS NOT NULL AND claimed_at IS NULL;
