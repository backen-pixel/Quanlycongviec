-- ═══════════════════════════════════════════════════════════════
-- 21. CRM Pipelines — Ống bán hàng theo Công ty
-- ═══════════════════════════════════════════════════════════════

-- 1. Bảng crm_pipelines: mỗi pipeline = 1 công ty
CREATE TABLE IF NOT EXISTS crm_pipelines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Thêm pipeline_id vào pipeline_stages
ALTER TABLE crm_pipeline_stages
  ADD COLUMN IF NOT EXISTS pipeline_id UUID REFERENCES crm_pipelines(id) ON DELETE CASCADE;

-- 3. Thêm pipeline_id vào leads
ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS pipeline_id UUID REFERENCES crm_pipelines(id) ON DELETE SET NULL;

-- 4. RLS
ALTER TABLE crm_pipelines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crm_pipelines_all" ON crm_pipelines;
CREATE POLICY "crm_pipelines_all" ON crm_pipelines FOR ALL USING (true) WITH CHECK (true);

-- 5. Index
CREATE INDEX IF NOT EXISTS idx_crm_pipelines_company ON crm_pipelines(company_id);
CREATE INDEX IF NOT EXISTS idx_crm_pipeline_stages_pipeline ON crm_pipeline_stages(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_pipeline ON crm_leads(pipeline_id);

-- ═══════════════════════════════════════════════════════════════
-- AUTO-MIGRATE: Tạo pipeline mặc định từ companies + gán stages cũ
-- ═══════════════════════════════════════════════════════════════

-- Tạo 1 pipeline mặc định "Pipeline Chung" cho stages cũ (chưa có pipeline_id)
INSERT INTO crm_pipelines (id, name, description, is_default, is_active)
VALUES ('00000000-0000-0000-0000-000000000001', 'Pipeline Chung', 'Pipeline mặc định cho lead/deal cũ', true, true)
ON CONFLICT DO NOTHING;

-- Gán tất cả stages cũ (pipeline_id IS NULL) vào pipeline chung
UPDATE crm_pipeline_stages SET pipeline_id = '00000000-0000-0000-0000-000000000001' WHERE pipeline_id IS NULL;

-- Gán tất cả leads cũ (pipeline_id IS NULL) vào pipeline chung
UPDATE crm_leads SET pipeline_id = '00000000-0000-0000-0000-000000000001' WHERE pipeline_id IS NULL;
