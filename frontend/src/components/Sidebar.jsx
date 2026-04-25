import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import api from '../lib/api';
import NotificationCenter from './NotificationCenter';
import { getInitials, avatarColor } from '../lib/utils';
import {
  LayoutDashboard, FolderKanban, CheckSquare, Users, Settings, LogOut,
  ChevronLeft, ChevronRight, ChevronDown, Inbox, UserCircle, Package, ClipboardList, 
  UserPlus, Building2, Building, Network, Layers, GitBranch, Shield, Grid3X3, X,
  Target, FileText, ShoppingCart, Receipt, Activity, BarChart3, Phone, Palette, ListChecks, Mic,
  BookOpen, FolderTree, Factory, Pin, Calendar, Megaphone, MessageCircle, ArrowRightLeft, ClipboardCheck, FileCheck, Key, Puzzle,
} from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';

// Reorganized menu structure - 4 groups
const MENU_GROUPS = [
  {
    id: 'overview',
    title: '1. Tổng quan',
    emoji: '📊',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/dashboard/divisions', icon: BarChart3, label: 'Dashboard Khối' },
      { to: '/my-tasks', icon: Inbox, label: 'Việc của tôi' },
      { to: '/personal-tasks', icon: UserPlus, label: 'NV cá nhân' },
      { to: '/tools/voice-recordings', icon: Mic, label: 'Cuộc gọi & ghi âm' },
      { to: '/project-workflow', icon: GitBranch, label: 'Công việc dự án' },
    ]
  },
  {
    id: 'workspace',
    title: '2. Không gian làm việc',
    emoji: '🏢',
    items: [
      { to: '/projects', icon: FolderKanban, label: 'Dự án', moduleKey: 'projects' },
      { to: '/tasks', icon: CheckSquare, label: 'Tất cả CV', adminOnly: true, moduleKey: 'tasks' },
      { to: '/customers', icon: UserCircle, label: 'Khách hàng', adminOnly: true, moduleKey: 'customers' },
      { to: '/products', icon: Package, label: 'Sản phẩm', adminOnly: true },
      { to: '/workflow-hub', icon: GitBranch, label: 'Quản lý quy trình', adminOnly: true },
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
      { to: '/ecosystem-levels', icon: Layers, label: 'Cấp bậc HST' },
    ]
  },
  {
    id: 'settings',
    title: '4. Cài đặt',
    emoji: '⚙️',
    adminOnly: true,
    items: [
      { to: '/permissions', icon: Shield, label: 'Phân quyền' },
      { to: '/workflow-settings', icon: Settings, label: 'Quy trình & KH' },
      { to: '/approval-rules', icon: Settings, label: 'Quy tắc duyệt' },
      { to: '/settings/pdf', icon: Settings, label: 'Thông tin PDF' },
      { to: '/settings/theme', icon: Settings, label: 'Giao diện & Hình nền' },
      { to: '/settings/misa', icon: FileCheck, label: 'MISA meInvoice' },
      { to: '/settings/api-keys', icon: Key, label: 'API Key tích hợp' },
      { to: '/settings/request-monitor', icon: Activity, label: 'Theo dõi Request' },
      { to: '/guide', icon: BookOpen, label: 'Hướng dẫn sử dụng' },
      { to: '/updates', icon: Megaphone, label: 'Có gì mới?' },
      // { to: '/templates', icon: ClipboardList, label: 'Dự án mẫu' },
      // { to: '/stage-groups', icon: FolderKanban, label: 'Nhóm quy trình' },
    ]
  }
];

// CRM menu structure
const CRM_MENU_GROUPS = [
  {
    id: 'crm-overview',
    moduleKey: 'crm',
    title: '1. Tổng quan',
    emoji: '📊',
    items: [
      { to: '/crm/dashboard', icon: LayoutDashboard, label: 'Dashboard CRM' },
      { to: '/crm/lead-journey', icon: ArrowRightLeft, label: 'Hành trình Lead' },
      { to: '/crm/events', icon: Calendar, label: 'Sự kiện' },
      { to: '/crm/messenger', icon: MessageCircle, label: 'Nhóm chat' },
      { to: '/tools/voice-recordings', icon: Mic, label: 'Ghi âm' },
    ]
  },
  {
    id: 'crm-sales',
    moduleKey: 'crm',
    title: '2. Bán hàng',
    emoji: '💰',
    items: [
      { to: '/crm/pipeline', icon: Target, label: 'Pipeline & Leads', end: true },
      { to: '/crm/tasks', icon: CheckSquare, label: 'Công việc CRM' },
      { to: '/crm/quotations', icon: FileText, label: 'Báo giá' },
      { to: '/crm/orders', icon: ShoppingCart, label: 'Đơn hàng' },
      { to: '/crm/invoices', icon: Receipt, label: 'Hóa đơn' },
    ]
  },
  {
    id: 'crm-data',
    moduleKey: 'crm',
    title: '3. Dữ liệu',
    emoji: '📋',
    items: [
      { to: '/crm/customers', icon: UserCircle, label: 'Khách hàng' },
      { to: '/crm/products', icon: Package, label: 'Sản phẩm' },
      { to: '/crm/categories', icon: FolderTree, label: 'Nhóm ngành' },
      { to: '/crm/reports', icon: BarChart3, label: 'Báo cáo' },
      { to: '/crm/facebook', icon: MessageCircle, label: 'Facebook' },
      { to: '/crm/pipeline-settings', icon: Settings, label: 'Pipeline' },
      { to: '/crm/task-templates', icon: ListChecks, label: 'Bộ mẫu CRM' },
      { to: '/crm/auto-project-config', icon: Settings, label: 'Auto tạo dự án' },
      { to: '/settings/misa', icon: FileCheck, label: 'MISA meInvoice' },
      { to: '/settings/api-keys', icon: Key, label: 'API Key tích hợp' },
      { to: '/guide', icon: BookOpen, label: 'Hướng dẫn sử dụng' },
      { to: '/updates', icon: Megaphone, label: 'Có gì mới?' },
    ]
  },
];

// PRODUCTION (SẢN XUẤT) menu structure
const SX_MENU_GROUPS = [
  {
    id: 'sx-overview',
    moduleKey: 'production',
    title: '1. Tổng quan',
    emoji: '🏭',
    items: [
      { to: '/sx/dashboard', icon: LayoutDashboard, label: 'Dashboard xưởng', end: true },
    ]
  },
  {
    id: 'sx-projects',
    moduleKey: 'production',
    title: '2. Điều hành xưởng',
    emoji: '📦',
    items: [
      { to: '/sx/dashboard', icon: FolderKanban, label: 'Deal vào xưởng' },
      { to: '/sx/pipeline-settings', icon: Settings, label: 'Pipeline xưởng' },
      { to: '/sx/task-templates', icon: ListChecks, label: 'Bộ mẫu nhiệm vụ xưởng' },
      { to: '/vc/teams', icon: Users, label: 'Quản lý Đội VC' },
    ]
  },
];

// LOGISTICS (VẬN CHUYỂN & LẮP ĐẶT) menu structure
const VC_MENU_GROUPS = [
  {
    id: 'vc-overview',
    moduleKey: 'logistics',
    title: '1. Tổng quan',
    emoji: '🚚',
    items: [
      { to: '/vc/dashboard', icon: LayoutDashboard, label: 'Dashboard VC', end: true },
    ]
  },
  {
    id: 'vc-projects',
    moduleKey: 'logistics',
    title: '2. Điều hành VC',
    emoji: '📦',
    items: [
      { to: '/vc/dashboard', icon: FolderKanban, label: 'Dự án vận chuyển' },
      { to: '/vc/teams', icon: Users, label: 'Quản lý Đội nhóm' },
      { to: '/vc/pipeline-settings', icon: Settings, label: 'Pipeline VC' },
    ]
  },
];

function SideLink({ to, icon: Icon, label, collapsed, end }) {
  return (
    <NavLink
      to={to}
      end={to === '/' || end}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all ${
          isActive
            ? 'bg-[var(--color-sidebar-active)] text-[var(--color-sidebar-text-active)]'
            : 'text-[var(--color-sidebar-text)] hover:bg-[var(--color-sidebar-hover)] hover:text-white'
        }`
      }
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {!collapsed && <span>{label}</span>}
    </NavLink>
  );
}

function MenuGroup({ group, collapsed, isAdmin, canAccessModule }) {
  const [open, setOpen] = useState(true);

  if (group.moduleKey && canAccessModule && !canAccessModule(group.moduleKey)) return null;

  // Filter items based on role + ecosystem module scope
  const items = group.items.filter((item) => {
    if (item.adminOnly && !isAdmin) return false;
    if (item.moduleKey && canAccessModule && !canAccessModule(item.moduleKey)) return false;
    return true;
  });
  
  // Hide entire group if no items visible
  if (items.length === 0) return null;

  return (
    <div className="mb-4">
      {!collapsed ? (
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between px-4 py-1 text-[10px] font-semibold text-[var(--color-sidebar-text)] uppercase tracking-widest opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <span className="text-sm">{group.emoji}</span>
            <span>{group.title}</span>
          </span>
          <ChevronDown className={`h-3 w-3 transition-transform ${open ? '' : 'rotate-180'}`} />
        </button>
      ) : (
        <div className="px-2 py-1 text-center text-sm opacity-60">{group.emoji}</div>
      )}
      
      {open && (
        <nav className="space-y-0.5 px-2 mt-1">
          {items.map(item => (
            <SideLink key={`${group.id}-${item.to}-${item.label}`} {...item} collapsed={collapsed} />
          ))}
        </nav>
      )}
    </div>
  );
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [showAppSwitcher, setShowAppSwitcher] = useState(false);
  const [pinnedModule, setPinnedModule] = useState(() => localStorage.getItem('pinned_module') || '/crm');
  const [moduleAccess, setModuleAccess] = useState(null);
  const appSwitcherRef = useRef(null);
  const { user, logout, socket } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!user) return;
    api.get('/ecosystem/my-module-access')
      .then((r) => setModuleAccess(r.data))
      .catch(() => setModuleAccess({ allowAll: true }));
  }, [user]);

  const canAccessModule = useCallback((key) => {
    if (!key) return true;
    if (!moduleAccess) return true;
    if (moduleAccess.allowAll) return true;
    return moduleAccess.modules?.[key] !== false;
  }, [moduleAccess]);

  // Auto-collapse sidebar on quotation form pages (need more screen space)
  useEffect(() => {
    const isQuotationForm = /\/crm\/quotations\/(new|[0-9a-f-]{36})/.test(location.pathname);
    if (isQuotationForm && !collapsed) setCollapsed(true);
  }, [location.pathname]);

  const isAdmin = user?.role === 'admin' || user?.role === 'manager';
  /** Ghi âm dùng route /tools/… nhưng vẫn dùng menu CRM khi đang xem trang đó */
  const isCRM =
    location.pathname.startsWith('/crm') || location.pathname.startsWith('/tools/voice-recordings');
  const isSX = location.pathname.startsWith('/sx');
  const isVC = location.pathname.startsWith('/vc');
  const activeMenuGroups = isVC ? VC_MENU_GROUPS : isSX ? SX_MENU_GROUPS : isCRM ? CRM_MENU_GROUPS : MENU_GROUPS;

  const pinModule = (path) => {
    localStorage.setItem('pinned_module', path);
    setPinnedModule(path);
  };

  // Close app switcher on outside click
  useEffect(() => {
    const handler = (e) => {
      if (appSwitcherRef.current && !appSwitcherRef.current.contains(e.target)) setShowAppSwitcher(false);
    };
    if (showAppSwitcher) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAppSwitcher]);

  const doLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      {/* App Switcher Panel */}
      {showAppSwitcher && (
        <div className="fixed inset-0 z-50 flex">
          <div ref={appSwitcherRef} className="w-[300px] bg-white shadow-2xl border-r border-gray-200 flex flex-col animate-slide-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Ứng dụng</h2>
              <button onClick={() => setShowAppSwitcher(false)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 p-5 space-y-3">
              {/* Công việc */}
              <div className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all group ${!isCRM && !isSX && !isVC ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200 hover:border-blue-400 hover:bg-blue-50'}`}>
                <button onClick={() => { setShowAppSwitcher(false); navigate('/dashboard'); }}
                  className="flex items-center gap-4 flex-1 cursor-pointer">
                  <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <CheckSquare className="h-6 w-6 text-white" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-sm font-bold text-gray-900">Công việc</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Quản lý dự án & nhiệm vụ</p>
                  </div>
                </button>
                <div className="flex flex-col items-center gap-1 ml-auto">
                  {!isCRM && !isSX && !isVC && <span className="text-[10px] px-2 py-0.5 bg-blue-600 text-white rounded-full font-bold">Đang dùng</span>}
                  <button onClick={(e) => { e.stopPropagation(); pinModule('/dashboard'); }}
                    title={pinnedModule === '/dashboard' ? 'Đã ghim — bấm để bỏ ghim' : 'Ghim — đăng nhập vào thẳng module này'}
                    className={`p-1.5 rounded-lg cursor-pointer transition-all ${pinnedModule === '/dashboard' ? 'bg-amber-100 text-amber-600 hover:bg-amber-200' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'}`}>
                    <Pin className={`h-4 w-4 ${pinnedModule === '/dashboard' ? 'rotate-45' : ''}`} />
                  </button>
                </div>
              </div>
              {/* CRM */}
              {canAccessModule('crm') && (
              <div className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all group ${isCRM ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200 hover:border-emerald-400 hover:bg-emerald-50'}`}>
                <button onClick={() => { setShowAppSwitcher(false); navigate('/crm'); }}
                  className="flex items-center gap-4 flex-1 cursor-pointer">
                  <div className="w-12 h-12 rounded-xl bg-emerald-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <UserCircle className="h-6 w-6 text-white" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-sm font-bold text-gray-900">CRM</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Quản lý khách hàng & bán hàng</p>
                  </div>
                </button>
                <div className="flex flex-col items-center gap-1 ml-auto">
                  {isCRM && <span className="text-[10px] px-2 py-0.5 bg-emerald-600 text-white rounded-full font-bold">Đang dùng</span>}
                  <button onClick={(e) => { e.stopPropagation(); pinModule('/crm'); }}
                    title={pinnedModule === '/crm' ? 'Đã ghim — bấm để bỏ ghim' : 'Ghim — đăng nhập vào thẳng module này'}
                    className={`p-1.5 rounded-lg cursor-pointer transition-all ${pinnedModule === '/crm' ? 'bg-amber-100 text-amber-600 hover:bg-amber-200' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'}`}>
                    <Pin className={`h-4 w-4 ${pinnedModule === '/crm' ? 'rotate-45' : ''}`} />
                  </button>
                </div>
              </div>
              )}
              {/* Sản xuất */}
              {canAccessModule('production') && (
              <div className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all group ${isSX ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-200 hover:border-orange-400 hover:bg-orange-50'}`}>
                <button onClick={() => { setShowAppSwitcher(false); navigate('/sx'); }}
                  className="flex items-center gap-4 flex-1 cursor-pointer">
                  <div className="w-12 h-12 rounded-xl bg-orange-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <Factory className="h-6 w-6 text-white" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-sm font-bold text-gray-900">Xưởng SX</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Quản lý deal, pipeline và duyệt sản xuất</p>
                  </div>
                </button>
                <div className="flex flex-col items-center gap-1 ml-auto">
                  {isSX && <span className="text-[10px] px-2 py-0.5 bg-orange-600 text-white rounded-full font-bold">Đang dùng</span>}
                  <button onClick={(e) => { e.stopPropagation(); pinModule('/sx'); }}
                    title={pinnedModule === '/sx' ? 'Đã ghim — bấm để bỏ ghim' : 'Ghim — đăng nhập vào thẳng module này'}
                    className={`p-1.5 rounded-lg cursor-pointer transition-all ${pinnedModule === '/sx' ? 'bg-amber-100 text-amber-600 hover:bg-amber-200' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'}`}>
                    <Pin className={`h-4 w-4 ${pinnedModule === '/sx' ? 'rotate-45' : ''}`} />
                  </button>
                </div>
              </div>
              )}
              {/* Vận chuyển & Lắp đặt */}
              {canAccessModule('logistics') && (
              <div className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all group ${isVC ? 'bg-amber-50 border-amber-300' : 'bg-gray-50 border-gray-200 hover:border-amber-400 hover:bg-amber-50'}`}>
                <button onClick={() => { setShowAppSwitcher(false); navigate('/vc'); }}
                  className="flex items-center gap-4 flex-1 cursor-pointer">
                  <div className="w-12 h-12 rounded-xl bg-amber-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <span className="text-2xl">🚚</span>
                  </div>
                  <div className="text-left">
                    <h3 className="text-sm font-bold text-gray-900">Vận chuyển & Lắp đặt</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Quản lý giao hàng, lắp đặt, bảo hành</p>
                  </div>
                </button>
                <div className="flex flex-col items-center gap-1 ml-auto">
                  {isVC && <span className="text-[10px] px-2 py-0.5 bg-amber-600 text-white rounded-full font-bold">Đang dùng</span>}
                  <button onClick={(e) => { e.stopPropagation(); pinModule('/vc'); }}
                    title={pinnedModule === '/vc' ? 'Đã ghim — bấm để bỏ ghim' : 'Ghim — đăng nhập vào thẳng module này'}
                    className={`p-1.5 rounded-lg cursor-pointer transition-all ${pinnedModule === '/vc' ? 'bg-amber-100 text-amber-600 hover:bg-amber-200' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'}`}>
                    <Pin className={`h-4 w-4 ${pinnedModule === '/vc' ? 'rotate-45' : ''}`} />
                  </button>
                </div>
              </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-100">
              <p className="text-[10px] text-gray-400 text-center">TuBep Pro © 2026</p>
            </div>
          </div>
          {/* Overlay */}
          <div className="flex-1 bg-black/30" onClick={() => setShowAppSwitcher(false)} />
        </div>
      )}

      <aside
      className={`flex flex-col bg-[var(--color-sidebar)] transition-all duration-200 relative ${
        collapsed ? 'w-[60px]' : 'w-[240px]'
      }`}
    >
      {/* App Switcher Button + Logo */}
      <div className="flex items-center gap-2 px-3 h-14 border-b border-white/10 shrink-0">
        <button onClick={() => setShowAppSwitcher(!showAppSwitcher)}
          className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors cursor-pointer ${showAppSwitcher ? 'bg-white/20 ring-1 ring-white/30' : 'hover:bg-white/10'}`} title="Chuyển ứng dụng">
          <Grid3X3 className="h-5 w-5 text-white" />
        </button>
        {/* Active app indicator — click cycles through 4 modules */}
        {(() => {
          const modList = [
            { key: 'work', mod: null, label: 'Công việc', emoji: '📋', path: '/dashboard', color: 'bg-blue-500/20 hover:bg-blue-500/30', dot: 'bg-blue-500/30' },
            { key: 'crm', mod: 'crm', label: 'CRM', emoji: '💼', path: '/crm', color: 'bg-emerald-500/20 hover:bg-emerald-500/30', dot: 'bg-emerald-500/40' },
            { key: 'sx', mod: 'production', label: 'Xưởng SX', emoji: '🏭', path: '/sx', color: 'bg-orange-500/20 hover:bg-orange-500/30', dot: 'bg-orange-500/40' },
            { key: 'vc', mod: 'logistics', label: 'Vận chuyển', emoji: '🚚', path: '/vc', color: 'bg-amber-500/20 hover:bg-amber-500/30', dot: 'bg-amber-500/40' },
          ].filter((m) => !m.mod || canAccessModule(m.mod));
          if (!modList.length) return null;
          const activeKey = isVC ? 'vc' : isSX ? 'sx' : isCRM ? 'crm' : 'work';
          let curIdx = modList.findIndex((m) => m.key === activeKey);
          if (curIdx < 0) curIdx = 0;
          const cur = modList[curIdx];
          const next = modList[(curIdx + 1) % modList.length];
          return (
            <button
              onClick={() => navigate(next.path)}
              title={`Chuyển sang ${next.label}`}
              className={`flex items-center gap-2 flex-1 rounded-lg px-2 py-1.5 transition-colors cursor-pointer ${cur.color}`}
            >
              <div className={`flex items-center justify-center w-7 h-7 rounded-md text-white text-sm shrink-0 ${cur.dot}`}>
                {cur.emoji}
              </div>
              {!collapsed && (
                <div className="flex-1 text-left min-w-0">
                  <h1 className="text-sm font-bold text-white leading-tight truncate">{cur.label}</h1>
                  <p className="text-[10px] text-white/50 leading-tight truncate">→ {next.label}</p>
                </div>
              )}
            </button>
          );
        })()}
      </div>

      {/* Notification bell */}
      <div className="px-2 pt-3 pb-1">
        <NotificationCenter socket={socket} />
      </div>

      {/* Menu Groups */}
      <div className="flex-1 overflow-y-auto py-2">
        {activeMenuGroups.map(group => {
          // Hide admin-only groups for non-admin
          if (group.adminOnly && !isAdmin) return null;
          return <MenuGroup key={group.id} group={group} collapsed={collapsed} isAdmin={isAdmin} canAccessModule={canAccessModule} />;
        })}
      </div>

      {/* User section */}
      <div className="border-t border-white/10 p-3 space-y-2">
        {!collapsed ? (
          <>
            <div className="flex items-center gap-3 px-2 py-1">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                style={{ backgroundColor: avatarColor(user?.full_name || 'User') }}>
                {getInitials(user?.full_name || 'U')}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white truncate">{user?.full_name}</p>
                <p className="text-[10px] text-[var(--color-sidebar-text)] truncate">{user?.email}</p>
              </div>
            </div>
            <button
              onClick={doLogout}
              className="w-full flex items-center gap-3 px-3 py-2 text-[13px] font-medium text-[var(--color-sidebar-text)] hover:bg-[var(--color-sidebar-hover)] hover:text-white rounded-lg transition-all cursor-pointer"
            >
              <LogOut className="h-[18px] w-[18px]" />
              <span>Đăng xuất</span>
            </button>
            <NavLink to="/settings/theme"
              className="w-full flex items-center gap-3 px-3 py-2 text-[13px] font-medium text-[var(--color-sidebar-text)] hover:bg-[var(--color-sidebar-hover)] hover:text-white rounded-lg transition-all"
            >
              <Palette className="h-[18px] w-[18px]" />
              <span>Giao diện</span>
            </NavLink>
          </>
        ) : (
          <>
          <button onClick={doLogout} className="w-full p-2 text-[var(--color-sidebar-text)] hover:text-white cursor-pointer" title="Đăng xuất">
            <LogOut className="h-5 w-5 mx-auto" />
          </button>
          <NavLink to="/settings/theme" className="w-full p-2 text-[var(--color-sidebar-text)] hover:text-white cursor-pointer block text-center" title="Giao diện">
            <Palette className="h-5 w-5 mx-auto" />
          </NavLink>
          </>
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
