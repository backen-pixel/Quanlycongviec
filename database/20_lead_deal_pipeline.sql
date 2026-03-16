-- =====================================================
-- 20_lead_deal_pipeline.sql
-- Refactor CRM: Separate Lead & Deal Pipelines
-- =====================================================

-- ─────────────────────────────────────────────────────
-- 1. ADD COLUMNS TO EXISTING TABLES
-- ─────────────────────────────────────────────────────

-- Add pipeline_type to crm_pipeline_stages
ALTER TABLE crm_pipeline_stages 
ADD COLUMN IF NOT EXISTS pipeline_type TEXT DEFAULT 'lead'; -- 'lead' or 'deal'

-- Add type to crm_leads (to distinguish between lead and deal)
ALTER TABLE crm_leads 
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'lead'; -- 'lead' or 'deal'

-- ─────────────────────────────────────────────────────
-- 2. CREATE LEAD DOCUMENTS TABLE
-- ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lead_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  doc_type TEXT DEFAULT 'other', -- drawing, image, contract, requirement, other
  file_url TEXT,
  file_name TEXT,
  file_size INT,
  mime_type TEXT,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_documents_lead_id ON lead_documents(lead_id);

ALTER TABLE lead_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all" ON lead_documents FOR ALL USING (true);

-- ─────────────────────────────────────────────────────
-- 3. SETUP LEAD PIPELINE STAGES
-- ─────────────────────────────────────────────────────

-- Mark existing stages as "lead" type and optionally disable them
DO $$
BEGIN
  -- Check if we already have new lead stages
  IF NOT EXISTS (
    SELECT 1 FROM crm_pipeline_stages 
    WHERE name = 'Mới' AND pipeline_type = 'lead'
  ) THEN
    -- Update existing stages to lead type (for backward compatibility)
    UPDATE crm_pipeline_stages 
    SET pipeline_type = 'lead', is_active = false 
    WHERE pipeline_type = 'lead' OR pipeline_type IS NULL;

    -- Insert new Lead Pipeline Stages
    INSERT INTO crm_pipeline_stages (name, color, icon, order_index, pipeline_type, is_won, is_lost, is_active) VALUES
      ('Mới', '#94A3B8', '🆕', 1, 'lead', false, false, true),
      ('Đã liên hệ', '#3B82F6', '📞', 2, 'lead', false, false, true),
      ('Đang tư vấn', '#8B5CF6', '💜', 3, 'lead', false, false, true),
      ('Đã gửi thông tin', '#F59E0B', '📋', 4, 'lead', false, false, true),
      ('Chờ phản hồi', '#F97316', '⏳', 5, 'lead', false, false, true),
      ('Chuyển Deal', '#10B981', '✅', 6, 'lead', true, false, true),
      ('Mất', '#EF4444', '❌', 7, 'lead', false, true, true)
    ON CONFLICT DO NOTHING;

    -- Insert Deal Pipeline Stages
    INSERT INTO crm_pipeline_stages (name, color, icon, order_index, pipeline_type, is_won, is_lost, is_active) VALUES
      ('Deal mới', '#06B6D4', '🎯', 1, 'deal', false, false, true),
      ('Báo giá', '#F59E0B', '💰', 2, 'deal', false, false, true),
      ('Đàm phán', '#8B5CF6', '🤝', 3, 'deal', false, false, true),
      ('Ký hợp đồng', '#3B82F6', '✍️', 4, 'deal', false, false, true),
      ('Thắng', '#10B981', '🎉', 5, 'deal', true, false, true),
      ('Thua', '#EF4444', '💔', 6, 'deal', false, true, true)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────
-- 4. UPDATE EXISTING LEADS TO HAVE type='lead'
-- ─────────────────────────────────────────────────────

UPDATE crm_leads 
SET type = 'lead' 
WHERE type IS NULL OR type = '';

-- ─────────────────────────────────────────────────────
-- 5. RLS POLICIES
-- ─────────────────────────────────────────────────────

-- These should already exist from migration 19, but ensuring
ALTER TABLE crm_pipeline_stages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all" ON crm_pipeline_stages;
CREATE POLICY "service_all" ON crm_pipeline_stages FOR ALL USING (true);

ALTER TABLE crm_leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all" ON crm_leads;
CREATE POLICY "service_all" ON crm_leads FOR ALL USING (true);
