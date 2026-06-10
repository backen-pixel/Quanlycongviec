// Labels & Colors — tất cả lấy từ DB, đây chỉ là fallback mapping
export const STATUS_LABELS = {
  new: 'Mới',
  consulting: 'Tư vấn',
  designing: 'Thiết kế',
  quoting: 'Báo giá',
  contract_signed: 'Đã ký HĐ',
  producing: 'Sản xuất',
  delivering: 'Vận chuyển & Lắp đặt',
  shipping: 'Vận chuyển & Lắp đặt',    // backward compat
  installing: 'Vận chuyển & Lắp đặt',  // backward compat
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

export const getInitials = (name) => {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
};

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
  driver: 'Vận chuyển & Lắp đặt', customer_care: 'CSKH', staff: 'Nhân viên',
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
