/**
 * Gốc API không có /api — axios dùng `${API_ORIGIN}/api/...`
 * Ưu tiên: biến EXPO_PUBLIC_API_URL (file `.env` trong crm-mobile đã gắn Render).
 * Fallback: https://tubep-backend.onrender.com (TuBep Pro API production).
 */
export const API_ORIGIN = (
  process.env.EXPO_PUBLIC_API_URL || 'https://tubep-backend.onrender.com'
).replace(/\/$/, '');

/** URL gốc ứng dụng web (SPA), không có / cuối — dùng mở Báo giá / Dự án trong trình duyệt */
export const WEB_APP_ORIGIN = (process.env.EXPO_PUBLIC_WEB_APP_URL || '').replace(/\/$/, '');
