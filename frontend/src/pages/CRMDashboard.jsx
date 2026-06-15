import { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike } from '../lib/adminRole';
import { getSocket, connectSocket } from '../lib/socket';
import { formatVND, formatDate, formatDateTime } from '../lib/utils';
import {
  Users, User, DollarSign, Target, Phone, Mail, MapPin,
  Plus, Search, Filter, X, ChevronLeft, ChevronRight, MoreHorizontal, Calendar,
  FileText, ShoppingCart, Receipt, ArrowRight, Eye, Percent, GripVertical,
  Zap, CheckCircle2, TrendingUp, TrendingDown, AlertTriangle, Building2, Rocket, Pin,
  Clock, List, LayoutGrid, GitMerge, UserCheck, Trash2, CheckSquare, BarChart3,
  MessageSquare, MinusSquare,
} from 'lucide-react';
import { ListView, PlannerView, DeadlineView, CommentsView } from '../components/CRMViews';
import AssignedTasksToolbarButton from '../components/AssignedTasksToolbarButton';
import { resolveCrmLeadKanbanScheduleSource } from '../lib/crmLeadDeadlineDisplay';
import EmployeePicker from '../components/EmployeePicker';
import NewDealModal from '../components/NewDealModal';
import {
  loadCrmPipelineSnapshot,
  saveCrmPipelineSnapshot,
  markCrmPipelineCardFocus,
  peekCrmPipelineCardFocus,
  clearCrmPipelineCardFocus,
  getLocallyViewedLeadIdSet,
  getCurrentUserKeyForLeadSeen,
  registerCrmPipelinePersistUi,
  persistCrmPipelineUiNow,
  snapshotHasProperty,
} from '../lib/crmPipelineStorage';
import {
  buildCrmDashboardCacheKey,
  getCrmDashboardCache,
  saveCrmDashboardCache,
  getCrmDashboardMetaCache,
  saveCrmDashboardMetaCache,
} from '../lib/crmDashboardCache';
import { userSeesAllCrmDealsScoped } from '../lib/crmDealAccess';
import {
  findDefaultAdminCrmCompanyPhucDat,
  getStoredCrmFilterCompanyId,
  narrowPipelinesToDefaultForCompany,
  resolveDefaultCrmAdminCompanyId,
  setStoredCrmFilterCompanyId,
} from '../lib/crmCompanyFilter';
import { isCrmCompanyAdmin } from '../lib/crmAdminScope';
import { buildKpiLedgerMonthTooltipHint } from '../lib/kpiPersonalLedgerHints';
import { effectivePipelineStageSlaDays } from '../lib/crmPipelineSla';
import { sortAndDedupePipelineStages } from '../lib/crmPipelineStages';
import {
  canDropDealOnCrmKanbanStage,
  crmDealMoveToWonSxAlreadyCreatedMessage,
  crmDealRevertFromPostWonBlockedMessage,
  crmDealStageMoveBlockedMessage,
  isDealCrmKanbanDragLocked,
} from '../lib/crmDealStageGate';
import DealStageEventModal from '../components/DealStageEventModal';
import CrmDeadlineModal from '../components/CrmDeadlineModal';
import {
  formatCrmRemainingMs,
  getCrmDeadlineUrgencyBadgeClass,
  getCrmDeadlineUrgencyFromIso,
  shouldHideCrmKanbanDeadlineOnCard,
} from '../lib/crmLeadDeadlineDisplay';
import BlockingTasksAlertModal from '../components/BlockingTasksAlertModal';
import DateRangePickerPopover from '../components/DateRangePickerPopover';
import { logFilter } from '../lib/activityLogger';
import { CrmCommentMentionComposer } from '../components/crmCommentMentionUi';
import { resolveMentionIdsFromContent } from '../lib/crmCommentMentions';

const LEAD_PRIORITY_COLORS = { high: 'bg-red-100 text-red-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-gray-100 text-gray-600' };

/** Tuổi chi tiết từ mốc thời gian — ngày + giờ (+ phút nếu dưới 1 giờ) */
function formatAgeDetailed(fromIso) {
  if (!fromIso) return '—';
  const ms = Date.now() - new Date(fromIso).getTime();
  if (ms < 0) return '0 giờ';
  const totalMins = Math.floor(ms / 60000);
  const days = Math.floor(totalMins / (60 * 24));
  const hours = Math.floor((totalMins - days * 24 * 60) / 60);
  const mins = totalMins % 60;
  const parts = [];
  if (days) parts.push(`${days} ngày`);
  if (hours) parts.push(`${hours} giờ`);
  if (!days && !hours) parts.push(`${mins} phút`);
  return parts.join(' ');
}

function formatRemainingMs(ms) {
  if (ms == null || ms <= 0) return null;
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(h / 24);
  const hr = h % 24;
  if (d > 0) return `${d} ngày ${hr} giờ`;
  if (h > 0) return `${h} giờ`;
  const m = Math.floor(ms / 60000);
  return `${m} phút`;
}

/** Giữ badge SX/VC khi silent reload trả list thiếu embed (race sau chuyển cột Thắng/SX). */
function preserveCrmKanbanPipelineBadges(prevRows, nextRows) {
  const pmap = new Map((prevRows || []).map((r) => [String(r.id), r]));
  return (nextRows || []).map((row) => {
    if (!row?.project_id) return row;
    const prev = pmap.get(String(row.id));
    if (!prev) return row;
    let out = row;
    if (!row.sx_pipeline_stage && prev.sx_pipeline_stage) {
      out = { ...out, sx_pipeline_stage: prev.sx_pipeline_stage };
    }
    if (!row.vc_pipeline_stage && prev.vc_pipeline_stage) {
      out = { ...out, vc_pipeline_stage: prev.vc_pipeline_stage };
    }
    return out;
  });
}

async function hydrateCrmLeadBadgeFields(apiClient, leadId, patch) {
  const out = { ...patch };
  if (!out.project_id) return out;
  try {
    const { data: badge } = await apiClient.get(`/crm/leads/${leadId}/badge`);
    if (badge?.sx_pipeline_stage !== undefined) out.sx_pipeline_stage = badge.sx_pipeline_stage;
    if (badge?.vc_pipeline_stage !== undefined) out.vc_pipeline_stage = badge.vc_pipeline_stage;
  } catch {
    /* ignore */
  }
  return out;
}

/** Hiển thị điểm ròng sổ cái KPI (tháng) trên thẻ / bảng */
function formatKpiLedgerNet(v) {
  if (v == null || Number.isNaN(Number(v))) return '—';
  const n = Number(v);
  const s = n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
  return n > 0 ? `+${s}` : s;
}

/** Ô điểm KPI góc thẻ Kanban: hover → chi tiết cộng/trừ theo crm_kpi_ledger (cùng kỳ với dashboard). */
function KpiKanbanLedgerBadge({ leadId, net, periodStart, compact }) {
  const [tipOpen, setTipOpen] = useState(false);
  const leaveTimerRef = useRef(null);
  const loadedSlotRef = useRef('');
  const requestSeqRef = useRef(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [rows, setRows] = useState(null);

  const slot = `${leadId}|${String(periodStart || '').slice(0, 10)}`;

  useEffect(() => {
    loadedSlotRef.current = '';
    requestSeqRef.current += 1;
    setRows(null);
    setErr(null);
  }, [leadId, periodStart]);

  useEffect(
    () => () => {
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    },
    [],
  );

  const openTip = () => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    setTipOpen(true);
    if (loadedSlotRef.current === slot) return;
    const seq = ++requestSeqRef.current;
    setLoading(true);
    setErr(null);
    const params = { period_type: 'monthly' };
    if (periodStart) params.period_start = String(periodStart).slice(0, 10);
    api
      .get(`/kpi/lead-ledger/${leadId}`, { params })
      .then(({ data }) => {
        if (seq !== requestSeqRef.current) return;
        loadedSlotRef.current = slot;
        setRows(Array.isArray(data?.entries) ? data.entries : []);
      })
      .catch((e) => {
        if (seq !== requestSeqRef.current) return;
        loadedSlotRef.current = '';
        setErr(String(e?.response?.data?.error || e?.message || 'Không tải được sổ cái'));
        setRows(null);
      })
      .finally(() => {
        if (seq === requestSeqRef.current) setLoading(false);
      });
  };

  const closeTipSoon = () => {
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = setTimeout(() => {
      setTipOpen(false);
      leaveTimerRef.current = null;
    }, 180);
  };

  const periodLabel = periodStart ? String(periodStart).slice(0, 7) : 'tháng hiện tại';

  return (
    <div
      className="absolute top-1 right-1 z-[35] max-w-[min(calc(100vw-2rem),16rem)]"
      onMouseEnter={openTip}
      onMouseLeave={closeTipSoon}
    >
      <span
        className={`block max-w-[4.25rem] cursor-help truncate rounded px-1 py-0.5 text-[9px] font-bold leading-tight shadow-sm ${
          net > 0 ? 'bg-emerald-600/95 text-white' : net < 0 ? 'bg-red-600/95 text-white' : 'bg-slate-500/90 text-white'
        }`}
      >
        {formatKpiLedgerNet(net)}
      </span>
      {tipOpen && (
        <div
          className={`absolute right-0 top-full z-[80] mt-0.5 min-w-[13rem] max-w-[min(calc(100vw-2rem),18rem)] rounded-lg border border-gray-700 bg-gray-900 p-2 text-left shadow-xl ${
            compact ? 'text-[10px]' : 'text-[11px]'
          } leading-snug text-white`}
          onMouseEnter={openTip}
          onMouseLeave={closeTipSoon}
        >
          <p className="mb-1.5 border-b border-white/10 pb-1 text-[10px] font-semibold uppercase tracking-wide text-white/75">
            Sổ cái KPI · {periodLabel}
          </p>
          <p className="mb-1.5 text-[10px] text-white/85">
            Ròng trên thẻ: <strong className="tabular-nums text-white">{formatKpiLedgerNet(net)}</strong>
            <span className="text-white/55"> — tổng các dòng dưới (có thể khác nếu vừa cập nhật)</span>
          </p>
          {loading && <p className="text-white/70">Đang tải chi tiết…</p>}
          {!loading && err && <p className="text-red-300">{err}</p>}
          {!loading && !err && rows && rows.length === 0 && (
            <p className="text-white/70">Chưa có dòng sổ cái trong kỳ này.</p>
          )}
          {!loading && !err && rows && rows.length > 0 && (
            <ul className="max-h-[min(50vh,14rem)] space-y-1 overflow-y-auto pr-0.5">
              {rows.slice(0, 40).map((r, idx) => {
                const pts = Number(r.points || 0);
                const code = r.source_kpi_code || r.event_type || '—';
                const when = r.occurred_at ? formatDateTime(r.occurred_at) : '';
                const reason = String(r.reason || '').trim();
                return (
                  <li key={r.id || `ledger-${idx}`} className="rounded border border-white/10 bg-white/5 px-1.5 py-1">
                    <div className="flex items-start justify-between gap-1">
                      <span
                        className={`shrink-0 font-mono font-bold tabular-nums ${
                          pts > 0 ? 'text-emerald-300' : pts < 0 ? 'text-red-300' : 'text-white/80'
                        }`}
                      >
                        {formatKpiLedgerNet(pts)}
                      </span>
                      <span className="min-w-0 flex-1 text-right text-[10px] text-sky-200/95">{code}</span>
                    </div>
                    {when && <p className="text-[9px] text-white/50">{when}</p>}
                    {reason && <p className="mt-0.5 text-[10px] text-white/85">{reason}</p>}
                  </li>
                );
              })}
            </ul>
          )}
          {!loading && !err && rows && rows.length > 40 && (
            <p className="mt-1 text-[9px] text-white/55">Và {rows.length - 40} dòng khác — xem đủ trong chi tiết lead (tab Sổ cái KPI).</p>
          )}
        </div>
      )}
    </div>
  );
}

/** SLA cột pipeline: null DB → 7 ngày; sla_days=0 → không áp dụng SLA */
function getPipelineStageSlaTone(stageEnteredAt, stage) {
  if (!stageEnteredAt || !stage) return { level: 'ok', remainingMs: null, deadlineTs: null };
  if (stage.is_won || stage.is_lost || stage.counts_as_completed_revenue) return { level: 'ok', remainingMs: null, deadlineTs: null };
  const slaDays = effectivePipelineStageSlaDays(stage.sla_days);
  if (slaDays == null) return { level: 'ok', remainingMs: null, deadlineTs: null };
  const deadlineTs = new Date(stageEnteredAt).getTime() + slaDays * 86400000;
  const remainingMs = deadlineTs - Date.now();
  if (remainingMs < 0) return { level: 'overdue', remainingMs, deadlineTs };
  if (remainingMs <= 24 * 3600000) return { level: 'soon', remainingMs, deadlineTs };
  if (remainingMs <= 3 * 24 * 3600000) return { level: 'warn', remainingMs, deadlineTs };
  return { level: 'ok', remainingMs, deadlineTs };
}

/** Ngày hẹn NV CRM mở mới nhất (API `crm_next_open_task_deadline`, theo updated_at) — ngưỡng màu giống SLA cột. */
function getCrmOpenTaskDeadlineTone(deadlineIso) {
  if (deadlineIso == null || deadlineIso === '') return null;
  const deadlineTs = new Date(deadlineIso).getTime();
  if (Number.isNaN(deadlineTs)) return null;
  const remainingMs = deadlineTs - Date.now();
  if (remainingMs < 0) return { level: 'overdue', remainingMs, deadlineTs };
  if (remainingMs <= 24 * 3600000) return { level: 'soon', remainingMs, deadlineTs };
  if (remainingMs <= 3 * 24 * 3600000) return { level: 'warn', remainingMs, deadlineTs };
  return { level: 'ok', remainingMs, deadlineTs };
}

// ── HELPER: tính khoảng thời gian ──
function getDateRange(preset) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case 'today': {
      return { from: today.toISOString().split('T')[0], to: today.toISOString().split('T')[0] };
    }
    case 'this_week': {
      const dayOfWeek = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { from: monday.toISOString().split('T')[0], to: sunday.toISOString().split('T')[0] };
    }
    case 'last_week': {
      const dayOfWeek = today.getDay();
      const thisMonday = new Date(today);
      thisMonday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      const lastMonday = new Date(thisMonday);
      lastMonday.setDate(thisMonday.getDate() - 7);
      const lastSunday = new Date(lastMonday);
      lastSunday.setDate(lastMonday.getDate() + 6);
      return { from: lastMonday.toISOString().split('T')[0], to: lastSunday.toISOString().split('T')[0] };
    }
    case 'this_month': {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { from: firstDay.toISOString().split('T')[0], to: lastDay.toISOString().split('T')[0] };
    }
    case 'last_month': {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: firstDay.toISOString().split('T')[0], to: lastDay.toISOString().split('T')[0] };
    }
    case 'this_quarter': {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      const firstDay = new Date(now.getFullYear(), qMonth, 1);
      const lastDay = new Date(now.getFullYear(), qMonth + 3, 0);
      return { from: firstDay.toISOString().split('T')[0], to: lastDay.toISOString().split('T')[0] };
    }
    case 'this_year': {
      return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
    }
    default:
      return { from: '', to: '' };
  }
}

const TIME_PRESETS = [
  { key: '', label: 'Tất cả' },
  { key: 'this_week', label: 'Tuần này' },
  { key: 'this_month', label: 'Tháng này' },
  { key: 'custom', label: 'Tùy chỉnh' },
];

const KANBAN_LOAD_OPTIONS = ['500', '1000', '2000', 'all'];

/** Phân loại lead/deal trên dashboard (localStorage; khác key với công ty) */
const LS_CRM_DASH_LEAD_TYPE = 'crm_dash_filter_lead_type_id';

/** Có bộ lọc / tìm kiếm đang bật (không tính công ty mặc định). */
function snapshotHasActiveFilters(snap) {
  if (!snap) return false;
  return !!(
    (snap.searchText && String(snap.searchText).trim())
    || snap.filterAssignee
    || snap.filterAssigneeName
    || snap.filterSource
    || snap.filterStage
    || snap.filterRegion
    || snap.filterLeadType
    || snap.filterReferrer
    || snap.filterCustomerCompany
    || snap.filterPhone === 'no_phone'
    || snap.showOrphanDealColumn
    || snap.timePreset
  );
}

/** Lead/Deal đang trên pipeline (chưa cột Thắng / Thua) — dùng stage từ API, không dùng is_won ở root. */
function isActiveCrmPipelineItem(item) {
  const st = item?.stage;
  return !st?.is_won && !st?.is_lost;
}

/** Cột deal tên chứa «Hoàn thành» — khớp LeadDetail / Zalo OA (chuẩn hóa ASCII). */
function isCrmDealStageHoanThanhName(name) {
  const ascii = String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return ascii.includes('hoan thanh');
}

function resolveDealStageForKpi(item, stagesDeal) {
  const sid = item?.stage_id;
  if (sid && Array.isArray(stagesDeal) && stagesDeal.length) {
    const s = stagesDeal.find((x) => String(x.id) === String(sid));
    if (s) return s;
  }
  const emb = item?.stage && typeof item.stage === 'object' && !Array.isArray(item.stage) ? item.stage : null;
  return emb;
}

/**
 * Deal đã hoàn thành doanh thu (thu tiền / xong HĐ — nhóm Hoàn thành trên BC NV):
 * `deal_report_bucket === 'completed'`, hoặc `canonical_slug === 'completed'`, hoặc tên cột chứa «Hoàn thành».
 */
/**
 * Cột "Đã hoàn thành" cho ô "Doanh thu đã hoàn thành":
 *   - Ưu tiên cờ `counts_as_completed_revenue` (cấu hình ở Pipeline Settings).
 *     Nếu pipeline có >= 1 stage tick cờ này → chỉ tính các cột được tick.
 *   - Fallback: dò theo canonical_slug = 'completed' / deal_report_bucket = 'completed'
 *     / tên cột chứa "Hoàn thành" (hành vi cũ).
 */
function hasExplicitCompletedRevenueStage(stagesDeal) {
  return Array.isArray(stagesDeal) && stagesDeal.some((s) => !!s?.counts_as_completed_revenue);
}

function dealIsRevenueCompletedStage(item, stagesDeal) {
  const st = resolveDealStageForKpi(item, stagesDeal);
  if (!st) return false;
  if (st.is_lost || st.canonical_slug === 'lost' || st.deal_report_bucket === 'lost') return false;
  if (hasExplicitCompletedRevenueStage(stagesDeal)) {
    return !!st.counts_as_completed_revenue;
  }
  if (st.deal_report_bucket === 'completed') return true;
  if (st.canonical_slug === 'completed') return true;
  if (st.name && isCrmDealStageHoanThanhName(st.name)) return true;
  return false;
}

/**
 * Cột Thắng (= cột “Đã ký HĐ”) — KHÓA về ĐÚNG 1 stage duy nhất để KPI “Doanh thu thắng”
 * luôn khớp tổng cột Thắng trên Kanban dù lọc “Tất cả giai đoạn”.
 *
 * Cách chọn stage thắng (theo `stagesDeal` của pipeline đang xem):
 *   1) Ưu tiên stage có `canonical_slug === 'contract_signed'`.
 *   2) Fallback: stage có `is_won === true` (và không thuộc Hoàn thành / Lost).
 *   3) Nếu có nhiều stage thỏa: lấy stage đầu tiên (sort theo `position` nếu có).
 *
 * Một deal được coi là “Thắng” khi và chỉ khi `stage_id` của deal trùng `id` stage thắng đã chọn.
 */
/**
 * Cột "Thắng" cho ô "Doanh thu thắng" trên dashboard:
 *   - Ưu tiên cờ `counts_as_won_revenue` (cấu hình ở Pipeline Settings).
 *     Nếu pipeline có >= 1 stage tick cờ này → cộng đúng các cột được tick.
 *   - Fallback dùng `is_won` (hành vi mặc định).
 *   - Luôn loại các stage Lost / Hoàn thành (đã có ô "Doanh thu đã hoàn thành" riêng).
 */
function pickDealWonStages(stagesDeal) {
  if (!Array.isArray(stagesDeal) || !stagesDeal.length) return [];
  const hasExplicitCompleted = stagesDeal.some((s) => !!s?.counts_as_completed_revenue);
  const notLostOrCompleted = (s) => {
    if (!s || s.is_lost) return false;
    if (s.canonical_slug === 'lost' || s.deal_report_bucket === 'lost') return false;
    // Nếu admin đã chọn rõ các stage "đã hoàn thành" → loại các stage đó khỏi "thắng".
    if (hasExplicitCompleted) return !s.counts_as_completed_revenue;
    // Fallback hành vi cũ: loại các stage được suy luận là "Hoàn thành".
    if (s.canonical_slug === 'completed' || s.deal_report_bucket === 'completed') return false;
    if (s.name && isCrmDealStageHoanThanhName(s.name)) return false;
    return true;
  };
  const explicit = stagesDeal.filter((s) => !!s?.counts_as_won_revenue && notLostOrCompleted(s));
  if (explicit.length) return explicit;
  return stagesDeal.filter((s) => !!s?.is_won && notLostOrCompleted(s));
}

function dealIsWonStage(item, stagesDeal) {
  const wonStages = pickDealWonStages(stagesDeal);
  if (!wonStages.length) return false;
  const sid = String(item?.stage_id || '');
  if (!sid) return false;
  return wonStages.some((s) => String(s.id) === sid);
}

/** Deal trên pipeline đang mở — không tính cột Thắng / Thua / Hoàn thành DT. */
function dealCountsTowardPipelineEstimate(item, stagesDeal) {
  const st = resolveDealStageForKpi(item, stagesDeal);
  if (st?.is_lost) return false;
  if (dealIsWonStage(item, stagesDeal)) return false;
  if (dealIsRevenueCompletedStage(item, stagesDeal)) return false;
  return true;
}

function hasExplicitExpectedRevenueStage(stagesDeal) {
  return Array.isArray(stagesDeal) && stagesDeal.some((s) => !!s?.counts_as_expected_revenue);
}

/**
 * Deal tính vào «Giá trị kỳ vọng»:
 *   - Nếu pipeline có >= 1 cột tick `counts_as_expected_revenue` → chỉ các cột đó.
 *   - Ngược lại → fallback `dealCountsTowardPipelineEstimate` (pipeline mở).
 */
function dealCountsTowardExpectedValue(item, stagesDeal) {
  if (!hasExplicitExpectedRevenueStage(stagesDeal)) {
    return dealCountsTowardPipelineEstimate(item, stagesDeal);
  }
  const st = resolveDealStageForKpi(item, stagesDeal);
  return !!st?.counts_as_expected_revenue;
}

/** % xác suất của từng deal — ưu tiên cột probability, fallback theo cột pipeline. */
function dealProbabilityPercent(deal, stagesDeal) {
  const raw = deal?.probability;
  if (raw != null && raw !== '') {
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.max(0, Math.min(100, Math.round(n)));
  }
  const st = resolveDealStageForKpi(deal, stagesDeal);
  const fb = st?.default_probability;
  if (fb != null && fb !== '') {
    const n = Number(fb);
    if (Number.isFinite(n)) return Math.max(0, Math.min(100, Math.round(n)));
  }
  return 50;
}

/** Giá trị kỳ vọng một deal = giá trị dự kiến × xác suất %. */
function dealWeightedValue(item, stagesDeal) {
  const val = Number(item?.estimated_value) || 0;
  const pct = dealProbabilityPercent(item, stagesDeal);
  return Math.round((val * pct) / 100);
}

/**
 * Kanban phải có đúng một dòng mỗi id. RPC/load-more có thể trả cùng id hai lần với stage_id khác thời điểm
 * → cùng deal hiện ở hai cột; xóa một thẻ vẫn chỉ một bản ghi DB nên cả hai biến mất.
 */
function dedupeCrmKanbanRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const map = new Map();
  for (const r of list) {
    if (!r || r.id == null || r.id === '') continue;
    const k = String(r.id);
    const prev = map.get(k);
    if (!prev) {
      map.set(k, r);
      continue;
    }
    const ta = new Date(prev.updated_at || prev.created_at || 0).getTime();
    const tb = new Date(r.updated_at || r.created_at || 0).getTime();
    map.set(k, tb >= ta ? r : prev);
  }
  return [...map.values()];
}

export default function CRMDashboard() {
  const { user } = useAuth();
  const seesAllCrmDeals = userSeesAllCrmDealsScoped(user);
  const isAdmin = isAdminLike(user);
  /** Admin công ty (khác admin hệ thống): backend khóa API + GET /companies chỉ trả một công ty. */
  const isCompanyScopedAdmin = isCrmCompanyAdmin(user);

  const persistedUiRef = useRef(undefined);
  if (persistedUiRef.current === undefined) {
    persistedUiRef.current = typeof window !== 'undefined' ? loadCrmPipelineSnapshot() : null;
  }
  const P = persistedUiRef.current;
  const hadSessionSnapshotRef = useRef(!!P);
  /** Snapshot gốc khi mở lại trang — dùng khôi phục sau khi API/stages/NV đã tải. */
  const frozenUiSnapshotRef = useRef(P);
  /** Chưa prune bộ lọc và chưa ghi đè storage (tránh xóa lọc khi danh mục chưa load). */
  const deferFilterPruneRef = useRef(!!P);
  const suppressSnapshotOverwriteRef = useRef(!!P);

  const [dataLead, setDataLead] = useState(null);
  const [dataDeal, setDataDeal] = useState(null);
  // leads & deals are computed via useMemo (client-side filter) - see below
  const [stagesLead, setStagesLead] = useState([]);
  const [stagesDeal, setStagesDeal] = useState([]);
  const [sources, setSources] = useState([]);
  const [leadTypes, setLeadTypes] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [pipelines, setPipelines] = useState([]);
  const [allLeads, setAllLeads] = useState([]);
  const [allDeals, setAllDeals] = useState([]);
  const allDealsRef = useRef(allDeals);
  allDealsRef.current = allDeals;
  const [filterCompany, setFilterCompany] = useState(() => {
    if (snapshotHasProperty(P, 'filterCompany')) return P.filterCompany ?? '';
    const ls = getStoredCrmFilterCompanyId();
    return ls || '';
  });
  const [searchText, setSearchText] = useState(() => P?.searchText ?? '');
  const [searchFocused, setSearchFocused] = useState(false);
  const [filterAssignee, setFilterAssignee] = useState(() => P?.filterAssignee ?? '');
  /** Gõ tên để thu hẹp danh sách trong dropdown NV */
  const [assigneeListSearch, setAssigneeListSearch] = useState(() => P?.assigneeListSearch ?? '');
  /** Lọc lead/deal theo tên người phụ trách / chủ lead (không lẫn tên khách hàng) */
  const [filterAssigneeName, setFilterAssigneeName] = useState(() => P?.filterAssigneeName ?? '');
  const [filterSource, setFilterSource] = useState(() => P?.filterSource ?? '');
  const [filterStage, setFilterStage] = useState(() => P?.filterStage ?? '');
  /** Lọc pipeline theo khu vực CRM (company_regions); `__none__` = chưa gán khu vực */
  const [filterRegion, setFilterRegion] = useState(() => P?.filterRegion ?? '');
  const [companyRegions, setCompanyRegions] = useState([]);
  const [filterLeadType, setFilterLeadType] = useState(() => P?.filterLeadType ?? '');
  const [filterReferrer, setFilterReferrer] = useState(() => P?.filterReferrer ?? '');
  const [filterCustomerCompany, setFilterCustomerCompany] = useState(() => P?.filterCustomerCompany ?? '');
  const [crmReferrers, setCrmReferrers] = useState([]);
  const companyFilterFromLsRef = useRef(false);
  /** Admin + filter rỗng: chỉ tự gán Phúc Đạt một lần; sau đó NV chọn «Tất cả» (= '') vẫn load đúng */
  const adminCompanyDefaultResolvedRef = useRef(false);
  const leadTypeFilterFromLsRef = useRef(false);
  // Mặc định luôn chỉ hiện lead đã có SĐT; không phục hồi giá trị '' (tất cả)
  const [filterPhone, setFilterPhone] = useState(() => {
    if (snapshotHasProperty(P, 'filterPhone')) {
      const v = P.filterPhone;
      if (v === 'no_phone' || v === 'has_phone') return v;
    }
    return 'has_phone';
  });
  /** Hiện cột Kanban «Chưa có giai đoạn» ở cuối — chứa deal không thuộc bất kỳ cột nào của pipeline đang xem. */
  const [showOrphanDealColumn, setShowOrphanDealColumn] = useState(() => !!P?.showOrphanDealColumn);
  /** Thu gọn alert strip «deal quá hạn» (chỉ theo phiên, không lưu) */
  const [overdueAlertCollapsed, setOverdueAlertCollapsed] = useState(true);
  const [showAdvSearch, setShowAdvSearch] = useState(() => {
    if (P?.showAdvSearch) return true;
    if (snapshotHasActiveFilters(P)) return true;
    return false;
  });
  const [users, setUsers] = useState([]);
  const [pipelineType, setPipelineType] = useState(() => {
    const t = P?.pipelineType;
    if (t === 'lead' || t === 'deal') return t;
    return localStorage.getItem('crm_pinned_tab') || 'lead';
  });
  const [showNewLead, setShowNewLead] = useState(false);
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [wonAssignModal, setWonAssignModal] = useState(false);
  const [wonAssignLeadId, setWonAssignLeadId] = useState(null);
  const [wonAssignUser, setWonAssignUser] = useState('');
  const [wonAssigning, setWonAssigning] = useState(false);
  const [wonAssignError, setWonAssignError] = useState('');
  const [wonAssignRegion, setWonAssignRegion] = useState('');
  const [wonAssignRegions, setWonAssignRegions] = useState([]);
  const [wonAssignRegionsLoading, setWonAssignRegionsLoading] = useState(false);
  const [pinnedTab, setPinnedTab] = useState(() => P?.pinnedTab ?? (localStorage.getItem('crm_pinned_tab') || ''));
  /** Trạng thái đồng bộ ngầm (silent refetch): hiển thị "Cập nhật lúc HH:mm" thay vì spinner */
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  // True khi đang load lần đầu (chưa có dữ liệu trên dashboard).
  // Hiển thị banner "Đang tải dữ liệu…" thay vì màn trắng.
  const [firstLoading, setFirstLoading] = useState(true);
  const [viewMode, setViewMode] = useState(() => {
    const v = P?.viewMode;
    return ['kanban', 'list', 'planner', 'deadline', 'comments', 'calendar'].includes(v) ? v : 'kanban';
  });
  /** Cấu hình deadline theo công ty (cho view "Deadline") */
  const [deadlineConfig, setDeadlineConfig] = useState(null);
  /** Map { lead_id → {count,last_at,last_user_id} } cho view "Bình luận" */
  const [commentsIndex, setCommentsIndex] = useState({});
  /** Chọn thẻ Kanban để gộp thủ công (không dùng quét trùng) */
  const [manualMergeIds, setManualMergeIds] = useState([]);
  const [manualMergeModalOpen, setManualMergeModalOpen] = useState(false);
  const [bulkStageTarget, setBulkStageTarget] = useState('');
  const [bulkMoving, setBulkMoving] = useState(false);
  const [bulkAssignModalOpen, setBulkAssignModalOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [bulkDeleteReason, setBulkDeleteReason] = useState('');
  /** Bình luận nhanh từ thẻ Kanban */
  const [kanbanCommentItem, setKanbanCommentItem] = useState(null);
  const [kanbanCommentBody, setKanbanCommentBody] = useState('');
  const [kanbanCommentPosting, setKanbanCommentPosting] = useState(false);
  const [kanbanCommentMembers, setKanbanCommentMembers] = useState([]);
  /** Deal pipeline: mở popup chọn giờ rồi POST /events sau PATCH stage (bật theo từng pipeline tại Cài đặt pipeline) */
  const [dealKanbanEventCtx, setDealKanbanEventCtx] = useState(null);
  const [dealKanbanEventBusy, setDealKanbanEventBusy] = useState(false);
  /** Cột yêu cầu deadline: mở modal chọn deadline (+ lý do) trước khi PATCH stage */
  const [deadlineCtx, setDeadlineCtx] = useState(null);
  const [deadlineBusy, setDeadlineBusy] = useState(false);
  /** Deal kéo sang Thắng, chưa có dự án: chọn công ty SX trước khi PATCH stage */
  const [dealWonProductionCtx, setDealWonProductionCtx] = useState(null);
  const [dealWonProductionCompanyId, setDealWonProductionCompanyId] = useState('');
  const [dealWonProductionWorkshopTypeId, setDealWonProductionWorkshopTypeId] = useState('');
  const [dealWonProductionWorkshopTypes, setDealWonProductionWorkshopTypes] = useState([]);
  const [dealWonProductionWorkshopLoading, setDealWonProductionWorkshopLoading] = useState(false);
  const [dealWonProductionError, setDealWonProductionError] = useState('');
  /** Deal đã có dự án SX, kéo lại sang Thắng — chỉ thông báo, không mở hộp chuyển */
  const [dealWonSxExistsCtx, setDealWonSxExistsCtx] = useState(null);
  const [productionCompaniesForSx, setProductionCompaniesForSx] = useState([]);

  /** Tải phân loại SX khi mở hộp «Chuyển Deal sang Sản xuất» (kéo Kanban → Thắng). */
  useEffect(() => {
    if (!dealWonProductionCtx || !dealWonProductionCompanyId) {
      if (!dealWonProductionCtx) setDealWonProductionWorkshopTypes([]);
      return undefined;
    }
    let cancelled = false;
    setDealWonProductionWorkshopLoading(true);
    api.get('/workshop/project-types', {
      params: { company_id: dealWonProductionCompanyId, module: 'production' },
    })
      .then((r) => {
        if (cancelled) return;
        const list = Array.isArray(r.data) ? r.data : [];
        setDealWonProductionWorkshopTypes(list);
        if (list.length === 1) {
          setDealWonProductionWorkshopTypeId(String(list[0].id));
        } else if (
          dealWonProductionWorkshopTypeId
          && !list.some((t) => String(t.id) === String(dealWonProductionWorkshopTypeId))
        ) {
          setDealWonProductionWorkshopTypeId('');
        }
      })
      .catch(() => { if (!cancelled) setDealWonProductionWorkshopTypes([]); })
      .finally(() => { if (!cancelled) setDealWonProductionWorkshopLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealWonProductionCtx, dealWonProductionCompanyId]);
  /** Server trả deal_won (tạo dự án lỗi) hoặc cần tạo dự án sau khi đã Thắng */
  const [dealAutoCreatePick, setDealAutoCreatePick] = useState(null);
  const [dealAutoCreateCompanyId, setDealAutoCreateCompanyId] = useState('');
  const [dealAutoCreateWorkshopTypeId, setDealAutoCreateWorkshopTypeId] = useState('');
  const [dealAutoCreateWorkshopTypes, setDealAutoCreateWorkshopTypes] = useState([]);
  const [dealAutoCreateWorkshopLoading, setDealAutoCreateWorkshopLoading] = useState(false);
  const [dealAutoCreatePickError, setDealAutoCreatePickError] = useState('');
  const loadRef = useRef(null);
  /** Tăng mỗi lần gọi load — bỏ qua kết quả cũ nếu đã có load mới hơn */
  const loadSeqRef = useRef(0);
  /** load() vừa setFilterCompany — tránh useEffect filterCompany gọi load() lần 2 */
  const suppressFilterCompanyLoadRef = useRef(false);
  const loadDebounceTimerRef = useRef(null);
  /** Cache key vừa hydrate — tránh hydrate lại liên tục cùng 1 filter combo */
  const lastHydratedCacheKeyRef = useRef(null);
  /** Giá trị GET /crm/live-version gần nhất — đổi → silent reload Kanban/KPI */
  const crmLiveVersionRef = useRef(null);
  /** Số bản ghi lead/deal tải cho Kanban (API /crm/leads có phân trang; "all" = lặp offset đến hết) */
  const [kanbanLoadLimit, setKanbanLoadLimit] = useState(() => {
    const fromP = P?.kanbanLoadLimit != null ? String(P.kanbanLoadLimit) : null;
    if (fromP && KANBAN_LOAD_OPTIONS.includes(fromP)) return fromP;
    const s = localStorage.getItem('crm_kanban_load_limit');
    return KANBAN_LOAD_OPTIONS.includes(s) ? s : 'all';
  });

  /** Tổng số lead/deal theo SĐT từ API (limit=1, chỉ đọc `total`) — không phụ thuộc mức tải Kanban; theo NV + ngày trên server */
  const [pipelinePhoneTotals, setPipelinePhoneTotals] = useState({ lead: null, deal: null });

  // Modal cảnh báo khi không thể chuyển giai đoạn (còn nhiệm vụ chưa hoàn thành)
  const [blockingModal, setBlockingModal] = useState(null); // { currentStageName, targetStageName, remainingTasks, leadId }
  /** Trạng thái "Tải thêm": offset đang dừng, total server, và đang loading */
  const [loadMoreState, setLoadMoreState] = useState({ leadOffset: 0, dealOffset: 0, leadTotal: null, dealTotal: null, loading: false });

  // ── TIME FILTER STATE ──
  const [timePreset, setTimePreset] = useState(() => (typeof P?.timePreset === 'string' ? P.timePreset : ''));
  const [customDateFrom, setCustomDateFrom] = useState(() => P?.customDateFrom ?? '');
  const [customDateTo, setCustomDateTo] = useState(() => P?.customDateTo ?? '');
  const [showCustomDate, setShowCustomDate] = useState(() => !!P?.showCustomDate);
  const [showDateRangePicker, setShowDateRangePicker] = useState(false);

  // ── COMPANY-BASED EMPLOYEE FILTER ──
  const [companyEmployees, setCompanyEmployees] = useState([]);
  const [companyDepts, setCompanyDepts] = useState([]);
  const [userCompanyId, setUserCompanyId] = useState('');
  const [fbPages, setFbPages] = useState([]); // Facebook pages for source labels

  const switchTab = (tab) => {
    setPipelineType(tab);
  };

  const toggleManualMergeSelect = useCallback((id) => {
    setManualMergeIds((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return [...s];
    });
  }, []);

  /** Gộp / bỏ toàn bộ id trong cột (chọn tất cả cột) */
  const toggleSelectAllInColumn = useCallback((columnItemIds) => {
    const ids = (columnItemIds || []).map(String);
    if (!ids.length) return;
    setManualMergeIds((prev) => {
      const prevSet = new Set(prev.map(String));
      const allSelected = ids.every((id) => prevSet.has(id));
      if (allSelected) {
        const drop = new Set(ids);
        return prev.filter((id) => !drop.has(String(id)));
      }
      return [...new Set([...prev.map(String), ...ids])];
    });
  }, []);

  useEffect(() => {
    if (!kanbanCommentItem?.id) {
      setKanbanCommentMembers([]);
      return undefined;
    }
    let cancelled = false;
    api.get(`/crm/leads/${kanbanCommentItem.id}/members`)
      .then((r) => { if (!cancelled) setKanbanCommentMembers(Array.isArray(r.data) ? r.data : []); })
      .catch(() => { if (!cancelled) setKanbanCommentMembers([]); });
    return () => { cancelled = true; };
  }, [kanbanCommentItem?.id]);

  const submitKanbanQuickComment = useCallback(async ({ mention_user_ids } = {}) => {
    const v = kanbanCommentBody.trim();
    const it = kanbanCommentItem;
    if (!v || !it) return;
    setKanbanCommentPosting(true);
    try {
      const payload = { body: v };
      const ids = mention_user_ids?.length
        ? mention_user_ids
        : resolveMentionIdsFromContent(v, kanbanCommentMembers, { excludeUserId: user?.id });
      if (ids.length) payload.mention_user_ids = ids;
      await api.post(`/crm/leads/${it.id}/comments`, payload);
      setKanbanCommentItem(null);
      setKanbanCommentBody('');
      setCommentsIndex((prev) => ({
        ...prev,
        [String(it.id)]: {
          count: (prev[String(it.id)]?.count || 0) + 1,
          last_at: new Date().toISOString(),
          last_user_id: user?.id ?? null,
        },
      }));
    } catch (e) {
      alert(e?.response?.data?.error || 'Lỗi gửi bình luận');
    }
    setKanbanCommentPosting(false);
  }, [kanbanCommentBody, kanbanCommentItem, kanbanCommentMembers, user?.id]);

  const bulkDeleteSelected = useCallback(() => {
    const ids = [...new Set((manualMergeIds || []).map((x) => String(x)).filter(Boolean))];
    if (!ids.length) return;
    setBulkDeleteReason('');
    setBulkDeleteModalOpen(true);
  }, [manualMergeIds]);

  const confirmBulkDelete = useCallback(async () => {
    const ids = [...new Set((manualMergeIds || []).map((x) => String(x)).filter(Boolean))];
    if (!ids.length) return;
    setBulkDeleting(true);
    try {
      for (const id of ids) {
        await api.delete(`/crm/leads/${encodeURIComponent(id)}`, {
          data: { delete_reason: bulkDeleteReason.trim() || null },
        });
      }
      setManualMergeIds([]);
      setBulkDeleteModalOpen(false);
      await loadRef.current?.({ silent: true });
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi xóa');
    }
    setBulkDeleting(false);
  }, [manualMergeIds, bulkDeleteReason]);

  useEffect(() => {
    setManualMergeIds([]);
    setBulkStageTarget('');
  }, [pipelineType]);

  useEffect(() => {
    if (viewMode !== 'kanban' && viewMode !== 'deadline') {
      setManualMergeIds([]);
      setBulkStageTarget('');
    }
  }, [viewMode]);

  const itemsByIdForMerge = useMemo(() => {
    const m = {};
    [...allLeads, ...allDeals].forEach((x) => { m[x.id] = x; });
    return m;
  }, [allLeads, allDeals]);

  const togglePinTab = (tab) => {
    if (pinnedTab === tab) {
      localStorage.removeItem('crm_pinned_tab');
      setPinnedTab('');
    } else {
      localStorage.setItem('crm_pinned_tab', tab);
      setPinnedTab(tab);
    }
  };
  const navigate = useNavigate();

  // Auto-create project (chạy ngầm)
  const [autoCreateStatus, setAutoCreateStatus] = useState(null); // null | 'loading' | 'success' | 'error'
  const [autoCreateResult, setAutoCreateResult] = useState(null);
  const [autoCreateError, setAutoCreateError] = useState('');
  const autoCreateCalledRef = useRef(false);

  const autoCreateProject = async (dealId, productionCompanyId, workshopTypeId = null) => {
    if (!productionCompanyId) {
      const d = allDealsRef.current.find((x) => String(x.id) === String(dealId));
      const pref = isAdmin ? findDefaultAdminCrmCompanyPhucDat(productionCompaniesForSx) : '';
      setDealAutoCreatePick(dealId);
      setDealAutoCreateCompanyId(filterCompany || (d?.company_id ? String(d.company_id) : '') || pref);
      setDealAutoCreatePickError('');
      return;
    }
    if (autoCreateCalledRef.current) return;
    autoCreateCalledRef.current = true;
    setAutoCreateStatus('loading');
    setAutoCreateError('');
    try {
      const { data } = await api.post(`/crm/deals/${dealId}/auto-create-project`, {
        production_company_id: productionCompanyId,
        workshop_type_id: workshopTypeId || null,
      });
      setAutoCreateResult(data);
      setAutoCreateStatus('success');
      load({ silent: true });
    } catch (e) {
      const msg = e.response?.data?.error || 'Lỗi tạo dự án';
      if (e.response?.data?.project_id) {
        setAutoCreateResult({ project_id: e.response.data.project_id });
        setAutoCreateStatus('success');
      } else {
        setAutoCreateError(msg);
        setAutoCreateStatus('error');
      }
      autoCreateCalledRef.current = false;
    }
  };

  // ── Handle time preset change ──
  const handleTimePresetChange = (preset) => {
    setTimePreset(preset);
    if (preset === 'custom') {
      setShowCustomDate(true);
    } else {
      setShowCustomDate(false);
      if (preset === '') {
        setCustomDateFrom('');
        setCustomDateTo('');
      } else {
        const range = getDateRange(preset);
        setCustomDateFrom(range.from);
        setCustomDateTo(range.to);
      }
    }
  };

  useEffect(() => {
    api.get('/companies', { params: { for_module: 'production' } })
      .then((r) => setProductionCompaniesForSx(r.data?.companies || []))
      .catch(() => setProductionCompaniesForSx([]));
  }, []);

  /**
   * Ưu tiên: nạp danh sách CÔNG TY (cho bộ lọc CRM) ngay lập tức — chạy trước
   * `load()` chính, để dropdown «Công ty» có dữ liệu đầu tiên (admin có thể đổi
   * công ty ngay khi mở trang, không phải chờ KPI/Kanban tải xong). Chỉ chạy 1 lần;
   * `load()` sau đó vẫn refresh lại danh sách để cập nhật.
   */
  useEffect(() => {
    let cancelled = false;
    api
      .get('/companies', { params: { for_module: 'crm' } })
      .then((r) => {
        if (cancelled) return;
        const list = r.data?.companies || r.data || [];
        setCompanies(Array.isArray(list) ? list : []);
      })
      .catch(() => { /* fallback do load() chính xử lý */ });
    return () => { cancelled = true; };
  }, []);

  // Phục hồi bộ lọc công ty (admin) + phân loại từ localStorage chỉ khi KHÔNG có snapshot session (vừa quay từ chi tiết)
  useEffect(() => {
    if (user == null) return;
    if (companyFilterFromLsRef.current) return;
    companyFilterFromLsRef.current = true;
    if (hadSessionSnapshotRef.current && snapshotHasProperty(P, 'filterCompany')) return;
    if (!isAdmin || isCompanyScopedAdmin) return;
    try {
      const s = getStoredCrmFilterCompanyId();
      if (s) setFilterCompany(s);
    } catch {
      // ignore
    }
  }, [isAdmin, isCompanyScopedAdmin, user, P]);

  // Admin tổng: mặc định công ty đầu danh sách — chỉ lần đầu mở trang, không ghi đè snapshot «Tất cả công ty»
  useEffect(() => {
    if (hadSessionSnapshotRef.current) return;
    if (isCompanyScopedAdmin) return;
    if (!isAdmin || !companies.length) return;
    try {
      if (getStoredCrmFilterCompanyId()) return;
    } catch {
      /* ignore */
    }
    if (filterCompany) return;
    const cid = resolveDefaultCrmAdminCompanyId(companies);
    if (!cid) return;
    setFilterCompany(cid);
    try {
      setStoredCrmFilterCompanyId(cid);
    } catch {
      /* ignore */
    }
  }, [isAdmin, isCompanyScopedAdmin, companies, filterCompany]);

  useEffect(() => {
    if (user == null) return;
    if (leadTypeFilterFromLsRef.current) return;
    leadTypeFilterFromLsRef.current = true;
    if (hadSessionSnapshotRef.current && snapshotHasProperty(P, 'filterLeadType')) return;
    try {
      const s = localStorage.getItem(LS_CRM_DASH_LEAD_TYPE);
      if (s) setFilterLeadType(s);
    } catch {
      // ignore
    }
  }, [user, P]);

  /** Admin: chờ danh sách công ty trước khi load (tránh burst API không company_id). */
  const crmDashboardDataReady = useMemo(() => {
    if (user == null) return false;
    if (!isAdmin || isCompanyScopedAdmin) return true;
    return companies.length > 0;
  }, [user, isAdmin, isCompanyScopedAdmin, companies.length]);

  useEffect(() => {
    if (!crmDashboardDataReady) return;
    if (suppressFilterCompanyLoadRef.current) {
      suppressFilterCompanyLoadRef.current = false;
      return;
    }
    let veryFreshCacheHit = false;
    // ── Hydrate metadata cache (localStorage) — sống qua đóng tab ──
    try {
      if (user?.id) {
        const meta = getCrmDashboardMetaCache(user.id);
        if (meta?.data) {
          const m = meta.data;
          if (Array.isArray(m.companies) && m.companies.length && companies.length === 0) {
            setCompanies(m.companies);
          }
          if (Array.isArray(m.users) && m.users.length && users.length === 0) {
            setUsers(m.users);
          }
          if (Array.isArray(m.pipelines) && m.pipelines.length && pipelines.length === 0) {
            setPipelines(m.pipelines);
          }
          if (Array.isArray(m.sources) && m.sources.length && sources.length === 0) {
            setSources(m.sources);
          }
          if (Array.isArray(m.leadTypes) && m.leadTypes.length && leadTypes.length === 0) {
            setLeadTypes(m.leadTypes);
          }
          if (Array.isArray(m.stagesLead) && m.stagesLead.length && stagesLead.length === 0) {
            setStagesLead(m.stagesLead);
          }
          if (Array.isArray(m.stagesDeal) && m.stagesDeal.length && stagesDeal.length === 0) {
            setStagesDeal(m.stagesDeal);
          }
          if (m.fbPages && (!fbPages || Object.keys(fbPages).length === 0)) {
            setFbPages(m.fbPages);
          }
        }
      }
    } catch {
      /* meta hydrate lỗi — bỏ qua */
    }
    // ── Stale-while-revalidate: hydrate cache để dashboard hiện ngay ──
    try {
      const cacheKey = buildCrmDashboardCacheKey({
        userId: user?.id,
        filterCompany,
        filterAssignee,
        filterPhone,
        filterLeadType,
        filterReferrer,
        filterCustomerCompany,
        customDateFrom,
        customDateTo,
        kanbanLoadLimit,
      });
      if (cacheKey && cacheKey !== lastHydratedCacheKeyRef.current) {
        const cached = getCrmDashboardCache(cacheKey);
        if (cached?.data) {
          const c = cached.data;
          if (c.dataLead !== undefined) setDataLead(c.dataLead);
          if (c.dataDeal !== undefined) setDataDeal(c.dataDeal);
          if (Array.isArray(c.pipelines)) setPipelines(c.pipelines);
          if (Array.isArray(c.allLeads)) setAllLeads(c.allLeads);
          if (Array.isArray(c.allDeals)) setAllDeals(c.allDeals);
          if (c.loadMoreState) setLoadMoreState({ ...c.loadMoreState, loading: false });
          if (Array.isArray(c.stagesLead)) setStagesLead(c.stagesLead);
          if (Array.isArray(c.stagesDeal)) setStagesDeal(c.stagesDeal);
          if (Array.isArray(c.sources)) setSources(c.sources);
          if (Array.isArray(c.leadTypes)) setLeadTypes(c.leadTypes);
          if (c.fbPages) setFbPages(c.fbPages);
          if (Array.isArray(c.companies) && c.companies.length) setCompanies(c.companies);
          if (Array.isArray(c.users) && c.users.length) setUsers(c.users);
          // Tắt spinner ngay — user thấy dashboard tức thì
          setFirstLoading(false);
          lastHydratedCacheKeyRef.current = cacheKey;
          // Cache cực tươi (< 30s) → bỏ qua silent reload, giảm tải API
          if (cached.isVeryFresh) {
            veryFreshCacheHit = true;
          }
        }
      }
    } catch {
      /* cache hydrate lỗi — fallback về fetch bình thường */
    }
    if (veryFreshCacheHit) {
      // Không cần silent reload — live-version polling sẽ phát hiện thay đổi nếu có
      return undefined;
    }
    if (loadDebounceTimerRef.current) clearTimeout(loadDebounceTimerRef.current);
    loadDebounceTimerRef.current = setTimeout(() => {
      loadDebounceTimerRef.current = null;
      void load({ silent: true });
    }, 80);
    return () => {
      if (loadDebounceTimerRef.current) {
        clearTimeout(loadDebounceTimerRef.current);
        loadDebounceTimerRef.current = null;
      }
    };
  }, [
    crmDashboardDataReady,
    filterPhone,
    customDateFrom,
    customDateTo,
    kanbanLoadLimit,
    filterAssignee,
    filterCompany,
    filterLeadType,
    filterReferrer,
    filterCustomerCompany,
  ]);

  // Khi mở view "Bình luận": tải comments-index cho toàn bộ lead/deal đang hiển thị
  useEffect(() => {
    if (viewMode !== 'comments') return;
    const all = pipelineType === 'lead' ? (allLeads || []) : (allDeals || []);
    const ids = all.map(x => x.id).filter(Boolean);
    if (!ids.length) { setCommentsIndex({}); return; }
    let cancelled = false;
    const chunk = ids.slice(0, 2000);
    api.get(`/crm/lead-comments/index?lead_ids=${chunk.join(',')}`)
      .then(r => { if (!cancelled) setCommentsIndex(r.data || {}); })
      .catch(() => { if (!cancelled) setCommentsIndex({}); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, pipelineType, allLeads, allDeals]);

  /** Realtime badge bình luận trên Kanban / view Bình luận */
  useEffect(() => {
    const socket = getSocket() || connectSocket();
    if (!socket) return;
    const bump = (payload) => {
      const lid = payload?.lead_id;
      if (!lid) return;
      const action = payload?.action;
      if (action === 'deleted') {
        setCommentsIndex((prev) => {
          const cur = prev[String(lid)];
          if (!cur) return prev;
          return { ...prev, [String(lid)]: { ...cur, count: Math.max(0, (cur.count || 1) - 1) } };
        });
        return;
      }
      const c = payload.comment;
      if (!c) return;
      setCommentsIndex((prev) => ({
        ...prev,
        [String(lid)]: {
          count: action === 'created' ? ((prev[String(lid)]?.count || 0) + 1) : (prev[String(lid)]?.count || 1),
          last_at: c.created_at || new Date().toISOString(),
          last_user_id: c.user_id ?? null,
        },
      }));
    };
    socket.on('lead:comment', bump);
    return () => socket.off('lead:comment', bump);
  }, []);

  // Cấu hình deadline theo công ty (cho view "Deadline")
  useEffect(() => {
    const companyId = filterCompany || user?.company_id;
    if (!companyId) { setDeadlineConfig(null); return; }
    let cancelled = false;
    api.get(`/crm/settings/deadline-config?company_id=${companyId}`)
      .then(r => { if (!cancelled) setDeadlineConfig(r.data || null); })
      .catch(() => { if (!cancelled) setDeadlineConfig(null); });
    return () => { cancelled = true; };
  }, [filterCompany, user?.company_id]);

  // Admin: công ty đang lọc không còn trong danh sách (sau giới hạn khối theo module CRM) → bỏ lọc
  useEffect(() => {
    if (deferFilterPruneRef.current) return;
    if (!isAdmin || !filterCompany || !companies?.length) return;
    if (!companies.some((c) => String(c.id) === String(filterCompany))) {
      setFilterCompany('');
      setStoredCrmFilterCompanyId('');
    }
  }, [isAdmin, filterCompany, companies]);

  // Reset stage filter if it doesn't exist in current company pipeline stages
  useEffect(() => {
    if (deferFilterPruneRef.current) return;
    if (!filterStage) return;
    const list = pipelineType === 'lead' ? stagesLead : stagesDeal;
    if (!(list || []).length) return;
    const ok = list.some((s) => String(s.id) === String(filterStage));
    if (!ok) setFilterStage('');
  }, [filterStage, pipelineType, stagesLead, stagesDeal]);

  // Reset phân loại nếu không còn trong lead types (đúng công ty + lead/deal tab)
  useEffect(() => {
    if (deferFilterPruneRef.current) return;
    if (!filterLeadType || !leadTypes.length) return;
    const list = leadTypes.filter((t) => t.applies_to === 'both' || t.applies_to === pipelineType);
    const ok = list.some((t) => String(t.id) === String(filterLeadType));
    if (!ok) setFilterLeadType('');
  }, [filterLeadType, leadTypes, pipelineType]);

  const referrerFilterOptions = useMemo(() => {
    const names = new Set((crmReferrers || []).map((r) => r.name).filter(Boolean));
    for (const row of [...(allLeads || []), ...(allDeals || [])]) {
      const n = String(row?.referrer_name || '').trim();
      if (n) names.add(n);
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [crmReferrers, allLeads, allDeals]);

  useEffect(() => {
    if (deferFilterPruneRef.current) return;
    if (!filterReferrer || filterReferrer === '__none__') return;
    const ok = referrerFilterOptions.includes(filterReferrer);
    if (!ok) setFilterReferrer('');
  }, [filterReferrer, referrerFilterOptions]);

  const customerCompanyFilterOptions = useMemo(() => {
    const names = new Set();
    for (const row of [...(allLeads || []), ...(allDeals || [])]) {
      const n = String(row?.customer?.company || '').trim();
      if (n) names.add(n);
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [allLeads, allDeals]);

  useEffect(() => {
    if (deferFilterPruneRef.current) return;
    if (!filterCustomerCompany || filterCustomerCompany === '__none__') return;
    const ok = customerCompanyFilterOptions.includes(filterCustomerCompany);
    if (!ok) setFilterCustomerCompany('');
  }, [filterCustomerCompany, customerCompanyFilterOptions]);

  // ── Realtime: cập nhật badge SX/VC khi project thay đổi stage ──
  useEffect(() => {
    const socket = getSocket() || connectSocket();
    if (!socket) return;

    /**
     * Backend emit `crm:badge_updated` sau mỗi syncCrmLead*FromProject.
     * Payload: { lead_id, project_id, stage_id, sx_pipeline_stage, vc_pipeline_stage }
     */
    const badgeHandler = (payload) => {
      if (!payload?.lead_id) return;
      const lid = String(payload.lead_id);
      const patch = {};
      // Chấp nhận null để xoá rõ ràng; chỉ bỏ qua khi field không có trong payload.
      if (Object.prototype.hasOwnProperty.call(payload, 'sx_pipeline_stage')) {
        patch.sx_pipeline_stage = payload.sx_pipeline_stage || null;
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'vc_pipeline_stage')) {
        patch.vc_pipeline_stage = payload.vc_pipeline_stage || null;
      }
      if (payload.stage_id !== undefined) patch.stage_id = payload.stage_id;
      if (Object.keys(patch).length === 0) return;

      const matchId = (row) => String(row.id) === lid;
      console.log('[CRM] badge realtime update:', lid, '→', patch.vc_pipeline_stage?.name || patch.sx_pipeline_stage?.name);
      setAllDeals((prev) => dedupeCrmKanbanRows(prev.map((d) => (matchId(d) ? { ...d, ...patch } : d))));
      setAllLeads((prev) => dedupeCrmKanbanRows(prev.map((l) => (matchId(l) ? { ...l, ...patch } : l))));
    };

    socket.on('crm:badge_updated', badgeHandler);
    return () => socket.off('crm:badge_updated', badgeHandler);
  }, []);

  /**
   * Toggle ghim/tương tác per-user (optimistic update + rollback nếu API fail).
   * `item.type === 'deal'` → cập nhật setAllDeals; ngược lại setAllLeads.
   * Lưu ý: dùng cả 2 setter nếu chưa biết kiểu (an toàn — chỉ map id khớp).
   */
  const togglePinFlag = useCallback(async (item, next) => {
    if (!item?.id) return;
    const id = item.id;
    const patch = { is_pinned: !!next, pinned_at: next ? new Date().toISOString() : null };
    const updater = (arr) => arr.map((x) => (String(x.id) === String(id) ? { ...x, ...patch } : x));
    setAllLeads(updater);
    setAllDeals(updater);
    try {
      if (next) await api.post(`/crm/leads/${id}/pin`);
      else await api.delete(`/crm/leads/${id}/pin`);
    } catch (e) {
      const rollback = (arr) => arr.map((x) => (String(x.id) === String(id) ? { ...x, is_pinned: !next, pinned_at: next ? null : x.pinned_at } : x));
      setAllLeads(rollback);
      setAllDeals(rollback);
      console.error('togglePinFlag failed:', e?.message || e);
    }
  }, []);

  const toggleInteractedFlag = useCallback(async (item, next) => {
    if (!item?.id) return;
    const id = item.id;
    const patch = { is_interacted: !!next, interacted_at: next ? new Date().toISOString() : null };
    const updater = (arr) => arr.map((x) => (String(x.id) === String(id) ? { ...x, ...patch } : x));
    setAllLeads(updater);
    setAllDeals(updater);
    try {
      if (next) await api.post(`/crm/leads/${id}/interacted`);
      else await api.delete(`/crm/leads/${id}/interacted`);
    } catch (e) {
      const rollback = (arr) => arr.map((x) => (String(x.id) === String(id) ? { ...x, is_interacted: !next } : x));
      setAllLeads(rollback);
      setAllDeals(rollback);
      console.error('toggleInteractedFlag failed:', e?.message || e);
    }
  }, []);

  /**
   * Realtime: backend emit 'crm:dashboard_changed' khi lead/deal thay đổi
   * (create/update/stage/convert/bulk/merge/delete). Debounce 800ms để gom burst
   * (vd bulk-assign 50 lead) chỉ refetch 1 lần.
   */
  useEffect(() => {
    const socket = getSocket() || connectSocket();
    if (!socket) return;
    let timer = null;
    const onChanged = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        loadRef.current?.({ silent: true });
      }, 800);
    };
    socket.on('crm:dashboard_changed', onChanged);
    return () => {
      if (timer) clearTimeout(timer);
      socket.off('crm:dashboard_changed', onChanged);
    };
  }, []);

  /** Khi xưởng/VC đổi cột: refetch badge REST (dự phòng nếu socket chậm hoặc tab CRM mở trước khi sync xong) */
  useEffect(() => {
    const EVENT = 'crm-project-badges-refresh';
    const onRefresh = async (e) => {
      const projectId = e.detail?.projectId;
      if (!projectId) return;
      const targets = allDealsRef.current.filter(
        (d) => String(d.project_id || '') === String(projectId),
      );
      if (!targets.length) return;
      const patches = await Promise.all(
        targets.map(async (d) => {
          try {
            const { data } = await api.get(`/crm/leads/${d.id}/badge`);
            return { id: d.id, data };
          } catch {
            return null;
          }
        }),
      );
      setAllDeals((prev) => {
        const map = new Map((patches.filter(Boolean) || []).map((p) => [String(p.id), p.data]));
        if (map.size === 0) return prev;
        return dedupeCrmKanbanRows(
          prev.map((x) => {
            const badge = map.get(String(x.id));
            if (!badge) return x;
            return {
              ...x,
              sx_pipeline_stage: badge.sx_pipeline_stage ?? null,
              vc_pipeline_stage: badge.vc_pipeline_stage ?? null,
              stage_id: badge.stage_id != null ? badge.stage_id : x.stage_id,
            };
          }),
        );
      });
    };
    window.addEventListener(EVENT, onRefresh);
    return () => window.removeEventListener(EVENT, onRefresh);
  }, []);

  /** Tải thêm 1000 records tiếp theo (append, không reload lại) */
  const handleLoadMore = useCallback(async () => {
    if (loadMoreState.loading) return;
    const type = pipelineType;
    const offset = type === 'lead' ? loadMoreState.leadOffset : loadMoreState.dealOffset;
    const total = type === 'lead' ? loadMoreState.leadTotal : loadMoreState.dealTotal;
    if (total !== null && offset >= total) return; // hết rồi
    setLoadMoreState((s) => ({ ...s, loading: true }));
    try {
      const dateParams = {};
      if (customDateFrom) dateParams.date_from = customDateFrom;
      if (customDateTo) dateParams.date_to = customDateTo;
      const common = { type, phone_filter: filterPhone || undefined, ...dateParams, limit: 1000, offset };
      if (filterAssignee) common.assigned_to = filterAssignee;
      if (filterCompany) common.company_id = filterCompany;
      if (filterLeadType) common.lead_type_id = filterLeadType;
      if (filterReferrer && filterReferrer !== '__none__') common.referrer_name = filterReferrer;
      if (filterCustomerCompany) common.customer_company = filterCustomerCompany;
      const res = await api.get('/crm/leads', { params: common });
      const d = res.data;
      const rows = Array.isArray(d) ? d : (d?.data || []);
      const newTotal = typeof d?.total === 'number' ? d.total : total;
      const newNextOffset = typeof d?.nextOffset === 'number' ? d.nextOffset : offset + rows.length;
      const userKey = getCurrentUserKeyForLeadSeen(user);
      const viewedLocal = getLocallyViewedLeadIdSet(userKey);
      const merged = rows.map((l) =>
        viewedLocal.has(String(l.id)) ? { ...l, is_new_for_current_user: false } : l,
      );
      if (type === 'lead') {
        setAllLeads((prev) => dedupeCrmKanbanRows([...prev, ...merged]));
        setLoadMoreState((s) => ({ ...s, leadOffset: newNextOffset, leadTotal: newTotal, loading: false }));
      } else {
        setAllDeals((prev) => dedupeCrmKanbanRows([...prev, ...merged]));
        setLoadMoreState((s) => ({ ...s, dealOffset: newNextOffset, dealTotal: newTotal, loading: false }));
      }
    } catch (e) {
      console.error('[loadMore]', e);
      setLoadMoreState((s) => ({ ...s, loading: false }));
    }
  }, [
    loadMoreState,
    pipelineType,
    filterPhone,
    filterAssignee,
    filterCompany,
    filterLeadType,
    filterReferrer,
    filterCustomerCompany,
    customDateFrom,
    customDateTo,
    user,
  ]);

  useEffect(() => {
    if (!user?.company_id) return;
    const cid = String(user.company_id);
    setUserCompanyId(cid);
    if (!isAdmin || isCompanyScopedAdmin) {
      setFilterCompany(cid);
      try {
        setStoredCrmFilterCompanyId(cid);
      } catch {
        /* ignore */
      }
    }
  }, [user?.company_id, isAdmin, isCompanyScopedAdmin]);

  const resolvePipelineIdForCompany = useCallback((companyId) => {
    if (!companyId) return null;
    const list = pipelines || [];
    const byCompany = list.filter((p) => String(p.company_id || '') === String(companyId));
    const def = byCompany.find((p) => p.is_default);
    return (def || byCompany[0] || null)?.id || null;
  }, [pipelines]);

  /** Công ty đang áp dụng cho dashboard (admin: theo bộ lọc; user: theo company_id). */
  const dashboardScopeCompanyId = useMemo(() => {
    if (isCompanyScopedAdmin && user?.company_id) return String(user.company_id);
    if (!isAdmin && user?.company_id) return String(user.company_id);
    if (isAdmin && filterCompany) return String(filterCompany);
    return '';
  }, [isCompanyScopedAdmin, isAdmin, user?.company_id, filterCompany]);

  /** Log mỗi khi bộ lọc CRM thay đổi → AI Chat Bot dùng để học thói quen của user. */
  const lastLoggedFilterRef = useRef('');
  useEffect(() => {
    const snap = {
      pipelineType,
      companyId: dashboardScopeCompanyId || filterCompany || '',
      assigneeId: filterAssignee || '',
      assigneeName: filterAssigneeName || '',
      source: filterSource || '',
      stage: filterStage || '',
      region: filterRegion || '',
      leadType: filterLeadType || '',
      phone: filterPhone,
      search: searchText || '',
    };
    const hash = JSON.stringify(snap);
    if (hash === lastLoggedFilterRef.current) return;
    lastLoggedFilterRef.current = hash;
    const hasAny = snap.companyId || snap.assigneeId || snap.source || snap.stage
      || snap.region || snap.leadType || snap.search;
    if (!hasAny) return;
    const compName = companies?.find((c) => String(c.id) === String(snap.companyId))?.name;
    const userName = users?.find((u) => String(u.id) === String(snap.assigneeId))?.full_name;
    const parts = [];
    if (compName) parts.push(`Cty ${compName}`);
    if (userName) parts.push(`NV ${userName}`);
    if (snap.assigneeName) parts.push(`Tên "${snap.assigneeName}"`);
    if (snap.search) parts.push(`Tìm "${snap.search}"`);
    if (snap.stage) parts.push('có lọc stage');
    if (snap.region) parts.push('có lọc khu vực');
    logFilter({
      module: 'crm',
      feature: snap.pipelineType === 'deal' ? 'deal_pipeline' : 'lead_pipeline',
      query: snap,
      label: `Lọc ${snap.pipelineType === 'deal' ? 'Deal' : 'Lead'}${parts.length ? ' · ' + parts.join(' · ') : ''}`,
      importance: 1,
    });
  }, [
    pipelineType,
    dashboardScopeCompanyId,
    filterCompany,
    filterAssignee,
    filterAssigneeName,
    filterSource,
    filterStage,
    filterRegion,
    filterLeadType,
    filterPhone,
    searchText,
    companies,
    users,
  ]);

  /** NV trong bộ lọc CRM: theo công ty đang xem + API trả crm_region_ids (user_company_regions). */
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const params = { for_module: 'crm' };
        if (dashboardScopeCompanyId) params.company_id = dashboardScopeCompanyId;
        const { data } = await api.get('/crm/employees-by-company', { params });
        if (cancel) return;
        setCompanyEmployees(data.users || []);
        setCompanyDepts(data.departments || []);
        setUserCompanyId(data.company_id || '');
      } catch (e) {
        console.warn('Load company employees failed:', e.message);
        if (!cancel) {
          setCompanyEmployees([]);
          setCompanyDepts([]);
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [dashboardScopeCompanyId]);

  useEffect(() => {
    const cid = dashboardScopeCompanyId;
    if (!cid) {
      setCrmReferrers([]);
      return undefined;
    }
    let cancelled = false;
    api.get('/crm/referrers', { params: { company_id: cid } })
      .then((r) => {
        if (cancelled) return;
        setCrmReferrers(Array.isArray(r.data?.items) ? r.data.items : []);
      })
      .catch(() => { if (!cancelled) setCrmReferrers([]); });
    return () => { cancelled = true; };
  }, [dashboardScopeCompanyId]);

  useEffect(() => {
    crmLiveVersionRef.current = null;
  }, [dashboardScopeCompanyId, customDateFrom, customDateTo]);

  /** Sau khi tạo Lead/Deal: cập nhật Kanban + KPI header + số SĐT — không gọi load() full trang. */
  const refreshKanbanListAfterCreate = useCallback(
    async (type) => {
      const dateParams = {};
      if (customDateFrom) dateParams.date_from = customDateFrom;
      if (customDateTo) dateParams.date_to = customDateTo;
      const common = { type, phone_filter: filterPhone || undefined, ...dateParams };
      if (filterAssignee) common.assigned_to = filterAssignee;
      if (filterCompany) common.company_id = filterCompany;
      if (filterLeadType) common.lead_type_id = filterLeadType;
      if (filterReferrer && filterReferrer !== '__none__') common.referrer_name = filterReferrer;
      if (filterCustomerCompany) common.customer_company = filterCustomerCompany;

      const loadAll = String(kanbanLoadLimit ?? '').trim().toLowerCase() === 'all';
      let rows = [];
      let nextOffset = 0;
      let total = null;

      try {
        if (loadAll) {
          const chunk = 1000;
          let offset = 0;
          let guard = 0;
          while (guard < 500) {
            guard += 1;
            const res = await api.get('/crm/leads', { params: { ...common, limit: chunk, offset } }).catch(() => ({ data: {} }));
            const payload = res.data || {};
            const page = Array.isArray(payload) ? payload : (payload.data || []);
            rows.push(...page);
            if (page.length === 0) break;
            const totalKnown = typeof payload.total === 'number' ? payload.total : null;
            const nextOff = typeof payload.nextOffset === 'number' ? payload.nextOffset : offset + page.length;
            const hasMore =
              typeof payload.hasMore === 'boolean'
                ? payload.hasMore
                : totalKnown != null
                  ? nextOff < totalKnown
                  : page.length >= chunk;
            if (!hasMore) break;
            offset = nextOff;
          }
          nextOffset = null;
          total = rows.length;
        } else {
          const limit = parseInt(kanbanLoadLimit, 10) || 1000;
          const res = await api.get('/crm/leads', { params: { ...common, limit, offset: 0 } }).catch(() => ({ data: {} }));
          const d = res.data;
          rows = Array.isArray(d) ? d : (d?.data || []);
          total = typeof d?.total === 'number' ? d.total : null;
          nextOffset = typeof d?.nextOffset === 'number' ? d.nextOffset : rows.length;
        }

        const userKey = getCurrentUserKeyForLeadSeen(user);
        const viewedLocal = getLocallyViewedLeadIdSet(userKey);
        const merged = dedupeCrmKanbanRows(
          rows.map((l) => (viewedLocal.has(String(l.id)) ? { ...l, is_new_for_current_user: false } : l)),
        );

        if (type === 'lead') {
          setAllLeads(merged);
          setLoadMoreState((s) => ({
            ...s,
            leadOffset: nextOffset ?? merged.length,
            leadTotal: total,
            loading: false,
          }));
        } else {
          setAllDeals(merged);
          setLoadMoreState((s) => ({
            ...s,
            dealOffset: nextOffset ?? merged.length,
            dealTotal: total,
            loading: false,
          }));
        }
      } catch (e) {
        console.error('[refreshKanbanListAfterCreate]', e);
      }
    },
    [
      customDateFrom,
      customDateTo,
      filterPhone,
      filterAssignee,
      filterCompany,
      filterLeadType,
      filterReferrer,
      filterCustomerCompany,
      kanbanLoadLimit,
      user,
    ],
  );

  const refreshCrmDashboardSlice = useCallback(
    async (type) => {
      const dateParams = {};
      if (customDateFrom) dateParams.date_from = customDateFrom;
      if (customDateTo) dateParams.date_to = customDateTo;
      try {
        const { data } = await api.get('/crm/dashboard', {
          params: {
            type,
            ...dateParams,
            ...(dashboardScopeCompanyId ? { company_id: dashboardScopeCompanyId } : {}),
            ...(filterAssignee ? { assigned_to: filterAssignee } : {}),
          },
        });
        if (type === 'lead') setDataLead(data);
        else setDataDeal(data);
      } catch (e) {
        console.error('[refreshCrmDashboardSlice]', e);
      }
    },
    [customDateFrom, customDateTo, dashboardScopeCompanyId, filterAssignee],
  );

  const refreshPipelinePhoneTotalsForType = useCallback(
    async (type) => {
      const dateParams = {};
      if (customDateFrom) dateParams.date_from = customDateFrom;
      if (customDateTo) dateParams.date_to = customDateTo;
      const co = dashboardScopeCompanyId || filterCompany;
      const buildCountParams = (phone_filter) => {
        const p = { type, ...dateParams, limit: 1, offset: 0 };
        if (filterAssignee) p.assigned_to = filterAssignee;
        if (co) p.company_id = co;
        if (filterLeadType) p.lead_type_id = filterLeadType;
        if (filterReferrer && filterReferrer !== '__none__') p.referrer_name = filterReferrer;
        if (filterCustomerCompany) p.customer_company = filterCustomerCompany;
        if (phone_filter) p.phone_filter = phone_filter;
        return p;
      };
      const countListTotal = (payload) => {
        const t = payload?.total;
        return typeof t === 'number' ? t : null;
      };
      try {
        const [hasRes, noRes, allRes] = await Promise.all([
          api.get('/crm/leads', { params: buildCountParams('has_phone') }).catch(() => ({ data: {} })),
          api.get('/crm/leads', { params: buildCountParams('no_phone') }).catch(() => ({ data: {} })),
          api.get('/crm/leads', { params: buildCountParams() }).catch(() => ({ data: {} })),
        ]);
        setPipelinePhoneTotals((prev) => ({
          ...prev,
          [type]: {
            hasPhone: countListTotal(hasRes.data),
            noPhone: countListTotal(noRes.data),
            all: countListTotal(allRes.data),
          },
        }));
      } catch (e) {
        console.error('[refreshPipelinePhoneTotalsForType]', e);
      }
    },
    [
      customDateFrom,
      customDateTo,
      filterAssignee,
      filterCompany,
      filterLeadType,
      filterReferrer,
      filterCustomerCompany,
      dashboardScopeCompanyId,
    ],
  );

  const refreshAfterNewLeadOrDeal = useCallback(
    (type) => {
      void Promise.all([
        refreshKanbanListAfterCreate(type),
        refreshCrmDashboardSlice(type),
        refreshPipelinePhoneTotalsForType(type),
      ]);
    },
    [refreshKanbanListAfterCreate, refreshCrmDashboardSlice, refreshPipelinePhoneTotalsForType],
  );

  const scopedCompanyName = useMemo(() => {
    if (!dashboardScopeCompanyId || !companies?.length) return '';
    const c = companies.find((x) => String(x.id) === String(dashboardScopeCompanyId));
    return c?.name || '';
  }, [dashboardScopeCompanyId, companies]);

  /**
   * Tải danh sách khu vực:
   *  - Đã chọn công ty cụ thể → khu vực của công ty đó.
   *  - Chưa chọn công ty → khu vực của TẤT CẢ công ty thuộc khối CRM (lấy theo `companies` đã được /companies?for_module=crm giới hạn).
   */
  const crmCompanyIdsCsv = useMemo(
    () => (companies || []).map((c) => String(c.id)).filter(Boolean).join(','),
    [companies],
  );
  useEffect(() => {
    if (!dashboardScopeCompanyId && !crmCompanyIdsCsv) {
      setCompanyRegions([]);
      return;
    }
    let cancel = false;
    const params = dashboardScopeCompanyId
      ? { company_id: dashboardScopeCompanyId, for_module: 'crm' }
      : { company_ids: crmCompanyIdsCsv, for_module: 'crm' };
    api
      .get('/crm/company-regions', { params })
      .then((r) => {
        if (cancel) return;
        const list = Array.isArray(r.data) ? r.data : [];
        setCompanyRegions(list);
      })
      .catch(() => {
        if (!cancel) setCompanyRegions([]);
      });
    return () => {
      cancel = true;
    };
  }, [dashboardScopeCompanyId, crmCompanyIdsCsv]);

  /** Đổi công ty / danh sách khu vực → bỏ chọn uuid không còn trong danh mục (chỉ khi đã có danh mục tải về) */
  useEffect(() => {
    if (deferFilterPruneRef.current) return;
    if (!filterRegion || filterRegion === '__none__') return;
    if (companyRegions.length === 0) return;
    const ok = companyRegions.some((reg) => String(reg.id) === String(filterRegion));
    if (!ok) {
      setFilterRegion('');
    }
  }, [companyRegions, filterRegion]);

  /** Tải danh sách khu vực CRM cho modal "Chuyển sang Deal" theo công ty của lead. */
  useEffect(() => {
    if (!wonAssignModal || !wonAssignLeadId) return undefined;
    const lead = allLeads.find((l) => l.id === wonAssignLeadId);
    const cid = lead?.company_id ? String(lead.company_id) : '';
    if (!cid) {
      setWonAssignRegions([]);
      return undefined;
    }
    let cancel = false;
    setWonAssignRegionsLoading(true);
    api
      .get('/crm/company-regions', { params: { company_id: cid, for_module: 'crm' } })
      .then((r) => {
        if (cancel) return;
        const list = Array.isArray(r.data) ? r.data : [];
        setWonAssignRegions(list.filter((x) => x.is_active !== false));
      })
      .catch(() => {
        if (!cancel) setWonAssignRegions([]);
      })
      .finally(() => {
        if (!cancel) setWonAssignRegionsLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [wonAssignModal, wonAssignLeadId, allLeads]);

  const companyHasNoPipeline = useMemo(() => {
    if (!dashboardScopeCompanyId) return false;
    const list = pipelines || [];
    return !list.some((p) => String(p.company_id || '') === String(dashboardScopeCompanyId));
  }, [dashboardScopeCompanyId, pipelines]);

  const showNoPipelineMainViews = useMemo(
    () =>
      companyHasNoPipeline &&
      (viewMode === 'kanban' || viewMode === 'list' || viewMode === 'planner' || viewMode === 'deadline' || viewMode === 'comments'),
    [companyHasNoPipeline, viewMode],
  );

  const buildStagesParams = useCallback((type) => {
    // Admin: khi đã chọn company filter → nạp stages đúng pipeline của công ty đó
    if (isAdmin && filterCompany) {
      const pid = resolvePipelineIdForCompany(filterCompany);
      if (pid) return { type, pipeline_id: pid };
      return { type };
    }
    // Non-admin: backend đã tự scope theo company user (fallback default pipeline)
    return { type };
  }, [isAdmin, filterCompany, resolvePipelineIdForCompany]);

  useEffect(() => {
    const onSeen = (e) => {
      const seenId = e.detail?.id;
      if (!seenId) return;
      setAllLeads((prev) => prev.map((l) => (String(l.id) === String(seenId) ? { ...l, is_new_for_current_user: false } : l)));
      setAllDeals((prev) => prev.map((l) => (String(l.id) === String(seenId) ? { ...l, is_new_for_current_user: false } : l)));
    };
    window.addEventListener('crm-lead-seen', onSeen);
    return () => window.removeEventListener('crm-lead-seen', onSeen);
  }, []);

  const load = async (opts) => {
    const silent = !!(opts && opts.silent);
    const seq = ++loadSeqRef.current;
    const isStale = () => seq !== loadSeqRef.current;
    if (silent) setSyncing(true);
    try {
      let resolvedCompanyId = filterCompany;
      if (isCompanyScopedAdmin && user?.company_id) {
        resolvedCompanyId = String(user.company_id);
      } else if (!isAdmin && user?.company_id) {
        resolvedCompanyId = resolvedCompanyId || String(user.company_id);
      } else if (
        isAdmin
        && !isCompanyScopedAdmin
        && !resolvedCompanyId
        && !(hadSessionSnapshotRef.current && snapshotHasProperty(P, 'filterCompany'))
      ) {
        let fromLs = '';
        try {
          fromLs = getStoredCrmFilterCompanyId();
        } catch {
          /* ignore */
        }
        resolvedCompanyId = fromLs || resolveDefaultCrmAdminCompanyId(companies) || '';
        if (resolvedCompanyId && String(resolvedCompanyId) !== String(filterCompany)) {
          suppressFilterCompanyLoadRef.current = true;
          setFilterCompany(resolvedCompanyId);
          try {
            setStoredCrmFilterCompanyId(resolvedCompanyId);
          } catch {
            /* ignore */
          }
        }
        adminCompanyDefaultResolvedRef.current = true;
      } else if (isAdmin && !isCompanyScopedAdmin && resolvedCompanyId) {
        adminCompanyDefaultResolvedRef.current = true;
      }

      let stagesLeadParams = buildStagesParams('lead');
      let stagesDealParams = buildStagesParams('deal');
      if (isAdmin && resolvedCompanyId) {
        const { data: plsPre } = await api.get('/crm/pipelines').catch(() => ({ data: [] }));
        const plist = Array.isArray(plsPre) ? plsPre : [];
        const byCo = plist.filter((p) => String(p.company_id || '') === String(resolvedCompanyId));
        const def = byCo.find((p) => p.is_default) || byCo[0];
        const pid = def?.id;
        if (pid) {
          stagesLeadParams = { type: 'lead', pipeline_id: pid };
          stagesDealParams = { type: 'deal', pipeline_id: pid };
        }
      }

      // Build date params for API
      const dateParams = {};
      if (customDateFrom) dateParams.date_from = customDateFrom;
      if (customDateTo) dateParams.date_to = customDateTo;

      const fetchKanbanRows = async (type) => {
        const common = { type, phone_filter: filterPhone || undefined, ...dateParams };
        if (filterAssignee) common.assigned_to = filterAssignee;
        if (resolvedCompanyId) common.company_id = resolvedCompanyId;
        if (filterLeadType) common.lead_type_id = filterLeadType;
        if (filterReferrer && filterReferrer !== '__none__') common.referrer_name = filterReferrer;
        if (filterCustomerCompany) common.customer_company = filterCustomerCompany;
        const loadAll =
          String(kanbanLoadLimit ?? '')
            .trim()
            .toLowerCase() === 'all';
        if (loadAll) {
          const chunk = 1000;
          let offset = 0;
          const out = [];
          let guard = 0;
          while (guard < 500) {
            guard += 1;
            const res = await api.get('/crm/leads', { params: { ...common, limit: chunk, offset } }).catch(() => ({ data: {} }));
            const payload = res.data || {};
            const page = Array.isArray(payload) ? payload : (payload.data || []);
            out.push(...page);
            if (page.length === 0) break;
            const totalKnown = typeof payload.total === 'number' ? payload.total : null;
            const nextOffset =
              typeof payload.nextOffset === 'number' ? payload.nextOffset : offset + page.length;
            const hasMore =
              typeof payload.hasMore === 'boolean'
                ? payload.hasMore
                : totalKnown != null
                  ? nextOffset < totalKnown
                  : page.length >= chunk;
            if (!hasMore) break;
            offset = nextOffset;
          }
          return { rows: out, nextOffset: null, total: out.length };
        }
        const limit = parseInt(kanbanLoadLimit, 10) || 1000;
        const res = await api.get('/crm/leads', { params: { ...common, limit, offset: 0 } }).catch(() => ({ data: {} }));
        const d = res.data;
        const rows = Array.isArray(d) ? d : (d?.data || []);
        const total = typeof d?.total === 'number' ? d.total : null;
        const nextOffset = typeof d?.nextOffset === 'number' ? d.nextOffset : rows.length;
        return { rows, nextOffset, total };
      };

      const dashListParams = {
        ...dateParams,
        ...(resolvedCompanyId ? { company_id: resolvedCompanyId } : {}),
        ...(filterAssignee ? { assigned_to: filterAssignee } : {}),
      };

      const [dashLeadRes, dashDealRes, leadsRows, dealsRows, pipelinesRes, stagesLeadRes, stagesDealRes, sourcesRes, leadTypesRes, companiesRes, usersRes] = await Promise.all([
        api.get('/crm/dashboard', { params: { type: 'lead', ...dashListParams } }).catch(() => ({ data: { pipeline: [], kpis: {}, ledger_net_by_lead: {}, recent_quotations: [], recent_orders: [] } })),
        api.get('/crm/dashboard', { params: { type: 'deal', ...dashListParams } }).catch(() => ({ data: { pipeline: [], kpis: {}, ledger_net_by_lead: {}, recent_quotations: [], recent_orders: [] } })),
        fetchKanbanRows('lead'),
        fetchKanbanRows('deal'),
        api.get('/crm/pipelines').catch(() => ({ data: [] })),
        api.get('/crm/pipeline-stages', { params: stagesLeadParams }).catch(() => ({ data: [] })),
        api.get('/crm/pipeline-stages', { params: stagesDealParams }).catch(() => ({ data: [] })),
        api.get('/crm/sources', { params: { ...(resolvedCompanyId ? { company_id: resolvedCompanyId } : {}) } }).catch(() => ({ data: [] })),
        api.get('/crm/lead-types', { params: { ...(resolvedCompanyId ? { company_id: resolvedCompanyId } : {}) } }).catch(() => ({ data: [] })),
        companies.length
          ? Promise.resolve({ data: { companies } })
          : api.get('/companies', { params: { for_module: 'crm' } }).catch(() => ({ data: { companies: [] } })),
        api.get('/users').catch(() => ({ data: [] })),
      ]);
      if (isStale()) {
        if (silent) setSyncing(false);
        return;
      }
      setDataLead(dashLeadRes.data);
      setDataDeal(dashDealRes.data);
      const pipelinesValue = narrowPipelinesToDefaultForCompany(
        Array.isArray(pipelinesRes.data) ? pipelinesRes.data : [],
        resolvedCompanyId || null,
      );
      setPipelines(pipelinesValue);
      const userKey = getCurrentUserKeyForLeadSeen(user);
      const viewedLocal = getLocallyViewedLeadIdSet(userKey);
      const mergeLeadSeenLocal = (rows) =>
        (rows || []).map((l) =>
          viewedLocal.has(String(l.id)) ? { ...l, is_new_for_current_user: false } : l,
        );
      const leadsResult = leadsRows || { rows: [], nextOffset: 0, total: null };
      const dealsResult = dealsRows || { rows: [], nextOffset: 0, total: null };
      const leadsData = Array.isArray(leadsResult) ? leadsResult : leadsResult.rows;
      const dealsData = Array.isArray(dealsResult) ? dealsResult : dealsResult.rows;
      const allLeadsValue = dedupeCrmKanbanRows(mergeLeadSeenLocal(leadsData));
      setAllLeads(allLeadsValue);
      let allDealsValue = dedupeCrmKanbanRows(mergeLeadSeenLocal(dealsData));
      setAllDeals((prev) => {
        allDealsValue = preserveCrmKanbanPipelineBadges(prev, allDealsValue);
        return allDealsValue;
      });
      const loadMoreStateValue = {
        leadOffset: Array.isArray(leadsResult) ? leadsData.length : (leadsResult.nextOffset ?? leadsData.length),
        dealOffset: Array.isArray(dealsResult) ? dealsData.length : (dealsResult.nextOffset ?? dealsData.length),
        leadTotal: Array.isArray(leadsResult) ? null : leadsResult.total,
        dealTotal: Array.isArray(dealsResult) ? null : dealsResult.total,
        loading: false,
      };
      setLoadMoreState(loadMoreStateValue);
      const stagesLeadValue = sortAndDedupePipelineStages(stagesLeadRes.data || []);
      const stagesDealValue = sortAndDedupePipelineStages(stagesDealRes.data || []);
      setStagesLead(stagesLeadValue);
      setStagesDeal(stagesDealValue);
      const sourcesValue = sourcesRes.data?.sources || (Array.isArray(sourcesRes.data) ? sourcesRes.data : []);
      const leadTypesValue = Array.isArray(leadTypesRes.data) ? leadTypesRes.data : [];
      setSources(sourcesValue);
      setLeadTypes(leadTypesValue);
      let fbPagesValue = null;
      if (sourcesRes.data?.fb_pages) {
        fbPagesValue = sourcesRes.data.fb_pages;
        setFbPages(fbPagesValue);
      }
      const companiesValue = companiesRes.data?.companies || companiesRes.data || [];
      const usersValue = Array.isArray(usersRes.data) ? usersRes.data : usersRes.data?.users || [];
      setCompanies(companiesValue);
      setUsers(usersValue);
      // ─── Lưu cache để lần sau mở/đổi filter render tức thì ───
      try {
        const cacheKey = buildCrmDashboardCacheKey({
          userId: user?.id,
          filterCompany: resolvedCompanyId || filterCompany,
          filterAssignee,
          filterPhone,
          filterLeadType,
          filterReferrer,
          filterCustomerCompany,
          customDateFrom,
          customDateTo,
          kanbanLoadLimit,
        });
        saveCrmDashboardCache(cacheKey, {
          dataLead: dashLeadRes.data,
          dataDeal: dashDealRes.data,
          pipelines: pipelinesValue,
          allLeads: allLeadsValue,
          allDeals: allDealsValue,
          loadMoreState: loadMoreStateValue,
          stagesLead: stagesLeadValue,
          stagesDeal: stagesDealValue,
          sources: sourcesValue,
          leadTypes: leadTypesValue,
          fbPages: fbPagesValue,
          companies: companiesValue,
          users: usersValue,
        });
      } catch {
        /* cache lỗi không ảnh hưởng dashboard */
      }
      // ─── Lưu metadata cache (localStorage) — sống qua đóng tab ───
      try {
        if (user?.id) {
          saveCrmDashboardMetaCache(user.id, {
            companies: companiesValue,
            users: usersValue,
            pipelines: pipelinesValue,
            stagesLead: stagesLeadValue,
            stagesDeal: stagesDealValue,
            sources: sourcesValue,
            leadTypes: leadTypesValue,
            fbPages: fbPagesValue,
          });
        }
      } catch {
        /* meta cache lỗi không ảnh hưởng dashboard */
      }
      void refreshPipelinePhoneTotalsForType(pipelineType);
      if (!isStale()) {
        const otherType = pipelineType === 'lead' ? 'deal' : 'lead';
        void refreshPipelinePhoneTotalsForType(otherType);
      }
    } catch (e) {
      console.error(e);
      if (silent && !isStale()) setSyncing(false);
      if (!isStale()) setFirstLoading(false);
    }
    if (isStale()) {
      if (silent) setSyncing(false);
      return;
    }
    try {
      const dateParamsLv = {};
      if (customDateFrom) dateParamsLv.date_from = customDateFrom;
      if (customDateTo) dateParamsLv.date_to = customDateTo;
      const paramsLv = { ...dateParamsLv };
      if (dashboardScopeCompanyId) paramsLv.company_id = dashboardScopeCompanyId;
      const { data: lv } = await api.get('/crm/live-version', { params: paramsLv });
      if (!isStale() && lv && lv.v != null) crmLiveVersionRef.current = lv.v;
    } catch {
      /* ignore */
    }
    if (!isStale()) {
      if (silent) setSyncing(false);
      setLastSyncAt(new Date());
      setFirstLoading(false);
    }
  };

  // ── Reload when time filter changes (debounced) ──
  const timeFilterRef = useRef(null);
  useEffect(() => {
    // Skip initial mount (load() already called above)
    if (timeFilterRef.current === null) {
      timeFilterRef.current = true;
      return;
    }
    // Only reload when we have valid dates or clearing filter
    if (timePreset === 'custom' && (!customDateFrom || !customDateTo)) return;
    void load({ silent: true });
  }, [customDateFrom, customDateTo]);

  // ── Computed: label hiển thị cho time filter ──
  const timeFilterLabel = useMemo(() => {
    if (!timePreset) return '';
    if (timePreset === 'custom') {
      if (customDateFrom && customDateTo) {
        return `${customDateFrom} → ${customDateTo}`;
      }
      return 'Tùy chỉnh';
    }
    return TIME_PRESETS.find(p => p.key === timePreset)?.label || '';
  }, [timePreset, customDateFrom, customDateTo]);

  // ── Computed: danh sách nhân viên hiển thị trong filter ──
  // Ưu tiên companyEmployees (phòng kinh doanh), fallback users (tất cả)
  const employeeFilterList = useMemo(() => {
    if (companyEmployees.length > 0) return companyEmployees;
    return users;
  }, [companyEmployees, users]);

  /** Danh sách NV trong dropdown: sau khi chọn khu vực (cùng biến filterRegion với Kanban). */
  const employeeFilterListByRegion = useMemo(() => {
    const list = employeeFilterList;
    if (!filterRegion) return list;
    const fromCompanyApi = companyEmployees.length > 0;
    if (!fromCompanyApi && filterRegion && filterRegion !== '__none__') {
      return list;
    }
    if (filterRegion === '__none__') {
      return list.filter((u) => !(u.crm_region_ids && u.crm_region_ids.length));
    }
    const fr = String(filterRegion);
    return list.filter((u) => {
      const ids = (u.crm_region_ids || []).map(String);
      return ids.includes(fr);
    });
  }, [employeeFilterList, filterRegion, companyEmployees.length]);

  const employeeOptionsFiltered = useMemo(() => {
    const q = assigneeListSearch.trim().toLowerCase();
    if (!q) return employeeFilterListByRegion;
    return employeeFilterListByRegion.filter((u) => {
      const name = (u.full_name || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      const pos = (u.position || '').toLowerCase();
      return name.includes(q) || email.includes(q) || pos.includes(q);
    });
  }, [employeeFilterListByRegion, assigneeListSearch]);

  /** Giữ option đang chọn trong select dù đã lọc tên (tránh select trống) */
  const employeeOptionsForSelect = useMemo(() => {
    let list = employeeOptionsFiltered;
    if (filterAssignee) {
      const fid = String(filterAssignee);
      const has = list.some((u) => String(u.id) === fid);
      if (!has) {
        const found =
          employeeFilterListByRegion.find((u) => String(u.id) === fid) ||
          employeeFilterList.find((u) => String(u.id) === fid) ||
          users.find((u) => String(u.id) === fid);
        if (found) list = [found, ...list];
      }
    }
    return list;
  }, [employeeOptionsFiltered, filterAssignee, employeeFilterListByRegion, employeeFilterList, users]);

  useEffect(() => {
    if (deferFilterPruneRef.current) return;
    if (!filterAssignee) return;
    if (!employeeFilterListByRegion.length) return;
    const fid = String(filterAssignee);
    const ok = employeeFilterListByRegion.some((u) => String(u.id) === fid);
    if (!ok) {
      setFilterAssignee('');
      setFilterAssigneeName('');
    }
  }, [filterRegion, dashboardScopeCompanyId, employeeFilterListByRegion, filterAssignee]);

  /** Khôi phục đầy đủ snapshot sau khi stages / NV / khu vực đã tải (tránh prune/lưu rỗng). */
  useEffect(() => {
    if (!suppressSnapshotOverwriteRef.current) return;
    if (!crmDashboardDataReady) return;

    const snap = frozenUiSnapshotRef.current;
    if (!snap) {
      suppressSnapshotOverwriteRef.current = false;
      deferFilterPruneRef.current = false;
      return;
    }

    const stagesList = pipelineType === 'lead' ? stagesLead : stagesDeal;
    if (snap.filterStage && !(stagesList || []).length) return;
    if (snap.filterAssignee && !employeeFilterListByRegion.length && !users.length) return;
    if (snap.filterRegion && snap.filterRegion !== '__none__' && !companyRegions.length) return;

    if (snapshotHasProperty(snap, 'searchText')) setSearchText(snap.searchText ?? '');
    if (snapshotHasProperty(snap, 'filterAssignee')) setFilterAssignee(snap.filterAssignee ?? '');
    if (snapshotHasProperty(snap, 'assigneeListSearch')) setAssigneeListSearch(snap.assigneeListSearch ?? '');
    if (snapshotHasProperty(snap, 'filterAssigneeName')) setFilterAssigneeName(snap.filterAssigneeName ?? '');
    if (snapshotHasProperty(snap, 'filterCompany')) setFilterCompany(snap.filterCompany ?? '');
    if (snapshotHasProperty(snap, 'filterSource')) setFilterSource(snap.filterSource ?? '');
    if (snapshotHasProperty(snap, 'filterStage')) setFilterStage(snap.filterStage ?? '');
    if (snapshotHasProperty(snap, 'filterRegion')) setFilterRegion(snap.filterRegion ?? '');
    if (snapshotHasProperty(snap, 'filterLeadType')) setFilterLeadType(snap.filterLeadType ?? '');
    if (snapshotHasProperty(snap, 'filterReferrer')) setFilterReferrer(snap.filterReferrer ?? '');
    if (snapshotHasProperty(snap, 'filterCustomerCompany')) setFilterCustomerCompany(snap.filterCustomerCompany ?? '');
    if (snapshotHasProperty(snap, 'filterPhone')) {
      const v = snap.filterPhone;
      if (v === 'no_phone' || v === 'has_phone') setFilterPhone(v);
    }
    if (snapshotHasProperty(snap, 'showOrphanDealColumn')) setShowOrphanDealColumn(!!snap.showOrphanDealColumn);
    if (snapshotHasProperty(snap, 'timePreset')) setTimePreset(typeof snap.timePreset === 'string' ? snap.timePreset : '');
    if (snapshotHasProperty(snap, 'customDateFrom')) setCustomDateFrom(snap.customDateFrom ?? '');
    if (snapshotHasProperty(snap, 'customDateTo')) setCustomDateTo(snap.customDateTo ?? '');
    if (snapshotHasProperty(snap, 'showCustomDate')) setShowCustomDate(!!snap.showCustomDate);
    if (snap.showAdvSearch || snapshotHasActiveFilters(snap)) setShowAdvSearch(true);

    suppressSnapshotOverwriteRef.current = false;
    deferFilterPruneRef.current = false;
  }, [
    crmDashboardDataReady,
    stagesLead,
    stagesDeal,
    pipelineType,
    users.length,
    employeeFilterListByRegion.length,
    companyRegions.length,
  ]);

  // ── Computed: nguồn thông minh - non-FB giữ nguyên, FB → [FB] Tên Page ──
  const smartSources = useMemo(() => {
    // Non-FB sources (chỉ đang dùng)
    const allItems = [...allLeads, ...allDeals];
    const usedIds = new Set(allItems.map(l => l.source_id).filter(Boolean));
    const nonFb = sources
      .filter(s => usedIds.has(s.id) && !(s.name || '').toLowerCase().includes('facebook'))
      .map(s => ({ id: s.id, type: 'source', label: `${s.icon || ''} ${s.name}`.trim() }));
    const seenFb = new Set();
    const fb = fbPages
      .filter(p => {
        if (!p.is_active || seenFb.has(p.page_id)) return false;
        seenFb.add(p.page_id);
        return true;
      })
      .map(p => ({ id: `fbp:${p.page_id}`, type: 'fb_page', page_id: p.page_id, label: `[FB] ${p.page_name}` }));
    return [...fb, ...nonFb];
  }, [sources, allLeads, allDeals, fbPages]);

  // ── Map grouped FB source → lead_ids ──
  const [fbPageLeadIds, setFbPageLeadIds] = useState(new Set());
  const lastFbFilter = useRef('');
  useEffect(() => {
    if (!filterSource.startsWith('fbp:')) {
      setFbPageLeadIds(new Set());
      lastFbFilter.current = '';
      return;
    }
    const pageId = filterSource.replace('fbp:', '');
    const co = filterCompany || (user?.company_id ? String(user.company_id) : '');
    const key = `${pageId}|${co}`;
    if (lastFbFilter.current === key) return;
    lastFbFilter.current = key;
    (async () => {
      try {
        const { data } = await api.get('/crm/leads-by-fb-page', {
          params: { page_id: pageId, type: pipelineType, ...(co ? { company_id: co } : {}) },
        });
        setFbPageLeadIds(new Set((data || []).map(l => l.id)));
      } catch { setFbPageLeadIds(new Set()); }
    })();
  }, [filterSource, pipelineType, filterCompany, user?.company_id]);

  // ── Client-side search + filter (instant, no API) ──
  const hasPhoneNumber = useCallback((item) => {
    return !!((item.customer?.phone && item.customer.phone.trim()) || (item.phone && item.phone.trim()));
  }, []);

  /**
   * Hoãn các ô gõ tự do (search, tên NV) bằng `useDeferredValue` để input
   * không bị giật khi danh sách 1000+ bản ghi được lọc lại trên mỗi ký tự.
   * React sẽ giữ giá trị input mượt và lọc lại ở priority thấp.
   */
  const deferredSearchText = useDeferredValue(searchText);
  const deferredAssigneeName = useDeferredValue(filterAssigneeName);

  /** pipelineKind: 'lead' | 'deal' — một người phụ trách (assigned_to đồng bộ lead_owner) */
  const filterItemsForPipeline = useCallback((items, _pipelineKind) => {
    let result = items;

    // Company filter
    if (filterCompany) {
      const cid = String(filterCompany);
      result = result.filter((l) => String(l.company_id || '') === cid);
    }

    // Assignee filter (UUID — so khớp cả chuỗi normalize + embed id)
    if (filterAssignee) {
      const fid = String(filterAssignee).trim().toLowerCase();
      result = result.filter((l) => {
        const a = l.assigned_to ? String(l.assigned_to).trim().toLowerCase() : '';
        if (a && a === fid) return true;
        const b = l.lead_owner_id ? String(l.lead_owner_id).trim().toLowerCase() : '';
        if (b && b === fid) return true;
        const c = l.assignee?.id ? String(l.assignee.id).trim().toLowerCase() : '';
        if (c && c === fid) return true;
        const d = l.lead_owner?.id ? String(l.lead_owner.id).trim().toLowerCase() : '';
        return d && d === fid;
      });
    }

    // Lọc theo tên NV (chỉ assignee / lead_owner, tránh trùng với tên KH ở ô tìm nhanh)
    const qAssigneeName = deferredAssigneeName.trim().toLowerCase();
    if (qAssigneeName) {
      result = result.filter((l) => {
        const name = (l.assignee?.full_name || l.lead_owner?.full_name || '').toLowerCase();
        return name.includes(qAssigneeName);
      });
    }

    // Source filter - FB page dùng lead IDs, non-FB dùng source_id
    if (filterSource) {
      if (filterSource.startsWith('fbp:')) {
        result = result.filter((l) => fbPageLeadIds.has(l.id));
      } else {
        result = result.filter((l) => l.source_id === filterSource);
      }
    }

    // Stage filter
    if (filterStage) {
      const sid = String(filterStage);
      result = result.filter((l) => String(l.stage_id || '') === sid);
    }

    // Khu vực CRM (company_regions)
    if (filterRegion) {
      if (filterRegion === '__none__') {
        result = result.filter((l) => l.region_id == null || String(l.region_id).trim() === '');
      } else {
        const rid = String(filterRegion);
        result = result.filter((l) => String(l.region_id || '') === rid);
      }
    }

    // Người giới thiệu
    if (filterReferrer) {
      if (filterReferrer === '__none__') {
        result = result.filter((l) => !String(l.referrer_name || '').trim());
      } else {
        result = result.filter((l) => String(l.referrer_name || '').trim() === String(filterReferrer));
      }
    }

    // Tên công ty khách hàng (customers.company)
    if (filterCustomerCompany) {
      if (filterCustomerCompany === '__none__') {
        result = result.filter((l) => !String(l.customer?.company || '').trim());
      } else {
        result = result.filter((l) => String(l.customer?.company || '').trim() === String(filterCustomerCompany));
      }
    }

    // Phone filter
    // Phone filter đã được ưu tiên xử lý ở backend để không bị phụ thuộc vào 500 bản ghi đầu.

    // Text search - tìm trong tên, mã, SĐT, mô tả, tên KH, email
    const q = deferredSearchText.trim().toLowerCase();
    if (q) {
      result = result.filter((l) => {
        // So khớp bằng nhiều `indexOf` rời nhau, dừng sớm khi tìm thấy → nhanh hơn
        // việc tạo mảng + `.map(toLowerCase)` + `.some(includes)` trên mỗi bản ghi.
        const c = l.customer;
        const s = l.source;
        const a = l.assignee;
        const o = l.lead_owner;
        return (
          (l.title && l.title.toLowerCase().includes(q))
          || (l.code && l.code.toLowerCase().includes(q))
          || (l.phone && l.phone.toLowerCase().includes(q))
          || (c?.phone && c.phone.toLowerCase().includes(q))
          || (c?.full_name && c.full_name.toLowerCase().includes(q))
          || (l.description && l.description.toLowerCase().includes(q))
          || (l.install_address && l.install_address.toLowerCase().includes(q))
          || (c?.email && c.email.toLowerCase().includes(q))
          || (c?.address && c.address.toLowerCase().includes(q))
          || (c?.company && c.company.toLowerCase().includes(q))
          || (a?.full_name && a.full_name.toLowerCase().includes(q))
          || (o?.full_name && o.full_name.toLowerCase().includes(q))
          || (s?.name && s.name.toLowerCase().includes(q))
        );
      });
    }

    // Ưu tiên: (1) thẻ ghim per-user lên đầu, (2) còn lại đẩy lead/deal có SĐT lên trên.
    if (result.length > 1) {
      const pinned = [];
      const withPhone = [];
      const noPhone = [];
      for (const it of result) {
        if (it?.is_pinned) pinned.push(it);
        else if (hasPhoneNumber(it)) withPhone.push(it);
        else noPhone.push(it);
      }
      if (pinned.length || (withPhone.length && noPhone.length)) {
        result = pinned.concat(withPhone, noPhone);
      }
    }
    return result;
  }, [
    deferredSearchText,
    filterCompany,
    filterAssignee,
    deferredAssigneeName,
    filterSource,
    filterStage,
    filterRegion,
    filterReferrer,
    filterCustomerCompany,
    filterPhone,
    fbPageLeadIds,
    hasPhoneNumber,
  ]);

  const leads = useMemo(() => filterItemsForPipeline(allLeads, 'lead'), [allLeads, filterItemsForPipeline]);
  const deals = useMemo(() => filterItemsForPipeline(allDeals, 'deal'), [allDeals, filterItemsForPipeline]);

  const activePipelinePhoneTotals = useMemo(
    () => pipelinePhoneTotals[pipelineType === 'lead' ? 'lead' : 'deal'],
    [pipelinePhoneTotals, pipelineType],
  );

  const leadActiveCount = useMemo(() => leads.filter(isActiveCrmPipelineItem).length, [leads]);
  const dealNegotiatingCount = useMemo(() => deals.filter(isActiveCrmPipelineItem).length, [deals]);

  /**
   * KPI "Tổng" dùng `total` từ API khi đủ bản ghi (tránh hiển thị 1000 trong khi DB có 5000).
   * Khi bật lọc chỉ trên client (tìm nhanh, cột, khu vực, nguồn, tên NV) → hiển thị số sau lọc trên dữ liệu đã tải.
   */
  const kpiUsesClientOnlyFilters = useMemo(
    () =>
      !!(
        searchText.trim() ||
        filterStage ||
        filterRegion ||
        filterSource ||
        filterAssigneeName.trim()
      ),
    [searchText, filterStage, filterRegion, filterSource, filterAssigneeName],
  );

  const leadKpiTotalCount = useMemo(() => {
    if (kpiUsesClientOnlyFilters) return leads.length;
    const t = loadMoreState.leadTotal;
    return typeof t === 'number' ? t : leads.length;
  }, [kpiUsesClientOnlyFilters, leads.length, loadMoreState.leadTotal]);

  const explicitExpectedKvStages = useMemo(
    () => hasExplicitExpectedRevenueStage(stagesDeal),
    [stagesDeal],
  );

  /** KPI Deal (tổng / đàm phán / thắng / doanh thu thắng / đã DT hoàn thành / KPI sổ cái) — cùng bộ lọc Kanban, không dùng kpis API thuần server. */
  const dealKpisFromFilters = useMemo(() => {
    const won = deals.filter((d) => dealIsWonStage(d, stagesDeal));
    const wonValue = won.reduce((s, l) => s + (Number(l.estimated_value) || 0), 0);
    const revenueCompleted = deals.filter((d) => dealIsRevenueCompletedStage(d, stagesDeal));
    const completedRevenueValue = revenueCompleted.reduce((s, l) => s + (Number(l.estimated_value) || 0), 0);
    const pipelineDeals = deals.filter((d) => dealCountsTowardPipelineEstimate(d, stagesDeal));
    const expectedDeals = deals.filter((d) => dealCountsTowardExpectedValue(d, stagesDeal));
    const pipeline_estimated_value = pipelineDeals.reduce(
      (s, d) => s + (Number(d.estimated_value) || 0),
      0,
    );
    const expected_value = expectedDeals.reduce(
      (s, d) => s + dealWeightedValue(d, stagesDeal),
      0,
    );
    const totalHeadline = kpiUsesClientOnlyFilters
      ? deals.length
      : typeof loadMoreState.dealTotal === 'number'
        ? loadMoreState.dealTotal
        : deals.length;
    return {
      total_deals: totalHeadline,
      won_deals: won.length,
      won_value: wonValue,
      completed_revenue_deals: revenueCompleted.length,
      completed_revenue_value: completedRevenueValue,
      pipeline_estimated_value,
      expected_value,
    };
  }, [
    deals,
    stagesDeal,
    kpiUsesClientOnlyFilters,
    loadMoreState.dealTotal,
  ]);

  const ledgerMapLead = dataLead?.ledger_net_by_lead || {};
  const ledgerMapDeal = dataDeal?.ledger_net_by_lead || {};

  /**
   * Tổng điểm KPI (tháng) trên lead/deal đang hiển thị — bằng Σ ô góc thẻ Kanban.
   * Khớp bộ lọc «Phụ trách» + lọc client (tìm nhanh, cột, khu vực, …); tránh lệch với số tổng API khi chỉ một phần bản ghi có ledger.
   */
  const kpiLedgerMonthNetSumVisible = useMemo(() => {
    const map = pipelineType === 'lead' ? ledgerMapLead : ledgerMapDeal;
    const items = pipelineType === 'lead' ? leads : deals;
    let s = 0;
    for (const l of items) {
      const v = map[String(l.id)];
      if (typeof v === 'number' && !Number.isNaN(v)) s += Number(v);
    }
    return Math.round(s * 100) / 100;
  }, [pipelineType, leads, deals, ledgerMapLead, ledgerMapDeal]);

  // Pipeline view: group leads/deals by stage
  const pipelineLead = useMemo(() => {
    if (!stagesLead.length) return [];
    const attachLedger = (l) => {
      const raw = ledgerMapLead[String(l.id)];
      const kpi_ledger_month_net = raw !== undefined ? raw : null;
      return { ...l, kpi_ledger_month_net };
    };
    return stagesLead.map((s) => ({
      ...s,
      items: leads
        .filter((l) => String(l.stage_id || '') === String(s.id))
        .map(attachLedger),
      totalValue: leads.filter((l) => String(l.stage_id || '') === String(s.id)).reduce((sum, l) => sum + (l.estimated_value || 0), 0),
    }));
  }, [stagesLead, leads, ledgerMapLead]);

  const pipelineDeal = useMemo(() => {
    if (!stagesDeal.length) return [];
    const attachLedger = (l) => {
      const raw = ledgerMapDeal[String(l.id)];
      const kpi_ledger_month_net = raw !== undefined ? raw : null;
      return { ...l, kpi_ledger_month_net };
    };
    return stagesDeal.map((s) => ({
      ...s,
      items: deals
        .filter((l) => String(l.stage_id || '') === String(s.id))
        .map(attachLedger),
      totalValue: deals.filter((l) => String(l.stage_id || '') === String(s.id)).reduce((sum, l) => sum + (l.estimated_value || 0), 0),
    }));
  }, [stagesDeal, deals, ledgerMapDeal]);

  const currentData = pipelineType === 'lead' ? dataLead : dataDeal;
  const currentPipeline = pipelineType === 'lead' ? pipelineLead : pipelineDeal;

  /**
   * Cột ảo «Chưa có giai đoạn» — gom deal không nằm trong bất kỳ cột nào của pipeline hiện tại.
   * Tiêu chí:
   *   - stage_id rỗng/null, HOẶC
   *   - stage_id không khớp với cột active nào trong stagesDeal (cột bị xoá/khác pipeline), HOẶC
   *   - có project_id nhưng KHÔNG có badge SX & VC (dữ liệu lệch, không vào được module xưởng).
   * Chỉ áp dụng cho pipeline Deal trên Kanban; ẩn mặc định, bật bằng checkbox trong bộ lọc.
   */
  const orphanDealColumn = useMemo(() => {
    if (pipelineType !== 'deal') return null;
    if (!showOrphanDealColumn) return null;
    const validStageIds = new Set((stagesDeal || []).map((s) => String(s.id)));
    const attachLedger = (l) => {
      const raw = ledgerMapDeal[String(l.id)];
      const kpi_ledger_month_net = raw !== undefined ? raw : null;
      return { ...l, kpi_ledger_month_net };
    };
    const orphans = deals.filter((d) => {
      const sid = d.stage_id ? String(d.stage_id) : '';
      const stageMissing = !sid || !validStageIds.has(sid);
      const hasProjectNoBadge =
        !!d.project_id && !d?.sx_pipeline_stage?.id && !d?.vc_pipeline_stage?.id;
      return stageMissing || hasProjectNoBadge;
    });
    return {
      id: '__orphan_no_stage__',
      __virtual: true,
      name: 'Chưa có giai đoạn',
      icon: '🗂️',
      color: '#94a3b8',
      description:
        'Deal không thuộc cột nào của pipeline hiện tại — stage trống/không hợp lệ hoặc có project nhưng thiếu badge SX/VC.',
      items: orphans.map(attachLedger),
      totalValue: orphans.reduce((s, l) => s + (l.estimated_value || 0), 0),
    };
  }, [pipelineType, showOrphanDealColumn, stagesDeal, deals, ledgerMapDeal]);

  /** Pipeline truyền cho Kanban — chèn cột ảo ở cuối nếu enabled. */
  const kanbanPipeline = useMemo(() => {
    if (orphanDealColumn) return [...currentPipeline, orphanDealColumn];
    return currentPipeline;
  }, [currentPipeline, orphanDealColumn]);

  /**
   * Danh sách lead/deal QUÁ HẠN theo pipeline đang xem.
   * Ưu tiên hạn NV CRM (`crm_next_open_task_deadline`); nếu không có thì xét SLA cột.
   * Bỏ qua stage Thắng/Lost. Sắp xếp giảm dần theo thời gian quá hạn.
   */
  const overdueItems = useMemo(() => {
    if (viewMode !== 'kanban' && viewMode !== 'deadline' && viewMode !== 'list') return [];
    const isLead = pipelineType === 'lead';
    const items = isLead ? leads : deals;
    const stages = isLead ? stagesLead : stagesDeal;
    if (!items?.length || !stages?.length) return [];
    const stageMap = new Map(stages.map((s) => [String(s.id), s]));
    const out = [];
    for (const it of items) {
      const stage = stageMap.get(String(it.stage_id || ''));
      if (shouldHideCrmKanbanDeadlineOnCard(it, stage)) continue;
      if (!stage || stage.is_won || stage.is_lost || stage.counts_as_completed_revenue) continue;
      const taskTone = getCrmOpenTaskDeadlineTone(it.crm_next_open_task_deadline);
      const slaTone = getPipelineStageSlaTone(it.stage_entered_at, stage);
      const tone = taskTone || slaTone;
      if (!tone || tone.level !== 'overdue') continue;
      out.push({
        id: it.id,
        code: it.code || `#${it.id}`,
        title: it.title || '',
        customerName: it.customer?.full_name || '',
        assigneeName: it.assignee?.full_name || '',
        stageName: stage.name,
        overdueMs: Math.abs(tone.remainingMs || 0),
        source: taskTone ? 'task' : 'sla',
      });
    }
    out.sort((a, b) => b.overdueMs - a.overdueMs);
    return out;
  }, [viewMode, pipelineType, leads, deals, stagesLead, stagesDeal]);

  const listViewPipelineId = useMemo(() => {
    if (!dashboardScopeCompanyId) return '';
    return resolvePipelineIdForCompany(dashboardScopeCompanyId) || '';
  }, [dashboardScopeCompanyId, resolvePipelineIdForCompany]);

  const companyPipelineIdsForList = useMemo(() => {
    if (!dashboardScopeCompanyId) return new Set();
    return new Set(
      (pipelines || [])
        .filter((p) => String(p.company_id || '') === String(dashboardScopeCompanyId))
        .map((p) => String(p.id)),
    );
  }, [pipelines, dashboardScopeCompanyId]);

  /** Cột «Thời gian từng cột» chỉ stage pipeline của công ty đang xem */
  const listViewCompanyPipelineStages = useMemo(() => {
    if (!dashboardScopeCompanyId) return [];
    const raw = pipelineType === 'lead' ? stagesLead : stagesDeal;
    return (raw || [])
      .filter((s) => {
        if (listViewPipelineId && String(s.pipeline_id || '') !== String(listViewPipelineId)) return false;
        if (s.pipeline_id && !companyPipelineIdsForList.has(String(s.pipeline_id))) return false;
        return true;
      })
      .slice()
      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  }, [
    dashboardScopeCompanyId,
    pipelineType,
    stagesLead,
    stagesDeal,
    listViewPipelineId,
    companyPipelineIdsForList,
  ]);

  const listViewCompanyName = useMemo(() => {
    if (!dashboardScopeCompanyId) return '';
    const c = (companies || []).find((x) => String(x.id) === String(dashboardScopeCompanyId));
    return c?.short_name || c?.name || '';
  }, [dashboardScopeCompanyId, companies]);

  const kpis = currentData?.kpis || {};

  /** Tooltip ô «Điểm KPI (tháng)»: sổ cái + gợi ý gom theo vai trò (bạn hoặc NV đang lọc) từ bảng KPI hướng dẫn. */
  const kpiLedgerMonthCardHint = useMemo(() => {
    const periodYm = kpis?.kpi_ledger_period_start
      ? String(kpis.kpi_ledger_period_start).slice(0, 7)
      : null;
    const periodLabel = periodYm || 'tháng hiện tại (theo máy chủ)';
    let assigneeProfile = null;
    if (filterAssignee) {
      const id = String(filterAssignee);
      const u =
        employeeFilterList.find((x) => String(x.id) === id) || users.find((x) => String(x.id) === id);
      assigneeProfile = u
        ? { id, full_name: u.full_name || null, email: u.email || null, role: u.role || null }
        : { id, full_name: null, email: null, role: null };
    }
    return buildKpiLedgerMonthTooltipHint({
      periodLabel,
      viewerUser: user,
      assigneeProfile,
      pipelineType,
      kpis: { ...kpis, kpi_ledger_month_net_sum: kpiLedgerMonthNetSumVisible },
      ledgerNetByLead: pipelineType === 'lead' ? ledgerMapLead : ledgerMapDeal,
    });
  }, [kpis, kpiLedgerMonthNetSumVisible, filterAssignee, employeeFilterList, users, pipelineType, user, ledgerMapLead, ledgerMapDeal]);

  const buildPipelineUiSnapshot = useCallback(() => ({
    filterCompany,
    searchText,
    filterAssignee,
    assigneeListSearch,
    filterAssigneeName,
    filterSource,
    filterStage,
    filterRegion,
    filterLeadType,
    filterReferrer,
    filterCustomerCompany,
    filterPhone,
    showAdvSearch,
    pipelineType,
    pinnedTab,
    timePreset,
    customDateFrom,
    customDateTo,
    showCustomDate,
    viewMode,
    kanbanLoadLimit,
    showOrphanDealColumn,
  }), [
    filterCompany,
    searchText,
    filterAssignee,
    assigneeListSearch,
    filterAssigneeName,
    filterSource,
    filterStage,
    filterRegion,
    filterLeadType,
    filterReferrer,
    filterCustomerCompany,
    filterPhone,
    showAdvSearch,
    pipelineType,
    pinnedTab,
    timePreset,
    customDateFrom,
    customDateTo,
    showCustomDate,
    viewMode,
    kanbanLoadLimit,
    showOrphanDealColumn,
  ]);

  const persistPipelineUi = useCallback(() => {
    saveCrmPipelineSnapshot(buildPipelineUiSnapshot());
  }, [buildPipelineUiSnapshot]);

  useEffect(() => registerCrmPipelinePersistUi(persistPipelineUi), [persistPipelineUi]);

  /** Rời Pipeline (vd. sang Khách hàng) — lưu bộ lọc trước khi unmount. */
  useEffect(() => {
    return () => {
      saveCrmPipelineSnapshot(buildPipelineUiSnapshot());
    };
  }, [buildPipelineUiSnapshot]);

  useEffect(() => {
    if (suppressSnapshotOverwriteRef.current) return;
    saveCrmPipelineSnapshot(buildPipelineUiSnapshot());
    try {
      if (isAdmin) {
        setStoredCrmFilterCompanyId(filterCompany ? String(filterCompany) : '');
      }
      if (filterLeadType) localStorage.setItem(LS_CRM_DASH_LEAD_TYPE, String(filterLeadType));
      else localStorage.removeItem(LS_CRM_DASH_LEAD_TYPE);
    } catch {
      // ignore
    }
  }, [buildPipelineUiSnapshot, isAdmin, filterCompany, filterLeadType]);

  useEffect(() => {
    if (dataLead == null && dataDeal == null) return;
    const id = peekCrmPipelineCardFocus();
    if (!id) return;
    const pulse = (el) => {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2', 'rounded-lg', 'transition-shadow');
      window.setTimeout(() => {
        el.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2', 'rounded-lg', 'transition-shadow');
      }, 2200);
      clearCrmPipelineCardFocus();
    };
    const tryOnce = () => {
      const el = document.querySelector(`[data-crm-pipeline-card="${id}"]`);
      if (el) {
        pulse(el);
        return true;
      }
      return false;
    };
    if (tryOnce()) return undefined;
    const t = window.setTimeout(() => {
      if (!tryOnce()) clearCrmPipelineCardFocus();
    }, 500);
    return () => clearTimeout(t);
  }, [dataLead, dataDeal, viewMode, pipelineType, currentPipeline]);

  const applyKanbanStageChange = useCallback(
    async (leadId, newStageId, extraData = {}, opts = {}) => {
      const throwOnError = !!opts.throwOnError;
      const prevLeads = allLeads;
      const prevDeals = allDeals;
      const lid = String(leadId);
      const entered = new Date().toISOString();
      if (pipelineType === 'lead') {
        setAllLeads((prev) =>
          dedupeCrmKanbanRows(prev.map((l) => (String(l.id) === lid ? { ...l, stage_id: newStageId, stage_entered_at: entered, ...extraData } : l))),
        );
      } else {
        setAllDeals((prev) =>
          dedupeCrmKanbanRows(prev.map((l) => (String(l.id) === lid ? { ...l, stage_id: newStageId, stage_entered_at: entered, ...extraData } : l))),
        );
      }
      try {
        const { data } = await api.patch(`/crm/leads/${leadId}/stage`, { stage_id: newStageId, ...extraData });

        if (data.requires_conversion) {
          if (pipelineType === 'lead') setAllLeads(prevLeads);
          else setAllDeals(prevDeals);
          if (throwOnError) {
            throw new Error('Thao tác này cần bước chuyển đổi riêng — không áp dụng khi chuyển hàng loạt.');
          }
          return;
        }

        // Merge fresh badge fields từ response để không bị silent reload xóa tag SX/VC.
        if (data && data.id) {
          let mergePatch = {};
          if (data.stage_id) mergePatch.stage_id = data.stage_id;
          if (data.lost_reason !== undefined) mergePatch.lost_reason = data.lost_reason;
          if (data.probability !== undefined) mergePatch.probability = data.probability;
          if (data.actual_close_date !== undefined) mergePatch.actual_close_date = data.actual_close_date;
          if (data.sx_pipeline_stage != null) mergePatch.sx_pipeline_stage = data.sx_pipeline_stage;
          if (data.vc_pipeline_stage != null) mergePatch.vc_pipeline_stage = data.vc_pipeline_stage;
          if (data.project_id !== undefined) mergePatch.project_id = data.project_id;
          if (data.stage_entered_at) mergePatch.stage_entered_at = data.stage_entered_at;
          if (data.kanban_deadline_at !== undefined) mergePatch.kanban_deadline_at = data.kanban_deadline_at;
          if (data.kanban_deadline_reason !== undefined) mergePatch.kanban_deadline_reason = data.kanban_deadline_reason;
          if (mergePatch.project_id) {
            mergePatch = await hydrateCrmLeadBadgeFields(api, leadId, mergePatch);
          }
          if (Object.keys(mergePatch).length > 0) {
            const setter = pipelineType === 'lead' ? setAllLeads : setAllDeals;
            setter((prev) =>
              dedupeCrmKanbanRows(
                prev.map((x) => (String(x.id) === lid ? { ...x, ...mergePatch } : x)),
              ),
            );
          }
          const pid = data.project_id || data.project_auto_created?.project_id;
          if (pid && typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('crm-project-badges-refresh', { detail: { projectId: pid } }),
            );
          }
        }

        if (data.deal_won) {
          autoCreateProject(leadId, null);
        } else if (data.project_auto_created?.project_id) {
          setAutoCreateResult({
            project_id: data.project_auto_created.project_id,
            project_code: data.project_auto_created.project_code,
            tasks_created: data.project_auto_created.tasks_created,
          });
          setAutoCreateStatus('success');
          load({ silent: true });
        }
      } catch (e) {
        console.error(e);
        if (pipelineType === 'lead') setAllLeads(prevLeads);
        else setAllDeals(prevDeals);
        if (e?.response?.data?.code === 'CRM_BLOCKING_TASKS_INCOMPLETE') {
          const stagesArr = pipelineType === 'lead' ? stagesLead : stagesDeal;
          const curStg = stagesArr.find((s) => String(s.id) === String(e.response.data.current_stage_id));
          const tgtStg = stagesArr.find((s) => String(s.id) === String(e.response.data.target_stage_id));
          setBlockingModal({
            leadId,
            targetStageId: e.response.data.target_stage_id || newStageId,
            currentStageName: curStg?.name || '',
            targetStageName: tgtStg?.name || '',
            remainingTasks: e.response.data.remaining_tasks || [],
          });
        } else if (e?.response?.data?.code === 'CRM_DEAL_SX_PROJECT_EXISTS') {
          window.alert(e.response?.data?.error || 'Deal đã tạo dự án Sản xuất — không thể kéo ngược.');
        }
        if (throwOnError) throw e;
      }
    },
    [pipelineType, allLeads, allDeals, load, stagesLead, stagesDeal],
  );

  const handleMoveStage = useCallback(
    async (leadId, newStageId) => {
      const stages = pipelineType === 'lead' ? stagesLead : stagesDeal;
      const targetStage = stages.find((s) => s.id === newStageId);

      let extraData = {};
      if (targetStage?.is_lost) {
        const lostReason = window.prompt(`Nhập lý do thua cho ${pipelineType === 'lead' ? 'lead' : 'deal'}:`)?.trim();
        if (!lostReason) return;
        extraData.lost_reason = lostReason;
      }

      if (pipelineType === 'deal') {
        let deal = allDeals.find((d) => d.id === leadId);
        const currentStage = deal?.stage_id
          ? stages.find((s) => String(s.id) === String(deal.stage_id))
          : null;
        const revertBlocked = deal && targetStage
          ? crmDealRevertFromPostWonBlockedMessage(deal, currentStage, targetStage)
          : null;
        if (revertBlocked) {
          window.alert(revertBlocked);
          return;
        }
        // Bỏ qua gate nếu deal đang nằm ở cột ảo «Chưa có giai đoạn»:
        //   stage_id rỗng / không thuộc stagesDeal hiện tại / có project_id nhưng thiếu badge SX & VC.
        // Mục đích: cho phép thả tự do về bất kỳ cột thường nào để chữa dữ liệu lệch.
        const validStageIds = new Set((stagesDeal || []).map((s) => String(s.id)));
        const sid = deal?.stage_id ? String(deal.stage_id) : '';
        const isOrphanSource =
          !!deal &&
          (!sid ||
            !validStageIds.has(sid) ||
            (!!deal.project_id && !deal?.sx_pipeline_stage?.id && !deal?.vc_pipeline_stage?.id));
        if (!isOrphanSource) {
          const blocked = deal && targetStage
            ? crmDealStageMoveBlockedMessage(deal, targetStage, 'deal')
            : null;
          if (blocked) {
            window.alert(blocked);
            return;
          }
          if (!canDropDealOnCrmKanbanStage(deal || {}, targetStage || {}, 'deal')) {
            window.alert('Không thể chuyển deal sang giai đoạn này trên CRM.');
            return;
          }
        }

        if (targetStage?.is_won && deal) {
          try {
            const { data: fresh } = await api.get(`/crm/leads/${leadId}`);
            if (fresh) deal = { ...deal, ...fresh };
          } catch (_) { /* giữ snapshot Kanban */ }

          const alreadySx = crmDealMoveToWonSxAlreadyCreatedMessage(deal);
          if (alreadySx) {
            if (String(deal.stage_id) === String(newStageId)) return;
            await applyKanbanStageChange(leadId, newStageId, extraData);
            return;
          }

          setDealWonProductionError('');
          const prefCompany = deal.company_id
            ? String(deal.company_id)
            : (isAdmin ? findDefaultAdminCrmCompanyPhucDat(productionCompaniesForSx) : '');
          setDealWonProductionCompanyId(prefCompany);
          setDealWonProductionWorkshopTypeId('');
          setDealWonProductionWorkshopTypes([]);
          setDealWonProductionCtx({ leadId, newStageId, extraData, targetStage, deal });
          return;
        }
      }

      if (targetStage?.is_won && pipelineType === 'lead') {
        const lead = allLeads.find((l) => l.id === leadId);
        setWonAssignLeadId(leadId);
        setWonAssignUser(lead?.assigned_to || lead?.lead_owner_id || '');
        setWonAssignRegion(lead?.region_id ? String(lead.region_id) : '');
        setWonAssignRegions([]);
        setWonAssignRegionsLoading(false);
        setWonAssignModal(true);
        return;
      }

      // Chuyển sang cột mới (trừ Thắng/Thua): (1) kiểm tra nhiệm vụ chặn TRƯỚC;
      // (2) chỉ hiện hộp deadline nếu cột đích bật requires_deadline trong Cài đặt Pipeline.
      if (targetStage && !targetStage.is_won && !targetStage.is_lost && !targetStage.counts_as_completed_revenue) {
        const rows = pipelineType === 'lead' ? allLeads : allDeals;
        const card = rows.find((x) => String(x.id) === String(leadId));
        const isSameStage = card && String(card.stage_id || '') === String(newStageId);
        if (!isSameStage) {
          try {
            const { data: chk } = await api.get(`/crm/leads/${leadId}/stage-advance-check`, {
              params: { target_stage_id: newStageId },
            });
            if (chk && chk.ok === false && chk.code === 'CRM_BLOCKING_TASKS_INCOMPLETE') {
              const stagesArr = pipelineType === 'lead' ? stagesLead : stagesDeal;
              const curStg = stagesArr.find((s) => String(s.id) === String(chk.current_stage_id));
              setBlockingModal({
                leadId,
                targetStageId: newStageId,
                currentStageName: curStg?.name || '',
                targetStageName: targetStage?.name || '',
                remainingTasks: chk.remaining_tasks || [],
              });
              return;
            }
          } catch (_) { /* lỗi pre-check → bỏ qua */ }
          if (targetStage.requires_deadline) {
            setDeadlineCtx({
              leadId,
              newStageId,
              extraData,
              targetStage,
              card: card || null,
              mode: 'stage_move',
            });
            return;
          }
        }
      }

      if (pipelineType === 'deal' && targetStage && !targetStage.is_lost && targetStage.create_event_on_enter) {
        const deal = allDeals.find((d) => d.id === leadId);
        if (deal) {
          setDealKanbanEventCtx({ leadId, newStageId, extraData, targetStage, deal });
          return;
        }
      }

      await applyKanbanStageChange(leadId, newStageId, extraData);
    },
    [
      pipelineType,
      stagesLead,
      stagesDeal,
      allLeads,
      allDeals,
      applyKanbanStageChange,
      isAdmin,
      productionCompaniesForSx,
    ],
  );

  /** Chuyển hàng loạt sang giai đoạn (Kanban) — không áp dụng Thắng / deal đặc biệt */
  const bulkMoveSelectedToStage = useCallback(
    async (targetStageId) => {
      const stages = pipelineType === 'lead' ? stagesLead : stagesDeal;
      const targetStage = stages.find((s) => String(s.id) === String(targetStageId));
      if (!targetStage) return;
      const ids = [...new Set((manualMergeIds || []).map((x) => String(x)).filter(Boolean))];
      if (!ids.length) return;

      const stageName = String(targetStage?.name || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      const isProductionStage = stageName.includes('san xuat');

      if (pipelineType === 'deal' && (targetStage.is_won || isProductionStage)) {
        window.alert('Không hỗ trợ chuyển hàng loạt sang Thắng / Sản xuất — vui lòng kéo từng deal (chỉ tới cột Thắng).');
        return;
      }

      if (pipelineType === 'lead' && targetStage.is_won) {
        window.alert('Chuyển sang cột Thắng cần chọn người phụ trách cho từng lead. Vui lòng kéo thẻ hoặc xử lý từng lead.');
        return;
      }

      if (pipelineType === 'deal') {
        if (targetStage.create_event_on_enter) {
          window.alert('Giai đoạn này yêu cầu đặt lịch khi vào — vui lòng kéo từng deal.');
          return;
        }
      }

      if (targetStage.requires_deadline) {
        window.alert('Giai đoạn này yêu cầu đặt deadline khi vào — vui lòng kéo từng thẻ.');
        return;
      }

      if (targetStage.is_lost) {
        const lostReason = window.prompt(`Nhập lý do thua (áp dụng cho ${ids.length} ${pipelineType === 'deal' ? 'deal' : 'lead'}):`)?.trim();
        if (!lostReason) return;
        setBulkMoving(true);
        try {
          for (const id of ids) {
            await applyKanbanStageChange(id, targetStageId, { lost_reason: lostReason }, { throwOnError: true });
          }
          setManualMergeIds([]);
          setBulkStageTarget('');
          await loadRef.current?.({ silent: true });
        } catch (e) {
          window.alert(e.response?.data?.error || e.message || 'Lỗi chuyển giai đoạn');
        } finally {
          setBulkMoving(false);
        }
        return;
      }

      setBulkMoving(true);
      try {
        for (const id of ids) {
          await applyKanbanStageChange(id, targetStageId, {}, { throwOnError: true });
        }
        setManualMergeIds([]);
        setBulkStageTarget('');
        await loadRef.current?.({ silent: true });
      } catch (e) {
        window.alert(e.response?.data?.error || e.message || 'Lỗi chuyển giai đoạn');
      } finally {
        setBulkMoving(false);
      }
    },
    [pipelineType, stagesLead, stagesDeal, manualMergeIds, applyKanbanStageChange],
  );

  const confirmDealWonSxExistsOnlyStage = async () => {
    const ctx = dealWonSxExistsCtx;
    if (!ctx) return;
    setDealWonSxExistsCtx(null);
    await applyKanbanStageChange(ctx.leadId, ctx.newStageId, ctx.extraData);
  };

  const confirmDealWonProduction = async () => {
    if (!dealWonProductionCompanyId) {
      setDealWonProductionError('Vui lòng chọn công ty thuộc module Sản xuất.');
      return;
    }
    if (!dealWonProductionWorkshopTypeId) {
      setDealWonProductionError('Vui lòng chọn phân loại sản xuất.');
      return;
    }
    const ctx = dealWonProductionCtx;
    if (!ctx) return;
    setDealWonProductionError('');
    const nextExtra = {
      ...ctx.extraData,
      production_company_id: dealWonProductionCompanyId,
      workshop_type_id: dealWonProductionWorkshopTypeId,
    };
    setDealWonProductionCtx(null);
    setDealWonProductionCompanyId('');
    setDealWonProductionWorkshopTypeId('');
    setDealWonProductionWorkshopTypes([]);
    if (ctx.targetStage.create_event_on_enter) {
      setDealKanbanEventCtx({
        leadId: ctx.leadId,
        newStageId: ctx.newStageId,
        extraData: nextExtra,
        targetStage: ctx.targetStage,
        deal: ctx.deal,
      });
    } else {
      await applyKanbanStageChange(ctx.leadId, ctx.newStageId, nextExtra);
    }
  };

  const submitDealAutoCreateCompanyPick = async () => {
    if (!dealAutoCreateCompanyId) {
      setDealAutoCreatePickError('Vui lòng chọn công ty Sản xuất.');
      return;
    }
    if (!dealAutoCreateWorkshopTypeId) {
      setDealAutoCreatePickError('Vui lòng chọn phân loại sản xuất.');
      return;
    }
    const dealId = dealAutoCreatePick;
    const cid = dealAutoCreateCompanyId;
    const wkt = dealAutoCreateWorkshopTypeId;
    if (!dealId) return;
    setDealAutoCreatePickError('');
    setDealAutoCreatePick(null);
    setDealAutoCreateCompanyId('');
    setDealAutoCreateWorkshopTypeId('');
    setDealAutoCreateWorkshopTypes([]);
    autoCreateCalledRef.current = false;
    await autoCreateProject(dealId, cid, wkt);
  };

  const handleWonAssignConvert = async () => {
    if (!wonAssignUser) { setWonAssignError('Vui lòng chọn nhân viên phụ trách'); return; }
    if (!wonAssignRegion) { setWonAssignError('Vui lòng chọn khu vực'); return; }
    setWonAssigning(true);
    setWonAssignError('');
    const lead = allLeads.find(l => l.id === wonAssignLeadId);
    try {
      await api.post(`/crm/leads/${wonAssignLeadId}/convert-to-deal`, {
        assigned_to: wonAssignUser,
        company_id: lead?.company_id || undefined,
        region_id: wonAssignRegion,
      });
      setWonAssignModal(false);
      const snap = loadCrmPipelineSnapshot();
      saveCrmPipelineSnapshot({ ...(snap || {}), pipelineType: 'deal' });
      markCrmPipelineCardFocus(wonAssignLeadId);
      setPipelineType('deal');
      load({ silent: true });
    } catch (e) {
      setWonAssignError(e.response?.data?.error || 'Lỗi chuyển sang Deal');
    } finally {
      setWonAssigning(false);
    }
  };

  const confirmDealKanbanEvent = async ({ startIso, endIso, titlePreview, locPreview }) => {
    const ctx = dealKanbanEventCtx;
    if (!ctx) return;
    setDealKanbanEventBusy(true);
    try {
      await applyKanbanStageChange(ctx.leadId, ctx.newStageId, ctx.extraData, { throwOnError: true });
      await api.post('/events', {
        title: titlePreview,
        description: ctx.deal?.description || null,
        location: locPreview && locPreview !== '—' ? locPreview : null,
        start_time: startIso,
        end_time: endIso,
        lead_id: ctx.leadId,
        customer_id: ctx.deal?.customer_id || null,
        assignee_id: ctx.deal?.assigned_to || ctx.deal?.lead_owner_id || null,
        event_type: 'site_visit',
        status: 'planned',
      });
      setDealKanbanEventCtx(null);
      load({ silent: true });
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi cập nhật giai đoạn / tạo sự kiện');
    } finally {
      setDealKanbanEventBusy(false);
    }
  };

  const skipDealKanbanEvent = async () => {
    const ctx = dealKanbanEventCtx;
    if (!ctx) return;
    setDealKanbanEventBusy(true);
    try {
      await applyKanbanStageChange(ctx.leadId, ctx.newStageId, ctx.extraData, { throwOnError: true });
      setDealKanbanEventCtx(null);
      load({ silent: true });
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi cập nhật giai đoạn');
    } finally {
      setDealKanbanEventBusy(false);
    }
  };

  /** Mở modal deadline từ nút trên thẻ (không đổi cột). */
  const openDeadlineFromCard = useCallback((item) => {
    setDeadlineCtx({
      leadId: item.id,
      newStageId: null,
      extraData: {},
      targetStage: null,
      card: item,
      mode: 'edit_only',
    });
  }, []);

  /** Lưu deadline: kèm chuyển cột hoặc chỉ sửa deadline trên thẻ. */
  const confirmDeadlineMove = async ({ deadlineIso, reason }) => {
    const ctx = deadlineCtx;
    if (!ctx) return;
    setDeadlineBusy(true);
    try {
      if (ctx.mode === 'edit_only') {
        await api.patch(`/crm/leads/${ctx.leadId}/deadline`, {
          kanban_deadline_at: deadlineIso,
          reason: reason || '',
        });
        const lid = String(ctx.leadId);
        const patch = {
          kanban_deadline_at: deadlineIso,
          kanban_deadline_reason: reason || null,
        };
        if (pipelineType === 'lead') {
          setAllLeads((prev) => prev.map((l) => (String(l.id) === lid ? { ...l, ...patch } : l)));
        } else {
          setAllDeals((prev) => prev.map((d) => (String(d.id) === lid ? { ...d, ...patch } : d)));
        }
        setDeadlineCtx(null);
        load({ silent: true });
        return;
      }
      await applyKanbanStageChange(
        ctx.leadId,
        ctx.newStageId,
        { ...ctx.extraData, kanban_deadline_at: deadlineIso, deadline_reason: reason || '' },
        { throwOnError: true },
      );
      setDeadlineCtx(null);
      load({ silent: true });
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi cập nhật deadline');
    } finally {
      setDeadlineBusy(false);
    }
  };

  loadRef.current = load;

  /**
   * Đồng bộ nhẹ: mỗi 15s poll GET /crm/live-version (vài chục byte).
   * Chỉ khi v đổi mới gọi load({ silent }). Tab ẩn: skip. Tab focus lại: chạy một tick ngay.
   * Kết hợp socket 'crm:dashboard_changed' (effect riêng phía dưới) để cập nhật < 1s.
   */
  useEffect(() => {
    const POLL_MS = 15_000;
    let intervalId = null;
    const clearInt = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
    const buildLvParams = () => {
      const p = {};
      if (customDateFrom) p.date_from = customDateFrom;
      if (customDateTo) p.date_to = customDateTo;
      if (dashboardScopeCompanyId) p.company_id = dashboardScopeCompanyId;
      return p;
    };
    const runTick = async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      try {
        const { data: lv } = await api.get('/crm/live-version', { params: buildLvParams() });
        const v = lv?.v;
        const prev = crmLiveVersionRef.current;
        if (v == null) return;
        if (prev != null && Number(v) <= Number(prev)) return;
        crmLiveVersionRef.current = v;
        await loadRef.current?.({ silent: true });
      } catch {
        /* ignore */
      }
    };
    clearInt();
    intervalId = setInterval(() => void runTick(), POLL_MS);
    const onVis = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') void runTick();
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVis);
    }
    return () => {
      clearInt();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVis);
      }
    };
  }, [dashboardScopeCompanyId, customDateFrom, customDateTo]);

  const calculateDays = (createdAt) => {
    if (!createdAt) return '';
    const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Hôm nay';
    if (days === 1) return '1 ngày';
    if (days < 7) return `${days} ngày`;
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? '1 tuần' : `${weeks} tuần`;
  };

  // UI compact dùng chung cho cả Lead lẫn Deal — kích thước header/control giống nhau giữa 2 tab.
  const compactLeadUi = true;
  const ctrlH = compactLeadUi ? 'h-9' : 'h-10';
  const ctrlTxt = compactLeadUi ? 'text-xs' : 'text-sm';

  return (
    <div className={`min-h-screen ${compactLeadUi ? 'space-y-3' : 'space-y-6'}`}>
      {/* Auto-create project banner */}
      {autoCreateStatus === 'loading' && (
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-4 text-white shadow-lg flex items-center gap-4">
          <div className="animate-spin h-8 w-8 border-3 border-white/30 border-t-white rounded-full flex-shrink-0" />
          <div>
            <p className="font-bold text-lg">🚀 Đang tự động tạo dự án...</p>
            <p className="text-sm text-white/80">Deal thắng - hệ thống đang tạo dự án và phân công nhiệm vụ</p>
          </div>
        </div>
      )}
      {autoCreateStatus === 'success' && autoCreateResult && (
        <div className="bg-gradient-to-r from-emerald-600 to-green-600 rounded-xl p-4 text-white shadow-lg flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-10 h-10 bg-white/20 rounded-full text-xl">✅</div>
            <div>
              <p className="font-bold text-lg">Dự án {autoCreateResult.project_code || ''} đã tạo!</p>
              <p className="text-sm text-white/90">{autoCreateResult.tasks_created || 0} nhiệm vụ được tạo tự động</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setAutoCreateStatus(null)}
              className="h-9 px-4 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium cursor-pointer transition">
              Đóng
            </button>
            <button onClick={() => navigate(`/sx/projects/${autoCreateResult.project_id}`)}
              className="h-9 px-4 bg-white text-emerald-700 hover:bg-emerald-50 rounded-lg text-sm font-semibold cursor-pointer transition">
              Xem xưởng →
            </button>
            <button onClick={() => navigate(`/projects/${autoCreateResult.project_id}`)}
              className="h-9 px-4 bg-white/90 text-gray-800 hover:bg-white rounded-lg text-sm font-medium cursor-pointer transition">
              Dự án đầy đủ
            </button>
          </div>
        </div>
      )}
      {autoCreateStatus === 'error' && (
        <div className="bg-gradient-to-r from-red-600 to-red-700 rounded-xl p-4 text-white shadow-lg flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-10 h-10 bg-white/20 rounded-full text-xl">❌</div>
            <div>
              <p className="font-bold">Lỗi tạo dự án</p>
              <p className="text-sm text-white/80">{autoCreateError}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { autoCreateCalledRef.current = false; setAutoCreateStatus(null); }}
              className="h-9 px-4 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium cursor-pointer transition">
              Đóng
            </button>
          </div>
        </div>
      )}
      {/* Header — tab Lead: gọn hơn để nhường chỗ Kanban */}
      <div className={`flex items-center justify-between px-0 ${compactLeadUi ? 'gap-2' : ''}`}>
        <div>
          <h1 className={`font-bold text-gray-900 ${compactLeadUi ? 'text-xl sm:text-2xl' : 'text-3xl'}`}>
            {pipelineType === 'lead' ? '💼 Quản lý Leads' : '🎯 Quản lý Deals'}
          </h1>
          {firstLoading ? (
            <div className={`flex items-center gap-1.5 text-blue-600 ${compactLeadUi ? 'text-[10px] mt-0.5' : 'text-xs mt-1'}`}>
              <span className={`inline-block rounded-full bg-blue-500 animate-pulse ${compactLeadUi ? 'h-1.5 w-1.5' : 'h-2 w-2'}`} />
              <span className="font-medium">Đang tải dữ liệu…</span>
            </div>
          ) : lastSyncAt && (
            <div className={`flex items-center gap-1.5 text-gray-500 ${compactLeadUi ? 'text-[10px] mt-0.5' : 'text-xs mt-1'}`} title="Tự cập nhật realtime qua Socket.IO + đồng bộ ngầm mỗi 15s">
              <span className={`inline-block rounded-full ${syncing ? 'bg-blue-500 animate-pulse' : 'bg-emerald-500'} ${compactLeadUi ? 'h-1.5 w-1.5' : 'h-2 w-2'}`} />
              <span>
                {syncing ? 'Đang đồng bộ…' : `Đã cập nhật ${lastSyncAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/admin/trash?tab=crm')}
            className={`border border-gray-300 text-gray-600 hover:bg-red-50 hover:text-red-600 hover:border-red-300 rounded-lg font-medium flex items-center gap-1.5 cursor-pointer transition-all duration-200 ${compactLeadUi ? 'h-8 px-2.5 text-xs' : 'h-9 px-3 text-sm'}`}
            title="Xem lead/deal đã xóa"
          >
            <Trash2 className={compactLeadUi ? 'h-3.5 w-3.5' : 'h-4 w-4'} /> Thùng rác
          </button>
          <button data-tour="add-lead" onClick={() => pipelineType === 'lead' ? setShowNewLead(true) : setShowNewDeal(true)} className={`bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center gap-2 cursor-pointer transition-all duration-200 ${compactLeadUi ? 'h-8 px-3 text-xs' : 'h-9 px-4 text-sm'}`}>
            <Plus className={compactLeadUi ? 'h-3.5 w-3.5' : 'h-4 w-4'} /> + Thêm {pipelineType === 'lead' ? 'Lead' : 'Deal'}
          </button>
        </div>
      </div>

      {/* Banner "Đang tải dữ liệu" — chỉ hiện khi đang load LẦN ĐẦU (chưa có dữ liệu).
          Tránh trắng màn khi user vừa vào dashboard mà API trả về chậm. */}
      {firstLoading && (
        <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 shadow-sm">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100">
            <span className="inline-block h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" aria-hidden />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-blue-900">Đang tải dữ liệu CRM…</p>
            <p className="text-[11px] text-blue-700/80 mt-0.5">
              Đồng bộ {pipelineType === 'lead' ? 'leads' : 'deals'}, pipeline, KPI và bộ lọc. Vui lòng chờ trong giây lát.
            </p>
          </div>
        </div>
      )}

      {/* Pill-style Tab Switcher + Pin — kích thước cố định, không nhảy cỡ theo tab đang active.
          min-width để 2 nút Lead/Deal luôn cân nhau dù số lượng (Leads/Deals) lệch nhau. */}
      <div className="flex items-center gap-2">
        <div data-tour="pipeline-tabs" className="inline-flex gap-1 bg-gray-200 rounded-full p-0.5">
          <button
            onClick={() => switchTab('lead')}
            className={`rounded-full font-medium transition-all duration-200 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs min-w-[7.5rem] ${pipelineType === 'lead' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
          >
            💼 Leads ({leads.length}) {pinnedTab === 'lead' && <Pin className="h-3.5 w-3.5 text-amber-500 rotate-45" />}
          </button>
          <button
            onClick={() => switchTab('deal')}
            className={`rounded-full font-medium transition-all duration-200 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs min-w-[7.5rem] ${pipelineType === 'deal' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
          >
            🎯 Deals ({deals.length}) {pinnedTab === 'deal' && <Pin className="h-3.5 w-3.5 text-amber-500 rotate-45" />}
          </button>
        </div>
        <button
          onClick={() => togglePinTab(pipelineType)}
          title={pinnedTab === pipelineType ? `Bỏ ghim tab ${pipelineType === 'lead' ? 'Lead' : 'Deal'}` : `Ghim tab ${pipelineType === 'lead' ? 'Lead' : 'Deal'} - mở CRM sẽ vào thẳng`}
          className={`rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 ${compactLeadUi ? 'h-8 px-2.5 text-xs' : 'h-9 px-3 text-sm'} ${pinnedTab === pipelineType ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 border border-amber-300' : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 border border-gray-200'}`}
        >
          <Pin className={`${compactLeadUi ? 'h-3.5 w-3.5' : 'h-4 w-4'} ${pinnedTab === pipelineType ? 'rotate-45' : ''}`} />
          {pinnedTab === pipelineType ? 'Đã ghim' : 'Ghim'}
        </button>
      </div>

      {/* Search & Filters */}
      <div className={compactLeadUi ? 'space-y-2' : 'space-y-3'}>
        <div className={`flex flex-wrap items-center ${compactLeadUi ? 'gap-2' : 'gap-3'}`}>
          {/* Search with instant results dropdown */}
          <div className="relative flex-1 min-w-[200px] max-w-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
              placeholder={`🔍 Tìm nhanh: tên, SĐT, mã, mô tả, người phụ trách...`}
              className={`w-full ${ctrlH} pl-9 pr-8 bg-white border border-gray-200 rounded-xl ${ctrlTxt} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm`}
            />
            {searchText && (
              <button
                onMouseDown={e => e.preventDefault()}
                onClick={() => { setSearchText(''); setSearchFocused(false); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {/* Instant search results dropdown — chỉ hiện khi ô tìm đang focus */}
            {searchFocused && searchText.trim().length >= 2 && (pipelineType === 'lead' ? leads : deals).length > 0 && (pipelineType === 'lead' ? leads : deals).length <= 10 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-80 overflow-y-auto">
                <div className="p-2 border-b bg-gray-50 rounded-t-xl">
                  <p className="text-[11px] text-gray-500 font-medium">
                    ⚡ {(pipelineType === 'lead' ? leads : deals).length} kết quả cho "{searchText}"
                  </p>
                </div>
                {(pipelineType === 'lead' ? leads : deals).map(item => (
                  <Link key={item.id} to={`/crm/leads/${item.id}`}
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 transition cursor-pointer border-b border-gray-50 last:border-0"
                    data-crm-pipeline-card={item.id}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => {
                      persistCrmPipelineUiNow();
                      markCrmPipelineCardFocus(item.id);
                      setSearchText('');
                      setSearchFocused(false);
                    }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-gray-400">{item.code}</span>
                        <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                        {item.is_new_for_current_user && (
                          <span className="shrink-0 text-[9px] font-bold uppercase text-white bg-rose-500 px-1.5 py-0.5 rounded">Mới</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {item.customer?.phone && <span className="text-[10px] text-green-600">📞 {item.customer.phone}</span>}
                        {item.customer?.full_name && <span className="text-[10px] text-gray-500">👤 {item.customer.full_name}</span>}
                        {item.assignee?.full_name && <span className="text-[10px] text-blue-500">🤝 {item.assignee.full_name}</span>}
                        {(item.production_staff?.length > 1) && (
                          <span className="text-[10px] text-indigo-600" title={(item.production_staff || []).map((u) => u.full_name).join(', ')}>
                            🏭 {item.production_staff.length} NV
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* ── TIME FILTER DROPDOWN ── */}
          <div className="relative">
            <select
              value={timePreset}
              onChange={e => handleTimePresetChange(e.target.value)}
              className={`${ctrlH} px-3 pl-9 rounded-xl ${ctrlTxt} font-medium cursor-pointer transition-all border appearance-none pr-8 ${
                timePreset
                  ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
              style={{ minWidth: compactLeadUi ? '140px' : '160px' }}
            >
              {TIME_PRESETS.map(p => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
            <Clock className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${timePreset ? 'text-purple-500' : 'text-gray-400'}`} />
          </div>

          {/* Số bản ghi pipeline (lead + deal) tải từ API */}
          <div className="relative" title="Giới hạn số lead/deal tải cho Kanban (mỗi loại). Tải tất cả = gọi API lặp theo trang tối đa 5000/trang.">
            <select
              value={kanbanLoadLimit}
              onChange={(e) => {
                const v = e.target.value;
                setKanbanLoadLimit(v);
                localStorage.setItem('crm_kanban_load_limit', v);
              }}
              className={`${ctrlH} px-3 pl-9 rounded-xl ${ctrlTxt} font-medium cursor-pointer transition-all border appearance-none pr-8 bg-white text-gray-700 border-gray-200 hover:bg-gray-50`}
              style={{ minWidth: compactLeadUi ? '142px' : '158px' }}
            >
              <option value="500">📥 Tải 500</option>
              <option value="1000">📥 Tải 1.000</option>
              <option value="2000">📥 Tải 2.000</option>
              <option value="all">📥 Tải tất cả</option>
            </select>
            <LayoutGrid className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          </div>


          {/* Toggle advanced filters */}
          <button onClick={() => setShowAdvSearch(!showAdvSearch)}
            className={`h-10 px-4 rounded-xl text-sm font-medium flex items-center gap-2 cursor-pointer transition-all border ${
              showAdvSearch || filterAssignee || filterAssigneeName || filterCompany || filterSource || filterStage || filterRegion || filterLeadType || filterReferrer || filterCustomerCompany || filterPhone
                ? 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}>
            <Filter className="h-4 w-4" />
            Bộ lọc
            {(filterAssignee || filterAssigneeName || filterCompany || filterSource || filterStage || filterRegion || filterLeadType || filterReferrer || filterCustomerCompany || filterPhone === 'no_phone' || showOrphanDealColumn) && (
              <span className="bg-blue-600 text-white text-[10px] rounded-full w-5 h-5 flex items-center justify-center font-bold">
                {[filterAssignee, filterAssigneeName, filterCompany, filterSource, filterStage, filterRegion, filterLeadType, filterReferrer, filterCustomerCompany, filterPhone === 'no_phone' ? filterPhone : ''].filter(Boolean).length}
              </span>
            )}
          </button>

          {/* Clear all filters */}
          {(searchText || filterAssignee || filterAssigneeName || filterCompany || filterSource || filterStage || filterRegion || filterLeadType || filterReferrer || filterCustomerCompany || filterPhone !== 'has_phone' || timePreset) && (
            <button onClick={() => {
              frozenUiSnapshotRef.current = null;
              deferFilterPruneRef.current = false;
              suppressSnapshotOverwriteRef.current = false;
              setSearchText('');
              setFilterAssignee('');
              setAssigneeListSearch('');
              setFilterAssigneeName('');
              setFilterCompany('');
              setFilterSource('');
              setFilterStage('');
              setFilterRegion('');
              setFilterLeadType('');
              setFilterReferrer('');
              setFilterCustomerCompany('');
              setFilterPhone('has_phone');
              handleTimePresetChange('');
              try {
                setStoredCrmFilterCompanyId('');
                localStorage.removeItem(LS_CRM_DASH_LEAD_TYPE);
              } catch {
                // ignore
              }
            }}
              className="h-10 px-4 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl text-sm font-medium flex items-center gap-1.5 cursor-pointer transition-all border border-red-200">
              <X className="h-3.5 w-3.5" /> Xóa bộ lọc
            </button>
          )}
        </div>

        {/* ── ALERT: deal/lead QUÁ HẠN — Quản lý nhìn thấy mã ngay, click để cuộn/mở chi tiết ── */}
        {overdueItems.length > 0 && (
          <div
            className="rounded-xl border border-red-300/60 shadow-sm"
            style={{
              backgroundColor: 'rgba(254, 226, 226, 0.35)',
              backdropFilter: 'blur(8px) saturate(150%)',
              WebkitBackdropFilter: 'blur(8px) saturate(150%)',
            }}
          >
            <div className="flex items-start gap-3 px-4 py-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-red-100/70 ring-1 ring-red-300/70 backdrop-blur-sm">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-red-700">
                    {overdueItems.length} {pipelineType === 'lead' ? 'lead' : 'deal'} quá hạn cần xử lý ngay
                  </span>
                  <span className="text-[11px] text-red-600/80">
                    (theo NV CRM hoặc SLA cột — đã lọc theo bộ lọc hiện tại)
                  </span>
                  <button
                    type="button"
                    onClick={() => setOverdueAlertCollapsed((v) => !v)}
                    className="ml-auto text-xs font-medium text-red-700 hover:text-red-900 underline-offset-2 hover:underline cursor-pointer"
                  >
                    {overdueAlertCollapsed ? 'Hiện danh sách' : 'Thu gọn'}
                  </button>
                </div>
                {!overdueAlertCollapsed && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {overdueItems.slice(0, 40).map((it) => {
                      const days = Math.floor(it.overdueMs / 86400000);
                      const hours = Math.floor((it.overdueMs % 86400000) / 3600000);
                      const overdueLabel = days > 0 ? `${days} ngày` : `${hours} giờ`;
                      const tip = [
                        it.title && `📌 ${it.title}`,
                        it.customerName && `👤 ${it.customerName}`,
                        it.assigneeName && `🤝 ${it.assigneeName}`,
                        `📂 ${it.stageName}`,
                        `⏱️ Quá hạn ${overdueLabel} (${it.source === 'task' ? 'NV CRM' : 'SLA cột'})`,
                      ].filter(Boolean).join('\n');
                      return (
                        <button
                          key={it.id}
                          type="button"
                          title={tip}
                          onClick={() => {
                            const el = document.querySelector(`[data-crm-pipeline-card="${it.id}"]`);
                            if (el) {
                              el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
                              el.classList.add('ring-2', 'ring-red-500', 'ring-offset-2');
                              setTimeout(() => {
                                el.classList.remove('ring-2', 'ring-red-500', 'ring-offset-2');
                              }, 2500);
                            } else {
                              persistCrmPipelineUiNow();
                              localStorage.setItem('crm_pinned_tab', pipelineType);
                              markCrmPipelineCardFocus(it.id);
                              navigate(`/crm/leads/${it.id}`);
                            }
                          }}
                          className="group inline-flex items-center gap-1.5 px-2 py-1 bg-white/60 border border-red-200/70 rounded-md text-[11px] font-mono font-semibold text-red-700 hover:bg-white/90 hover:border-red-400 transition cursor-pointer shadow-sm backdrop-blur-sm"
                        >
                          <span>{it.code}</span>
                          <span className="text-[10px] font-sans font-normal text-red-500 group-hover:text-red-700">
                            · {overdueLabel}
                          </span>
                        </button>
                      );
                    })}
                    {overdueItems.length > 40 && (
                      <span className="inline-flex items-center px-2 py-1 text-[11px] text-red-600 italic">
                        +{overdueItems.length - 40} mã khác…
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── CUSTOM DATE RANGE PICKER ── */}
        {showCustomDate && (
          <div className="flex flex-wrap items-center gap-3 bg-purple-50 border border-purple-200 rounded-xl p-3 shadow-sm">
            <span className="text-xs font-bold text-purple-600 uppercase flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" /> Khoảng thời gian:
            </span>
            <button
              type="button"
              onClick={() => setShowDateRangePicker(true)}
              className="h-9 px-3 bg-white border border-purple-200 rounded-lg text-sm hover:bg-purple-50 cursor-pointer"
              title="Chọn khoảng ngày"
            >
              {customDateFrom && customDateTo ? `${customDateFrom} → ${customDateTo}` : 'Chọn ngày bắt đầu/kết thúc'}
            </button>
            <button
              onClick={() => { handleTimePresetChange(''); }}
              className="h-9 px-3 bg-white text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg text-sm transition cursor-pointer border border-gray-200"
            >
              Hủy
            </button>
          </div>
        )}

        <DateRangePickerPopover
          open={showDateRangePicker}
          title="Phạm vi tuỳ chỉnh"
          from={customDateFrom}
          to={customDateTo}
          onChange={({ from, to }) => {
            setCustomDateFrom(from);
            setCustomDateTo(to);
            if (from && to) window.setTimeout(() => void load({ silent: true }), 0);
          }}
          onClose={() => setShowDateRangePicker(false)}
        />

        {/* ── ACTIVE TIME FILTER BADGE ── */}
        {timePreset && timePreset !== 'custom' && (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-xs font-medium border border-purple-200">
              <Clock className="h-3 w-3" />
              {timeFilterLabel}
              <button onClick={() => handleTimePresetChange('')} className="ml-1 hover:text-purple-900 cursor-pointer">
                <X className="h-3 w-3" />
              </button>
            </span>
          </div>
        )}

        {/* Advanced filters row */}
        {showAdvSearch && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-4">
            {/* Bước 1–3: Công ty → Khu vực → Nhân viên */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/90 p-3 space-y-3">
              <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                Lọc nhân viên (công ty → khu vực → NV)
              </div>
              <div className="flex flex-wrap items-end gap-3">
                {/* 1. Công ty */}
                {isAdmin && !isCompanyScopedAdmin && companies.length > 0 && (
                  <div className="flex flex-col gap-0.5 min-w-[10rem]">
                    <label className="text-[10px] text-slate-600 font-semibold">
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-600 text-white text-[9px] mr-1">1</span>
                      Công ty
                    </label>
                    <select
                      value={filterCompany}
                      onChange={(e) => {
                        setFilterCompany(e.target.value);
                        setFilterRegion('');
                        setFilterAssignee('');
                        setFilterAssigneeName('');
                      }}
                      className="h-9 w-44 px-2 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    >
                      <option value="">Tất cả công ty</option>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.short_name || c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {!isAdmin && userCompanyId && (
                  <span className="h-9 inline-flex items-center px-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 self-end">
                    <span className="font-semibold text-[10px] text-blue-900 mr-1.5">1</span>
                    🏢 Công ty của bạn
                  </span>
                )}
                {isCompanyScopedAdmin && userCompanyId && (
                  <span
                    className="h-9 inline-flex items-center px-2.5 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-900 self-end"
                    title="Admin phạm vi một công ty"
                  >
                    <span className="font-semibold text-[10px] mr-1.5">1</span>
                    🏢{' '}
                    {companies.find((c) => String(c.id) === String(userCompanyId))?.short_name ||
                      companies.find((c) => String(c.id) === String(userCompanyId))?.name ||
                      'Công ty của bạn'}
                  </span>
                )}

                {/* 2. Khu vực */}
                <div className="flex flex-col gap-0.5 min-w-[10rem]">
                  <label className="text-[10px] text-slate-600 font-semibold">
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-600 text-white text-[9px] mr-1">2</span>
                    Khu vực
                  </label>
                  <select
                    value={filterRegion}
                    onChange={(e) => {
                      setFilterRegion(e.target.value);
                      setFilterAssignee('');
                      setFilterAssigneeName('');
                    }}
                    title={
                      dashboardScopeCompanyId
                        ? 'Lọc Kanban + danh sách NV theo khu vực của công ty đã chọn'
                        : 'Lọc theo khu vực của các công ty thuộc khối CRM'
                    }
                    className="h-9 w-44 px-2 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="">Tất cả khu vực</option>
                    <option value="__none__">Chưa gán khu vực (NV & pipeline)</option>
                    {companyRegions.map((reg) => {
                      const coShort = !dashboardScopeCompanyId
                        ? (companies.find((c) => String(c.id) === String(reg.company_id))?.short_name
                          || companies.find((c) => String(c.id) === String(reg.company_id))?.name
                          || '')
                        : '';
                      return (
                        <option key={reg.id} value={reg.id}>
                          {reg.is_active === false ? '· ' : ''}
                          {reg.name}
                          {reg.code ? ` (${reg.code})` : ''}
                          {coShort ? ` — ${coShort}` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* 3. NV */}
                <div className="flex flex-wrap items-end gap-2 border-t border-slate-200/80 pt-3 mt-1 w-full sm:border-t-0 sm:pt-0 sm:mt-0 sm:w-auto sm:border-l sm:pl-3 sm:ml-0">
                  <span className="text-[10px] font-bold text-slate-500 uppercase self-center mr-1 hidden sm:inline">3</span>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[10px] text-slate-600 font-semibold">Tìm NV</label>
                    <input
                      type="search"
                      value={assigneeListSearch}
                      onChange={(e) => setAssigneeListSearch(e.target.value)}
                      placeholder="Tên, email…"
                      className="h-9 w-36 px-2 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5 min-w-[11rem] flex-1 sm:flex-initial sm:min-w-[12rem]">
                    <label className="text-[10px] text-slate-600 font-semibold">Chọn NV</label>
                    <select
                      value={filterAssignee}
                      onChange={(e) => setFilterAssignee(e.target.value)}
                      disabled={!seesAllCrmDeals && pipelineType === 'deal'}
                      title={
                        !seesAllCrmDeals && pipelineType === 'deal'
                          ? 'Deal: chỉ hiển thị deal do bạn phụ trách.'
                          : 'Chỉ hiện NV thuộc công ty & khu vực đã chọn (khi có)'
                      }
                      className={`h-9 w-full min-w-0 px-2 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        !seesAllCrmDeals && pipelineType === 'deal' ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
                      }`}
                    >
                      <option value="">Tất cả nhân viên</option>
                      {companyDepts.length > 0 ? (
                        companyDepts.map((dept) => {
                          const deptUsers = employeeOptionsForSelect.filter((u) => u.department_id === dept.id);
                          if (!deptUsers.length) return null;
                          return (
                            <optgroup key={dept.id} label={`📁 ${dept.name}`}>
                              {deptUsers.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.full_name}
                                  {u.position ? ` (${u.position})` : ''}
                                </option>
                              ))}
                            </optgroup>
                          );
                        })
                      ) : (
                        employeeOptionsForSelect.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.full_name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                  <div className="flex flex-col gap-0.5 min-w-[10rem]">
                    <label className="text-[10px] text-slate-600 font-semibold">Tên trên pipeline</label>
                    <input
                      type="search"
                      value={filterAssigneeName}
                      onChange={(e) => setFilterAssigneeName(e.target.value)}
                      disabled={!seesAllCrmDeals && pipelineType === 'deal'}
                      placeholder="Tên người phụ trách…"
                      title={
                        !seesAllCrmDeals && pipelineType === 'deal'
                          ? 'Deal: lọc NV đã cố định theo tài khoản của bạn.'
                          : 'Lọc nhanh theo tên hiển thị trên thẻ (client)'
                      }
                      className={`h-9 w-40 px-2 bg-amber-50/90 border border-amber-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-amber-400 ${
                        !seesAllCrmDeals && pipelineType === 'deal' ? 'opacity-70 cursor-not-allowed' : ''
                      }`}
                    />
                  </div>
                  {companyEmployees.length > 0 && (
                    <span
                      className="text-[10px] text-emerald-800 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100 self-end whitespace-nowrap"
                      title="Số NV sau bước công ty + khu vực (trước ô tìm kiếm)"
                    >
                      {employeeFilterListByRegion.length} NV
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Nguồn · Giai đoạn · Loại · SĐT */}
            <div className="flex flex-wrap items-end gap-2">
              {smartSources.length > 0 && (
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] text-gray-500 font-medium">Nguồn</label>
                  <select value={filterSource} onChange={e => setFilterSource(e.target.value)}
                    className="h-8 w-40 px-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer">
                    <option value="">Tất cả nguồn</option>
                    {smartSources.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
              )}

              {/* Stage */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-gray-500 font-medium">Giai đoạn</label>
                <select value={filterStage} onChange={e => setFilterStage(e.target.value)}
                  className="h-8 w-40 px-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer">
                  <option value="">Tất cả giai đoạn</option>
                  {(pipelineType === 'lead' ? stagesLead : stagesDeal).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              {/* Lead/Deal type */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-gray-500 font-medium">Phân loại</label>
                <div className="flex items-center gap-1">
                  <select
                    value={filterLeadType}
                    onChange={e => setFilterLeadType(e.target.value)}
                    disabled={leadTypes.length === 0}
                    className={`h-8 w-36 px-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer ${
                      leadTypes.length === 0 ? 'opacity-70 cursor-not-allowed' : ''
                    }`}
                    title={leadTypes.length === 0 ? 'Chưa cấu hình phân loại' : 'Lọc theo phân loại'}
                  >
                    <option value="">{leadTypes.length === 0 ? 'Chưa cấu hình' : 'Tất cả loại'}</option>
                    {leadTypes
                      .filter((t) => t.applies_to === 'both' || t.applies_to === pipelineType)
                      .map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  {leadTypes.length === 0 && (
                    <button
                      onClick={() => navigate('/crm/pipeline-settings')}
                      className="h-8 px-2 rounded-lg text-[10px] font-medium bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 cursor-pointer whitespace-nowrap"
                      title="Mở Pipeline Settings để thêm phân loại"
                    >
                      Cấu hình
                    </button>
                  )}
                </div>
              </div>

              {/* Người giới thiệu */}
              {dashboardScopeCompanyId && (
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] text-gray-500 font-medium">Người giới thiệu</label>
                  <select
                    value={filterReferrer}
                    onChange={(e) => setFilterReferrer(e.target.value)}
                    disabled={referrerFilterOptions.length === 0}
                    className={`h-8 w-44 px-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer ${
                      referrerFilterOptions.length === 0 ? 'opacity-70 cursor-not-allowed' : ''
                    }`}
                    title={
                      referrerFilterOptions.length === 0
                        ? 'Chưa có người giới thiệu — gán khi tạo Lead/Deal'
                        : 'Lọc theo người giới thiệu của công ty đang xem'
                    }
                  >
                    <option value="">{referrerFilterOptions.length === 0 ? 'Chưa có' : 'Tất cả'}</option>
                    <option value="__none__">— Chưa gán —</option>
                    {referrerFilterOptions.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Tên công ty khách hàng */}
              {dashboardScopeCompanyId && (
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] text-gray-500 font-medium">Công ty KH</label>
                  <select
                    value={filterCustomerCompany}
                    onChange={(e) => setFilterCustomerCompany(e.target.value)}
                    disabled={customerCompanyFilterOptions.length === 0}
                    className={`h-8 w-44 px-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer ${
                      customerCompanyFilterOptions.length === 0 ? 'opacity-70 cursor-not-allowed' : ''
                    }`}
                    title={
                      customerCompanyFilterOptions.length === 0
                        ? 'Chưa có tên công ty khách hàng — nhập khi tạo Lead/Deal'
                        : 'Lọc theo tên công ty khách hàng (ô «Tên công ty khách hàng» khi tạo)'
                    }
                  >
                    <option value="">{customerCompanyFilterOptions.length === 0 ? 'Chưa có' : 'Tất cả'}</option>
                    <option value="__none__">— Chưa nhập —</option>
                    {customerCompanyFilterOptions.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Phone filter */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-gray-500 font-medium">SĐT</label>
                <select value={filterPhone} onChange={e => setFilterPhone(e.target.value)}
                  className={`h-8 w-32 px-2 border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer ${
                    filterPhone === 'has_phone' ? 'bg-green-50 border-green-300 text-green-700' :
                    filterPhone === 'no_phone'  ? 'bg-red-50 border-red-300 text-red-700' : 'bg-gray-50 border-gray-200'
                  }`}>
                  <option value="has_phone">✅ Có SĐT</option>
                  <option value="no_phone">❌ Chưa có SĐT</option>
                </select>
              </div>

              {pipelineType === 'deal' && (
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] text-gray-500 font-medium">Cột phụ</label>
                  <label
                    className={`inline-flex items-center gap-1.5 h-8 px-2.5 border rounded-lg text-xs cursor-pointer transition-colors ${
                      showOrphanDealColumn
                        ? 'bg-slate-100 border-slate-400 text-slate-800'
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                    title="Hiện cột ảo ở cuối Kanban — chứa deal không thuộc cột nào của pipeline (stage trống / cột bị xoá / có project nhưng thiếu badge SX/VC)."
                  >
                    <input
                      type="checkbox"
                      checked={showOrphanDealColumn}
                      onChange={(e) => setShowOrphanDealColumn(e.target.checked)}
                      className="h-3.5 w-3.5 cursor-pointer accent-slate-600"
                    />
                    <span>🗂️ Hiện deal chưa có giai đoạn</span>
                  </label>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* KPI */}
      <div
        data-tour="crm-kpis"
        className={`overflow-visible grid items-stretch gap-2 ${
          pipelineType === 'deal'
            ? 'grid-cols-1 min-[520px]:grid-cols-2 xl:grid-cols-7'
            : 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4'
        }`}
      >
        {pipelineType === 'lead' ? (
          <>
            <KPICard
              compact
              icon={<Target className="h-3 w-3" />}
              iconBgColor="bg-blue-100"
              iconColor="text-blue-600"
              label="Tổng Lead"
              value={leadKpiTotalCount}
              sublabel={kpiUsesClientOnlyFilters ? 'Sau lọc (trên bản ghi đã tải)' : undefined}
              trend={null}
            />
            <KPICard
              compact
              icon={<Zap className="h-3 w-3" />}
              iconBgColor="bg-emerald-100"
              iconColor="text-emerald-600"
              label="Đang xử lý"
              value={leadActiveCount}
              trend={null}
            />
            <KPICard
              compact
              icon={<Percent className="h-3 w-3" />}
              iconBgColor="bg-amber-100"
              iconColor="text-amber-600"
              label="Tỷ lệ chuyển đổi"
              value={`${kpis.conversion_rate || 0}%`}
              sublabel="Lead → Deal (toàn phạm vi)"
              trend={null}
            />
            <KPICard
              compact
              icon={<BarChart3 className="h-3 w-3" />}
              iconBgColor="bg-indigo-100"
              iconColor="text-indigo-600"
              label="Điểm KPI (tháng)"
              value={formatKpiLedgerNet(kpiLedgerMonthNetSumVisible)}
              sublabel={kpis.kpi_ledger_period_start ? `Sổ cái · ${String(kpis.kpi_ledger_period_start).slice(0, 7)}` : 'Sổ cái CRM'}
              trend={null}
              hint={kpiLedgerMonthCardHint}
            />
          </>
        ) : (
          <>
            <DealCountSummaryKpiCard
              className="min-[520px]:col-span-2 xl:col-span-2"
              total={dealKpisFromFilters.total_deals}
              negotiating={dealNegotiatingCount}
              won={dealKpisFromFilters.won_deals}
              filterNote={kpiUsesClientOnlyFilters ? 'Sau lọc (trên bản ghi đã tải)' : undefined}
            />
            <KPICard
              compact
              icon={<DollarSign className="h-3 w-3" />}
              iconBgColor="bg-sky-100"
              iconColor="text-sky-700"
              label="Giá trị dự kiến"
              value={formatVND(dealKpisFromFilters.pipeline_estimated_value)}
              trend={null}
            />
            <KPICard
              compact
              icon={<TrendingUp className="h-3 w-3" />}
              iconBgColor="bg-violet-100"
              iconColor="text-violet-700"
              label="Giá trị kỳ vọng"
              value={formatVND(dealKpisFromFilters.expected_value)}
              hint={explicitExpectedKvStages
                ? 'Tổng KV các cột đã tick «Giá trị kỳ vọng» trong Pipeline Settings'
                : 'Tổng (giá trị dự kiến × xác suất %) — mặc định loại cột Thắng/Thua/Hoàn thành DT'}
              trend={null}
            />
            <KPICard
              compact
              icon={<DollarSign className="h-3 w-3" />}
              iconBgColor="bg-amber-100"
              iconColor="text-amber-600"
              label="Doanh thu thắng"
              value={formatVND(dealKpisFromFilters.won_value)}
              trend={null}
            />
            <KPICard
              compact
              icon={<Receipt className="h-3 w-3" />}
              iconBgColor="bg-teal-100"
              iconColor="text-teal-700"
              label="DT hoàn thành"
              value={formatVND(dealKpisFromFilters.completed_revenue_value)}
              trend={null}
            />
            <KPICard
              compact
              icon={<BarChart3 className="h-3 w-3" />}
              iconBgColor="bg-indigo-100"
              iconColor="text-indigo-600"
              label="Điểm KPI (tháng)"
              value={formatKpiLedgerNet(kpiLedgerMonthNetSumVisible)}
              trend={null}
              hint={kpiLedgerMonthCardHint}
            />
          </>
        )}
      </div>

      {/* View Mode Toggle */}
      <div className={`flex items-center gap-1 flex-wrap ${compactLeadUi ? 'mb-2' : 'mb-3'}`}>
        <AssignedTasksToolbarButton compact={compactLeadUi} />
        {[
          { id: 'kanban', icon: LayoutGrid, label: 'Kanban' },
          { id: 'list', icon: List, label: 'Danh sách' },
          { id: 'planner', icon: Users, label: 'Planner' },
          { id: 'deadline', icon: Clock, label: 'Deadline' },
          { id: 'comments', icon: MessageSquare, label: 'Bình luận' },
          { id: 'calendar', icon: Calendar, label: 'Lịch' },
        ].map(v => (
          <button key={v.id} onClick={() => setViewMode(v.id)}
            className={`h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors ${viewMode === v.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            <v.icon className="h-3.5 w-3.5" />{v.label}
          </button>
        ))}
      </div>

      {showNoPipelineMainViews ? (
        <div
          data-tour="crm-no-pipeline"
          className="rounded-xl border border-amber-200 bg-amber-50/90 px-6 py-10 sm:px-10 sm:py-12 text-center shadow-sm"
        >
          <Building2 className="h-12 w-12 mx-auto text-amber-600 mb-4 opacity-90" />
          <h2 className="text-lg sm:text-xl font-bold text-amber-950 mb-2">Chưa có pipeline CRM cho công ty này</h2>
          {scopedCompanyName && (
            <p className="text-sm font-medium text-amber-900/85 mb-3">{scopedCompanyName}</p>
          )}
          <p className="text-sm text-amber-900/90 max-w-lg mx-auto mb-6 leading-relaxed">
            Khi chưa tạo pipeline (và các giai đoạn Lead/Deal), Kanban không có cột nên nhìn như trống. Hãy cấu hình pipeline trước, sau đó tải lại trang.
          </p>
          {isAdmin ? (
            <Link
              to="/crm/pipeline-settings"
              className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 shadow-sm transition-colors"
            >
              Mở cài đặt pipeline
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <p className="text-sm text-amber-900/85 max-w-md mx-auto">
              Vui lòng liên hệ quản trị viên để tạo pipeline và các giai đoạn cho công ty bạn.
            </p>
          )}
        </div>
      ) : (
        <>
          {(viewMode === 'kanban' || viewMode === 'deadline') && manualMergeIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm">
              <GitMerge className="h-4 w-4 text-amber-700 shrink-0" />
              <span className="text-amber-900">
                Đã chọn <strong>{manualMergeIds.length}</strong> {pipelineType === 'deal' ? 'deal' : 'lead'}
                {manualMergeIds.length < 2 && <span className="text-amber-700/80"> — chọn ít nhất 2 để gộp</span>}
              </span>
              {manualMergeIds.length >= 2 && (
                <button
                  type="button"
                  onClick={() => setManualMergeModalOpen(true)}
                  className="h-9 px-4 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 cursor-pointer shadow-sm"
                >
                  Gộp đã chọn
                </button>
              )}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setBulkAssignModalOpen(true)}
                  className="h-9 px-4 rounded-lg bg-white border border-amber-400 text-amber-900 text-xs font-bold hover:bg-amber-100 cursor-pointer shadow-sm flex items-center gap-1.5"
                >
                  <UserCheck className="h-3.5 w-3.5 shrink-0" />
                  Gán phụ trách
                </button>
              )}
              <button
                type="button"
                onClick={bulkDeleteSelected}
                disabled={bulkDeleting}
                className="h-9 px-4 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 disabled:opacity-50 cursor-pointer shadow-sm flex items-center gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5 shrink-0" />
                {bulkDeleting ? 'Đang xóa…' : `Xóa (${manualMergeIds.length})`}
              </button>
              <button
                type="button"
                onClick={() => setManualMergeIds([])}
                className="h-9 px-3 rounded-lg border border-amber-300 text-amber-800 text-xs font-medium hover:bg-amber-100 cursor-pointer"
              >
                Bỏ chọn
              </button>
              <span className="hidden sm:block w-px h-6 shrink-0 bg-amber-300/70 self-center" aria-hidden />
              <span className="text-xs font-semibold text-amber-900 shrink-0 whitespace-nowrap">Chuyển sang giai đoạn:</span>
              <select
                value={bulkStageTarget}
                onChange={(e) => setBulkStageTarget(e.target.value)}
                disabled={bulkMoving}
                className="h-9 min-w-[min(100%,12rem)] sm:min-w-[200px] max-w-full px-3 rounded-lg border border-amber-300 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-60"
              >
                <option value="">— Chọn cột đích —</option>
                {(pipelineType === 'lead' ? stagesLead : stagesDeal).map((s) => (
                  <option key={s.id} value={s.id}>
                    {(s.icon ? `${s.icon} ` : '')}{s.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!bulkStageTarget || bulkMoving}
                onClick={() => bulkMoveSelectedToStage(bulkStageTarget)}
                className="h-9 px-4 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm"
              >
                {bulkMoving ? 'Đang chuyển…' : 'Chuyển'}
              </button>
            </div>
          )}

          {/* Kanban View */}
          {viewMode === 'kanban' && (
          <div data-tour="kanban-pipeline" className="rounded-xl overflow-hidden">
            <KanbanView
              pipeline={kanbanPipeline}
              onMoveStage={handleMoveStage}
              pipelineType={pipelineType}
              mergeSelectedIds={manualMergeIds}
              onToggleMergeSelect={toggleManualMergeSelect}
              onToggleSelectAllInColumn={toggleSelectAllInColumn}
              compact
              showCompanyOnCard={isAdmin && !isCompanyScopedAdmin && !dashboardScopeCompanyId}
              leadTypes={leadTypes}
              kpiLedgerPeriodStart={kpis?.kpi_ledger_period_start || null}
              onOpenKanbanComment={(it) => {
                setKanbanCommentBody('');
                setKanbanCommentItem(it);
              }}
              onTogglePin={togglePinFlag}
              onToggleInteracted={toggleInteractedFlag}
              onOpenDeadline={openDeadlineFromCard}
              remeasureToken={showAdvSearch ? 1 : 0}
              explicitExpectedKv={explicitExpectedKvStages}
            />
            {/* Chú thích màu sắc thẻ Kanban — chỉ hiện sau khi load xong dữ liệu */}
            {!firstLoading && (
              <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-t border-gray-100 bg-white text-[11px] text-gray-600">
                <span className="font-semibold text-gray-500 mr-1">Chú thích badge hạn:</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-3.5 px-1.5 rounded border border-emerald-200 bg-emerald-50 text-[9px] text-emerald-700" aria-hidden>Còn</span>
                  Còn hạn
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-3.5 px-1.5 rounded border border-orange-500 bg-orange-500 text-[9px] text-white" aria-hidden>Sắp</span>
                  Sắp tới hạn
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-3.5 px-1.5 rounded border border-red-600 bg-red-600 text-[9px] text-white" aria-hidden>Quá</span>
                  Quá hạn
                </span>
              </div>
            )}
            {/* Nút Tải thêm 1000 */}
            {kanbanLoadLimit !== 'all' && (() => {
              const offset = pipelineType === 'lead' ? loadMoreState.leadOffset : loadMoreState.dealOffset;
              const total = pipelineType === 'lead' ? loadMoreState.leadTotal : loadMoreState.dealTotal;
              const loaded = pipelineType === 'lead' ? allLeads.length : allDeals.length;
              const hasMore = total === null || offset < total;
              if (!hasMore) return null;
              return (
                <div className="flex items-center justify-center gap-3 py-3 border-t border-gray-100 bg-gray-50/50 rounded-b-xl">
                  <span className="text-xs text-gray-500">
                    Đã tải <span className="font-semibold text-gray-700">{loaded.toLocaleString()}</span>
                    {total !== null && <> / <span className="font-semibold text-indigo-600">{total.toLocaleString()}</span> lead</>}
                  </span>
                  <button
                    onClick={handleLoadMore}
                    disabled={loadMoreState.loading}
                    className="flex items-center gap-1.5 h-8 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg disabled:opacity-60 transition-colors"
                  >
                    {loadMoreState.loading
                      ? <><span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" /> Đang tải...</>
                      : <>📥 Tải thêm 1.000 {pipelineType === 'lead' ? 'lead' : 'deal'}</>
                    }
                  </button>
                  <button
                    onClick={() => { setKanbanLoadLimit('all'); localStorage.setItem('crm_kanban_load_limit', 'all'); }}
                    className="h-8 px-3 border border-gray-200 bg-white text-xs text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Tải tất cả
                  </button>
                </div>
              );
            })()}
          </div>
          )}

          {/* List View */}
          {viewMode === 'list' && (
            <ListView
              pipeline={currentPipeline}
              pipelineType={pipelineType}
              calculateDays={calculateDays}
              pipelineId={listViewPipelineId}
              companyId={dashboardScopeCompanyId}
              companyName={listViewCompanyName}
              companyPipelineStages={listViewCompanyPipelineStages}
            />
          )}

          {/* Planner View */}
          {viewMode === 'planner' && (
            <PlannerView
              pipeline={currentPipeline}
              pipelineType={pipelineType}
            />
          )}

          {/* Deadline View */}
          {viewMode === 'deadline' && (
            <DeadlineView
              pipeline={currentPipeline}
              pipelineType={pipelineType}
              deadlineConfig={deadlineConfig}
              onOpenSettings={isAdmin ? () => navigate('/crm/deadline-settings') : null}
              mergeSelectedIds={manualMergeIds}
              onToggleMergeSelect={toggleManualMergeSelect}
              onToggleSelectAllInColumn={toggleSelectAllInColumn}
            />
          )}

          {/* Comments View */}
          {viewMode === 'comments' && (
            <CommentsView
              pipeline={currentPipeline}
              pipelineType={pipelineType}
              commentsIndex={commentsIndex}
              onRefreshIndex={() => {
                const ids = currentPipeline.flatMap(s => s.items.map(i => i.id));
                if (!ids.length) return;
                api.get(`/crm/lead-comments/index?lead_ids=${ids.join(',')}`)
                  .then(r => setCommentsIndex(r.data || {})).catch(() => {});
              }}
            />
          )}
        </>
      )}
      {viewMode === 'calendar' && (
        <div className="bg-white rounded-xl border p-12 text-center text-gray-500">
          <Calendar className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Chức năng Lịch đang được phát triển</p>
        </div>
      )}

      {showNewLead && (
        <NewLeadModal
          onClose={() => setShowNewLead(false)}
          onSuccess={() => refreshAfterNewLeadOrDeal('lead')}
          leadTypes={leadTypes}
          companies={companies}
          type={pipelineType}
          defaultCompanyId={isAdmin ? (filterCompany || user?.company_id || '') : (user?.company_id ? String(user.company_id) : '')}
          currentUser={user}
        />
      )}
      {showNewDeal && (
        <NewDealModal
          onClose={() => setShowNewDeal(false)}
          onSuccess={() => refreshAfterNewLeadOrDeal('deal')}
          leadTypes={leadTypes}
          companies={companies}
          defaultCompanyId={isAdmin ? (filterCompany || user?.company_id || '') : (user?.company_id ? String(user.company_id) : '')}
          currentUser={user}
        />
      )}

      {kanbanCommentItem && (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center bg-black/50 p-4 pt-[10vh]"
          onClick={() => { if (!kanbanCommentPosting) { setKanbanCommentItem(null); setKanbanCommentBody(''); } }}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-xl border border-[#e4e6eb] bg-[#f0f2f5] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#e4e6eb] bg-white px-3 py-2.5">
              <p className="text-[15px] font-bold text-[#050505]">Bình luận nhanh</p>
              <button
                type="button"
                disabled={kanbanCommentPosting}
                onClick={() => { setKanbanCommentItem(null); setKanbanCommentBody(''); }}
                className="rounded-full p-1.5 text-[#65676b] hover:bg-[#f0f2f5] cursor-pointer disabled:opacity-50"
                aria-label="Đóng"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="border-b border-[#e4e6eb] bg-white px-3 py-3">
              <div className="flex gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e4e6eb] text-[14px] font-bold text-[#65676b]">
                  {(kanbanCommentItem.title || kanbanCommentItem.code || '?').trim().charAt(0).toUpperCase() || '?'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-[#050505]">{kanbanCommentItem.title}</p>
                  <p className="text-xs text-[#65676b]">
                    {kanbanCommentItem.code}
                    {pipelineType === 'deal' ? ' · Deal' : ' · Lead'}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white">
              <CrmCommentMentionComposer
                user={user}
                members={kanbanCommentMembers}
                value={kanbanCommentBody}
                onChange={(e) => setKanbanCommentBody(e.target.value)}
                onSubmit={submitKanbanQuickComment}
                posting={kanbanCommentPosting}
                placeholder="Viết bình luận… (@ để nhắc thành viên)"
                autoFocus
              />
            </div>
            <p className="px-3 py-2 text-center text-[11px] text-[#65676b]">Ctrl+Enter để gửi nhanh</p>
          </div>
        </div>
      )}

      {/* Modal chọn người phụ trách khi kéo Lead sang cột Thắng */}
      {wonAssignModal && (() => {
        const wonLead = allLeads.find(l => l.id === wonAssignLeadId);
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => { if (!wonAssigning) { setWonAssignModal(false); setWonAssignError(''); } }}>
            <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-1">
                <span className="text-2xl">🏆</span>
                <h3 className="text-base font-bold text-gray-900">Chuyển sang Deal</h3>
              </div>

              {/* Thông tin lead */}
              {wonLead && (
                <div className="bg-gray-50 rounded-xl px-3 py-2 mb-4 mt-2">
                  <p className="text-xs font-semibold text-gray-500 mb-0.5">Lead:</p>
                  <p className="text-sm font-medium text-gray-900 truncate">{wonLead.title}</p>
                  {wonLead.customer?.full_name && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      👤 {wonLead.customer.full_name}
                      {wonLead.customer.phone && <span className="ml-2 text-green-600">📞 {wonLead.customer.phone}</span>}
                      {!wonLead.customer.phone && <span className="ml-2 text-amber-500">⚠️ Chưa có SĐT</span>}
                    </p>
                  )}
                  {!wonLead.customer_id && (
                    <p className="text-xs text-red-500 mt-0.5 font-medium">⛔ Chưa liên kết khách hàng — cần vào chi tiết Lead để thêm trước</p>
                  )}
                </div>
              )}

              <div className="mb-3">
                <label className="text-xs font-semibold text-gray-700 mb-1.5 block">
                  📍 Khu vực <span className="text-red-500">*</span>
                </label>
                <select
                  value={wonAssignRegion}
                  onChange={(e) => { setWonAssignRegion(e.target.value); setWonAssignError(''); }}
                  disabled={!wonLead?.company_id || wonAssignRegionsLoading || wonAssignRegions.length === 0}
                  className="w-full h-10 px-3 border border-gray-200 rounded-xl text-sm bg-white disabled:bg-gray-50 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                >
                  <option value="">
                    {!wonLead?.company_id
                      ? '— Lead chưa có công ty —'
                      : wonAssignRegionsLoading
                        ? 'Đang tải khu vực…'
                        : wonAssignRegions.length === 0
                          ? '— Công ty chưa có khu vực —'
                          : '— Chọn khu vực —'}
                  </option>
                  {wonAssignRegions.map((reg) => (
                    <option key={reg.id} value={reg.id}>{reg.name}</option>
                  ))}
                </select>
                {!wonLead?.company_id && (
                  <p className="text-[10px] text-amber-500 mt-1">⚠️ Lead chưa có công ty — vào chi tiết Lead để gán công ty trước</p>
                )}
                {wonLead?.company_id && !wonAssignRegionsLoading && wonAssignRegions.length === 0 && (
                  <p className="text-[10px] text-amber-500 mt-1">⚠️ Công ty chưa có khu vực — vào CRM/Khu vực để thêm trước</p>
                )}
              </div>

              <div className="mb-4">
                <label className="text-xs font-semibold text-gray-700 mb-1.5 block">👤 Người phụ trách deal</label>
                <EmployeePicker
                  companyId={wonLead?.company_id}
                  value={wonAssignUser}
                  onChange={(userId) => { setWonAssignUser(userId || ''); setWonAssignError(''); }}
                  placeholder="Tìm và chọn nhân viên..."
                  size="md"
                />
                {!wonLead?.company_id && (
                  <p className="text-[10px] text-amber-500 mt-1">⚠️ Lead chưa có công ty — hiển thị toàn bộ nhân viên</p>
                )}
              </div>

              {/* Lỗi inline */}
              {wonAssignError && (
                <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  ⛔ {wonAssignError}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => { setWonAssignModal(false); setWonAssignError(''); }}
                  disabled={wonAssigning}
                  className="flex-1 h-10 border rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 cursor-pointer disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  onClick={handleWonAssignConvert}
                  disabled={wonAssigning || !wonAssignUser || !wonAssignRegion || !wonLead?.customer_id}
                  className="flex-1 h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {wonAssigning ? (
                    <><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> Đang xử lý...</>
                  ) : (
                    <>✅ Xác nhận & Chuyển Deal</>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {dealWonSxExistsCtx && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4"
          onClick={() => setDealWonSxExistsCtx(null)}
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="h-6 w-6 text-teal-600" />
              <h3 className="text-lg font-bold text-gray-900">Đã có dự án Sản xuất</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">{dealWonSxExistsCtx.message}</p>
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                className="flex-1 h-10 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50"
                onClick={() => setDealWonSxExistsCtx(null)}
              >
                Hủy
              </button>
              {dealWonSxExistsCtx.deal?.project_id && (
                <button
                  type="button"
                  className="flex-1 h-10 border border-teal-200 text-teal-700 rounded-xl text-sm font-semibold hover:bg-teal-50"
                  onClick={() => {
                    const pid = dealWonSxExistsCtx.deal.project_id;
                    setDealWonSxExistsCtx(null);
                    navigate(`/sx/projects/${pid}`);
                  }}
                >
                  Xem Sản xuất
                </button>
              )}
              <button
                type="button"
                className="flex-1 h-10 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold"
                onClick={() => confirmDealWonSxExistsOnlyStage()}
              >
                Cập nhật Thắng
              </button>
            </div>
          </div>
        </div>
      )}

      {dealWonProductionCtx && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4"
          onClick={() => {
            setDealWonProductionCtx(null);
            setDealWonProductionError('');
            setDealWonProductionWorkshopTypeId('');
            setDealWonProductionWorkshopTypes([]);
          }}
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="h-6 w-6 text-teal-600" />
              <h3 className="text-lg font-bold text-gray-900">Chuyển Deal sang Sản xuất</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Deal <span className="font-mono text-teal-700">{dealWonProductionCtx.deal?.code}</span> chuyển sang <strong>Thắng</strong>.
              Chọn công ty và phân loại Sản xuất (bắt buộc) để tạo dự án xưởng đúng pipeline.
            </p>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Công ty Sản xuất <span className="text-red-500">*</span></label>
            <select
              value={dealWonProductionCompanyId}
              onChange={(e) => {
                setDealWonProductionCompanyId(e.target.value);
                setDealWonProductionWorkshopTypeId('');
                setDealWonProductionError('');
              }}
              className="w-full h-11 px-3 border border-gray-200 rounded-xl text-sm bg-white mb-3"
            >
              <option value="">— Chọn công ty —</option>
              {productionCompaniesForSx.map((c) => (
                <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
              ))}
            </select>

            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Phân loại sản xuất <span className="text-red-500">*</span>
            </label>
            <select
              value={dealWonProductionWorkshopTypeId}
              onChange={(e) => { setDealWonProductionWorkshopTypeId(e.target.value); setDealWonProductionError(''); }}
              disabled={!dealWonProductionCompanyId || dealWonProductionWorkshopLoading}
              className="w-full h-11 px-3 border border-gray-200 rounded-xl text-sm bg-white mb-2 disabled:bg-gray-100 disabled:text-gray-500"
            >
              <option value="">
                {!dealWonProductionCompanyId
                  ? '— Chọn công ty trước —'
                  : dealWonProductionWorkshopLoading
                    ? 'Đang tải...'
                    : dealWonProductionWorkshopTypes.length === 0
                      ? '— Công ty chưa có phân loại —'
                      : '— Chọn phân loại —'}
              </option>
              {dealWonProductionWorkshopTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {dealWonProductionCompanyId
              && !dealWonProductionWorkshopLoading
              && dealWonProductionWorkshopTypes.length === 0 && (
              <p className="text-[11px] text-amber-600 mb-2">
                ⚠️ Công ty này chưa có phân loại — vào Cài đặt → Pipeline Sản xuất để tạo phân loại trước.
              </p>
            )}
            {dealWonProductionError && (
              <p className="text-xs text-red-600 mb-3">{dealWonProductionError}</p>
            )}
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                className="flex-1 h-10 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50"
                onClick={() => {
                  setDealWonProductionCtx(null);
                  setDealWonProductionError('');
                  setDealWonProductionWorkshopTypeId('');
                  setDealWonProductionWorkshopTypes([]);
                }}
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={!dealWonProductionCompanyId || !dealWonProductionWorkshopTypeId}
                className="flex-1 h-10 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => confirmDealWonProduction()}
              >
                Tiếp tục
              </button>
            </div>
          </div>
        </div>
      )}

      {dealAutoCreatePick && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4"
          onClick={() => {
            setDealAutoCreatePick(null);
            setDealAutoCreatePickError('');
            setDealAutoCreateWorkshopTypeId('');
            setDealAutoCreateWorkshopTypes([]);
          }}
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="h-6 w-6 text-amber-600" />
              <h3 className="text-lg font-bold text-gray-900">Tạo dự án — chọn công ty + phân loại SX</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Deal đã ở trạng thái Thắng nhưng chưa có dự án. Chọn công ty và phân loại Sản xuất (bắt buộc).
            </p>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Công ty Sản xuất <span className="text-red-500">*</span></label>
            <select
              value={dealAutoCreateCompanyId}
              onChange={async (e) => {
                const newCid = e.target.value;
                setDealAutoCreateCompanyId(newCid);
                setDealAutoCreateWorkshopTypeId('');
                setDealAutoCreatePickError('');
                if (!newCid) {
                  setDealAutoCreateWorkshopTypes([]);
                  return;
                }
                setDealAutoCreateWorkshopLoading(true);
                try {
                  const { data } = await api.get('/workshop/project-types', {
                    params: { company_id: newCid, module: 'production' },
                  });
                  const list = Array.isArray(data) ? data : [];
                  setDealAutoCreateWorkshopTypes(list);
                  if (list.length === 1) setDealAutoCreateWorkshopTypeId(String(list[0].id));
                } catch {
                  setDealAutoCreateWorkshopTypes([]);
                } finally {
                  setDealAutoCreateWorkshopLoading(false);
                }
              }}
              className="w-full h-11 px-3 border border-gray-200 rounded-xl text-sm bg-white mb-3"
            >
              <option value="">— Chọn công ty —</option>
              {productionCompaniesForSx.map((c) => (
                <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
              ))}
            </select>

            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Phân loại sản xuất <span className="text-red-500">*</span>
            </label>
            <select
              value={dealAutoCreateWorkshopTypeId}
              onChange={(e) => { setDealAutoCreateWorkshopTypeId(e.target.value); setDealAutoCreatePickError(''); }}
              disabled={!dealAutoCreateCompanyId || dealAutoCreateWorkshopLoading}
              className="w-full h-11 px-3 border border-gray-200 rounded-xl text-sm bg-white mb-2 disabled:bg-gray-100 disabled:text-gray-500"
            >
              <option value="">
                {!dealAutoCreateCompanyId
                  ? '— Chọn công ty trước —'
                  : dealAutoCreateWorkshopLoading
                    ? 'Đang tải...'
                    : dealAutoCreateWorkshopTypes.length === 0
                      ? '— Công ty chưa có phân loại —'
                      : '— Chọn phân loại —'}
              </option>
              {dealAutoCreateWorkshopTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {dealAutoCreateCompanyId
              && !dealAutoCreateWorkshopLoading
              && dealAutoCreateWorkshopTypes.length === 0 && (
              <p className="text-[11px] text-amber-600 mb-2">
                ⚠️ Công ty này chưa có phân loại — tạo phân loại tại Cài đặt → Pipeline Sản xuất trước.
              </p>
            )}
            {dealAutoCreatePickError && (
              <p className="text-xs text-red-600 mb-3">{dealAutoCreatePickError}</p>
            )}
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                className="flex-1 h-10 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50"
                onClick={() => {
                  setDealAutoCreatePick(null);
                  setDealAutoCreatePickError('');
                  setDealAutoCreateWorkshopTypeId('');
                  setDealAutoCreateWorkshopTypes([]);
                }}
              >
                Đóng
              </button>
              <button
                type="button"
                disabled={!dealAutoCreateCompanyId || !dealAutoCreateWorkshopTypeId}
                className="flex-1 h-10 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => submitDealAutoCreateCompanyPick()}
              >
                Tạo dự án
              </button>
            </div>
          </div>
        </div>
      )}

      <DealStageEventModal
        open={!!dealKanbanEventCtx}
        onClose={() => {
          if (!dealKanbanEventBusy) setDealKanbanEventCtx(null);
        }}
        deal={dealKanbanEventCtx?.deal}
        targetStageName={dealKanbanEventCtx?.targetStage?.name}
        onConfirm={confirmDealKanbanEvent}
        onMoveWithoutEvent={skipDealKanbanEvent}
        submitting={dealKanbanEventBusy}
      />

      <CrmDeadlineModal
        open={!!deadlineCtx}
        title={deadlineCtx?.mode === 'edit_only' ? 'Deadline thẻ' : 'Đặt deadline khi chuyển cột'}
        subtitle={
          deadlineCtx?.mode === 'edit_only'
            ? 'Mọi thay đổi đều được ghi vào lịch sử trong chi tiết lead/deal.'
            : 'Chọn hạn xử lý cho thẻ ở cột mới. Mọi thay đổi đều được ghi vào lịch sử.'
        }
        stageName={deadlineCtx?.mode === 'stage_move' ? deadlineCtx?.targetStage?.name : ''}
        initialDeadline={deadlineCtx?.card?.kanban_deadline_at || null}
        currentDeadline={deadlineCtx?.card?.kanban_deadline_at || null}
        mandatory={deadlineCtx?.mode === 'stage_move'}
        requireReason={deadlineCtx?.mode === 'edit_only' && !!deadlineCtx?.card?.kanban_deadline_at}
        allowClear={deadlineCtx?.mode === 'edit_only' && !!deadlineCtx?.card?.kanban_deadline_at}
        submitting={deadlineBusy}
        onClose={() => { if (!deadlineBusy) setDeadlineCtx(null); }}
        onConfirm={confirmDeadlineMove}
      />

      <BlockingTasksAlertModal
        open={!!blockingModal}
        onClose={() => setBlockingModal(null)}
        leadId={blockingModal?.leadId}
        currentStageName={blockingModal?.currentStageName}
        targetStageName={blockingModal?.targetStageName}
        remainingTasks={blockingModal?.remainingTasks || []}
        onChanged={() => load({ silent: true })}
        onAllCleared={() => {
          const bm = blockingModal;
          setBlockingModal(null);
          // Hết nhiệm vụ chặn → chạy lại luồng chuyển cột (hộp deadline chỉ khi cột bật requires_deadline).
          if (bm?.leadId && bm?.targetStageId) {
            handleMoveStage(bm.leadId, bm.targetStageId);
          }
        }}
        onGoToTasks={() => {
          if (blockingModal?.leadId) {
            window.open(`/crm/leads/${blockingModal.leadId}?tab=tasks`, '_blank');
          }
        }}
      />

      <BulkAssignLeadsModal
        open={bulkAssignModalOpen}
        onClose={() => setBulkAssignModalOpen(false)}
        ids={manualMergeIds}
        pipelineType={pipelineType}
        users={users}
        onDone={() => {
          setBulkAssignModalOpen(false);
          load({ silent: true });
        }}
      />
      <ManualMergeLeadsModal
        open={manualMergeModalOpen}
        onClose={() => setManualMergeModalOpen(false)}
        ids={manualMergeIds}
        itemsById={itemsByIdForMerge}
        pipelineType={pipelineType}
        onMerged={() => {
          setManualMergeModalOpen(false);
          setManualMergeIds([]);
          load({ silent: true });
        }}
      />

      {bulkDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !bulkDeleting && setBulkDeleteModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-1">
              Xóa {manualMergeIds.length} {pipelineType === 'deal' ? 'deal' : 'lead'} đã chọn
            </h3>
            <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg p-2.5 mb-4">
              Thao tác xóa sẽ xóa luôn dữ liệu liên quan (tài liệu / hoạt động / dự án liên kết nếu có). Bạn có thể phục hồi từ Thùng rác.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Lý do xóa</label>
              <textarea
                value={bulkDeleteReason}
                onChange={(e) => setBulkDeleteReason(e.target.value)}
                placeholder="Nhập lý do xóa (không bắt buộc)…"
                className="w-full h-20 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400 resize-none"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={bulkDeleting}
                onClick={() => setBulkDeleteModalOpen(false)}
                className="h-9 px-4 bg-gray-100 rounded-lg text-sm font-medium hover:bg-gray-200 cursor-pointer disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={bulkDeleting}
                onClick={confirmBulkDelete}
                className="h-9 px-4 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {bulkDeleting ? 'Đang xóa…' : 'Xác nhận xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Tổng Deal + Đang đàm phán + Thắng — một ô lớn, 3 cột đều nhau (font đồng cỡ với các KPICard khác). */
function DealCountSummaryKpiCard({ total, negotiating, won, filterNote, className = '' }) {
  const items = [
    { label: 'Tổng Deal', value: total, numClass: 'text-cyan-700' },
    { label: 'Đàm phán', value: negotiating, numClass: 'text-blue-700' },
    { label: 'Thắng', value: won, numClass: 'text-emerald-700' },
  ];
  return (
    <div
      className={`h-full min-w-0 flex flex-col rounded-lg border border-gray-200 bg-white shadow-sm px-2 py-2 ${className}`}
    >
      {filterNote ? (
        <p className="text-[9px] text-amber-800/90 leading-tight mb-1 text-center shrink-0 truncate" title={filterNote}>{filterNote}</p>
      ) : null}
      <div className="flex-1 grid grid-cols-3 divide-x divide-gray-200 items-center">
        {items.map((it) => (
          <div
            key={it.label}
            className="flex flex-col items-center justify-center text-center min-w-0 px-1"
          >
            <p className="text-[9px] font-semibold text-gray-500 uppercase tracking-wide leading-tight truncate max-w-full" title={it.label}>
              {it.label}
            </p>
            <p className={`mt-0.5 text-base md:text-lg font-bold tabular-nums leading-tight ${it.numClass}`}>
              {Number(it.value ?? 0).toLocaleString('vi-VN')}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// KPI — layout ngang, kích thước ~một nửa bản trước (Lead + Deal)
function KPICard({ icon, iconBgColor, iconColor, label, value, sublabel, trend, compact, hint }) {
  const displayValue = typeof value === 'number' ? value.toLocaleString('vi-VN') : value;

  return (
    <div
      tabIndex={hint ? 0 : undefined}
      className={`group relative h-full min-w-0 flex flex-col items-center justify-center text-center rounded-lg border border-gray-200 bg-white shadow-sm outline-none transition-shadow duration-200 hover:shadow-md focus-visible:ring-2 focus-visible:ring-blue-400 ${
        hint ? 'cursor-help' : ''
      } ${compact ? 'gap-1 px-2 py-2' : 'gap-1.5 px-2 py-2.5'}`}
    >
      <div className={`shrink-0 rounded-md ${iconBgColor} ${iconColor} p-1`}>
        {icon}
      </div>
      <div className="min-w-0 w-full flex flex-col items-center justify-center gap-0.5">
        <p
          className={`text-gray-500 font-semibold uppercase tracking-wide leading-tight max-w-full ${
            compact ? 'text-[9px]' : 'text-[10px] md:text-[11px] leading-snug'
          }`}
          title={label}
        >
          {label}
        </p>
        <p
          className={`font-bold tabular-nums leading-snug ${
            compact ? 'text-sm' : 'text-sm md:text-base'
          }`}
          style={{ color: '#000000' }}
        >
          {displayValue}
        </p>
        {sublabel && (
          <p className="text-[8px] text-amber-700/90 leading-tight truncate max-w-full" title={sublabel}>
            {sublabel}
          </p>
        )}
        {trend != null && trend !== '' && (
          <p className={`text-emerald-600 leading-snug ${compact ? 'text-[9px]' : 'text-[10px]'}`}>↑ {trend}%</p>
        )}
      </div>
      {hint && (
        <div className="absolute left-0 right-0 top-full z-[70] hidden pt-1 group-hover:block group-focus-within:block">
          <div className="pointer-events-auto max-h-[min(70vh,24rem)] w-[min(calc(100vw-1.5rem),22rem)] overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 p-2.5 text-[11px] leading-snug text-white shadow-xl">
            {hint}
          </div>
        </div>
      )}
    </div>
  );
}

/** Gán NV phụ trách hàng loạt — dùng cùng ô chọn Kanban với gộp thủ công */
function BulkAssignLeadsModal({ open, onClose, ids, pipelineType, users, onDone }) {
  const [assignUserId, setAssignUserId] = useState('');
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setAssignUserId('');
      setAssigneeSearch('');
    }
  }, [open, ids]);

  const idList = useMemo(() => [...new Set((ids || []).filter(Boolean))], [ids]);
  const activeUsers = useMemo(
    () => (users || []).filter((u) => u && u.is_active !== false && u.id),
    [users]
  );

  const filteredBase = useMemo(() => {
    const q = (assigneeSearch || '').trim().toLowerCase();
    if (!q) return activeUsers;
    return activeUsers.filter((u) => {
      const name = (u.full_name || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      const pos = (u.position || '').toLowerCase();
      return name.includes(q) || email.includes(q) || pos.includes(q);
    });
  }, [activeUsers, assigneeSearch]);

  const pinSelected = (list, selectedId) => {
    const sel = selectedId ? activeUsers.find((u) => String(u.id) === String(selectedId)) : null;
    if (sel && !list.some((u) => String(u.id) === String(selectedId))) return [sel, ...list];
    return list;
  };

  const filteredUsers = useMemo(
    () => pinSelected(filteredBase, assignUserId),
    [filteredBase, activeUsers, assignUserId]
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!idList.length) return;
    if (!assignUserId) {
      alert('Chọn người phụ trách');
      return;
    }
    setSaving(true);
    try {
      const body = { ids: idList, assigned_to: assignUserId };
      await api.post('/crm/leads/bulk-assign', body);
      onDone();
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Gán thất bại');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const kind = pipelineType === 'deal' ? 'deal' : 'lead';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-amber-600" />
              Gán phụ trách hàng loạt
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Áp dụng cho <strong>{idList.length}</strong> {kind} đang chọn trên Kanban.
            </p>
            <p className="text-xs text-gray-600 mt-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 leading-relaxed">
              Mỗi thẻ chỉ có <strong>một người phụ trách</strong> (áp dụng cho cả Lead và Deal). Gán sẽ cập nhật trên toàn bộ thẻ đã chọn.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 cursor-pointer" aria-label="Đóng">
            <X className="h-5 w-5" />
          </button>
        </div>

        {idList.length === 0 ? (
          <p className="text-sm text-amber-700">Chưa có thẻ nào được chọn.</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-800 mb-1.5">Tìm nhân viên</label>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <input
                  type="search"
                  value={assigneeSearch}
                  onChange={(ev) => setAssigneeSearch(ev.target.value)}
                  placeholder="Gõ tên, email, chức danh…"
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-800 mb-1">Người phụ trách</label>
                <select
                  value={assignUserId}
                  onChange={(ev) => setAssignUserId(ev.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent cursor-pointer"
                >
                  <option value="">— Chọn —</option>
                  {filteredUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name || u.email || u.id}{u.position ? ` — ${u.position}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              {assigneeSearch.trim() && filteredBase.length === 0 && !assignUserId && (
                <p className="text-xs text-amber-700 mt-1.5">
                  {`Không có nhân viên khớp "${assigneeSearch.trim()}".`}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 justify-end pt-2">
              <button type="button" onClick={onClose} className="h-10 px-4 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50 cursor-pointer">
                Hủy
              </button>
              <button
                type="submit"
                disabled={saving || !assignUserId}
                className="h-10 px-5 rounded-lg bg-amber-600 text-white text-sm font-bold hover:bg-amber-700 disabled:opacity-50 cursor-pointer"
              >
                {saving ? 'Đang lưu…' : 'Xác nhận gán'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/** Gộp thủ công 2+ lead/deal đã chọn trên Kanban (API merge-selected: gộp KH + tài liệu) */
function ManualMergeLeadsModal({ open, onClose, ids, itemsById, pipelineType, onMerged }) {
  const sortedIds = useMemo(() => {
    const v = [...new Set(ids || [])].filter((id) => itemsById[id]);
    v.sort((a, b) => String(itemsById[a]?.code || '').localeCompare(String(itemsById[b]?.code || '')));
    return v;
  }, [ids, itemsById]);

  const [keepId, setKeepId] = useState('');
  const [titleMode, setTitleMode] = useState('keep'); // keep | pick | custom
  const [titlePickId, setTitlePickId] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [docByLead, setDocByLead] = useState({});
  const [submitting, setSubmitting] = useState(false);
  /** true: gộp KH + chuyển tài liệu/nhiệm vụ/… sang bản giữ; false: chỉ giữ dữ liệu của bản được chọn */
  const [includeSecondaryData, setIncludeSecondaryData] = useState(true);

  useEffect(() => {
    if (!open || sortedIds.length < 2) return;
    const first = sortedIds[0];
    setKeepId(first);
    setTitleMode('keep');
    setTitlePickId(first);
    setCustomTitle('');
    setIncludeSecondaryData(true);
    const init = {};
    sortedIds.forEach((id) => {
      init[id] = { loading: true, list: [], error: null };
    });
    setDocByLead(init);
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        sortedIds.map(async (id) => {
          try {
            const res = await api.get(`/crm/leads/${id}/documents`);
            const raw = res.data;
            const list = Array.isArray(raw) ? raw : (raw?.data && Array.isArray(raw.data) ? raw.data : []);
            return { id, list, error: null };
          } catch (err) {
            return {
              id,
              list: [],
              error: err.response?.data?.error || err.message || 'Lỗi tải',
            };
          }
        })
      );
      if (cancelled) return;
      setDocByLead((prev) => {
        const next = { ...prev };
        results.forEach(({ id, list, error }) => {
          next[id] = { loading: false, list: list || [], error };
        });
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [open, sortedIds]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (sortedIds.length < 2 || !keepId) return;
    const delete_ids = sortedIds.filter((id) => String(id) !== String(keepId));
    if (!delete_ids.length) return;

    let title;
    if (titleMode === 'pick') {
      title = (itemsById[titlePickId]?.title || '').trim();
      if (!title) {
        alert('Chọn bản ghi để lấy tiêu đề');
        return;
      }
    } else if (titleMode === 'custom') {
      title = customTitle.trim();
      if (!title) {
        alert('Nhập tiêu đề mới');
        return;
      }
    }

    const body = { keep_id: keepId, delete_ids, include_secondary_data: includeSecondaryData };
    if (titleMode !== 'keep' && title) body.title = title;

    setSubmitting(true);
    try {
      await api.post('/crm/leads/merge-selected', body);
      onMerged();
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Gộp thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const labelType = pipelineType === 'deal' ? 'Deal' : 'Lead';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <GitMerge className="h-5 w-5 text-amber-600" />
              Gộp {labelType} đã chọn
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Chọn bản ghi giữ lại, xem khách hàng &amp; tài liệu từng bên, rồi chọn cách gộp dữ liệu và tiêu đề.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 cursor-pointer" aria-label="Đóng">
            <X className="h-5 w-5" />
          </button>
        </div>

        {sortedIds.length < 2 ? (
          <p className="text-sm text-amber-700">Không đủ bản ghi hợp lệ để gộp (cần ít nhất 2).</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              {sortedIds.map((id) => {
                const item = itemsById[id];
                const docState = docByLead[id] || { loading: true, list: [], error: null };
                const cust = item?.customer;
                return (
                  <div
                    key={id}
                    className={`rounded-xl border p-4 ${String(keepId) === String(id) ? 'border-amber-400 bg-amber-50/50 ring-1 ring-amber-200' : 'border-gray-200'}`}
                  >
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="merge-keep"
                        checked={String(keepId) === String(id)}
                        onChange={() => setKeepId(id)}
                        className="mt-1 h-4 w-4 text-amber-600 border-gray-300"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-blue-600">{item?.code}</p>
                        <p className="text-sm font-medium text-gray-900 truncate">{item?.title}</p>
                        <p className="text-xs text-gray-500 mt-2 font-medium">Khách hàng</p>
                        {cust ? (
                          <ul className="text-xs text-gray-600 mt-1 space-y-0.5">
                            {cust.full_name && <li>👤 {cust.full_name}</li>}
                            {cust.phone && <li>📞 {cust.phone}</li>}
                            {cust.email && <li>✉️ {cust.email}</li>}
                          </ul>
                        ) : (
                          <p className="text-xs text-gray-400">Chưa gắn khách</p>
                        )}
                        <p className="text-xs text-gray-500 mt-3 font-medium">Tài liệu ({docState.loading ? '…' : docState.list.length})</p>
                        {docState.error && (
                          <p className="text-xs text-red-600 mt-1">{docState.error}</p>
                        )}
                        {!docState.loading && !docState.error && docState.list.length === 0 && (
                          <p className="text-xs text-gray-400 mt-1">Không có tệp</p>
                        )}
                        {!docState.loading && docState.list.length > 0 && (
                          <ul className="text-xs text-gray-600 mt-1 max-h-28 overflow-y-auto space-y-0.5">
                            {docState.list.slice(0, 12).map((d) => (
                              <li key={d.id} className="truncate">{d.file_name || d.name || d.title || 'Tệp'}</li>
                            ))}
                            {docState.list.length > 12 && (
                              <li className="text-gray-400">+{docState.list.length - 12} tệp khác…</li>
                            )}
                          </ul>
                        )}
                      </div>
                    </label>
                  </div>
                );
              })}
            </div>

            <div className="rounded-xl border border-gray-200 p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-800">Dữ liệu &amp; tài liệu</p>
              <div className="space-y-3">
                <label className="flex items-start gap-3 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="merge-data-mode"
                    checked={includeSecondaryData}
                    onChange={() => setIncludeSecondaryData(true)}
                    className="mt-0.5 h-4 w-4 text-amber-600"
                  />
                  <span>
                    <span className="font-medium text-gray-900">Gộp từ cả hai bản ghi</span>
                    <span className="block text-gray-600 text-xs mt-0.5">
                      Gộp thông tin khách hàng; chuyển tài liệu, nhiệm vụ CRM, hoạt động, báo giá, đơn hàng, hóa đơn, Facebook… sang bản được giữ. Giá trị ước tính: nếu còn báo giá (nháp/đã gửi/chấp nhận/đã chuyển đơn) thì lấy tổng báo giá; không thì cộng giá trị ước tính các bản gộp (tránh nhân đôi khi EV đã trùng với báo giá).
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-3 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="merge-data-mode"
                    checked={!includeSecondaryData}
                    onChange={() => setIncludeSecondaryData(false)}
                    className="mt-0.5 h-4 w-4 text-amber-600"
                  />
                  <span>
                    <span className="font-medium text-gray-900">Chỉ giữ bản được chọn</span>
                    <span className="block text-gray-600 text-xs mt-0.5">
                      Không gộp khách hàng; không chuyển tài liệu hay dữ liệu từ bản kia. Các bản bị gộp (xóa) sẽ mất tài liệu, nhiệm vụ, báo giá, đơn hàng… gắn với chúng (theo quy tắc xóa trong hệ thống).
                    </span>
                  </span>
                </label>
                {!includeSecondaryData && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Cảnh báo: tùy chọn này có thể xóa vĩnh viễn dữ liệu riêng của các thẻ bị loại bỏ. Chỉ dùng khi chắc chắn không cần giữ.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-800">Tiêu đề sau khi gộp</p>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="merge-title"
                    checked={titleMode === 'keep'}
                    onChange={() => setTitleMode('keep')}
                    className="h-4 w-4 text-amber-600"
                  />
                  Giữ tiêu đề của bản ghi được chọn giữ
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="merge-title"
                    checked={titleMode === 'pick'}
                    onChange={() => setTitleMode('pick')}
                    className="h-4 w-4 text-amber-600"
                  />
                  Dùng tiêu đề từ
                  <select
                    value={titlePickId}
                    onChange={(ev) => { setTitlePickId(ev.target.value); setTitleMode('pick'); }}
                    className="border border-gray-300 rounded-lg px-2 py-1 text-sm max-w-[200px]"
                  >
                    {sortedIds.map((id) => (
                      <option key={id} value={id}>{itemsById[id]?.code} — {(itemsById[id]?.title || '').slice(0, 40)}</option>
                    ))}
                  </select>
                </label>
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="merge-title"
                    checked={titleMode === 'custom'}
                    onChange={() => setTitleMode('custom')}
                    className="h-4 w-4 text-amber-600 mt-0.5"
                  />
                  <span className="flex-1">
                    Tùy chỉnh
                    <input
                      type="text"
                      value={customTitle}
                      onChange={(ev) => { setCustomTitle(ev.target.value); setTitleMode('custom'); }}
                      placeholder="Nhập tiêu đề mới"
                      className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </span>
                </label>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 justify-end pt-2">
              <button type="button" onClick={onClose} className="h-10 px-4 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50 cursor-pointer">
                Hủy
              </button>
              <button
                type="submit"
                disabled={submitting || sortedIds.length < 2}
                className="h-10 px-5 rounded-lg bg-amber-600 text-white text-sm font-bold hover:bg-amber-700 disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'Đang gộp…' : 'Xác nhận gộp'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function resolveLeadTypeOnCard(item, leadTypes) {
  const joined = String(item?.lead_type?.name || '').trim();
  if (joined) {
    return { name: joined, color: item.lead_type?.color || null };
  }
  const id = item?.lead_type_id;
  if (!id || !Array.isArray(leadTypes)) return null;
  const hit = leadTypes.find((t) => String(t.id) === String(id));
  if (!hit?.name) return null;
  return { name: String(hit.name).trim(), color: hit.color || null };
}

// Kanban Stage Card - MISA Style (responsive scroll)

function KanbanStageCard({
  stage,
  items,
  onMoveStage,
  pipelineType,
  mergeSelectedIds,
  onToggleMergeSelect,
  onToggleSelectAllInColumn,
  compact,
  showCompanyOnCard,
  leadTypes,
  kpiLedgerPeriodStart,
  onOpenKanbanComment,
  onTogglePin,
  onToggleInteracted,
  onOpenDeadline,
  explicitExpectedKv,
}) {
  const [isOverColumn, setIsOverColumn] = useState(false);
  const containerRef = useRef(null);

  const stageColor = stage.color || '#e5e7eb';
  const columnItemIds = (items || []).map((i) => i.id);
  const columnStagesCtx = [stage];
  const columnRawValue = (items || []).reduce((sum, item) => sum + (Number(item.estimated_value) || 0), 0);
  const showColumnExpectedKv = pipelineType === 'deal' && (!explicitExpectedKv || !!stage.counts_as_expected_revenue);
  const columnExpectedValue = showColumnExpectedKv
    ? (items || []).reduce((sum, item) => (
      dealCountsTowardExpectedValue(item, columnStagesCtx) ? sum + dealWeightedValue(item, columnStagesCtx) : sum
    ), 0)
    : 0;
  const allInColumnSelected =
    columnItemIds.length > 0 &&
    columnItemIds.every((id) => (mergeSelectedIds || []).some((x) => String(x) === String(id)));

  const isVirtualColumn = !!stage?.__virtual;

  const handleColumnDragOver = (e) => {
    if (isVirtualColumn) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsOverColumn(true);
  };

  const handleColumnDragLeave = (e) => {
    if (e.target === e.currentTarget) {
      setIsOverColumn(false);
    }
  };

  const handleColumnDrop = (e) => {
    if (isVirtualColumn) return;
    e.preventDefault();
    setIsOverColumn(false);
    const leadId = e.dataTransfer.getData('leadId');
    if (leadId) {
      onMoveStage(leadId, stage.id);
    }
  };

  return (
    <div
      onDragOver={handleColumnDragOver}
      onDragLeave={handleColumnDragLeave}
      onDrop={handleColumnDrop}
      className={`flex flex-col flex-shrink-0 rounded-lg transition-all duration-200 ${
        compact ? 'w-[15rem] max-[380px]:w-[13.5rem]' : 'w-[17rem] max-[420px]:w-[15rem]'
      } ${isOverColumn ? 'ring-2 ring-blue-500 ring-dashed' : ''}`}
    >
      {/* Sticky header: thanh màu + tên cột — luôn dính trên cùng khi kéo Kanban */}
      <div className="sticky top-0 z-20 overflow-hidden rounded-t-lg">
        <div
          className="h-1.5 w-full"
          style={{ backgroundColor: stageColor }}
        />
        <div className={`bg-white border border-gray-200 border-t-0 transition-all ${
          compact ? 'p-2.5' : 'p-4'
        } ${isOverColumn ? 'bg-blue-50' : ''}`}>
        <div className={`flex items-start justify-between gap-2 ${compact ? 'mb-1' : 'mb-2'}`}>
          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={compact ? 'text-base shrink-0' : 'text-lg shrink-0'}>{stage.icon || '📌'}</span>
              <h3 className={`font-semibold truncate ${compact ? 'text-sm' : ''}`} style={{ color: '#000000' }}>{stage.name}</h3>
            </div>
            {String(stage.description || '').trim() !== '' && (
              <p
                className={`text-gray-500 leading-snug pl-0.5 ${compact ? 'text-[10px] line-clamp-2' : 'text-[11px] line-clamp-3'}`}
                title={String(stage.description).trim()}
              >
                {String(stage.description).trim()}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
            {columnItemIds.length > 0 && onToggleSelectAllInColumn && (
              <button
                type="button"
                onClick={() => onToggleSelectAllInColumn(columnItemIds)}
                aria-label={allInColumnSelected ? 'Bỏ chọn mọi lead/deal trong cột này' : 'Chọn tất cả trong cột'}
                className={`inline-flex items-center justify-center rounded-lg border transition-colors ${
                  compact ? 'h-6 w-6' : 'h-7 w-7'
                } ${
                  allInColumnSelected
                    ? 'border-amber-300 bg-amber-50 text-amber-600 hover:bg-amber-100'
                    : 'border-gray-200 bg-white text-gray-500 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-600'
                }`}
                title={allInColumnSelected ? 'Bỏ chọn mọi lead/deal trong cột này' : 'Chọn tất cả trong cột'}
              >
                {allInColumnSelected
                  ? <MinusSquare className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} strokeWidth={2.2} />
                  : <CheckSquare className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} strokeWidth={2.2} />}
              </button>
            )}
            <span className={`px-2 py-1 bg-gray-100 text-gray-700 font-bold rounded ${compact ? 'text-[10px]' : 'text-xs'}`}>
              {items.length}
            </span>
          </div>
        </div>
        <p className={compact ? 'text-[10px] text-gray-500' : 'text-xs text-gray-500'}>
          {pipelineType === 'deal' ? (
            <>
              <span>Dự kiến: {formatVND(columnRawValue)}</span>
              {showColumnExpectedKv && (
                <>
                  <span className="mx-1 text-gray-300">·</span>
                  <span className="text-violet-700 font-medium">KV: {formatVND(columnExpectedValue)}</span>
                </>
              )}
            </>
          ) : (
            <>Giá trị: {formatVND(columnRawValue)}</>
          )}
        </p>
        </div>
      </div>

      {/* Cards Container — cột tự cao theo nội dung; cuộn dọc đồng bộ ở container Kanban cha.
          flex-1 để khung cột vẫn trải dài tới đáy ngay cả khi không còn thẻ. */}
      <div
        ref={containerRef}
        className={`flex-1 border border-white/30 border-t-0 rounded-b-lg transition-all ${
          compact ? 'p-2 space-y-2' : 'p-3 space-y-3'
        } ${isOverColumn ? 'bg-blue-50/60' : ''}`}
        style={{ minHeight: compact ? '160px' : '180px' }}
      >
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <p className="text-sm flex items-center gap-1">
              {isOverColumn ? '⬇️ Thả vào đây' : '📥 Kéo lead vào đây'}
            </p>
          </div>
        ) : (
          items.map(item => (
            <KanbanCard
              key={item.id}
              item={item}
              stage={stage}
              onMoveStage={onMoveStage}
              pipelineType={pipelineType}
              mergeSelectedIds={mergeSelectedIds}
              onToggleMergeSelect={onToggleMergeSelect}
              compact={compact}
              showCompanyOnCard={showCompanyOnCard}
              leadTypes={leadTypes}
              kpiLedgerPeriodStart={kpiLedgerPeriodStart}
              onOpenKanbanComment={onOpenKanbanComment}
              onTogglePin={onTogglePin}
              onToggleInteracted={onToggleInteracted}
              onOpenDeadline={onOpenDeadline}
            />
          ))
        )}
      </div>
    </div>
  );
}

// Kanban Item Card - MISA style (redesign: header gọn, value lớn, footer phụ trách + actions)
function KanbanCard({ item, stage, onMoveStage, pipelineType, mergeSelectedIds, onToggleMergeSelect, compact, showCompanyOnCard, leadTypes, kpiLedgerPeriodStart, onOpenKanbanComment, onTogglePin, onToggleInteracted, onOpenDeadline }) {
  const navigate = useNavigate();
  const dealDragLocked = isDealCrmKanbanDragLocked(item, pipelineType);
  const openLeadDetail = () => {
    persistCrmPipelineUiNow();
    localStorage.setItem('crm_pinned_tab', pipelineType);
    markCrmPipelineCardFocus(item.id);
    navigate(`/crm/leads/${item.id}`);
  };

  const handleDragStart = (e) => {
    if (dealDragLocked) {
      e.preventDefault();
      return;
    }
    if (
      e.target.closest?.('[data-kanban-select-zone]') ||
      e.target.closest?.('[data-kanban-comment-btn]') ||
      e.target.closest?.('[data-kanban-flag-btn]')
    ) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('leadId', item.id);
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const stageColor = stage.color || '#94a3b8';
  const selectedForMerge = mergeSelectedIds && mergeSelectedIds.some((x) => String(x) === String(item.id));
  const canMergeSelect = typeof onToggleMergeSelect === 'function';

  const hideColumnDeadline = shouldHideCrmKanbanDeadlineOnCard(item, stage);
  const slaTone = getPipelineStageSlaTone(item.stage_entered_at, stage);
  const taskTone = getCrmOpenTaskDeadlineTone(item.crm_next_open_task_deadline);
  // Deadline thủ công (kanban_deadline_at) ưu tiên cao nhất cho «còn/quá hạn».
  const manualDeadlineTone = getCrmOpenTaskDeadlineTone(item.kanban_deadline_at);
  const scheduleResolved = resolveCrmLeadKanbanScheduleSource(item, stage);
  // Ưu tiên: deadline thẻ → hạn NV CRM mở → SLA cột.
  const scheduleSource = manualDeadlineTone ? 'deadline' : (taskTone ? 'task' : 'sla');
  const cardToneLevel = hideColumnDeadline ? 'ok' : (manualDeadlineTone || taskTone || slaTone).level;
  const scheduleTone = hideColumnDeadline ? null : (manualDeadlineTone || taskTone || slaTone);

  // SLA badge phía bên phải giá trị tiền
  const slaBadge = (() => {
    if (hideColumnDeadline) return null;
    if (!scheduleTone?.deadlineTs || stage?.is_won || stage?.is_lost || stage?.counts_as_completed_revenue) return null;
    const isOverdue = cardToneLevel === 'overdue';
    const remainingLabel = isOverdue
      ? formatRemainingMs(Math.abs(scheduleTone.remainingMs))
      : formatRemainingMs(scheduleTone.remainingMs);
    if (!remainingLabel) return null;
    const tonePalette = getCrmDeadlineUrgencyBadgeClass(cardToneLevel);
    const sourceLabel =
      scheduleSource === 'deadline' ? 'Deadline thẻ'
      : scheduleSource === 'task' ? 'NV CRM mở'
      : 'SLA cột';
    const isUrgent = cardToneLevel === 'overdue' || cardToneLevel === 'soon';
    return (
      <span
        className={`shrink-0 inline-flex items-center gap-1 rounded-md border tabular-nums leading-none ${
          isUrgent ? 'px-2 py-1 text-[11px]' : 'px-1.5 py-0.5 text-[10px] font-semibold'
        } ${tonePalette}`}
        title={[
          `Hạn: ${new Date(scheduleTone.deadlineTs).toLocaleString('vi-VN')}`,
          `Nguồn: ${sourceLabel}`,
          isOverdue ? `Đã quá ${remainingLabel}` : `Còn ${remainingLabel}`,
        ].join('\n')}
      >
        <Clock className={isUrgent ? 'h-3.5 w-3.5' : 'h-3 w-3'} strokeWidth={2.6} />
        {isOverdue ? <>Quá {remainingLabel}</> : <>Còn {remainingLabel}</>}
      </span>
    );
  })();

  const assigneeUser = item.assignee || item.lead_owner || null;
  const leadTypeLabel = resolveLeadTypeOnCard(item, leadTypes);
  const isDealCard = pipelineType === 'deal' || item.type === 'deal';
  const dealPct = isDealCard ? dealProbabilityPercent(item, [stage]) : null;
  const dealExpectedOnCard = isDealCard && (Number(item.estimated_value) || 0) > 0
    ? dealWeightedValue(item, [stage])
    : 0;

  // Badge SX/VC (giữ logic cũ, gói thành biến)
  const sxVcBadge = (() => {
    const vcStage = item.vc_pipeline_stage;
    const sxStage = item.sx_pipeline_stage;
    const hasProject = !!item.project_id;
    const stageIsWon = item.stage?.is_won;
    const fallbackForWon = !vcStage && !sxStage && (hasProject || stageIsWon) && item.type === 'deal'
      ? { id: null, name: 'Chờ vào xưởng', color: '#0369a1', icon: '⏳', bucket_slug: 'won_pending' }
      : null;
    const activeStage = vcStage || sxStage || fallbackForWon;
    if (!activeStage) return null;
    const isVC = !!vcStage;
    const icon = activeStage?.icon
      || (isVC
        ? (activeStage?.bucket_slug === 'delivery_pending' ? '📦'
          : activeStage?.bucket_slug === 'completed' ? '✅' : '🚚')
        : (activeStage?.bucket_slug === 'won_pending' ? '⏳'
          : activeStage?.bucket_slug === 'completed' ? '✅' : '🏭'));
    const label = isVC ? 'VC' : 'SX';
    const defaultColor = isVC ? '#ea580c' : '#0369a1';
    const isPlaceholder = !vcStage && !sxStage;
    return (
      <div
        className={`flex items-center gap-1.5 rounded-md px-1.5 py-1 ${isPlaceholder ? 'border-dashed' : ''}`}
        title={isPlaceholder ? 'Chưa có giai đoạn xưởng — chờ bàn giao Sản xuất hoặc cấu hình pipeline xưởng' : (activeStage?.company?.short_name || activeStage?.company?.name || undefined)}
        style={{
          backgroundColor: activeStage.color ? `${activeStage.color}12` : (isVC ? '#fff7ed' : '#f0f9ff'),
          border: `1px ${isPlaceholder ? 'dashed' : 'solid'} ${activeStage.color ? `${activeStage.color}50` : (isVC ? '#fed7aa' : '#bae6fd')}`,
          opacity: isPlaceholder ? 0.9 : 1,
        }}
      >
        <span className="text-[11px] shrink-0">{icon}</span>
        <span className="text-[9px] font-bold uppercase tracking-wide shrink-0"
          style={{ color: activeStage.color || defaultColor }}>{label}</span>
        <span className="text-[11px] font-semibold truncate"
          style={{ color: activeStage.color || defaultColor }}>
          {activeStage.name}
          {(activeStage?.company?.short_name || activeStage?.company?.name) && (
            <span className="text-[10px] font-normal opacity-75 ml-1">
              · {activeStage.company.short_name || activeStage.company.name}
            </span>
          )}
        </span>
      </div>
    );
  })();

  // Badge lịch đặt/giao từ linked_project
  const orderDateBadge = (() => {
    const od = item.linked_project?.order_date;
    if (!od) return null;
    return (
      <div className="flex items-center gap-1.5 rounded-md border px-1.5 py-1 text-[11px] font-medium bg-slate-50 border-slate-200 text-slate-700">
        <span>🛒</span>
        <span className="truncate">Đặt: {new Date(od).toLocaleDateString('vi-VN')}</span>
      </div>
    );
  })();

  const deliveryDateBadge = (() => {
    const pd = item.linked_project?.delivery_date || item.linked_project?.production_deadline;
    if (!pd) return null;
    const isOverdue = new Date(pd) < new Date();
    const isSoon = !isOverdue && new Date(pd) < new Date(Date.now() + 3 * 86400000);
    const tone = isOverdue ? 'bg-red-50 border-red-200 text-red-700'
      : isSoon ? 'bg-amber-50 border-amber-200 text-amber-700'
      : 'bg-teal-50 border-teal-200 text-teal-700';
    return (
      <div className={`flex items-center gap-1.5 rounded-md border px-1.5 py-1 text-[11px] font-medium ${tone}`}>
        <span>🚚</span>
        <span className="truncate">
          Giao: {new Date(pd).toLocaleDateString('vi-VN')}
          {isOverdue ? ' ⚠️' : isSoon ? ' ⚡' : ''}
        </span>
      </div>
    );
  })();

  return (
    <div
      data-crm-pipeline-card={item.id}
      draggable={!dealDragLocked}
      onDragStart={handleDragStart}
      title={dealDragLocked ? 'Cột Sản xuất/Vận chuyển trên CRM — kéo về Thắng hoặc giai đoạn trước; tiến độ xưởng/VC qua badge' : undefined}
      onClick={(ev) => {
        if (
          ev.target.closest?.('[data-kanban-flag-btn]')
          || ev.target.closest?.('[data-kanban-comment-btn]')
          || ev.target.closest?.('[data-kanban-deadline-btn]')
          || ev.target.closest?.('[data-kanban-select-zone]')
        ) {
          return;
        }
        openLeadDetail();
      }}
      className={`relative overflow-hidden rounded-lg border border-gray-200 !bg-white transition-all duration-200 group/card hover:-translate-y-0.5 hover:shadow-md ${
        dealDragLocked ? 'cursor-default' : 'cursor-pointer'
      } ${selectedForMerge ? 'ring-2 ring-amber-400 ring-offset-1' : ''}`}
      style={{ borderTop: `3px solid ${stageColor}` }}
    >
      {typeof item.kpi_ledger_month_net === 'number' && !stage?.is_lost && (
        <KpiKanbanLedgerBadge
          leadId={item.id}
          net={item.kpi_ledger_month_net}
          periodStart={kpiLedgerPeriodStart}
          compact={compact}
        />
      )}

      {/* Checkbox chọn gộp/hàng loạt — góc trên trái */}
      {canMergeSelect && (
        <button
          type="button"
          data-kanban-select-zone
          title={selectedForMerge ? 'Bỏ chọn thẻ này' : 'Chọn để gộp / xóa / chuyển hàng loạt'}
          onClick={(ev) => {
            ev.stopPropagation();
            onToggleMergeSelect(item.id);
          }}
          className={`absolute top-1.5 right-1.5 z-30 flex h-5 w-5 items-center justify-center rounded border bg-white/95 shadow-sm transition-colors cursor-pointer ${
            selectedForMerge
              ? 'border-amber-500 bg-amber-100 text-amber-700'
              : 'border-slate-300 text-slate-400 opacity-0 group-hover/card:opacity-100 hover:border-amber-400 hover:text-amber-600'
          }`}
        >
          <CheckSquare className="h-3.5 w-3.5" strokeWidth={2.4} />
        </button>
      )}

      <div className={`${compact ? 'p-2.5' : 'p-3'} space-y-1.5`}>
        {/* 1. Header: mã + ngày tạo (NỔI BẬT) + cảnh báo + badge MỚI */}
        <div className="flex items-center gap-1.5 min-w-0 pr-6">
          <span className="font-mono text-[11px] font-semibold text-slate-500 truncate">{item.code}</span>
          {item.created_at && (
            <span
              className="shrink-0 inline-flex items-center gap-0.5 rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-indigo-700"
              title={`Tạo ${pipelineType === 'deal' ? 'deal' : 'lead'}: ${new Date(item.created_at).toLocaleString('vi-VN')}`}
            >
              <Calendar className="h-3 w-3" strokeWidth={2.4} />
              {formatDate(item.created_at)}
            </span>
          )}
          {!hideColumnDeadline && cardToneLevel === 'overdue' && (
            <AlertTriangle className="h-3.5 w-3.5 text-red-600 shrink-0 animate-pulse" aria-hidden />
          )}
          {!hideColumnDeadline && cardToneLevel === 'soon' && (
            <AlertTriangle className="h-3.5 w-3.5 text-orange-500 shrink-0" aria-hidden />
          )}
          {item.is_new_for_current_user && (
            <span className="ml-auto shrink-0 inline-flex items-center rounded bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white leading-none">
              Mới
            </span>
          )}
        </div>

        {/* 2. Tiêu đề */}
        <p
          title={item.title}
          className={`font-medium text-slate-800 leading-snug ${compact ? 'text-[12px] line-clamp-2' : 'text-[13px] line-clamp-2'}`}
        >
          {item.title || <span className="italic text-slate-400">(Không tiêu đề)</span>}
        </p>

        {/* 2b. Loại Lead/Deal (phân loại sản phẩm) */}
        {leadTypeLabel && (
          <span
            className="inline-flex items-center max-w-full rounded-md border px-1.5 py-0.5 text-[10px] font-semibold truncate"
            style={{
              backgroundColor: leadTypeLabel.color ? `${leadTypeLabel.color}14` : '#f5f3ff',
              borderColor: leadTypeLabel.color ? `${leadTypeLabel.color}45` : '#ddd6fe',
              color: leadTypeLabel.color || '#6d28d9',
            }}
            title={`Loại ${pipelineType === 'deal' ? 'Deal' : 'Lead'}: ${leadTypeLabel.name}`}
          >
            {leadTypeLabel.name}
          </span>
        )}

        {/* 3. Giá trị tiền (lớn, xanh) + % xác suất (deal) */}
        {(item.estimated_value > 0 || (isDealCard && dealPct != null)) && (
          <div className="flex items-center justify-between gap-2 min-w-0">
            {item.estimated_value > 0 ? (
              <p className={`font-bold tabular-nums leading-none text-emerald-600 min-w-0 truncate ${compact ? 'text-[15px]' : 'text-[16px]'}`}>
                {formatVND(item.estimated_value)}
              </p>
            ) : (
              <span className="text-[11px] text-slate-400 italic">Chưa định giá</span>
            )}
            {isDealCard && dealPct != null && (
              <span
                className="shrink-0 inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-bold tabular-nums text-violet-700"
                title={`Xác suất chốt ${dealPct}%${dealExpectedOnCard > 0 ? ` · Giá trị kỳ vọng ${formatVND(dealExpectedOnCard)}` : ''}`}
              >
                {dealPct}%
              </span>
            )}
          </div>
        )}
        {item.estimated_value <= 0 && !isDealCard && !slaBadge && (
          <span className="text-[11px] text-slate-400 italic">Chưa định giá</span>
        )}
        {isDealCard && dealExpectedOnCard > 0 && (
          <p className="text-[10px] font-semibold tabular-nums text-violet-600 leading-none">
            KV {formatVND(dealExpectedOnCard)}
          </p>
        )}
        {/* Badge hạn — full width khi quá hạn / sắp quá hạn để dễ nhìn */}
        {slaBadge && (
          <div className={`flex ${cardToneLevel === 'overdue' || cardToneLevel === 'soon' ? 'w-full' : 'justify-end'}`}>
            {slaBadge}
          </div>
        )}

        {/* 4. KH + SĐT: 2 cột (NỔI BẬT — tên KH đậm, SĐT mono lớn) */}
        {(item.customer?.full_name || item.customer?.phone) && (
          <div className="flex items-center justify-between gap-2">
            {item.customer?.full_name ? (
              <span
                className="inline-flex items-center gap-1 min-w-0 truncate text-[12px] font-semibold text-slate-800"
                title={item.customer.full_name}
              >
                <User className="h-3.5 w-3.5 shrink-0 text-blue-500" strokeWidth={2.4} />
                <span className="truncate">{item.customer.full_name}</span>
              </span>
            ) : <span />}
            {item.customer?.phone && (
              <a
                href={`tel:${item.customer.phone}`}
                onClick={(ev) => ev.stopPropagation()}
                className="shrink-0 inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-mono text-[12px] font-bold tabular-nums text-emerald-700 hover:bg-emerald-100 transition-colors"
                title={`Gọi ${item.customer.phone}`}
              >
                <Phone className="h-3 w-3" strokeWidth={2.4} />
                {item.customer.phone}
              </a>
            )}
          </div>
        )}

        {/* 5. Công ty (khi xem tất cả công ty) + Khu vực CRM */}
        {showCompanyOnCard && (item.company?.short_name || item.company?.name) && (
          <div className="text-[11px] text-slate-600">
            <span className="inline-flex items-center gap-1 min-w-0 truncate max-w-full">
              <Building2 className="h-3 w-3 shrink-0 text-indigo-500" />
              <span className="truncate font-medium text-indigo-800">
                {item.company.short_name || item.company.name}
              </span>
            </span>
          </div>
        )}
        {item.crm_region?.name && (
          <div className="text-[11px] text-slate-600">
            <span className="inline-flex items-center gap-1 min-w-0 truncate max-w-full">
              <MapPin className="h-3 w-3 shrink-0 text-rose-400" />
              <span className="truncate">{item.crm_region.name}</span>
            </span>
          </div>
        )}

        {/* 6. Hàng badge phụ: SX/VC + lịch đặt/giao (nếu có) */}
        {(sxVcBadge || orderDateBadge || deliveryDateBadge) && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {sxVcBadge}
            {orderDateBadge}
            {deliveryDateBadge}
          </div>
        )}

        {/* 6b. Deadline thẻ (kanban_deadline_at) — bấm để sửa; ẩn khi đã tick «tương tác» */}
        {!hideColumnDeadline && typeof onOpenDeadline === 'function' && item.kanban_deadline_at && (() => {
          const ts = new Date(item.kanban_deadline_at).getTime();
          if (Number.isNaN(ts)) return null;
          const { level } = getCrmDeadlineUrgencyFromIso(item.kanban_deadline_at);
          const tone = `${getCrmDeadlineUrgencyBadgeClass(level)} hover:opacity-90 cursor-pointer`;
          const urgent = level === 'overdue' || level === 'soon';
          return (
            <button
              type="button"
              data-kanban-deadline-btn
              onClick={(ev) => { ev.stopPropagation(); onOpenDeadline(item); }}
              className={`inline-flex items-center gap-1 rounded-md border transition-opacity ${urgent ? 'px-2 py-1 text-[11px]' : 'px-1.5 py-0.5 text-[10px] font-semibold'} ${tone}`}
              title={`Deadline thẻ — bấm để sửa (${new Date(item.kanban_deadline_at).toLocaleString('vi-VN')})`}
            >
              <Clock className="h-3 w-3" strokeWidth={2.4} />
              Deadline: {new Date(item.kanban_deadline_at).toLocaleDateString('vi-VN')}
            </button>
          );
        })()}

        {/* 7. Deadline kỳ vọng (expected_close_date) — ẩn khi đã tick «tương tác» */}
        {!hideColumnDeadline && item.expected_close_date && (() => {
          const { level } = getCrmDeadlineUrgencyFromIso(item.expected_close_date);
          const tone = level === 'ok'
            ? 'bg-purple-50 text-purple-700 border-purple-200 font-medium'
            : getCrmDeadlineUrgencyBadgeClass(level);
          const urgent = level === 'overdue' || level === 'soon';
          return (
            <div className={`inline-flex items-center gap-1 rounded-md border ${urgent ? 'px-2 py-1 text-[11px]' : 'px-1.5 py-0.5 text-[10px]'} ${tone}`}>
              <Calendar className="h-3 w-3" />
              Deadline: {new Date(item.expected_close_date).toLocaleDateString('vi-VN')}
            </div>
          );
        })()}

        {/* 8. Lý do thua */}
        {item.lost_reason && (
          <div className="rounded-md border border-red-100 bg-red-50 px-2 py-1">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-red-500">Lý do thua</p>
            <p className="text-[11px] text-red-700 line-clamp-2 leading-snug">{item.lost_reason}</p>
          </div>
        )}

        {/* 9. Footer: avatar + tên phụ trách (trái) + cụm actions (phải) */}
        <div className="flex items-center justify-between gap-2 pt-1.5 mt-1 border-t border-slate-100">
          <div className="flex items-center gap-1.5 min-w-0">
            {assigneeUser ? (
              <>
                <div
                  className="h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm"
                  style={{ backgroundColor: stageColor }}
                  title={`Phụ trách: ${assigneeUser.full_name}`}
                >
                  {getInitials(assigneeUser.full_name)}
                </div>
                <span className="truncate text-[11px] font-medium text-slate-700" title={assigneeUser.full_name}>
                  {assigneeUser.full_name}
                </span>
              </>
            ) : (
              <>
                <div
                  className="h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold text-slate-400 bg-slate-100 border border-dashed border-slate-300"
                  title="Chưa gán phụ trách"
                >
                  ?
                </div>
                <span className="truncate text-[11px] italic text-slate-400">Chưa gán</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!hideColumnDeadline && typeof onOpenDeadline === 'function' && (
              <button
                type="button"
                data-kanban-deadline-btn
                title={item.kanban_deadline_at ? 'Sửa deadline thẻ' : 'Đặt deadline thẻ'}
                onClick={(ev) => { ev.stopPropagation(); onOpenDeadline(item); }}
                className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors cursor-pointer ${
                  item.kanban_deadline_at
                    ? 'text-rose-600 hover:bg-rose-50'
                    : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                }`}
              >
                <Clock className="h-3.5 w-3.5" strokeWidth={2.2} />
              </button>
            )}
            {typeof onOpenKanbanComment === 'function' && (
              <button
                type="button"
                data-kanban-comment-btn
                title="Bình luận nhanh"
                onClick={(ev) => { ev.stopPropagation(); onOpenKanbanComment(item); }}
                className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
              >
                <MessageSquare className="h-3.5 w-3.5" strokeWidth={2.2} />
              </button>
            )}
            {typeof onTogglePin === 'function' && (
              <button
                type="button"
                data-kanban-flag-btn
                title={item.is_pinned ? 'Bỏ ghim thẻ' : 'Ghim thẻ lên đầu'}
                onClick={(ev) => { ev.stopPropagation(); onTogglePin(item, !item.is_pinned); }}
                className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors cursor-pointer ${
                  item.is_pinned ? 'text-amber-600 hover:bg-amber-50' : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                }`}
              >
                <Pin className={`h-3.5 w-3.5 ${item.is_pinned ? 'rotate-45 fill-amber-500' : ''}`} strokeWidth={2.2} />
              </button>
            )}
            {typeof onToggleInteracted === 'function' && (
              <button
                type="button"
                data-kanban-flag-btn
                title={item.is_interacted ? 'Bỏ tick — hiện lại deadline trên thẻ' : 'Đã tương tác — ẩn deadline cột trên thẻ (chuyển cột vẫn hỏi deadline nếu cột bật)'}
                onClick={(ev) => { ev.stopPropagation(); onToggleInteracted(item, !item.is_interacted); }}
                className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors cursor-pointer ${
                  item.is_interacted ? 'text-blue-600 hover:bg-blue-50' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'
                }`}
              >
                <CheckCircle2 className={`h-3.5 w-3.5 ${item.is_interacted ? 'fill-blue-500 text-white' : ''}`} strokeWidth={2.2} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Kanban View Container - MISA Style
function KanbanView({
  pipeline,
  onMoveStage,
  pipelineType,
  mergeSelectedIds,
  onToggleMergeSelect,
  onToggleSelectAllInColumn,
  compact,
  showCompanyOnCard,
  leadTypes,
  kpiLedgerPeriodStart,
  onOpenKanbanComment,
  onTogglePin,
  onToggleInteracted,
  onOpenDeadline,
  remeasureToken,
  explicitExpectedKv,
}) {
  const kanbanHScrollRef = useRef(null);
  const kanbanWrapRef = useRef(null);
  const pipelineDraggingRef = useRef(false);
  const scrollRafRef = useRef(0);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const [isDraggingCard, setIsDraggingCard] = useState(false);
  const [scrollMaxH, setScrollMaxH] = useState('70vh');

  // Chiều cao Kanban cố định ~3 card mỗi cột (~720px). Không phụ thuộc viewport
  // để bố cục đồng nhất trên mọi màn hình; phần còn lại scroll trong cột.
  // Trên màn rất nhỏ thì co lại = viewport - 120 để không tràn ra ngoài.
  useEffect(() => {
    const measure = () => {
      const el = kanbanHScrollRef.current;
      if (!el) return;
      const TARGET = 560;
      const maxByViewport = Math.max(320, window.innerHeight - 120);
      setScrollMaxH(`${Math.min(TARGET, maxByViewport)}px`);
    };
    const raf = requestAnimationFrame(measure);
    const t = setTimeout(measure, 120);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
      window.removeEventListener('resize', measure);
    };
  }, [remeasureToken]);

  useEffect(() => {
    const isOurCard = (e) => {
      const t = e.target;
      if (t?.closest?.('[data-kanban-comment-btn]')) return false;
      if (t?.closest?.('[data-kanban-deadline-btn]')) return false;
      return !!t?.closest?.('[data-crm-pipeline-card]');
    };

    const onDragStart = (e) => {
      if (isOurCard(e)) {
        pipelineDraggingRef.current = true;
        setIsDraggingCard(true);
      }
    };
    const onDragEnd = () => {
      pipelineDraggingRef.current = false;
      setIsDraggingCard(false);
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = 0;
      }
    };

    const EDGE_ZONE_PX = 56;
    const MIN_STEP = 5;
    const MAX_STEP = 34;

    const runScroll = () => {
      scrollRafRef.current = 0;
      if (!pipelineDraggingRef.current) return;
      const sc = kanbanHScrollRef.current;
      const wrap = kanbanWrapRef.current;
      if (!sc || !wrap) return;
      const { x } = lastPointerRef.current;
      const r = wrap.getBoundingClientRect();
      const innerLeft = r.left + EDGE_ZONE_PX;
      const innerRight = r.right - EDGE_ZONE_PX;
      let delta = 0;
      if (x < innerLeft) {
        const t = Math.min(1, (innerLeft - x) / EDGE_ZONE_PX);
        const step = MIN_STEP + t * t * (MAX_STEP - MIN_STEP);
        delta = -step;
      } else if (x > innerRight) {
        const t = Math.min(1, (x - innerRight) / EDGE_ZONE_PX);
        const step = MIN_STEP + t * t * (MAX_STEP - MIN_STEP);
        delta = step;
      }
      if (delta !== 0) {
        const maxLeft = Math.max(0, sc.scrollWidth - sc.clientWidth);
        const before = sc.scrollLeft;
        sc.scrollLeft = Math.max(0, Math.min(maxLeft, before + delta));
        const moved = sc.scrollLeft !== before;
        const inZone = x < innerLeft || x > innerRight;
        if (inZone && moved) {
          scrollRafRef.current = requestAnimationFrame(runScroll);
        }
      }
    };

    const onDragOver = (e) => {
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      if (!pipelineDraggingRef.current) return;
      e.preventDefault();
      const wrap = kanbanWrapRef.current;
      if (!wrap) return;
      const r = wrap.getBoundingClientRect();
      const innerLeft = r.left + EDGE_ZONE_PX;
      const innerRight = r.right - EDGE_ZONE_PX;
      if (e.clientX < innerLeft || e.clientX > innerRight) {
        if (!scrollRafRef.current) {
          scrollRafRef.current = requestAnimationFrame(runScroll);
        }
      }
    };

    document.addEventListener('dragstart', onDragStart, true);
    document.addEventListener('dragend', onDragEnd, true);
    document.addEventListener('dragover', onDragOver, true);
    return () => {
      document.removeEventListener('dragstart', onDragStart, true);
      document.removeEventListener('dragend', onDragEnd, true);
      document.removeEventListener('dragover', onDragOver, true);
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    };
  }, []);

  const nudge = (dir) => {
    const sc = kanbanHScrollRef.current;
    if (!sc) return;
    const w = 280;
    sc.scrollLeft = Math.max(0, Math.min(sc.scrollWidth - sc.clientWidth, sc.scrollLeft + (dir === 'right' ? w : -w)));
  };

  return (
    <div ref={kanbanWrapRef} className="relative">
      <div
        className="pointer-events-none absolute left-0 top-0 bottom-4 z-20 flex w-12 items-stretch sm:w-14"
        aria-hidden
      >
        <div
          className={`flex w-full items-center justify-center bg-gradient-to-r from-slate-200/95 via-slate-100/40 to-transparent pl-0.5 transition-opacity duration-200 ${
            isDraggingCard ? 'opacity-100' : 'opacity-40'
          }`}
        >
          <ChevronLeft
            className="h-9 w-9 text-slate-600 drop-shadow sm:h-10 sm:w-10"
            strokeWidth={2.25}
            aria-hidden
          />
        </div>
      </div>
      <div
        className="pointer-events-none absolute right-0 top-0 bottom-4 z-20 flex w-12 items-stretch sm:w-14"
        aria-hidden
      >
        <div
          className={`ml-auto flex w-full items-center justify-center bg-gradient-to-l from-slate-200/95 via-slate-100/40 to-transparent pr-0.5 transition-opacity duration-200 ${
            isDraggingCard ? 'opacity-100' : 'opacity-40'
          }`}
        >
          <ChevronRight
            className="h-9 w-9 text-slate-600 drop-shadow sm:h-10 sm:w-10"
            strokeWidth={2.25}
            aria-hidden
          />
        </div>
      </div>
      <button
        type="button"
        className={`absolute left-0 top-0 bottom-4 z-[21] w-10 border-0 bg-transparent p-0 sm:w-12 ${
          isDraggingCard ? 'pointer-events-none cursor-default' : 'cursor-pointer'
        }`}
        title="Kéo thẻ tới mép này để tự cuộn sang cột bên trái — hoặc bấm (khi không kéo) để cuộn nhanh"
        onClick={() => nudge('left')}
      />
      <button
        type="button"
        className={`absolute right-0 top-0 bottom-4 z-[21] w-10 border-0 bg-transparent p-0 sm:w-12 ${
          isDraggingCard ? 'pointer-events-none cursor-default' : 'cursor-pointer'
        }`}
        title="Kéo thẻ tới mép này để tự cuộn sang cột bên phải — hoặc bấm (khi không kéo) để cuộn nhanh"
        onClick={() => nudge('right')}
      />

      <div
        ref={kanbanHScrollRef}
        className="overflow-auto pb-4 [scrollbar-gutter:stable]"
        style={{ maxHeight: scrollMaxH }}
      >
        <div className={`flex min-w-max items-stretch ${compact ? 'gap-2' : 'gap-3'}`}>
          {pipeline.map((stage) => (
            <KanbanStageCard
              key={stage.id}
              stage={stage}
              items={stage.items}
              onMoveStage={onMoveStage}
              pipelineType={pipelineType}
              mergeSelectedIds={mergeSelectedIds}
              onToggleMergeSelect={onToggleMergeSelect}
              onToggleSelectAllInColumn={onToggleSelectAllInColumn}
              compact={compact}
              showCompanyOnCard={showCompanyOnCard}
              leadTypes={leadTypes}
              kpiLedgerPeriodStart={kpiLedgerPeriodStart}
              onOpenKanbanComment={onOpenKanbanComment}
              onTogglePin={onTogglePin}
              onToggleInteracted={onToggleInteracted}
              onOpenDeadline={onOpenDeadline}
              explicitExpectedKv={explicitExpectedKv}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// New Lead Modal - Auto create customer
function NewLeadModal({ onClose, onSuccess, leadTypes, companies, type, defaultCompanyId, currentUser }) {
  const isAdmin = isAdminLike(currentUser);
  const [formData, setFormData] = useState({
    title: '',
    customer_name: '',
    customer_phone: '',
    customer_company: '',
    source_id: '',
    company_id: defaultCompanyId || '',
    region_id: '',
    lead_type_id: '',
    referrer_name: '',
    estimated_value: 0,
    probability: 50,
    assigned_to: currentUser?.id || '',
  });
  const [saving, setSaving] = useState(false);
  const [modalSources, setModalSources] = useState([]);
  const [modalRegions, setModalRegions] = useState([]);
  const [referrers, setReferrers] = useState([]);
  const [referrerPick, setReferrerPick] = useState('');

  const visibleLeadTypes = useMemo(() => {
    const cid = String(formData.company_id || '');
    return (Array.isArray(leadTypes) ? leadTypes : [])
      .filter((t) => String(t.company_id || '') === cid)
      .filter((t) => t.applies_to === 'both' || t.applies_to === 'lead');
  }, [leadTypes, formData.company_id]);

  useEffect(() => {
    const cid = String(formData.company_id || '').trim();
    if (!cid) {
      setModalSources([]);
      return;
    }
    let cancelled = false;
    api.get('/crm/sources', { params: { company_id: cid } })
      .then((r) => {
        if (cancelled) return;
        const list = r.data?.sources || (Array.isArray(r.data) ? r.data : []);
        setModalSources(Array.isArray(list) ? list : []);
      })
      .catch(() => { if (!cancelled) setModalSources([]); });
    return () => { cancelled = true; };
  }, [formData.company_id]);

  useEffect(() => {
    const cid = String(formData.company_id || '').trim();
    if (!cid) {
      setReferrers([]);
      setReferrerPick('');
      return;
    }
    let cancelled = false;
    api.get('/crm/referrers', { params: { company_id: cid } })
      .then((r) => {
        if (cancelled) return;
        setReferrers(Array.isArray(r.data?.items) ? r.data.items : []);
      })
      .catch(() => { if (!cancelled) setReferrers([]); });
    return () => { cancelled = true; };
  }, [formData.company_id]);

  useEffect(() => {
    const cid = String(formData.company_id || '').trim();
    if (!cid) {
      setModalRegions([]);
      return;
    }
    const selectedCo = (companies || []).find((c) => String(c.id) === cid);
    const divId = selectedCo?.division_unit_id || null;
    let cancelled = false;
    const params = { company_id: cid };
    if (divId) params.division_unit_id = divId;
    api.get('/crm/company-regions', { params })
      .then((r) => {
        if (cancelled) return;
        const list = Array.isArray(r.data) ? r.data : [];
        setModalRegions(list.filter((x) => x.is_active !== false));
      })
      .catch(() => { if (!cancelled) setModalRegions([]); });
    return () => { cancelled = true; };
  }, [formData.company_id, companies]);

  useEffect(() => {
    const uidRegions = currentUser?.crm_region_ids;
    if (!Array.isArray(uidRegions) || uidRegions.length !== 1) return;
    const only = String(uidRegions[0]);
    const ok = modalRegions.some((r) => String(r.id) === only);
    if (ok && String(formData.region_id || '') !== only) {
      setFormData((prev) => ({ ...prev, region_id: only }));
    }
  }, [modalRegions, currentUser?.crm_region_ids, formData.region_id]);

  // Lock company for non-admin — ưu tiên công ty nhân viên, tránh mặc định Phúc Đạt từ bộ lọc admin/LS
  useEffect(() => {
    if (isAdmin) return;
    const cid = (currentUser?.company_id ? String(currentUser.company_id) : '') || (defaultCompanyId ? String(defaultCompanyId) : '');
    if (cid && String(formData.company_id || '') !== String(cid)) {
      setFormData((prev) => ({ ...prev, company_id: cid }));
    }
  }, [isAdmin, defaultCompanyId, currentUser?.company_id]);

  const resolvedReferrerName = useMemo(() => {
    if (!referrerPick) return '';
    if (referrerPick === '__new__') return String(formData.referrer_name || '').trim();
    const hit = referrers.find((x) => String(x.id) === String(referrerPick));
    return hit?.name?.trim() || '';
  }, [referrerPick, referrers, formData.referrer_name]);

  // Reset lead_type when company changes
  useEffect(() => {
    if (!formData.lead_type_id) return;
    const ok = visibleLeadTypes.some((t) => String(t.id) === String(formData.lead_type_id));
    if (!ok) setFormData((prev) => ({ ...prev, lead_type_id: '' }));
  }, [formData.company_id, visibleLeadTypes, formData.lead_type_id]);

  useEffect(() => {
    if (!formData.source_id) return;
    const ok = modalSources.some((s) => String(s.id) === String(formData.source_id));
    if (!ok) setFormData((prev) => ({ ...prev, source_id: '' }));
  }, [modalSources, formData.source_id]);

  useEffect(() => {
    if (!formData.region_id) return;
    const ok = modalRegions.some((r) => String(r.id) === String(formData.region_id));
    if (!ok) setFormData((prev) => ({ ...prev, region_id: '' }));
  }, [modalRegions, formData.region_id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title) return alert('Nhập tên lead');
    if (!formData.company_id) return alert('Vui lòng chọn công ty');
    if (!formData.customer_name) return alert('Nhập tên khách hàng');
    if (modalRegions.length > 0 && !formData.region_id) return alert('Chọn khu vực');

    if (!formData.customer_phone) {
      if (!confirm('⚠️ Chưa có số điện thoại khách hàng.\nBạn có thể nhập sau ở trang chi tiết Lead.\n\nTiếp tục tạo Lead?')) return;
    }

    setSaving(true);
    try {
      // 1. Create customer first
      const { data: customer } = await api.post('/customers', {
        full_name: formData.customer_name,
        phone: formData.customer_phone || null,
        company: formData.customer_company?.trim() || null,
        ...(formData.company_id ? { company_id: formData.company_id } : {}),
      });
      const customerId = customer?.id || customer?.customer?.id;

      // 2. Giai đoạn đầu pipeline đúng công ty
      const { data: stages } = await api.get('/crm/pipeline-stages', {
        params: { type: 'lead', ...(formData.company_id ? { company_id: formData.company_id } : {}) },
      });
      const firstStage = stages?.[0];

      // 3. Create lead with customer_id
      await api.post('/crm/leads', {
        title: formData.title,
        customer_id: customerId || null,
        source_id: formData.source_id || null,
        company_id: formData.company_id || null,
        region_id: formData.region_id || null,
        lead_type_id: formData.lead_type_id || null,
        assigned_to: formData.assigned_to || null,
        type: 'lead',
        stage_id: firstStage?.id,
        estimated_value: parseFloat(formData.estimated_value) || 0,
        probability: parseInt(formData.probability) || 50,
        referrer_name: resolvedReferrerName || null,
      });
      onSuccess?.();
      onClose();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi');
    }
    setSaving(false);
  };

  const companyName = companies.find((c) => String(c.id) === String(formData.company_id))?.short_name
    || companies.find((c) => String(c.id) === String(formData.company_id))?.name || '';
  const regionName = modalRegions.find((r) => String(r.id) === String(formData.region_id))?.name || '';
  const sourceName = modalSources.find((s) => String(s.id) === String(formData.source_id))?.name || '';
  const leadTypeName = visibleLeadTypes.find((t) => String(t.id) === String(formData.lead_type_id))?.name || '';
  const referrerDisplayName = resolvedReferrerName || '';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl flex overflow-hidden max-h-[92vh]">

        {/* ── LEFT: Form ── */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-gray-100">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
            <div>
              <h2 className="text-lg font-bold text-gray-900">🚀 Thêm Lead mới</h2>
              <p className="text-xs text-gray-400 mt-0.5">Điền thông tin — chi tiết bổ sung sau ở trang Lead</p>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition cursor-pointer"><X className="h-5 w-5 text-gray-400" /></button>
          </div>

          {/* Scrollable form */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <form id="lead-form" onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Tên lead <span className="text-red-500">*</span></label>
                <input type="text" required value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-transparent text-sm"
                  placeholder="VD: Tủ bếp gỗ sồi nhà anh A..." autoFocus />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">🏢 Công ty <span className="text-red-500">*</span></label>
                  {isAdmin ? (
                    <select value={formData.company_id}
                      onChange={(e) => {
                        setReferrerPick('');
                        setFormData((prev) => ({ ...prev, company_id: e.target.value, region_id: '', referrer_name: '' }));
                      }}
                      required
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-400 text-sm ${!formData.company_id ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                      <option value="">-- Chọn --</option>
                      {(companies || []).map(c => <option key={c.id} value={c.id}>{c.short_name || c.name}</option>)}
                    </select>
                  ) : (
                    <div className="px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 text-sm text-blue-800">{companyName || 'Công ty của bạn'}</div>
                  )}
                </div>
                {modalRegions.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">📍 Khu vực <span className="text-red-500">*</span></label>
                    <select required value={formData.region_id}
                      onChange={(e) => setFormData({ ...formData, region_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 text-sm">
                      <option value="">-- Chọn --</option>
                      {modalRegions.map((r) => <option key={r.id} value={r.id}>{r.name}{r.division?.short_name ? ` — ${r.division.short_name}` : ''}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div className="bg-blue-50 rounded-xl p-3.5 space-y-2.5">
                <p className="text-[11px] font-bold text-blue-700 uppercase tracking-wide">👤 Khách hàng</p>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tên khách hàng <span className="text-red-500">*</span></label>
                  <input type="text" required value={formData.customer_name}
                    onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 text-sm bg-white"
                    placeholder="Nguyễn Văn A" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Số điện thoại</label>
                  <input type="text" value={formData.customer_phone}
                    onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 text-sm bg-white"
                    placeholder="0901234567" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Công ty KH</label>
                  <input type="text" value={formData.customer_company}
                    onChange={(e) => setFormData({ ...formData, customer_company: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 text-sm bg-white"
                    placeholder="Tên công ty khách hàng (nếu có)" />
                </div>
                <p className="text-[10px] text-blue-500">Thông tin chi tiết sẽ nhập thêm ở trang Lead</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Nguồn</label>
                  <select value={formData.source_id}
                    onChange={(e) => setFormData({ ...formData, source_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 text-sm">
                    <option value="">-- Nguồn --</option>
                    {modalSources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                {visibleLeadTypes.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">🏷️ Loại Lead</label>
                    <select value={formData.lead_type_id}
                      onChange={(e) => setFormData({ ...formData, lead_type_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 text-sm">
                      <option value="">-- Không bắt buộc --</option>
                      {visibleLeadTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {formData.company_id && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">🤝 Người giới thiệu</label>
                  <select
                    value={referrerPick}
                    onChange={(e) => {
                      const v = e.target.value;
                      setReferrerPick(v);
                      if (v !== '__new__') setFormData((prev) => ({ ...prev, referrer_name: '' }));
                    }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 text-sm"
                  >
                    <option value="">— Không chọn —</option>
                    {referrers.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                    <option value="__new__">➕ Nhập người giới thiệu mới…</option>
                  </select>
                  {referrerPick === '__new__' && (
                    <input
                      type="text"
                      value={formData.referrer_name}
                      onChange={(e) => setFormData((prev) => ({ ...prev, referrer_name: e.target.value }))}
                      className="mt-2 w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 text-sm"
                      placeholder="VD: Chị Lan — giới thiệu từ hội nhóm"
                      autoFocus
                    />
                  )}
                  <p className="mt-1 text-[10px] text-gray-400">Tùy chọn — tên mới sẽ được lưu để chọn lại lần sau</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Giá trị (VND)</label>
                  <input type="number" value={formData.estimated_value}
                    onChange={(e) => setFormData({ ...formData, estimated_value: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 text-sm"
                    placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Xác suất (%)</label>
                  <input type="number" min="0" max="100" value={formData.probability}
                    onChange={(e) => setFormData({ ...formData, probability: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 text-sm" />
                </div>
              </div>
            </form>
          </div>

          {/* Footer buttons */}
          <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3 shrink-0 bg-gray-50">
            {currentUser && (
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <User className="h-3.5 w-3.5 text-green-600 shrink-0" />
                <span className="text-xs text-gray-500 truncate">Phụ trách: <span className="font-semibold text-gray-700">{currentUser.full_name || currentUser.email}</span></span>
              </div>
            )}
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition cursor-pointer shrink-0">
              Hủy
            </button>
            <button type="submit" form="lead-form" disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50 cursor-pointer shrink-0">
              {saving ? 'Đang tạo...' : '🚀 Tạo Lead'}
            </button>
          </div>
        </div>

        {/* ── RIGHT: Kanban Card Preview ── */}
        <div className="w-72 shrink-0 bg-gray-50 flex flex-col">
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Xem trước thẻ Lead</p>
          </div>
          <div className="flex-1 px-4 py-5 overflow-y-auto">
            <div className="bg-white rounded-xl border border-blue-200 shadow-sm p-4 space-y-3">
              {/* Title */}
              <div>
                <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wide mb-1">🚀 Lead</p>
                <p className="text-sm font-bold text-gray-900 leading-snug min-h-[1.5rem]">
                  {formData.title || <span className="text-gray-300 italic font-normal">Chưa có tên...</span>}
                </p>
              </div>

              {/* Customer */}
              <div className="flex items-start gap-2 bg-blue-50 rounded-lg px-3 py-2.5">
                <User className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-800 truncate">
                    {formData.customer_name || <span className="text-gray-300 italic font-normal">Tên khách hàng</span>}
                  </p>
                  {formData.customer_phone && <p className="text-[11px] text-gray-500">{formData.customer_phone}</p>}
                </div>
              </div>

              {/* Meta */}
              <div className="space-y-1.5 text-[11px] text-gray-500">
                {companyName && <div className="flex items-center gap-1.5"><span className="text-gray-400">🏢</span><span className="truncate">{companyName}</span></div>}
                {regionName && <div className="flex items-center gap-1.5"><span className="text-gray-400">📍</span><span className="truncate">{regionName}</span></div>}
                {sourceName && <div className="flex items-center gap-1.5"><span className="text-gray-400">📣</span><span>{sourceName}</span></div>}
                {leadTypeName && <div className="flex items-center gap-1.5"><span className="text-gray-400">🏷️</span><span>{leadTypeName}</span></div>}
                {referrerDisplayName && <div className="flex items-center gap-1.5"><span className="text-gray-400">🤝</span><span className="truncate">{referrerDisplayName}</span></div>}
              </div>

              {/* Value & probability */}
              {(Number(formData.estimated_value) > 0 || formData.probability > 0) && (
                <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                  {Number(formData.estimated_value) > 0 && (
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                      {Number(formData.estimated_value).toLocaleString('vi-VN')}đ
                    </span>
                  )}
                  {formData.probability > 0 && (
                    <span className="text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">{formData.probability}%</span>
                  )}
                </div>
              )}

              {/* Assigned */}
              {currentUser && (
                <div className="flex items-center gap-1.5 pt-1 border-t border-gray-100">
                  <div className="h-5 w-5 rounded-full bg-green-200 flex items-center justify-center text-[9px] font-bold text-green-800 shrink-0">
                    {(currentUser.full_name || currentUser.email || '?')[0].toUpperCase()}
                  </div>
                  <span className="text-[11px] text-gray-500 truncate">{currentUser.full_name || currentUser.email}</span>
                </div>
              )}
            </div>

            {/* Pipeline hint */}
            <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-white px-4 py-3 text-center">
              <p className="text-[10px] text-gray-400">📋 Pipeline mặc định</p>
              <p className="text-xs font-medium text-gray-600 mt-0.5">Giai đoạn đầu tiên</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
