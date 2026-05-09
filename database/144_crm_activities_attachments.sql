-- Ghi chú CRM (crm_activities.type = note): đính kèm file/hình
ALTER TABLE crm_activities ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT NULL;
COMMENT ON COLUMN crm_activities.attachments IS 'Mảng đính kèm: [{url, name, type, size}] — url dạng /uploads/...';
