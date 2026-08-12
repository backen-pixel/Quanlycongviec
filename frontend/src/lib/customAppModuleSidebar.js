import {
  LayoutDashboard, FolderKanban, Settings, ListChecks, LayoutList,
  Building2, HardDrive, Trash2, Share2, Calendar, UserMinus, Activity, MessageCircle,
  ClipboardList,
} from 'lucide-react';
import { customModuleScopeId } from './sidebarModuleContext';

/**
 * Liên kết «Chức năng chung» — luôn nằm dưới /m/{moduleKey}/…
 * để sidebar giữ đúng module đang mở.
 */
export function buildCustomAppSharedLinks(moduleKey = '') {
  const key = String(moduleKey || '').trim();
  if (!key) {
    return [
      { to: '/social', icon: Share2, label: 'Bảng tin nội bộ' },
      { to: '/crm/events', icon: Calendar, label: 'Sự kiện' },
      { to: '/crm/leaves', icon: UserMinus, label: 'Lịch nghỉ' },
      { to: '/crm/activity', icon: Activity, label: 'Đang hoạt động' },
      { to: '/crm/messenger', icon: MessageCircle, label: 'Nhóm chat' },
    ];
  }
  const base = `/m/${key}`;
  return [
    { to: `${base}/social`, icon: Share2, label: 'Bảng tin nội bộ' },
    { to: `${base}/events`, icon: Calendar, label: 'Sự kiện' },
    { to: `${base}/leaves`, icon: UserMinus, label: 'Lịch nghỉ' },
    { to: `${base}/activity`, icon: Activity, label: 'Đang hoạt động' },
    { to: `${base}/messenger`, icon: MessageCircle, label: 'Nhóm chat' },
  ];
}

/**
 * Menu sidebar module tùy chỉnh — bố cục giống Vận chuyển:
 * Tổng quan · Chức năng chung · Điều hành · Cài đặt.
 * Mọi đường dẫn thuộc /m/{moduleKey}/… (trừ Drive dùng ?module=).
 */
export function buildCustomAppModuleMenuGroups(moduleKey, modMeta = null) {
  const key = String(moduleKey || '').trim();
  if (!key) return [];
  const scope = customModuleScopeId(key);
  const base = `/m/${key}`;
  const settings = `${base}/settings`;
  const labelName = String(modMeta?.name || key).trim() || key;

  return [
    {
      id: `custom-${key}-overview`,
      moduleScope: scope,
      title: '1. Tổng quan',
      emoji: '📊',
      items: [
        { to: base, icon: LayoutDashboard, label: 'Dashboard', end: true },
        { to: `${base}/assignments`, icon: ClipboardList, label: `Giao việc ${labelName}` },
        { to: `/drive?module=${encodeURIComponent(scope)}`, icon: HardDrive, label: 'Drive' },
      ],
    },
    {
      id: `custom-${key}-shared`,
      moduleScope: scope,
      title: '2. Chức năng chung',
      emoji: '🌐',
      items: buildCustomAppSharedLinks(key),
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
        { to: `${base}/trash`, icon: Trash2, label: 'Thùng rác', adminOnly: true, strictAdminOnly: true },
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
