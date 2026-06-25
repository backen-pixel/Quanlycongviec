/**
 * Catalog quyền theo module — UI phân quyền nhân viên.
 * Module CRM/SX/VC/Kế toán: mỗi chức năng có 3 quyền view | edit | admin.
 * Module Công việc/Drive/Hệ thống: quyền legacy (nhiều action khác nhau).
 */

const TIER_ACTIONS = ['view', 'edit', 'admin'];

const ACTION_LABELS = {
  view: 'Xem',
  edit: 'Sửa',
  admin: 'Admin',
  create: 'Tạo mới',
  delete: 'Xóa',
  all_companies: 'Xem tất cả công ty',
  export: 'Xuất dữ liệu',
  manage_subordinates: 'Quản lý cấp dưới',
  upload: 'Tải lên',
  create_folder: 'Tạo thư mục',
  share: 'Chia sẻ',
  delete_forever: 'Xóa vĩnh viễn',
  manage_shared: 'Quản lý Drive chung',
  link_entity: 'Gắn file vào CRM',
};

const PERMISSION_DESCRIPTIONS = {
  'projects:view': 'Xem danh sách dự án / đơn sản xuất',
  'projects:create': 'Tạo dự án hoặc đơn mới',
  'projects:edit': 'Sửa thông tin dự án / đơn',
  'projects:delete': 'Xóa dự án / đơn',
  'projects:all_companies': 'Xem dữ liệu mọi công ty',
  'workflows:view': 'Xem quy trình công việc',
  'workflows:create': 'Tạo quy trình mới',
  'workflows:edit': 'Chỉnh sửa quy trình',
  'workflows:delete': 'Xóa quy trình',
  'templates:view': 'Xem bộ mẫu dự án',
  'templates:create': 'Tạo bộ mẫu',
  'templates:edit': 'Chỉnh sửa bộ mẫu',
  'templates:delete': 'Xóa bộ mẫu',
  'users:view': 'Xem danh sách nhân viên',
  'users:create': 'Thêm nhân viên mới',
  'users:edit': 'Sửa thông tin nhân viên',
  'users:delete': 'Xóa nhân viên',
  'users:manage_subordinates': 'Quản lý nhân viên cấp dưới',
  'ecosystem:view': 'Xem cấu trúc tổ chức',
  'ecosystem:edit': 'Sửa cấu trúc tổ chức',
  'reports:view': 'Xem báo cáo',
  'reports:export': 'Xuất báo cáo',
  'settings:view': 'Xem cài đặt hệ thống',
  'settings:edit': 'Thay đổi cài đặt',
  'drive:view': 'Truy cập module Drive',
  'drive:upload': 'Upload file lên Drive',
  'drive:create_folder': 'Tạo thư mục Drive',
  'drive:share': 'Chia sẻ file/folder',
  'drive:delete': 'Đưa file vào thùng rác',
  'drive:delete_forever': 'Xóa vĩnh viễn khỏi Drive',
  'drive:manage_shared': 'Quản lý Drive chung',
  'drive:link_entity': 'Gắn file Drive vào lead/deal/dự án',
};

/** Module dùng 3 cột Xem | Sửa | Admin */
const TIERED_MODULES = [
  {
    key: 'crm',
    label: 'CRM',
    icon: '🎯',
    groups: [
      {
        key: 'crm-overview',
        label: 'Tổng quan',
        features: [
          { key: 'crm_dashboard', label: 'Dashboard CRM', resource: 'crm_dashboard' },
        ],
      },
      {
        key: 'crm-sales',
        label: 'Bán hàng',
        features: [
          { key: 'crm_pipeline', label: 'Pipeline Lead/Deal', resource: 'crm_pipeline' },
          { key: 'crm_leads', label: 'Lead', resource: 'crm_leads' },
          { key: 'crm_deals', label: 'Deal', resource: 'crm_deals' },
          { key: 'crm_tasks', label: 'Công việc CRM', resource: 'crm_tasks' },
          { key: 'crm_assignments', label: 'Giao việc CRM', resource: 'crm_assignments' },
          { key: 'crm_follow_up', label: 'CSKH theo hạn', resource: 'crm_follow_up' },
        ],
      },
      {
        key: 'crm-finance',
        label: 'Tài chính',
        features: [
          { key: 'crm_quotations', label: 'Báo giá', resource: 'crm_quotations' },
          { key: 'crm_orders', label: 'Đơn hàng', resource: 'crm_orders' },
          { key: 'crm_invoices', label: 'Hóa đơn', resource: 'crm_invoices' },
        ],
      },
      {
        key: 'crm-data',
        label: 'Dữ liệu & KPI',
        features: [
          { key: 'crm_customers', label: 'Khách hàng', resource: 'crm_customers' },
          { key: 'crm_products', label: 'Sản phẩm', resource: 'crm_products' },
          { key: 'crm_kpi', label: 'KPI CRM', resource: 'crm_kpi' },
          { key: 'crm_reports', label: 'Báo cáo CRM', resource: 'crm_reports' },
        ],
      },
      {
        key: 'crm-admin',
        label: 'Quản trị & Kênh',
        features: [
          { key: 'crm_settings', label: 'Cài đặt CRM', resource: 'crm_settings' },
          { key: 'crm_social', label: 'Facebook / Zalo', resource: 'crm_social' },
        ],
      },
    ],
  },
  {
    key: 'production',
    label: 'Sản xuất',
    icon: '🏭',
    groups: [
      {
        key: 'sx-ops',
        label: 'Điều hành xưởng',
        features: [
          { key: 'sx_dashboard', label: 'Dashboard xưởng', resource: 'sx_dashboard' },
          { key: 'sx_deals', label: 'Deal vào xưởng', resource: 'sx_deals' },
          { key: 'sx_assignments', label: 'Giao việc Sản xuất', resource: 'sx_assignments' },
          { key: 'sx_pipeline', label: 'Pipeline xưởng', resource: 'sx_pipeline' },
          { key: 'sx_templates', label: 'Bộ mẫu nhiệm vụ', resource: 'sx_templates' },
          { key: 'sx_handover', label: 'Bàn giao CRM → SX', resource: 'sx_handover' },
          { key: 'sx_regions', label: 'Khu vực xưởng', resource: 'sx_regions' },
        ],
      },
    ],
  },
  {
    key: 'logistics',
    label: 'Vận chuyển',
    icon: '🚚',
    groups: [
      {
        key: 'vc-ops',
        label: 'Điều hành VC',
        features: [
          { key: 'vc_dashboard', label: 'Dashboard VC', resource: 'vc_dashboard' },
          { key: 'vc_projects', label: 'Dự án vận chuyển', resource: 'vc_projects' },
          { key: 'vc_pipeline', label: 'Pipeline VC', resource: 'vc_pipeline' },
          { key: 'vc_teams', label: 'Quản lý đội nhóm', resource: 'vc_teams' },
          { key: 'vc_templates', label: 'Bộ nhiệm vụ VC', resource: 'vc_templates' },
        ],
      },
    ],
  },
  {
    key: 'accounting',
    label: 'Kế toán',
    icon: '🧾',
    groups: [
      {
        key: 'ketoan-ops',
        label: 'Kế toán công ty',
        features: [
          { key: 'ketoan_dashboard', label: 'Tổng hợp deal SX', resource: 'ketoan_dashboard' },
          { key: 'ketoan_finance', label: 'Báo giá / ĐH / HĐ', resource: 'ketoan_finance' },
        ],
      },
    ],
  },
];

/** Module legacy — toggle đơn theo từng action */
const LEGACY_MODULES = [
  {
    key: 'work',
    label: 'Công việc chung',
    icon: '📁',
    features: [
      { key: 'projects', label: 'Dự án & đơn hàng', resources: ['projects'] },
      { key: 'workflows', label: 'Quy trình', resources: ['workflows'] },
      { key: 'templates', label: 'Bộ mẫu', resources: ['templates'] },
      { key: 'customers', label: 'Khách hàng (module công việc)', resources: ['customers'] },
    ],
  },
  {
    key: 'drive',
    label: 'Drive',
    icon: '💾',
    features: [{ key: 'drive', label: 'Lưu trữ file', resources: ['drive'] }],
  },
  {
    key: 'hr',
    label: 'Nhân sự & Tổ chức',
    icon: '👥',
    features: [
      { key: 'users', label: 'Nhân viên', resources: ['users'] },
      { key: 'ecosystem', label: 'Cấu trúc công ty', resources: ['ecosystem'] },
    ],
  },
  {
    key: 'reports',
    label: 'Báo cáo hệ thống',
    icon: '📊',
    features: [{ key: 'reports', label: 'Báo cáo', resources: ['reports'] }],
  },
  {
    key: 'system',
    label: 'Hệ thống',
    icon: '⚙️',
    features: [{ key: 'settings', label: 'Cài đặt', resources: ['settings'] }],
  },
];

function permissionLabel(resource, action, dbDescription) {
  const key = `${resource}:${action}`;
  if (PERMISSION_DESCRIPTIONS[key]) return PERMISSION_DESCRIPTIONS[key];
  if (dbDescription) return dbDescription;
  const actionLabel = ACTION_LABELS[action] || action;
  return `${actionLabel} — ${resource}`;
}

function buildTierLevels(feat, byResource) {
  const perms = byResource[feat.resource] || [];
  const byAction = Object.fromEntries(perms.map((p) => [p.action, p]));
  const levels = TIER_ACTIONS.map((action) => {
    const p = byAction[action];
    if (!p) return { action, label: ACTION_LABELS[action], permission: null };
    return {
      action,
      label: ACTION_LABELS[action],
      permission: {
        id: p.id,
        resource: p.resource,
        action: p.action,
        label: permissionLabel(p.resource, p.action, p.description),
      },
    };
  });
  if (!levels.some((l) => l.permission)) return null;
  return { key: feat.key, label: feat.label, resource: feat.resource, tiered: true, levels };
}

function buildLegacyPermissions(feat, byResource) {
  const permissions = [];
  for (const res of feat.resources) {
    for (const p of byResource[res] || []) {
      permissions.push({
        id: p.id,
        resource: p.resource,
        action: p.action,
        label: permissionLabel(p.resource, p.action, p.description),
        actionLabel: ACTION_LABELS[p.action] || p.action,
      });
    }
  }
  permissions.sort((a, b) => {
    const order = ['view', 'create', 'edit', 'delete', 'export', 'all_companies', 'manage_subordinates'];
    const ai = order.indexOf(a.action);
    const bi = order.indexOf(b.action);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.action.localeCompare(b.action);
  });
  if (!permissions.length) return null;
  return { key: feat.key, label: feat.label, tiered: false, permissions };
}

function collectCatalogResources() {
  const covered = new Set();
  for (const mod of TIERED_MODULES) {
    for (const grp of mod.groups) {
      for (const feat of grp.features) {
        if (feat.resource) covered.add(feat.resource);
      }
    }
  }
  for (const mod of LEGACY_MODULES) {
    for (const feat of mod.features) {
      for (const res of feat.resources || []) covered.add(res);
    }
  }
  return covered;
}

function buildMiscLegacyModule(byResource, coveredResources) {
  const orphanResources = Object.keys(byResource).filter((r) => !coveredResources.has(r));
  if (!orphanResources.length) return null;

  const features = orphanResources.sort().map((res) =>
    buildLegacyPermissions(
      { key: res, label: res, resources: [res] },
      byResource,
    ),
  ).filter(Boolean);

  if (!features.length) return null;
  return {
    key: 'misc',
    label: 'Khác (DB)',
    icon: '📦',
    displayMode: 'legacy',
    features,
  };
}

function buildCatalogFromPermissions(dbPermissions) {
  const byResource = {};
  for (const p of dbPermissions || []) {
    if (!byResource[p.resource]) byResource[p.resource] = [];
    byResource[p.resource].push(p);
  }

  const coveredResources = collectCatalogResources();

  const tieredModules = TIERED_MODULES.map((mod) => {
    const groups = mod.groups
      .map((grp) => ({
        key: grp.key,
        label: grp.label,
        features: grp.features
          .map((f) => buildTierLevels(f, byResource))
          .filter(Boolean),
      }))
      .filter((g) => g.features.length > 0);
    if (!groups.length) return null;
    return {
      key: mod.key,
      label: mod.label,
      icon: mod.icon,
      displayMode: 'tiered',
      groups,
    };
  }).filter(Boolean);

  const legacyModules = LEGACY_MODULES.map((mod) => ({
    key: mod.key,
    label: mod.label,
    icon: mod.icon,
    displayMode: 'legacy',
    features: mod.features
      .map((f) => buildLegacyPermissions(f, byResource))
      .filter(Boolean),
  })).filter((m) => m.features.length > 0);

  const miscModule = buildMiscLegacyModule(byResource, coveredResources);

  return {
    modules: [...tieredModules, ...legacyModules, ...(miscModule ? [miscModule] : [])],
    tierActions: TIER_ACTIONS.map((a) => ({ action: a, label: ACTION_LABELS[a] })),
    actionLabels: ACTION_LABELS,
  };
}

module.exports = {
  TIERED_MODULES,
  LEGACY_MODULES,
  TIER_ACTIONS,
  ACTION_LABELS,
  PERMISSION_DESCRIPTIONS,
  permissionLabel,
  buildCatalogFromPermissions,
};
