-- Migration 76: Production deadline + note + incidents for workshop
-- Run: node -e "require('dotenv').config(); const {createClient} = require('@supabase/supabase-js'); const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY); const fs = require('fs'); s.rpc('exec_sql',{sql:fs.readFileSync('database/76_project_production_fields.sql','utf8')}).then(r=>console.log(r))"

-- Ngày giao dự kiến từ xưởng (khác với deadline tổng) + ghi chú nội bộ xưởng
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS production_deadline DATE,
  ADD COLUMN IF NOT EXISTS production_note TEXT;

-- Bảng sự cố xưởng
CREATE TABLE IF NOT EXISTS project_incidents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  reported_by  UUID REFERENCES users(id),
  title        VARCHAR(255) NOT NULL,
  description  TEXT,
  severity     VARCHAR(20) DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  status       VARCHAR(20) DEFAULT 'open'   CHECK (status   IN ('open','in_progress','resolved','closed')),
  resolved_at  TIMESTAMPTZ,
  resolved_by  UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_incidents_project ON project_incidents(project_id);
CREATE INDEX IF NOT EXISTS idx_project_incidents_status  ON project_incidents(status);
