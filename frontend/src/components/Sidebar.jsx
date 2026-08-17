import { NavLink, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { persistCrmPipelineUiNow } from '../lib/crmPipelineStorage';
import { useAuth } from '../lib/auth';
import { isAdminLike, isPlatformAdmin, isCrmModuleAdmin, isStrictAdmin, isWorkProductionModuleAdmin, canAccessCrmSocialInbox } from '../lib/adminRole';
import NotificationCenter from './NotificationCenter';
import SidebarTooltip from './SidebarTooltip';
import { getInitials, avatarColor } from '../lib/utils';
import { publicFileUrl } from '../lib/publicFileUrl';
import {
  LayoutDashboard, FolderKanban, CheckSquare, Users, Settings, LogOut, Lock,
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, UserCircle, Package, ClipboardList, 
  UserPlus, Building2, Building, Network, Layers, GitBranch, Shield, UsersRound,
  Target, FileText, ShoppingCart, ShoppingBag, Receipt, Activity, BarChart3, Phone, Palette, ListChecks, Mic, Award, Plus,
  BookOpen, FolderTree, Factory, Calendar, CalendarClock, CalendarRange, Megaphone, MessageCircle, ArrowRightLeft, ClipboardCheck, FileCheck, Key, Puzzle, Tags, MapPin, UserCog, LayoutGrid, Timer, Trash2, Clock, Share2, ShieldOff, Smartphone, GraduationCap, Bot, Download, UserMinus,
  Sigma, Calculator, FileUp, History as HistoryIcon, History, HardDrive, Database, Globe, CreditCard, Sparkles, Pin,
} from 'lucide-react';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  isCrmSidebarActive,
  readStoredModule,
  resolveActiveModule,
  storeModule,
  isCongViecPrimaryPath,
  isCustomModuleScope,
  moduleKeyFromCustomScope,
} from '../lib/sidebarModuleContext';
import { useModuleAccess } from '../shared/context/ModuleAccessContext';
import { useSidebarUnreadBadges } from '../shared/context/UnreadBadgesContext';
import AppSwitcherPanel, { AppSwitcherButton } from './AppSwitcherPanel';
import SidebarModuleCycleButton from './SidebarModuleCycleButton';
import { APP_MODULE_DEFINITIONS, mapCustomAppModuleToDef } from '../lib/appSwitcherModules';
import { buildCustomAppModuleMenuGroups } from '../lib/customAppModuleSidebar';
import { preloadModuleIconsFromModules } from '../lib/moduleIconPreload';
import {
  readModuleLocalMenuPins,
  saveModuleMenuPins,
  syncMenuPinsFromServer,
} from '../lib/sidebarMenuPins';
import api from '../lib/api';

// Reorganized menu structure - 4 groups + platform admin group
const MENU_GROUPS = [
  {
    id: 'platform',
    title: 'Nền tảng SaaS',
    emoji: '🌐',
    platformAdminOnly: true,
    items: [
      { to: '/platform', icon: LayoutDashboard, label: 'Tổng quan SaaS' },
      { to: '/platform/plans', icon: CreditCard, label: '4 gói chính' },
      { to: '/platform/modules', icon: Package, label: 'Modun add-on' },
      { to: '/platform/purchases', icon: ShoppingCart, label: 'Đơn mua & thông báo' },
      { to: '/platform/tenants', icon: Globe, label: 'Hệ sinh thái' },
      { to: '/platform/users', icon: Users, label: 'Users toàn nền tảng' },
      { to: '/platform/billing', icon: CreditCard, label: 'Gói thuê bao' },
      { to: '/platform/tier-features', icon: Puzzle, label: 'Tính năng theo gói' },
      { to: '/platform/stats', icon: BarChart3, label: 'Thống kê chi tiết' },
    ],
  },
  {
    id: 'overview',
    title: '1. Tổng quan',
    emoji: '📊',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Tổng hợp Quản lý' },
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
      { to: '/setup', icon: Sparkles, label: 'Thiết lập HST', adminOnly: true, tenantAdminOnly: true },
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
      { to: '/management/backup-sync', icon: Database, label: 'Giám sát Supabase' },
      { to: '/management/mcp-api', icon: Bot, label: 'MCP API báo cáo', adminOnly: true },
      // { to: '/templates', icon: ClipboardList, label: 'Dự án mẫu' },
      // { to: '/stage-groups', icon: FolderKanban, label: 'Nhóm quy trình' },
    ]
  }
];

/** DỰ ÁN VÀ CÔNG VIỆC — nhiệm vụ tổng hợp + dự án + setup luồng module */
const CONGVIEC_MENU_GROUPS = [
  {
    id: 'congviec-overview',
    title: '1. Làm việc',
    emoji: '✅',
    items: [
      { to: '/projects', icon: LayoutDashboard, label: 'Dashboard dự án', end: true },
      { to: '/work/unified', icon: Layers, label: 'Công việc tổng hợp', end: true },
      { to: '/personal-tasks', icon: UserPlus, label: 'NV cá nhân' },
    ],
  },
  {
    id: 'congviec-setup',
    title: '2. Thiết lập',
    emoji: '⚙️',
    adminOnly: true,
    items: [
      { to: '/work/flows', icon: GitBranch, label: 'Setup luồng', adminOnly: true },
    ],
  },
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
      { to: '/crm/daily-reports', icon: ClipboardCheck, label: 'Báo cáo hằng ngày' },
      { to: '/crm/daily-reports/history', icon: History, label: 'Lịch sử công việc ngày' },
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
      { to: '/setup', icon: Sparkles, label: 'Thiết lập HST', adminOnly: true, tenantAdminOnly: true },
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
      { to: '/management/mcp-api', icon: Bot, label: 'MCP API báo cáo', adminOnly: true },
      { to: '/settings/app-updates', icon: Smartphone, label: 'Cập nhật App', adminOnly: true },
    ],
  },
];

// Chức năng chung dùng cho mọi module — đặt ngay sau Dashboard từng module,
// đồng bộ trải nghiệm với CRM_MENU_TOP_GROUP.
// `moduleScope` giúp các trang dùng chung tự lọc theo khối (ví dụ Sự kiện).
function buildSharedTopLinks(moduleScope) {
  const eventsTo = moduleScope === 'production'
    ? '/sx/events'
    : moduleScope === 'logistics'
      ? '/vc/events'
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
      { to: '/sx/assignments', icon: ClipboardList, label: 'Giao việc Sản xuất' },
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
      { to: '/calc/hop-cung/thiet-ke', icon: LayoutGrid, label: 'Thiết kế hộp cứng' },
      { to: '/calc/hop-cung', icon: Package, label: 'Tính hộp cứng' },
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
      { to: '/ketoan/bank-accounts', icon: CreditCard, label: 'Tài khoản NH' },
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
      { to: '/vc/dashboard', icon: LayoutDashboard, label: 'Kanban Lắp đặt' },
    ],
  },
];

// MUA HÀNG menu structure
const MUAHANG_MENU_GROUPS = [
  {
    id: 'muahang-orders',
    moduleKey: 'purchasing',
    title: '1. Lệnh đặt hàng',
    emoji: '🛒',
    items: [
      { to: '/mua-hang', icon: ShoppingBag, label: 'Inbox Mua hàng', end: true },
    ],
  },
  {
    id: 'muahang-catalog',
    moduleKey: 'purchasing',
    title: '2. Catalog',
    emoji: '📦',
    items: [
      { to: '/mua-hang/brands', icon: Award, label: 'Thương hiệu' },
      { to: '/mua-hang/categories', icon: FolderTree, label: 'Danh mục' },
      { to: '/mua-hang/products', icon: Package, label: 'Sản phẩm' },
    ],
  },
];

// LOGISTICS (LẮP ĐẶT) menu structure
const VC_MENU_GROUPS = [
  {
    id: 'vc-overview',
    moduleKey: 'logistics',
    title: '1. Tổng quan',
    emoji: '🔧',
    items: [
      { to: '/vc/dashboard', icon: LayoutDashboard, label: 'Dashboard Lắp đặt', end: true },
      { to: '/vc/assignments', icon: ClipboardList, label: 'Giao việc Lắp đặt' },
      { to: '/drive?module=vc', icon: HardDrive, label: 'Drive Lắp đặt' },
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
    title: '3. Điều hành Lắp đặt',
    emoji: '📦',
    items: [
      { to: '/vc/dashboard', icon: FolderKanban, label: 'Dự án lắp đặt' },
      { to: '/vc/pipeline-settings', icon: Settings, label: 'Pipeline Lắp đặt' },
      { to: '/vc/teams', icon: Users, label: 'Quản lý Đội nhóm' },
      { to: '/vc/task-templates', icon: ListChecks, label: 'Bộ nhiệm vụ Lắp đặt' },
      { to: { pathname: '/admin/trash', search: '?tab=vc' }, icon: Trash2, label: 'Thùng rác Lắp đặt', adminOnly: true, strictAdminOnly: true },
    ]
  },
  {
    id: 'vc-tools',
    moduleKey: 'logistics',
    title: '4. Hỗ trợ',
    emoji: '🛠️',
    items: [
      { to: '/vc/download-app', icon: Download, label: 'Tải app Lắp đặt' },
    ],
  },
];

function resolveGroupModuleContext(group) {
  if (group?.moduleScope && String(group.moduleScope).startsWith('custom:')) return group.moduleScope;
  if (String(group.id || '').startsWith('congviec')) return 'congviec';
  if (group.moduleKey === 'crm' || String(group.id || '').startsWith('crm')) return 'crm';
  if (group.moduleKey === 'production' || String(group.id || '').startsWith('sx')) return 'sx';
  if (group.moduleKey === 'logistics' || String(group.id || '').startsWith('vc')) return 'vc';
  if (group.moduleKey === 'accounting' || String(group.id || '').startsWith('ketoan')) return 'ketoan';
  if (group.moduleKey === 'purchasing' || String(group.id || '').startsWith('muahang')) return 'muahang';
  if (group.moduleKey === 'tinhtoan' || String(group.id || '').startsWith('calc')) return 'calc';
  if (String(group.id || '').startsWith('knowledge')) return 'knowledge';
  return 'work';
}

function serializeMenuLinkTo(to) {
  if (typeof to === 'string') return to;
  if (to && typeof to === 'object') {
    const pathname = to.pathname || '';
    const search = to.search || '';
    return `${pathname}${search}`;
  }
  return '';
}

function resolveMenuGroupAdmin(moduleContext, { isAdmin, isWorkModuleAdmin }) {
  return (moduleContext === 'work' || moduleContext === 'sx')
    ? (isWorkModuleAdmin ?? isAdmin)
    : isAdmin;
}

function filterVisibleMenuItems(items, {
  group,
  moduleAdmin,
  isPlatformAdminUser,
  isStrictAdminUser,
  isExecutive,
  canAccessModule,
  canAccessSocialInbox,
  userRole,
  userTenantId,
}) {
  if (group.platformAdminOnly && !isPlatformAdminUser) return [];
  if (group.moduleKey && canAccessModule && !canAccessModule(group.moduleKey)) return [];
  if (group.adminOnly && !moduleAdmin) return [];

  const r = String(userRole || '').trim().toLowerCase();
  return (items || []).filter((item) => {
    if (item.tenantAdminOnly && !userTenantId) return false;
    if (item.socialInboxAccess && !canAccessSocialInbox) return false;
    if (item.adminOnly && !moduleAdmin) return false;
    if (item.strictAdminOnly && !isStrictAdminUser) return false;
    if (item.executiveOnly && !isExecutive) return false;
    if (item.moduleKey && canAccessModule && !canAccessModule(item.moduleKey)) return false;
    if (item.hideForRoles?.length && r && item.hideForRoles.map((x) => String(x).toLowerCase()).includes(r)) return false;
    return true;
  });
}

function badgeForMenuLink(to, {
  updatesUnread = 0,
  assignmentsUnread = 0,
  sxAssignmentsUnread = 0,
  vcAssignmentsUnread = 0,
  socialUnread = 0,
  unifiedTasksOpen = 0,
} = {}) {
  const key = serializeMenuLinkTo(to);
  if (key === '/updates') return updatesUnread;
  if (key === '/crm/assignments') return assignmentsUnread;
  if (key === '/sx/assignments') return sxAssignmentsUnread;
  if (key === '/vc/assignments') return vcAssignmentsUnread;
  if (key === '/social') return socialUnread;
  if (key === '/work/unified') return unifiedTasksOpen;
  return 0;
}

function SideLink({
  to,
  icon: Icon,
  label,
  collapsed,
  end,
  badge,
  moduleContext,
  linkKey,
  isPinned = false,
  onTogglePin,
  pinEnabled = false,
}) {
  const location = useLocation();
  const resolvedKey = linkKey || serializeMenuLinkTo(to);
  const dataTour = to === '/crm/dashboard'
    ? 'nav-crm-dashboard'
    : to === '/crm/events'
      ? 'nav-crm-events'
      : to === '/crm/assignments'
        ? 'nav-crm-assignments'
        : undefined;
  const onNavClick = () => {
    const p = location.pathname;
    if (p === '/crm/dashboard' || p === '/crm/pipeline') {
      persistCrmPipelineUiNow();
    }
    if (moduleContext) storeModule(moduleContext);
  };
  const link = (
    <NavLink
      to={to}
      state={moduleContext ? { moduleContext } : undefined}
      onClick={onNavClick}
      end={to === '/' || end}
      data-tour={dataTour}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] font-medium transition-all min-w-0 flex-1 ${
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
  );

  if (!pinEnabled || collapsed || !onTogglePin || !resolvedKey) {
    return (
      <SidebarTooltip label={label} badge={badge} enabled={collapsed}>
        {link}
      </SidebarTooltip>
    );
  }

  return (
    <div className="group/link flex items-center gap-0.5 min-w-0">
      <SidebarTooltip label={label} badge={badge} enabled={false}>
        {link}
      </SidebarTooltip>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onTogglePin(resolvedKey);
        }}
        title={isPinned ? 'Bỏ ghim' : 'Ghim tab'}
        className={`shrink-0 p-1 rounded transition-all cursor-pointer ${
          isPinned
            ? 'text-amber-300 opacity-100'
            : 'text-white/35 opacity-0 group-hover/link:opacity-100 hover:text-amber-200'
        }`}
      >
        <Pin className={`h-3 w-3 ${isPinned ? 'fill-current' : ''}`} />
      </button>
    </div>
  );
}

function PinnedMenuBar({
  items,
  collapsed,
  onTogglePin,
  updatesUnread,
  assignmentsUnread,
  sxAssignmentsUnread,
  vcAssignmentsUnread,
  socialUnread,
  unifiedTasksOpen,
}) {
  if (!items.length) return null;
  const badgeOpts = {
    updatesUnread,
    assignmentsUnread,
    sxAssignmentsUnread,
    vcAssignmentsUnread,
    socialUnread,
    unifiedTasksOpen,
  };
  return (
    <div className="shrink-0 px-2 pb-2 mb-1 border-b border-white/10">
      {!collapsed && (
        <p className="px-2 pt-0.5 pb-1.5 text-[11px] font-bold text-amber-200/85 uppercase tracking-wide flex items-center gap-1.5">
          <Pin className="h-3 w-3 fill-current shrink-0" />
          <span>Đã ghim</span>
        </p>
      )}
      <nav className="space-y-0.5">
        {items.map((item) => (
          <SideLink
            key={`pin-${item.linkKey}`}
            to={item.to}
            icon={item.icon}
            label={item.label}
            end={item.end}
            moduleContext={item.moduleContext}
            collapsed={collapsed}
            linkKey={item.linkKey}
            isPinned
            pinEnabled
            onTogglePin={onTogglePin}
            badge={badgeForMenuLink(item.to, badgeOpts)}
          />
        ))}
      </nav>
    </div>
  );
}

function MenuGroup({ group, collapsed, moduleScope, isAdmin, isPlatformAdminUser, isWorkModuleAdmin, isStrictAdminUser, isExecutive, canAccessModule, canAccessSocialInbox, userRole, userTenantId, updatesUnread = 0, assignmentsUnread = 0, sxAssignmentsUnread = 0, vcAssignmentsUnread = 0, socialUnread = 0, unifiedTasksOpen = 0, pinnedLinkKeys = [], onTogglePin }) {
  const [open, setOpen] = useState(false);
  const moduleContext = resolveGroupModuleContext(group);

  // Đổi module (CRM / SX / VC / Công việc / …) → thu gọn lại toàn bộ nhóm menu
  useEffect(() => {
    setOpen(false);
  }, [moduleScope]);

  useEffect(() => {
    const onOpenGroup = (e) => {
      if (e.detail?.groupId === group.id) setOpen(true);
    };
    window.addEventListener('product-tour:open-menu-group', onOpenGroup);
    return () => window.removeEventListener('product-tour:open-menu-group', onOpenGroup);
  }, [group.id]);
  const moduleAdmin = resolveMenuGroupAdmin(moduleContext, { isAdmin, isWorkModuleAdmin });

  const items = filterVisibleMenuItems(group.items, {
    group,
    moduleAdmin,
    isPlatformAdminUser,
    isStrictAdminUser,
    isExecutive,
    canAccessModule,
    canAccessSocialInbox,
    userRole,
    userTenantId,
  });

  const unpinnedItems = items.filter(
    (item) => !pinnedLinkKeys.includes(serializeMenuLinkTo(item.to)),
  );

  // Ẩn nhóm nếu không còn mục (đã ghim hết hoặc không có quyền)
  if (unpinnedItems.length === 0) return null;

  const badgeOpts = {
    updatesUnread,
    assignmentsUnread,
    sxAssignmentsUnread,
    vcAssignmentsUnread,
    socialUnread,
    unifiedTasksOpen,
  };

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
          {unpinnedItems.map((item) => {
            const linkKey = serializeMenuLinkTo(item.to);
            return (
              <SideLink
                key={`${group.id}-${linkKey}-${item.label}`}
                {...item}
                moduleContext={moduleContext}
                collapsed={collapsed}
                linkKey={linkKey}
                isPinned={pinnedLinkKeys.includes(linkKey)}
                pinEnabled
                onTogglePin={onTogglePin}
                badge={badgeForMenuLink(item.to, badgeOpts)}
              />
            );
          })}
        </nav>
      )}
    </div>
  );
}

export default function Sidebar() {
  const {
    updatesUnread, assignmentsUnread, sxAssignmentsUnread, vcAssignmentsUnread, socialUnread, unifiedTasksOpen,
  } = useSidebarUnreadBadges();
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
  const isPlatformAdminUser = isPlatformAdmin(user);
  const isWorkModuleAdmin = isWorkProductionModuleAdmin(user);
  const isStrictAdminUser = isStrictAdmin(user);
  /** Sidebar CRM: admin CRM (hệ thống, sales_admin, admin CRM+SX) thấy đủ mục cài đặt CRM. */
  const isCrmMenuAdmin = isCrmModuleAdmin(user);
  const canAccessSocialInbox = canAccessCrmSocialInbox(user);
  const isExecutive = ['admin', 'manager', 'director', 'supervisor', 'sales_admin', 'crm_production_admin'].includes(user?.role);
  const [searchParams] = useSearchParams();
  const [activeModule, setActiveModule] = useState(() => readStoredModule() || 'crm');
  const [customAppModules, setCustomAppModules] = useState([]);
  const [customModMetaByKey, setCustomModMetaByKey] = useState({});

  useEffect(() => {
    const next = resolveActiveModule(location.pathname, location.state?.moduleContext, searchParams);
    setActiveModule(next);
    storeModule(next);
  }, [location.pathname, location.state?.moduleContext, searchParams]);

  useEffect(() => {
    let cancelled = false;
    api.get('/app-modules', { params: { for_switcher: 1 } })
      .then((r) => {
        if (cancelled) return;
        const rows = r.data?.modules || [];
        const defs = rows.map(mapCustomAppModuleToDef).filter(Boolean);
        const meta = {};
        rows.forEach((row) => {
          if (row?.module_key) meta[row.module_key] = row;
        });
        setCustomAppModules(defs);
        setCustomModMetaByKey(meta);
      })
      .catch(() => {
        if (!cancelled) {
          setCustomAppModules([]);
          setCustomModMetaByKey({});
        }
      });
    return () => { cancelled = true; };
  }, []);

  /** Ghi âm dùng route /tools/… nhưng vẫn dùng menu CRM khi đang xem trang đó. crmOnly: luôn sidebar CRM. */
  const customAppModuleKey = isCustomModuleScope(activeModule) ? moduleKeyFromCustomScope(activeModule) : null;
  const isCustomApp = !!customAppModuleKey;
  const isKnowledge = !isCustomApp && (location.pathname.startsWith('/knowledge') || activeModule === 'knowledge');
  const isCalc = !isCustomApp && !isKnowledge && (location.pathname.startsWith('/calc') || activeModule === 'calc');
  const isCRM = !isCustomApp && !isKnowledge && !isCalc && isCrmSidebarActive(location.pathname, activeModule, crmOnly);
  const isKetoan = !isCustomApp && !isKnowledge && !isCalc && (location.pathname.startsWith('/ketoan') || activeModule === 'ketoan');
  const isMuahang = !isCustomApp && !isKnowledge && !isCalc && !isKetoan && (location.pathname.startsWith('/mua-hang') || activeModule === 'muahang');
  const isSX = !isCustomApp && !isKnowledge && !isCalc && !isKetoan && !isMuahang && (location.pathname.startsWith('/sx') || activeModule === 'sx');
  const isVC = !isCustomApp && !isKnowledge && !isCalc && !isKetoan && !isMuahang && (location.pathname.startsWith('/vc') || activeModule === 'vc');
  const isCongViec = !isCustomApp && !isKnowledge && !isCalc && !isKetoan && !isMuahang && !isSX && !isVC && !isCRM
    && (isCongViecPrimaryPath(location.pathname) || activeModule === 'congviec');
  const customModuleId = isCustomApp ? `custom:${customAppModuleKey}` : null;
  const customModMeta = customAppModuleKey ? (customModMetaByKey[customAppModuleKey] || null) : null;
  const sidebarModuleKey = isCustomApp ? customModuleId
    : isKnowledge ? 'knowledge'
      : isCalc ? 'calc'
        : isKetoan ? 'ketoan'
          : isMuahang ? 'muahang'
            : isVC ? 'vc'
              : isSX ? 'sx'
                : isCongViec ? 'congviec'
                  : isCRM ? 'crm'
                    : 'platform';
  const customMenuGroups = useMemo(
    () => (isCustomApp ? buildCustomAppModuleMenuGroups(customAppModuleKey, customModMeta) : []),
    [isCustomApp, customAppModuleKey, customModMeta],
  );
  const activeMenuGroups = isCustomApp
    ? customMenuGroups
    : isKnowledge
      ? KNOWLEDGE_MENU_GROUPS
      : isCalc
        ? CALC_MENU_GROUPS
        : isKetoan
          ? KETOAN_MENU_GROUPS
          : isMuahang
            ? MUAHANG_MENU_GROUPS
            : isVC
              ? VC_MENU_GROUPS
              : isSX
                ? SX_MENU_GROUPS
                : isCongViec
                  ? CONGVIEC_MENU_GROUPS
                  : isCRM
                    ? null
                    : MENU_GROUPS;

  const sidebarUserId = user?.id || user?.userId || null;

  const sidebarGroups = useMemo(() => {
    if (isCRM) {
      return [
        CRM_MENU_TOP_GROUP,
        ...CRM_MENU_BOTTOM_GROUPS.filter((g) => {
          if (g.staffHidden && !isCrmMenuAdmin) return false;
          if (g.adminOnly && !isCrmMenuAdmin) return false;
          return true;
        }),
      ];
    }
    return activeMenuGroups || [];
  }, [isCRM, isCrmMenuAdmin, activeMenuGroups]);

  const menuFilterContext = useMemo(() => ({
    isAdmin: isCRM ? isCrmMenuAdmin : isAdmin,
    isPlatformAdminUser,
    isWorkModuleAdmin,
    isStrictAdminUser,
    isExecutive,
    canAccessModule,
    canAccessSocialInbox,
    userRole: user?.role,
    userTenantId: user?.tenant_id,
  }), [
    isCRM,
    isCrmMenuAdmin,
    isAdmin,
    isPlatformAdminUser,
    isWorkModuleAdmin,
    isStrictAdminUser,
    isExecutive,
    canAccessModule,
    canAccessSocialInbox,
    user?.role,
    user?.tenant_id,
  ]);

  const flatVisibleMenuItems = useMemo(() => {
    const rows = [];
    for (const group of sidebarGroups) {
      const moduleContext = resolveGroupModuleContext(group);
      const moduleAdmin = resolveMenuGroupAdmin(moduleContext, {
        isAdmin: menuFilterContext.isAdmin,
        isWorkModuleAdmin,
      });
      const items = filterVisibleMenuItems(group.items, {
        group,
        moduleAdmin,
        ...menuFilterContext,
      });
      for (const item of items) {
        rows.push({
          ...item,
          linkKey: serializeMenuLinkTo(item.to),
          moduleContext,
        });
      }
    }
    return rows;
  }, [sidebarGroups, menuFilterContext, isWorkModuleAdmin]);

  const [pinnedLinkKeys, setPinnedLinkKeys] = useState(() => readModuleLocalMenuPins(sidebarModuleKey, sidebarUserId));
  const [menuPinsSynced, setMenuPinsSynced] = useState(false);

  useEffect(() => {
    if (!sidebarUserId) {
      setMenuPinsSynced(true);
      setPinnedLinkKeys(readModuleLocalMenuPins(sidebarModuleKey, null));
      return undefined;
    }
    let cancelled = false;
    setMenuPinsSynced(false);
    (async () => {
      const all = await syncMenuPinsFromServer(sidebarUserId);
      if (cancelled) return;
      setPinnedLinkKeys(Array.isArray(all[sidebarModuleKey]) ? all[sidebarModuleKey] : []);
      setMenuPinsSynced(true);
    })();
    return () => { cancelled = true; };
  }, [sidebarUserId]);

  useEffect(() => {
    if (!menuPinsSynced) return;
    setPinnedLinkKeys(readModuleLocalMenuPins(sidebarModuleKey, sidebarUserId));
  }, [sidebarModuleKey, sidebarUserId, menuPinsSynced]);

  const toggleMenuPin = useCallback((linkKey) => {
    if (!linkKey) return;
    setPinnedLinkKeys((prev) => {
      const next = prev.includes(linkKey)
        ? prev.filter((k) => k !== linkKey)
        : [...prev, linkKey];
      saveModuleMenuPins(sidebarModuleKey, sidebarUserId, next);
      return next;
    });
  }, [sidebarModuleKey, sidebarUserId]);

  const pinnedMenuItems = useMemo(() => {
    const byKey = new Map(flatVisibleMenuItems.map((row) => [row.linkKey, row]));
    return pinnedLinkKeys.map((key) => byKey.get(key)).filter(Boolean);
  }, [pinnedLinkKeys, flatVisibleMenuItems]);

  const menuPinProps = {
    pinnedLinkKeys,
    onTogglePin: toggleMenuPin,
  };

  const pinModule = (path) => {
    localStorage.setItem('pinned_module', path);
    setPinnedModule(path);
  };

  // Close app switcher on outside click
  useEffect(() => {
    const handler = (e) => {
      if (e.target.closest('[data-module-access-denied-modal]')) return;
      // Tour overlay dimmers are outside the panel — don't close while guiding
      if (document.querySelector('[data-product-tour-overlay]')) return;
      if (appSwitcherRef.current && !appSwitcherRef.current.contains(e.target)) setShowAppSwitcher(false);
    };
    if (showAppSwitcher) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAppSwitcher]);

  useEffect(() => {
    const openSwitcher = () => setShowAppSwitcher(true);
    const closeSwitcher = () => setShowAppSwitcher(false);
    window.addEventListener('product-tour:open-app-switcher', openSwitcher);
    window.addEventListener('product-tour:close-app-switcher', closeSwitcher);
    return () => {
      window.removeEventListener('product-tour:open-app-switcher', openSwitcher);
      window.removeEventListener('product-tour:close-app-switcher', closeSwitcher);
    };
  }, []);

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
        isMuahang={isMuahang}
        isVC={isVC}
        isSX={isSX}
        isCRM={isCRM}
        isCongViec={isCongViec}
        customModuleId={customModuleId}
        customModules={customAppModules}
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
            isMuahang={isMuahang}
            isVC={isVC}
            isSX={isSX}
          isCRM={isCRM}
          isCongViec={isCongViec}
          customModuleId={customModuleId}
          customModuleName={customModMeta?.name || customAppModuleKey || null}
          customModuleMeta={customModMeta}
          extraModules={customAppModules}
          taskBadge={unifiedTasksOpen}
        />
      </div>

      {/* Notification bell — overflow-visible để panel portal không bị cắt */}
      <div className="px-2 pt-3 pb-1 overflow-visible relative z-40">
        <NotificationCenter socket={socket} />
      </div>

      {/* Menu Groups — CRM: tổng quan cố định trên; các cụm Bán hàng / Tài chính / KPI / … cuộn bên dưới */}
      <div className={`flex-1 flex flex-col min-h-0 ${isCRM ? '' : 'overflow-y-auto'} py-2`}>
        <PinnedMenuBar
          items={pinnedMenuItems}
          collapsed={collapsed}
          onTogglePin={toggleMenuPin}
          updatesUnread={updatesUnread}
          assignmentsUnread={assignmentsUnread}
          sxAssignmentsUnread={sxAssignmentsUnread}
          vcAssignmentsUnread={vcAssignmentsUnread}
          socialUnread={socialUnread}
          unifiedTasksOpen={unifiedTasksOpen}
        />
        {isCRM ? (
          <>
            <div className="shrink-0">
              <MenuGroup
                key={`${sidebarModuleKey}-${CRM_MENU_TOP_GROUP.id}`}
                group={CRM_MENU_TOP_GROUP}
                moduleScope={sidebarModuleKey}
                collapsed={collapsed}
                isAdmin={isAdmin}
                isPlatformAdminUser={isPlatformAdminUser}
                isWorkModuleAdmin={isWorkModuleAdmin}
                isStrictAdminUser={isStrictAdminUser}
                isExecutive={isExecutive}
                canAccessModule={canAccessModule}
                canAccessSocialInbox={canAccessSocialInbox}
                userRole={user?.role}
                userTenantId={user?.tenant_id}
                updatesUnread={updatesUnread}
                assignmentsUnread={assignmentsUnread}
                sxAssignmentsUnread={sxAssignmentsUnread}
                vcAssignmentsUnread={vcAssignmentsUnread}
                socialUnread={socialUnread}
                unifiedTasksOpen={unifiedTasksOpen}
                {...menuPinProps}
              />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto border-t border-white/10 mt-1 pt-2">
              {CRM_MENU_BOTTOM_GROUPS.map((group) => {
                if (group.staffHidden && !isCrmMenuAdmin) return null;
                if (group.adminOnly && !isCrmMenuAdmin) return null;
                return (
                  <MenuGroup
                    key={`${sidebarModuleKey}-${group.id}`}
                    group={group}
                    moduleScope={sidebarModuleKey}
                    collapsed={collapsed}
                    isAdmin={isCrmMenuAdmin}
                    isPlatformAdminUser={isPlatformAdminUser}
                    isWorkModuleAdmin={isWorkModuleAdmin}
                    isStrictAdminUser={isStrictAdminUser}
                    isExecutive={isExecutive}
                    canAccessModule={canAccessModule}
                    canAccessSocialInbox={canAccessSocialInbox}
                    userRole={user?.role}
                    userTenantId={user?.tenant_id}
                    updatesUnread={updatesUnread}
                    assignmentsUnread={assignmentsUnread}
                    sxAssignmentsUnread={sxAssignmentsUnread}
                    vcAssignmentsUnread={vcAssignmentsUnread}
                    socialUnread={socialUnread}
                    unifiedTasksOpen={unifiedTasksOpen}
                    {...menuPinProps}
                  />
                );
              })}
            </div>
          </>
        ) : (
          (activeMenuGroups || []).map((group) => (
              <MenuGroup
                key={`${sidebarModuleKey}-${group.id}`}
                group={group}
                moduleScope={sidebarModuleKey}
                collapsed={collapsed}
                isAdmin={isAdmin}
                isPlatformAdminUser={isPlatformAdminUser}
                isWorkModuleAdmin={isWorkModuleAdmin}
                isStrictAdminUser={isStrictAdminUser}
                isExecutive={isExecutive}
                canAccessModule={canAccessModule}
                canAccessSocialInbox={canAccessSocialInbox}
                userRole={user?.role}
                userTenantId={user?.tenant_id}
                updatesUnread={updatesUnread}
                assignmentsUnread={assignmentsUnread}
                sxAssignmentsUnread={sxAssignmentsUnread}
                vcAssignmentsUnread={vcAssignmentsUnread}
                socialUnread={socialUnread}
                unifiedTasksOpen={unifiedTasksOpen}
                {...menuPinProps}
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
          className={`w-full flex items-center gap-2 ${collapsed ? 'justify-center' : 'justify-between'} px-3 transition-colors cursor-pointer ${
            userPanelHidden
              ? 'py-2 text-[12px] font-semibold text-white bg-white/10 hover:bg-white/15'
              : 'py-1 text-[11px] font-medium text-white/50 hover:text-white hover:bg-white/5'
          }`}
        >
          {!collapsed && (
            <span className="flex items-center gap-2 min-w-0 truncate">
              {userPanelHidden && <UserCircle className="h-4 w-4 shrink-0 opacity-90" />}
              {userPanelHidden ? 'Hiện thông tin tài khoản' : 'Tài khoản'}
            </span>
          )}
          {collapsed ? (
            userPanelHidden
              ? <UserCircle className="h-4 w-4 shrink-0 opacity-90" />
              : <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          ) : (
            userPanelHidden ? <ChevronUp className="h-3.5 w-3.5 shrink-0 opacity-80" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          )}
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
                <p className="text-[13px] font-semibold text-white leading-tight break-words">{user?.full_name}</p>
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
