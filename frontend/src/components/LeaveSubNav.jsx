import { NavLink } from 'react-router-dom';
import { Calendar, List } from 'lucide-react';

const tabs = [
  { to: '/crm/leaves', end: true, icon: Calendar, label: 'Lịch nghỉ' },
  { to: '/crm/leaves/list', end: false, icon: List, label: 'Danh sách nghỉ' },
];

export default function LeaveSubNav() {
  return (
    <div className="inline-flex items-center p-1 rounded-xl bg-gray-100 border border-gray-200">
      {tabs.map(({ to, end, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold transition cursor-pointer ${
              isActive
                ? 'bg-white text-violet-700 shadow-sm border border-violet-100'
                : 'text-gray-600 hover:text-gray-900'
            }`
          }
        >
          <Icon className="h-4 w-4" />
          {label}
        </NavLink>
      ))}
    </div>
  );
}
