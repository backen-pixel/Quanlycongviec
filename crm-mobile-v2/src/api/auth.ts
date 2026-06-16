import { api } from './client';
import type { AuthUser } from '../context/AuthContext';

export type MeUser = AuthUser & {
  position?: string | null;
  department_id?: string | null;
  crm_region_ids?: string[];
};

export async function fetchCurrentUser(signal?: AbortSignal): Promise<MeUser> {
  const { data } = await api.get<{ user?: MeUser }>('/auth/me', { signal });
  if (!data?.user) throw new Error('Không tải được thông tin tài khoản');
  return data.user;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await api.post('/auth/change-password', {
    current_password: currentPassword,
    new_password: newPassword,
  });
}

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Quản trị viên',
  sales_admin: 'Admin kinh doanh',
  manager: 'Quản lý',
  sales: 'Kinh doanh',
  designer: 'Thiết kế',
  production: 'Sản xuất',
  production_staff: 'NV Sản xuất',
  production_admin: 'Admin Sản xuất',
  crm_production_staff: 'NV CRM + Admin SX',
  crm_production_admin: 'Admin CRM + Sản xuất',
  logistics_admin: 'Admin Vận chuyển',
  driver: 'Vận chuyển & Lắp đặt',
  customer_care: 'CSKH',
  staff: 'Nhân viên',
};

export function roleLabel(role?: string | null): string {
  if (!role) return 'Nhân viên';
  return ROLE_LABELS[String(role).toLowerCase()] || role;
}
