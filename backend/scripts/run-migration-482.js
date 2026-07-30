/**
 * Migration 482: Task «Hình ảnh thực tế» trên deal hiện có không chặn chuyển giai đoạn.
 * Usage: node scripts/run-migration-482.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '482_existing_deal_actual_images_remove_stage_blocks.sql'),
  'utf8',
);

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

  const verifySql = `
SELECT c.name AS company,
       COUNT(*) AS task_count,
       COUNT(*) FILTER (
         WHERE COALESCE(t.blocks_stage_advance, false)
            OR COALESCE(t.completion_requires_file_or_note, false)
            OR COALESCE(t.required_evidence_file_types, '[]'::jsonb) <> '[]'::jsonb
            OR COALESCE(t.requires_quick_verdict, false)
       ) AS still_blocking
FROM crm_tasks t
JOIN crm_leads l ON l.id = t.lead_id
JOIN companies c ON c.id = l.company_id
WHERE l.type = 'deal'
  AND LOWER(TRIM(t.title)) = LOWER('Hình ảnh thực tế')
GROUP BY c.name
ORDER BY c.name;
`;

  for (const target of [
    { ref: PRIMARY_REF, label: 'PRIMARY' },
    { ref: BACKUP_REF, label: 'BACKUP' },
  ]) {
    console.log(`\n========== ${target.label} ==========`);
    try {
      await runQuery(target.ref, SQL, `${target.label}/482`);
      const verify = await runQuery(target.ref, verifySql, `${target.label}/verify`);
      console.log('Verify:', JSON.stringify(verify));
    } catch (e) {
      console.error(`FAIL ${target.label}:`, e.message);
      process.exitCode = 1;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
