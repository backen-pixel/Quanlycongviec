/**
 * SX Kanban summary counts — ưu tiên 1 RPC GROUP BY; fallback quét mỏng 1 cột.
 * Đồng thời đếm deadline bucket (KPI «Quá hạn») trên toàn bộ dự án khớp filter — không chỉ card đã load.
 * Mục tiêu Render: ít roundtrip Supabase hơn N× head-count.
 */
const { supabase } = require('../config/supabase');
const { applyProjectTenantScope, isTenantScopeEnforced } = require('./tenantScope');
const { applyProductionCompanyScopeFilter } = require('./crossCompanyWorkspace');
const { applyWorkshopProjectVisibilityScope } = require('./dealParticipantProduction');
const { buildScopeOrFilter, WORKSHOP_STATUSES, getResolvedKanbanStages } = require('./workshopKanban');
const { isHucabiSameDayPastWorkEnd } = require('./companyDeadlineClock');

const VN_TZ = 'Asia/Ho_Chi_Minh';
const SX_KANBAN_COL_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isSxKanbanColumnUuid(id) {
  return SX_KANBAN_COL_UUID_RE.test(String(id || '').trim());
}

const EMPTY_DEADLINE_COUNTS = Object.freeze({
  overdue: 0,
  today: 0,
  this_week: 0,
  next_week: 0,
  this_month: 0,
  later: 0,
  none: 0,
});

function emptyDeadlineCounts() {
  return { ...EMPTY_DEADLINE_COUNTS };
}

function isMissingSxKanbanColumnError(err) {
  return String(err?.message || '').includes('sx_kanban_column_id');
}

function isMissingRpcError(err) {
  const m = String(err?.message || err?.details || '');
  return m.includes('sx_kanban_column_counts')
    || m.includes('Could not find the function')
    || m.includes('PGRST202')
    || err?.code === 'PGRST202'
    || err?.code === '42883';
}

function isSlaDisabled(slaDaysRaw) {
  return slaDaysRaw === 0 || slaDaysRaw === '0';
}

/** YYYY-MM-DD theo lịch VN. */
function formatVnYmd(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: VN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Chuẩn hóa raw deadline → YYYY-MM-DD (date-only giữ nguyên; ISO → ngày VN). */
function toVnDeadlineYmd(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
  if (m && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s.slice(10))) {
    // Naive datetime — lấy phần ngày (thường là ngày giao/deadline lưu local).
    return m[1];
  }
  const t = new Date(s);
  if (!Number.isFinite(t.getTime())) return null;
  return formatVnYmd(t);
}

function diffCalendarDays(ymdA, ymdB) {
  const [ya, ma, da] = ymdA.split('-').map(Number);
  const [yb, mb, db] = ymdB.split('-').map(Number);
  return Math.round((Date.UTC(ya, ma - 1, da) - Date.UTC(yb, mb - 1, db)) / 86400000);
}

/**
 * Bucket Deadline SX — khớp frontend resolveSxDeadlineBucket + shouldHide (bỏ card Đã công).
 * @returns {string|null} null = ẩn khỏi Deadline view
 */
function resolveSxDeadlineBucketKey(row, stage, todayYmd, companyOrId, nowMs = Date.now()) {
  if (stage?.counts_as_completed_revenue) return null;
  const raw = row?.delivery_date || row?.production_deadline || row?.deadline;
  const ymd = toVnDeadlineYmd(raw);
  if (!ymd) return 'none';
  const diffDays = diffCalendarDays(ymd, todayYmd);
  const ignoreOverdue = isSlaDisabled(stage?.sla_days);
  if (diffDays < 0) {
    if (ignoreOverdue) return 'later';
    return 'overdue';
  }
  if (diffDays === 0) {
    if (!ignoreOverdue && isHucabiSameDayPastWorkEnd(raw, companyOrId || row?.company_id, nowMs)) {
      return 'overdue';
    }
    return 'today';
  }
  const [y, m, d] = todayYmd.split('-').map(Number);
  const dowUtc = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const dow = dowUtc === 0 ? 7 : dowUtc;
  const daysToEndOfWeek = 7 - dow;
  if (diffDays <= daysToEndOfWeek) return 'this_week';
  if (diffDays <= daysToEndOfWeek + 7) return 'next_week';
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const endYmd = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  if (ymd <= endYmd) return 'this_month';
  return 'later';
}

async function loadStageFlagsById(companyId, workshopTypeId) {
  try {
    const { stages } = await getResolvedKanbanStages(companyId || null, {
      workshopTypeId: workshopTypeId || null,
    });
    const map = new Map();
    for (const s of stages || []) {
      if (!s?.id) continue;
      map.set(String(s.id), {
        counts_as_completed_revenue: !!s.counts_as_completed_revenue,
        counts_as_collected_revenue: !!s.counts_as_collected_revenue,
        is_handover_to_logistics: !!s.is_handover_to_logistics,
        bucket_slug: s.bucket_slug || null,
        sla_days: s.sla_days,
      });
    }
    return map;
  } catch (err) {
    console.warn('[sxKanbanSummary] stage flags:', err.message || err);
    return new Map();
  }
}

function emptyStageKpis() {
  return { producing: 0, awaiting_delivery: 0, shipped: 0 };
}

/** Khớp sxPipelineRevenue projectIsShipped / awaiting / producing.
 *  `sx_intake` là field enrich (không phải cột DB) — suy từ null column / won_pending. */
function classifyRowStageKpi(row, stage) {
  const status = String(row?.status || '');
  const shipped = !!(row?.logistics_company_id || row?.vc_kanban_column_id)
    || status === 'installing'
    || status === 'warranty'
    || status === 'completed';
  if (shipped) return 'shipped';
  if (stage?.is_handover_to_logistics) return 'awaiting_delivery';
  // Intake / chờ vào xưởng — khớp enrich `sx_intake` trên list.
  if (!row?.sx_kanban_column_id || stage?.bucket_slug === 'won_pending') return null;
  if (stage?.counts_as_completed_revenue) return null;
  if (stage?.counts_as_collected_revenue) return null;
  return 'producing';
}

/**
 * Resolve participant / deal-company project id list once per request.
 * @returns {Promise<string[]|null>} null = không giới hạn; [] = rỗng; array = restrict
 */
async function resolveSxVisibilityRestrictIds(
  user,
  workshopCompanyId,
  sxWorkshopCompanyId,
  dealCompanyId,
) {
  const dummy = supabase.from('projects').select('id').limit(0);
  const { memberProjectIds } = await applyWorkshopProjectVisibilityScope(
    dummy,
    user,
    workshopCompanyId,
    sxWorkshopCompanyId,
    dealCompanyId,
  );
  return memberProjectIds;
}

function applyCreatedToBound(query, createdTo) {
  if (!createdTo) return query;
  const upper = /^\d{4}-\d{2}-\d{2}$/.test(String(createdTo))
    ? `${createdTo}T23:59:59.999Z`
    : createdTo;
  return query.lte('created_at', upper);
}

/**
 * Áp filter list SX lên query — không gọi lại visibility scope (dùng restrictIds đã resolve).
 */
function applySxSummaryFiltersSync(query, ctx) {
  let q = applyProjectTenantScope(query, ctx.req);
  if (String(ctx.sx_intake) === '1') {
    if (!ctx.wonIds?.length) return { empty: true, query: q };
    q = q.in('id', ctx.wonIds);
    if (ctx.stageIds?.length) {
      q = q.or(`current_stage_id.is.null,current_stage_id.not.in.(${ctx.stageIds.join(',')})`);
    }
  } else {
    q = q.or(buildScopeOrFilter(ctx.stageIds || [], ctx.wonIds || []));
  }
  if (ctx.division_id) q = q.eq('division_id', ctx.division_id);
  if (ctx.company_id) {
    q = applyProductionCompanyScopeFilter(q, ctx.company_id, ctx.scopePartnerIds || []);
  }
  if (ctx.wantsUnclassified) q = q.is('workshop_type_id', null);
  else if (ctx.workshop_type_id) q = q.eq('workshop_type_id', ctx.workshop_type_id);

  if (ctx.restrictIds !== null && ctx.restrictIds !== undefined) {
    if (!ctx.restrictIds.length) {
      return {
        empty: true,
        query: q.in('id', ['00000000-0000-0000-0000-000000000000']),
      };
    }
    q = q.in('id', ctx.restrictIds);
  }

  if (ctx.search) {
    const searchPattern = `%${ctx.search}%`;
    q = q.or(`code.ilike.${searchPattern},name.ilike.${searchPattern},notes.ilike.${searchPattern}`);
  }
  if (ctx.priority) q = q.eq('priority', ctx.priority);
  if (ctx.createdFrom) q = q.gte('created_at', ctx.createdFrom);
  q = applyCreatedToBound(q, ctx.createdTo);
  if (ctx.productionPersonId) q = q.eq('production_person_id', ctx.productionPersonId);

  if (ctx.columnMode === '__none__') q = q.is('sx_kanban_column_id', null);
  else if (ctx.columnMode && isSxKanbanColumnUuid(ctx.columnMode)) q = q.eq('sx_kanban_column_id', ctx.columnMode);
  else if (ctx.wantsNullKanbanColumn) q = q.is('sx_kanban_column_id', null);
  else if (ctx.wantsKanbanColumn && isSxKanbanColumnUuid(ctx.sxKanbanColumnId)) {
    q = q.eq('sx_kanban_column_id', ctx.sxKanbanColumnId);
  }

  return { empty: false, query: q };
}

async function tryRpcColumnCounts(ctx) {
  const tenantIds = isTenantScopeEnforced(ctx.req) ? (ctx.req.tenantCompanyIds || []) : null;
  const createdTo = ctx.createdTo
    ? (/^\d{4}-\d{2}-\d{2}$/.test(String(ctx.createdTo))
      ? `${ctx.createdTo}T23:59:59.999Z`
      : ctx.createdTo)
    : null;

  const params = {
    p_stage_ids: ctx.stageIds?.length ? ctx.stageIds : null,
    p_won_ids: ctx.wonIds?.length ? ctx.wonIds : null,
    p_statuses: WORKSHOP_STATUSES,
    p_company_id: ctx.company_id || null,
    p_partner_project_ids: ctx.scopePartnerIds?.length ? ctx.scopePartnerIds : null,
    p_restrict_project_ids: ctx.restrictIds === null || ctx.restrictIds === undefined
      ? null
      : ctx.restrictIds,
    p_tenant_company_ids: tenantIds?.length ? tenantIds : null,
    p_workshop_type_id: ctx.wantsUnclassified ? null : (ctx.workshop_type_id || null),
    p_unclassified: !!ctx.wantsUnclassified,
    p_division_id: ctx.division_id || null,
    p_created_from: ctx.createdFrom || null,
    p_created_to: createdTo,
    p_production_person_id: ctx.productionPersonId || null,
    p_sx_intake_only: String(ctx.sx_intake) === '1',
    p_column_id: ctx.wantsKanbanColumn && isSxKanbanColumnUuid(ctx.sxKanbanColumnId)
      ? ctx.sxKanbanColumnId
      : null,
    p_null_column_only: !!ctx.wantsNullKanbanColumn,
    p_priority: ctx.priority || null,
    p_search: ctx.search || null,
  };

  const { data, error } = await supabase.rpc('sx_kanban_column_counts', params);
  if (error) throw error;
  const total = Number(data?.total) || 0;
  const counts = data?.counts && typeof data.counts === 'object' ? data.counts : {};
  return { total, counts, values: {} };
}

/**
 * Quét mỏng: đếm cột + deadline bucket (cùng filter list SX).
 * @param {{ needColumnCounts?: boolean }} opts
 */
async function thinScanSummary(ctx, opts = {}) {
  const needColumnCounts = opts.needColumnCounts !== false;
  const PAGE = 1000;
  const MAX = 20000;
  const counts = {};
  const deadline_counts = emptyDeadlineCounts();
  const stage_kpis = emptyStageKpis();
  let total = 0;
  let cursor = 0;
  const todayYmd = formatVnYmd(new Date());
  const stageById = opts.stageById || await loadStageFlagsById(ctx.company_id, ctx.workshop_type_id);
  // logistics/status/vc — KPI Đang SX / Chờ VC / Đã VC (toàn filter).
  // Không select `sx_intake` (field enrich, không phải cột DB → 500 summary).
  let selectCols = 'id, company_id, sx_kanban_column_id, delivery_date, production_deadline, deadline, status, logistics_company_id, vc_kanban_column_id';
  let omitVcCol = false;

  while (cursor < MAX) {
    let q = supabase.from('projects').select(selectCols);
    const applied = applySxSummaryFiltersSync(q, { ...ctx, columnMode: undefined });
    if (applied.empty) {
      return {
        total: 0,
        counts: {},
        values: {},
        deadline_counts: emptyDeadlineCounts(),
        stage_kpis: emptyStageKpis(),
      };
    }
    q = applied.query.order('id', { ascending: true }).range(cursor, cursor + PAGE - 1);
    let { data, error } = await q;
    if (error && !omitVcCol && String(error.message || '').includes('vc_kanban_column_id')) {
      omitVcCol = true;
      selectCols = 'id, company_id, sx_kanban_column_id, delivery_date, production_deadline, deadline, status, logistics_company_id';
      continue;
    }
    // Phòng cột enrich/legacy lỡ select — bỏ và thử lại.
    if (error && /sx_intake|column .* does not exist/i.test(String(error.message || ''))) {
      const msg = String(error.message || '');
      if (msg.includes('sx_intake')) {
        selectCols = selectCols.split(', ').filter((c) => c !== 'sx_intake').join(', ');
        continue;
      }
    }
    if (error) throw error;
    const batch = data || [];
    for (const row of batch) {
      if (needColumnCounts) {
        const key = row?.sx_kanban_column_id ? String(row.sx_kanban_column_id) : '__none__';
        counts[key] = (counts[key] || 0) + 1;
      }
      total += 1;
      const colId = row?.sx_kanban_column_id ? String(row.sx_kanban_column_id) : null;
      const stage = colId ? stageById.get(colId) : null;
      const bucket = resolveSxDeadlineBucketKey(row, stage, todayYmd, row.company_id || ctx.company_id);
      if (bucket && Object.prototype.hasOwnProperty.call(deadline_counts, bucket)) {
        deadline_counts[bucket] += 1;
      }
      const kpiKey = classifyRowStageKpi(row, stage);
      if (kpiKey && Object.prototype.hasOwnProperty.call(stage_kpis, kpiKey)) {
        stage_kpis[kpiKey] += 1;
      }
    }
    if (batch.length < PAGE) break;
    cursor += batch.length;
  }
  return { total, counts, values: {}, deadline_counts, stage_kpis };
}

async function headCountTotalOnly(ctx) {
  let q = supabase.from('projects').select('id', { count: 'exact', head: true });
  // Không filter theo cột nếu migration cột chưa có — bỏ columnMode.
  const applied = applySxSummaryFiltersSync(q, {
    ...ctx,
    columnMode: undefined,
    wantsNullKanbanColumn: false,
    wantsKanbanColumn: false,
  });
  if (applied.empty) return 0;
  const { count, error } = await applied.query;
  if (error) throw error;
  return Number(count) || 0;
}

/**
 * @returns {Promise<{ total: number, counts: Record<string, number>, values: Record<string, number>, deadline_counts: Record<string, number> }>}
 */
async function loadSxKanbanColumnSummary(ctx) {
  const [restrictIds, stageById] = await Promise.all([
    resolveSxVisibilityRestrictIds(
      ctx.req.user,
      ctx.company_id,
      ctx.sx_workshop_company_id,
      ctx.deal_company_id,
    ),
    loadStageFlagsById(ctx.company_id, ctx.workshop_type_id),
  ]);
  const fullCtx = { ...ctx, restrictIds };
  const empty = {
    total: 0,
    counts: {},
    values: {},
    deadline_counts: emptyDeadlineCounts(),
    stage_kpis: emptyStageKpis(),
  };

  if (restrictIds !== null && restrictIds !== undefined && !restrictIds.length) {
    return empty;
  }
  if (String(fullCtx.sx_intake) === '1' && !fullCtx.wonIds?.length) {
    return empty;
  }

  // RPC counts + thin-scan (deadline + stage_kpis) song song.
  const rpcPromise = tryRpcColumnCounts(fullCtx).catch((rpcErr) => {
    if (!isMissingRpcError(rpcErr) && !isMissingSxKanbanColumnError(rpcErr)) {
      console.warn('[sxKanbanSummary] rpc:', rpcErr.message || rpcErr);
    }
    return null;
  });
  const scanPromise = thinScanSummary(fullCtx, { needColumnCounts: true, stageById });

  try {
    const [columnResult, scanned] = await Promise.all([rpcPromise, scanPromise]);
    if (columnResult) {
      return {
        ...columnResult,
        deadline_counts: scanned.deadline_counts || emptyDeadlineCounts(),
        stage_kpis: scanned.stage_kpis || emptyStageKpis(),
      };
    }
    return scanned;
  } catch (scanErr) {
    if (isMissingSxKanbanColumnError(scanErr)) {
      const total = await headCountTotalOnly(fullCtx);
      return {
        total,
        counts: {},
        values: {},
        deadline_counts: emptyDeadlineCounts(),
        stage_kpis: emptyStageKpis(),
      };
    }
    throw scanErr;
  }
}

const DEADLINE_BUCKET_KEYS = Object.keys(EMPTY_DEADLINE_COUNTS);

/**
 * Trang dự án theo deadline bucket (Quá hạn / Hôm nay / …) — cùng filter summary.
 * Trả ids đã sort theo ngày deadline ASC để FE merge vào board.
 */
async function loadSxDeadlineBucketPage(ctx, { bucket, offset = 0, limit = 24 } = {}) {
  const bucketKey = String(bucket || '').trim();
  if (!DEADLINE_BUCKET_KEYS.includes(bucketKey)) {
    return { ids: [], total: 0, nextOffset: 0, hasMore: false, bucket: bucketKey };
  }
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 24, 1), 50);

  const [restrictIds, stageById] = await Promise.all([
    resolveSxVisibilityRestrictIds(
      ctx.req.user,
      ctx.company_id,
      ctx.sx_workshop_company_id,
      ctx.deal_company_id,
    ),
    loadStageFlagsById(ctx.company_id, ctx.workshop_type_id),
  ]);
  const fullCtx = { ...ctx, restrictIds };

  if (restrictIds !== null && restrictIds !== undefined && !restrictIds.length) {
    return { ids: [], total: 0, nextOffset: 0, hasMore: false, bucket: bucketKey };
  }
  if (String(fullCtx.sx_intake) === '1' && !fullCtx.wonIds?.length) {
    return { ids: [], total: 0, nextOffset: 0, hasMore: false, bucket: bucketKey };
  }

  const PAGE = 1000;
  const MAX = 20000;
  const todayYmd = formatVnYmd(new Date());
  const entries = [];
  let cursor = 0;
  let selectCols = 'id, company_id, sx_kanban_column_id, delivery_date, production_deadline, deadline';

  while (cursor < MAX) {
    let q = supabase.from('projects').select(selectCols);
    const applied = applySxSummaryFiltersSync(q, { ...fullCtx, columnMode: undefined });
    if (applied.empty) {
      return { ids: [], total: 0, nextOffset: 0, hasMore: false, bucket: bucketKey };
    }
    q = applied.query.order('id', { ascending: true }).range(cursor, cursor + PAGE - 1);
    let { data, error } = await q;
    if (error && /sx_intake|column .* does not exist/i.test(String(error.message || ''))) {
      selectCols = selectCols.split(', ').filter((c) => c !== 'sx_intake').join(', ');
      continue;
    }
    if (error) throw error;
    const batch = data || [];
    for (const row of batch) {
      const colId = row?.sx_kanban_column_id ? String(row.sx_kanban_column_id) : null;
      const stage = colId ? stageById.get(colId) : null;
      const b = resolveSxDeadlineBucketKey(row, stage, todayYmd, row.company_id || fullCtx.company_id);
      if (b !== bucketKey) continue;
      const ymd = toVnDeadlineYmd(row?.delivery_date || row?.production_deadline || row?.deadline) || '9999-99-99';
      entries.push({ id: String(row.id), ymd });
    }
    if (batch.length < PAGE) break;
    cursor += batch.length;
  }

  entries.sort((a, b) => a.ymd.localeCompare(b.ymd) || a.id.localeCompare(b.id));
  const total = entries.length;
  const page = entries.slice(safeOffset, safeOffset + safeLimit);
  const nextOffset = safeOffset + page.length;
  return {
    ids: page.map((e) => e.id),
    total,
    nextOffset,
    hasMore: nextOffset < total,
    bucket: bucketKey,
  };
}

module.exports = {
  loadSxKanbanColumnSummary,
  loadSxDeadlineBucketPage,
  resolveSxVisibilityRestrictIds,
  // export nhỏ để unit/smoke nếu cần
  resolveSxDeadlineBucketKey,
  toVnDeadlineYmd,
  DEADLINE_BUCKET_KEYS,
};
