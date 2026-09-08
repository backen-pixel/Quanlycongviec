/**
 * Vai trò người được giao trên crm_assignment_assignees.assign_role.
 * primary = chịu trách nhiệm chính (có thể nhiều); executor / observer / manager.
 */

const { supabase } = require('../config/supabase');

const ASSIGN_ROLES = new Set(['primary', 'executor', 'observer', 'manager']);

function normalizeAssignRole(raw, fallback = 'executor') {
  const v = String(raw || '').trim().toLowerCase();
  return ASSIGN_ROLES.has(v) ? v : fallback;
}

/**
 * body.assignee_roles: { [userId]: role } hoặc [{ user_id, role }]
 */
function roleMapFromBody(body) {
  const map = {};
  const raw = body?.assignee_roles;
  if (!raw) return map;
  if (Array.isArray(raw)) {
    for (const row of raw) {
      const uid = String(row?.user_id || row?.id || '').trim();
      if (!uid) continue;
      map[uid] = normalizeAssignRole(row.role);
    }
    return map;
  }
  if (typeof raw === 'object') {
    for (const [uid, role] of Object.entries(raw)) {
      if (!uid) continue;
      map[String(uid)] = normalizeAssignRole(role);
    }
  }
  return map;
}

function pickPrimaryAssigneeId(userIds, rolesByUserId) {
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  const primary = ids.find((id) => normalizeAssignRole(rolesByUserId?.[id], '') === 'primary');
  return primary || ids[0] || null;
}

function isAssignRoleColumnError(err) {
  // Chi la "thieu cot" khi SQLSTATE = 42703. Neu khong, mot loi 23505 co ten
  // rang buoc chua chu assign_role cung lot vao day va chay nham duong.
  if (err?.code && err.code !== '42703') return false;
  const m = String(err?.message || '').toLowerCase();
  return m.includes('assign_role');
}

async function replaceAssignmentAssigneesWithRoles(assignmentId, userIds, rolesByUserId = {}) {
  await supabase.from('crm_assignment_assignees').delete().eq('assignment_id', assignmentId);
  const uniq = [...new Set((userIds || []).filter(Boolean).map(String))];
  if (!uniq.length) return uniq;
  const rows = uniq.map((uid) => ({
    assignment_id: assignmentId,
    user_id: uid,
    assign_role: normalizeAssignRole(rolesByUserId?.[uid]),
  }));
  // upsert thay cho insert: DELETE + INSERT o tren KHONG nguyen tu, hai request
  // bam gan nhau (double-click Luu) dam nhau o pkey (assignment_id, user_id) -> 23505.
  let { error } = await supabase
    .from('crm_assignment_assignees')
    .upsert(rows, { onConflict: 'assignment_id,user_id' });
  if (error && isAssignRoleColumnError(error)) {
    ({ error } = await supabase.from('crm_assignment_assignees').upsert(
      uniq.map((uid) => ({ assignment_id: assignmentId, user_id: uid })),
      { onConflict: 'assignment_id,user_id', ignoreDuplicates: true },
    ));
  }
  if (error) {
    if (!/crm_assignment_assignees/.test(error.message || '')) throw error;
    console.warn('[assignment-assignees]', error.code || '', error.message);
  }
  return uniq;
}

function attachRoleToUser(user, assignRole) {
  if (!user) return user;
  return { ...user, assign_role: normalizeAssignRole(assignRole) };
}

module.exports = {
  ASSIGN_ROLES,
  normalizeAssignRole,
  roleMapFromBody,
  pickPrimaryAssigneeId,
  isAssignRoleColumnError,
  replaceAssignmentAssigneesWithRoles,
  attachRoleToUser,
};
