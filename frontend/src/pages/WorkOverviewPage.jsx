import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike, isCompanyScopedAdmin } from '../lib/adminRole';
import { vnTodayYmd, vnAddDaysYmd } from '../lib/vnDate';
import { formatStaffDisplayName, getStaffInitials, avatarColor } from '../lib/utils';
import { getDeepLink } from '../components/UnifiedTaskRow';
import SearchInlineFilterChips, { AdvFilterButton, searchGroupClass } from '../components/SearchInlineFilterChips';
import WorkUnifiedFilterPanel, {
  WORK_UNIFIED_REGION_NONE,
  WORK_UNIFIED_TIME_PRESETS,
  getWorkUnifiedPresetDateRange,
} from '../components/WorkUnifiedFilterFields';
import { RefreshCw, AlertTriangle, CalendarDays, CircleAlert } from 'lucide-react';

const WEEKDAY_LABELS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

function pad2(n) { return String(n).padStart(2, '0'); }

function greetingForHour(h) {
  if (h < 11) return 'Chào buổi sáng';
  if (h < 14) return 'Chào buổi trưa';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

function formatMoneyShort(v) {
  const n = Number(v) || 0;
  if (n >= 1e9) {
    let val = (n / 1e9).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    return `${val.replace('.', ',')} tỷ đ`;
  }
  if (n >= 1e6) return `${Math.round(n / 1e6).toLocaleString('vi-VN')} triệu đ`;
  return `${n.toLocaleString('vi-VN')} đ`;
}

function formatMoneyBar(v) {
  const n = Number(v) || 0;
  if (n <= 0) return '0';
  if (n >= 1e9) {
    const val = (n / 1e9).toFixed(n >= 10e9 ? 1 : 2).replace(/0+$/, '').replace(/\.$/, '');
    return `${val.replace('.', ',')} tỷ`;
  }
  if (n >= 1e6) return `${Math.round(n / 1e6).toLocaleString('vi-VN')} tr`;
  return `${Math.round(n / 1e3).toLocaleString('vi-VN')}k`;
}

function formatDeltaPct(curr, prev) {
  if (!(prev > 0)) return null;
  const pct = ((Number(curr) - Number(prev)) / Number(prev)) * 100;
  const rounded = Math.abs(pct) >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10;
  const absText = String(Math.abs(rounded)).replace('.', ',');
  return {
    up: pct >= 0,
    text: `${pct >= 0 ? '+' : ''}${absText}%`,
  };
}

const LIST_PAGE = 7;

function PersonChip({ name }) {
  const short = formatStaffDisplayName(name);
  if (!short) {
    return <span className="text-[11px] text-gray-400">Chưa gán</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 min-w-0 max-w-[7.25rem]" title={name}>
      <span
        className="h-5 w-5 shrink-0 rounded-full text-[9px] font-semibold text-white flex items-center justify-center leading-none"
        style={{ backgroundColor: avatarColor(name) }}
      >
        {getStaffInitials(name)}
      </span>
      <span className="truncate text-[11px] text-gray-500">{short}</span>
    </span>
  );
}

function DelayBadge({ days, warning }) {
  if (warning) {
    return (
      <span className="inline-flex text-[10px] font-semibold tracking-wide px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700">
        Sắp hạn
      </span>
    );
  }
  if (!(days > 0)) return null;
  return (
    <span className="inline-flex text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md bg-red-50 text-red-600">
      Trễ {days}n
    </span>
  );
}

function OverviewRow({ href, title, subtitle, titleCls, delay, warning, personName, accent }) {
  const inner = (
    <div className="flex items-start gap-2.5 px-2.5 py-2 rounded-lg hover:bg-gray-50 min-w-0 transition-colors">
      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${accent || 'bg-gray-300'}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate leading-5 ${titleCls || 'text-gray-900'}`}>{title}</p>
        {subtitle ? (
          <p className="text-[12px] text-gray-500 truncate mt-0.5 leading-4">{subtitle}</p>
        ) : null}
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1 pt-0.5">
        <DelayBadge days={delay} warning={warning} />
        <PersonChip name={personName} />
      </div>
    </div>
  );
  if (!href) return inner;
  return <Link to={href} className="block">{inner}</Link>;
}

function taskProjectSubtitle(task) {
  const code = String(task?.project_code || '').trim();
  const name = String(task?.project_name || '').trim();
  if (code && name) return `Dự án ${code} · ${name}`;
  if (code) return `Dự án ${code}`;
  if (name) return `Dự án ${name}`;
  return task?.lead_title ? `Deal/Lead · ${task.lead_title}` : '';
}

function OverviewCard({ icon, iconWrap, title, titleHref, count, countCls, loading, empty, children, footer }) {
  const titleContent = (
    <>
      <span className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${iconWrap}`}>
        {icon}
      </span>
      <h2 className="text-sm font-semibold text-gray-800 truncate">{title}</h2>
    </>
  );
  return (
    <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-50">
        {titleHref ? (
          <Link to={titleHref} className="flex items-center gap-2 min-w-0 hover:opacity-75">
            {titleContent}
          </Link>
        ) : (
          <div className="flex items-center gap-2 min-w-0">{titleContent}</div>
        )}
        {count > 0 && (
          <span className={`text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded-full ${countCls || 'bg-gray-100 text-gray-600'}`}>
            {count}
          </span>
        )}
      </div>
      <div className="px-1.5 py-1.5 flex-1">
        {loading ? (
          <p className="text-sm text-gray-400 py-6 text-center">Đang tải...</p>
        ) : empty ? (
          <p className="text-sm text-gray-400 py-6 text-center">{empty}</p>
        ) : children}
      </div>
      {footer}
    </div>
  );
}

function LoadMoreBtn({ shown, total, onMore }) {
  if (shown >= total) return null;
  const rest = total - shown;
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); onMore(); }}
      className="w-full text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50/70 py-2 border-t border-gray-50 cursor-pointer"
    >
      Tải thêm · {rest} mục
    </button>
  );
}

export default function WorkOverviewPage() {
  const { user } = useAuth();
  const isAdmin = isAdminLike(user);
  const isCompanyScoped = isCompanyScopedAdmin(user);
  const canPickCompany = isAdmin && !isCompanyScoped;

  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [filterRegionId, setFilterRegionId] = useState('');
  const [timePreset, setTimePreset] = useState('');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [regions, setRegions] = useState([]);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [overview, setOverview] = useState(null);
  const [todayTasks, setTodayTasks] = useState([]);
  const [overdueTasks, setOverdueTasks] = useState([]);
  const [showProjects, setShowProjects] = useState(LIST_PAGE);
  const [showToday, setShowToday] = useState(LIST_PAGE);
  const [showOverdue, setShowOverdue] = useState(LIST_PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const lockedCompanyLabel = useMemo(() => {
    const cid = user?.company_id != null ? String(user.company_id).trim() : '';
    const c = companies.find((x) => String(x.id) === cid);
    return c?.short_name || c?.name || 'Công ty của bạn';
  }, [user?.company_id, companies]);

  const effectiveCompanyId = useMemo(() => {
    if (canPickCompany) return companyId || '';
    const cid = user?.company_id != null ? String(user.company_id).trim() : '';
    return cid || '';
  }, [canPickCompany, companyId, user?.company_id]);

  useEffect(() => {
    api.get('/companies', { params: { for_module: 'crm' } }).then((res) => {
      const list = Array.isArray(res.data) ? res.data : (res.data?.companies || []);
      setCompanies(list);
      // Admin hệ thống: mặc định mọi công ty (khớp Work Unified). Admin công ty: khóa CT của họ.
      if (canPickCompany) return;
      const own = user?.company_id
        ? list.find((c) => String(c.id) === String(user.company_id))
        : null;
      if (own?.id) setCompanyId((prev) => prev || own.id);
      else if (list.length > 0) setCompanyId((prev) => prev || list[0].id);
    }).catch(() => setCompanies([]));
  }, [canPickCompany, user?.company_id]);

  useEffect(() => {
    const params = {};
    if (effectiveCompanyId) {
      params.company_id = effectiveCompanyId;
    } else if (canPickCompany && companies.length > 0) {
      params.company_ids = companies.map((c) => c.id).join(',');
    } else {
      setRegions([]);
      return;
    }
    api.get('/crm/company-regions', { params })
      .then((r) => setRegions((Array.isArray(r.data) ? r.data : []).filter((rg) => rg.is_active !== false)))
      .catch(() => setRegions([]));
  }, [effectiveCompanyId, canPickCompany, companies]);

  useEffect(() => {
    setFilterRegionId('');
  }, [effectiveCompanyId]);

  const handleTimePresetChange = (preset) => {
    setTimePreset(preset);
    const range = getWorkUnifiedPresetDateRange(preset);
    setRangeFrom(range.from);
    setRangeTo(range.to);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const today = vnTodayYmd();
      const yesterday = vnAddDaysYmd(today, -1);
      const scopeParams = {
        ...(canPickCompany && companyId ? { company_id: companyId } : {}),
        ...(filterRegionId ? { region_id: filterRegionId } : {}),
        ...(rangeFrom ? { date_from: rangeFrom } : {}),
        ...(rangeTo ? { date_to: rangeTo } : {}),
      };
      const taskBase = { open_only: '1', page_size: 50, ...scopeParams };
      const dueFrom = rangeFrom || today;
      const dueTo = rangeTo || today;
      const overdueTo = (!rangeTo || rangeTo >= today) ? yesterday : rangeTo;
      const [overviewRes, tasksRes, overdueRes] = await Promise.all([
        api.get('/management/work-overview', { params: scopeParams }),
        api.get('/work-tasks', {
          params: {
            ...taskBase,
            date_from: `${dueFrom}T00:00:00+07:00`,
            date_to: `${dueTo}T23:59:59+07:00`,
          },
        }),
        api.get('/work-tasks', {
          params: {
            ...taskBase,
            ...(rangeFrom ? { date_from: `${rangeFrom}T00:00:00+07:00` } : {}),
            date_to: `${overdueTo}T23:59:59+07:00`,
          },
        }),
      ]);
      setOverview(overviewRes.data);
      const todayList = tasksRes.data?.tasks || [];
      const overdueList = (overdueRes.data?.tasks || [])
        .slice()
        .sort((a, b) => String(a.deadline || '').localeCompare(String(b.deadline || '')));
      setTodayTasks(todayList);
      setOverdueTasks(overdueList);
    } catch (e) {
      setError(e?.response?.data?.error || 'Không tải được dữ liệu tổng quan');
    } finally {
      setLoading(false);
    }
  }, [canPickCompany, companyId, filterRegionId, rangeFrom, rangeTo]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    setShowProjects(LIST_PAGE);
    setShowToday(LIST_PAGE);
    setShowOverdue(LIST_PAGE);
  }, [companyId, filterRegionId, rangeFrom, rangeTo]);

  const companyName = useMemo(() => {
    if (canPickCompany) {
      if (!companyId) return 'tất cả công ty';
      return companies.find((c) => String(c.id) === String(companyId))?.name || 'công ty đã chọn';
    }
    return companies.find((c) => String(c.id) === String(user?.company_id))?.name || companies[0]?.name || 'công ty bạn';
  }, [canPickCompany, companyId, companies, user?.company_id]);

  const regionLabel = useMemo(() => {
    if (filterRegionId === WORK_UNIFIED_REGION_NONE) return 'chưa gán khu vực';
    if (!filterRegionId) return '';
    return regions.find((r) => String(r.id) === String(filterRegionId))?.name || 'khu vực đã chọn';
  }, [filterRegionId, regions]);

  const activeFilterCount = [canPickCompany && !!companyId, !!filterRegionId, !!timePreset].filter(Boolean).length;

  const overviewFilterChips = useMemo(() => {
    const chips = [];
    if (canPickCompany && companyId) {
      const c = companies.find((x) => String(x.id) === String(companyId));
      chips.push({
        key: 'company',
        label: c?.short_name || c?.name || 'Công ty',
        onClear: () => setCompanyId(''),
      });
    }
    if (filterRegionId === WORK_UNIFIED_REGION_NONE) {
      chips.push({
        key: 'region',
        label: 'Chưa gán khu vực',
        onClear: () => setFilterRegionId(''),
      });
    } else if (filterRegionId) {
      const rg = regions.find((x) => String(x.id) === String(filterRegionId));
      chips.push({
        key: 'region',
        label: rg?.name || 'Khu vực',
        onClear: () => setFilterRegionId(''),
      });
    }
    if (timePreset) {
      const t = WORK_UNIFIED_TIME_PRESETS.find((x) => x.key === timePreset);
      chips.push({
        key: 'time',
        label: t?.label || 'Thời gian',
        onClear: () => handleTimePresetChange(''),
      });
    }
    return chips;
  }, [canPickCompany, companyId, companies, filterRegionId, regions, timePreset]);

  const clearOverviewFilters = () => {
    setFilterRegionId('');
    handleTimePresetChange('');
    if (canPickCompany) setCompanyId('');
  };

  const now = useMemo(() => new Date(), []);
  const periodPhrase = timePreset === 'today'
    ? 'hôm nay'
    : timePreset === 'this_week'
      ? 'tuần này'
      : timePreset === 'this_month'
        ? `tháng ${now.getMonth() + 1}`
        : timePreset === 'this_quarter'
          ? 'quý này'
          : '';
  const revenueLabel = periodPhrase
    ? `Doanh thu ${periodPhrase}`
    : `Doanh thu tháng ${now.getMonth() + 1} (đến ${pad2(now.getDate())}/${pad2(now.getMonth() + 1)})`;
  const customersLabel = periodPhrase
    ? `Khách hàng mới ${periodPhrase}`
    : 'Khách hàng mới tháng này';
  const dueTasksTitle = periodPhrase && timePreset !== 'today'
    ? `Việc cần làm ${periodPhrase}`
    : 'Việc cần làm hôm nay';
  const dueTasksEmpty = `Không có việc nào hạn ${periodPhrase || 'hôm nay'}.`;
  const subtitleDate = `${WEEKDAY_LABELS[now.getDay()]}, ${pad2(now.getDate())}/${pad2(now.getMonth() + 1)}/${now.getFullYear()}`;

  const stats = [
    { key: 'active', label: 'Dự án đang thực hiện', value: overview?.projects_active, cls: 'text-gray-900' },
    { key: 'revenue', label: revenueLabel, value: overview ? formatMoneyShort(overview.revenue_this_month) : null, cls: 'text-emerald-600' },
    { key: 'overdue', label: 'Công việc quá hạn', value: overview?.overdue_tasks, cls: 'text-red-600' },
    { key: 'customers', label: customersLabel, value: overview?.new_customers_this_month, cls: 'text-gray-900' },
  ];

  const trend = overview?.revenue_trend || [];
  const maxTrend = Math.max(1, ...trend.map((t) => t.total));
  const trendSummary = useMemo(() => {
    if (!trend.length) return null;
    const total = trend.reduce((s, t) => s + (Number(t.total) || 0), 0);
    const count = trend.reduce((s, t) => s + (Number(t.count) || 0), 0);
    const peak = trend.reduce((best, t) => ((t.total || 0) > (best.total || 0) ? t : best), trend[0]);
    const current = trend[trend.length - 1];
    const prev = trend[trend.length - 2];
    const delta = prev ? formatDeltaPct(current.total, prev.total) : null;
    const years = new Set(trend.map((t) => t.year).filter(Boolean));
    return { total, count, peak, current, prev, delta, mixedYears: years.size > 1 };
  }, [trend]);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          {/* Màu chữ khóa cố định — không đổi theo theme/hình nền người dùng chọn ở Cài đặt > Giao diện */}
          <h1 className="text-xl font-bold" style={{ color: '#111827' }}>
            {greetingForHour(now.getHours())}, {user?.full_name || ''}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: '#6b7280' }}>
            Toàn cảnh hoạt động của {companyName}{regionLabel ? ` · ${regionLabel}` : ''} · {subtitleDate}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 max-w-[22rem]">
            <div
              className={`group/search flex items-center h-9 rounded-md border transition-colors ${
                searchGroupClass({
                  focused: false,
                  hasQuery: false,
                  hasChips: overviewFilterChips.length > 0,
                  panelOpen: filterPanelOpen,
                })
              }`}
            >
              <div className="flex-1 min-w-0 flex items-center gap-1 pl-2.5 pr-1">
                {!filterPanelOpen && overviewFilterChips.length > 0 ? (
                  <SearchInlineFilterChips
                    chips={overviewFilterChips}
                    opacityClass="opacity-45 group-hover/search:opacity-100"
                    onClearChip={(chip) => { chip.onClear(); }}
                    onClearAll={clearOverviewFilters}
                    showClearAll={overviewFilterChips.length > 1}
                  />
                ) : (
                  <span className="text-xs font-medium text-slate-500 truncate">
                    {canPickCompany && !companyId ? 'Tất cả công ty' : (lockedCompanyLabel || companyName)}
                  </span>
                )}
              </div>
              <div className="shrink-0 pr-1">
                <AdvFilterButton
                  open={filterPanelOpen}
                  active={activeFilterCount > 0}
                  onClick={() => setFilterPanelOpen((v) => !v)}
                />
              </div>
            </div>
            {filterPanelOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setFilterPanelOpen(false);
                  }}
                />
                <WorkUnifiedFilterPanel
                  align="right"
                  onClose={() => setFilterPanelOpen(false)}
                  canPickCompany={canPickCompany}
                  lockedCompanyLabel={lockedCompanyLabel}
                  companies={companies}
                  companyId={companyId}
                  onCompanyChange={setCompanyId}
                  regions={regions}
                  filterRegionId={filterRegionId}
                  onRegionChange={setFilterRegionId}
                  timePreset={timePreset}
                  onTimePresetChange={handleTimePresetChange}
                  activeFilterCount={activeFilterCount}
                  onClear={clearOverviewFilters}
                  showUser={false}
                />
              </>
            )}
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">{error}</div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.key} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className={`text-2xl font-bold mt-1.5 ${s.cls}`}>{loading ? '…' : (s.value ?? 0)}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Doanh thu 6 tháng gần đây</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">Giá trị dự án tạo mới trong tháng</p>
          </div>
          {trendSummary && (
            <div className="text-right">
              <p className="text-lg font-bold text-emerald-600 leading-tight">{formatMoneyShort(trendSummary.total)}</p>
              <p className="text-[11px] text-gray-500">{trendSummary.count.toLocaleString('vi-VN')} dự án</p>
            </div>
          )}
        </div>
        {trend.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">Chưa có dữ liệu</p>
        ) : (
          <>
            {trendSummary?.delta && (
              <p className="text-[12px] text-gray-600 mb-3">
                Tháng {trendSummary.current?.month || now.getMonth() + 1}{' '}
                {trendSummary.delta.up ? 'tăng' : 'giảm'}{' '}
                <span className={`font-semibold ${trendSummary.delta.up ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {trendSummary.delta.text}
                </span>
                {trendSummary.prev ? ` so với ${trendSummary.prev.label}` : ''}
                {trendSummary.peak && trendSummary.peak.label !== trendSummary.current?.label ? (
                  <> · Cao nhất {trendSummary.peak.label}: {formatMoneyShort(trendSummary.peak.total)}</>
                ) : null}
              </p>
            )}
            <div className="flex items-end gap-2 sm:gap-3 h-52">
              {trend.map((t, idx) => {
                const h = t.total > 0 ? Math.max(10, Math.round((t.total / maxTrend) * 128)) : 4;
                const shade = 0.28 + (idx / Math.max(1, trend.length - 1)) * 0.72;
                const monthLabel = trendSummary?.mixedYears && t.year
                  ? `T${t.month || String(t.label).replace(/\D/g, '')}/${String(t.year).slice(2)}`
                  : t.label;
                return (
                  <div key={`${t.year || ''}-${t.label}`} className="flex-1 flex flex-col items-center justify-end h-full min-w-0">
                    <p className="text-[10px] font-semibold text-gray-700 tabular-nums mb-1 text-center leading-tight">
                      {formatMoneyBar(t.total)}
                    </p>
                    <div
                      className="w-full max-w-12 rounded-t-md"
                      style={{
                        height: `${h}px`,
                        backgroundColor: `rgba(16,163,74,${shade})`,
                        boxShadow: t.is_current ? '0 0 0 2px rgba(16,163,74,0.25)' : undefined,
                      }}
                      title={`${formatMoneyShort(t.total)} · ${t.count || 0} dự án`}
                    />
                    <p className={`text-xs mt-1.5 font-medium ${t.is_current ? 'text-emerald-700' : 'text-gray-600'}`}>
                      {monthLabel}{t.is_current ? '*' : ''}
                    </p>
                    <p className="text-[10px] text-gray-400 tabular-nums">{t.count || 0} dự án</p>
                  </div>
                );
              })}
            </div>
          </>
        )}
        <p className="text-[11px] text-gray-400 text-right mt-3">
          * Tháng {now.getMonth() + 1} tính đến {pad2(now.getDate())}/{pad2(now.getMonth() + 1)} — chưa hết tháng
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4 md:items-stretch">
        <OverviewCard
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          iconWrap="bg-rose-50 text-rose-600"
          title="Dự án cần chú ý"
          count={(overview?.projects_at_risk || []).length}
          countCls="bg-rose-50 text-rose-700"
          loading={loading && !overview}
          empty={(overview?.projects_at_risk || []).length === 0 ? 'Không có dự án quá hạn hoặc nguy cơ trễ.' : null}
          footer={(
            <LoadMoreBtn
              shown={showProjects}
              total={(overview?.projects_at_risk || []).length}
              onMore={() => setShowProjects((n) => n + LIST_PAGE)}
            />
          )}
        >
          {(overview?.projects_at_risk || []).slice(0, showProjects).map((p) => (
            <OverviewRow
              key={p.id}
              href={`/management/work-unified/${p.id}`}
              title={p.code}
              titleCls="text-violet-700"
              subtitle={p.name}
              delay={p.risk?.level === 'overdue' ? Math.abs(p.days_left) : 0}
              warning={p.risk?.level === 'warning'}
              personName={p.owner_name}
              accent={p.risk?.level === 'overdue' ? 'bg-rose-500' : 'bg-amber-400'}
            />
          ))}
        </OverviewCard>

        <div className="space-y-4 flex flex-col">
          <OverviewCard
            icon={<CalendarDays className="h-3.5 w-3.5" />}
            iconWrap="bg-sky-50 text-sky-600"
            title={dueTasksTitle}
            count={todayTasks.length}
            countCls="bg-sky-50 text-sky-700"
            loading={loading && todayTasks.length === 0 && !overview}
            empty={todayTasks.length === 0 ? dueTasksEmpty : null}
            footer={(
              <LoadMoreBtn
                shown={showToday}
                total={todayTasks.length}
                onMore={() => setShowToday((n) => n + LIST_PAGE)}
              />
            )}
          >
            {todayTasks.slice(0, showToday).map((t) => (
              <OverviewRow
                key={t.unified_id}
                href={getDeepLink(t)}
                title={t.title}
                subtitle={taskProjectSubtitle(t)}
                personName={t.assignee_name || t.effective_assignee_name}
                accent="bg-sky-400"
              />
            ))}
          </OverviewCard>

          <OverviewCard
            icon={<CircleAlert className="h-3.5 w-3.5" />}
            iconWrap="bg-red-50 text-red-600"
            title="Công việc quá hạn"
            titleHref="/management/project-tasks?risk=overdue"
            count={overdueTasks.length}
            countCls="bg-red-50 text-red-700"
            loading={loading && overdueTasks.length === 0 && !overview}
            empty={overdueTasks.length === 0 ? 'Không có việc quá hạn.' : null}
            footer={(
              <LoadMoreBtn
                shown={showOverdue}
                total={overdueTasks.length}
                onMore={() => setShowOverdue((n) => n + LIST_PAGE)}
              />
            )}
          >
            {overdueTasks.slice(0, showOverdue).map((t) => {
              const delay = t.deadline
                ? Math.max(0, Math.round((Date.now() - new Date(t.deadline).getTime()) / 86400000))
                : 0;
              return (
                <OverviewRow
                  key={t.unified_id}
                  href={getDeepLink(t)}
                  title={t.title}
                  subtitle={taskProjectSubtitle(t)}
                  delay={delay}
                  personName={t.assignee_name || t.effective_assignee_name}
                  accent="bg-red-500"
                />
              );
            })}
          </OverviewCard>
        </div>
      </div>
    </div>
  );
}
