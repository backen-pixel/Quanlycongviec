/** Gốc backend (không có /api). Dev: để trống → Vite proxy /api. Build prod: VITE_API_URL. */
export function resolveApiOrigin() {
  const fromEnv = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
  if (import.meta.env.DEV) {
    // Dev luôn dùng proxy Vite (relative /api) — tránh CORS localhost:5173 → :4000
    if (typeof window !== 'undefined') return '';
    return fromEnv;
  }
  if (fromEnv) return fromEnv;
  if (typeof window !== 'undefined') {
    const { hostname } = window.location;
    if (hostname.includes('tubep-frontend') && hostname.endsWith('.onrender.com')) {
      return 'https://tubep-backend.onrender.com';
    }
  }
  return '';
}
