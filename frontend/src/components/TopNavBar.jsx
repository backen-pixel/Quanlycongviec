import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import NotificationCenter from './NotificationCenter';
import { getInitials, avatarColor } from '../lib/utils';
import {
  LayoutDashboard, FolderKanban, CheckSquare, Users, Settings, LogOut,
  ChevronDown, MessageSquare, Palette, Calculator, FileText,
  Hammer, Truck, Wrench, Heart, Inbox, UserCircle, Package, ClipboardList, 
  UserPlus, Building2, Building, Network, Layers, GitBranch, Shield
} from 'lucide-react';
import { useState } from 'react';

const MENUS = [
  {
    id: 'overview',
    label: '1. Tổng quan',
    icon: LayoutDashboard,
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
    label: '2. Không gian làm việc',
    icon: FolderKanban,
    emoji: '🏢',
    items: [
      { to: '/projects', icon: FolderKanban, label: 'Dự án' },
      { to: '/tasks', icon: CheckSquare, label: 'Tất cả CV' },
      { to: '/customers', icon: UserCircle, label: 'Khách hàng' },
      { to: '/products', icon: Package, label: 'Sản phẩm' },
      { to: '/workflow-hub', icon: GitBranch, label: 'Quản lý quy trình' },
    ]
  },
  {
    id: 'system',
    label: '3. Hệ thống',
    icon: Network,
    emoji: '🏗️',
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
    label: '4. Cài đặt',
    icon: Settings,
    emoji: '⚙️',
    items: [
      { to: '/permissions', icon: Shield, label: 'Phân quyền' },
      { to: '/workflow-settings', icon: Settings, label: 'Quy trình & KH' },
      { to: '/templates', icon: ClipboardList, label: 'Dự án mẫu' },
      { to: '/stage-groups', icon: FolderKanban, label: 'Nhóm quy trình' },
      { to: '/approval-rules', icon: Settings, label: 'Quy tắc duyệt' },
    ]
  }
];

function DropdownMenu({ menu, isAdmin }) {
  const [open, setOpen] = useState(false);
  
  // Filter items based on role
  const items = menu.items.filter(item => {
    if (!isAdmin) {
      // Non-admin cannot see certain routes
      const restrictedRoutes = ['/tasks', '/customers', '/products', '/permissions', '/workflow-settings', '/templates', '/stage-groups', '/approval-rules', '/ecosystem', '/companies', '/departments', '/teams', '/users', '/ecosystem-levels'];
      return !restrictedRoutes.includes(item.to);
    }
    return true;
  });

  if (items.length === 0) return null;

  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
        <span className="text-base">{menu.emoji}</span>
        <span>{menu.label}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      
      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-white rounded-xl shadow-lg border z-50 py-2">
          {items.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-600 font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TopNavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  const doLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="bg-white border-b sticky top-0 z-40">
      <div className="max-w-[1920px] mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-white text-lg">
              🏠
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-900 leading-tight">TuBep Pro</h1>
              <p className="text-[9px] text-gray-500 leading-tight">Quản lý công việc</p>
            </div>
          </div>

          {/* Menu Groups */}
          <div className="flex items-center gap-1">
            {MENUS.map(menu => (
              <DropdownMenu key={menu.id} menu={menu} isAdmin={isAdmin} />
            ))}
          </div>

          {/* Right section */}
          <div className="flex items-center gap-3">
            <NotificationCenter socket={null} />
            
            {/* User menu */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
              {user?.avatar ? (
                <img src={user.avatar} alt="" className="w-7 h-7 rounded-full object-cover border border-gray-200 shrink-0" />
              ) : (
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: avatarColor(user?.full_name || 'User') }}>
                  {getInitials(user?.full_name || 'U')}
                </div>
              )}
              <span className="text-sm font-medium text-gray-700">{user?.full_name}</span>
            </div>

            <button onClick={doLogout}
              className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Đăng xuất">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
