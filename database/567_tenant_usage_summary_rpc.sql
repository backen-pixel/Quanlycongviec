-- ═══════════════════════════════════════════════════════════════════════════════
-- 567 — tenant_usage_summary(): tính usage hạn mức bằng MỘT truy vấn SQL
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- ⚠️  Supabase SQL Editor: chọn TOÀN BỘ file (Ctrl+A) rồi Run.
--
-- BỐI CẢNH / 3 LỖI ĐANG SỬA trong src/helpers/tenantQuotas.js
-- -----------------------------------------------------------
-- Đo thực tế trên tenant "Hệ sinh thái mặc định":
--
--     Chỉ số                 API đang báo      Thực tế
--     crm_tasks_per_month             0        18.715
--     attachments_mb                  0         1.292,6 MB
--     notes_mb                        0             2,49 MB
--     storage_mb                      0        ~1.295 MB
--
-- Ba nguyên nhân độc lập, tất cả đều IM LẶNG (code không destructure `error`):
--
--   1. Sai tên cột: đọc `crm_lead_comments.content` — cột thật là `body`.
--      → PostgREST trả lỗi, code bỏ qua, `notes_mb` LUÔN = 0.
--   2. Sai tên cột: lọc `drive_files.is_trashed` — cột thật là `trashed_at`.
--      → toàn bộ dung lượng Drive bị bỏ khỏi phép tính.
--   3. Cắt 1.000 dòng: `crm_leads` của tenant có 8.142 dòng nhưng
--      `.select('id').in('company_id', …)` chỉ trả 1.000 → mọi phép tính phía sau
--      (crm_tasks, crm_task_attachments, crm_lead_comments) đều dựa trên tập lead
--      thiếu, rồi lại bị cắt lần nữa ở chính nó (crm_tasks: 1.000/11.506 dòng).
--
-- Hậu quả: `storage_mb` và `crm_tasks_per_month` gần như luôn bằng 0, nên các cổng
-- kiểm tra hạn mức trong assertTenantQuota() KHÔNG BAO GIỜ chặn được — tenant vượt
-- gói vẫn tạo dữ liệu thoải mái.
--
-- VÌ SAO DÙNG RPC
-- ---------------
-- Đây là phép TỔNG HỢP (COUNT/SUM) trên toàn tenant. Nếu sửa bằng cách phân trang
-- qua API thì phải tải ~94.000 dòng crm_tasks (≈94 lượt gọi) chỉ để cộng lại — sai
-- hình dạng. Gộp vào một truy vấn SQL vừa đúng vừa nhanh.
--
-- AN TOÀN: chạy lại nhiều lần được; chỉ tạo function, không đụng dữ liệu.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.tenant_usage_summary(
  p_tenant_id uuid,
  p_month_start timestamptz
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH co AS (
  SELECT id AS company_id FROM companies WHERE tenant_id = p_tenant_id
),
lead AS (
  SELECT l.id, l.type, l.created_at
  FROM crm_leads l
  JOIN co ON co.company_id = l.company_id
),
task AS (
  SELECT k.id, k.created_at
  FROM crm_tasks k
  JOIN lead ON lead.id = k.lead_id
)
SELECT jsonb_build_object(
  'leads_per_month',
    (SELECT count(*) FROM lead WHERE lead.type = 'lead' AND lead.created_at >= p_month_start),
  'deals_per_month',
    (SELECT count(*) FROM lead WHERE lead.type = 'deal' AND lead.created_at >= p_month_start),
  'projects_total',
    (SELECT count(*) FROM projects p JOIN co ON co.company_id = p.company_id),
  'crm_tasks_per_month',
    (SELECT count(*) FROM task WHERE task.created_at >= p_month_start),
  -- Dung lượng tệp đính kèm nhiệm vụ CRM
  'attachment_bytes',
    COALESCE((SELECT sum(a.file_size)::bigint FROM crm_task_attachments a
              JOIN task ON task.id = a.task_id), 0),
  -- Dung lượng Drive (cột đúng là trashed_at, KHÔNG phải is_trashed)
  'drive_bytes',
    COALESCE((SELECT sum(f.size_bytes)::bigint FROM drive_files f
              JOIN drive_roots r ON r.id = f.root_id
              JOIN co ON co.company_id = r.owner_id
              WHERE f.trashed_at IS NULL), 0),
  -- Dung lượng ghi chú/bình luận (cột đúng là body, KHÔNG phải content)
  'notes_bytes',
    COALESCE((SELECT sum(octet_length(COALESCE(c.body, '')))::bigint
              FROM crm_lead_comments c JOIN lead ON lead.id = c.lead_id
              WHERE c.deleted_at IS NULL), 0)
);
$$;

COMMENT ON FUNCTION public.tenant_usage_summary(uuid, timestamptz) IS
  'Usage hạn mức theo tenant, tính 1 phát bằng SQL. Thay cho chuỗi truy vấn REST bị cắt '
  '1.000 dòng và dùng sai tên cột (content→body, is_trashed→trashed_at). Xem migration 567.';

-- SECURITY DEFINER: Postgres mặc định cấp EXECUTE cho PUBLIC → phải thu hồi trước,
-- nếu không client anon/authenticated có thể đọc tổng hợp của tenant khác.
REVOKE ALL ON FUNCTION public.tenant_usage_summary(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tenant_usage_summary(uuid, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.tenant_usage_summary(uuid, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_usage_summary(uuid, timestamptz) TO service_role;

-- ── Kiểm tra sau khi chạy ──────────────────────────────────────────────────────
--   SELECT t.name, public.tenant_usage_summary(t.id, date_trunc('month', now()))
--   FROM tenants t ORDER BY t.name;
--
-- Với tenant "Hệ sinh thái mặc định" phải thấy crm_tasks_per_month ≈ 18.715 và
-- attachment_bytes ≈ 1,35e9 — thay vì 0 như trước.
