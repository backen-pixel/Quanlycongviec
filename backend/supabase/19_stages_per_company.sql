-- Migration 19: Quy trình theo Công ty
-- Mỗi Cty có bộ quy trình riêng, thuộc Khối của Cty đó

-- ═══ 1. THÊM company_id CHO workflow_stages ═══
DO $$ BEGIN
  ALTER TABLE workflow_stages ADD COLUMN company_id UUID REFERENCES companies(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_workflow_stages_company ON workflow_stages(company_id);

-- Stages cũ (company_id = NULL) = quy trình mặc định toàn hệ thống

-- ═══ 2. THÊM company_id CHO company_template_sets (Dự án mẫu theo Cty) ═══
-- (company_template_sets đã có unit_id liên kết ecosystem, nhưng thêm company_id trực tiếp cho dễ query)
DO $$ BEGIN
  ALTER TABLE company_template_sets ADD COLUMN company_id UUID REFERENCES companies(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_company_template_sets_company ON company_template_sets(company_id);
