-- 25_facebook_contacts_last_synced.sql
-- Thêm cột last_synced_at để smart sync biết contact nào cần sync lại

ALTER TABLE facebook_contacts ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- Index để filter nhanh contacts chưa sync hoặc sync cũ
CREATE INDEX IF NOT EXISTS idx_fb_contacts_last_synced ON facebook_contacts (last_synced_at NULLS FIRST);
