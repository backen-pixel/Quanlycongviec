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

function mapFileAttachment(f) {
  return {
    id: f.id,
    name: f.file_name,
    file_name: f.file_name,
    file_path: f.file_url,
    file_url: f.file_url,
    created_at: f.created_at,
    entity_type: f.entity_type,
    entity_id: f.entity_id,
    kind: 'file_attachment',
  };
}

function mapUnifiedTask(t) {
  return {
    id: t.source_id || t.unified_id,
    unified_id: t.unified_id,
    source: t.source,
    task_kind: t.task_kind,
    title: t.title,
    status: t.status,
    deadline: t.deadline,
    priority: t.priority,
    assignee_id: t.assignee_id,
  };
}

function classifyUnifiedTask(t) {
  const kind = String(t.task_kind || '');
  if (t.source === 'crm_task' || kind === 'CRM-Deal' || kind === 'CRM-Lead') return 'crm';
  if (kind === 'VC') return 'vc';
  if (kind === 'SX' || kind === 'Dự án') return 'sx';
  if (t.source === 'crm_assignment' || kind === 'Giao việc') return 'crm';
  if (t.project_id) return 'workflow';
  return 'workflow';
}

function mergeTasksByKey(existing, incoming, keyFn) {
  const map = new Map();
  for (const t of existing || []) map.set(keyFn(t), t);
  for (const t of incoming || []) map.set(keyFn(t), t);
  return Array.from(map.values());
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
      stage:crm_pipeline_stages!crm_leads_stage_id_fkey(id, name, color, icon, is_won),
      customer:customers(id, full_name, phone)
    `)
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false });

  const primaryLead = (leads || []).find((l) => l.type === 'deal') || (leads || [])[0] || null;
  const leadId = primaryLead?.id || null;
  const leadIds = (leads || []).map((l) => l.id).filter(Boolean);

  const [
    crmTasksRes,
    projectTasksRes,
    docsRes,
    unifiedProjectRes,
    unifiedCrmRes,
    projectFilesRes,
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
    supabase.from('unified_tasks_v')
      .select('unified_id, source, source_id, project_id, lead_id, title, status, priority, assignee_id, deadline, task_kind')
      .eq('project_id', projectId),
    leadIds.length
      ? supabase.from('unified_tasks_v')
        .select('unified_id, source, source_id, project_id, lead_id, title, status, priority, assignee_id, deadline, task_kind')
        .in('lead_id', leadIds)
      : Promise.resolve({ data: [] }),
    supabase.from('file_attachments')
      .select('id, file_name, file_url, mime_type, created_at, entity_type, entity_id, notes')
      .eq('entity_type', 'project')
      .eq('entity_id', projectId)
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
  const allProjectTasks = projectTasksRes.data || [];
  const projectTaskIds = allProjectTasks.map((t) => t.id).filter(Boolean);

  let taskFiles = [];
  if (projectTaskIds.length) {
    const { data: tf } = await supabase
      .from('file_attachments')
      .select('id, file_name, file_url, mime_type, created_at, entity_type, entity_id, notes')
      .eq('entity_type', 'task')
      .in('entity_id', projectTaskIds);
    taskFiles = tf || [];
  }

  let crmAttachments = [];
  if (crmTaskIds.length) {
    const { data: att } = await supabase
      .from('crm_task_attachments')
      .select('id, file_name, name, file_path, file_url, mime_type, created_at, crm_task_id, shared_to_workshop, allowed_share_modules')
      .in('crm_task_id', crmTaskIds);
    crmAttachments = att || [];
  }

  const unifiedSeen = new Set();
  const unifiedAll = [...(unifiedProjectRes.data || []), ...(unifiedCrmRes.data || [])].filter((t) => {
    if (unifiedSeen.has(t.unified_id)) return false;
    unifiedSeen.add(t.unified_id);
    return true;
  });
  const unifiedBySection = { crm: [], sx: [], vc: [], workflow: [] };
  for (const ut of unifiedAll) {
    const bucket = classifyUnifiedTask(ut);
    unifiedBySection[bucket].push(mapUnifiedTask(ut));
  }

  const crmTasks = mergeTasksByKey(
    crmTasksRaw.map(mapCrmTask),
    unifiedBySection.crm,
    (t) => `${t.source || 'crm_task'}-${t.id}`,
  );
  const sxTasks = mergeTasksByKey(
    allProjectTasks.filter(isSxProjectTask).map(mapProjectTask),
    unifiedBySection.sx,
    (t) => `${t.source || 'task'}-${t.id}`,
  );
  const vcTasks = mergeTasksByKey(
    allProjectTasks.filter(isVcProjectTask).map(mapProjectTask),
    unifiedBySection.vc,
    (t) => `${t.source || 'task'}-${t.id}`,
  );
  const workflowTasks = mergeTasksByKey(
    allProjectTasks.filter(isWorkflowProjectTask).map(mapProjectTask),
    unifiedBySection.workflow,
    (t) => `${t.source || 'task'}-${t.id}`,
  );

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

  const projectNativeFiles = (projectFilesRes.data || []).map((f) => ({
    ...mapFileAttachment(f),
    bucket: 'workflow',
  }));
  const taskNativeFiles = taskFiles.map((f) => ({
    ...mapFileAttachment(f),
    bucket: isSxProjectTask(allProjectTasks.find((t) => String(t.id) === String(f.entity_id)) || {})
      ? 'sx'
      : isVcProjectTask(allProjectTasks.find((t) => String(t.id) === String(f.entity_id)) || {})
        ? 'vc'
        : 'workflow',
  }));

  const crmAllDocuments = [...crmDocuments, ...crmTaskAttachments];
  const workflowDocuments = [...projectNativeFiles, ...taskNativeFiles.filter((d) => d.bucket === 'workflow')];
  const sxNativeDocs = taskNativeFiles.filter((d) => d.bucket === 'sx');
  const sxAllDocuments = [...sxDocuments, ...sxNativeDocs];
  const vcNativeDocs = taskNativeFiles.filter((d) => d.bucket === 'vc');
  const vcAllDocuments = [...vcDocuments, ...vcNativeDocs];

  const uniqueDocIds = new Set();
  [...crmAllDocuments, ...sxAllDocuments, ...vcAllDocuments, ...workflowDocuments].forEach((d) => {
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
        documents: sxAllDocuments,
        stats: {
          tasks: countDone(sxTasks),
          documents: { total: sxAllDocuments.length },
        },
      },
      vc: {
        label: 'Vận chuyển',
        emoji: '🚚',
        color: '#d97706',
        tasks: vcTasks,
        documents: vcAllDocuments,
        stats: {
          tasks: countDone(vcTasks),
          documents: { total: vcAllDocuments.length },
        },
      },
      workflow: {
        label: 'Quy trình dự án',
        emoji: '📋',
        color: '#2563eb',
        tasks: workflowTasks,
        documents: workflowDocuments,
        stats: {
          tasks: countDone(workflowTasks),
          documents: { total: workflowDocuments.length },
        },
      },
    },
    totals: {
      tasks: crmTasks.length + sxTasks.length + vcTasks.length + workflowTasks.length,
      documents: uniqueDocIds.size,
      documents_crm: crmAllDocuments.length,
      documents_sx: sxAllDocuments.length,
      documents_vc: vcAllDocuments.length,
      documents_workflow: workflowDocuments.length,
    },
  };
}

module.exports = {
  buildProjectDealBundle,
  isSxProjectTask,
  isVcProjectTask,
};
