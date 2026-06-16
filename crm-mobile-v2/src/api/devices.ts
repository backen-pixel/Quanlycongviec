import { api } from './client';

export type UserDevice = {
  id: string;
  device_id?: string | null;
  platform?: string | null;
  device_name?: string | null;
  os_name?: string | null;
  os_version?: string | null;
  app_version?: string | null;
  ip?: string | null;
  last_ping_at?: string | null;
  last_login_at?: string | null;
  first_seen_at?: string | null;
  online?: boolean;
};

export type AuthEventRow = {
  id: string;
  event?: string | null;
  reason?: string | null;
  ip?: string | null;
  platform?: string | null;
  device_name?: string | null;
  session_id?: string | null;
  occurred_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

export const AUTH_EVENT_LABEL: Record<string, string> = {
  login_success: 'Đăng nhập',
  login_failed: 'Đăng nhập sai',
  logout: 'Đăng xuất',
  auto_logout_midnight: 'Hết phiên qua đêm',
  session_expired: 'Phiên hết hạn',
  token_invalid: 'Token không hợp lệ',
  password_changed: 'Đổi mật khẩu',
};

export async function fetchMyDevices(signal?: AbortSignal): Promise<UserDevice[]> {
  const { data } = await api.get<{ devices?: UserDevice[] }>('/devices/me', { signal });
  return Array.isArray(data?.devices) ? data.devices : [];
}

export async function fetchMyAuthEvents(limit = 80, signal?: AbortSignal): Promise<AuthEventRow[]> {
  const { data } = await api.get<{ items?: AuthEventRow[] }>('/auth-events/me', {
    params: { limit },
    signal,
  });
  return Array.isArray(data?.items) ? data.items : [];
}

export async function revokeDevice(deviceId: string): Promise<void> {
  await api.delete(`/devices/${deviceId}`);
}
