import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import NotificationCenter from './NotificationCenter';
import { getInitials, avatarColor, ROLE_STAGE_MAP, ROLE_LABELS } from '../lib/utils';
import api from '../lib/api';
import {
  LayoutDashboard, FolderKanban, CheckSquare, Users, Settings, LogOut,
  ChevronLeft, ChevronRight, ChevronDown, MessageSquare, Palette, Calculator, FileText,
  Hammer, Truck, Wrench, Heart, Inbox, UserCircle, Package, ClipboardList, UserPlus, Building2, Building, MessageCircle, Network, Layers, GitBranch
} from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';

const ICON_MAP = {
  MessageSquare, Palette, Calculator, FileText, Hammer, Truck, Wrench, Heart,
  ClipboardList, Package, Settings, Users, Building, Inbox, FolderKanban, CheckSquare,
};

const nav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/my-tasks', icon: Inbox, label: 'Việc của tôi' },
  { to: '/personal-tasks', icon: UserPlus, label: 'NV cá nhân' },
  { to: '/departments', icon: MessageCircle, label: 'Trao đổi PB' },
  { to: '/projects', icon: FolderKanban, label: 'Dự án' },
  { to: '/tasks', icon: CheckSquare, label: 'Tất cả CV' },
  { to: '/customers', icon: UserCircle, label: 'Khách hàng' },
  { to: '/products', icon: Package, label: 'Sản phẩm' },
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
  { to: '/ecosystem', icon: Network, label: 'Hệ sinh thái' },
  { to: '/workflow-flows', icon: GitBranch, label: 'Quản lý luồng' },
  { to: '/company-processes', icon: Layers, label: 'QT nội bộ Cty' },
  { to: '/companies', icon: Building2, label: 'Công ty' },
  { to: '/teams', icon: Users, label: 'Team' },
  { to: '/users', icon: Users, label: 'Nhân viên' },
];

const adminSettings = [
  { to: '/workflow-settings', icon: Settings, label: 'Quy trình & KH' },
  { to: '/templates', icon: ClipboardList, label: 'Dự án mẫu' },
  { to: '/stage-groups', icon: FolderKanban, label: 'Nhóm quy trình' },
  { to: '/ecosystem-levels', icon: Layers, label: 'Cấp bậc HST' },
  { to: '/departments', icon: Building, label: 'Phòng ban' },
  { to: '/approval-rules', icon: Settings, label: 'Quy tắc duyệt' },
];

function SideLink({ to, icon: Icon, emoji, label, dot, collapsed }) {
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
      {dot ? (
        <span className="flex items-center justify-center w-5 h-5">
          {emoji ? <span className="text-sm">{emoji}</span> : <span className="w-2 h-2 rounded-full" style={{ backgroundColor: dot }} />}
        </span>
      ) : emoji ? (
        <span className="flex items-center justify-center w-5 h-5 text-sm">{emoji}</span>
      ) : Icon ? (
        <Icon className="h-[18px] w-[18px] shrink-0" />
      ) : null}
      {!collapsed && <span>{label}</span>}
    </NavLink>
  );
}

function Section({ title, items, collapsed }) {
  return (
    <div className="mb-4">
      {!collapsed && (
        <p className="px-4 py-1 text-[10px] font-semibold text-[var(--color-sidebar-text)] uppercase tracking-widest opacity-60">
          {title}
        </p>
      )}
      <nav className="space-y-0.5 px-2">
        {items.map(i => <SideLink key={i.to} {...i} collapsed={collapsed} />)}
      </nav>
    </div>
  );
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showWorkflow, setShowWorkflow] = useState(false);
  const { user, logout, socket } = useAuth();
  const navigate = useNavigate();

  const isAdmin = user?.role === 'admin' || user?.role === 'manager';
  const allowedSlugs = ROLE_STAGE_MAP[user?.role] || [];

  // Load stages from API dynamically
  const [dbStages, setDbStages] = useState([]);
  useEffect(() => {
    api.get('/users/stages').then(r => {
      const stages = r.data.stages || [];
      if (stages.length > 0) setDbStages(stages);
    }).catch(() => {});
  }, []);

  // Build workflow menu from DB stages (fallback to hardcoded)
  const workflow = useMemo(() => {
    if (dbStages.length > 0) {
      return dbStages.map(s => {
        const isEmoji = s.icon && s.icon.charCodeAt(0) > 127;
        return {
          to: `/stage/${s.slug}`,
          icon: isEmoji ? null : (ICON_MAP[s.icon] || FolderKanban),
          emoji: isEmoji ? s.icon : null,
          label: s.name,
          dot: s.color || '#3B82F6',
          slug: s.slug,
        };
      });
    }
    return FALLBACK_WORKFLOW;
  }, [dbStages]);

  // Filter tools — only admin/manager see full tools
  const tools = useMemo(() => {
    if (isAdmin) return adminTools;
    return [];
  }, [user?.role]);

  const settings = useMemo(() => {
    if (isAdmin) return adminSettings;
    return [];
  }, [user?.role]);

  // Filter nav — non-admin don't see "Tất cả CV", "Khách hàng", "Sản phẩm"
  const filteredNav = useMemo(() => {
    if (isAdmin) return nav;
    return nav.filter(n => !['/tasks', '/customers', '/products'].includes(n.to));
  }, [user?.role]);

  const doLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside
      className={`flex flex-col bg-[var(--color-sidebar)] transition-all duration-200 ${
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
        <NotificationCenter socket={socket} />
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto py-2">
        <Section title="Tổng quan" items={filteredNav} collapsed={collapsed} />
        {/* Quy trình — collapsible */}
        <div className="mb-4">
          {!collapsed && (
            <button onClick={() => setShowWorkflow(!showWorkflow)}
              className="w-full flex items-center justify-between px-4 py-1 text-[10px] font-semibold text-[var(--color-sidebar-text)] uppercase tracking-widest opacity-60 hover:opacity-100 cursor-pointer">
              <span>Quy trình ({workflow.length})</span>
              {showWorkflow ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          )}
          {(showWorkflow || collapsed) && (
            <nav className="space-y-0.5 px-2">
              {workflow.map(i => <SideLink key={i.to} {...i} collapsed={collapsed} />)}
            </nav>
          )}
        </div>
        {tools.length > 0 && <Section title="Hệ thống" items={tools} collapsed={collapsed} />}
        {settings.length > 0 && (
          <div className="mb-4">
            {!collapsed && (
              <button onClick={() => setShowSettings(!showSettings)}
                className="w-full flex items-center justify-between px-4 py-1 text-[10px] font-semibold text-[var(--color-sidebar-text)] uppercase tracking-widest opacity-60 hover:opacity-100 cursor-pointer">
                <span>Cài đặt</span>
                {showSettings ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
            )}
            {(showSettings || collapsed) && (
              <nav className="space-y-0.5 px-2">
                {settings.map(i => <SideLink key={i.to} {...i} collapsed={collapsed} />)}
              </nav>
            )}
          </div>
        )}
      </div>

      {/* User + collapse */}
      <div className="border-t border-white/10 p-2">
        {!collapsed && user && (
          <div className="flex items-center gap-2 px-2 py-2 mb-1 rounded-lg hover:bg-[var(--color-sidebar-hover)] transition-colors">
            <div
              className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
              style={{ backgroundColor: avatarColor(user.fullName) }}
            >
              {getInitials(user.fullName)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">{user.fullName}</p>
              <p className="text-[10px] text-[var(--color-sidebar-text)] truncate">{ROLE_LABELS[user.role] || user.role}</p>
            </div>
            <button
              onClick={doLogout}
              className="text-[var(--color-sidebar-text)] hover:text-red-400 transition-colors cursor-pointer"
              title="Đăng xuất"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
        {collapsed && user && (
          <button
            onClick={doLogout}
            className="flex items-center justify-center w-full py-2 text-[var(--color-sidebar-text)] hover:text-red-400 transition-colors cursor-pointer"
            title="Đăng xuất"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center w-full h-8 rounded-lg text-[var(--color-sidebar-text)] hover:bg-[var(--color-sidebar-hover)] hover:text-white transition-colors cursor-pointer"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );
}
