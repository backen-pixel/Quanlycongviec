import type { CrmEmployee } from '../api/crmMeta';
import type { AuthUser } from '../context/AuthContext';
import type { CrmKanbanItem, PlannerItem } from '../types';

const ELEVATED_CRM_ROLES = new Set([
  'admin',
  'sales_admin',
  'manager',
  'region_admin',
  'super_admin',
  'superadmin',
  'owner',
  'director',
]);

export function canViewAllCrm(user: { role?: string | null } | null | undefined): boolean {
  return ELEVATED_CRM_ROLES.has(String(user?.role ?? '').trim().toLowerCase());
}

/** Trường tối thiểu để kiểm tra quyền gán (Kanban + Deadline). */
export type CrmAssigneeTarget = Pick<CrmKanbanItem, 'kind' | 'ownerId'> & {
  assignedToId?: string;
  leadOwnerId?: string;
};

export function itemIsMine(item: CrmAssigneeTarget, myId: string): boolean {
  if (!myId) return false;
  const ids = [item.assignedToId, item.leadOwnerId, item.ownerId].filter(Boolean);
  return ids.some((id) => String(id) === String(myId));
}

export function itemHasAssignee(item: CrmAssigneeTarget): boolean {
  const id = item.assignedToId || item.leadOwnerId || item.ownerId;
  return !!id && id !== 'unassigned';
}

/** Có hiện nút gán trên thẻ Kanban / Deadline. */
export function canAssignCrmCard(
  user: AuthUser | null,
  item: CrmAssigneeTarget,
  myId: string,
  companyId: string,
): boolean {
  if (!companyId) return false;
  if (canViewAllCrm(user)) return true;
  if (!myId) return false;
  if (item.kind === 'lead') {
    if (!itemHasAssignee(item)) return true;
    return itemIsMine(item, myId);
  }
  if (item.kind === 'deal') {
    if (!itemHasAssignee(item)) return itemIsMine(item, myId);
    return itemIsMine(item, myId);
  }
  return false;
}

/** Danh sách NV trong picker — admin: tất cả; sale: chỉ bản thân. */
export function buildAssignPickerOptions(
  employees: CrmEmployee[],
  user: AuthUser | null,
  myId: string,
): { id: string; name: string }[] {
  if (canViewAllCrm(user)) {
    return employees.map((u) => ({
      id: u.id,
      name: (u.full_name || u.email || 'Nhân viên').trim(),
    }));
  }
  const me = employees.find((u) => String(u.id) === String(myId));
  const label = me?.full_name || me?.email || user?.full_name || user?.email || 'Tôi';
  return [{ id: myId, name: label.trim() || 'Tôi' }];
}

export function canClearCrmAssignee(user: AuthUser | null): boolean {
  return canViewAllCrm(user);
}

/** Map PlannerItem → target gán (Deadline). */
export function plannerAsAssigneeTarget(item: PlannerItem): CrmAssigneeTarget {
  return {
    kind: item.kind,
    ownerId: item.ownerId,
    assignedToId: item.assignedToId || '',
    leadOwnerId: item.leadOwnerId || '',
  };
}
