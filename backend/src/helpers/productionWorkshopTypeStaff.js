const { supabase } = require('../config/supabase');
const { createNotification } = require('./notifications');
const {
  resolveProductionHandoverResponsibleUserId,
} = require('./productionHandoverSettings');
const {
  ensureDealProductionAutoParticipants,
  ensureProjectProductionAutoParticipants,
  getDealCompanyAutoParticipantUserIds,
} = require('./dealParticipantProduction');

/** Users thuộc công ty SX (users.company_id ∪ phòng ban của công ty). */
async function loadUsersForProductionCompany(companyId) {
  if (!companyId) return [];
  const byId = new Map();
  const select = 'id, full_name, email, role, department:departments!users_department_id_fkey(id, name, company_id)';
  try {
    const { data: direct } = await supabase
      .from('users')
      .select(select)
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('full_name');
    for (const u of direct || []) {
      if (u?.id) byId.set(String(u.id), u);
    }
  } catch { /* ignore */ }

  try {
    const { data: dpts } = await supabase
      .from('departments')
      .select('id')
      .eq('company_id', companyId)
      .eq('is_active', true);
    const deptIds = (dpts || []).map((d) => d.id).filter(Boolean);
    if (deptIds.length) {
      const { data: viaDept } = await supabase
        .from('users')
        .select(select)
        .in('department_id', deptIds)
        .eq('is_active', true)
        .order('full_name');
      for (const u of viaDept || []) {
        if (u?.id && !byId.has(String(u.id))) byId.set(String(u.id), u);
      }
    }
  } catch { /* ignore */ }

  return [...byId.values()].sort((a, b) =>
    String(a.full_name || '').localeCompare(String(b.full_name || ''), 'vi'));
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

async function assertActiveUserExists(userId) {
  if (!userId) return false;
  const { data: u } = await supabase
    .from('users')
    .select('id, is_active')
    .eq('id', userId)
    .maybeSingle();
  return !!u && u.is_active !== false;
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

/** Role được phép auto-thêm vào tab Thành viên deal (không gồm admin/staff CRM). */
const AUTO_LEAD_MEMBER_ROLES = new Set([
  'production_admin', 'production_staff', 'production',
  'crm_production_admin', 'crm_production_staff',
  'logistics_admin', 'logistics', 'driver', 'installer', 'shipping',
]);

/** Chỉ role khối SX khi fallback gán project_production_staff. */
const FALLBACK_STAFF_ROLES = new Set([
  'production_admin', 'production_staff', 'production',
  'crm_production_admin', 'crm_production_staff',
]);

/** Lọc user_id — chỉ NV SX/VC mới được auto ghi vào lead_members. */
async function filterUserIdsEligibleForAutoLeadMembers(userIds) {
  const ids = [...new Set((userIds || []).map(String).filter(Boolean))];
  if (!ids.length) return [];
  const { data: users } = await supabase
    .from('users')
    .select('id, role, drive_module')
    .in('id', ids);
  return (users || [])
    .filter((u) => {
      const drive = String(u.drive_module || '').trim().toLowerCase();
      if (SX_VC_DRIVE_MODULES.has(drive)) return true;
      return AUTO_LEAD_MEMBER_ROLES.has(String(u.role || '').trim().toLowerCase());
    })
    .map((u) => String(u.id));
}

/**
 * Fallback khi chưa cấu hình NV mặc định phân loại:
 * chỉ NV role SX — không chèn admin/sales_admin CRM làm phụ trách.
 */
async function resolveFallbackStaffForProductionCompany(companyId) {
  if (!companyId) return { userIds: [], primaryUserId: null };

  const users = await loadUsersForProductionCompany(companyId);
  const preferred = users.filter((u) => FALLBACK_STAFF_ROLES.has(String(u.role || '').toLowerCase()));
  const userIds = [...new Set(preferred.map((u) => String(u.id)).filter(Boolean))];
  if (!userIds.length) return { userIds: [], primaryUserId: null };

  const handoverId = await resolveProductionHandoverResponsibleUserId(companyId);
  const primaryUserId = handoverId && userIds.includes(String(handoverId))
    ? String(handoverId)
    : userIds[0];
  return { userIds, primaryUserId };
}

/** @returns {{ userIds: string[], primaryUserId: string|null }} */
async function getDefaultStaffForType(companyId, workshopTypeId) {
  if (!companyId) {
    return { userIds: [], primaryUserId: null };
  }
  if (workshopTypeId) {
    const map = await loadWorkshopTypeDefaultStaffMap(companyId);
    const block = map.get(String(workshopTypeId));
    if (block?.userIds?.length) return block;
  }
  return resolveFallbackStaffForProductionCompany(companyId);
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

/**
 * Deal gắn dự án SX: qua crm_leads.project_id (primary) hoặc crm_deal_projects (multi-xưởng).
 * @returns {Promise<Array<{ id: string, company_id: string|null, assigned_to?: string|null, lead_owner_id?: string|null }>>}
 */
async function loadDealsLinkedToProject(projectId, { selectExtra = false } = {}) {
  if (!projectId) return [];
  const byId = new Map();

  const primarySelect = selectExtra
    ? 'id, company_id, assigned_to, lead_owner_id'
    : 'id, company_id';
  const { data: primaryDeals } = await supabase
    .from('crm_leads')
    .select(primarySelect)
    .eq('project_id', projectId)
    .eq('type', 'deal');
  for (const d of primaryDeals || []) {
    if (d?.id) byId.set(String(d.id), d);
  }

  try {
    const { data: links } = await supabase
      .from('crm_deal_projects')
      .select('deal_id')
      .eq('project_id', projectId);
    const junctionIds = [...new Set((links || []).map((r) => r.deal_id).filter(Boolean))]
      .filter((id) => !byId.has(String(id)));
    if (junctionIds.length) {
      const { data: junctionDeals } = await supabase
        .from('crm_leads')
        .select(primarySelect)
        .in('id', junctionIds)
        .eq('type', 'deal');
      for (const d of junctionDeals || []) {
        if (d?.id) byId.set(String(d.id), d);
      }
    }
  } catch (e) {
    if (!String(e.message || '').includes('crm_deal_projects')) {
      console.warn('[productionWorkshopTypeStaff] loadDealsLinkedToProject:', e.message);
    }
  }

  return [...byId.values()];
}

/** project_id gắn deal: primary + mọi dòng crm_deal_projects. */
async function loadProjectIdsForDeal(leadId) {
  if (!leadId) return [];
  const ids = new Set();
  const { data: lead } = await supabase
    .from('crm_leads')
    .select('id, project_id')
    .eq('id', leadId)
    .maybeSingle();
  if (lead?.project_id) ids.add(String(lead.project_id));
  try {
    const { data: links } = await supabase
      .from('crm_deal_projects')
      .select('project_id')
      .eq('deal_id', leadId);
    for (const row of links || []) {
      if (row?.project_id) ids.add(String(row.project_id));
    }
  } catch (e) {
    if (!String(e.message || '').includes('crm_deal_projects')) {
      console.warn('[productionWorkshopTypeStaff] loadProjectIdsForDeal:', e.message);
    }
  }
  return [...ids];
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

/** Role / drive_module thuộc khối SX hoặc VC — giữ lại khi prune thành viên CRM. */
const SX_VC_MEMBER_ROLES = AUTO_LEAD_MEMBER_ROLES;
const SX_VC_DRIVE_MODULES = new Set(['sx', 'production', 'vc', 'logistics']);

function isSxOrVcMemberUser(user) {
  if (!user) return false;
  const drive = String(user.drive_module || '').trim().toLowerCase();
  if (SX_VC_DRIVE_MODULES.has(drive)) return true;
  const role = String(user.role || '').trim().toLowerCase();
  return SX_VC_MEMBER_ROLES.has(role);
}

/**
 * Khi deal đã vào xưởng: chỉ giữ người chịu trách nhiệm CRM (+ NV SX/VC/kế toán).
 * Xóa các thành viên CRM khác khỏi lead_members (tab Thành viên dùng chung CRM/SX).
 */
async function pruneNonResponsibleCrmLeadMembersForDeal(dealId) {
  if (!dealId) return { removed: 0 };

  const { data: lead } = await supabase
    .from('crm_leads')
    .select('id, company_id, assigned_to, lead_owner_id, project_id')
    .eq('id', dealId)
    .maybeSingle();

  const projectIds = await loadProjectIdsForDeal(dealId);
  if (!projectIds.length && !lead?.project_id) return { removed: 0 };

  const keep = new Set(
    [lead?.assigned_to, lead?.lead_owner_id].filter(Boolean).map(String),
  );

  const projectPersonCandidates = new Set();
  for (const projectId of projectIds) {
    const { data: proj } = await supabase
      .from('projects')
      .select('sales_person_id, production_person_id, logistics_person_id, installer_person_id')
      .eq('id', projectId)
      .maybeSingle();
    for (const uid of [
      proj?.sales_person_id,
      proj?.production_person_id,
      proj?.logistics_person_id,
      proj?.installer_person_id,
    ]) {
      if (uid) projectPersonCandidates.add(String(uid));
    }
    try {
      // loadProjectSxLeadMemberUserIds đã lọc theo role SX/VC hợp lệ.
      for (const uid of await loadProjectSxLeadMemberUserIds(projectId)) {
        keep.add(String(uid));
      }
    } catch (_) { /* ignore */ }
  }
  // Người trên projects (sales/production/logistics/installer_person_id) chỉ giữ nếu role SX/VC hợp lệ.
  if (projectPersonCandidates.size) {
    const eligibleProjectPersons = await filterUserIdsEligibleForAutoLeadMembers([...projectPersonCandidates]);
    for (const uid of eligibleProjectPersons) keep.add(String(uid));
  }

  try {
    const autoIds = await getDealCompanyAutoParticipantUserIds(lead?.company_id);
    for (const uid of autoIds || []) keep.add(String(uid));
  } catch (_) { /* ignore */ }

  // Đảm bảo người chịu trách nhiệm CRM có trong tab Thành viên.
  const responsibleId = lead?.assigned_to || lead?.lead_owner_id || null;
  if (responsibleId) {
    keep.add(String(responsibleId));
    try {
      await mergeDealLeadMembers({ dealId, userIds: [String(responsibleId)] });
    } catch (e) {
      console.warn('[productionWorkshopTypeStaff] ensure CRM responsible member:', e.message);
    }
  }

  const { data: members, error: memErr } = await supabase
    .from('lead_members')
    .select('user_id, user:users!lead_members_user_id_fkey(id, role, drive_module)')
    .eq('lead_id', dealId);
  if (memErr) {
    console.warn('[productionWorkshopTypeStaff] prune load members:', memErr.message);
    return { removed: 0 };
  }

  const toRemove = [];
  for (const m of members || []) {
    const uid = String(m.user_id || '');
    if (!uid || keep.has(uid)) continue;
    // Giữ NV SX/VC thêm tay; CRM thừa (không phụ trách) thì gỡ.
    if (isSxOrVcMemberUser(m.user)) continue;
    toRemove.push(uid);
  }
  if (!toRemove.length) return { removed: 0 };

  const { error: delErr } = await supabase
    .from('lead_members')
    .delete()
    .eq('lead_id', dealId)
    .in('user_id', toRemove);
  if (delErr) {
    console.warn('[productionWorkshopTypeStaff] prune CRM members:', delErr.message);
    return { removed: 0, error: delErr.message };
  }
  return { removed: toRemove.length };
}

async function pruneNonResponsibleCrmLeadMembersForProject(projectId) {
  if (!projectId) return { removed: 0, deals: 0 };
  const deals = await loadDealsLinkedToProject(projectId);
  let removed = 0;
  for (const deal of deals || []) {
    const r = await pruneNonResponsibleCrmLeadMembersForDeal(deal.id);
    removed += r.removed || 0;
  }
  return { removed, deals: (deals || []).length };
}

/**
 * Gán NV mặc định cho dự án theo phân loại xưởng.
 * @returns {Promise<string|null>} production_person_id (phụ trách chính)
 */
async function applyWorkshopTypeDefaultStaffToProject(projectId, companyId, workshopTypeId) {
  if (!projectId || !companyId) return null;

  let { userIds, primaryUserId } = await getDefaultStaffForType(companyId, workshopTypeId);

  if (!userIds.length) {
    const fb = await resolveFallbackStaffForProductionCompany(companyId);
    userIds = fb.userIds || [];
    primaryUserId = fb.primaryUserId || null;
  }

  if (!userIds.length) {
    await ensureProjectProductionAutoParticipants(projectId);
    // Không có NV SX mặc định — vẫn chỉ giữ người chịu trách nhiệm CRM trên tab Thành viên.
    await pruneNonResponsibleCrmLeadMembersForProject(projectId);
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

  // Đủ NV setup phân loại → project_production_staff + tab Thành viên (role member).
  // CRM trên deal: prune chỉ giữ 1 người chịu trách nhiệm.
  await syncLeadMembersForProject(projectId, userIds, primaryId, {
    previousUserIds,
    membersAsMemberRole: true,
  });
  await ensureProjectProductionAutoParticipants(projectId);
  await pruneNonResponsibleCrmLeadMembersForProject(projectId);

  return primaryId;
}

/**
 * Đồng bộ NV SX → tab Thành viên deal (lead_members).
 * Upsert NV xưởng; thành viên CRM thừa được prune riêng sau khi chuyển SX.
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

/**
 * Khi gán production_person_id thủ công → đảm bảo NV đó có trong project_production_staff (phụ trách chính)
 * và tab Thành viên deal (lead_members).
 */
async function syncProductionPersonToStaffAndMembers(projectId, userId, opts = {}) {
  if (!projectId || !userId) return { synced: 0 };

  const uid = String(userId);
  let staffRows = [];
  try {
    const { data } = await supabase
      .from('project_production_staff')
      .select('id, user_id, order_index, is_primary')
      .eq('project_id', projectId)
      .order('order_index');
    staffRows = data || [];
  } catch (e) {
    if (String(e.message || '').includes('project_production_staff')) {
      staffRows = [];
    } else {
      throw e;
    }
  }

  const exists = staffRows.some((r) => String(r.user_id) === uid);
  const maxOrder = staffRows.reduce((m, r) => Math.max(m, r.order_index ?? 0), -1);

  try {
    await supabase
      .from('project_production_staff')
      .update({ is_primary: false })
      .eq('project_id', projectId);
    if (exists) {
      await supabase
        .from('project_production_staff')
        .update({ is_primary: true })
        .eq('project_id', projectId)
        .eq('user_id', uid);
    } else {
      let { error: insErr } = await supabase.from('project_production_staff').insert({
        project_id: projectId,
        user_id: uid,
        order_index: maxOrder + 1,
        is_primary: true,
      });
      if (insErr && String(insErr.message || '').includes('is_primary')) {
        ({ error: insErr } = await supabase.from('project_production_staff').insert({
          project_id: projectId,
          user_id: uid,
          order_index: maxOrder + 1,
        }));
      }
      if (insErr) {
        console.warn('[productionWorkshopTypeStaff] syncProductionPerson insert:', insErr.message);
        return { synced: 0, error: insErr.message };
      }
    }
  } catch (e) {
    console.warn('[productionWorkshopTypeStaff] syncProductionPerson staff:', e.message);
    return { synced: 0, error: e.message };
  }

  // Giữ cả roster staff hiện có trên dự án + người vừa gán (đều vào tab Thành viên).
  const staffIds = exists
    ? staffRows.map((r) => String(r.user_id)).filter(Boolean)
    : [...staffRows.map((r) => String(r.user_id)).filter(Boolean), uid];
  if (!staffIds.includes(uid)) staffIds.unshift(uid);
  return syncLeadMembersForProject(projectId, staffIds, uid, {
    ...opts,
    membersAsMemberRole: true,
  });
}

/**
 * NV setup SX trên dự án (+ VC/LĐ) đủ điều kiện lên tab Thành viên.
 * Chỉ role SX/VC hợp lệ — bỏ role `staff` / admin CRM (không tự động thêm dù có trong default staff).
 */
async function loadProjectSxLeadMemberUserIds(projectId) {
  if (!projectId) return [];
  const candidates = new Set();
  try {
    for (const uid of await loadProjectProductionStaffUserIds(projectId)) {
      candidates.add(String(uid));
    }
  } catch (_) { /* ignore */ }

  const { data: proj } = await supabase
    .from('projects')
    .select('production_person_id, logistics_person_id, installer_person_id')
    .eq('id', projectId)
    .maybeSingle();
  for (const uid of [proj?.production_person_id, proj?.logistics_person_id, proj?.installer_person_id]) {
    if (uid) candidates.add(String(uid));
  }
  return filterUserIdsEligibleForAutoLeadMembers([...candidates]);
}

/** Lazy backfill: mọi NV setup SX (mọi dự án gắn deal) + prune CRM chỉ còn 1 người chịu trách nhiệm. */
async function ensureLeadMembersFromProjectStaff(leadId) {
  if (!leadId) return { synced: 0 };

  const projectIds = await loadProjectIdsForDeal(leadId);
  if (!projectIds.length) return { synced: 0 };

  const userIds = [];
  const seen = new Set();
  const allStaffCandidates = new Set();
  for (const projectId of projectIds) {
    for (const uid of await loadProjectSxLeadMemberUserIds(projectId)) {
      if (seen.has(uid)) continue;
      seen.add(uid);
      userIds.push(uid);
    }
    try {
      for (const uid of await loadProjectProductionStaffUserIds(projectId)) {
        allStaffCandidates.add(String(uid));
      }
    } catch (_) { /* ignore */ }
  }

  // Gỡ NV role không thuộc khối SX/VC (vd. staff/admin/sales) đã lỡ được ghi vào lead_members
  // qua các luồng cũ. Không đụng NV thêm tay từ tab Thành viên (không nằm trong roster xưởng).
  const allowedSet = new Set(userIds);
  const surplus = [...allStaffCandidates].filter((uid) => !allowedSet.has(uid));
  if (surplus.length) {
    const { error: delErr } = await supabase
      .from('lead_members')
      .delete()
      .eq('lead_id', leadId)
      .in('user_id', surplus);
    if (delErr) {
      console.warn('[productionWorkshopTypeStaff] cleanup surplus:', delErr.message);
    }
  }

  if (!userIds.length) {
    await ensureDealProductionAutoParticipants({ dealId: leadId, dealCompanyId: null });
    await pruneNonResponsibleCrmLeadMembersForDeal(leadId);
    return { synced: 0 };
  }

  const { data: existing } = await supabase
    .from('lead_members')
    .select('user_id')
    .eq('lead_id', leadId);
  const existingIds = new Set((existing || []).map((r) => String(r.user_id)));
  const missing = userIds.filter((uid) => !existingIds.has(String(uid)));
  let synced = 0;
  if (missing.length) {
    const r = await mergeDealLeadMembers({ dealId: leadId, userIds: missing });
    synced = r.added || 0;
  }
  await ensureDealProductionAutoParticipants({ dealId: leadId, dealCompanyId: null });
  await pruneNonResponsibleCrmLeadMembersForDeal(leadId);
  return { synced };
}

/** Đồng bộ lead_members cho mọi deal gắn project (primary + crm_deal_projects). */
async function syncLeadMembersForProject(projectId, userIds, primaryUserId, opts = {}) {
  if (!projectId) return { synced: 0 };
  const { previousUserIds = [], membersAsMemberRole = false } = opts;
  const rawIds = (userIds || []).map(String).filter(Boolean);
  // Chỉ user role SX/VC hợp lệ mới vào tab Thành viên — bỏ role staff/admin CRM
  // (dù có mặt trong project_production_staff hay default staff phân loại).
  const eligible = rawIds.length
    ? new Set(await filterUserIdsEligibleForAutoLeadMembers(rawIds))
    : new Set();
  const ids = rawIds.filter((uid) => eligible.has(uid));
  if (!ids.length && !(previousUserIds || []).length) return { synced: 0 };
  const primaryEligibleId = primaryUserId && eligible.has(String(primaryUserId))
    ? String(primaryUserId)
    : (ids[0] || null);

  const newSet = new Set(ids);
  const staleUserIds = [...new Set(
    (previousUserIds || []).map(String).filter((uid) => uid && !newSet.has(uid)),
  )];

  const deals = await loadDealsLinkedToProject(projectId);
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
    if (ids.length) {
      if (membersAsMemberRole) {
        const r = await mergeDealLeadMembers({
          dealId: deal.id,
          userIds: ids,
          addedBy: opts.addedBy || null,
        });
        total += r.added || 0;
      } else {
        const r = await syncProductionStaffToLeadMembers({
          dealId: deal.id,
          userIds: ids,
          primaryUserId: primaryEligibleId,
          addedBy: opts.addedBy || null,
        });
        total += r.synced || 0;
      }
    }
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

/**
 * Map pipeline_stage_id → cấu hình NV theo loại.
 * @returns {Map<string, {
 *   userIds: string[],
 *   primaryUserId: string|null,
 *   logisticsPersonId: string|null,
 *   installerPersonId: string|null,
 * }>}
 */
async function loadPipelineStageDefaultStaffMap(stageIds) {
  const out = new Map();
  const ids = [...new Set((stageIds || []).map(String).filter(Boolean))];
  if (!ids.length) return out;

  const emptyBlock = () => ({
    userIds: [],
    primaryUserId: null,
    logisticsPersonId: null,
    installerPersonId: null,
  });

  let rows = [];
  let { data, error } = await supabase
    .from('production_pipeline_stage_default_staff')
    .select('production_pipeline_stage_id, user_id, order_index, is_primary, staff_kind')
    .in('production_pipeline_stage_id', ids)
    .order('order_index');
  if (error && String(error.message || '').includes('staff_kind')) {
    ({ data, error } = await supabase
      .from('production_pipeline_stage_default_staff')
      .select('production_pipeline_stage_id, user_id, order_index, is_primary')
      .in('production_pipeline_stage_id', ids)
      .order('order_index'));
  }
  if (error) {
    if (String(error.message || '').includes('production_pipeline_stage_default_staff')) return out;
    throw error;
  }
  rows = data || [];

  for (const row of rows) {
    const key = String(row.production_pipeline_stage_id);
    if (!out.has(key)) out.set(key, emptyBlock());
    const block = out.get(key);
    const kind = String(row.staff_kind || 'production').toLowerCase();
    const uid = row.user_id ? String(row.user_id) : null;
    if (!uid) continue;
    if (kind === 'logistics') {
      block.logisticsPersonId = uid;
      continue;
    }
    if (kind === 'installation') {
      block.installerPersonId = uid;
      continue;
    }
    block.userIds.push(uid);
    if (row.is_primary) block.primaryUserId = uid;
  }
  for (const block of out.values()) {
    if (!block.primaryUserId && block.userIds.length) {
      block.primaryUserId = block.userIds[0];
    }
  }
  return out;
}

/** @returns block từ loadPipelineStageDefaultStaffMap */
async function getDefaultStaffForPipelineStage(pipelineStageId) {
  if (!pipelineStageId) {
    return {
      userIds: [], primaryUserId: null, logisticsPersonId: null, installerPersonId: null,
    };
  }
  const map = await loadPipelineStageDefaultStaffMap([pipelineStageId]);
  return map.get(String(pipelineStageId)) || {
    userIds: [], primaryUserId: null, logisticsPersonId: null, installerPersonId: null,
  };
}

function formatPipelineStageDefaultsForApi(staffMap) {
  const defaults = {};
  for (const [stageId, block] of staffMap.entries()) {
    defaults[stageId] = {
      user_ids: block.userIds,
      primary_user_id: block.primaryUserId,
      logistics_person_id: block.logisticsPersonId,
      installer_person_id: block.installerPersonId,
    };
  }
  return defaults;
}

function collectUserIdsFromPipelineStaffBlock(block) {
  if (!block) return [];
  return [
    ...(block.userIds || []),
    block.logisticsPersonId,
    block.installerPersonId,
  ].map(String).filter(Boolean);
}

async function enrichPipelineStagesWithDefaultStaff(stages) {
  const list = stages || [];
  if (!list.length) return list;
  const staffMap = await loadPipelineStageDefaultStaffMap(list.map((s) => s.id));
  const allUserIds = [...new Set(
    [...staffMap.values()].flatMap((b) => collectUserIdsFromPipelineStaffBlock(b)),
  )];
  const userById = new Map();
  if (allUserIds.length) {
    const { data: users } = await supabase
      .from('users')
      .select('id, full_name, email, company_id, department:departments!users_department_id_fkey(id, name, company_id)')
      .in('id', allUserIds);
    for (const u of users || []) {
      userById.set(String(u.id), u);
    }
  }
  return list.map((s) => {
    const block = staffMap.get(String(s.id)) || {
      userIds: [], primaryUserId: null, logisticsPersonId: null, installerPersonId: null,
    };
    const userIds = block.userIds || [];
    return {
      ...s,
      default_staff: {
        user_ids: userIds,
        primary_user_id: block.primaryUserId || null,
        logistics_person_id: block.logisticsPersonId || null,
        installer_person_id: block.installerPersonId || null,
        users: userIds.map((uid) => userById.get(String(uid))).filter(Boolean),
        logistics_person: block.logisticsPersonId ? userById.get(String(block.logisticsPersonId)) || null : null,
        installer_person: block.installerPersonId ? userById.get(String(block.installerPersonId)) || null : null,
      },
    };
  });
}

async function savePipelineStageDefaultStaff(stageId, companyId, blockInput) {
  if (!stageId) throw new Error('Thiếu pipeline_stage_id');

  const { data: stage } = await supabase
    .from('production_pipeline_stages')
    .select('id, company_id, bucket_slug')
    .eq('id', stageId)
    .maybeSingle();
  if (!stage) throw new Error('Không tìm thấy cột pipeline');
  if (stage.bucket_slug === 'won_pending') {
    throw new Error('Cột chờ vào xưởng không cấu hình thành viên tự động');
  }

  const scopeCompanyId = companyId || stage.company_id || null;
  if (scopeCompanyId && stage.company_id && String(stage.company_id) !== String(scopeCompanyId)) {
    throw new Error('Cột pipeline không thuộc công ty này');
  }

  let userIds = (Array.isArray(blockInput?.user_ids) ? blockInput.user_ids : [])
    .map((id) => String(id).trim())
    .filter(Boolean);
  const primaryRaw = blockInput?.primary_user_id && String(blockInput.primary_user_id).trim();
  let primaryUserId = primaryRaw || null;

  if (primaryUserId) {
    const ok = await assertActiveUserExists(primaryUserId);
    if (!ok) throw new Error('Phụ trách chính không tồn tại hoặc đã ngưng hoạt động');
    if (!userIds.includes(primaryUserId)) {
      userIds = [primaryUserId, ...userIds];
    }
  }

  if (userIds.length && !primaryUserId) {
    primaryUserId = userIds[0];
  }

  if (primaryUserId && userIds.length && !userIds.includes(primaryUserId)) {
    throw new Error('Phụ trách chính phải nằm trong danh sách NV của cột');
  }

  const logisticsPersonId = blockInput?.logistics_person_id
    ? String(blockInput.logistics_person_id).trim()
    : null;
  const installerPersonId = blockInput?.installer_person_id
    ? String(blockInput.installer_person_id).trim()
    : null;

  if (logisticsPersonId) {
    const ok = await assertActiveUserExists(logisticsPersonId);
    if (!ok) throw new Error('Phụ trách vận chuyển không tồn tại hoặc đã ngưng hoạt động');
  }
  if (installerPersonId) {
    const ok = await assertActiveUserExists(installerPersonId);
    if (!ok) throw new Error('Người lắp đặt không tồn tại hoặc đã ngưng hoạt động');
  }

  const seen = new Set();
  const rows = [];
  let i = 0;
  for (const uid of userIds) {
    const ok = await assertActiveUserExists(uid);
    if (!ok) throw new Error('Nhân viên không tồn tại hoặc đã ngưng hoạt động');
    const dedupe = `production:${uid}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    rows.push({
      production_pipeline_stage_id: stageId,
      user_id: uid,
      order_index: i,
      is_primary: String(uid) === String(primaryUserId),
      staff_kind: 'production',
    });
    i += 1;
  }
  if (logisticsPersonId) {
    rows.push({
      production_pipeline_stage_id: stageId,
      user_id: logisticsPersonId,
      order_index: 0,
      is_primary: true,
      staff_kind: 'logistics',
    });
  }
  if (installerPersonId) {
    rows.push({
      production_pipeline_stage_id: stageId,
      user_id: installerPersonId,
      order_index: 0,
      is_primary: true,
      staff_kind: 'installation',
    });
  }

  const { error: delErr } = await supabase
    .from('production_pipeline_stage_default_staff')
    .delete()
    .eq('production_pipeline_stage_id', stageId);
  if (delErr && !String(delErr.message || '').includes('production_pipeline_stage_default_staff')) {
    throw delErr;
  }

  if (rows.length) {
    let { error: insErr } = await supabase
      .from('production_pipeline_stage_default_staff')
      .insert(rows);
    if (insErr && String(insErr.message || '').includes('staff_kind')) {
      const legacyRows = rows.map(({ staff_kind: _omit, ...rest }) => rest);
      ({ error: insErr } = await supabase
        .from('production_pipeline_stage_default_staff')
        .insert(legacyRows));
    }
    if (insErr) throw insErr;
  }

  return { saved: rows.length };
}

/**
 * Chỉ thêm thành viên deal — không đổi role người đã có (giữ phụ trách CRM/SX/VC).
 */
async function mergeDealLeadMembers({ dealId, userIds, addedBy = null }) {
  if (!dealId || !userIds?.length) return { added: 0 };
  const toAdd = [...new Set(userIds.map(String).filter(Boolean))];
  if (!toAdd.length) return { added: 0 };

  const { data: existing } = await supabase
    .from('lead_members')
    .select('user_id')
    .eq('lead_id', dealId)
    .in('user_id', toAdd);
  const existingIds = new Set((existing || []).map((r) => String(r.user_id)));
  const missing = toAdd.filter((uid) => !existingIds.has(String(uid)));
  if (!missing.length) return { added: 0, added_user_ids: [] };

  const rows = missing.map((uid) => ({
    lead_id: dealId,
    user_id: uid,
    role: 'member',
    ...(addedBy ? { added_by: addedBy } : {}),
  }));
  const { error } = await supabase.from('lead_members').insert(rows);
  if (error) {
    console.warn('[productionWorkshopTypeStaff] mergeDealLeadMembers:', error.message);
    return { added: 0, error: error.message, added_user_ids: [] };
  }
  return { added: rows.length, added_user_ids: missing };
}

/** Gộp NV vào tab Thành viên deal — không ghi đè role hiện có. */
async function mergeLeadMembersForProject(projectId, userIds, opts = {}) {
  if (!projectId || !userIds?.length) return { added: 0, added_user_ids: [] };
  const eligibleIds = await filterUserIdsEligibleForAutoLeadMembers(userIds);
  if (!eligibleIds.length) return { added: 0, added_user_ids: [] };
  const deals = await loadDealsLinkedToProject(projectId, { selectExtra: true });

  let total = 0;
  const addedUserIds = new Set();
  for (const deal of deals || []) {
    const r = await mergeDealLeadMembers({
      dealId: deal.id,
      userIds: eligibleIds,
      addedBy: opts.addedBy || null,
    });
    total += r.added || 0;
    for (const uid of r.added_user_ids || []) addedUserIds.add(String(uid));
    await ensureDealProductionAutoParticipants({
      dealId: deal.id,
      dealCompanyId: deal.company_id,
      addedBy: opts.addedBy || null,
    });
  }
  return { added: total, added_user_ids: [...addedUserIds] };
}

async function notifyPipelineStageAutoMembers(req, {
  projectId,
  stageName,
  leadIds,
  addedUserIds,
  actorUserId,
}) {
  if (!req || !addedUserIds?.length) return;
  try {
    const { data: actor } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', actorUserId || req.user?.userId)
      .maybeSingle();
    const { data: project } = await supabase
      .from('projects')
      .select('code, name')
      .eq('id', projectId)
      .maybeSingle();
    const { data: addedUsers } = await supabase
      .from('users')
      .select('id, full_name')
      .in('id', addedUserIds);
    const names = (addedUsers || []).map((u) => u.full_name).filter(Boolean).join(', ') || 'thành viên';
    const projectLabel = project ? `${project.code || ''} ${project.name || ''}`.trim() : 'dự án';
    const stageLabel = stageName || 'cột pipeline';
    const actorName = actor?.full_name || 'Hệ thống';
    const moverId = actorUserId || req.user?.userId;

    for (const uid of addedUserIds) {
      if (String(uid) === String(moverId)) continue;
      const leadId = leadIds?.[0] || null;
      await createNotification(
        req,
        uid,
        'lead_member_added',
        '👥 Bạn được thêm vào đội dự án',
        `${actorName} đã thêm bạn vào ${projectLabel} (cột «${stageLabel}»)`,
        leadId ? 'lead' : 'project',
        leadId || projectId,
        { nav_tab: 'team', project_id: projectId, ecosystem_module_key: 'production' },
      );
    }

    if (moverId && addedUserIds.length) {
      await createNotification(
        req,
        moverId,
        'pipeline_stage_staff_added',
        '👥 Đã thêm thành viên theo cột',
        `Đã gộp ${names} vào ${projectLabel} — cột «${stageLabel}»`,
        'project',
        projectId,
        { stage_name: stageLabel, added_count: addedUserIds.length, ecosystem_module_key: 'production' },
      );
    }
  } catch (e) {
    console.warn('[productionWorkshopTypeStaff] notifyPipelineStageAutoMembers:', e.message);
  }
}

/**
 * Gộp NV cấu hình theo cột pipeline vào dự án + tab Thành viên deal.
 * Giữ nguyên phụ trách CRM (assigned_to), SX (production_person_id), VC/LĐ đã gán.
 */
async function applyPipelineStageDefaultStaffToProject(projectId, pipelineStageId, opts = {}) {
  if (!projectId || !pipelineStageId) return { added: 0, users: [], production_staff: [] };

  let autoAdd = false;
  let stageName = '';
  try {
    const { data: stage } = await supabase
      .from('production_pipeline_stages')
      .select('id, name, auto_add_members_on_enter, company_id, bucket_slug')
      .eq('id', pipelineStageId)
      .maybeSingle();
    if (!stage || stage.bucket_slug === 'won_pending') return { added: 0, users: [], production_staff: [] };
    autoAdd = !!stage.auto_add_members_on_enter;
    stageName = stage.name || '';
    if (!autoAdd) return { added: 0, users: [], production_staff: [] };
  } catch (e) {
    if (String(e.message || '').includes('auto_add_members_on_enter')) return { added: 0, users: [], production_staff: [] };
    throw e;
  }

  const config = await getDefaultStaffForPipelineStage(pipelineStageId);
  const {
    userIds = [],
    primaryUserId = null,
    logisticsPersonId = null,
    installerPersonId = null,
  } = config;

  const hasProduction = userIds.length > 0;
  const hasLogistics = !!logisticsPersonId;
  const hasInstallation = !!installerPersonId;
  if (!hasProduction && !hasLogistics && !hasInstallation) {
    return { added: 0, users: [], production_staff: [], stage_name: stageName };
  }

  const { data: proj } = await supabase
    .from('projects')
    .select('production_person_id, logistics_person_id, installer_person_id')
    .eq('id', projectId)
    .maybeSingle();

  const nowIso = new Date().toISOString();
  let productionAdded = 0;
  const memberUserIds = new Set();
  const touchedUsers = [];

  const pushTouched = (uid, kind) => {
    if (!uid) return;
    const key = String(uid);
    if (touchedUsers.some((t) => String(t.id) === key && t.kind === kind)) return;
    touchedUsers.push({ id: key, kind });
  };

  if (hasProduction) {
    const existingIds = await loadProjectProductionStaffUserIds(projectId);
    const existingSet = new Set(existingIds.map(String));
    const toAdd = userIds.filter((uid) => !existingSet.has(String(uid)));

    if (toAdd.length) {
      try {
        const { data: existingRows } = await supabase
          .from('project_production_staff')
          .select('order_index')
          .eq('project_id', projectId)
          .order('order_index', { ascending: false })
          .limit(1);
        let nextOrder = (existingRows?.[0]?.order_index ?? -1) + 1;

        const effectivePrimary = proj?.production_person_id
          ? String(proj.production_person_id)
          : (primaryUserId || userIds[0] || null);

        const rows = toAdd.map((uid, i) => ({
          project_id: projectId,
          user_id: uid,
          order_index: nextOrder + i,
          is_primary: !proj?.production_person_id && effectivePrimary && String(uid) === String(effectivePrimary),
        }));

        let { error: insErr } = await supabase.from('project_production_staff').insert(rows);
        if (insErr && String(insErr.message || '').includes('is_primary')) {
          const plainRows = rows.map(({ project_id, user_id, order_index }) => ({
            project_id, user_id, order_index,
          }));
          ({ error: insErr } = await supabase.from('project_production_staff').insert(plainRows));
        }
        if (insErr) {
          console.warn('[productionWorkshopTypeStaff] pipeline stage staff insert:', insErr.message);
        } else {
          productionAdded += rows.length;
          for (const uid of toAdd) pushTouched(uid, 'production');
        }

        if (!proj?.production_person_id && effectivePrimary) {
          await supabase
            .from('projects')
            .update({ production_person_id: effectivePrimary, updated_at: nowIso })
            .eq('id', projectId);
        }
      } catch (e) {
        console.warn('[productionWorkshopTypeStaff] pipeline stage staff:', e.message);
      }
    }

    for (const uid of userIds) memberUserIds.add(String(uid));
  }

  const projectPatch = { updated_at: nowIso };
  if (hasLogistics && logisticsPersonId && !proj?.logistics_person_id) {
    projectPatch.logistics_person_id = logisticsPersonId;
    memberUserIds.add(String(logisticsPersonId));
    pushTouched(logisticsPersonId, 'logistics');
  }
  if (hasInstallation && installerPersonId && !proj?.installer_person_id) {
    projectPatch.installer_person_id = installerPersonId;
    memberUserIds.add(String(installerPersonId));
    pushTouched(installerPersonId, 'installation');
  }
  if (Object.keys(projectPatch).length > 1) {
    let { error: patchErr } = await supabase.from('projects').update(projectPatch).eq('id', projectId);
    if (patchErr && /logistics_person_id|installer_person_id/.test(patchErr.message || '')) {
      const fallback = { updated_at: nowIso };
      if (projectPatch.logistics_person_id && !proj?.logistics_person_id) {
        fallback.logistics_person_id = projectPatch.logistics_person_id;
      }
      if (Object.keys(fallback).length > 1) {
        ({ error: patchErr } = await supabase.from('projects').update(fallback).eq('id', projectId));
      }
      if (projectPatch.installer_person_id && !proj?.installer_person_id) {
        try {
          await supabase
            .from('projects')
            .update({ installer_person_id: projectPatch.installer_person_id, updated_at: nowIso })
            .eq('id', projectId);
        } catch (_) { /* column may not exist */ }
      }
    } else if (patchErr) {
      console.warn('[productionWorkshopTypeStaff] pipeline VC/LĐ patch:', patchErr.message);
    }
  }

  let dealMembersAdded = 0;
  const dealMemberUserIds = [];
  if (memberUserIds.size) {
    const mergeResult = await mergeLeadMembersForProject(projectId, [...memberUserIds], {
      addedBy: opts.addedBy || null,
    });
    dealMembersAdded = mergeResult?.added || 0;
    dealMemberUserIds.push(...(mergeResult?.added_user_ids || []));
  }
  await ensureProjectProductionAutoParticipants(projectId);

  const notifyIds = [...new Set([
    ...touchedUsers.map((t) => t.id),
    ...dealMemberUserIds.map(String),
  ])];
  if (opts.req && notifyIds.length) {
    const deals = await loadDealsLinkedToProject(projectId);
    await notifyPipelineStageAutoMembers(opts.req, {
      projectId,
      stageName,
      leadIds: (deals || []).map((d) => d.id),
      addedUserIds: notifyIds,
      actorUserId: opts.addedBy || null,
    });
  }

  const profileIds = [...new Set(notifyIds)];
  const userById = new Map();
  if (profileIds.length) {
    const { data: users } = await supabase
      .from('users')
      .select('id, full_name, email, avatar')
      .in('id', profileIds);
    for (const u of users || []) userById.set(String(u.id), u);
  }

  const kindById = new Map(touchedUsers.map((t) => [String(t.id), t.kind]));
  for (const uid of userIds) {
    if (!kindById.has(String(uid))) kindById.set(String(uid), 'production');
  }
  if (logisticsPersonId) kindById.set(String(logisticsPersonId), 'logistics');
  if (installerPersonId) kindById.set(String(installerPersonId), 'installation');

  const usersOut = profileIds
    .map((id) => {
      const u = userById.get(String(id));
      if (!u) return null;
      return { ...u, kind: kindById.get(String(id)) || 'production' };
    })
    .filter(Boolean);

  const production_staff = await loadProjectProductionStaffForApi(projectId);

  return {
    added: usersOut.length,
    production_staff_added: productionAdded,
    deal_members_added: dealMembersAdded,
    users: usersOut,
    production_staff,
    stage_name: stageName,
  };
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
  syncProductionPersonToStaffAndMembers,
  ensureLeadMembersFromProjectStaff,
  syncLeadMembersForProject,
  pruneNonResponsibleCrmLeadMembersForDeal,
  pruneNonResponsibleCrmLeadMembersForProject,
  loadPipelineStageDefaultStaffMap,
  getDefaultStaffForPipelineStage,
  formatPipelineStageDefaultsForApi,
  enrichPipelineStagesWithDefaultStaff,
  savePipelineStageDefaultStaff,
  applyPipelineStageDefaultStaffToProject,
  mergeDealLeadMembers,
  mergeLeadMembersForProject,
};
