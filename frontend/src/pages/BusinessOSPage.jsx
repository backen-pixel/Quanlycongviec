import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarRange,
  Database,
  Factory,
  Gauge,
  LayoutDashboard,
  Loader2,
  LockKeyhole,
  Menu,
  Network,
  RefreshCcw,
  Settings2,
  ShieldCheck,
  TriangleAlert,
  X,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isPlatformAdmin } from '../lib/adminRole';
import FounderCockpit from '../business-os/FounderCockpit';
import {
  BUSINESS_OS_SNAPSHOT_MAX_AGE_MS,
  assertBusinessOsSnapshot,
  businessOsErrorMessage,
} from '../business-os/businessOsContract';

const PERIODS = [
  { key: 'week', label: 'Tuần' },
  { key: 'month', label: 'Tháng' },
  { key: 'quarter', label: 'Quý' },
];

const NAV_ITEMS = [
  { href: '#six-systems', label: 'Tổng quan 6 hệ', icon: LayoutDashboard },
  { href: '#planning', label: 'Kế hoạch & dự báo', icon: CalendarRange },
  { href: '#capacity', label: 'Workload & năng lực', icon: Gauge },
  { href: '#manufacturing', label: 'Hai công ty sản xuất', icon: Factory },
  { href: '#decisions', label: 'Decision Center', icon: TriangleAlert },
  { href: '#platform-capabilities', label: 'Full Platform V1', icon: Network },
  { href: '#modules', label: 'Kết nối module', icon: Database },
  { href: '#configuration', label: 'Configuration Center', icon: Settings2 },
];

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'medium',
  timeStyle: 'medium',
});

function todayIsoDate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function validIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function initialQueryValue(search, key, fallback = '') {
  const value = new URLSearchParams(search).get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function formatGeneratedAt(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : DATE_TIME_FORMATTER.format(date);
}

function LoadingState() {
  return (
    <div className="flex min-h-[56vh] items-center justify-center rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700">
          <Loader2 className="h-6 w-6 animate-spin" />
        </span>
        <h2 className="mt-4 text-base font-black text-slate-950">Đang xác minh nguồn dữ liệu thật</h2>
        <p className="mt-1 text-xs text-slate-500">Cockpit chỉ mở khi hợp đồng, phạm vi và 6 hệ đều hợp lệ.</p>
      </div>
    </div>
  );
}

function FailClosedState({ message, onRetry, missingScope = false }) {
  return (
    <div className="mx-auto flex min-h-[56vh] max-w-3xl items-center justify-center">
      <div className="w-full rounded-3xl border border-rose-200 bg-white p-7 text-center shadow-sm sm:p-10">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-700">
          {missingScope ? <LockKeyhole className="h-7 w-7" /> : <AlertTriangle className="h-7 w-7" />}
        </span>
        <p className="mt-4 text-[10px] font-black uppercase tracking-[0.18em] text-rose-600">Live Mode · Fail closed</p>
        <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">
          {missingScope ? 'Chưa có phạm vi đủ điều kiện' : 'Dữ liệu vận hành đã được khóa'}
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">{message}</p>
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs leading-5 text-slate-600">
          Không hiển thị dữ liệu mẫu, không đổi giá trị thiếu thành 0 và không giữ dữ liệu của phạm vi trước.
        </div>
        {onRetry ? (
          <button type="button" onClick={onRetry} className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-extrabold text-white hover:bg-slate-800">
            <RefreshCcw className="h-4 w-4" /> Xác minh lại
          </button>
        ) : null}
      </div>
    </div>
  );
}

function CockpitSidebar({ open, onClose, user }) {
  return (
    <>
      {open ? <button type="button" aria-label="Đóng menu" onClick={onClose} className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm xl:hidden" /> : null}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[278px] flex-col bg-[#0d1220] text-white shadow-2xl transition-transform duration-200 xl:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-[76px] items-center gap-3 border-b border-white/[0.08] px-5">
          <span className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-blue-500 to-cyan-400 shadow-lg shadow-indigo-950/50">
            <BarChart3 className="h-5 w-5" />
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-emerald-300 ring-2 ring-indigo-600" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black tracking-tight">Business AI OS</p>
            <p className="mt-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">Internal Live Operation V1</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white xl:hidden" aria-label="Đóng menu">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-white/[0.08] px-4 py-4">
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] px-3 py-3">
            <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-emerald-300">
              <ShieldCheck className="h-4 w-4" /> Live · Read only
            </p>
            <p className="mt-1 text-[10px] leading-4 text-slate-400">Không ghi DB · Không dữ liệu mẫu · Theo đúng quyền đăng nhập</p>
          </div>
        </div>

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4">
          <p className="px-3 pb-2 text-[9px] font-black uppercase tracking-[0.18em] text-slate-600">Điều hành Founder</p>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <a key={item.href} href={item.href} onClick={onClose} className="flex h-10 items-center gap-3 rounded-xl px-3 text-xs font-bold text-slate-400 transition hover:bg-white/[0.07] hover:text-white">
                <Icon className="h-[17px] w-[17px]" />
                <span>{item.label}</span>
              </a>
            );
          })}
        </nav>

        <div className="border-t border-white/[0.08] p-3">
          <div className="flex items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-[10px] leading-4 text-slate-400">
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Founder-local chỉ mở drill-down read-only đã được backend chứng thực.</span>
          </div>
          <div className="mt-2 flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-[10px] font-black">
              {String(user?.full_name || user?.email || 'F').trim().slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-bold text-slate-200">{user?.full_name || user?.email}</p>
              <p className="mt-0.5 truncate text-[9px] uppercase tracking-wide text-slate-500">{user?.role}</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function ScopeFilters({
  ecosystemId,
  setEcosystemId,
  ecosystems,
  companyId,
  setCompanyId,
  companies,
  period,
  setPeriod,
  periodAnchor,
  setPeriodAnchor,
  platformAdmin,
  metadataLoading,
}) {
  const selectedCompanyKnown = companyId === 'all' || companies.some((company) => String(company.id) === String(companyId));
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 lg:grid-cols-[minmax(190px,1fr)_minmax(190px,1fr)_auto_170px] lg:items-end">
        <label className="block">
          <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Hệ sinh thái</span>
          <div className="relative mt-1">
            <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <select
              value={ecosystemId}
              onChange={(event) => setEcosystemId(event.target.value)}
              disabled={!platformAdmin || metadataLoading}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs font-bold text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-500"
            >
              {!ecosystemId ? <option value="">Chưa xác định</option> : null}
              {ecosystemId && !ecosystems.some((item) => String(item.id) === String(ecosystemId)) ? <option value={ecosystemId}>Hệ sinh thái hiện tại</option> : null}
              {ecosystems.map((item) => <option key={item.id} value={item.id}>{item.name || item.slug || item.id}</option>)}
            </select>
          </div>
        </label>

        <label className="block">
          <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Công ty</span>
          <select
            value={companyId}
            onChange={(event) => setCompanyId(event.target.value)}
            disabled={metadataLoading || !ecosystemId}
            className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-500"
          >
            <option value="all">Toàn hệ sinh thái</option>
            {!selectedCompanyKnown && companyId ? <option value={companyId}>Công ty đang chọn</option> : null}
            {companies.map((company) => <option key={company.id} value={company.id}>{company.short_name || company.name}</option>)}
          </select>
        </label>

        <div>
          <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Chu kỳ</span>
          <div className="mt-1 flex h-10 rounded-xl border border-slate-200 bg-slate-50 p-1">
            {PERIODS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setPeriod(item.key)}
                className={`rounded-lg px-3 text-xs font-black transition ${period === item.key ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Ngày neo kỳ</span>
          <input
            type="date"
            value={periodAnchor}
            onChange={(event) => setPeriodAnchor(event.target.value)}
            className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </label>
      </div>
    </section>
  );
}

export default function BusinessOSPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const platformAdmin = isPlatformAdmin(user);
  const initialSearch = useRef(location.search);
  const requestSequence = useRef(0);
  const snapshotRef = useRef(null);

  const [ecosystemId, setEcosystemId] = useState(() => initialQueryValue(initialSearch.current, 'ecosystem_id', user?.tenant_id || ''));
  const [companyId, setCompanyId] = useState(() => initialQueryValue(initialSearch.current, 'company_id', user?.company_id || 'all'));
  const [period, setPeriod] = useState(() => {
    const requested = initialQueryValue(initialSearch.current, 'period', 'week');
    return PERIODS.some((item) => item.key === requested) ? requested : 'week';
  });
  const [periodAnchor, setPeriodAnchor] = useState(() => {
    const requested = initialQueryValue(initialSearch.current, 'period_anchor', todayIsoDate());
    return validIsoDate(requested) ? requested : todayIsoDate();
  });
  const [ecosystems, setEcosystems] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [metadataLoading, setMetadataLoading] = useState(true);
  const [metadataError, setMetadataError] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!ecosystemId && user?.tenant_id) setEcosystemId(String(user.tenant_id));
    if ((!companyId || companyId === 'all') && user?.company_id) setCompanyId(String(user.company_id));
  }, [companyId, ecosystemId, user?.company_id, user?.tenant_id]);

  useEffect(() => {
    let active = true;
    const loadMetadata = async () => {
      setMetadataLoading(true);
      setMetadataError('');
      try {
        const response = await api.get('/business-os/metadata', {
          founderLocalControlPlane: true,
        });
        if (!active) return;
        const companyRows = Array.isArray(response.data?.companies) ? response.data.companies : null;
        const verifiedEcosystem = response.data?.ecosystem;
        if (!companyRows || !verifiedEcosystem?.id) {
          throw new Error('Metadata Founder-local không mang phạm vi hệ sinh thái đã xác minh.');
        }
        setCompanies(companyRows);
        setEcosystems([verifiedEcosystem]);
        if (!ecosystemId || String(ecosystemId) !== String(verifiedEcosystem.id)) {
          setEcosystemId(String(verifiedEcosystem.id));
        }
      } catch (metadataRequestError) {
        if (active) {
          setCompanies([]);
          setMetadataError(businessOsErrorMessage(metadataRequestError));
        }
      } finally {
        if (active) setMetadataLoading(false);
      }
    };
    void loadMetadata();
    return () => { active = false; };
  }, [ecosystemId]);

  const scopedCompanies = useMemo(() => {
    if (!platformAdmin || !ecosystemId) return companies;
    return companies.filter((company) => !company.tenant_id || String(company.tenant_id) === String(ecosystemId));
  }, [companies, ecosystemId, platformAdmin]);

  useEffect(() => {
    if (!platformAdmin || companyId === 'all') return;
    const selected = companies.find((company) => String(company.id) === String(companyId));
    if (selected?.tenant_id && String(selected.tenant_id) !== String(ecosystemId)) setCompanyId('all');
  }, [companies, companyId, ecosystemId, platformAdmin]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (ecosystemId) params.set('ecosystem_id', ecosystemId); else params.delete('ecosystem_id');
    params.set('company_id', companyId || 'all');
    params.set('period', period);
    params.set('period_anchor', periodAnchor);
    const nextSearch = `?${params.toString()}`;
    if (nextSearch !== location.search) navigate({ pathname: location.pathname, search: nextSearch }, { replace: true });
  }, [companyId, ecosystemId, location.pathname, location.search, navigate, period, periodAnchor]);

  const loadSnapshot = useCallback(async ({ background = false } = {}) => {
    if (!ecosystemId || !companyId || !validIsoDate(periodAnchor)) {
      snapshotRef.current = null;
      setSnapshot(null);
      setError('Cần hệ sinh thái, công ty và ngày neo kỳ hợp lệ trước khi đọc dữ liệu thật.');
      return;
    }
    const requestId = ++requestSequence.current;
    const previousGeneratedAt = Date.parse(snapshotRef.current?.generated_at || '');
    if (background && (!Number.isFinite(previousGeneratedAt)
      || Date.now() - previousGeneratedAt > BUSINESS_OS_SNAPSHOT_MAX_AGE_MS)) {
      snapshotRef.current = null;
      setSnapshot(null);
    }
    if (background) setRefreshing(true); else setLoading(true);
    setError('');
    if (!background) {
      snapshotRef.current = null;
      setSnapshot(null);
    }
    try {
      const response = await api.get('/business-os', {
        params: {
          ecosystem_id: ecosystemId,
          company_id: companyId,
          period,
          period_anchor: periodAnchor,
        },
        timeout: 20_000,
      });
      if (requestId !== requestSequence.current) return;
      const verified = assertBusinessOsSnapshot(response.data, {
        ecosystemId,
        companyId,
        period,
      });
      snapshotRef.current = verified;
      setSnapshot(verified);
      setError('');
    } catch (requestError) {
      if (requestId !== requestSequence.current) return;
      // Fail closed: a failed refresh invalidates the visible operational snapshot.
      snapshotRef.current = null;
      setSnapshot(null);
      setError(businessOsErrorMessage(requestError));
    } finally {
      if (requestId === requestSequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [companyId, ecosystemId, period, periodAnchor]);

  useEffect(() => {
    snapshotRef.current = null;
    setSnapshot(null);
    void loadSnapshot();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadSnapshot({ background: true });
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [loadSnapshot]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState !== 'visible') return;
      snapshotRef.current = null;
      setSnapshot(null);
      void loadSnapshot();
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => document.removeEventListener('visibilitychange', refreshWhenVisible);
  }, [loadSnapshot]);


  const scopeReady = Boolean(ecosystemId && companyId && validIsoDate(periodAnchor));

  return (
    <div data-testid="business-os-root" className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <CockpitSidebar open={menuOpen} onClose={() => setMenuOpen(false)} user={user} />
      <div className="min-h-screen xl:pl-[278px]">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xl">
          <div className="flex min-h-[76px] items-center gap-3 px-4 sm:px-6 xl:px-8">
            <button type="button" onClick={() => setMenuOpen(true)} className="rounded-xl border border-slate-200 p-2.5 text-slate-600 xl:hidden" aria-label="Mở menu">
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-base font-black tracking-tight text-slate-950 sm:text-lg">Founder Executive Cockpit</h1>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Live read-only
                </span>
              </div>
              <p className="mt-1 truncate text-[10px] text-slate-500">
                {snapshot ? `Cập nhật ${formatGeneratedAt(snapshot.generated_at)}` : 'Chưa có snapshot đã xác minh'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadSnapshot({ background: true })}
              disabled={!scopeReady || loading || refreshing}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:border-indigo-300 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCcw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Làm mới</span>
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-[1800px] px-4 py-5 sm:px-6 xl:px-8">
          <ScopeFilters
            ecosystemId={ecosystemId}
            setEcosystemId={setEcosystemId}
            ecosystems={ecosystems}
            companyId={companyId}
            setCompanyId={setCompanyId}
            companies={scopedCompanies}
            period={period}
            setPeriod={setPeriod}
            periodAnchor={periodAnchor}
            setPeriodAnchor={setPeriodAnchor}
            platformAdmin={platformAdmin}
            metadataLoading={metadataLoading}
          />

          {metadataError ? (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Không tải được danh mục phạm vi: {metadataError}. Cockpit vẫn chỉ gọi phạm vi ID đang hiển thị.</span>
            </div>
          ) : null}

          <div className="mt-7">
            {!scopeReady ? (
              <FailClosedState missingScope message="Tài khoản hoặc URL chưa cung cấp ecosystem_id/company_id hợp lệ. Không thể mở dữ liệu ngoài một phạm vi đã xác định." />
            ) : loading && !snapshot ? (
              <LoadingState />
            ) : error && !snapshot ? (
              <FailClosedState message={error} onRetry={() => void loadSnapshot()} />
            ) : snapshot ? (
              <>
                <div className="mb-7 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-950 px-5 py-4 text-white sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10"><ShieldCheck className="h-5 w-5 text-emerald-300" /></span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black">Snapshot đã qua cổng hợp đồng & phạm vi</p>
                      <p className="mt-0.5 truncate text-[10px] text-slate-400">
                        {snapshot.scope.level} · {snapshot.planning.selected_period.label || snapshot.period.label || period}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[9px] font-black uppercase tracking-wide">
                    <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-emerald-300">{snapshot.contract_version}</span>
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-slate-300">{snapshot.mode}</span>
                  </div>
                </div>
                <FounderCockpit snapshot={snapshot} onRefresh={loadSnapshot} />
              </>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
