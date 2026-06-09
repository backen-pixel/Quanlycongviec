-- 303: Cột pipeline SX có thể đánh dấu «chuyển phân loại» khi thẻ vào cột.
-- Ví dụ: cột «Chốt» (Data đầu vào) → chuyển sang Data đầu ra, cột đầu pipeline đích.
-- Cột DB: converts_workshop_type (API/FE alias: is_switch_workshop_type).

BEGIN;

ALTER TABLE production_pipeline_stages
  ADD COLUMN IF NOT EXISTS converts_workshop_type BOOLEAN DEFAULT false;

ALTER TABLE production_pipeline_stages
  ADD COLUMN IF NOT EXISTS target_workshop_type_id UUID
    REFERENCES workshop_project_types(id) ON DELETE SET NULL;

COMMENT ON COLUMN production_pipeline_stages.converts_workshop_type IS
  'Khi bật: kéo thẻ vào cột này hiện hộp xác nhận chuyển phân loại xưởng sang target_workshop_type_id';
COMMENT ON COLUMN production_pipeline_stages.target_workshop_type_id IS
  'Phân loại đích khi converts_workshop_type = true — thẻ chuyển sang cột đầu pipeline của loại này';

-- Metala: cột «Chốt» (Data đầu vào) → Data đầu ra
DO $$
DECLARE
  v_metala_id UUID;
  v_src_type  UUID;
  v_dst_type  UUID;
BEGIN
  SELECT id INTO v_metala_id FROM companies
  WHERE name ILIKE '%Metala%' OR short_name ILIKE '%Metala%'
  ORDER BY name LIMIT 1;

  IF v_metala_id IS NULL THEN
    RAISE NOTICE '303: Không tìm thấy Metala — bỏ qua seed cột Chốt.';
    RETURN;
  END IF;

  SELECT id INTO v_src_type FROM workshop_project_types
  WHERE company_id = v_metala_id AND lower(name) = lower('Data đầu vào') LIMIT 1;

  SELECT id INTO v_dst_type FROM workshop_project_types
  WHERE company_id = v_metala_id AND lower(name) = lower('Data đầu ra') LIMIT 1;

  IF v_src_type IS NULL OR v_dst_type IS NULL THEN
    RAISE NOTICE '303: Chưa có phân loại Data đầu vào/ra — bỏ qua seed.';
    RETURN;
  END IF;

  UPDATE production_pipeline_stages
  SET
    converts_workshop_type = true,
    target_workshop_type_id = v_dst_type,
    is_handover_to_logistics = false
  WHERE company_id = v_metala_id
    AND workshop_type_id = v_src_type
    AND lower(trim(name)) = lower('Chốt');

  RAISE NOTICE '303: Metala Chốt → Data đầu ra (src=%, dst=%)', v_src_type, v_dst_type;
END $$;

COMMIT;
