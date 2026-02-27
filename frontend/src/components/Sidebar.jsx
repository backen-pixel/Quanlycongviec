import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { LayoutDashboard, FolderKanban, CheckSquare, Users, Settings, LogOut, ChevronLeft, ChevronRight, MessageSquare, Palette, Calculator, FileText, Hammer, Truck, Wrench, Heart } from 'lucide-react';
import { useState } from 'react';

const nav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/projects', icon: FolderKanban, label: 'Dự án' },
  { to: '/tasks', icon: CheckSquare, label: 'Công việc' },
];
const workflow = [
  { to: '/stage/consulting', icon: MessageSquare, label: 'Tư vấn', color: 'text-purple-500' },
  { to: '/stage/design', icon: Palette, label: 'Thiết kế', color: 'text-pink-500' },
  { to: '/stage/quotation', icon: Calculator, label: 'Báo giá', color: 'text-amber-500' },
  { to: '/stage/contract', icon: FileText, label: 'Hợp đồng', color: 'text-emerald-500' },
  { to: '/stage/production', icon: Hammer, label: 'Sản xuất', color: 'text-orange-500' },
  { to: '/stage/shipping', icon: Truck, label: 'Vận chuyển', color: 'text-cyan-500' },
  { to: '/stage/installation', icon: Wrench, label: 'Lắp đặt', color: 'text-blue-500' },
  { to: '/stage/customer-care', icon: Heart, label: 'CSKH', color: 'text-red-500' },
];
const tools = [
  { to: '/users', icon: Users, label: 'Nhân viên' },
  { to: '/settings', icon: Settings, label: 'Cài đặt' },
];

function Link({ to, icon: I, label, color, collapsed }) {
  return (
    <NavLink to={to} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all ${isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}>
      <I className={`h-5 w-5 shrink-0 ${color || ''}`} />
      {!collapsed && <span>{label}</span>}
    </NavLink>
  );
}

function Section({ title, items, collapsed }) {
  return (
    <div className="mb-3">
      {!collapsed && <p className="px-4 py-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{title}</p>}
      <nav className="space-y-0.5 px-2">{items.map(i => <Link key={i.to} {...i} collapsed={collapsed} />)}</nav>
    </div>
  );
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const doLogout = () => { logout(); navigate('/login'); };

  return (
    <aside className={`flex flex-col border-r border-gray-200 bg-white transition-all ${collapsed ? 'w-16' : 'w-60'}`}>
      <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold text-sm shadow">🏠</div>
        {!collapsed && <div><h1 className="text-sm font-bold text-gray-900">TuBep Pro</h1><p className="text-[10px] text-gray-400">Quản lý công việc</p></div>}
      </div>
      <div className="flex-1 overflow-y-auto py-3">
        <Section title="Tổng quan" items={nav} collapsed={collapsed} />
        <Section title="Quy trình" items={workflow} collapsed={collapsed} />
        <Section title="Hệ thống" items={tools} collapsed={collapsed} />
      </div>
      <div className="border-t p-2">
        {!collapsed && user && (
          <div className="flex items-center gap-2 px-2 py-1 mb-1">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold">{user.fullName?.[0]}</div>
            <div className="flex-1 min-w-0"><p className="text-xs font-medium truncate">{user.fullName}</p><p className="text-[10px] text-gray-400 truncate">{user.role}</p></div>
            <button onClick={doLogout} className="text-gray-400 hover:text-red-500"><LogOut className="h-4 w-4" /></button>
          </div>
        )}
        <button onClick={() => setCollapsed(!collapsed)} className="flex items-center justify-center w-full h-7 rounded text-gray-400 hover:bg-gray-100">
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );
}
