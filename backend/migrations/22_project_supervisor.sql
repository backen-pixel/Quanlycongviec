-- Migration 22: Add supervisor to projects
-- Add supervisor_id field to projects table

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS supervisor_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_projects_supervisor ON projects(supervisor_id);

COMMENT ON COLUMN projects.supervisor_id IS 'Người giám sát dự án - có thể xem và theo dõi toàn bộ dự án';
