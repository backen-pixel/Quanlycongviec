const { supabase } = require('../config/supabase');

function normalizeMemberUserIds(raw) {
  if (raw == null) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return [...new Set(list.map((id) => String(id || '').trim()).filter(Boolean))];
}

async function loadCrmStageDefaultMembersMap(stageIds) {
  const out = new Map();
  const ids = [...new Set((stageIds || []).map(String).filter(Boolean))];
  if (!ids.length) return out;
  const { data, error } = await supabase
    .from('crm_pipeline_stage_default_members')
    .select('stage_id, user_id, order_index, user:users!crm_pipeline_stage_default_members_user_id_fkey(id, full_name, email, avatar, role)')
    .in('stage_id', ids)
    .order('order_index');
  if (error) {
    if (String(error.message || '').includes('crm_pipeline_stage_default_members')) return out;
    throw error;
  }
  for (const row of data || []) {
    const sid = String(row.stage_id);
    if (!out.has(sid)) out.set(sid, { user_ids: [], users: [] });
    const block = out.get(sid);
    if (row.user_id) {
      block.user_ids.push(String(row.user_id));
      if (row.user) block.users.push(row.user);
    }
  }
  return out;
}

async function enrichCrmStagesWithDefaultMembers(stages) {
  const list = Array.isArray(stages) ? stages : [];
  if (!list.length) return list;
  let map;
  try {
    map = await loadCrmStageDefaultMembersMap(list.map((s) => s?.id).filter(Boolean));
  } catch (e) {
    console.warn('[crmPipelineStageMembers] enrich:', e.message);
    map = new Map();
  }
  return list.map((s) => {
    const block = map.get(String(s.id)) || { user_ids: [], users: [] };
    return {
      ...s,
      auto_add_members_on_enter: !!s.auto_add_members_on_enter,
      default_members: {
        user_ids: block.user_ids,
        users: block.users,
      },
    };
  });
}

async function saveCrmStageDefaultMembers(stageId, userIds) {
  if (!stageId) return { saved: 0 };
  const ids = normalizeMemberUserIds(userIds);
  const { error: delErr } = await supabase
    .from('crm_pipeline_stage_default_members')
    .delete()
    .eq('stage_id', stageId);
  if (delErr) {
    if (String(delErr.message || '').includes('crm_pipeline_stage_default_members')) {
      return { saved: 0, skipped: true };
    }
    throw delErr;
  }
  if (!ids.length) return { saved: 0 };
  const rows = ids.map((uid, i) => ({
    stage_id: stageId,
    user_id: uid,
    order_index: i,
  }));
  const { error: insErr } = await supabase.from('crm_pipeline_stage_default_members').insert(rows);
  if (insErr) throw insErr;
  return { saved: rows.length };
}

async function loadCrmStageDefaultMemberUserIds(stageId, { requireFlag = true } = {}) {
  if (!stageId) return [];
  if (requireFlag) {
    const { data: stage, error } = await supabase
      .from('crm_pipeline_stages')
      .select('id, auto_add_members_on_enter')
      .eq('id', stageId)
      .maybeSingle();
    if (error && String(error.message || '').includes('auto_add_members_on_enter')) return [];
    if (!stage?.auto_add_members_on_enter) return [];
  }
  const map = await loadCrmStageDefaultMembersMap([stageId]);
  return map.get(String(stageId))?.user_ids || [];
}

/** Mọi NV cấu hình trên pipeline (các cột đã bật tự thêm) — giữ khi prune tab Thành viên. */
async function loadCrmPipelineAutoMemberUserIds(pipelineId) {
  if (!pipelineId) return [];
  const { data: stages, error } = await supabase
    .from('crm_pipeline_stages')
    .select('id, auto_add_members_on_enter')
    .eq('pipeline_id', pipelineId);
  if (error) {
    if (String(error.message || '').includes('auto_add_members_on_enter')) return [];
    throw error;
  }
  const ids = (stages || [])
    .filter((s) => s.auto_add_members_on_enter)
    .map((s) => String(s.id));
  if (!ids.length) return [];
  const map = await loadCrmStageDefaultMembersMap(ids);
  const out = new Set();
  for (const block of map.values()) {
    for (const uid of block.user_ids || []) out.add(String(uid));
  }
  return [...out];
}

async function applyCrmStageDefaultMembersToDeal({ dealId, stageId, addedBy = null }) {
  if (!dealId || !stageId) return { added: 0, skipped: true };
  const userIds = await loadCrmStageDefaultMemberUserIds(stageId, { requireFlag: true });
  if (!userIds.length) return { added: 0, skipped: true };
  const { mergeDealLeadMembers } = require('./productionWorkshopTypeStaff');
  return mergeDealLeadMembers({ dealId, userIds, addedBy });
}

module.exports = {
  normalizeMemberUserIds,
  loadCrmStageDefaultMembersMap,
  enrichCrmStagesWithDefaultMembers,
  saveCrmStageDefaultMembers,
  loadCrmStageDefaultMemberUserIds,
  loadCrmPipelineAutoMemberUserIds,
  applyCrmStageDefaultMembersToDeal,
};
