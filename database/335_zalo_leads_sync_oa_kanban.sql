-- Đồng bộ lead Zalo đã gắn contact về đúng kanban theo cấu hình OA (OA Phúc Đạt).
-- Áp dụng: pipeline, stage, công ty, khu vực, NV phụ trách, loại lead, nguồn.

UPDATE crm_leads l
SET
  pipeline_id    = oa.default_pipeline_id,
  stage_id       = oa.default_stage_id,
  company_id     = oa.default_company_id,
  region_id      = oa.default_region_id,
  lead_owner_id  = oa.default_lead_owner_id,
  assigned_to    = oa.default_lead_owner_id,
  lead_type_id   = oa.default_lead_type_id,
  source_id      = oa.default_source_id,
  updated_at     = now()
FROM zalo_contacts zc
JOIN zalo_oa_accounts oa ON oa.oa_id = zc.oa_id AND oa.is_active = true
WHERE zc.lead_id = l.id
  AND l.type = 'lead'
  AND oa.oa_id = '2101038814077084150'
  AND (
    l.pipeline_id    IS DISTINCT FROM oa.default_pipeline_id
    OR l.stage_id       IS DISTINCT FROM oa.default_stage_id
    OR l.company_id     IS DISTINCT FROM oa.default_company_id
    OR l.region_id      IS DISTINCT FROM oa.default_region_id
    OR l.lead_owner_id  IS DISTINCT FROM oa.default_lead_owner_id
    OR l.assigned_to    IS DISTINCT FROM oa.default_lead_owner_id
    OR l.lead_type_id   IS DISTINCT FROM oa.default_lead_type_id
    OR l.source_id      IS DISTINCT FROM oa.default_source_id
  );
