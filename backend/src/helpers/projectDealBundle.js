/**
 * Bundle dữ liệu deal theo project — CRM + SX + VC (NV, tài liệu).
 */
const { supabase } = require('../config/supabase');
const {
  leadDocVisibleForModuleAndUser,
} = require('./documentShareScope');

function isSxProjectTask(t) {
  const slug = String(t.metadata?.workshop_area || t.metadata?.stage_slug || '');
  return slug.includes('sx_') || t.metadata?.workshop_module === 'production';
}

function isVcProjectTask(t) {
  const slug = String(t.metadata?.workshop_area || t.metadata?.stage_slug || '');
  return slug.includes('vc_') || t.metadata?.workshop_module === 'logistics';
}

function isWorkflowProjectTask(t) {
  return !isSxProjectTask(t) && !isVcProjectTask(t);
}

function isSxTaskDoc(doc) {
  return !!doc?.project_id
    && !!doc?.source_crm_task_id
    && String(doc.crm_stage_slug || '').startsWith('sx_');
}

function countDone(list, doneVals = new Set(['completed', 'done'])) {
  return {
    total: list.length,
    done: list.filter((t) => doneVals.has(String(t.status))).length,
  };
}

function mapCrmTask(t) {
  return {
    id: t.id,
    source: 'crm_task',
    title: t.title,
    status: t.status,
    deadline: t.deadline,
    priority: t.priority,
    stage_slug: t.stage_slug,
    assignee_id: t.assignee_id,
  };
}

function mapProjectTask(t) {
  return {
    id: t.id,
    source: 'task',
    title: t.title,
    status: t.status,
    deadline: t.due_date,
    priority: t.priority,
    assignee_id: t.assignee_id,
    metadata: t.metadata,
  };
}

function mapLeadDoc(d) {
  return {
    id: d.id,
    name: d.name || d.file_name,
    file_name: d.file_name,
    doc_type: d.doc_type,
    created_at: d.created_at,
    shared_to_workshop: d.shared_to_workshop,
    allowed_share_modules: d.allowed_share_modules,
    file_path: d.file_path,
    file_url: d.file_url,
    crm_stage_slug: d.crm_stage_slug,
    source_crm_task_id: d.source_crm_task_id,
  };
}

/**
 * @param {string} projectId
 * @param {object} [opts]
 * @param {object} [opts.user] — req.user cho lọc tài liệu chia sẻ
 */
async function buildProjectDealBundle(projectId, opts = {}) {
  const user = opts.user || null;

  const { data: project } = await supabase
    .from('projects')
    .select(`
      id, code, name, status, deadline, estimated_value, production_value, deposit_amount,
      company_id, sx_kanban_column_id, vc_kanban_column_id
    `)
    .eq('id', projectId)
    .maybeSingle();

  if (!project) return null;

  const { data: leads } = await supabase
    .from('crm_leads')
    .select(`
      id, code, title, type, budget, estimated_value, company_id, project_id,
      stage:crm_pipeline_stages(id, name, color, icon, is_won),
      customer:customers(id, full_name, phone)
    `)
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false });

  const primaryLead = (leads || []).find((l) => l.type === 'deal') || (leads || [])[0] || null;
  const leadId = primaryLead?.id || null;

  const [
    crmTasksRes,
    projectTasksRes,
    docsRes,
  ] = await Promise.all([
    leadId
      ? supabase.from('crm_tasks').select('id, title, status, stage_slug, deadline, assignee_id, priority, order_index')
        .eq('lead_id', leadId).order('order_index')
      : Promise.resolve({ data: [] }),
    supabase.from('tasks').select('id, title, status, priority, due_date, assignee_id, task_type, metadata, order_index')
      .eq('project_id', projectId).order('order_index'),
    leadId
      ? supabase.from('lead_documents')
        .select('id, name, file_name, doc_type, created_at, shared_to_workshop, allowed_share_modules, file_path, file_url, crm_stage_slug, source_crm_task_id, project_id')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
      : supabase.from('lead_documents')
        .select('id, name, file_name, doc_type, created_at, shared_to_workshop, allowed_share_modules, file_path, file_url, crm_stage_slug, source_crm_task_id, project_id')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false }),
  ]);

  let sxStage = null;
  let vcStage = null;
  if (project.sx_kanban_column_id) {
    const { data } = await supabase
      .from('production_pipeline_stages')
      .select('id, name, color, icon')
      .eq('id', project.sx_kanban_column_id)
      .maybeSingle();
    sxStage = data;
  }
  if (project.vc_kanban_column_id) {
    const { data } = await supabase
      .from('logistics_pipeline_stages')
      .select('id, name, color, icon')
      .eq('id', project.vc_kanban_column_id)
      .maybeSingle();
    vcStage = data;
  }

  const crmTasksRaw = crmTasksRes.data || [];
  const crmTaskIds = crmTasksRaw.map((t) => t.id).filter(Boolean);
  let crmAttachments = [];
  if (crmTaskIds.length) {
    const { data: att } = await supabase
      .from('crm_task_attachments')
      .select('id, file_name, name, file_path, file_url, mime_type, created_at, crm_task_id, shared_to_workshop, allowed_share_modules')
      .in('crm_task_id', crmTaskIds);
    crmAttachments = att || [];
  }

  const crmTasks = crmTasksRaw.map(mapCrmTask);
  const allProjectTasks = projectTasksRes.data || [];
  const sxTasks = allProjectTasks.filter(isSxProjectTask).map(mapProjectTask);
  const vcTasks = allProjectTasks.filter(isVcProjectTask).map(mapProjectTask);
  const workflowTasks = allProjectTasks.filter(isWorkflowProjectTask).map(mapProjectTask);

  const allLeadDocs = (docsRes.data || []).map(mapLeadDoc);
  const crmDocuments = allLeadDocs.map((d) => ({ ...d, bucket: 'crm' }));

  const sxDocuments = allLeadDocs.filter((d) => {
    if (isSxTaskDoc(d)) return true;
    if (!user) return d.shared_to_workshop && (!d.allowed_share_modules || String(d.allowed_share_modules).includes('production'));
    return leadDocVisibleForModuleAndUser(d, 'production', user);
  }).map((d) => ({ ...d, bucket: 'sx' }));

  const vcDocuments = allLeadDocs.filter((d) => {
    if (!user) return d.shared_to_workshop && String(d.allowed_share_modules || '').includes('logistics');
    return leadDocVisibleForModuleAndUser(d, 'logistics', user);
  }).map((d) => ({ ...d, bucket: 'vc' }));

  const crmTaskAttachments = crmAttachments.map((a) => ({
    id: a.id,
    name: a.name || a.file_name,
    file_name: a.file_name,
    file_path: a.file_path,
    file_url: a.file_url,
    created_at: a.created_at,
    bucket: 'crm',
    kind: 'crm_task_attachment',
    crm_task_id: a.crm_task_id,
  }));

  const crmAllDocuments = [...crmDocuments, ...crmTaskAttachments];

  const uniqueDocIds = new Set();
  [...crmAllDocuments, ...sxDocuments, ...vcDocuments].forEach((d) => {
    if (d?.id) uniqueDocIds.add(String(d.id));
  });

  return {
    project,
    leads: leads || [],
    primary_lead: primaryLead,
    lead_id: leadId,
    pipelines: {
      crm: primaryLead?.stage || null,
      sx: sxStage,
      vc: vcStage,
    },
    sections: {
      crm: {
        label: 'CRM (Bán hàng)',
        emoji: '💼',
        color: '#059669',
        tasks: crmTasks,
        documents: crmAllDocuments,
        stats: {
          tasks: countDone(crmTasks),
          documents: { total: crmAllDocuments.length },
        },
      },
      sx: {
        label: 'Sản xuất',
        emoji: '🏭',
        color: '#ea580c',
        tasks: sxTasks,
        documents: sxDocuments,
        stats: {
          tasks: countDone(sxTasks),
          documents: { total: sxDocuments.length },
        },
      },
      vc: {
        label: 'Vận chuyển',
        emoji: '🚚',
        color: '#d97706',
        tasks: vcTasks,
        documents: vcDocuments,
        stats: {
          tasks: countDone(vcTasks),
          documents: { total: vcDocuments.length },
        },
      },
      workflow: {
        label: 'Quy trình dự án',
        emoji: '📋',
        color: '#2563eb',
        tasks: workflowTasks,
        documents: [],
        stats: {
          tasks: countDone(workflowTasks),
          documents: { total: 0 },
        },
      },
    },
    totals: {
      tasks: crmTasks.length + sxTasks.length + vcTasks.length + workflowTasks.length,
      documents: uniqueDocIds.size,
      documents_crm: crmAllDocuments.length,
      documents_sx: sxDocuments.length,
      documents_vc: vcDocuments.length,
    },
  };
}

module.exports = {
  buildProjectDealBundle,
  isSxProjectTask,
  isVcProjectTask,
};
