/**
 * Read-only, PII-safe UAT coverage preflight for one Business OS pilot company.
 *
 * The output contains aggregate counts only. It never creates fixtures, changes
 * process stages, or prints customer names, phone numbers, email addresses.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const token = process.env.SUPABASE_ACCESS_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;

function cliValue(prefix) {
  const entry = process.argv.slice(2).find((value) => value.startsWith(`${prefix}=`));
  return entry ? entry.slice(prefix.length + 1).trim() : '';
}

function projectRefFromUrl(value) {
  try {
    const host = new URL(value).hostname;
    return host.endsWith('.supabase.co') ? host.split('.')[0] : '';
  } catch {
    return '';
  }
}

async function runQuery(projectRef, query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${response.status}: ${body}`);
  try { return JSON.parse(body); } catch { return body; }
}

function count(value) {
  return Number(value || 0);
}

function slot(key, label, requirements) {
  const missing = requirements.filter((item) => !item.met).map((item) => item.key);
  return {
    key,
    label,
    status: missing.length ? 'NEEDS_UAT_RECORD' : 'EXISTING_COVERAGE_FOUND',
    requirements,
    missing,
  };
}

async function main() {
  const companyId = cliValue('--company-id')
    || String(process.env.BUSINESS_OS_UAT_COMPANY_ID || '').trim();
  const projectRef = process.env.PRIMARY_PROJECT_REF || projectRefFromUrl(supabaseUrl);
  if (!token) throw new Error('Thiếu SUPABASE_ACCESS_TOKEN trong backend/.env');
  if (!projectRef) throw new Error('Không xác định được Supabase project ref từ SUPABASE_URL.');
  if (!UUID_RE.test(companyId)) throw new Error('Thiếu hoặc sai --company-id cho công ty pilot UAT.');

  const rows = await runQuery(projectRef, `
    with sales as (
      select *
      from public.business_os_process_instances
      where company_id = '${companyId}'::uuid
        and process_key = 'sales_lead_qualification_v1'
        and record_type = 'crm_lead'
    ), scoped_projects as (
      select id, company_id, logistics_company_id
      from public.projects
      where company_id = '${companyId}'::uuid
         or logistics_company_id = '${companyId}'::uuid
    )
    select
      (select count(*) from sales) as sales_processes,
      (select count(*) from sales where workflow_path = 'full_service') as full_service_paths,
      (select count(*) from sales where workflow_path = 'customer_design') as customer_design_paths,
      (select count(*) from sales where primary_project_id is not null) as linked_projects,
      (select count(*) from sales where production_project_id is not null) as production_links,
      (select count(*) from sales where installation_project_id is not null) as installation_links,
      (select count(*) from sales where current_stage_key = 'completed' or status = 'completed') as completed_sales_processes,
      (select count(*) from scoped_projects) as scoped_projects,
      (select count(*) from scoped_projects
        where company_id = '${companyId}'::uuid
          and (logistics_company_id is null or logistics_company_id = '${companyId}'::uuid)) as internal_projects,
      (select count(*) from scoped_projects
        where logistics_company_id is not null
          and logistics_company_id <> company_id) as cross_company_projects,
      (select count(*) from public.business_os_process_instances
        where company_id = '${companyId}'::uuid
          and process_key = 'customer_after_sales_v1'
          and record_type = 'project') as after_sales_processes,
      (select count(*) from public.business_os_customer_service_cases
        where company_id = '${companyId}'::uuid) as customer_service_cases,
      (select count(*) from public.business_os_customer_service_cases
        where company_id = '${companyId}'::uuid
          and status in ('open', 'triaged', 'in_progress')) as open_customer_service_cases,
      (select count(*) from public.project_incidents pi
        join scoped_projects sp on sp.id = pi.project_id) as project_changes,
      (select count(*) from public.project_incidents pi
        join scoped_projects sp on sp.id = pi.project_id
        where pi.requires_approval = true) as approval_project_changes,
      (select count(*) from public.project_incidents pi
        join scoped_projects sp on sp.id = pi.project_id
        where pi.approval_status = 'pending') as pending_project_change_approvals;
  `);
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) throw new Error('Không nhận được dữ liệu preflight UAT.');

  const coverage = Object.fromEntries(Object.entries(row).map(([key, value]) => [key, count(value)]));
  const slots = [
    slot('uat_01_full_service', 'Khách chưa có thiết kế', [
      { key: 'full_service_path', count: coverage.full_service_paths, met: coverage.full_service_paths > 0 },
    ]),
    slot('uat_02_customer_design', 'Khách đã có thiết kế', [
      { key: 'customer_design_path', count: coverage.customer_design_paths, met: coverage.customer_design_paths > 0 },
    ]),
    slot('uat_03_internal_operations', 'Sản xuất và lắp đặt nội bộ', [
      { key: 'internal_project', count: coverage.internal_projects, met: coverage.internal_projects > 0 },
      { key: 'production_link', count: coverage.production_links, met: coverage.production_links > 0 },
      { key: 'installation_link', count: coverage.installation_links, met: coverage.installation_links > 0 },
    ]),
    slot('uat_04_cross_company_after_sales', 'Lắp đặt liên công ty và After-sales', [
      { key: 'cross_company_project', count: coverage.cross_company_projects, met: coverage.cross_company_projects > 0 },
      { key: 'after_sales_process', count: coverage.after_sales_processes, met: coverage.after_sales_processes > 0 },
    ]),
    slot('uat_05_project_change', 'Phát sinh và phê duyệt Project', [
      { key: 'project_change', count: coverage.project_changes, met: coverage.project_changes > 0 },
      { key: 'approval_project_change', count: coverage.approval_project_changes, met: coverage.approval_project_changes > 0 },
    ]),
  ];

  const report = {
    preflight: 'business-os-uat-coverage',
    generated_at: new Date().toISOString(),
    project_ref: projectRef,
    company_id: companyId,
    pii_safe: true,
    read_only: true,
    coverage,
    slots,
    slots_with_existing_coverage: slots.filter((item) => item.status === 'EXISTING_COVERAGE_FOUND').length,
    slots_needing_uat_record: slots.filter((item) => item.status === 'NEEDS_UAT_RECORD').length,
    note: 'Existing coverage is evidence for planning only; UAT still follows the approved checklist and must not reuse a customer record without the responsible employee.',
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
