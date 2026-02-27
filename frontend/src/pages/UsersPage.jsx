import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Users as UsersIcon, Search, Mail, Phone } from 'lucide-react';
import { getInitials, avatarColor, formatDateTime } from '../lib/utils';

const roleLabels = {
  admin: 'Admin',
  manager: 'Quản lý',
  sales: 'Kinh doanh',
  designer: 'Thiết kế',
  production: 'Sản xuất',
  driver: 'Tài xế',
  installer: 'Lắp đặt',
  customer_care: 'CSKH',
  staff: 'Nhân viên',
};

const roleBadge = {
  admin: 'bg-red-100 text-red-700',
  manager: 'bg-purple-100 text-purple-700',
  sales: 'bg-blue-100 text-blue-700',
  designer: 'bg-pink-100 text-pink-700',
  production: 'bg-orange-100 text-orange-700',
  installer: 'bg-cyan-100 text-cyan-700',
  customer_care: 'bg-green-100 text-green-700',
};

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get('/users', { params: { search: search || undefined } })
      .then(r => setUsers(r.data.users || []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <UsersIcon className="h-6 w-6 text-gray-400" /> Nhân viên
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{users.length} nhân viên</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load()}
          placeholder="Tìm nhân viên..."
          className="w-full h-9 pl-10 pr-3 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-all"
        />
      </div>

      {/* Users grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <svg className="animate-spin h-6 w-6 text-gray-400" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
          </svg>
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-16">
          <UsersIcon className="h-12 w-12 mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-400">Chưa có nhân viên nào</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {users.map((u, i) => (
            <div
              key={u.id}
              className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4 hover:shadow-md hover:border-gray-300 transition-all animate-fade-in"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              {/* Avatar */}
              <div
                className="h-11 w-11 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                style={{ backgroundColor: avatarColor(u.full_name) }}
              >
                {getInitials(u.full_name)}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="text-sm font-semibold text-gray-900 truncate">{u.full_name}</h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${roleBadge[u.role] || 'bg-gray-100 text-gray-600'}`}>
                    {roleLabels[u.role] || u.role}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1 truncate">
                    <Mail className="h-3 w-3 shrink-0" />{u.email}
                  </span>
                  {u.phone && (
                    <span className="flex items-center gap-1 shrink-0">
                      <Phone className="h-3 w-3" />{u.phone}
                    </span>
                  )}
                </div>
              </div>

              {/* Online indicator */}
              {u.last_login_at && (
                <div className="shrink-0 text-right">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse-dot ml-auto mb-1" />
                  <p className="text-[10px] text-gray-400">Online</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
