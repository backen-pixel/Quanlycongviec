import { Link } from 'react-router-dom';
import {
  CheckCircle2, Circle, AlertTriangle, Calendar, Wallet, Target,
  Check, Play, Clock3,
} from 'lucide-react';
import { formatVND, formatDate } from '../lib/utils';

const FLOW_STATUS = {
  done: {
    card: 'border-emerald-300 bg-emerald-50/80',
    label: 'Hoàn tất',
    labelCls: 'text-emerald-700',
    icon: CheckCircle2,
    iconCls: 'text-emerald-600',
  },
  current: {
    card: 'border-blue-400 bg-blue-50 ring-1 ring-blue-200',
    label: 'Đang chạy',
    labelCls: 'text-blue-700',
    icon: Circle,
    iconCls: 'text-blue-600 fill-blue-600',
  },
  pending: {
    card: 'border-gray-200 bg-white',
    label: 'Chưa bắt đầu',
    labelCls: 'text-gray-400',
    icon: Circle,
    iconCls: 'text-gray-300',
  },
};

const TASK_UI = {
  done: {
    row: 'bg-emerald-50/60',
    iconWrap: 'bg-emerald-600 text-white',
    Icon: Check,
  },
  active: {
    row: 'bg-slate-50',
    iconWrap: 'bg-blue-600 text-white',
    Icon: Play,
  },
  warning: {
    row: 'bg-amber-50/80',
    iconWrap: 'bg-amber-100 text-amber-700',
    Icon: AlertTriangle,
  },
  pending: {
    row: 'bg-slate-50',
    iconWrap: 'bg-slate-200 text-slate-500',
    Icon: Clock3,
  },
};

function TaskStateIcon({ state }) {
  const meta = TASK_UI[state] || TASK_UI.pending;
  const Icon = meta.Icon;
  return (
    <span className={`w-6 h-6 rounded-md grid place-items-center shrink-0 ${meta.iconWrap}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
    </span>
  );
}

function ForecastBadge({ forecast, delay_days, days_remaining }) {
  if (forecast === 'late') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
        <AlertTriangle className="h-3 w-3" /> Trễ {delay_days || 0} ngày
      </span>
    );
  }
  if (forecast === 'at_risk') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
        <AlertTriangle className="h-3 w-3" /> Nguy cơ trễ {delay_days || 2} ngày
      </span>
    );
  }
  if (forecast === 'on_track' && days_remaining != null) {
    return (
      <span className="text-xs text-emerald-700 font-medium">Còn {days_remaining} ngày</span>
    );
  }
  return null;
}

function KpiCard({ title, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">{title}</p>
      {children}
    </div>
  );
}

/**
 * Tổng quan dự án — gom CRM/SX/VC (mockup Work Unified).
 */
export default function ProjectOverviewPanel({ overview, onOpenSections }) {
  if (!overview) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">
        Chưa có dữ liệu tổng hợp từ CRM / SX / VC.
      </div>
    );
  }

  const {
    progress_pct = 0,
    commitment_date,
    days_remaining,
    forecast,
    delay_days,
    budget,
    status_label,
    flow = [],
    critical_tasks = [],
    critical_summary = null,
  } = overview;

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard title="Tiến độ tổng thể">
          <div className="flex items-end justify-between gap-2 mb-2">
            <p className="text-3xl font-bold text-slate-900 tabular-nums">{progress_pct}%</p>
            {status_label && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                {status_label}
              </span>
            )}
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${Math.max(0, Math.min(100, progress_pct))}%` }}
            />
          </div>
        </KpiCard>

        <KpiCard title="Hạn bàn giao">
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="h-4 w-4 text-slate-400" />
            <p className="text-xl font-bold text-slate-900">
              {commitment_date ? formatDate(commitment_date) : '—'}
            </p>
          </div>
          <ForecastBadge forecast={forecast} delay_days={delay_days} days_remaining={days_remaining} />
        </KpiCard>

        <KpiCard title="Ngân sách dự án">
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="h-4 w-4 text-slate-400" />
            <p className="text-xl font-bold text-slate-900">
              {budget?.total != null ? formatVND(budget.total) : '—'}
            </p>
          </div>
          {budget?.total != null && budget?.spent != null ? (
            <p className="text-xs text-slate-500">
              Đã thu/cọc {formatVND(budget.spent)}
              {budget.pct != null ? ` (${budget.pct}%)` : ''}
            </p>
          ) : (
            <p className="text-xs text-slate-400">Chưa có số đã chi</p>
          )}
        </KpiCard>
      </div>

      {/* Flow */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Target className="h-4 w-4 text-blue-600" />
            Luồng thực hiện dự án
          </h3>
          <div className="flex items-center gap-2">
            {flow.length > 0 && (
              <span className="text-[11px] text-slate-500 tabular-nums">
                {flow.filter((s) => s.status === 'done').length}/{flow.length} bước
              </span>
            )}
            {onOpenSections && (
              <button
                type="button"
                onClick={onOpenSections}
                className="text-xs font-medium text-blue-700 hover:underline cursor-pointer"
              >
                Xem theo module →
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
          {flow.map((step, idx) => {
            const meta = FLOW_STATUS[step.status] || FLOW_STATUS.pending;
            const Icon = meta.icon;
            const accent = step.color || null;
            const inner = (
              <div
                className={`shrink-0 w-[128px] rounded-xl border px-3 py-3 ${meta.card} ${
                  step.href ? 'hover:shadow-md transition-shadow' : ''
                }`}
                style={accent && step.status === 'current' ? { borderColor: accent } : undefined}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-slate-400">{idx + 1}</span>
                  <Icon className={`h-4 w-4 ${meta.iconCls}`} />
                </div>
                <p className="text-sm font-bold text-slate-900 leading-snug">{step.label}</p>
                <p className={`text-[11px] font-medium mt-1 ${meta.labelCls}`}>
                  {step.status === 'current' && step.stage_name && step.stage_name !== step.label
                    ? step.stage_name
                    : meta.label}
                </p>
              </div>
            );
            return step.href ? (
              <Link key={step.key} to={step.href} className="shrink-0">
                {inner}
              </Link>
            ) : (
              <div key={step.key} className="shrink-0">{inner}</div>
            );
          })}
        </div>
      </div>

      {/* Critical tasks — layout gần mock Work Unified, dữ liệu API thật */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-bold text-slate-900">Công việc cần làm</h3>
          {critical_summary?.total > 0 ? (
            <span className="text-[11px] text-slate-500">
              {critical_summary.on_track}/{critical_summary.total} đúng tiến độ
              {critical_summary.warning > 0 ? (
                <span className="text-amber-700 font-medium"> · {critical_summary.warning} rủi ro</span>
              ) : null}
            </span>
          ) : null}
        </div>
        {critical_tasks.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">Không có việc mở cần xử lý</p>
        ) : (
          <div className="grid gap-2">
            {critical_tasks.map((t) => {
              const ui = t.ui_state || (t.note ? 'warning' : (t.pct != null ? 'active' : 'pending'));
              const rowCls = (TASK_UI[ui] || TASK_UI.pending).row;
              const inner = (
                <div className={`grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2.5 min-h-[54px] px-2.5 py-2 rounded-lg ${rowCls}`}>
                  <TaskStateIcon state={ui} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{t.title}</p>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      {t.owner_line || [t.module_label, t.assignee_name].filter(Boolean).join(' · ') || t.module_label}
                    </p>
                    {t.pct != null && ui === 'active' && (
                      <div className="mt-1.5 h-1 rounded-full bg-slate-200/80 overflow-hidden max-w-[12rem]">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${t.pct}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0 pl-1">
                    <p className={`text-[12px] font-semibold tabular-nums ${
                      ui === 'warning' ? 'text-amber-800' : ui === 'done' ? 'text-emerald-700' : 'text-slate-600'
                    }`}>
                      {t.status_label || (t.pct != null ? `${t.pct}%` : 'Chờ')}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {t.deadline ? formatDate(t.deadline) : '—'}
                    </p>
                  </div>
                </div>
              );
              return t.href ? (
                <Link
                  key={`${t.module}-${t.id}`}
                  to={t.href}
                  className="block rounded-lg hover:ring-1 hover:ring-slate-200 transition-shadow"
                >
                  {inner}
                </Link>
              ) : (
                <div key={`${t.module}-${t.id}`}>{inner}</div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
