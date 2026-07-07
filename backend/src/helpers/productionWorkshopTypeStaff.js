const { supabase } = require('../config/supabase');
const {
  resolveProductionHandoverResponsibleUserId,
} = require('./productionHandoverSettings');
const {
  ensureDealProductionAutoParticipants,
  ensureProjectProductionAutoParticipants,
  getDealCompanyAutoParticipantUserIds,
} = require('./dealParticipantProduction');

/** Users thuộc công ty SX (users.company_id hoặc qua departments). */
async function loadUsersForProductionCompany(companyId) {
  if (!companyId) return [];
  let usersCo = [];
  try {
    const { data: direct } = await supabase
      .from('users')
      .select('id, full_name, email, role, department:departments!users_department_id_fkey(id, name, company_id)')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('full_name');
    usersCo = direct || [];
  } catch {
    usersCo = [];
  }
  if (!usersCo.length) {
    const { data: dpts } = await supabase
      .from('departments')
      .select('id')
      .eq('company_id', companyId)
      .eq('is_active', true);
    const deptIds = (dpts || []).map((d) => d.id).filter(Boolean);
    if (deptIds.length) {
      const { data: viaDept } = await supabase
        .from('users')
        .select('id, full_name, email, role, department:departments!users_department_id_fkey(id, name, company_id)')
        .in('department_id', deptIds)
        .eq('is_active', true)
        .order('full_name');
      usersCo = viaDept || [];
    }
  }
  return usersCo;
}

async function userBelongsToProductionCompany(userId, companyId) {
  if (!userId || !companyId) return false;
  const { data: ru } = await supabase
    .from('users')
    .select('id, company_id, department:departments!users_department_id_fkey(id, company_id)')
    .eq('id', userId)
    .maybeSingle();
  const resolved = ru?.company_id || ru?.department?.company_id || null;
  return !!ru && String(resolved || '') === String(companyId);
}

/**
 * Map workshop_type_id → { userIds, primaryUserId }.
 * @returns {Map<string, { userIds: string[], primaryUserId: string|null }>}
 */
async function loadWorkshopTypeDefaultStaffMap(companyId) {
  const out = new Map();
  if (!companyId) return out;
  const { data, error } = await supabase
    .from('production_workshop_type_default_staff')
    .select('workshop_type_id, user_id, order_index, is_primary')
    .eq('production_company_id', companyId)
    .order('order_index');
  if (error) {
    if (String(error.message || '').includes('production_workshop_type_default_staff')) return out;
    throw error;
  }
  for (const row of data || []) {
    const key = String(row.workshop_type_id);
    if (!out.has(key)) out.set(key, { userIds: [], primaryUserId: null });
    const block = out.get(key);
    if (row.user_id) block.userIds.push(String(row.user_id));
    if (row.is_primary && row.user_id) block.primaryUserId = String(row.user_id);
  }
  for (const block of out.values()) {
    if (!block.primaryUserId && block.userIds.length) {
      block.primaryUserId = block.userIds[0];
    }
  }
  return out;
}

/** @returns {{ userIds: string[], primaryUserId: string|null }} */
async function getDefaultStaffForType(companyId, workshopTypeId) {
  if (!companyId || !workshopTypeId) {
    return { userIds: [], primaryUserId: null };
  }
  const map = await loadWorkshopTypeDefaultStaffMap(companyId);
  const block = map.get(String(workshopTypeId));
  if (block?.userIds?.length) return block;
  const fallback = await resolveProductionHandoverResponsibleUserId(companyId);
  return fallback
    ? { userIds: [String(fallback)], primaryUserId: String(fallback) }
    : { userIds: [], primaryUserId: null };
}

/** @deprecated dùng getDefaultStaffForType */
async function getDefaultStaffUserIds(companyId, workshopTypeId) {
  const { userIds } = await getDefaultStaffForType(companyId, workshopTypeId);
  return userIds;
}

async function loadProjectProductionStaffUserIds(projectId) {
  if (!projectId) return [];
  try {
    const { data } = await supabase
      .from('project_production_staff')
      .select('user_id, is_primary')
      .eq('project_id', projectId)
      .order('is_primary', { ascending: false })
      .order('order_index');
    return (data || []).map((r) => String(r.user_id)).filter(Boolean);
  } catch (e) {
    if (String(e.message || '').includes('project_production_staff')) return [];
    throw e;
  }
}

function sortStaffUsers(rows) {
  return [...(rows || [])].sort((a, b) => {
    const ap = a.is_primary ? 1 : 0;
    const bp = b.is_primary ? 1 : 0;
    if (bp !== ap) return bp - ap;
    return (a.order_index ?? 0) - (b.order_index ?? 0);
  });
}

/** Gắn production_staff[] lên danh sách dự án (Kanban / list). */
async function attachProductionStaffToProjects(projects) {
  const list = projects || [];
  const ids = list.map((p) => p.id).filter(Boolean);
  if (!ids.length) return list;
  try {
    const { data } = await supabase
      .from('project_production_staff')
      .select('project_id, order_index, is_primary, user:users(id, full_name, avatar)')
      .in('project_id', ids);
    const byProject = new Map();
    for (const row of sortStaffUsers(data || [])) {
      const key = String(row.project_id);
      if (!byProject.has(key)) byProject.set(key, []);
      if (row.user) {
        byProject.get(key).push({ ...row.user, is_primary: !!row.is_primary });
      }
    }
    return list.map((p) => ({
      ...p,
      production_staff: byProject.get(String(p.id)) || [],
    }));
  } catch (e) {
    if (String(e.message || '').includes('project_production_staff')) return list;
    throw e;
  }
}

/**
 * Gán NV mặc định cho dự án theo phân loại xưởng.
 * @returns {Promise<string|null>} production_person_id (phụ trách chính)
 */
async function applyWorkshopTypeDefaultStaffToProject(projectId, companyId, workshopTypeId) {
  if (!projectId || !companyId) return null;

  let { userIds, primaryUserId } = workshopTypeId
    ? await getDefaultStaffForType(companyId, workshopTypeId)
    : { userIds: [], primaryUserId: null };

  if (!userIds.length) {
    const fb = await resolveProductionHandoverResponsibleUserId(companyId);
    userIds = fb ? [String(fb)] : [];
    primaryUserId = fb ? String(fb) : null;
  }

  if (!userIds.length) {
    await ensureProjectProductionAutoParticipants(projectId);
    return null;
  }

  const primaryId = primaryUserId && userIds.includes(String(primaryUserId))
    ? String(primaryUserId)
    : String(userIds[0]);

  const previousUserIds = await loadProjectProductionStaffUserIds(projectId);
  const nowIso = new Date().toISOString();

  let staffInserted = false;
  try {
    await supabase.from('project_production_staff').delete().eq('project_id', projectId);
    const rows = userIds.map((uid, i) => ({
      project_id: projectId,
      user_id: uid,
      order_index: i,
      is_primary: String(uid) === primaryId,
    }));
    let { error: insErr } = await supabase.from('project_production_staff').insert(rows);
    if (insErr && String(insErr.message || '').includes('is_primary')) {
      const plainRows = rows.map(({ project_id, user_id, order_index }) => ({
        project_id, user_id, order_index,
      }));
      ({ error: insErr } = await supabase.from('project_production_staff').insert(plainRows));
    }
    if (insErr) {
      console.error('[productionWorkshopTypeStaff] insert failed:', insErr.message);
    } else {
      staffInserted = true;
    }
  } catch (e) {
    console.error('[productionWorkshopTypeStaff] project_production_staff:', e.message);
  }

  if (!staffInserted) {
    console.warn(`[productionWorkshopTypeStaff] Không ghi được ${userIds.length} NV cho project ${projectId}`);
  }

  await supabase
    .from('projects')
    .update({ production_person_id: primaryId, updated_at: nowIso })
    .eq('id', projectId);

  // Không ghi đè assigned_to / lead_owner_id trên deal CRM — giữ NVKD làm người phụ trách.
  // NV xưởng chỉ ghi vào project_production_staff + lead_members (tab Thành viên).
  await syncLeadMembersForProject(projectId, userIds, primaryId, { previousUserIds });
  await ensureProjectProductionAutoParticipants(projectId);

  return primaryId;
}

/**
 * Đồng bộ NV SX → tab Thành viên deal (lead_members).
 * Upsert — giữ thành viên CRM đã thêm thủ công.
 */
async function syncProductionStaffToLeadMembers({ dealId, userIds, primaryUserId, addedBy = null }) {
  if (!dealId || !userIds?.length) return { synced: 0 };
  const primaryId = primaryUserId ? String(primaryUserId) : String(userIds[0]);
  const rows = userIds.map((uid) => ({
    lead_id: dealId,
    user_id: String(uid),
    role: String(uid) === primaryId ? 'responsible' : 'member',
    ...(addedBy ? { added_by: addedBy } : {}),
  }));
  const { error } = await supabase
    .from('lead_members')
    .upsert(rows, { onConflict: 'lead_id,user_id' });
  if (error) {
    console.warn('[productionWorkshopTypeStaff] lead_members sync:', error.message);
    return { synced: 0, error: error.message };
  }
  return { synced: rows.length };
}

/** Lazy backfill: deal có project → ghi thiếu NV từ project_production_staff vào lead_members. */
async function ensureLeadMembersFromProjectStaff(leadId) {
  if (!leadId) return { synced: 0 };

  const { data: lead } = await supabase
    .from('crm_leads')
    .select('id, project_id')
    .eq('id', leadId)
    .maybeSingle();
  if (!lead?.project_id) return { synced: 0 };

  let staffRows = [];
  try {
    const { data } = await supabase
      .from('project_production_staff')
      .select('user_id, is_primary, order_index')
      .eq('project_id', lead.project_id)
      .order('is_primary', { ascending: false })
      .order('order_index');
    staffRows = data || [];
  } catch (e) {
    if (String(e.message || '').includes('project_production_staff')) return { synced: 0 };
    throw e;
  }

  let userIds = staffRows.map((r) => String(r.user_id)).filter(Boolean);
  let primaryUserId = staffRows.find((r) => r.is_primary)?.user_id || userIds[0] || null;

  if (!userIds.length) {
    const { data: proj } = await supabase
      .from('projects')
      .select('production_person_id')
      .eq('id', lead.project_id)
      .maybeSingle();
    if (proj?.production_person_id) {
      userIds = [String(proj.production_person_id)];
      primaryUserId = proj.production_person_id;
    }
  }

  if (!userIds.length) {
    await ensureDealProductionAutoParticipants({ dealId: leadId, dealCompanyId: null });
    return { synced: 0 };
  }

  const { data: existing } = await supabase
    .from('lead_members')
    .select('user_id')
    .eq('lead_id', leadId);
  const existingIds = new Set((existing || []).map((r) => String(r.user_id)));
  const missing = userIds.filter((uid) => !existingIds.has(String(uid)));
  if (!missing.length) {
    await ensureDealProductionAutoParticipants({ dealId: leadId, dealCompanyId: null });
    return { synced: 0 };
  }

  const r = await syncProductionStaffToLeadMembers({
    dealId: leadId,
    userIds,
    primaryUserId,
  });
  await ensureDealProductionAutoParticipants({ dealId: leadId, dealCompanyId: null });
  return r;
}

/** Đồng bộ lead_members cho mọi deal gắn project. */
async function syncLeadMembersForProject(projectId, userIds, primaryUserId, opts = {}) {
  if (!projectId || !userIds?.length) return { synced: 0 };
  const { previousUserIds = [] } = opts;
  const newSet = new Set(userIds.map(String));
  const staleUserIds = [...new Set(
    (previousUserIds || []).map(String).filter((uid) => uid && !newSet.has(uid)),
  )];

  const { data: deals } = await supabase
    .from('crm_leads')
    .select('id, company_id')
    .eq('project_id', projectId)
    .eq('type', 'deal');
  let total = 0;
  for (const deal of deals || []) {
    const protectedIds = new Set(
      (await getDealCompanyAutoParticipantUserIds(deal.company_id)).map(String),
    );
    if (staleUserIds.length) {
      const staleToRemove = staleUserIds.filter((uid) => !protectedIds.has(String(uid)));
      if (staleToRemove.length) {
        const { error: delErr } = await supabase
          .from('lead_members')
          .delete()
          .eq('lead_id', deal.id)
          .in('user_id', staleToRemove);
        if (delErr) {
          console.warn('[productionWorkshopTypeStaff] lead_members cleanup:', delErr.message);
        }
      }
    }
    const r = await syncProductionStaffToLeadMembers({
      dealId: deal.id,
      userIds,
      primaryUserId,
      addedBy: opts.addedBy || null,
    });
    total += r.synced || 0;
    await ensureDealProductionAutoParticipants({
      dealId: deal.id,
      dealCompanyId: deal.company_id,
      addedBy: opts.addedBy || null,
    });
  }
  return { synced: total };
}

/**
 * Áp dụng NV mặc định theo phân loại cho mọi dự án SX đang có phân loại đó.
 * Ghi đè project_production_staff, production_person_id + đồng bộ lead_members (không đổi NVKD trên deal).
 */
async function applyWorkshopTypeDefaultStaffToAllProjects(companyId, workshopTypeId) {
  if (!companyId || !workshopTypeId) {
    return { updated: 0, project_ids: [] };
  }

  const { data: wt } = await supabase
    .from('workshop_project_types')
    .select('id, company_id, name')
    .eq('id', workshopTypeId)
    .maybeSingle();
  if (!wt || String(wt.company_id) !== String(companyId)) {
    throw new Error('Phân loại không thuộc công ty sản xuất');
  }

  const { data: projects, error } = await supabase
    .from('projects')
    .select('id')
    .eq('company_id', companyId)
    .eq('workshop_type_id', workshopTypeId);
  if (error) throw error;

  const projectIds = (projects || []).map((p) => p.id).filter(Boolean);
  if (!projectIds.length) {
    return { updated: 0, project_ids: [], workshop_type_name: wt.name };
  }

  for (const projectId of projectIds) {
    await applyWorkshopTypeDefaultStaffToProject(projectId, companyId, workshopTypeId);
  }

  return {
    updated: projectIds.length,
    project_ids: projectIds,
    workshop_type_name: wt.name,
  };
}

/** Tự gán NV mặc định cho dự án đã có phân loại nhưng chưa có dòng project_production_staff. */
async function backfillMissingProductionStaff(projects) {
  const candidates = (projects || []).filter((p) => p?.id && p?.company_id && p?.workshop_type_id);
  if (!candidates.length) return 0;

  const ids = candidates.map((p) => p.id);
  let existing = new Set();
  try {
    const { data } = await supabase
      .from('project_production_staff')
      .select('project_id')
      .in('project_id', ids);
    existing = new Set((data || []).map((r) => String(r.project_id)));
  } catch (e) {
    if (String(e.message || '').includes('project_production_staff')) return 0;
    throw e;
  }

  const missing = candidates.filter((p) => !existing.has(String(p.id))).slice(0, 30);
  if (!missing.length) return 0;

  await Promise.all(
    missing.map((p) => applyWorkshopTypeDefaultStaffToProject(p.id, p.company_id, p.workshop_type_id)),
  );
  return missing.length;
}

/** Gắn production_staff[] lên deal/lead (qua project_id). */
async function enrichCrmLeadsWithProductionStaff(leads) {
  const list = Array.isArray(leads) ? leads : [];
  if (!list.length) return list;

  const projectIds = [...new Set(
    list.map((l) => l?.project_id || l?.linked_project?.id).filter(Boolean).map(String),
  )];
  if (!projectIds.length) return list;

  let projectsMeta = [];
  try {
    const { data } = await supabase
      .from('projects')
      .select('id, company_id, workshop_type_id, production_person_id')
      .in('id', projectIds);
    projectsMeta = data || [];
  } catch (_) { /* ignore */ }

  const primaryByProject = new Map(
    projectsMeta.map((p) => [String(p.id), p.production_person_id || null]),
  );

  try {
    await backfillMissingProductionStaff(projectsMeta);
    const { data: refreshed } = await supabase
      .from('projects')
      .select('id, production_person_id')
      .in('id', projectIds);
    if (refreshed?.length) {
      for (const p of refreshed) {
        primaryByProject.set(String(p.id), p.production_person_id || null);
      }
    }
  } catch (e) {
    console.warn('[productionWorkshopTypeStaff] backfill on CRM enrich:', e.message);
  }

  const staffedProjects = await attachProductionStaffToProjects(projectsMeta);
  const staffByProject = new Map(
    staffedProjects.map((p) => [String(p.id), p.production_staff || []]),
  );

  return list.map((lead) => {
    const pid = lead?.project_id || lead?.linked_project?.id;
    if (!pid) return lead;
    const key = String(pid);
    const production_staff = staffByProject.get(key) || [];
    const primaryUser = production_staff.find((u) => u.is_primary) || production_staff[0] || null;
    const linked_project = lead.linked_project
      ? {
        ...lead.linked_project,
        production_staff,
        production_person_id: primaryByProject.get(key) || lead.linked_project.production_person_id,
      }
      : lead.linked_project;
    return {
      ...lead,
      production_staff,
      linked_project,
      ...(primaryUser ? { production_person: primaryUser } : {}),
    };
  });
}

async function loadProjectProductionStaffForApi(projectId) {
  if (!projectId) return [];
  const [withStaff] = await attachProductionStaffToProjects([{ id: projectId }]);
  return withStaff?.production_staff || [];
}

async function saveWorkshopTypeDefaultStaff(companyId, defaultsInput) {
  if (!companyId) throw new Error('Thiếu company_id');
  const rows = [];
  const seen = new Set();

  for (const block of defaultsInput || []) {
    const typeId = block?.workshop_type_id && String(block.workshop_type_id).trim();
    if (!typeId) continue;

    const { data: wt } = await supabase
      .from('workshop_project_types')
      .select('id, company_id, applies_to')
      .eq('id', typeId)
      .maybeSingle();
    if (!wt || String(wt.company_id) !== String(companyId)) {
      throw new Error(`Phân loại ${typeId} không thuộc công ty`);
    }
    if (wt.applies_to && !['production', 'both'].includes(String(wt.applies_to))) {
      throw new Error(`Phân loại «${typeId}» không dùng cho SX`);
    }

    let userIds = (Array.isArray(block.user_ids) ? block.user_ids : [])
      .map((id) => String(id).trim())
      .filter(Boolean);
    const primaryRaw = block.primary_user_id && String(block.primary_user_id).trim();
    let primaryUserId = primaryRaw || null;

    if (primaryUserId) {
      const ok = await userBelongsToProductionCompany(primaryUserId, companyId);
      if (!ok) throw new Error('Phụ trách chính phải thuộc đúng công ty sản xuất');
      if (!userIds.includes(primaryUserId)) {
        userIds = [primaryUserId, ...userIds];
      }
    }

    if (userIds.length && !primaryUserId) {
      primaryUserId = userIds[0];
    }

    if (primaryUserId && userIds.length && !userIds.includes(primaryUserId)) {
      throw new Error('Phụ trách chính phải nằm trong danh sách NV của phân loại');
    }

    let i = 0;
    for (const uid of userIds) {
      const ok = await userBelongsToProductionCompany(uid, companyId);
      if (!ok) throw new Error('Nhân viên phải thuộc đúng công ty sản xuất');
      const dedupe = `${typeId}:${uid}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      rows.push({
        production_company_id: companyId,
        workshop_type_id: typeId,
        user_id: uid,
        order_index: i,
        is_primary: String(uid) === String(primaryUserId),
      });
      i += 1;
    }
  }

  const { error: delErr } = await supabase
    .from('production_workshop_type_default_staff')
    .delete()
    .eq('production_company_id', companyId);
  if (delErr && !String(delErr.message || '').includes('production_workshop_type_default_staff')) {
    throw delErr;
  }

  if (rows.length) {
    const { error: insErr } = await supabase
      .from('production_workshop_type_default_staff')
      .insert(rows);
    if (insErr) throw insErr;
  }

  return { saved: rows.length };
}

/** Chuẩn hóa defaults cho API GET. */
function formatDefaultsForApi(staffMap) {
  const defaults = {};
  for (const [typeId, block] of staffMap.entries()) {
    defaults[typeId] = {
      user_ids: block.userIds,
      primary_user_id: block.primaryUserId,
    };
  }
  return defaults;
}

module.exports = {
  loadUsersForProductionCompany,
  loadWorkshopTypeDefaultStaffMap,
  getDefaultStaffForType,
  getDefaultStaffUserIds,
  loadProjectProductionStaffUserIds,
  attachProductionStaffToProjects,
  backfillMissingProductionStaff,
  enrichCrmLeadsWithProductionStaff,
  loadProjectProductionStaffForApi,
  applyWorkshopTypeDefaultStaffToProject,
  applyWorkshopTypeDefaultStaffToAllProjects,
  saveWorkshopTypeDefaultStaff,
  formatDefaultsForApi,
  userBelongsToProductionCompany,
  syncProductionStaffToLeadMembers,
  ensureLeadMembersFromProjectStaff,
  syncLeadMembersForProject,
};
