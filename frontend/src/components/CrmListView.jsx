import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { markCrmPipelineCardFocus, persistCrmPipelineUiNow } from '../lib/crmPipelineStorage';
import { formatVND } from '../lib/utils';
import {
  mergeListColumnDefs,
  resolveVisibleColumnKeys,
  buildDefaultVisibilityMap,
  writeListColumnVisibility,
  buildStageTimingByStageId,
  firstEnteredBySlugs,
  isoWeekAndParts,
  MILESTONE_SLUG_GROUPS,
} from '../lib/crmListViewColumns';
import { Columns3, X, Check, Pin, CheckCircle2, FileSpreadsheet, RotateCcw } from 'lucide-react';
import * as XLSX from 'xlsx';
import EmployeePicker from './EmployeePicker';

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('vi-VN');
}

function formatKpiLedgerCell(v) {
  if (v == null || Number.isNaN(Number(v))) return '—';
  const n = Number(v);
  const s = n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
  return n > 0 ? `+${s}` : s;
}

function getInitials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.map((p) => p[0]).join('').toUpperCase().slice(0, 2);
}

const AVATAR_PALETTE = [
  '#0891b2', '#0d9488', '#059669', '#65a30d', '#ca8a04',
  '#d97706', '#ea580c', '#dc2626', '#db2777', '#c026d3',
  '#9333ea', '#7c3aed', '#4f46e5', '#2563eb', '#0284c7',
];

function colorFromName(name) {
  if (!name) return '#94a3b8';
  let h = 0;
  for (let i = 0; i < name.length; i += 1) {
    h = (h * 31 + name.charCodeAt(i)) & 0xfffffff;
  }
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

function closeResultLabel(item, stage) {
  if (stage?.is_lost || item?.lost_reason) return 'Thua';
  if (stage?.is_won) return 'Thắng';
  return 'Đang xử lý';
}

function ColumnPickerModal({ open, onClose, allColumns, visibility, onApply }) {
  const [draft, setDraft] = useState(visibility);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (open) {
      setDraft({ ...visibility });
      setQ('');
    }
  }, [open, visibility]);

  const groups = useMemo(() => {
    const g = {};
    const qq = q.trim().toLowerCase();
    for (const c of allColumns) {
      if (qq && !c.label.toLowerCase().includes(qq) && !c.group.toLowerCase().includes(qq)) continue;
      if (!g[c.group]) g[c.group] = [];
      g[c.group].push(c);
    }
    return g;
  }, [allColumns, q]);

  if (!open) return null;

  const toggle = (key) => setDraft((prev) => ({ ...prev, [key]: !prev[key] }));
  const setAll = (val) => {
    const next = { ...draft };
    for (const c of allColumns) next[c.key] = val;
    setDraft(next);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 pt-12"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[min(85vh,640px)] flex flex-col border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <div className="flex items-center gap-2">
            <Columns3 className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-bold text-gray-900">Cấu hình cột hiển thị</h3>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>
        <div className="px-4 py-2 border-b shrink-0 space-y-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm cột…"
            className="w-full h-8 px-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <div className="flex flex-wrap gap-2 text-[11px]">
            <button type="button" onClick={() => setAll(true)} className="px-2 py-1 rounded border hover:bg-gray-50">
              Chọn tất cả
            </button>
            <button type="button" onClick={() => setAll(false)} className="px-2 py-1 rounded border hover:bg-gray-50">
              Bỏ chọn tất cả
            </button>
            <button
              type="button"
              onClick={() => setDraft(buildDefaultVisibilityMap(allColumns))}
              className="px-2 py-1 rounded border border-blue-200 text-blue-700 hover:bg-blue-50"
            >
              Mặc định
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {Object.entries(groups).map(([group, cols]) => (
            <div key={group}>
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">{group}</p>
              <div className="space-y-1">
                {cols.map((c) => (
                  <label
                    key={c.key}
                    className="flex items-center gap-2 py-1 px-1 rounded hover:bg-gray-50 cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={!!draft[c.key]}
                      onChange={() => toggle(c.key)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-gray-800">{c.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="px-4 py-3 border-t flex justify-end gap-2 shrink-0">
          <button type="button" onClick={onClose} className="h-9 px-4 text-sm border rounded-lg hover:bg-gray-50">
            Hủy
          </button>
          <button
            type="button"
            onClick={() => onApply(draft)}
            className="h-9 px-4 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center gap-1"
          >
            <Check className="h-3.5 w-3.5" /> Áp dụng
          </button>
        </div>
      </div>
    </div>
  );
}

function RevertDealToLeadModal({ item, onClose, onDone }) {
  const [newOwner, setNewOwner] = useState(item?.assigned_to || item?.lead_owner_id || '');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!item) return null;
  const hasProject = !!item.project_id;

  const handleSubmit = async () => {
    if (!newOwner) {
      setError('Vui lòng chọn người phụ trách Lead mới.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.post(`/crm/leads/${item.id}/convert-to-lead`, {
        assigned_to: newOwner,
        reason: reason.trim() || undefined,
      });
      onDone?.();
    } catch (e) {
      setError(e.response?.data?.error || 'Có lỗi khi trả deal về Lead.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-amber-600" />
            Trả Deal về Lead
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
            aria-label="Đóng"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        {hasProject ? (
          <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg p-3">
            Deal đã có dự án SX gắn vào — không thể trả về Lead. Hãy xử lý dự án trước.
          </div>
        ) : (
          <>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900 mb-3">
              Deal <strong>{item.code || ''}</strong>
              {item.title ? ` · ${item.title}` : ''} sẽ chuyển về <strong>Lead</strong> và đặt
              lại cột đầu tiên của pipeline. Dữ liệu cũ vẫn được giữ.
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs font-bold text-gray-700 mb-1 block">
                  👤 Người phụ trách Lead mới <span className="text-red-500">*</span>
                </label>
                <EmployeePicker
                  companyId={item.company_id || item.company?.id || ''}
                  value={newOwner}
                  onChange={(uid) => setNewOwner(uid || '')}
                  placeholder="Chọn nhân viên phụ trách Lead..."
                  size="md"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 mb-1 block">
                  📝 Lý do (không bắt buộc)
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="VD: Khách chưa sẵn sàng, cần nuôi tiếp ở Lead…"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {error && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg p-2">
                  {error}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="flex-1 h-9 border rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!newOwner || submitting}
                className="flex-1 h-9 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                {submitting ? 'Đang xử lý...' : '↩️ Trả về Lead'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function ListView({
  pipeline,
  pipelineType,
  calculateDays,
  pipelineId,
  companyId,
  companyName,
  /** Stage thuộc pipeline công ty đang xem (không lấy từ Kanban có thể lẫn công ty khác) */
  companyPipelineStages,
}) {
  const navigate = useNavigate();
  const allItems = useMemo(() => {
    const arr = pipeline.flatMap((s) => s.items.map((item) => ({ ...item, _stage: s })));
    // Ưu tiên thẻ ghim (per-user) lên đầu list.
    arr.sort((a, b) => {
      const ap = a?.is_pinned ? 1 : 0;
      const bp = b?.is_pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return 0;
    });
    return arr;
  }, [pipeline]);

  // Optimistic toggle ghim / đã tương tác per-user (rollback nếu API fail).
  // Khác với Kanban (state ở dashboard), list view không nắm setter — patch trực tiếp
  // vào item (mutate) rồi force update qua key change là không sạch. Đơn giản nhất:
  // gọi API, không update state local — refresh sẽ kéo lại. Đổi lại: thẻ chưa đổi UI
  // ngay; chấp nhận trade-off vì list ít dùng so với Kanban.
  const handleTogglePin = useCallback(async (item, ev) => {
    ev?.stopPropagation?.();
    const next = !item.is_pinned;
    try {
      if (next) await api.post(`/crm/leads/${item.id}/pin`);
      else await api.delete(`/crm/leads/${item.id}/pin`);
      item.is_pinned = next;
      item.pinned_at = next ? new Date().toISOString() : null;
    } catch (e) {
      console.error('list togglePin failed:', e?.message || e);
    }
  }, []);

  const handleToggleInteracted = useCallback(async (item, ev) => {
    ev?.stopPropagation?.();
    const next = !item.is_interacted;
    try {
      if (next) await api.post(`/crm/leads/${item.id}/interacted`);
      else await api.delete(`/crm/leads/${item.id}/interacted`);
      item.is_interacted = next;
      item.interacted_at = next ? new Date().toISOString() : null;
    } catch (e) {
      console.error('list toggleInteracted failed:', e?.message || e);
    }
  }, []);

  const pipelineStages = useMemo(() => {
    const fromProp = Array.isArray(companyPipelineStages) ? companyPipelineStages : [];
    if (fromProp.length) {
      return fromProp.map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        icon: s.icon,
        canonical_slug: s.canonical_slug,
        pipeline_id: s.pipeline_id,
        is_won: s.is_won,
        is_lost: s.is_lost,
      }));
    }
    if (!companyId) return [];
    return (pipeline || []).map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      icon: s.icon,
      canonical_slug: s.canonical_slug,
      pipeline_id: s.pipeline_id,
      is_won: s.is_won,
      is_lost: s.is_lost,
    }));
  }, [companyPipelineStages, companyId, pipeline]);

  const allowedStageIds = useMemo(
    () => new Set(pipelineStages.map((s) => String(s.id)).filter(Boolean)),
    [pipelineStages],
  );

  const companyLabel = companyName || (companyId ? 'Công ty' : '');

  const allColumns = useMemo(
    () => mergeListColumnDefs(pipelineType, pipelineStages, companyLabel),
    [pipelineType, pipelineStages, companyLabel],
  );

  const [visibility, setVisibility] = useState(() => {
    const keys = resolveVisibleColumnKeys(allColumns, pipelineType, pipelineId, companyId);
    const m = buildDefaultVisibilityMap(allColumns);
    for (const k of Object.keys(m)) m[k] = keys.includes(k);
    return m;
  });

  const [pickerOpen, setPickerOpen] = useState(false);
  const [historyByLead, setHistoryByLead] = useState({});
  const [parentCodes, setParentCodes] = useState({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [revertTarget, setRevertTarget] = useState(null);

  // Lazy render: hiện 150 dòng đầu, tự tải thêm theo batch 300 khi cuộn gần đáy.
  // First paint nhanh, batch lớn để giảm số lần re-render khi scroll dài.
  const INITIAL_PAGE = 150;
  const PAGE_STEP = 300;
  const [visibleCount, setVisibleCount] = useState(INITIAL_PAGE);
  const scrollContainerRef = useRef(null);
  const loadMoreSentinelRef = useRef(null);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    setVisibleCount(INITIAL_PAGE);
    loadingMoreRef.current = false;
    if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
  }, [pipeline]);

  // IntersectionObserver setup MỘT LẦN trên mount (không re-mount theo visibleCount).
  // Dùng ref `loadingMoreRef` để khoá lại tránh trigger setState liên tiếp khi sentinel còn trong vùng quan sát.
  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    const root = scrollContainerRef.current;
    if (!sentinel || !root) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (loadingMoreRef.current) return;
        if (entries.some((e) => e.isIntersecting)) {
          loadingMoreRef.current = true;
          setVisibleCount((c) => c + PAGE_STEP);
          // Mở khoá trong frame kế tiếp, sau khi DOM đã extend → sentinel tự ra khỏi vùng quan sát.
          requestAnimationFrame(() => {
            loadingMoreRef.current = false;
          });
        }
      },
      { root, rootMargin: '600px 0px', threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [allItems.length]);

  useEffect(() => {
    const keys = resolveVisibleColumnKeys(allColumns, pipelineType, pipelineId, companyId);
    const m = buildDefaultVisibilityMap(allColumns);
    for (const k of Object.keys(m)) m[k] = keys.includes(k);
    setVisibility(m);
  }, [pipelineType, pipelineId, companyId, allColumns.length]);

  const visibleColumns = useMemo(
    () => allColumns.filter((c) => visibility[c.key] !== false),
    [allColumns, visibility],
  );

  const needsHistory = useMemo(() => {
    const keys = new Set(visibleColumns.map((c) => c.key));
    if ([
      'survey_date', 'design_date', 'quote_date', 'close_date', 'contract_date',
      'stage_entered_at', 'days_in_stage',
    ].some((k) => keys.has(k))) return true;
    return visibleColumns.some((c) => c.kind === 'stage_date' || c.kind === 'stage_days');
  }, [visibleColumns]);

  const needsParents = useMemo(
    () => pipelineType === 'deal' && visibleColumns.some((c) => c.key === 'parent_code'),
    [pipelineType, visibleColumns],
  );

  useEffect(() => {
    if (!allItems.length || (!needsHistory && !needsParents)) {
      setHistoryByLead({});
      setParentCodes({});
      return;
    }
    const ids = [...new Set(allItems.map((i) => String(i.id)).filter(Boolean))].slice(0, 500);
    let cancelled = false;
    (async () => {
      setHistoryLoading(true);
      try {
        const stage_ids = [...allowedStageIds];
        const r = await api.post('/crm/leads/stage-history-summary', {
          lead_ids: ids,
          pipeline_id: pipelineId || undefined,
          company_id: companyId || undefined,
          stage_ids: stage_ids.length ? stage_ids : undefined,
        });
        if (cancelled) return;
        setHistoryByLead(r.data?.by_lead || {});
        setParentCodes(r.data?.parent_codes || {});
      } catch {
        if (!cancelled) {
          setHistoryByLead({});
          setParentCodes({});
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [allItems, needsHistory, needsParents, allowedStageIds, pipelineId, companyId]);

  const getCellValue = useCallback((item, col) => {
    const stage = item._stage;
    const hist = historyByLead[String(item.id)] || [];
    const timing = buildStageTimingByStageId(item, hist, allowedStageIds);
    const created = item.created_at;
    const { year, month, week } = isoWeekAndParts(created);

    if (col.kind === 'stage_date') {
      const t = timing[col.stageId];
      return t?.firstEntered ? formatDate(t.firstEntered) : '—';
    }
    if (col.kind === 'stage_days') {
      const t = timing[col.stageId];
      return t?.days != null ? `${t.days} ngày` : '—';
    }

    switch (col.key) {
      case 'code':
        return item.code || '—';
      case 'title':
        return item.title || '—';
      case 'parent_code':
        return item.parent_lead_id
          ? (parentCodes[String(item.parent_lead_id)] || String(item.parent_lead_id).slice(0, 8))
          : '—';
      case 'received_at':
        return formatDate(created);
      case 'year':
        return year || '—';
      case 'month':
        return month || '—';
      case 'week':
        return week || '—';
      case 'customer_name':
        return item.customer?.full_name || '—';
      case 'phone':
        return item.phone || item.customer?.phone || '—';
      case 'region':
        return item.crm_region?.name || item.region?.name || '—';
      case 'source_main':
        return item.source?.category?.name || item.source_category?.name || item.source?.name || '—';
      case 'source_sub':
        return item.source?.name || '—';
      case 'referrer_name':
        return String(item.referrer_name || '').trim() || '—';
      case 'needs':
        return item.description || item.title || '—';
      case 'lead_owner':
        return item.lead_owner?.full_name || '—';
      case 'assignee':
        return item.assignee?.full_name || item.lead_owner?.full_name || '—';
      case 'stage':
        return stage ? `${stage.icon || ''} ${stage.name}`.trim() : '—';
      case 'survey_date':
        return formatDate(firstEnteredBySlugs(hist, MILESTONE_SLUG_GROUPS.survey_date, allowedStageIds)) || '—';
      case 'design_date':
        return formatDate(firstEnteredBySlugs(hist, MILESTONE_SLUG_GROUPS.design_date, allowedStageIds)) || '—';
      case 'quote_date':
        return formatDate(firstEnteredBySlugs(hist, MILESTONE_SLUG_GROUPS.quote_date, allowedStageIds)) || '—';
      case 'close_date':
        return formatDate(firstEnteredBySlugs(hist, MILESTONE_SLUG_GROUPS.close_date, allowedStageIds)) || '—';
      case 'contract_date':
        return formatDate(firstEnteredBySlugs(hist, MILESTONE_SLUG_GROUPS.contract_date, allowedStageIds)) || '—';
      case 'close_result':
        return closeResultLabel(item, stage);
      case 'lost_reason':
        return item.lost_reason || '—';
      case 'estimated_value':
        return item.estimated_value > 0 ? formatVND(item.estimated_value) : '—';
      case 'probability':
        return item.probability != null && item.probability !== '' ? `${item.probability}%` : '—';
      case 'weighted_value': {
        const val = Number(item.estimated_value) || 0;
        const pct = Number(item.probability);
        const p = Number.isFinite(pct) ? pct : 50;
        return val > 0 ? formatVND((val * p) / 100) : '—';
      }
      case 'revenue':
        if (stage?.is_won && item.estimated_value > 0) return formatVND(item.estimated_value);
        return item.actual_close_date ? formatVND(item.estimated_value || 0) : '—';
      case 'construction_plan':
        return item.expected_construction_time || item.linked_project?.production_note || '—';
      case 'delivery_plan':
        return item.linked_project?.production_deadline
          ? formatDate(item.linked_project.production_deadline)
          : (item.expected_close_date ? formatDate(item.expected_close_date) : '—');
      case 'notes': {
        const n = item.description || '';
        return n.length > 80 ? `${n.slice(0, 80)}…` : (n || '—');
      }
      case 'created_at':
        return formatDate(created);
      case 'days_total': {
        const days = calculateDays(item.created_at);
        return `${days} ngày`;
      }
      case 'stage_entered_at':
        return formatDate(item.stage_entered_at) || '—';
      case 'days_in_stage': {
        const sid = String(item.stage_id || stage?.id || '');
        const t = timing[sid];
        return t?.days != null ? `${t.days} ngày` : '—';
      }
      case 'kpi_ledger':
        return formatKpiLedgerCell(item.kpi_ledger_month_net);
      case 'company':
        return item.company?.short_name || item.company?.name || '—';
      case 'expected_close':
        return formatDate(item.expected_close_date) || '—';
      default:
        return '—';
    }
  }, [historyByLead, parentCodes, calculateDays, allowedStageIds]);

  /**
   * Build dòng Excel theo mẫu cố định (cột chuẩn + người giới thiệu).
   * Số (estimated_value/probability/expected_revenue) → trả number để Excel format được;
   * ngày → chuỗi dd/mm/yyyy; ô trống → '' thay vì '—'.
   */
  const buildExcelRow = useCallback((item) => {
    const stage = item._stage;
    const hist = historyByLead[String(item.id)] || [];
    const created = item.created_at;
    const { year, month, week } = isoWeekAndParts(created);
    const isDeal = (item.type || pipelineType) === 'deal';
    const dealCode = isDeal ? (item.code || '') : '';
    const leadCode = isDeal
      ? (item.parent_lead_id ? (parentCodes[String(item.parent_lead_id)] || '') : '')
      : (item.code || '');
    const fmt = (d) => (d ? formatDate(d) : '');
    const surveyDate = firstEnteredBySlugs(hist, MILESTONE_SLUG_GROUPS.survey_date, allowedStageIds);
    const designDate = firstEnteredBySlugs(hist, MILESTONE_SLUG_GROUPS.design_date, allowedStageIds);
    const quoteDate = firstEnteredBySlugs(hist, MILESTONE_SLUG_GROUPS.quote_date, allowedStageIds);
    const negotiateDate = firstEnteredBySlugs(hist, MILESTONE_SLUG_GROUPS.close_date, allowedStageIds);
    const contractDate = firstEnteredBySlugs(hist, MILESTONE_SLUG_GROUPS.contract_date, allowedStageIds);
    const est = Number(item.estimated_value) || 0;
    const probRaw = item.probability;
    const prob = (probRaw === null || probRaw === undefined || probRaw === '')
      ? null
      : Number(probRaw);
    const expectedRev = est > 0 && prob !== null ? Math.round(est * prob / 100) : '';
    return {
      'Mã_Deal': dealCode,
      'Mã_Lead': leadCode,
      'Ngày_nhận_deal': fmt(created),
      'Năm': year || '',
      'Tháng': month || '',
      'Tuần': week || '',
      'Họ_tên_KH': item.customer?.full_name || '',
      'SĐT': item.phone || item.customer?.phone || '',
      'Khu_vực': item.crm_region?.name || item.region?.name || '',
      'Nguồn_chính': item.source?.category?.name || item.source_category?.name || item.source?.name || '',
      'Nguồn_phụ': item.source?.name || '',
      'Người_giới_thiệu': String(item.referrer_name || '').trim(),
      'Nhu_cầu': item.title || item.description || '',
      'Sale_Admin_nguồn': item.lead_owner?.full_name || '',
      'Sale_Kỹ_Thuật': item.assignee?.full_name || item.lead_owner?.full_name || '',
      'Trạng_thái_Deal': stage ? `${stage.icon || ''} ${stage.name}`.trim() : '',
      'Ngày_khảo_sát': fmt(surveyDate),
      'Ngày_thiết_kế': fmt(designDate),
      'Ngày_báo_giá': fmt(quoteDate),
      'Ngày_đàm_phán': fmt(negotiateDate),
      'Ngày_ký_hợp_đồng': fmt(contractDate),
      'Kết_quả_cuối': closeResultLabel(item, stage),
      'Lý_do_thất_bại': item.lost_reason || '',
      'Giá_trị_dự_kiến': est > 0 ? est : '',
      'Xác_suất_chốt': prob !== null && Number.isFinite(prob) ? prob : '',
      'Doanh_thu_kỳ_vọng': expectedRev,
      'Kế_hoạch_tuần': item.expected_construction_time || item.linked_project?.production_note || '',
      'Kế_hoạch_tháng': fmt(item.linked_project?.production_deadline || item.expected_close_date),
      'Ghi_chú': item.description || '',
    };
  }, [historyByLead, parentCodes, allowedStageIds, pipelineType]);

  const handleExportExcel = useCallback(() => {
    if (!allItems.length) return;
    const rows = allItems.map(buildExcelRow);
    const ws = XLSX.utils.json_to_sheet(rows, { cellDates: false });
    // Set column widths ~ phỏng theo nội dung trung bình
    const headers = Object.keys(rows[0] || {});
    ws['!cols'] = headers.map((h) => {
      if (h.startsWith('Ngày_')) return { wch: 14 };
      if (h === 'Họ_tên_KH' || h === 'Nhu_cầu' || h === 'Ghi_chú') return { wch: 28 };
      if (h.startsWith('Sale_')) return { wch: 20 };
      if (h.includes('Giá_trị') || h.includes('Doanh_thu')) return { wch: 16 };
      return { wch: 14 };
    });
    const wb = XLSX.utils.book_new();
    const sheetName = pipelineType === 'deal' ? 'Deals' : 'Leads';
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const today = new Date();
    const stamp = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const co = companyName ? `_${String(companyName).replace(/[^\p{L}\d_-]+/gu, '_')}` : '';
    XLSX.writeFile(wb, `crm_${sheetName.toLowerCase()}${co}_${stamp}.xlsx`);
  }, [allItems, buildExcelRow, pipelineType, companyName]);

  const applyVisibility = (draft) => {
    setVisibility(draft);
    writeListColumnVisibility(pipelineType, pipelineId, companyId, draft);
    setPickerOpen(false);
  };

  if (!allItems.length) {
    return <p className="text-center text-gray-400 py-12 text-sm">Không có dữ liệu</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-xs text-gray-500">
          {allItems.length} {pipelineType === 'deal' ? 'deal' : 'lead'}
          {companyName ? ` · ${companyName}` : ''}
          {pipelineStages.length > 0 ? ` · ${pipelineStages.length} cột pipeline` : companyId ? ' · chưa có cột pipeline công ty' : ' · chọn công ty để xem TG từng cột'}
          {historyLoading && needsHistory ? ' · Đang tải lịch sử stage…' : ''}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={!allItems.length || historyLoading}
            title="Xuất Excel theo mẫu cố định (gồm người giới thiệu)"
            className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium border border-emerald-300 text-emerald-700 rounded-lg bg-white hover:bg-emerald-50 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Xuất Excel ({allItems.length})
          </button>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium border border-gray-200 rounded-lg bg-white hover:bg-gray-50 shadow-sm"
          >
            <Columns3 className="h-3.5 w-3.5 text-blue-600" />
            Cột hiển thị ({visibleColumns.length}/{allColumns.length})
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <div
          ref={scrollContainerRef}
          className="overflow-auto max-h-[calc(100vh-18rem)] min-h-[24rem]"
        >
        <table className="w-full text-sm min-w-max border-separate border-spacing-0">
          <thead>
            <tr className="text-left text-[10px] text-gray-600 uppercase tracking-wide">
              {visibleColumns.map((col) => (
                <th
                  key={col.key}
                  className={`px-3 py-2.5 font-semibold whitespace-nowrap bg-gray-100 border-b border-gray-300 sticky top-0 ${
                    col.align === 'right' ? 'text-right' : 'text-left'
                  } ${col.sticky ? 'left-0 z-30' : 'z-20'}`}
                  title={col.label}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="[&_tr:not(:last-child)>td]:border-b [&_tr>td]:border-gray-200">
            {allItems.slice(0, visibleCount).map((item) => {
              const daysTotal = calculateDays(item.created_at);
              const hist = historyByLead[String(item.id)] || [];
              const timing = buildStageTimingByStageId(item, hist, allowedStageIds);
              const curSid = String(item.stage_id || item._stage?.id || '');
              const daysInStage = timing[curSid]?.days ?? null;
              return (
                <tr
                  key={item.id}
                  data-crm-pipeline-card={item.id}
                  onClick={() => {
                    persistCrmPipelineUiNow();
                    markCrmPipelineCardFocus(item.id);
                    navigate(`/crm/leads/${item.id}`);
                  }}
                  className="group/row hover:bg-blue-100 cursor-pointer transition-colors"
                >
                  {visibleColumns.map((col) => {
                    const isRevert = col.key === 'revert_to_lead';
                    const raw = isRevert ? '' : getCellValue(item, col);
                    const isStage = col.key === 'stage';
                    const isDaysTotal = col.key === 'days_total';
                    const isDaysStage = col.key === 'days_in_stage';
                    const isCode = col.key === 'code';
                    const isTitle = col.key === 'title';
                    const isPerson = col.key === 'assignee' || col.key === 'lead_owner';
                    const stackedCell = isCode || isTitle || isPerson;
                    const phone = item.phone || item.customer?.phone || '';
                    return (
                      <td
                        key={col.key}
                        className={`px-3 py-2 text-xs ${
                          stackedCell ? 'whitespace-normal align-top max-w-[260px]' : 'whitespace-nowrap max-w-[220px] truncate'
                        } ${
                          col.align === 'right' ? 'text-right tabular-nums' : 'text-left'
                        } ${col.sticky ? 'sticky left-0 z-[1] bg-white group-hover/row:bg-blue-100 font-medium text-blue-600 transition-colors' : ''} ${
                          isCode && !col.sticky ? 'font-medium text-blue-600' : ''
                        } ${
                          !isCode && !stackedCell ? 'text-gray-700' : ''
                        }`}
                        title={typeof raw === 'string' && !stackedCell ? raw : undefined}
                      >
                        {isRevert ? (
                          item.type === 'deal'
                          && !item.project_id
                          && item._stage?.allow_revert_to_lead === true
                          && !item._stage?.is_won ? (
                            <button
                              type="button"
                              title="Trả deal về Lead và chọn lại người phụ trách"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setRevertTarget(item);
                              }}
                              className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-amber-300 bg-amber-50 text-amber-800 text-[11px] font-semibold hover:bg-amber-100"
                            >
                              <RotateCcw className="h-3 w-3" />
                              Trả về Lead
                            </button>
                          ) : (
                            <span className="text-gray-300 text-[11px]">—</span>
                          )
                        ) : isCode ? (
                          <div className="flex items-start gap-1.5 min-w-0">
                            <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
                              <button
                                type="button"
                                title={item.is_pinned ? 'Bỏ ghim' : 'Ghim thẻ lên đầu'}
                                onClick={(ev) => handleTogglePin(item, ev)}
                                className={`inline-flex h-4 w-4 items-center justify-center rounded ${
                                  item.is_pinned ? 'text-amber-500' : 'text-gray-300 hover:text-amber-500'
                                }`}
                              >
                                <Pin className={`h-3.5 w-3.5 ${item.is_pinned ? 'rotate-45 fill-amber-500' : ''}`} strokeWidth={2.25} />
                              </button>
                              <button
                                type="button"
                                title={item.is_interacted ? 'Bỏ đã tương tác' : 'Đánh dấu đã tương tác'}
                                onClick={(ev) => handleToggleInteracted(item, ev)}
                                className={`inline-flex h-4 w-4 items-center justify-center rounded ${
                                  item.is_interacted ? 'text-blue-500' : 'text-gray-300 hover:text-blue-500'
                                }`}
                              >
                                <CheckCircle2 className={`h-3.5 w-3.5 ${item.is_interacted ? 'fill-blue-500 text-white' : ''}`} strokeWidth={2.25} />
                              </button>
                            </div>
                            <div className="flex flex-col min-w-0 leading-tight">
                              <span className="font-medium text-blue-600 truncate" title={item.code || ''}>{item.code || '—'}</span>
                              {item.created_at && (
                                <span className="text-[12px] font-medium text-gray-500 mt-1 tabular-nums" title={`Ngày tạo: ${new Date(item.created_at).toLocaleString('vi-VN')}`}>
                                  📅 {formatDate(item.created_at)}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : isTitle ? (
                          <div className="flex flex-col min-w-0 leading-tight">
                            <span className="font-medium text-gray-800 truncate" title={item.title || ''}>{item.title || '—'}</span>
                            {phone ? (
                              <a
                                href={`tel:${phone}`}
                                onClick={(ev) => ev.stopPropagation()}
                                className="text-[12px] font-mono font-bold text-emerald-600 hover:text-emerald-700 mt-1 tabular-nums truncate inline-block"
                                title={`Gọi ${phone}`}
                              >
                                📞 {phone}
                              </a>
                            ) : (
                              <span className="text-[12px] text-gray-300 mt-1">📞 —</span>
                            )}
                          </div>
                        ) : isPerson ? (
                          (() => {
                            const u = col.key === 'assignee'
                              ? (item.assignee || item.lead_owner)
                              : item.lead_owner;
                            const name = u?.full_name || '';
                            if (!name) return <span className="text-gray-400">—</span>;
                            return (
                              <span className="inline-flex items-center gap-1.5 min-w-0 max-w-full" title={name}>
                                <span
                                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-sm"
                                  style={{ backgroundColor: colorFromName(name) }}
                                  aria-hidden
                                >
                                  {getInitials(name)}
                                </span>
                                <span className="truncate text-gray-700">{name}</span>
                              </span>
                            );
                          })()
                        ) : isStage && item._stage ? (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium"
                            style={{
                              backgroundColor: `${item._stage.color}20`,
                              color: item._stage.color,
                            }}
                          >
                            {item._stage.icon} {item._stage.name}
                          </span>
                        ) : isDaysTotal ? (
                          <span
                            className={
                              daysTotal > 30 ? 'text-red-600 font-bold' : daysTotal > 14 ? 'text-amber-600' : 'text-gray-500'
                            }
                          >
                            {raw}
                          </span>
                        ) : isDaysStage ? (
                          <span
                            className={
                              (daysInStage ?? 0) > 30 ? 'text-red-600 font-bold' : (daysInStage ?? 0) > 14 ? 'text-amber-600' : 'text-gray-500'
                            }
                          >
                            {raw}
                          </span>
                        ) : (
                          raw
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {visibleCount < allItems.length && (
          <div
            ref={loadMoreSentinelRef}
            className="flex items-center justify-center py-3 text-[11px] text-gray-400"
          >
            <span className="inline-block h-3 w-3 mr-2 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" aria-hidden />
            Đang tải thêm… ({visibleCount.toLocaleString()}/{allItems.length.toLocaleString()})
          </div>
        )}
        </div>
        <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500 flex flex-wrap justify-between gap-x-4 gap-y-1 border-t">
          <span>
            Hiển thị: {Math.min(visibleCount, allItems.length).toLocaleString()} / {allItems.length.toLocaleString()} {pipelineType === 'deal' ? 'deal' : 'lead'}
          </span>
          <span>GT: {formatVND(allItems.reduce((s, i) => s + (i.estimated_value || 0), 0))}</span>
        </div>
      </div>

      <ColumnPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        allColumns={allColumns}
        visibility={visibility}
        onApply={applyVisibility}
      />

      {revertTarget && (
        <RevertDealToLeadModal
          item={revertTarget}
          onClose={() => setRevertTarget(null)}
          onDone={() => {
            // Optimistic: tạm thời ẩn hành động (đợi socket 'crm:dashboard_changed' refresh kanban).
            if (revertTarget) {
              revertTarget.type = 'lead';
            }
            setRevertTarget(null);
          }}
        />
      )}
    </div>
  );
}
