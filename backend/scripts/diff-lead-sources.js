/**
 * Tìm lead lệch giữa nguồn Báo cáo (org-overview / Supabase) vs Kanban (RPC page_ids).
 * Usage: node backend/scripts/diff-lead-sources.js [--from YYYY-MM-DD] [--to YYYY-MM-DD]
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const axios = require('axios');
const jwt = require('jsonwebtoken');

const BASE = (process.env.CHECK_API_URL || 'https://tubep-backend.onrender.com').replace(/\/$/, '');

function monthRange() {
  const now = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const to = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
  return { from, to };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { ...monthRange(), email: 'kinhphucdat@gmail.com' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from') out.from = args[++i];
    else if (args[i] === '--to') out.to = args[++i];
    else if (args[i] === '--email') out.email = args[++i];
  }
  return out;
}

async function getToken(email) {
  const { supabase } = require('../src/config/supabase');
  let q = supabase
    .from('users')
    .select('id, email, role, full_name, company_id, department_id')
    .eq('role', 'admin')
    .neq('is_active', false);
  if (email) q = q.eq('email', email);
  const { data: user } = await q.limit(1).maybeSingle();
  if (!user || !process.env.JWT_SECRET) throw new Error('Need user + JWT_SECRET');
  return {
    user,
    token: jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        fullName: user.full_name,
        company_id: user.company_id || null,
        department_id: user.department_id || null,
        crm_region_ids: [],
      },
      process.env.JWT_SECRET,
    ),
  };
}

async function fetchAllKanbanIds(token, from, to) {
  const ids = new Set();
  let offset = 0;
  const limit = 500;
  let total = null;
  for (;;) {
    const { data } = await axios.get(`${BASE}/api/crm/leads`, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        type: 'lead',
        date_from: from,
        date_to: to,
        limit,
        offset,
        kanban: '1',
        lite: '1',
      },
    });
    if (total == null) total = data.total;
    for (const row of data.data || []) ids.add(String(row.id));
    if (!data.hasMore) break;
    offset = data.nextOffset ?? offset + limit;
  }
  return { ids, total };
}

async function fetchOrgReportRows(from, to) {
  const { supabase } = require('../src/config/supabase');
  const rows = [];
  let fromIdx = 0;
  const pageSize = 1000;
  for (;;) {
    let q = supabase
      .from('crm_leads')
      .select('id, code, title, created_at, parent_lead_id, stage_id, company_id, phone, customer_id')
      .eq('type', 'lead')
      .gte('created_at', from)
      .lte('created_at', `${to}T23:59:59.999Z`)
      .range(fromIdx, fromIdx + pageSize - 1);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < pageSize) break;
    fromIdx += pageSize;
  }
  return rows;
}

async function fetchChildLeadsInPeriod(from, to) {
  const { supabase } = require('../src/config/supabase');
  const rows = [];
  let fromIdx = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from('crm_leads')
      .select('id, code, title, created_at, parent_lead_id, stage_id')
      .eq('type', 'lead')
      .not('parent_lead_id', 'is', null)
      .gte('created_at', from)
      .lte('created_at', `${to}T23:59:59.999Z`)
      .range(fromIdx, fromIdx + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < pageSize) break;
    fromIdx += pageSize;
  }
  return rows;
}

async function fetchApiTotals(token, from, to) {
  const h = { headers: { Authorization: `Bearer ${token}` } };
  const [org, boot, sc, scPipe] = await Promise.all([
    axios.get(`${BASE}/api/crm/reports/org-overview`, { ...h, params: { date_from: from, date_to: to } }),
    axios.get(`${BASE}/api/crm/web-dashboard-bootstrap`, {
      ...h,
      params: { type: 'lead', date_from: from, date_to: to, limit: 500, kanban: '1', lite: '1', skip_deadline: '1' },
    }),
    axios.get(`${BASE}/api/crm/stage-counts`, { ...h, params: { type: 'lead', date_from: from, date_to: to, lite: '1' } }),
    axios.get(`${BASE}/api/crm/stage-counts`, {
      ...h,
      params: { type: 'lead', date_from: from, date_to: to, lite: '1', pipeline_only: '1' },
    }).catch(() => ({ data: {} })),
  ]);
  const dashKpi = boot.data?.dashboard?.kpis?.total_leads;
  const lightPipe = boot.data?.dashboard?.pipeline;
  const sumCol = Array.isArray(lightPipe)
    ? lightPipe.reduce((s, st) => s + (Number(st.count) || 0), 0)
    : null;
  return {
    org: org.data?.summary?.lead_count,
    kanban: boot.data?.kanban?.total,
    dashKpi,
    stageCounts: sc.data?.total,
    sumColumnBadges: sumCol,
    stageCountsPipelineOnly: scPipe.data?.total,
  };
}

function fmtRow(r) {
  return `${r.code || r.id?.slice(0, 8)} | ${(r.title || '').slice(0, 40)} | created=${String(r.created_at).slice(0, 10)} | parent=${r.parent_lead_id ? 'YES' : 'no'} | stage=${r.stage_id?.slice(0, 8) || 'null'}`;
}

async function main() {
  const { from, to, email } = parseArgs();
  const { user, token } = await getToken(email);
  console.log(`User: ${user.email} | company_id=${user.company_id || 'null'}`);
  console.log(`Kỳ: ${from} → ${to}\n`);

  const totals = await fetchApiTotals(token, from, to);
  console.log('=== API totals ===');
  for (const [k, v] of Object.entries(totals)) console.log(`  ${k}: ${v}`);

  const [kanban, orgRows, children] = await Promise.all([
    fetchAllKanbanIds(token, from, to),
    fetchOrgReportRows(from, to),
    fetchChildLeadsInPeriod(from, to),
  ]);

  const orgAllIds = new Set(orgRows.map((r) => String(r.id)));
  const orgParentOnlyIds = new Set(
    orgRows.filter((r) => !r.parent_lead_id).map((r) => String(r.id)),
  );

  console.log('\n=== Row counts ===');
  console.log(`  Kanban RPC ids fetched: ${kanban.ids.size} (api total=${kanban.total})`);
  console.log(`  Org report rows (all, incl children): ${orgRows.length}`);
  console.log(`  Org parent-only rows: ${orgParentOnlyIds.size}`);
  console.log(`  Child leads in period: ${children.length}`);

  const inOrgNotKanban = [...orgParentOnlyIds].filter((id) => !kanban.ids.has(id));
  const inKanbanNotOrg = [...kanban.ids].filter((id) => !orgAllIds.has(id));
  const inOrgChildrenOnly = children.map((r) => String(r.id)).filter((id) => !kanban.ids.has(id));

  console.log('\n=== Diff org(parent-only) vs Kanban RPC ===');
  console.log(`  In org, NOT in kanban: ${inOrgNotKanban.length}`);
  console.log(`  In kanban, NOT in org(all): ${inKanbanNotOrg.length}`);
  console.log(`  Child leads (not in kanban by design): ${children.length}`);

  const orgNotKanbanRows = orgRows.filter((r) => inOrgNotKanban.includes(String(r.id)));
  if (orgNotKanbanRows.length) {
    console.log('\n--- Leads in org-overview but excluded from Kanban RPC ---');
    orgNotKanbanRows.slice(0, 20).forEach((r) => console.log(' ', fmtRow(r)));
  }

  const kanbanNotOrgRows = [...kanban.ids]
    .filter((id) => inKanbanNotOrg.includes(id))
    .slice(0, 20);
  if (kanbanNotOrgRows.length) {
    console.log('\n--- Leads in Kanban RPC but missing from org query ---');
    const map = Object.fromEntries(orgRows.map((r) => [String(r.id), r]));
    kanbanNotOrgRows.forEach((id) => console.log(' ', id, map[id] ? fmtRow(map[id]) : '(not in org batch)'));
  }

  if (children.length) {
    console.log('\n--- Child leads in period (counted by org, hidden on Kanban) ---');
    children.slice(0, 20).forEach((r) => console.log(' ', fmtRow(r)));
  }

  // Leads with stage outside active pipeline
  const { supabase } = require('../src/config/supabase');
  const { data: activeStages } = await supabase
    .from('crm_pipeline_stages')
    .select('id')
    .eq('is_active', true)
    .eq('pipeline_type', 'lead');
  const activeSet = new Set((activeStages || []).map((s) => String(s.id)));
  const orphanStage = orgRows.filter(
    (r) => !r.parent_lead_id && r.stage_id && !activeSet.has(String(r.stage_id)),
  );
  const nullStage = orgRows.filter((r) => !r.parent_lead_id && !r.stage_id);
  console.log('\n=== Stage anomalies (parent-only) ===');
  console.log(`  stage_id NULL: ${nullStage.length}`);
  console.log(`  stage_id not in active lead pipeline: ${orphanStage.length}`);
  if (orphanStage.length) {
    console.log('--- Orphan stage leads ---');
    orphanStage.slice(0, 15).forEach((r) => console.log(' ', fmtRow(r)));
  }

  const orgWithChildren = orgRows.length;
  const orgParentOnly = orgParentOnlyIds.size;
  console.log('\n=== Explains app vs web ===');
  console.log(`  App Báo cáo (org-overview, all rows): ${totals.org} — direct query: ${orgWithChildren}`);
  console.log(`  App if parent-only org: ${orgParentOnly}`);
  console.log(`  Web Kanban (RPC page_ids): ${totals.kanban}`);
  console.log(`  Web KPI dashboard.total_leads (stage-counts w/ pipeline): ${totals.dashKpi}`);
  console.log(`  Sum column badges: ${totals.sumColumnBadges}`);
  console.log(`  Delta org(all) - kanban: ${orgWithChildren - kanban.ids.size}`);
  console.log(`  Delta org(parent) - kanban: ${orgParentOnly - kanban.ids.size}`);
  console.log(`  Delta children only: ${children.length}`);
}

main().catch((e) => {
  console.error('ERR:', e.response?.data || e.message);
  process.exit(1);
});
