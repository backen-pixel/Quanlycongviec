-- ═══════════════════════════════════════════════════════════════════════════════
-- 573 — overview_lead_stage_counts(): đếm lead/deal theo giai đoạn bằng GROUP BY
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- ⚠️  Supabase SQL Editor: chọn TOÀN BỘ file (Ctrl+A) rồi Run.
--
-- LỖI ĐANG SỬA
-- ------------
-- `countLeadsByStage()` (backend/src/routes/management.js) tải HẾT cột stage_id rồi đếm
-- trong JavaScript. PostgREST cắt ở 1.000 dòng và không báo lỗi, nên các con số này luôn
-- dính đúng 1.000:
--
--     Chỉ số        API báo    Thực tế    Thiếu
--     crm_leads       1.000      5.870      83%
--     crm_deals       1.000      2.281      56%
--
-- Ảnh hưởng: thẻ KPI "CRM" trên trang /projects, số `crm_won` (tính từ cùng bộ đếm), và
-- số đếm từng cột pipeline lead/deal ở /api/management/overview.
--
-- Đếm bằng GROUP BY: 1 lượt gọi, payload vài trăm byte, đúng ở mọi quy mô.
--
-- ⚠️  TÊN PHẢI CÓ TIỀN TỐ overview_: đã tồn tại `crm_leads_stage_counts(...)` (14 tham số,
--     dùng cho CRM dashboard). Dùng trùng tên sẽ tạo overload nhập nhằng và PostgREST báo
--     "Could not choose the best candidate function" — làm HỎNG CẢ HAI hàm.
--
-- AN TOÀN: chạy lại nhiều lần được; chỉ tạo function, không đụng dữ liệu.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.overview_lead_stage_counts(
  p_type          text,
  p_company_ids   uuid[]        DEFAULT NULL,
  p_date_from     timestamptz   DEFAULT NULL,
  p_date_to       timestamptz   DEFAULT NULL,
  p_assignee_id   uuid          DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH base AS (
  SELECT COALESCE(l.stage_id::text, '__none__') AS sid
  FROM crm_leads l
  WHERE l.type = p_type
    AND (p_company_ids IS NULL OR l.company_id = ANY (p_company_ids))
    AND (p_date_from IS NULL OR l.created_at >= p_date_from)
    AND (p_date_to   IS NULL OR l.created_at <= p_date_to)
    AND (p_assignee_id IS NULL
         OR l.assigned_to = p_assignee_id
         OR l.lead_owner_id = p_assignee_id)
)
SELECT COALESCE(jsonb_object_agg(g.sid, g.n), '{}'::jsonb)
FROM (SELECT sid, count(*) AS n FROM base GROUP BY sid) g;
$$;

COMMENT ON FUNCTION public.overview_lead_stage_counts(text, uuid[], timestamptz, timestamptz, uuid) IS
  'Đếm crm_leads theo stage bằng GROUP BY. Thay cho việc tải hết stage_id rồi đếm trong JS '
  '— bị PostgREST cắt ở 1.000 dòng nên crm_leads/crm_deals luôn báo đúng 1.000 '
  '(thật: 5.870 / 2.281). Xem migration 573.';

-- SECURITY DEFINER: thu hồi EXECUTE mặc định của PUBLIC trước khi cấp cho service_role.
REVOKE ALL ON FUNCTION public.overview_lead_stage_counts(text, uuid[], timestamptz, timestamptz, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.overview_lead_stage_counts(text, uuid[], timestamptz, timestamptz, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.overview_lead_stage_counts(text, uuid[], timestamptz, timestamptz, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.overview_lead_stage_counts(text, uuid[], timestamptz, timestamptz, uuid) TO service_role;

-- ── Kiểm tra sau khi chạy ─────────────────────────────────────────────────────
--   SELECT (SELECT sum(v::int) FROM jsonb_each_text(public.overview_lead_stage_counts('lead')) e(k,v)) AS leads,
--          (SELECT sum(v::int) FROM jsonb_each_text(public.overview_lead_stage_counts('deal')) e(k,v)) AS deals;
-- Kỳ vọng khớp: SELECT count(*) FILTER (WHERE type='lead'), count(*) FILTER (WHERE type='deal') FROM crm_leads;
