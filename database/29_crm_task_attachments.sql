-- 29: CRM Task Attachments — Ghi chú & File cho từng nhiệm vụ CRM
-- Chạy trên Supabase SQL Editor

-- Thêm cột notes vào crm_tasks
ALTER TABLE crm_tasks ADD COLUMN IF NOT EXISTS notes TEXT;

-- Bảng file đính kèm cho từng task
CREATE TABLE IF NOT EXISTS crm_task_attachments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_url TEXT,
  file_name TEXT,
  file_size INT,
  mime_type TEXT,
  notes TEXT,                          -- ghi chú text nếu không phải file
  doc_type TEXT DEFAULT 'task_note',   -- task_note, image, drawing, measurement, other
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_task_att_task ON crm_task_attachments(task_id);
CREATE INDEX IF NOT EXISTS idx_crm_task_att_lead ON crm_task_attachments(lead_id);

ALTER TABLE crm_task_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all" ON crm_task_attachments;
CREATE POLICY "service_all" ON crm_task_attachments FOR ALL USING (true);
