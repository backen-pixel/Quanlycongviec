/**
 * Tạo đơn trực tiếp trên module Sản xuất (không qua form CRM / pipeline Deal).
 * Nội bộ vẫn gắn 1 bản ghi deal tối thiểu để Kanban SX hoạt động (won + project_id).
 */

const { supabase } = require('../config/supabase');
const { nextCrmCode } = require('./crmNextCode');
const { ensureDefaultCrmPipelineForCompany } = require('./ensureDefaultCrmPipeline');
const { validateProductionCompanyId } = require('./productionCompanyGate');
const { autoCreateProjectFromWonDeal } = require('./autoDealWonProject');

async function resolveWonDealStageId(pipelineId) {
  const { data: won } = await supabase
    .from('crm_pipeline_stages')
    .select('id')
    .eq('pipeline_id', pipelineId)
    .eq('pipeline_type', 'deal')
    .eq('is_won', true)
    .eq('is_active', true)
    .order('order_index')
    .limit(1)
    .maybeSingle();
  if (won?.id) return won.id;

  const { data: first } = await supabase
    .from('crm_pipeline_stages')
    .select('id')
    .eq('pipeline_id', pipelineId)
    .eq('pipeline_type', 'deal')
    .eq('is_active', true)
    .order('order_index')
    .limit(1)
    .maybeSingle();
  return first?.id || null;
}

async function validateWorkshopType(companyId, workshopTypeId) {
  if (!workshopTypeId) return { ok: false, error: 'Chọn phân loại xưởng' };
  const { data: wt } = await supabase
    .from('workshop_project_types')
    .select('id, company_id, applies_to, is_active, name')
    .eq('id', workshopTypeId)
    .maybeSingle();
  if (!wt) return { ok: false, error: 'Phân loại xưởng không tồn tại' };
  if (String(wt.company_id) !== String(companyId)) {
    return { ok: false, error: 'Phân loại không thuộc công ty đã chọn' };
  }
  if (wt.is_active === false) return { ok: false, error: 'Phân loại đang bị ẩn' };
  if (wt.applies_to && !['production', 'both'].includes(String(wt.applies_to))) {
    return { ok: false, error: 'Phân loại không áp dụng cho Sản xuất' };
  }
  return { ok: true, type: wt };
}

/**
 * @param {object} opts
 * @param {object} opts.req
 * @param {string} opts.userId
 * @param {string} opts.companyId
 * @param {string} opts.workshopTypeId
 * @param {string} opts.title
 * @param {string} opts.customerId — có sẵn hoặc tạo từ customerName/Phone
 * @param {string} [opts.customerName]
 * @param {string} [opts.customerPhone]
 * @param {string} [opts.customerEmail]
 * @param {string} [opts.installAddress]
 * @param {string} [opts.regionId]
 * @param {number} [opts.estimatedValue]
 * @param {string} [opts.description]
 */
async function createWorkshopIntakeOrder(opts) {
  const {
    req,
    userId,
    companyId,
    workshopTypeId,
    title,
    customerId: incomingCustomerId,
    customerName,
    customerPhone,
    customerEmail,
    installAddress,
    regionId,
    estimatedValue,
    description,
  } = opts;

  const titleTrim = String(title || '').trim();
  if (!titleTrim) return { ok: false, error: 'Nhập tên đơn', statusCode: 400 };

  const coCheck = await validateProductionCompanyId(companyId);
  if (!coCheck.ok) return { ok: false, error: coCheck.error, statusCode: 400 };

  const wtCheck = await validateWorkshopType(coCheck.company.id, workshopTypeId);
  if (!wtCheck.ok) return { ok: false, error: wtCheck.error, statusCode: 400 };

  let customerId = incomingCustomerId || null;
  if (!customerId) {
    const nameTrim = String(customerName || '').trim();
    const phoneTrim = String(customerPhone || '').trim();
    if (!nameTrim) return { ok: false, error: 'Nhập tên khách hàng', statusCode: 400 };
    if (!phoneTrim) return { ok: false, error: 'Nhập số điện thoại khách hàng', statusCode: 400 };
    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .insert({
        full_name: nameTrim,
        phone: phoneTrim,
        email: customerEmail || null,
        address: installAddress || null,
        company_id: coCheck.company.id,
      })
      .select('id')
      .single();
    if (custErr) return { ok: false, error: custErr.message, statusCode: 500 };
    customerId = customer.id;
  }

  const pipelineId = await ensureDefaultCrmPipelineForCompany(coCheck.company.id);
  if (!pipelineId) {
    return { ok: false, error: 'Không tạo được pipeline nội bộ cho công ty', statusCode: 500 };
  }

  const wonStageId = await resolveWonDealStageId(pipelineId);
  if (!wonStageId) {
    return { ok: false, error: 'Pipeline chưa có giai đoạn Deal', statusCode: 500 };
  }

  const dealCode = await nextCrmCode('DEAL');
  const nowIso = new Date().toISOString();
  const { data: deal, error: dealErr } = await supabase
    .from('crm_leads')
    .insert({
      code: dealCode,
      title: titleTrim,
      type: 'deal',
      customer_id: customerId,
      company_id: coCheck.company.id,
      pipeline_id: pipelineId,
      stage_id: wonStageId,
      region_id: regionId || null,
      assigned_to: userId,
      lead_owner_id: userId,
      created_by: userId,
      estimated_value: estimatedValue != null ? Number(estimatedValue) || 0 : 0,
      probability: 100,
      install_address: installAddress || null,
      description: description
        ? `[Xưởng] ${description}`
        : '[Xưởng] Tạo trực tiếp từ module Sản xuất',
      stage_entered_at: nowIso,
      actual_close_date: nowIso.split('T')[0],
    })
    .select('id, code, title')
    .single();
  if (dealErr) return { ok: false, error: dealErr.message, statusCode: 500 };

  const projectResult = await autoCreateProjectFromWonDeal({
    req,
    dealId: deal.id,
    userId,
    productionCompanyId: coCheck.company.id,
    workshopTypeId,
  });
  if (!projectResult.ok) {
    return {
      ok: false,
      error: projectResult.error || 'Không đưa được vào xưởng',
      statusCode: projectResult.statusCode || 500,
      deal_id: deal.id,
    };
  }

  return {
    ok: true,
    deal_id: deal.id,
    deal_code: deal.code,
    project_id: projectResult.project_id,
    project_code: projectResult.project_code,
    project_name: projectResult.project_name,
    tasks_created: projectResult.tasks_created,
  };
}

module.exports = { createWorkshopIntakeOrder };
