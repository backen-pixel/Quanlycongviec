-- 619: Dọn hạn chồng theo vòng đời CRM → SX → lắp.
-- Không xóa install_date / delivery_date / production_finish_date (lịch sử).
-- Idempotent.

BEGIN;

-- 1) Cột CRM kết thúc (Thua/Thắng/Hoàn thành DT): hết hạn thẻ.
UPDATE public.crm_leads l
SET kanban_deadline_at = NULL,
    kanban_deadline_reason = CASE
      WHEN COALESCE(l.kanban_deadline_reason, '') = '' THEN 'Tắt vì cột CRM đã kết thúc'
      ELSE l.kanban_deadline_reason
    END,
    updated_at = now()
FROM public.crm_pipeline_stages st
WHERE st.id = l.stage_id
  AND l.kanban_deadline_at IS NOT NULL
  AND (
    COALESCE(st.is_lost, false)
    OR COALESCE(st.is_won, false)
    OR COALESCE(st.counts_as_completed_revenue, false)
    OR COALESCE(st.canonical_slug, '') IN ('won', 'lost', 'completed', 'done')
    OR COALESCE(st.deal_report_bucket, '') IN ('won', 'lost')
  );

-- 2) Đã lập SX: hết hạn CRM, chỉ còn hạn xưởng.
UPDATE public.crm_leads
SET kanban_deadline_at = NULL,
    kanban_deadline_reason = 'Tắt vì đã đưa sang sản xuất',
    updated_at = now()
WHERE project_id IS NOT NULL
  AND kanban_deadline_at IS NOT NULL;

-- 3) NV CRM mở trên deal đã kết thúc cột.
UPDATE public.crm_tasks t
SET deadline = NULL,
    updated_at = now()
FROM public.crm_leads l
JOIN public.crm_pipeline_stages st ON st.id = l.stage_id
WHERE t.lead_id = l.id
  AND t.deadline IS NOT NULL
  AND t.status IN ('pending', 'in_progress')
  AND (
    COALESCE(st.is_lost, false)
    OR COALESCE(st.is_won, false)
    OR COALESCE(st.counts_as_completed_revenue, false)
    OR COALESCE(st.canonical_slug, '') IN ('won', 'lost', 'completed', 'done')
  );

-- 4) NV CRM (không phải SX/VC) sau khi đã lập xưởng.
UPDATE public.crm_tasks t
SET deadline = NULL,
    updated_at = now()
FROM public.crm_leads l
WHERE t.lead_id = l.id
  AND l.project_id IS NOT NULL
  AND t.deadline IS NOT NULL
  AND t.status IN ('pending', 'in_progress')
  AND COALESCE(t.stage_slug, '') NOT LIKE 'sx_%'
  AND COALESCE(t.stage_slug, '') NOT LIKE 'vc_%'
  AND COALESCE(t.stage_slug, '') NOT LIKE 'ld_%';

-- 5) Giao việc CRM cùng phạm vi (3)+(4).
UPDATE public.crm_assignments a
SET deadline = NULL,
    updated_at = now()
FROM public.crm_leads l
LEFT JOIN public.crm_pipeline_stages st ON st.id = l.stage_id
WHERE a.lead_id = l.id
  AND a.deadline IS NOT NULL
  AND a.status IN ('pending', 'in_progress')
  AND (
    COALESCE(st.is_lost, false)
    OR COALESCE(st.is_won, false)
    OR COALESCE(st.counts_as_completed_revenue, false)
    OR l.project_id IS NOT NULL
  );

-- 6) SX đã giao / bàn giao VC: hết hạn SX. Giữ ngày giao/lắp/hoàn thiện.
UPDATE public.projects p
SET sx_kanban_deadline_at = NULL,
    sx_kanban_deadline_reason = CASE
      WHEN p.sx_kanban_deadline_at IS NOT NULL THEN 'Tắt vì đã giao / bàn giao lắp'
      ELSE p.sx_kanban_deadline_reason
    END,
    production_deadline = NULL,
    updated_at = now()
WHERE (
    p.sx_kanban_deadline_at IS NOT NULL
    OR p.production_deadline IS NOT NULL
  )
  AND (
    p.logistics_company_id IS NOT NULL
    OR p.vc_kanban_column_id IS NOT NULL
    OR p.status IN ('shipping', 'installing', 'warranty', 'completed')
    OR EXISTS (
      SELECT 1
      FROM public.production_pipeline_stages pps
      WHERE pps.id = p.sx_kanban_column_id
        AND (
          COALESCE(pps.counts_as_completed_revenue, false)
          OR COALESCE(pps.counts_as_collected_revenue, false)
          OR COALESCE(pps.is_handover_to_logistics, false)
          OR pps.name ILIKE '%đã giao%'
          OR pps.name ILIKE '%bàn giao%'
        )
    )
  );

COMMIT;
