/**
 * Sao dữ liệu NextGo (giữ UUID) ra thư mục local — KHÔNG cắt chuyển, KHÔNG freeze.
 *
 *   node scripts/export-nextgo-instance.js --dry-run
 *   node scripts/export-nextgo-instance.js
 *   node scripts/export-nextgo-instance.js --since=2026-09-01T00:00:00+07:00
 *
 * Mặc định gồm hash mật khẩu + token FB (dump gitignore).
 *   --redact-secrets  để che token/password trong file.
 *
 * Không ghi DB đích. Không đổi webhook. Không tắt công ty nguồn.
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const spec = require('./lib/nextgoInstanceSpec');
const io = require('./lib/nextgoInstanceIo');

const DRY = process.argv.includes('--dry-run');
const REDACT = process.argv.includes('--redact-secrets');
const sinceArg = process.argv.find((a) => a.startsWith('--since='));
const SINCE = sinceArg ? sinceArg.slice('--since='.length) : null;
const OUT_DIR = path.join(__dirname, '..', 'uploads', '_nextgo_instance_export');

function srcClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function applySince(q) {
  if (!SINCE) return q;
  return q.or(`updated_at.gte.${SINCE},created_at.gte.${SINCE}`);
}

async function maybeTable(sb, table, apply) {
  try {
    return await io.fetchAll(sb, table, apply);
  } catch (e) {
    console.warn(`  skip ${table}: ${e.message}`);
    return null;
  }
}

async function walkUnitAncestors(sb, startIds) {
  const map = new Map();
  let frontier = [...new Set(startIds.filter(Boolean))];
  while (frontier.length) {
    const rows = await io.fetchInChunks(sb, 'ecosystem_units', 'id', frontier);
    const next = [];
    for (const r of rows) {
      if (map.has(r.id)) continue;
      map.set(r.id, r);
      if (r.parent_id && !map.has(r.parent_id)) next.push(r.parent_id);
    }
    frontier = next;
  }
  return [...map.values()];
}

async function main() {
  const sb = srcClient();
  console.log(DRY ? '=== DRY-RUN export NextGo (không ghi file) ===' : '=== EXPORT NextGo → dump local ===');
  console.log('Company nguồn:', spec.SOURCE_COMPANY_ID);
  if (SINCE) console.log('Delta since:', SINCE);
  if (REDACT) console.log('Secrets: REDACTED');

  const company = (await io.fetchAll(sb, 'companies', (q) => q.eq('id', spec.SOURCE_COMPANY_ID)))[0];
  if (!company) throw new Error('Không thấy công ty NextGo nguồn');
  console.log('Tên:', company.name, 'tenant', company.tenant_id);

  const dump = {};
  const counts = {};

  async function store(table, rows) {
    const list = rows || [];
    counts[table] = list.length;
    dump[table] = REDACT ? list.map((r) => io.redactRow(r, false)) : list;
    console.log(`- ${table}: ${list.length}`);
    if (!DRY) await io.writeNdjson(OUT_DIR, table, dump[table]);
    return list;
  }

  await store('companies', [company]);

  const divLinks = await io.fetchAll(sb, 'company_division_units', (q) => q.eq('company_id', spec.SOURCE_COMPANY_ID));
  await store('company_division_units', divLinks);

  const unitStarts = [
    company.division_unit_id,
    ...divLinks.map((l) => l.division_unit_id),
  ];
  const byCompanyUnits = await io.fetchAll(sb, 'ecosystem_units', (q) => q.eq('company_id', spec.SOURCE_COMPANY_ID));
  unitStarts.push(...byCompanyUnits.map((u) => u.id));
  const units = await walkUnitAncestors(sb, unitStarts);
  await store('ecosystem_units', units);
  dump._division_ids = units.map((u) => ({ id: u.id }));

  const levels = await io.fetchAll(sb, 'ecosystem_levels');
  await store('ecosystem_levels', levels);

  for (const table of spec.COMPANY_SCOPED_TABLES) {
    if (table === 'companies') continue;
    const col = table === 'facebook_pages' || table === 'zalo_oa_accounts'
      ? 'default_company_id'
      : 'company_id';
    const rows = await maybeTable(sb, table, (q) => {
      let nq = q.eq(col, spec.SOURCE_COMPANY_ID);
      if (SINCE && table !== 'user_companies' && table !== 'company_division_units') {
        nq = applySince(nq);
      }
      return nq;
    });
    if (rows) await store(table, rows);
  }

  const visible = await maybeTable(sb, 'crm_company_visible_production_companies', (q) => q
    .or(`crm_company_id.eq.${spec.SOURCE_COMPANY_ID},production_company_id.eq.${spec.SOURCE_COMPANY_ID}`));
  if (visible) await store('crm_company_visible_production_companies', visible);

  for (const child of spec.CHILD_TABLES) {
    const parentRows = dump[child.parent] || [];
    const idField = child.parentIdField || 'id';
    const parentIds = io.idsOf(parentRows, idField);
    if (!parentIds.length) {
      counts[child.table] = 0;
      dump[child.table] = [];
      console.log(`- ${child.table}: 0 (không có parent)`);
      continue;
    }
    const rows = await io.fetchInChunks(sb, child.table, child.col, parentIds).catch((e) => {
      console.warn(`  skip ${child.table}: ${e.message}`);
      return [];
    });
    await store(child.table, rows);
  }

  const extraUserIds = new Set(io.idsOf(dump.users || []));
  const personFields = [
    [dump.crm_leads, ['assigned_to', 'lead_owner_id', 'created_by', 'sx_handover_confirmed_by']],
    [dump.crm_tasks, ['assignee_id', 'created_by', 'supervisor_id']],
    [dump.tasks, ['assignee_id', 'created_by_id']],
    [dump.projects, ['sales_person_id', 'production_person_id', 'created_by', 'project_manager_id']],
    [dump.lead_members, ['user_id', 'added_by']],
    [dump.crm_lead_comments, ['user_id', 'created_by']],
  ];
  const missing = new Set();
  for (const [rows, fields] of personFields) {
    for (const r of rows || []) {
      for (const f of fields) {
        const id = r[f];
        if (id && !extraUserIds.has(id)) missing.add(id);
      }
    }
  }
  if (missing.size) {
    const extras = await io.fetchInChunks(sb, 'users', 'id', [...missing]);
    const tagged = extras.map((u) => ({
      ...u,
      notes: `[nextgo-extract-ref] ${u.notes || ''}`.trim(),
      is_active: u.company_id === spec.SOURCE_COMPANY_ID ? u.is_active : false,
    }));
    dump.users = [...(dump.users || []), ...tagged];
    counts.users = dump.users.length;
    console.log(`- users (+${tagged.length} tham chiếu ngoài): ${dump.users.length}`);
    if (!DRY) await io.writeNdjson(OUT_DIR, 'users', REDACT ? dump.users.map((r) => io.redactRow(r, false)) : dump.users);
  }

  const entityIds = [
    ...io.idsOf(dump.crm_leads || []),
    ...io.idsOf(dump.projects || []),
    ...io.idsOf(dump.crm_tasks || []),
    ...io.idsOf(dump.tasks || []),
  ];
  const attachments = entityIds.length
    ? await io.fetchInChunks(sb, 'file_attachments', 'entity_id', entityIds).catch((e) => {
      console.warn('  skip file_attachments:', e.message);
      return [];
    })
    : [];
  await store('file_attachments', attachments);

  const extraTaskAtt = (dump.crm_leads || []).length
    ? await io.fetchInChunks(sb, 'crm_task_attachments', 'lead_id', io.idsOf(dump.crm_leads)).catch(() => [])
    : [];
  if (extraTaskAtt.length) {
    const seen = new Set((dump.crm_task_attachments || []).map((r) => r.id));
    const merged = [...(dump.crm_task_attachments || [])];
    for (const r of extraTaskAtt) {
      if (!seen.has(r.id)) merged.push(r);
    }
    await store('crm_task_attachments', merged);
  }

  const manifest = {
    exported_at: new Date().toISOString(),
    source_company_id: spec.SOURCE_COMPANY_ID,
    source_company_name: company.name,
    source_tenant_id: company.tenant_id,
    since: SINCE,
    secrets_included: !REDACT,
    dry_run: DRY,
    counts,
    note: 'Chuẩn bị. Không cắt chuyển. Import chỉ khi có NEXTGO_SUPABASE_* và --apply.',
  };
  console.log('\n=== Manifest counts ===');
  console.log(JSON.stringify(counts, null, 2));
  if (!DRY) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log('Dump:', OUT_DIR);
  } else {
    console.log('(dry-run — không ghi', OUT_DIR, ')');
  }
}

main().catch((e) => {
  console.error('\nEXPORT FAILED:', e);
  process.exit(1);
});
