import type { AuthUser } from '../context/AuthContext';

/** Mirror frontend/backend adminRole helper (sales_admin = admin theo phạm vi công ty). */

function normalize(role: AuthUser['role'] | string | null | undefined): string {
  return String(role ?? '').trim().toLowerCase();
}

function hasCompanyId(user: AuthUser | null | undefined): boolean {
  return user?.company_id != null && String(user.company_id).trim() !== '';
}

export function isAdminLike(user: AuthUser | null | undefined): boolean {
  const r = normalize(user?.role);
  return r === 'admin' || r === 'sales_admin';
}

export function isSystemAdmin(user: AuthUser | null | undefined): boolean {
  return normalize(user?.role) === 'admin' && !hasCompanyId(user);
}

export function isCompanyScopedAdmin(user: AuthUser | null | undefined): boolean {
  return isAdminLike(user) && hasCompanyId(user);
}
