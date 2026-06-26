/**
 * Đồng bộ tiền cọc + trạng thái cọc từ báo giá → deal (crm_leads) và dự án SX (projects.deposit_amount).
 */
const { supabase } = require('../config/supabase');

function hasDepositData(quote) {
  const amt = Number(quote?.deposit_amount);
  const hasAmount = Number.isFinite(amt) && amt > 0;
  const hasStatus = quote?.deposit_received === true || quote?.deposit_received === false;
  const hasLabel = quote?.deposit_label != null && String(quote.deposit_label).trim() !== '';
  return hasAmount || hasStatus || hasLabel;
}

/**
 * @param {object} quote — quotation row (deposit_amount, deposit_received, deposit_label, lead_id, project_id)
 * @param {string} [leadIdOverride] — lead/deal cần cập nhật (mặc định quote.lead_id)
 */
async function syncQuotationDepositToDealAndProject(quote, leadIdOverride = null) {
  if (!quote || !hasDepositData(quote)) {
    return { synced: false, reason: 'no_deposit_data' };
  }

  const leadId = leadIdOverride || quote.lead_id || null;
  let projectId = quote.project_id || null;

  const leadPatch = { updated_at: new Date().toISOString() };
  const depAmt = Number(quote.deposit_amount);
  if (Number.isFinite(depAmt) && depAmt > 0) {
    leadPatch.deposit_amount = depAmt;
  }
  if (quote.deposit_received === true || quote.deposit_received === false) {
    leadPatch.deposit_received = quote.deposit_received;
  }
  if (quote.deposit_label != null && String(quote.deposit_label).trim() !== '') {
    leadPatch.deposit_label = quote.deposit_label;
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
