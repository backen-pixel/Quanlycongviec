-- 590: fb_unattended_count — gộp hai lượt quét thành một
--
-- VÌ SAO: sau khi 585–588 xử lý các truy vấn nặng nhất, hàm này nổi lên trong
-- top: 103 lượt gọi, trung bình 232 ms, 9.902 buffer/lượt ~ 2% tổng thời gian
-- DB. Nó chạy trên mỗi lần tải dashboard Facebook (ô "chưa trả lời").
--
-- VẤN ĐỀ: bản cũ có hai CTE `inb` và `outb`, mỗi CTE quét facebook_messages
-- MỘT LẦN (lọc direction rồi GROUP BY contact_id), sau đó LEFT JOIN hai kết
-- quả. Tức là bảng 128.906 dòng bị quét hai lượt để trả về một con số.
--
-- CÁCH SỬA: dùng aggregate có FILTER để lấy cả mốc inbound cuối và outbound
-- cuối trong CÙNG một lần gom nhóm. Một lượt quét thay vì hai.
--
-- ĐO ĐƯỢC (EXPLAIN ANALYZE, tất cả 12 page):
--   TRƯỚC: 200,4 ms | 14.449 buffer | 2x Seq Scan facebook_messages
--   SAU:   131,5 ms |  9.823 buffer | 1x Seq Scan
--   => nhanh hơn 1,5 lần
--
-- KIỂM CHỨNG KHÔNG ĐỔI KẾT QUẢ: chạy song song bản cũ và bản mới trên 16 đầu
-- vào — NULL, mảng rỗng, page không tồn tại, từng page một (12 page), và tất
-- cả page. 16/16 khớp tuyệt đối, gồm cả các ca biên:
--     NULL / tất cả page -> 1129 = 1129
--     mảng rỗng          ->    0 =    0
--     page không có thật ->    0 =    0
--
-- Giữ nguyên `t.last_in IS NOT NULL`: bản cũ bắt đầu FROM inb nên chỉ đếm
-- contact CÓ ít nhất một tin inbound. Bỏ điều kiện này là đổi nghĩa.

CREATE OR REPLACE FUNCTION public.fb_unattended_count(p_page_ids text[] DEFAULT NULL::text[])
RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT count(*)::bigint FROM (
    SELECT m.contact_id,
           max(m.created_at) FILTER (WHERE m.direction = 'inbound')  AS last_in,
           max(m.created_at) FILTER (WHERE m.direction = 'outbound') AS last_out
    FROM facebook_messages m
    JOIN facebook_contacts c ON c.id = m.contact_id
    WHERE p_page_ids IS NULL OR c.page_id = ANY(p_page_ids)
    GROUP BY m.contact_id
  ) t
  WHERE t.last_in IS NOT NULL
    AND (t.last_out IS NULL OR t.last_out < t.last_in);
$$;
