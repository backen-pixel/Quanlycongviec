import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Factory,
  FileText,
  GraduationCap,
  Package,
  RefreshCw,
  Search,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import api from '../lib/api';

const PO_STATUS = {
  draft: 'Nháp',
  submitted: 'Đã gửi mua hàng',
  confirmed: 'Đã xác nhận',
  ordered: 'Đã đặt nhà cung cấp',
  partial_received: 'Nhận một phần',
  received: 'Đã nhận',
  cancelled: 'Đã hủy',
};

const FINANCIAL_STATUS = {
  no_quote: 'Chưa báo giá',
  quoted: 'Đã báo giá',
  ordered: 'Đã có đơn hàng',
  invoiced: 'Đã xuất hóa đơn',
};

const CUSTOMER_CASE_STATUS = {
  open: 'Mới tiếp nhận',
  triaged: 'Đã phân loại',
  in_progress: 'Đang xử lý',
  resolved: 'Đã xử lý',
  closed: 'Đã đóng',
  cancelled: 'Đã hủy',
};

const CUSTOMER_CASE_TYPE = {
  warranty: 'Bảo hành',
  service: 'Dịch vụ',
  complaint: 'Khiếu nại',
};

function number(value) {
  return new Intl.NumberFormat('vi-VN').format(Number(value) || 0);
}

function money(value) {
  const amount = Number(value) || 0;
  if (Math.abs(amount) >= 1_000_000_000) return `${(amount / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ`;
  if (Math.abs(amount) >= 1_000_000) return `${(amount / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr`;
  return `${number(amount)} ₫`;
}

function date(value, includeTime = false) {
  if (!value) return 'Chưa đặt hạn';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString('vi-VN', includeTime
    ? { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function isPast(value) {
  return value && new Date(value).getTime() < Date.now();
}

function statusTone(status) {
  const normalized = String(status || '').toLowerCase();
  if (['done', 'completed', 'received', 'invoiced', 'passed', 'resolved', 'closed'].includes(normalized)) return 'bg-emerald-50 text-emerald-700';
  if (['blocked', 'cancelled', 'overdue'].includes(normalized)) return 'bg-red-50 text-red-700';
  if (['in_progress', 'review', 'ordered', 'quoted'].includes(normalized)) return 'bg-blue-50 text-blue-700';
  return 'bg-amber-50 text-amber-700';
}

function MetricCard({ label, value, hint, icon: Icon, tone = 'blue' }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    violet: 'bg-violet-50 text-violet-700',
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_26px_rgba(15,23,42,0.035)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">{value}</p>
        </div>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone] || tones.blue}`}><Icon className="h-4 w-4" /></span>
      </div>
      <p className="mt-2 text-[10px] leading-4 text-slate-500">{hint}</p>
    </div>
  );
}

function ModuleHeader({ eyebrow, title, description, icon: Icon, actionTo, actionLabel, onRefresh, refreshing }) {
  return (
    <section className="flex flex-col gap-5 rounded-[26px] border border-slate-200 bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.05)] lg:flex-row lg:items-end lg:justify-between lg:p-8">
      <div className="flex items-start gap-4">
        <span className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg sm:flex"><Icon className="h-7 w-7" /></span>
        <div>
          <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-blue-700">{eyebrow}</span>
          <h2 className="mt-4 text-3xl font-black tracking-[-0.035em] text-slate-950 sm:text-4xl">{title}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {onRefresh && (
          <button type="button" onClick={onRefresh} disabled={refreshing} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50" aria-label="Tải lại dữ liệu">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        )}
        {actionTo && (
          <Link to={actionTo} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-extrabold text-white hover:bg-slate-800">
            {actionLabel} <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </section>
  );
}

function ModuleState({ loading, error, onRetry, children }) {
  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-slate-200 bg-white">
        <div className="text-center"><RefreshCw className="mx-auto h-6 w-6 animate-spin text-blue-600" /><p className="mt-3 text-xs font-bold text-slate-500">Đang nối dữ liệu thật…</p></div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
        <AlertCircle className="mx-auto h-6 w-6 text-amber-700" />
        <p className="mt-3 text-sm font-extrabold text-slate-900">Chưa mở được dữ liệu module</p>
        <p className="mt-1 text-xs leading-5 text-slate-600">{error}</p>
        <button type="button" onClick={onRetry} className="mt-4 rounded-xl bg-slate-950 px-4 py-2 text-xs font-extrabold text-white">Thử lại</button>
      </div>
    );
  }
  return children;
}

function SearchBox({ value, onChange, placeholder }) {
  return (
    <label className="relative block min-w-0 flex-1 sm:max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs font-semibold text-slate-800 outline-none focus:border-blue-400 focus:bg-white" />
    </label>
  );
}

function EmptyRow({ icon: Icon = AlertCircle, children }) {
  return <div className="flex min-h-48 flex-col items-center justify-center p-8 text-center text-xs text-slate-500"><Icon className="mb-3 h-7 w-7 text-slate-300" />{children}</div>;
}

export function OSWorkView({ companyId }) {
  const [state, setState] = useState({ tasks: [], total: 0, summary: null, loading: true, refreshing: false, error: '' });
  const [search, setSearch] = useState('');
  const [focus, setFocus] = useState('open');
  const [savingId, setSavingId] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!companyId) return;
    setState((current) => ({ ...current, loading: !silent, refreshing: silent, error: '' }));
    try {
      const params = { company_id: companyId, page_size: 120, state_group: focus };
      const [tasksRes, summaryRes] = await Promise.all([
        api.get('/work-tasks', { params }),
        api.get('/work-tasks/summary', { params: { company_id: companyId } }),
      ]);
      setState({ tasks: tasksRes.data?.tasks || [], total: Number(tasksRes.data?.total || 0), summary: summaryRes.data || {}, loading: false, refreshing: false, error: '' });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, refreshing: false, error: error.response?.data?.error || 'Không tải được danh sách công việc.' }));
    }
  }, [companyId, focus]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => state.tasks.filter((task) => {
    const status = String(task.status || '').toLowerCase();
    const done = ['done', 'completed', 'cancelled'].includes(status);
    if (focus === 'open' && done) return false;
    if (focus === 'overdue' && (done || !isPast(task.deadline))) return false;
    if (focus === 'today') {
      const today = new Date().toDateString();
      if (done || !task.deadline || new Date(task.deadline).toDateString() !== today) return false;
    }
    if (focus === 'done' && !done) return false;
    const keyword = search.trim().toLowerCase();
    return !keyword || [task.title, task.project_name, task.lead_title, task.assignee_name].some((value) => String(value || '').toLowerCase().includes(keyword));
  }), [focus, search, state.tasks]);

  const complete = async (task) => {
    setSavingId(task.unified_id);
    try {
      await api.patch(`/work-tasks/${task.source}/${task.source_id}`, { status: 'completed' });
      await load(true);
    } catch (error) {
      setState((current) => ({ ...current, error: error.response?.data?.error || 'Không thể hoàn tất công việc này.' }));
    } finally {
      setSavingId('');
    }
  };

  const summary = state.summary || {};
  const moduleBreakdown = [
    ['crm', 'CRM'],
    ['production', 'Dự án & SX'],
    ['logistics', 'Vận chuyển'],
    ['assignment', 'Giao việc'],
    ['personal', 'Cá nhân'],
  ];
  return (
    <div className="mx-auto max-w-[1540px] space-y-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
      <ModuleHeader eyebrow="Project & Work Unified" title="Trung tâm điều phối công việc" description="Một nguồn công việc thống nhất, theo đúng công ty, xuyên suốt CRM → Dự án → Sản xuất → Vận chuyển." icon={BriefcaseBusiness} actionTo={`/work/tasks-unified?company_id=${companyId}`} actionLabel="Mở bảng công việc đầy đủ" onRefresh={() => load(true)} refreshing={state.refreshing} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Đang mở" value={number(summary.open)} hint="Việc chưa hoàn tất" icon={BriefcaseBusiness} />
        <MetricCard label="Quá hạn" value={number(summary.overdue)} hint="Cần xử lý hoặc điều chỉnh hạn" icon={AlertTriangle} tone="red" />
        <MetricCard label="Đang thực hiện" value={number(summary.by_status?.in_progress)} hint="Bao gồm đang làm và chờ kiểm tra" icon={Clock3} tone="amber" />
        <MetricCard label="Đã hoàn thành" value={number(summary.done)} hint="Trong phạm vi dữ liệu đang xem" icon={CheckCircle2} tone="emerald" />
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Phân bổ nguồn việc</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {moduleBreakdown.map(([key, label]) => <span key={key} className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-extrabold text-slate-700">{label} · {number(summary.by_module?.[key])}</span>)}
            </div>
          </div>
          <Link to={`/management/work-unified?company_id=${companyId}`} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-blue-50 px-4 text-[10px] font-extrabold text-blue-700 hover:bg-blue-100">Xem vòng đời dự án <ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
        <p className="mt-3 text-[9px] font-semibold text-slate-400">Nguồn chuẩn: {summary.metric_contract?.source || 'unified_tasks_v'} · KPI {summary.metric_contract?.version || 'work_kpi_v1'} · phạm vi {summary.metric_contract?.visibility === 'employee' ? 'cá nhân' : 'công ty'}</p>
      </section>
      <ModuleState loading={state.loading} error={state.error} onRetry={() => load()}>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {[['open', 'Cần làm'], ['today', 'Hôm nay'], ['overdue', 'Quá hạn'], ['done', 'Đã xong']].map(([key, label]) => (
                <button key={key} type="button" onClick={() => setFocus(key)} className={`rounded-full px-3 py-1.5 text-[10px] font-extrabold ${focus === key ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{label}</button>
              ))}
            </div>
            <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
              <span className="shrink-0 text-[10px] font-bold text-slate-400">{number(state.total)} việc</span>
              <SearchBox value={search} onChange={setSearch} placeholder="Tìm trong danh sách đang hiển thị…" />
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {filtered.slice(0, 80).map((task) => {
              const done = ['done', 'completed', 'cancelled'].includes(String(task.status || '').toLowerCase());
              return (
                <div key={task.unified_id} className="grid gap-3 px-5 py-4 transition hover:bg-slate-50 lg:grid-cols-[minmax(0,1fr)_160px_135px_110px] lg:items-center">
                  <div className="min-w-0"><p className="truncate text-xs font-extrabold text-slate-900">{task.title || 'Công việc chưa có tên'}</p><p className="mt-1 truncate text-[10px] text-slate-500">{task.project_name || task.lead_title || task.task_kind || 'Công việc chung'}</p></div>
                  <span className="text-[10px] font-semibold text-slate-500">{task.task_kind || 'Khác'}</span>
                  <span className={`text-[10px] font-bold ${!done && isPast(task.deadline) ? 'text-red-600' : 'text-slate-500'}`}>{date(task.deadline)}</span>
                  {!done ? <button type="button" disabled={savingId === task.unified_id} onClick={() => complete(task)} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-emerald-50 px-3 text-[10px] font-extrabold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"><CheckCircle2 className="h-3.5 w-3.5" /> Hoàn tất</button> : <span className="text-[10px] font-extrabold text-emerald-700">Đã hoàn thành</span>}
                </div>
              );
            })}
            {!filtered.length && <EmptyRow icon={CheckCircle2}>Không có công việc trong nhóm này.</EmptyRow>}
          </div>
        </section>
      </ModuleState>
    </div>
  );
}

export function OSOperationsView({ companyId }) {
  const [state, setState] = useState({ data: null, loading: true, refreshing: false, error: '' });
  const [search, setSearch] = useState('');
  const [phase, setPhase] = useState('production');
  const load = useCallback(async (silent = false) => {
    if (!companyId) return;
    setState((current) => ({ ...current, loading: !silent, refreshing: silent, error: '' }));
    try {
      const response = await api.get('/management/operations-queue', { params: { company_id: companyId } });
      setState({ data: response.data || {}, loading: false, refreshing: false, error: '' });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, refreshing: false, error: error.response?.data?.error || 'Không tải được dữ liệu vận hành.' }));
    }
  }, [companyId]);
  useEffect(() => { void load(); }, [load]);
  const stats = state.data?.stats || {};
  const phaseTabs = [
    ['production', 'Sản xuất', stats.production],
    ['delivery', 'Vận chuyển', stats.delivery],
    ['installation', 'Lắp đặt', stats.installation],
    ['attention', 'Cần chú ý', stats.attention],
  ];
  const queue = state.data?.queues?.[phase] || [];
  const filtered = useMemo(() => queue.filter((item) => {
    const keyword = search.trim().toLowerCase();
    return !keyword || [
      item.code,
      item.name,
      item.customer?.full_name,
      item.commercial_record?.title,
      item.workshop_company?.name,
      item.logistics_company?.name,
    ].some((value) => String(value || '').toLowerCase().includes(keyword));
  }), [queue, search]);
  const pipeline = phase === 'attention' ? [] : (state.data?.pipelines?.[phase] || []).filter((stage) => Number(stage.count || 0) > 0);
  return (
    <div className="mx-auto max-w-[1540px] space-y-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
      <ModuleHeader eyebrow="Operations Unified" title="Điều hành sản xuất → vận chuyển → lắp đặt" description="Mỗi Project chỉ xuất hiện một lần trong từng hàng đợi vận hành; Deal được dùng làm ngữ cảnh thương mại, không còn làm sai số lượng dự án." icon={Factory} actionTo={`/management/production-overview?company_id=${companyId}`} actionLabel="Mở Kanban sản xuất cũ" onRefresh={() => load(true)} refreshing={state.refreshing} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Trong luồng sản xuất" value={number(stats.production)} hint={`${number(stats.production_intake)} hồ sơ chờ xưởng tiếp nhận`} icon={Factory} />
        <MetricCard label="Cần chú ý" value={number(stats.attention)} hint={`${number(stats.production_overdue)} hồ sơ sản xuất quá hạn`} icon={AlertTriangle} tone="red" />
        <MetricCard label="Vận chuyển" value={number(stats.delivery)} hint={`${number(stats.delivery_overdue)} hồ sơ đang trễ`} icon={Package} tone="amber" />
        <MetricCard label="Lắp đặt" value={number(stats.installation)} hint={`${number(stats.installation_overdue)} hồ sơ đang trễ`} icon={CheckCircle2} tone="emerald" />
      </div>
      <ModuleState loading={state.loading} error={state.error} onRetry={() => load()}>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                {phaseTabs.map(([key, label, count]) => (
                  <button key={key} type="button" onClick={() => setPhase(key)} className={`rounded-full px-3 py-1.5 text-[10px] font-extrabold ${phase === key ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{label} · {number(count)}</button>
                ))}
              </div>
              <SearchBox value={search} onChange={setSearch} placeholder="Tìm mã, dự án, khách hàng…" />
            </div>
            {!!pipeline.length && (
              <div className="mt-3 flex flex-wrap gap-2">
                {pipeline.map((stage) => <span key={stage.id} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[9px] font-bold text-slate-600">{stage.name} · {number(stage.count)}</span>)}
              </div>
            )}
          </div>
          <div className="divide-y divide-slate-100">
            {filtered.slice(0, 120).map((item) => {
              const displayPhase = phase === 'attention'
                ? (['installation', 'delivery', 'production'].find((key) => item.phases?.includes(key)) || 'production')
                : phase;
              const stage = item.stages?.[displayPhase];
              const owner = displayPhase === 'installation'
                ? item.installation_person
                : displayPhase === 'delivery' ? item.logistics_person : item.production_person;
              const phaseOverdue = item.overdue_by_phase ? !!item.overdue_by_phase[displayPhase] : !!item.overdue;
              return (
                <Link key={item.project_id} to={`/business-os/operations/projects/${item.project_id}?company_id=${companyId}`} className="grid gap-3 px-5 py-4 transition hover:bg-slate-50 lg:grid-cols-[135px_minmax(0,1fr)_190px_170px_130px_24px] lg:items-center">
                  <span className="text-[10px] font-black text-blue-700">{item.code || 'CHƯA CÓ MÃ'}</span>
                  <div className="min-w-0"><p className="truncate text-xs font-extrabold text-slate-900">{item.name || item.commercial_record?.title || 'Dự án chưa đặt tên'}</p><p className="mt-1 truncate text-[10px] text-slate-500">{item.customer?.full_name || 'Chưa gắn khách hàng'} · {owner?.full_name || 'Chưa phân công'}</p></div>
                  <span className="w-fit rounded-full bg-orange-50 px-2.5 py-1 text-[9px] font-extrabold text-orange-700">{stage?.name || (displayPhase === 'production' ? 'Chờ xưởng tiếp nhận' : item.status || 'Chưa xác định')}</span>
                  <span className="truncate text-[10px] font-semibold text-slate-500" title={item.workshop_company?.name || ''}>{displayPhase === 'delivery' || displayPhase === 'installation' ? (item.logistics_company?.short_name || item.logistics_company?.name || 'Chưa chọn đơn vị VC/LĐ') : (item.workshop_company?.short_name || item.workshop_company?.name || 'Chưa chọn xưởng')}</span>
                  <span className={`text-[10px] font-bold ${phase === 'attention' ? (item.overdue ? 'text-red-600' : 'text-amber-700') : (phaseOverdue ? 'text-red-600' : 'text-slate-500')}`}>{phase === 'attention' ? item.attention_reasons?.join(' · ') : (phaseOverdue ? 'Quá hạn' : date(item.deadlines?.[displayPhase]))}</span>
                  <ArrowRight className="h-4 w-4 text-slate-300" />
                </Link>
              );
            })}
            {!filtered.length && <EmptyRow icon={Factory}>Không có Project trong hàng đợi này.</EmptyRow>}
          </div>
        </section>
        <p className="text-[9px] font-semibold text-slate-400">Nguồn chuẩn: {state.data?.metric_contract?.source || 'projects'} · KPI {state.data?.metric_contract?.version || 'operations_kpi_v1'} · đơn vị đếm Project duy nhất</p>
      </ModuleState>
    </div>
  );
}

export function OSPurchasingView({ companyId }) {
  const [state, setState] = useState({ orders: [], products: [], suppliers: [], loading: true, refreshing: false, error: '' });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const load = useCallback(async (silent = false) => {
    if (!companyId) return;
    setState((current) => ({ ...current, loading: !silent, refreshing: silent, error: '' }));
    try {
      const params = { company_id: companyId };
      const results = await Promise.allSettled([
        api.get('/purchasing/orders', { params }),
        api.get('/purchasing/products', { params }),
        api.get('/purchasing/suppliers', { params }),
      ]);
      const denied = results.find((result) => result.status === 'rejected' && result.reason?.response?.status === 403);
      if (denied && results.every((result) => result.status === 'rejected')) throw denied.reason;
      setState({
        orders: results[0].status === 'fulfilled' ? results[0].value.data || [] : [],
        products: results[1].status === 'fulfilled' ? results[1].value.data || [] : [],
        suppliers: results[2].status === 'fulfilled' ? results[2].value.data || [] : [],
        loading: false, refreshing: false, error: '',
      });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, refreshing: false, error: error.response?.data?.error || 'Tài khoản chưa được cấp quyền Mua hàng.' }));
    }
  }, [companyId]);
  useEffect(() => { void load(); }, [load]);
  const openOrders = state.orders.filter((order) => !['received', 'cancelled'].includes(order.status));
  const dueOrders = openOrders.filter((order) => isPast(order.expected_date));
  const totalValue = openOrders.reduce((sum, order) => sum + (Number(order.total) || 0), 0);
  const filtered = useMemo(() => state.orders.filter((order) => {
    if (status && order.status !== status) return false;
    const keyword = search.trim().toLowerCase();
    return !keyword || [order.code, order.title, order.customer_name, order.supplier?.name].some((value) => String(value || '').toLowerCase().includes(keyword));
  }), [search, state.orders, status]);
  return (
    <div className="mx-auto max-w-[1540px] space-y-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
      <ModuleHeader eyebrow="Procurement" title="Mua hàng & nhà cung cấp" description="Theo dõi yêu cầu mua, đơn đặt hàng, ngày giao và danh mục vật tư theo đúng công ty đang chọn." icon={ShoppingCart} actionTo={`/mua-hang?company_id=${companyId}`} actionLabel="Mở nghiệp vụ mua hàng" onRefresh={() => load(true)} refreshing={state.refreshing} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Đơn đang mở" value={number(openOrders.length)} hint="Chưa nhận đủ hoặc chưa kết thúc" icon={ShoppingCart} tone="amber" />
        <MetricCard label="Giá trị đang mua" value={money(totalValue)} hint="Tổng giá trị đơn đang mở" icon={CircleDollarSign} />
        <MetricCard label="Trễ ngày giao" value={number(dueOrders.length)} hint="Cần làm việc lại với nhà cung cấp" icon={AlertTriangle} tone="red" />
        <MetricCard label="Danh mục nguồn" value={number(state.products.length)} hint={`${number(state.suppliers.length)} nhà cung cấp hoạt động`} icon={Package} tone="emerald" />
      </div>
      <ModuleState loading={state.loading} error={state.error} onRetry={() => load()}>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setStatus('')} className={`rounded-full px-3 py-1.5 text-[10px] font-extrabold ${!status ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600'}`}>Tất cả</button>{Object.entries(PO_STATUS).map(([key, label]) => state.orders.some((order) => order.status === key) && <button key={key} type="button" onClick={() => setStatus(status === key ? '' : key)} className={`rounded-full px-3 py-1.5 text-[10px] font-extrabold ${status === key ? 'bg-orange-600 text-white' : 'bg-orange-50 text-orange-700'}`}>{label}</button>)}</div>
            <SearchBox value={search} onChange={setSearch} placeholder="Tìm mã đơn, khách hàng, nhà cung cấp…" />
          </div>
          <div className="divide-y divide-slate-100">
            {filtered.map((order) => (
              <Link key={order.id} to={`/mua-hang/orders/${order.id}`} className="grid gap-3 px-5 py-4 transition hover:bg-orange-50/50 lg:grid-cols-[130px_minmax(0,1fr)_170px_125px_130px_24px] lg:items-center">
                <span className="text-[10px] font-black text-orange-700">{order.code || 'CHƯA CÓ MÃ'}</span>
                <div className="min-w-0"><p className="truncate text-xs font-extrabold text-slate-900">{order.title || order.lead?.title || 'Đơn mua hàng'}</p><p className="mt-1 truncate text-[10px] text-slate-500">{order.customer_name || 'Chưa gắn khách hàng'}</p></div>
                <span className="truncate text-[10px] font-semibold text-slate-600">{order.supplier?.name || 'Chưa chọn nhà cung cấp'}</span>
                <span className="text-right text-[10px] font-extrabold text-slate-900">{money(order.total)}</span>
                <div><span className={`rounded-full px-2.5 py-1 text-[9px] font-extrabold ${statusTone(order.status)}`}>{PO_STATUS[order.status] || order.status}</span><p className={`mt-1 text-[9px] ${isPast(order.expected_date) && !['received', 'cancelled'].includes(order.status) ? 'font-bold text-red-600' : 'text-slate-400'}`}>{date(order.expected_date)}</p></div>
                <ArrowRight className="h-4 w-4 text-slate-300" />
              </Link>
            ))}
            {!filtered.length && <EmptyRow icon={ShoppingCart}>Chưa có đơn mua hàng phù hợp.</EmptyRow>}
          </div>
        </section>
      </ModuleState>
    </div>
  );
}

export function OSFinanceView({ companyId }) {
  const [state, setState] = useState({ summary: null, deals: [], loading: true, refreshing: false, error: '' });
  const [search, setSearch] = useState('');
  const load = useCallback(async (silent = false) => {
    if (!companyId) return;
    setState((current) => ({ ...current, loading: !silent, refreshing: silent, error: '' }));
    try {
      const params = { client_company_id: companyId };
      const [summaryRes, dealsRes] = await Promise.all([
        api.get('/accounting/summary', { params }),
        api.get('/accounting/deals', { params: { ...params, page: 1, limit: 100 } }),
      ]);
      setState({ summary: summaryRes.data || {}, deals: dealsRes.data?.deals || [], loading: false, refreshing: false, error: '' });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, refreshing: false, error: error.response?.data?.error || 'Tài khoản chưa được cấp quyền Kế toán.' }));
    }
  }, [companyId]);
  useEffect(() => { void load(); }, [load]);
  const summary = state.summary || {};
  const filtered = useMemo(() => state.deals.filter((deal) => {
    const keyword = search.trim().toLowerCase();
    return !keyword || [deal.code, deal.title, deal.customer_name, deal.project_name].some((value) => String(value || '').toLowerCase().includes(keyword));
  }), [search, state.deals]);
  return (
    <div className="mx-auto max-w-[1540px] space-y-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
      <ModuleHeader eyebrow="Finance" title="Tài chính vận hành" description="Liên kết trực tiếp deal, dự án, báo giá, đơn hàng, hóa đơn và phần giá trị còn phải thu." icon={FileText} actionTo={`/ketoan/dashboard?client_company_id=${companyId}`} actionLabel="Mở sổ tài chính" onRefresh={() => load(true)} refreshing={state.refreshing} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Giá trị hợp đồng" value={money(summary.total_estimated_value)} hint={`${number(summary.total_deals)} hồ sơ tài chính`} icon={TrendingUp} />
        <MetricCard label="Đã xuất hóa đơn" value={money(summary.total_invoiced_value)} hint="Tổng giá trị hóa đơn ghi nhận" icon={FileText} tone="emerald" />
        <MetricCard label="Còn phải thu" value={money(summary.total_outstanding_value)} hint="Giá trị chưa được ghi nhận đủ" icon={CircleDollarSign} tone="amber" />
        <MetricCard label="SX xong chưa hóa đơn" value={number(summary.count_sx_done_not_invoiced)} hint={money(summary.sx_done_not_invoiced_value)} icon={AlertTriangle} tone="red" />
      </div>
      <ModuleState loading={state.loading} error={state.error} onRetry={() => load()}>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-sm font-extrabold text-slate-950">Hồ sơ tài chính theo dự án</h3><p className="mt-1 text-[10px] text-slate-500">Số liệu được lấy từ chứng từ thật của hệ thống.</p></div><SearchBox value={search} onChange={setSearch} placeholder="Tìm deal, dự án, khách hàng…" /></div>
          <div className="divide-y divide-slate-100">
            {filtered.map((deal) => (
              <Link key={deal.id} to={`/ketoan/deals/${deal.id}?client_company_id=${companyId}`} className="grid gap-3 px-5 py-4 transition hover:bg-emerald-50/40 lg:grid-cols-[125px_minmax(0,1fr)_150px_140px_135px_24px] lg:items-center">
                <span className="text-[10px] font-black text-emerald-700">{deal.code || deal.project_code || 'CHƯA CÓ MÃ'}</span>
                <div className="min-w-0"><p className="truncate text-xs font-extrabold text-slate-900">{deal.title || deal.project_name || 'Hồ sơ tài chính'}</p><p className="mt-1 truncate text-[10px] text-slate-500">{deal.customer_name || 'Chưa gắn khách hàng'} · {deal.workshop_name || 'Chưa xác định xưởng'}</p></div>
                <span className="text-right text-[10px] font-bold text-slate-700">{money(deal.estimated_value)}</span>
                <span className="text-right text-[10px] font-bold text-amber-700">{money(deal.outstanding_amount)}</span>
                <span className={`w-fit rounded-full px-2.5 py-1 text-[9px] font-extrabold ${statusTone(deal.financial_status)}`}>{FINANCIAL_STATUS[deal.financial_status] || deal.financial_status || 'Chưa xác định'}</span>
                <ArrowRight className="h-4 w-4 text-slate-300" />
              </Link>
            ))}
            {!filtered.length && <EmptyRow icon={CircleDollarSign}>Chưa có hồ sơ tài chính cho công ty này.</EmptyRow>}
          </div>
        </section>
      </ModuleState>
    </div>
  );
}

export function OSCustomersView({ companyId }) {
  const [state, setState] = useState({
    customers: [],
    total: 0,
    stats: {},
    care: { summary: {}, plans: [], cases: [] },
    loading: true,
    refreshing: false,
    error: '',
  });
  const [search, setSearch] = useState('');
  const [caseFormOpen, setCaseFormOpen] = useState(false);
  const [caseSaving, setCaseSaving] = useState(false);
  const [caseError, setCaseError] = useState('');
  const [caseForm, setCaseForm] = useState({
    project_id: '',
    case_type: 'warranty',
    priority: 'medium',
    title: '',
    description: '',
  });
  const load = useCallback(async (silent = false) => {
    if (!companyId) return;
    setState((current) => ({ ...current, loading: !silent, refreshing: silent, error: '' }));
    try {
      const [customersResponse, careResponse] = await Promise.all([
        api.get('/customers', { params: { company_id: companyId, limit: 150 } }),
        api.get('/business-os/customer-care/overview', { params: { company_id: companyId } }),
      ]);
      setState({
        customers: customersResponse.data?.customers || [],
        total: customersResponse.data?.total || 0,
        stats: customersResponse.data?.stats || {},
        care: careResponse.data || { summary: {}, plans: [], cases: [] },
        loading: false,
        refreshing: false,
        error: '',
      });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, refreshing: false, error: error.response?.data?.error || 'Không tải được khách hàng.' }));
    }
  }, [companyId]);
  useEffect(() => { void load(); }, [load]);
  const filtered = useMemo(() => state.customers.filter((customer) => {
    const keyword = search.trim().toLowerCase();
    return !keyword || [customer.full_name, customer.phone, customer.email, customer.company].some((value) => String(value || '').toLowerCase().includes(keyword));
  }), [search, state.customers]);
  const careSummary = state.care?.summary || {};
  const carePlans = state.care?.plans || [];
  const cases = state.care?.cases || [];

  const openCaseForm = () => {
    setCaseError('');
    setCaseForm((current) => ({
      ...current,
      project_id: current.project_id || carePlans[0]?.project?.id || '',
    }));
    setCaseFormOpen(true);
  };

  const submitCase = async (event) => {
    event.preventDefault();
    setCaseSaving(true);
    setCaseError('');
    try {
      await api.post('/business-os/customer-care/cases', {
        ...caseForm,
        company_id: companyId,
      });
      setCaseForm({ project_id: '', case_type: 'warranty', priority: 'medium', title: '', description: '' });
      setCaseFormOpen(false);
      await load(true);
    } catch (error) {
      setCaseError(error.response?.data?.error || 'Không tạo được yêu cầu bảo hành.');
    } finally {
      setCaseSaving(false);
    }
  };

  const moveCase = async (item, status) => {
    let resolution;
    if (status === 'resolved') {
      resolution = window.prompt('Ghi kết quả xử lý trước khi đánh dấu đã xử lý:');
      if (!resolution?.trim()) return;
    }
    try {
      await api.patch(`/business-os/customer-care/cases/${item.id}`, { status, resolution });
      await load(true);
    } catch (error) {
      window.alert(error.response?.data?.error || 'Không cập nhật được yêu cầu.');
    }
  };

  const nextCaseAction = (item) => {
    if (item.status === 'open') return ['triaged', 'Tiếp nhận'];
    if (item.status === 'triaged') return ['in_progress', 'Bắt đầu xử lý'];
    if (item.status === 'in_progress') return ['resolved', 'Đã xử lý'];
    if (item.status === 'resolved') return ['closed', 'Đóng hồ sơ'];
    return null;
  };

  return (
    <div className="mx-auto max-w-[1540px] space-y-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
      <ModuleHeader eyebrow="Customer 360" title="Chăm sóc & bảo hành" description="Sales kết thúc sau bàn giao; quy trình sau bán tiếp tục độc lập với lịch chăm sóc 7/30/90 ngày, SLA bảo hành và hồ sơ xử lý truy vết được." icon={Users} actionTo={`/customers?company_id=${companyId}`} actionLabel="Hồ sơ khách hàng" onRefresh={() => load(true)} refreshing={state.refreshing} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Tổng khách hàng" value={number(state.total)} hint="Đúng phạm vi công ty đang chọn" icon={Users} />
        <MetricCard label="Đang chăm sóc" value={number(careSummary.active_plans)} hint={`${number(careSummary.open_care_tasks)} lịch 7/30/90 ngày đang mở`} icon={CalendarClock} tone="violet" />
        <MetricCard label="Case đang mở" value={number(careSummary.open_cases)} hint={`${number(careSummary.warranty_active_plans)} dự án có yêu cầu`} icon={BriefcaseBusiness} tone="amber" />
        <MetricCard label="Quá SLA" value={number((careSummary.overdue_cases || 0) + (careSummary.overdue_care_tasks || 0))} hint={`${number(careSummary.overdue_cases)} case · ${number(careSummary.overdue_care_tasks)} lịch chăm sóc`} icon={AlertTriangle} tone="red" />
      </div>
      <ModuleState loading={state.loading} error={state.error} onRetry={() => load()}>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><h3 className="text-sm font-extrabold text-slate-950">Yêu cầu bảo hành & dịch vụ</h3><p className="mt-1 text-[10px] text-slate-500">Mỗi case có mức ưu tiên, SLA và trạng thái xử lý riêng; không mở lại Deal Sales.</p></div>
            <button type="button" onClick={openCaseForm} disabled={!carePlans.length} className="inline-flex h-10 items-center justify-center rounded-xl bg-violet-600 px-4 text-xs font-extrabold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50">+ Tạo yêu cầu</button>
          </div>
          <div className="divide-y divide-slate-100">
            {cases.slice(0, 30).map((item) => {
              const action = nextCaseAction(item);
              return (
                <div key={item.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[120px_minmax(0,1fr)_130px_120px_120px] lg:items-center">
                  <div><p className="text-[10px] font-black text-violet-700">{item.case_code}</p><p className="mt-1 text-[9px] font-bold uppercase text-slate-400">{CUSTOMER_CASE_TYPE[item.case_type] || item.case_type}</p></div>
                  <div className="min-w-0"><p className="truncate text-xs font-extrabold text-slate-900">{item.title}</p><p className="mt-1 truncate text-[10px] text-slate-500">{item.customer?.full_name || item.project?.name || 'Chưa xác định khách hàng'}</p></div>
                  <span className={`w-fit rounded-full px-2.5 py-1 text-[9px] font-extrabold ${statusTone(item.status)}`}>{CUSTOMER_CASE_STATUS[item.status] || item.status}</span>
                  <div><p className={`text-[10px] font-bold ${item.sla_status === 'overdue' ? 'text-red-700' : 'text-slate-600'}`}>{item.sla_status === 'overdue' ? 'Quá SLA' : 'Hạn SLA'}</p><p className="mt-1 text-[9px] text-slate-400">{date(item.sla_due_at, true)}</p></div>
                  {action ? <button type="button" onClick={() => moveCase(item, action[0])} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-extrabold text-slate-700 hover:bg-slate-50">{action[1]}</button> : <span className="text-[10px] font-bold text-emerald-700">Đã kết thúc</span>}
                </div>
              );
            })}
            {!cases.length && <EmptyRow icon={CheckCircle2}>Chưa có yêu cầu bảo hành. Khi khách phản hồi, tạo case từ đúng dự án đã bàn giao.</EmptyRow>}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 p-4"><h3 className="text-sm font-extrabold text-slate-950">Kế hoạch chăm sóc sau bàn giao</h3><p className="mt-1 text-[10px] text-slate-500">Tự sinh từ mốc hoàn tất lắp đặt; các nhiệm vụ thực thi vẫn nằm trong CRM.</p></div>
          <div className="divide-y divide-slate-100">
            {carePlans.slice(0, 30).map((plan) => (
              <div key={plan.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_150px_150px_120px] lg:items-center">
                <div className="min-w-0"><Link to={`/projects/${plan.project?.id}`} className="truncate text-xs font-extrabold text-slate-900 hover:text-violet-700">{plan.project?.code || 'Dự án'} · {plan.project?.name || plan.deal?.title || 'Hồ sơ sau bán'}</Link><p className="mt-1 truncate text-[10px] text-slate-500">{plan.customer?.full_name || 'Chưa gắn khách hàng'} · Bàn giao {date(plan.installation_completed_at)}</p></div>
                <span className={`w-fit rounded-full px-2.5 py-1 text-[9px] font-extrabold ${plan.current_stage_key === 'warranty_active' ? 'bg-red-50 text-red-700' : 'bg-violet-50 text-violet-700'}`}>{plan.current_stage_key === 'warranty_active' ? 'Đang bảo hành' : plan.status === 'completed' ? 'Đã kết thúc' : 'Đang chăm sóc'}</span>
                <span className="text-[10px] font-bold text-slate-600">{number(plan.open_task_count)} lịch còn mở · {number(plan.open_case_count)} case</span>
                <Link to={`/crm/leads/${plan.deal?.id}`} className="text-[10px] font-extrabold text-blue-700 hover:underline">Mở hồ sơ CRM →</Link>
              </div>
            ))}
            {!carePlans.length && <EmptyRow icon={CalendarClock}>Chưa có dự án hoàn tất lắp đặt để mở quy trình chăm sóc sau bán.</EmptyRow>}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-sm font-extrabold text-slate-950">Danh sách quan hệ khách hàng</h3><p className="mt-1 text-[10px] text-slate-500">Mở từng hồ sơ để xem dự án và lịch sử tương tác.</p></div><SearchBox value={search} onChange={setSearch} placeholder="Tìm tên, số điện thoại, email…" /></div>
          <div className="divide-y divide-slate-100">
            {filtered.map((customer) => (
              <Link key={customer.id} to={`/customers/${customer.id}`} className="grid gap-3 px-5 py-4 transition hover:bg-violet-50/40 lg:grid-cols-[minmax(0,1fr)_160px_190px_140px_24px] lg:items-center">
                <div className="min-w-0"><p className="truncate text-xs font-extrabold text-slate-900">{customer.full_name || customer.company || 'Khách hàng chưa đặt tên'}</p><p className="mt-1 truncate text-[10px] text-slate-500">{customer.company || customer.email || 'Khách hàng cá nhân'}</p></div>
                <span className="text-[10px] font-semibold text-slate-600">{customer.phone || 'Chưa có số điện thoại'}</span>
                <span className="truncate text-[10px] font-semibold text-slate-500">{customer.assigned_user?.full_name || 'Chưa phân công chăm sóc'}</span>
                <span className="w-fit rounded-full bg-violet-50 px-2.5 py-1 text-[9px] font-extrabold text-violet-700">{customer.customer_status?.name || customer.status || 'Mới'}</span>
                <ArrowRight className="h-4 w-4 text-slate-300" />
              </Link>
            ))}
            {!filtered.length && <EmptyRow icon={Users}>Chưa có khách hàng phù hợp.</EmptyRow>}
          </div>
        </section>
      </ModuleState>

      {caseFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true">
          <form onSubmit={submitCase} className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-600">Customer Care</p><h3 className="mt-2 text-xl font-black text-slate-950">Tạo yêu cầu bảo hành</h3></div><button type="button" onClick={() => setCaseFormOpen(false)} className="rounded-lg px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100">Đóng</button></div>
            <div className="mt-5 space-y-4">
              <label className="block text-xs font-bold text-slate-700">Dự án đã bàn giao<select required value={caseForm.project_id} onChange={(event) => setCaseForm((current) => ({ ...current, project_id: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="">Chọn dự án</option>{carePlans.map((plan) => <option key={plan.id} value={plan.project?.id}>{plan.project?.code || 'Dự án'} · {plan.customer?.full_name || plan.project?.name}</option>)}</select></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-bold text-slate-700">Loại yêu cầu<select value={caseForm.case_type} onChange={(event) => setCaseForm((current) => ({ ...current, case_type: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="warranty">Bảo hành</option><option value="service">Dịch vụ</option><option value="complaint">Khiếu nại</option></select></label>
                <label className="block text-xs font-bold text-slate-700">Mức ưu tiên<select value={caseForm.priority} onChange={(event) => setCaseForm((current) => ({ ...current, priority: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="low">Thấp</option><option value="medium">Trung bình</option><option value="high">Cao</option><option value="urgent">Khẩn cấp</option></select></label>
              </div>
              <label className="block text-xs font-bold text-slate-700">Tiêu đề<input required maxLength={240} value={caseForm.title} onChange={(event) => setCaseForm((current) => ({ ...current, title: event.target.value }))} placeholder="VD: Cánh tủ bị xệ sau lắp đặt" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label>
              <label className="block text-xs font-bold text-slate-700">Mô tả hiện trạng<textarea required rows={4} value={caseForm.description} onChange={(event) => setCaseForm((current) => ({ ...current, description: event.target.value }))} placeholder="Ghi rõ vị trí, biểu hiện, thời điểm phát hiện và mong muốn của khách…" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label>
              {caseError && <p className="rounded-xl bg-red-50 p-3 text-xs font-bold text-red-700">{caseError}</p>}
            </div>
            <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setCaseFormOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-extrabold text-slate-600">Hủy</button><button type="submit" disabled={caseSaving} className="rounded-xl bg-violet-600 px-5 py-2.5 text-xs font-extrabold text-white disabled:opacity-50">{caseSaving ? 'Đang tạo…' : 'Tạo case & tính SLA'}</button></div>
          </form>
        </div>
      )}
    </div>
  );
}

export function OSReportsView({ companyId }) {
  const [state, setState] = useState({ data: null, loading: true, refreshing: false, error: '' });
  const load = useCallback(async (silent = false) => {
    if (!companyId) return;
    setState((current) => ({ ...current, loading: !silent, refreshing: silent, error: '' }));
    try {
      const response = await api.get('/management/overview', { params: { company_id: companyId } });
      setState({ data: response.data || {}, loading: false, refreshing: false, error: '' });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, refreshing: false, error: error.response?.data?.error || 'Không tải được báo cáo.' }));
    }
  }, [companyId]);
  useEffect(() => { void load(); }, [load]);
  const kpis = state.data?.kpis || {};
  const pipelineGroups = [
    ['Lead', state.data?.pipelines?.crm_lead || [], 'bg-blue-500'],
    ['Deal', state.data?.pipelines?.crm_deal || [], 'bg-violet-500'],
    ['Sản xuất', state.data?.pipelines?.sx || [], 'bg-orange-500'],
    ['Vận chuyển', state.data?.pipelines?.vc || [], 'bg-amber-500'],
    ['Lắp đặt', state.data?.pipelines?.install || [], 'bg-emerald-500'],
  ];
  return (
    <div className="mx-auto max-w-[1540px] space-y-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
      <ModuleHeader eyebrow="Decision Intelligence" title="Báo cáo & chỉ số" description="Một bức tranh điều hành có thể truy ngược từ chỉ số tới đúng hồ sơ đang tạo ra kết quả hoặc rủi ro." icon={TrendingUp} actionTo={`/management?company_id=${companyId}`} actionLabel="Phân tích chi tiết" onRefresh={() => load(true)} refreshing={state.refreshing} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Giá trị pipeline" value={money(kpis.pipeline_value)} hint={`${number(kpis.crm_deals)} deal đang được theo dõi`} icon={TrendingUp} />
        <MetricCard label="Deal thắng" value={number(kpis.crm_won)} hint={`${number(kpis.crm_leads)} lead đầu vào`} icon={CheckCircle2} tone="emerald" />
        <MetricCard label="Công việc đang mở" value={number(kpis.open_tasks)} hint={`${number(kpis.overdue_tasks)} việc quá hạn`} icon={BriefcaseBusiness} tone="amber" />
        <MetricCard label="Ngoại lệ vận hành" value={number((kpis.sx_overdue || 0) + (kpis.vc_overdue || 0) + (kpis.install_overdue || 0))} hint="Sản xuất, vận chuyển và lắp đặt" icon={AlertTriangle} tone="red" />
      </div>
      <ModuleState loading={state.loading} error={state.error} onRetry={() => load()}>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-extrabold text-slate-950">Dòng chảy hồ sơ theo công đoạn</h3><p className="mt-1 text-[10px] text-slate-500">Quy mô cột thể hiện số hồ sơ đang nằm tại mỗi bước.</p>
            <div className="mt-5 space-y-5">
              {pipelineGroups.map(([name, rows, tone]) => {
                const total = rows.reduce((sum, row) => sum + (Number(row.count) || 0), 0);
                return <div key={name}><div className="mb-2 flex items-center justify-between"><span className="text-xs font-extrabold text-slate-800">{name}</span><span className="text-[10px] font-bold text-slate-400">{number(total)} hồ sơ</span></div><div className="flex h-9 overflow-hidden rounded-xl bg-slate-100">{rows.filter((row) => row.count > 0).map((row) => <div key={row.id || row.name} title={`${row.name}: ${row.count}`} style={{ flexGrow: Math.max(1, Number(row.count) || 0) }} className={`flex min-w-8 items-center justify-center border-r border-white/70 px-2 text-[9px] font-extrabold text-white last:border-0 ${tone}`}><span className="truncate">{row.name} · {row.count}</span></div>)}</div></div>;
              })}
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-extrabold text-slate-950">Cần quyết định</h3><p className="mt-1 text-[10px] text-slate-500">Các ngoại lệ được ưu tiên theo tác động vận hành.</p>
            <div className="mt-4 space-y-3">
              {[
                ['Deal CRM quá hạn', state.data?.urgent?.crm_deal_overdue, '/business-os/sales'],
                ['Hồ sơ chờ tiếp nhận SX', state.data?.urgent?.sx_intake, '/business-os/operations'],
                ['Dự án sản xuất trễ', state.data?.urgent?.sx_overdue, '/business-os/operations'],
                ['Công việc quá hạn', state.data?.urgent?.overdue_tasks, '/business-os/work'],
              ].map(([label, value, to]) => <Link key={label} to={`${to}?company_id=${companyId}`} className="flex items-center justify-between rounded-xl border border-slate-100 p-3 hover:bg-slate-50"><span className="text-[10px] font-bold text-slate-700">{label}</span><span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${value > 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{number(value)}</span></Link>)}
            </div>
          </section>
        </div>
      </ModuleState>
    </div>
  );
}

export function OSKnowledgeView({ companyId }) {
  const [state, setState] = useState({ categories: [], lessons: [], progress: null, loading: true, refreshing: false, error: '' });
  const [search, setSearch] = useState('');
  const load = useCallback(async (silent = false) => {
    if (!companyId) return;
    setState((current) => ({ ...current, loading: !silent, refreshing: silent, error: '' }));
    try {
      const [categoriesRes, lessonsRes, progressRes] = await Promise.all([
        api.get('/knowledge/categories', { params: { company_id: companyId } }),
        api.get('/knowledge/lessons', { params: { company_id: companyId } }),
        api.get('/knowledge/my-progress'),
      ]);
      setState({ categories: categoriesRes.data?.flat || [], lessons: lessonsRes.data?.lessons || [], progress: progressRes.data || {}, loading: false, refreshing: false, error: '' });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, refreshing: false, error: error.response?.data?.error || 'Không tải được kho kiến thức.' }));
    }
  }, [companyId]);
  useEffect(() => { void load(); }, [load]);
  const filtered = useMemo(() => state.lessons.filter((lesson) => {
    const keyword = search.trim().toLowerCase();
    return !keyword || [lesson.title, lesson.summary, lesson.category?.name].some((value) => String(value || '').toLowerCase().includes(keyword));
  }), [search, state.lessons]);
  const completed = state.lessons.filter((lesson) => lesson.progress_status === 'completed').length;
  const inProgress = state.lessons.filter((lesson) => lesson.progress_status === 'in_progress').length;
  const required = state.lessons.filter((lesson) => lesson.is_required).length;
  return (
    <div className="mx-auto max-w-[1540px] space-y-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
      <ModuleHeader eyebrow="Knowledge & SOP" title="Kiến thức doanh nghiệp" description="Kho quy trình, bài học và năng lực được nối trực tiếp với công ty và tiến độ học của người đang đăng nhập." icon={GraduationCap} actionTo={`/knowledge?company_id=${companyId}`} actionLabel="Mở thư viện đầy đủ" onRefresh={() => load(true)} refreshing={state.refreshing} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Chủ đề" value={number(state.categories.length)} hint="Danh mục kiến thức đang hoạt động" icon={BookOpen} />
        <MetricCard label="Bài học" value={number(state.lessons.length)} hint={`${number(required)} bài bắt buộc`} icon={GraduationCap} tone="violet" />
        <MetricCard label="Đang học" value={number(inProgress)} hint="Các bài đang có tiến độ" icon={Clock3} tone="amber" />
        <MetricCard label="Đã hoàn thành" value={number(completed)} hint="Tiến độ của người đăng nhập" icon={CheckCircle2} tone="emerald" />
      </div>
      <ModuleState loading={state.loading} error={state.error} onRetry={() => load()}>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-sm font-extrabold text-slate-950">Bài học có thể bắt đầu</h3><p className="mt-1 text-[10px] text-slate-500">Chỉ hiển thị nội dung đúng công ty và vai trò.</p></div><SearchBox value={search} onChange={setSearch} placeholder="Tìm SOP, bài học, chủ đề…" /></div>
          <div className="grid gap-px bg-slate-200 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((lesson) => (
              <Link key={lesson.id} to={`/knowledge/lessons/${lesson.id}`} className="group bg-white p-5 transition hover:bg-indigo-50/50">
                <div className="flex items-center justify-between"><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[9px] font-extrabold text-indigo-700">{lesson.category?.name || 'Kiến thức chung'}</span><span className={`rounded-full px-2.5 py-1 text-[9px] font-extrabold ${statusTone(lesson.progress_status)}`}>{lesson.progress_status === 'completed' ? 'Đã học' : lesson.progress_status === 'in_progress' ? 'Đang học' : 'Chưa học'}</span></div>
                <h4 className="mt-4 line-clamp-2 text-sm font-extrabold leading-5 text-slate-900">{lesson.title}</h4><p className="mt-2 line-clamp-2 text-[10px] leading-4 text-slate-500">{lesson.summary || 'Mở bài học để xem nội dung và bài tập.'}</p>
                <div className="mt-5 flex items-center justify-between text-[10px] font-bold text-indigo-700"><span>{lesson.is_required ? 'Bắt buộc' : 'Tự chọn'}</span><ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></div>
              </Link>
            ))}
          </div>
          {!filtered.length && <EmptyRow icon={BookOpen}>Chưa có bài học phù hợp cho công ty này.</EmptyRow>}
        </section>
      </ModuleState>
    </div>
  );
}

export function OSModuleView({ moduleKey, companyId }) {
  const views = {
    work: OSWorkView,
    operations: OSOperationsView,
    purchasing: OSPurchasingView,
    finance: OSFinanceView,
    customers: OSCustomersView,
    reports: OSReportsView,
    knowledge: OSKnowledgeView,
  };
  const View = views[moduleKey];
  if (!View) return <div className="p-8 text-sm text-slate-500"><Sparkles className="mb-3 h-5 w-5" />Module đang được cấu hình.</div>;
  return <View companyId={companyId} />;
}
