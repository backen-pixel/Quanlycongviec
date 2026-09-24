import { useEffect, useLayoutEffect, useRef, useState, Children } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2, Circle, AlertTriangle, Calendar, Wallet, Target,
  Users, Building2, FileText, Package, Wrench, ExternalLink,
  MapPin, User, Truck, Factory,
} from 'lucide-react';
import api from '../lib/api';
import { formatVND, formatDate, getInitials, avatarColor } from '../lib/utils';
import DealProductionProjectsPanel from './DealProductionProjectsPanel';

const CLUSTER_WARNING_MS = 3 * 24 * 60 * 60 * 1000;

/** Số cụm nhiệm vụ hiện trong khung; vượt số này thì cuộn. */
const CLUSTER_VISIBLE_ROWS = 7;

function clusterModuleLabel(task) {
  const kind = String(task?.task_kind || '');
  if (kind === 'CRM-Deal' || kind === 'CRM-Lead') return 'CRM';
  if (kind === 'VC') return 'VC-LĐ';
  if (kind === 'SX' || kind === 'Dự án') return 'Sản xuất';
  return 'Dự án';
}

function clusterRisk(task, nowMs) {
  if (!task?.deadline) return 'normal';
  const dueMs = new Date(task.deadline).getTime();
  if (!Number.isFinite(dueMs)) return 'normal';
  if (dueMs < nowMs) return 'overdue';
  return dueMs - nowMs <= CLUSTER_WARNING_MS ? 'warning' : 'normal';
}

function clusterUi(task, nowMs) {
  const risk = clusterRisk(task, nowMs);
  if (risk === 'overdue') return { state: 'warning', label: 'Quá hạn' };
  if (risk === 'warning') return { state: 'warning', label: 'Cảnh báo' };
  const total = Number(task.child_total) || 0;
  const done = Number(task.child_completed) || 0;
  if (total > 0 && done >= total) return { state: 'done', label: 'Hoàn tất' };
  if (done > 0) return { state: 'active', label: `${done}/${total} việc` };
  return { state: 'pending', label: total ? `0/${total} việc` : 'Chờ' };
}

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

/** 1 dòng "hồ sơ liên thông" — bỏ qua khi chưa có giá trị. */
function LinkedRow({ icon: Icon, label, value, href, valueCls }) {
  if (value == null || value === '') return null;
  const content = (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="flex items-center gap-2 text-xs text-slate-500 shrink-0">
        <Icon className="h-3.5 w-3.5 text-slate-400" aria-hidden />
        {label}
      </span>
      <span className={`text-xs font-semibold text-right truncate max-w-[60%] ${valueCls || 'text-slate-800'}`} title={String(value)}>
        {value}
      </span>
    </div>
  );
  if (href) {
    return (
      <Link to={href} className="block rounded-lg -mx-1.5 px-1.5 hover:bg-slate-50 transition-colors">
        {content}
      </Link>
    );
  }
  return content;
}

function ModuleBlock({ title, children }) {
  const items = Children.toArray(children).filter(Boolean);
  if (!items.length) return null;
  return (
    <div className="py-1.5 first:pt-0">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">{title}</p>
      <div className="divide-y divide-slate-50">{items}</div>
    </div>
  );
}

export function resolveOverviewModules(overview) {
  const m = overview?.modules;
  if (m && (m.crm != null || m.sx != null || m.vc != null)) {
    return { crm: !!m.crm, sx: m.sx !== false, vc: !!m.vc };
  }
  const pps = overview?.production_projects || [];
  return {
    crm: !!overview?.deal_ref,
    sx: !!overview?.production_ref,
    vc: pps.some((p) => p.logistics_company_id || p.vc_kanban_column_id || p.vc_pipeline_stage),
  };
}

/**
 * Tổng quan dự án — gom CRM/SX/VC (mockup Work Unified).
 */
export default function ProjectOverviewPanel({
  overview,
  onOpenSections,
  onOpenTasks,
  fullPageHref,
  projectId = null,
  lead = null,
  leadId = null,
  onReload,
}) {
  const [clusters, setClusters] = useState([]);
  const [clusterStats, setClusterStats] = useState(null);
  const [clusterLoading, setClusterLoading] = useState(!!projectId);

  useEffect(() => {
    if (!projectId) {
      setClusters([]);
      setClusterStats(null);
      setClusterLoading(false);
      return undefined;
    }
    let cancelled = false;
    setClusterLoading(true);
    api.get('/work-tasks/project-overview', { params: { project_id: projectId } })
      .then((res) => {
        if (cancelled) return;
        setClusters(res.data?.tasks || []);
        setClusterStats(res.data?.stats || null);
      })
      .catch(() => {
        if (cancelled) return;
        setClusters([]);
        setClusterStats(null);
      })
      .finally(() => {
        if (!cancelled) setClusterLoading(false);
      });
    return () => { cancelled = true; };
  }, [projectId]);
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
    customer_address,
    region_name,
    company_name,
    workshop_type_name,
    crm_stage_name,
    sx_stage_name,
    vc_stage_name,
    sx_company_name,
    vc_company_name,
    install_date,
    delivery_date,
    deal_ref,
    production_ref,
    owners = {},
    production_projects = [],
    current_project_id,
  } = overview;

  const mods = resolveOverviewModules(overview);
  const moduleLinkBits = [
    mods.crm ? 'CRM' : null,
    mods.sx ? 'Sản xuất' : null,
    mods.vc ? 'Vận chuyển' : null,
  ].filter(Boolean);

  const nowMs = Date.now();
  const clusterRows = projectId ? clusters : critical_tasks;

  // Chiều cao mỗi hàng không cố định (hàng không có nhiệm vụ con thì thiếu thanh tiến độ),
  // nên chốt bằng px sẽ lệch. Đo vị trí hàng thứ 9 rồi cắt đúng ở đó.
  const clusterScrollRef = useRef(null);
  const [clusterMaxH, setClusterMaxH] = useState(null);
  useLayoutEffect(() => {
    const box = clusterScrollRef.current;
    if (!box) return undefined;
    const measure = () => {
      const rows = box.querySelectorAll('tbody > tr');
      if (rows.length <= CLUSTER_VISIBLE_ROWS) { setClusterMaxH(null); return; }
      const cut = rows[CLUSTER_VISIBLE_ROWS];
      const top = cut.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
      setClusterMaxH(top > 0 ? Math.round(top) : null);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    // Đổi bề rộng cột → tên xuống dòng → hàng cao lên, phải đo lại.
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [clusterRows]);
  const clusterSummary = projectId
    ? {
      total: clusterStats?.total ?? clusters.length,
      warning: (clusterStats?.warning || 0) + (clusterStats?.overdue || 0),
      on_track: Math.max(
        0,
        (clusterStats?.total ?? clusters.length)
          - (clusterStats?.warning || 0)
          - (clusterStats?.overdue || 0),
      ),
    }
    : critical_summary;

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
            <h3 className="text-sm font-bold text-slate-900">Cụm nhiệm vụ</h3>
            {clusterSummary?.total > 0 ? (
              <span className="text-[11px] text-slate-500">
                {clusterSummary.on_track}/{clusterSummary.total} đúng tiến độ
                {clusterSummary.warning > 0 ? (
                  <span className="text-amber-700 font-medium"> · {clusterSummary.warning} rủi ro</span>
                ) : null}
              </span>
            ) : null}
          </div>
          {clusterLoading ? (
            <p className="text-sm text-slate-400 py-4 text-center">Đang tải cụm nhiệm vụ…</p>
          ) : clusterRows.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">Không có cụm nhiệm vụ mở</p>
          ) : (
            <div
              ref={clusterScrollRef}
              className="overflow-x-auto overflow-y-auto"
              style={clusterMaxH ? { maxHeight: clusterMaxH } : undefined}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                    <th className="py-2 pr-2 font-semibold w-7">#</th>
                    <th className="py-2 pr-2 font-semibold">Cụm nhiệm vụ</th>
                    <th className="py-2 pr-2 font-semibold">Chủ sở hữu</th>
                    <th className="py-2 pr-2 font-semibold">Trạng thái</th>
                    <th className="py-2 pl-2 font-semibold text-right">Hạn hoàn thành</th>
                  </tr>
                </thead>
                <tbody>
                  {clusterRows.map((t, idx) => {
                    const uiMeta = projectId ? clusterUi(t, nowMs) : null;
                    const ui = uiMeta?.state || t.ui_state || (t.note ? 'warning' : (t.pct != null ? 'active' : 'pending'));
                    const statusLabel = uiMeta?.label || t.status_label || (t.pct != null ? `${t.pct}%` : 'Chờ');
                    const overdue = ui === 'warning' && t.deadline && new Date(t.deadline) < new Date();
                    const ownerName = t.assignee_name || t.effective_assignee_name || null;
                    const owner = ownerName || t.owner_line || null;
                    const total = Number(t.child_total) || 0;
                    const done = Number(t.child_completed) || 0;
                    const pct = total ? Math.round((done / total) * 100) : 0;
                    return (
                      <tr key={t.unified_id || `${t.module}-${t.id}`} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                        <td className="py-2.5 pr-2 text-slate-400 text-xs tabular-nums align-middle">{idx + 1}</td>
                        <td className="py-2.5 pr-2 align-middle">
                          {onOpenTasks ? (
                            <button
                              type="button"
                              onClick={onOpenTasks}
                              className="text-left w-full cursor-pointer"
                            >
                              <span className="text-sm font-semibold text-slate-900 hover:text-blue-700 hover:underline truncate max-w-[220px] block">
                                {t.title}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                {clusterModuleLabel(t)}
                                {total ? ` · ${done}/${total} nhiệm vụ` : ''}
                              </span>
                            </button>
                          ) : (
                            <>
                              <p className="text-sm font-semibold text-slate-900 truncate max-w-[220px]">{t.title}</p>
                              {total ? (
                                <p className="text-[11px] text-slate-400">{done}/{total} nhiệm vụ</p>
                              ) : null}
                            </>
                          )}
                          {total > 0 ? (
                            <div className="h-1 rounded-full bg-slate-100 overflow-hidden mt-1 max-w-[180px]">
                              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                            </div>
                          ) : null}
                        </td>
                        <td className="py-2.5 pr-2 align-middle">
                          {ownerName ? (
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                className="h-6 w-6 rounded-full text-[10px] font-bold text-white flex items-center justify-center shrink-0"
                                style={{ backgroundColor: avatarColor(ownerName) }}
                              >
                                {getInitials(ownerName)}
                              </span>
                              <span className="text-xs text-slate-600 truncate max-w-[100px]">{ownerName}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">{owner || 'Chưa gán'}</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-2 align-middle">
                          <StatusBadge state={ui} label={statusLabel} />
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
          {onOpenTasks && !clusterLoading && clusterRows.length > 0 && (
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
            {clusterSummary?.warning > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full whitespace-nowrap">
                <AlertTriangle className="h-3 w-3" /> {clusterSummary.warning} việc cần chú ý
              </span>
            )}
          </div>
          <div className="divide-y divide-slate-100">
            <ModuleBlock title="Khách hàng">
              <LinkedRow
                icon={Users}
                label="Khách hàng"
                value={[customer_name, customer_phone].filter(Boolean).join(' · ')}
              />
              <LinkedRow icon={MapPin} label="Địa chỉ" value={customer_address} />
              <LinkedRow icon={Building2} label="Khu vực" value={region_name} />
            </ModuleBlock>
            {mods.crm && (
              <ModuleBlock title="CRM">
                <LinkedRow
                  icon={FileText}
                  label="Deal / Đơn hàng"
                  value={deal_ref?.code}
                  href={deal_ref?.href}
                  valueCls="text-violet-700"
                />
                <LinkedRow icon={Target} label="Giai đoạn" value={crm_stage_name} valueCls="text-emerald-700" />
                <LinkedRow icon={User} label="Phụ trách" value={owners.crm?.full_name} />
                <LinkedRow icon={Wallet} label="Thanh toán" value={paymentLabel} />
              </ModuleBlock>
            )}
            {mods.sx && (
              <ModuleBlock title="Sản xuất">
                <LinkedRow
                  icon={Package}
                  label="Dự án SX"
                  value={production_ref?.code}
                  href={production_ref?.href}
                  valueCls="text-blue-700"
                />
                <LinkedRow icon={Factory} label="Phân loại" value={workshop_type_name} />
                <LinkedRow icon={Building2} label="Công ty SX" value={sx_company_name || company_name} />
                <LinkedRow icon={Wrench} label="Cột SX" value={sx_stage_name || status_label} valueCls="text-amber-700" />
                <LinkedRow icon={User} label="Phụ trách SX" value={owners.sx?.full_name} />
                <LinkedRow
                  icon={Calendar}
                  label="Ngày lắp"
                  value={install_date ? formatDate(install_date) : null}
                />
              </ModuleBlock>
            )}
            {mods.vc && (
              <ModuleBlock title="VC / Lắp đặt">
                <LinkedRow
                  icon={Truck}
                  label="Công ty VC"
                  value={vc_company_name}
                  href={overview.vc_href}
                  valueCls="text-amber-800"
                />
                <LinkedRow icon={Wrench} label="Cột VC" value={vc_stage_name} valueCls="text-amber-700" />
                <LinkedRow icon={User} label="Phụ trách VC" value={owners.vc?.full_name} />
                <LinkedRow
                  icon={Calendar}
                  label="Ngày giao"
                  value={delivery_date && delivery_date !== install_date ? formatDate(delivery_date) : null}
                />
              </ModuleBlock>
            )}
          </div>
          {fullPageHref && (
            <Link
              to={fullPageHref}
              className="mt-auto pt-3 inline-flex items-center justify-center gap-1 text-xs font-medium text-blue-700 hover:underline"
            >
              {moduleLinkBits.length
                ? `Mở trang dự án đầy đủ (${moduleLinkBits.join(' · ')})`
                : 'Mở trang dự án đầy đủ'}
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
