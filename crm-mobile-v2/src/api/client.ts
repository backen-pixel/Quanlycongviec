import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { API_PREFIX } from '../config';

const TOKEN_KEY = 'crmv2_token';

export const api = axios.create({ baseURL: API_PREFIX, timeout: 30000 });

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
    const skip = ['/auth/login', '/auth/me'].some((p) => url.includes(p));
    if (status === 401 && !skip) {
      await setStoredToken(null);
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

export function formatApiError(e: unknown): string {
  if (!e || typeof e !== 'object') return String(e ?? 'Lỗi không xác định');
  const ex = e as {
    response?: { data?: { error?: string; message?: string } };
    message?: string;
    code?: string;
  };
  const d = ex.response?.data;
  if (d) {
    if (d.error && String(d.error).trim()) return String(d.error);
    if (d.message && String(d.message).trim()) return String(d.message);
  }
  if (ex.code === 'ECONNABORTED' || ex.code === 'ETIMEDOUT') {
    return 'Hết giờ chờ máy chủ. Thử lại hoặc kiểm tra mạng.';
  }
  if (ex.message === 'Network Error') return 'Không kết nối được máy chủ. Kiểm tra mạng.';
  if (ex.message && String(ex.message).trim()) return String(ex.message);
  return 'Lỗi không xác định';
}
