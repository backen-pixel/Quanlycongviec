/**
 * Nạp dump NextGo vào instance ĐÍCH (Supabase mới). Giữ UUID.
 *
 * Bắt buộc env riêng — không bao giờ ghi đè nguồn Tủ Bếp:
 *   NEXTGO_SUPABASE_URL
 *   NEXTGO_SUPABASE_SERVICE_ROLE_KEY
 *
 *   node scripts/import-nextgo-instance.js --dry-run
 *   node scripts/import-nextgo-instance.js --apply
 *
 * Không chạy nếu URL đích trùng SUPABASE_URL nguồn.
 * Không đổi webhook. Không freeze công ty cũ.
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const spec = require('./lib/nextgoInstanceSpec');
const io = require('./lib/nextgoInstanceIo');

const DRY = !process.argv.includes('--apply') || process.argv.includes('--dry-run');
const IN_DIR = path.join(__dirname, '..', 'uploads', '_nextgo_instance_export');
const FEATURES = spec.TENANT_FEATURES;

function destClient() {
  const url = process.env.NEXTGO_SUPABASE_URL;
  const key = process.env.NEXTGO_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Thiếu NEXTGO_SUPABASE_URL / NEXTGO_SUPABASE_SERVICE_ROLE_KEY (instance đích).');
  }
  const src = process.env.SUPABASE_URL || '';
  if (src && String(url).replace(/\/$/, '') === String(src).replace(/\/$/, '')) {
    throw new Error('URL đích trùng URL nguồn — từ chối import vào DB Tủ Bếp.');
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function rewriteTenant(row, tenantId, extraSkip = []) {
  const o = { ...row };
  if ('tenant_id' in o) o.tenant_id = tenantId;
  for (const k of extraSkip) delete o[k];
  return o;
}

async function insertFlexible(sb, table, rows) {
  if (!rows.length) {
    console.log(`- ${table}: 0`);
    return;
  }
  if (DRY) {
    console.log(`- ${table}: ${rows.length} (dry-run)`);
    return;
  }
  const hasId = rows[0] && rows[0].id != null;
  if (hasId) {
    await io.insertRows(sb, table, rows);
    return;
  }
  for (let i = 0; i < rows.length; i += 80) {
    const slice = rows.slice(i, i + 80);
    const { error } = await sb.from(table).insert(slice);
    if (error && !/duplicate|already exists|23505/i.test(error.message)) {
      throw new Error(`${table} insert [${i}]: ${error.message}`);
    }
  }
  console.log(`  ${table} ${rows.length}/${rows.length} ok`);
}

async function ensureTenant(sb) {
  const { data: existing, error } = await sb.from('tenants').select('*').eq('slug', 'nextgo').maybeSingle();
  if (error) throw error;
  if (existing) {
    console.log('Tenant đích đã có:', existing.id);
    return existing.id;
  }
  const row = {
    name: 'NextGo',
    slug: 'nextgo',
    tier: 'enterprise',
    max_users: 200,
    max_companies: 10,
    is_active: true,
    settings: { imported_from: spec.SOURCE_COMPANY_ID, mode: 'keep-uuid' },
  };
  if (DRY) {
    console.log('Dry-run: sẽ tạo tenant slug=nextgo');
    return '00000000-0000-4000-8000-000000000001';
  }
  const { data, error: insErr } = await sb.from('tenants').insert(row).select('*').single();
  if (insErr) throw insErr;
  const feats = FEATURES.map((feature_key) => ({
    tenant_id: data.id,
    feature_key,
    enabled: true,
    config: {},
  }));
  await sb.from('tenant_features').upsert(feats, { onConflict: 'tenant_id,feature_key' });
  console.log('Tạo tenant:', data.id);
  return data.id;
}

const LOAD_ORDER = [
  'ecosystem_levels',
  'ecosystem_units',
  'companies',
  'company_division_units',
  'ecosystem_module_scopes',
  'departments',
  'company_regions',
  'users',
  'user_companies',
  'user_roles',
  'company_bank_accounts',
  'crm_source_categories',
  'crm_sources',
  'crm_referrers',
  'workshop_project_types',
  'crm_lead_types',
  'crm_pipelines',
  'crm_pipeline_stages',
  'crm_task_templates',
  'crm_task_template_items',
  'crm_company_deadline_config',
  'crm_payment_stages',
  'crm_assignment_columns',
  'production_pipeline_stages',
  'logistics_pipeline_stages',
  'workshop_teams',
  'workshop_task_templates',
  'workshop_task_template_items',
  'crm_lead_type_production_links',
  'crm_company_visible_production_companies',
  'sx_company_schedule_config',
  'customers',
  'crm_leads',
  'projects',
  'lead_members',
  'crm_tasks',
  'crm_lead_comments',
  'crm_lead_comment_reactions',
  'crm_lead_comment_read_receipts',
  'crm_task_attachments',
  'crm_assignments',
  'crm_assignment_schedules',
  'crm_assignment_comments',
  'crm_events',
  'crm_event_comments',
  'crm_daily_report_templates',
  'crm_daily_reports',
  'tasks',
  'task_comments',
  'project_comments',
  'drive_roots',
  'drive_folders',
  'drive_files',
  'facebook_pages',
  'facebook_contacts',
  'facebook_messages',
  'facebook_comments',
  'zalo_oa_accounts',
  'zalo_contacts',
  'zalo_messages',
  'file_attachments',
  'calc_categories',
  'knowledge_categories',
  'app_modules',
  'crm_kpi_scoring_rules',
  'external_api_keys',
];

async function main() {
  const manifestPath = path.join(IN_DIR, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Chưa có dump. Chạy: node scripts/export-nextgo-instance.js\nThiếu ${manifestPath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  console.log(DRY ? '=== DRY-RUN import (không ghi đích) ===' : '=== IMPORT NextGo → instance đích ===');
  console.log('Dump:', manifest.exported_at, 'counts keys', Object.keys(manifest.counts || {}).length);
  if (manifest.secrets_included === false) {
    console.warn('Dump đã redact secrets — user/FB sẽ không login/gửi tin được.');
  }

  const sb = destClient();
  const tenantId = await ensureTenant(sb);

  for (const table of LOAD_ORDER) {
    let rows = io.readNdjson(IN_DIR, table);
    if (!rows.length) continue;
    if (['companies', 'users', 'ecosystem_units'].includes(table)) {
      rows = rows.map((r) => rewriteTenant(r, tenantId));
    }
    if (table === 'facebook_pages' || table === 'zalo_oa_accounts') {
      const redacted = rows.filter((r) => r.access_token === '__REDACTED__');
      if (redacted.length) {
        console.warn(`  ${table}: token REDACTED — bổ sung tay trước khi cắt webhook.`);
      }
    }
    await insertFlexible(sb, table, rows);
  }

  if (!DRY) {
    fs.writeFileSync(path.join(IN_DIR, 'import-result.json'), JSON.stringify({
      imported_at: new Date().toISOString(),
      dest_tenant_id: tenantId,
      source_manifest: manifest.exported_at,
    }, null, 2));
  }
  console.log('\nXong.', DRY ? 'Chưa ghi đích — thêm --apply khi instance mới sẵn sàng.' : 'Đã upsert vào đích.');
}

main().catch((e) => {
  console.error('\nIMPORT FAILED:', e);
  process.exit(1);
});
