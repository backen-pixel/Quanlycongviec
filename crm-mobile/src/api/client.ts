import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ORIGIN } from '../config';

const TOKEN_KEY = 'crm_token';
const API_PREFIX = `${API_ORIGIN}/api`;

export const api = axios.create({
  baseURL: API_PREFIX,
  timeout: 30000,
});

let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

api.interceptors.request.use(async (config) => {
  const t = await AsyncStorage.getItem(TOKEN_KEY);
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const status = error?.response?.status;
    const url = String(error?.config?.url || '');
    // Auto-logout chỉ áp dụng cho các API "thực sự" — bỏ qua:
    //  - /auth/login: 401 ở đây là sai mật khẩu, không liên quan token.
    //  - /auth/me:    đây là background check; nếu fail có thể do token cũ
    //                 còn lại từ install trước, hoặc đang trong race với
    //                 login mới. AuthContext tự xử trong catch.
    //  - /push/device-token, /devices/ping, /push/preferences: background
    //                 housekeeping; không nên đá user ra chỉ vì các call này
    //                 thất bại (vd. token cũ chưa kịp xoá).
    const SKIP_AUTO_LOGOUT = [
      '/auth/login',
      '/auth/me',
      '/push/device-token',
      '/push/preferences',
      '/devices/ping',
      // bubble realtime: fetch danh sách nhóm để join socket — không nên đá
      // user ra nếu fail; lần connect kế tiếp sẽ thử lại.
      '/messenger/groups',
    ];
    const skip = SKIP_AUTO_LOGOUT.some((p) => url.includes(p));
    if (status === 401 && !skip) {
      await setStoredToken(null);
      try {
        await AsyncStorage.removeItem('crm_user_json');
      } catch {
        /* ignore */
      }
      onUnauthorized?.();
    }
    return Promise.reject(error);
  },
);

export async function setStoredToken(token: string | null) {
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

export async function getStoredToken() {
  return AsyncStorage.getItem(TOKEN_KEY);
}

/**
 * POST multipart bằng fetch — Axios + FormData trên React Native (đặc biệt Android) dễ lỗi boundary / "Network Error".
 * path giống axios: ví dụ `/crm/leads/:id/chat/upload` hoặc `/messenger/groups/:id/chat`.
 */
/** Chuỗi hiển thị cho Alert khi API lỗi (axios hoặc postMultipart). */
export function formatApiError(e: unknown): string {
  if (!e || typeof e !== 'object') return String(e ?? 'Lỗi không xác định');
  const ex = e as {
    response?: { status?: number; data?: { error?: string; message?: string } };
    message?: string;
    code?: string;
  };
  const d = ex.response?.data;
  if (d && typeof d === 'object') {
    const er = (d as { error?: unknown }).error;
    const ms = (d as { message?: unknown }).message;
    if (er != null && String(er).trim()) return String(er);
    if (ms != null && String(ms).trim()) return String(ms);
  }
  if (ex.code === 'ECONNABORTED' || ex.code === 'ETIMEDOUT') {
    return 'Hết giờ chờ máy chủ. Thử lại hoặc kiểm tra mạng.';
  }
  if (ex.message === 'Network Error') {
    return `Không kết nối được máy chủ. Kiểm tra mạng/VPN${__DEV__ ? ` · ${API_ORIGIN}` : ''}`;
  }
  if (ex.message && String(ex.message).trim()) return String(ex.message);
  return 'Lỗi không xác định';
}

export async function postMultipart<T = unknown>(
  path: string,
  form: FormData,
  options?: { timeoutMs?: number },
): Promise<{ data: T }> {
  const p = path.startsWith('/') ? path : `/${path}`;
  const url = `${API_PREFIX}${p}`;
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  const timeoutMs = options?.timeoutMs ?? 120000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
        signal: controller.signal,
      });
    } catch (cause) {
      const c = cause as { name?: string };
      if (c?.name === 'AbortError') {
        throw new Error(
          `Hết giờ chờ (${Math.round(timeoutMs / 1000)} giây). File lớn hoặc mạng chậm — thử lại sau hoặc dùng Wi‑Fi.`,
        );
      }
      throw new Error(
        `Không kết nối được máy chủ khi gửi file. Kiểm tra mạng/VPN${__DEV__ ? ` · ${API_ORIGIN}` : ''}`,
        { cause },
      );
    }
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { error: text || res.statusText };
    }
    if (res.status === 401 && !p.includes('/auth/login')) {
      await setStoredToken(null);
      try {
        await AsyncStorage.removeItem('crm_user_json');
      } catch {
        /* ignore */
      }
      onUnauthorized?.();
    }
    if (!res.ok) {
      const payload = parsed as { error?: string; message?: string };
      const err = new Error(
        payload?.error || payload?.message || res.statusText || 'Upload thất bại',
      ) as Error & { response?: { status: number; data: unknown } };
      err.response = { status: res.status, data: parsed };
      throw err;
    }
    return { data: parsed as T };
  } finally {
    clearTimeout(timer);
  }
}
