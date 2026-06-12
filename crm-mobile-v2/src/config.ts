/**
 * Gốc API (không có /api). Ưu tiên EXPO_PUBLIC_API_URL, mặc định backend production.
 */
export const API_ORIGIN = (
  process.env.EXPO_PUBLIC_API_URL || 'https://tubep-backend.onrender.com'
).replace(/\/$/, '');

export const API_PREFIX = `${API_ORIGIN}/api`;
