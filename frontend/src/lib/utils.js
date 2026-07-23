// Labels & Colors — tất cả lấy từ DB, đây chỉ là fallback mapping
export const STATUS_LABELS = {
  new: 'Mới',
  consulting: 'Tư vấn',
  designing: 'Thiết kế',
  quoting: 'Báo giá',
  contract_signed: 'Đã ký HĐ',
  producing: 'Sản xuất',
  delivering: 'Vận chuyển',
  shipping: 'Vận chuyển',    // backward compat
  installing: 'Lắp đặt',  // backward compat
  warranty: 'Bảo hành',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
};

export const STATUS_COLORS = {
  new: 'bg-gray-100 text-gray-700',
  consulting: 'bg-purple-100 text-purple-700',
  designing: 'bg-pink-100 text-pink-700',
  quoting: 'bg-amber-100 text-amber-700',
  contract_signed: 'bg-green-100 text-green-700',
  producing: 'bg-orange-100 text-orange-700',
  delivering: 'bg-cyan-100 text-cyan-700',
  shipping: 'bg-cyan-100 text-cyan-700',    // backward compat
  installing: 'bg-cyan-100 text-cyan-700',  // backward compat
  warranty: 'bg-red-100 text-red-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-gray-200 text-gray-500',
};

export const PRIORITY_LABELS = { low: 'Thấp', medium: 'TB', high: 'Cao', urgent: 'Gấp' };
export const PRIORITY_COLORS = {
  low: 'bg-blue-100 text-blue-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

// Palette dùng trong các tab/panel task (CRM, SX, xưởng) — khác PRIORITY_COLORS ở low/medium
export const TASK_PRIORITY_COLORS = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

export const TASK_STATUS = {
  pending: 'Đang chờ',
  todo: 'Chờ xử lý',
  in_progress: 'Đang làm',
  review: 'Chờ kiểm tra',
  done: 'Hoàn thành',
  blocked: 'Bị chặn',
  deferred: 'Tạm hoãn',
};

export const TASK_COLORS = {
  pending: 'bg-gray-400',
  todo: 'bg-slate-400',
  in_progress: 'bg-blue-500',
  review: 'bg-amber-500',
  done: 'bg-emerald-500',
  blocked: 'bg-red-500',
  deferred: 'bg-purple-400',
};

export const formatVND = (n) => {
  if (n === null || n === undefined || n === '') return '—';
  const num = Number(n);
  if (Number.isNaN(num)) return '—';
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Math.round(num))}đ`;
};

/** Điểm ròng sổ cái CRM KPI — khớp CRM Dashboard. */
export const formatKpiLedgerNet = (v) => {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return '0';
  return n > 0 ? `+${n}` : String(n);
};

export const formatDate = (d) => {
  if (!d) return '';
  return new Date(d).toLocaleDateString('vi-VN');
};

export const formatDateTime = (d) => {
  if (!d) return '';
  return new Date(d).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

/** "5 phút trước" / "2 giờ trước" / quá 7 ngày thì hiện ngày cụ thể. */
export function timeAgo(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.floor(Math.max(0, Date.now() - t) / 1000);
  if (s < 60) return 'Vừa xong';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} ngày trước`;
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Emoji theo đuôi file — dùng cho danh sách tài liệu/đính kèm. */
export function getFileEmoji(name, fallback = '📄') {
  if (!name) return fallback;
  const ext = name.split('.').pop()?.toLowerCase();
  const map = {
    pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗', dwg: '📐', dxf: '📐',
    jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️', zip: '📦', rar: '📦',
    mp4: '🎬', mov: '🎬', webm: '🎬', avi: '🎬', mkv: '🎬', mp3: '🎵', wav: '🎵',
  };
  return map[ext] || fallback;
}

export const getInitials = (name) => {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
};

/** Tách họ tên Việt Nam: họ | đệm... | tên gọi (từ cuối). */
export function parseVietnameseFullName(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  if (parts.length === 1) {
    return { parts, family: parts[0], middles: [], given: parts[0] };
  }
  return {
    parts,
    family: parts[0],
    middles: parts.slice(1, -1),
    given: parts[parts.length - 1],
  };
}

/** Tên gọi — "Dương Thanh Thời" → "Thời". */
export function formatStaffGivenName(name) {
  const parsed = parseVietnameseFullName(name);
  if (!parsed) return String(name ?? '').trim();
  return parsed.given;
}

/** Tên gọi lên trước — "Dương Thanh Thời" → "Thời Dương Thanh". */
export function formatStaffGivenFirst(name) {
  const parsed = parseVietnameseFullName(name);
  if (!parsed) return '';
  const { parts, family, middles, given } = parsed;
  if (parts.length <= 1) return parts[0] || '';
  return [given, family, ...middles].join(' ');
}

/**
 * Hiển thị ngắn NV: tên gọi trước + viết tắt họ đệm.
 * "Dương Thanh Thời" → "Thời D.T." · "Nguyễn Văn A" → "A N.V."
 */
export function formatStaffDisplayName(name) {
  const parsed = parseVietnameseFullName(name);
  if (!parsed) return '';
  const { parts, family, middles, given } = parsed;
  if (parts.length === 1) return parts[0];
  const abbr = [family, ...middles].map((w) => w[0]?.toUpperCase()).filter(Boolean).join('.');
  return abbr ? `${given} ${abbr}.` : given;
}

/** Avatar chữ cái NV: tên gọi + họ — "Dương Thanh Thời" → "TD". */
export function getStaffInitials(name) {
  const parsed = parseVietnameseFullName(name);
  if (!parsed) return '?';
  const { parts, family, given } = parsed;
  if (parts.length === 1) return given.slice(0, 2).toUpperCase();
  const a = `${given[0] || ''}${family[0] || ''}`.toUpperCase();
  return a || '?';
}

/** Tìm kiếm tên NV — khớp full, tên gọi, dạng rút gọn. */
export function staffNameMatchesQuery(name, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return true;
  const raw = String(name ?? '').trim().toLowerCase();
  if (raw.includes(q)) return true;
  const given = formatStaffGivenName(name).toLowerCase();
  if (given.includes(q)) return true;
  const compact = formatStaffDisplayName(name).toLowerCase();
  if (compact.includes(q)) return true;
  const givenFirst = formatStaffGivenFirst(name).toLowerCase();
  return givenFirst.includes(q);
}

export const avatarColor = (name) => {
  if (!name) return '#6b7280';
  const colors = ['#3b82f6','#8b5cf6','#ec4899','#f59e0b','#10b981','#06b6d4','#f97316','#ef4444'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

// ── ROLE → STAGE MAPPING (frontend fallback) ──
export const ROLE_LABELS = {
  admin: 'Quản trị viên', manager: 'Quản lý', sales: 'Kinh doanh',
  designer: 'Thiết kế', production: 'Sản xuất', production_staff: 'NV Sản xuất (Admin CV+SX)',
  production_admin: 'Admin Sản xuất', crm_production_staff: 'NV CRM + Admin SX',
  crm_production_admin: 'Admin CRM + Sản xuất', logistics_admin: 'Admin Vận chuyển',
  driver: 'Tài xế', customer_care: 'CSKH', staff: 'Nhân viên',
};

export const ROLE_STAGE_MAP = {
  admin: ['consulting','design','quotation','contract','production','delivery','customer-care'],
  manager: ['consulting','design','quotation','contract','production','delivery','customer-care'],
  sales: ['consulting','quotation','contract'],
  designer: ['design'],
  production: ['production'],
  production_staff: ['production'],
  production_admin: ['production'],
  crm_production_staff: ['consulting', 'quotation', 'contract', 'production'],
  crm_production_admin: ['consulting', 'design', 'quotation', 'contract', 'production'],
  driver: ['delivery'],
  customer_care: ['customer-care'],
  staff: ['consulting'],
};
