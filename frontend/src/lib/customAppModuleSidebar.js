import {
  LayoutDashboard, FolderKanban, Settings, ListChecks, LayoutList,
  Building2, HardDrive, Trash2, Share2, Calendar, UserMinus, Activity, MessageCircle,
} from 'lucide-react';
import { customModuleScopeId } from './sidebarModuleContext';

/** Liên kết «Chức năng chung» — giữ sidebar module tùy chỉnh qua moduleContext. */
export function buildCustomAppSharedLinks() {
  return [
    { to: '/social', icon: Share2, label: 'Bảng tin nội bộ' },
    { to: '/crm/events', icon: Calendar, label: 'Sự kiện' },
    { to: '/crm/leaves', icon: UserMinus, label: 'Lịch nghỉ' },
    { to: '/crm/activity', icon: Activity, label: 'Đang hoạt động' },
    { to: '/crm/messenger', icon: MessageCircle, label: 'Nhóm chat' },
  ];
}

/**
 * Menu sidebar module tùy chỉnh — bố cục giống Vận chuyển:
 * Tổng quan · Chức năng chung · Điều hành (pipeline / bộ NV) · Cài đặt.
 */
export function buildCustomAppModuleMenuGroups(moduleKey, modMeta = null) {
  const key = String(moduleKey || '').trim();
  if (!key) return [];
  const scope = customModuleScopeId(key);
  const base = `/m/${key}`;
  const settings = `/ecosystem/app-modules/${key}`;

  return [
    {
      id: `custom-${key}-overview`,
      moduleScope: scope,
      title: '1. Tổng quan',
      emoji: '📊',
      items: [
        { to: base, icon: LayoutDashboard, label: 'Dashboard', end: true },
        { to: `/drive?module=${encodeURIComponent(scope)}`, icon: HardDrive, label: 'Drive' },
      ],
    },
    {
      id: `custom-${key}-shared`,
      moduleScope: scope,
      title: '2. Chức năng chung',
      emoji: '🌐',
      items: buildCustomAppSharedLinks(),
    },
    {
      id: `custom-${key}-ops`,
      moduleScope: scope,
      title: '3. Điều hành',
      emoji: '📦',
      items: [
        { to: base, icon: FolderKanban, label: 'Kanban bản ghi' },
        { to: `${settings}?tab=pipeline`, icon: Settings, label: 'Pipeline' },
        { to: `${settings}?tab=templates`, icon: ListChecks, label: 'Bộ nhiệm vụ' },
        { to: `${settings}?tab=tabs`, icon: LayoutList, label: 'Tab pipeline', adminOnly: true },
        { to: { pathname: '/admin/trash', search: '?tab=crm' }, icon: Trash2, label: 'Thùng rác', adminOnly: true, strictAdminOnly: true },
      ],
    },
    {
      id: `custom-${key}-settings`,
      moduleScope: scope,
      title: '4. Cài đặt',
      emoji: '⚙️',
      items: [
        { to: settings, icon: Settings, label: 'Cấu hình module', adminOnly: true, end: true },
        { to: `${settings}?tab=companies`, icon: Building2, label: 'Phạm vi công ty', adminOnly: true },
      ],
    },
  ];
}
