import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { useMessengerDock } from '../context/MessengerDockContext';
import OnlineStatusDot from '../components/OnlineStatusDot';
import { getInitials, avatarColor } from '../lib/utils';
import { Activity, Building2, Loader2, MessageCircle, RefreshCw, Search, Users } from 'lucide-react';

const ROLE_LABELS = {
  admin: 'Admin',
  manager: 'Quản lý',
  region_admin: 'Admin KV',
  sales_admin: 'Sales Admin',
  sales: 'Kinh doanh',
  designer: 'Thiết kế',
  production: 'Sản xuất',
  staff: 'Nhân viên',
};

function formatRelativeTime(iso) {
  if (!iso) return '—';
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return '—';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'Vừa xong';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} phút trước`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} giờ trước`;
  return new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function ActiveUsersPage() {
  const { user } = useAuth();
  const { openMessengerGroupChat, markGroupRead } = useMessengerDock();
  const uid = user?.id || user?.user_id;
  const [chatLoadingId, setChatLoadingId] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [filter, setFilter] = useState('online');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({ online: 0, total: 0 });
  const [thresholdMin, setThresholdMin] = useState(2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    api
      .get('/companies', { params: { for_module: 'crm' } })
      .then((r) => setCompanies(r.data?.companies || []))
      .catch(() => setCompanies([]));
    api
      .get('/users/departments/list')
      .then((r) => setDepartments(r.data?.departments || []))
      .catch(() => setDepartments([]));
  }, []);

  useEffect(() => {
    if (!companyId && user?.company_id) {
      setCompanyId(String(user.company_id));
    }
  }, [user?.company_id, companyId]);

  const departmentsForCompany = useMemo(() => {
    if (!companyId) return departments;
    return departments.filter((d) => String(d.company_id || '') === String(companyId));
  }, [departments, companyId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (companyId) params.company_id = companyId;
      if (departmentId) params.department_id = departmentId;
      if (searchDebounced) params.search = searchDebounced;
      if (filter === 'online') params.online_only = '1';
      const { data } = await api.get('/users/activity', { params });
      setRows(data?.users || []);
      setStats(data?.stats || { online: 0, total: 0 });
      if (data?.online_threshold_minutes) setThresholdMin(data.online_threshold_minutes);
    } catch (e) {
      setRows([]);
      setStats({ online: 0, total: 0 });
      setError(e.response?.data?.error || e.message || 'Không tải được danh sách');
    }
    setLoading(false);
  }, [companyId, departmentId, searchDebounced, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) void load();
    }, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const displayRows = useMemo(() => {
    if (filter !== 'offline') return rows;
    return rows.filter((u) => !u.online);
  }, [rows, filter]);

  const startDirectChat = async (u) => {
    const peerId = u.id || u.user_id;
    if (!peerId || String(peerId) === String(uid)) return;
    setChatLoadingId(peerId);
    try {
      const { data } = await api.post('/messenger/direct', { peer_user_id: peerId });
      if (data?.id) {
        markGroupRead(data.id);
        openMessengerGroupChat({
          id: data.id,
          name: data.name || data.display_name || u.full_name || u.email,
          is_direct: true,
          peer_id: peerId,
        });
      }
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Không mở được chat');
    }
    setChatLoadingId(null);
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-50">
      <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Activity className="h-5 w-5 text-emerald-600" />
              Đang hoạt động
            </h1>
            <p className="text-xs text-slate-500 mt-1 max-w-xl">
              Ai đang mở app (có ping trong {thresholdMin} phút). Tự làm mới mỗi 30 giây.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            {stats.online} đang hoạt động
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 px-3 py-1 text-xs font-medium">
            <Users className="h-3.5 w-3.5" />
            {stats.total} nhân viên
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <label className="block">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Công ty</span>
            <select
              value={companyId}
              onChange={(e) => {
                setCompanyId(e.target.value);
                setDepartmentId('');
              }}
              className="mt-0.5 w-full h-9 px-2 rounded-lg border border-slate-200 text-sm bg-white"
            >
              <option value="">Tất cả</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.short_name || c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Phòng ban</span>
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              disabled={!companyId}
              className="mt-0.5 w-full h-9 px-2 rounded-lg border border-slate-200 text-sm bg-white disabled:opacity-50"
            >
              <option value="">Tất cả</option>
              {departmentsForCompany.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Tìm kiếm</span>
            <div className="relative mt-0.5">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tên hoặc email…"
                className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 text-sm"
              />
            </div>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-1">
          {[
            { id: 'online', label: 'Đang hoạt động' },
            { id: 'all', label: 'Tất cả' },
            { id: 'offline', label: 'Offline' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`h-8 px-3 rounded-lg text-xs font-semibold transition-colors ${
                filter === tab.id
                  ? 'bg-sky-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {error && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {error}
          </div>
        )}

        {loading && rows.length === 0 ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
          </div>
        ) : displayRows.length === 0 ? (
          <div className="text-center py-16 text-slate-500 text-sm">
            {filter === 'online' ? 'Chưa có ai đang hoạt động trong bộ lọc này.' : 'Không có nhân viên phù hợp.'}
          </div>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {displayRows.map((u) => (
              <li
                key={u.id}
                className={`rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${
                  u.online ? 'border-emerald-200' : 'border-slate-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="relative shrink-0">
                    <div
                      className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white ${avatarColor(u.full_name || u.email)}`}
                    >
                      {u.avatar ? (
                        <img src={u.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                      ) : (
                        getInitials(u.full_name || u.email)
                      )}
                    </div>
                    <OnlineStatusDot online={u.online} className="absolute -bottom-0.5 -right-0.5" size="md" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900 truncate">{u.full_name || u.email}</p>
                    <p className="text-xs text-slate-500 truncate">{u.email}</p>
                    <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                      <Building2 className="h-3 w-3 shrink-0" />
                      <span className="truncate">{u.department?.name || '—'}</span>
                      {u.role && (
                        <span className="ml-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          {ROLE_LABELS[u.role] || u.role}
                        </span>
                      )}
                    </p>
                    <p className={`text-[11px] mt-1.5 font-medium ${u.online ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {u.online ? 'Đang hoạt động' : `Offline · ${formatRelativeTime(u.last_ping_at)}`}
                    </p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100 flex justify-end">
                  <button
                    type="button"
                    disabled={chatLoadingId === u.id || String(u.id) === String(uid)}
                    onClick={() => void startDirectChat(u)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-900 disabled:opacity-50"
                  >
                    {chatLoadingId === u.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <MessageCircle className="h-3.5 w-3.5" />
                    )}
                    Nhắn tin
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
