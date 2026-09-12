/** Vai trò người được giao trên crm_assignment_assignees.assign_role. */

export const ASSIGN_ROLE_OPTIONS = [
  { value: 'primary', label: 'Chịu trách nhiệm chính' },
  { value: 'executor', label: 'Người thực hiện' },
  { value: 'observer', label: 'Người quan sát' },
  { value: 'manager', label: 'Quản lý' },
];

export const DEFAULT_ASSIGN_ROLE = 'executor';

export function normalizeAssignRole(raw, fallback = DEFAULT_ASSIGN_ROLE) {
  const v = String(raw || '').trim().toLowerCase();
  return ASSIGN_ROLE_OPTIONS.some((o) => o.value === v) ? v : fallback;
}

export function assignRoleLabel(role) {
  const v = normalizeAssignRole(role, '');
  return ASSIGN_ROLE_OPTIONS.find((o) => o.value === v)?.label || '';
}

export function assignRoleShortLabel(role) {
  const v = normalizeAssignRole(role, '');
  if (v === 'primary') return 'Chính';
  if (v === 'executor') return 'TH';
  if (v === 'observer') return 'QS';
  if (v === 'manager') return 'QL';
  return '';
}

export function rolesMapFromAssignees(assignees) {
  const map = {};
  for (const u of assignees || []) {
    const id = String(u?.id || u?.user_id || '').trim();
    if (!id) continue;
    map[id] = normalizeAssignRole(u.assign_role);
  }
  return map;
}

export function assigneeRolesPayload(userIds, rolesByUserId = {}) {
  const out = {};
  for (const id of userIds || []) {
    const sid = String(id || '').trim();
    if (!sid) continue;
    out[sid] = normalizeAssignRole(rolesByUserId[sid]);
  }
  return out;
}
