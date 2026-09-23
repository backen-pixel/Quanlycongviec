/** Module gắn loại chi phí / Excel công thức. */
export const COST_TYPE_MODULES = [
  { key: 'production', label: 'Sản xuất (SX)', short: 'SX' },
  { key: 'logistics', label: 'Vận chuyển / Lắp đặt (VC)', short: 'VC' },
  { key: 'crm', label: 'CRM', short: 'CRM' },
  { key: 'purchasing', label: 'Mua hàng', short: 'MH' },
  { key: 'projects', label: 'Dự án / Công việc', short: 'DA' },
];

export function costTypeModuleLabel(key) {
  return COST_TYPE_MODULES.find((m) => m.key === key)?.label || key;
}

export function costTypeModuleShort(key) {
  return COST_TYPE_MODULES.find((m) => m.key === key)?.short || key;
}

export function workshopAreaToCostModule(area) {
  if (area === 'logistics') return 'logistics';
  return 'production';
}

export function excelVarKey(code) {
  return `excel.${String(code || '').trim().toLowerCase()}`;
}

export function slugCostTypeCode(name, fallback = 'chi_phi') {
  const s = String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return s || fallback;
}
