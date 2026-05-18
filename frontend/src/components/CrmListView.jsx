import { useState, useEffect, useMemo, useCallback } from 'react';
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
import { Columns3, X, Check } from 'lucide-react';

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
  const allItems = useMemo(
    () => pipeline.flatMap((s) => s.items.map((item) => ({ ...item, _stage: s }))),
    [pipeline],
  );

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
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium border border-gray-200 rounded-lg bg-white hover:bg-gray-50 shadow-sm"
        >
          <Columns3 className="h-3.5 w-3.5 text-blue-600" />
          Cột hiển thị ({visibleColumns.length}/{allColumns.length})
        </button>
      </div>

      <div className="bg-white rounded-xl border overflow-x-auto">
        <table className="w-full text-sm min-w-max">
          <thead>
            <tr className="bg-gradient-to-r from-slate-700 to-slate-800 text-left text-[10px] text-white uppercase tracking-wide">
              {visibleColumns.map((col) => (
                <th
                  key={col.key}
                  className={`px-3 py-2.5 font-semibold whitespace-nowrap ${
                    col.align === 'right' ? 'text-right' : 'text-left'
                  } ${col.sticky ? 'sticky left-0 z-10 bg-slate-800' : ''}`}
                  title={col.label}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {allItems.map((item) => {
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
                  className="hover:bg-blue-50/50 cursor-pointer transition-colors"
                >
                  {visibleColumns.map((col) => {
                    const raw = getCellValue(item, col);
                    const isStage = col.key === 'stage';
                    const isDaysTotal = col.key === 'days_total';
                    const isDaysStage = col.key === 'days_in_stage';
                    return (
                      <td
                        key={col.key}
                        className={`px-3 py-2 text-xs whitespace-nowrap max-w-[220px] truncate ${
                          col.align === 'right' ? 'text-right tabular-nums' : 'text-left'
                        } ${col.sticky ? 'sticky left-0 z-[1] bg-white font-medium text-blue-600' : ''} ${
                          col.key === 'code' ? 'font-medium text-blue-600' : 'text-gray-700'
                        }`}
                        title={typeof raw === 'string' ? raw : undefined}
                      >
                        {isStage && item._stage ? (
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
        <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500 flex flex-wrap justify-between gap-x-4 gap-y-1 border-t">
          <span>Tổng: {allItems.length} {pipelineType === 'deal' ? 'deal' : 'lead'}</span>
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
    </div>
  );
}
