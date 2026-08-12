/**
 * Migration 500: Nhiệm vụ VC/LĐ Tiếp nhận / Đã giao / Nghiệm thu - bàn giao
 * Usage: node scripts/run-migration-500.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '500_vc_ld_stage_photo_tasks.sql'),
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
  try { return JSON.parse(text); } catch { return text; }
}

async function main() {
  if (!TOKEN) throw new Error('Thiếu SUPABASE_ACCESS_TOKEN');
  for (const [ref, label] of [[PRIMARY_REF, 'PRIMARY'], [BACKUP_REF, 'BACKUP']]) {
    console.log(`\n=== ${label} ===`);
    await runQuery(ref, SQL, label);
    const rows = await runQuery(ref, `
      SELECT s.order_index, s.name AS stage, t.name AS template, i.order_index AS item_ord, i.title,
             i.completion_requires_file_or_note AS need_file, i.required_evidence_file_types AS evidence
      FROM workshop_task_templates t
      JOIN logistics_pipeline_stages s ON s.id = t.logistics_stage_id
      JOIN workshop_task_template_items i ON i.template_id = t.id
      WHERE t.company_id = '29677f68-967e-4256-92fd-492bb580e888'
        AND t.workshop_area = 'logistics'
        AND t.is_active
        AND s.name IN ('Tiếp nhận', 'Đã giao', 'Nghiệm thu - bàn giao')
      ORDER BY s.order_index, i.order_index
    `, `${label}-verify`);
    console.table(rows);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
