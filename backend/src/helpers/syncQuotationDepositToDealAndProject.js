/**
 * Đồng bộ tiền cọc + trạng thái cọc từ báo giá → deal (crm_leads) và dự án SX (projects.deposit_amount).
 */
const { supabase } = require('../config/supabase');
const {
  normalizeDepositInstallments,
  aggregateDepositFromInstallments,
} = require('./depositInstallments');

function hasDepositData(quote) {
  const installments = normalizeDepositInstallments(quote?.deposit_installments);
  if (installments?.length) return true;
  const amt = Number(quote?.deposit_amount);
  const hasAmount = Number.isFinite(amt) && amt > 0;
  const hasStatus = quote?.deposit_received === true || quote?.deposit_received === false;
  const hasLabel = quote?.deposit_label != null && String(quote.deposit_label).trim() !== '';
  return hasAmount || hasStatus || hasLabel;
}

/**
 * @param {object} quote — quotation row (deposit_*, deposit_installments, lead_id, project_id)
 * @param {string} [leadIdOverride] — lead/deal cần cập nhật (mặc định quote.lead_id)
 */
async function syncQuotationDepositToDealAndProject(quote, leadIdOverride = null) {
  if (!quote || !hasDepositData(quote)) {
    return { synced: false, reason: 'no_deposit_data' };
  }

  const leadId = leadIdOverride || quote.lead_id || null;
  let projectId = quote.project_id || null;

  const fromInstallments = normalizeDepositInstallments(quote.deposit_installments);
  const agg = fromInstallments
    ? aggregateDepositFromInstallments(fromInstallments)
    : {
        deposit_installments: null,
        deposit_amount: quote.deposit_amount,
        deposit_received: quote.deposit_received,
        deposit_label: quote.deposit_label,
      };

  const leadPatch = { updated_at: new Date().toISOString() };
  const depAmt = Number(agg.deposit_amount);
  if (Number.isFinite(depAmt) && depAmt > 0) {
    leadPatch.deposit_amount = depAmt;
  }
  if (agg.deposit_received === true || agg.deposit_received === false) {
    leadPatch.deposit_received = agg.deposit_received;
  }
  if (agg.deposit_label != null && String(agg.deposit_label).trim() !== '') {
    leadPatch.deposit_label = agg.deposit_label;
  }
  if (agg.deposit_installments) {
    leadPatch.deposit_installments = agg.deposit_installments;
  }

  if (leadId && Object.keys(leadPatch).length > 1) {
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('project_id')
      .eq('id', leadId)
      .maybeSingle();
    if (lead?.project_id) projectId = lead.project_id;
    await supabase.from('crm_leads').update(leadPatch).eq('id', leadId);
  }

  if (projectId && Number.isFinite(depAmt) && depAmt > 0) {
    await supabase.from('projects').update({
      deposit_amount: depAmt,
      updated_at: new Date().toISOString(),
    }).eq('id', projectId);
  }

  // Báo giá đánh dấu Đã nhận cọc → giai đoạn «Cọc» trên kế toán cũng Đủ
  if (leadId && (agg.deposit_received === true || agg.deposit_received === false)) {
    try {
      const { syncDepositReceivedFlagToPaymentStages } = require('./accountingDealDetail');
      await syncDepositReceivedFlagToPaymentStages(leadId, agg.deposit_received);
    } catch (e) {
      console.warn('[syncQuotationDeposit] payment stages:', e.message);
    }
  }

  return {
    synced: true,
    lead_id: leadId,
    project_id: projectId || null,
  };
}

module.exports = {
  syncQuotationDepositToDealAndProject,
  hasDepositData,
};
