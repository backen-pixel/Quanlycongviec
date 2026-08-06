/**
 * Admin chọn lại công ty SX + phân loại trên deal đã có dự án:
 * giữ project_id, cập nhật company/type, thay NV, xóa NV mẫu xưởng cũ + tạo lại, force CRM sx_*.
 */
const { supabase } = require('../config/supabase');
const { validateProductionCompanyId } = require('./productionCompanyGate');
const { applyWorkshopTypeDefaultStaffToProject } = require('./productionWorkshopTypeStaff');
const { applyDefaultWorkshopTemplatesForNewProject } = require('./workshopApplyTemplates');
const { applyProductionTemplateToFulfillmentLead } = require('./projectOrderFulfillment');
const { syncCrmLeadSxPipelineFromProject, getResolvedKanbanStages, INTAKE_BUCKET } = require('./workshopKanban');
const { assignProductionCompanyDealResponsibility } = require('./productionHandoverSettings');

async function assertWorkshopTypeForCompany(workshopTypeId, companyId) {
  const wkt = workshopTypeId != null && String(workshopTypeId).trim() ? String(workshopTypeId).trim() : null;
  if (!wkt) {
    const err = new Error('Vui lòng chọn phân loại sản xuất');
    err.status = 400;
    throw err;
  }
  if (!companyId) {
    const err = new Error('Thiếu company_id khi gắn phân loại xưởng');
    err.status = 400;
    throw err;
  }
  const { data, error } = await supabase
    .from('workshop_project_types')
    .select('id, name, company_id, is_active')
    .eq('id', wkt)
    .maybeSingle();
  if (error) throw error;
  if (!data || String(data.company_id) !== String(companyId)) {
    const err = new Error('Phân loại xưởng không tồn tại hoặc không thuộc công ty này');
    err.status = 400;
    throw err;
  }
  if (data.is_active === false) {
    const err = new Error('Phân loại xưởng đang tắt — chọn phân loại khác');
    err.status = 400;
    throw err;
  }
  return data;
}

/** Xóa nhiệm vụ dự án sinh từ bộ mẫu xưởng (giữ NV import từ CRM bán hàng). */
async function deleteWorkshopTemplateProjectTasks(projectId) {
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id, metadata')
    .eq('project_id', projectId);
  if (error) throw error;
  const ids = (tasks || [])
    .filter((t) => {
      const meta = t.metadata && typeof t.metadata === 'object' ? t.metadata : null;
      if (!meta) return false;
      if (meta.imported_from === 'crm_deal') return false;
      return !!(meta.workshop_template_id);
    })
    .map((t) => t.id)
    .filter(Boolean);
  if (!ids.length) return 0;
  const { error: delErr } = await supabase.from('tasks').delete().in('id', ids);
  if (delErr) throw delErr;
  return ids.length;
}

/**
 * @param {{ dealId: string, userId: string, productionCompanyId: string, workshopTypeId: string, projectId?: string|null, req?: object }} opts
 */
async function reassignDealSxCompanyAndType({
  dealId,
  userId,
  productionCompanyId,
  workshopTypeId,
  projectId = null,
  req = null,
}) {
  const { data: lead, error: leadErr } = await supabase
    .from('crm_leads')
    .select('id, type, title, code, project_id, company_id, sx_template_company_id')
    .eq('id', dealId)
    .maybeSingle();
  if (leadErr) throw leadErr;
  if (!lead) {
    const err = new Error('Không tìm thấy deal');
    err.status = 404;
    throw err;
  }
  if (lead.type !== 'deal') {
    const err = new Error('Chỉ áp dụng cho deal');
    err.status = 400;
    throw err;
  }
  if (!lead.project_id) {
    const err = new Error('Deal chưa có dự án SX — không thể chọn lại');
    err.status = 400;
    throw err;
  }

  let resolvedProjectId = lead.project_id;
  if (projectId && String(projectId) !== String(lead.project_id)) {
    const { data: link } = await supabase
      .from('crm_deal_projects')
      .select('project_id')
      .eq('deal_id', dealId)
      .eq('project_id', projectId)
      .maybeSingle();
    if (!link?.project_id) {
      const err = new Error('Dự án không thuộc deal này');
      err.status = 400;
      throw err;
    }
    resolvedProjectId = link.project_id;
  }

  const pcv = await validateProductionCompanyId(productionCompanyId);
  if (!pcv.ok) {
    const err = new Error(pcv.error || 'Công ty SX không hợp lệ');
    err.status = 400;
    throw err;
  }
  const companyId = pcv.company.id;
  const wt = await assertWorkshopTypeForCompany(workshopTypeId, companyId);

  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('id, code, name, company_id, workshop_type_id, current_stage_id, status')
    .eq('id', resolvedProjectId)
    .maybeSingle();
  if (projErr) throw projErr;
  if (!project) {
    const err = new Error('Không tìm thấy dự án gắn deal');
    err.status = 404;
    throw err;
  }

  const fromCompanyId = project.company_id || null;
  const fromTypeId = project.workshop_type_id || null;
  const nowIso = new Date().toISOString();

  // Pipeline: về cột Chờ vào xưởng (intake) nếu có, không thì cột đầu
  let intakeCol = null;
  try {
    const { stages } = await getResolvedKanbanStages(companyId, { workshopTypeId: wt.id });
    const sorted = [...(stages || [])].filter((s) => s.is_active !== false);
    intakeCol = sorted.find((s) => s.bucket_slug === INTAKE_BUCKET)
      || sorted.sort((a, b) => (a.order_index || 0) - (b.order_index || 0))[0]
      || null;
  } catch (e) {
    console.warn('[reassign-sx] resolve kanban:', e.message);
  }

  const projectUpd = {
    company_id: companyId,
    workshop_type_id: wt.id,
    updated_at: nowIso,
    current_stage_id: null,
    sx_pipeline_stage_entered_at: nowIso,
  };
  if (intakeCol?.workflow_stage_id) {
    projectUpd.current_stage_id = intakeCol.workflow_stage_id;
  }

  const { error: updProjErr } = await supabase
    .from('projects')
    .update(projectUpd)
    .eq('id', project.id);
  if (updProjErr) throw updProjErr;

  // Chỉ cập nhật sx_template trên deal khi reassign dự án primary
  const isPrimaryProject = String(project.id) === String(lead.project_id);
  const leadPatch = {
    updated_at: nowIso,
  };
  if (isPrimaryProject) {
    leadPatch.sx_template_company_id = companyId;
    if (intakeCol?.id) leadPatch.sx_pipeline_stage_id = intakeCol.id;
  }
  const { error: leadUpdErr } = await supabase
    .from('crm_leads')
    .update(leadPatch)
    .eq('id', dealId);
  if (leadUpdErr && !String(leadUpdErr.message || '').includes('sx_')) throw leadUpdErr;

  // Cập nhật label trên junction
  try {
    await supabase.from('crm_deal_projects').update({
      label: wt.name || null,
    }).eq('deal_id', dealId).eq('project_id', project.id);
  } catch (_) {}

  let primaryStaffId = null;
  try {
    primaryStaffId = await applyWorkshopTypeDefaultStaffToProject(project.id, companyId, wt.id);
  } catch (e) {
    console.warn('[reassign-sx] restaff:', e.message);
  }

  try {
    await assignProductionCompanyDealResponsibility({
      dealId,
      productionCompanyId: companyId,
      projectId: project.id,
    });
  } catch (e) {
    console.warn('[reassign-sx] assign responsibility:', e.message);
  }

  let deletedProjectTasks = 0;
  try {
    deletedProjectTasks = await deleteWorkshopTemplateProjectTasks(project.id);
  } catch (e) {
    console.warn('[reassign-sx] delete workshop tasks:', e.message);
  }

  let workshopTasksCreated = 0;
  try {
    workshopTasksCreated = await applyDefaultWorkshopTemplatesForNewProject(project.id, userId, {
      companyId,
      workshopTypeId: wt.id,
      currentStageId: projectUpd.current_stage_id,
    });
  } catch (e) {
    console.warn('[reassign-sx] apply workshop templates:', e.message);
  }

  let crmSxCreated = 0;
  try {
    const r = await applyProductionTemplateToFulfillmentLead({
      req,
      leadId: dealId,
      createdBy: userId,
      assigneeId: null,
      force: true,
      requireTemplateCompanyMatch: true,
      templateSourceCompanyId: companyId,
    });
    crmSxCreated = r?.created || 0;
  } catch (e) {
    console.warn('[reassign-sx] CRM sx_* tasks:', e.message);
  }

  try {
    await syncCrmLeadSxPipelineFromProject(project.id);
  } catch (e) {
    console.warn('[reassign-sx] sync pipeline:', e.message);
  }

  const coName = pcv.company.short_name || pcv.company.name || companyId;
  const typeName = wt.name || wt.id;
  try {
    await supabase.from('crm_activities').insert({
      lead_id: dealId,
      type: 'note',
      title: 'Admin chọn lại công ty / phân loại SX',
      description: `Công ty SX → «${coName}» · Phân loại → «${typeName}». Đã thay thành viên mặc định và tạo lại nhiệm vụ mẫu xưởng / CRM sx_* (xóa ${deletedProjectTasks} NV mẫu cũ).`,
      created_by: userId,
    });
  } catch (_) { /* ignore */ }

  return {
    ok: true,
    project_id: project.id,
    project_code: project.code,
    from_company_id: fromCompanyId,
    to_company_id: companyId,
    from_workshop_type_id: fromTypeId,
    to_workshop_type_id: wt.id,
    workshop_type_name: typeName,
    company_name: coName,
    primary_staff_id: primaryStaffId,
    deleted_workshop_tasks: deletedProjectTasks,
    workshop_tasks_created: workshopTasksCreated,
    crm_sx_tasks_created: crmSxCreated,
    sx_pipeline_stage_id: intakeCol?.id || null,
  };
}

module.exports = {
  reassignDealSxCompanyAndType,
  deleteWorkshopTemplateProjectTasks,
  assertWorkshopTypeForCompany,
};
