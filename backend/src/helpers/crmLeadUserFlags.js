/**
 * Per-user flags trên thẻ lead/deal (bảng `crm_lead_user_flags`).
 *
 * - is_pinned: ghim thẻ lên đầu Kanban/List của user
 * - is_interacted: tick xanh "đã tương tác với khách hàng" (manual toggle)
 *
 * Cả hai cờ đều per-user — không ảnh hưởng người khác.
 */

const { supabase } = require('../config/supabase');
const { resolvePrimaryDealIdByProjectIds } = require('./crmProductionTaskStats');

/**
 * Batch lấy flags của 1 user cho nhiều lead_id.
 * @param {string} userId
 * @param {string[]} leadIds
 * @returns {Promise<Map<string, { is_pinned, pinned_at, is_interacted, interacted_at }>>}
 */
async function fetchFlagsByLeadIds(userId, leadIds) {
  const map = new Map();
  if (!userId || !Array.isArray(leadIds) || leadIds.length === 0) return map;
  const ids = [...new Set(leadIds.filter(Boolean).map(String))];
  if (ids.length === 0) return map;
  // Supabase PostgREST giới hạn URL ~8KB; chia batch 500 cho an toàn.
  const BATCH = 500;
  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH);
    const { data, error } = await supabase
      .from('crm_lead_user_flags')
      .select('lead_id, is_pinned, pinned_at, is_interacted, interacted_at')
      .eq('user_id', userId)
      .in('lead_id', slice);
    if (error) {
      // Bảng chưa migrate → bỏ qua, trả flags rỗng (BC).
      if (/crm_lead_user_flags/.test(error.message || '')) return map;
      throw error;
    }
    for (const row of data || []) {
      map.set(String(row.lead_id), {
        is_pinned: !!row.is_pinned,
        pinned_at: row.pinned_at || null,
        is_interacted: !!row.is_interacted,
        interacted_at: row.interacted_at || null,
      });
    }
  }
  return map;
}

/**
 * Gắn `is_pinned` / `pinned_at` / `is_interacted` / `interacted_at` vào từng row list.
 * Không-row trong DB → mặc định false/null.
 */
async function attachLeadUserFlagsForList(rows, userId) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  if (!userId) {
    return rows.map((r) => ({
      ...r,
      is_pinned: false,
      pinned_at: null,
      is_interacted: false,
      interacted_at: null,
    }));
  }
  const flags = await fetchFlagsByLeadIds(userId, rows.map((r) => r.id));
  return rows.map((r) => {
    const f = flags.get(String(r.id));
    return {
      ...r,
      is_pinned: f?.is_pinned ?? false,
      pinned_at: f?.pinned_at ?? null,
      is_interacted: f?.is_interacted ?? false,
      interacted_at: f?.interacted_at ?? null,
    };
  });
}

/**
 * Upsert flag cho (userId, leadId). Tự set timestamp khi bật cờ.
 * @param {object} patch chỉ chứa các field muốn đổi: { is_pinned?, is_interacted? }
 */
async function setLeadFlag(userId, leadId, patch) {
  if (!userId || !leadId) throw new Error('Missing userId or leadId');
  const now = new Date().toISOString();

  // Đọc row hiện tại để biết flag còn lại không bị ghi đè.
  const { data: existing, error: readErr } = await supabase
    .from('crm_lead_user_flags')
    .select('*')
    .eq('user_id', userId)
    .eq('lead_id', leadId)
    .maybeSingle();
  if (readErr && !/crm_lead_user_flags/.test(readErr.message || '')) throw readErr;

  const next = {
    user_id: userId,
    lead_id: leadId,
    is_pinned: existing?.is_pinned ?? false,
    pinned_at: existing?.pinned_at ?? null,
    is_interacted: existing?.is_interacted ?? false,
    interacted_at: existing?.interacted_at ?? null,
    updated_at: now,
  };

  if (Object.prototype.hasOwnProperty.call(patch || {}, 'is_pinned')) {
    next.is_pinned = !!patch.is_pinned;
    next.pinned_at = patch.is_pinned ? now : null;
  }
  if (Object.prototype.hasOwnProperty.call(patch || {}, 'is_interacted')) {
    next.is_interacted = !!patch.is_interacted;
    next.interacted_at = patch.is_interacted ? now : null;
  }

  const { data, error } = await supabase
    .from('crm_lead_user_flags')
    .upsert(next, { onConflict: 'user_id,lead_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

function resolvePrimaryCrmLeadIdFromProject(project) {
  const deals = Array.isArray(project?.crm_deals) ? project.crm_deals : [];
  const deal = deals.find((d) => String(d?.type || '') === 'deal') || deals[0];
  return deal?.id ? String(deal.id) : null;
}

/** Gắn cờ ghim/tương tác per-user từ deal CRM liên kết project SX. */
async function attachLeadUserFlagsToProjects(projects, userId) {
  if (!Array.isArray(projects) || projects.length === 0) return projects;

  const dealByProject = await resolvePrimaryDealIdByProjectIds(
    projects.map((p) => p.id).filter(Boolean),
  );
  const resolveLeadId = (p) => resolvePrimaryCrmLeadIdFromProject(p)
    || dealByProject.get(String(p.id))
    || null;

  if (!userId) {
    return projects.map((p) => ({
      ...p,
      crm_lead_id: resolveLeadId(p),
      is_pinned: false,
      pinned_at: null,
      is_interacted: false,
      interacted_at: null,
    }));
  }

  const leadIds = projects.map(resolveLeadId).filter(Boolean);
  const flags = await fetchFlagsByLeadIds(userId, leadIds);
  return projects.map((p) => {
    const leadId = resolveLeadId(p);
    const f = leadId ? flags.get(String(leadId)) : null;
    return {
      ...p,
      crm_lead_id: leadId,
      is_pinned: f?.is_pinned ?? false,
      pinned_at: f?.pinned_at ?? null,
      is_interacted: f?.is_interacted ?? false,
      interacted_at: f?.interacted_at ?? null,
    };
  });
}

module.exports = {
  fetchFlagsByLeadIds,
  attachLeadUserFlagsForList,
  attachLeadUserFlagsToProjects,
  resolvePrimaryCrmLeadIdFromProject,
  setLeadFlag,
};
