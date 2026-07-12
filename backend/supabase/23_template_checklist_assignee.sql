-- Migration 23: Add default_assignee_id to template checklists
-- Allows assigning default employee to checklist items in templates

ALTER TABLE company_template_checklists
ADD COLUMN IF NOT EXISTS default_assignee_id UUID REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN company_template_checklists.default_assignee_id IS 'Nhân viên mặc định được gán cho checklist item';
