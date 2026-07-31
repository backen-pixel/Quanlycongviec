/**
 * SX Kanban summary counts — ưu tiên 1 RPC GROUP BY; fallback quét mỏng 1 cột.
 * Mục tiêu Render: ít roundtrip Supabase hơn N× head-count.
 */
const { supabase } = require('../config/supabase');
const { applyProjectTenantScope, isTenantScopeEnforced } = require('./tenantScope');
const { applyProductionCompanyScopeFilter } = require('./crossCompanyWorkspace');
const { applyWorkshopProjectVisibilityScope } = require('./dealParticipantProduction');
const { buildScopeOrFilter, WORKSHOP_STATUSES } = require('./workshopKanban');

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
  else if (ctx.columnMode) q = q.eq('sx_kanban_column_id', ctx.columnMode);
  else if (ctx.wantsNullKanbanColumn) q = q.is('sx_kanban_column_id', null);
  else if (ctx.wantsKanbanColumn) q = q.eq('sx_kanban_column_id', ctx.sxKanbanColumnId);

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
    p_column_id: ctx.wantsKanbanColumn ? ctx.sxKanbanColumnId : null,
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

/** Quét mỏng chỉ cột — 1–vài roundtrip thay vì N COUNT. */
async function thinScanColumnCounts(ctx) {
  const PAGE = 1000;
  const MAX = 20000;
  const counts = {};
  let total = 0;
  let cursor = 0;

  while (cursor < MAX) {
    let q = supabase.from('projects').select('sx_kanban_column_id');
    const applied = applySxSummaryFiltersSync(q, { ...ctx, columnMode: undefined });
    if (applied.empty) return { total: 0, counts: {}, values: {} };
    q = applied.query.order('id', { ascending: true }).range(cursor, cursor + PAGE - 1);
    const { data, error } = await q;
    if (error) throw error;
    const batch = data || [];
    for (const row of batch) {
      const key = row?.sx_kanban_column_id ? String(row.sx_kanban_column_id) : '__none__';
      counts[key] = (counts[key] || 0) + 1;
      total += 1;
    }
    if (batch.length < PAGE) break;
    cursor += batch.length;
  }
  return { total, counts, values: {} };
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
 * @returns {Promise<{ total: number, counts: Record<string, number>, values: Record<string, number> }>}
 */
async function loadSxKanbanColumnSummary(ctx) {
  const restrictIds = await resolveSxVisibilityRestrictIds(
    ctx.req.user,
    ctx.company_id,
    ctx.sx_workshop_company_id,
    ctx.deal_company_id,
  );
  const fullCtx = { ...ctx, restrictIds };

  if (restrictIds !== null && restrictIds !== undefined && !restrictIds.length) {
    return { total: 0, counts: {}, values: {} };
  }
  if (String(fullCtx.sx_intake) === '1' && !fullCtx.wonIds?.length) {
    return { total: 0, counts: {}, values: {} };
  }

  try {
    return await tryRpcColumnCounts(fullCtx);
  } catch (rpcErr) {
    if (!isMissingRpcError(rpcErr) && !isMissingSxKanbanColumnError(rpcErr)) {
      // RPC lỗi khác — vẫn thử thin scan trước khi fail cứng.
      console.warn('[sxKanbanSummary] rpc:', rpcErr.message || rpcErr);
    }
  }

  try {
    return await thinScanColumnCounts(fullCtx);
  } catch (scanErr) {
    if (isMissingSxKanbanColumnError(scanErr)) {
      const total = await headCountTotalOnly(fullCtx);
      return { total, counts: {}, values: {} };
    }
    throw scanErr;
  }
}

module.exports = {
  loadSxKanbanColumnSummary,
  resolveSxVisibilityRestrictIds,
};
