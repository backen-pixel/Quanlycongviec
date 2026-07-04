/** 507 cho BACKUP — bỏ FK user_id vì public.users thiếu PRIMARY KEY trên backup. */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';

const sql = `
CREATE TABLE IF NOT EXISTS ai_bot_user_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  skill_type TEXT NOT NULL DEFAULT 'scheduled_report'
    CHECK (skill_type IN ('scheduled_report', 'preference', 'instruction')),
  title TEXT NOT NULL,
  summary TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  schedule_id UUID REFERENCES ai_chat_bot_schedules(id) ON DELETE SET NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  source TEXT NOT NULL DEFAULT 'user_chat'
    CHECK (source IN ('user_chat', 'admin_ui', 'derived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_bot_skills_user ON ai_bot_user_skills(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_bot_skills_schedule ON ai_bot_user_skills(schedule_id);
ALTER TABLE ai_chat_bot_user_facts DROP CONSTRAINT IF EXISTS ai_chat_bot_user_facts_fact_type_check;
ALTER TABLE ai_chat_bot_user_facts ADD CONSTRAINT ai_chat_bot_user_facts_fact_type_check CHECK (fact_type IN ('habit', 'preference', 'context', 'correction', 'automation'));
ALTER TABLE ai_chat_bot_playbooks DROP CONSTRAINT IF EXISTS ai_chat_bot_playbooks_data_source_check;
ALTER TABLE ai_chat_bot_playbooks ADD CONSTRAINT ai_chat_bot_playbooks_data_source_check CHECK (data_source IN ('channel_context', 'kpi', 'none', 'company_report', 'company_daily', 'org_overview'));
INSERT INTO ai_chat_bot_playbooks (code, name, description, icon, data_source, system_prompt, max_tokens, temperature, is_builtin, enabled)
SELECT 'company_daily_report', 'Báo cáo công ty (tự động)', 'Gửi báo cáo nhanh lead/deal/thắng/thua theo kỳ.', '📊', 'company_daily', 'Playbook lịch tự động.', 100, 0.1, false, true
WHERE NOT EXISTS (SELECT 1 FROM ai_chat_bot_playbooks WHERE code = 'company_daily_report');
INSERT INTO ai_chat_bot_playbooks (code, name, description, icon, data_source, system_prompt, max_tokens, temperature, is_builtin, enabled)
SELECT 'org_overview_report', 'Báo cáo tổ chức (tự động)', 'Gửi BC tổ chức / doanh thu.', '📈', 'org_overview', 'Playbook lịch tự động.', 100, 0.1, false, true
WHERE NOT EXISTS (SELECT 1 FROM ai_chat_bot_playbooks WHERE code = 'org_overview_report');
`;

async function main() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text);
  console.log('BACKUP 507 OK');
  const v = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({
      query: `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_bot_user_skills') AS ok,
        (SELECT COUNT(*)::int FROM ai_chat_bot_playbooks WHERE code IN ('company_daily_report','org_overview_report')) AS pb`,
    }),
  });
  console.log(await v.json());
}

main().catch((e) => { console.error(e.message); process.exit(1); });
