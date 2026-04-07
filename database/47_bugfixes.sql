-- 47. Bugfixes: FB unique index + Deal deadline + lost_reason

-- A4: Unique index cho facebook_messages.fb_message_id (fix ON CONFLICT error)
CREATE UNIQUE INDEX IF NOT EXISTS idx_fb_messages_fb_message_id 
  ON facebook_messages(fb_message_id) WHERE fb_message_id IS NOT NULL;

-- B4: Deadline cho Deal
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS expected_close_date DATE;

-- Lost reason (from previous commit)
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS lost_reason TEXT;
