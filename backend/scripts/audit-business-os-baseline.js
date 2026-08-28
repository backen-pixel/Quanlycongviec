/**
 * Read-only staging audit for the Business OS baseline migrations.
 *
 * This script intentionally does not apply or repair migrations. It reports
 * whether the schema/config signatures expected from migrations 473 and
 * 567-583 are present on the configured Supabase project.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const {
  evaluateBusinessOsUatGate,
  validIsoDate,
} = require('../src/helpers/businessOsUatGate');

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

async function listBackups(projectRef) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/backups`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.text();
  if (!response.ok) {
    return {
      verified: false,
      status_code: response.status,
      reason: 'Management API không trả về danh sách backup cho token hiện tại.',
    };
  }
  let payload;
  try { payload = JSON.parse(body); } catch { payload = {}; }
  const completed = Array.isArray(payload.backups)
    ? payload.backups.filter((item) => item?.status === 'COMPLETED')
    : [];
  completed.sort((a, b) => String(b.inserted_at || '').localeCompare(String(a.inserted_at || '')));
  return {
    verified: true,
    region: payload.region || null,
    walg_enabled: payload.walg_enabled === true,
    pitr_enabled: payload.pitr_enabled === true,
    completed_backup_count: completed.length,
    latest_completed_backup_at: completed[0]?.inserted_at || null,
    latest_completed_backup_id: completed[0]?.id ?? null,
    physical_backup_window: payload.physical_backup_data || null,
  };
}

const auditSql = `
with audit as (
  select * from (values
    ('473', 'business_os_process_instances + events',
      to_regclass('public.business_os_process_instances') is not null
      and to_regclass('public.business_os_process_events') is not null),
    ('567', 'blueprint control plane',
      to_regclass('public.business_blueprints') is not null
      and to_regclass('public.business_blueprint_versions') is not null
      and to_regclass('public.tenant_blueprint_installations') is not null
      and to_regprocedure('public.publish_business_blueprint_version(uuid,uuid)') is not null),
    ('568', 'stage contracts',
      to_regclass('public.business_os_stage_contracts') is not null),
    ('569', 'dynamic custom fields',
      to_regclass('public.business_os_custom_field_definitions') is not null
      and to_regclass('public.business_os_custom_field_values') is not null
      and to_regclass('public.business_os_stage_contract_versions') is not null),
    ('570', 'qualification automation + SLA',
      to_regclass('public.business_os_stage_automations') is not null
      and to_regclass('public.business_os_stage_task_template_items') is not null
      and to_regclass('public.business_os_stage_automation_versions') is not null
      and to_regclass('public.business_os_sla_escalations') is not null
      and exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name='crm_tasks'
          and column_name='business_os_template_item_key'
      )),
    ('571', 'deal survey + design',
      exists (select 1 from information_schema.columns where table_schema='public' and table_name='business_os_process_instances' and column_name='survey_started_at')
      and exists (select 1 from information_schema.columns where table_schema='public' and table_name='business_os_process_instances' and column_name='design_completed_at')
      and exists (select 1 from information_schema.columns where table_schema='public' and table_name='business_os_sla_escalations' and column_name='stage_key')),
    ('572', 'flexible design intake',
      exists (select 1 from information_schema.columns where table_schema='public' and table_name='business_os_process_instances' and column_name='workflow_path')
      and exists (select 1 from information_schema.columns where table_schema='public' and table_name='business_os_process_instances' and column_name='design_review_started_at')
      and exists (select 1 from information_schema.columns where table_schema='public' and table_name='business_os_process_instances' and column_name='design_review_completed_at')),
    ('573', 'quotation start',
      exists (select 1 from information_schema.columns where table_schema='public' and table_name='business_os_process_instances' and column_name='quotation_started_at')
      and exists (select 1 from information_schema.columns where table_schema='public' and table_name='business_os_process_instances' and column_name='primary_quotation_id')),
    ('574', 'negotiation + order',
      exists (select 1 from information_schema.columns where table_schema='public' and table_name='business_os_process_instances' and column_name='negotiation_started_at')
      and exists (select 1 from information_schema.columns where table_schema='public' and table_name='business_os_process_instances' and column_name='accepted_quotation_id')
      and exists (select 1 from information_schema.columns where table_schema='public' and table_name='business_os_process_instances' and column_name='primary_order_id')),
    ('575', 'quotation to order idempotency',
      exists (select 1 from pg_indexes where schemaname='public' and tablename='orders' and indexname='uq_orders_source_quotation')),
    ('576', 'order to project + production',
      exists (select 1 from information_schema.columns where table_schema='public' and table_name='business_os_process_instances' and column_name='primary_project_id')
      and exists (select 1 from information_schema.columns where table_schema='public' and table_name='business_os_process_instances' and column_name='production_project_id')
      and exists (select 1 from pg_constraint where conname='business_os_process_instances_sales_stage_ck')),
    ('577', 'production to installation',
      exists (select 1 from information_schema.columns where table_schema='public' and table_name='business_os_process_instances' and column_name='delivery_ready_at')
      and exists (select 1 from information_schema.columns where table_schema='public' and table_name='business_os_process_instances' and column_name='installation_project_id')
      and exists (select 1 from information_schema.columns where table_schema='public' and table_name='business_os_process_instances' and column_name='installation_completed_at')),
    ('578', 'after-sales customer care',
      to_regclass('public.business_os_customer_service_cases') is not null
      and exists (select 1 from pg_constraint where conname='business_os_customer_service_cases_status_ck')
      and exists (select 1 from pg_indexes where schemaname='public' and indexname='idx_business_os_after_sales_instances')),
    ('579', 'logistics customer-care stage',
      exists (select 1 from logistics_pipeline_stages where is_active=true and crm_sync_type='customer_care')),
    ('580', 'project change record contract',
      15 = (select count(*) from information_schema.columns
        where table_schema='public' and table_name='project_incidents'
          and column_name in (
            'change_type', 'cause', 'phase_key', 'owner_user_id', 'cost_impact',
            'schedule_impact_days', 'cost_bearer', 'requires_approval', 'approval_status',
            'approval_notes', 'approved_by', 'approved_at', 'rejected_reason',
            'attachments', 'related_links'
          ))),
    ('581', 'project procurement + finance bridge',
      to_regclass('public.supplier_bills') is not null
      and to_regclass('public.supplier_payments') is not null
      and exists (select 1 from information_schema.columns where table_schema='public' and table_name='purchase_orders' and column_name='project_id')
      and exists (select 1 from information_schema.columns where table_schema='public' and table_name='project_expenses' and column_name='supplier_bill_id')
      and to_regprocedure('public.sync_supplier_payable_totals(uuid)') is not null),
    ('582', 'company blueprint installations',
      to_regclass('public.company_blueprint_installations') is not null
      and to_regprocedure('public.enforce_company_blueprint_tenant_scope()') is not null
      and exists (select 1 from pg_indexes where schemaname='public' and tablename='company_blueprint_installations' and indexname='idx_company_blueprint_installations_company')),
    ('583', 'invoice payment terms contract',
      exists (select 1 from information_schema.columns
        where table_schema='public' and table_name='invoices' and column_name='payment_terms'))
  ) as checks(migration, capability, applied)
)
select
  migration,
  capability,
  applied,
  current_database() as database_name,
  current_setting('server_version') as postgres_version
from audit
order by migration::int;
`;

async function main() {
  const projectRef = process.env.PRIMARY_PROJECT_REF || projectRefFromUrl(supabaseUrl);
  if (!token) throw new Error('Thiếu SUPABASE_ACCESS_TOKEN trong backend/.env');
  if (!projectRef) throw new Error('Không xác định được Supabase project ref từ SUPABASE_URL.');

  const [rows, backup] = await Promise.all([
    runQuery(projectRef, auditSql),
    listBackups(projectRef),
  ]);
  if (!Array.isArray(rows)) throw new Error(`Kết quả audit không hợp lệ: ${JSON.stringify(rows)}`);

  const report = {
    audit: 'business-os-staging-baseline',
    audited_at: new Date().toISOString(),
    project_ref: projectRef,
    database_name: rows[0]?.database_name || null,
    postgres_version: rows[0]?.postgres_version || null,
    backup,
    migrations: rows.map(({ migration, capability, applied }) => ({
      migration,
      capability,
      applied: applied === true,
    })),
  };
  report.all_applied = report.migrations.length === 18
    && report.migrations.every((item) => item.applied);

  const requiredBackupAfter = cliValue('--require-backup-after')
    || String(process.env.BUSINESS_OS_UAT_BACKUP_AFTER || '').trim();
  if (requiredBackupAfter && !validIsoDate(requiredBackupAfter)) {
    throw new Error(`Mốc --require-backup-after không hợp lệ: ${requiredBackupAfter}`);
  }
  if (requiredBackupAfter) {
    report.uat_gate = evaluateBusinessOsUatGate({
      allApplied: report.all_applied,
      backup: report.backup,
      requiredBackupAfter,
    });
  }

  console.log(JSON.stringify(report, null, 2));
  if (!report.all_applied) process.exitCode = 2;
  else if (report.uat_gate && !report.uat_gate.ready) process.exitCode = 3;
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
