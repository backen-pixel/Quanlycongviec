/**
 * Tắt blocks_stage_advance trên mọi mục bộ mẫu SX của NextGo.
 * Usage: node scripts/clear-nextgo-sx-task-blocks.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';

const SQL = `
UPDATE workshop_task_template_items i
SET blocks_stage_advance = false
FROM workshop_task_templates t
JOIN companies c ON c.id = t.company_id
WHERE i.template_id = t.id
  AND t.workshop_area = 'production'
  AND (c.name ILIKE '%NextGo%' OR c.short_name ILIKE '%NextGo%');

-- Cũng bỏ chặn trên nhiệm vụ dự án SX NextGo đã gen (nếu còn)
UPDATE tasks tk
SET blocks_stage_advance = false
FROM projects p
JOIN companies c ON c.id = p.company_id
WHERE tk.project_id = p.id
  AND (c.name ILIKE '%NextGo%' OR c.short_name ILIKE '%NextGo%')
  AND COALESCE(tk.blocks_stage_advance, false) = true;

SELECT t.name AS template,
       COUNT(*) FILTER (WHERE COALESCE(i.blocks_stage_advance, false)) AS blocking,
       COUNT(*) AS total
FROM workshop_task_templates t
JOIN companies c ON c.id = t.company_id
JOIN workshop_task_template_items i ON i.template_id = t.id
WHERE t.workshop_area = 'production'
  AND (c.name ILIKE '%NextGo%' OR c.short_name ILIKE '%NextGo%')
GROUP BY t.name
ORDER BY t.name;
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
    console.error('Thiếu SUPABASE_ACCESS_TOKEN');
    process.exit(1);
  }
  for (const target of [
    { ref: PRIMARY_REF, label: 'PRIMARY' },
    { ref: BACKUP_REF, label: 'BACKUP' },
  ]) {
    console.log(`\n========== ${target.label} ==========`);
    try {
      const out = await runQuery(target.ref, SQL, target.label);
      console.log(JSON.stringify(out, null, 2));
    } catch (e) {
      console.error(`FAIL ${target.label}:`, e.message);
      process.exitCode = 1;
    }
  }
}

main();
