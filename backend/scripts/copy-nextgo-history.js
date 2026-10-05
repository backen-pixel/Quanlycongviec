/**
 * Sao chép phần lịch sử mà `clone-nextgo-to-tenant.js` chưa mang sang HST NextGo:
 * bình luận deal, tài liệu lead, tệp đính kèm việc, giao việc, sự kiện, snapshot
 * báo cáo ngày, kế hoạch phòng ban và KPI của các deal có TRƯỚC mốc clone.
 *
 * Nguồn = công ty NextGo cũ (HST mặc định, giữ nguyên làm lịch sử đóng băng).
 * Đích  = công ty NextGo trong HST mới. Bản ghi mới có id mới, khoá ngoại ánh xạ
 * theo `uploads/_nextgo_clone_id_map.json`; riêng việc CRM/SX ghép theo
 * (lead/dự án tương ứng + thời điểm tạo + tiêu đề) vì clone không lưu map việc.
 *
 *   node scripts/copy-nextgo-history.js                     # dry-run
 *   node scripts/copy-nextgo-history.js --apply             # ghi thật
 *   node scripts/copy-nextgo-history.js --rollback=<file>   # xoá bản ghi đã chèn
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { supabase } = require('../src/config/supabase');

const APPLY = process.argv.includes('--apply');
const MAP_FILE = path.join(__dirname, '../uploads/_nextgo_clone_id_map.json');
const raw = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
const NEW_COMPANY = raw.companyId;
const OLD_COMPANY = Object.values(raw.maps.company)[0][0];
const NEXTGO_FALLBACK_USER = 'ee8083b5-49e5-45af-ae8b-8d3bcabb5530'; // quantri.hst@nextgo.vn

const M = {};
for (const [name, pairs] of Object.entries(raw.maps)) {
  M[name] = new Map(Object.values(pairs).map(([o, n]) => [String(o), String(n)]));
}
const newSide = {};
function isNew(mapName, id) {
  if (!newSide[mapName]) newSide[mapName] = new Set([...(M[mapName]?.values() || [])]);
  return newSide[mapName].has(String(id));
}
/** null nếu không ánh xạ được (bản ghi sẽ bị bỏ khi khoá bắt buộc). */
function mp(mapName, id) {
  if (id == null) return null;
  const key = String(id);
  if (M[mapName]?.has(key)) return M[mapName].get(key);
  return isNew(mapName, key) ? key : null;
}
/** Người dùng: ngoài HST → admin HST NextGo (giữ dữ liệu, không trỏ chéo HST). */
function person(id) {
  if (id == null) return null;
  return mp('user', id) || NEXTGO_FALLBACK_USER;
}
const uuid = () => crypto.randomUUID();

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

const inserted = [];
const report = { che_do: APPLY ? 'APPLY' : 'DRY-RUN', ke_hoach: {}, da_chen: {}, bo_qua: {}, loi: [] };

/** Chỉ xử lý một số nhóm: `--only=kpi_ledger,kpi_scores`. */
const ONLY = (() => {
  const a = process.argv.find((x) => x.startsWith('--only='));
  return a ? a.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean) : null;
})();

/**
 * Chèn theo lô; lô nào lỗi thì chèn lại từng dòng để bỏ đúng dòng vướng ràng
 * buộc trùng (vd KPI đã được HST mới tự tính). Trả về bản ghi đã chèn.
 */
async function insertRows(table, rows, label, { returning = 'id' } = {}) {
  report.ke_hoach[label] = rows.length;
  if (!APPLY || !rows.length) return [];
  if (ONLY && !ONLY.includes(label)) return [];
  const done = [];
  let trung = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const part = rows.slice(i, i + 100);
    const q = supabase.from(table).insert(part);
    const { data, error } = returning ? await q.select(returning) : await q;
    if (!error) {
      (data || []).forEach((r) => {
        done.push(r);
        if (r.id != null) inserted.push({ table, id: r.id });
      });
      continue;
    }
    for (const row of part) {
      const one = supabase.from(table).insert(row);
      const { data: d1, error: e1 } = returning ? await one.select(returning) : await one;
      if (e1) {
        if (/duplicate key|already exists/i.test(e1.message)) trung += 1;
        else report.loi.push(`${table}: ${e1.message}`);
        continue;
      }
      (d1 || []).forEach((r) => {
        done.push(r);
        if (r.id != null) inserted.push({ table, id: r.id });
      });
    }
  }
  report.da_chen[label] = done.length;
  if (trung) report.bo_qua[`${label}_trung`] = trung;
  return done;
}

async function runRollback(file) {
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  const byTable = new Map();
  rows.forEach(({ table, id }) => {
    if (!byTable.has(table)) byTable.set(table, []);
    byTable.get(table).push(id);
  });
  const out = {};
  for (const [table, ids] of byTable) {
    let n = 0;
    for (let i = 0; i < ids.length; i += 100) {
      const { error } = await supabase.from(table).delete().in('id', ids.slice(i, i + 100));
      if (error) console.error(`${table}: ${error.message}`);
      else n += ids.slice(i, i + 100).length;
    }
    out[table] = n;
  }
  console.log(JSON.stringify({ da_xoa: out }, null, 2));
}

(async () => {
  const rb = process.argv.find((x) => x.startsWith('--rollback='));
  if (rb) { await runRollback(rb.split('=')[1]); process.exit(0); }

  const oldLeadIds = [...M.lead.keys()];
  const oldProjectIds = [...M.project.keys()];

  // ── Map việc CRM cũ → mới: ghép theo lead tương ứng + thời điểm tạo + tiêu đề ──
  const oldTasks = await fetchByIds('crm_tasks', 'lead_id', oldLeadIds, 'id, lead_id, title, created_at');
  const newTasks = await fetchByIds('crm_tasks', 'lead_id', [...M.lead.values()], 'id, lead_id, title, created_at');
  const taskKey = (r) => `${r.lead_id}|${r.created_at}|${r.title || ''}`;
  const newTaskByKey = new Map(newTasks.map((r) => [taskKey(r), String(r.id)]));
  const taskMap = new Map();
  for (const t of oldTasks) {
    const hit = newTaskByKey.get(`${mp('lead', t.lead_id)}|${t.created_at}|${t.title || ''}`);
    if (hit) taskMap.set(String(t.id), hit);
  }
  M.crmTask = taskMap;
  report.ghep_viec = { viec_cu: oldTasks.length, ghep_duoc: taskMap.size };

  // ── 1. Bình luận deal (+ phản ứng, dấu đã đọc) ──
  const comments = (await fetchByIds('crm_lead_comments', 'lead_id', oldLeadIds))
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const commentRows = comments.map((c) => ({
    lead_id: mp('lead', c.lead_id),
    user_id: person(c.user_id),
    body: c.body,
    created_at: c.created_at,
    updated_at: c.updated_at,
    deleted_at: c.deleted_at,
    attachments: c.attachments,
    comment_type: c.comment_type,
    metadata: c.metadata,
  }));
  const insComments = await insertRows('crm_lead_comments', commentRows, 'crm_lead_comments');
  const commentMap = new Map();
  insComments.forEach((r, i) => { if (comments[i]) commentMap.set(String(comments[i].id), r.id); });
  // parent_id (trả lời) — cập nhật sau khi đã có id mới
  let parentFixed = 0;
  if (APPLY) {
    for (const c of comments) {
      if (!c.parent_id) continue;
      const newId = commentMap.get(String(c.id));
      const newParent = commentMap.get(String(c.parent_id));
      if (!newId || !newParent) continue;
      const { error } = await supabase.from('crm_lead_comments').update({ parent_id: newParent }).eq('id', newId);
      if (!error) parentFixed += 1;
    }
  }
  report.da_chen.comment_parent_id = parentFixed;

  const reactions = await fetchByIds('crm_lead_comment_reactions', 'comment_id', comments.map((c) => c.id));
  await insertRows('crm_lead_comment_reactions', reactions
    .filter((r) => commentMap.has(String(r.comment_id)))
    .map((r) => ({
      comment_id: commentMap.get(String(r.comment_id)),
      user_id: person(r.user_id),
      emoji: r.emoji,
      created_at: r.created_at,
    })), 'crm_lead_comment_reactions', { returning: null });

  const receipts = await fetchByIds('crm_lead_comment_read_receipts', 'lead_id', oldLeadIds);
  await insertRows('crm_lead_comment_read_receipts', receipts
    .filter((r) => mp('lead', r.lead_id))
    .map((r) => ({ lead_id: mp('lead', r.lead_id), user_id: person(r.user_id), last_read_at: r.last_read_at })),
  'crm_lead_comment_read_receipts', { returning: null });

  // ── 2. Tài liệu lead ──
  const docs = await fetchByIds('lead_documents', 'lead_id', oldLeadIds);
  await insertRows('lead_documents', docs.map((d) => ({
    id: uuid(),
    lead_id: mp('lead', d.lead_id),
    project_id: mp('project', d.project_id),
    name: d.name,
    doc_type: d.doc_type,
    file_url: d.file_url,
    file_name: d.file_name,
    file_size: d.file_size,
    mime_type: d.mime_type,
    notes: d.notes,
    created_by: person(d.created_by),
    created_at: d.created_at,
    allowed_departments: d.allowed_departments,
    allowed_companies: null,
    shared_to_workshop: d.shared_to_workshop,
    allowed_share_modules: d.allowed_share_modules,
    source_crm_task_id: mp('crmTask', d.source_crm_task_id),
    crm_stage_slug: d.crm_stage_slug,
    crm_stage_group_label: d.crm_stage_group_label,
    source_checklist_id: d.source_checklist_id,
  })), 'lead_documents');

  // ── 3. Tệp đính kèm việc CRM ──
  const attsAll = await fetchByIds('crm_task_attachments', 'lead_id', oldLeadIds);
  // task_id NOT NULL → bỏ tệp của việc không ghép được.
  const atts = attsAll.filter((a) => mp('crmTask', a.task_id));
  report.bo_qua.crm_task_attachments = attsAll.length - atts.length;
  await insertRows('crm_task_attachments', atts.map((a) => ({
    id: uuid(),
    task_id: mp('crmTask', a.task_id),
    lead_id: mp('lead', a.lead_id),
    name: a.name,
    file_url: a.file_url,
    file_name: a.file_name,
    file_size: a.file_size,
    mime_type: a.mime_type,
    notes: a.notes,
    doc_type: a.doc_type,
    created_by: person(a.created_by),
    created_at: a.created_at,
    allowed_companies: null,
    allowed_departments: a.allowed_departments,
    shared_to_project: a.shared_to_project,
    allowed_share_modules: a.allowed_share_modules,
    checklist_id: a.checklist_id,
  })), 'crm_task_attachments');

  // ── 4. Giao việc: cột trước, rồi thẻ và bình luận ──
  const cols = await fetchAll('crm_assignment_columns', (q) => q.eq('company_id', OLD_COMPANY));
  const insCols = await insertRows('crm_assignment_columns', cols.map((c) => ({
    company_id: NEW_COMPANY,
    name: c.name,
    color: c.color,
    position: c.position,
    is_done_column: c.is_done_column,
    is_in_progress_column: c.is_in_progress_column,
    created_by_id: person(c.created_by_id),
    created_at: c.created_at,
    updated_at: c.updated_at,
  })), 'crm_assignment_columns');
  const colMap = new Map();
  insCols.forEach((r, i) => { if (cols[i]) colMap.set(String(cols[i].id), r.id); });

  const assigns = await fetchAll('crm_assignments', (q) => q.eq('company_id', OLD_COMPANY));
  const insAssigns = await insertRows('crm_assignments', assigns.map((a) => ({
    company_id: NEW_COMPANY,
    // Cột dùng chung toàn hệ thống (company_id null) thì giữ nguyên id.
    column_id: colMap.get(String(a.column_id)) ?? a.column_id,
    title: a.title,
    description: a.description,
    assignee_id: person(a.assignee_id),
    created_by_id: person(a.created_by_id),
    priority: a.priority,
    status: a.status,
    deadline: a.deadline,
    position: a.position,
    created_at: a.created_at,
    updated_at: a.updated_at,
    completed_at: a.completed_at,
    lead_id: mp('lead', a.lead_id),
    crm_task_id: mp('crmTask', a.crm_task_id),
    assignment_module: a.assignment_module,
    requires_quick_verdict: a.requires_quick_verdict,
    quick_verdict: a.quick_verdict,
    quick_verdict_reason: a.quick_verdict_reason,
    completion_requires_file_or_note: a.completion_requires_file_or_note,
    required_evidence_file_types: a.required_evidence_file_types,
    executor_company_id: NEW_COMPANY,
    task_source_type: a.task_source_type,
    employee_error_module: a.employee_error_module,
    department_id: mp('dept', a.department_id),
    phat_sinh_kind: a.phat_sinh_kind,
  })), 'crm_assignments');
  const assignMap = new Map();
  insAssigns.forEach((r, i) => { if (assigns[i]) assignMap.set(String(assigns[i].id), r.id); });

  const aComments = await fetchByIds('crm_assignment_comments', 'assignment_id', assigns.map((a) => a.id));
  await insertRows('crm_assignment_comments', aComments
    .filter((c) => assignMap.has(String(c.assignment_id)))
    .map((c) => ({
      assignment_id: assignMap.get(String(c.assignment_id)),
      user_id: person(c.user_id),
      content: c.content,
      created_at: c.created_at,
      updated_at: c.updated_at,
    })), 'crm_assignment_comments');

  // ── 5. Sự kiện CRM còn lại ở công ty cũ ──
  const events = await fetchAll('crm_events', (q) => q.eq('company_id', OLD_COMPANY));
  await insertRows('crm_events', events.map((e) => ({
    id: uuid(),
    event_type_id: null,
    event_type: e.event_type,
    title: e.title,
    description: e.description,
    location: e.location,
    start_time: e.start_time,
    end_time: e.end_time,
    all_day: e.all_day,
    status: e.status,
    result: e.result,
    lead_id: mp('lead', e.lead_id),
    customer_id: mp('customer', e.customer_id),
    project_id: mp('project', e.project_id),
    created_by: person(e.created_by),
    assignee_id: person(e.assignee_id),
    created_at: e.created_at,
    updated_at: e.updated_at,
    company_id: NEW_COMPANY,
    cancel_reason: e.cancel_reason,
    module: e.module,
    occurrence_dates: e.occurrence_dates,
  })), 'crm_events');

  // ── 6. Snapshot báo cáo ngày + kế hoạch phòng ban ──
  const snaps = await fetchAll('crm_daily_report_snapshots', (q) => q.eq('company_id', OLD_COMPANY));
  const remapEntityIds = (v) => (Array.isArray(v)
    ? v.map((x) => mp('lead', x) || mp('project', x) || mp('customer', x) || x)
    : v);
  await insertRows('crm_daily_report_snapshots', snaps.map((s) => ({
    id: uuid(),
    report_date: s.report_date,
    company_id: NEW_COMPANY,
    user_id: person(s.user_id),
    phase: s.phase,
    metric_key: s.metric_key,
    value: s.value,
    entity_ids: remapEntityIds(s.entity_ids),
    note: s.note,
    source: s.source,
    computed_at: s.computed_at,
  })), 'crm_daily_report_snapshots');

  const sheetsAll = await fetchAll('crm_dept_plan_sheets', (q) => q.eq('company_id', OLD_COMPANY));
  const sheets = sheetsAll.filter((s) => mp('dept', s.department_id)); // department_id NOT NULL
  report.bo_qua.crm_dept_plan_sheets = sheetsAll.length - sheets.length;
  await insertRows('crm_dept_plan_sheets', sheets.map((s) => ({
    department_id: mp('dept', s.department_id),
    company_id: NEW_COMPANY,
    week_start: s.week_start,
    name: s.name,
    created_by: person(s.created_by),
    created_at: s.created_at,
    updated_at: s.updated_at,
    summary: s.summary,
  })), 'crm_dept_plan_sheets');

  // ── 7. KPI: ledger theo lead cũ + điểm/chỉ tiêu theo công ty ──
  const ledgerAll = await fetchByIds('crm_kpi_ledger', 'lead_id', oldLeadIds);
  // Idempotent: bỏ dòng đã có ở HST mới (khoá logic: lead + việc + loại + thời điểm).
  const ledgerExisting = new Set((await fetchAll('crm_kpi_ledger',
    (q) => q.eq('company_id', NEW_COMPANY), 'lead_id, task_id, event_type, occurred_at'))
    .map((r) => `${r.lead_id}|${r.task_id}|${r.event_type}|${r.occurred_at}`));
  const ledger = ledgerAll.filter((l) => !ledgerExisting.has(
    `${mp('lead', l.lead_id)}|${mp('crmTask', l.task_id)}|${l.event_type}|${l.occurred_at}`,
  ));
  report.bo_qua.crm_kpi_ledger_da_co = ledgerAll.length - ledger.length;
  await insertRows('crm_kpi_ledger', ledger.map((l) => ({
    id: uuid(),
    user_id: person(l.user_id),
    company_id: NEW_COMPANY,
    lead_id: mp('lead', l.lead_id),
    task_id: mp('crmTask', l.task_id),
    stage_id: mp('crmStage', l.stage_id),
    rule_id: null,
    event_type: l.event_type,
    source_kpi_code: l.source_kpi_code,
    deadline_at: l.deadline_at,
    occurred_at: l.occurred_at,
    delta_seconds: l.delta_seconds,
    on_time: l.on_time,
    points: l.points,
    reason: l.reason,
    metadata: l.metadata,
    period_type: l.period_type,
    period_start: l.period_start,
    created_at: l.created_at,
    created_by: person(l.created_by),
  })), 'crm_kpi_ledger');

  const scoresAll = await fetchAll('kpi_scores', (q) => q.eq('company_id', OLD_COMPANY));
  // Khoá duy nhất (định nghĩa, người, kỳ) không gồm company → bỏ dòng đã có.
  const scoreExisting = new Set((await fetchAll('kpi_scores', (q) => q, 'kpi_definition_id, user_id, period_id'))
    .map((r) => `${r.kpi_definition_id}|${r.user_id}|${r.period_id}`));
  const scores = scoresAll.filter((s) => !scoreExisting.has(
    `${s.kpi_definition_id}|${person(s.user_id)}|${s.period_id}`,
  ));
  report.bo_qua.kpi_scores_da_co = scoresAll.length - scores.length;
  await insertRows('kpi_scores', scores.map((s) => ({
    id: uuid(),
    kpi_definition_id: s.kpi_definition_id,
    user_id: person(s.user_id),
    period_id: s.period_id,
    company_id: NEW_COMPANY,
    actual_value: s.actual_value,
    target_value: s.target_value,
    weight_used: s.weight_used,
    raw_score: s.raw_score,
    capped_score: s.capped_score,
    breakdown: s.breakdown,
    computed_at: s.computed_at,
  })), 'kpi_scores');

  const targets = await fetchAll('kpi_targets', (q) => q.eq('company_id', OLD_COMPANY));
  await insertRows('kpi_targets', targets.map((t) => ({
    id: uuid(),
    kpi_definition_id: t.kpi_definition_id,
    user_id: person(t.user_id),
    company_id: NEW_COMPANY,
    period_type: t.period_type,
    period_start: t.period_start,
    target_value: t.target_value,
    weight_override: t.weight_override,
    notes: t.notes,
    created_by: person(t.created_by),
    created_at: t.created_at,
    updated_at: t.updated_at,
  })), 'kpi_targets');

  if (APPLY && inserted.length) {
    const f = path.join(__dirname, `../uploads/_nextgo_history_rollback_${Date.now()}.json`);
    fs.writeFileSync(f, JSON.stringify(inserted));
    report.file_hoan_tac = f;
  }
  const out = path.join(__dirname, `../uploads/_nextgo_history_${APPLY ? 'apply' : 'dryrun'}.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
