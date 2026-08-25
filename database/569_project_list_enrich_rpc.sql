-- ═══════════════════════════════════════════════════════════════════════════════
-- 569 — Tăng tốc GET /api/projects: gộp bước "enrich" vào 1 truy vấn SQL + 2 index
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- ⚠️  Supabase SQL Editor: chọn TOÀN BỘ file (Ctrl+A) rồi Run.
--
-- BỐI CẢNH (đo trên dữ liệu thật, 500 dự án / 596 tổng)
-- -----------------------------------------------------
--     dò cột      :  262 ms  (chỉ khi cache 10 phút hết hạn)
--     truy vấn    :  567 ms
--     enrich      :  949 ms   ← lớn nhất
--     ────────────────────────
--     TỔNG        : 1778 ms   payload 1,46 MB
--
-- `enrichProjectsModulePresence()` phải đi 3 lượt REST tuần tự:
--   A. crm_leads theo project_id            ~400 ms
--   B. crm_deal_projects cho phần thiếu     ~143 ms
--   C. crm_tasks lấy deadline mở gần nhất   ~300 ms
--
-- Cùng logic đó viết bằng SQL chạy **15 ms** (đã EXPLAIN ANALYZE) — nhanh hơn ~60 lần,
-- vì Postgres join tại chỗ thay vì gửi hàng nghìn id qua HTTP rồi ghép trong Node.
--
-- HAI INDEX CÒN THIẾU
-- -------------------
--   • projects: `ORDER BY created_at DESC` đang Seq Scan + Sort toàn bảng.
--   • crm_leads: index duy nhất theo project_id là PARTIAL (`WHERE type='deal'`), còn
--     enrich KHÔNG lọc type nên không dùng được → Seq Scan 8.146 dòng mỗi request.
--   Ở mức 596 dự án thì chưa rõ, nhưng cả hai đều tăng tuyến tính theo số dòng.
--
-- AN TOÀN: chạy lại nhiều lần được; chỉ thêm index + function, không đụng dữ liệu.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Index ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_projects_created_at_desc
  ON projects (created_at DESC);

-- Không partial theo `type`: enrich cần MỌI crm_leads có project_id, không chỉ deal.
CREATE INDEX IF NOT EXISTS idx_crm_leads_project_id_any
  ON crm_leads (project_id)
  WHERE project_id IS NOT NULL;

-- ── 2. RPC gộp enrich ─────────────────────────────────────────────────────────
-- Trả về ĐÚNG các cột mà enrichProjectsModulePresence() đang tự đi lấy, để phía Node
-- giữ nguyên toàn bộ logic đóng gói (origin / schedule / modules) — giảm rủi ro lệch.
CREATE OR REPLACE FUNCTION public.project_list_enrich(p_project_ids uuid[])
RETURNS TABLE (
  project_id            uuid,
  deal_id               uuid,
  deal_code             text,
  deal_title            text,
  deal_company_id       uuid,
  deal_type             text,
  assigned_to           uuid,
  lead_owner_id         uuid,
  deal_created_by       uuid,
  kanban_deadline_at    timestamptz,
  expected_close_date   timestamptz,
  next_task_deadline    timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH page AS (
  SELECT unnest(p_project_ids) AS id
),
-- Deal gắn TRỰC TIẾP qua crm_leads.project_id — mới nhất theo updated_at (khớp JS).
direct AS (
  SELECT DISTINCT ON (l.project_id)
         l.project_id, l.id, l.code, l.title, l.company_id, l.type::text AS type,
         l.assigned_to, l.lead_owner_id, l.created_by,
         l.kanban_deadline_at, l.expected_close_date::timestamptz
  FROM crm_leads l
  JOIN page p ON p.id = l.project_id
  ORDER BY l.project_id, l.updated_at DESC NULLS LAST
),
-- Multi-xưởng: dự án phụ chỉ nằm ở bảng nối, không ghi vào crm_leads.project_id.
via_junction AS (
  SELECT DISTINCT ON (j.project_id)
         j.project_id, l.id, l.code, l.title, l.company_id, l.type::text AS type,
         l.assigned_to, l.lead_owner_id, l.created_by,
         l.kanban_deadline_at, l.expected_close_date::timestamptz
  FROM crm_deal_projects j
  JOIN page p ON p.id = j.project_id
  JOIN crm_leads l ON l.id = j.deal_id
  WHERE NOT EXISTS (SELECT 1 FROM direct d WHERE d.project_id = j.project_id)
  ORDER BY j.project_id, l.updated_at DESC NULLS LAST
),
deal AS (
  SELECT * FROM direct
  UNION ALL
  SELECT * FROM via_junction
),
-- Deadline nhiệm vụ CRM còn MỞ, sớm nhất theo deal.
nxt AS (
  SELECT t.lead_id, min(t.deadline) AS next_deadline
  FROM crm_tasks t
  JOIN deal d ON d.id = t.lead_id
  WHERE t.deadline IS NOT NULL
    AND lower(t.status::text) NOT IN ('done', 'completed', 'cancelled', 'canceled')
  GROUP BY t.lead_id
)
SELECT p.id, d.id, d.code, d.title, d.company_id, d.type,
       d.assigned_to, d.lead_owner_id, d.created_by,
       d.kanban_deadline_at, d.expected_close_date, nxt.next_deadline
FROM page p
LEFT JOIN deal d ON d.project_id = p.id
LEFT JOIN nxt   ON nxt.lead_id = d.id;
$$;

COMMENT ON FUNCTION public.project_list_enrich(uuid[]) IS
  'Gộp 3 lượt REST của enrichProjectsModulePresence() thành 1 truy vấn (949ms -> ~15ms). '
  'Xem migration 569.';

-- SECURITY DEFINER: Postgres mặc định cấp EXECUTE cho PUBLIC → thu hồi trước.
REVOKE ALL ON FUNCTION public.project_list_enrich(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.project_list_enrich(uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.project_list_enrich(uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.project_list_enrich(uuid[]) TO service_role;

-- ── 3. Kiểm tra sau khi chạy ──────────────────────────────────────────────────
--   SELECT count(*) AS so_dong, count(deal_id) AS co_deal
--   FROM public.project_list_enrich(
--     (SELECT array_agg(id) FROM (SELECT id FROM projects ORDER BY created_at DESC LIMIT 500) s)
--   );
-- Kỳ vọng: so_dong = 500 và co_deal xấp xỉ 496 (số dự án có deal gắn).
