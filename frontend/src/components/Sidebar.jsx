import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import NotificationCenter from './NotificationCenter';
import { getInitials, avatarColor } from '../lib/utils';
import {
  LayoutDashboard, FolderKanban, CheckSquare, Users, Settings, LogOut,
  ChevronLeft, ChevronRight, ChevronDown, Inbox, UserCircle, Package, ClipboardList, 
  UserPlus, Building2, Building, Network, Layers, GitBranch, Shield, Grid3X3, X,
  Target, FileText, ShoppingCart, Receipt, Activity, BarChart3, Phone, Palette, ListChecks,
  BookOpen, FolderTree, Factory, Pin, Calendar, Megaphone
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

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
      { to: '/project-workflow', icon: GitBranch, label: 'Công việc dự án' },
    ]
  },
  {
    id: 'workspace',
    title: '2. Không gian làm việc',
    emoji: '🏢',
    items: [
      { to: '/projects', icon: FolderKanban, label: 'Dự án' },
      { to: '/tasks', icon: CheckSquare, label: 'Tất cả CV', adminOnly: true },
      { to: '/customers', icon: UserCircle, label: 'Khách hàng', adminOnly: true },
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
    title: '1. Tổng quan',
    emoji: '📊',
    items: [
      { to: '/crm/dashboard', icon: LayoutDashboard, label: 'Dashboard CRM' },
      { to: '/crm/events', icon: Calendar, label: 'Sự kiện' },
    ]
  },
  {
    id: 'crm-sales',
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
    title: '3. Dữ liệu',
    emoji: '📋',
    items: [
      { to: '/crm/customers', icon: UserCircle, label: 'Khách hàng' },
      { to: '/crm/products', icon: Package, label: 'Sản phẩm' },
      { to: '/crm/categories', icon: FolderTree, label: 'Nhóm ngành' },
      { to: '/crm/reports', icon: BarChart3, label: 'Báo cáo' },
      { to: '/crm/pipeline-settings', icon: Settings, label: 'Pipeline' },
      { to: '/crm/task-templates', icon: ListChecks, label: 'Bộ mẫu CRM' },
      { to: '/crm/auto-project-config', icon: Settings, label: 'Auto tạo dự án' },
      { to: '/guide', icon: BookOpen, label: 'Hướng dẫn sử dụng' },
      { to: '/updates', icon: Megaphone, label: 'Có gì mới?' },
    ]
  },
];

// PRODUCTION (SẢN XUẤT) menu structure
const SX_MENU_GROUPS = [
  {
    id: 'sx-overview',
    title: '1. Tổng quan',
    emoji: '🏭',
    items: [
      { to: '/sx', icon: LayoutDashboard, label: 'Dashboard SX', end: true },
    ]
  },
  {
    id: 'sx-projects',
    title: '2. Dự án',
    emoji: '📦',
    items: [
      { to: '/sx', icon: FolderKanban, label: 'Dự án SX', end: true },
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

function MenuGroup({ group, collapsed, isAdmin }) {
  const [open, setOpen] = useState(true);
  
  // Filter items based on role
  const items = group.items.filter(item => !item.adminOnly || isAdmin);
  
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
            <SideLink key={item.to} {...item} collapsed={collapsed} />
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
  const appSwitcherRef = useRef(null);
  const { user, logout, socket } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isAdmin = user?.role === 'admin' || user?.role === 'manager';
  const isCRM = location.pathname.startsWith('/crm');
  const isSX = location.pathname.startsWith('/sx');
  const activeMenuGroups = isSX ? SX_MENU_GROUPS : isCRM ? CRM_MENU_GROUPS : MENU_GROUPS;

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
              <div className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all group ${!isCRM && !isSX ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200 hover:border-blue-400 hover:bg-blue-50'}`}>
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
                  {!isCRM && !isSX && <span className="text-[10px] px-2 py-0.5 bg-blue-600 text-white rounded-full font-bold">Đang dùng</span>}
                  <button onClick={(e) => { e.stopPropagation(); pinModule('/dashboard'); }}
                    title={pinnedModule === '/dashboard' ? 'Đã ghim — bấm để bỏ ghim' : 'Ghim — đăng nhập vào thẳng module này'}
                    className={`p-1.5 rounded-lg cursor-pointer transition-all ${pinnedModule === '/dashboard' ? 'bg-amber-100 text-amber-600 hover:bg-amber-200' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'}`}>
                    <Pin className={`h-4 w-4 ${pinnedModule === '/dashboard' ? 'rotate-45' : ''}`} />
                  </button>
                </div>
              </div>
              {/* CRM */}
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
              {/* Sản xuất */}
              <div className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all group ${isSX ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-200 hover:border-orange-400 hover:bg-orange-50'}`}>
                <button onClick={() => { setShowAppSwitcher(false); navigate('/sx'); }}
                  className="flex items-center gap-4 flex-1 cursor-pointer">
                  <div className="w-12 h-12 rounded-xl bg-orange-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <Factory className="h-6 w-6 text-white" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-sm font-bold text-gray-900">Sản xuất</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Quản lý sản xuất & vận chuyển</p>
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
        {/* Active app indicator — clickable to switch */}
        <button onClick={() => {
          if (isCRM) navigate('/dashboard');
          else if (isSX) navigate('/dashboard');
          else navigate('/crm');
        }}
          className={`flex items-center gap-2 flex-1 rounded-lg px-2 py-1.5 transition-colors cursor-pointer ${
            isCRM ? 'bg-emerald-500/20 hover:bg-emerald-500/30' : isSX ? 'bg-orange-500/20 hover:bg-orange-500/30' : 'bg-white/5 hover:bg-white/10'
          }`} title={isCRM ? 'Đang ở CRM — Click để chuyển Công việc' : isSX ? 'Đang ở Sản xuất — Click để chuyển Công việc' : 'Đang ở Công việc — Click để chuyển CRM'}>
          <div className={`flex items-center justify-center w-7 h-7 rounded-md text-white text-sm ${isCRM ? 'bg-emerald-500/40' : isSX ? 'bg-orange-500/40' : 'bg-blue-500/30'}`}>
            {isCRM ? '💼' : isSX ? '🏭' : '📋'}
          </div>
          {!collapsed && (
            <div className="flex-1 text-left">
              <h1 className="text-sm font-bold text-white leading-tight">{isCRM ? 'CRM' : isSX ? 'Sản xuất' : 'Công việc'}</h1>
              <p className="text-[10px] text-white/50 leading-tight">Nhấn để chuyển → {isCRM ? 'Công việc' : isSX ? 'Công việc' : 'CRM'}</p>
            </div>
          )}
        </button>
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
          return <MenuGroup key={group.id} group={group} collapsed={collapsed} isAdmin={isAdmin} />;
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
