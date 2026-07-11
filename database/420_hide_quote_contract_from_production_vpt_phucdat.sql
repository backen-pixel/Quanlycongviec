-- 420: Ẩn file/ghi chú nhiệm vụ Báo giá & Hợp đồng khỏi SX (VPT + Phúc Đạt)
-- Tắt chia sẻ đã bật nhầm khi deal đã có project_id (auto-share).

BEGIN;

-- 1) crm_task_attachments trên nhiệm vụ Báo giá / Hợp đồng / Bản hợp đồng
UPDATE crm_task_attachments a
SET shared_to_project = false,
    allowed_share_modules = NULL
FROM crm_tasks t
JOIN crm_leads l ON l.id = t.lead_id
WHERE a.task_id = t.id
  AND a.shared_to_project = true
  AND l.company_id IN (
    '29677f68-967e-4256-92fd-492bb580e888', -- Phúc Đạt
    '991dc79d-cbf5-49f9-a364-35227cb47635'  -- VPT
  )
  AND COALESCE(t.stage_slug, '') NOT LIKE 'sx_%'
  AND (
    lower(trim(both FROM t.title)) IN ('báo giá', 'hợp đồng', 'bản hợp đồng')
    OR lower(trim(both FROM t.title)) = ' bản hợp đồng'
  );

-- 2) lead_documents đồng bộ từ các attachment / stage báo giá–hợp đồng
UPDATE lead_documents ld
SET shared_to_workshop = false,
    allowed_share_modules = NULL
FROM crm_leads l
WHERE ld.lead_id = l.id
  AND ld.shared_to_workshop = true
  AND l.company_id IN (
    '29677f68-967e-4256-92fd-492bb580e888',
    '991dc79d-cbf5-49f9-a364-35227cb47635'
  )
  AND COALESCE(ld.crm_stage_slug, '') NOT LIKE 'sx_%'
  AND (
    ld.crm_stage_slug IN ('deal_quote_contract', 'quotation', 'contract', 'quoted')
    OR ld.crm_stage_slug ILIKE '%bao_gia%'
    OR ld.crm_stage_slug ILIKE '%hop_ong%'
    OR ld.crm_stage_group_label ILIKE '%báo giá%hợp đồng%'
    OR ld.crm_stage_group_label ILIKE '%Báo giá & Hợp đồng%'
    OR ld.name ILIKE '[Báo giá]%'
    OR ld.name ILIKE '[Hợp đồng]%'
    OR ld.name ILIKE '[ Bản hợp đồng]%'
    OR ld.name ILIKE '[Bản hợp đồng]%'
  );

-- 3) Đảm bảo mẫu nhiệm vụ không mặc định chia sẻ SX
UPDATE crm_task_template_items i
SET default_shared_to_project = false,
    default_allowed_share_modules = NULL
FROM crm_task_templates t
JOIN crm_pipeline_stages s ON s.id = t.pipeline_stage_id
JOIN crm_pipelines p ON p.id = s.pipeline_id
WHERE i.template_id = t.id
  AND p.company_id IN (
    '29677f68-967e-4256-92fd-492bb580e888',
    '991dc79d-cbf5-49f9-a364-35227cb47635'
  )
  AND (
    lower(trim(both FROM i.title)) IN ('báo giá', 'hợp đồng', 'bản hợp đồng')
    OR lower(trim(both FROM i.title)) = ' bản hợp đồng'
  );

COMMIT;
