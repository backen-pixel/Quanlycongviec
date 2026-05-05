-- Tin soạn sẵn Hộp thư Facebook Messenger (theo user, lưu server).
CREATE TABLE IF NOT EXISTS facebook_inbox_canned_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  sort_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fb_inbox_canned_user_sort
  ON facebook_inbox_canned_replies (user_id, sort_index ASC, created_at DESC);

ALTER TABLE facebook_inbox_canned_replies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all" ON facebook_inbox_canned_replies;
CREATE POLICY "service_all" ON facebook_inbox_canned_replies FOR ALL USING (true) WITH CHECK (true);
