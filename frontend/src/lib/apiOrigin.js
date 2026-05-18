/** Gốc backend (không có /api). Build: VITE_API_URL; fallback SPA tĩnh Render. */
export function resolveApiOrigin() {
  const fromEnv = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  if (typeof window !== 'undefined') {
    const { hostname } = window.location;
    if (hostname.includes('tubep-frontend') && hostname.endsWith('.onrender.com')) {
      return 'https://tubep-backend.onrender.com';
    }
  }
  return '';
}
