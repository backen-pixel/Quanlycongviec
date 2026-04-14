-- Cờ chia sẻ rõ ràng cho xưởng (thay thế dần heuristic từ khóa trong notes)
ALTER TABLE lead_documents ADD COLUMN IF NOT EXISTS shared_to_workshop BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN lead_documents.shared_to_workshop IS 'CRM: tài liệu này hiển thị ở module Sản xuất / xưởng';

ALTER TABLE crm_activities ADD COLUMN IF NOT EXISTS shared_to_workshop BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN crm_activities.shared_to_workshop IS 'CRM: ghi chú / hoạt động hiển thị ở module Sản xuất';

CREATE INDEX IF NOT EXISTS idx_lead_documents_shared_workshop ON lead_documents (project_id) WHERE shared_to_workshop = true;
CREATE INDEX IF NOT EXISTS idx_crm_activities_shared_workshop ON crm_activities (lead_id) WHERE shared_to_workshop = true;
