/** Cấu hình cột xem Danh sách CRM — lưu theo pipeline + loại lead/deal */

export const LS_CRM_LIST_COLUMNS = 'crm_list_view_columns_v1';

export const MILESTONE_SLUG_GROUPS = {
  survey_date: ['survey_done', 'survey_scheduled'],
  design_date: ['designing'],
  quote_date: ['quoted'],
  close_date: ['negotiating', 'waiting_deposit'],
  contract_date: ['contract_signed'],
};

function storageKey(pipelineType, pipelineId, companyId) {
  const co = companyId ? String(companyId) : 'all';
  const pipe = pipelineId ? String(pipelineId) : 'all';
  return `${co}:${pipelineType || 'lead'}:${pipe}`;
}

export function readListColumnVisibility(pipelineType, pipelineId, companyId) {
  if (typeof window === 'undefined') return null;
  try {
    const all = JSON.parse(localStorage.getItem(LS_CRM_LIST_COLUMNS) || '{}');
    const key = storageKey(pipelineType, pipelineId, companyId);
    const v = all[key] ?? all[`${pipelineType || 'lead'}:${pipelineId || 'all'}`];
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

export function writeListColumnVisibility(pipelineType, pipelineId, companyId, visibilityMap) {
  if (typeof window === 'undefined') return;
  try {
    const all = JSON.parse(localStorage.getItem(LS_CRM_LIST_COLUMNS) || '{}');
    all[storageKey(pipelineType, pipelineId, companyId)] = visibilityMap;
    localStorage.setItem(LS_CRM_LIST_COLUMNS, JSON.stringify(all));
  } catch { /* ignore */ }
}

/** Cột cố định (không phụ thuộc stage pipeline) */
export function buildStaticListColumns(pipelineType) {
  const isDeal = pipelineType === 'deal';
  return [
    { key: 'code', label: isDeal ? 'Mã Deal' : 'Mã Lead', group: 'Cơ bản', defaultVisible: true, sticky: true },
    { key: 'title', label: 'Tên / Nhu cầu', group: 'Cơ bản', defaultVisible: true },
    { key: 'parent_code', label: 'Mã Lead', group: 'Cơ bản', defaultVisible: isDeal, dealOnly: true },
    { key: 'received_at', label: isDeal ? 'Ngày nhận deal' : 'Ngày nhận', group: 'Thời gian', defaultVisible: false },
    { key: 'year', label: 'Năm', group: 'Thời gian', defaultVisible: false },
    { key: 'month', label: 'Tháng', group: 'Thời gian', defaultVisible: false },
    { key: 'week', label: 'Tuần', group: 'Thời gian', defaultVisible: false },
    { key: 'customer_name', label: 'Họ tên KH', group: 'Khách hàng', defaultVisible: true },
    { key: 'phone', label: 'SĐT', group: 'Khách hàng', defaultVisible: true },
    { key: 'region', label: 'Khu vực', group: 'Khách hàng', defaultVisible: false },
    { key: 'source_main', label: 'Nguồn chính', group: 'Nguồn', defaultVisible: false },
    { key: 'source_sub', label: 'Nguồn phụ', group: 'Nguồn', defaultVisible: false },
    { key: 'needs', label: 'Nhu cầu', group: 'Cơ bản', defaultVisible: false },
    { key: 'lead_owner', label: 'Sale nhận', group: 'Nhân viên', defaultVisible: false },
    { key: 'assignee', label: 'Sale xử lý', group: 'Nhân viên', defaultVisible: true },
    { key: 'stage', label: 'Trạng thái', group: 'Pipeline', defaultVisible: true },
    { key: 'survey_date', label: 'Ngày khảo sát', group: 'Mốc quy trình', defaultVisible: isDeal },
    { key: 'design_date', label: 'Ngày thiết kế', group: 'Mốc quy trình', defaultVisible: isDeal },
    { key: 'quote_date', label: 'Ngày báo giá', group: 'Mốc quy trình', defaultVisible: isDeal },
    { key: 'close_date', label: 'Ngày chốt', group: 'Mốc quy trình', defaultVisible: isDeal },
    { key: 'contract_date', label: 'Ngày ký HĐ', group: 'Mốc quy trình', defaultVisible: isDeal },
    { key: 'close_result', label: 'Kết quả chốt', group: 'Kết quả', defaultVisible: isDeal },
    { key: 'lost_reason', label: 'Lý do thất bại', group: 'Kết quả', defaultVisible: false },
    { key: 'estimated_value', label: 'Giá trị dự kiến', group: 'Tài chính', defaultVisible: true, align: 'right' },
    { key: 'probability', label: 'Xác suất chốt %', group: 'Tài chính', defaultVisible: isDeal, align: 'right' },
    { key: 'weighted_value', label: 'Giá trị kỳ vọng', group: 'Tài chính', defaultVisible: false, align: 'right' },
    { key: 'revenue', label: 'Doanh thu', group: 'Tài chính', defaultVisible: isDeal, align: 'right' },
    { key: 'construction_plan', label: 'KH thi công', group: 'Kế hoạch', defaultVisible: false },
    { key: 'delivery_plan', label: 'KH giao hàng', group: 'Kế hoạch', defaultVisible: false },
    { key: 'notes', label: 'Ghi chú', group: 'Cơ bản', defaultVisible: false },
    { key: 'created_at', label: 'Ngày tạo', group: 'Thời gian', defaultVisible: true },
    { key: 'days_total', label: 'Số ngày (tổng)', group: 'Thời gian', defaultVisible: true },
    { key: 'stage_entered_at', label: 'Ngày vào stage hiện tại', group: 'Pipeline', defaultVisible: false },
    { key: 'days_in_stage', label: 'TG stage hiện tại', group: 'Pipeline', defaultVisible: false },
    { key: 'kpi_ledger', label: 'Điểm KPI', group: 'KPI', defaultVisible: false, align: 'right' },
    { key: 'company', label: 'Công ty', group: 'Cơ bản', defaultVisible: true },
    { key: 'expected_close', label: 'Hạn chốt dự kiến', group: 'Thời gian', defaultVisible: false },
  ].filter((c) => !c.dealOnly || isDeal);
}

/** Cột động theo từng cột pipeline của công ty đang xem */
export function buildStageListColumns(pipelineStages, companyLabel) {
  const stages = Array.isArray(pipelineStages) ? pipelineStages : [];
  const group = companyLabel
    ? `Thời gian từng cột · ${companyLabel}`
    : 'Thời gian từng cột (pipeline công ty)';
  const out = [];
  for (const st of stages) {
    if (!st?.id) continue;
    const short = String(st.name || 'Stage').slice(0, 24);
    out.push({
      key: `stage_${st.id}_date`,
      label: `${short} · ngày vào`,
      group,
      defaultVisible: false,
      stageId: String(st.id),
      kind: 'stage_date',
    });
    out.push({
      key: `stage_${st.id}_days`,
      label: `${short} · số ngày`,
      group,
      defaultVisible: false,
      stageId: String(st.id),
      kind: 'stage_days',
      align: 'right',
    });
  }
  return out;
}

export function mergeListColumnDefs(pipelineType, pipelineStages, companyLabel) {
  return [...buildStaticListColumns(pipelineType), ...buildStageListColumns(pipelineStages, companyLabel)];
}

export function resolveVisibleColumnKeys(allColumns, pipelineType, pipelineId, companyId) {
  const saved = readListColumnVisibility(pipelineType, pipelineId, companyId);
  if (saved && typeof saved === 'object') {
    return allColumns
      .filter((c) => saved[c.key] !== false)
      .map((c) => c.key);
  }
  return allColumns.filter((c) => c.defaultVisible !== false).map((c) => c.key);
}

export function buildDefaultVisibilityMap(allColumns) {
  const m = {};
  for (const c of allColumns) {
    m[c.key] = c.defaultVisible !== false;
  }
  return m;
}

/** Lọc lịch sử chỉ giữ stage thuộc pipeline công ty đang xem */
export function filterHistoryForCompanyStages(historyRows, allowedStageIds) {
  const list = Array.isArray(historyRows) ? historyRows : [];
  if (!allowedStageIds?.size) return list;
  return list.filter((h) => allowedStageIds.has(String(h.to_stage_id || '')));
}

/** Từ lịch sử stage → ngày vào / tổng ngày ở mỗi stage (chỉ stage trong allowedStageIds nếu có) */
export function buildStageTimingByStageId(item, historyRows, allowedStageIds) {
  const map = {};
  const now = Date.now();
  const curSid = String(item?.stage_id || item?._stage?.id || '');
  const filtered = filterHistoryForCompanyStages(historyRows, allowedStageIds);

  for (const h of filtered) {
    const sid = String(h.to_stage_id || '');
    if (!sid) continue;
    if (allowedStageIds?.size && !allowedStageIds.has(sid)) continue;
    if (!map[sid]) map[sid] = { firstEntered: null, totalSec: 0 };
    const ent = h.entered_at;
    if (ent && (!map[sid].firstEntered || ent < map[sid].firstEntered)) {
      map[sid].firstEntered = ent;
    }
    if (h.duration_seconds != null && Number.isFinite(Number(h.duration_seconds))) {
      map[sid].totalSec += Math.max(0, Number(h.duration_seconds));
    } else if (h.exited_at && h.entered_at) {
      map[sid].totalSec += Math.max(
        0,
        (new Date(h.exited_at).getTime() - new Date(h.entered_at).getTime()) / 1000,
      );
    }
  }

  if (curSid && item?.stage_entered_at && (!allowedStageIds?.size || allowedStageIds.has(curSid))) {
    if (!map[curSid]) map[curSid] = { firstEntered: item.stage_entered_at, totalSec: 0 };
    const openSec = Math.max(
      0,
      (now - new Date(item.stage_entered_at).getTime()) / 1000,
    );
    map[curSid].openSec = openSec;
  }

  for (const sid of Object.keys(map)) {
    const o = map[sid];
    let sec = o.totalSec || 0;
    if (sid === curSid && o.openSec) sec += o.openSec;
    o.days = Math.floor(sec / 86400);
  }
  return map;
}

/** Lần đầu vào một trong các canonical slug (đã lọc theo stage công ty nếu có) */
export function firstEnteredBySlugs(historyRows, slugs, allowedStageIds) {
  const want = new Set((slugs || []).map((s) => String(s)));
  let best = null;
  const rows = filterHistoryForCompanyStages(historyRows, allowedStageIds);
  for (const h of rows) {
    const slug = String(h.to_canonical_slug || '');
    if (!want.has(slug)) continue;
    const ent = h.entered_at;
    if (ent && (!best || ent < best)) best = ent;
  }
  return best;
}

export function isoWeekAndParts(d) {
  if (!d) return { year: '', month: '', week: '' };
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return { year: '', month: '', week: '' };
  const year = dt.getFullYear();
  const month = dt.getMonth() + 1;
  const jan4 = new Date(year, 0, 4);
  const dayOfYear = Math.floor((dt - new Date(year, 0, 1)) / 86400000) + 1;
  const jan4Dow = (jan4.getDay() + 6) % 7;
  const week = Math.ceil((dayOfYear + jan4Dow - 3) / 7);
  return { year, month, week };
}
