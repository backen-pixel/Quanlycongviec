import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike, isCompanyScopedAdmin } from '../lib/adminRole';
import { getStoredCrmFilterCompanyId } from '../lib/crmCompanyFilter';
import DateRangePickerPopover from '../components/DateRangePickerPopover';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BarChart3,
  Building2,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Filter,
  Info,
  Loader2,
  MapPin,
  TrendingUp,
  Users,
  XCircle,
} from 'lucide-react';

import ScopeFilterBar from '../shared/components/ScopeFilterBar';
import { useScopeFilter } from '../shared/hooks/useScopeFilter';

function pad(n) {
  return String(n).padStart(2, '0');
}

function isoLocal(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfWeekMonday(d) {
  const x = new Date(d);
  const dow = x.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  x.setDate(x.getDate() + diff);
  return x;
}

function endOfWeekSunday(d) {
  const start = startOfWeekMonday(d);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return end;
}

function monthBounds(year, month1to12) {
  const last = new Date(year, month1to12, 0).getDate();
  return {
    from: `${year}-${pad(month1to12)}-01`,
    to: `${year}-${pad(month1to12)}-${pad(last)}`,
  };
}

const PRESETS = [
  { id: 'week', label: 'Tuần này' },
  { id: 'month', label: 'Tháng này' },
  { id: 'last_month', label: 'Tháng trước' },
  { id: 'custom', label: 'Tùy chỉnh' },
];

function resolvePresetRange(presetId) {
  const now = new Date();
  if (presetId === 'week') {
    return { from: isoLocal(startOfWeekMonday(now)), to: isoLocal(endOfWeekSunday(now)) };
  }
  if (presetId === 'last_month') {
    const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const m = now.getMonth() === 0 ? 12 : now.getMonth();
    return monthBounds(y, m);
  }
  return monthBounds(now.getFullYear(), now.getMonth() + 1);
}

function StatCard({ icon: Icon, label, value, sub, color = 'blue' }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    violet: 'bg-violet-50 text-violet-700 border-violet-100',
    gray: 'bg-gray-50 text-gray-700 border-gray-100',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color] || colors.blue}`}>
      <div className="flex items-center gap-2 text-xs font-medium opacity-80">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs mt-1 opacity-75">{sub}</div>}
    </div>
  );
}

export default function EventsOverviewPage() {
  const { user } = useAuth();
  const isAdmin = isAdminLike(user);
  const canPickCompany = isAdmin && !isCompanyScopedAdmin(user);
  const scope = useScopeFilter({
    storageKey: 'crm_events',
    showCompany: true,
    showDepartment: false,
    showSearch: false,
    autoDefaultCompany: false,
  });
  const filterCompanyId = scope.companyId;
  const companies = scope.companies;

  useEffect(() => {
    if (!canPickCompany || filterCompanyId) return;
    const stored = getStoredCrmFilterCompanyId();
    if (stored) scope.setCompanyId(stored);
  }, [canPickCompany, filterCompanyId, scope.setCompanyId]);

  const [preset, setPreset] = useState('month');
  const [rangeFrom, setRangeFrom] = useState(() => resolvePresetRange('month').from);
  const [rangeTo, setRangeTo] = useState(() => resolvePresetRange('month').to);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [filterUser, setFilterUser] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterRegionId, setFilterRegionId] = useState('');
  const [granularity, setGranularity] = useState('');

  const [eventTypes, setEventTypes] = useState([]);
  const [users, setUsers] = useState([]);
  const [regions, setRegions] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const listParams = useMemo(
    () => (canPickCompany && filterCompanyId ? { company_id: filterCompanyId } : {}),
    [canPickCompany, filterCompanyId],
  );

  const effectiveCompanyIdForUsers = useMemo(() => {
    if (canPickCompany && filterCompanyId) return filterCompanyId;
    const cid = user?.company_id != null ? String(user.company_id).trim() : '';
    return cid || '';
  }, [canPickCompany, filterCompanyId, user?.company_id]);

  useEffect(() => {
    api.get('/events/event-types').then((r) => setEventTypes(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!effectiveCompanyIdForUsers) {
      setUsers([]);
      setRegions([]);
      return;
    }
    api.get('/users', { params: { company_id: effectiveCompanyIdForUsers } })
      .then((r) => setUsers(r.data.users || r.data || []))
      .catch(() => setUsers([]));
    api.get('/crm/company-regions', { params: { company_id: effectiveCompanyIdForUsers } })
      .then((r) => setRegions(Array.isArray(r.data) ? r.data : []))
      .catch(() => setRegions([]));
  }, [effectiveCompanyIdForUsers]);

  const applyPreset = (id) => {
    setPreset(id);
    if (id === 'custom') {
      setShowDatePicker(true);
      return;
    }
    const { from, to } = resolvePresetRange(id);
    setRangeFrom(from);
    setRangeTo(to);
    setGranularity('');
  };

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        date_from: rangeFrom,
        date_to: rangeTo,
        ...listParams,
      };
      if (filterUser) params.user_id = filterUser;
      if (filterType) params.type = filterType;
      if (filterRegionId) params.region_id = filterRegionId;
      if (granularity) params.granularity = granularity;
      const { data: res } = await api.get('/events/overview', { params });
      setData(res);
    } catch (e) {
      console.error(e);
      setData(null);
    }
    setLoading(false);
  }, [rangeFrom, rangeTo, listParams, filterUser, filterType, filterRegionId, granularity]);

  useEffect(() => {
    if (!rangeFrom || !rangeTo) return;
    loadOverview();
  }, [loadOverview, rangeFrom, rangeTo]);

  const typeChartData = useMemo(() => {
    if (!data?.by_type) return [];
    return data.by_type.slice(0, 12).map((t) => ({
      name: `${t.icon || ''} ${t.name}`.trim(),
      count: t.count,
      fill: t.color || '#3B82F6',
    }));
  }, [data]);

  /**
   * Một nhân viên có thể vừa tạo vừa được giao một sự kiện — `total` đếm sự kiện
   * duy nhất có liên quan (không cộng dồn 2 vai trò) nên total ≤ created + assigned.
   */
  const staffChartData = useMemo(() => {
    if (!data?.by_staff) return [];
    return data.by_staff.slice(0, 15).map((s) => ({
      name: s.full_name?.length > 18 ? `${s.full_name.slice(0, 16)}…` : s.full_name,
      fullName: s.full_name,
      total: s.total,
      created: s.as_creator,
      assigned: s.as_assignee,
    }));
  }, [data]);

  const StaffTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload || {};
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md min-w-[180px]">
        <div className="font-semibold text-gray-900 mb-1">{p.fullName || p.name}</div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-blue-700">Sự kiện đã tạo</span>
          <span className="font-mono font-semibold">{p.created ?? 0}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-violet-700">Sự kiện được giao</span>
          <span className="font-mono font-semibold">{p.assigned ?? 0}</span>
        </div>
        <div className="mt-1 pt-1 border-t flex items-center justify-between gap-3 text-gray-700">
          <span>Sự kiện liên quan</span>
          <span className="font-mono font-bold">{p.total ?? 0}</span>
        </div>
      </div>
    );
  };

  const timelineData = data?.timeline || [];
  const summary = data?.summary || {};
  const granLabel = data?.granularity === 'week' ? 'theo tuần' : data?.granularity === 'month' ? 'theo tháng' : 'theo ngày';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link to="/crm/events" className="hover:text-blue-600 flex items-center gap-1">
              <ChevronLeft className="h-4 w-4" /> Sự kiện
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-blue-600" /> Tổng quan sự kiện
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Thống kê {summary.total ?? '—'} sự kiện · {rangeFrom} → {rangeTo}
            {data?.period?.days ? ` (${data.period.days} ngày)` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canPickCompany && (
            <div className="flex items-center gap-2 h-9 px-2.5 rounded-lg border border-indigo-200 bg-indigo-50/70 shadow-sm min-w-[220px]">
              <Building2 className="h-4 w-4 text-indigo-600 shrink-0" aria-hidden />
              <div className="flex-1 min-w-0 [&_label]:!m-0 [&_label>span]:!hidden [&_select]:!mt-0 [&_select]:h-7 [&_select]:py-1 [&_select]:text-xs [&_select]:font-semibold [&_select]:border-indigo-200 [&_select]:bg-white [&_select]:text-indigo-900">
                <ScopeFilterBar
                  scope={{ ...scope, showDepartment: false, showSearch: false, showDateRange: false }}
                  companyLabel=""
                  companyAllowAll
                />
              </div>
            </div>
          )}
          <Link
            to="/crm/events"
            className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold border border-blue-200 bg-blue-50 text-blue-800 shadow-sm hover:bg-blue-100 hover:border-blue-300 transition-colors"
          >
            <Calendar className="h-4 w-4 text-blue-600 shrink-0" /> Lịch & Feed
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/90 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">
            <Filter className="h-3.5 w-3.5" /> Bộ lọc
          </div>

          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className={`h-8 px-3 rounded-lg text-sm font-medium border transition cursor-pointer ${
                  preset === p.id
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                }`}
              >
                {p.label}
              </button>
            ))}
            {preset === 'custom' && (
              <button
                type="button"
                onClick={() => setShowDatePicker(true)}
                className="h-8 px-3 rounded-lg text-sm border border-dashed border-gray-300 text-gray-600 hover:border-blue-400 cursor-pointer flex items-center gap-1"
              >
                <CalendarDays className="h-3.5 w-3.5" />
                {rangeFrom} → {rangeTo}
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-[10px] text-gray-500 mb-0.5">Người tạo</label>
              <select
                value={filterUser}
                onChange={(e) => setFilterUser(e.target.value)}
                className="h-9 px-3 border rounded-lg text-sm min-w-[150px]"
                disabled={!effectiveCompanyIdForUsers && canPickCompany}
              >
                <option value="">Tất cả</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-0.5">Loại sự kiện</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="h-9 px-3 border rounded-lg text-sm min-w-[130px]"
              >
                <option value="">Tất cả loại</option>
                {eventTypes.map((t) => (
                  <option key={t.slug} value={t.slug}>{t.icon} {t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-0.5 flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Khu vực người tạo
              </label>
              <select
                value={filterRegionId}
                onChange={(e) => setFilterRegionId(e.target.value)}
                disabled={!effectiveCompanyIdForUsers}
                className="h-9 px-3 border rounded-lg text-sm min-w-[140px] disabled:bg-gray-100"
                title={!effectiveCompanyIdForUsers ? 'Chọn công ty để lọc khu vực người tạo' : 'Lọc theo khu vực của người tạo sự kiện'}
              >
                <option value="">Tất cả</option>
                {regions.map((rg) => (
                  <option key={rg.id} value={rg.id}>{rg.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-0.5">Nhóm thời gian biểu đồ</label>
              <select
                value={granularity}
                onChange={(e) => setGranularity(e.target.value)}
                className="h-9 px-3 border rounded-lg text-sm min-w-[120px]"
              >
                <option value="">Tự động</option>
                <option value="day">Theo ngày</option>
                <option value="week">Theo tuần</option>
                <option value="month">Theo tháng</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-9 w-9 animate-spin text-blue-500" />
          </div>
        ) : !data ? (
          <div className="text-center py-16 text-gray-400 text-sm">Không tải được dữ liệu</div>
        ) : (
          <div className="p-4 space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard icon={Calendar} label="Tổng sự kiện" value={summary.total ?? 0} color="blue" />
              <StatCard
                icon={CheckCircle2}
                label="Hoàn thành"
                value={summary.completed ?? 0}
                sub={`${summary.completion_rate ?? 0}% tỷ lệ`}
                color="emerald"
              />
              <StatCard icon={Clock} label="Đang / kế hoạch" value={(summary.planned ?? 0) + (summary.in_progress ?? 0)} color="amber" />
              <StatCard icon={XCircle} label="Đã hủy" value={summary.cancelled ?? 0} color="gray" />
              <StatCard
                icon={TrendingUp}
                label="Tần suất"
                value={summary.avg_per_day ?? 0}
                sub={`${summary.avg_per_week ?? 0} / tuần · TB/ngày`}
                color="violet"
              />
              <StatCard icon={Users} label="Nhân viên tham gia" value={summary.unique_staff ?? 0} color="blue" />
            </div>

            <div className="bg-white rounded-xl border p-4">
              <h2 className="text-sm font-bold text-gray-800 mb-3">
                Xu hướng sự kiện ({granLabel})
              </h2>
              {timelineData.length === 0 ? (
                <p className="text-sm text-gray-400 py-12 text-center">Không có dữ liệu trong khoảng thời gian</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={timelineData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
                    <Tooltip
                      formatter={(v) => [`${v} sự kiện`, 'Số lượng']}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.bucket || ''}
                    />
                    <Line type="monotone" dataKey="count" stroke="#2563EB" strokeWidth={2} dot={{ r: 3 }} name="Sự kiện" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border p-4">
                <h2 className="text-sm font-bold text-gray-800 mb-3">Theo loại sự kiện</h2>
                {typeChartData.length === 0 ? (
                  <p className="text-sm text-gray-400 py-8 text-center">—</p>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(220, typeChartData.length * 36)}>
                    <BarChart data={typeChartData} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v) => [`${v}`, 'Sự kiện']} />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                        {typeChartData.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="bg-white rounded-xl border p-4">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-sm font-bold text-gray-800">Theo nhân viên</h2>
                  <span className="text-[11px] text-gray-500 flex items-center gap-1">
                    <Info className="h-3 w-3" /> So sánh số sự kiện đã tạo & được giao
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 mb-3">
                  «Đã tạo» = nhân viên là người tạo sự kiện. «Được giao» = nhân viên là người phụ trách.
                </p>
                {staffChartData.length === 0 ? (
                  <p className="text-sm text-gray-400 py-8 text-center">—</p>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(240, staffChartData.length * 34)}>
                    <BarChart data={staffChartData} margin={{ bottom: 4 }} barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={72} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                      <Tooltip content={<StaffTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="created" name="Đã tạo" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="assigned" name="Được giao" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {data.by_staff?.length > 0 && (
              <div className="bg-white rounded-xl border overflow-hidden">
                <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between flex-wrap gap-2">
                  <h2 className="text-sm font-bold text-gray-800">Chi tiết theo nhân viên</h2>
                  <span className="text-[11px] text-gray-500 flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    «Sự kiện liên quan» đếm 1 lần dù nhân viên vừa tạo vừa được giao
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-gray-500 uppercase bg-gray-50/50">
                        <th className="py-2.5 px-4 text-left">Nhân viên</th>
                        <th className="py-2.5 px-4 text-right" title="Số sự kiện do nhân viên tạo">
                          Sự kiện đã tạo
                        </th>
                        <th className="py-2.5 px-4 text-right" title="Số sự kiện nhân viên là người phụ trách (assignee)">
                          Sự kiện được giao
                        </th>
                        <th className="py-2.5 px-4 text-right font-semibold" title="Số sự kiện duy nhất nhân viên có liên quan (tạo HOẶC được giao)">
                          Sự kiện liên quan
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.by_staff.map((row) => (
                        <tr key={row.user_id} className="border-b border-gray-100 hover:bg-gray-50/50">
                          <td className="py-2.5 px-4 font-medium text-gray-900">{row.full_name}</td>
                          <td className="py-2.5 px-4 text-right text-blue-700">{row.as_creator}</td>
                          <td className="py-2.5 px-4 text-right text-violet-700">{row.as_assignee}</td>
                          <td className="py-2.5 px-4 text-right font-semibold">{row.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showDatePicker && (
        <DateRangePickerPopover
          open={showDatePicker}
          title="Chọn khoảng thời gian"
          from={rangeFrom}
          to={rangeTo}
          onChange={({ from, to }) => {
            if (from) setRangeFrom(from);
            if (to) setRangeTo(to);
            setPreset('custom');
          }}
          onClose={() => setShowDatePicker(false)}
        />
      )}
    </div>
  );
}
