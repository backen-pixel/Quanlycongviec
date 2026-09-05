-- 588: Mở rộng chỉ mục để RPC fb_contact_ids_with_inbound_in_range quét index-only
--
-- BỐI CẢNH — một hệ quả từ chính thay đổi của tôi
--
-- Sau khi các chỉ mục vòng 2 (585/586) làm truy vấn danh sách hộp thư biến mất
-- khỏi top, RPC này TRỞ THÀNH truy vấn tốn nhất database: 25,16% tổng thời gian
-- DB trong cửa sổ 18 giờ (04/09 08:31 → 05/09 02:39 UTC).
--
-- Nguyên nhân số lượt gọi tăng là do TÔI: ở vòng làm dashboard Facebook, tôi đổi
-- bộ lọc thời gian mặc định của hộp thư từ 'all' sang 'today'. Điều đó đưa mọi
-- lần mở hộp thư vào nhánh lọc-theo-ngày, tức nhánh gọi RPC này.
--   trước:    777 lượt/ngày  (55.163 lượt / 71 ngày)
--   sau:   12.612 lượt/ngày  → tăng 16 lần
-- Bù lại, mỗi lượt lại rẻ hơn (51,13 ms → 29,50 ms) và truy vấn danh sách hộp
-- thư cũ (649 giây/ngày) thì biến mất hẳn. Tổng thể vẫn lãi lớn, nhưng cần ghi
-- rõ là phần tăng này do tôi gây ra chứ không phải tự nhiên.
--
-- THÂN HÀM (database/52):
--   SELECT DISTINCT m.contact_id
--     FROM facebook_messages m JOIN facebook_contacts c ON c.id = m.contact_id
--    WHERE m.direction = 'inbound'
--      AND (p_from IS NULL OR m.created_at >= p_from)
--      AND (p_to   IS NULL OR m.created_at <= p_to)
--      AND (p_page_ids IS NULL OR c.page_id = ANY(p_page_ids));
--
-- ĐO ĐƯỢC: khoảng "hôm nay" chỉ tốn 2,6 ms / 488 buffer — rẻ. Chi phí nằm ở các
-- lượt gọi khoảng RỘNG (p_from IS NULL). Trường hợp đó:
--   phía facebook_contacts tốn 18.614 buffer chỉ để lấy `c.id`, vì chỉ mục
--   idx_fb_contacts_page_created là (page_id, created_at) — THIẾU đúng cột id
--   nên phải fetch heap từng dòng trên bảng 42 MB.
--
-- CÁCH SỬA: thêm `id` vào cuối chỉ mục để thành index-only scan.
--
-- ĐO SAU (EXPLAIN ANALYZE, khoảng rộng, 12 page):
--   TRƯỚC: 480,74 ms | 28.119 buffer | Index Scan + heap fetch từng dòng
--   SAU:   150,49 ms | 12.675 buffer | Index Only Scan (3.659 heap fetch)
--   => nhanh hơn 3,2 lần, ít hơn 2,2 lần buffer
--
-- CHI PHÍ GHI = 0 THÊM: (page_id, created_at, id) là TẬP CHA của
-- (page_id, created_at) — mọi truy vấn dùng được cái cũ đều dùng được cái mới —
-- nên bỏ cái cũ đi. Số chỉ mục trên facebook_contacts giữ nguyên 9. Điều này
-- quan trọng vì bảng đó nhận 3,6 triệu UPDATE mà chỉ 0,7% là HOT, tức mọi
-- UPDATE đều ghi vào mọi chỉ mục.
--
-- page_id và created_at không bao giờ đổi sau khi tạo dòng, nên chỉ mục này
-- không bị phình vì cập nhật (khác idx_fb_contacts_last_synced đã phải REINDEX).

CREATE INDEX IF NOT EXISTS idx_fb_contacts_page_created_id
  ON public.facebook_contacts (page_id, created_at, id);

DROP INDEX IF EXISTS public.idx_fb_contacts_page_created;

ANALYZE public.facebook_contacts;

-- THEO DÕI: idx_fb_contacts_page_last_message (thêm ở 586, cho trường hợp chọn
-- 1 page) đang có 0 lượt dùng sau 18 giờ. Chưa vội bỏ vì cửa sổ còn ngắn và
-- đường mã đó chưa chạy lần nào, nhưng nếu sau vài ngày vẫn 0 thì nên DROP.
