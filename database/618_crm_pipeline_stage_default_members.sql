-- 618: CRM Pipeline — tự thêm thành viên CRM khi deal vào cột
-- (lúc kéo Kanban / lập kế hoạch SX tại cột Thắng).
-- Idempotent.

BEGIN;

ALTER TABLE crm_pipeline_stages
  ADD COLUMN IF NOT EXISTS auto_add_members_on_enter BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN crm_pipeline_stages.auto_add_members_on_enter IS
  'Khi bật: mỗi lần lead/deal vào cột này, thêm NV trong crm_pipeline_stage_default_members vào tab Thành viên (không ghi đè phụ trách).';

CREATE TABLE IF NOT EXISTS crm_pipeline_stage_default_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID NOT NULL REFERENCES crm_pipeline_stages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (stage_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_stage_default_members_stage
  ON crm_pipeline_stage_default_members (stage_id);

CREATE INDEX IF NOT EXISTS idx_crm_stage_default_members_user
  ON crm_pipeline_stage_default_members (user_id);

COMMENT ON TABLE crm_pipeline_stage_default_members IS
  'NV CRM tự thêm vào tab Thành viên khi deal/lead vào cột pipeline.';

ALTER TABLE crm_pipeline_stage_default_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm_pipeline_stage_default_members_all ON crm_pipeline_stage_default_members;
CREATE POLICY crm_pipeline_stage_default_members_all
  ON crm_pipeline_stage_default_members FOR ALL USING (true) WITH CHECK (true);

-- Seed Phúc Đạt: cột Đã ký hợp đồng (Thắng) ← Hoàng Thị Phượng Vân
DO $$
DECLARE
  v_pd UUID := '29677f68-967e-4256-92fd-492bb580e888';
  v_van UUID := '83c00741-0828-4e7f-b3bc-b2cfa8ccecc5';
  n_flag INT := 0;
  n_mem INT := 0;
BEGIN
  SELECT id INTO v_pd
  FROM companies
  WHERE id = '29677f68-967e-4256-92fd-492bb580e888'
     OR short_name ILIKE 'Phúc Đạt'
     OR name ILIKE '%Phúc Đạt%'
  ORDER BY CASE WHEN id = '29677f68-967e-4256-92fd-492bb580e888' THEN 0 ELSE 1 END
  LIMIT 1;

  SELECT id INTO v_van
  FROM users
  WHERE id = '83c00741-0828-4e7f-b3bc-b2cfa8ccecc5'
     OR lower(trim(email)) = 'phuongvanhoang1505@gmail.com'
  ORDER BY CASE WHEN id = '83c00741-0828-4e7f-b3bc-b2cfa8ccecc5' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_pd IS NULL OR v_van IS NULL THEN
    RAISE NOTICE '618 seed: thiếu công ty Phúc Đạt hoặc NV Vân — bỏ qua seed.';
    RETURN;
  END IF;

  UPDATE crm_pipeline_stages s
  SET auto_add_members_on_enter = true
  FROM crm_pipelines p
  WHERE p.id = s.pipeline_id
    AND p.company_id = v_pd
    AND s.pipeline_type = 'deal'
    AND s.is_won = true
    AND s.is_active IS DISTINCT FROM false;
  GET DIAGNOSTICS n_flag = ROW_COUNT;

  INSERT INTO crm_pipeline_stage_default_members (stage_id, user_id, order_index)
  SELECT s.id, v_van, 0
  FROM crm_pipeline_stages s
  JOIN crm_pipelines p ON p.id = s.pipeline_id
  WHERE p.company_id = v_pd
    AND s.pipeline_type = 'deal'
    AND s.is_won = true
    AND s.is_active IS DISTINCT FROM false
    AND NOT EXISTS (
      SELECT 1 FROM crm_pipeline_stage_default_members m
      WHERE m.stage_id = s.id AND m.user_id = v_van
    );
  GET DIAGNOSTICS n_mem = ROW_COUNT;

  RAISE NOTICE '618 seed Phúc Đạt: bật cờ=% | thêm Vân=%', n_flag, n_mem;
END $$;

COMMIT;
