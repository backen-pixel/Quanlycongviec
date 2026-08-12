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
  'platform_admin',
]);

type RoleUser = {
  role?: string | null;
  company_id?: string | null;
} | null | undefined;

function normalizeRole(user: RoleUser): string {
  return String(user?.role ?? '').trim().toLowerCase();
}

export function hasCompanyId(user: RoleUser): boolean {
  return user?.company_id != null && String(user.company_id).trim() !== '';
}

/**
 * Admin hệ thống — `admin` không gắn company_id.
 * Được chọn mọi công ty / mọi phụ trách (toàn quyền phạm vi CRM trên mobile).
 */
export function isSystemAdmin(user: RoleUser): boolean {
  return normalizeRole(user) === 'admin' && !hasCompanyId(user);
}

/**
 * Admin/QL trong 1 công ty (admin + company_id, sales_admin, manager, …).
 * Xem được mọi phụ trách trong công ty, nhưng không đổi sang công ty khác.
 */
export function isCompanyScopedElevated(user: RoleUser): boolean {
  return !isSystemAdmin(user) && ELEVATED_CRM_ROLES.has(normalizeRole(user));
}

/**
 * Xem được toàn bộ người phụ trách (không khóa «Của tôi»).
 * Gồm admin hệ thống + admin/QL công ty.
 */
export function canViewAllCrm(user: RoleUser): boolean {
  return ELEVATED_CRM_ROLES.has(normalizeRole(user));
}

/** Chỉ admin hệ thống mới được đổi / bỏ lọc công ty. */
export function canSwitchCrmCompany(user: RoleUser): boolean {
  return isSystemAdmin(user);
}

/** Khóa chọn công ty: NV thường + admin công ty. */
export function lockCrmCompanyScope(user: RoleUser): boolean {
  return !canSwitchCrmCompany(user);
}

/** Khóa người phụ trách = chỉ «Của tôi»: NV thường. */
export function lockCrmAssigneeScope(user: RoleUser): boolean {
  return !canViewAllCrm(user);
}

/** company_id bắt buộc khi không phải admin hệ thống. */
export function scopedCompanyId(user: RoleUser): string {
  if (isSystemAdmin(user)) return '';
  return String(user?.company_id || '').trim();
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

/** Danh sách NV trong picker — admin/QL: tất cả trong CT; sale: chỉ bản thân. */
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
