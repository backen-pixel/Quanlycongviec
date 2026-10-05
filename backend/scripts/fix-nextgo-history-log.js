/**
 * Vá nhật ký hoạt động (`unified_task_history`) của HST NextGo:
 *
 * 1) Chép các dòng THAY ĐỔI trước mốc clone (đổi người, đổi trạng thái, hoàn
 *    thành, đổi deadline, xoá) từ công ty NextGo cũ sang công ty HST mới.
 * 2) Trả lại thời điểm gốc cho các dòng «created» mà quá trình clone sinh ra
 *    (đang bị dồn hết về ngày 21/08).
 *
 * Ánh xạ thực thể: việc CRM / việc SX / thẻ giao việc ghép theo
 * (cha tương ứng + thời điểm tạo + tiêu đề); `source_id` của bản ghi đã xoá
 * không còn thực thể nên giữ nguyên (cột text, không phải khoá ngoại).
 *
 *   node scripts/fix-nextgo-history-log.js                     # dry-run
 *   node scripts/fix-nextgo-history-log.js --apply
 *   node scripts/fix-nextgo-history-log.js --rollback=<file>
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { supabase } = require('../src/config/supabase');

const APPLY = process.argv.includes('--apply');
const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../uploads/_nextgo_clone_id_map.json'), 'utf8'));
const NEW_COMPANY = raw.companyId;
const OLD_COMPANY = Object.values(raw.maps.company)[0][0];
const NEXTGO_FALLBACK_USER = 'ee8083b5-49e5-45af-ae8b-8d3bcabb5530';
const CLONE_DAY_END = '2026-08-22T00:00:00Z';

const M = {};
for (const [name, pairs] of Object.entries(raw.maps)) {
  M[name] = new Map(Object.values(pairs).map(([o, n]) => [String(o), String(n)]));
}
const newSide = {};
function isNew(name, id) {
  if (!newSide[name]) newSide[name] = new Set([...(M[name]?.values() || [])]);
  return newSide[name].has(String(id));
}
function mp(name, id) {
  if (id == null) return null;
  const k = String(id);
  return M[name]?.get(k) || (isNew(name, k) ? k : null);
}
const person = (id) => (id == null ? null : mp('user', id) || NEXTGO_FALLBACK_USER);

async function fetchAll(table, apply, cols = '*') {
  const out = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await apply(supabase.from(table).select(cols)).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}
async function fetchByIds(table, col, ids, cols = '*') {
  const out = [];
  for (let i = 0; i < ids.length; i += 80) {
    const part = ids.slice(i, i + 80);
    if (!part.length) continue;
    out.push(...(await fetchAll(table, (q) => q.in(col, part), cols)));
  }
  return out;
}

/** Ghép thực thể cũ → mới theo (cha tương ứng + created_at + tiêu đề). */
function buildMatchMap(oldRows, newRows, parentCol, parentMapName, titleCol = 'title') {
  const key = (r, parent) => `${parent}|${r.created_at}|${r[titleCol] || ''}`;
  const byKey = new Map(newRows.map((r) => [key(r, r[parentCol]), String(r.id)]));
  const map = new Map();
  for (const r of oldRows) {
    const hit = byKey.get(key(r, mp(parentMapName, r[parentCol])));
    if (hit) map.set(String(r.id), hit);
  }
  return map;
}

const report = { che_do: APPLY ? 'APPLY' : 'DRY-RUN', ghep: {}, ke_hoach: {}, da_ghi: {}, loi: [] };
const rollback = { inserted: [], created_at: [] };

async function runRollback(file) {
  const rb = JSON.parse(fs.readFileSync(file, 'utf8'));
  let del = 0;
  for (let i = 0; i < rb.inserted.length; i += 100) {
    const ids = rb.inserted.slice(i, i + 100);
    const { error } = await supabase.from('unified_task_history').delete().in('id', ids);
    if (!error) del += ids.length;
  }
  let restored = 0;
  for (const { id, created_at } of rb.created_at) {
    const { error } = await supabase.from('unified_task_history').update({ created_at }).eq('id', id);
    if (!error) restored += 1;
  }
  console.log(JSON.stringify({ da_xoa: del, da_tra_lai_ngay: restored }, null, 2));
}

(async () => {
  const rbArg = process.argv.find((x) => x.startsWith('--rollback='));
  if (rbArg) { await runRollback(rbArg.split('=')[1]); process.exit(0); }

  const oldLeadIds = [...M.lead.keys()];
  const newLeadIds = [...M.lead.values()];
  const oldProjIds = [...M.project.keys()];
  const newProjIds = [...M.project.values()];

  // ── Map thực thể ──
  M.crmTask = buildMatchMap(
    await fetchByIds('crm_tasks', 'lead_id', oldLeadIds, 'id, lead_id, title, created_at'),
    await fetchByIds('crm_tasks', 'lead_id', newLeadIds, 'id, lead_id, title, created_at'),
    'lead_id', 'lead',
  );
  M.sxTask = buildMatchMap(
    await fetchByIds('tasks', 'project_id', oldProjIds, 'id, project_id, title, created_at'),
    await fetchByIds('tasks', 'project_id', newProjIds, 'id, project_id, title, created_at'),
    'project_id', 'project',
  );
  const oldAssigns = await fetchAll('crm_assignments', (q) => q.eq('company_id', OLD_COMPANY), 'id, company_id, title, created_at');
  const newAssigns = await fetchAll('crm_assignments', (q) => q.eq('company_id', NEW_COMPANY), 'id, company_id, title, created_at');
  const assignKey = (r) => `${r.created_at}|${r.title || ''}`;
  const newAssignByKey = new Map(newAssigns.map((r) => [assignKey(r), String(r.id)]));
  M.assignment = new Map();
  oldAssigns.forEach((a) => {
    const hit = newAssignByKey.get(assignKey(a));
    if (hit) M.assignment.set(String(a.id), hit);
  });
  report.ghep = { crm_task: M.crmTask.size, sx_task: M.sxTask.size, giao_viec: M.assignment.size };

  const SRC_MAP = { crm_task: 'crmTask', task: 'sxTask', crm_assignment: 'assignment' };
  const mapSourceId = (row) => {
    const name = SRC_MAP[String(row.source)];
    if (!name) return { id: row.source_id, mapped: false };
    const hit = mp(name, row.source_id);
    return hit ? { id: hit, mapped: true } : { id: row.source_id, mapped: false };
  };

  // ── 1. Chép các dòng thay đổi (không phải «created») ──
  const oldRows = await fetchAll('unified_task_history', (q) => q.eq('company_id', OLD_COMPANY));
  const changeRows = oldRows.filter((r) => r.event_type !== 'created');
  let khongGhepDuoc = 0;
  const toInsert = changeRows.map((r) => {
    const src = mapSourceId(r);
    if (!src.mapped) khongGhepDuoc += 1;
    return {
      source: r.source,
      source_id: src.id,
      project_id: mp('project', r.project_id),
      lead_id: mp('lead', r.lead_id),
      company_id: NEW_COMPANY,
      actor_user_id: person(r.actor_user_id),
      event_type: r.event_type,
      field_name: r.field_name,
      old_value: r.old_value,
      new_value: r.new_value,
      description: r.description,
      created_at: r.created_at,
    };
  });
  report.ke_hoach.dong_thay_doi = toInsert.length;
  report.ke_hoach.source_id_khong_ghep_duoc = khongGhepDuoc;

  if (APPLY) {
    let n = 0;
    for (let i = 0; i < toInsert.length; i += 100) {
      const { data, error } = await supabase.from('unified_task_history').insert(toInsert.slice(i, i + 100)).select('id');
      if (error) { report.loi.push(`insert lô ${i}: ${error.message}`); continue; }
      (data || []).forEach((r) => { rollback.inserted.push(r.id); n += 1; });
    }
    report.da_ghi.dong_thay_doi = n;
  }

  // ── 2. Trả lại thời điểm gốc cho dòng «created» do clone sinh ra ──
  const oldCreated = oldRows.filter((r) => r.event_type === 'created');
  const oldCreatedBySrc = new Map();
  for (const r of oldCreated) {
    const src = mapSourceId(r);
    if (src.mapped) oldCreatedBySrc.set(String(src.id), r.created_at);
  }
  const newCloneRows = await fetchAll('unified_task_history',
    (q) => q.eq('company_id', NEW_COMPANY).eq('event_type', 'created').lt('created_at', CLONE_DAY_END),
    'id, source, source_id, created_at');
  const fixes = [];
  for (const r of newCloneRows) {
    const orig = oldCreatedBySrc.get(String(r.source_id));
    if (orig && orig !== r.created_at) fixes.push({ id: r.id, created_at: orig, cu: r.created_at });
  }
  report.ke_hoach.sua_ngay_created = fixes.length;
  report.ke_hoach.created_khong_ghep_duoc = newCloneRows.length - fixes.length;

  if (APPLY) {
    let n = 0;
    for (const f of fixes) {
      const { error } = await supabase.from('unified_task_history').update({ created_at: f.created_at }).eq('id', f.id);
      if (error) { report.loi.push(`update ${f.id}: ${error.message}`); continue; }
      rollback.created_at.push({ id: f.id, created_at: f.cu });
      n += 1;
    }
    report.da_ghi.sua_ngay_created = n;
  }

  if (APPLY && (rollback.inserted.length || rollback.created_at.length)) {
    const f = path.join(__dirname, `../uploads/_nextgo_log_rollback_${Date.now()}.json`);
    fs.writeFileSync(f, JSON.stringify(rollback));
    report.file_hoan_tac = f;
  }
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
