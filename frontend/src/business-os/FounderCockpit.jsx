import { createContext, useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarRange,
  Database,
  Factory,
  Gauge,
  Layers3,
  LockKeyhole,
  Network,
  Settings2,
  ShieldCheck,
  Target,
  Users,
  WifiOff,
} from 'lucide-react';
import api from '../lib/api';
import {
  commitFounderLocalCompanyScopeFromVerifiedDrilldown,
  safeFounderLocalDrilldownHref,
} from './founderLocalReadOnly';
import {
  BUSINESS_OS_PLATFORM_STATUSES,
  BUSINESS_OS_STATUSES,
  FOUNDER_ADVISORY_CONFIGURATION_KEYS,
  safeBusinessOsHref,
} from './businessOsContract';

const STATUS_STYLES = {
  LIVE: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  'LIVE WITH DATA GAPS': 'border-amber-200 bg-amber-50 text-amber-800',
  'UNDER RECONCILIATION': 'border-blue-200 bg-blue-50 text-blue-700',
  'NOT CONNECTED': 'border-slate-200 bg-slate-100 text-slate-600',
  BLOCKED: 'border-rose-200 bg-rose-50 text-rose-700',
  'FOUNDER DECISION REQUIRED': 'border-violet-200 bg-violet-50 text-violet-700',
  SANDBOX: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700',
};

const STATUS_LABELS = {
  LIVE: 'LIVE',
  'LIVE WITH DATA GAPS': 'LIVE · CÓ KHOẢNG TRỐNG',
  'UNDER RECONCILIATION': 'ĐANG ĐỐI SOÁT',
  'NOT CONNECTED': 'CHƯA KẾT NỐI',
  BLOCKED: 'BỊ CHẶN',
  'FOUNDER DECISION REQUIRED': 'CẦN FOUNDER QUYẾT ĐỊNH',
  SANDBOX: 'SANDBOX',
};

const SYSTEM_ACCENTS = [
  { panel: 'from-indigo-50 to-white', icon: 'bg-indigo-600', line: 'bg-indigo-500' },
  { panel: 'from-sky-50 to-white', icon: 'bg-sky-600', line: 'bg-sky-500' },
  { panel: 'from-emerald-50 to-white', icon: 'bg-emerald-600', line: 'bg-emerald-500' },
  { panel: 'from-amber-50 to-white', icon: 'bg-amber-600', line: 'bg-amber-500' },
  { panel: 'from-cyan-50 to-white', icon: 'bg-cyan-600', line: 'bg-cyan-500' },
  { panel: 'from-violet-50 to-white', icon: 'bg-violet-600', line: 'bg-violet-500' },
];

const SYSTEM_ICONS = [Target, Layers3, Users, Factory, BarChart3, ShieldCheck];
const FounderLocalDrilldownScopeContext = createContext('');

const METRIC_LABELS = {
  active_people: 'Nhân sự hoạt động',
  active_projects: 'Dự án hoạt động',
  blocked: 'Bị chặn',
  completed: 'Hoàn thành',
  done: 'Đã hoàn thành',
  due: 'Đến hạn trong kỳ',
  due_in_period: 'Đến hạn trong kỳ',
  load_per_active_person: 'Tải / nhân sự',
  open: 'Đang mở',
  open_work: 'Công việc đang mở',
  overdue: 'Quá hạn',
  overdue_projects: 'Dự án quá hạn',
  overdue_work: 'Công việc quá hạn',
  production_projects: 'Dự án sản xuất',
  projects_due: 'Dự án đến hạn',
  capacity_gap: 'Khoảng thiếu năng lực',
  total: 'Tổng',
  utilization_status: 'Trạng thái sử dụng',
};

const DATE_FORMATTER = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'medium',
  timeStyle: 'short',
});
const NUMBER_FORMATTER = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });

function humanizeKey(key) {
  const normalized = String(key || '').trim();
  if (!normalized) return 'Chỉ số';
  if (METRIC_LABELS[normalized]) return METRIC_LABELS[normalized];
  return normalized
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toLocaleUpperCase('vi-VN'));
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : DATE_FORMATTER.format(date);
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return NUMBER_FORMATTER.format(value);
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((item) => formatValue(item)).filter(Boolean).join(' · ') || null;
  if (typeof value === 'object') {
    if (value.value !== null && value.value !== undefined) {
      const main = formatValue(value.value);
      return [main, value.unit].filter(Boolean).join(' ');
    }
    if (value.label) return String(value.label);
    if (value.status) return String(value.status);
    if (value.state) return String(value.state);
  }
  return null;
}

function pickMetrics(source, keys) {
  return Object.fromEntries(
    keys
      .filter((key) => source?.[key] !== null && source?.[key] !== undefined)
      .map((key) => [key, source[key]]),
  );
}

function StatusBadge({ status, compact = false }) {
  const safeStatus = BUSINESS_OS_PLATFORM_STATUSES.includes(status) ? status : 'NOT CONNECTED';
  return (
    <span className={`inline-flex items-center rounded-full border font-black tracking-wide ${compact ? 'px-2 py-0.5 text-[9px]' : 'px-2.5 py-1 text-[10px]'} ${STATUS_STYLES[safeStatus]}`}>
      {STATUS_LABELS[safeStatus]}
    </span>
  );
}

function EmptyEvidence({ children = 'Nguồn thật chưa trả dữ liệu đã xác minh.' }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-500">
      <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function MetricGrid({ metrics, columns = 'grid-cols-2', dense = false }) {
  const entries = Object.entries(metrics || {}).flatMap(([key, value]) => {
    if (formatValue(value) !== null) return [{ key, label: humanizeKey(key), value }];
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    return Object.entries(value)
      .filter(([, nestedValue]) => formatValue(nestedValue) !== null)
      .map(([nestedKey, nestedValue]) => ({
        key: `${key}.${nestedKey}`,
        label: `${humanizeKey(key)} · ${humanizeKey(nestedKey)}`,
        value: nestedValue,
      }));
  });
  if (!entries.length) return <EmptyEvidence />;
  return (
    <div className={`grid ${columns} gap-2`}>
      {entries.slice(0, 8).map((entry) => (
        <div key={entry.key} className={`rounded-xl border border-slate-200 bg-white ${dense ? 'px-3 py-2.5' : 'p-3.5'}`}>
          <p className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-500">{entry.label}</p>
          <p className={`${dense ? 'mt-1 text-base' : 'mt-1.5 text-xl'} break-words font-black tracking-tight text-slate-950`}>
            {formatValue(entry.value)}
          </p>
        </div>
      ))}
    </div>
  );
}

function isCockpitHref(href) {
  return /^\/business-os(?:[/?#]|$)/.test(String(href || ''));
}

function resolveDrilldown(drilldown, expectedCompanyScope) {
  if (!drilldown || typeof drilldown !== 'object') return { href: '', label: '', enabled: false };
  const internalHref = safeBusinessOsHref(drilldown.href || drilldown.to || drilldown.path);
  const href = safeFounderLocalDrilldownHref(drilldown, { expectedCompanyScope })
    || (isCockpitHref(internalHref) ? internalHref : '');
  return {
    href,
    label: drilldown.label || drilldown.title || 'Mở chi tiết',
    enabled: drilldown.enabled !== false,
  };
}

function DrilldownLink({ drilldown, expectedCompanyScope, label, className = '', children }) {
  const snapshotCompanyScope = useContext(FounderLocalDrilldownScopeContext);
  const effectiveCompanyScope = expectedCompanyScope || snapshotCompanyScope;
  const resolved = resolveDrilldown(drilldown, effectiveCompanyScope);
  if (!resolved.enabled || !resolved.href) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 ${className}`} title="Backend chưa xác nhận đường dẫn vận hành">
        Chưa có drill-down <LockKeyhole className="h-3.5 w-3.5" />
      </span>
    );
  }
  const handleClick = (event) => {
    if (isCockpitHref(resolved.href)) return;
    try {
      commitFounderLocalCompanyScopeFromVerifiedDrilldown(drilldown, {
        expectedCompanyScope: effectiveCompanyScope,
      });
    } catch (error) {
      event.preventDefault();
      event.stopPropagation();
      console.error('[Founder-local drill-down scope]', error);
    }
  };
  return (
    <Link
      to={resolved.href}
      onClick={handleClick}
      className={`inline-flex items-center gap-1.5 text-xs font-extrabold text-indigo-700 hover:text-indigo-900 ${className}`}
    >
      {children || <>{label || resolved.label} <ArrowRight className="h-3.5 w-3.5" /></>}
    </Link>
  );
}

function Freshness({ value }) {
  if (!value) return <span className="text-[10px] font-semibold text-slate-400">Chưa có dấu thời gian</span>;
  if (typeof value === 'string') {
    return <span className="text-[10px] font-semibold text-slate-500">{formatDate(value)}</span>;
  }
  const timestamp = value.updated_at || value.last_success_at || value.as_of || value.generated_at;
  const label = value.label || value.status || value.state;
  return (
    <span className="text-[10px] font-semibold text-slate-500">
      {[label, formatDate(timestamp)].filter(Boolean).join(' · ') || 'Chưa có dấu thời gian'}
    </span>
  );
}

function SystemCard({ system, index }) {
  const accent = SYSTEM_ACCENTS[index] || SYSTEM_ACCENTS[0];
  const Icon = SYSTEM_ICONS[index] || Layers3;
  const firstDrilldown = system.drilldowns?.find((item) => resolveDrilldown(item).enabled);
  return (
    <article data-testid="business-os-system" className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br ${accent.panel} p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]`}>
      <span className={`absolute inset-x-0 top-0 h-1 ${accent.line}`} />
      <div className="flex items-start justify-between gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-sm ${accent.icon}`}>
          <Icon className="h-5 w-5" />
        </span>
        <StatusBadge status={system.status} compact />
      </div>
      <p className="mt-4 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Hệ {String(index + 1).padStart(2, '0')}</p>
      <h3 className="mt-1 min-h-10 text-sm font-black leading-5 text-slate-950">{system.label}</h3>
      <div className="mt-3">
        <MetricGrid metrics={system.metrics} columns="grid-cols-2" dense />
      </div>
      <div className="mt-3 space-y-1.5">
        {system.signals.length ? system.signals.slice(0, 3).map((signal, signalIndex) => {
          const label = typeof signal === 'string'
            ? signal
            : signal?.label || signal?.title || signal?.message || formatValue(signal?.value);
          return label ? (
            <div key={signal?.key || signal?.id || signalIndex} className="flex items-start gap-2 text-[11px] leading-4 text-slate-600">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
              <span>{label}</span>
            </div>
          ) : null;
        }) : <p className="text-[11px] text-slate-400">Không có tín hiệu đã xác minh.</p>}
      </div>
      <div className="mt-4 border-t border-slate-200/80 pt-3">
        <DrilldownLink drilldown={firstDrilldown} />
      </div>
    </article>
  );
}

function SectionHeading({ eyebrow, title, description, icon: Icon, action }) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">
          {Icon ? <Icon className="h-4 w-4" /> : null}{eyebrow}
        </p>
        <h2 className="mt-1.5 text-xl font-black tracking-tight text-slate-950">{title}</h2>
        {description ? <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

function PlanningSection({ planning }) {
  const selected = planning.selected_period;
  const forecastMetrics = pickMetrics(planning.forecast, [
    'active_projects',
    'projects_due',
    'open_work',
    'overdue_work',
    'capacity_gap',
  ]);
  return (
    <section id="planning" className="scroll-mt-24">
      <SectionHeading
        eyebrow="Kế hoạch & dự báo"
        title="Tuần · Tháng · Quý"
        description="Các kỳ dùng cùng hợp đồng chỉ số và phạm vi đang chọn; số trống không bị đổi thành 0."
        icon={CalendarRange}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-black text-slate-900">Ba chân trời kế hoạch</p>
              <p className="mt-1 text-[11px] text-slate-500">
                {selected.label || [selected.start_at, selected.end_at].filter(Boolean).map(formatDate).join(' → ')}
              </p>
            </div>
            <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-black uppercase text-indigo-700">
              {selected.key}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {planning.horizons.length ? planning.horizons.map((horizon) => (
              <article key={horizon.key} className={`rounded-xl border p-3 ${horizon.key === selected.key ? 'border-indigo-300 bg-indigo-50/60' : 'border-slate-200 bg-slate-50/70'}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-black uppercase tracking-wide text-slate-800">{horizon.label || humanizeKey(horizon.key)}</p>
                  {BUSINESS_OS_STATUSES.includes(horizon.status) ? <StatusBadge status={horizon.status} compact /> : null}
                </div>
                <p className="mt-1 text-[10px] text-slate-500">{[formatDate(horizon.start_at), formatDate(horizon.end_at)].filter(Boolean).join(' → ')}</p>
                <div className="mt-3"><MetricGrid metrics={horizon.metrics} dense /></div>
              </article>
            )) : <div className="md:col-span-3"><EmptyEvidence>Backend chưa trả các chân trời kế hoạch.</EmptyEvidence></div>}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-950 p-4 text-white shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10"><BriefcaseBusiness className="h-5 w-5" /></span>
            <div>
              <p className="text-sm font-black">Dự báo dự án & tải việc</p>
              <p className="mt-0.5 text-[10px] text-slate-400">Nguồn thật trong kỳ đang chọn</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {Object.entries(forecastMetrics).length ? Object.entries(forecastMetrics).map(([key, value]) => (
              <div key={key} className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-3">
                <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{humanizeKey(key)}</p>
                <p className="mt-1 text-lg font-black">{formatValue(value)}</p>
              </div>
            )) : <div className="col-span-2 text-xs text-slate-400">Chưa có dự báo được xác minh.</div>}
          </div>
        </div>
      </div>
    </section>
  );
}

function WorkloadCapacitySection({ workload, capacity }) {
  const workloadMetrics = pickMetrics(workload, ['total', 'open', 'overdue', 'done']);
  const capacityMetrics = pickMetrics(capacity, [
    'active_people',
    'open_work',
    'due_in_period',
    'overdue_work',
    'load_per_active_person',
    'utilization_status',
  ]);
  return (
    <section id="capacity" className="scroll-mt-24">
      <SectionHeading
        eyebrow="Nguồn lực thực tế"
        title="Workload & năng lực"
        description="Giữ nguyên đơn vị, nguồn và khoảng trống do backend công bố."
        icon={Gauge}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-black text-slate-950">Khối lượng công việc</p>
              <p className="mt-1 text-[10px] text-slate-500">
                {[workload.metric_contract?.unit, workload.metric_contract?.source].filter(Boolean).join(' · ') || 'Chưa công bố hợp đồng chỉ số'}
              </p>
            </div>
            <Freshness value={workload.freshness} />
          </div>
          <div className="mt-4"><MetricGrid metrics={workloadMetrics} /></div>
          {(Array.isArray(workload.by_module) ? workload.by_module.length : Object.keys(workload.by_module || {}).length) > 0 && (
            <div className="mt-4 rounded-xl bg-slate-50 p-3">
              <p className="mb-2 text-[10px] font-black uppercase tracking-wide text-slate-500">Theo module</p>
              <MetricGrid
                metrics={Array.isArray(workload.by_module)
                  ? Object.fromEntries(workload.by_module.map((item, index) => [item.key || item.label || index, item.value ?? item.count]))
                  : workload.by_module}
                dense
              />
            </div>
          )}
          <div className="mt-4"><DrilldownLink drilldown={workload.drilldown} /></div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-black text-slate-950">Năng lực thực thi</p>
              <p className="mt-1 text-[10px] text-slate-500">
                {[capacity.metric_contract?.unit, capacity.metric_contract?.source].filter(Boolean).join(' · ') || 'Chưa công bố hợp đồng chỉ số'}
              </p>
            </div>
            <Users className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="mt-4"><MetricGrid metrics={capacityMetrics} /></div>
          {capacity.data_gaps.length ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-wide text-amber-800">Khoảng trống dữ liệu</p>
              <ul className="mt-2 space-y-1 text-[11px] leading-5 text-amber-900">
                {capacity.data_gaps.map((gap, index) => <li key={gap?.key || index}>• {typeof gap === 'string' ? gap : gap?.label || gap?.message || gap?.reason}</li>)}
              </ul>
            </div>
          ) : null}
          <div className="mt-4"><DrilldownLink drilldown={capacity.drilldown} /></div>
        </article>
      </div>
    </section>
  );
}

function ManufacturingSection({ companies }) {
  return (
    <section id="manufacturing" className="scroll-mt-24">
      <SectionHeading
        eyebrow="Hai công ty sản xuất"
        title="Năng lực xưởng theo nguồn thật"
        description="Chỉ hiển thị công ty sản xuất mà backend đã xác nhận thuộc phạm vi; không dựng thẻ giả khi thiếu nguồn."
        icon={Factory}
      />
      {companies.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {companies.map((item) => (
            <article key={item.company.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-white"><Factory className="h-5 w-5" /></span>
                  <div>
                    <h3 className="text-sm font-black text-slate-950">{item.company.short_name || item.company.name}</h3>
                    <p className="mt-0.5 text-[10px] text-slate-500">{item.company.name}</p>
                  </div>
                </div>
                <StatusBadge status={item.status} compact />
              </div>
              <div className="p-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <Freshness value={item.freshness} />
                  <span className="text-[10px] font-semibold text-slate-500">
                    {formatValue(item.reconciliation) || 'Chưa có kết quả đối soát'}
                  </span>
                </div>
                <MetricGrid metrics={item.capacity} />
                {item.data_gaps.length ? (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="text-[10px] font-black uppercase tracking-wide text-amber-800">Khoảng trống dữ liệu</p>
                    <ul className="mt-2 space-y-1 text-[11px] leading-5 text-amber-900">
                      {item.data_gaps.map((gap, index) => (
                        <li key={gap?.key || gap?.code || index}>
                          • {typeof gap === 'string' ? gap : gap?.label || gap?.message || gap?.reason || 'Chưa có mô tả'}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="mt-4">
                  <DrilldownLink
                    drilldown={item.drilldown}
                    expectedCompanyScope={item.company.id}
                    label="Mở vận hành xưởng"
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyEvidence>Không có công ty sản xuất nào được nguồn thật xác nhận trong phạm vi hiện tại.</EmptyEvidence>
      )}
    </section>
  );
}

function DecisionCenter({ center, correctionCenter }) {
  const severityStyles = {
    critical: 'bg-rose-100 text-rose-800',
    high: 'bg-orange-100 text-orange-800',
    warning: 'bg-amber-100 text-amber-800',
    medium: 'bg-amber-100 text-amber-800',
    info: 'bg-blue-100 text-blue-800',
    low: 'bg-slate-100 text-slate-700',
  };
  return (
    <section id="decisions" className="scroll-mt-24">
      <SectionHeading
        eyebrow="Founder Decision Center"
        title="Ngoại lệ cần quyết định"
        description="Mỗi yêu cầu phải có lý do và bằng chứng từ hệ thống; danh sách trống không được diễn giải thành không có rủi ro."
        icon={AlertTriangle}
        action={<DrilldownLink drilldown={center.drilldown} />}
      />
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {center.items.length ? (
          <div className="divide-y divide-slate-100">
            {center.items.map((item, index) => {
              const correction = correctionCenter.items.find((candidate) => candidate.issue_id === item.id);
              const severity = String(item.severity || 'info').toLowerCase();
              const evidenceEntries = Array.isArray(item.evidence) ? item.evidence : [item.evidence];
              const evidence = evidenceEntries.map((entry) => {
                const direct = formatValue(entry);
                if (direct) return direct;
                if (!entry || typeof entry !== 'object') return null;
                return Object.entries(entry)
                  .map(([key, value]) => {
                    const formatted = formatValue(value);
                    return formatted === null ? null : `${humanizeKey(key)}: ${formatted}`;
                  })
                  .filter(Boolean)
                  .join(', ');
              }).filter(Boolean).join(' · ');
              return (
                <article key={item.id || index} className="grid gap-3 px-5 py-4 lg:grid-cols-[110px_minmax(0,1fr)_auto] lg:items-start">
                  <div>
                    <span className={`inline-flex rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${severityStyles[severity] || severityStyles.info}`}>{item.severity || 'INFO'}</span>
                    {item.requires_founder_decision ? <p className="mt-2 text-[9px] font-black uppercase text-violet-700">Founder quyết định</p> : null}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-black text-slate-950">{item.title}</h3>
                    {item.reason ? <p className="mt-1 text-xs leading-5 text-slate-600">{item.reason}</p> : null}
                    {evidence ? <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-500"><strong className="text-slate-700">Bằng chứng:</strong> {evidence}</p> : null}
                  </div>
                  <DrilldownLink drilldown={correction?.drilldown} label="Xem hồ sơ" />
                </article>
              );
            })}
          </div>
        ) : (
          <div className="p-5"><EmptyEvidence>Backend chưa công bố yêu cầu quyết định nào trong phạm vi và kỳ này.</EmptyEvidence></div>
        )}
      </div>

      <div id="correction-center" data-testid="correction-center" className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-black text-slate-950">Correction & Evolution</p>
            <p className="mt-1 text-[10px] text-slate-500">Issue → root cause → corrective action; thay đổi Business Rule đang bị khóa.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black text-slate-600">RULE CHANGE DISABLED</span>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {correctionCenter.items.length ? correctionCenter.items.map((item) => (
            <article key={item.issue_id} className="rounded-xl border border-slate-200 p-4">
              <p className="text-xs font-black text-slate-950">{item.issue}</p>
              <p className="mt-2 text-[11px] leading-5 text-slate-600"><strong>Nguyên nhân:</strong> {item.root_cause}</p>
              <p className="text-[11px] leading-5 text-slate-600"><strong>Hành động:</strong> {item.corrective_action}</p>
              <p className="mt-2 text-[10px] text-slate-500">{item.owner_state} · {item.deadline_state} · {item.status}</p>
              <div className="mt-3"><DrilldownLink drilldown={item.drilldown} /></div>
            </article>
          )) : <div className="lg:col-span-2"><EmptyEvidence>Chưa có correction signal trong snapshot hiện tại.</EmptyEvidence></div>}
        </div>
      </div>
    </section>
  );
}

function newIdempotencyKey() {
  const key = globalThis.crypto?.randomUUID?.();
  if (!key) throw new Error('Trình duyệt không hỗ trợ UUID an toàn; thay đổi đã bị khóa.');
  return key;
}

function ModuleActivation({ modules }) {
  return (
    <section id="modules" className="scroll-mt-24">
      <SectionHeading
        eyebrow="Module activation"
        title="Kết nối, freshness & đối soát"
        description="Một module chỉ được ghi LIVE khi backend đã qua đủ gate dữ liệu, phạm vi, quyền, audit và xác minh."
        icon={Database}
      />
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="hidden grid-cols-[minmax(180px,1fr)_210px_180px_180px_110px] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-[10px] font-black uppercase tracking-wide text-slate-500 lg:grid">
          <span>Module</span><span>Trạng thái</span><span>Freshness</span><span>Đối soát</span><span />
        </div>
        {modules.length ? (
          <div className="divide-y divide-slate-100">
            {modules.map((module) => (
              <article key={module.key} className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(180px,1fr)_210px_180px_180px_110px] lg:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-950">{module.label}</p>
                  <p className="mt-0.5 truncate text-[10px] text-slate-400">{module.key}</p>
                </div>
                <div><StatusBadge status={module.activation_status} compact /></div>
                <Freshness value={module.freshness} />
                <span className="text-[11px] leading-4 text-slate-600">{formatValue(module.reconciliation) || 'Chưa có kết quả'}</span>
                <DrilldownLink drilldown={module.drilldown} label="Mở module" />
                {Array.isArray(module.data_gaps) && module.data_gaps.length ? (
                  <div className="rounded-lg bg-amber-50 px-3 py-2 text-[10px] leading-4 text-amber-800 lg:col-span-5">
                    {module.data_gaps.map((gap) => typeof gap === 'string' ? gap : gap?.label || gap?.message).filter(Boolean).join(' · ')}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : <div className="p-5"><EmptyEvidence>Backend chưa công bố trạng thái module.</EmptyEvidence></div>}
      </div>
    </section>
  );
}

function PlatformCapabilities({ capabilities, signalHub }) {
  return (
    <section id="platform-capabilities" className="scroll-mt-24">
      <SectionHeading
        eyebrow="Full Platform V1"
        title="19 năng lực nền tảng"
        description="Trạng thái là projection quản trị noncanonical. SANDBOX không đồng nghĩa đã kích hoạt Production."
        icon={Network}
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {capabilities.map((capability) => (
          <article key={capability.key} data-testid="business-os-capability" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-black leading-5 text-slate-950">{capability.label}</h3>
              <StatusBadge status={capability.status} compact />
            </div>
            <p className="mt-2 text-[10px] text-slate-500">{capability.mode} · nguồn {humanizeKey(capability.source)}</p>
            <p className="mt-2 text-[10px] font-bold text-slate-600">Đối soát: {formatValue(capability.reconciliation)}</p>
            <Freshness value={capability.freshness} />
            {capability.data_gaps.length ? (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[10px] leading-4 text-amber-800">
                {capability.data_gaps.map((gap) => gap?.message || gap?.label || String(gap)).filter(Boolean).join(' · ')}
              </p>
            ) : null}
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <span className="text-[9px] font-black uppercase text-slate-400">Noncanonical · {capability.write_capability}</span>
              <DrilldownLink drilldown={capability.drilldown} />
            </div>
          </article>
        ))}
      </div>

      <div id="signal-hub" data-testid="signal-hub" className="mt-4 rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-black">Cross-Domain Signal Hub</p>
            <p className="mt-1 text-[10px] text-slate-400">Read projection · noncanonical · write disabled</p>
          </div>
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[9px] font-black text-slate-300">{signalHub.contracts.length} SIGNALS</span>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {signalHub.contracts.slice(0, 12).map((signal) => (
            <article key={signal.signal_id} className="rounded-xl border border-white/10 bg-white/[0.05] p-3">
              <p className="text-xs font-black text-white">{signal.display_name}</p>
              <p className="mt-1 text-[10px] text-slate-400">{signal.owner_domain} · {signal.quality_state}</p>
              <p className="mt-2 text-sm font-black text-cyan-200">{formatValue(signal.current_value) ?? 'Chưa đủ dữ liệu'}</p>
              <div className="mt-2"><Freshness value={signal.freshness} /></div>
            </article>
          ))}
        </div>
        {signalHub.contracts.length > 12 ? <p className="mt-3 text-[10px] text-slate-400">Hiển thị 12/{signalHub.contracts.length} tín hiệu; hợp đồng đầy đủ đã được xác minh.</p> : null}
      </div>
    </section>
  );
}

function ConfigurationCenter({ center, drilldowns, scope, onRefresh }) {
  const advisory = center.advisory_configuration;
  const [values, setValues] = useState({});
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [rollbackVersion, setRollbackVersion] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const gatesReady = Object.values(advisory.gates).length === 6
    && Object.values(advisory.gates).every(Boolean);
  const canChange = advisory.enabled && center.permissions.can_change && gatesReady;

  useEffect(() => {
    setValues(Object.fromEntries(FOUNDER_ADVISORY_CONFIGURATION_KEYS.map((key) => [
      key,
      advisory.configuration[key] == null ? '' : String(advisory.configuration[key]),
    ])));
    setRollbackVersion('');
    setConfirmed(false);
    setReason('');
  }, [advisory.current_version, advisory.updated_at]);

  const requestConfig = {
    params: {
      ecosystem_id: scope.ecosystem_id,
      company_id: scope.company_id || 'all',
    },
    founderLocalControlledAction: true,
  };

  const approveAndRun = async (action) => {
    if (!canChange || !confirmed || reason.trim().length < 3) {
      setFeedback('Cần đủ 6 gate, quyền thay đổi, xác nhận và lý do tối thiểu 3 ký tự.');
      return;
    }
    setBusy(true);
    setFeedback('');
    try {
      const idempotencyKey = newIdempotencyKey();
      const config = { ...requestConfig, headers: { 'Idempotency-Key': idempotencyKey } };
      if (action === 'save') {
        const configuration = Object.fromEntries(FOUNDER_ADVISORY_CONFIGURATION_KEYS.map((key) => [
          key,
          values[key] === '' ? null : Number(values[key]),
        ]));
        await api.put('/business-os/configuration', {
          configuration,
          expected_version: advisory.current_version,
          approval: { confirmed: true, reason: reason.trim() },
        }, config);
      } else {
        await api.post('/business-os/configuration/rollback', {
          target_version: Number(rollbackVersion),
          expected_version: advisory.current_version,
          approval: { confirmed: true, reason: reason.trim() },
        }, config);
      }
      setFeedback(action === 'save' ? 'Đã lưu cấu hình advisory tạm.' : 'Đã rollback cấu hình advisory tạm.');
      await onRefresh({ background: true });
    } catch (error) {
      setFeedback(error?.response?.data?.error || error?.message || 'Thay đổi advisory đã bị khóa.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="configuration" data-testid="founder-configuration" className="scroll-mt-24">
      <SectionHeading
        eyebrow="Founder Configuration Center"
        title="Cấu hình đang có hiệu lực"
        description="Cấu hình module canonical luôn chỉ đọc; chỉ ngưỡng cảnh báo advisory tạm mới có thể thay đổi khi đủ sáu gate."
        icon={Settings2}
        action={<DrilldownLink drilldown={center.drilldown} label="Mở cấu hình gốc" />}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-slate-950">Module theo phạm vi</p>
              <p className="mt-1 text-[10px] text-slate-500">Nguồn: {center.source || 'Backend chưa công bố'}</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${center.read_only ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
              {center.read_only ? 'READ ONLY' : 'CHƯA XÁC MINH READ ONLY'}
            </span>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {center.modules.length ? center.modules.map((module) => (
              <div key={module.key} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-3">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${module.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-black text-slate-900">{module.label}</p>
                  <p className="mt-0.5 truncate text-[9px] text-slate-500">
                    {module.company_ids?.length ? `${module.company_ids.length} công ty đã cấu hình` : 'Chưa có phạm vi công ty đã xác minh'}
                  </p>
                </div>
                <span className="text-[9px] font-black uppercase text-slate-500">{module.enabled ? 'Bật' : 'Tắt'}</span>
              </div>
            )) : <div className="sm:col-span-2"><EmptyEvidence /></div>}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700"><Network className="h-5 w-5" /></span>
            <div>
              <p className="text-sm font-black text-slate-950">Đường dẫn vận hành hiện hữu</p>
              <p className="mt-0.5 text-[10px] text-slate-500">Không tái tạo luồng ghi nghiệp vụ</p>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {drilldowns.length ? drilldowns.map((item, index) => (
              <DrilldownLink
                key={item.key || index}
                drilldown={item}
                className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 hover:border-indigo-300 hover:bg-indigo-50/50"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Layers3 className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1 truncate text-xs font-extrabold text-slate-800">{item.label || item.title || 'Mở chi tiết'}</span>
                <ArrowRight className="h-4 w-4 text-slate-400" />
              </DrilldownLink>
            )) : <EmptyEvidence>Chưa có drill-down được backend cho phép.</EmptyEvidence>}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-[10px] font-bold">
            <span className={`rounded-lg px-3 py-2 ${center.permissions.can_view ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>Xem: {center.permissions.can_view ? 'Được phép' : 'Bị chặn'}</span>
            <span className={`rounded-lg px-3 py-2 ${center.permissions.can_change ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>Đổi: {center.permissions.can_change ? 'Qua màn hình gốc' : 'Không được phép'}</span>
          </div>
        </div>
      </div>
      <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50/60 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-black text-violet-950">Advisory configuration · provisional</p>
            <p className="mt-1 text-[11px] leading-5 text-violet-800">Noncanonical · không tự động ghi hoặc thay đổi vận hành · phiên bản {advisory.current_version}</p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${canChange ? 'bg-violet-700 text-white' : 'bg-slate-200 text-slate-600'}`}>{canChange ? '6 GATES READY' : 'WRITE DISABLED'}</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {FOUNDER_ADVISORY_CONFIGURATION_KEYS.map((key) => (
            <label key={key} className="text-[10px] font-bold text-slate-600">
              {humanizeKey(key)}
              <input type="number" min={key === 'capacity_load_warning_per_active_person' ? '0.1' : '1'} step={key === 'capacity_load_warning_per_active_person' ? '0.1' : '1'} disabled={!canChange || busy} value={values[key] ?? ''} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} className="mt-1 h-10 w-full rounded-xl border border-violet-200 bg-white px-3 text-xs outline-none disabled:bg-slate-100" placeholder="Không đặt" />
            </label>
          ))}
        </div>
        <textarea disabled={!canChange || busy} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="Lý do Founder phê duyệt (bắt buộc)" className="mt-3 min-h-20 w-full rounded-xl border border-violet-200 bg-white p-3 text-xs outline-none disabled:bg-slate-100" />
        <label className="mt-3 flex items-start gap-2 text-xs font-bold text-violet-950">
          <input type="checkbox" disabled={!canChange || busy} checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5" />
          Tôi xác nhận đây chỉ là ngưỡng cảnh báo tạm, noncanonical và không có tác động vận hành tự động.
        </label>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" disabled={!canChange || busy || !confirmed || reason.trim().length < 3} onClick={() => void approveAndRun('save')} className="h-10 rounded-xl bg-violet-700 px-4 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50">Lưu advisory tạm</button>
          <select disabled={!canChange || busy} value={rollbackVersion} onChange={(event) => setRollbackVersion(event.target.value)} className="h-10 rounded-xl border border-violet-200 bg-white px-3 text-xs font-bold disabled:bg-slate-100">
            <option value="">Chọn phiên bản rollback</option>
            {advisory.rollback_versions.filter((item) => item.version < advisory.current_version).map((item) => <option key={item.version} value={item.version}>Phiên bản {item.version} · {formatDate(item.created_at)}</option>)}
          </select>
          <button type="button" disabled={!canChange || busy || !rollbackVersion || !confirmed || reason.trim().length < 3} onClick={() => void approveAndRun('rollback')} className="h-10 rounded-xl border border-violet-300 bg-white px-4 text-xs font-black text-violet-800 disabled:cursor-not-allowed disabled:opacity-50">Rollback advisory</button>
        </div>
        {feedback ? <p role="status" className="mt-3 rounded-lg bg-white px-3 py-2 text-xs text-violet-900">{feedback}</p> : null}
      </div>
    </section>
  );
}

function ProtectionFooter({ protections }) {
  const gates = [
    ['Ghi từ Cockpit', protections.write_enabled],
    ['Ghi DB trực tiếp', protections.direct_database_write_enabled],
    ['Dữ liệu synthetic', protections.synthetic_fallback_enabled],
    ['Gửi ra ngoài', protections.external_send_enabled],
  ];
  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white"><ShieldCheck className="h-5 w-5" /></span>
          <div>
            <p className="text-sm font-black text-emerald-950">Live Mode đang khóa theo chính sách</p>
            <p className="mt-0.5 text-[10px] text-emerald-800">Hành động nghiệp vụ chỉ mở ở module nguồn, qua Application Service hiện hữu.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {gates.map(([label, enabled]) => (
            <span key={label} className={`rounded-lg border px-2.5 py-2 text-center text-[9px] font-black uppercase ${enabled ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-white text-emerald-700'}`}>
              {label}: {enabled ? 'Bật' : 'Khóa'}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function FounderCockpit({ snapshot, onRefresh }) {
  const snapshotCompanyScope = snapshot.scope.company_id || 'all';
  return (
    <FounderLocalDrilldownScopeContext.Provider value={snapshotCompanyScope}>
      <div className="space-y-10 pb-10">
        {snapshotCompanyScope === 'all' ? (
          <div
            data-testid="founder-local-exact-company-required"
            className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 shadow-sm"
          >
            Drill-down nguồn đang khóa ở phạm vi toàn hệ sinh thái. Chọn một công ty cụ thể phía trên để mở CRM read-only đã được kiểm chứng.
          </div>
        ) : null}
        <section id="six-systems" className="scroll-mt-24">
          <SectionHeading
            eyebrow="Tổng quan 6 hệ"
            title="Founder Executive Cockpit"
            description="Mọi chỉ số bên dưới đến trực tiếp từ hợp đồng Business AI OS; ô thiếu luôn được giữ là chưa xác minh."
            icon={Building2}
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {snapshot.systems.map((system, index) => <SystemCard key={system.key} system={system} index={index} />)}
          </div>
        </section>

        <PlanningSection planning={snapshot.planning} />
        <WorkloadCapacitySection workload={snapshot.workload} capacity={snapshot.capacity} />
        <ManufacturingSection companies={snapshot.manufacturing_companies} />
        <DecisionCenter center={snapshot.decision_center} correctionCenter={snapshot.correction_center} />
        <ModuleActivation modules={snapshot.modules} />
        <PlatformCapabilities capabilities={snapshot.platform_capabilities} signalHub={snapshot.signal_hub} />
        <ConfigurationCenter center={snapshot.configuration_center} drilldowns={snapshot.drilldowns} scope={snapshot.scope} onRefresh={onRefresh} />
        <ProtectionFooter protections={snapshot.protections} />
      </div>
    </FounderLocalDrilldownScopeContext.Provider>
  );
}
