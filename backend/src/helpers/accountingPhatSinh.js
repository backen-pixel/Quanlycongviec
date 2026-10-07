const { supabase } = require('../config/supabase');
const {
  SOURCE_KEYS,
  upsertCostEntry,
  resolveSetupForProject,
  categoryIdForSource,
} = require('./costLedger');
const { listPhatSinhKinds, findPhatSinhKind } = require('./sharedWorkspacePhatSinhKinds');

/**
 * Phát sinh kế toán lấy từ nhiệm vụ không gian chung (`crm_assignments.phat_sinh_kind`) gắn deal.
 * Chi phí từng việc nằm trong sổ chi phí, khóa theo nhiệm vụ CRM gốc vì `cost_entries.source_row_id` là uuid.
 */
const COST_SOURCE_TABLE = 'crm_tasks';
const COST_SOURCE_KEY = SOURCE_KEYS.SX_EXPENSE;

const STATUS_LABELS = {
  pending: 'Chưa làm',
  in_progress: 'Đang làm',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
};

const SOURCE_LABELS = {
  employee_error: 'Lỗi nhân viên',
  customer_request: 'Khách yêu cầu',
};

const ASSIGNMENT_COLS = 'id, title, description, status, phat_sinh_kind, assignment_module, task_source_type, '
  + 'assignee_id, company_id, lead_id, crm_task_id, created_at, completed_at, deadline';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function fetchPhatSinhAssignments(leadIds) {
  if (!leadIds.length) return [];
  const { data, error } = await supabase
    .from('crm_assignments')
    .select(ASSIGNMENT_COLS)
    .in('lead_id', leadIds)
    .not('phat_sinh_kind', 'is', null)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('[accountingPhatSinh] assignments:', error.message);
    return [];
  }
  return data || [];
}

async function fetchCostByTaskIds(taskIds) {
  const map = new Map();
  if (!taskIds.length) return map;
  const { data, error } = await supabase
    .from('cost_entries')
    .select('id, source_row_id, amount, updated_at')
    .eq('source_table', COST_SOURCE_TABLE)
    .eq('source_key', COST_SOURCE_KEY)
    .eq('is_void', false)
    .in('source_row_id', taskIds);
  if (error) {
    console.warn('[accountingPhatSinh] cost entries:', error.message);
    return map;
  }
  for (const e of data || []) map.set(String(e.source_row_id), e);
  return map;
}

/** Map(lead_id → { count, with_cost, missing_cost, total }) cho danh sách kế toán. */
async function summarizePhatSinhByLeadIds(leadIds) {
  const map = new Map();
  const rows = await fetchPhatSinhAssignments(leadIds);
  if (!rows.length) return map;
  const costs = await fetchCostByTaskIds([...new Set(rows.map((r) => r.crm_task_id).filter(Boolean))]);
  for (const r of rows) {
    const key = String(r.lead_id);
    const slot = map.get(key) || { count: 0, with_cost: 0, missing_cost: 0, total: 0 };
    slot.count += 1;
    const cost = r.crm_task_id ? costs.get(String(r.crm_task_id)) : null;
    if (cost) {
      slot.with_cost += 1;
      slot.total += num(cost.amount);
    } else {
      slot.missing_cost += 1;
    }
    map.set(key, slot);
  }
  return map;
}

async function kindLookup(companyIds) {
  const byCompany = new Map();
  await Promise.all(companyIds.map(async (cid) => {
    try {
      byCompany.set(String(cid), await listPhatSinhKinds({ companyId: cid, includeInactive: true }));
    } catch (e) {
      console.warn('[accountingPhatSinh] kinds:', e.message);
      byCompany.set(String(cid), []);
    }
  }));
  return (row) => findPhatSinhKind(byCompany.get(String(row.company_id)) || [], row.phat_sinh_kind);
}

/** Danh sách việc phát sinh của một deal, kèm chi phí đã ghi. */
async function listDealPhatSinh(leadId) {
  const rows = await fetchPhatSinhAssignments([leadId]);
  if (!rows.length) return { items: [], total: 0, missing_cost: 0 };

  const companyIds = [...new Set(rows.map((r) => r.company_id).filter(Boolean))];
  const userIds = [...new Set(rows.map((r) => r.assignee_id).filter(Boolean))];
  const [findKind, costs, usersRes, cosRes] = await Promise.all([
    kindLookup(companyIds),
    fetchCostByTaskIds([...new Set(rows.map((r) => r.crm_task_id).filter(Boolean))]),
    userIds.length ? supabase.from('users').select('id, full_name').in('id', userIds) : Promise.resolve({ data: [] }),
    companyIds.length ? supabase.from('companies').select('id, name, short_name').in('id', companyIds) : Promise.resolve({ data: [] }),
  ]);
  const userMap = new Map((usersRes.data || []).map((u) => [String(u.id), u.full_name || null]));
  const coMap = new Map((cosRes.data || []).map((c) => [String(c.id), c.short_name || c.name || null]));

  const items = rows.map((r) => {
    const kind = findKind(r);
    const cost = r.crm_task_id ? costs.get(String(r.crm_task_id)) : null;
    return {
      id: r.id,
      title: r.title,
      description: r.description || null,
      status: r.status,
      status_label: STATUS_LABELS[r.status] || r.status,
      kind_name: kind?.name || r.phat_sinh_kind,
      co_phi: kind?.co_phi === true,
      source_label: SOURCE_LABELS[r.task_source_type] || null,
      module: r.assignment_module || null,
      company_name: coMap.get(String(r.company_id)) || null,
      assignee_name: r.assignee_id ? userMap.get(String(r.assignee_id)) || null : null,
      created_at: r.created_at,
      completed_at: r.completed_at,
      can_record_cost: Boolean(r.crm_task_id),
      cost_amount: cost ? num(cost.amount) : null,
      cost_updated_at: cost?.updated_at || null,
    };
  });
  return {
    items,
    total: items.reduce((s, i) => s + (i.cost_amount || 0), 0),
    missing_cost: items.filter((i) => i.cost_amount == null).length,
  };
}

/** Ghi / sửa / bỏ chi phí của một việc phát sinh (amount null = bỏ). */
async function setPhatSinhCost({ leadId, assignmentId, amount, userId }) {
  const { data: row } = await supabase
    .from('crm_assignments')
    .select(ASSIGNMENT_COLS)
    .eq('id', assignmentId)
    .maybeSingle();
  if (!row || String(row.lead_id) !== String(leadId) || !row.phat_sinh_kind) {
    return { error: 'Không tìm thấy việc phát sinh này trên deal', status: 404 };
  }
  if (!row.crm_task_id) {
    return { error: 'Việc phát sinh chưa gắn nhiệm vụ CRM nên chưa ghi được chi phí', status: 400 };
  }

  const { data: lead } = await supabase.from('crm_leads').select('id, project_id, region_id').eq('id', leadId).maybeSingle();
  if (!lead?.project_id) return { error: 'Deal chưa có dự án để ghi chi phí', status: 400 };
  const { data: project } = await supabase
    .from('projects')
    .select('id, company_id')
    .eq('id', lead.project_id)
    .maybeSingle();
  const companyId = project?.company_id || row.company_id;
  if (!companyId) return { error: 'Không xác định được công ty của dự án', status: 400 };

  if (amount === null || amount === undefined || amount === '') {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('cost_entries')
      .update({ is_void: true, void_reason: 'Bỏ chi phí phát sinh', voided_at: now, voided_by: userId || null, updated_at: now })
      .eq('source_table', COST_SOURCE_TABLE)
      .eq('source_row_id', row.crm_task_id)
      .eq('source_key', COST_SOURCE_KEY);
    if (error) throw error;
    return { ok: true, cost_amount: null };
  }
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0) {
    return { error: 'Chi phí phải là số không âm', status: 400 };
  }

  const setup = await resolveSetupForProject(companyId, lead.region_id || null);
  const entry = await upsertCostEntry({
    company_id: companyId,
    project_id: lead.project_id,
    lead_id: leadId,
    source_key: COST_SOURCE_KEY,
    module_key: 'production',
    category_id: categoryIdForSource(setup, COST_SOURCE_KEY),
    amount: value,
    entry_date: (row.completed_at || row.created_at || '').slice(0, 10) || undefined,
    note: `Phát sinh: ${row.title || ''}`.trim(),
    source_table: COST_SOURCE_TABLE,
    source_row_id: row.crm_task_id,
    origin: 'manual',
    actor_user_id: userId,
    created_by: userId,
  });
  return { ok: true, cost_amount: num(entry?.amount) };
}

module.exports = {
  summarizePhatSinhByLeadIds,
  listDealPhatSinh,
  setPhatSinhCost,
};
