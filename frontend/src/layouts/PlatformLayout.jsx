import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Globe, Users, CreditCard, Puzzle, BarChart3, Plus, Globe2, Package, ShoppingCart, Copy,
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/platform', label: 'Tổng quan', icon: LayoutDashboard, end: true },
  { to: '/platform/plans', label: '4 gói chính', icon: CreditCard },
  { to: '/platform/tenants', label: 'Hệ sinh thái', icon: Globe, matchPrefix: '/platform/tenants' },
  { to: '/platform/blueprints', label: 'Business Blueprint', icon: Copy },
  { to: '/platform/modules', label: 'Modun add-on', icon: Package },
  { to: '/platform/purchases', label: 'Đơn mua', icon: ShoppingCart },
  { to: '/platform/users', label: 'Users', icon: Users },
  { to: '/platform/billing', label: 'Gói thuê bao', icon: CreditCard },
  { to: '/platform/tier-features', label: 'Tính năng gói', icon: Puzzle },
  { to: '/platform/stats', label: 'Thống kê', icon: BarChart3 },
];

function navActive(pathname, item) {
  if (item.matchPrefix) return pathname.startsWith(item.matchPrefix);
  if (item.end) return pathname === item.to || pathname === `${item.to}/`;
  return pathname.startsWith(item.to);
}

export default function PlatformLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="platform-module min-h-full -mx-2">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center shadow-sm">
              <Globe2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Nền tảng SaaS</h1>
              <p className="text-xs text-gray-500">Quản trị hệ sinh thái, gói thuê bao và tính năng</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/platform/tenants', { state: { showCreate: true } })}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-xl hover:bg-teal-700 shadow-sm cursor-pointer transition-colors"
          >
            <Plus className="h-4 w-4" />
            Tạo hệ sinh thái
          </button>
        </div>

        <nav className="flex gap-1 overflow-x-auto pb-1 border-b border-gray-200">
          {NAV_ITEMS.map((item) => {
            const active = navActive(location.pathname, item);
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={`flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                  active
                    ? 'border-teal-600 text-teal-700'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <Outlet />
      </div>
    </div>
  );
}
