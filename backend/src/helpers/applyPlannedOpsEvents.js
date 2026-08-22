/**
 * Đưa sự kiện ops từ «dự kiến» (planned) → «áp dụng» (in_progress).
 *
 * Quy định:
 * - Hoàn thiện SX (production_finish): khi bên sản xuất tiếp nhận (rời cột intake).
 * - Vận chuyển / lắp đặt (pickup, installation, delivery): khi bên VC/LĐ tiếp nhận
 *   (rời cột intake hoặc đủ xác nhận bàn giao 2 bên).
 */
const { supabase } = require('../config/supabase');

const PRODUCTION_FINISH_TYPES = ['production_finish'];
const LOGISTICS_OPS_TYPES = ['pickup', 'installation', 'delivery'];

function stripDraftHint(title) {
  if (!title) return title;
  return String(title)
    .replace(/\s*\(dự kiến\)\s*/gi, ' ')
    .replace(/\s*\(tạm\)\s*/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+—\s+/g, ' — ')
    .trim();
}

function matchesWanted(ev, wanted) {
  const t = String(ev.event_type || '').toLowerCase();
  if (wanted.has(t)) return true;
  if (
    wanted.has('production_finish')
    && String(ev.module || '').toLowerCase() === 'production'
    && /hoàn\s*thiện(\s*sản\s*xuất)?|hoan\s*thien/i.test(String(ev.title || ''))
  ) {
    return true;
  }
  return false;
}

/**
 * @param {string} projectId
 * @param {{ eventTypes?: string[] }} [opts]
 * @returns {Promise<{ ok: boolean, count: number, ids: string[], error?: string }>}
 */
async function applyPlannedOpsEvents(projectId, opts = {}) {
  if (!projectId) return { ok: false, count: 0, ids: [], error: 'missing projectId' };
  const eventTypes = Array.isArray(opts.eventTypes) && opts.eventTypes.length
    ? opts.eventTypes
    : [...PRODUCTION_FINISH_TYPES, ...LOGISTICS_OPS_TYPES];
  const wanted = new Set(eventTypes.map((t) => String(t).toLowerCase()));

  let rows = [];
  try {
    const { data, error } = await supabase
      .from('crm_events')
      .select('id, title, event_type, status, module')
      .eq('project_id', projectId)
      .eq('status', 'planned');
    if (error) throw error;
    rows = (data || []).filter((e) => matchesWanted(e, wanted));
  } catch (e) {
    console.warn('[apply-planned-ops] list:', e.message);
    return { ok: false, count: 0, ids: [], error: e.message };
  }

  const ids = [];
  const nowIso = new Date().toISOString();
  for (const ev of rows) {
    const nextTitle = stripDraftHint(ev.title);
    const patch = {
      status: 'in_progress',
      updated_at: nowIso,
      ...(nextTitle && nextTitle !== ev.title ? { title: nextTitle } : {}),
    };
    const { error } = await supabase.from('crm_events').update(patch).eq('id', ev.id);
    if (error) {
      console.warn('[apply-planned-ops] update', ev.id, error.message);
      continue;
    }
    ids.push(String(ev.id));
  }

  return { ok: true, count: ids.length, ids };
}

async function applyProductionFinishOnSxIntake(projectId) {
  return applyPlannedOpsEvents(projectId, { eventTypes: PRODUCTION_FINISH_TYPES });
}

async function applyLogisticsOpsOnVcIntake(projectId) {
  return applyPlannedOpsEvents(projectId, { eventTypes: LOGISTICS_OPS_TYPES });
}

/**
 * Kéo thẻ SX vào cột is_handover_to_logistics («Đơn hàng đã chuẩn bị xong»):
 * hoàn thành sự kiện «Hoàn thiện sản xuất» + tắt deadline thẻ Kanban.
 * Không xóa ngày lắp / giao / hoàn thiện — VC/LĐ vẫn cần lịch đó.
 */
async function completeProductionFinishOnHandover(projectId, opts = {}) {
  if (!projectId) return { ok: false, count: 0, ids: [], error: 'missing projectId' };
  const nowIso = new Date().toISOString();
  const reason = String(opts.reason || 'Tự hoàn thành khi kéo sang cột bàn giao vận chuyển').trim();

  try {
    let { error: dlErr } = await supabase
      .from('projects')
      .update({
        sx_kanban_deadline_at: null,
        sx_kanban_deadline_reason: null,
        updated_at: nowIso,
      })
      .eq('id', projectId);
    if (dlErr && /sx_kanban_deadline/.test(String(dlErr.message || ''))) {
      ({ error: dlErr } = await supabase.from('projects').update({ updated_at: nowIso }).eq('id', projectId));
    }
    if (dlErr) console.warn('[complete-sx-finish] clear kanban deadline:', dlErr.message);
  } catch (e) {
    console.warn('[complete-sx-finish] clear kanban deadline:', e.message);
  }

  let rows = [];
  try {
    const { data, error } = await supabase
      .from('crm_events')
      .select('id, title, event_type, status, module')
      .eq('project_id', projectId)
      .in('status', ['planned', 'in_progress']);
    if (error) throw error;
    rows = (data || []).filter((e) => matchesWanted(e, new Set(PRODUCTION_FINISH_TYPES)));
  } catch (e) {
    console.warn('[complete-sx-finish] list:', e.message);
    return { ok: false, count: 0, ids: [], error: e.message };
  }

  const ids = [];
  for (const ev of rows) {
    const nextTitle = stripDraftHint(ev.title);
    const patch = {
      status: 'completed',
      result: reason,
      updated_at: nowIso,
      ...(nextTitle && nextTitle !== ev.title ? { title: nextTitle } : {}),
    };
    let { error } = await supabase.from('crm_events').update(patch).eq('id', ev.id);
    if (error && /column.*result/i.test(String(error.message || ''))) {
      const { result: _r, ...noResult } = patch;
      void _r;
      ({ error } = await supabase.from('crm_events').update(noResult).eq('id', ev.id));
    }
    if (error) {
      console.warn('[complete-sx-finish] update', ev.id, error.message);
      continue;
    }
    ids.push(String(ev.id));
  }

  return { ok: true, count: ids.length, ids };
}

module.exports = {
  applyPlannedOpsEvents,
  applyProductionFinishOnSxIntake,
  applyLogisticsOpsOnVcIntake,
  completeProductionFinishOnHandover,
  PRODUCTION_FINISH_TYPES,
  LOGISTICS_OPS_TYPES,
};
