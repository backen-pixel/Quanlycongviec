import { useEffect, useMemo, useState } from 'react';
import api from '../../lib/api';
import { publicFileUrl } from '../../lib/publicFileUrl';
import { formatVND, formatKpiLedgerNet, getInitials, avatarColor } from '../../lib/utils';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Loader2,
  User,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  buildPipelineDealStackRow,
  PIPELINE_DEAL_STACK_COLORS,
  PIPELINE_DEAL_STACK_ORDER,
} from '../../lib/pipelineDealStackChart';

const STACK_COLORS = PIPELINE_DEAL_STACK_COLORS;

function formatViDate(iso) {
  if (!iso || typeof iso !== 'string') return '—';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function truncLabel(s, max = 20) {
  if (!s) return '—';
  const t = String(s);
  return t.length <= max ? t : `${t.slice(0, Math.max(0, max - 1))}…`;
}

function formatVNDShort(n) {
  const num = Number(n);
  if (!Number.isFinite(num) || num === 0) return '0đ';
  if (Math.abs(num) >= 1e9) {
    return `${(num / 1e9).toFixed(1).replace('.', ',')} tỷ`;
  }
  if (Math.abs(num) >= 1e6) {
    return `${(num / 1e6).toFixed(1).replace('.', ',')} tr`;
  }
  return formatVND(num);
}

const AVATAR_SIZE = {
  sm: 'h-8 w-8 text-[10px]',
  md: 'h-12 w-12 text-base',
  lg: 'h-16 w-16 text-lg',
  xl: 'h-20 w-20 text-2xl',
};

const AVATAR_ROUNDED = {
  full: 'rounded-full',
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
};

function UserAvatar({
  name,
  avatar,
  userId,
  size = 'md',
  rounded = 'xl',
  className = '',
}) {
  const [imgErr, setImgErr] = useState(false);
  useEffect(() => {
    setImgErr(false);
  }, [avatar]);
  const initials = getInitials(name || '?');
  const color = avatarColor(name || userId || '');
  const src = avatar && !imgErr ? publicFileUrl(avatar) : null;
  const dim = AVATAR_SIZE[size] || AVATAR_SIZE.md;
  const round = AVATAR_ROUNDED[rounded] || AVATAR_ROUNDED.xl;

  return (
    <span
      className={`shrink-0 overflow-hidden inline-flex items-center justify-center font-bold text-white shadow-sm ${dim} ${round} ${className}`}
      style={{ backgroundColor: color }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setImgErr(true)}
        />
      ) : (
        initials
      )}
    </span>
  );
}

function resolveAvatar(row, detail) {
  return row?.avatar || detail?.avatar || null;
}

function ChartTooltipBox({ active, payload, label, valueFormatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs min-w-[140px]">
      {label && <p className="font-bold text-slate-800 mb-1.5 border-b border-slate-100 pb-1">{label}</p>}
      <ul className="space-y-1">
        {payload.map((p) => (
          <li key={p.name} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-slate-600">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: p.color || p.fill }} />
              {p.name}
            </span>
            <span className="font-semibold tabular-nums text-slate-900">
              {valueFormatter ? valueFormatter(p.value, p.name) : p.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CollapsibleDataList({ label = 'Bảng số liệu', defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:text-indigo-900"
      >
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        {open ? 'Ẩn' : 'Hiện'} {label}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

function ChartDataTable({ columns, rows, label = 'bảng số liệu' }) {
  if (!rows?.length) return null;
  return (
    <CollapsibleDataList label={label}>
      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              {columns.map((c) => (
                <th key={c.key} className={`py-2 px-2.5 ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row._key ?? i} className="border-t border-slate-100 hover:bg-slate-50/80">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`py-2 px-2.5 tabular-nums ${c.align === 'right' ? 'text-right font-semibold' : 'text-left text-slate-800'}`}
                  >
                    {c.render ? c.render(row) : row[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CollapsibleDataList>
  );
}

function pieSliceLabel({ name, value, percent }) {
  if (!value) return null;
  return `${name}\n${value} (${Math.round(percent * 100)}%)`;
}

export function LeadTypeBreakdownChart({ rows = [], className = '' }) {
  const chartData = useMemo(
    () => (rows || [])
      .filter((r) => (r.lead_count || 0) + (r.deal_count || 0) > 0)
      .slice(0, 12)
      .map((r) => ({
        name: truncLabel(r.lead_type_name, 14),
        Lead: r.lead_count ?? 0,
        Deal: r.deal_count ?? 0,
        _key: r.lead_type_id || r.lead_type_name,
      })),
    [rows],
  );

  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm min-w-0 overflow-hidden ${className}`}>
      <h4 className="text-sm font-bold text-slate-800">Phân loại Lead/Deal</h4>
      <p className="text-[11px] text-slate-500 mt-0.5">Theo loại cấu hình Pipeline</p>
      {chartData.length > 0 ? (
        <>
          <ChartBox height={220}>
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-18} textAnchor="end" height={52} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={28} />
              <RechartsTooltip content={({ active, payload, label }) => (
                <ChartTooltipBox active={active} payload={payload} label={label} valueFormatter={(v) => `${v} cơ hội`} />
              )} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Lead" stackId="t" fill="#6366f1" />
              <Bar dataKey="Deal" stackId="t" fill="#0891b2" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartBox>
          <ChartDataTable
            label="bảng phân loại"
            columns={[
              { key: 'name', label: 'Phân loại' },
              { key: 'Lead', label: 'Lead', align: 'right' },
              { key: 'Deal', label: 'Deal', align: 'right' },
              {
                key: 'total',
                label: 'Tổng',
                align: 'right',
                render: (r) => (r.Lead || 0) + (r.Deal || 0),
              },
            ]}
            rows={chartData}
          />
        </>
      ) : (
        <p className="text-sm text-slate-500 py-10 text-center">Chưa có dữ liệu phân loại</p>
      )}
    </div>
  );
}

export function FirstStageSlaChart({ sla, className = '' }) {
  const pieData = useMemo(() => {
    const onTime = sla?.on_time_count ?? 0;
    const overdue = sla?.overdue_count ?? 0;
    if (!onTime && !overdue) return [];
    return [
      { name: 'Đúng hạn', value: onTime, color: '#059669' },
      { name: 'Quá hạn', value: overdue, color: '#e11d48' },
    ].filter((x) => x.value > 0);
  }, [sla]);

  const open = sla?.open_count ?? 0;
  const stageHint = sla?.stage_labels?.length
    ? sla.stage_labels.join(', ')
    : 'Cột order_index đầu tiên của pipeline';

  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm min-w-0 overflow-hidden ${className}`}>
      <h4 className="text-sm font-bold text-slate-800">SLA cột đầu tiên</h4>
      <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2" title={stageHint}>
        Lead/deal đang mở ở cột đầu · {stageHint}
      </p>
      {open > 0 && pieData.length > 0 ? (
        <>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="rounded-lg bg-emerald-50 border border-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-800 tabular-nums">
              Đúng hạn {sla?.on_time_rate_pct ?? 0}%
            </span>
            <span className="rounded-lg bg-rose-50 border border-rose-100 px-2 py-1 text-[11px] font-semibold text-rose-800 tabular-nums">
              Quá hạn {sla?.overdue_rate_pct ?? 0}%
            </span>
            <span className="rounded-lg bg-slate-50 border border-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 tabular-nums">
              {open} đang ở cột 1
            </span>
          </div>
          <ChartBox height={200}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={42}
                outerRadius={68}
                dataKey="value"
                paddingAngle={2}
                label={pieSliceLabel}
                labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
              >
                {pieData.map((e) => (
                  <Cell key={e.name} fill={e.color} stroke="#fff" strokeWidth={2} />
                ))}
              </Pie>
              <RechartsTooltip content={({ active, payload }) => (
                <ChartTooltipBox active={active} payload={payload} valueFormatter={(v) => `${v} cơ hội`} />
              )} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ChartBox>
          <ChartDataTable
            label="bảng SLA cột đầu"
            columns={[
              { key: 'name', label: 'Trạng thái' },
              { key: 'value', label: 'Số lượng', align: 'right' },
              {
                key: 'pct',
                label: 'Tỷ lệ',
                align: 'right',
                render: (r) => {
                  if (!open) return '—';
                  return `${Math.round((r.value / open) * 1000) / 10}%`;
                },
              },
            ]}
            rows={pieData.map((r) => ({ ...r, _key: r.name }))}
          />
        </>
      ) : (
        <p className="text-sm text-slate-500 py-10 text-center">Không có lead/deal đang ở cột đầu pipeline</p>
      )}
    </div>
  );
}

function computeCancelRatePct(summary, row) {
  if (summary?.cancel_rate_pct != null) return summary.cancel_rate_pct;
  if (row?.cancel_rate_pct != null) return row.cancel_rate_pct;
  const leads = summary?.lead_count ?? row?.lead_count ?? 0;
  const deals = summary?.deal_count ?? row?.deal_count ?? 0;
  const total = leads + deals;
  if (!total) return null;
  const lost = (summary?.lost_lead_count ?? row?.lost_lead_count ?? 0)
    + (summary?.lost_deal_count ?? row?.lost_deal_count ?? 0);
  return Math.round((lost / total) * 1000) / 10;
}

function ChartBox({ height = 256, children }) {
  return (
    <div className="w-full min-w-0" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%" debounce={50}>
        {children}
      </ResponsiveContainer>
    </div>
  );
}

function KpiRing({ pct, label }) {
  const p = Math.min(100, Math.max(0, Number(pct) || 0));
  const r = 52;
  const stroke = 10;
  const norm = r - stroke / 2;
  const circ = 2 * Math.PI * norm;
  const offset = circ - (p / 100) * circ;
  const color = p >= 80 ? '#059669' : p >= 50 ? '#0284c7' : p >= 25 ? '#d97706' : '#e11d48';
  return (
    <div className="flex flex-col items-center justify-center py-2">
      <div className="relative h-28 w-28 shrink-0">
        <svg className="-rotate-90 h-28 w-28" viewBox="0 0 120 120" aria-hidden>
          <circle cx="60" cy="60" r={norm} stroke="#e2e8f0" strokeWidth={stroke} fill="none" />
          <circle
            cx="60"
            cy="60"
            r={norm}
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            fill="none"
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-extrabold tabular-nums text-slate-900">{Math.round(p)}%</span>
          <span className="text-[10px] font-semibold text-slate-500 uppercase">{label}</span>
        </div>
      </div>
    </div>
  );
}

function MetricBlock({ label, value, tone = 'slate', full = false, title }) {
  const tones = {
    blue: 'bg-blue-50 border-blue-100 text-blue-900',
    cyan: 'bg-cyan-50 border-cyan-100 text-cyan-900',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-800',
    amber: 'bg-amber-50 border-amber-100 text-amber-900',
    violet: 'bg-violet-50 border-violet-100 text-violet-900',
    sky: 'bg-sky-50 border-sky-100 text-sky-900',
    rose: 'bg-rose-50 border-rose-100 text-rose-900',
    indigo: 'bg-indigo-50 border-indigo-100 text-indigo-900',
    slate: 'bg-slate-50 border-slate-100 text-slate-800',
  };
  return (
    <div
      className={`rounded-xl border px-3 py-2.5 min-w-0 ${tones[tone] || tones.slate} ${full ? 'col-span-2' : ''}`}
      title={title || (typeof value === 'string' && value.includes('đ') ? value : undefined)}
    >
      <p className="text-[10px] font-bold uppercase tracking-wide opacity-75 truncate">{label}</p>
      <p className="mt-1 text-sm font-bold tabular-nums truncate">{value}</p>
    </div>
  );
}

function OverdueKpiGrid({ row, summary, compact = false }) {
  const overdue = summary?.overdue_count ?? row?.overdue_count ?? 0;
  const overduePct = summary?.overdue_rate_pct ?? row?.overdue_rate_pct;
  const kpi = summary?.kpi_ledger_net ?? row?.kpi_ledger_net ?? 0;
  const open = summary?.open_count ?? row?.open_count ?? 0;
  return (
    <div className={`grid grid-cols-2 gap-2 ${compact ? 'mt-2' : 'mt-3'}`}>
      <MetricBlock
        label="Quá hạn SLA"
        value={overduePct != null ? `${overdue} (${overduePct}%)` : String(overdue)}
        tone="rose"
        title={open ? `${overdue} / ${open} lead-deal đang mở quá hạn SLA cột` : undefined}
      />
      <MetricBlock label="Điểm KPI" value={formatKpiLedgerNet(kpi)} tone="indigo" />
    </div>
  );
}

function ReceptionKpiGrid({ row, summary, slaMinutes = 15, compact = false }) {
  const eligible = summary?.reception_eligible_count ?? row?.reception_eligible_count ?? 0;
  const overdue = summary?.reception_overdue_count ?? row?.reception_overdue_count ?? 0;
  const pct = summary?.reception_overdue_rate_pct ?? row?.reception_overdue_rate_pct;
  if (!eligible) return null;
  return (
    <div className={`grid grid-cols-1 gap-2 ${compact ? 'mt-2' : 'mt-3'}`}>
      <MetricBlock
        label="QH tiếp nhận"
        value={pct != null ? `${overdue}/${eligible} (${pct}%)` : String(overdue)}
        tone="amber"
        title={`Lead chưa cham hoặc cham muộn hơn ${slaMinutes} phút kể từ tạo`}
      />
    </div>
  );
}

function RevenueMetricsGrid({ row, summary, compact = false }) {
  const expected = summary?.expected_value ?? row?.expected_value ?? 0;
  const weighted = summary?.weighted_value ?? row?.weighted_value ?? 0;
  const won = summary?.won_value ?? row?.won_value ?? 0;
  const completed = summary?.completed_value ?? summary?.project_completed_value ?? row?.completed_value ?? 0;
  const fmt = compact ? formatVNDShort : formatVND;
  return (
    <div className={`grid grid-cols-2 gap-2 ${compact ? 'mt-2' : 'mt-3'}`}>
      <MetricBlock label="Dự kiến" value={fmt(expected)} tone="emerald" title={formatVND(expected)} />
      <MetricBlock label="Kỳ vọng" value={fmt(weighted)} tone="amber" title={formatVND(weighted)} />
      <MetricBlock label="Thắng" value={fmt(won)} tone="sky" title={formatVND(won)} />
      <MetricBlock label="Hoàn thành" value={fmt(completed)} tone="violet" title={formatVND(completed)} />
    </div>
  );
}

function EmployeeCard({ row, onClick, receptionSlaMinutes = 15 }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full text-left rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md hover:border-indigo-300 hover:-translate-y-0.5 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
    >
      <div className="flex items-center gap-3 min-w-0">
        <UserAvatar
          name={row.full_name}
          avatar={row.avatar}
          userId={row.user_id}
          size="md"
          rounded="xl"
          className="ring-2 ring-white"
        />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-slate-900 truncate group-hover:text-indigo-800">{row.full_name}</p>
          <p className="text-xs text-slate-500 truncate">{row.department_name || 'Nhân viên kinh doanh'}</p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700 tabular-nums">
            {row.conversion_rate ?? 0}%
          </span>
          {row.reception_overdue_rate_pct != null && (
            <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-800 tabular-nums">
              QH TN {row.reception_overdue_rate_pct}%
            </span>
          )}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <MetricBlock label="Lead" value={row.lead_count ?? 0} tone="blue" />
        <MetricBlock label="Deal" value={row.deal_count ?? 0} tone="cyan" />
      </div>
      <RevenueMetricsGrid row={row} compact />
      <OverdueKpiGrid row={row} compact />
      <ReceptionKpiGrid row={row} slaMinutes={receptionSlaMinutes} compact />
    </button>
  );
}

function SelectedProfileCard({ row, detail, onClose, receptionSlaMinutes = 15 }) {
  const summary = detail?.summary;
  const displayName = row?.full_name || detail?.full_name;

  return (
    <div className="rounded-2xl border border-indigo-100 bg-gradient-to-b from-indigo-50/60 to-white p-4 shadow-sm xl:shrink-0">
      <button
        type="button"
        onClick={onClose}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:text-indigo-900 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Tất cả nhân viên
      </button>
      <div className="flex flex-col items-center text-center">
        <UserAvatar
          name={displayName}
          avatar={resolveAvatar(row, detail)}
          userId={row?.user_id || detail?.user_id}
          size="xl"
          rounded="2xl"
          className="shadow-md ring-4 ring-white"
        />
        <h3 className="mt-3 text-lg font-bold text-slate-900 break-words max-w-full">{displayName}</h3>
        <p className="text-sm text-slate-500">{row?.department_name || detail?.department_name || '—'}</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <MetricBlock label="Lead" value={row?.lead_count ?? summary?.lead_count ?? 0} tone="blue" />
        <MetricBlock label="Deal" value={row?.deal_count ?? summary?.deal_count ?? 0} tone="cyan" />
      </div>
      <RevenueMetricsGrid row={row} summary={summary} />
      <OverdueKpiGrid row={row} summary={summary} />
      <ReceptionKpiGrid row={row} summary={summary} slaMinutes={receptionSlaMinutes} />
      <div className="mt-3 rounded-xl bg-violet-50 border border-violet-100 px-3 py-3 text-center">
        <p className="text-[10px] font-bold uppercase text-violet-700">Tỷ lệ chốt deal</p>
        <p className="text-2xl font-extrabold text-violet-900 tabular-nums">{row?.conversion_rate ?? 0}%</p>
      </div>
    </div>
  );
}

function EmployeeSwitcher({ employees, selectedId, onSelect }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-2 flex flex-col min-h-0 flex-1 xl:overflow-hidden">
      <p className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-2 px-1 flex items-center gap-1">
        <User className="w-3.5 h-3.5" />
        Chọn nhân viên khác
        <span className="ml-auto font-normal normal-case text-slate-400">{employees.length}</span>
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory min-h-0 max-h-[200px] xl:max-h-none xl:flex-1 xl:flex-col xl:overflow-y-auto xl:overflow-x-hidden xl:pb-0 scrollbar-thin">
        {employees.map((emp) => {
          const selected = String(emp.user_id) === String(selectedId);
          return (
            <button
              key={emp.user_id}
              type="button"
              onClick={() => onSelect(emp.user_id)}
              className={`snap-start shrink-0 xl:shrink xl:w-full flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                selected
                  ? 'border-indigo-400 bg-white shadow-sm ring-1 ring-indigo-200'
                  : 'border-transparent bg-white/70 hover:bg-white hover:border-slate-200'
              }`}
            >
              <UserAvatar
                name={emp.full_name}
                avatar={emp.avatar}
                userId={emp.user_id}
                size="sm"
                rounded="full"
              />
              <span className="min-w-0 hidden xl:block flex-1">
                <span className="block text-sm font-semibold text-slate-900 truncate">{emp.full_name}</span>
                <span className="block text-[11px] text-slate-500 truncate">{emp.department_name || '—'}</span>
              </span>
              <span className="xl:hidden text-xs font-bold text-indigo-700 max-w-[72px] truncate">{emp.full_name?.split(' ').slice(-1)[0]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EmployeeCharts({ detail, loading, row, receptionSlaMinutes = 15 }) {
  const summary = detail?.summary;
  const pipelines = detail?.pipelines || [];

  const timelineChart = useMemo(
    () => (detail?.timeline || []).map((d) => ({
      ...d,
      label: formatViDate(d.date),
    })),
    [detail],
  );

  const conversionPie = useMemo(() => {
    const leads = summary?.lead_count ?? row?.lead_count ?? 0;
    const deals = summary?.deal_count ?? row?.deal_count ?? 0;
    const lostLeads = summary?.lost_lead_count ?? row?.lost_lead_count ?? 0;
    const lostDeals = summary?.lost_deal_count ?? row?.lost_deal_count ?? 0;
    const openLeads = Math.max(0, leads - lostLeads);
    const activeDeals = Math.max(0, deals - lostDeals);
    const cancelTotal = lostLeads + lostDeals;
    if (!leads && !deals) return [];
    return [
      { name: 'Deal', value: activeDeals, color: '#0891b2' },
      { name: 'Lead mở', value: openLeads, color: '#c7d2fe' },
      { name: 'Hủy', value: cancelTotal, color: '#e11d48' },
    ].filter((x) => x.value > 0);
  }, [summary, row]);

  const conversionRates = useMemo(() => {
    const leads = summary?.lead_count ?? row?.lead_count ?? 0;
    const deals = summary?.deal_count ?? row?.deal_count ?? 0;
    const leadToDealPct = leads > 0 ? Math.round((deals / leads) * 1000) / 10 : null;
    return {
      leadToDealPct,
      cancelPct: computeCancelRatePct(summary, row),
      overduePct: summary?.overdue_rate_pct ?? row?.overdue_rate_pct ?? null,
    };
  }, [summary, row]);

  const dealOutcomePie = useMemo(() => {
    const won = summary?.won_deal_count ?? row?.won_deal_count ?? 0;
    const lost = summary?.lost_deal_count ?? row?.lost_deal_count ?? 0;
    const open = Math.max(0, (summary?.deal_count ?? row?.deal_count ?? 0) - won - lost);
    return [
      { name: 'Chốt', value: won, color: '#059669' },
      { name: 'Thua', value: lost, color: '#e11d48' },
      { name: 'Đang mở', value: open, color: '#0284c7' },
    ].filter((x) => x.value > 0);
  }, [summary, row]);

  const pipelineBars = useMemo(
    () => pipelines
      .slice()
      .sort((a, b) => (b.total_value || 0) - (a.total_value || 0))
      .slice(0, 8)
      .map((p) => ({
        name: truncLabel(p.pipeline_name, 14),
        value: p.total_value || 0,
      })),
    [pipelines],
  );

  const stackedChart = useMemo(
    () => pipelines
      .filter((p) => (p.deal_count || 0) > 0)
      .slice(0, 8)
      .map((p) => buildPipelineDealStackRow(p, truncLabel(p.pipeline_name, 12))),
    [pipelines],
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[360px] rounded-2xl border border-slate-200 bg-white">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        <p className="mt-3 text-sm text-slate-500">Đang tải biểu đồ…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 min-w-0">
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <MetricBlock label="Giá trị dự kiến" value={formatVND(summary?.expected_value ?? row?.expected_value ?? 0)} tone="emerald" />
        <MetricBlock label="Giá trị kỳ vọng" value={formatVND(summary?.weighted_value ?? row?.weighted_value ?? 0)} tone="amber" />
        <MetricBlock label="GT thắng" value={formatVND(summary?.won_value ?? row?.won_value ?? 0)} tone="sky" />
        <MetricBlock label="GT hoàn thành" value={formatVND(summary?.completed_value ?? summary?.project_completed_value ?? row?.completed_value ?? 0)} tone="violet" />
        <MetricBlock
          label="Quá hạn SLA cột"
          value={
            (summary?.overdue_rate_pct ?? row?.overdue_rate_pct) != null
              ? `${summary?.overdue_count ?? row?.overdue_count ?? 0} (${summary?.overdue_rate_pct ?? row?.overdue_rate_pct}%)`
              : String(summary?.overdue_count ?? row?.overdue_count ?? 0)
          }
          tone="rose"
        />
        <MetricBlock
          label="Quá hạn tiếp nhận"
          value={
            (summary?.reception_overdue_rate_pct ?? row?.reception_overdue_rate_pct) != null
              ? `${summary?.reception_overdue_count ?? row?.reception_overdue_count ?? 0}/${summary?.reception_eligible_count ?? row?.reception_eligible_count ?? 0} (${summary?.reception_overdue_rate_pct ?? row?.reception_overdue_rate_pct}%)`
              : '—'
          }
          tone="amber"
          title={`SLA first touch: ${receptionSlaMinutes} phút`}
        />
        <MetricBlock label="Điểm KPI" value={formatKpiLedgerNet(summary?.kpi_ledger_net ?? row?.kpi_ledger_net ?? 0)} tone="indigo" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LeadTypeBreakdownChart rows={detail?.by_lead_type || []} />
        <FirstStageSlaChart
          sla={detail?.first_stage_sla || (summary?.first_stage_open_count ? {
            open_count: summary.first_stage_open_count,
            on_time_count: summary.first_stage_on_time_count,
            overdue_count: summary.first_stage_overdue_count,
            on_time_rate_pct: summary.first_stage_on_time_rate_pct,
            overdue_rate_pct: summary.first_stage_overdue_rate_pct,
          } : null)}
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-sm min-w-0 overflow-hidden">
        <h3 className="text-base font-bold text-slate-900">Tổng quan pipeline</h3>
        <p className="text-xs text-slate-500 mt-0.5">Lead / Deal / giá trị theo ngày trong kỳ</p>
        {timelineChart.length > 0 ? (
          <>
            <div className="mt-4 min-w-0">
              <ChartBox height={280}>
                <LineChart data={timelineChart} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 10 }} width={32} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} width={44} tickFormatter={(v) => `${Math.round(v / 1e6)}M`} />
                  <RechartsTooltip
                    content={({ active, payload, label }) => (
                      <ChartTooltipBox
                        active={active}
                        payload={payload}
                        label={label}
                        valueFormatter={(v, name) => {
                          if (name === 'GT Lead' || name === 'GT Deal') return formatVND(v);
                          return v;
                        }}
                      />
                    )}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line yAxisId="left" type="monotone" dataKey="lead_count" name="Lead" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  <Line yAxisId="left" type="monotone" dataKey="deal_count" name="Deal" stroke="#0891b2" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  <Line yAxisId="right" type="monotone" dataKey="lead_value" name="GT Lead" stroke="#a5b4fc" strokeWidth={2} dot={{ r: 2 }} strokeDasharray="4 4" />
                  <Line yAxisId="right" type="monotone" dataKey="deal_value" name="GT Deal" stroke="#059669" strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              </ChartBox>
            </div>
            <ChartDataTable
              columns={[
                { key: 'label', label: 'Ngày' },
                { key: 'lead_count', label: 'Lead', align: 'right' },
                { key: 'deal_count', label: 'Deal', align: 'right' },
                { key: 'lead_value', label: 'GT Lead', align: 'right', render: (r) => formatVND(r.lead_value || 0) },
                { key: 'deal_value', label: 'GT Deal', align: 'right', render: (r) => formatVND(r.deal_value || 0) },
              ]}
              rows={timelineChart.map((r) => ({ ...r, _key: r.date }))}
            />
          </>
        ) : (
          <p className="text-sm text-slate-500 py-10 text-center">Chưa có dữ liệu xu hướng</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 min-w-0">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm min-w-0 overflow-hidden">
          <h4 className="text-sm font-bold text-slate-800">Tỷ lệ chuyển đổi</h4>
          <p className="text-[11px] text-slate-500">Lead → Deal · phân bổ cơ hội trong kỳ</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {conversionRates.leadToDealPct != null && (
              <span className="rounded-lg bg-violet-50 border border-violet-100 px-2 py-1 text-[11px] font-semibold text-violet-800 tabular-nums">
                Chuyển đổi {conversionRates.leadToDealPct}%
              </span>
            )}
            <span className="rounded-lg bg-rose-50 border border-rose-100 px-2 py-1 text-[11px] font-semibold text-rose-800 tabular-nums">
              Hủy {conversionRates.cancelPct != null ? `${conversionRates.cancelPct}%` : '—'}
            </span>
            <span className="rounded-lg bg-orange-50 border border-orange-100 px-2 py-1 text-[11px] font-semibold text-orange-900 tabular-nums">
              QH tiếp nhận {row?.reception_overdue_rate_pct != null ? `${row.reception_overdue_rate_pct}%` : '—'}
            </span>
            <span className="rounded-lg bg-amber-50 border border-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-900 tabular-nums">
              QH SLA cột {conversionRates.overduePct != null ? `${conversionRates.overduePct}%` : '—'}
            </span>
          </div>
          {conversionPie.length > 0 ? (
            <>
              <ChartBox height={200}>
                <PieChart>
                  <Pie
                    data={conversionPie}
                    cx="50%"
                    cy="50%"
                    innerRadius={38}
                    outerRadius={62}
                    dataKey="value"
                    paddingAngle={2}
                    label={pieSliceLabel}
                    labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
                  >
                    {conversionPie.map((e) => (
                      <Cell key={e.name} fill={e.color} stroke="#fff" strokeWidth={2} />
                    ))}
                  </Pie>
                  <RechartsTooltip content={({ active, payload }) => (
                    <ChartTooltipBox active={active} payload={payload} valueFormatter={(v) => `${v} cơ hội`} />
                  )} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ChartBox>
              <ChartDataTable
                label="bảng tỷ lệ chuyển đổi"
                columns={[
                  { key: 'name', label: 'Loại' },
                  { key: 'value', label: 'Số lượng', align: 'right' },
                  {
                    key: 'pct',
                    label: 'Tỷ lệ',
                    align: 'right',
                    render: (r) => {
                      const total = conversionPie.reduce((s, x) => s + x.value, 0);
                      if (!total) return '—';
                      return `${Math.round((r.value / total) * 1000) / 10}%`;
                    },
                  },
                ]}
                rows={conversionPie.map((r) => ({ ...r, _key: r.name }))}
              />
            </>
          ) : (
            <p className="text-xs text-slate-400 py-8 text-center">—</p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm min-w-0 overflow-hidden">
          <h4 className="text-sm font-bold text-slate-800">Kết quả Deal</h4>
          <p className="text-[11px] text-slate-500">Chốt / thua / mở</p>
          {dealOutcomePie.length > 0 ? (
            <>
              <ChartBox height={200}>
                <PieChart>
                  <Pie
                    data={dealOutcomePie}
                    cx="50%"
                    cy="50%"
                    innerRadius={38}
                    outerRadius={62}
                    dataKey="value"
                    paddingAngle={2}
                    label={pieSliceLabel}
                    labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
                  >
                    {dealOutcomePie.map((e) => (
                      <Cell key={e.name} fill={e.color} stroke="#fff" strokeWidth={2} />
                    ))}
                  </Pie>
                  <RechartsTooltip content={({ active, payload }) => (
                    <ChartTooltipBox active={active} payload={payload} valueFormatter={(v) => `${v} deal`} />
                  )} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ChartBox>
              <ChartDataTable
                columns={[
                  { key: 'name', label: 'Kết quả' },
                  { key: 'value', label: 'Số deal', align: 'right' },
                ]}
                rows={dealOutcomePie.map((r) => ({ ...r, _key: r.name }))}
              />
            </>
          ) : (
            <p className="text-xs text-slate-400 py-8 text-center">—</p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col items-center justify-center sm:col-span-2 xl:col-span-1 min-w-0">
          <h4 className="text-sm font-bold text-slate-800 self-start w-full">Hiệu suất chốt</h4>
          <KpiRing pct={row?.conversion_rate ?? summary?.win_rate_all_deals_pct ?? 0} label="Chốt deal" />
          <p className="text-xs text-slate-500 text-center">
            {summary?.won_deal_count ?? row?.won_deal_count ?? 0} / {summary?.deal_count ?? row?.deal_count ?? 0} deal
          </p>
        </div>
      </div>

      {pipelineBars.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm min-w-0 overflow-hidden">
          <h4 className="text-sm font-bold text-slate-800">Giá trị theo pipeline</h4>
          <ChartBox height={Math.max(220, pipelineBars.length * 40)}>
            <BarChart data={pipelineBars} layout="vertical" margin={{ left: 4, right: 48, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tickFormatter={(v) => formatVNDShort(v)} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 10 }} />
              <RechartsTooltip content={({ active, payload, label }) => (
                <ChartTooltipBox active={active} payload={payload} label={label} valueFormatter={(v) => formatVND(v)} />
              )} />
              <Bar dataKey="value" name="Giá trị" fill="#6366f1" radius={[0, 4, 4, 0]}>
                <LabelList dataKey="value" position="right" formatter={(v) => formatVNDShort(v)} style={{ fontSize: 10, fill: '#475569' }} />
              </Bar>
            </BarChart>
          </ChartBox>
          <ChartDataTable
            columns={[
              { key: 'name', label: 'Pipeline' },
              { key: 'value', label: 'Giá trị', align: 'right', render: (r) => formatVND(r.value || 0) },
            ]}
            rows={pipelineBars.map((r, i) => ({ ...r, _key: i }))}
          />
        </div>
      )}

      {stackedChart.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm min-w-0 overflow-hidden">
          <h4 className="text-sm font-bold text-slate-800">Deal theo pipeline</h4>
          <p className="text-[11px] text-slate-500 mt-0.5">Chốt / hoàn thành (tím) / thua / mở · HT% = tỉ lệ hoàn thành</p>
          <ChartBox height={Math.max(220, stackedChart.length * 40)}>
            <BarChart data={stackedChart} layout="vertical" margin={{ left: 4, right: 52, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" width={84} tick={{ fontSize: 10 }} />
              <RechartsTooltip
                content={({ active, payload, label }) => (
                  <ChartTooltipBox
                    active={active}
                    payload={payload}
                    label={label}
                    valueFormatter={(v) => `${v} deal`}
                  />
                )}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {PIPELINE_DEAL_STACK_ORDER.map((key) => (
                <Bar
                  key={key}
                  dataKey={key}
                  name={key}
                  stackId="d"
                  fill={STACK_COLORS[key]}
                  radius={key === 'Mở' ? [0, 0, 0, 0] : undefined}
                >
                  {key === 'Mở' && (
                    <LabelList
                      content={({ x, y, width, height, index }) => {
                        const row = stackedChart[index];
                        const pct = row?.completion_rate_pct;
                        if (pct == null) return null;
                        return (
                          <text
                            x={(x || 0) + (width || 0) + 6}
                            y={(y || 0) + (height || 0) / 2}
                            fill="#6d28d9"
                            fontSize={10}
                            fontWeight={600}
                            dominantBaseline="middle"
                          >
                            {`HT ${pct}%`}
                          </text>
                        );
                      }}
                    />
                  )}
                </Bar>
              ))}
            </BarChart>
          </ChartBox>
          <ChartDataTable
            columns={[
              { key: 'name', label: 'Pipeline' },
              { key: 'Chốt', label: 'Chốt', align: 'right' },
              { key: 'Hoàn thành', label: 'HT', align: 'right' },
              { key: 'Thua', label: 'Thua', align: 'right' },
              { key: 'Mở', label: 'Mở', align: 'right' },
              {
                key: 'completion_rate_pct',
                label: 'Tỉ lệ HT',
                align: 'right',
                render: (r) => (r.completion_rate_pct != null ? `${r.completion_rate_pct}%` : '—'),
              },
              {
                key: 'total',
                label: 'Tổng',
                align: 'right',
                render: (r) => (r.Chốt || 0) + (r['Hoàn thành'] || 0) + (r.Thua || 0) + (r.Mở || 0),
              },
            ]}
            rows={stackedChart.map((r, i) => ({ ...r, _key: i }))}
          />
        </div>
      )}
    </div>
  );
}

export default function EmployeeReportPanel({ employees = [], queryParams = {}, typeView = 'all', receptionSlaMinutes = 15 }) {
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const selectable = useMemo(
    () => (employees || []).filter((e) => e.user_id),
    [employees],
  );

  const selectedRow = useMemo(
    () => selectable.find((e) => String(e.user_id) === String(selectedId)),
    [selectable, selectedId],
  );

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setErr(null);
      return undefined;
    }
    let cancel = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const params = {
          date_from: queryParams.date_from,
          date_to: queryParams.date_to,
          ...(queryParams.company_id ? { company_id: queryParams.company_id } : {}),
          ...(queryParams.region_id ? { region_id: queryParams.region_id } : {}),
          ...(typeView !== 'all' ? { type: typeView } : {}),
        };
        const { data } = await api.get(`/crm/reports/staff-lead-deal/${selectedId}/pipelines`, { params });
        if (!cancel) setDetail(data);
      } catch (e) {
        if (!cancel) {
          setErr(e.response?.data?.error || e.message);
          setDetail(null);
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [selectedId, queryParams.date_from, queryParams.date_to, queryParams.company_id, queryParams.region_id, typeView]);

  useEffect(() => {
    if (selectedId && !selectable.some((e) => String(e.user_id) === String(selectedId))) {
      setSelectedId(null);
    }
  }, [selectable, selectedId]);

  if (!selectable.length) {
    return <p className="text-center text-sm text-slate-500 py-12">Chưa có dữ liệu nhân viên</p>;
  }

  if (!selectedId) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
        {selectable.map((emp) => (
          <EmployeeCard key={emp.user_id} row={emp} onClick={() => setSelectedId(emp.user_id)} receptionSlaMinutes={receptionSlaMinutes} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col xl:flex-row gap-4 xl:gap-5 min-w-0 xl:items-start">
      <aside className="w-full xl:w-[280px] shrink-0 min-w-0 flex flex-col gap-3 xl:sticky xl:top-4 xl:max-h-[calc(100vh-6rem)] xl:overflow-hidden">
        <SelectedProfileCard row={selectedRow} detail={detail} onClose={() => setSelectedId(null)} receptionSlaMinutes={receptionSlaMinutes} />
        <EmployeeSwitcher employees={selectable} selectedId={selectedId} onSelect={setSelectedId} />
      </aside>
      <main className="flex-1 min-w-0">
        {err && (
          <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
        )}
        <EmployeeCharts detail={detail} loading={loading} row={selectedRow} receptionSlaMinutes={receptionSlaMinutes} />
      </main>
    </div>
  );
}
