/**
 * CRM Commercial docs — báo giá, đơn hàng, hóa đơn (+ PDF, parse Excel).
 */
const path = require('path');
const fs = require('fs');
const { Router } = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');
const { supabase } = require('../../../config/supabase');
const defaultCompanyInfo = require('../../../config/companyInfo');
const {
  applyCrmLeadRegionFilterToQuery,
  assertRegionBelongsToCompany,
} = require('../../../helpers/crmRegionScope');
const { isVptCompanyCommercialDocViewer } = require('../../../helpers/dealParticipantProduction');
const { parseVietnameseMoney, parseExcelMoneyFromMappedColumn } = require('../../../helpers/excelVnNumbers');
const { snapshotOrderRowFromQuotation, mapQuotationItemsToOrderRows } = require('../../../helpers/orderFromQuotation');
const { isPostgresUniqueViolation } = require('../../../helpers/projectCode');
const { crmRouteErrorText } = require('../shared/crmRouteHelpers');
const { emitCrmDashboardChanged, nextCode } = require('../shared/crmMutationHelpers');
const {
  resolveCommercialDocListCompanyScope,
  enforceCommercialDocCompanyOnWrite,
} = require('../shared/commercialDocScope');
const { userIsAdmin, scopedAdminCompanyId, requireUserCompanyId } = require('../shared/requestScope');
const { createNotification: createNotif, notifyMultiple: notifyMultipleShared } = require('../../../helpers/notifications');

let misaService = null;
try { misaService = require('../../../services/misaService'); } catch (e) { console.warn('⚠️ misaService not loaded:', e.message); }
let autoFlowFns = {};
try { autoFlowFns = require('../../../helpers/autoFlow'); } catch (e) { console.warn('⚠️ autoFlow not loaded:', e.message); }
const { onQuotationAccepted = async () => null, onOrderConfirmed = async () => null } = autoFlowFns;

const excelUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const r = Router();

async function notifyMultiple(req, userIds, type, title, message, entityType, entityId, metadata) {
  return notifyMultipleShared(req, userIds, type, title, message, entityType, entityId, metadata || null);
}

// QUOTATIONS (Báo giá)
// ═══════════════════════════════════════════════════════════════════════════
/** Lead/Deal detail: chứng từ có lead_id HOẶC cùng customer_id (nhiều BG tạo từ KH chưa gắn lead). */
async function applyLeadOrCustomerSalesFilter(queryBuilder, leadIdVal) {
  const lid = String(leadIdVal || '');
  if (!lid || !/^[0-9a-f-]{36}$/i.test(lid)) return queryBuilder;
  const { data: leadRow } = await supabase.from('crm_leads').select('customer_id').eq('id', lid).maybeSingle();
  const cid = leadRow?.customer_id ? String(leadRow.customer_id) : '';
  if (cid && /^[0-9a-f-]{36}$/i.test(cid)) {
    return queryBuilder.or(`lead_id.eq.${lid},customer_id.eq.${cid}`);
  }
  return queryBuilder.eq('lead_id', lid);
}

/** Admin hệ thống xem/sửa mọi báo giá; admin công ty toàn công ty; NV chỉ báo giá do mình tạo. */
function userMayAccessQuotationRow(req, row) {
  if (!row) return false;
  const sac = scopedAdminCompanyId(req);
  if (sac) return String(row.company_id || '') === String(sac);
  if (userIsAdmin(req.user?.role)) return true;
  const uid = req.user?.userId;
  const cid = req.user?.company_id;
  if (!uid || !cid) return false;
  if (String(row.company_id || '') !== String(cid)) return false;
  if (isVptCompanyCommercialDocViewer(req.user)) return true;
  return String(row.created_by || '') === String(uid);
}

r.get('/quotations', async (req, res) => {
  try {
    const {
      status, search, limit = 50, lead_id,
      company_id: coQ, region_id: regQ, created_by: createdByQ,
      orphan, // 'only' | 'exclude' | undefined
    } = req.query;
    let q = supabase.from('quotations')
      .select(
        '*, customer:customers(id, full_name, phone), ' +
        'creator:users!quotations_created_by_fkey(id, full_name), ' +
        'approver:users!quotations_approved_by_fkey(id, full_name), ' +
        'company:companies!quotations_company_id_fkey(id, name, short_name), ' +
        'region:company_regions!quotations_region_id_fkey(id, name, code), ' +
        'lead:crm_leads!quotations_lead_id_fkey(id, code, title, type, assigned_to)',
      )
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));
    const qScope = resolveCommercialDocListCompanyScope(req, res, coQ);
    if (!qScope.ok) return;
    if (qScope.companyId) q = q.eq('company_id', qScope.companyId);
    if (qScope.restrictToCreator && req.user?.userId) q = q.eq('created_by', req.user.userId);
    if (regQ && /^[0-9a-f-]{36}$/i.test(String(regQ))) q = q.eq('region_id', regQ);
    if (userIsAdmin(req.user?.role) && createdByQ && /^[0-9a-f-]{36}$/i.test(String(createdByQ))) {
      q = q.eq('created_by', createdByQ);
    }
    if (status) q = q.eq('status', status);
    if (orphan === 'only') q = q.is('lead_id', null);
    else if (orphan === 'exclude') q = q.not('lead_id', 'is', null);
    if (search) q = q.or(`code.ilike.%${search}%,title.ilike.%${search}%,customer_name.ilike.%${search}%`);
    if (lead_id && /^[0-9a-f-]{36}$/i.test(String(lead_id))) q = await applyLeadOrCustomerSalesFilter(q, lead_id);
    let { data, error } = await q;
    // DB cũ chưa có FK quotations_region_id_fkey (migration 160 chưa chạy) → bỏ embed region rồi thử lại
    if (error && /quotations_region_id_fkey|company_regions/i.test(String(error.message || ''))) {
      let q2 = supabase.from('quotations')
        .select(
          '*, customer:customers(id, full_name, phone), ' +
          'creator:users!quotations_created_by_fkey(id, full_name), ' +
          'approver:users!quotations_approved_by_fkey(id, full_name), ' +
          'company:companies!quotations_company_id_fkey(id, name, short_name), ' +
          'lead:crm_leads!quotations_lead_id_fkey(id, code, title, type, assigned_to)',
        )
        .order('created_at', { ascending: false })
        .limit(parseInt(limit));
      if (qScope.companyId) q2 = q2.eq('company_id', qScope.companyId);
      if (qScope.restrictToCreator && req.user?.userId) q2 = q2.eq('created_by', req.user.userId);
      if (userIsAdmin(req.user?.role) && createdByQ && /^[0-9a-f-]{36}$/i.test(String(createdByQ))) {
        q2 = q2.eq('created_by', createdByQ);
      }
      if (regQ && /^[0-9a-f-]{36}$/i.test(String(regQ))) q2 = q2.eq('region_id', regQ);
      if (status) q2 = q2.eq('status', status);
      if (orphan === 'only') q2 = q2.is('lead_id', null);
      else if (orphan === 'exclude') q2 = q2.not('lead_id', 'is', null);
      if (search) q2 = q2.or(`code.ilike.%${search}%,title.ilike.%${search}%,customer_name.ilike.%${search}%`);
      if (lead_id && /^[0-9a-f-]{36}$/i.test(String(lead_id))) q2 = await applyLeadOrCustomerSalesFilter(q2, lead_id);
      const r2 = await q2;
      data = r2.data; error = r2.error;
    }
    if (error) throw error;
    // Tính flag is_orphan để FE hiển thị badge "Không gắn deal"
    const out = (data || []).map((row) => ({ ...row, is_orphan: !row.lead_id }));
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/quotations/:id', async (req, res) => {
  try {
    const sel =
      '*, customer:customers(id, full_name, phone, email, address, company, tax_code), ' +
      'creator:users!quotations_created_by_fkey(id, full_name, email), ' +
      'approver:users!quotations_approved_by_fkey(id, full_name), ' +
      'company:companies!quotations_company_id_fkey(id, name, short_name), ' +
      'region:company_regions!quotations_region_id_fkey(id, name, code), ' +
      'lead:crm_leads!quotations_lead_id_fkey(id, code, title, type, assigned_to, ' +
        'lead_assignee:users!crm_leads_assigned_to_fkey(id, full_name))';
    let { data: quote, error: qe } = await supabase.from('quotations').select(sel).eq('id', req.params.id).single();
    if (qe && /quotations_region_id_fkey|company_regions/i.test(String(qe.message || ''))) {
      const fb = await supabase
        .from('quotations')
        .select(
          '*, customer:customers(id, full_name, phone, email, address, company, tax_code), ' +
          'creator:users!quotations_created_by_fkey(id, full_name, email), ' +
          'approver:users!quotations_approved_by_fkey(id, full_name), ' +
          'company:companies!quotations_company_id_fkey(id, name, short_name), ' +
          'lead:crm_leads!quotations_lead_id_fkey(id, code, title, type, assigned_to)',
        )
        .eq('id', req.params.id)
        .single();
      quote = fb.data; qe = fb.error;
    }
    if (!quote) {
      const benign = qe && (qe.code === 'PGRST116' || /JSON object requested/i.test(String(qe.message || '')));
      if (qe && !benign) return res.status(500).json({ error: qe.message || 'Lỗi tải báo giá' });
      return res.status(404).json({ error: 'Không tìm thấy báo giá' });
    }
    if (!userMayAccessQuotationRow(req, quote)) {
      return res.status(403).json({ error: 'Không có quyền xem báo giá này' });
    }
    const { data: items } = await supabase.from('quotation_items')
      .select('*, product:products(id, name, code)')
      .eq('quotation_id', req.params.id).order('item_order');
    res.json({ ...quote, items: items || [], is_orphan: !quote?.lead_id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/quotations/:id/history', async (req, res) => {
  try {
    const { data: qMeta } = await supabase
      .from('quotations')
      .select('created_by, company_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!qMeta) return res.status(404).json({ error: 'Không tìm thấy báo giá' });
    if (!userMayAccessQuotationRow(req, qMeta)) {
      return res.status(403).json({ error: 'Không có quyền xem lịch sử báo giá này' });
    }
    const { data: rows, error } = await supabase
      .from('quotation_edit_history')
      .select('id, action, summary, detail, created_at, created_by')
      .eq('quotation_id', req.params.id)
      .order('created_at', { ascending: false })
      .limit(80);
    if (error) throw error;
    const userIds = [...new Set((rows || []).map((r) => r.created_by).filter(Boolean))];
    let userMap = {};
    if (userIds.length) {
      const { data: users } = await supabase.from('users').select('id, full_name').in('id', userIds);
      (users || []).forEach((u) => { userMap[u.id] = u.full_name; });
    }
    const history = (rows || []).map((r) => ({ ...r, editor_name: userMap[r.created_by] || null }));
    res.json({ history });
  } catch (e) {
    if (String(e.message || '').includes('does not exist') || e.code === '42P01'
      || (String(e.message || '').includes('relation') && String(e.message || '').includes('quotation_edit_history'))) {
      return res.json({ history: [] });
    }
    res.status(500).json({ error: e.message });
  }
});

r.post('/quotations', async (req, res) => {
  try {
    const { items, quotation_source, ...quoteData } = req.body;
    const code = await nextCode('BG');

    // Sanitize: empty strings → null for UUID fields
    const uuidFields = ['customer_id', 'lead_id', 'project_id', 'approved_by', 'company_id', 'region_id', 'fulfillment_lead_id', 'source_task_id'];
    uuidFields.forEach(f => { if (quoteData[f] === '' || quoteData[f] === undefined) quoteData[f] = null; });
    // Sanitize: empty strings → null for date fields
    const dateFields = ['valid_until', 'issue_date', 'sent_at', 'accepted_at', 'closed_at', 'signed_date', 'delivery_date'];
    dateFields.forEach(f => { if (quoteData[f] === '') quoteData[f] = null; });
    const quoteMoneyOrNull = (v) => {
      if (v === '' || v === undefined || v === null) return null;
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      const onlyDigits = String(v).replace(/\s/g, '').replace(/đ/gi, '').replace(/[^\d]/g, '');
      if (!onlyDigits) return null;
      const n = parseInt(onlyDigits, 10);
      return Number.isFinite(n) ? n : null;
    };
    if ('deposit_amount' in quoteData) quoteData.deposit_amount = quoteMoneyOrNull(quoteData.deposit_amount);
    if ('remaining_amount' in quoteData) quoteData.remaining_amount = quoteMoneyOrNull(quoteData.remaining_amount);
    if ('deposit_received' in quoteData) {
      const dr = quoteData.deposit_received;
      if (dr === '' || dr === undefined || dr === null) quoteData.deposit_received = null;
      else if (dr === true || dr === 'true') quoteData.deposit_received = true;
      else if (dr === false || dr === 'false') quoteData.deposit_received = false;
      else quoteData.deposit_received = null;
    }
    if (quoteData.deposit_label === '') quoteData.deposit_label = null;
    if (quoteData.remaining_note === '') quoteData.remaining_note = null;
    if (quoteData.source_excel_file_url === '') quoteData.source_excel_file_url = null;
    if (quoteData.source_excel_file_name === '') quoteData.source_excel_file_name = null;
    if (quoteData.sale_discount_type === '') quoteData.sale_discount_type = 'amount';
    if (quoteData.sale_discount_value === '') quoteData.sale_discount_value = 0;

    // ── Scope: kế thừa company_id + region_id từ deal (cho phép override; sẽ cảnh báo ở UI) ──
    let commercialCo = quoteData.company_id || null;
    let leadRegionId = null;
    if (quoteData.lead_id) {
      const { data: lrow } = await supabase
        .from('crm_leads')
        .select('company_id, region_id')
        .eq('id', quoteData.lead_id)
        .maybeSingle();
      if (lrow?.company_id) commercialCo = lrow.company_id;
      if (lrow?.region_id) leadRegionId = lrow.region_id;
    }
    const qCoWrite = enforceCommercialDocCompanyOnWrite(req, res, commercialCo, 'Báo giá');
    if (!qCoWrite.ok) return;
    commercialCo = qCoWrite.companyId;
    quoteData.company_id = commercialCo;

    // region_id: nếu client gửi → kiểm tra cùng company; nếu rỗng → kế thừa từ lead.
    if (quoteData.region_id) {
      const { data: rrow } = await supabase
        .from('company_regions')
        .select('id, company_id, is_active')
        .eq('id', quoteData.region_id)
        .maybeSingle();
      if (!rrow) {
        return res.status(400).json({ error: 'Khu vực không tồn tại' });
      }
      if (commercialCo && String(rrow.company_id) !== String(commercialCo)) {
        return res.status(400).json({ error: 'Khu vực phải cùng công ty với báo giá' });
      }
      if (rrow.is_active === false) {
        return res.status(400).json({ error: 'Khu vực đã bị vô hiệu' });
      }
    } else {
      quoteData.region_id = leadRegionId;
    }
    
    // Calc totals with per-item VAT + spec_factor (hệ số quy cách)
    // ── Excel fidelity: nếu item.lock_amount && imported_amount → giữ NGUYÊN số tiền Excel ──
    const processedItems = (items || []).map(item => {
      const specFactor = parseFloat(item.spec_factor) || 0;
      const grossAmount = specFactor > 0
        ? specFactor * (item.quantity || 1) * (item.unit_price || 0)
        : (item.quantity || 1) * (item.unit_price || 0);
      const importedAmount = (typeof item.imported_amount === 'number' && Number.isFinite(item.imported_amount))
        ? item.imported_amount
        : null;
      const isLocked = !!item.lock_amount && importedAmount !== null;
      let amount, discountAmount;
      if (isLocked) {
        amount = importedAmount;
        discountAmount = Math.max(0, grossAmount - amount);
      } else {
        discountAmount = grossAmount * (item.discount_percent || 0) / 100;
        amount = grossAmount - discountAmount;
      }
      const vatRate = item.vat_rate || 0;
      const vatAmount = amount * vatRate / 100;
      const total = amount + vatAmount;
      return {
        product_id: item.product_id || null, product_code: item.product_code || null,
        name: item.name, description: item.description || null,
        unit: item.unit || 'bộ', quantity: item.quantity || 1, unit_price: item.unit_price || 0,
        spec_factor: specFactor || null,
        height: item.height || null, width: item.width || null, length: item.length || null, weight: item.weight || null,
        discount_percent: item.discount_percent || 0, discount_amount: discountAmount,
        amount, vat_rate: vatRate, vat_amount: vatAmount, tax_amount: vatAmount, total,
        dimensions: item.dimensions || null, material: item.material || null, color: item.color || null, notes: item.notes || null,
        promo_code: item.promo_code || null, is_promo: item.is_promo || false,
        group_name: item.group_name || null,
      };
    });
    const subtotal = processedItems.reduce((s, i) => s + (i.amount || 0), 0);
    const discountAmt = quoteData.discount_type === 'percent' 
      ? subtotal * (quoteData.discount_value || 0) / 100 
      : (quoteData.discount_value || 0);
    const afterRebate = subtotal - discountAmt;
    const saleDiscountAmt = quoteData.sale_discount_type === 'percent'
      ? afterRebate * (quoteData.sale_discount_value || 0) / 100
      : (quoteData.sale_discount_value || 0);
    const afterAllDiscounts = Math.max(0, afterRebate - saleDiscountAmt);
    const taxAmt = processedItems.reduce((s, i) => s + (i.vat_amount || 0), 0);
    
    const { data: quote, error } = await insertQuotationRow({
      ...quoteData, code, subtotal, discount_amount: discountAmt, sale_discount_amount: saleDiscountAmt,
      tax_amount: taxAmt, total: afterAllDiscounts + taxAmt,
      created_by: req.user.userId,
    });
    if (error) throw error;

    // Insert items with vat_rate and vat_amount
    if (processedItems.length) {
      const itemRows = processedItems.map((item, i) => ({
        ...item, quotation_id: quote.id, item_order: i,
      }));
      await supabase.from('quotation_items').insert(itemRows);
    }

    try {
      let summary = 'Tạo báo giá';
      const qs = quotation_source || {};
      if (qs.from_excel) {
        summary = qs.excel_file_name ? `Tạo báo giá từ Excel (${qs.excel_file_name})` : 'Tạo báo giá từ Excel';
        if (qs.excel_review_confirmed) summary += ' — đã xác nhận đã kiểm tra số liệu';
      }
      await supabase.from('quotation_edit_history').insert({
        quotation_id: quote.id,
        action: 'created',
        summary,
        detail: {
          total: quote.total,
          item_count: processedItems.length,
          source: qs.from_excel ? 'excel' : 'manual',
        },
        created_by: req.user.userId,
      });
    } catch (he) {
      if (!String(he.message || '').includes('does not exist')) console.warn('[quotation_edit_history]', he.message);
    }

    // ═══ ĐỒNG BỘ SẢN PHẨM: chỉ liên kết product_id theo tên, KHÔNG cập nhật giá / không tạo mới ═══
    const syncedProducts = [];
    try {
      for (const item of processedItems) {
        if (!item.name || item.name.trim().length < 3) continue;
        // Tìm sản phẩm theo tên gần đúng (case-insensitive)
        const nameSearch = item.name.trim();
        const { data: existing } = await supabase.from('products')
          .select('id, name')
          .ilike('name', `%${nameSearch}%`)
          .limit(1);
        if (existing?.length) {
          item.product_id = existing[0].id; // Gán product_id vào item
          syncedProducts.push({ name: item.name, product_id: existing[0].id });
        }
        // Không tìm thấy → giữ nguyên, không tạo mới
      }
      console.log('[QUOTATION] Product link:', syncedProducts.length, 'items linked');
    } catch (e) { console.warn('[QUOTATION] Product link error:', e.message); }

    // ═══ AUTO-LINK: Tìm deal qua customer nếu chưa có lead_id ═══
    let linkedLeadId = quote.lead_id;
    if (!linkedLeadId && (quote.customer_id || quote.customer_name)) {
      try {
        // crm_leads không có cột `status` — deal "đang mở" = chưa đóng (actual_close_date IS NULL).
        let dealQuery = supabase.from('crm_leads')
          .select('id, customer_id')
          .eq('type', 'deal')
          .is('actual_close_date', null)
          .order('created_at', { ascending: false })
          .limit(1);

        if (quote.customer_id) {
          dealQuery = dealQuery.eq('customer_id', quote.customer_id);
        } else if (quote.customer_name) {
          // Tìm customer_id qua tên
          const { data: cust } = await supabase.from('customers')
            .select('id')
            .ilike('full_name', `%${quote.customer_name}%`)
            .limit(1).single();
          if (cust) {
            dealQuery = dealQuery.eq('customer_id', cust.id);
          }
        }

        const { data: deal } = await dealQuery.single();
        if (deal) {
          linkedLeadId = deal.id;
          // Cập nhật lead_id + customer_id cho báo giá
          await supabase.from('quotations').update({
            lead_id: deal.id,
            customer_id: deal.customer_id || quote.customer_id,
          }).eq('id', quote.id);
          quote.lead_id = deal.id;
          console.log(`[QUOTATION] Auto-linked BG ${quote.code} → Deal ${deal.id}`);
        }
      } catch (linkErr) {
        console.warn('[QUOTATION] Auto-link deal error:', linkErr.message);
      }
    }

    // ═══ AUTO-COMPLETE: Hoàn thành task "Lập báo giá" trong deal ═══
    if (linkedLeadId) {
      try {
        // Tìm task chưa hoàn thành ở stage quotation, ưu tiên "Lập báo giá"
        const { data: tasks } = await supabase.from('crm_tasks')
          .select('id, title, stage_slug, status')
          .eq('lead_id', linkedLeadId)
          .in('stage_slug', ['quotation', 'deal_quote_contract'])
          .neq('status', 'completed')
          .order('order_index')
          .limit(5);

        // Tìm task phù hợp nhất: "Lập báo giá" > bất kỳ task quotation nào
        const quotationTask = (tasks || []).find(t =>
          t.title.includes('Lập báo giá') || t.title.includes('lập báo giá')
        ) || (tasks || [])[0];

        if (quotationTask) {
          // Mark completed
          await supabase.from('crm_tasks').update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            notes: `✅ Đã tạo báo giá ${quote.code} (${formatMoney(quote.total)})\n📎 Xem: /crm/quotations/${quote.id}`,
            updated_at: new Date().toISOString(),
          }).eq('id', quotationTask.id);

          // Thêm attachment vào task (link tới báo giá)
          const { data: att } = await supabase.from('crm_task_attachments').insert({
            task_id: quotationTask.id,
            lead_id: linkedLeadId,
            name: `📄 ${quote.code} - ${quote.title || 'Báo giá'}`,
            doc_type: 'quotation',
            notes: `Báo giá ${quote.code}: ${formatMoney(quote.total)}\nKH: ${quote.customer_name || ''}\nLink: /crm/quotations/${quote.id}`,
            created_by: req.user.userId,
          }).select().single();

          // Sync → lead_documents
          if (att) {
            const { data: lead } = await supabase.from('crm_leads')
              .select('project_id').eq('id', linkedLeadId).single();
            await supabase.from('lead_documents').insert({
              lead_id: linkedLeadId,
              project_id: lead?.project_id || null,
              name: `[${quotationTask.title}] 📄 ${quote.code}`,
              doc_type: 'quotation',
              notes: att.notes,
              created_by: req.user.userId,
              source_attachment_id: att.id,
              ...getLeadDocumentFieldsFromCrmTask(quotationTask, { linkToProject: !!lead?.project_id }),
            });
          }

          quote.auto_task = { taskId: quotationTask.id, taskTitle: quotationTask.title, completed: true };
          console.log(`[QUOTATION] Auto-completed task "${quotationTask.title}" for deal ${linkedLeadId}`);
        }
      } catch (taskErr) {
        console.warn('[QUOTATION] Auto-complete task error:', taskErr.message);
      }
    }

    // 🔔 NOTIFICATION: Báo giá mới
    try {
      const t = await getNotifyTargets(quote.lead_id);
      const allIds = [...new Set([...t.ownerIds, ...t.adminIds])];
      if (allIds.length) await notifyMultiple(req, allIds, 'quotation_created',
        '📄 Báo giá mới',
        `Báo giá ${quote.code} — KH: ${quote.customer_name || 'N/A'} — ${formatMoney(quote.total)}`,
        'quotation', quote.id);
    } catch (ne) { console.warn('[NOTIFY] quotation_created:', ne.message); }

    // ═══ SYNC: Update customer's last quotation amount ═══
    if (quote.customer_id) {
      try {
        const { data: allQuotes } = await supabase.from('quotations')
          .select('total')
          .eq('customer_id', quote.customer_id)
          .in('status', ['draft', 'sent', 'accepted', 'converted']);
        const totalQuotationValue = (allQuotes || []).reduce((s, q) => s + (q.total || 0), 0);
        await supabase.from('customers').update({
          last_quotation_amount: quote.total,
          last_quotation_at: new Date().toISOString(),
          total_quotation_value: totalQuotationValue,
          updated_at: new Date().toISOString(),
        }).eq('id', quote.customer_id);
        quote.customer_synced = true;
      } catch (syncErr) {
        console.warn('[QUOTATION] Sync customer error:', syncErr.message);
      }
    }

    // Sync deal estimated_value
    if (linkedLeadId && quote.total > 0) {
      try {
        await supabase.from('crm_leads').update({
          estimated_value: quote.total,
          updated_at: new Date().toISOString(),
        }).eq('id', linkedLeadId);
        quote.deal_value_synced = true;
      } catch (syncErr) {
        console.warn('[QUOTATION] Sync deal value error:', syncErr.message);
      }
    }

    res.status(201).json({ ...quote, synced_products: syncedProducts });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Helper format money cho notes
function formatMoney(n) {
  if (!n) return '0 đ';
  return new Intl.NumberFormat('vi-VN').format(Math.round(n)) + ' đ';
}

r.put('/quotations/:id', async (req, res) => {
  try {
    const { data: qAuth } = await supabase
      .from('quotations')
      .select('created_by, company_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!qAuth) return res.status(404).json({ error: 'Không tìm thấy báo giá' });
    if (!userMayAccessQuotationRow(req, qAuth)) {
      return res.status(403).json({ error: 'Không có quyền sửa báo giá này' });
    }

    const { items: itemsBody, quotation_source: _qs, ...quoteDataFromBody } = req.body;

    const { data: prevQuote } = await supabase.from('quotations')
      .select('title, total, status, customer_name, discount_value, discount_type, code')
      .eq('id', req.params.id).single();

    let quoteData = quoteDataFromBody;
    if (itemsBody === undefined) {
      const { data: fullQ } = await supabase.from('quotations').select('*').eq('id', req.params.id).single();
      if (fullQ) {
        quoteData = { ...fullQ, ...quoteDataFromBody };
        delete quoteData.id;
        delete quoteData.code;
        delete quoteData.created_at;
        delete quoteData.created_by;
      }
    }

    // Sanitize: empty strings → null for UUID fields
    const uuidFields = ['customer_id', 'lead_id', 'project_id', 'approved_by', 'company_id', 'region_id', 'fulfillment_lead_id', 'source_task_id'];
    uuidFields.forEach(f => { if (quoteData[f] === '' || quoteData[f] === undefined) quoteData[f] = null; });
    // Sanitize: empty strings → null for date fields
    ['valid_until', 'issue_date', 'sent_at', 'accepted_at', 'closed_at', 'signed_date', 'delivery_date'].forEach(f => { if (quoteData[f] === '') quoteData[f] = null; });
    let commercialCoPut = quoteData.company_id || null;
    let leadRegionIdPut = null;
    if (quoteData.lead_id) {
      const { data: lrowPut } = await supabase
        .from('crm_leads')
        .select('company_id, region_id')
        .eq('id', quoteData.lead_id)
        .maybeSingle();
      if (lrowPut?.company_id) commercialCoPut = lrowPut.company_id;
      if (lrowPut?.region_id) leadRegionIdPut = lrowPut.region_id;
    }
    const qCoPut = enforceCommercialDocCompanyOnWrite(req, res, commercialCoPut, 'Báo giá');
    if (!qCoPut.ok) return;
    commercialCoPut = qCoPut.companyId;
    quoteData.company_id = commercialCoPut;

    // region_id (PUT): nếu client gửi region_id rỗng & lead có region → kế thừa; nếu có → kiểm tra cùng company.
    if (quoteData.region_id) {
      const { data: rrowPut } = await supabase
        .from('company_regions')
        .select('id, company_id, is_active')
        .eq('id', quoteData.region_id)
        .maybeSingle();
      if (!rrowPut) return res.status(400).json({ error: 'Khu vực không tồn tại' });
      if (commercialCoPut && String(rrowPut.company_id) !== String(commercialCoPut)) {
        return res.status(400).json({ error: 'Khu vực phải cùng công ty với báo giá' });
      }
    } else if (leadRegionIdPut) {
      quoteData.region_id = leadRegionIdPut;
    }
    const quoteMoneyOrNullPut = (v) => {
      if (v === '' || v === undefined || v === null) return null;
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      const onlyDigits = String(v).replace(/\s/g, '').replace(/đ/gi, '').replace(/[^\d]/g, '');
      if (!onlyDigits) return null;
      const n = parseInt(onlyDigits, 10);
      return Number.isFinite(n) ? n : null;
    };
    if ('deposit_amount' in quoteData) quoteData.deposit_amount = quoteMoneyOrNullPut(quoteData.deposit_amount);
    if ('remaining_amount' in quoteData) quoteData.remaining_amount = quoteMoneyOrNullPut(quoteData.remaining_amount);
    if ('deposit_received' in quoteData) {
      const dr = quoteData.deposit_received;
      if (dr === '' || dr === undefined || dr === null) quoteData.deposit_received = null;
      else if (dr === true || dr === 'true') quoteData.deposit_received = true;
      else if (dr === false || dr === 'false') quoteData.deposit_received = false;
      else quoteData.deposit_received = null;
    }
    if (quoteData.deposit_label === '') quoteData.deposit_label = null;
    if (quoteData.remaining_note === '') quoteData.remaining_note = null;
    if (quoteData.source_excel_file_url === '') quoteData.source_excel_file_url = null;
    if (quoteData.source_excel_file_name === '') quoteData.source_excel_file_name = null;

    let rawItems = itemsBody;
    if (rawItems === undefined) {
      const { data: existingItems } = await supabase.from('quotation_items').select('*').eq('quotation_id', req.params.id).order('item_order');
      rawItems = existingItems || [];
    }
    
    // Calc totals with per-item VAT + spec_factor (hệ số quy cách)
    // ── Excel fidelity: nếu item.lock_amount && imported_amount → giữ NGUYÊN số tiền Excel ──
    const processedItems = (rawItems || []).map(item => {
      const specFactor = parseFloat(item.spec_factor) || 0;
      const grossAmount = specFactor > 0
        ? specFactor * (item.quantity || 1) * (item.unit_price || 0)
        : (item.quantity || 1) * (item.unit_price || 0);
      const importedAmount = (typeof item.imported_amount === 'number' && Number.isFinite(item.imported_amount))
        ? item.imported_amount
        : null;
      const isLocked = !!item.lock_amount && importedAmount !== null;
      let amount, discountAmount;
      if (isLocked) {
        amount = importedAmount;
        discountAmount = Math.max(0, grossAmount - amount);
      } else {
        discountAmount = grossAmount * (item.discount_percent || 0) / 100;
        amount = grossAmount - discountAmount;
      }
      const vatRate = item.vat_rate || 0;
      const vatAmount = amount * vatRate / 100;
      const total = amount + vatAmount;
      return {
        product_id: item.product_id || null, product_code: item.product_code || null,
        name: item.name, description: item.description || null,
        unit: item.unit || 'bộ', quantity: item.quantity || 1, unit_price: item.unit_price || 0,
        spec_factor: specFactor || null,
        height: item.height || null, width: item.width || null, length: item.length || null, weight: item.weight || null,
        discount_percent: item.discount_percent || 0, discount_amount: discountAmount,
        amount, vat_rate: vatRate, vat_amount: vatAmount, tax_amount: vatAmount, total,
        dimensions: item.dimensions || null, material: item.material || null, color: item.color || null, notes: item.notes || null,
        promo_code: item.promo_code || null, is_promo: item.is_promo || false,
        group_name: item.group_name || null,
      };
    });
    const subtotal = processedItems.reduce((s, i) => s + (i.amount || 0), 0);
    const discountAmt = quoteData.discount_type === 'percent' 
      ? subtotal * (quoteData.discount_value || 0) / 100 
      : (quoteData.discount_value || 0);
    const afterRebate = subtotal - discountAmt;
    const saleDiscountAmt = quoteData.sale_discount_type === 'percent'
      ? afterRebate * (quoteData.sale_discount_value || 0) / 100
      : (quoteData.sale_discount_value || 0);
    const afterAllDiscounts = Math.max(0, afterRebate - saleDiscountAmt);
    const taxAmt = processedItems.reduce((s, i) => s + (i.vat_amount || 0), 0);

    const { data, error } = await updateQuotationRow(req.params.id, {
      ...quoteData, subtotal, discount_amount: discountAmt, sale_discount_amount: saleDiscountAmt,
      tax_amount: taxAmt, total: afterAllDiscounts + taxAmt,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;

    // Replace items with vat_rate and vat_amount
    await supabase.from('quotation_items').delete().eq('quotation_id', req.params.id);
    if (processedItems.length) {
      const itemRows = processedItems.map((item, i) => ({
        ...item, quotation_id: req.params.id, item_order: i, id: undefined,
      }));
      await supabase.from('quotation_items').insert(itemRows);
    }

    try {
      const parts = [];
      const pt = prevQuote?.total != null ? Number(prevQuote.total) : null;
      const nt = data?.total != null ? Number(data.total) : null;
      if (prevQuote && pt !== nt && pt != null && nt != null) {
        parts.push(`Tổng ${formatMoney(prevQuote.total)} → ${formatMoney(data.total)}`);
      }
      if (prevQuote && prevQuote.title !== data.title) parts.push('Đổi tiêu đề');
      if (prevQuote && prevQuote.status !== data.status) {
        parts.push(`Trạng thái ${prevQuote.status || '—'} → ${data.status || '—'}`);
      }
      const summary = parts.length ? `Cập nhật: ${parts.join('; ')}` : 'Cập nhật báo giá';
      await supabase.from('quotation_edit_history').insert({
        quotation_id: req.params.id,
        action: 'updated',
        summary,
        detail: {
          before: prevQuote ? { title: prevQuote.title, total: prevQuote.total, status: prevQuote.status } : null,
          after: { title: data.title, total: data.total, status: data.status },
          item_count: processedItems.length,
        },
        created_by: req.user.userId,
      });
    } catch (he) {
      if (!String(he.message || '').includes('does not exist')) console.warn('[quotation_edit_history]', he.message);
    }

    // AUTO-FLOW: BG chấp nhận → auto tạo ĐH + Project
    let autoResult = null;
    if (quoteData.status === 'accepted') {
      try { autoResult = await onQuotationAccepted(req.params.id, req.user.userId); } catch (e) { console.error('Auto-flow BG→ĐH error:', e.message); }
    }

    // 🔔 NOTIFICATION: Cập nhật báo giá
    try {
      const t = await getNotifyTargets(data.lead_id);
      if (t.ownerIds.length) await notifyMultiple(req, t.ownerIds, 'quotation_updated',
        '📝 Cập nhật báo giá',
        `Báo giá ${data.code} đã được cập nhật${quoteData.status === 'accepted' ? ' → Chấp nhận ✅' : ''}`,
        'quotation', data.id);
    } catch (ne) { console.warn('[NOTIFY] quotation_updated:', ne.message); }

    res.json({ ...data, auto: autoResult });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
r.post('/quotations/:id/convert-to-order', async (req, res) => {
  try {
    const { data: quote } = await supabase.from('quotations').select('*').eq('id', req.params.id).single();
    if (!quote) return res.status(404).json({ error: 'Không tìm thấy báo giá' });
    if (!userMayAccessQuotationRow(req, quote)) {
      return res.status(403).json({ error: 'Không có quyền chuyển báo giá này sang đơn hàng' });
    }

    const { data: qItems } = await supabase.from('quotation_items').select('*').eq('quotation_id', req.params.id).order('item_order');

    const orderCode = await nextCode('DH');
    const { data: order, error } = await supabase.from('orders').insert({
      code: orderCode,
      ...snapshotOrderRowFromQuotation(quote),
      created_by: req.user.userId,
    }).select('*').single();
    if (error) throw error;

    if (qItems?.length) {
      await supabase.from('order_items').insert(mapQuotationItemsToOrderRows(qItems, order.id));
    }

    // Update quotation status
    await supabase.from('quotations').update({ status: 'converted', updated_at: new Date().toISOString() }).eq('id', req.params.id);

    // 🔔 NOTIFICATION: BG → ĐH
    try {
      const t = await getNotifyTargets(order.lead_id);
      const allIds = [...new Set([...t.ownerIds, ...t.adminIds])];
      if (allIds.length) await notifyMultiple(req, allIds, 'order_created',
        '🛒 Đơn hàng mới từ báo giá',
        `Đơn hàng ${orderCode} được tạo từ BG ${quote.code} — ${formatMoney(order.total)}`,
        'order', order.id);
    } catch (ne) { console.warn('[NOTIFY] bg_to_dh:', ne.message); }

    res.status(201).json(order);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══ DELETE QUOTATION ═══
r.delete('/quotations/:id', async (req, res) => {
  try {
    const { data: delScope } = await supabase
      .from('quotations')
      .select('created_by, company_id, code, lead_id, customer_name')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!delScope) return res.status(404).json({ error: 'Không tìm thấy báo giá' });
    if (!userMayAccessQuotationRow(req, delScope)) {
      return res.status(403).json({ error: 'Không có quyền xóa báo giá này' });
    }
    const delQ = { code: delScope.code, lead_id: delScope.lead_id, customer_name: delScope.customer_name };

    // Unlink orders referencing this quotation
    await supabase.from('orders').update({ quotation_id: null }).eq('quotation_id', req.params.id);
    // Delete items
    await supabase.from('quotation_items').delete().eq('quotation_id', req.params.id);
    // Delete quotation
    const { error } = await supabase.from('quotations').delete().eq('id', req.params.id);
    if (error) throw error;

    // 🔔 NOTIFICATION: Xóa báo giá
    try {
      const t = await getNotifyTargets(delQ?.lead_id);
      if (t.adminIds.length) await notifyMultiple(req, t.adminIds, 'item_deleted',
        '🗑️ Báo giá đã xóa',
        `Báo giá ${delQ?.code || ''} — KH: ${delQ?.customer_name || 'N/A'} đã bị xóa`,
        'quotation', req.params.id);
    } catch (ne) {}

    res.json({ message: 'Đã xóa báo giá' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// ORDERS (Đơn hàng)
// ═══════════════════════════════════════════════════════════════════════════
r.get('/orders', async (req, res) => {
  try {
    const { status, search, limit = 50, lead_id, company_id: coQ } = req.query;
    let q = supabase.from('orders')
      .select('*, customer:customers(id, full_name, phone), creator:users!orders_created_by_fkey(id, full_name)')
      .order('created_at', { ascending: false }).limit(parseInt(limit));
    const oScope = resolveCommercialDocListCompanyScope(req, res, coQ);
    if (!oScope.ok) return;
    if (oScope.companyId) q = q.eq('company_id', oScope.companyId);
    if (status) q = q.eq('status', status);
    if (search) q = q.or(`code.ilike.%${search}%,title.ilike.%${search}%,customer_name.ilike.%${search}%`);
    if (lead_id && /^[0-9a-f-]{36}$/i.test(String(lead_id))) q = await applyLeadOrCustomerSalesFilter(q, lead_id);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/orders/:id', async (req, res) => {
  try {
    const { data: order } = await supabase.from('orders')
      .select('*, fulfillment_lead_id, lead_id, customer:customers(id, full_name, phone, email, address, company, tax_code)')
      .eq('id', req.params.id).single();
    let { data: items } = await supabase.from('order_items')
      .select('*, product:products(id, name, code)')
      .eq('order_id', req.params.id).order('item_order');
    items = items || [];
    let source_quotation = null;
    if (order?.quotation_id) {
      const { data: q } = await supabase.from('quotations')
        .select('id, code, notes, valid_until, delivery_terms, payment_terms, deposit_amount, deposit_received, deposit_label, remaining_amount, remaining_note, description')
        .eq('id', order.quotation_id).maybeSingle();
      source_quotation = q || null;
      // Đơn hàng không có dòng (lỗi copy trước đây / DB trống) — hiển thị dòng từ báo giá gốc
      if (!items.length) {
        const { data: qItems } = await supabase.from('quotation_items')
          .select('*, product:products(id, name, code)')
          .eq('quotation_id', order.quotation_id).order('item_order');
        if (qItems?.length) items = qItems;
      }
    }
    res.json({ ...order, items, source_quotation });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/orders/:id', async (req, res) => {
  try {
    const updates = { ...req.body, updated_at: new Date().toISOString() };
    // Sanitize: empty strings → null for UUID fields
    ['customer_id', 'lead_id', 'quotation_id', 'project_id'].forEach(f => {
      if (updates[f] === '') updates[f] = null;
    });
    if (updates.status === 'confirmed' && !updates.confirmed_at) updates.confirmed_at = new Date().toISOString();
    if (updates.status === 'shipped' && !updates.shipped_at) updates.shipped_at = new Date().toISOString();
    if (updates.status === 'delivered' && !updates.delivered_at) updates.delivered_at = new Date().toISOString();
    if (updates.status === 'cancelled' && !updates.cancelled_at) updates.cancelled_at = new Date().toISOString();
    const { data, error } = await supabase.from('orders').update(updates).eq('id', req.params.id).select('*').single();
    if (error) throw error;

    // AUTO-FLOW: ĐH xác nhận → tự động tạo Project + Gen Tasks
    let autoProject = null;
    if (updates.status === 'confirmed') {
      try { autoProject = await onOrderConfirmed(req.params.id, req.user.userId); } catch (e) { console.error('Auto-flow error:', e.message); }
    }

    // 🔔 NOTIFICATION: Cập nhật đơn hàng
    try {
      const statusLabels = { confirmed: 'Đã xác nhận', shipped: 'Đang giao', delivered: 'Đã giao', cancelled: 'Đã hủy' };
      const statusLabel = statusLabels[updates.status] || '';
      const t = await getNotifyTargets(data.lead_id);
      const allIds = [...new Set([...t.ownerIds, ...t.adminIds])];
      if (allIds.length && updates.status) await notifyMultiple(req, allIds, 'order_updated',
        `📦 ĐH ${data.code} — ${statusLabel}`,
        `Đơn hàng ${data.code} cập nhật trạng thái: ${statusLabel}`,
        'order', data.id);
    } catch (ne) { console.warn('[NOTIFY] order_updated:', ne.message); }

    res.json({ ...data, auto_project: autoProject });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/orders', async (req, res) => {
  try {
    const { items, ...orderData } = req.body;
    const code = await nextCode('DH');

    // Sanitize: empty strings → null for UUID fields
    ['customer_id', 'lead_id', 'quotation_id', 'project_id', 'company_id'].forEach(f => {
      if (orderData[f] === '' || orderData[f] === undefined) orderData[f] = null;
    });

    let orderCo = orderData.company_id || null;
    if (orderData.lead_id) {
      const { data: lrow } = await supabase.from('crm_leads').select('company_id').eq('id', orderData.lead_id).maybeSingle();
      if (lrow?.company_id) orderCo = lrow.company_id;
    } else if (orderData.quotation_id) {
      const { data: qrow } = await supabase.from('quotations').select('company_id, lead_id').eq('id', orderData.quotation_id).maybeSingle();
      if (qrow?.company_id) orderCo = qrow.company_id;
      else if (qrow?.lead_id) {
        const { data: l2 } = await supabase.from('crm_leads').select('company_id').eq('id', qrow.lead_id).maybeSingle();
        if (l2?.company_id) orderCo = l2.company_id;
      }
    }
    const oCoWrite = enforceCommercialDocCompanyOnWrite(req, res, orderCo, 'Đơn hàng');
    if (!oCoWrite.ok) return;
    orderCo = oCoWrite.companyId;
    orderData.company_id = orderCo;

    const processedItems = (items || []).map(item => {
      const amount = (item.quantity || 1) * (item.unit_price || 0) * (1 - (item.discount_percent || 0) / 100);
      const vatRate = item.vat_rate || 0;
      const vatAmount = amount * vatRate / 100;
      return { ...item, amount, vat_rate: vatRate, vat_amount: vatAmount };
    });
    const subtotal = processedItems.reduce((s, i) => s + (i.amount || 0), 0);
    const discountAmt = orderData.discount_type === 'percent' ? subtotal * (orderData.discount_value || 0) / 100 : (orderData.discount_value || 0);
    const afterDiscount = subtotal - discountAmt;
    const taxAmt = processedItems.reduce((s, i) => s + (i.vat_amount || 0), 0);

    const { data, error } = await supabase.from('orders').insert({
      ...orderData, code, subtotal, discount_amount: discountAmt,
      tax_amount: taxAmt, total: afterDiscount + taxAmt, created_by: req.user.userId,
    }).select('*').single();
    if (error) throw error;

    // AUTO: create fulfillment deal (CRMTasks) for this order
    try {
      if (data?.lead_id) {
        const { data: parentDeal } = await supabase
          .from('crm_leads')
          .select('id, title, customer_id, company_id, pipeline_id, stage_id, assigned_to, lead_owner_id, estimated_value, parent_lead_id, project_id, code')
          .eq('id', data.lead_id)
          .maybeSingle();
        if (parentDeal?.id) {
          const displayLabel = data.title || data.code || 'Đơn hàng';
          const childLeadId = await createFulfillmentChildDeal({
            parentDeal,
            masterProjectId: data.project_id || parentDeal.project_id || null,
            displayLabel,
            userId: req.user.userId,
            estimatedValue: data.total || 0,
          });
          const { error: uErr } = await supabase.from('orders').update({ fulfillment_lead_id: childLeadId }).eq('id', data.id);
          if (!uErr) data.fulfillment_lead_id = childLeadId;
        }
      }
    } catch (fe) {
      console.warn('[crm/orders] create fulfillment deal:', fe.message);
    }

    if (processedItems.length) {
      await supabase.from('order_items').insert(processedItems.map((item, i) => ({
        ...item, order_id: data.id, item_order: i,
      })));
    }

    // 🔔 NOTIFICATION: Đơn hàng mới
    try {
      const t = await getNotifyTargets(data.lead_id);
      const allIds = [...new Set([...t.ownerIds, ...t.adminIds])];
      if (allIds.length) await notifyMultiple(req, allIds, 'order_created',
        '🛒 Đơn hàng mới',
        `Đơn hàng ${code} — KH: ${data.customer_name || 'N/A'} — ${formatMoney(data.total)}`,
        'order', data.id);
    } catch (ne) { console.warn('[NOTIFY] order_created:', ne.message); }

    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Convert: Order → Invoice
r.post('/orders/:id/create-invoice', async (req, res) => {
  try {
    const { data: order } = await supabase.from('orders').select('*').eq('id', req.params.id).single();
    if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });

    const { data: oItems } = await supabase.from('order_items').select('*').eq('order_id', req.params.id).order('item_order');

    const invCode = await nextCode('HD');
    const { data: invoice, error } = await supabase.from('invoices').insert({
      code: invCode,
      company_id: order.company_id || null,
      customer_id: order.customer_id, customer_name: order.customer_name,
      customer_phone: order.customer_phone, customer_address: order.customer_address,
      order_id: order.id, quotation_id: order.quotation_id, project_id: order.project_id,
      title: order.title, subtotal: order.subtotal, discount_type: order.discount_type,
      discount_value: order.discount_value, discount_amount: order.discount_amount,
      tax_rate: order.tax_rate, tax_amount: order.tax_amount, total: order.total,
      created_by: req.user.userId,
    }).select('*').single();
    if (error) throw error;

    if (oItems?.length) {
      await supabase.from('invoice_items').insert(oItems.map(oi => ({
        invoice_id: invoice.id, product_id: oi.product_id, order_item_id: oi.id,
        item_order: oi.item_order, name: oi.name, description: oi.description,
        unit: oi.unit, quantity: oi.quantity, unit_price: oi.unit_price,
        discount_percent: oi.discount_percent, amount: oi.amount,
        vat_rate: oi.vat_rate || 0, vat_amount: oi.vat_amount || 0,
        notes: oi.notes,
      })));
    }

    res.status(201).json(invoice);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══ DELETE ORDER ═══
r.delete('/orders/:id', async (req, res) => {
  try {
    // Get info before delete
    const { data: delO } = await supabase.from('orders').select('code, lead_id, customer_name').eq('id', req.params.id).single();
    await supabase.from('order_items').delete().eq('order_id', req.params.id);
    const { error } = await supabase.from('orders').delete().eq('id', req.params.id);
    if (error) throw error;

    // 🔔 NOTIFICATION: Xóa đơn hàng
    try {
      const t = await getNotifyTargets(delO?.lead_id);
      if (t.adminIds.length) await notifyMultiple(req, t.adminIds, 'item_deleted',
        '🗑️ Đơn hàng đã xóa',
        `Đơn hàng ${delO?.code || ''} — KH: ${delO?.customer_name || 'N/A'} đã bị xóa`,
        'order', req.params.id);
    } catch (ne) {}

    res.json({ message: 'Đã xóa đơn hàng' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// INVOICES (Hóa đơn)
// ═══════════════════════════════════════════════════════════════════════════
r.get('/invoices', async (req, res) => {
  try {
    const { status, search, limit = 50, lead_id, company_id: coQ } = req.query;
    let q = supabase.from('invoices')
      .select('*, customer:customers(id, full_name, phone), creator:users!invoices_created_by_fkey(id, full_name)')
      .order('created_at', { ascending: false }).limit(parseInt(limit));
    const iScope = resolveCommercialDocListCompanyScope(req, res, coQ);
    if (!iScope.ok) return;
    if (iScope.companyId) q = q.eq('company_id', iScope.companyId);
    if (status) q = q.eq('status', status);
    if (search) q = q.or(`code.ilike.%${search}%,title.ilike.%${search}%,customer_name.ilike.%${search}%`);
    if (lead_id && /^[0-9a-f-]{36}$/i.test(String(lead_id))) q = await applyLeadOrCustomerSalesFilter(q, lead_id);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/invoices/:id', async (req, res) => {
  try {
    const { data: invoice } = await supabase.from('invoices')
      .select('*, customer:customers(id, full_name, phone, email, address, company, tax_code)')
      .eq('id', req.params.id).single();
    const { data: items } = await supabase.from('invoice_items')
      .select('*, product:products(id, name, code)')
      .eq('invoice_id', req.params.id).order('item_order');
    const { data: payments } = await supabase.from('payment_records')
      .select('*').eq('invoice_id', req.params.id).order('payment_date', { ascending: false });
    res.json({ ...invoice, items: items || [], payments: payments || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create invoice directly (not from order)
r.post('/invoices', async (req, res) => {
  try {
    const { items, ...invoiceData } = req.body;
    const code = await nextCode('HD');

    // Sanitize: empty strings → null for UUID fields
    ['customer_id', 'order_id', 'quotation_id', 'project_id', 'company_id'].forEach(f => {
      if (invoiceData[f] === '' || invoiceData[f] === undefined) invoiceData[f] = null;
    });

    let invCo = invoiceData.company_id || null;
    if (invoiceData.order_id) {
      const { data: orow } = await supabase.from('orders').select('company_id').eq('id', invoiceData.order_id).maybeSingle();
      if (orow?.company_id) invCo = orow.company_id;
    } else if (invoiceData.quotation_id) {
      const { data: qr } = await supabase.from('quotations').select('company_id').eq('id', invoiceData.quotation_id).maybeSingle();
      if (qr?.company_id) invCo = qr.company_id;
    }
    const iCoWrite = enforceCommercialDocCompanyOnWrite(req, res, invCo, 'Hóa đơn');
    if (!iCoWrite.ok) return;
    invCo = iCoWrite.companyId;

    const { data: inv, error } = await supabase.from('invoices').insert({
      code,
      company_id: invCo,
      customer_id: invoiceData.customer_id,
      customer_name: invoiceData.customer_name || null,
      customer_phone: invoiceData.customer_phone || null,
      customer_address: invoiceData.customer_address || null,
      customer_tax_code: invoiceData.customer_tax_code || null,
      title: invoiceData.title || null,
      subtotal: invoiceData.subtotal || 0,
      discount_type: invoiceData.discount_type || null,
      discount_value: invoiceData.discount_value || 0,
      discount_amount: invoiceData.discount_amount || 0,
      tax_amount: invoiceData.tax_amount || 0,
      total: invoiceData.total || 0,
      notes: invoiceData.notes || null,
      due_date: invoiceData.due_date || null,
      payment_terms: invoiceData.payment_terms || null,
      created_by: req.user.userId,
    }).select('*').single();
    if (error) throw error;

    // 🔔 NOTIFICATION: Hóa đơn mới
    try {
      const { data: admins } = await supabase.from('users').select('id').eq('role', 'admin').eq('is_active', true);
      const adminIds = (admins || []).map(u => u.id);
      if (adminIds.length) await notifyMultiple(req, adminIds, 'invoice_created',
        '🧾 Hóa đơn mới',
        `Hóa đơn ${code} — KH: ${inv.customer_name || 'N/A'} — ${formatMoney(inv.total)}`,
        'invoice', inv.id);
    } catch (ne) { console.warn('[NOTIFY] invoice_created:', ne.message); }

    res.status(201).json(inv);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Add items to invoice (batch)
r.post('/invoices/:id/items', async (req, res) => {
  try {
    const { items } = req.body;
    if (!items?.length) return res.status(400).json({ error: 'Không có hàng hóa' });
    const itemRows = items.map((item, i) => ({
      invoice_id: req.params.id,
      product_id: item.product_id || null,
      product_code: item.product_code || null,
      item_order: i,
      name: item.name,
      description: item.description || null,
      unit: item.unit || 'bộ',
      quantity: item.quantity || 1,
      unit_price: item.unit_price || 0,
      discount_percent: item.discount_percent || 0,
      discount_amount: item.discount_amount || 0,
      amount: item.amount || 0,
      vat_rate: item.vat_rate || 0,
      vat_amount: item.vat_amount || 0,
      notes: item.notes || null,
    }));
    const { data, error } = await supabase.from('invoice_items').insert(itemRows).select();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Record payment
r.post('/invoices/:id/payments', async (req, res) => {
  try {
    const body = { ...req.body };
    ['order_id', 'invoice_id'].forEach(f => { if (body[f] === '') body[f] = null; });
    const { data: payment, error } = await supabase.from('payment_records')
      .insert({ ...body, invoice_id: req.params.id, created_by: req.user.userId })
      .select('*').single();
    if (error) throw error;

    // Update invoice paid_amount
    const { data: allPayments } = await supabase.from('payment_records')
      .select('amount').eq('invoice_id', req.params.id);
    const totalPaid = (allPayments || []).reduce((s, p) => s + (p.amount || 0), 0);

    const { data: invoice } = await supabase.from('invoices').select('total').eq('id', req.params.id).single();
    const paymentStatus = totalPaid >= (invoice?.total || 0) ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid';

    await supabase.from('invoices').update({
      paid_amount: totalPaid, payment_status: paymentStatus,
      paid_at: paymentStatus === 'paid' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id);

    // 🔔 NOTIFICATION: Thanh toán
    try {
      const { data: inv } = await supabase.from('invoices').select('code, lead_id, customer_name, total, order_id').eq('id', req.params.id).single();
      const t = await getNotifyTargets(inv?.lead_id);
      const allIds = [...new Set([...t.ownerIds, ...t.adminIds])];
      const paidLabel = paymentStatus === 'paid' ? '✅ Đã thanh toán đủ' : '💰 Nhận thanh toán';
      if (allIds.length) await notifyMultiple(req, allIds, 'payment_received',
        paidLabel,
        `${inv?.code || 'HĐ'} — Nhận ${formatMoney(payment.amount)} (${formatMoney(totalPaid)}/${formatMoney(inv?.total)})`,
        'invoice', req.params.id);
    } catch (ne) { console.warn('[NOTIFY] payment:', ne.message); }

    res.status(201).json(payment);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══ DELETE INVOICE ═══
r.delete('/invoices/:id', async (req, res) => {
  try {
    // Get info before delete
    const { data: delI } = await supabase.from('invoices').select('code, customer_name').eq('id', req.params.id).single();
    await supabase.from('payment_records').delete().eq('invoice_id', req.params.id);
    await supabase.from('invoice_items').delete().eq('invoice_id', req.params.id);
    const { error } = await supabase.from('invoices').delete().eq('id', req.params.id);
    if (error) throw error;

    // 🔔 NOTIFICATION: Xóa hóa đơn
    try {
      const { data: admins } = await supabase.from('users').select('id').eq('role', 'admin').eq('is_active', true);
      const adminIds = (admins || []).map(u => u.id);
      if (adminIds.length) await notifyMultiple(req, adminIds, 'item_deleted',
        '🗑️ Hóa đơn đã xóa',
        `Hóa đơn ${delI?.code || ''} — KH: ${delI?.customer_name || 'N/A'} đã bị xóa`,
        'invoice', req.params.id);
    } catch (ne) {}

    res.json({ message: 'Đã xóa hóa đơn' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ MISA meInvoice — Phát hành hóa đơn điện tử ═══

// POST /invoices/:id/misa-publish — Phát hành HĐĐT lên MISA meInvoice
r.post('/invoices/:id/misa-publish', async (req, res) => {
  try {
    if (!misaService) return res.status(503).json({ error: 'MISA service chưa được cấu hình' });

    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .select('*, customer:customers(id, full_name, email, tax_code)')
      .eq('id', req.params.id).single();
    if (invErr || !invoice) return res.status(404).json({ error: 'Không tìm thấy hóa đơn' });

    if (invoice.misa_status === 'published') {
      return res.status(400).json({ error: 'Hóa đơn đã được phát hành lên MISA (số: ' + invoice.misa_invoice_no + ')' });
    }

    const { data: items } = await supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', req.params.id)
      .order('item_order');

    // Gắn email từ customer nếu invoice không có
    const invoiceWithEmail = {
      ...invoice,
      customer_email: invoice.customer_email || invoice.customer?.email || '',
    };

    const result = await misaService.publishInvoice(invoiceWithEmail, items || []);

    // Cập nhật trạng thái MISA vào DB
    await supabase.from('invoices').update({
      misa_status: 'published',
      misa_invoice_no: result.invoiceNo,
      misa_lookup_code: result.lookupCode,
      misa_ref_id: invoice.id,
      misa_published_at: new Date().toISOString(),
      misa_error_message: null,
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id);

    res.json({
      success: true,
      invoiceNo: result.invoiceNo,
      lookupCode: result.lookupCode,
    });
  } catch (e) {
    // Lưu lỗi vào DB để dễ debug
    await supabase.from('invoices').update({
      misa_error_message: e.message,
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id);
    res.status(500).json({ error: e.message });
  }
});

// POST /invoices/:id/misa-send-email — Gửi email HĐĐT qua MISA
r.post('/invoices/:id/misa-send-email', async (req, res) => {
  try {
    if (!misaService) return res.status(503).json({ error: 'MISA service chưa được cấu hình' });

    const { data: invoice } = await supabase
      .from('invoices')
      .select('misa_invoice_no, misa_status, customer_name, customer:customers(email)')
      .eq('id', req.params.id).single();

    if (!invoice) return res.status(404).json({ error: 'Không tìm thấy hóa đơn' });
    if (invoice.misa_status !== 'published' && invoice.misa_status !== 'sent_email') {
      return res.status(400).json({ error: 'Hóa đơn chưa được phát hành lên MISA' });
    }

    const email = req.body.email || invoice.customer?.email || '';
    if (!email) return res.status(400).json({ error: 'Không có địa chỉ email để gửi' });

    await misaService.sendEmailInvoice(
      invoice.misa_invoice_no,
      email,
      invoice.customer_name || ''
    );

    await supabase.from('invoices').update({
      misa_status: 'sent_email',
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id);

    res.json({ success: true, sentTo: email });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /invoices/:id/misa-status — Kiểm tra trạng thái HĐĐT từ MISA
r.get('/invoices/:id/misa-status', async (req, res) => {
  try {
    if (!misaService) return res.status(503).json({ error: 'MISA service chưa được cấu hình' });

    const { data: invoice } = await supabase
      .from('invoices')
      .select('id, misa_status, misa_invoice_no, misa_ref_id, misa_published_at, misa_lookup_code, misa_error_message')
      .eq('id', req.params.id).single();

    if (!invoice) return res.status(404).json({ error: 'Không tìm thấy hóa đơn' });

    let misaDetail = null;
    if (invoice.misa_ref_id) {
      try {
        misaDetail = await misaService.getInvoiceStatus(invoice.misa_ref_id);
      } catch (statusErr) {
        // Không ném lỗi, chỉ trả local status
      }
    }

    res.json({
      localStatus: invoice.misa_status,
      invoiceNo: invoice.misa_invoice_no,
      publishedAt: invoice.misa_published_at,
      lookupCode: invoice.misa_lookup_code,
      errorMessage: invoice.misa_error_message,
      misaDetail,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function formatVNDPdf(n) {
  if (!n && n !== 0) return '0';
  return new Intl.NumberFormat('vi-VN').format(Math.round(n));
}

// Load company settings (from data file or default config)
const path = require('path');
const fs = require('fs');
const defaultCompanyInfo = require('../../../config/companyInfo');

function getCompanyInfo() {
  try {
    const filePath = path.join(__dirname, '../../../data/company-info.json');
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return { ...defaultCompanyInfo, ...JSON.parse(raw) };
    }
  } catch (e) { /* fallback to default */ }
  return { ...defaultCompanyInfo };
}

// Register Vietnamese-capable fonts
const fontRegular = path.join(__dirname, '../../../assets/fonts/DejaVuSans.ttf');
const fontBold = path.join(__dirname, '../../../assets/fonts/DejaVuSans-Bold.ttf');

function generateDocPdf(res, doc, items, docType) {
  const company = getCompanyInfo();
  const margin = 40;
  const pdf = new PDFDocument({ size: 'A4', margin, bufferPages: true });

  // Register Vietnamese fonts
  pdf.registerFont('VN', fontRegular);
  pdf.registerFont('VN-Bold', fontBold);

  res.setHeader('Content-Type', 'application/pdf');
  const safeCode = (doc.code || 'unknown').replace(/[^a-zA-Z0-9\-]/g, '_');
  res.setHeader('Content-Disposition', `inline; filename="${safeCode}.pdf"`);
  pdf.pipe(res);

  const pageW = pdf.page.width - margin * 2;
  const tableX = margin;

  // ════════════════════════════════════════════════════════════════════
  // COMPANY HEADER (logo left, info right)
  // ════════════════════════════════════════════════════════════════════
  const headerStartY = margin;
  const logoW = 80;
  const infoX = margin + logoW + 15;
  const infoW = pageW - logoW - 15;

  // Try to draw logo
  let logoDrawn = false;
  if (company.logoPath) {
    try {
      const logoFile = path.resolve(__dirname, '../../../', company.logoPath);
      if (fs.existsSync(logoFile)) {
        pdf.image(logoFile, margin, headerStartY, { width: logoW, height: 70 });
        logoDrawn = true;
      }
    } catch (e) { /* skip logo */ }
  }

  const textStartX = logoDrawn ? infoX : margin;
  const textWidth = logoDrawn ? infoW : pageW;

  // Company name
  pdf.font('VN-Bold').fontSize(13).fillColor('#1a1a1a');
  pdf.text(company.name, textStartX, headerStartY, { width: textWidth });
  
  // Addresses
  pdf.font('VN').fontSize(8).fillColor('#444');
  (company.addresses || []).forEach(addr => {
    pdf.text(addr, textStartX, pdf.y, { width: textWidth });
  });

  // Website
  if (company.website) {
    pdf.fillColor('#2563EB').text(company.website, textStartX, pdf.y, { width: textWidth, link: company.website });
    pdf.fillColor('#444');
  }

  // Hotline & contacts
  if (company.hotline) {
    pdf.font('VN-Bold').fontSize(8).fillColor('#444');
    pdf.text(`Hotline: ${company.hotline}`, textStartX, pdf.y, { width: textWidth, continued: false });
  }
  (company.contacts || []).forEach(c => {
    pdf.font('VN').fontSize(8).fillColor('#444');
    pdf.text(c, textStartX, pdf.y, { width: textWidth });
  });
  if (company.taxCode) {
    pdf.font('VN').fontSize(8).text(`MST: ${company.taxCode}`, textStartX, pdf.y, { width: textWidth });
  }

  // Separator line
  const afterHeaderY = Math.max(pdf.y, headerStartY + 75) + 8;
  pdf.moveTo(margin, afterHeaderY).lineTo(margin + pageW, afterHeaderY).lineWidth(1.5).strokeColor('#2563EB').stroke();

  // ════════════════════════════════════════════════════════════════════
  // DOCUMENT TITLE
  // ════════════════════════════════════════════════════════════════════
  let title = '';
  if (docType === 'quotation') title = company.quotationTitle || 'BÁO GIÁ KHỐI LƯỢNG CÔNG TRÌNH';
  else if (docType === 'order') title = company.orderTitle || 'ĐƠN HÀNG';
  else title = company.invoiceTitle || 'HÓA ĐƠN BÁN HÀNG';

  pdf.y = afterHeaderY + 15;
  pdf.font('VN-Bold').fontSize(16).fillColor('#1a1a1a');
  pdf.text(title, margin, pdf.y, { align: 'center', width: pageW });
  
  pdf.font('VN').fontSize(9).fillColor('#555');
  pdf.text(`Số: ${doc.code || ''}`, margin, pdf.y, { align: 'center', width: pageW });
  if (doc.created_at) {
    pdf.text(`Ngày: ${new Date(doc.created_at).toLocaleDateString('vi-VN')}`, margin, pdf.y, { align: 'center', width: pageW });
  }
  pdf.moveDown(0.8);

  // ════════════════════════════════════════════════════════════════════
  // GREETING TEXT
  // ════════════════════════════════════════════════════════════════════
  if (company.greeting) {
    pdf.font('VN').fontSize(9).fillColor('#333');
    const shortName = company.name.replace(/^Công Ty /i, '').split(' ').pop() || company.name;
    pdf.text(`${company.name} ${company.greeting}`, margin, pdf.y, { width: pageW });
    if (docType === 'quotation') {
      pdf.text(`${shortName} xin gửi đến quý khách bảng báo giá khối lượng công trình như sau:`, margin, pdf.y, { width: pageW });
    }
    pdf.moveDown(0.5);
  }

  // ════════════════════════════════════════════════════════════════════
  // CUSTOMER INFO
  // ════════════════════════════════════════════════════════════════════
  pdf.font('VN-Bold').fontSize(9).fillColor('#1a1a1a');
  if (doc.customer_name) pdf.text(`Khách hàng: ${doc.customer_name}`, margin);
  pdf.font('VN').fontSize(9).fillColor('#333');
  if (doc.customer_phone) pdf.text(`Điện thoại: ${doc.customer_phone}`, margin);
  if (doc.customer_address) pdf.text(`Địa chỉ: ${doc.customer_address}`, margin);
  if (doc.customer?.tax_code) pdf.text(`MST: ${doc.customer.tax_code}`, margin);
  pdf.moveDown(0.6);

  // ════════════════════════════════════════════════════════════════════
  // ITEMS TABLE
  // ════════════════════════════════════════════════════════════════════
  // Column definitions: STT | Hạng mục thi công | ĐVT | Quy cách | Số lượng | Diện tích | Đơn giá | Thành tiền | %VAT | Tiền thuế | Ghi chú
  const colWidths = [25, 120, 30, 55, 35, 45, 60, 65, 28, 52];
  const colLabels = ['STT', 'Hạng mục thi công', 'ĐVT', 'Quy cách', 'SL', 'D.tích (m²)', 'Đơn giá', 'Thành tiền', 'VAT%', 'Tiền thuế'];
  const colAligns = ['center', 'left', 'center', 'center', 'right', 'right', 'right', 'right', 'right', 'right'];

  let tableY = pdf.y;
  const rowH = 22;
  const headerH = 26;

  // Draw header background
  pdf.rect(tableX, tableY, pageW, headerH).fill('#2563EB');
  pdf.font('VN-Bold').fontSize(7).fillColor('#FFFFFF');
  let cx = tableX;
  for (let c = 0; c < colLabels.length; c++) {
    pdf.text(colLabels[c], cx + 2, tableY + 4, { width: colWidths[c] - 4, align: colAligns[c] });
    cx += colWidths[c];
  }
  tableY += headerH;
  pdf.fillColor('#000000');

  // Draw column lines for header
  pdf.strokeColor('#FFFFFF').lineWidth(0.3);
  cx = tableX;
  for (let c = 0; c < colWidths.length; c++) {
    if (c > 0) pdf.moveTo(cx, tableY - headerH).lineTo(cx, tableY).stroke();
    cx += colWidths[c];
  }

  // Draw rows
  (items || []).forEach((item, idx) => {
    if (tableY + rowH > pdf.page.height - 120) {
      pdf.addPage();
      tableY = margin;
    }

    const bg = idx % 2 === 0 ? '#F8FAFC' : '#FFFFFF';
    pdf.rect(tableX, tableY, pageW, rowH).fill(bg);
    pdf.fillColor('#000000');

    const amount = item.amount || ((item.quantity || 0) * (item.unit_price || 0) * (1 - (item.discount_percent || 0) / 100));
    const vatRate = item.vat_rate || 0;
    const vatAmount = item.vat_amount || (amount * vatRate / 100);
    const area = item.dimensions ? '' : ''; // area comes from quantity * dimensions if applicable
    
    const values = [
      String(idx + 1),
      item.name || '',
      item.unit || '',
      item.dimensions || '',
      String(item.quantity || 0),
      item.dimensions ? '' : '',
      formatVNDPdf(item.unit_price || 0),
      formatVNDPdf(amount),
      vatRate > 0 ? `${vatRate}%` : '0',
      formatVNDPdf(vatAmount),
    ];

    cx = tableX;
    pdf.font('VN').fontSize(7).fillColor('#1a1a1a');
    for (let c = 0; c < values.length; c++) {
      pdf.text(values[c], cx + 2, tableY + 5, { width: colWidths[c] - 4, align: colAligns[c] });
      cx += colWidths[c];
    }

    // Row border
    pdf.moveTo(tableX, tableY + rowH).lineTo(tableX + pageW, tableY + rowH).lineWidth(0.3).strokeColor('#D1D5DB').stroke();
    
    // Column lines
    cx = tableX;
    pdf.strokeColor('#E5E7EB').lineWidth(0.2);
    for (let c = 0; c < colWidths.length; c++) {
      if (c > 0) pdf.moveTo(cx, tableY).lineTo(cx, tableY + rowH).stroke();
      cx += colWidths[c];
    }

    tableY += rowH;
  });

  // Table outer border
  const tableStartY = pdf.y; // approximate
  pdf.rect(tableX, pdf.y, pageW, 0).strokeColor('#333').lineWidth(0.5);
  pdf.moveTo(tableX, tableY).lineTo(tableX + pageW, tableY).lineWidth(0.8).strokeColor('#333').stroke();

  // ════════════════════════════════════════════════════════════════════
  // TOTALS
  // ════════════════════════════════════════════════════════════════════
  tableY += 8;
  const subtotal = (items || []).reduce((s, i) => s + (i.amount || ((i.quantity || 0) * (i.unit_price || 0) * (1 - (i.discount_percent || 0) / 100))), 0);
  const discountAmt = doc.discount_amount || 0;
  const afterRebate = subtotal - discountAmt;
  const saleDiscountAmt = doc.sale_discount_amount != null
    ? Number(doc.sale_discount_amount) || 0
    : (doc.sale_discount_type === 'percent'
      ? afterRebate * (doc.sale_discount_value || 0) / 100
      : (doc.sale_discount_value || 0));
  const afterAllDiscounts = Math.max(0, afterRebate - saleDiscountAmt);
  const totalVat = (items || []).reduce((s, i) => {
    const amt = i.amount || ((i.quantity || 0) * (i.unit_price || 0) * (1 - (i.discount_percent || 0) / 100));
    return s + (i.vat_amount || (amt * (i.vat_rate || 0) / 100));
  }, 0);
  const total = afterAllDiscounts + totalVat;

  const rightX = tableX + pageW - 220;
  const valX = rightX + 120;
  const valW = 100;

  const drawTotal = (label, value, opts = {}) => {
    const { bold, color, underline } = opts;
    pdf.font(bold ? 'VN-Bold' : 'VN').fontSize(bold ? 10 : 9);
    pdf.fillColor(color || '#1a1a1a');
    pdf.text(label, rightX, tableY, { width: 120, align: 'left' });
    pdf.text(value, valX, tableY, { width: valW, align: 'right' });
    if (underline) {
      tableY += (bold ? 16 : 14);
      pdf.moveTo(rightX, tableY - 2).lineTo(rightX + 220, tableY - 2).lineWidth(0.5).strokeColor('#333').stroke();
      tableY += 4;
    } else {
      tableY += (bold ? 16 : 14);
    }
    pdf.fillColor('#1a1a1a');
  };

  drawTotal('Cộng tiền hàng:', formatVNDPdf(subtotal) + ' đ');
  if (discountAmt > 0) drawTotal('Chiết khấu:', '-' + formatVNDPdf(discountAmt) + ' đ');
  if (discountAmt > 0) drawTotal('Sau chiết khấu:', formatVNDPdf(afterRebate) + ' đ');
  if (saleDiscountAmt > 0) drawTotal('Giảm giá:', '-' + formatVNDPdf(saleDiscountAmt) + ' đ');
  if (saleDiscountAmt > 0) drawTotal('Cộng trước thuế:', formatVNDPdf(afterAllDiscounts) + ' đ');
  drawTotal('Thuế GTGT:', formatVNDPdf(totalVat) + ' đ');
  drawTotal('TỔNG CỘNG:', formatVNDPdf(total) + ' VNĐ', { bold: true, color: '#1D4ED8', underline: true });

  // ════════════════════════════════════════════════════════════════════
  // PAYMENT TERMS & NOTES
  // ════════════════════════════════════════════════════════════════════
  tableY += 6;
  if (doc.payment_terms) {
    pdf.font('VN-Bold').fontSize(9).fillColor('#1a1a1a');
    pdf.text('Điều khoản thanh toán:', margin, tableY, { width: pageW });
    tableY = pdf.y + 2;
    pdf.font('VN').fontSize(8).fillColor('#333');
    pdf.text(doc.payment_terms, margin + 10, tableY, { width: pageW - 10 });
    tableY = pdf.y + 6;
  }

  if (doc.valid_until) {
    pdf.font('VN-Bold').fontSize(9).fillColor('#1a1a1a');
    pdf.text(`Hiệu lực báo giá: đến ngày ${new Date(doc.valid_until).toLocaleDateString('vi-VN')}`, margin, tableY, { width: pageW });
    tableY = pdf.y + 4;
  }

  if (company.warrantyText) {
    pdf.font('VN-Bold').fontSize(9).fillColor('#1a1a1a');
    pdf.text('Bảo hành:', margin, tableY, { width: pageW });
    tableY = pdf.y + 2;
    pdf.font('VN').fontSize(8).fillColor('#333');
    pdf.text(company.warrantyText, margin + 10, tableY, { width: pageW - 10 });
    tableY = pdf.y + 6;
  }

  if (doc.notes) {
    pdf.font('VN-Bold').fontSize(9).fillColor('#1a1a1a');
    pdf.text('Ghi chú:', margin, tableY, { width: pageW });
    tableY = pdf.y + 2;
    pdf.font('VN').fontSize(8).fillColor('#333');
    pdf.text(doc.notes, margin + 10, tableY, { width: pageW - 10 });
    tableY = pdf.y + 6;
  }

  // Bank info
  if (company.bankAccount && company.bankName) {
    pdf.font('VN-Bold').fontSize(9).fillColor('#1a1a1a');
    pdf.text('Thông tin chuyển khoản:', margin, tableY, { width: pageW });
    tableY = pdf.y + 2;
    pdf.font('VN').fontSize(8).fillColor('#333');
    pdf.text(`STK: ${company.bankAccount} — ${company.bankName}`, margin + 10, tableY, { width: pageW - 10 });
    tableY = pdf.y + 6;
  }

  // ════════════════════════════════════════════════════════════════════
  // SIGNATURES
  // ════════════════════════════════════════════════════════════════════
  if (tableY + 90 > pdf.page.height - margin) pdf.addPage();
  tableY = Math.max(tableY + 25, pdf.y + 25);

  const sigLeft = company.signatureLeft || 'Đại diện khách hàng';
  const sigRight = company.signatureRight || 'Đại diện công ty';

  pdf.font('VN-Bold').fontSize(9).fillColor('#1a1a1a');
  pdf.text(sigLeft, margin, tableY, { width: pageW / 2, align: 'center' });
  pdf.text(sigRight, margin + pageW / 2, tableY, { width: pageW / 2, align: 'center' });
  tableY += 14;
  pdf.font('VN').fontSize(7).fillColor('#888');
  pdf.text('(Ký, ghi rõ họ tên)', margin, tableY, { width: pageW / 2, align: 'center' });
  pdf.text('(Ký, ghi rõ họ tên)', margin + pageW / 2, tableY, { width: pageW / 2, align: 'center' });

  pdf.end();
}

function parseExcelDepositReceivedFromRow(row) {
  const blob = (row || []).map((c) => String(c ?? '').trim()).filter(Boolean).join(' ');
  if (/\bĐÃ\s*(NHẬN|THU|ĐÓNG)\b/i.test(blob)) return true;
  if (/\bCHƯA\s*(NHẬN|THU|ĐÓNG)\b/i.test(blob)) return false;
  return null;
}

/** Dòng tiền Cọc / Còn lại — không có chữ TỔNG/CỘNG (tránh trùng với dòng tổng hạng mục). */
function isExcelDepositOrRemainSummaryRow(name, stt, fullRowText) {
  const bundle = `${name || ''} ${stt || ''} ${fullRowText || ''}`.trim();
  if (!bundle) return false;
  const u = bundle.toUpperCase();
  if (/\bTỔNG\b/.test(u) || /\bCỘNG\b/.test(u)) return false;
  return /\bCỌC\b/.test(u) || /\bCÒN\s*LẠI\b/.test(u);
}

/**
 * Nhận diện ô/dòng Excel là thông tin liên hệ NVKD — KT… (không gán SĐT này vào khách hàng).
 * Tránh nhầm khi mẫu có "SĐT" / "Số điện thoại" gắn với phụ trách.
 */
function excelHeaderTextIsStaffContactContext(upper) {
  const u = String(upper || '').trim().toUpperCase();
  if (!u) return false;
  if (/KHÁCH\s*HÀNG|KHACH\s*HANG|SĐT\s*KH\b|SDT\s*KH\b|LIÊN\s*HỆ\s*KH|LIÊN\s*LẠC\s*KH/i.test(u)) return false;
  if (u.includes('NVKD') || u.includes('NV KD') || u.includes('PHỤ TRÁCH KD')) return true;
  if (u.includes('KT PHỤ TRÁCH') || u.includes('KỸ THUẬT PHỤ TRÁCH') || u.includes('KĨ THUẬT PHỤ TRÁCH')) return true;
  if (u.includes('NGƯỜI PHỤ TRÁCH') || u.includes('NGUOI PHU TRACH')) return true;
  if (u.includes('LIÊN HỆ NV') || u.includes('LIEN HE NV')) return true;
  if (/^SĐT\s*(NVKD|NV|KD|KT)\b/i.test(u) || /^SDT\s*(NVKD|NV|KD|KT)\b/i.test(u)) return true;
  if (/SỐ\s*ĐIỆN\s*THOẠI/i.test(u) && (u.includes('NVKD') || u.includes('PHỤ TRÁCH') || u.includes('KỸ THUẬT') || u.includes('KĨ THUẬT'))) return true;
  return false;
}

function excelRowLooksLikeStaffPhoneContext(rowArr) {
  const blob = (rowArr || []).map((c) => String(c ?? '').trim().toUpperCase()).filter(Boolean).join(' | ');
  return excelHeaderTextIsStaffContactContext(blob);
}

/** Nhận diện mẫu Excel báo giá Bao Bì NextGo (cột QUY CÁCH SẢN PHẨM / header công ty NextGo). */
function excelDetectNextGoQuotationFormat(rows, headerIdx) {
  if (headerIdx >= 0) {
    const hdr = (rows[headerIdx] || []).map((c) => String(c || '').trim().toUpperCase()).join(' ');
    if (hdr.includes('QUY CÁCH') || hdr.includes('QUY CACH')) return true;
  }
  const scanUntil = headerIdx >= 0 ? headerIdx : Math.min(rows.length, 15);
  for (let i = 0; i < scanUntil; i++) {
    const blob = (rows[i] || []).map((c) => String(c || '').trim().toUpperCase()).join(' ');
    if (blob.includes('NEXTGO') || blob.includes('BAO BÌ NEXTGO') || blob.includes('BAO BI NEXTGO')) return true;
  }
  return false;
}

/** Row có giống header báo giá (STT + HẠNG MỤC / TÊN HÀNG) — dùng cho excel-sheets + parse-excel. */
function excelLooksLikeHeaderRow(rowArr) {
  const upper = (rowArr || []).map((c) => String(c || '').trim().toUpperCase());
  const hasStt = upper.some((c) => c === 'STT' || c === 'TT');
  const hasName = upper.some(
    (c) =>
      (c.includes('HẠNG MỤC') || c.includes('TÊN HÀNG') || c.includes('TÊN SẢN PHẨM') ||
        c.includes('NỘI DUNG') || c.includes('MÃ HÀNG'))
      && !c.includes('DIỄN GIẢI'),
  );
  return hasStt && hasName;
}

function resolveExcelWorksheet(wb, sheetName) {
  const names = wb.SheetNames || [];
  if (!names.length) return { sheetName: null, ws: null };
  const requested = String(sheetName || '').trim();
  const resolved = requested && names.includes(requested) ? requested : names[0];
  return { sheetName: resolved, ws: wb.Sheets[resolved] };
}

const excelUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/** Liệt kê sheet trong file Excel + gợi ý sheet giống báo giá (heuristic header). */
r.post('/quotations/excel-sheets', excelUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Chưa chọn file' });
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellFormula: false });
    const names = wb.SheetNames || [];
    if (!names.length) return res.status(400).json({ error: 'File không có sheet' });
    const sheets = names.map((name) => {
      const ws = wb.Sheets[name];
      const rows = ws ? XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true }) : [];
      const rowCount = rows.length;
      const isQuotation = rows.slice(0, 30).some((r) => excelLooksLikeHeaderRow(r || []));
      return { name, rowCount, isQuotation };
    });
    const defaultSheet = sheets.find((s) => s.isQuotation)?.name || sheets[0]?.name || null;
    res.json({ sheets, defaultSheet, totalSheets: sheets.length });
  } catch (e) {
    console.error('[excel-sheets]', e);
    res.status(500).json({ error: e.message || 'Lỗi đọc file' });
  }
});

r.post('/quotations/parse-excel', excelUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Chưa chọn file' });

    // cellFormula:false → chỉ đọc cached value, không parse/tính lại công thức Excel
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellFormula: false });
    const { sheetName: parsedSheetName, ws } = resolveExcelWorksheet(wb, req.body?.sheet_name);
    if (!ws) return res.status(400).json({ error: 'File không có sheet' });
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });

    if (!rows.length) return res.status(400).json({ error: 'File rỗng' });

    // ── 1. Detect header row ──
    // Helper: từ 1 row (đã upper-cased) build colMap; row2 (nếu có) là sub-header (merge cell "Quy Cách"…).
    // Format mới (Vạn Phú Thành): có thêm DIỄN GIẢI HẠNG MỤC, ĐƠN GIÁ SAU CHIẾT KHẤU, SỐ TIỀN CHIẾT KHẤU,
    // % CHIẾT KHẤU per-row, MÃ HÀNG, SỐ LƯỢNG. Phải tránh ghi đè name bằng "DIỄN GIẢI HẠNG MỤC".
    function buildColMap(headerRow, subRow) {
      const cm = {};
      const upper = headerRow.map(c => String(c || '').trim().toUpperCase());
      // Pass thứ tự ưu tiên: description → name → các cột khác (để DIỄN GIẢI HẠNG MỤC không match name)
      upper.forEach((label, ci) => {
        if (!label) return;
        if (
          label.includes('DIỄN GIẢI') || label.includes('MÔ TẢ') || label.includes('CHI TIẾT') ||
          label.includes('QUY CÁCH') || label.includes('QUY CACH')
        ) {
          if (cm.description === undefined) cm.description = ci;
        }
      });
      upper.forEach((label, ci) => {
        if (!label) return;
        if (label === 'STT' || label === 'TT') {
          if (cm.stt === undefined) cm.stt = ci;
        } else if (
          (label.includes('HẠNG MỤC') || label.includes('TÊN HÀNG') ||
           label.includes('TÊN SẢN PHẨM') || label === 'TÊN SP' || label.includes('NỘI DUNG'))
          && !label.includes('DIỄN GIẢI') && !label.includes('MÔ TẢ') && !label.includes('CHI TIẾT')
        ) {
          if (cm.name === undefined) cm.name = ci;
        } else if (label.includes('MÃ HÀNG') || label === 'MÃ SP' || label.includes('MÃ SẢN PHẨM')) {
          if (cm.sku === undefined) cm.sku = ci;
        } else if (label === 'ĐVT' || label.includes('ĐƠN VỊ')) {
          if (cm.unit === undefined) cm.unit = ci;
        } else if (label.includes('KHỐI LƯỢNG') || label.includes('SỐ LƯỢNG') || label === 'SL' || label === 'KL') {
          if (cm.quantity === undefined) cm.quantity = ci;
        } else if (label.includes('NGANG') || (label.includes('DÀI') && !label.includes('BẢO'))) {
          if (cm.length === undefined) cm.length = ci;
        } else if (label.includes('SÂU') || label.includes('RỘNG')) {
          if (cm.width === undefined) cm.width = ci;
        } else if (label.includes('CAO') && !label.includes('CHIẾT') && !label.includes('CK')) {
          if (cm.height === undefined) cm.height = ci;
        } else if (
          label.includes('% CHIẾT KHẤU') || label.includes('%CHIẾT KHẤU') ||
          (label.includes('CHIẾT KHẤU') && (label.includes('%') || label === 'CK%')) ||
          label === '%CK' || label === '% CK'
        ) {
          if (cm.discount_percent === undefined) cm.discount_percent = ci;
        } else if (
          label.includes('ĐƠN GIÁ') &&
          !label.includes('SAU') && !label.includes('SỐ TIỀN') && !label.includes('CHIẾT KHẤU')
        ) {
          if (cm.unit_price === undefined) cm.unit_price = ci;
        } else if (label.includes('THÀNH TIỀN') || label.includes('T.TIỀN') || label.includes('TT (VNĐ)')) {
          if (cm.amount === undefined) cm.amount = ci;
        } else if (label.includes('GHI CHÚ') || label.includes('NOTE')) {
          if (cm.notes === undefined) cm.notes = ci;
        } else if (label.includes('VAT') || label.includes('THUẾ')) {
          if (cm.vat_rate === undefined) cm.vat_rate = ci;
        }
      });

      // Sub-header (merge cell QUY CÁCH → NGANG/SÂU/CAO). Cho phép override length nếu super-header
      // chỉ là "DÀI (m)" đơn lẻ và sub-row có cả NGANG: ưu tiên NGANG.
      let subAdvance = false;
      if (subRow && subRow.length) {
        const subUpper = subRow.map(c => String(c || '').trim().toUpperCase());
        subUpper.forEach((label, ci) => {
          if (!label) return;
          if (label.includes('NGANG')) {
            cm.length = ci; subAdvance = true;
          } else if (label.includes('SÂU') || label.includes('RỘNG')) {
            if (cm.width === undefined || cm.width === ci) cm.width = ci;
            subAdvance = true;
          } else if (label.includes('CAO') && !label.includes('CHIẾT') && !label.includes('CK')) {
            if (cm.height === undefined || cm.height === ci) cm.height = ci;
            subAdvance = true;
          } else if ((label.includes('KHỐI LƯỢNG') || label.includes('SỐ LƯỢNG') || label === 'SL' || label === 'KL') && cm.quantity === undefined) {
            cm.quantity = ci; subAdvance = true;
          } else if ((label.includes('% CHIẾT KHẤU') || label === 'CK%' || label === '%CK') && cm.discount_percent === undefined) {
            cm.discount_percent = ci; subAdvance = true;
          }
        });
      }
      return { cm, subAdvance };
    }

    let headerIdx = -1;
    let colMap = {};
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      if (!excelLooksLikeHeaderRow(rows[i] || [])) continue;
      const { cm, subAdvance } = buildColMap(rows[i], rows[i + 1] || []);
      colMap = cm;
      headerIdx = subAdvance ? i + 1 : i;
      break;
    }
    if (headerIdx < 0) return res.status(400).json({ error: 'Không tìm thấy dòng tiêu đề (cần có STT + HẠNG MỤC)' });
    const isNextGoFormat = excelDetectNextGoQuotationFormat(rows, headerIdx);
    console.log('[parse-excel] sheet:', parsedSheetName, 'headerIdx:', headerIdx, 'format:', isNextGoFormat ? 'nextgo' : 'default', 'colMap:', JSON.stringify(colMap));

    // ── Fill merged cells trong cột DIỄN GIẢI / GHI CHÚ / TÊN SP / STT ──
    // Excel cho phép 1 ô mô tả gộp nhiều dòng sản phẩm. `sheet_to_json` chỉ giữ
    // giá trị ô đầu, các ô dưới rỗng → fan-out giá trị xuống các dòng con để mỗi
    // sản phẩm đều mang theo mô tả/ghi chú/tên nhóm (mẫu NextGo: STT + Tên SP merge dọc).
    const wsMerges = Array.isArray(ws['!merges']) ? ws['!merges'] : [];
    const mergeFanOutCols = [];
    if (colMap.description !== undefined) mergeFanOutCols.push(colMap.description);
    if (colMap.notes !== undefined) mergeFanOutCols.push(colMap.notes);
    if (colMap.name !== undefined) mergeFanOutCols.push(colMap.name);
    if (colMap.stt !== undefined) mergeFanOutCols.push(colMap.stt);
    if (wsMerges.length && mergeFanOutCols.length) {
      let filledDesc = 0;
      for (const m of wsMerges) {
        if (!m || !m.s || !m.e) continue;
        if (m.s.r === m.e.r) continue; // chỉ xử lý merge dọc
        if (m.e.r <= headerIdx) continue; // bỏ qua merge ở vùng header/khách hàng
        const col = m.s.c;
        if (!mergeFanOutCols.includes(col)) continue;
        const topRow = rows[m.s.r];
        if (!topRow) continue;
        const val = topRow[col];
        if (val === undefined || val === null || String(val).trim() === '') continue;
        for (let rr = Math.max(m.s.r + 1, headerIdx + 1); rr <= m.e.r; rr++) {
          if (!rows[rr]) continue;
          const cur = rows[rr][col];
          if (cur === undefined || cur === null || String(cur).trim() === '') {
            rows[rr][col] = val;
            filledDesc += 1;
          }
        }
      }
      if (filledDesc > 0) console.log('[parse-excel] merged-cell fan-out:', filledDesc, 'cell(s)');
    }

    // ── 2. Extract customer info — parse each cell separately ──
    let customer_name = '', customer_phone = '', customer_address = '', kts_info = '', title = '';
    for (let i = 0; i < headerIdx; i++) {
      // Check each cell individually for better parsing
      for (let ci = 0; ci < (rows[i]?.length || 0); ci++) {
        const cell = String(rows[i][ci] || '').trim();
        if (!cell) continue;
        const cellUpper = cell.toUpperCase();

        // Skip company headers
        if (cellUpper.includes('CÔNG TY') || cellUpper.includes('HOTLINE') || cellUpper.includes('MST') || cellUpper.includes('WEBSITE') || cellUpper.includes('WWW.')) continue;

        // KT Phụ trách (detect before customer to avoid mixing).
        // "PHỤ TRÁCH KD" (format Vạn Phú Thành) cũng rơi vào nhánh này.
        if (cellUpper.includes('KT PHỤ TRÁCH') || cellUpper.includes('KỸ THUẬT PHỤ TRÁCH') ||
            cellUpper.includes('KĨ THUẬT PHỤ TRÁCH') || cellUpper.includes('NVKD') ||
            cellUpper.includes('PHỤ TRÁCH KD')) {
          const match = cell.match(/[:;\-]\s*(.+)/);
          if (match) kts_info = match[1].replace(/[-–]\s*(0\d{8,10})/, ' - $1').trim();
          else kts_info = cell;
          continue;
        }
        if (excelHeaderTextIsStaffContactContext(cellUpper)) {
          const match = cell.match(/[:;\-]\s*(.+)/);
          if (match) kts_info = match[1].replace(/[-–]\s*(0\d{8,10})/, ' - $1').trim();
          else kts_info = cell;
          continue;
        }

        // Customer name — label "Khách hàng:" / "Tên khách hàng;" (Vạn Phú Thành dùng `;`)
        // NextGo: "Kính gửi:" cũng chứa tên khách
        if (
          cellUpper.includes('KHÁCH HÀNG') || cellUpper.includes('KHACH HANG') ||
          cellUpper.includes('KÍNH GỬI') || cellUpper.includes('KINH GUI')
        ) {
          const match = cell.match(/[:;\-]\s*(.+)/);
          if (match) {
            let namePart = match[1].trim();
            // Bỏ đoạn NVKD / phụ trách / … (tránh lấy SĐT nhân viên làm SĐT khách)
            namePart = namePart.replace(
              /\s*(;|,|[-–])\s*(NVKD|NV\s*KD|PHỤ\s*TRÁCH\s*KD|PHỤ\s*TRÁCH\s*(NV|KINH\s*DOANH)|KT\s*(PHỤ\s*TRÁCH)?|KĨ?\s*THUẬT|NGƯỜI\s*PHỤ\s*TRÁCH|LIÊN\s*HỆ\s*NV)\s*[:;]?\s*.*$/i,
              '',
            ).trim();
            // Remove KT info if embedded
            namePart = namePart.replace(/\s*[-–]?\s*(Kĩ|Kỹ|KT)\s*(Thuật|thuật)?\s*(Phụ|phụ)\s*(Trách|trách)\s*[:]\s*.*/i, '').trim();
            // Extract phone from name
            const phoneMatch = namePart.match(/(0\d{8,10})/);
            if (phoneMatch) {
              customer_phone = phoneMatch[1];
              customer_name = namePart.replace(phoneMatch[0], '').replace(/[-–\s]+$/, '').trim();
            } else {
              customer_name = namePart;
            }
          }
          continue;
        }

        // Address
        if (cellUpper.includes('ĐỊA CHỈ') || cellUpper.includes('ĐC:')) {
          const match = cell.match(/[:;\-]\s*(.+)/);
          if (match) {
            let addr = match[1].trim();
            // Remove phone if embedded in address
            addr = addr.replace(/\s*(SĐT|SDT|ĐT)\s*[:;]\s*0\d{8,10}/i, '').trim();
            customer_address = addr;
          }
          continue;
        }

        // SĐT standalone cell — chỉ gán khách khi nhãn không phải SĐT NVKD / phụ trách…
        if (cellUpper.includes('SĐT') || cellUpper.includes('SDT') || cellUpper.includes('ĐT:')) {
          const phoneMatch = cell.match(/(0\d{8,10})/);
          if (phoneMatch) {
            if (excelHeaderTextIsStaffContactContext(cellUpper)) {
              const tail = cell.replace(/^\s*(SỐ\s*ĐIỆN\s*THOẠI|SĐT|SDT|ĐT)\s*[:;]?\s*/i, '').trim();
              if (kts_info && !kts_info.includes(phoneMatch[1])) kts_info += ` — ${tail || phoneMatch[1]}`;
              else if (!kts_info) kts_info = tail || phoneMatch[1];
            } else if (!customer_phone) {
              customer_phone = phoneMatch[1];
            } else if (phoneMatch[1] !== customer_phone && !kts_info.includes(phoneMatch[1])) {
              if (kts_info) kts_info += ` — ${phoneMatch[1]}`;
              else kts_info = phoneMatch[1];
            }
          }
          continue;
        }

        // Phone in cell (not company phone) — nếu cùng dòng có nhãn NVKD/Phụ trách thì gắn vào KT/NVKD
        if (/^0\d{8,10}$/.test(cell)) {
          if (!customer_phone && excelRowLooksLikeStaffPhoneContext(rows[i])) {
            if (kts_info && !kts_info.includes(cell)) kts_info += ` — ${cell}`;
            else if (!kts_info) kts_info = cell;
          } else if (!customer_phone) {
            customer_phone = cell;
          }
          continue;
        }

        // Title (BÁO GIÁ...)
        if (cellUpper.includes('BÁO GIÁ') && !title) {
          title = cell;
          continue;
        }
      }
    }

    // ── 3. Parse items — stop at GHI CHÚ / notes section ──
    const items = [];
    let currentGroup = '';
    let currentProductName = ''; // NextGo: tên SP merge dọc — dòng con kế thừa
    let lastProductDesc = ''; // NextGo: quy cách ở dòng đầu, các dòng SL khác kế thừa
    let currentGroupDiscount = 0; // CK% từ header nhóm
    let summaryRows = []; // collect all TỔNG/CK rows
    let reachedNotes = false;
    let notesText = [];

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every(c => !c && c !== 0)) continue;

      // ── Mini-header lặp lại trong body (vd. format Vạn Phú Thành: row 17 cho section II,
      // row 23 cho section III có "MÃ HÀNG / Số Lượng"). Strategy:
      //   1) override các role trong newCm,
      //   2) clear bất kỳ role cũ nào đang trỏ vào col index đã được newCm gán role khác
      //      (vd. section III col E = "Số Lượng" → role length cũ ở col 4 phải bị xoá).
      if (excelLooksLikeHeaderRow(row)) {
        const { cm: newCm, subAdvance: newSub } = buildColMap(row, rows[i + 1] || []);
        const merged = { ...colMap, ...newCm };
        const newColsByIdx = {};
        for (const [role, idx] of Object.entries(newCm)) {
          if (typeof idx === 'number') newColsByIdx[idx] = role;
        }
        for (const role of Object.keys(merged)) {
          const idx = merged[role];
          if (typeof idx === 'number' && newColsByIdx[idx] && newColsByIdx[idx] !== role) {
            delete merged[role];
          }
        }
        colMap = merged;
        if (newSub) i += 1;
        console.log('[parse-excel] re-detected mini-header at row', i, 'colMap:', JSON.stringify(colMap));
        continue;
      }

      const stt = colMap.stt !== undefined ? String(row[colMap.stt] || '').trim() : '';
      const nameRaw = colMap.name !== undefined ? String(row[colMap.name] || '').trim() : '';
      const skuRaw = colMap.sku !== undefined ? String(row[colMap.sku] || '').trim() : '';
      const descEarly = colMap.description !== undefined ? String(row[colMap.description] || '').trim() : '';
      if (nameRaw) {
        if (nameRaw !== currentProductName) lastProductDesc = '';
        currentProductName = nameRaw;
      }
      // Nếu có cả MÃ HÀNG + TÊN SẢN PHẨM (section III) → name = TÊN, prefix mã vào notes/description bên dưới.
      const name = nameRaw || (isNextGoFormat && currentProductName ? currentProductName : '') || skuRaw;
      const nameUpper = name.toUpperCase();

      // Collect all text from this row
      const fullRowText = row.map(c => String(c || '').trim()).filter(Boolean).join(' ');

      // Debug first 25 data rows
      if (i - headerIdx <= 25) {
        console.log(`[parse-excel] row ${i}: stt=[${stt}] name=[${name?.slice(0,30)}] cells=`, JSON.stringify(row.slice(0, 10)));
      }
      const fullRowUpper = fullRowText.toUpperCase();

      // Detect "GHI CHÚ" / notes section → stop parsing items, collect notes
      const isNotesSection = nameUpper === 'GHI CHÚ' || nameUpper.startsWith('GHI CHÚ:') || 
        fullRowUpper === 'GHI CHÚ' || stt.toUpperCase().startsWith('GHI CHÚ') ||
        fullRowUpper.startsWith('GHI CHÚ') || fullRowUpper.startsWith('LƯU Ý') ||
        fullRowUpper.startsWith('ĐIỀU KHOẢN') || fullRowUpper.startsWith('QUY ĐỊNH');
      if (isNotesSection) {
        reachedNotes = true;
        // Include this row's text as first note line (if has content beyond "GHI CHÚ")
        const noteContent = fullRowText.replace(/^GHI\s*CHÚ:?\s*/i, '').trim();
        if (noteContent) notesText.push(noteContent);
        continue;
      }
      if (reachedNotes) {
        if (fullRowText) notesText.push(fullRowText);
        continue;
      }

      // ── IMPORTANT: Detect GROUP HEADERS before summary rows ──
      // Group headers like "II. PHỤ KIỆN - CHIẾT KHẤU 35%" contain "CHIẾT KHẤU"
      // which would wrongly match summary detection. Check Roman numeral first.
      const sttUpper = stt.toUpperCase();
      const sttIsNumber = /^\d/.test(stt);
      const workingNameEarly = name || (!sttIsNumber && stt ? stt : '') || '';
      const isRomanGroupEarly = /^[IVX]+[\.\)\s]/.test(workingNameEarly) || /^[IVX]+[\.\)\s]/.test(fullRowText.trim());
      const hasUnitEarly = colMap.unit !== undefined && String(row[colMap.unit] || '').trim();
      const hasPriceEarly = parseExcelMoneyFromMappedColumn(row, colMap.unit_price) > 0;

      if (isRomanGroupEarly && !hasPriceEarly) {
        const groupName = workingNameEarly || fullRowText.trim();
        currentGroup = groupName;
        const ckMatch = groupName.match(/(?:CHIẾT\s*KHẤU|CK)\s*(\d+)\s*%/i);
        currentGroupDiscount = ckMatch ? parseFloat(ckMatch[1]) : 0;
        items.push({
          is_group: true, group_name: groupName, name: groupName,
          description: '', unit: '', quantity: 0, unit_price: 0, amount: 0,
          height: null, width: null, length: null, notes: '',
          group_discount_percent: currentGroupDiscount,
        });
        console.log('[parse-excel] GROUP:', groupName.slice(0, 50), 'CK:', currentGroupDiscount);
        continue;
      }

      // Detect summary rows: TỔNG TỦ, TỔNG PHỤ KIỆN, TỔNG 2 HẠNG MỤC, CHIẾT KHẤU, TỔNG SAU CK
      // Check both name column and full row text (summary rows often span merged cells)
      const isSummary = nameUpper.includes('TỔNG') || nameUpper.includes('CỘNG') ||
        nameUpper.includes('CHIẾT KHẤU') || nameUpper.includes('PHẦN TỪ') ||
        fullRowUpper.includes('TỔNG') || fullRowUpper.includes('CHIẾT KHẤU');
      // Summary rows: no STT number, OR STT contains summary text itself (merged cells)
      const sttIsSummary = sttUpper.includes('TỔNG') || sttUpper.includes('CHIẾT KHẤU') || sttUpper.includes('PHẦN TỦ') || sttUpper.includes('PHẦN TỪ');
      if (isSummary && (!stt || sttIsSummary || !sttIsNumber)) {
        // Find amount: try amount column, then scan row for largest number
        let amt = colMap.amount !== undefined ? parseVietnameseMoney(row[colMap.amount]) : 0;
        if (amt === 0) {
          // Scan all cells for a number (summary amount might be in unexpected column)
          for (let ci = 0; ci < row.length; ci++) {
            const cellVal = parseVietnameseMoney(row[ci]);
            if (cellVal > 1000 && cellVal > amt) amt = cellVal;
          }
        }
        const summaryLabel = name || stt || fullRowText;
        summaryRows.push({ label: summaryLabel, amount: amt });
        console.log('[parse-excel] summary row:', { label: summaryLabel.slice(0,40), amt, stt, rawAmtCell: row[colMap.amount] });
        continue;
      }

      // ── Dòng Cọc / Còn lại (khối tiền cuối báo giá — có thể có «ĐÃ NHẬN» ở cột phụ) ──
      if (isExcelDepositOrRemainSummaryRow(name, stt, fullRowText)) {
        let amt = colMap.amount !== undefined ? parseVietnameseMoney(row[colMap.amount]) : 0;
        if (amt === 0) {
          for (let ci = 0; ci < row.length; ci++) {
            const cellVal = parseVietnameseMoney(row[ci]);
            if (cellVal >= 1000 && cellVal > amt) amt = cellVal;
          }
        }
        const summaryLabel = name || stt || fullRowText;
        const labelU = summaryLabel.toUpperCase();
        const rowKind = labelU.includes('CÒN LẠI') ? 'remaining' : 'deposit';
        const deposit_received = rowKind === 'deposit' ? parseExcelDepositReceivedFromRow(row) : null;
        summaryRows.push({
          label: summaryLabel,
          amount: amt,
          row_kind: rowKind,
          deposit_received,
        });
        console.log('[parse-excel] deposit/remain row:', {
          label: summaryLabel.slice(0, 48),
          amt,
          rowKind,
          deposit_received,
        });
        continue;
      }

      // Skip truly empty rows (no text at all)
      // Note: don't skip if name is empty but STT has text (merged cells)
      const effectiveName = name || (sttIsNumber ? '' : stt) || '';
      const rowUnitPrice = parseExcelMoneyFromMappedColumn(row, colMap.unit_price);
      const rowAmount = parseExcelMoneyFromMappedColumn(row, colMap.amount);
      if (!effectiveName && !name && !descEarly && rowUnitPrice <= 0 && rowAmount <= 0) continue;

      // Detect group title: has name but no STT number AND no unit_price
      const sttNum = parseInt(stt);
      const hasUnit = colMap.unit !== undefined && String(row[colMap.unit] || '').trim();
      const hasPrice = rowUnitPrice > 0;
      const workingName = effectiveName || name;
      const isGroupRow = (isNaN(sttNum) || !stt || sttIsSummary) && !hasPrice && workingName.length > 5;

      // Also check Roman numeral pattern: I., II., III., IV. at start
      const isRomanGroup = /^[IVX]+[\.\)\s]/.test(workingName);

      if ((isGroupRow && !hasUnit) || isRomanGroup) {
        currentGroup = workingName;
        // Parse chiết khấu % từ header nhóm: "PHỤ KIỆN BẾP (CHIẾT KHẤU 35%)" hoặc "CK 35%"
        const ckMatch = workingName.match(/(?:CHIẾT\s*KHẤU|CK)\s*(\d+)\s*%/i);
        currentGroupDiscount = ckMatch ? parseFloat(ckMatch[1]) : 0;
        items.push({
          is_group: true, group_name: workingName, name: workingName,
          description: '', unit: '', quantity: 0, unit_price: 0, amount: 0,
          height: null, width: null, length: null, notes: '',
          group_discount_percent: currentGroupDiscount,
        });
        continue;
      }

      // Normal item row — must have unit_price or amount
      if (!hasPrice && rowAmount <= 0) continue;

      // Detect "HỖ TRỢ" / "MIỄN PHÍ" / "TẶNG" in amount column → freebie item (CK 100%)
      const rawAmountCell = colMap.amount !== undefined ? String(row[colMap.amount] || '').trim() : '';
      const parsedAmount = rowAmount;
      const isFreebieText = /HỖ\s*TRỢ|MIỄN\s*PHÍ|TẶNG|FREE|KM|KHUYẾN/i.test(rawAmountCell);
      const isFreebie = isFreebieText && parsedAmount === 0;

      const descCell = colMap.description !== undefined ? String(row[colMap.description] || '').trim() : '';
      const notesCell = colMap.notes !== undefined ? String(row[colMap.notes] || '').trim() : '';
      if (descCell) lastProductDesc = descCell;
      const effectiveDescCell = descCell || (isNextGoFormat ? lastProductDesc : '');
      const itemName = name || (isNextGoFormat && effectiveDescCell ? currentProductName || effectiveDescCell.split('\n')[0].slice(0, 120) : '') || skuRaw;
      // Nếu có MÃ HÀNG riêng (section III VPT): prefix vào description để khỏi mất thông tin.
      const skuPrefix = (skuRaw && skuRaw !== name) ? `[${skuRaw}] ` : '';
      const mergedDescription = [
        skuPrefix ? `${skuPrefix.trim()}` : '',
        effectiveDescCell,
        notesCell,
      ].filter(Boolean).join('\n\n');

      // % CHIẾT KHẤU per-row: hỗ trợ "35%", "0.35", "0,35"
      let rowDiscount = 0;
      if (colMap.discount_percent !== undefined) {
        const raw = row[colMap.discount_percent];
        if (raw != null && raw !== '') {
          const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace('%', '').replace(',', '.'));
          if (!isNaN(n) && n > 0) rowDiscount = n <= 1 ? n * 100 : n;
        }
      }
      const effectiveGroupCK = rowDiscount > 0 ? rowDiscount : currentGroupDiscount;

      items.push({
        is_group: false,
        group_name: currentGroup,
        group_discount_percent: effectiveGroupCK,
        sku: skuRaw || null,
        name: itemName,
        description: mergedDescription,
        unit: colMap.unit !== undefined ? String(row[colMap.unit] || '').trim() : 'bộ',
        length: colMap.length !== undefined ? (parseVietnameseMeasure(row[colMap.length]) ?? null) : null,
        width: colMap.width !== undefined ? (parseVietnameseMeasure(row[colMap.width]) ?? null) : null,
        height: colMap.height !== undefined ? (parseVietnameseMeasure(row[colMap.height]) ?? null) : null,
        quantity: colMap.quantity !== undefined ? (parseVietnameseMeasure(row[colMap.quantity]) ?? 1) : 1,
        unit_price: rowUnitPrice,
        amount: parsedAmount,
        vat_rate: colMap.vat_rate !== undefined ? parseFloat(row[colMap.vat_rate]) || 0 : 0,
        notes: notesCell,
        is_freebie: isFreebie,
      });
    }

    // ── 4. Calculate totals from summary rows ──
    // Priority: "TỔNG 2 HẠNG MỤC" or "TỔNG SAU CHIẾT KHẤU" > last TỔNG row
    let grandTotal = 0, subtotalBeforeDiscount = 0, discountAmount = 0;

    // Track group subtotals + discount amounts for CK% calculation
    // Strategy: assign TỔNG/CK rows to groups in order (simpler than name matching)
    const groupTotals = {}; // { groupName: subtotal }
    const groupDiscounts = {}; // { groupName: discountAmount }
    const groupNamesOrdered = items.filter(i => i.is_group).map(g => g.name);
    const groupsWithoutHeaderCK = items.filter(i => i.is_group && !i.group_discount_percent).map(g => g.name);
    let nextTotalGroupIdx = 0;

    for (const sr of summaryRows) {
      const label = sr.label.toUpperCase();
      if (label.includes('TỔNG') && label.includes('HẠNG MỤC')) {
        grandTotal = sr.amount; // "TỔNG 2 HẠNG MỤC" = final total
      } else if (label.includes('SAU') && (label.includes('CHIẾT KHẤU') || label.includes('CK'))) {
        // "TỔNG TỦ SAU CHIẾT KHẤU" — skip for group calc, use as grandTotal fallback
        if (!grandTotal) grandTotal = sr.amount;
      } else if (label.includes('CHIẾT KHẤU') || label.includes('PHẦN TỪ') || label.includes('PHẦN TỦ')) {
        discountAmount += sr.amount;
        // Assign discount to first group without header CK that doesn't have discount yet
        const target = groupsWithoutHeaderCK.find(gn => !groupDiscounts[gn]);
        if (target) groupDiscounts[target] = (groupDiscounts[target] || 0) + sr.amount;
      } else if (label.includes('TỔNG')) {
        subtotalBeforeDiscount += sr.amount;
        // Assign to groups in file order
        if (nextTotalGroupIdx < groupNamesOrdered.length) {
          groupTotals[groupNamesOrdered[nextTotalGroupIdx]] = sr.amount;
          nextTotalGroupIdx++;
        }
      }
    }
    console.log('[parse-excel] summaryRows:', JSON.stringify(summaryRows.map(s => ({ l: s.label.slice(0,35), a: s.amount }))));
    console.log('[parse-excel] groupTotals:', JSON.stringify(groupTotals));
    console.log('[parse-excel] groupDiscounts:', JSON.stringify(groupDiscounts));

    // ── 5. Calculate CK% for groups that don't have it from header ──
    // E.g. "PHẦN TỦ CHIẾT KHẤU 1,998,101" + "TỔNG TỦ 66,603,375" → CK% = 1998101/66603375 ≈ 3%
    // NOTE: CK from summary = applied to GROUP TOTAL (Thành tiền items are BEFORE discount)
    //       CK from header = applied PER ITEM (Thành tiền already includes discount)
    // → Mark differently: group_summary_discount_percent (not applied per-item in Thành tiền)
    console.log('[parse-excel] groupTotals:', JSON.stringify(groupTotals));
    console.log('[parse-excel] groupDiscounts:', JSON.stringify(groupDiscounts));
    console.log('[parse-excel] groups:', items.filter(i => i.is_group).map(g => ({ name: g.name.slice(0,30), gdk: g.group_discount_percent })));
    for (const groupItem of items.filter(i => i.is_group && !i.group_discount_percent)) {
      const gTotal = groupTotals[groupItem.name];
      const gDiscount = groupDiscounts[groupItem.name];
      console.log('[parse-excel] checking group:', groupItem.name.slice(0,30), 'gTotal:', gTotal, 'gDiscount:', gDiscount);
      if (gTotal > 0 && gDiscount > 0) {
        const ckPercent = Math.round((gDiscount / gTotal) * 10000) / 100; // round 2 decimal
        groupItem.group_summary_discount_percent = ckPercent;
        // Apply to child items as summary-level discount (NOT already in Thành tiền)
        let applied = 0;
        items.forEach(i => {
          if (!i.is_group && i.group_name === groupItem.name) {
            i.group_summary_discount_percent = ckPercent;
            applied++;
          }
        });
        console.log('[parse-excel] applied summaryCK', ckPercent, '% to', applied, 'items in group:', groupItem.name.slice(0,30));
      }
    }

    // If no grand total found, sum item amounts
    const itemsTotal = items.filter(i => !i.is_group).reduce((s, i) => s + (i.amount || i.quantity * i.unit_price), 0);
    if (!grandTotal) grandTotal = itemsTotal - discountAmount;
    if (!subtotalBeforeDiscount) subtotalBeforeDiscount = itemsTotal;

    let deposit_amount = null;
    let deposit_received = null;
    let deposit_label = '';
    let remaining_amount = null;
    let remaining_note = '';
    for (const sr of summaryRows) {
      if (sr.row_kind === 'deposit') {
        if (sr.amount > 0) deposit_amount = sr.amount;
        deposit_label = sr.label || deposit_label;
        if (sr.deposit_received === true || sr.deposit_received === false) deposit_received = sr.deposit_received;
      }
      if (sr.row_kind === 'remaining') {
        remaining_amount = sr.amount > 0 ? sr.amount : remaining_amount;
        remaining_note = sr.label || remaining_note;
      }
    }

    res.json({
      customer_name,
      customer_phone,
      customer_address,
      kts_info,
      title,
      items,
      notes: notesText.join('\n'),
      summary: {
        subtotal: subtotalBeforeDiscount,
        discount_amount: discountAmount,
        total: grandTotal,
        summary_rows: summaryRows,
        deposit_amount,
        deposit_received,
        deposit_label,
        remaining_amount,
        remaining_note,
      },
      columns_detected: colMap,
      header_row: headerIdx,
      total_rows: rows.length,
      excel_format: isNextGoFormat ? 'nextgo' : 'default',
    });
  } catch (e) {
    console.error('[parse-excel]', e);
    res.status(500).json({ error: 'Lỗi đọc file Excel: ' + e.message });
  }
});

r.get('/quotations/:id/pdf', async (req, res) => {
  try {
    const { data: quote } = await supabase.from('quotations')
      .select('*, customer:customers(id, full_name, phone, email, address, company, tax_code)')
      .eq('id', req.params.id).single();
    if (!quote) return res.status(404).json({ error: 'Khong tim thay bao gia' });
    if (!userMayAccessQuotationRow(req, quote)) {
      return res.status(403).json({ error: 'Khong co quyen xuat PDF bao gia nay' });
    }
    const { data: items } = await supabase.from('quotation_items')
      .select('*, product:products(id, name, code)')
      .eq('quotation_id', req.params.id).order('item_order');
    generateDocPdf(res, quote, items || [], 'quotation');
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/orders/:id/pdf', async (req, res) => {
  try {
    const { data: order } = await supabase.from('orders')
      .select('*, customer:customers(id, full_name, phone, email, address, company, tax_code)')
      .eq('id', req.params.id).single();
    if (!order) return res.status(404).json({ error: 'Khong tim thay don hang' });
    const { data: items } = await supabase.from('order_items')
      .select('*, product:products(id, name, code)')
      .eq('order_id', req.params.id).order('item_order');
    generateDocPdf(res, order, items || [], 'order');
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/invoices/:id/pdf', async (req, res) => {
  try {
    const { data: invoice } = await supabase.from('invoices')
      .select('*, customer:customers(id, full_name, phone, email, address, company, tax_code)')
      .eq('id', req.params.id).single();
    if (!invoice) return res.status(404).json({ error: 'Khong tim thay hoa don' });
    const { data: items } = await supabase.from('invoice_items')
      .select('*, product:products(id, name, code)')
      .eq('invoice_id', req.params.id).order('item_order');
    generateDocPdf(res, invoice, items || [], 'invoice');
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = r;
