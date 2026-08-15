/**
 * Helpers: apply task templates + CRM sync for custom app modules.
 */
const { supabase } = require('../config/supabase');
const { createNotification, getCompanyScopedRoleUserIds } = require('./notifications');

function addDays(date, days) {
  const d = new Date(date);
  const n = Number(days) || 0;
  if (n) d.setDate(d.getDate() + n);
  return d.toISOString();
}

/**
 * Apply default/active templates for a module onto a record.
 * If stageId provided, prefer templates matching that stage, else defaults / null-stage.
 */
async function applyAppModuleTemplatesToRecord({
  moduleId,
  recordId,
  stageId = null,
  userId = null,
}) {
  let q = supabase
    .from('app_module_task_templates')
    .select('id, stage_id, is_default, order_index, app_module_task_template_items(*)')
    .eq('module_id', moduleId)
    .eq('is_active', true)
    .order('order_index');
  const { data: templates, error } = await q;
  if (error) throw error;
  if (!templates?.length) return [];

  const stageKey = stageId ? String(stageId) : null;
  let picked = templates.filter((t) => stageKey && t.stage_id && String(t.stage_id) === stageKey);
  if (!picked.length) {
    picked = templates.filter((t) => t.is_default || !t.stage_id);
  }
  if (!picked.length) picked = templates;

  const now = new Date();
  const rows = [];
  let order = 0;

  const { data: existing } = await supabase
    .from('app_module_tasks')
    .select('template_item_id, title')
    .eq('record_id', recordId);
  const existingItemIds = new Set(
    (existing || []).map((t) => t.template_item_id).filter(Boolean).map(String),
  );
  const existingTitles = new Set(
    (existing || []).map((t) => String(t.title || '').trim().toLowerCase()).filter(Boolean),
  );

  for (const tpl of picked) {
    const items = (tpl.app_module_task_template_items || [])
      .slice()
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    for (const item of items) {
      if (item.id && existingItemIds.has(String(item.id))) continue;
      const titleKey = String(item.title || '').trim().toLowerCase();
      if (titleKey && existingTitles.has(titleKey)) continue;
      rows.push({
        record_id: recordId,
        module_id: moduleId,
        title: item.title,
        description: item.description || null,
        status: 'todo',
        priority: item.priority || 'medium',
        deadline: item.deadline_days != null ? addDays(now, item.deadline_days) : null,
        checklist: item.checklist || [],
        order_index: order++,
        template_item_id: item.id,
        created_by: userId || null,
      });
    }
  }
  if (!rows.length) return [];
  const { data, error: insErr } = await supabase.from('app_module_tasks').insert(rows).select();
  if (insErr) throw insErr;
  return data || [];
}

async function applyAppModuleTemplateById({
  moduleId,
  recordId,
  templateId,
  userId = null,
}) {
  const { data: tpl, error } = await supabase
    .from('app_module_task_templates')
    .select('id, stage_id, app_module_task_template_items(*)')
    .eq('module_id', moduleId)
    .eq('id', templateId)
    .maybeSingle();
  if (error) throw error;
  if (!tpl) {
    const err = new Error('Không tìm thấy mẫu');
    err.status = 404;
    throw err;
  }

  const { data: existing } = await supabase
    .from('app_module_tasks')
    .select('template_item_id, title')
    .eq('record_id', recordId);
  const existingItemIds = new Set(
    (existing || []).map((t) => t.template_item_id).filter(Boolean).map(String),
  );
  const existingTitles = new Set(
    (existing || []).map((t) => String(t.title || '').trim().toLowerCase()).filter(Boolean),
  );

  const now = new Date();
  const { data: maxOrd } = await supabase
    .from('app_module_tasks')
    .select('order_index')
    .eq('record_id', recordId)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle();
  let order = Number(maxOrd?.order_index) || 0;
  const rows = [];
  const items = (tpl.app_module_task_template_items || [])
    .slice()
    .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  for (const item of items) {
    if (item.id && existingItemIds.has(String(item.id))) continue;
    const titleKey = String(item.title || '').trim().toLowerCase();
    if (titleKey && existingTitles.has(titleKey)) continue;
    order += 1;
    rows.push({
      record_id: recordId,
      module_id: moduleId,
      title: item.title,
      description: item.description || null,
      status: 'todo',
      priority: item.priority || 'medium',
      deadline: item.deadline_days != null ? addDays(now, item.deadline_days) : null,
      checklist: item.checklist || [],
      order_index: order,
      template_item_id: item.id,
      created_by: userId || null,
    });
  }
  if (!rows.length) return [];
  const { data, error: insErr } = await supabase.from('app_module_tasks').insert(rows).select();
  if (insErr) throw insErr;
  return data || [];
}

/**
 * If stage has crm_target_stage_id and record has source_crm_lead_id → move CRM deal.
 */
async function syncCrmFromAppModuleStage(record, stage) {
  if (!record?.source_crm_lead_id || !stage?.crm_target_stage_id) {
    return { synced: false };
  }
  const { data: lead, error: leadErr } = await supabase
    .from('crm_leads')
    .select('id, pipeline_stage_id')
    .eq('id', record.source_crm_lead_id)
    .maybeSingle();
  if (leadErr) throw leadErr;
  if (!lead) return { synced: false, reason: 'lead_missing' };
  if (String(lead.pipeline_stage_id) === String(stage.crm_target_stage_id)) {
    return { synced: false, reason: 'already' };
  }
  const { error: updErr } = await supabase
    .from('crm_leads')
    .update({
      pipeline_stage_id: stage.crm_target_stage_id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lead.id);
  if (updErr) throw updErr;
  return { synced: true, lead_id: lead.id, stage_id: stage.crm_target_stage_id };
}

/**
 * Notify users with access / assignees about a transfer into a custom module.
 */
async function notifyModuleTransfer(req, {
  moduleRow,
  record,
  lead,
  actorUserId,
}) {
  const targets = new Set();
  if (record.assignee_id) targets.add(String(record.assignee_id));

  // Company admins / staff of the module company (best-effort)
  if (moduleRow.company_id || record.company_id) {
    const cid = moduleRow.company_id || record.company_id;
    const users = await getCompanyScopedRoleUserIds(cid, ['admin', 'manager', 'sales_admin']);
    users.forEach((id) => targets.add(String(id)));
  }

  targets.delete(String(actorUserId || ''));
  const title = `Chuyển sang ${moduleRow.name}`;
  const message = lead
    ? `Deal «${lead.name || lead.code || lead.id}» đã được chuyển vào module «${moduleRow.name}».`
    : `Có bản ghi mới trong module «${moduleRow.name}»: ${record.name}`;
  const link = `/m/${moduleRow.module_key}/records/${record.id}`;
  const meta = {
    link,
    ecosystem_module_key: moduleRow.module_key,
    app_module_id: moduleRow.id,
    record_id: record.id,
    source_crm_lead_id: record.source_crm_lead_id || null,
    company_id: moduleRow.company_id || record.company_id || null,
  };

  const results = [];
  for (const uid of targets) {
    const n = await createNotification(
      req,
      uid,
      'system',
      title,
      message,
      'app_module_record',
      record.id,
      meta,
    );
    if (n) results.push(n);
  }
  return results;
}

/**
 * Create record from CRM lead (transfer). Idempotent per (module, lead).
 */
async function transferLeadToAppModule(req, {
  moduleRow,
  leadId,
  companyId = null,
  assigneeId = null,
  stageId = null,
}) {
  const { data: existing } = await supabase
    .from('app_module_records')
    .select('*')
    .eq('module_id', moduleRow.id)
    .eq('source_crm_lead_id', leadId)
    .maybeSingle();
  if (existing) {
    return { record: existing, created: false, tasks: [] };
  }

  const { data: lead, error: leadErr } = await supabase
    .from('crm_leads')
    .select('id, name, code, company_id, assignee_id, type')
    .eq('id', leadId)
    .maybeSingle();
  if (leadErr) throw leadErr;
  if (!lead) {
    const err = new Error('Không tìm thấy lead/deal');
    err.status = 404;
    throw err;
  }

  let targetStageId = stageId || null;
  let targetTabId = null;
  if (targetStageId) {
    const { data: st } = await supabase
      .from('app_module_pipeline_stages')
      .select('id, tab_id')
      .eq('id', targetStageId)
      .maybeSingle();
    targetTabId = st?.tab_id || null;
  }
  if (!targetStageId) {
    const { data: firstStage } = await supabase
      .from('app_module_pipeline_stages')
      .select('id, tab_id')
      .eq('module_id', moduleRow.id)
      .eq('is_active', true)
      .order('order_index')
      .limit(1)
      .maybeSingle();
    targetStageId = firstStage?.id || null;
    targetTabId = firstStage?.tab_id || null;
  }
  if (!targetTabId) {
    const { data: mainTab } = await supabase
      .from('app_module_tabs')
      .select('id')
      .eq('module_id', moduleRow.id)
      .order('order_index')
      .limit(1)
      .maybeSingle();
    targetTabId = mainTab?.id || null;
  }

  const name = lead.name || lead.code || `Deal ${String(lead.id).slice(0, 8)}`;
  const insert = {
    module_id: moduleRow.id,
    company_id: companyId || moduleRow.company_id || lead.company_id || null,
    name,
    stage_id: targetStageId,
    tab_id: targetTabId,
    source_crm_lead_id: lead.id,
    assignee_id: assigneeId || lead.assignee_id || null,
    status: 'open',
    meta: { transferred_from: 'crm', lead_type: lead.type || null },
    created_by: req.user?.id || null,
  };

  const { data: record, error: insErr } = await supabase
    .from('app_module_records')
    .insert(insert)
    .select()
    .single();
  if (insErr) {
    // race: unique violation → return existing
    if (String(insErr.code) === '23505' || /duplicate|unique/i.test(insErr.message || '')) {
      const { data: again } = await supabase
        .from('app_module_records')
        .select('*')
        .eq('module_id', moduleRow.id)
        .eq('source_crm_lead_id', leadId)
        .maybeSingle();
      if (again) return { record: again, created: false, tasks: [] };
    }
    throw insErr;
  }

  const tasks = await applyAppModuleTemplatesToRecord({
    moduleId: moduleRow.id,
    recordId: record.id,
    stageId: targetStageId,
    userId: req.user?.id,
  });

  await notifyModuleTransfer(req, {
    moduleRow,
    record,
    lead,
    actorUserId: req.user?.id,
  });

  return { record, created: true, tasks };
}

/**
 * Notify enabled module links when a custom-module record enters a stage.
 */
async function notifyFromCustomModuleStage(req, {
  stageId,
  record,
  actorUserId = null,
}) {
  if (!stageId || !record) return [];
  const { data: links } = await supabase
    .from('pipeline_stage_module_links')
    .select('*, target_module:app_modules(*)')
    .eq('source_kind', 'custom')
    .eq('source_stage_id', stageId)
    .eq('link_type', 'notify')
    .eq('enabled', true);
  if (!links?.length) return [];

  const results = [];
  for (const link of links) {
    const mod = link.target_module;
    if (!mod?.is_active) continue;
    const n = await notifyModuleTransfer(req, {
      moduleRow: mod,
      record: {
        ...record,
        id: record.id,
        name: record.name,
        assignee_id: record.assignee_id,
        company_id: record.company_id || mod.company_id,
      },
      lead: null,
      actorUserId,
    });
    results.push(...(n || []));
  }
  return results;
}

/**
 * Transfer a custom-module record into another custom module (idempotent by meta.source_record_id).
 */
async function transferRecordToAppModule(req, {
  sourceModule,
  record,
  targetModule,
}) {
  if (!sourceModule || !record || !targetModule) {
    const err = new Error('Thiếu thông tin chuyển module');
    err.status = 400;
    throw err;
  }
  if (String(sourceModule.id) === String(targetModule.id)) {
    const err = new Error('Không thể chuyển sang chính module này');
    err.status = 400;
    throw err;
  }

  const { data: existingRows } = await supabase
    .from('app_module_records')
    .select('*')
    .eq('module_id', targetModule.id)
    .filter('meta->>source_record_id', 'eq', String(record.id))
    .limit(1);
  const existing = existingRows?.[0] || null;
  if (existing) {
    return { record: existing, created: false, tasks: [] };
  }

  const { data: firstStage } = await supabase
    .from('app_module_pipeline_stages')
    .select('id, tab_id')
    .eq('module_id', targetModule.id)
    .eq('is_active', true)
    .order('order_index')
    .limit(1)
    .maybeSingle();

  const insert = {
    module_id: targetModule.id,
    company_id: record.company_id || targetModule.company_id || null,
    name: record.name,
    stage_id: firstStage?.id || null,
    tab_id: firstStage?.tab_id || null,
    source_crm_lead_id: record.source_crm_lead_id || null,
    assignee_id: record.assignee_id || req.user?.id || null,
    status: 'open',
    meta: {
      transferred_from: 'custom',
      source_module_id: sourceModule.id,
      source_module_key: sourceModule.module_key,
      source_record_id: record.id,
    },
    created_by: req.user?.id || null,
  };

  const { data: created, error: insErr } = await supabase
    .from('app_module_records')
    .insert(insert)
    .select()
    .single();
  if (insErr) throw insErr;

  const tasks = await applyAppModuleTemplatesToRecord({
    moduleId: targetModule.id,
    recordId: created.id,
    stageId: firstStage?.id || null,
    userId: req.user?.id,
  });

  await notifyModuleTransfer(req, {
    moduleRow: targetModule,
    record: created,
    lead: null,
    actorUserId: req.user?.id,
  });

  return { record: created, created: true, tasks };
}

module.exports = {
  applyAppModuleTemplatesToRecord,
  applyAppModuleTemplateById,
  syncCrmFromAppModuleStage,
  notifyModuleTransfer,
  notifyFromCustomModuleStage,
  transferLeadToAppModule,
  transferRecordToAppModule,
};
