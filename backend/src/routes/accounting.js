const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { isAdminLike } = require('../helpers/adminRole');
const { isAccountingUser, getAccountingCompanyId } = require('../helpers/accountingScope');
const { supabase } = require('../config/supabase');
const {
  resolveAccountingCompanyId,
  listWorkshopsForClientCompany,
  fetchAccountingDeals,
  buildAccountingSummary,
  fetchAccountingDealsForExport,
  accountingDealsToCsv,
} = require('../helpers/accountingDeals');

function parseQueryFilters(req) {
  return {
    workshopCompanyId: req.query.workshop_company_id || null,
    search: req.query.search || req.query.q || '',
    financialStatus: req.query.financial_status || null,
    sxDoneNotInvoiced: req.query.sx_done_not_invoiced === 'true' || req.query.sx_done_not_invoiced === '1',
  };
}

const r = Router();
r.use(auth);

function requireAccountingAccess(req, res, next) {
  if (isAccountingUser(req.user) || isAdminLike(req.user)) return next();
  return res.status(403).json({ error: 'Chỉ kế toán công ty hoặc admin mới truy cập module này' });
}

async function resolveClientCompanyContext(req) {
  const fromQuery = req.query.client_company_id || req.query.company_id || null;
  const clientCompanyId = resolveAccountingCompanyId(req.user, fromQuery);
  if (!clientCompanyId) {
    return { error: 'Không xác định được công ty kế toán', status: 403 };
  }
  if (!isAccountingUser(req.user) && isAdminLike(req.user) && !fromQuery) {
    return { error: 'Admin cần truyền client_company_id', status: 400 };
  }
  const { data: company } = await supabase
    .from('companies')
    .select('id, name, short_name')
    .eq('id', clientCompanyId)
    .maybeSingle();
  return { clientCompanyId, company };
}

r.use(requireAccountingAccess);

/** GET /accounting/workshops — xưởng liên kết + công ty nội bộ */
r.get('/workshops', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const workshops = await listWorkshopsForClientCompany(ctx.clientCompanyId);
    res.json({
      client_company: ctx.company,
      workshops,
    });
  } catch (e) {
    console.error('[accounting/workshops]', e);
    res.status(500).json({ error: e.message || 'Lỗi tải danh sách xưởng' });
  }
});

/** GET /accounting/summary — KPI tổng + breakdown theo xưởng */
r.get('/summary', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const filters = parseQueryFilters(req);
    const summary = await buildAccountingSummary(ctx.clientCompanyId, filters.workshopCompanyId || null);
    res.json({
      client_company: ctx.company,
      ...summary,
    });
  } catch (e) {
    console.error('[accounting/summary]', e);
    res.status(500).json({ error: e.message || 'Lỗi tải tổng hợp' });
  }
});

/** GET /accounting/deals — danh sách deal SX thuộc công ty kế toán */
r.get('/deals', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const filters = parseQueryFilters(req);
    const result = await fetchAccountingDeals({
      clientCompanyId: ctx.clientCompanyId,
      workshopCompanyId: filters.workshopCompanyId,
      search: filters.search,
      financialStatus: filters.financialStatus,
      sxDoneNotInvoiced: filters.sxDoneNotInvoiced,
      page: req.query.page,
      limit: req.query.limit,
    });
    res.json({
      client_company: ctx.company,
      ...result,
    });
  } catch (e) {
    console.error('[accounting/deals]', e);
    res.status(500).json({ error: e.message || 'Lỗi tải deal' });
  }
});

/** GET /accounting/export — xuất CSV deal (UTF-8 BOM, mở được bằng Excel) */
r.get('/export', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const filters = parseQueryFilters(req);
    const deals = await fetchAccountingDealsForExport({
      clientCompanyId: ctx.clientCompanyId,
      workshopCompanyId: filters.workshopCompanyId,
      search: filters.search,
      financialStatus: filters.financialStatus,
      sxDoneNotInvoiced: filters.sxDoneNotInvoiced,
    });
    const csv = accountingDealsToCsv(deals);
    const coLabel = (ctx.company?.short_name || ctx.company?.name || 'ketoan')
      .replace(/[^\w\-]+/g, '_');
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ketoan-deals-${coLabel}-${date}.csv"`);
    res.send(csv);
  } catch (e) {
    console.error('[accounting/export]', e);
    res.status(500).json({ error: e.message || 'Lỗi xuất file' });
  }
});

/** GET /accounting/me — thông tin phạm vi kế toán của user hiện tại */
r.get('/me', async (req, res) => {
  try {
    const clientCompanyId = getAccountingCompanyId(req.user);
    res.json({
      is_accounting: isAccountingUser(req.user),
      client_company_id: clientCompanyId,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;
