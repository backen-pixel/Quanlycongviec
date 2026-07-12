/**
 * CRM Leads list — kanban/list bootstrap, stage counts, picker.
 */
const { Router } = require('express');
const { supabase } = require('../../../config/supabase');
const { responseCache } = require('../../../middleware/responseCache');
const {
  userSeesAllCrmDealsForScope,
  userSeesAllCrmLeadsForScope,
} = require('../../../helpers/crmAccessRoles');
const {
  applyCrmLeadRegionFilterToQuery,
  assertLeadReadableByRegionScope,
  resolveRpcRegionIdsForCrmList,
} = require('../../../helpers/crmRegionScope');
const { attachLeadUserFlagsForList } = require('../../../helpers/crmLeadUserFlags');
const {
  userIsAdmin,
  scopedAdminCompanyId,
  requireUserCompanyId,
  requireUserCompanyIdResolved,
} = require('../shared/requestScope');
const {
  parseLeadIdsCsvQuery,
  resolveCrmLeadsKanbanLite,
  resolveCrmLeadsSkipDeadline,
  fetchCrmLeadsByIdsOrdered,
  attachLeadNewFlagForList,
  attachCrmNextOpenTaskDeadline,
  uuidQueryOrNull,
  sanitizeIsoDateQueryParam,
  parseCrmLeadsPageRpc,
  getCrmLeadsListLegacy,
  invokeCrmLeadsStageCountsRpc,
  buildCrmLeadsRpcFilterParams,
  computeCrmDashboardLightStats,
  resolveCrmLeadsMergedQuery,
  hydrateCrmLeadsRpcPage,
  resolveKanbanStagesForCompany,
  crmListUsesLegacyFilters,
  fetchCrmLeadsPageViaRpc,
  buildCrmDashboardMinimalKpis,
} = require('../shared/leadsListHelpers');
const { defaultKpiLedgerMonthStartYmd } = require('../shared/kpiHelpers');

const r = Router();

r.get('/kanban-rows', async (req, res) => {
  try {
    const leadIds = parseLeadIdsCsvQuery(req.query.lead_ids, 50);
    if (!leadIds.length) return res.json({ data: [] });

    const sac = scopedAdminCompanyId(req);
    if (!userIsAdmin(req.user?.role) && !sac) {
      const cid = await requireUserCompanyIdResolved(req, res);
      if (!cid) return;
    }

    const lite = resolveCrmLeadsKanbanLite(req.query);
    const skipDeadline = resolveCrmLeadsSkipDeadline(req.query);
    let hydrated = await fetchCrmLeadsByIdsOrdered(leadIds, { skipEnrich: lite, lite });

    if (sac) {
      hydrated = hydrated.filter((r) => String(r.company_id || '') === String(sac));
    } else if (!userIsAdmin(req.user?.role)) {
      const { resolveCompanyIdForUser } = require('../../middleware/auth');
      const cid = await resolveCompanyIdForUser(req.user?.userId);
      if (cid) hydrated = hydrated.filter((r) => String(r.company_id || '') === String(cid));
    }
    hydrated = hydrated.filter((r) => {
      const ar = assertLeadReadableByRegionScope(req, r);
      return ar.ok;
    });

    let page = attachLeadNewFlagForList(hydrated, req.user?.userId);
    if (!skipDeadline) page = await attachCrmNextOpenTaskDeadline(page);
    page = await attachLeadUserFlagsForList(page, req.user?.userId);
    res.json({ data: page });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Lỗi tải kanban-rows' });
  }
});

// ── Endpoint nhẹ cho deal/lead picker (form báo giá, Excel import…) ──
// Trả về list ngắn gọn, đã filter theo company của user + region scope (qua JWT).
// Query: q (search), type=deal|lead (default deal), customer_id, company_id, region_id, limit (max 50).
r.get('/leads/picker', async (req, res) => {
  try {
    const type = req.query.type === 'lead' ? 'lead' : 'deal';
    const q = String(req.query.q || '').trim();
    const customerId = uuidQueryOrNull(req.query.customer_id);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);

    // crm_leads không có cột `status` — trạng thái suy ra từ stage / actual_close_date.
    let query = supabase
      .from('crm_leads')
      .select(
        'id, code, title, type, stage_id, company_id, region_id, customer_id, ' +
          'assigned_to, lead_owner_id, estimated_value, created_at, actual_close_date, ' +
          'customer:customers(id, full_name, phone), ' +
          'company:companies!crm_leads_company_id_fkey(id, name, short_name), ' +
          'region:company_regions!crm_leads_region_id_fkey(id, name, code), ' +
          'assignee:users!crm_leads_assigned_to_fkey(id, full_name, email)',
      )
      .eq('type', type)
      .order('updated_at', { ascending: false })
      .limit(limit);

    // Scope theo công ty: admin công ty / nhân viên thường khoá theo company_id của user.
    const sac = scopedAdminCompanyId(req);
    if (sac) {
      query = query.eq('company_id', sac);
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = requireUserCompanyId(req, res);
      if (!cid) return;
      query = query.eq('company_id', cid);
    } else if (uuidQueryOrNull(req.query.company_id)) {
      query = query.eq('company_id', uuidQueryOrNull(req.query.company_id));
    }

    // Scope theo khu vực
    query = applyCrmLeadRegionFilterToQuery(query, req);
    if (uuidQueryOrNull(req.query.region_id)) {
      query = query.eq('region_id', uuidQueryOrNull(req.query.region_id));
    }

    if (customerId) query = query.eq('customer_id', customerId);

    if (q) {
      // Search theo code / title / SĐT / tên KH (dùng OR PostgREST)
      const safe = q.replace(/[(),]/g, ' ').replace(/\s+/g, '%');
      query = query.or(
        `code.ilike.%${safe}%,title.ilike.%${safe}%,phone.ilike.%${safe}%`,
      );
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({
      type,
      total: (data || []).length,
      results: (data || []).map((l) => ({
        id: l.id,
        code: l.code,
        title: l.title,
        type: l.type,
        is_closed: !!l.actual_close_date,
        stage_id: l.stage_id,
        company_id: l.company_id,
        company_name: l.company?.short_name || l.company?.name || null,
        region_id: l.region_id,
        region_name: l.region?.name || null,
        customer_id: l.customer_id,
        customer_name: l.customer?.full_name || null,
        customer_phone: l.customer?.phone || null,
        assigned_to: l.assigned_to,
        assignee_name: l.assignee?.full_name || null,
        estimated_value: l.estimated_value || 0,
        created_at: l.created_at,
      })),
    });
  } catch (e) {
    console.error('[leads/picker]', e);
    res.status(500).json({ error: e.message || 'Lỗi tìm deal' });
  }
});

/** GET /crm/stage-counts — đếm tất cả cột trong 1 request (RPC GROUP BY stage_id). */
r.get('/stage-counts', responseCache({ ttl: 90, scope: 'user', tags: ['crm:list'] }), async (req, res) => {
  try {
    const ctx = await resolveCrmLeadsMergedQuery(req, res);
    if (!ctx) return;
    const { type, mergedQuery, rpcAssigneeStrict, rpcRegionIds } = ctx;
    if (crmListUsesLegacyFilters(mergedQuery)) {
      return res.status(400).json({ error: 'Bộ lọc hiện tại chưa hỗ trợ stage-counts batch. Dùng GET /crm/leads từng cột.' });
    }

    const stages = await resolveKanbanStagesForCompany(
      type,
      uuidQueryOrNull(mergedQuery.company_id),
      mergedQuery.region_id,
      req,
    );
    const stageIds = stages.map((s) => s.id).filter(Boolean);
    const filterParams = buildCrmLeadsRpcFilterParams(mergedQuery, type, rpcAssigneeStrict, rpcRegionIds);
    // Không lọc p_pipeline_stage_ids — gồm deal gắn stage pipeline công ty khác (vd. Metalla import FB).
    const rpcParams = {
      ...filterParams,
      p_pipeline_stage_ids: null,
    };

    const parsed = await invokeCrmLeadsStageCountsRpc(rpcParams);
    if (parsed) {
      return res.json({
        total: parsed.total,
        counts: parsed.counts,
        values: parsed.values,
        weighted_values: parsed.weightedValues,
      });
    }

    const counts = {};
    const STAGE_COUNT_FALLBACK_CONCURRENCY = 6;
    for (let i = 0; i < stageIds.length; i += STAGE_COUNT_FALLBACK_CONCURRENCY) {
      const chunk = stageIds.slice(i, i + STAGE_COUNT_FALLBACK_CONCURRENCY);
      const pairs = await Promise.all(
        chunk.map(async (sid) => {
          const pageRpc = {
            ...filterParams,
            p_stage_id: sid,
            p_limit: 1,
            p_offset: 0,
          };
          try {
            let { data: rpcData, error: rpcError } = await supabase.rpc('crm_leads_page_ids', pageRpc);
            if (rpcError) return [sid, 0];
            const p = parseCrmLeadsPageRpc(rpcData);
            return [sid, p ? p.total : 0];
          } catch {
            return [sid, 0];
          }
        }),
      );
      for (const [sid, total] of pairs) counts[sid] = total;
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    res.json({ total, counts, fallback: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


/** GET /crm/leads-deadlines — hạn task CRM mở theo lead_ids (nền sau bootstrap). */
r.get('/leads-deadlines', responseCache({ ttl: 30, scope: 'user', tags: ['crm:list'] }), async (req, res) => {
  try {
    const leadIds = parseLeadIdsCsvQuery(req.query.lead_ids, 500);
    if (!leadIds.length) return res.json({ deadlines: {} });
    const stubRows = leadIds.map((id) => ({ id }));
    const enriched = await attachCrmNextOpenTaskDeadline(stubRows);
    const deadlines = {};
    for (const row of enriched) {
      deadlines[String(row.id)] = row.crm_next_open_task_deadline ?? null;
    }
    res.json({ deadlines });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/web-dashboard-bootstrap', responseCache({ ttl: 15, scope: 'user', tags: ['crm:list'] }), async (req, res) => {
  try {
    const ctx = await resolveCrmLeadsMergedQuery(req, res);
    if (!ctx) return;
    const { type, mergedQuery, rpcAssigneeStrict, rpcRegionIds } = ctx;
    if (crmListUsesLegacyFilters(mergedQuery)) {
      return res.status(400).json({ error: 'Bộ lọc hiện tại chưa hỗ trợ web-dashboard-bootstrap. Dùng GET /crm/leads.' });
    }

    const companyId = uuidQueryOrNull(mergedQuery.company_id);
    const parsedLimit = Math.min(Math.max(parseInt(req.query.limit) || 500, 1), 2000);
    const skipDeadline = resolveCrmLeadsSkipDeadline(mergedQuery, { skipDeadline: true });
    const lite = resolveCrmLeadsKanbanLite(mergedQuery, { lite: true });
    const ledgerPeriodStart = defaultKpiLedgerMonthStartYmd();

    const stagesPromise = resolveKanbanStagesForCompany(type, companyId, mergedQuery.region_id, req);
    const kanbanPromise = fetchCrmLeadsPageViaRpc(req, mergedQuery, type, 0, parsedLimit, {
      lite,
      skipDeadline,
    });

    const [stages, kanbanPage] = await Promise.all([stagesPromise, kanbanPromise]);
    if (!kanbanPage) {
      return res.status(500).json({ error: 'Không tải được dữ liệu kanban' });
    }

    const lightStats = await computeCrmDashboardLightStats(req, type, {
      effectiveCompanyId: companyId,
      region_id: uuidQueryOrNull(mergedQuery.region_id),
      stages: stages || [],
      assigned_to_only: uuidQueryOrNull(mergedQuery.assigned_to),
      date_from: mergedQuery.date_from,
      date_to: mergedQuery.date_to,
      phone_filter: mergedQuery.phone_filter,
    });
    const totalItems = lightStats.totalItems ?? kanbanPage.total ?? 0;
    const wonItemCount = lightStats.wonCount || 0;
    const kpis = buildCrmDashboardMinimalKpis(type, totalItems, wonItemCount, 0, 0, ledgerPeriodStart);

    res.json({
      type,
      stages: stages || [],
      dashboard: {
        pipeline: lightStats.stageStats,
        kpis,
        ledger_net_by_lead: {},
        recent_quotations: [],
        recent_orders: [],
        light: true,
        minimal: true,
      },
      kanban: kanbanPage,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET /crm/kanban-bootstrap — stages + counts + trang đầu cột active trong 1 round-trip. */
r.get('/kanban-bootstrap', responseCache({ ttl: 15, scope: 'user', tags: ['crm:list'] }), async (req, res) => {
  try {
    const ctx = await resolveCrmLeadsMergedQuery(req, res);
    if (!ctx) return;
    const { type, mergedQuery, rpcAssigneeStrict, rpcRegionIds } = ctx;
    if (crmListUsesLegacyFilters(mergedQuery)) {
      return res.status(400).json({ error: 'Bộ lọc hiện tại chưa hỗ trợ kanban-bootstrap. Dùng GET /crm/leads.' });
    }

    const companyId = uuidQueryOrNull(mergedQuery.company_id);
    const regionId = mergedQuery.region_id;
    const parsedLimit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 200);
    const requestedStageId = uuidQueryOrNull(req.query.stage_id);
    const skipCounts = req.query.skip_counts === '1' || req.query.skip_counts === 'true';
    const lite = req.query.lite === '1' || req.query.lite === 'true';

    const stages = await resolveKanbanStagesForCompany(type, companyId, regionId, req);
    const stageIds = stages.map((s) => String(s.id)).filter(Boolean);
    const initialStageId =
      requestedStageId && stageIds.includes(String(requestedStageId))
        ? String(requestedStageId)
        : (stageIds[0] || '');

    const filterParams = buildCrmLeadsRpcFilterParams(mergedQuery, type, rpcAssigneeStrict, rpcRegionIds);

    const loadInitialPage = async () => {
      if (!initialStageId) {
        return { data: [], total: 0, offset: 0, limit: parsedLimit, hasMore: false, nextOffset: 0 };
      }
      const pageRpc = {
        ...filterParams,
        p_stage_id: initialStageId,
        p_limit: parsedLimit,
        p_offset: 0,
      };
      let { data: rpcData, error: rpcError } = await supabase.rpc('crm_leads_page_ids', pageRpc);
      if (rpcError && /crm_leads_page_ids|does not exist|Could not find|argument/i.test(String(rpcError.message || ''))) {
        const { p_region_ids: _r, ...noRegion } = pageRpc;
        const r2 = await supabase.rpc('crm_leads_page_ids', noRegion);
        if (!r2.error) {
          rpcData = r2.data;
          rpcError = null;
        }
      }
      const parsedRpc = !rpcError ? parseCrmLeadsPageRpc(rpcData) : null;
      if (!parsedRpc) return null;
      return hydrateCrmLeadsRpcPage(parsedRpc, req, 0, parsedLimit, { lite });
    };

    const initialPage = await loadInitialPage();
    if (!initialPage) {
      return res.status(500).json({ error: 'Không tải được trang kanban' });
    }

    if (skipCounts) {
      const stageCounts = {};
      if (initialStageId) stageCounts[initialStageId] = initialPage.total;
      return res.json({
        stages,
        stageCounts,
        listTotal: initialPage.total,
        initialStageId,
        skipCounts: true,
        initialPage: {
          data: initialPage.data,
          total: initialPage.total,
          hasMore: initialPage.hasMore,
          nextOffset: initialPage.nextOffset,
        },
      });
    }

    const countsParsed = await invokeCrmLeadsStageCountsRpc({
      ...filterParams,
      p_pipeline_stage_ids: stageIds.length ? stageIds : null,
    });

    const stageCounts = countsParsed?.counts || {};
    if (initialStageId && stageCounts[initialStageId] === undefined) {
      stageCounts[initialStageId] = initialPage.total;
    }

    res.json({
      stages,
      stageCounts,
      listTotal: countsParsed?.total ?? initialPage.total,
      initialStageId,
      initialPage: {
        data: initialPage.data,
        total: initialPage.total,
        hasMore: initialPage.hasMore,
        nextOffset: initialPage.nextOffset,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/leads', responseCache({ ttl: 15, scope: 'user', tags: ['crm:list'] }), async (req, res) => {
  try {
    const type = req.query.type || 'lead';
    const forcedDealSelf = type === 'deal' && req.user?.userId && !userSeesAllCrmDealsForScope(req.user);
    const forcedLeadSelf = type === 'lead' && req.user?.userId && !userSeesAllCrmLeadsForScope(req.user);
    let mergedQuery =
      forcedDealSelf || forcedLeadSelf ? { ...req.query, assigned_to: req.user.userId } : { ...req.query };
    const sacLeads = scopedAdminCompanyId(req);
    if (sacLeads) {
      mergedQuery = { ...mergedQuery, company_id: sacLeads };
    } else if (!userIsAdmin(req.user?.role)) {
      const cid = await requireUserCompanyIdResolved(req, res);
      if (!cid) return;
      mergedQuery = { ...mergedQuery, company_id: cid };
    }
    const { stage_id, assigned_to, source_id, search, limit = 100, offset = 0, company_id, date_from, date_to, phone_filter, lead_type_id } = mergedQuery;
    const parsedLimit = Math.min(Math.max(parseInt(limit) || 100, 1), 2000);
    const parsedOffset = Math.max(parseInt(offset) || 0, 0);

    const dealAssigneeStrict = type === 'deal' && (!!uuidQueryOrNull(assigned_to) || forcedDealSelf);
    const leadAssigneeStrict = type === 'lead' && (!!uuidQueryOrNull(assigned_to) || forcedLeadSelf);
    const rpcAssigneeStrict = dealAssigneeStrict || leadAssigneeStrict;

    const referrerNameQuery = String(mergedQuery.referrer_name || '').trim();
    const customerCompanyQuery = String(mergedQuery.customer_company || '').trim();

    // RPC `crm_leads_page_ids` (database/58_...) không có tham số p_lead_type_id — gửi thêm sẽ khiến PostgREST
    // không resolve được function → 500. Lọc theo lead_type_id / referrer_name / customer_company chỉ dùng legacy.
    if (uuidQueryOrNull(lead_type_id) || referrerNameQuery || customerCompanyQuery) {
      const legacy = await getCrmLeadsListLegacy(mergedQuery, {
        assigneeStrict: rpcAssigneeStrict,
        viewerUserId: req.user?.userId,
        req,
        lite: resolveCrmLeadsKanbanLite(mergedQuery),
      });
      return res.json(legacy);
    }

    const legacyFollowUpFrom = sanitizeIsoDateQueryParam(mergedQuery.next_follow_up_from);
    const legacyFollowUpTo = sanitizeIsoDateQueryParam(mergedQuery.next_follow_up_to);
    const legacyFollowUpEmpty =
      mergedQuery.next_follow_up_empty === 'true' || mergedQuery.next_follow_up_empty === '1';
    const legacyPipelineId = uuidQueryOrNull(mergedQuery.pipeline_id);
    const forceLegacyExtended = !!(
      legacyFollowUpFrom ||
      legacyFollowUpTo ||
      legacyFollowUpEmpty ||
      legacyPipelineId
    );
    if (forceLegacyExtended) {
      const legacy = await getCrmLeadsListLegacy(mergedQuery, {
        assigneeStrict: rpcAssigneeStrict,
        viewerUserId: req.user?.userId,
        req,
        lite: resolveCrmLeadsKanbanLite(mergedQuery),
      });
      return res.json(legacy);
    }

    const rpcRegionIds = resolveRpcRegionIdsForCrmList(req, mergedQuery.region_id);

    const rpcParams = {
      p_type: type,
      p_stage_id: uuidQueryOrNull(stage_id),
      p_assigned_to: uuidQueryOrNull(assigned_to),
      p_source_id: uuidQueryOrNull(source_id),
      p_company_id: uuidQueryOrNull(company_id),
      p_date_from: sanitizeIsoDateQueryParam(date_from),
      p_date_to: sanitizeIsoDateQueryParam(date_to),
      p_search: search || null,
      p_phone_filter: phone_filter || null,
      p_limit: parsedLimit,
      p_offset: parsedOffset,
      p_assigned_strict: rpcAssigneeStrict,
      p_region_ids: rpcRegionIds,
    };

    let { data: rpcData, error: rpcError } = await supabase.rpc('crm_leads_page_ids', rpcParams);
    // DB cũ: không có p_region_ids — thử bỏ tham số cuối
    if (rpcError && /crm_leads_page_ids|does not exist|Could not find|argument/i.test(String(rpcError.message || ''))) {
      const { p_region_ids: _reg, ...rpcNoRegion } = rpcParams;
      let r2 = await supabase.rpc('crm_leads_page_ids', rpcNoRegion);
      if (r2.error && /crm_leads_page_ids|does not exist|Could not find/i.test(String(r2.error.message || ''))) {
        const { p_assigned_strict: _s, ...rpcLegacy } = rpcNoRegion;
        r2 = await supabase.rpc('crm_leads_page_ids', rpcLegacy);
      }
      if (!r2.error) {
        rpcData = r2.data;
        rpcError = null;
      }
    }

    const parsedRpc = !rpcError ? parseCrmLeadsPageRpc(rpcData) : null;
    const rpcOk = !!parsedRpc;
    const lite = resolveCrmLeadsKanbanLite(mergedQuery);
    const skipDeadline = resolveCrmLeadsSkipDeadline(mergedQuery);

    if (rpcOk) {
      const pageResult = await hydrateCrmLeadsRpcPage(parsedRpc, req, parsedOffset, parsedLimit, { lite, skipDeadline });
      return res.json(pageResult);
    }

    if (rpcError) {
      console.warn('[crm/leads] crm_leads_page_ids RPC unavailable, using legacy (max 5000 rows):', rpcError.message);
    }
    const legacy = await getCrmLeadsListLegacy(mergedQuery, {
      assigneeStrict: rpcAssigneeStrict,
      viewerUserId: req.user?.userId,
      req,
      lite,
    });
    return res.json(legacy);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;
