const { supabase } = require('../config/supabase');
const { isAdminLike } = require('./adminRole');
const {
  getAccountingCompanyId,
  isAccountingUser,
  crmDealBelongsToAccountingCompany,
  applyAccountingCrmCompanyFilter,
  getAccountingScopedProjectIds,
  getAccountingClientProjectIdsAtWorkshop,
} = require('./accountingScope');
const { filterProjectIdsBySxWorkshopCompany } = require('./dealParticipantProduction');
const {
  getResolvedKanbanStages,
  getWonDealProjectIds,
  resolveSxDisplayColumnId,
} = require('./workshopKanban');

function unwrapEmbed(row) {
  if (!row) return null;
  return Array.isArray(row) ? row[0] : row;
}

async function buildSxStageContext(projects) {
  const wonIds = await getWonDealProjectIds();
  const wonSet = new Set(wonIds);
  const companyIds = [...new Set((projects || []).map((p) => p.company_id).filter(Boolean))];
  const kanbanByCompany = new Map();
  await Promise.all(companyIds.map(async (coId) => {
    const { stages } = await getResolvedKanbanStages(coId, { workshopTypeId: null });
    const sorted = [...(stages || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    kanbanByCompany.set(String(coId), sorted);
  }));
  return { wonSet, kanbanByCompany };
}

function resolveSxStageInfo(deal, project, ctx) {
  const embedded = unwrapEmbed(deal?.sx_pipeline_stage);
  if (embedded?.name || embedded?.id) {
    return {
      sx_stage_name: embedded.name || null,
      sx_stage_color: embedded.color || null,
      sx_bucket_slug: embedded.bucket_slug || null,
      sx_is_handover: embedded.is_handover_to_logistics === true,
    };
  }
  if (!project) return {};
  const sorted = ctx.kanbanByCompany.get(String(project.company_id)) || [];
  const leadMeta = {
    sx_pipeline_stage_id: deal?.sx_pipeline_stage_id || null,
    sx_handover_at: deal?.sx_handover_at || null,
  };
  const colId = resolveSxDisplayColumnId(project, sorted, {
    leadMeta,
    sxWonDeal: ctx.wonSet.has(project.id),
    hasSxHandover: Boolean(leadMeta.sx_handover_at),
  });
  const sxStage = colId ? sorted.find((s) => String(s.id) === String(colId)) : null;
  return {
    sx_stage_name: sxStage?.name || null,
    sx_stage_color: sxStage?.color || null,
    sx_bucket_slug: sxStage?.bucket_slug || null,
    sx_is_handover: sxStage?.is_handover_to_logistics === true,
  };
}

function resolveAccountingCompanyId(user, queryClientCompanyId) {
  if (isAccountingUser(user)) return getAccountingCompanyId(user);
  if (isAdminLike(user) && queryClientCompanyId) return String(queryClientCompanyId).trim();
  return null;
}

/** Công ty xưởng liên kết + công ty nội bộ (client tự SX). */
async function listWorkshopsForClientCompany(clientCompanyId) {
  if (!clientCompanyId) return [];
  const ac = String(clientCompanyId);
  const ids = new Set([ac]);

  const { data: links, error: linkErr } = await supabase
    .from('production_workshop_client_companies')
    .select('production_company_id')
    .eq('client_company_id', ac)
    .eq('is_active', true);
  if (!linkErr) {
    for (const row of links || []) {
      if (row?.production_company_id) ids.add(String(row.production_company_id));
    }
  } else if (!String(linkErr.message || '').includes('does not exist')) {
    console.warn('[accountingDeals] workshop links:', linkErr.message);
  }

  const { data: cos, error: coErr } = await supabase
    .from('companies')
    .select('id, name, short_name, is_active')
    .in('id', [...ids])
    .or('is_active.eq.true,is_active.is.null')
    .order('name');
  if (coErr) {
    console.warn('[accountingDeals] companies:', coErr.message);
    return [];
  }
  return (cos || []).map((c) => ({
    id: c.id,
    name: c.name,
    short_name: c.short_name || null,
    is_own_company: String(c.id) === ac,
  }));
}

async function resolveScopedProjectIds(clientCompanyId, workshopCompanyId) {
  let projectIds;
  if (workshopCompanyId && String(workshopCompanyId) !== String(clientCompanyId)) {
    projectIds = await getAccountingClientProjectIdsAtWorkshop(workshopCompanyId, clientCompanyId);
  } else if (workshopCompanyId) {
    projectIds = await getAccountingScopedProjectIds(clientCompanyId);
    projectIds = await filterProjectIdsBySxWorkshopCompany(projectIds, workshopCompanyId);
  } else {
    projectIds = await getAccountingScopedProjectIds(clientCompanyId);
  }
  return projectIds || [];
}

function normalizeSearch(q) {
  return String(q || '').trim().toLowerCase();
}

function dealMatchesSearch(row, searchNorm) {
  if (!searchNorm) return true;
  const parts = [
    row.code,
    row.title,
    row.customer_name,
    row.customer_phone,
    row.project_code,
    row.workshop_name,
  ];
  return parts.some((p) => String(p || '').toLowerCase().includes(searchNorm));
}

const FINANCIAL_STATUS = {
  NO_QUOTE: 'no_quote',
  QUOTED: 'quoted',
  ORDERED: 'ordered',
  INVOICED: 'invoiced',
};

const FINANCIAL_STATUS_LABELS = {
  no_quote: 'Chưa BG',
  quoted: 'Có BG',
  ordered: 'Có ĐH',
  invoiced: 'Đã HĐ',
};

/** Cột SX coi là hoàn thành / sẵn sàng bàn giao. */
function isSxProductionDone(row) {
  if (row.sx_handover_at) return true;
  if (row.sx_is_handover) return true;
  if (row.sx_bucket_slug === 'delivery_pending') return true;
  const name = String(row.sx_stage_name || '').toLowerCase();
  if (/bàn giao|ban giao|handover|vận chuyển|van chuyen|hoàn thành|xong sx|thu tiền|done/i.test(name)) {
    return true;
  }
  const st = String(row.project_status || '').toLowerCase();
  return ['completed', 'done', 'delivered', 'finished'].includes(st);
}

function deriveFinancialStatus(row) {
  if (row.invoice_total != null && row.invoice_total > 0) return FINANCIAL_STATUS.INVOICED;
  if (row.order_total != null && row.order_total > 0) return FINANCIAL_STATUS.ORDERED;
  if (row.quotation_total != null && row.quotation_total > 0) return FINANCIAL_STATUS.QUOTED;
  return FINANCIAL_STATUS.NO_QUOTE;
}

/** Tiền cọc đã nhận — ưu tiên projects.deposit_amount, fallback deal. */
function resolveAccountingDeposit(row) {
  const pd = Number(row?.deposit_amount);
  if (Number.isFinite(pd) && pd > 0) return pd;
  const dd = Number(row?.deal_deposit_amount);
  if (Number.isFinite(dd) && dd > 0) return dd;
  return 0;
}

/** Còn thu = (Đơn / Giá SX) − Tiền cọc − Đã HĐ. Đồng bộ công nợ SX (production − deposit). */
function computeOutstandingAmount(row) {
  const invoiced = row.invoice_total != null ? Number(row.invoice_total) || 0 : 0;
  const basis = row.order_total != null
    ? Number(row.order_total) || 0
    : (row.production_value || row.estimated_value || 0);
  const deposit = resolveAccountingDeposit(row);
  return Math.max(0, basis - deposit - invoiced);
}

function applyFinancialFilters(rows, { financialStatus, sxDoneNotInvoiced }) {
  let out = rows;
  if (financialStatus) {
    const fs = String(financialStatus).trim();
    out = out.filter((r) => r.financial_status === fs);
  }
  if (sxDoneNotInvoiced === true || sxDoneNotInvoiced === 'true' || sxDoneNotInvoiced === '1') {
    out = out.filter((r) => r.sx_production_done && r.financial_status !== FINANCIAL_STATUS.INVOICED);
  }
  return out;
}

function finalizeDealRow(base) {
  const financial_status = deriveFinancialStatus(base);
  const sx_production_done = isSxProductionDone(base);
  const outstanding_amount = computeOutstandingAmount(base);
  return {
    ...base,
    financial_status,
    financial_status_label: FINANCIAL_STATUS_LABELS[financial_status] || financial_status,
    sx_production_done,
    outstanding_amount,
  };
}

async function fetchLatestFinancialsByLeadIds(leadIds) {
  const map = new Map();
  if (!leadIds.length) return map;

  const chunk = async (table, statusField) => {
    const { data, error } = await supabase
      .from(table)
      .select(`id, lead_id, total, status, code, created_at, ${statusField}`)
      .in('lead_id', leadIds)
      .order('created_at', { ascending: false });
    if (error) {
      console.warn(`[accountingDeals] ${table}:`, error.message);
      return;
    }
    for (const row of data || []) {
      const lid = String(row.lead_id);
      if (!map.has(lid)) map.set(lid, {});
      const slot = map.get(lid);
      if (table === 'quotations' && !slot.quotation) slot.quotation = row;
      if (table === 'orders' && !slot.order) slot.order = row;
      if (table === 'invoices' && !slot.invoice) slot.invoice = row;
    }
  };

  await Promise.all([
    chunk('quotations', 'accepted_at'),
    chunk('orders', 'order_date'),
    chunk('invoices', 'invoice_date'),
  ]);
  return map;
}

async function fetchAccountingDeals({
  clientCompanyId,
  workshopCompanyId = null,
  search = '',
  financialStatus = null,
  sxDoneNotInvoiced = false,
  page = 1,
  limit = 50,
}) {
  const projectIds = await resolveScopedProjectIds(clientCompanyId, workshopCompanyId || null);
  if (!projectIds.length) {
    return { deals: [], total: 0, page, limit };
  }

  const dealSelectWithSx = `
      id, code, title, estimated_value, deposit_amount, company_id, external_company_id, external_company_name,
      project_id, customer_id, created_at, updated_at, actual_close_date, stage_id, lead_type_id, assigned_to,
      sx_pipeline_stage_id, sx_handover_at,
      customer:customers(id, full_name, phone),
      assignee:users!crm_leads_assigned_to_fkey(id, full_name),
      stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color),
      lead_type:crm_lead_types(id, name),
      sx_pipeline_stage:production_pipeline_stages(id, name, color, bucket_slug, is_handover_to_logistics)
    `;
  const dealSelectFallback = `
      id, code, title, estimated_value, deposit_amount, company_id, external_company_id, external_company_name,
      project_id, customer_id, created_at, updated_at, actual_close_date, stage_id, lead_type_id, assigned_to,
      sx_pipeline_stage_id, sx_handover_at,
      customer:customers(id, full_name, phone),
      assignee:users!crm_leads_assigned_to_fkey(id, full_name),
      stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color),
      lead_type:crm_lead_types(id, name)
    `;

  let dealsRaw;
  let dealErr;
  ({ data: dealsRaw, error: dealErr } = await supabase
    .from('crm_leads')
    .select(dealSelectWithSx)
    .eq('type', 'deal')
    .in('project_id', projectIds)
    .order('updated_at', { ascending: false }));
  if (dealErr) {
    ({ data: dealsRaw, error: dealErr } = await supabase
      .from('crm_leads')
      .select(dealSelectFallback)
      .eq('type', 'deal')
      .in('project_id', projectIds)
      .order('updated_at', { ascending: false }));
  }
  if (dealErr) throw dealErr;

  const dealsFiltered = (dealsRaw || []).filter((d) =>
    crmDealBelongsToAccountingCompany(d, clientCompanyId),
  );

  const uniqueProjectIds = [...new Set(dealsFiltered.map((d) => d.project_id).filter(Boolean))];
  const { data: projects, error: projErr } = await supabase
    .from('projects')
    .select('id, code, name, company_id, status, production_value, deposit_amount, current_stage_id, workshop_type_id')
    .in('id', uniqueProjectIds);
  if (projErr) throw projErr;

  const projectMap = new Map((projects || []).map((p) => [String(p.id), p]));
  const workshopIds = [...new Set((projects || []).map((p) => p.company_id).filter(Boolean))];
  const sxStageCtx = await buildSxStageContext(projects || []);

  const { data: workshopCos } = workshopIds.length
    ? await supabase.from('companies').select('id, name, short_name').in('id', workshopIds)
    : { data: [] };

  const workshopMap = new Map((workshopCos || []).map((c) => [String(c.id), c]));

  const leadIds = dealsFiltered.map((d) => d.id).filter(Boolean);
  const financialMap = await fetchLatestFinancialsByLeadIds(leadIds);

  const searchNorm = normalizeSearch(search);
  const enrichedRaw = dealsFiltered.map((d) => {
    const proj = projectMap.get(String(d.project_id)) || null;
    const ws = proj?.company_id ? workshopMap.get(String(proj.company_id)) : null;
    const sxInfo = resolveSxStageInfo(d, proj, sxStageCtx);
    const fin = financialMap.get(String(d.id)) || {};
    return finalizeDealRow({
      id: d.id,
      code: d.code,
      title: d.title,
      estimated_value: Number(d.estimated_value) || 0,
      customer_id: d.customer_id,
      customer_name: d.customer?.full_name || null,
      customer_phone: d.customer?.phone || null,
      assignee_name: d.assignee?.full_name || null,
      crm_stage_name: d.stage?.name || null,
      crm_stage_color: d.stage?.color || null,
      lead_type_name: d.lead_type?.name || null,
      actual_close_date: d.actual_close_date,
      updated_at: d.updated_at,
      sx_handover_at: d.sx_handover_at || null,
      project_id: d.project_id,
      project_code: proj?.code || null,
      project_name: proj?.name || null,
      project_status: proj?.status || null,
      production_value: Number(proj?.production_value) || 0,
      deposit_amount: Number(proj?.deposit_amount) > 0
        ? Number(proj.deposit_amount)
        : (Number(d.deposit_amount) > 0 ? Number(d.deposit_amount) : 0),
      deal_deposit_amount: Number(d.deposit_amount) > 0 ? Number(d.deposit_amount) : 0,
      workshop_company_id: proj?.company_id || null,
      workshop_name: ws?.short_name || ws?.name || null,
      ...sxInfo,
      quotation_id: fin.quotation?.id || null,
      quotation_total: fin.quotation ? Number(fin.quotation.total) || 0 : null,
      quotation_code: fin.quotation?.code || null,
      quotation_status: fin.quotation?.status || null,
      order_id: fin.order?.id || null,
      order_total: fin.order ? Number(fin.order.total) || 0 : null,
      order_code: fin.order?.code || null,
      order_status: fin.order?.status || null,
      invoice_id: fin.invoice?.id || null,
      invoice_total: fin.invoice ? Number(fin.invoice.total) || 0 : null,
      invoice_code: fin.invoice?.code || null,
      invoice_status: fin.invoice?.status || null,
    });
  }).filter((row) => dealMatchesSearch(row, searchNorm));

  const enriched = applyFinancialFilters(enrichedRaw, { financialStatus, sxDoneNotInvoiced });

  const total = enriched.length;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  const start = (pageNum - 1) * pageSize;
  const deals = enriched.slice(start, start + pageSize);

  return { deals, total, page: pageNum, limit: pageSize };
}

function aggregateFinancialKpis(deals) {
  const financial_breakdown = {
    no_quote: { count: 0, outstanding: 0 },
    quoted: { count: 0, outstanding: 0 },
    ordered: { count: 0, outstanding: 0 },
    invoiced: { count: 0, outstanding: 0 },
  };
  let total_invoiced_value = 0;
  let total_outstanding_value = 0;
  let count_not_invoiced = 0;
  let count_sx_done_not_invoiced = 0;
  let sx_done_not_invoiced_value = 0;

  for (const d of deals) {
    const fs = d.financial_status || FINANCIAL_STATUS.NO_QUOTE;
    if (financial_breakdown[fs]) {
      financial_breakdown[fs].count += 1;
      financial_breakdown[fs].outstanding += d.outstanding_amount || 0;
    }
    total_invoiced_value += d.invoice_total != null ? Number(d.invoice_total) || 0 : 0;
    total_outstanding_value += d.outstanding_amount || 0;
    if (fs !== FINANCIAL_STATUS.INVOICED) count_not_invoiced += 1;
    if (d.sx_production_done && fs !== FINANCIAL_STATUS.INVOICED) {
      count_sx_done_not_invoiced += 1;
      sx_done_not_invoiced_value += d.outstanding_amount || 0;
    }
  }

  return {
    financial_breakdown,
    total_invoiced_value,
    total_outstanding_value,
    count_not_invoiced,
    count_sx_done_not_invoiced,
    sx_done_not_invoiced_value,
  };
}

async function buildAccountingSummary(clientCompanyId, workshopCompanyId = null) {
  const { deals } = await fetchAccountingDeals({
    clientCompanyId,
    workshopCompanyId,
    page: 1,
    limit: 100000,
  });

  const financialKpis = aggregateFinancialKpis(deals);
  const workshops = await listWorkshopsForClientCompany(clientCompanyId);
  const byWorkshop = {};
  for (const ws of workshops) {
    byWorkshop[String(ws.id)] = {
      workshop_company_id: ws.id,
      workshop_name: ws.short_name || ws.name,
      is_own_company: ws.is_own_company,
      deal_count: 0,
      total_estimated_value: 0,
      total_production_value: 0,
    };
  }
  byWorkshop._unknown = {
    workshop_company_id: null,
    workshop_name: 'Chưa xác định',
    is_own_company: false,
    deal_count: 0,
    total_estimated_value: 0,
    total_production_value: 0,
  };

  let totalEstimated = 0;
  let totalProduction = 0;
  for (const d of deals) {
    totalEstimated += d.estimated_value || 0;
    totalProduction += d.production_value || 0;
    const key = d.workshop_company_id ? String(d.workshop_company_id) : '_unknown';
    if (!byWorkshop[key]) {
      byWorkshop[key] = {
        workshop_company_id: d.workshop_company_id,
        workshop_name: d.workshop_name || 'Khác',
        is_own_company: String(d.workshop_company_id) === String(clientCompanyId),
        deal_count: 0,
        total_estimated_value: 0,
        total_production_value: 0,
      };
    }
    byWorkshop[key].deal_count += 1;
    byWorkshop[key].total_estimated_value += d.estimated_value || 0;
    byWorkshop[key].total_production_value += d.production_value || 0;
  }

  const workshopBreakdown = Object.values(byWorkshop)
    .filter((w) => w.deal_count > 0 || w.workshop_company_id)
    .sort((a, b) => b.deal_count - a.deal_count);

  return {
    client_company_id: clientCompanyId,
    total_deals: deals.length,
    total_estimated_value: totalEstimated,
    total_production_value: totalProduction,
    workshop_breakdown: workshopBreakdown,
    workshops,
    ...financialKpis,
  };
}

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildAccountingDealsCsvRows(deals) {
  return deals.map((d) => ({
    'Mã deal': d.code || '',
    'Tên deal': d.title || '',
    'Khách hàng': d.customer_name || '',
    'SĐT': d.customer_phone || '',
    'SX tại': d.workshop_name || '',
    'Mã dự án': d.project_code || '',
    'Cột SX': d.sx_stage_name || '',
    'SX xong': d.sx_production_done ? 'Có' : 'Không',
    'Trạng thái TT': d.financial_status_label || '',
    'Giá trị SX': d.production_value || d.estimated_value || 0,
    'Mã BG': d.quotation_code || '',
    'Giá BG': d.quotation_total ?? '',
    'Mã ĐH': d.order_code || '',
    'Giá ĐH': d.order_total ?? '',
    'Mã HĐ': d.invoice_code || '',
    'Giá HĐ': d.invoice_total ?? '',
    'Còn phải thu': d.outstanding_amount ?? 0,
    'Cập nhật': d.updated_at || '',
  }));
}

function accountingDealsToCsv(deals) {
  const rows = buildAccountingDealsCsvRows(deals);
  if (!rows.length) return '\ufeff';
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(csvEscape).join(','),
    ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(',')),
  ];
  return `\ufeff${lines.join('\n')}`;
}

async function fetchAccountingDealsForExport(options) {
  const { deals } = await fetchAccountingDeals({
    ...options,
    page: 1,
    limit: 100000,
  });
  return deals;
}

module.exports = {
  FINANCIAL_STATUS,
  FINANCIAL_STATUS_LABELS,
  resolveAccountingCompanyId,
  listWorkshopsForClientCompany,
  fetchAccountingDeals,
  fetchAccountingDealsForExport,
  buildAccountingSummary,
  accountingDealsToCsv,
  applyAccountingCrmCompanyFilter,
};
