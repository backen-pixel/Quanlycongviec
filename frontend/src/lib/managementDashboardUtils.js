export const LS_MANAGEMENT_FILTERS = 'management_dashboard_filters_v1';

export const MODULE_TABS = [
  { id: 'overview', label: 'Tổng quan' },
  { id: 'crm', label: 'CRM' },
  { id: 'sx', label: 'Sản xuất' },
  { id: 'vc', label: 'Vận chuyển' },
];

export const MODULE_FOR_COMPANIES = {
  overview: 'crm',
  crm: 'crm',
  sx: 'production',
  vc: 'logistics',
};

export function readStoredManagementFilters() {
  try {
    const raw = localStorage.getItem(LS_MANAGEMENT_FILTERS);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function storeManagementFilters(filters) {
  try {
    localStorage.setItem(LS_MANAGEMENT_FILTERS, JSON.stringify(filters));
  } catch {
    /* ignore */
  }
}

/** Gửi stage_ids gộp (multi-công ty) lên API. */
export function stageIdsParam(stage) {
  const ids = stage?.stage_ids;
  if (Array.isArray(ids) && ids.length > 1) return ids.join(',');
  return '';
}

export function stageFilterValue(stage) {
  return stage?.id != null ? String(stage.id) : '';
}
