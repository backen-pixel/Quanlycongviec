-- 544: Đồng bộ công ty theo module cho Bộ Quy Trình dự án
--
-- Trước migration này:
--   · company_template_sets.company_id trống 100% (chỉ trùng tên công ty)
--   · project_company_assignments.company_id trống 100%, company_unit_id là bản sao
--     mẫu luồng nên mọi dự án đều hiện cùng 3 công ty (KD/SX/VC)
--
-- Nguồn chuẩn (SoR): CRM = crm_leads.company_id, SX = projects.company_id,
-- VC = projects.logistics_company_id.

-- 1) Bộ mẫu ← công ty của ecosystem unit sở hữu bộ mẫu
UPDATE company_template_sets ts
SET company_id = u.company_id
FROM ecosystem_units u
WHERE ts.unit_id = u.id
  AND ts.company_id IS NULL
  AND u.company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_company_template_sets_company
  ON company_template_sets (company_id) WHERE company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pca_company
  ON project_company_assignments (company_id) WHERE company_id IS NOT NULL;

-- 2) CRM ← công ty của deal gắn dự án
WITH deal_company AS (
  SELECT DISTINCT ON (l.project_id)
    l.project_id, l.company_id
  FROM crm_leads l
  WHERE l.project_id IS NOT NULL AND l.company_id IS NOT NULL
  ORDER BY l.project_id, (l.type = 'deal') DESC, l.updated_at DESC
)
UPDATE project_company_assignments pca
SET company_id = dc.company_id
FROM deal_company dc
WHERE pca.project_id = dc.project_id
  AND pca.division_unit_id IN (
    SELECT division_unit_id FROM ecosystem_module_scopes WHERE module_key = 'crm'
  )
  AND pca.company_id IS DISTINCT FROM dc.company_id;

-- 3) Sản xuất ← projects.company_id
UPDATE project_company_assignments pca
SET company_id = p.company_id
FROM projects p
WHERE pca.project_id = p.id
  AND p.company_id IS NOT NULL
  AND pca.division_unit_id IN (
    SELECT division_unit_id FROM ecosystem_module_scopes WHERE module_key = 'production'
  )
  AND pca.company_id IS DISTINCT FROM p.company_id;

-- 4) Vận chuyển / Lắp đặt ← projects.logistics_company_id
--    Dự án chưa bàn giao VC giữ NULL để UI hiện "Chưa bàn giao VC/LĐ"
UPDATE project_company_assignments pca
SET company_id = p.logistics_company_id
FROM projects p
WHERE pca.project_id = p.id
  AND p.logistics_company_id IS NOT NULL
  AND pca.division_unit_id IN (
    SELECT division_unit_id FROM ecosystem_module_scopes WHERE module_key = 'logistics'
  )
  AND pca.company_id IS DISTINCT FROM p.logistics_company_id;
