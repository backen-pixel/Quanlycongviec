-- 403: Toi uu hieu nang — index thong bao + xoa index trung.
-- Da chay truc tiep tren Supabase (kdxypztstbeovyedmvem) ngay 03/09/2026.
--
-- ── Do luong truoc/sau (cau dem badge trong pgHotQueries.pgDashboardNotificationStats,
--    do bang EXPLAIN ANALYZE tren nguoi dung nhieu thong bao nhat) ──
--   Truoc:            312 ms · 22.029 dong · Sort external merge, tran ra dia 8.688 kB
--   Sau khi them index: 232 ms (index scan 69,6ms -> 26,0ms; planning 2,85ms -> 0,70ms)
--   Sau khi don ton:     63 ms · 10.387 dong · HashAggregate 1.937 kB, KHONG con tran dia
--   => nhanh 4,9 lan. Viec het tran dia moi la thu tieu diet cac lan cham 11,1 giay.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Index loc san cho cau dem badge
--    Index cu idx_notifications_user (user_id, is_read) van chua ca dong da doc trong cung
--    cay va khong loai duoc dismissed_at, nen moi lan dem van phai loc lai tren heap.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_live_unread
  ON public.notifications (user_id)
  WHERE is_read = false AND dismissed_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Xoa 2 index trung nhau hoan toan (bo kiem tra Supabase phat hien).
--    Da doi chieu pg_stat_user_indexes: ban bi xoa co idx_scan = 0, ban giu lai dang duoc dung.
--      idx_messenger_reactions_message (0 lan)  <-> idx_msg_reactions_message (1.289 lan)  [giu]
--      idx_products_category           (0 lan)  <-> idx_products_category_id   (39 lan)    [giu]
-- ─────────────────────────────────────────────────────────────────────────────
DROP INDEX CONCURRENTLY IF EXISTS public.idx_messenger_reactions_message;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_products_category;

ANALYZE public.notifications;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Don ton thong bao cu (DA CHAY MOT LAN, 159.028 dong).
--    KHONG xoa du lieu — chi dat dismissed_at nen chung roi khoi badge/danh sach
--    (moi duong doc deu loc dismissed_at IS NULL) nhung dong van con nguyen trong bang.
--    Dung dung MOT moc thoi gian de hoan tac chinh xac duoc.
--    Tu nay job backend/src/jobs/notificationRetentionCron.js lam viec nay hang ngay ~03:10.
-- ─────────────────────────────────────────────────────────────────────────────
-- UPDATE notifications
-- SET dismissed_at = '2026-09-03T10:00:00Z'::timestamptz
-- WHERE is_read = false
--   AND dismissed_at IS NULL
--   AND created_at < now() - interval '60 days';

-- HOAN TAC buoc 3 (dua lai dung 159.028 dong da an, khong anh huong dong nao khac):
-- UPDATE notifications
-- SET dismissed_at = NULL
-- WHERE dismissed_at = '2026-09-03T10:00:00Z'::timestamptz;
