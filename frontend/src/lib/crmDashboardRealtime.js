/** Helpers cập nhật Kanban CRM theo từng thẻ — tránh reload cả dashboard. */

export function removeCrmKanbanRowById(rows, leadId) {
  const sid = String(leadId || '').trim();
  if (!sid) return rows;
  return rows.filter((r) => String(r.id) !== sid);
}

export function upsertCrmKanbanRow(rows, row) {
  if (!row?.id) return rows;
  const sid = String(row.id);
  const idx = rows.findIndex((r) => String(r.id) === sid);
  if (idx < 0) return [row, ...rows];
  const next = rows.slice();
  next[idx] = { ...next[idx], ...row };
  return next;
}

export function patchCrmKanbanRowById(rows, leadId, patch) {
  const sid = String(leadId || '').trim();
  if (!sid || !patch || !Object.keys(patch).length) return rows;
  return rows.map((r) => (String(r.id) === sid ? { ...r, ...patch } : r));
}

export async function fetchCrmKanbanRowsByIds(apiClient, leadIds, opts = {}) {
  const ids = [...new Set((leadIds || []).map((x) => String(x).trim()).filter(Boolean))].slice(0, 50);
  if (!ids.length) return [];
  const params = {
    lead_ids: ids.join(','),
    lite: '1',
    kanban: '1',
    skip_deadline: opts.skipDeadline !== false ? '1' : undefined,
  };
  const res = await apiClient.get('/crm/kanban-rows', { params }).catch(() => ({ data: null }));
  const rows = res.data?.data;
  return Array.isArray(rows) ? rows : [];
}

/** Gom burst socket theo lead_id; bulk không có id → mảng riêng. */
export function coalesceCrmDashboardChangedEvents(events) {
  const byLeadId = new Map();
  const bulk = [];
  for (const ev of events || []) {
    if (!ev || typeof ev !== 'object') continue;
    if (ev.lead_id) byLeadId.set(String(ev.lead_id), ev);
    else bulk.push(ev);
  }
  return { byLeadId, bulk };
}

export function crmRealtimePayloadInCompanyScope(payload, scopeCompanyId) {
  if (!scopeCompanyId) return true;
  const co = payload?.company_id;
  if (!co) return true;
  return String(co) === String(scopeCompanyId);
}
