export const LS_MANAGEMENT_FILTERS = 'management_dashboard_filters_v2';

export const MODULE_TABS = [
  { id: 'overview', label: 'Tổng quan' },
  { id: 'crm', label: 'CRM' },
  { id: 'sx', label: 'Sản xuất' },
  { id: 'vc', label: 'Vận chuyển' },
  { id: 'install', label: 'Lắp đặt' },
];

export const MODULE_FOR_COMPANIES = {
  overview: 'crm',
  crm: 'crm',
  sx: 'production',
  vc: 'logistics',
  install: 'logistics',
};

export const TAB_QUICK_PRESETS = {
  overview: [
    { id: '', label: 'Tất cả' },
    { id: 'overdue_crm', label: 'CRM trễ' },
    { id: 'sx_intake', label: 'Chờ SX' },
    { id: 'sx_overdue', label: 'SX trễ' },
    { id: 'vc_overdue', label: 'VC trễ' },
  ],
  crm: [
    { id: '', label: 'Tất cả' },
    { id: 'overdue_crm', label: 'Deal trễ' },
  ],
  sx: [
    { id: '', label: 'Tất cả' },
    { id: 'sx_intake', label: 'Chờ tiếp nhận' },
    { id: 'sx_overdue', label: 'SX trễ' },
  ],
  vc: [
    { id: '', label: 'Tất cả' },
    { id: 'vc_overdue', label: 'VC trễ' },
  ],
  install: [
    { id: '', label: 'Tất cả' },
    { id: 'vc_overdue', label: 'Lắp đặt trễ' },
  ],
};

/** Cột bảng theo tab — key khớp renderer trong ManagementDashboard */
export const TAB_TABLE_COLUMNS = {
  overview: ['record', 'company', 'assignee', 'deadline', 'crm', 'sx', 'vc', 'tasks', 'value', 'link'],
  crm: ['record', 'company', 'assignee', 'deadline', 'crm', 'tasks', 'value', 'link'],
  sx: ['record', 'company', 'assignee', 'deadline', 'sx', 'value', 'link'],
  vc: ['record', 'company', 'assignee', 'deadline', 'vc', 'value', 'link'],
  install: ['record', 'company', 'assignee', 'deadline', 'install', 'address', 'value', 'link'],
};

export const TAB_COLUMN_LABELS = {
  record: 'Lead / Deal / KH',
  company: 'Công ty',
  assignee: 'NV phụ trách',
  deadline: 'Deadline',
  crm: 'CRM',
  sx: 'Sản xuất',
  vc: 'Vận chuyển',
  install: 'Lắp đặt',
  address: 'Địa chỉ lắp',
  tasks: 'NV / TL',
  value: 'Giá trị',
  link: '',
};

export function getListTitle(moduleTab, recordType) {
  if (moduleTab === 'sx') return 'Dự án Sản xuất';
  if (moduleTab === 'vc') return 'Dự án Vận chuyển';
  if (moduleTab === 'install') return 'Dự án Lắp đặt';
  if (recordType === 'lead') return 'Lead CRM';
  if (recordType === 'deal') return 'Deal CRM';
  return 'Lead & Deal CRM';
}

export function readStoredManagementFilters() {
  try {
    const raw = localStorage.getItem(LS_MANAGEMENT_FILTERS);
    if (raw) return JSON.parse(raw);
    const legacy = localStorage.getItem('management_dashboard_filters_v1');
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (parsed.timePreset === 'custom' && (!parsed.dateFrom || !parsed.dateTo)) {
        parsed.timePreset = '';
        parsed.dateFrom = '';
        parsed.dateTo = '';
      }
      if (!parsed.recordType) parsed.recordType = 'all';
      return parsed;
    }
    return {};
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

export function getColumnLabel(moduleTab, col) {
  if (col === 'record') {
    if (moduleTab === 'sx' || moduleTab === 'vc' || moduleTab === 'install') return 'Dự án / KH';
    return TAB_COLUMN_LABELS.record;
  }
  return TAB_COLUMN_LABELS[col] || '';
}

export function isInstallVcStage(stage) {
  const name = String(stage?.name || '').toLowerCase();
  const slug = String(stage?.bucket_slug || '').toLowerCase();
  return slug.includes('install') || name.includes('lắp') || name.includes('lap dat') || name.includes('lắp đặt');
}
