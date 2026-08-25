-- ═══════════════════════════════════════════════════════════════════════════════
-- 568 — projects.has_crm_deal: cờ "dự án có gắn deal CRM"
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- ⚠️  Supabase SQL Editor: chọn TOÀN BỘ file (Ctrl+A) rồi Run.
--
-- BỐI CẢNH / LỖI ĐANG SỬA
-- ------------------------
-- `buildScopeOrFilter()` (backend/src/helpers/workshopKanban.js) dựng bộ lọc phạm vi
-- Kanban SX bằng cách nhét TOÀN BỘ danh sách id "dự án có deal thắng" vào URL:
--
--     or=(current_stage_id.in.(...),status.in.(...),id.in.(<581 UUID>))
--
-- Mỗi UUID tốn ~39 byte sau khi mã hoá URL → riêng vế `id.in.(...)` đã 23.089 byte.
-- Cộng phần `select=` (các bảng nhúng) thành 25.221 byte, trong khi Supabase/PostgREST
-- từ chối URL dài quá ~25.000 byte và trả về `Bad Request` KHÔNG kèm code/details/hint.
--
-- Hậu quả đo được:
--   • GET /api/production/projects (không lọc công ty) → 500
--   • GET /api/production/projects?sx_intake=1          → 500
--   • Trang "Xưởng SX → Duyệt theo deal" hiện danh sách RỖNG, không báo lỗi
--   • Các màn còn chạy được chỉ vì `select` ngắn hơn vài trăm byte — dư ~49 deal nữa
--
-- Đây là lỗi tự đến theo thời gian: cứ thêm 1 deal thắng là URL dài thêm ~39 byte.
--
-- CÁCH SỬA
-- --------
-- Thay danh sách id bằng MỘT cột boolean trên `projects`. Bộ lọc rút từ 23.089 byte
-- xuống ~24 byte (`has_crm_deal.is.true`) và KHÔNG còn phụ thuộc số lượng deal nữa.
--
-- Điều kiện của cột đúng bằng điều kiện mà `fetchWonDealProjectIds()` đang dùng: nhánh
-- "chỉ cần có project_id" trong hàm đó đã là tập cha của 2 nhánh kia (deal đang ở stage
-- is_won, và deal có actual_close_date) — cùng nhận xét đã ghi trong migration 561.
-- Vậy điều kiện rút gọn còn:
--     có crm_leads (type='deal') trỏ tới dự án  HOẶC  có dòng crm_deal_projects (multi-xưởng)
--
-- Cột được giữ đồng bộ bằng trigger trên `crm_leads` và `crm_deal_projects`.
--
-- AN TOÀN
-- -------
--   • Chạy lại nhiều lần được (idempotent).
--   • Không đụng cột nào khác, không có trigger updated_at trên `projects` nên
--     backfill KHÔNG làm sai lệch thời gian cập nhật.
--   • Trigger duy nhất đang có trên `projects` là BEFORE INSERT OR UPDATE OF company_id
--     → update cột này không kích hoạt nó.
--   • Backend tự dò cột: chưa chạy migration thì vẫn chạy như cũ (xem workshopKanban.js).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Cột ────────────────────────────────────────────────────────────────────
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS has_crm_deal BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN projects.has_crm_deal IS
  'Dự án có gắn deal CRM (crm_leads.type=deal hoặc crm_deal_projects). Giữ đồng bộ bằng '
  'trigger — xem migration 568. Thay cho việc nhét mảng id vào URL PostgREST (URL quá dài → 400).';

-- Bộ lọc luôn là `has_crm_deal = true` → index từng phần đủ và nhỏ.
CREATE INDEX IF NOT EXISTS idx_projects_has_crm_deal
  ON projects (has_crm_deal)
  WHERE has_crm_deal;

-- ── 2. Hàm tính lại (dùng chung cho backfill và trigger → không thể lệch nhau) ──
CREATE OR REPLACE FUNCTION public.projects_recompute_has_crm_deal(p_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_junction boolean;
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RETURN;
  END IF;

  -- Bảng nối multi-xưởng có thể chưa tồn tại ở một số deployment.
  SELECT to_regclass('public.crm_deal_projects') IS NOT NULL INTO v_has_junction;

  UPDATE projects p
  SET has_crm_deal = v_new.val
  FROM (
    SELECT
      t.id,
      (
        EXISTS (
          SELECT 1 FROM crm_leads l
          WHERE l.project_id = t.id AND l.type = 'deal'
        )
        OR (
          v_has_junction
          AND EXISTS (
            SELECT 1 FROM crm_deal_projects j
            WHERE j.project_id = t.id
          )
        )
      ) AS val
    FROM unnest(p_ids) AS t(id)
  ) AS v_new
  WHERE p.id = v_new.id
    -- Chỉ ghi khi thực sự đổi: tránh ghi thừa và chặn mọi khả năng đệ quy trigger.
    AND p.has_crm_deal IS DISTINCT FROM v_new.val;
END;
$$;

-- ── 3. Backfill ───────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_ids FROM projects;
  PERFORM public.projects_recompute_has_crm_deal(v_ids);
END;
$$;

-- ── 4. Trigger trên crm_leads ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_crm_leads_sync_has_crm_deal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  -- Gom cả project cũ lẫn mới: đổi project_id hoặc đổi type đều phải tính lại 2 bên.
  IF TG_OP <> 'INSERT' AND OLD.project_id IS NOT NULL THEN
    v_ids := array_append(v_ids, OLD.project_id);
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.project_id IS NOT NULL THEN
    v_ids := array_append(v_ids, NEW.project_id);
  END IF;

  PERFORM public.projects_recompute_has_crm_deal(v_ids);
  RETURN NULL; -- AFTER trigger, giá trị trả về bị bỏ qua
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_leads_has_crm_deal ON crm_leads;
CREATE TRIGGER trg_crm_leads_has_crm_deal
  AFTER INSERT OR DELETE OR UPDATE OF project_id, type ON crm_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_crm_leads_sync_has_crm_deal();

-- ── 5. Trigger trên crm_deal_projects (nếu bảng tồn tại) ──────────────────────
DO $$
BEGIN
  IF to_regclass('public.crm_deal_projects') IS NULL THEN
    RAISE NOTICE 'Bỏ qua trigger crm_deal_projects — bảng chưa tồn tại.';
    RETURN;
  END IF;

  CREATE OR REPLACE FUNCTION public.trg_crm_deal_projects_sync_has_crm_deal()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $fn$
  DECLARE
    v_ids uuid[] := ARRAY[]::uuid[];
  BEGIN
    IF TG_OP <> 'INSERT' AND OLD.project_id IS NOT NULL THEN
      v_ids := array_append(v_ids, OLD.project_id);
    END IF;
    IF TG_OP <> 'DELETE' AND NEW.project_id IS NOT NULL THEN
      v_ids := array_append(v_ids, NEW.project_id);
    END IF;

    PERFORM public.projects_recompute_has_crm_deal(v_ids);
    RETURN NULL;
  END;
  $fn$;

  DROP TRIGGER IF EXISTS trg_crm_deal_projects_has_crm_deal ON crm_deal_projects;
  CREATE TRIGGER trg_crm_deal_projects_has_crm_deal
    AFTER INSERT OR DELETE OR UPDATE OF project_id ON crm_deal_projects
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_crm_deal_projects_sync_has_crm_deal();
END;
$$;

-- ── 6. Kiểm tra sau khi chạy ──────────────────────────────────────────────────
-- Số phải khớp với độ dài mảng wonIds mà backend đang tính (hiện tại: 581).
--
--   SELECT count(*) FILTER (WHERE has_crm_deal) AS co_deal,
--          count(*)                            AS tong
--   FROM projects;
--
-- Đối chiếu không còn dòng nào lệch (kết quả phải RỖNG):
--
--   SELECT p.id, p.code, p.has_crm_deal
--   FROM projects p
--   WHERE p.has_crm_deal IS DISTINCT FROM (
--     EXISTS (SELECT 1 FROM crm_leads l WHERE l.project_id = p.id AND l.type = 'deal')
--     OR EXISTS (SELECT 1 FROM crm_deal_projects j WHERE j.project_id = p.id)
--   );
