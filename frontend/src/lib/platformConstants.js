export const TIER_ORDER = ['free', 'starter', 'pro', 'enterprise'];

export const TIER_LABELS = {
  free: 'Miễn phí',
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

export const TIER_COLORS = {
  free: 'bg-gray-100 text-gray-600 border-gray-200',
  starter: 'bg-blue-50 text-blue-700 border-blue-200',
  pro: 'bg-purple-50 text-purple-700 border-purple-200',
  enterprise: 'bg-amber-50 text-amber-700 border-amber-200',
};

export const TIER_BADGE_COLORS = {
  free: 'bg-gray-100 text-gray-700',
  starter: 'bg-blue-100 text-blue-700',
  pro: 'bg-purple-100 text-purple-700',
  enterprise: 'bg-amber-100 text-amber-700',
};

export const FEATURE_LABELS = {
  crm: 'CRM (Quản lý khách hàng)',
  tasks: 'Công việc',
  projects: 'Dự án',
  production: 'Sản xuất',
  logistics: 'Vận chuyển',
  customers: 'Khách hàng',
  ai_assistant: 'AI Bot',
  drive: 'Drive lưu trữ',
  accounting: 'Kế toán',
  api_access: 'API Access (Tích hợp)',
};

export function formatSubscriptionDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('vi-VN');
}

export function subscriptionStatus(tenant) {
  if (!tenant?.is_active) return { label: 'Tạm dừng', tone: 'red' };
  if (!tenant.subscription_end) return { label: 'Không giới hạn', tone: 'green' };
  const end = new Date(tenant.subscription_end);
  const now = new Date();
  const daysLeft = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return { label: 'Hết hạn', tone: 'red' };
  if (daysLeft <= 14) return { label: `Còn ${daysLeft} ngày`, tone: 'amber' };
  return { label: 'Đang hoạt động', tone: 'green' };
}

export function toDateInputValue(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}
