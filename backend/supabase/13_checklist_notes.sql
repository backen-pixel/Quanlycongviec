-- Migration 13: Add notes column to task_checklists + assignee_id to task_templates
-- Run after migration 03 (which creates task_checklists)

-- Add notes column
ALTER TABLE task_checklists ADD COLUMN IF NOT EXISTS notes TEXT;

-- Ensure attachments JSONB exists (redundant safety)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='task_checklists' AND column_name='attachments') THEN
    ALTER TABLE task_checklists ADD COLUMN attachments JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Add assignee_id to task_templates if not exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='task_templates' AND column_name='assignee_id') THEN
    ALTER TABLE task_templates ADD COLUMN assignee_id UUID REFERENCES users(id);
  END IF;
END $$;
