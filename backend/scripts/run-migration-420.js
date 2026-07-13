/**
 * Chạy migration 420 trên Primary + Backup và verify 100%.
 * Usage: node scripts/run-migration-420.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const SQL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '420_hide_quote_contract_from_production_vpt_phucdat.sql'),
  'utf8',
);

const VERIFY_SQL = `
WITH cos AS (
  SELECT unnest(ARRAY[
    '29677f68-967e-4256-92fd-492bb580e888'::uuid,
    '991dc79d-cbf5-49f9-a364-35227cb47635'::uuid
  ]) AS company_id
)
SELECT
  (SELECT COUNT(*)::int
   FROM crm_task_attachments a
   JOIN crm_tasks t ON t.id = a.task_id
   JOIN crm_leads l ON l.id = t.lead_id
   WHERE l.company_id IN (SELECT company_id FROM cos)
     AND a.shared_to_project = true
     AND COALESCE(t.stage_slug,'') NOT LIKE 'sx_%'
     AND (trim(t.title) ILIKE 'báo giá' OR trim(t.title) ILIKE 'hợp đồng' OR trim(t.title) ILIKE 'bản hợp đồng')
  ) AS leak_attachments,
  (SELECT COUNT(*)::int
   FROM lead_documents ld
   JOIN crm_leads l ON l.id = ld.lead_id
   WHERE l.company_id IN (SELECT company_id FROM cos)
     AND ld.shared_to_workshop = true
     AND COALESCE(ld.crm_stage_slug,'') NOT LIKE 'sx_%'
     AND (
       ld.crm_stage_slug IN ('deal_quote_contract','quotation','contract','quoted')
       OR ld.crm_stage_slug ILIKE '%bao_gia%'
       OR ld.crm_stage_slug ILIKE '%hop_ong%'
       OR ld.crm_stage_group_label ILIKE '%Báo giá & Hợp đồng%'
       OR ld.name ILIKE '[Báo giá]%'
       OR ld.name ILIKE '[Hợp đồng]%'
       OR ld.name ILIKE '[ Bản hợp đồng]%'
       OR ld.name ILIKE '[Bản hợp đồng]%'
     )
  ) AS leak_lead_documents,
  (SELECT COUNT(*)::int
   FROM crm_task_template_items i
   JOIN crm_task_templates t ON t.id = i.template_id
   JOIN crm_pipeline_stages s ON s.id = t.pipeline_stage_id
   JOIN crm_pipelines p ON p.id = s.pipeline_id
   WHERE p.company_id IN (SELECT company_id FROM cos)
     AND (trim(i.title) ILIKE 'báo giá' OR trim(i.title) ILIKE 'hợp đồng' OR trim(i.title) ILIKE 'bản hợp đồng')
     AND i.default_shared_to_project IS TRUE
  ) AS template_still_sharing,
  (SELECT COUNT(*)::int
   FROM lead_documents ld
   JOIN crm_leads l ON l.id = ld.lead_id
   WHERE l.company_id IN (SELECT company_id FROM cos)
     AND ld.shared_to_workshop = true
     AND ld.crm_stage_slug LIKE 'sx_%'
     AND (ld.name ILIKE '%BÁO GIÁ%' OR ld.name ILIKE '%báo giá%')
  ) AS sx_bao_gia_still_ok;
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

  let allOk = true;
  for (const target of [
    { ref: PRIMARY_REF, label: 'PRIMARY' },
    { ref: BACKUP_REF, label: 'BACKUP' },
  ]) {
    console.log(`\n========== ${target.label} ==========`);
    await runQuery(target.ref, SQL, `${target.label}/420`);
    console.log('Migration 420 applied');

    const verify = await runQuery(target.ref, VERIFY_SQL, `${target.label}/verify`);
    const row = Array.isArray(verify) ? verify[0] : verify;
    console.log(JSON.stringify(row, null, 2));

    const leakAtt = Number(row?.leak_attachments || 0);
    const leakDoc = Number(row?.leak_lead_documents || 0);
    const tplBad = Number(row?.template_still_sharing || 0);
    const sxOk = Number(row?.sx_bao_gia_still_ok || 0);

    if (leakAtt !== 0 || leakDoc !== 0 || tplBad !== 0) {
      console.error(`FAIL ${target.label}: còn leak (att=${leakAtt}, doc=${leakDoc}, tpl=${tplBad})`);
      allOk = false;
    } else {
      console.log(`PASS ${target.label}: 0 leak | SX BÁO GIÁ vẫn share được: ${sxOk}`);
    }
  }

  if (!allOk) process.exit(1);
  console.log('\n✅ Migration 420 PRIMARY + BACKUP — verify 100% OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
