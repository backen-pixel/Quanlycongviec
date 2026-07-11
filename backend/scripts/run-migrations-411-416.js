/**
 * Chạy migration 411–416 trên Primary + Backup (idempotent).
 * Usage: node scripts/run-migrations-411-416.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';

const ROOT = path.join(__dirname, '..', '..', 'database');
const MIGRATIONS = [
  { file: '411_external_api_keys_refresh_token.sql', label: '411 refresh token' },
  { file: '412_production_pipeline_stage_default_staff.sql', label: '412 stage default staff' },
  { file: '413_production_pipeline_stage_staff_kinds.sql', label: '413 staff kinds' },
  { file: '414_phuc_dat_logistics_ngoc_linh.sql', label: '414 Phuc Dat VC/LD' },
  { file: '415_logistics_handover_settings_ngoc_linh.sql', label: '415 logistics handover' },
  { file: '415_vpt_deal_pipeline_revert_to_lead_first.sql', label: '415 VPT pipeline order' },
  { file: '416_vc_mobile_app.sql', label: '416 vc-mobile app' },
];

const VERIFY_SQL = `
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='external_api_keys' AND column_name='refresh_token') AS c411,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='production_pipeline_stages' AND column_name='auto_add_members_on_enter') AS c412,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='production_pipeline_stage_default_staff' AND column_name='staff_kind') AS c413,
  to_regclass('public.logistics_handover_settings') IS NOT NULL AS t415_logistics,
  EXISTS (SELECT 1 FROM mobile_apps WHERE app_key='vc-mobile') AS c416;
`;

async function runQuery(ref, query, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${label}] ${res.status}: ${text}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function main() {
  if (!TOKEN) {
    console.error('Thiếu SUPABASE_ACCESS_TOKEN trong backend/.env');
    process.exit(1);
  }

  for (const target of [
    { ref: PRIMARY_REF, label: 'PRIMARY' },
    { ref: BACKUP_REF, label: 'BACKUP' },
  ]) {
    console.log(`\n========== ${target.label} (${target.ref}) ==========`);
    for (const mig of MIGRATIONS) {
      const sqlPath = path.join(ROOT, mig.file);
      if (!fs.existsSync(sqlPath)) {
        console.warn(`Skip missing file: ${mig.file}`);
        continue;
      }
      const sql = fs.readFileSync(sqlPath, 'utf8');
      console.log(`--- ${mig.label} ---`);
      try {
        await runQuery(target.ref, sql, `${target.label}/${mig.file}`);
        console.log('OK');
      } catch (e) {
        console.error(`FAIL ${mig.file}:`, e.message);
      }
    }
    const verify = await runQuery(target.ref, VERIFY_SQL, `${target.label} verify`);
    console.log('Verify:', JSON.stringify(verify));
  }
  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
