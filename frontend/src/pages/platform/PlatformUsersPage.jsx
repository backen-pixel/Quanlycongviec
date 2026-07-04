import { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';
import { Users, Search, Globe } from 'lucide-react';

export default function PlatformUsersPage() {
  const [tenants, setTenants] = useState([]);
  const [selectedTenant, setSelectedTenant] = useState('all');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    api.get('/platform/tenants').then(({ data }) => setTenants(data || [])).catch(console.error);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (selectedTenant !== 'all') params.tenant_id = selectedTenant;
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      const { data } = await api.get('/platform/users', { params });
      setUsers(data || []);
    } catch (e) {
      console.error(e);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [selectedTenant, debouncedSearch]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const ROLE_COLORS = {
    admin: 'bg-red-50 text-red-700',
    sales_admin: 'bg-orange-50 text-orange-700',
    platform_admin: 'bg-teal-50 text-teal-700',
    manager: 'bg-blue-50 text-blue-700',
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Users className="h-5 w-5 text-indigo-600" />
          Người dùng toàn nền tảng
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">Tìm kiếm users trên tất cả hệ sinh thái</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Tìm theo tên hoặc email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm"
          />
        </div>
        <select
          value={selectedTenant}
          onChange={(e) => setSelectedTenant(e.target.value)}
          className="border rounded-xl px-3 py-2.5 text-sm min-w-[220px]"
        >
          <option value="all">Tất cả hệ sinh thái</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>{t.name} ({t.user_count || 0})</option>
          ))}
        </select>
      </div>

      <div className="bg-white border rounded-2xl overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-gray-500">Đang tải...</div>
        ) : users.length === 0 ? (
          <div className="py-12 text-center text-gray-400">Không tìm thấy người dùng</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-5 py-3.5 font-medium text-gray-600">Họ tên</th>
                  <th className="text-left px-5 py-3.5 font-medium text-gray-600">Email</th>
                  <th className="text-left px-5 py-3.5 font-medium text-gray-600">Hệ sinh thái</th>
                  <th className="text-left px-5 py-3.5 font-medium text-gray-600">Role</th>
                  <th className="text-left px-5 py-3.5 font-medium text-gray-600">Đăng nhập cuối</th>
                  <th className="text-left px-5 py-3.5 font-medium text-gray-600">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-gray-900">{u.full_name || '—'}</td>
                    <td className="px-5 py-3.5 text-gray-500">{u.email}</td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                        <Globe className="h-3.5 w-3.5 text-teal-500" />
                        {u.tenants?.name || '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${ROLE_COLORS[u.role] || 'bg-gray-50 text-gray-600'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-400 text-xs">
                      {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString('vi-VN') : '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${u.is_active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${u.is_active ? 'bg-green-500' : 'bg-red-400'}`} />
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="text-xs text-gray-400 text-right">{users.length} người dùng (tối đa 500 bản ghi)</div>
    </div>
  );
}
