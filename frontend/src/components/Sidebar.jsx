import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import NotificationCenter from './NotificationCenter';
import { getInitials, avatarColor } from '../lib/utils';
import {
  LayoutDashboard, FolderKanban, CheckSquare, Users, Settings, LogOut,
  ChevronLeft, ChevronRight, ChevronDown, Inbox, UserCircle, Package, ClipboardList, 
  UserPlus, Building2, Building, Network, Layers, GitBranch, Shield
} from 'lucide-react';
import { useState } from 'react';

// Reorganized menu structure - 4 groups
const MENU_GROUPS = [
  {
    id: 'overview',
    title: '1. Tổng quan',
    emoji: '📊',
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
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
      // Hidden from sidebar but routes still work
      // { to: '/templates', icon: ClipboardList, label: 'Dự án mẫu' },
      // { to: '/stage-groups', icon: FolderKanban, label: 'Nhóm quy trình' },
      { to: '/approval-rules', icon: Settings, label: 'Quy tắc duyệt' },
    ]
  }
];

<<<<<<< Updated upstream
function SideLink({ to, icon: Icon, label, collapsed }) {
=======
// Workspace section (between nav and tools)
const workspace = [
  { to: '/project-workflow', icon: GitBranch, label: 'Công việc dự án' },
];

// Fallback hardcoded stages (used if API fails)
const FALLBACK_WORKFLOW = [
  { to: '/stage/consulting', icon: MessageSquare, label: 'Tư vấn', dot: '#8B5CF6', slug: 'consulting' },
  { to: '/stage/design', icon: Palette, label: 'Thiết kế', dot: '#EC4899', slug: 'design' },
  { to: '/stage/quotation', icon: Calculator, label: 'Báo giá', dot: '#F59E0B', slug: 'quotation' },
  { to: '/stage/contract', icon: FileText, label: 'Hợp đồng', dot: '#10B981', slug: 'contract' },
  { to: '/stage/production', icon: Hammer, label: 'Sản xuất', dot: '#F97316', slug: 'production' },
  { to: '/stage/shipping', icon: Truck, label: 'Vận chuyển', dot: '#06B6D4', slug: 'shipping' },
  { to: '/stage/installation', icon: Wrench, label: 'Lắp đặt', dot: '#3B82F6', slug: 'installation' },
  { to: '/stage/customer-care', icon: Heart, label: 'CSKH', dot: '#EF4444', slug: 'customer-care' },
];

const adminTools = [
  { to: '/ecosystem', icon: Network, label: 'Cấu trúc công ty' },
  { to: '/workflow-hub', icon: GitBranch, label: 'Quản lý quy trình' },
  { to: '/companies', icon: Building2, label: 'Công ty' },
  { to: '/teams', icon: Users, label: 'Team' },
  { to: '/users', icon: Users, label: 'Nhân viên' },
];

const adminSettings = [
  { to: '/permissions', icon: Shield, label: 'Phân quyền' },
  { to: '/workflow-settings', icon: Settings, label: 'Quy trình & KH' },
  { to: '/ecosystem-levels', icon: Layers, label: 'Cấp bậc HST' },
  { to: '/departments', icon: Building, label: 'Phòng ban' },
  { to: '/approval-rules', icon: Settings, label: 'Quy tắc duyệt' },
];

function SideLink({ to, icon: Icon, emoji, label, dot, collapsed }) {
>>>>>>> Stashed changes
  return (
    <NavLink
      to={to}
      end={to === '/'}
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
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  const doLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside
      className={`flex flex-col bg-[var(--color-sidebar)] transition-all duration-200 relative ${
        collapsed ? 'w-[60px]' : 'w-[240px]'
      }`}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-white/10 shrink-0">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/10 text-white text-lg">
          🏠
        </div>
        {!collapsed && (
          <div className="flex-1">
            <h1 className="text-sm font-bold text-white leading-tight">TuBep Pro</h1>
            <p className="text-[10px] text-[var(--color-sidebar-text)] leading-tight">Quản lý công việc</p>
          </div>
        )}
      </div>

      {/* Notification bell */}
      <div className="px-2 pt-3 pb-1">
        <NotificationCenter />
      </div>

      {/* Menu Groups */}
      <div className="flex-1 overflow-y-auto py-2">
        {MENU_GROUPS.map(group => {
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
          </>
        ) : (
          <button onClick={doLogout} className="w-full p-2 text-[var(--color-sidebar-text)] hover:text-white cursor-pointer" title="Đăng xuất">
            <LogOut className="h-5 w-5 mx-auto" />
          </button>
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
  );
}
