// One-time migration script: Create approval_rules and project_approvals tables
// Run: node src/migrate-approval.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function migrate() {
  console.log('🔄 Starting approval system migration...');

  // Step 1: Create approval_rules table by inserting a dummy row
  // First check if it exists
  const { error: checkErr } = await supabase.from('approval_rules').select('id').limit(0);

  if (checkErr?.message?.includes('Could not find the table')) {
    console.log('⚠️  Table approval_rules does not exist.');
    console.log('');
    console.log('Please run the following SQL in Supabase Dashboard → SQL Editor:');
    console.log('URL: https://supabase.com/dashboard/project/kdxypztstbeovyedmvem/sql/new');
    console.log('');
    console.log(`
-- ═══ BẢNG QUY TẮC DUYỆT ═══
CREATE TABLE IF NOT EXISTS approval_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID REFERENCES workflow_stages(id) ON DELETE CASCADE NOT NULL,
  approval_mode VARCHAR(20) NOT NULL DEFAULT 'manual',
  auto_condition VARCHAR(50) DEFAULT 'all_tasks_done',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(stage_id)
);

-- ═══ BẢNG DUYỆT DỰ ÁN ═══
CREATE TABLE IF NOT EXISTS project_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  stage_id UUID REFERENCES workflow_stages(id) NOT NULL,
  requested_by UUID REFERENCES users(id) NOT NULL,
  decided_by UUID REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  notes TEXT,
  attachments JSONB DEFAULT '[]'::jsonb,
  reject_reason TEXT,
  approve_notes TEXT,
  next_stage_slug VARCHAR(100),
  next_status VARCHAR(50),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_approvals_project ON project_approvals(project_id);
CREATE INDEX IF NOT EXISTS idx_project_approvals_status ON project_approvals(status);
CREATE INDEX IF NOT EXISTS idx_project_approvals_stage ON project_approvals(stage_id);
CREATE INDEX IF NOT EXISTS idx_project_approvals_requested_by ON project_approvals(requested_by);

-- RLS
ALTER TABLE approval_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_approval_rules" ON approval_rules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_project_approvals" ON project_approvals FOR ALL USING (true) WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE project_approvals;

-- Seed default rules
INSERT INTO approval_rules (stage_id, approval_mode, auto_condition, description)
SELECT id, 'manual', 'all_tasks_done', 'Bắt buộc chờ duyệt từ quản lý'
FROM workflow_stages
ON CONFLICT (stage_id) DO NOTHING;
    `);
    console.log('');
    console.log('After running the SQL, re-run this script to verify.');
  } else {
    console.log('✅ Table approval_rules exists');

    // Check rules count
    const { data: rules } = await supabase.from('approval_rules').select('id, stage_id, approval_mode');
    console.log(`   ${rules?.length || 0} rules configured`);
  }

  // Check project_approvals
  const { error: checkErr2 } = await supabase.from('project_approvals').select('id').limit(0);
  if (checkErr2?.message?.includes('Could not find the table')) {
    console.log('⚠️  Table project_approvals does not exist (see SQL above)');
  } else {
    console.log('✅ Table project_approvals exists');
    const { data: approvals } = await supabase.from('project_approvals').select('id, status');
    console.log(`   ${approvals?.length || 0} approval records`);
  }
}

migrate().catch(console.error);
