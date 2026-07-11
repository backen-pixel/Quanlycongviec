/**
 * Gốc API (không có /api ở cuối). Axios sẽ dùng `${API_ORIGIN}/api/...`.
 * Ưu tiên biến môi trường EXPO_PUBLIC_API_URL (file .env), fallback Render production.
 */
export const API_ORIGIN = (
  process.env.EXPO_PUBLIC_API_URL || 'https://tubep-backend.onrender.com'
).replace(/\/$/, '');
