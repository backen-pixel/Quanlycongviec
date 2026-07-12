-- Migration 09: Fix missing columns for attachments in comments/checklists
-- Run after 08_roles_employees.sql

-- Add attachments JSONB to task_checklists if not exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='task_checklists' AND column_name='attachments') THEN
    ALTER TABLE task_checklists ADD COLUMN attachments JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Add attachments JSONB to task_comments if not exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='task_comments' AND column_name='attachments') THEN
    ALTER TABLE task_comments ADD COLUMN attachments JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Add attachments JSONB to project_comments if not exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='project_comments' AND column_name='attachments') THEN
    ALTER TABLE project_comments ADD COLUMN attachments JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Add zalo_id to customers for direct Zalo linking
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='zalo_id') THEN
    ALTER TABLE customers ADD COLUMN zalo_id TEXT;
  END IF;
END $$;

-- Add facebook_id to customers
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='facebook_id') THEN
    ALTER TABLE customers ADD COLUMN facebook_id TEXT;
  END IF;
END $$;
