import { NavLink, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { persistCrmPipelineUiNow } from '../lib/crmPipelineStorage';
import { useAuth } from '../lib/auth';
import { isAdminLike, isCrmModuleAdmin, isStrictAdmin, isWorkProductionModuleAdmin, canAccessCrmSocialInbox } from '../lib/adminRole';
import NotificationCenter from './NotificationCenter';
import SidebarTooltip from './SidebarTooltip';
import { getInitials, avatarColor } from '../lib/utils';
import { publicFileUrl } from '../lib/publicFileUrl';
import {
  LayoutDashboard, FolderKanban, CheckSquare, Users, Settings, LogOut, Lock,
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Inbox, UserCircle, Package, ClipboardList, 
  UserPlus, Building2, Building, Network, Layers, GitBranch, Shield, UsersRound,
  Target, FileText, ShoppingCart, Receipt, Activity, BarChart3, Phone, Palette, ListChecks, Mic,
  BookOpen, FolderTree, Factory, Calendar, CalendarClock, CalendarRange, Megaphone, MessageCircle, ArrowRightLeft, ClipboardCheck, FileCheck, Key, Puzzle, Tags, MapPin, UserCog, LayoutGrid, Timer, Trash2, Clock, Share2, ShieldOff, Smartphone, GraduationCap, Bot, Download, UserMinus,
  Sigma, Calculator, FileUp, History as HistoryIcon, HardDrive,
} from 'lucide-react';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  isCrmSidebarActive,
  readStoredModule,
  resolveActiveModule,
  storeModule,
} from '../lib/sidebarModuleContext';
import { useModuleAccess } from '../shared/context/ModuleAccessContext';
import { useSidebarUnreadBadges } from '../shared/context/UnreadBadgesContext';
import AppSwitcherPanel, { AppSwitcherButton } from './AppSwitcherPanel';
import SidebarModuleCycleButton from './SidebarModuleCycleButton';
import { APP_MODULE_DEFINITIONS } from '../lib/appSwitcherModules';
import { preloadModuleIconsFromModules } from '../lib/moduleIconPreload';

// Reorganized menu structure - 4 groups
const MENU_GROUPS = [
  {
    id: 'overview',
    title: '1. Tổng quan',
    emoji: '📊',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Tổng hợp Quản lý' },
      { to: '/dashboard/classic', icon: BarChart3, label: 'Dashboard cũ' },
      { to: '/dashboard/divisions', icon: BarChart3, label: 'Dashboard Khối' },
      { to: '/my-tasks', icon: Inbox, label: 'Việc của tôi' },
      { to: '/work/unified', icon: Layers, label: 'Tổng hợp nhiệm vụ' },
      { to: '/personal-tasks', icon: UserPlus, label: 'NV cá nhân' },
      { to: '/project-workflow', icon: GitBranch, label: 'Công việc dự án' },
    ]
  },
  {
    id: 'workspace',
    title: '2. Làm việc',
    emoji: '🏢',
    items: [
      { to: '/projects', icon: FolderKanban, label: 'Dự án', moduleKey: 'projects' },
      { to: '/tasks', icon: CheckSquare, label: 'Tất cả CV', adminOnly: true, moduleKey: 'tasks' },
      { to: '/tasks/regions', icon: MapPin, label: 'Khu vực công ty', adminOnly: true, moduleKey: 'tasks' },
      { to: '/workspace/org-setup', icon: UsersRound, label: 'Tổ chức nhanh', adminOnly: true, moduleKey: 'tasks' },
      { to: '/customers', icon: UserCircle, label: 'Khách hàng', adminOnly: true, moduleKey: 'customers' },
      { to: '/products', icon: Package, label: 'Sản phẩm', adminOnly: true },
      { to: '/workflow-hub', icon: GitBranch, label: 'Quản lý quy trình', adminOnly: true },
      { to: '/drive', icon: HardDrive, label: 'Drive lưu trữ' },
    ]
  },
  {
    id: 'system',
    title: '3. Hệ thống',
    emoji: '🏗️',
    adminOnly: true,
    items: [
      { to: '/ecosystem', icon: Network, label: 'Cấu trúc công ty' },
      { to: '/ecosystem/modules', icon: Puzzle, label: 'Module & Khối' },
      { to: '/companies', icon: Building2, label: 'Công ty' },
      { to: '/departments', icon: Building, label: 'Phòng ban' },
      { to: '/teams', icon: Users, label: 'Team' },
      { to: '/users', icon: Users, label: 'Nhân viên' },
      { to: '/permissions', icon: Shield, label: 'Phân quyền' },
      { to: '/ecosystem-levels', icon: Layers, label: 'Cấp bậc HST' },
    ]
  },
  {
    id: 'settings',
    title: '4. Cài đặt',
    emoji: '⚙️',
    adminOnly: true,
    items: [
      { to: '/workflow-settings', icon: Settings, label: 'Quy trình & KH' },
      { to: '/approval-rules', icon: Settings, label: 'Quy tắc duyệt' },
      { to: '/settings/pdf', icon: Settings, label: 'Thông tin PDF' },
      { to: '/settings/theme', icon: Settings, label: 'Giao diện & Hình nền' },
      { to: '/settings/ai-chat-bot', icon: Bot, label: 'AI Bot trong chat' },
      { to: '/settings/app-updates', icon: Smartphone, label: 'Cập nhật App' },
      { to: '/settings/request-monitor', icon: Activity, label: 'Theo dõi Request' },
      // { to: '/templates', icon: ClipboardList, label: 'Dự án mẫu' },
      // { to: '/stage-groups', icon: FolderKanban, label: 'Nhóm quy trình' },
    ]
  }
];

/** CRM — đầu sidebar: lối vào nhanh */
const CRM_MENU_TOP_GROUP = {
  id: 'crm-overview',
  moduleKey: 'crm',
  title: 'Tổng quan',
  emoji: '📊',
  items: [
    { to: '/crm/dashboard', icon: LayoutDashboard, label: 'Dashboard CRM', end: true },
    { to: '/crm/events', icon: Calendar, label: 'Sự kiện' },
    { to: '/crm/leaves', icon: UserMinus, label: 'Lịch nghỉ' },
    { to: '/crm/messenger', icon: MessageCircle, label: 'Nhóm chat' },
    { to: '/crm/activity', icon: Activity, label: 'Đang hoạt động' },
    { to: '/social', icon: Share2, label: 'Bảng tin nội bộ' },
    { to: '/tools/voice-recordings', icon: Mic, label: 'Cuộc gọi & ghi âm' },
    { to: '/drive?module=crm', icon: HardDrive, label: 'Drive CRM' },
  ],
};

/** CRM — các cụm cuộn: bán hàng, tài chính, KPI, dữ liệu, thông báo, quản trị, hỗ trợ */
const CRM_MENU_BOTTOM_GROUPS = [
  {
    id: 'crm-sales',
    moduleKey: 'crm',
    title: 'Bán hàng',
    emoji: '🎯',
    items: [
      { to: '/crm/follow-up-care', icon: CalendarClock, label: 'CSKH theo hạn' },
      { to: '/crm/tasks', icon: CheckSquare, label: 'Công việc CRM', end: true },
      { to: '/crm/assignments', icon: ClipboardList, label: 'Giao việc CRM', end: true },
      { to: '/crm/dept-plan', icon: CalendarRange, label: 'Kế hoạch phòng ban' },
      { to: '/crm/lead-journey', icon: ArrowRightLeft, label: 'Hành trình Lead' },
    ],
  },
  {
    id: 'crm-finance',
    moduleKey: 'crm',
    title: 'Tài chính',
    emoji: '💳',
    items: [
      { to: '/crm/quotations', icon: FileText, label: 'Báo giá' },
      { to: '/crm/orders', icon: ShoppingCart, label: 'Đơn hàng' },
      { to: '/crm/invoices', icon: Receipt, label: 'Hóa đơn' },
      { to: '/settings/misa', icon: FileCheck, label: 'MISA meInvoice', adminOnly: true },
    ],
  },
  {
    id: 'crm-kpi',
    moduleKey: 'crm',
    title: 'KPI & báo cáo',
    emoji: '📈',
    items: [
      { to: '/crm/executive-kpi', icon: BarChart3, label: 'KPI Giám đốc', executiveOnly: true },
      { to: '/crm/kpi/company', icon: Users, label: 'KPI Nhân viên (Tổng quan)', executiveOnly: true },
      { to: '/crm/kpi/verify-b', icon: Activity, label: 'Verify KPI nhóm B', executiveOnly: true },
      { to: '/crm/kpi/guide', icon: BookOpen, label: 'Hướng dẫn KPI' },
      { to: '/crm/kpi/sales-admin', icon: Activity, label: 'KPI Sales Admin (Tủ bếp)' },
      { to: '/crm/kpi/deal', icon: Target, label: 'KPI Deal (Tủ bếp)', hideForRoles: ['sales_admin'] },
      { to: '/crm/kpi/scorecard', icon: ClipboardCheck, label: 'Scorecard KPI tháng', executiveOnly: true },
      { to: '/crm/kpi/settings', icon: Settings, label: 'Cấu hình KPI Tủ bếp', executiveOnly: true },
      { to: '/crm/reports', icon: BarChart3, label: 'Báo cáo', adminOnly: true },
      { to: '/crm/reports/org-overview', icon: Building2, label: 'BC theo tổ chức', executiveOnly: true },
      { to: '/crm/reports/staff-lead-deal', icon: Users, label: 'BC Lead/Deal theo NV', executiveOnly: true },
      { to: '/crm/admin/sla-watchlist', icon: Timer, label: 'SLA Lead/Deal (quản trị)', executiveOnly: true },
      { to: '/crm/settings/deal-stage-report', icon: LayoutGrid, label: 'Phân loại cột BC Deal', executiveOnly: true },
      { to: '/crm/deadline-settings', icon: Clock, label: 'Cấu hình Deadline CRM', executiveOnly: true },
    ],
  },
  {
    id: 'crm-master',
    moduleKey: 'crm',
    title: 'Dữ liệu',
    emoji: '🗂️',
    items: [
      { to: '/crm/customers', icon: UserCircle, label: 'Khách hàng' },
      { to: '/crm/products', icon: Package, label: 'Sản phẩm' },
      { to: '/crm/categories', icon: FolderTree, label: 'Nhóm ngành' },
    ],
  },
  {
    id: 'crm-notify',
    moduleKey: 'crm',
    title: 'Thông báo',
    emoji: '🔔',
    items: [
      { to: '/knowledge', icon: GraduationCap, label: 'Kiến thức' },
      { to: '/updates', icon: Megaphone, label: 'Có gì mới?' },
    ],
  },
  {
    id: 'crm-social',
    moduleKey: 'crm',
    title: 'Kênh chat',
    emoji: '💬',
    items: [
      { to: '/crm/facebook', icon: MessageCircle, label: 'Facebook', socialInboxAccess: true },
      { to: '/crm/zalo', icon: MessageCircle, label: 'Zalo OA', socialInboxAccess: true },
    ],
  },
  {
    id: 'crm-admin',
    moduleKey: 'crm',
    title: 'Quản trị CRM',
    emoji: '⚙️',
    adminOnly: true,
    items: [
      { to: '/crm/facebook/link-phone-cleanup', icon: Phone, label: 'Dọn SĐT từ link', adminOnly: true },
      { to: '/crm/blocked-phones', icon: ShieldOff, label: 'Chặn KH (SĐT)', adminOnly: true },
      { to: '/crm/pipeline-settings', icon: Settings, label: 'Pipeline', adminOnly: true },
      { to: '/crm/sources-settings', icon: Tags, label: 'Nguồn & phân loại', adminOnly: true },
      { to: '/crm/task-templates', icon: ListChecks, label: 'Bộ mẫu CRM', adminOnly: true },
      { to: '/crm/auto-project-config', icon: Settings, label: 'Auto tạo dự án', adminOnly: true },
      { to: '/admin/trash', icon: Trash2, label: 'Thùng rác (tổng hợp)', adminOnly: true, strictAdminOnly: true },
    ],
  },
  {
    id: 'crm-support',
    moduleKey: 'crm',
    title: 'Hỗ trợ & công cụ',
    emoji: '🛠️',
    items: [
      { to: '/settings/password', icon: Lock, label: 'Đổi mật khẩu' },
      { to: '/settings/location', icon: MapPin, label: 'Vị trí làm việc' },
      { to: '/settings/devices', icon: Smartphone, label: 'Thiết bị đăng nhập' },
      { to: '/crm/download-app', icon: Download, label: 'Tải app CRM' },
      { to: '/knowledge', icon: GraduationCap, label: 'Kiến thức' },
      { to: '/guide', icon: BookOpen, label: 'Hướng dẫn sử dụng', adminOnly: true },
      { to: '/settings/api-keys', icon: Key, label: 'API Key tích hợp', adminOnly: true },
      { to: '/settings/app-updates', icon: Smartphone, label: 'Cập nhật App', adminOnly: true },
    ],
  },
];

// Chức năng chung dùng cho mọi module — đặt ngay sau Dashboard từng module,
// đồng bộ trải nghiệm với CRM_MENU_TOP_GROUP.
// `moduleScope` giúp các trang dùng chung tự lọc theo khối (ví dụ Sự kiện).
function buildSharedTopLinks(moduleScope) {
  const eventsTo = moduleScope
    ? { pathname: '/crm/events', search: `?module=${moduleScope}` }
    : '/crm/events';
  return [
    { to: '/social', icon: Share2, label: 'Bảng tin nội bộ' },
    { to: eventsTo, icon: Calendar, label: 'Sự kiện' },
    { to: '/crm/leaves', icon: UserMinus, label: 'Lịch nghỉ' },
    { to: '/crm/activity', icon: Activity, label: 'Đang hoạt động' },
    { to: '/crm/messenger', icon: MessageCircle, label: 'Nhóm chat' },
  ];
}
const SHARED_TOP_LINKS_SX = buildSharedTopLinks('production');
const SHARED_TOP_LINKS_VC = buildSharedTopLinks('logistics');

// PRODUCTION (SẢN XUẤT) menu structure
const SX_MENU_GROUPS = [
  {
    id: 'sx-overview',
    moduleKey: 'production',
    title: '1. Tổng quan',
    emoji: '🏭',
    items: [
      { to: '/sx/dashboard', icon: LayoutDashboard, label: 'Dashboard xưởng', end: true },
      { to: '/drive?module=sx', icon: HardDrive, label: 'Drive Sản xuất' },
    ]
  },
  {
    id: 'sx-shared',
    title: '2. Chức năng chung',
    emoji: '🌐',
    items: SHARED_TOP_LINKS_SX,
  },
  {
    id: 'sx-projects',
    moduleKey: 'production',
    title: '3. Điều hành xưởng',
    emoji: '📦',
    items: [
      { to: '/sx/dashboard', icon: FolderKanban, label: 'Deal vào xưởng' },
      { to: '/crm/facebook', icon: MessageCircle, label: 'Facebook', adminOnly: true },
      { to: '/sx/pipeline-settings', icon: Settings, label: 'Pipeline xưởng' },
      { to: '/sx/regions', icon: MapPin, label: 'Khu vực', adminOnly: true },
      { to: '/sx/task-templates', icon: ListChecks, label: 'Bộ mẫu nhiệm vụ xưởng' },
      { to: '/sx/assignments', icon: ClipboardList, label: 'Giao việc Sản xuất' },
      { to: '/sx/handover-settings', icon: UserCog, label: 'Bàn giao CRM → SX (nâng cao)' },
      { to: { pathname: '/admin/trash', search: '?tab=sx' }, icon: Trash2, label: 'Thùng rác SX', adminOnly: true, strictAdminOnly: true },
    ]
  },
  {
    id: 'sx-tools',
    moduleKey: 'production',
    title: '4. Hỗ trợ',
    emoji: '🛠️',
    items: [
      { to: '/sx/download-app', icon: Download, label: 'Tải app Xưởng' },
    ],
  },
];

// KNOWLEDGE (KIẾN THỨC) menu structure
const KNOWLEDGE_MENU_GROUPS = [
  {
    id: 'knowledge-learn',
    title: '1. Học tập',
    emoji: '🎓',
    items: [
      { to: '/knowledge', icon: GraduationCap, label: 'Thư viện kiến thức', end: true },
      { to: '/knowledge/my-history', icon: ClipboardCheck, label: 'Lịch sử bài làm' },
      { to: '/knowledge/certificates', icon: FileCheck, label: 'Chứng nhận của tôi' },
    ],
  },
  {
    id: 'knowledge-admin',
    title: '2. Quản lý nội dung',
    emoji: '⚙️',
    adminOnly: true,
    items: [
      { to: '/knowledge/admin', icon: Settings, label: 'Quản trị kiến thức', adminOnly: true },
      { to: '/knowledge/scoreboard', icon: ClipboardCheck, label: 'Bảng điểm công ty', adminOnly: true },
    ],
  },
];

// CALC (TÍNH TOÁN) menu structure
const CALC_MENU_GROUPS = [
  {
    id: 'calc-overview',
    moduleKey: 'tinhtoan',
    title: '1. Tổng quan',
    emoji: '🧮',
    items: [
      { to: '/calc', icon: Sigma, label: 'Trang chính', end: true },
      { to: '/calc/run', icon: Calculator, label: 'Tính nhanh' },
      { to: '/calc/import-3d', icon: FileUp, label: 'Tính từ file 3D' },
      { to: '/calc/history', icon: HistoryIcon, label: 'Lịch sử tính' },
    ],
  },
  {
    id: 'calc-setup',
    moduleKey: 'tinhtoan',
    title: '2. Cấu hình',
    emoji: '⚙️',
    adminOnly: true,
    items: [
      { to: '/calc/setup', icon: Settings, label: 'Danh mục / Loại / Công thức / Rule' },
    ],
  },
];

// KẾ TOÁN menu structure
const KETOAN_MENU_GROUPS = [
  {
    id: 'ketoan-overview',
    moduleKey: 'accounting',
    title: '1. Tổng quan',
    emoji: '🧾',
    items: [
      { to: '/ketoan/dashboard', icon: LayoutDashboard, label: 'Tổng hợp deal SX', end: true },
      { to: '/crm/quotations', icon: FileText, label: 'Báo giá' },
      { to: '/crm/orders', icon: ShoppingCart, label: 'Đơn hàng' },
      { to: '/crm/invoices', icon: Receipt, label: 'Hóa đơn' },
    ],
  },
  {
    id: 'ketoan-cross',
    moduleKey: 'accounting',
    title: '2. Theo dõi SX',
    emoji: '🏭',
    items: [
      { to: '/sx/dashboard', icon: Factory, label: 'Kanban Sản xuất' },
      { to: '/vc/dashboard', icon: LayoutDashboard, label: 'Kanban Vận chuyển' },
    ],
  },
];

// LOGISTICS (VẬN CHUYỂN) menu structure
const VC_MENU_GROUPS = [
  {
    id: 'vc-overview',
    moduleKey: 'logistics',
    title: '1. Tổng quan',
    emoji: '🚚',
    items: [
      { to: '/vc/dashboard', icon: LayoutDashboard, label: 'Dashboard VC', end: true },
      { to: '/drive?module=vc', icon: HardDrive, label: 'Drive Vận chuyển' },
    ]
  },
  {
    id: 'vc-shared',
    title: '2. Chức năng chung',
    emoji: '🌐',
    items: SHARED_TOP_LINKS_VC,
  },
  {
    id: 'vc-projects',
    moduleKey: 'logistics',
    title: '3. Điều hành VC',
    emoji: '📦',
    items: [
      { to: '/vc/dashboard', icon: FolderKanban, label: 'Dự án vận chuyển' },
      { to: '/vc/pipeline-settings', icon: Settings, label: 'Pipeline VC' },
      { to: '/vc/teams', icon: Users, label: 'Quản lý Đội nhóm' },
      { to: '/vc/task-templates', icon: ListChecks, label: 'Bộ nhiệm vụ VC' },
      { to: { pathname: '/admin/trash', search: '?tab=vc' }, icon: Trash2, label: 'Thùng rác VC', adminOnly: true, strictAdminOnly: true },
    ]
  },
];

function resolveGroupModuleContext(group) {
  if (group.moduleKey === 'crm' || String(group.id || '').startsWith('crm')) return 'crm';
  if (group.moduleKey === 'production' || String(group.id || '').startsWith('sx')) return 'sx';
  if (group.moduleKey === 'logistics' || String(group.id || '').startsWith('vc')) return 'vc';
  if (group.moduleKey === 'accounting' || String(group.id || '').startsWith('ketoan')) return 'ketoan';
  if (group.moduleKey === 'tinhtoan' || String(group.id || '').startsWith('calc')) return 'calc';
  if (String(group.id || '').startsWith('knowledge')) return 'knowledge';
  return 'work';
}

function SideLink({ to, icon: Icon, label, collapsed, end, badge, moduleContext }) {
  const location = useLocation();
  const onNavClick = () => {
    const p = location.pathname;
    if (p === '/crm/dashboard' || p === '/crm/pipeline') {
      persistCrmPipelineUiNow();
    }
    if (moduleContext) storeModule(moduleContext);
  };
  return (
    <SidebarTooltip
      label={label}
      badge={badge}
      enabled={collapsed}
    >
      <NavLink
        to={to}
        state={moduleContext ? { moduleContext } : undefined}
        onClick={onNavClick}
        end={to === '/' || end}
        className={({ isActive }) =>
          `flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] font-medium transition-all ${
            isActive
              ? 'bg-[var(--color-sidebar-active)] text-[var(--color-sidebar-text-active)]'
              : 'text-[var(--color-sidebar-text)] hover:bg-[var(--color-sidebar-hover)] hover:text-white'
          }`
        }
      >
        <span className="relative shrink-0">
          <Icon className="h-[19px] w-[19px]" />
          {badge > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
              {badge > 9 ? '9+' : badge}
            </span>
          )}
        </span>
        {!collapsed && (
          <span className="flex-1 flex items-center justify-between gap-2 min-w-0">
            <span className="truncate">{label}</span>
            {badge > 0 && (
              <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {badge > 9 ? '9+' : badge}
              </span>
            )}
          </span>
        )}
      </NavLink>
    </SidebarTooltip>
  );
}

function MenuGroup({ group, collapsed, isAdmin, isWorkModuleAdmin, isStrictAdminUser, isExecutive, canAccessModule, canAccessSocialInbox, userRole, updatesUnread = 0, assignmentsUnread = 0, sxAssignmentsUnread = 0, socialUnread = 0 }) {
  const [open, setOpen] = useState(true);
  const moduleContext = resolveGroupModuleContext(group);
  const moduleAdmin = (moduleContext === 'work' || moduleContext === 'sx')
    ? (isWorkModuleAdmin ?? isAdmin)
    : isAdmin;

  if (group.moduleKey && canAccessModule && !canAccessModule(group.moduleKey)) return null;
  if (group.adminOnly && !moduleAdmin) return null;

  const r = String(userRole || '').trim().toLowerCase();

  // Filter items based on role + ecosystem module scope
  const items = group.items.filter((item) => {
    if (item.socialInboxAccess && !canAccessSocialInbox) return false;
    if (item.adminOnly && !moduleAdmin) return false;
    if (item.strictAdminOnly && !isStrictAdminUser) return false;
    if (item.executiveOnly && !isExecutive) return false;
    if (item.moduleKey && canAccessModule && !canAccessModule(item.moduleKey)) return false;
    if (item.hideForRoles?.length && r && item.hideForRoles.map((x) => String(x).toLowerCase()).includes(r)) return false;
    return true;
  });
  
  // Hide entire group if no items visible
  if (items.length === 0) return null;

  return (
    <div className="mb-4">
      {!collapsed ? (
        <button
          onClick={() => setOpen(!open)}
          title={group.title}
          className="w-full h-9 flex items-center justify-between gap-2 px-4 text-[13px] font-extrabold text-white uppercase tracking-wide hover:bg-white/5 rounded-md transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-sm shrink-0">{group.emoji}</span>
            <span className="truncate">{group.title}</span>
          </span>
          <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${open ? '' : 'rotate-180'}`} />
        </button>
      ) : (
        <SidebarTooltip label={group.title} enabled={collapsed}>
          <div className="px-2 py-1 text-center text-sm opacity-60">{group.emoji}</div>
        </SidebarTooltip>
      )}
      
      {open && (
        <nav className="space-y-0.5 px-2 mt-1">
          {items.map((item) => (
            <SideLink
              key={`${group.id}-${typeof item.to === 'string' ? item.to : `${item.to?.pathname || ''}${item.to?.search || ''}`}-${item.label}`}
              {...item}
              moduleContext={moduleContext}
              collapsed={collapsed}
              badge={
                item.to === '/updates' ? updatesUnread
                : item.to === '/crm/assignments' ? assignmentsUnread
                : item.to === '/sx/assignments' ? sxAssignmentsUnread
                : item.to === '/social' ? socialUnread
                : 0
              }
            />
          ))}
        </nav>
      )}
    </div>
  );
}

export default function Sidebar() {
  const { updatesUnread, assignmentsUnread, sxAssignmentsUnread, socialUnread } = useSidebarUnreadBadges();
  const { canAccessModule, crmOnly } = useModuleAccess();
  const [collapsed, setCollapsed] = useState(false);
  const [userPanelHidden, setUserPanelHidden] = useState(() => {
    try { return localStorage.getItem('sidebar_user_panel_hidden') === '1'; } catch { return false; }
  });
  const toggleUserPanel = () => {
    setUserPanelHidden((v) => {
      const next = !v;
      try { localStorage.setItem('sidebar_user_panel_hidden', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };
  const [showAppSwitcher, setShowAppSwitcher] = useState(false);
  const [pinnedModule, setPinnedModule] = useState(() => localStorage.getItem('pinned_module') || '/crm');
  const appSwitcherRef = useRef(null);
  const { user, logout, socket } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    void preloadModuleIconsFromModules(APP_MODULE_DEFINITIONS);
  }, []);

  // Auto-collapse sidebar on quotation form pages (need more screen space)
  useEffect(() => {
    const isQuotationForm = /\/crm\/quotations\/(new|[0-9a-f-]{36})/.test(location.pathname);
    if (isQuotationForm && !collapsed) setCollapsed(true);
  }, [location.pathname]);

  const isAdmin = isAdminLike(user) || user?.role === 'manager';
  const isWorkModuleAdmin = isWorkProductionModuleAdmin(user);
  const isStrictAdminUser = isStrictAdmin(user);
  /** Sidebar CRM: admin CRM (hệ thống, sales_admin, admin CRM+SX) thấy đủ mục cài đặt CRM. */
  const isCrmMenuAdmin = isCrmModuleAdmin(user);
  const canAccessSocialInbox = canAccessCrmSocialInbox(user);
  const isExecutive = ['admin', 'manager', 'director', 'supervisor', 'sales_admin', 'crm_production_admin'].includes(user?.role);
  const [searchParams] = useSearchParams();
  const [activeModule, setActiveModule] = useState(() => readStoredModule() || 'crm');

  useEffect(() => {
    const next = resolveActiveModule(location.pathname, location.state?.moduleContext, searchParams);
    setActiveModule(next);
    storeModule(next);
  }, [location.pathname, location.state?.moduleContext, searchParams]);

  /** Ghi âm dùng route /tools/… nhưng vẫn dùng menu CRM khi đang xem trang đó. crmOnly: luôn sidebar CRM. */
  const isKnowledge = location.pathname.startsWith('/knowledge') || activeModule === 'knowledge';
  const isCalc = !isKnowledge && (location.pathname.startsWith('/calc') || activeModule === 'calc');
  const isCRM = !isKnowledge && !isCalc && isCrmSidebarActive(location.pathname, activeModule, crmOnly);
  const isKetoan = !isKnowledge && !isCalc && (location.pathname.startsWith('/ketoan') || activeModule === 'ketoan');
  const isSX = !isKnowledge && !isCalc && !isKetoan && (location.pathname.startsWith('/sx') || activeModule === 'sx');
  const isVC = !isKnowledge && !isCalc && !isKetoan && (location.pathname.startsWith('/vc') || activeModule === 'vc');
  const activeMenuGroups = isKnowledge
    ? KNOWLEDGE_MENU_GROUPS
    : isCalc
      ? CALC_MENU_GROUPS
      : isKetoan
        ? KETOAN_MENU_GROUPS
        : isVC
          ? VC_MENU_GROUPS
          : isSX
            ? SX_MENU_GROUPS
            : isCRM
              ? null
              : MENU_GROUPS;

  const pinModule = (path) => {
    localStorage.setItem('pinned_module', path);
    setPinnedModule(path);
  };

  // Close app switcher on outside click
  useEffect(() => {
    const handler = (e) => {
      if (e.target.closest('[data-module-access-denied-modal]')) return;
      if (appSwitcherRef.current && !appSwitcherRef.current.contains(e.target)) setShowAppSwitcher(false);
    };
    if (showAppSwitcher) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAppSwitcher]);

  const doLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <>
      <AppSwitcherPanel
        open={showAppSwitcher}
        onClose={() => setShowAppSwitcher(false)}
        navigate={navigate}
        canAccessModule={canAccessModule}
        crmOnly={crmOnly}
        pinnedModule={pinnedModule}
        onPinModule={pinModule}
        isKnowledge={isKnowledge}
        isCalc={isCalc}
        isKetoan={isKetoan}
        isVC={isVC}
        isSX={isSX}
        isCRM={isCRM}
        panelRef={appSwitcherRef}
      />

      <aside
      style={{
        backdropFilter: 'var(--sidebar-backdrop, none)',
        WebkitBackdropFilter: 'var(--sidebar-backdrop, none)',
      }}
      className={`flex flex-col bg-[var(--color-sidebar)] transition-all duration-200 relative z-30 shrink-0 overflow-visible ${
        collapsed ? 'w-[60px]' : 'w-[240px]'
      }`}
    >
      {/* App Switcher + vòng xoay module */}
      <div
        className={`border-b border-white/10 shrink-0 ${
          collapsed ? 'flex flex-col items-center gap-1.5 py-2 px-1' : 'flex items-center gap-2.5 px-3 h-[3.75rem]'
        }`}
      >
        <AppSwitcherButton
          open={showAppSwitcher}
          onClick={() => setShowAppSwitcher(!showAppSwitcher)}
          collapsed={collapsed}
        />
        <SidebarModuleCycleButton
            collapsed={collapsed}
            navigate={navigate}
            canAccessModule={canAccessModule}
            crmOnly={crmOnly}
            isKnowledge={isKnowledge}
            isCalc={isCalc}
            isKetoan={isKetoan}
            isVC={isVC}
            isSX={isSX}
          isCRM={isCRM}
        />
      </div>

      {/* Notification bell — overflow-visible để panel portal không bị cắt */}
      <div className="px-2 pt-3 pb-1 overflow-visible relative z-40">
        <NotificationCenter socket={socket} />
      </div>

      {/* Menu Groups — CRM: tổng quan cố định trên; các cụm Bán hàng / Tài chính / KPI / … cuộn bên dưới */}
      <div className={`flex-1 flex flex-col min-h-0 ${isCRM ? '' : 'overflow-y-auto'} py-2`}>
        {isCRM ? (
          <>
            <div className="shrink-0">
              <MenuGroup
                group={CRM_MENU_TOP_GROUP}
                collapsed={collapsed}
                isAdmin={isAdmin}
                isWorkModuleAdmin={isWorkModuleAdmin}
                isStrictAdminUser={isStrictAdminUser}
                isExecutive={isExecutive}
                canAccessModule={canAccessModule}
                canAccessSocialInbox={canAccessSocialInbox}
                userRole={user?.role}
                updatesUnread={updatesUnread}
                assignmentsUnread={assignmentsUnread}
                sxAssignmentsUnread={sxAssignmentsUnread}
                socialUnread={socialUnread}
              />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto border-t border-white/10 mt-1 pt-2">
              {CRM_MENU_BOTTOM_GROUPS.map((group) => {
                if (group.staffHidden && !isCrmMenuAdmin) return null;
                if (group.adminOnly && !isCrmMenuAdmin) return null;
                return (
                  <MenuGroup
                    key={group.id}
                    group={group}
                    collapsed={collapsed}
                    isAdmin={isCrmMenuAdmin}
                    isWorkModuleAdmin={isWorkModuleAdmin}
                    isStrictAdminUser={isStrictAdminUser}
                    isExecutive={isExecutive}
                    canAccessModule={canAccessModule}
                    canAccessSocialInbox={canAccessSocialInbox}
                    userRole={user?.role}
                    updatesUnread={updatesUnread}
                    assignmentsUnread={assignmentsUnread}
                sxAssignmentsUnread={sxAssignmentsUnread}
                socialUnread={socialUnread}
                  />
                );
              })}
            </div>
          </>
        ) : (
          activeMenuGroups.map((group) => (
              <MenuGroup
                key={group.id}
                group={group}
                collapsed={collapsed}
                isAdmin={isAdmin}
                isWorkModuleAdmin={isWorkModuleAdmin}
                isStrictAdminUser={isStrictAdminUser}
                isExecutive={isExecutive}
                canAccessModule={canAccessModule}
                canAccessSocialInbox={canAccessSocialInbox}
                userRole={user?.role}
                updatesUnread={updatesUnread}
                assignmentsUnread={assignmentsUnread}
                sxAssignmentsUnread={sxAssignmentsUnread}
                socialUnread={socialUnread}
              />
          ))
        )}
      </div>

      {/* User section */}
      <div className="border-t border-white/10">
        <button
          type="button"
          onClick={toggleUserPanel}
          title={userPanelHidden ? 'Hiện thông tin tài khoản' : 'Ẩn thông tin tài khoản'}
          className={`w-full flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-3 py-1 text-[11px] font-medium text-white/50 hover:text-white hover:bg-white/5 transition-colors`}
        >
          {!collapsed && (
            <span className="truncate">
              {userPanelHidden ? 'Hiện thông tin tài khoản' : 'Tài khoản'}
            </span>
          )}
          {userPanelHidden ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
        </button>
      {!userPanelHidden && (
      <div className="p-3 pt-1 space-y-2">
        {!collapsed ? (
          <>
            <NavLink
              to={user?.id ? `/social/u/${user.id}` : '#'}
              title="Mở trang cá nhân — chỉnh sửa thông tin & avatar"
              className="flex items-center gap-3 px-2 py-1 rounded-lg hover:bg-[var(--color-sidebar-hover)] transition-colors cursor-pointer group"
            >
              {user?.avatar ? (
                <img
                  src={publicFileUrl(user.avatar)}
                  alt=""
                  className="w-8 h-8 rounded-full object-cover border border-white/20 shrink-0 group-hover:border-white/50"
                  onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling && (e.currentTarget.nextSibling.style.display = 'flex'); }}
                />
              ) : null}
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{
                  backgroundColor: avatarColor(user?.full_name || 'User'),
                  display: user?.avatar ? 'none' : 'flex',
                }}
              >
                {getInitials(user?.full_name || 'U')}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-white truncate">{user?.full_name}</p>
                <p className="text-[11px] text-white/75 truncate group-hover:text-white/90">{user?.email}</p>
              </div>
              <UserCog className="h-4 w-4 text-white/40 group-hover:text-white/90 shrink-0 transition-colors" />
            </NavLink>
            <button
              onClick={doLogout}
              className="w-full flex items-center gap-3 px-3 py-2 text-[14px] font-medium text-[var(--color-sidebar-text)] hover:bg-[var(--color-sidebar-hover)] hover:text-white rounded-lg transition-all cursor-pointer"
            >
              <LogOut className="h-[19px] w-[19px]" />
              <span>Đăng xuất</span>
            </button>
            <NavLink to="/settings/theme"
              className="w-full flex items-center gap-3 px-3 py-2 text-[14px] font-medium text-[var(--color-sidebar-text)] hover:bg-[var(--color-sidebar-hover)] hover:text-white rounded-lg transition-all"
            >
              <Palette className="h-[19px] w-[19px]" />
              <span>Giao diện</span>
            </NavLink>
          </>
        ) : (
          <>
          <SidebarTooltip label={`${user?.full_name || 'Trang cá nhân'} — bấm để chỉnh sửa`} enabled={collapsed}>
            <NavLink
              to={user?.id ? `/social/u/${user.id}` : '#'}
              className="w-full p-1 flex items-center justify-center cursor-pointer hover:opacity-90"
            >
              {user?.avatar ? (
                <img
                  src={publicFileUrl(user.avatar)}
                  alt=""
                  className="w-8 h-8 rounded-full object-cover border border-white/20"
                  onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling && (e.currentTarget.nextSibling.style.display = 'flex'); }}
                />
              ) : null}
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                style={{
                  backgroundColor: avatarColor(user?.full_name || 'User'),
                  display: user?.avatar ? 'none' : 'flex',
                }}
              >
                {getInitials(user?.full_name || 'U')}
              </div>
            </NavLink>
          </SidebarTooltip>
          <SidebarTooltip label="Đăng xuất" enabled={collapsed}>
            <button onClick={doLogout} className="w-full p-2 text-[var(--color-sidebar-text)] hover:text-white cursor-pointer">
              <LogOut className="h-5 w-5 mx-auto" />
            </button>
          </SidebarTooltip>
          <SidebarTooltip label="Giao diện" enabled={collapsed}>
            <NavLink to="/settings/theme" className="w-full p-2 text-[var(--color-sidebar-text)] hover:text-white cursor-pointer block text-center">
              <Palette className="h-5 w-5 mx-auto" />
            </NavLink>
          </SidebarTooltip>
          </>
        )}
      </div>
      )}
      </div>

      {/* Toggle button */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 w-6 h-6 bg-[var(--color-sidebar)] border border-white/20 rounded-full flex items-center justify-center text-white hover:bg-white/10 cursor-pointer shadow-lg"
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </button>
    </aside>
    </>
  );
}
