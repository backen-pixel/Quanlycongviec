import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ORIGIN } from '../config';

const TOKEN_KEY = 'crm_token';

export const api = axios.create({
  baseURL: `${API_ORIGIN}/api`,
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
    if (status === 401 && !url.includes('/auth/login')) {
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
