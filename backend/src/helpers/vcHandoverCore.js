/**
 * vcHandoverCore — logic bàn giao dự án SX sang module Vận chuyển/Lắp đặt (VC/LĐ).
 *
 * Được dùng bởi:
 *   - PATCH /production/projects/:id/handover-vc (flow cũ, giữ nguyên)
 *   - PATCH /vc-handover/comments/:id/select (flow mới — sale CRM chọn công ty trong bình luận)
 *
 * Hàm chỉ thực hiện phần "handover thật": cập nhật projects, tìm cột intake VC, gen mẫu VC,
 * đồng bộ crm_leads, thông báo VC. KHÔNG xử lý validate HTTP / phản hồi res.
 */
const { supabase } = require('../config/supabase');
const {
  getResolvedKanbanStages,
  resolveSxHandoverColumnId,
  getCrmVcDeliveryStageId,
  getCrmStageByRole,
} = require('./workshopKanban');
const {
  resolveLogisticsHandoverResponsibleUserId,
  resolveLogisticsHandoverInstallerUserId,
} = require('./logisticsHandoverSettings');
const { applyAllActiveWorkshopTemplatesForArea } = require('./workshopApplyTemplates');
const { ensureDealLeadDocumentsForProjectId } = require('./ensureDealLeadDocumentsForModuleTransition');
const { ensureLeadDocumentsIncludeShareModules } = require('./moduleLeadDocuments');
const { notifyVcHandoverFromSx } = require('./vcHandoverNotify');
const { isProjectAlreadyInLogistics } = require('./projectLogisticsScope');
const { logDealActivityComment } = require('./projectFileActivity');

/** Tìm cột intake của pipeline VC theo công ty VC đã chọn. */
async function resolveVcIntakeStageId(logisticsCompanyId) {
  try {
    const { data: vcIntakeRow } = await supabase
      .from('logistics_pipeline_stages')
      .select('id')
      .eq('bucket_slug', 'delivery_pending')
      .eq('is_active', true)
      .eq('company_id', logisticsCompanyId)
      .order('order_index')
      .limit(1)
      .maybeSingle();
    if (vcIntakeRow?.id) return vcIntakeRow.id;

    const { data: vcFirstRow } = await supabase
      .from('logistics_pipeline_stages')
      .select('id')
      .eq('is_active', true)
      .eq('company_id', logisticsCompanyId)
      .order('order_index')
      .limit(1)
      .maybeSingle();
    if (vcFirstRow?.id) return vcFirstRow.id;

    const { data: gIntake } = await supabase
      .from('logistics_pipeline_stages')
      .select('id')
      .eq('bucket_slug', 'delivery_pending')
      .eq('is_active', true)
      .is('company_id', null)
      .order('order_index')
      .limit(1)
      .maybeSingle();
    return gIntake?.id || null;
  } catch (e) {
    console.warn('[vcHandoverCore] resolveVcIntakeStageId:', e.message);
    return null;
  }
}

/** Chuẩn hoá cột bàn giao SX (ưu tiên id client gửi, fallback theo workflow / resolver). */
async function resolveSxHandoverStageId(project, preferredStageId) {
  let sxHandoverPipelineStageId = preferredStageId ? String(preferredStageId) : null;
  try {
    if (sxHandoverPipelineStageId) {
      const { data: colVerify } = await supabase
        .from('production_pipeline_stages')
        .select('id')
        .eq('id', sxHandoverPipelineStageId)
        .maybeSingle();
      if (!colVerify?.id) sxHandoverPipelineStageId = null;
    }
    if (!sxHandoverPipelineStageId && project?.current_stage_id) {
      const { data: sxPipeRow } = await supabase
        .from('production_pipeline_stages')
        .select('id')
        .eq('workflow_stage_id', project.current_stage_id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      sxHandoverPipelineStageId = sxPipeRow?.id || null;
    }
    if (!sxHandoverPipelineStageId) {
      const { data: projMeta } = await supabase
        .from('projects')
        .select('company_id, workshop_type_id')
        .eq('id', project.id)
        .maybeSingle();
      const { stages: sxStages } = await getResolvedKanbanStages(projMeta?.company_id || null, {
        workshopTypeId: projMeta?.workshop_type_id || null,
      });
      const resolvedHo = resolveSxHandoverColumnId(sxStages, projMeta || {}, null);
      if (resolvedHo) sxHandoverPipelineStageId = String(resolvedHo);
    }
  } catch (_e) { /* ignore */ }
  return sxHandoverPipelineStageId;
}

/**
 * Thực hiện bàn giao dự án sang VC/LĐ.
 * @returns {Promise<{ handed_over: boolean, already_in_logistics?: boolean,
 *   vc_kanban_column_id: string|null, sx_pipeline_stage_id: string|null,
 *   logistics_person_id: string|null, installer_person_id: string|null }>}
 */
async function performVcHandoverCore(req, {
  projectId,
  logisticsCompanyId,
  sxHandoverPipelineStageId: preferredSxStageId = null,
  actorUserId,
  deliveryTeamId = null,
  installationTeamId = null,
}) {
  const { data: project } = await supabase
    .from('projects')
    .select('id, code, name, status, current_stage_id, company_id, vc_kanban_column_id, logistics_company_id')
    .eq('id', projectId)
    .maybeSingle();
  if (!project) throw new Error('Project not found');

  const sxHandoverPipelineStageId = await resolveSxHandoverStageId(project, preferredSxStageId);

  // Đã trong luồng VC đúng công ty đã chọn → chỉ cập nhật cột SX (không bàn giao lại).
  // Nếu thiếu logistics_company / cột VC, hoặc Sale chọn công ty khác → chạy lại bàn giao.
  if (isProjectAlreadyInLogistics(project)) {
    const sameCompany = project.logistics_company_id
      && String(project.logistics_company_id) === String(logisticsCompanyId);
    const hasVcCol = Boolean(project.vc_kanban_column_id);
    if (sameCompany && hasVcCol) {
      if (sxHandoverPipelineStageId) {
        await supabase.from('projects').update({ sx_kanban_column_id: sxHandoverPipelineStageId }).eq('id', projectId);
        await supabase.from('crm_leads')
          .update({ sx_pipeline_stage_id: sxHandoverPipelineStageId, updated_at: new Date().toISOString() })
          .eq('project_id', projectId).eq('type', 'deal');
      }
      // Vẫn đẩy realtime để board VC refresh (tránh user nghĩ chưa tạo).
      try {
        const io = req?.app?.get?.('io');
        if (io) {
          const { emitLogisticsKanbanChangedImmediate } = require('./workshopIntakeNotify');
          emitLogisticsKanbanChangedImmediate(io, {
            projectId,
            reason: 'vc_handover_reassert',
            companyId: project.company_id || null,
            logisticsCompanyId,
            vcKanbanColumnId: project.vc_kanban_column_id || null,
            project: {
              id: projectId,
              status: project.status || 'shipping',
              company_id: project.company_id || null,
              logistics_company_id: logisticsCompanyId,
              vc_kanban_column_id: project.vc_kanban_column_id || null,
            },
          });
        }
      } catch (_) { /* ignore */ }
      return {
        handed_over: false,
        already_in_logistics: true,
        vc_kanban_column_id: project.vc_kanban_column_id || null,
        sx_pipeline_stage_id: sxHandoverPipelineStageId,
        logistics_person_id: null,
        installer_person_id: null,
      };
    }
  }

  const vcStageId = await resolveVcIntakeStageId(logisticsCompanyId);

  const { data: projPersons } = await supabase
    .from('projects')
    .select('logistics_person_id, installer_person_id, production_person_id')
    .eq('id', projectId)
    .maybeSingle();

  let resolvedLogisticsPersonId = projPersons?.logistics_person_id || null;
  let resolvedInstallerPersonId = projPersons?.installer_person_id || null;
  if (!resolvedLogisticsPersonId) {
    resolvedLogisticsPersonId = await resolveLogisticsHandoverResponsibleUserId(logisticsCompanyId);
  }
  if (!resolvedInstallerPersonId) {
    resolvedInstallerPersonId = await resolveLogisticsHandoverInstallerUserId(logisticsCompanyId);
  }

  const projectUpdate = {
    status: 'shipping',
    current_stage_id: null,
    logistics_company_id: logisticsCompanyId,
    updated_at: new Date().toISOString(),
  };
  if (resolvedLogisticsPersonId) projectUpdate.logistics_person_id = resolvedLogisticsPersonId;
  if (resolvedInstallerPersonId) projectUpdate.installer_person_id = resolvedInstallerPersonId;
  if (deliveryTeamId) projectUpdate.delivery_team_id = deliveryTeamId;
  if (installationTeamId) projectUpdate.installation_team_id = installationTeamId;
  if (vcStageId) projectUpdate.vc_kanban_column_id = vcStageId;
  if (sxHandoverPipelineStageId) projectUpdate.sx_kanban_column_id = sxHandoverPipelineStageId;

  const { error: updateError } = await supabase.from('projects').update(projectUpdate).eq('id', projectId);
  if (updateError) throw updateError;

  try {
    await ensureLeadDocumentsIncludeShareModules(projectId, ['logistics']);
  } catch (mdErr) { console.warn('[vcHandoverCore] expand doc modules:', mdErr.message); }

  try {
    await applyAllActiveWorkshopTemplatesForArea(projectId, actorUserId, {
      workshopArea: 'logistics',
      companyId: logisticsCompanyId,
      logisticsStageId: vcStageId || null,
    });
  } catch (tplErr) { console.warn('[vcHandoverCore] gen logistics templates:', tplErr.message); }

  try {
    await ensureDealLeadDocumentsForProjectId(projectId);
  } catch (ensErr) { console.warn('[vcHandoverCore] ensure deal lead_documents:', ensErr.message); }

  try {
    await supabase.from('stage_transitions').insert({
      project_id: projectId,
      from_stage_id: project.current_stage_id,
      to_stage_id: null,
      notes: 'Bàn giao sang module Vận chuyển (qua bình luận VC/LĐ)',
      transitioned_by: actorUserId,
    });
  } catch (te) { console.warn('[vcHandoverCore] stage_transitions:', te.message); }

  // Đồng bộ CRM deal → cột đã gắn sync_role=vc_delivery (VD «Vận chuyển/lắp đặt»).
  try {
    const nowIso = new Date().toISOString();
    const { data: leads } = await supabase
      .from('crm_leads')
      .select('id, pipeline_id')
      .eq('project_id', projectId)
      .eq('type', 'deal');
    for (const lead of leads || []) {
      const vcDeliveryStageId = await getCrmStageByRole('vc_delivery', lead.pipeline_id || null)
        || await getCrmVcDeliveryStageId();
      const fullUpd = { updated_at: nowIso };
      if (vcStageId) fullUpd.vc_pipeline_stage_id = vcStageId;
      if (sxHandoverPipelineStageId) fullUpd.sx_pipeline_stage_id = sxHandoverPipelineStageId;
      if (vcDeliveryStageId) {
        fullUpd.stage_id = vcDeliveryStageId;
        fullUpd.stage_entered_at = nowIso;
      }
      const { error: leadErr } = await supabase.from('crm_leads').update(fullUpd).eq('id', lead.id);
      if (leadErr) {
        const isColErr = leadErr.message?.includes('vc_pipeline_stage_id') || leadErr.message?.includes('sx_pipeline_stage_id');
        if (isColErr && vcDeliveryStageId) {
          await supabase.from('crm_leads').update({
            stage_id: vcDeliveryStageId,
            stage_entered_at: nowIso,
            updated_at: nowIso,
          }).eq('id', lead.id);
        } else {
          console.warn('[vcHandoverCore] CRM update lead', lead.id, ':', leadErr.message);
        }
      } else if (vcDeliveryStageId) {
        console.log(`[vcHandoverCore] CRM deal ${lead.id} → sync_role=vc_delivery (${vcDeliveryStageId})`);
      } else {
        console.warn(`[vcHandoverCore] CRM deal ${lead.id}: chưa cấu hình cột sync_role=vc_delivery trên pipeline`);
      }
    }
  } catch (crmErr) { console.warn('[vcHandoverCore] sync CRM:', crmErr.message); }

  try {
    await notifyVcHandoverFromSx(req, {
      projectId,
      projectCode: project.code,
      projectName: project.name,
      logisticsCompanyId,
      actorUserId,
      manual: true,
    });
  } catch (notifErr) { console.warn('[vcHandoverCore] notify VC:', notifErr.message); }

  try {
    const { data: actor } = await supabase.from('users').select('full_name').eq('id', actorUserId).maybeSingle();
    await logDealActivityComment(req, {
      projectId,
      body: `🚚 ${actor?.full_name || 'Người dùng'} đã bàn giao dự án sang module Vận chuyển.`,
    });
  } catch (_) { /* ignore */ }

  try {
    const io = req?.app?.get?.('io');
    if (io) {
      const { emitLogisticsKanbanChangedImmediate } = require('./workshopIntakeNotify');
      emitLogisticsKanbanChangedImmediate(io, {
        projectId,
        reason: 'vc_handover',
        companyId: project.company_id || null,
        logisticsCompanyId,
        vcKanbanColumnId: vcStageId || null,
        project: {
          id: projectId,
          code: project.code,
          name: project.name,
          status: 'shipping',
          company_id: project.company_id || null,
          logistics_company_id: logisticsCompanyId,
          vc_kanban_column_id: vcStageId || null,
          sx_kanban_column_id: sxHandoverPipelineStageId || null,
        },
      });
    }
  } catch (emitErr) {
    console.warn('[vcHandoverCore] emit logistics board:', emitErr.message);
  }

  return {
    handed_over: true,
    vc_kanban_column_id: vcStageId,
    sx_pipeline_stage_id: sxHandoverPipelineStageId,
    logistics_person_id: resolvedLogisticsPersonId,
    installer_person_id: resolvedInstallerPersonId,
  };
}

module.exports = {
  performVcHandoverCore,
  resolveVcIntakeStageId,
  resolveSxHandoverStageId,
};
