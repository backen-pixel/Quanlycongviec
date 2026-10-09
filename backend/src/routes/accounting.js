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
  fetchAccountingDealRow,
  fetchAccountingReceivables,
  accountingDealsToCsv,
} = require('../helpers/accountingDeals');
const { createInvoiceFromOrder } = require('../helpers/accountingInvoices');
const { syncLogisticsCost } = require('../helpers/costLedger');
const { listDealPhatSinh, setPhatSinhCost } = require('../helpers/accountingPhatSinh');
const {
  assertAccountingDeal,
  listBankAccounts,
  listCompanyRegions,
  clearDefaultBankAccount,
  listPaymentStages,
  listDealPayments,
  recomputeStageReceived,
  syncDepositFromPaymentStages,
  syncDepositToQuotationsAndOrders,
  syncDepositReceivedFlagToPaymentStages,
  mirrorPaymentToInvoice,
  fetchAccountingDealDetail,
  syncDealValueToProject,
} = require('../helpers/accountingDealDetail');
const {
  normalizeDepositInstallments,
  aggregateDepositFromInstallments,
} = require('../helpers/depositInstallments');

function parseQueryFilters(req) {
  return {
    workshopCompanyId: req.query.workshop_company_id || null,
    search: req.query.search || req.query.q || '',
    financialStatus: req.query.financial_status || null,
    sxDoneNotInvoiced: req.query.sx_done_not_invoiced === 'true' || req.query.sx_done_not_invoiced === '1',
    nameMismatch: req.query.name_mismatch === 'true' || req.query.name_mismatch === '1',
    missingDocs: req.query.missing_docs === 'true' || req.query.missing_docs === '1',
    missingItem: req.query.missing_item || null,
    vcGroup: req.query.vc_group || null,
  };
}

const r = Router();
r.use(auth);

function requireAccountingAccess(req, res, next) {
  if (isAccountingUser(req.user) || isAdminLike(req.user)) return next();
  return res.status(403).json({ error: 'Chỉ kế toán công ty hoặc admin mới truy cập module này' });
}

async function resolveClientCompanyContext(req) {
  const fromQuery = req.query.client_company_id
    || req.query.company_id
    || req.body?.client_company_id
    || req.body?.company_id
    || null;
  const clientCompanyId = resolveAccountingCompanyId(req.user, fromQuery);
  if (!clientCompanyId) {
    if (isAdminLike(req.user) && !isAccountingUser(req.user)) {
      return {
        error: 'Admin hệ thống cần chọn công ty (client_company_id) để xem module kế toán',
        status: 400,
      };
    }
    return { error: 'Không xác định được công ty kế toán', status: 403 };
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
      nameMismatch: filters.nameMismatch,
      missingDocs: filters.missingDocs,
      missingItem: filters.missingItem,
      vcGroup: filters.vcGroup,
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
      nameMismatch: filters.nameMismatch,
      missingDocs: filters.missingDocs,
      missingItem: filters.missingItem,
      vcGroup: filters.vcGroup,
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

/** GET /accounting/regions — khu vực (chi nhánh) của công ty kế toán, để chia STK/lọc theo khu vực */
r.get('/regions', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const regions = await listCompanyRegions(ctx.clientCompanyId, { activeOnly: true });
    res.json({ client_company: ctx.company, regions });
  } catch (e) {
    console.error('[accounting/regions]', e);
    res.status(500).json({ error: e.message || 'Lỗi tải khu vực' });
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

// ═══════════════════════════════════════════════════════
// Bank accounts
// ═══════════════════════════════════════════════════════

r.get('/bank-accounts', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const activeOnly = req.query.active_only === '1' || req.query.active_only === 'true';
    const regionId = req.query.region_id || null;
    const accounts = await listBankAccounts(ctx.clientCompanyId, { activeOnly, regionId });
    res.json({ client_company: ctx.company, accounts });
  } catch (e) {
    console.error('[accounting/bank-accounts GET]', e);
    res.status(500).json({ error: e.message || 'Lỗi tải tài khoản NH' });
  }
});

r.post('/bank-accounts', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const {
      bank_name, account_number, account_holder, branch, is_default, is_active, region_id,
    } = req.body || {};
    if (!bank_name || !String(bank_name).trim()) {
      return res.status(400).json({ error: 'Thiếu tên ngân hàng' });
    }
    if (!account_number || !String(account_number).trim()) {
      return res.status(400).json({ error: 'Thiếu số tài khoản' });
    }
    const regionId = region_id ? String(region_id) : null;
    if (regionId) {
      const { data: regionRow } = await supabase
        .from('company_regions')
        .select('id')
        .eq('id', regionId)
        .eq('company_id', ctx.clientCompanyId)
        .maybeSingle();
      if (!regionRow) return res.status(400).json({ error: 'Khu vực không thuộc công ty này' });
    }
    const wantDefault = is_default === true;
    if (wantDefault) await clearDefaultBankAccount(ctx.clientCompanyId, null, regionId);

    const { data, error } = await supabase
      .from('company_bank_accounts')
      .insert({
        company_id: ctx.clientCompanyId,
        region_id: regionId,
        bank_name: String(bank_name).trim(),
        account_number: String(account_number).trim(),
        account_holder: account_holder ? String(account_holder).trim() : null,
        branch: branch ? String(branch).trim() : null,
        is_default: wantDefault,
        is_active: is_active !== false,
      })
      .select('*, region:company_regions(id, name, code)')
      .maybeSingle();
    if (error) throw error;
    res.status(201).json({ account: data });
  } catch (e) {
    console.error('[accounting/bank-accounts POST]', e);
    res.status(500).json({ error: e.message || 'Lỗi tạo tài khoản NH' });
  }
});

r.put('/bank-accounts/:id', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const id = req.params.id;
    const { data: existing } = await supabase
      .from('company_bank_accounts')
      .select('*')
      .eq('id', id)
      .eq('company_id', ctx.clientCompanyId)
      .maybeSingle();
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });

    const patch = { updated_at: new Date().toISOString() };
    const b = req.body || {};
    if (b.bank_name != null) patch.bank_name = String(b.bank_name).trim();
    if (b.account_number != null) patch.account_number = String(b.account_number).trim();
    if (b.account_holder !== undefined) {
      patch.account_holder = b.account_holder ? String(b.account_holder).trim() : null;
    }
    if (b.branch !== undefined) patch.branch = b.branch ? String(b.branch).trim() : null;
    if (b.is_active !== undefined) patch.is_active = !!b.is_active;
    if (b.region_id !== undefined) {
      const regionId = b.region_id ? String(b.region_id) : null;
      if (regionId) {
        const { data: regionRow } = await supabase
          .from('company_regions')
          .select('id')
          .eq('id', regionId)
          .eq('company_id', ctx.clientCompanyId)
          .maybeSingle();
        if (!regionRow) return res.status(400).json({ error: 'Khu vực không thuộc công ty này' });
      }
      patch.region_id = regionId;
    }
    const effectiveRegionId = patch.region_id !== undefined ? patch.region_id : existing.region_id;
    if (b.is_default === true) {
      await clearDefaultBankAccount(ctx.clientCompanyId, id, effectiveRegionId);
      patch.is_default = true;
    } else if (b.is_default === false) {
      patch.is_default = false;
    }

    const { data, error } = await supabase
      .from('company_bank_accounts')
      .update(patch)
      .eq('id', id)
      .select('*, region:company_regions(id, name, code)')
      .maybeSingle();
    if (error) throw error;
    res.json({ account: data });
  } catch (e) {
    console.error('[accounting/bank-accounts PUT]', e);
    res.status(500).json({ error: e.message || 'Lỗi cập nhật tài khoản NH' });
  }
});

r.delete('/bank-accounts/:id', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const id = req.params.id;
    const { data: existing } = await supabase
      .from('company_bank_accounts')
      .select('id')
      .eq('id', id)
      .eq('company_id', ctx.clientCompanyId)
      .maybeSingle();
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });

    // Soft-delete: deactivate (giữ FK lịch sử)
    const { error } = await supabase
      .from('company_bank_accounts')
      .update({ is_active: false, is_default: false, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[accounting/bank-accounts DELETE]', e);
    res.status(500).json({ error: e.message || 'Lỗi xóa tài khoản NH' });
  }
});

// ═══════════════════════════════════════════════════════
// Deal detail + deposit + payment stages + payments
// ═══════════════════════════════════════════════════════

r.get('/deals/:leadId', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const result = await fetchAccountingDealDetail(req.params.leadId, ctx.clientCompanyId);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ client_company: ctx.company, ...result });
  } catch (e) {
    console.error('[accounting/deals/:id]', e);
    res.status(500).json({ error: e.message || 'Lỗi tải chi tiết deal' });
  }
});

/** GET /accounting/receivables — công nợ phải thu theo tuổi nợ và theo khách */
r.get('/receivables', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const filters = parseQueryFilters(req);
    const report = await fetchAccountingReceivables({
      clientCompanyId: ctx.clientCompanyId,
      workshopCompanyId: filters.workshopCompanyId,
      search: filters.search,
    });
    res.json({ client_company: ctx.company, ...report });
  } catch (e) {
    console.error('[accounting/receivables]', e);
    res.status(500).json({ error: e.message || 'Lỗi tải công nợ' });
  }
});

/** GET /accounting/deals/:leadId/checklist — hồ sơ kế toán của deal */
r.get('/deals/:leadId/checklist', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const check = await assertAccountingDeal(req.params.leadId, ctx.clientCompanyId);
    if (check.error) return res.status(check.status).json({ error: check.error });
    const row = await fetchAccountingDealRow(ctx.clientCompanyId, req.params.leadId);
    if (!row) return res.json({ checklist: null });
    res.json({
      checklist: row.checklist,
      outstanding_amount: row.outstanding_amount,
      sx_production_done: row.sx_production_done,
      vc: {
        phase: row.vc_phase,
        phase_label: row.vc_phase_label,
        group: row.vc_group,
        done: row.vc_done,
        company_name: row.vc_company_name,
        stage_name: row.vc_stage_name,
        stage_color: row.vc_stage_color,
        delivery_date: row.delivery_date,
        install_date: row.install_date,
        logistics_cost: row.logistics_cost,
      },
    });
  } catch (e) {
    console.error('[accounting/deals/:id/checklist]', e);
    res.status(500).json({ error: e.message || 'Lỗi tải hồ sơ kế toán' });
  }
});

/** POST /accounting/deals/:leadId/invoices — xuất hóa đơn từ đơn hàng của deal */
r.post('/deals/:leadId/invoices', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const check = await assertAccountingDeal(req.params.leadId, ctx.clientCompanyId);
    if (check.error) return res.status(check.status).json({ error: check.error });
    const b = req.body || {};
    if (!b.order_id) return res.status(400).json({ error: 'Chọn đơn hàng để xuất hóa đơn' });
    const result = await createInvoiceFromOrder({
      leadId: req.params.leadId,
      orderId: b.order_id,
      body: b,
      userId: req.user?.userId || req.user?.id || null,
    });
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.status(201).json(result);
  } catch (e) {
    console.error('[accounting/deals/:id/invoices]', e);
    res.status(500).json({ error: e.message || 'Lỗi xuất hóa đơn' });
  }
});

async function assertDealAccess(req, res) {
  const ctx = await resolveClientCompanyContext(req);
  if (ctx.error) { res.status(ctx.status).json({ error: ctx.error }); return false; }
  const check = await assertAccountingDeal(req.params.leadId, ctx.clientCompanyId);
  if (check.error) { res.status(check.status).json({ error: check.error }); return false; }
  return true;
}

/** GET /accounting/deals/:leadId/phat-sinh — việc phát sinh (không gian chung) của deal + chi phí đã ghi */
r.get('/deals/:leadId/phat-sinh', async (req, res) => {
  try {
    if (!(await assertDealAccess(req, res))) return;
    res.json(await listDealPhatSinh(req.params.leadId));
  } catch (e) {
    console.error('[accounting/deals/:id/phat-sinh]', e);
    res.status(500).json({ error: e.message || 'Lỗi tải việc phát sinh' });
  }
});

/** PUT /accounting/deals/:leadId/phat-sinh/:assignmentId/cost — ghi chi phí một việc phát sinh */
r.put('/deals/:leadId/phat-sinh/:assignmentId/cost', async (req, res) => {
  try {
    if (!(await assertDealAccess(req, res))) return;
    const result = await setPhatSinhCost({
      leadId: req.params.leadId,
      assignmentId: req.params.assignmentId,
      amount: req.body?.amount,
      userId: req.user?.userId || req.user?.id || null,
    });
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json(result);
  } catch (e) {
    console.error('[accounting/deals/:id/phat-sinh/:aid/cost]', e);
    res.status(500).json({ error: e.message || 'Lỗi ghi chi phí phát sinh' });
  }
});

/** PUT /accounting/deals/:leadId/logistics-cost — phí VC/LĐ trên dự án (null = chưa nhập, 0 = không phí) */
r.put('/deals/:leadId/logistics-cost', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const check = await assertAccountingDeal(req.params.leadId, ctx.clientCompanyId);
    if (check.error) return res.status(check.status).json({ error: check.error });

    const raw = req.body?.logistics_cost;
    let cost = null;
    if (raw !== null && raw !== undefined && raw !== '') {
      cost = Number(raw);
      if (!Number.isFinite(cost) || cost < 0) {
        return res.status(400).json({ error: 'Phí VC/LĐ phải là số không âm' });
      }
    }

    const { data: lead } = await supabase
      .from('crm_leads')
      .select('id, project_id')
      .eq('id', req.params.leadId)
      .maybeSingle();
    if (!lead?.project_id) return res.status(400).json({ error: 'Deal chưa có dự án để ghi phí VC/LĐ' });

    const { data: project, error } = await supabase
      .from('projects')
      .update({ logistics_cost: cost, updated_at: new Date().toISOString() })
      .eq('id', lead.project_id)
      .select('id, company_id, logistics_cost')
      .maybeSingle();
    if (error) throw error;

    if (project && cost != null) {
      await syncLogisticsCost(project, { actorUserId: req.user?.userId || req.user?.id || null })
        .catch((e) => console.warn('[accounting/logistics-cost] cost ledger:', e.message || e));
    }

    res.json({ ok: true, logistics_cost: project?.logistics_cost ?? null });
  } catch (e) {
    console.error('[accounting/deals/:id/logistics-cost]', e);
    res.status(500).json({ error: e.message || 'Lỗi cập nhật phí VC/LĐ' });
  }
});

/** PUT /accounting/deals/:leadId/deposit — cập nhật snapshot cọc trên deal + đồng bộ BG/ĐH */
r.put('/deals/:leadId/deposit', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const check = await assertAccountingDeal(req.params.leadId, ctx.clientCompanyId);
    if (check.error) return res.status(check.status).json({ error: check.error });

    const b = req.body || {};
    const patch = { updated_at: new Date().toISOString() };
    if (b.deposit_amount !== undefined) {
      const n = Number(b.deposit_amount);
      patch.deposit_amount = Number.isFinite(n) ? n : null;
    }
    if (b.deposit_received === true || b.deposit_received === false || b.deposit_received === null) {
      patch.deposit_received = b.deposit_received;
    }
    if (b.deposit_label !== undefined) {
      patch.deposit_label = b.deposit_label ? String(b.deposit_label).trim() : null;
    }

    // Khi đánh dấu Đã nhận / Chưa nhận — cập nhật luôn các đợt cọc trên deal
    if (b.deposit_received === true || b.deposit_received === false) {
      const { data: leadRow } = await supabase
        .from('crm_leads')
        .select('deposit_installments')
        .eq('id', req.params.leadId)
        .maybeSingle();
      const existing = normalizeDepositInstallments(leadRow?.deposit_installments);
      if (existing?.length) {
        const updated = existing.map((r) => ({ ...r, received: b.deposit_received }));
        const agg = aggregateDepositFromInstallments(updated);
        patch.deposit_installments = agg.deposit_installments;
        if (agg.deposit_amount != null && patch.deposit_amount === undefined) {
          patch.deposit_amount = agg.deposit_amount;
        }
      }
    }

    const { data: updated, error } = await supabase
      .from('crm_leads')
      .update(patch)
      .eq('id', req.params.leadId)
      .select('id, deposit_amount, deposit_received, deposit_label, deposit_installments, project_id')
      .maybeSingle();
    if (error) throw error;

    if (updated?.project_id && patch.deposit_amount != null) {
      await supabase.from('projects').update({
        deposit_amount: patch.deposit_amount,
        updated_at: new Date().toISOString(),
      }).eq('id', updated.project_id);
    }

    const docsSync = await syncDepositToQuotationsAndOrders(req.params.leadId, {
      deposit_amount: updated?.deposit_amount ?? patch.deposit_amount ?? null,
      deposit_received: updated?.deposit_received ?? patch.deposit_received ?? null,
      deposit_label: updated?.deposit_label ?? patch.deposit_label ?? null,
      deposit_installments: updated?.deposit_installments || patch.deposit_installments || null,
      force: true,
    });

    if (patch.deposit_received === true || patch.deposit_received === false) {
      await syncDepositReceivedFlagToPaymentStages(req.params.leadId, patch.deposit_received);
    }

    res.json({ deposit: updated, synced: docsSync });
  } catch (e) {
    console.error('[accounting/deals/:id/deposit]', e);
    res.status(500).json({ error: e.message || 'Lỗi cập nhật cọc' });
  }
});

/** PUT /accounting/deals/:leadId/sync-value — đồng bộ giá trị deal (CRM) → giá trị dự án SX */
r.put('/deals/:leadId/sync-value', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const leadId = req.params.leadId;
    const check = await assertAccountingDeal(leadId, ctx.clientCompanyId);
    if (check.error) return res.status(check.status).json({ error: check.error });

    const { data: lead } = await supabase
      .from('crm_leads')
      .select('id, estimated_value, project_id')
      .eq('id', leadId)
      .maybeSingle();
    if (!lead?.project_id) {
      return res.status(400).json({ error: 'Deal chưa có dự án sản xuất để đồng bộ' });
    }

    const result = await syncDealValueToProject(lead.project_id, lead.estimated_value);
    if (!result.synced) {
      return res.status(400).json({ error: 'Giá trị CRM không hợp lệ để đồng bộ' });
    }

    const { data: project } = await supabase
      .from('projects')
      .select('id, production_value, estimated_value')
      .eq('id', lead.project_id)
      .maybeSingle();

    res.json({
      ok: true,
      project,
      value_sync: {
        crm_value: Number(lead.estimated_value) || 0,
        project_value: result.value,
        sx_value: result.value,
        production_value: Number(project?.production_value) || 0,
        in_sync: true,
      },
    });
  } catch (e) {
    console.error('[accounting/deals/:id/sync-value]', e);
    res.status(500).json({ error: e.message || 'Lỗi đồng bộ giá trị' });
  }
});

r.get('/deals/:leadId/payment-stages', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const check = await assertAccountingDeal(req.params.leadId, ctx.clientCompanyId);
    if (check.error) return res.status(check.status).json({ error: check.error });
    const stages = await listPaymentStages(req.params.leadId);
    res.json({ stages });
  } catch (e) {
    console.error('[accounting/payment-stages GET]', e);
    res.status(500).json({ error: e.message || 'Lỗi tải lịch thanh toán' });
  }
});

r.post('/deals/:leadId/payment-stages', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const leadId = req.params.leadId;
    const check = await assertAccountingDeal(leadId, ctx.clientCompanyId);
    if (check.error) return res.status(check.status).json({ error: check.error });

    const b = req.body || {};
    if (!b.label || !String(b.label).trim()) {
      return res.status(400).json({ error: 'Thiếu tên giai đoạn' });
    }
    const existing = await listPaymentStages(leadId);
    const sortOrder = b.sort_order != null ? Number(b.sort_order) : existing.length;

    const method = b.payment_method === 'cash' || b.payment_method === 'transfer'
      ? b.payment_method
      : null;
    const planned = b.planned_amount != null && b.planned_amount !== ''
      ? Number(b.planned_amount)
      : null;

    const { data, error } = await supabase
      .from('crm_payment_stages')
      .insert({
        lead_id: leadId,
        company_id: ctx.clientCompanyId,
        label: String(b.label).trim(),
        planned_amount: Number.isFinite(planned) ? planned : null,
        sort_order: sortOrder,
        payment_method: method,
        bank_account_id: method === 'transfer' && b.bank_account_id ? b.bank_account_id : null,
        notes: b.notes ? String(b.notes).trim() : null,
        status: 'pending',
        received_amount: 0,
      })
      .select('*')
      .maybeSingle();
    if (error) throw error;
    res.status(201).json({ stage: data });
  } catch (e) {
    console.error('[accounting/payment-stages POST]', e);
    res.status(500).json({ error: e.message || 'Lỗi tạo giai đoạn' });
  }
});

r.put('/deals/:leadId/payment-stages/:stageId', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const { leadId, stageId } = req.params;
    const check = await assertAccountingDeal(leadId, ctx.clientCompanyId);
    if (check.error) return res.status(check.status).json({ error: check.error });

    const { data: existing } = await supabase
      .from('crm_payment_stages')
      .select('*')
      .eq('id', stageId)
      .eq('lead_id', leadId)
      .maybeSingle();
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy giai đoạn' });

    const b = req.body || {};
    const patch = { updated_at: new Date().toISOString() };
    if (b.label != null) patch.label = String(b.label).trim();
    if (b.planned_amount !== undefined) {
      const n = Number(b.planned_amount);
      patch.planned_amount = Number.isFinite(n) ? n : null;
    }
    if (b.sort_order !== undefined) patch.sort_order = Number(b.sort_order) || 0;
    if (b.payment_method === 'cash' || b.payment_method === 'transfer' || b.payment_method === null) {
      patch.payment_method = b.payment_method;
    }
    if (b.bank_account_id !== undefined) {
      patch.bank_account_id = b.bank_account_id || null;
    }
    if (b.notes !== undefined) patch.notes = b.notes ? String(b.notes).trim() : null;

    const { data, error } = await supabase
      .from('crm_payment_stages')
      .update(patch)
      .eq('id', stageId)
      .select('*')
      .maybeSingle();
    if (error) throw error;

    // Recompute status if planned changed
    const recomputed = await recomputeStageReceived(stageId);
    await syncDepositFromPaymentStages(leadId);
    res.json({ stage: recomputed || data });
  } catch (e) {
    console.error('[accounting/payment-stages PUT]', e);
    res.status(500).json({ error: e.message || 'Lỗi cập nhật giai đoạn' });
  }
});

r.delete('/deals/:leadId/payment-stages/:stageId', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const { leadId, stageId } = req.params;
    const check = await assertAccountingDeal(leadId, ctx.clientCompanyId);
    if (check.error) return res.status(check.status).json({ error: check.error });

    const { error } = await supabase
      .from('crm_payment_stages')
      .delete()
      .eq('id', stageId)
      .eq('lead_id', leadId);
    if (error) throw error;
    await syncDepositFromPaymentStages(leadId);
    res.json({ ok: true });
  } catch (e) {
    console.error('[accounting/payment-stages DELETE]', e);
    res.status(500).json({ error: e.message || 'Lỗi xóa giai đoạn' });
  }
});

r.get('/deals/:leadId/payments', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const check = await assertAccountingDeal(req.params.leadId, ctx.clientCompanyId);
    if (check.error) return res.status(check.status).json({ error: check.error });
    const payments = await listDealPayments(req.params.leadId);
    res.json({ payments });
  } catch (e) {
    console.error('[accounting/payments GET]', e);
    res.status(500).json({ error: e.message || 'Lỗi tải lịch sử thanh toán' });
  }
});

r.post('/deals/:leadId/payments', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const leadId = req.params.leadId;
    const check = await assertAccountingDeal(leadId, ctx.clientCompanyId);
    if (check.error) return res.status(check.status).json({ error: check.error });

    const b = req.body || {};
    const amount = Number(b.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Số tiền không hợp lệ' });
    }
    const method = b.payment_method === 'cash' || b.payment_method === 'transfer'
      ? b.payment_method
      : 'cash';

    let stageId = b.stage_id || null;
    let bankAccountId = b.bank_account_id || null;
    if (stageId) {
      const { data: stage } = await supabase
        .from('crm_payment_stages')
        .select('id, payment_method, bank_account_id')
        .eq('id', stageId)
        .eq('lead_id', leadId)
        .maybeSingle();
      if (!stage) return res.status(400).json({ error: 'Giai đoạn không hợp lệ' });
      if (!b.payment_method && stage.payment_method) {
        // inherit from stage if not provided — already have method from body default
      }
      if (!bankAccountId && stage.bank_account_id) bankAccountId = stage.bank_account_id;
    }

    const insertRow = {
      lead_id: leadId,
      stage_id: stageId,
      amount,
      payment_date: b.payment_date || new Date().toISOString().slice(0, 10),
      payment_method: method,
      bank_account_id: method === 'transfer' ? bankAccountId : null,
      reference_number: b.reference_number ? String(b.reference_number).trim() : null,
      notes: b.notes ? String(b.notes).trim() : null,
      invoice_id: b.invoice_id || null,
      order_id: b.order_id || null,
      created_by: req.user?.userId || req.user?.id || null,
    };

    const { data: payment, error } = await supabase
      .from('crm_deal_payments')
      .insert(insertRow)
      .select('*')
      .maybeSingle();
    if (error) throw error;

    if (stageId) await recomputeStageReceived(stageId);
    await syncDepositFromPaymentStages(leadId);

    // Khoản thu đã ghi xong. Nếu bản sao sang hóa đơn hỏng thì PHẢI báo lên, kẻo
    // crm_deal_payments và invoices lệch nhau mà kế toán không biết.
    let canhBao = null;
    if (payment?.invoice_id) {
      const mirror = await mirrorPaymentToInvoice(payment, insertRow.created_by);
      if (mirror && mirror.ok === false) canhBao = mirror.error;
    }

    const payments = await listDealPayments(leadId);
    const stages = await listPaymentStages(leadId);
    res.status(201).json({
      payment: payments.find((p) => p.id === payment.id) || payment,
      payment_stages: stages,
      payments,
      ...(canhBao ? { warning: canhBao } : {}),
    });
  } catch (e) {
    console.error('[accounting/payments POST]', e);
    res.status(500).json({ error: e.message || 'Lỗi ghi nhận thanh toán' });
  }
});

r.delete('/deals/:leadId/payments/:paymentId', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const { leadId, paymentId } = req.params;
    const check = await assertAccountingDeal(leadId, ctx.clientCompanyId);
    if (check.error) return res.status(check.status).json({ error: check.error });

    const { data: existing } = await supabase
      .from('crm_deal_payments')
      .select('*')
      .eq('id', paymentId)
      .eq('lead_id', leadId)
      .maybeSingle();
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy giao dịch' });

    const stageId = existing.stage_id;
    const mirroredId = existing.mirrored_payment_record_id;
    const invoiceId = existing.invoice_id;

    const { error } = await supabase
      .from('crm_deal_payments')
      .delete()
      .eq('id', paymentId);
    if (error) throw error;

    if (mirroredId) {
      await supabase.from('payment_records').delete().eq('id', mirroredId);
      if (invoiceId) {
        const { data: pays } = await supabase
          .from('payment_records')
          .select('amount')
          .eq('invoice_id', invoiceId);
        const paid = (pays || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
        const { data: inv } = await supabase
          .from('invoices')
          .select('total')
          .eq('id', invoiceId)
          .maybeSingle();
        const total = Number(inv?.total) || 0;
        let paymentStatus = 'unpaid';
        if (paid > 0 && total > 0 && paid + 0.0001 >= total) paymentStatus = 'paid';
        else if (paid > 0) paymentStatus = 'partial';
        await supabase.from('invoices').update({
          paid_amount: paid,
          payment_status: paymentStatus,
          updated_at: new Date().toISOString(),
        }).eq('id', invoiceId);
      }
    }

    if (stageId) await recomputeStageReceived(stageId);
    await syncDepositFromPaymentStages(leadId);

    res.json({
      ok: true,
      payment_stages: await listPaymentStages(leadId),
      payments: await listDealPayments(leadId),
    });
  } catch (e) {
    console.error('[accounting/payments DELETE]', e);
    res.status(500).json({ error: e.message || 'Lỗi xóa giao dịch' });
  }
});

module.exports = r;
