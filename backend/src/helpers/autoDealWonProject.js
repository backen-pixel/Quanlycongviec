const { supabase } = require('../config/supabase');
const { generateStepTasks } = require('./generateFlowTasks');
const { notifyMultiple } = require('./notifications');
const { syncCrmLeadSxPipelineFromProject } = require('./workshopKanban');
const { applyDefaultWorkshopTemplatesForNewProject } = require('./workshopApplyTemplates');
const { isPostgresUniqueViolation, nextTbProjectCode } = require('./projectCode');
const { validateProductionCompanyId } = require('./productionCompanyGate');
const { ensureDealLeadDocumentsForModuleTransition } = require('./ensureDealLeadDocumentsForModuleTransition');
const { applyProductionTemplateToFulfillmentLead } = require('./projectOrderFulfillment');
const { postSxTransferMentionComment } = require('./dealCommentNotifications');

/**
 * Tạo dự án xưởng từ deal thắng (luồng tự động — dùng chung cho POST auto-create và PATCH stage).
 * @returns {Promise<{ ok: true, project_id, project_code, project_name, tasks_created } | { ok: false, error: string, statusCode?: number, existing_project_id?: string }>}
 */
async function autoCreateProjectFromWonDeal({ req, dealId, userId, productionCompanyId, workshopTypeId = null }) {
  try {
    return await runAutoCreateProjectFromWonDeal({ req, dealId, userId, productionCompanyId, workshopTypeId });
  } catch (e) {
    console.error('[auto-project] Error:', e.message);
    return { ok: false, error: e.message || 'Lỗi tạo dự án', statusCode: 500 };
  }
}

async function runAutoCreateProjectFromWonDeal({ req, dealId, userId, productionCompanyId, workshopTypeId = null }) {
  const coCheck = await validateProductionCompanyId(productionCompanyId);
  if (!coCheck.ok) {
    return { ok: false, error: coCheck.error, statusCode: 400 };
  }

  /**
   * Validate phân loại (workshop_project_types) — phải thuộc đúng công ty SX & áp dụng cho 'production'.
   * Nếu workshopTypeId không hợp lệ → bỏ qua (KHÔNG fail toàn bộ flow), chỉ log cảnh báo.
   */
  let validatedWorkshopTypeId = null;
  if (workshopTypeId) {
    try {
      const { data: wt } = await supabase
        .from('workshop_project_types')
        .select('id, company_id, applies_to, is_active')
        .eq('id', workshopTypeId)
        .maybeSingle();
      if (
        wt
        && String(wt.company_id) === String(coCheck.company.id)
        && (wt.applies_to === 'production' || wt.applies_to === 'both')
        && wt.is_active !== false
      ) {
        validatedWorkshopTypeId = wt.id;
      } else {
        console.warn('[auto-project] workshop_type_id không hợp lệ — bỏ qua, project sẽ chưa phân loại');
      }
    } catch (e) {
      console.warn('[auto-project] workshop_type lookup:', e.message);
    }
  }

  const { data: deal } = await supabase.from('crm_leads')
    .select('*, customer:customers(id, full_name, phone, email, address)')
    .eq('id', dealId).single();
  if (!deal) return { ok: false, error: 'Deal không tồn tại', statusCode: 404 };
  if (deal.project_id) {
    return { ok: false, error: 'Deal đã có dự án', statusCode: 400, existing_project_id: deal.project_id };
  }

  let config = null;
  try {
    const { data: cfg } = await supabase.from('auto_project_config').select('*').limit(1).single();
    config = cfg;
  } catch (_) {}

  let flowId = config?.flow_id || null;
  if (!flowId) {
    const { data: defaultFlow } = await supabase.from('workflow_flows')
      .select('id').eq('is_default', true).eq('is_active', true).limit(1).single();
    flowId = defaultFlow?.id || null;
  }
  if (!flowId) {
    const { data: anyFlow } = await supabase.from('workflow_flows')
      .select('id').eq('is_active', true).order('created_at').limit(1).single();
    flowId = anyFlow?.id || null;
  }
  if (!flowId) {
    return { ok: false, error: 'Chưa có luồng quy trình nào. Vui lòng tạo luồng trước.', statusCode: 400 };
  }

  const { data: firstStage } = await supabase.from('workflow_stages')
    .select('id').eq('slug', 'consulting').single();

  const yr = new Date().getFullYear();
  const baseRow = (code) => ({
    code,
    name: deal.title || 'Dự án mới',
    description: deal.description || null,
    customer_id: deal.customer_id,
    company_id: coCheck.company.id,
    flow_id: flowId,
    status: 'consulting',
    // null → Kanban xưởng gán deal thắng vào cột «Chờ vào xưởng» (won_pending), không nhảy workflow Tư vấn
    current_stage_id: null,
    install_address: deal.install_address || deal.customer?.address || null,
    estimated_value: deal.estimated_value || null,
    production_value: deal.estimated_value || null,
    deposit_amount: Number(deal.deposit_amount) > 0 ? Number(deal.deposit_amount) : null,
    priority: config?.default_priority || 'medium',
    sales_person_id: deal.assigned_to || deal.lead_owner_id || userId,
    consult_date: new Date().toISOString(),
    ...(validatedWorkshopTypeId ? { workshop_type_id: validatedWorkshopTypeId } : {}),
  });

  let project;
  let lastInsertErr;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const code = await nextTbProjectCode(supabase, yr);
    const { data, error: projErr } = await supabase
      .from('projects')
      .insert(baseRow(code))
      .select('*')
      .single();
    if (!projErr) {
      project = data;
      break;
    }
    lastInsertErr = projErr;
    if (isPostgresUniqueViolation(projErr)) continue;
    throw projErr;
  }
  if (!project) throw lastInsertErr || new Error('Không tạo dự án: trùng mã code');

  const projectId = project.id;

  try {
    const { data: hop } = await supabase
      .from('production_handover_settings')
      .select('default_production_team_id')
      .eq('production_company_id', coCheck.company.id)
      .maybeSingle();
    if (hop?.default_production_team_id) {
      await supabase.from('projects').update({
        production_workshop_team_id: hop.default_production_team_id,
        updated_at: new Date().toISOString(),
      }).eq('id', projectId);
    }
  } catch (he) {
    console.warn('[auto-project] production_handover team:', he.message);
  }

  const { data: flowSteps } = await supabase.from('workflow_flow_steps')
    .select('id, order_index, division_unit_id, company_unit_id, template_set_id')
    .eq('flow_id', flowId).order('order_index');

  let allCreatedTasks = [];

  const kdStep = (flowSteps || []).find((s) => s.order_index === 0);
  if (kdStep) {
    if (kdStep.division_unit_id) {
      await supabase.from('project_company_assignments').upsert({
        project_id: projectId,
        division_unit_id: kdStep.division_unit_id,
        company_unit_id: kdStep.company_unit_id,
        template_set_id: kdStep.template_set_id,
        order_index: 0, status: 'done',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      }, { onConflict: 'project_id,division_unit_id' });
    }

    try {
      const { data: crmTasks } = await supabase.from('crm_tasks')
        .select('*').eq('lead_id', dealId).order('order_index');
      if (crmTasks?.length) {
        const completedAt = new Date().toISOString();
        const rows = crmTasks.map((ct, i) => ({
          project_id: projectId, stage_id: firstStage?.id || null,
          title: ct.title,
          description:
            [ct.description, ct.notes].filter((x) => x && String(x).trim()).join('\n\n') || null,
          assignee_id: ct.assignee_id || null, priority: ct.priority || 'medium',
          status: 'done', completed_at: completedAt,
          order_index: i, created_by_id: userId, task_type: 'project',
          metadata: { crm_task_id: ct.id, imported_from: 'crm_deal', deal_id: dealId },
        }));
        const { data: inserted } = await supabase.from('tasks').insert(rows).select('*');
        if (inserted?.length) allCreatedTasks.push(...inserted);
      }
    } catch (e) { console.error('[auto-project] Import CRM tasks:', e.message); }
  }

  const generatedBySteps = await Promise.all(
    (flowSteps || [])
      .filter((s) => s.order_index > 0)
      .map(async (step) => {
        if (step.division_unit_id) {
          await supabase.from('project_company_assignments').upsert({
            project_id: projectId,
            division_unit_id: step.division_unit_id,
            company_unit_id: step.company_unit_id,
            template_set_id: step.template_set_id,
            order_index: step.order_index,
            status: step.order_index === 1 ? 'in_progress' : 'pending',
            started_at: step.order_index === 1 ? new Date().toISOString() : null,
          }, { onConflict: 'project_id,division_unit_id' });
        }

        const stepTasks = await generateStepTasks({
          projectId, flowStepId: step.id,
          templateSetId: step.template_set_id || null,
          userId,
        });
        return stepTasks || [];
      }),
  );
  allCreatedTasks.push(...generatedBySteps.flat());

  {
    const { error: upErr } = await supabase
      .from('crm_leads')
      .update({ project_id: projectId, updated_at: new Date().toISOString() })
      .eq('id', dealId);
    if (upErr) {
      // Không thể liên kết deal ↔ project => ProductionDetail sẽ không thấy crmDeals.
      // Fail fast để phía caller báo lỗi rõ ràng.
      throw new Error(`[auto-project] Không cập nhật được project_id lên deal: ${upErr.message || 'unknown error'}`);
    }
  }

  try {
    await ensureDealLeadDocumentsForModuleTransition({ leadId: dealId, projectId });
  } catch (e) {
    console.warn('[auto-project] ensure lead_documents:', e.message);
  }

  try {
    const { syncExistingCrmOrdersToProject } = require('./projectOrderFulfillment');
    await syncExistingCrmOrdersToProject({
      projectId,
      userId,
      parentLeadId: dealId,
    });
  } catch (e) {
    console.warn('[auto-project] sync existing CRM orders:', e.message);
  }

  // Auto gen nhiệm vụ SX (sx_*) trên chính deal khi mới vào xưởng (không phụ thuộc Đơn 1).
  // Dùng strict company match theo công ty SX đã chọn.
  try {
    await applyProductionTemplateToFulfillmentLead({
      req,
      leadId: dealId,
      createdBy: userId,
      assigneeId: null,
      force: true,
      requireTemplateCompanyMatch: true,
      templateSourceCompanyId: coCheck.company.id,
    });
  } catch (e) {
    console.warn('[auto-project] applyProductionTemplateToFulfillmentLead:', e.message);
  }

  // Giữ status/current_stage ở KD (consulting): Kanban xưởng gán deal thắng vào cột bucket won_pending
  // ("Chờ vào xưởng") thay vì nhảy thẳng cột Sản xuất.

  try {
    await syncCrmLeadSxPipelineFromProject(projectId);
  } catch (e) {
    console.warn('[auto-project] sync sx_pipeline_stage_id:', e.message);
  }

  let workshopTemplateTaskCount = 0;
  try {
    workshopTemplateTaskCount = await applyDefaultWorkshopTemplatesForNewProject(projectId, userId);
    if (workshopTemplateTaskCount) {
      console.log(`[auto-project] Workshop default templates → ${workshopTemplateTaskCount} tasks`);
    }
  } catch (e) {
    console.warn('[auto-project] workshop default templates:', e.message);
  }

  try {
    const { data: dealDocs } = await supabase.from('lead_documents')
      .select('*').eq('lead_id', dealId);
    if (dealDocs?.length) {
      const docFiles = dealDocs.filter((d) => d.file_url).map((d) => ({
        file_url: d.file_url, file_name: d.file_name || d.name,
        file_size: d.file_size, mime_type: d.mime_type,
        description: `Từ Deal: ${d.name || d.file_name}`,
      }));
      if (docFiles.length) {
        await supabase.from('projects').update({ quotation_files: docFiles }).eq('id', projectId);
      }
    }
  } catch (e) { console.error('[auto-project] Copy docs:', e.message); }

  try {
    const totalTasks = allCreatedTasks.length + workshopTemplateTaskCount;
    await supabase.from('crm_activities').insert({
      lead_id: dealId, type: 'note',
      title: '📋 Dự án tự động tạo',
      description: `Dự án ${project.code} đã được tạo tự động với ${totalTasks} nhiệm vụ${workshopTemplateTaskCount ? ` (gồm ${workshopTemplateTaskCount} từ bộ mẫu xưởng)` : ''}`,
      created_by: userId,
    });
  } catch (_) {}

  try {
    const { data: adminUsers } = await supabase.from('users').select('id').eq('role', 'admin');
    const adminIds = (adminUsers || []).map((u) => u.id).filter((id) => id !== userId);
    if (adminIds.length) {
      await notifyMultiple(req, adminIds, 'project_created',
        '📋 Dự án mới từ Deal',
        `Dự án ${project.code} — "${deal.title}" (${allCreatedTasks.length + workshopTemplateTaskCount} nhiệm vụ)`,
        'project', projectId, {
          ecosystem_module_key: 'production',
          project_id: String(projectId),
          project_code: project.code,
          project_name: project.name,
        });
    }
  } catch (_) {}

  // Gán toàn bộ NV mặc định theo phân loại + phụ trách chính (cuối luồng, tránh bị ghi đè)
  let primaryStaffId = null;
  try {
    const {
      applyWorkshopTypeDefaultStaffToProject,
      loadProjectProductionStaffUserIds,
    } = require('./productionWorkshopTypeStaff');
    primaryStaffId = await applyWorkshopTypeDefaultStaffToProject(
      projectId,
      coCheck.company.id,
      validatedWorkshopTypeId,
    );
    const staffIds = await loadProjectProductionStaffUserIds(projectId);
    const notifyStaff = staffIds.length ? staffIds : (primaryStaffId ? [primaryStaffId] : []);
    for (const sid of notifyStaff) {
      if (String(sid) === String(userId)) continue;
      try {
        await notifyMultiple(req, [sid], 'project_assigned',
          '📋 Dự án SX mới',
          `Bạn được gán vào dự án ${project.code} — "${deal.title}"`,
          'project', projectId, {
            ecosystem_module_key: 'production',
            project_id: String(projectId),
            project_code: project.code,
            project_name: project.name,
          });
      } catch (_) {}
    }

    if (notifyStaff.length) {
      try {
        await postSxTransferMentionComment(req, notifyMultiple, {
          dealId,
          projectId,
          senderId: userId,
          mentionUserIds: notifyStaff,
          projectCode: project.code,
          dealTitle: deal.title,
          workshopLabel: coCheck.company.short_name || coCheck.company.name || '',
          mode: 'transfer',
        });
      } catch (mentionErr) {
        console.warn('[auto-project] sx transfer mention comment:', mentionErr.message);
      }
    }
  } catch (staffErr) {
    console.warn('[auto-project] production default staff:', staffErr.message);
  }

  // NOTE: Không tự tạo Đơn 1/2/... từ deal thắng. Đơn hàng chỉ tạo thủ công tại tab Đơn hàng.

  try {
    const { notifyWorkshopIntakeNewDeal, emitProductionBoardRealtime } = require('./workshopIntakeNotify');
    await notifyWorkshopIntakeNewDeal({
      req,
      projectId,
      projectCode: project.code,
      projectName: project.name,
      dealTitle: deal.title,
      actorUserId: userId,
    });
    const io = req.app?.get('io');
    await emitProductionBoardRealtime(projectId, io, 'auto_create');
  } catch (intakeNotifyErr) {
    console.warn('[auto-project] intake notify/socket:', intakeNotifyErr.message);
  }

  console.log(`[auto-project] Deal ${dealId} → Project ${project.code} (${allCreatedTasks.length + workshopTemplateTaskCount} tasks)`);

  return {
    ok: true,
    project_id: projectId,
    project_code: project.code,
    project_name: project.name,
    tasks_created: allCreatedTasks.length + workshopTemplateTaskCount,
  };
}

module.exports = { autoCreateProjectFromWonDeal };
