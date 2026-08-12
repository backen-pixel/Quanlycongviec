/**
 * Bundle chi tiết deal kế toán: docs CRM+SX, BG/ĐH/HĐ, lịch thanh toán, STK.
 */
const { supabase } = require('../config/supabase');
const { crmDealBelongsToAccountingCompany } = require('./accountingScope');
const {
  normalizeDepositInstallments,
  aggregateDepositFromInstallments,
} = require('./depositInstallments');

const DEFAULT_PAYMENT_STAGE_LABELS = [
  'Cọc lần 1',
  'Thanh toán còn lại',
];

function unwrapEmbed(row) {
  if (!row) return null;
  return Array.isArray(row) ? row[0] : row;
}

function isDepositStageLabel(label) {
  return /cọc/i.test(String(label || ''));
}

function stageStatusFromAmounts(planned, received) {
  const p = Number(planned);
  const r = Number(received) || 0;
  if (r <= 0) return 'pending';
  if (Number.isFinite(p) && p > 0 && r + 0.0001 >= p) return 'paid';
  return 'partial';
}

async function assertAccountingDeal(leadId, clientCompanyId) {
  const { data: lead, error } = await supabase
    .from('crm_leads')
    .select('id, type, code, title, company_id, region_id, external_company_id, external_company_name, project_id, customer_id, assigned_to, deposit_amount, deposit_received, deposit_label, estimated_value, phone, description, created_at, updated_at')
    .eq('id', leadId)
    .maybeSingle();
  if (error) throw error;
  if (!lead) return { error: 'Không tìm thấy deal', status: 404 };
  if (!crmDealBelongsToAccountingCompany(lead, clientCompanyId)) {
    return { error: 'Deal không thuộc phạm vi công ty kế toán', status: 403 };
  }
  return { lead };
}

/**
 * @param {string} companyId
 * @param {object} opts
 * @param {boolean} opts.activeOnly
 * @param {string|null} opts.regionId — nếu truyền: chỉ lấy STK của khu vực này + STK dùng chung (region_id null)
 */
async function listBankAccounts(companyId, { activeOnly = false, regionId = null } = {}) {
  let q = supabase
    .from('company_bank_accounts')
    .select('*, region:company_regions(id, name, code)')
    .eq('company_id', companyId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });
  if (activeOnly) q = q.eq('is_active', true);
  if (regionId) q = q.or(`region_id.eq.${regionId},region_id.is.null`);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function listCompanyRegions(companyId, { activeOnly = true } = {}) {
  let q = supabase
    .from('company_regions')
    .select('id, name, code, order_index')
    .eq('company_id', companyId)
    .order('order_index', { ascending: true })
    .order('name', { ascending: true });
  if (activeOnly) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function clearDefaultBankAccount(companyId, exceptId = null, regionId = null) {
  let q = supabase
    .from('company_bank_accounts')
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('is_default', true);
  q = regionId ? q.eq('region_id', regionId) : q.is('region_id', null);
  if (exceptId) q = q.neq('id', exceptId);
  await q;
}

async function ensureDefaultPaymentStages(leadId, companyId) {
  const { data: existing, error } = await supabase
    .from('crm_payment_stages')
    .select('id')
    .eq('lead_id', leadId)
    .limit(1);
  if (error) throw error;
  if ((existing || []).length) return;

  const rows = DEFAULT_PAYMENT_STAGE_LABELS.map((label, i) => ({
    lead_id: leadId,
    company_id: companyId,
    label,
    planned_amount: null,
    sort_order: i,
    payment_method: i === 0 ? 'cash' : 'transfer',
    status: 'pending',
    received_amount: 0,
  }));
  const { error: insErr } = await supabase.from('crm_payment_stages').insert(rows);
  if (insErr) throw insErr;
}

async function listPaymentStages(leadId) {
  const { data, error } = await supabase
    .from('crm_payment_stages')
    .select('*, bank_account:company_bank_accounts(id, bank_name, account_number, account_holder)')
    .eq('lead_id', leadId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map((s) => ({
    ...s,
    bank_account: unwrapEmbed(s.bank_account),
  }));
}

async function listDealPayments(leadId) {
  const { data, error } = await supabase
    .from('crm_deal_payments')
    .select(`
      *,
      bank_account:company_bank_accounts(id, bank_name, account_number, account_holder),
      stage:crm_payment_stages(id, label),
      creator:users!crm_deal_payments_created_by_fkey(id, full_name)
    `)
    .eq('lead_id', leadId)
    .order('payment_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((p) => ({
    ...p,
    bank_account: unwrapEmbed(p.bank_account),
    stage: unwrapEmbed(p.stage),
    creator: unwrapEmbed(p.creator),
  }));
}

async function recomputeStageReceived(stageId) {
  if (!stageId) return null;
  const { data: stage } = await supabase
    .from('crm_payment_stages')
    .select('id, planned_amount')
    .eq('id', stageId)
    .maybeSingle();
  if (!stage) return null;

  const { data: pays } = await supabase
    .from('crm_deal_payments')
    .select('amount')
    .eq('stage_id', stageId);
  const received = (pays || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const status = stageStatusFromAmounts(stage.planned_amount, received);
  const { data: updated, error } = await supabase
    .from('crm_payment_stages')
    .update({
      received_amount: received,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', stageId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return updated;
}

/**
 * Map giai đoạn cọc kế toán → deposit_installments trên BG/ĐH/deal.
 * Ưu tiên khớp theo số thứ tự; nếu thiếu đợt thì tạo từ planned_amount của stage.
 */
function buildInstallmentsFromDepositStages(depositStages, existingInstallments) {
  const stages = Array.isArray(depositStages) ? depositStages : [];
  if (!stages.length) return null;

  const existing = normalizeDepositInstallments(existingInstallments) || [];
  const rows = stages.map((st, i) => {
    const prev = existing[i] || {};
    const planned = Number(st.planned_amount);
    const amount = (Number.isFinite(planned) && planned > 0)
      ? planned
      : (prev.amount != null ? prev.amount : null);
    let received = prev.received ?? null;
    if (st.status === 'paid') received = true;
    else if ((Number(st.received_amount) || 0) > 0) received = false;
    else if (st.status === 'pending') received = false;
    return {
      amount,
      received,
      label: (prev.label && String(prev.label).trim())
        || String(st.label || '').trim()
        || `Cọc lần ${i + 1}`,
    };
  });

  // Giữ các đợt thừa trên BG/ĐH nếu nhiều hơn số stage cọc
  for (let i = stages.length; i < existing.length; i += 1) {
    rows.push({ ...existing[i] });
  }

  return aggregateDepositFromInstallments(rows);
}

/**
 * Đồng bộ cọc từ kế toán → báo giá + đơn hàng cùng lead.
 * @param {string} leadId
 * @param {object} opts
 * @param {number|null} [opts.deposit_amount]
 * @param {boolean|null} [opts.deposit_received]
 * @param {string|null} [opts.deposit_label]
 * @param {Array|null} [opts.deposit_installments]
 * @param {boolean} [opts.force] — ghi cả khi chỉ có deposit_received (PUT cọc thủ công)
 */
async function syncDepositToQuotationsAndOrders(leadId, opts = {}) {
  if (!leadId) return { synced: false, quotations: 0, orders: 0 };

  const patch = { updated_at: new Date().toISOString() };
  const amt = Number(opts.deposit_amount);
  if (Number.isFinite(amt) && amt > 0) patch.deposit_amount = amt;
  if (opts.deposit_received === true || opts.deposit_received === false) {
    patch.deposit_received = opts.deposit_received;
  }
  if (opts.deposit_label != null && String(opts.deposit_label).trim() !== '') {
    patch.deposit_label = String(opts.deposit_label).trim();
  }
  if (opts.deposit_installments) {
    patch.deposit_installments = opts.deposit_installments;
  }

  // Chỉ chạy khi có ít nhất 1 field cọc (tránh update trống)
  const keys = Object.keys(patch).filter((k) => k !== 'updated_at');
  if (!keys.length && !opts.force) {
    return { synced: false, quotations: 0, orders: 0 };
  }

  const [quotesRes, ordersRes] = await Promise.all([
    supabase
      .from('quotations')
      .select('id, deposit_installments')
      .eq('lead_id', leadId),
    supabase
      .from('orders')
      .select('id, deposit_installments')
      .eq('lead_id', leadId),
  ]);

  let quoteCount = 0;
  let orderCount = 0;

  for (const q of quotesRes.data || []) {
    let docPatch = { ...patch };
    // Nếu caller chưa gửi installments, vẫn cập nhật received trên đợt hiện có
    if (!opts.deposit_installments && (opts.deposit_received === true || opts.deposit_received === false)) {
      const existing = normalizeDepositInstallments(q.deposit_installments);
      if (existing?.length) {
        const updated = existing.map((r) => ({ ...r, received: opts.deposit_received }));
        const agg = aggregateDepositFromInstallments(updated);
        docPatch.deposit_installments = agg.deposit_installments;
        if (agg.deposit_received != null) docPatch.deposit_received = agg.deposit_received;
        if (agg.deposit_amount != null && !docPatch.deposit_amount) {
          docPatch.deposit_amount = agg.deposit_amount;
        }
      }
    }
    const { error } = await supabase.from('quotations').update(docPatch).eq('id', q.id);
    if (!error) quoteCount += 1;
    else console.warn('[accounting] sync deposit → quotation', q.id, error.message);
  }

  for (const o of ordersRes.data || []) {
    let docPatch = { ...patch };
    if (!opts.deposit_installments && (opts.deposit_received === true || opts.deposit_received === false)) {
      const existing = normalizeDepositInstallments(o.deposit_installments);
      if (existing?.length) {
        const updated = existing.map((r) => ({ ...r, received: opts.deposit_received }));
        const agg = aggregateDepositFromInstallments(updated);
        docPatch.deposit_installments = agg.deposit_installments;
        if (agg.deposit_received != null) docPatch.deposit_received = agg.deposit_received;
        if (agg.deposit_amount != null && !docPatch.deposit_amount) {
          docPatch.deposit_amount = agg.deposit_amount;
        }
      }
    }
    const { error } = await supabase.from('orders').update(docPatch).eq('id', o.id);
    if (!error) orderCount += 1;
    else console.warn('[accounting] sync deposit → order', o.id, error.message);
  }

  return { synced: quoteCount + orderCount > 0, quotations: quoteCount, orders: orderCount };
}

/**
 * Khi BG/deal đánh dấu Đã nhận / Chưa nhận cọc → cập nhật giai đoạn thanh toán có nhãn «cọc».
 */
async function syncDepositReceivedFlagToPaymentStages(leadId, depositReceived) {
  if (!leadId || (depositReceived !== true && depositReceived !== false)) {
    return { updated: 0 };
  }
  const stages = await listPaymentStages(leadId);
  const depositStages = stages.filter((s) => isDepositStageLabel(s.label));
  if (!depositStages.length) return { updated: 0 };

  let updated = 0;
  const now = new Date().toISOString();
  for (const st of depositStages) {
    if (depositReceived === true) {
      const planned = Number(st.planned_amount);
      const current = Number(st.received_amount) || 0;
      const received = (Number.isFinite(planned) && planned > 0)
        ? Math.max(current, planned)
        : Math.max(current, 0);
      const patch = {
        status: 'paid',
        updated_at: now,
      };
      if (received > 0) patch.received_amount = received;
      else if (Number.isFinite(planned) && planned > 0) patch.received_amount = planned;
      const { error } = await supabase.from('crm_payment_stages').update(patch).eq('id', st.id);
      if (!error) updated += 1;
    } else if (depositReceived === false && (Number(st.received_amount) || 0) <= 0) {
      const { error } = await supabase.from('crm_payment_stages').update({
        status: 'pending',
        updated_at: now,
      }).eq('id', st.id);
      if (!error) updated += 1;
    }
  }
  return { updated };
}
async function syncDepositFromPaymentStages(leadId) {
  const stages = await listPaymentStages(leadId);
  const depositStages = stages.filter((s) => isDepositStageLabel(s.label));
  const depositReceivedTotal = depositStages.reduce(
    (s, st) => s + (Number(st.received_amount) || 0),
    0,
  );
  const plannedDeposit = depositStages.reduce(
    (s, st) => s + (Number(st.planned_amount) || 0),
    0,
  );
  const allDepositPaid = depositStages.length > 0
    && depositStages.every((st) => st.status === 'paid');

  const { data: lead } = await supabase
    .from('crm_leads')
    .select('id, project_id, deposit_installments, deposit_label, deposit_received, deposit_amount')
    .eq('id', leadId)
    .maybeSingle();
  if (!lead) return { synced: false };

  const fromStages = depositStages.length
    ? buildInstallmentsFromDepositStages(depositStages, lead.deposit_installments)
    : null;

  const leadPatch = {
    updated_at: new Date().toISOString(),
  };
  if (depositReceivedTotal > 0) {
    leadPatch.deposit_amount = depositReceivedTotal;
  } else if (fromStages?.deposit_amount != null) {
    leadPatch.deposit_amount = fromStages.deposit_amount;
  }
  if (depositStages.length) {
    if (allDepositPaid && (plannedDeposit > 0 || depositReceivedTotal > 0)) {
      leadPatch.deposit_received = true;
    } else if (lead.deposit_received === true) {
      // Giữ «Đã nhận» từ báo giá / chỉnh tay — không đè false khi giai đoạn cọc chưa khớp số
      leadPatch.deposit_received = true;
    } else if (depositReceivedTotal > 0) {
      leadPatch.deposit_received = false;
    }
  }
  if (fromStages?.deposit_installments) {
    leadPatch.deposit_installments = fromStages.deposit_installments;
    if (fromStages.deposit_received != null && leadPatch.deposit_received == null) {
      leadPatch.deposit_received = fromStages.deposit_received;
    }
    if (fromStages.deposit_label && !lead.deposit_label) {
      leadPatch.deposit_label = fromStages.deposit_label;
    }
  }

  await supabase.from('crm_leads').update(leadPatch).eq('id', leadId);

  if (lead.project_id && (depositReceivedTotal > 0 || leadPatch.deposit_amount != null)) {
    const allPays = await listDealPayments(leadId);
    const nonDepositStageIds = new Set(
      stages.filter((s) => !isDepositStageLabel(s.label)).map((s) => String(s.id)),
    );
    const collected = allPays
      .filter((p) => p.stage_id && nonDepositStageIds.has(String(p.stage_id)))
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);

    const projectPatch = {
      updated_at: new Date().toISOString(),
    };
    if (depositReceivedTotal > 0) projectPatch.deposit_amount = depositReceivedTotal;
    else if (leadPatch.deposit_amount != null) projectPatch.deposit_amount = leadPatch.deposit_amount;
    if (collected > 0) projectPatch.collected_amount = collected;
    await supabase.from('projects').update(projectPatch).eq('id', lead.project_id);
  }

  // Báo giá + đơn hàng: khi giai đoạn cọc = "Đủ" → "Đã nhận" (thu đủ)
  const docsSync = await syncDepositToQuotationsAndOrders(leadId, {
    deposit_amount: leadPatch.deposit_amount ?? null,
    deposit_received: leadPatch.deposit_received ?? null,
    deposit_label: leadPatch.deposit_label ?? null,
    deposit_installments: leadPatch.deposit_installments || null,
  });

  return {
    synced: true,
    deposit_amount: leadPatch.deposit_amount ?? null,
    deposit_received: leadPatch.deposit_received ?? null,
    quotations: docsSync.quotations,
    orders: docsSync.orders,
  };
}

async function mirrorPaymentToInvoice(dealPayment, userId) {
  if (!dealPayment?.invoice_id || !dealPayment.amount) return null;
  const method = dealPayment.payment_method || 'transfer';
  const { data: rec, error } = await supabase
    .from('payment_records')
    .insert({
      invoice_id: dealPayment.invoice_id,
      order_id: dealPayment.order_id || null,
      amount: dealPayment.amount,
      payment_date: dealPayment.payment_date,
      payment_method: method,
      reference_number: dealPayment.reference_number || null,
      notes: dealPayment.notes || null,
      created_by: userId || null,
    })
    .select('id')
    .maybeSingle();
  if (error) {
    console.warn('[accounting] mirror payment_records:', error.message);
    return null;
  }

  // Recompute invoice paid_amount
  const { data: pays } = await supabase
    .from('payment_records')
    .select('amount')
    .eq('invoice_id', dealPayment.invoice_id);
  const paid = (pays || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const { data: inv } = await supabase
    .from('invoices')
    .select('total')
    .eq('id', dealPayment.invoice_id)
    .maybeSingle();
  const total = Number(inv?.total) || 0;
  let paymentStatus = 'unpaid';
  if (paid <= 0) paymentStatus = 'unpaid';
  else if (total > 0 && paid + 0.0001 >= total) paymentStatus = 'paid';
  else paymentStatus = 'partial';

  await supabase.from('invoices').update({
    paid_amount: paid,
    payment_status: paymentStatus,
    updated_at: new Date().toISOString(),
  }).eq('id', dealPayment.invoice_id);

  if (rec?.id && dealPayment.id) {
    await supabase
      .from('crm_deal_payments')
      .update({ mirrored_payment_record_id: rec.id })
      .eq('id', dealPayment.id);
  }
  return rec?.id || null;
}

/** "[Tên nhiệm vụ] 📄 Nhãn tài liệu" → { taskName, label } — lead_documents thường được đặt tên theo mẫu này khi sync từ CRM task. */
function splitTaskNameFromLabel(rawName, fallback) {
  const name = String(rawName || '').trim();
  const m = name.match(/^\[(.+?)\]\s*(.*)$/);
  if (m) {
    return { taskName: m[1].trim() || null, label: m[2].trim() || fallback || null };
  }
  return { taskName: null, label: name || fallback || null };
}

async function collectMergedDocuments(leadId, projectId) {
  const docs = [];

  const { data: leadDocs } = await supabase
    .from('lead_documents')
    .select('id, name, file_name, doc_type, file_url, file_size, mime_type, created_at, source_crm_task_id, source_attachment_id, source_file_attachment_id, shared_to_workshop')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });

  for (const d of leadDocs || []) {
    const isTask = !!(d.source_crm_task_id || d.source_attachment_id);
    const fromSx = !!d.source_file_attachment_id;
    const { taskName, label } = splitTaskNameFromLabel(d.name, d.file_name);
    docs.push({
      id: `crm-${d.id}`,
      source: fromSx ? 'sx_shared' : (isTask ? 'crm_task' : 'crm'),
      name: label || d.name || d.file_name,
      task_name: isTask ? taskName : null,
      file_name: d.file_name || d.name,
      file_url: d.file_url || null,
      file_size: d.file_size || null,
      mime_type: d.mime_type || null,
      doc_type: d.doc_type || null,
      created_at: d.created_at,
      raw_id: d.id,
      entity: 'lead_documents',
    });
  }

  if (projectId) {
    const { data: projAtts } = await supabase
      .from('file_attachments')
      .select('id, file_name, file_url, file_size, mime_type, notes, created_at, entity_type, entity_id')
      .eq('entity_type', 'project')
      .eq('entity_id', projectId)
      .order('created_at', { ascending: false });

    for (const a of projAtts || []) {
      docs.push({
        id: `sx-proj-${a.id}`,
        source: 'sx',
        name: a.notes || a.file_name,
        task_name: null,
        file_name: a.file_name,
        file_url: a.file_url || null,
        file_size: a.file_size || null,
        mime_type: a.mime_type || null,
        doc_type: null,
        created_at: a.created_at,
        raw_id: a.id,
        entity: 'file_attachments',
      });
    }

    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, title')
      .eq('project_id', projectId);
    const taskIds = (tasks || []).map((t) => t.id).filter(Boolean);
    const taskTitleById = new Map((tasks || []).map((t) => [t.id, t.title]));
    if (taskIds.length) {
      const { data: taskAtts } = await supabase
        .from('file_attachments')
        .select('id, file_name, file_url, file_size, mime_type, notes, created_at, entity_id')
        .eq('entity_type', 'task')
        .in('entity_id', taskIds)
        .order('created_at', { ascending: false });
      for (const a of taskAtts || []) {
        docs.push({
          id: `sx-task-${a.id}`,
          source: 'sx_task',
          name: a.notes || a.file_name,
          task_name: taskTitleById.get(a.entity_id) || null,
          file_name: a.file_name,
          file_url: a.file_url || null,
          file_size: a.file_size || null,
          mime_type: a.mime_type || null,
          doc_type: null,
          created_at: a.created_at,
          raw_id: a.id,
          entity: 'file_attachments',
          task_id: a.entity_id,
        });
      }
    }
  }

  docs.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  return docs;
}

/** Mirror giá trị deal trên project (estimated_value) — không dùng production_value (chi phí SX). */
function projectDealMirrorValue(project) {
  if (!project) return null;
  const v = Number(project.estimated_value);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * Đồng bộ giá trị deal CRM → mirror trên project (estimated_value).
 * Không đụng production_value (chi phí SX) — hai cột độc lập.
 */
async function syncDealValueToProject(projectId, value) {
  const v = Number(value);
  if (!projectId || !Number.isFinite(v) || v <= 0) {
    return { synced: false, reason: 'invalid_value' };
  }
  const { error } = await supabase.from('projects').update({
    estimated_value: v,
    updated_at: new Date().toISOString(),
  }).eq('id', projectId);
  if (error) throw error;
  return { synced: true, value: v };
}

async function fetchAccountingDealDetail(leadId, clientCompanyId) {
  const check = await assertAccountingDeal(leadId, clientCompanyId);
  if (check.error) return check;

  await ensureDefaultPaymentStages(leadId, clientCompanyId);

  const leadBase = check.lead;
  const projectId = leadBase.project_id;

  const [
    leadFullRes,
    projectRes,
    quotationsRes,
    ordersRes,
    invoicesRes,
    documents,
    stages,
    payments,
    bankAccounts,
  ] = await Promise.all([
    supabase
      .from('crm_leads')
      .select(`
        *,
        stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, icon, is_won, is_lost),
        customer:customers(id, full_name, phone, email, address),
        assignee:users!crm_leads_assigned_to_fkey(id, full_name, phone),
        company:companies(id, name, short_name),
        region:company_regions!crm_leads_region_id_fkey(id, name, code)
      `)
      .eq('id', leadId)
      .maybeSingle(),
    projectId
      ? supabase
        .from('projects')
        .select('id, code, name, status, production_value, estimated_value, deposit_amount, collected_amount, company_id, deadline, production_deadline')
        .eq('id', projectId)
        .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('quotations')
      .select('id, code, status, total, deposit_amount, deposit_received, created_at, title')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('orders')
      .select('id, code, status, total, deposit_amount, deposit_received, created_at, title')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('invoices')
      .select('id, code, status, total, paid_amount, payment_status, created_at, title, order_id')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(20),
    collectMergedDocuments(leadId, projectId),
    listPaymentStages(leadId),
    listDealPayments(leadId),
    listBankAccounts(clientCompanyId, { activeOnly: true, regionId: leadBase.region_id || null }),
  ]);

  const lead = leadFullRes.data || leadBase;
  const project = projectRes.data || null;
  const crmValue = Number(lead.estimated_value) || 0;
  const projectMirror = projectDealMirrorValue(project);
  const productionCost = project ? Number(project.production_value) || 0 : 0;
  const valueSync = {
    crm_value: crmValue,
    /** Mirror deal trên project.estimated_value — khác chi phí SX (production_value) */
    project_value: projectMirror,
    sx_value: projectMirror,
    production_value: productionCost,
    in_sync: !project || projectMirror == null || Math.abs(projectMirror - crmValue) < 1,
  };

  return {
    lead: {
      ...lead,
      stage: unwrapEmbed(lead.stage),
      customer: unwrapEmbed(lead.customer),
      assignee: unwrapEmbed(lead.assignee),
      company: unwrapEmbed(lead.company),
      region: unwrapEmbed(lead.region),
    },
    project,
    value_sync: valueSync,
    quotations: quotationsRes.data || [],
    orders: ordersRes.data || [],
    invoices: invoicesRes.data || [],
    documents,
    payment_stages: stages,
    payments,
    bank_accounts: bankAccounts,
  };
}

module.exports = {
  DEFAULT_PAYMENT_STAGE_LABELS,
  assertAccountingDeal,
  listBankAccounts,
  listCompanyRegions,
  clearDefaultBankAccount,
  ensureDefaultPaymentStages,
  listPaymentStages,
  listDealPayments,
  recomputeStageReceived,
  syncDepositFromPaymentStages,
  syncDepositToQuotationsAndOrders,
  syncDepositReceivedFlagToPaymentStages,
  buildInstallmentsFromDepositStages,
  mirrorPaymentToInvoice,
  collectMergedDocuments,
  fetchAccountingDealDetail,
  isDepositStageLabel,
  stageStatusFromAmounts,
  projectDealMirrorValue,
  /** @deprecated dùng projectDealMirrorValue — không còn đọc production_value */
  projectSxValue: projectDealMirrorValue,
  syncDealValueToProject,
};
