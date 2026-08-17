-- Migration 530: workflow_flow_steps.module_key — node luồng = module (CRM / SX / Lắp đặt / custom)
-- Cho phép division_unit_id NULL khi đã có module_key (back-compat: step cũ giữ Khối).

ALTER TABLE workflow_flow_steps
  ADD COLUMN IF NOT EXISTS module_key TEXT;

ALTER TABLE workflow_flow_steps
  ADD COLUMN IF NOT EXISTS handoff_trigger TEXT DEFAULT NULL;

COMMENT ON COLUMN workflow_flow_steps.module_key IS
  'crm | production | logistics | app_modules.module_key — node luồng theo module app';
COMMENT ON COLUMN workflow_flow_steps.handoff_trigger IS
  'on_won | on_stage_flag | manual — khi nào chuyển sang bước kế';

-- Cho phép bước chỉ có module_key (không bắt buộc Khối)
ALTER TABLE workflow_flow_steps
  ALTER COLUMN division_unit_id DROP NOT NULL;

-- Backfill module_key từ tên Khối (nếu chưa có)
UPDATE workflow_flow_steps wfs
SET module_key = CASE
  WHEN eu.name ILIKE '%kinh doanh%' OR eu.name ILIKE '%crm%' OR eu.short_name ILIKE '%kd%' THEN 'crm'
  WHEN eu.name ILIKE '%sản xuất%' OR eu.name ILIKE '%san xuat%' OR eu.short_name ILIKE '%sx%' THEN 'production'
  WHEN eu.name ILIKE '%lắp đặt%' OR eu.name ILIKE '%lap dat%'
    OR eu.name ILIKE '%vận chuyển%' OR eu.name ILIKE '%van chuyen%'
    OR eu.short_name ILIKE '%vc%' OR eu.short_name ILIKE '%ld%' THEN 'logistics'
  ELSE module_key
END
FROM ecosystem_units eu
WHERE wfs.division_unit_id = eu.id
  AND (wfs.module_key IS NULL OR btrim(wfs.module_key) = '');

-- Đảm bảo có ít nhất một luồng mặc định CRM → SX → Lắp đặt (nếu chưa có bước module)
DO $$
DECLARE
  fid UUID;
  step_count INT;
BEGIN
  SELECT id INTO fid FROM workflow_flows
  WHERE is_active = true
  ORDER BY is_default DESC, created_at ASC
  LIMIT 1;

  IF fid IS NULL THEN
    INSERT INTO workflow_flows (name, description, color, icon, is_default, is_active)
    VALUES (
      'Luồng chuẩn CRM → SX → Lắp đặt',
      'Luồng mặc định: CRM (deal thắng) → Sản xuất → Lắp đặt',
      '#0ea5e9',
      '🔄',
      true,
      true
    )
    RETURNING id INTO fid;
  END IF;

  SELECT COUNT(*) INTO step_count FROM workflow_flow_steps WHERE flow_id = fid;

  IF step_count = 0 THEN
    INSERT INTO workflow_flow_steps (flow_id, division_unit_id, module_key, order_index, handoff_trigger, description)
    VALUES
      (fid, NULL, 'crm', 0, 'on_won', 'Deal CRM — thắng kích hoạt bước kế'),
      (fid, NULL, 'production', 1, 'on_stage_flag', 'Xưởng sản xuất'),
      (fid, NULL, 'logistics', 2, 'manual', 'Lắp đặt / vận chuyển');
  ELSE
    -- Bổ sung module_key còn thiếu theo order_index nếu vẫn null sau backfill
    UPDATE workflow_flow_steps SET module_key = 'crm', handoff_trigger = COALESCE(handoff_trigger, 'on_won')
      WHERE flow_id = fid AND order_index = 0 AND (module_key IS NULL OR btrim(module_key) = '');
    UPDATE workflow_flow_steps SET module_key = 'production', handoff_trigger = COALESCE(handoff_trigger, 'on_stage_flag')
      WHERE flow_id = fid AND order_index = 1 AND (module_key IS NULL OR btrim(module_key) = '');
    UPDATE workflow_flow_steps SET module_key = 'logistics', handoff_trigger = COALESCE(handoff_trigger, 'manual')
      WHERE flow_id = fid AND order_index = 2 AND (module_key IS NULL OR btrim(module_key) = '');
  END IF;

  -- Đánh dấu luồng này là mặc định nếu chưa có default
  IF NOT EXISTS (SELECT 1 FROM workflow_flows WHERE is_default = true AND is_active = true) THEN
    UPDATE workflow_flows SET is_default = true WHERE id = fid;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_wfs_module_key ON workflow_flow_steps(flow_id, module_key);
