/** Preset icon / category cho module tùy chỉnh (App Switcher). */

/** Nhãn hiển thị trên App Switcher — luôn tách khỏi module có sẵn. */
export const CUSTOM_APP_MODULE_SWITCHER_CATEGORY = 'Module tùy chỉnh';

export const APP_MODULE_CATEGORY_PRESETS = [
  { key: CUSTOM_APP_MODULE_SWITCHER_CATEGORY, className: 'bg-violet-50 text-violet-800 border-violet-100', accent: '#7c3aed' },
  { key: 'Tùy chỉnh', className: 'bg-violet-50 text-violet-800 border-violet-100', accent: '#7c3aed' },
  { key: 'Kinh doanh', className: 'bg-emerald-50 text-emerald-700 border-emerald-100', accent: '#059669' },
  { key: 'Sản xuất', className: 'bg-orange-50 text-orange-700 border-orange-100', accent: '#ea580c' },
  { key: 'Vận hành', className: 'bg-amber-50 text-amber-800 border-amber-100', accent: '#d97706' },
  { key: 'Tài chính', className: 'bg-indigo-50 text-indigo-700 border-indigo-100', accent: '#4f46e5' },
  { key: 'Công cụ', className: 'bg-violet-50 text-violet-700 border-violet-100', accent: '#7c3aed' },
  { key: 'Đào tạo', className: 'bg-teal-50 text-teal-700 border-teal-100', accent: '#0d9488' },
  { key: 'Làm việc', className: 'bg-cyan-50 text-cyan-800 border-cyan-100', accent: '#0891b2' },
  { key: 'Tổng hợp', className: 'bg-blue-50 text-blue-700 border-blue-100', accent: '#2563eb' },
];

/** Ảnh icon kiểu brand (cùng bộ /icons module sẵn có). */
export const APP_MODULE_IMAGE_PRESETS = [
  { id: 'crm', label: 'CRM', url: '/icons/crm-module.png?v=4' },
  { id: 'sx', label: 'SX', url: '/icons/sx-module.png?v=3' },
  { id: 'vc', label: 'LĐ', url: '/icons/vc-module.png?v=3' },
  { id: 'work', label: 'Công việc', url: '/icons/work-module.png?v=4' },
  { id: 'ketoan', label: 'Kế toán', url: '/icons/ketoan-module.png?v=3' },
  { id: 'muahang', label: 'Mua hàng', url: '/icons/muahang-module.png?v=1' },
  { id: 'calc', label: 'Tính toán', url: '/icons/calc-module.png?v=3' },
  { id: 'knowledge', label: 'Kiến thức', url: '/icons/knowledge-module.png?v=3' },
];

export const APP_MODULE_EMOJI_PRESETS = [
  '📦', '🧩', '🎯', '✅', '📋', '🔧', '🛠️', '🏭',
  '🚚', '🤝', '💡', '📊', '📈', '🧾', '💰', '🛒',
  '📞', '🛡️', '⭐', '🚀', '📝', '🔍', '🗓️', '🏠',
];

export function categoryClassFor(category) {
  const hit = APP_MODULE_CATEGORY_PRESETS.find((c) => c.key === category);
  return hit?.className || 'bg-violet-50 text-violet-800 border-violet-100';
}

export function categoryAccentFor(category) {
  const hit = APP_MODULE_CATEGORY_PRESETS.find((c) => c.key === category);
  return hit?.accent || '#7c3aed';
}
