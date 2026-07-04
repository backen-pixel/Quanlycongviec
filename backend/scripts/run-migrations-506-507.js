/**
 * Chạy migration 506 + 507 trên Primary và Backup qua Supabase Management API.
 * Usage: node scripts/run-migrations-506-507.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';

const FILES = [
  path.join(__dirname, '..', '..', 'database', '506_ai_chat_bot_lead_expiring_tomorrow.sql'),
  path.join(__dirname, '..', '..', 'database', '507_ai_bot_user_skills.sql'),
];

async function runQuery(projectRef, label, sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`[${label}] HTTP ${res.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return body;
}

async function verify(projectRef, label) {
  const checks = await runQuery(projectRef, label, `
    SELECT
      EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_bot_user_skills') AS has_skills,
      (SELECT COUNT(*)::int FROM ai_chat_bot_playbooks WHERE code IN ('company_daily_report','org_overview_report')) AS new_playbooks,
      (SELECT COUNT(*)::int FROM ai_chat_bot_playbooks WHERE code = 'lead_deadline_expired' AND system_prompt LIKE '%leads_expiring_tomorrow%') AS playbook_506;
  `);
  return checks;
}

async function main() {
  if (!TOKEN) {
    console.error('Thiếu SUPABASE_ACCESS_TOKEN trong backend/.env');
    process.exit(1);
  }

  const targets = [
    { ref: PRIMARY_REF, label: 'PRIMARY' },
    { ref: BACKUP_REF, label: 'BACKUP' },
  ];

  for (const file of FILES) {
    const name = path.basename(file);
    const sql = fs.readFileSync(file, 'utf8');
    console.log(`\n=== ${name} ===`);
    for (const t of targets) {
      try {
        await runQuery(t.ref, t.label, sql);
        console.log(`  ✓ ${t.label} (${t.ref})`);
      } catch (e) {
        console.error(`  ✗ ${t.label}: ${e.message}`);
      }
    }
  }

  console.log('\n=== Verify ===');
  for (const t of targets) {
    try {
      const v = await verify(t.ref, t.label);
      const row = Array.isArray(v) ? v[0] : v;
      console.log(`  ${t.label}: skills=${row?.has_skills} playbooks=${row?.new_playbooks} 506_ok=${row?.playbook_506}`);
    } catch (e) {
      console.error(`  ${t.label} verify: ${e.message}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
