-- ═══════════════════════════════════════════════════════════════════════════
-- VÍ DỤ: chỉnh / gán lại nguồn (source_id) cho lead — CHỈNH SỬA TRƯỚC KHI CHẠY
-- ═══════════════════════════════════════════════════════════════════════════
-- Chạy trên Supabase SQL Editor. Nên backup bảng crm_leads (hoặc snapshot) trước.
--
-- Bảng crm_leads thường có cột source_id → tham chiếu crm_sources(id).
-- Mỗi dự án có thể đặt tên nguồn khác nhau; dùng SELECT để xem id thật:
--
--   SELECT id, name, slug FROM crm_sources WHERE is_active = true ORDER BY name;
--
-- Ví dụ 1 — Gán tất cả lead đang NULL source_id sang một nguồn mặc định:
/*
UPDATE crm_leads
SET source_id = 'PASTE-UUID-CUA-CRM_SOURCES'::uuid,
    updated_at = now()
WHERE source_id IS NULL
  AND type = 'lead';
*/

-- Ví dụ 2 — Đổi nguồn A → B (theo id cũ / mới):
/*
UPDATE crm_leads
SET source_id = 'UUID-NGUON-MOI'::uuid,
    updated_at = now()
WHERE source_id = 'UUID-NGUON-CU'::uuid;
*/

-- Ví dụ 3 — Lead từ Facebook nhưng source_id sai: map theo bảng facebook_pages / custom logic
-- (cần cột phụ như fb_page_id trên lead nếu có; điều chỉnh theo schema thực tế)
/*
UPDATE crm_leads l
SET source_id = s.id,
    updated_at = now()
FROM crm_sources s
WHERE s.slug = 'facebook'
  AND l.some_fb_marker IS NOT NULL
  AND l.source_id IS DISTINCT FROM s.id;
*/

-- Kiểm tra sau khi cập nhật:
-- SELECT source_id, COUNT(*) FROM crm_leads GROUP BY 1 ORDER BY 2 DESC;
