-- 586: Chi muc cho 3 truy vấn nóng nhất còn lại (đo bằng pg_stat_statements)
--
-- ================================================================
-- 1) notifications: user_id + type + created_at DESC
-- ================================================================
-- Truy vấn: SELECT * FROM notifications
--           WHERE user_id = $1 AND type = $2
--           ORDER BY created_at DESC LIMIT $3
-- Đo được: 10.049 lượt gọi, 49.654 buffer/lượt (biến thể ANY() thêm
--          10.136 lượt, 3.032 buffer/lượt).
-- Kế hoạch cũ: Index Scan trên idx_notifications_created_at rồi
--          "Rows Removed by Filter: 337.145" -- quét gần hết bảng
--          454 MB để lấy 20 dòng.
--
-- EXPLAIN ANALYZE thực tế (user có 42.446 thông báo loại deadline_overdue):
--   TRƯỚC: 19.221,86 ms | 137.862 buffer
--   SAU:        2,18 ms |       6 buffer
--   => nhanh hơn 8.800 lần, ít hơn 23.000 lần buffer
-- Đây là truy vấn tệ nhất trên mỗi lượt gọi trong toàn bộ database.
CREATE INDEX IF NOT EXISTS idx_notifications_user_type_created
  ON public.notifications (user_id, type, created_at DESC);

-- ================================================================
-- 2) facebook_contacts: danh sách hộp thư (truy vấn #1 của DB)
-- ================================================================
-- Truy vấn: SELECT facebook_contacts.*, lead:crm_leads(...), customer:customers(...)
--           WHERE page_id = ANY($9) AND last_message_at IS NOT NULL
--           ORDER BY last_message_at DESC, created_at DESC LIMIT $10
-- Đo được: 488.293 lượt gọi, 46.092 giây = 20,09% TOÀN BỘ thời gian DB,
--          27.414 buffer/lượt. Đây là truy vấn tốn nhiều nhất.
-- Nguyên nhân: không có chỉ mục khớp ORDER BY -> Seq Scan 14.213 dòng,
--          chạy 2 LATERAL cho CẢ 14.213 dòng, rồi mới top-N sort lấy 400.
--          97% công việc LATERAL bị bỏ đi.
--
-- EXPLAIN ANALYZE thực tế (12 page, LIMIT 400):
--   TRƯỚC: 206,84 ms | 32.372 buffer | LATERAL chạy 14.213 lần
--   SAU:     6,58 ms |  1.121 buffer | LATERAL chạy    400 lần
--   => nhanh hơn 31 lần, ít hơn 29 lần buffer
CREATE INDEX IF NOT EXISTS idx_fb_contacts_last_message_created
  ON public.facebook_contacts (last_message_at DESC, created_at DESC)
  WHERE last_message_at IS NOT NULL;

-- Cho trường hợp chỉ chọn 1 page (bộ lọc trang trong giao diện)
CREATE INDEX IF NOT EXISTS idx_fb_contacts_page_last_message
  ON public.facebook_contacts (page_id, last_message_at DESC)
  WHERE last_message_at IS NOT NULL;

-- ================================================================
-- 3) facebook_messages: contact_id + direction
-- ================================================================
-- Truy vấn: SELECT contact_id FROM facebook_messages
--           WHERE contact_id = ANY($1) AND direction = $2
-- Đo được: 979.462 lượt gọi, 1.491 giây, 708 buffer/lượt.
-- Kế hoạch cũ: idx_fb_messages_contact rồi lọc direction ->
--          "Rows Removed by Filter: 1.894" trên 2.703 dòng đọc lên heap.
--
-- EXPLAIN ANALYZE thực tế (400 contact, direction=inbound):
--   TRƯỚC: 296,37 ms | 3.279 buffer (Index Scan + Filter)
--   SAU:   103,73 ms | 1.846 buffer (Index Only Scan, 809 heap fetch)
--   => nhanh hơn 2,9 lần
CREATE INDEX IF NOT EXISTS idx_fb_messages_contact_direction
  ON public.facebook_messages (contact_id, direction);

ANALYZE public.notifications;
ANALYZE public.facebook_contacts;
ANALYZE public.facebook_messages;

-- ================================================================
-- 4) Don phong chi muc bi phinh: idx_fb_contacts_last_synced
-- ================================================================
-- facebook_contacts co 19.694 dong nhung nhan 3.620.040 luot UPDATE
-- (184 lan/dong). Chi muc tren last_synced_at -- cot doi moi lan sync --
-- phinh len 33 MB trong khi heap chi 8 MB, va chi duoc dung 40 lan/71 ngay.
-- Khong drop (job sync con dung), chi REINDEX de thu hoi dung luong.
-- Chay rieng, KHONG trong transaction:
--   REINDEX INDEX CONCURRENTLY public.idx_fb_contacts_last_synced;
