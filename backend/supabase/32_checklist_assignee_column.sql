-- Migration 32: Add assignee_id to task_checklists
-- Tách assignee_id ra khỏi notes JSON

-- 1. Thêm cột assignee_id
ALTER TABLE task_checklists ADD COLUMN IF NOT EXISTS assignee_id UUID REFERENCES users(id);

-- 2. Index
CREATE INDEX IF NOT EXISTS idx_task_checklists_assignee ON task_checklists(assignee_id);

-- 3. Comment
COMMENT ON COLUMN task_checklists.assignee_id IS 'User được giao checklist item này';

-- 4. Migrate data: Extract assignee_id từ notes JSON
UPDATE task_checklists
SET assignee_id = (notes::jsonb->>'assignee_id')::uuid
WHERE notes IS NOT NULL 
  AND notes ~ '^\{.*\}$'  -- Is JSON
  AND notes::jsonb ? 'assignee_id';

-- 5. Clean notes: Remove assignee_id từ JSON, chỉ giữ text
UPDATE task_checklists
SET notes = CASE
  WHEN notes IS NOT NULL AND notes ~ '^\{.*\}$' THEN
    COALESCE(notes::jsonb->>'text', NULL)
  ELSE
    notes
END
WHERE notes IS NOT NULL;

-- 6. Verify
SELECT 
  id, 
  title, 
  notes, 
  assignee_id,
  (SELECT full_name FROM users WHERE id = assignee_id) AS assignee_name
FROM task_checklists 
WHERE assignee_id IS NOT NULL OR notes IS NOT NULL
LIMIT 10;
