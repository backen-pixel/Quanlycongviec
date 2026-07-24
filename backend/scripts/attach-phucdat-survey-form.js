/**
 * Attach condensed survey form to Phúc Đạt «Hình ảnh thực tế» + sync existing tasks.
 * Prefers frontend export: scripts/_tmp_survey_form_config.json
 * Usage: node scripts/attach-phucdat-survey-form.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';

const PHUC_DAT_COMPANY_ID = '29677f68-967e-4256-92fd-492bb580e888';
const TEMPLATE_ITEM_ID = '722b6f82-31e4-4c79-851e-a976194d5a1b';

function loadFormConfig() {
  const jsonPath = path.join(__dirname, '_tmp_survey_form_config.json');
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Thiếu ${jsonPath} — chạy export từ frontend/src/lib/taskFillForm.js trước`);
  }
  return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
}

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

  const formConfig = loadFormConfig();
  const formJson = JSON.stringify(formConfig).replace(/'/g, "''");
  console.log(`Preset: ${formConfig.fields?.length || 0} fields — ${(formConfig.fields || []).map((f) => f.id).join(', ')}`);

  const sql = `
UPDATE crm_task_template_items
SET show_fill_form = true, form_config = '${formJson}'::jsonb
WHERE id = '${TEMPLATE_ITEM_ID}';

UPDATE crm_tasks t
SET show_fill_form = true, form_config = '${formJson}'::jsonb
FROM crm_leads l
WHERE t.lead_id = l.id
  AND l.company_id = '${PHUC_DAT_COMPANY_ID}'
  AND t.title ILIKE 'Hình ảnh thực tế';

SELECT
  (SELECT jsonb_array_length(form_config->'fields') FROM crm_task_template_items WHERE id = '${TEMPLATE_ITEM_ID}') AS tpl_fields,
  (SELECT COUNT(*) FROM crm_tasks t JOIN crm_leads l ON l.id = t.lead_id
    WHERE l.company_id = '${PHUC_DAT_COMPANY_ID}' AND t.title ILIKE 'Hình ảnh thực tế' AND t.show_fill_form) AS tasks_updated;
`;

  for (const target of [
    { ref: PRIMARY_REF, label: 'PRIMARY' },
    { ref: BACKUP_REF, label: 'BACKUP' },
  ]) {
    console.log(`\n========== ${target.label} ==========`);
    try {
      const result = await runQuery(target.ref, sql, `${target.label}/attach`);
      console.log(JSON.stringify(result, null, 2));
    } catch (e) {
      console.error(`FAIL ${target.label}:`, e.message);
      process.exitCode = 1;
    }
  }
}

main();
