/**
 * So số NextGo: nguồn production ↔ dump local ↔ (tuỳ chọn) đích.
 * Exit 0 chỉ khi mọi bảng >0 trên nguồn khớp dump (và đích nếu có NEXTGO_SUPABASE_*).
 *
 *   node scripts/verify-nextgo-completeness.js
 *   node scripts/verify-nextgo-completeness.js --dest
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const spec = require('./lib/nextgoInstanceSpec');
const io = require('./lib/nextgoInstanceIo');

const IN_DIR = path.join(__dirname, '..', 'uploads', '_nextgo_instance_export');
const WANT_DEST = process.argv.includes('--dest');
const CID = spec.SOURCE_COMPANY_ID;

function client(url, key) {
  if (!url || !key) throw new Error('Thiếu Supabase URL/key');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function countEq(sb, table, col, val) {
  const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true }).eq(col, val);
  if (error) throw new Error(`${table}: ${error.message}`);
  return count || 0;
}

async function countIn(sb, table, col, ids) {
  if (!ids.length) return 0;
  let n = 0;
  for (let i = 0; i < ids.length; i += 80) {
    const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true }).in(col, ids.slice(i, i + 80));
    if (error) throw new Error(`${table}: ${error.message}`);
    n += count || 0;
  }
  return n;
}

function dumpCount(table) {
  const file = path.join(IN_DIR, `${table}.ndjson`);
  if (!fs.existsSync(file)) return 0;
  const text = fs.readFileSync(file, 'utf8');
  if (!text.trim()) return 0;
  return text.split(/\r?\n/).filter(Boolean).length;
}

async function sourceCounts(sb) {
  const leadIds = (await io.fetchAll(sb, 'crm_leads', (q) => q.eq('company_id', CID))).map((r) => r.id);
  const projIds = (await io.fetchAll(sb, 'projects', (q) => q.eq('company_id', CID))).map((r) => r.id);
  const page = (await io.fetchAll(sb, 'facebook_pages', (q) => q.eq('default_company_id', CID)))[0];
  const contactIds = page
    ? (await io.fetchAll(sb, 'facebook_contacts', (q) => q.eq('page_id', page.page_id))).map((r) => r.id)
    : [];
  return {
    customers: await countEq(sb, 'customers', 'company_id', CID),
    crm_leads: leadIds.length,
    projects: projIds.length,
    crm_tasks: await countIn(sb, 'crm_tasks', 'lead_id', leadIds),
    tasks: await countIn(sb, 'tasks', 'project_id', projIds),
    crm_lead_comments: await countIn(sb, 'crm_lead_comments', 'lead_id', leadIds),
    crm_task_attachments: await countIn(sb, 'crm_task_attachments', 'lead_id', leadIds),
    crm_assignments: await countEq(sb, 'crm_assignments', 'company_id', CID),
    crm_daily_reports: await countEq(sb, 'crm_daily_reports', 'company_id', CID),
    departments: await countEq(sb, 'departments', 'company_id', CID),
    users_company: await countEq(sb, 'users', 'company_id', CID),
    facebook_pages: page ? 1 : 0,
    facebook_contacts: contactIds.length,
    facebook_messages: await countIn(sb, 'facebook_messages', 'contact_id', contactIds),
    workshop_project_types: await countEq(sb, 'workshop_project_types', 'company_id', CID),
    production_pipeline_stages: await countEq(sb, 'production_pipeline_stages', 'company_id', CID),
    crm_pipelines: await countEq(sb, 'crm_pipelines', 'company_id', CID),
  };
}

async function destCounts(sb) {
  return {
    customers: await countEq(sb, 'customers', 'company_id', CID),
    crm_leads: await countEq(sb, 'crm_leads', 'company_id', CID),
    projects: await countEq(sb, 'projects', 'company_id', CID),
    departments: await countEq(sb, 'departments', 'company_id', CID),
    users_company: await countEq(sb, 'users', 'company_id', CID),
    facebook_pages: await countEq(sb, 'facebook_pages', 'default_company_id', CID),
    crm_assignments: await countEq(sb, 'crm_assignments', 'company_id', CID),
    workshop_project_types: await countEq(sb, 'workshop_project_types', 'company_id', CID),
  };
}

async function main() {
  const src = client(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const live = await sourceCounts(src);
  const dumpMap = {
    customers: dumpCount('customers'),
    crm_leads: dumpCount('crm_leads'),
    projects: dumpCount('projects'),
    crm_tasks: dumpCount('crm_tasks'),
    tasks: dumpCount('tasks'),
    crm_lead_comments: dumpCount('crm_lead_comments'),
    crm_task_attachments: dumpCount('crm_task_attachments'),
    crm_assignments: dumpCount('crm_assignments'),
    crm_daily_reports: dumpCount('crm_daily_reports'),
    departments: dumpCount('departments'),
    users_company: dumpCount('users'), // dump gồm user ngoài
    facebook_pages: dumpCount('facebook_pages'),
    facebook_contacts: dumpCount('facebook_contacts'),
    facebook_messages: dumpCount('facebook_messages'),
    workshop_project_types: dumpCount('workshop_project_types'),
    production_pipeline_stages: dumpCount('production_pipeline_stages'),
    crm_pipelines: dumpCount('crm_pipelines'),
  };

  console.log('=== Nguồn vs dump ===');
  let dumpOk = true;
  for (const k of Object.keys(live)) {
    if (k === 'users_company') {
      const du = dumpCount('users');
      const ok = du >= live.users_company;
      console.log(`  users: company=${live.users_company} dump=${du} (>= company) ${ok ? 'OK' : 'THIẾU'}`);
      if (!ok) dumpOk = false;
      continue;
    }
    const a = live[k];
    const b = dumpMap[k];
    const ok = a === b;
    if (!ok) dumpOk = false;
    console.log(`  ${k}: source=${a} dump=${b} ${ok ? 'OK' : 'LỆCH'}`);
  }

  let destOk = true;
  if (WANT_DEST) {
    const url = process.env.NEXTGO_SUPABASE_URL;
    const key = process.env.NEXTGO_SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      console.log('\n=== Đích === THIẾU NEXTGO_SUPABASE_URL / NEXTGO_SUPABASE_SERVICE_ROLE_KEY');
      destOk = false;
    } else if (String(url).replace(/\/$/, '') === String(process.env.SUPABASE_URL || '').replace(/\/$/, '')) {
      console.log('\n=== Đích === URL trùng nguồn — từ chối (không import vào Tủ Bếp)');
      destOk = false;
    } else {
      const dest = await destCounts(client(url, key));
      console.log('\n=== Nguồn vs đích (cùng UUID công ty) ===');
      for (const k of Object.keys(dest)) {
        const a = k === 'users_company' ? live.users_company : live[k];
        const b = dest[k];
        const ok = Number(a) === Number(b);
        if (!ok) destOk = false;
        console.log(`  ${k}: source=${a} dest=${b} ${ok ? 'OK' : 'LỆCH'}`);
      }
    }
  }

  const report = {
    checked_at: new Date().toISOString(),
    source: live,
    dump: dumpMap,
    dump_100: dumpOk,
    dest_100: WANT_DEST ? destOk : null,
    old_ecosystem_untouched: true,
  };
  fs.mkdirSync(IN_DIR, { recursive: true });
  fs.writeFileSync(path.join(IN_DIR, 'parity-report.json'), JSON.stringify(report, null, 2));

  if (!dumpOk || (WANT_DEST && !destOk)) {
    console.log('\nCHƯA 100% — không nên cắt chuyển.');
    process.exit(2);
  }
  console.log('\nDUMP khớp nguồn 100% (user dump >= user công ty).');
  if (WANT_DEST) console.log('ĐÍCH khớp nguồn 100% trên các bảng kiểm.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
