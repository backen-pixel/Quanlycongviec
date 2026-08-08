import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ORIGIN } from '../config';

const TOKEN_KEY = 'vc_token';
const API_PREFIX = `${API_ORIGIN}/api`;

export const api = axios.create({
  baseURL: API_PREFIX,
  timeout: 30000,
});

/** Cache token trong RAM — tránh đọc AsyncStorage mỗi request (chậm khi tải nhiều trang). */
let memoryToken: string | null | undefined;

async function resolveAuthToken(): Promise<string | null> {
  if (memoryToken !== undefined) return memoryToken;
  memoryToken = await AsyncStorage.getItem(TOKEN_KEY);
  return memoryToken;
}

let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

api.interceptors.request.use(async (config) => {
  const token = await resolveAuthToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const status = error?.response?.status;
    const url = String(error?.config?.url || '');
    // Bỏ qua auto-logout cho login / me (401 ở đây không phải token hỏng).
    const skip = ['/auth/login', '/auth/me'].some((p) => url.includes(p));
    if (status === 401 && !skip) {
      // Không xóa token ở đây — AuthContext cần token để unregister FCM trước khi clear.
      onUnauthorized?.();
    }
    return Promise.reject(error);
  },
);

export async function setStoredToken(token: string | null) {
  memoryToken = token;
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

export async function getStoredToken() {
  return resolveAuthToken();
}

/** Chuẩn hoá thông báo lỗi để hiển thị toast/alert. */
export function formatApiError(e: unknown): string {
  if (!e || typeof e !== 'object') return String(e ?? 'Lỗi không xác định');
  const ex = e as {
    response?: { status?: number; data?: { error?: string; message?: string } };
    message?: string;
    code?: string;
  };
  const d = ex.response?.data;
  if (d && typeof d === 'object') {
    if (d.error && String(d.error).trim()) return String(d.error);
    if (d.message && String(d.message).trim()) return String(d.message);
  }
  if (ex.code === 'ECONNABORTED' || ex.code === 'ETIMEDOUT') {
    return 'Hết giờ chờ máy chủ. Thử lại hoặc kiểm tra mạng.';
  }
  if (ex.message === 'Network Error') {
    return 'Không kết nối được máy chủ. Kiểm tra mạng/VPN.';
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
  const token = await resolveAuthToken();
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
