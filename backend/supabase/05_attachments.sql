-- ═══════════════════════════════════════════════════
-- 05: File Attachments + Enhanced Notifications
-- ═══════════════════════════════════════════════════

-- File attachments (tasks, comments, checklists)
CREATE TABLE IF NOT EXISTS file_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL, -- 'task', 'comment', 'checklist', 'project'
  entity_id UUID NOT NULL,
  file_name VARCHAR(500) NOT NULL,
  file_url TEXT NOT NULL,
  file_size BIGINT DEFAULT 0,
  mime_type VARCHAR(200),
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attachments_entity ON file_attachments(entity_type, entity_id);

-- Add attachments column to task_comments for inline files
ALTER TABLE task_comments ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';

-- Add attachments column to task_checklists for inline files
ALTER TABLE task_checklists ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';

-- Add attachments column to tasks for task-level files
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';

-- RLS
ALTER TABLE file_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all_attachments ON file_attachments;
CREATE POLICY allow_all_attachments ON file_attachments FOR ALL USING (true) WITH CHECK (true);
