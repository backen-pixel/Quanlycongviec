import { API_ORIGIN } from '../config';

/** Chuẩn hóa URL ảnh/file/audio từ API (đường dẫn tương đối → gốc server). */
export function resolveMediaUrl(url?: string | null): string | null {
  if (!url || typeof url !== 'string') return null;
  const u = url.trim();
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  return `${API_ORIGIN}${u.startsWith('/') ? u : `/${u}`}`;
}

const PALETTE = [
  '#2F6BFF',
  '#F97316',
  '#A855F7',
  '#38BDF8',
  '#22C55E',
  '#F59E0B',
  '#EC4899',
  '#14B8A6',
];

/** Màu ổn định theo tên (cho avatar). */
export function colorFromName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function initialsFromName(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Thời gian hoạt động gần nhất — dùng khi user offline. */
export function formatActivityAgo(iso?: string | null): string {
  if (!iso) return 'Chưa có hoạt động';
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return 'Chưa có hoạt động';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'Hoạt động vừa xong';
  if (diff < 3600_000) return `Hoạt động ${Math.floor(diff / 60_000)} phút trước`;
  if (diff < 86400_000) return `Hoạt động ${Math.floor(diff / 3600_000)} giờ trước`;
  if (diff < 86400_000 * 7) return `Hoạt động ${Math.floor(diff / 86400_000)} ngày trước`;
  return `Hoạt động ${new Date(iso).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })}`;
}

/** Nhãn trạng thái offline cho messenger (online dùng chấm xanh trên avatar). */
export function formatPresenceLabel(online: boolean, lastPingAt?: string | null): string {
  if (online) return '';
  return formatActivityAgo(lastPingAt);
}

/** Nhãn thời gian tương đối ngắn gọn (cho list tin nhắn / ghi âm). */
export function relativeTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Hôm qua';
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

export function dateLabel(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function timeLabel(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}
