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
 * Chuẩn hóa + dedupe targets: [{ production_company_id, workshop_type_id }]
 */
function normalizeProductionTargets(targets, legacyCompanyId, legacyWorkshopTypeId) {
  const raw = Array.isArray(targets) && targets.length
    ? targets
    : (legacyCompanyId ? [{ production_company_id: legacyCompanyId, workshop_type_id: legacyWorkshopTypeId || null }] : []);
  const seen = new Set();
  const out = [];
  for (const t of raw) {
    const cid = t?.production_company_id || t?.company_id || null;
    if (!cid) continue;
    const wtid = t?.workshop_type_id || null;
    const key = `${String(cid)}::${wtid ? String(wtid) : ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ production_company_id: String(cid), workshop_type_id: wtid ? String(wtid) : null });
  }
  return out;
}

async function linkDealToProject({
  dealId,
  projectId,
  isPrimary = false,
  label = null,
  createdBy = null,
}) {
  const row = {
    deal_id: dealId,
    project_id: projectId,
    is_primary: !!isPrimary,
    label: label || null,
    created_by: createdBy || null,
  };
  const { error } = await supabase
    .from('crm_deal_projects')
    .upsert(row, { onConflict: 'deal_id,project_id' });
  if (error) {
    console.warn('[crm_deal_projects] upsert:', error.message);
  }
}

/**
 * Danh sách dự án SX gắn deal (junction + fallback project_id).
 */
async function listDealProductionProjects(dealId) {
  if (!dealId) return [];
  const { data: links, error } = await supabase
    .from('crm_deal_projects')
    .select(`
      id, deal_id, project_id, is_primary, label, created_at,
      project:projects!crm_deal_projects_project_id_fkey(
        id, code, name, status, company_id, workshop_type_id,
        company:companies!projects_company_id_fkey(id, name, short_name),
        workshop_type:workshop_project_types!projects_workshop_type_id_fkey(id, name)
      )
    `)
    .eq('deal_id', dealId)
    .order('created_at', { ascending: true });

  if (!error && links?.length) {
    return links.map((l) => {
      const p = l.project || {};
      const co = p.company || {};
      const wt = p.workshop_type || {};
      return {
        link_id: l.id,
        project_id: l.project_id || p.id,
        code: p.code || null,
        name: p.name || null,
        status: p.status || null,
        company_id: p.company_id || co.id || null,
        company_name: co.short_name || co.name || null,
        workshop_type_id: p.workshop_type_id || wt.id || null,
        workshop_type_name: wt.name || null,
        is_primary: !!l.is_primary,
        label: l.label || null,
        created_at: l.created_at || null,
      };
    }).filter((x) => x.project_id);
  }

  const { data: lead } = await supabase
    .from('crm_leads')
    .select(`
      project_id,
      project:projects!crm_leads_project_id_fkey(
        id, code, name, status, company_id, workshop_type_id,
        company:companies!projects_company_id_fkey(id, name, short_name),
        workshop_type:workshop_project_types!projects_workshop_type_id_fkey(id, name)
      )
    `)
    .eq('id', dealId)
    .maybeSingle();
  if (!lead?.project_id) return [];
  const p = lead.project || {};
  const co = p.company || {};
  const wt = p.workshop_type || {};
  return [{
    link_id: null,
    project_id: lead.project_id,
    code: p.code || null,
    name: p.name || null,
    status: p.status || null,
    company_id: p.company_id || co.id || null,
    company_name: co.short_name || co.name || null,
    workshop_type_id: p.workshop_type_id || wt.id || null,
    workshop_type_name: wt.name || null,
    is_primary: true,
    label: null,
    created_at: null,
  }];
}

/**
 * Gắn production_projects (lite) lên danh sách lead/deal — batch theo deal ids.
 */
async function attachProductionProjectsForList(rows) {
  if (!Array.isArray(rows) || !rows.length) return rows;
  const dealIds = [...new Set(rows.map((r) => r?.id).filter(Boolean).map(String))];
  if (!dealIds.length) return rows;
  const byDeal = new Map();
  try {
    for (let i = 0; i < dealIds.length; i += 200) {
      const chunk = dealIds.slice(i, i + 200);
      const { data: links, error } = await supabase
        .from('crm_deal_projects')
        .select(`
          deal_id, project_id, is_primary, label,
          project:projects!crm_deal_projects_project_id_fkey(
            id, code, name, status, company_id, workshop_type_id,
            company:companies!projects_company_id_fkey(id, name, short_name),
            workshop_type:workshop_project_types!projects_workshop_type_id_fkey(id, name)
          )
        `)
        .in('deal_id', chunk);
      if (error) {
        console.warn('[attachProductionProjectsForList]', error.message);
        break;
      }
      for (const l of links || []) {
        const did = String(l.deal_id);
        const p = l.project || {};
        const co = p.company || {};
        const wt = p.workshop_type || {};
        const item = {
          project_id: l.project_id || p.id,
          code: p.code || null,
          name: p.name || null,
          status: p.status || null,
          company_id: p.company_id || co.id || null,
          company_name: co.short_name || co.name || null,
          workshop_type_id: p.workshop_type_id || wt.id || null,
          workshop_type_name: wt.name || null,
          is_primary: !!l.is_primary,
          label: l.label || null,
        };
        if (!byDeal.has(did)) byDeal.set(did, []);
        byDeal.get(did).push(item);
      }
    }
  } catch (e) {
    console.warn('[attachProductionProjectsForList]', e.message);
  }

  return rows.map((r) => {
    const id = String(r.id);
    let pps = byDeal.get(id);
    if (!pps?.length && r.project_id) {
      pps = [{
        project_id: r.project_id,
        code: r.linked_project?.code || null,
        name: r.linked_project?.name || null,
        is_primary: true,
        company_id: null,
        company_name: null,
      }];
    }
    return {
      ...r,
      production_projects: pps || [],
      production_project_count: (pps || []).length || (r.project_id ? 1 : 0),
    };
  });
}

/**
 * Tạo một hoặc nhiều dự án xưởng từ deal.
 */
async function autoCreateProjectFromWonDeal({
  req,
  dealId,
  userId,
  productionCompanyId,
  workshopTypeId = null,
  targets = null,
  mode = 'create',
}) {
  try {
    const normalized = normalizeProductionTargets(targets, productionCompanyId, workshopTypeId);
    if (!normalized.length) {
      return { ok: false, error: 'Vui lòng chọn công ty Sản xuất', statusCode: 400 };
    }
    if (normalized.length === 1 && mode !== 'additional') {
      return await runAutoCreateProjectFromWonDeal({
        req,
        dealId,
        userId,
        productionCompanyId: normalized[0].production_company_id,
        workshopTypeId: normalized[0].workshop_type_id,
        mode: 'create',
        nameSuffix: null,
        isMultiBatch: false,
      });
    }

    const results = [];
    let primaryProjectId = null;
    for (let i = 0; i < normalized.length; i += 1) {
      const t = normalized[i];
      const isFirst = i === 0;
      const createMode = mode === 'additional'
        ? 'additional'
        : (isFirst ? 'create' : 'additional');
      const one = await runAutoCreateProjectFromWonDeal({
        req,
        dealId,
        userId,
        productionCompanyId: t.production_company_id,
        workshopTypeId: t.workshop_type_id,
        mode: createMode,
        nameSuffix: true,
        isMultiBatch: true,
        skipCrmTaskImport: createMode === 'additional',
        skipOrderSync: createMode === 'additional',
      });
      if (!one.ok) {
        if (results.length) {
          return {
            ok: false,
            error: one.error || 'Lỗi tạo dự án',
            statusCode: one.statusCode || 500,
            projects: results,
            primary_project_id: primaryProjectId,
            partial: true,
          };
        }
        return one;
      }
      results.push({
        project_id: one.project_id,
        project_code: one.project_code,
        project_name: one.project_name,
        tasks_created: one.tasks_created,
        is_primary: !!one.is_primary,
        company_id: t.production_company_id,
        workshop_type_id: t.workshop_type_id,
      });
      if (one.is_primary) primaryProjectId = one.project_id;
      else if (!primaryProjectId && isFirst && mode !== 'additional') {
        primaryProjectId = one.project_id;
      }
    }

    // Đảm bảo tab Thành viên nhận NV mặc định từ MỌI xưởng vừa chọn (primary + additional).
    try {
      const { ensureLeadMembersFromProjectStaff } = require('./productionWorkshopTypeStaff');
      await ensureLeadMembersFromProjectStaff(dealId);
    } catch (syncErr) {
      console.warn('[auto-project] sync members multi-target:', syncErr.message);
    }

    const first = results[0];
    return {
      ok: true,
      project_id: primaryProjectId || first?.project_id,
      project_code: first?.project_code,
      project_name: first?.project_name,
      tasks_created: results.reduce((s, r) => s + (r.tasks_created || 0), 0),
      projects: results,
      primary_project_id: primaryProjectId || first?.project_id,
    };
  } catch (e) {
    console.error('[auto-project] Error:', e.message);
    return { ok: false, error: e.message || 'Lỗi tạo dự án', statusCode: 500 };
  }
}

async function runAutoCreateProjectFromWonDeal({
  req,
  dealId,
  userId,
  productionCompanyId,
  workshopTypeId = null,
  mode = 'create',
  nameSuffix = null,
  isMultiBatch = false,
  skipCrmTaskImport = false,
  skipOrderSync = false,
}) {
  const coCheck = await validateProductionCompanyId(productionCompanyId);
  if (!coCheck.ok) {
    return { ok: false, error: coCheck.error, statusCode: 400 };
  }

  let validatedWorkshopTypeId = null;
  let workshopTypeName = null;
  if (workshopTypeId) {
    try {
      const { data: wt } = await supabase
        .from('workshop_project_types')
        .select('id, name, company_id, applies_to, is_active')
        .eq('id', workshopTypeId)
        .maybeSingle();
      if (
        wt
        && String(wt.company_id) === String(coCheck.company.id)
        && (wt.applies_to === 'production' || wt.applies_to === 'both')
        && wt.is_active !== false
      ) {
        validatedWorkshopTypeId = wt.id;
        workshopTypeName = wt.name || null;
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

  const isAdditional = mode === 'additional';
  if (isAdditional) {
    if (!deal.project_id) {
      return { ok: false, error: 'Deal chưa có dự án — hãy tạo dự án trước', statusCode: 400 };
    }
  } else if (deal.project_id) {
    return { ok: false, error: 'Deal đã có dự án', statusCode: 400, existing_project_id: deal.project_id };
  }

  try {
    const existing = await listDealProductionProjects(dealId);
    const dup = existing.find((p) =>
      String(p.company_id || '') === String(coCheck.company.id)
      && String(p.workshop_type_id || '') === String(validatedWorkshopTypeId || ''));
    if (dup) {
      return {
        ok: false,
        error: `Deal đã có dự án tại ${dup.company_name || 'công ty này'}${dup.workshop_type_name ? ` · ${dup.workshop_type_name}` : ''}`,
        statusCode: 400,
        existing_project_id: dup.project_id,
      };
    }
  } catch (e) {
    console.warn('[auto-project] dup check:', e.message);
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

  const suffixLabel = workshopTypeName
    || coCheck.company.short_name
    || coCheck.company.name
    || null;
  const useSuffix = nameSuffix === true || (isMultiBatch && suffixLabel);
  const projectName = useSuffix && suffixLabel
    ? `${deal.title || 'Dự án mới'} · ${suffixLabel}`
    : (deal.title || 'Dự án mới');

  const yr = new Date().getFullYear();
  const baseRow = (code) => ({
    code,
    name: projectName,
    description: deal.description || null,
    customer_id: deal.customer_id,
    company_id: coCheck.company.id,
    flow_id: flowId,
    status: 'consulting',
    current_stage_id: null,
    install_address: deal.install_address || deal.customer?.address || null,
    estimated_value: deal.estimated_value || null,
    production_value: null,
    deposit_amount: Number(deal.deposit_amount) > 0 ? Number(deal.deposit_amount) : null,
    created_from_sx: false,
    priority: config?.default_priority || 'medium',
    sales_person_id: deal.assigned_to || deal.lead_owner_id || userId,
    consult_date: new Date().toISOString(),
    ...(validatedWorkshopTypeId ? { workshop_type_id: validatedWorkshopTypeId } : {}),
  });

  let project;
  let lastInsertErr;
  let omitCreatedFromSx = false;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const code = await nextTbProjectCode(supabase, yr);
    const row = baseRow(code);
    if (omitCreatedFromSx) delete row.created_from_sx;
    const { data, error: projErr } = await supabase
      .from('projects')
      .insert(row)
      .select('*')
      .single();
    if (!projErr) {
      project = data;
      break;
    }
    lastInsertErr = projErr;
    if (String(projErr.message || '').includes('created_from_sx') && !omitCreatedFromSx) {
      omitCreatedFromSx = true;
      continue;
    }
    if (isPostgresUniqueViolation(projErr)) continue;
    throw projErr;
  }
  if (!project) throw lastInsertErr || new Error('Không tạo dự án: trùng mã code');

  const projectId = project.id;
  const becomePrimary = !isAdditional && !deal.project_id;

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

    if (!skipCrmTaskImport) {
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

  if (becomePrimary) {
    const { error: upErr } = await supabase
      .from('crm_leads')
      .update({ project_id: projectId, updated_at: new Date().toISOString() })
      .eq('id', dealId);
    if (upErr) {
      throw new Error(`[auto-project] Không cập nhật được project_id lên deal: ${upErr.message || 'unknown error'}`);
    }
  }

  await linkDealToProject({
    dealId,
    projectId,
    isPrimary: becomePrimary,
    label: suffixLabel,
    createdBy: userId,
  });

  try {
    await ensureDealLeadDocumentsForModuleTransition({ leadId: dealId, projectId });
  } catch (e) {
    console.warn('[auto-project] ensure lead_documents:', e.message);
  }

  if (!skipOrderSync) {
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
  }

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
      title: becomePrimary ? '📋 Dự án tự động tạo' : '📋 Thêm dự án SX',
      description: `Dự án ${project.code} (${suffixLabel || coCheck.company.name || 'SX'}) — ${totalTasks} nhiệm vụ${workshopTemplateTaskCount ? ` (gồm ${workshopTemplateTaskCount} từ bộ mẫu xưởng)` : ''}`,
      created_by: userId,
    });
  } catch (_) {}

  try {
    const { getCompanyScopedAdminIds } = require('./notifications');
    const adminIds = (await getCompanyScopedAdminIds(coCheck.company.id))
      .filter((id) => id !== userId);
    if (adminIds.length) {
      await notifyMultiple(req, adminIds, 'project_created',
        '📋 Dự án mới từ Deal',
        `Dự án ${project.code} — "${projectName}" (${allCreatedTasks.length + workshopTemplateTaskCount} nhiệm vụ)`,
        'project', projectId, {
          ecosystem_module_key: 'production',
          project_id: String(projectId),
          project_code: project.code,
          project_name: project.name,
        });
    }
  } catch (_) {}

  try {
    const {
      applyWorkshopTypeDefaultStaffToProject,
      loadProjectProductionStaffUserIds,
    } = require('./productionWorkshopTypeStaff');
    const primaryStaffId = await applyWorkshopTypeDefaultStaffToProject(
      projectId,
      coCheck.company.id,
      validatedWorkshopTypeId,
    );
    const staffIds = await loadProjectProductionStaffUserIds(projectId);
    const notifyStaff = staffIds.length ? staffIds : (primaryStaffId ? [primaryStaffId] : []);
    // Mode 'additional' (thêm công ty SX thứ 2+): mention thêm NV các xưởng đã gắn deal trước đó
    // trong bình luận để mọi công ty SX cùng biết deal có thêm xưởng mới.
    // Chỉ áp cho MENTION — không gửi 'project_assigned' cho NV không thuộc dự án mới.
    let mentionStaffIds = [...notifyStaff];
    if (!becomePrimary) {
      try {
        const { loadProjectIdsForDeal } = require('./productionWorkshopTypeStaff');
        const otherProjectIds = (await loadProjectIdsForDeal(dealId))
          .map(String)
          .filter((pid) => pid !== String(projectId));
        const merged = new Set(mentionStaffIds.map(String));
        for (const otherPid of otherProjectIds) {
          for (const uid of await loadProjectProductionStaffUserIds(otherPid)) {
            merged.add(String(uid));
          }
        }
        mentionStaffIds = [...merged];
      } catch (mergeErr) {
        console.warn('[auto-project] merge existing sx staff for additional:', mergeErr.message);
      }
    }
    for (const sid of notifyStaff) {
      if (String(sid) === String(userId)) continue;
      try {
        await notifyMultiple(req, [sid], 'project_assigned',
          '📋 Dự án SX mới',
          `Bạn được gán vào dự án ${project.code} — "${projectName}"`,
          'project', projectId, {
            ecosystem_module_key: 'production',
            project_id: String(projectId),
            project_code: project.code,
            project_name: project.name,
          });
      } catch (_) {}
    }

    if (mentionStaffIds.length) {
      try {
        await postSxTransferMentionComment(req, notifyMultiple, {
          dealId,
          projectId,
          senderId: userId,
          mentionUserIds: mentionStaffIds,
          projectCode: project.code,
          dealTitle: deal.title,
          workshopLabel: coCheck.company.short_name || coCheck.company.name || '',
          mode: becomePrimary ? 'transfer' : 'additional',
        });
      } catch (mentionErr) {
        console.warn('[auto-project] sx transfer mention comment:', mentionErr.message);
      }
    }
  } catch (staffErr) {
    console.warn('[auto-project] production default staff:', staffErr.message);
    if (becomePrimary) {
      try {
        const { pruneNonResponsibleCrmLeadMembersForDeal } = require('./productionWorkshopTypeStaff');
        await pruneNonResponsibleCrmLeadMembersForDeal(dealId);
      } catch (pruneErr) {
        console.warn('[auto-project] prune CRM members:', pruneErr.message);
      }
    }
  }

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
    await emitProductionBoardRealtime(projectId, io, becomePrimary ? 'auto_create' : 'auto_create_additional');
  } catch (intakeNotifyErr) {
    console.warn('[auto-project] intake notify/socket:', intakeNotifyErr.message);
  }

  // Additional đơn lẻ: gộp lại NV mọi xưởng đã gắn deal (tránh chỉ sync project_id chính).
  if (!becomePrimary || isMultiBatch) {
    try {
      const { ensureLeadMembersFromProjectStaff } = require('./productionWorkshopTypeStaff');
      await ensureLeadMembersFromProjectStaff(dealId);
    } catch (syncErr) {
      console.warn('[auto-project] ensure lead members:', syncErr.message);
    }
  }

  console.log(`[auto-project] Deal ${dealId} → Project ${project.code} (${allCreatedTasks.length + workshopTemplateTaskCount} tasks)${becomePrimary ? '' : ' [additional]'}`);

  return {
    ok: true,
    project_id: projectId,
    project_code: project.code,
    project_name: project.name,
    tasks_created: allCreatedTasks.length + workshopTemplateTaskCount,
    is_primary: becomePrimary,
  };
}

module.exports = {
  autoCreateProjectFromWonDeal,
  listDealProductionProjects,
  attachProductionProjectsForList,
  linkDealToProject,
  normalizeProductionTargets,
};
