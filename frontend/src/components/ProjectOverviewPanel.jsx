import { Link } from 'react-router-dom';
import {
  CheckCircle2, Circle, AlertTriangle, Calendar, Wallet, Target,
  Users, Building2, FileText, Package, Wrench, ExternalLink,
} from 'lucide-react';
import { formatVND, formatDate, getInitials, avatarColor } from '../lib/utils';
import DealProductionProjectsPanel from './DealProductionProjectsPanel';

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

const STATUS_BADGE_CLS = {
  done: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  active: 'bg-blue-50 text-blue-700 border-blue-200',
  warning: 'bg-red-50 text-red-700 border-red-200',
  pending: 'bg-slate-100 text-slate-500 border-slate-200',
};

function StatusBadge({ state, label }) {
  const cls = STATUS_BADGE_CLS[state] || STATUS_BADGE_CLS.pending;
  return (
    <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${cls}`}>
      {label}
    </span>
  );
}

/** 1 dòng "hồ sơ liên thông" — nhãn + icon bên trái, giá trị (có thể là link) bên phải. */
function LinkedRow({ icon: Icon, label, value, href, valueCls }) {
  const content = (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="flex items-center gap-2 text-xs text-slate-500 shrink-0">
        <Icon className="h-3.5 w-3.5 text-slate-400" aria-hidden />
        {label}
      </span>
      <span className={`text-xs font-semibold text-right truncate max-w-[60%] ${valueCls || 'text-slate-800'}`}>
        {value || '—'}
      </span>
    </div>
  );
  if (href && value) {
    return (
      <Link to={href} className="block rounded-lg -mx-1.5 px-1.5 hover:bg-slate-50 transition-colors">
        {content}
      </Link>
    );
  }
  return content;
}

/**
 * Tổng quan dự án — gom CRM/SX/VC (mockup Work Unified).
 */
export default function ProjectOverviewPanel({
  overview,
  onOpenSections,
  onOpenTasks,
  fullPageHref,
  lead = null,
  leadId = null,
  onReload,
}) {
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
    customer_name,
    customer_phone,
    company_name,
    deal_ref,
    production_ref,
    production_projects = [],
    current_project_id,
  } = overview;

  const paymentLabel = budget?.total != null
    ? (budget?.pct != null ? `Đã thanh toán ${budget.pct}%` : 'Chưa ghi nhận thanh toán')
    : null;

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

      {/* Công việc trọng yếu + Hồ sơ liên thông — cùng chiều cao để 2 dòng "xem thêm" ngang hàng nhau */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-bold text-slate-900">Công việc trọng yếu</h3>
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                    <th className="py-2 pr-2 font-semibold w-7">#</th>
                    <th className="py-2 pr-2 font-semibold">Công việc</th>
                    <th className="py-2 pr-2 font-semibold">Chủ sở hữu</th>
                    <th className="py-2 pr-2 font-semibold">Trạng thái</th>
                    <th className="py-2 pl-2 font-semibold text-right">Hạn hoàn thành</th>
                  </tr>
                </thead>
                <tbody>
                  {critical_tasks.slice(0, 4).map((t, idx) => {
                    const ui = t.ui_state || (t.note ? 'warning' : (t.pct != null ? 'active' : 'pending'));
                    const overdue = ui === 'warning' && t.deadline && new Date(t.deadline) < new Date();
                    const owner = t.assignee_name || t.owner_line || null;
                    return (
                      <tr key={`${t.module}-${t.id}`} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                        <td className="py-2.5 pr-2 text-slate-400 text-xs tabular-nums align-middle">{idx + 1}</td>
                        <td className="py-2.5 pr-2 align-middle">
                          {t.href ? (
                            <Link
                              to={t.href}
                              className="text-sm font-semibold text-slate-900 hover:text-blue-700 hover:underline truncate max-w-[220px] block"
                            >
                              {t.title}
                            </Link>
                          ) : (
                            <p className="text-sm font-semibold text-slate-900 truncate max-w-[220px]">{t.title}</p>
                          )}
                        </td>
                        <td className="py-2.5 pr-2 align-middle">
                          {t.assignee_name ? (
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                className="h-6 w-6 rounded-full text-[10px] font-bold text-white flex items-center justify-center shrink-0"
                                style={{ backgroundColor: avatarColor(t.assignee_name) }}
                              >
                                {getInitials(t.assignee_name)}
                              </span>
                              <span className="text-xs text-slate-600 truncate max-w-[100px]">{t.assignee_name}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">{owner || 'Chưa gán'}</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-2 align-middle">
                          <StatusBadge state={ui} label={t.status_label || (t.pct != null ? `${t.pct}%` : 'Chờ')} />
                        </td>
                        <td className="py-2.5 pl-2 align-middle text-right">
                          <span className={`text-xs font-medium whitespace-nowrap ${overdue ? 'text-red-600' : 'text-slate-600'}`}>
                            {t.deadline ? formatDate(t.deadline) : '—'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {onOpenTasks && critical_tasks.length > 4 && (
            <button
              type="button"
              onClick={onOpenTasks}
              className="mt-auto pt-3 w-full text-center text-xs font-medium text-blue-700 hover:underline cursor-pointer"
            >
              Xem tất cả công việc →
            </button>
          )}
        </div>

        {/* Hồ sơ liên thông — CRM (khách hàng/deal) ↔ SX/VC (dự án) quy về cùng 1 hồ sơ */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-bold text-slate-900">Hồ sơ liên thông</h3>
            {critical_summary?.warning > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full whitespace-nowrap">
                <AlertTriangle className="h-3 w-3" /> {critical_summary.warning} việc cần chú ý
              </span>
            )}
          </div>
          <div className="divide-y divide-slate-50">
            <LinkedRow
              icon={Users}
              label="Khách hàng"
              value={[customer_name, customer_phone].filter(Boolean).join(' · ')}
            />
            <LinkedRow icon={Building2} label="Công ty" value={company_name} />
            <LinkedRow
              icon={FileText}
              label="Deal / Đơn hàng"
              value={deal_ref?.code}
              href={deal_ref?.href}
              valueCls="text-violet-700"
            />
            <LinkedRow
              icon={Package}
              label="Dự án sản xuất"
              value={production_ref?.code}
              href={production_ref?.href}
              valueCls="text-blue-700"
            />
            <LinkedRow icon={Wrench} label="Trạng thái thi công" value={status_label} valueCls="text-amber-700" />
            <LinkedRow icon={Wallet} label="Thanh toán" value={paymentLabel} />
          </div>
          {fullPageHref && (
            <Link
              to={fullPageHref}
              className="mt-auto pt-3 inline-flex items-center justify-center gap-1 text-xs font-medium text-blue-700 hover:underline"
            >
              Mở trang dự án đầy đủ (CRM · Sản xuất · Vận chuyển)
              <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>

      <DealProductionProjectsPanel
        projects={production_projects}
        currentProjectId={current_project_id}
        lead={lead}
        leadId={leadId}
        onReload={onReload}
      />
    </div>
  );
}
