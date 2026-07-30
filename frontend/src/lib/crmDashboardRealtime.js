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

/**
 * Thời gian giữ «cột vừa kéo» đè lên dữ liệu list.
 * Board cache sessionStorage (30s–10 phút) và HTTP cache của trình duyệt
 * (/crm/leads 15s, /crm/kanban-rows 10s) đều có thể trả lại cột trước khi kéo.
 */
export const PENDING_CRM_STAGE_MOVE_TTL_MS = 30_000;

/**
 * Áp cột người dùng vừa kéo lên các row lấy từ nguồn có thể còn cũ.
 * Row đã khớp cột đích → xoá khỏi hàng đợi (server đã bắt kịp).
 *
 * @param {Array} rows
 * @param {Map<string, { stageId: string, stageEnteredAt?: string, at: number }>} pending
 */
export function applyPendingCrmStageMoves(rows, pending) {
  if (!pending || !pending.size || !Array.isArray(rows) || !rows.length) return rows;
  const now = Date.now();
  for (const [id, mv] of pending) {
    if (now - mv.at > PENDING_CRM_STAGE_MOVE_TTL_MS) pending.delete(id);
  }
  if (!pending.size) return rows;
  return rows.map((row) => {
    const mv = pending.get(String(row?.id));
    if (!mv) return row;
    if (String(row.stage_id || '') === String(mv.stageId)) {
      pending.delete(String(row.id));
      return row;
    }
    return { ...row, stage_id: mv.stageId, stage_entered_at: mv.stageEnteredAt || row.stage_entered_at };
  });
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
  // Header này bỏ qua responseCache phía backend; không cần thêm _ts làm mỗi URL
  // trở thành duy nhất và khiến trình duyệt/DevTools tích lũy request.
  const res = await apiClient
    .get('/crm/kanban-rows', { params, headers: { 'x-no-cache': '1' } })
    .catch(() => ({ data: null }));
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
