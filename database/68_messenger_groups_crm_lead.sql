-- Gắn nhóm chat nội bộ với lead/deal (một nhóm tối đa mỗi lead)
ALTER TABLE messenger_groups ADD COLUMN IF NOT EXISTS crm_lead_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messenger_groups_crm_lead ON messenger_groups(crm_lead_id) WHERE crm_lead_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_messenger_groups_unique_crm_lead
  ON messenger_groups(crm_lead_id)
  WHERE crm_lead_id IS NOT NULL;
