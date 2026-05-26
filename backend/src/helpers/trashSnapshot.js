// Helper: snapshot dữ liệu trước khi xóa thật, để Thùng rác có thể phục hồi.
//
// Hỗ trợ 3 entity_type:
//   - 'crm_lead'           : snapshot lead/deal + children + lead_documents +
//                            crm_tasks + crm_activities
//   - 'lead_document'      : snapshot 1 row lead_documents (file ghi chú)
//   - 'crm_task_attachment': snapshot 1 row crm_task_attachments
//
// API:
//   snapshotCrmLead(supabase, leadId, deletedBy)        -> { ok, trashId?, error? }
//   snapshotLeadDocument(supabase, docId, deletedBy)    -> { ok, trashId?, error? }
//   snapshotTaskAttachment(supabase, attId, deletedBy)  -> { ok, trashId?, error? }
//   restoreTrashItem(supabase, trashId)                 -> { ok, error? }
const { supabase: defaultClient } = require('../config/supabase');

function getClient(sb) { return sb || defaultClient; }

async function insertTrashRow(sb, row) {
  // Nếu đã có trash cho entity này (xóa rồi xóa lại?), ghi đè snapshot mới
  const tryInsert = async (payload) => sb
    .from('trash_items')
    .upsert(payload, { onConflict: 'entity_type,entity_id' })
    .select('id')
    .maybeSingle();

  let { data, error } = await tryInsert(row);
  // Cột delete_reason chưa được migrate → bỏ ra rồi thử lại (chạy file 156_trash_items_delete_reason.sql).
  if (error && /delete_reason|column .* does not exist/i.test(String(error.message || '')) && row && 'delete_reason' in row) {
    const { delete_reason: _omit, ...rest } = row;
    void _omit;
    const retry = await tryInsert(rest);
    data = retry.data;
    error = retry.error;
  }
  if (error) throw error;
  return data?.id;
}

async function snapshotCrmLead(sb, leadId, deletedBy, options = {}) {
  const client = getClient(sb);
  try {
    const { data: lead } = await client.from('crm_leads').select('*').eq('id', leadId).maybeSingle();
    if (!lead) return { ok: false, error: 'Lead không tồn tại' };

    const { data: children } = await client.from('crm_leads').select('*').eq('parent_lead_id', leadId);
    const { data: documents } = await client.from('lead_documents').select('*').eq('lead_id', leadId);
    const { data: activities } = await client.from('crm_activities').select('*').eq('lead_id', leadId);
    const { data: tasks } = await client.from('crm_tasks').select('*').eq('lead_id', leadId);

    const row = {
      entity_type: 'crm_lead',
      entity_id: leadId,
      entity_label: lead.title || lead.code || `Lead ${String(leadId).slice(0, 8)}`,
      company_id: lead.company_id || null,
      deleted_by: deletedBy || null,
      snapshot: {
        lead,
        children: children || [],
        documents: documents || [],
        activities: activities || [],
        tasks: tasks || [],
      },
    };
    if (options.delete_reason) row.delete_reason = options.delete_reason;

    const trashId = await insertTrashRow(client, row);
    return { ok: true, trashId };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function snapshotLeadDocument(sb, docId, deletedBy) {
  const client = getClient(sb);
  try {
    const { data: doc } = await client.from('lead_documents').select('*').eq('id', docId).maybeSingle();
    if (!doc) return { ok: false, error: 'Document không tồn tại' };
    let company_id = null;
    if (doc.lead_id) {
      const { data: lead } = await client.from('crm_leads').select('company_id').eq('id', doc.lead_id).maybeSingle();
      company_id = lead?.company_id || null;
    }
    const trashId = await insertTrashRow(client, {
      entity_type: 'lead_document',
      entity_id: docId,
      entity_label: doc.name || doc.file_name || 'File ghi chú',
      company_id,
      deleted_by: deletedBy || null,
      snapshot: { document: doc },
    });
    return { ok: true, trashId };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Snapshot 1 project (Sản xuất / Quản lý xưởng) trước khi xóa cứng.
 * Bao gồm: row projects, tasks + sub, project_comments, stage_transitions,
 * project_workflow_lines, project_products, linked crm_leads + sub.
 * Mục tiêu khôi phục: card SX hiện lại trên Kanban với metadata gốc.
 */
async function snapshotProject(sb, projectId, deletedBy, options = {}) {
  const client = getClient(sb);
  try {
    const { data: project } = await client.from('projects').select('*').eq('id', projectId).maybeSingle();
    if (!project) return { ok: false, error: 'Dự án không tồn tại' };

    const { data: tasks } = await client.from('tasks').select('*').eq('project_id', projectId);
    const taskIds = (tasks || []).map((t) => t.id);

    let checklists = [];
    let comments = [];
    let participants = [];
    let timeLogs = [];
    let taskAttachments = [];
    if (taskIds.length) {
      [
        { data: checklists },
        { data: comments },
        { data: participants },
        { data: timeLogs },
        { data: taskAttachments },
      ] = await Promise.all([
        client.from('task_checklists').select('*').in('task_id', taskIds),
        client.from('task_comments').select('*').in('task_id', taskIds),
        client.from('task_participants').select('*').in('task_id', taskIds),
        client.from('task_time_logs').select('*').in('task_id', taskIds),
        client.from('file_attachments').select('*').eq('entity_type', 'task').in('entity_id', taskIds),
      ]);
    }

    const [{ data: projectComments }, { data: stageTransitions }, { data: workflowLines }, { data: products }, { data: leads }] = await Promise.all([
      client.from('project_comments').select('*').eq('project_id', projectId),
      client.from('stage_transitions').select('*').eq('project_id', projectId),
      client.from('project_workflow_lines').select('*').eq('project_id', projectId),
      client.from('project_products').select('*').eq('project_id', projectId),
      client.from('crm_leads').select('*').eq('project_id', projectId),
    ]);

    const leadIds = (leads || []).map((l) => l.id);
    let leadDocuments = [];
    let leadActivities = [];
    let quotations = [];
    let orders = [];
    let invoices = [];
    if (leadIds.length) {
      const safeSel = async (table) => {
        try { const { data } = await client.from(table).select('*').in('lead_id', leadIds); return data || []; }
        catch { return []; }
      };
      [leadDocuments, leadActivities, quotations, orders, invoices] = await Promise.all([
        safeSel('lead_documents'),
        safeSel('crm_activities'),
        safeSel('quotations'),
        safeSel('orders'),
        safeSel('invoices'),
      ]);
    }

    const row = {
      entity_type: 'project',
      entity_id: projectId,
      entity_label: project.name || project.code || `Dự án ${String(projectId).slice(0, 8)}`,
      company_id: project.company_id || null,
      deleted_by: deletedBy || null,
      snapshot: {
        project,
        tasks: tasks || [],
        task_checklists: checklists || [],
        task_comments: comments || [],
        task_participants: participants || [],
        task_time_logs: timeLogs || [],
        file_attachments: taskAttachments || [],
        project_comments: projectComments || [],
        stage_transitions: stageTransitions || [],
        project_workflow_lines: workflowLines || [],
        project_products: products || [],
        crm_leads: leads || [],
        lead_documents: leadDocuments,
        crm_activities: leadActivities,
        quotations,
        orders,
        invoices,
      },
    };
    if (options.delete_reason) row.delete_reason = options.delete_reason;

    const trashId = await insertTrashRow(client, row);
    return { ok: true, trashId };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function snapshotTaskAttachment(sb, attId, deletedBy) {
  const client = getClient(sb);
  try {
    const { data: att } = await client.from('crm_task_attachments').select('*').eq('id', attId).maybeSingle();
    if (!att) return { ok: false, error: 'Attachment không tồn tại' };
    let company_id = null;
    if (att.task_id) {
      const { data: task } = await client.from('crm_tasks')
        .select('lead_id, crm_leads:lead_id(company_id)')
        .eq('id', att.task_id)
        .maybeSingle();
      company_id = task?.crm_leads?.company_id || null;
    }
    const trashId = await insertTrashRow(client, {
      entity_type: 'crm_task_attachment',
      entity_id: attId,
      entity_label: att.file_name || att.name || 'Đính kèm task',
      company_id,
      deleted_by: deletedBy || null,
      snapshot: { attachment: att },
    });
    return { ok: true, trashId };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Cột thường gặp gây fail upsert (generated / computed). Loại bỏ trước khi restore.
const STRIPPED_COLUMNS = new Set([
  'search_vector', 'tsv', 'full_text',
  // crm_leads — cột GENERATED STORED (xem các migration 100/110/147)
  'weighted_value',
]);

// Cache theo từng bảng các cột đã phát hiện là generated / không tồn tại
// → lần sau cùng bảng sẽ strip ngay từ đầu, tránh round-trip thừa.
const learnedDropCols = new Map(); // table -> Set<string>

function getDropSet(table) {
  if (!learnedDropCols.has(table)) learnedDropCols.set(table, new Set());
  return learnedDropCols.get(table);
}

function sanitizeRowForRestore(table, row) {
  if (!row || typeof row !== 'object') return row;
  const drops = getDropSet(table);
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (STRIPPED_COLUMNS.has(k)) continue;
    if (drops.has(k)) continue;
    out[k] = v;
  }
  return out;
}

// Pattern các lỗi Postgres có thể strip cột rồi retry an toàn
const STRIPPABLE_PATTERNS = [
  /column "([^"]+)" of relation .* does not exist/i,             // 42703
  /cannot insert a non-DEFAULT value into column "([^"]+)"/i,    // 428C9 generated column
  /column "([^"]+)" can only be updated to DEFAULT/i,            // 428C9
  /column "([^"]+)" is a generated column/i,
];

function extractStrippableColumn(message) {
  if (!message) return null;
  for (const re of STRIPPABLE_PATTERNS) {
    const m = re.exec(message);
    if (m && m[1]) return m[1];
  }
  return null;
}

/**
 * Cố gắng insert lại 1 row vào bảng đích.
 * Auto-strip các cột generated / không tồn tại, loop tối đa 8 lần (1 cột/lần).
 * Trả về { ok, error?: { code, message, details, hint } } để caller thu thập lỗi.
 */
async function safeInsert(sb, table, row, opts = {}) {
  if (!row) return { ok: true };
  let current = sanitizeRowForRestore(table, row);
  const onConflict = opts.onConflict || 'id';
  const drops = getDropSet(table);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { error } = await sb.from(table).upsert(current, { onConflict });
    if (!error) return { ok: true };

    const col = extractStrippableColumn(error.message);
    if (col && Object.prototype.hasOwnProperty.call(current, col)) {
      drops.add(col); // ghi nhớ để lần sau strip sẵn cho cùng bảng
      const { [col]: _drop, ...rest } = current;
      void _drop;
      current = rest;
      continue; // retry không tính là fail
    }

    console.warn(`[trash:restore] upsert ${table} failed:`, {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return {
      ok: false,
      error: { code: error.code || null, message: error.message, details: error.details || null, hint: error.hint || null },
    };
  }
  return { ok: false, error: { code: null, message: `Quá số lần retry strip cột cho bảng ${table}`, details: null, hint: null } };
}

async function restoreManyAndCollect(sb, table, rows, errors, opts) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  for (const r of rows) {
    const res = await safeInsert(sb, table, r, opts);
    if (!res.ok) errors.push({ table, ...res.error });
  }
}

async function restoreTrashItem(sb, trashId) {
  const client = getClient(sb);
  try {
    const { data: row, error: getErr } = await client
      .from('trash_items')
      .select('*')
      .eq('id', trashId)
      .maybeSingle();
    if (getErr) throw getErr;
    if (!row) return { ok: false, error: 'Không tìm thấy mục trong thùng rác' };

    const snap = row.snapshot || {};
    const errors = []; // thu thập lỗi non-fatal để báo về client
    let primaryFailed = false;

    if (row.entity_type === 'crm_lead') {
      const r = await safeInsert(client, 'crm_leads', snap.lead);
      if (!r.ok) { errors.push({ table: 'crm_leads', ...r.error }); primaryFailed = true; }
      await restoreManyAndCollect(client, 'crm_leads', snap.children, errors);
      await restoreManyAndCollect(client, 'lead_documents', snap.documents, errors);
      await restoreManyAndCollect(client, 'crm_activities', snap.activities, errors);
      await restoreManyAndCollect(client, 'crm_tasks', snap.tasks, errors);
    } else if (row.entity_type === 'project') {
      // Khôi phục project trước (parent của crm_leads), rồi các bảng con
      const r = await safeInsert(client, 'projects', snap.project);
      if (!r.ok) { errors.push({ table: 'projects', ...r.error }); primaryFailed = true; }
      await restoreManyAndCollect(client, 'crm_leads', snap.crm_leads, errors);
      await restoreManyAndCollect(client, 'tasks', snap.tasks, errors);
      await restoreManyAndCollect(client, 'task_checklists', snap.task_checklists, errors);
      await restoreManyAndCollect(client, 'task_comments', snap.task_comments, errors);
      await restoreManyAndCollect(client, 'task_participants', snap.task_participants, errors);
      await restoreManyAndCollect(client, 'task_time_logs', snap.task_time_logs, errors);
      await restoreManyAndCollect(client, 'file_attachments', snap.file_attachments, errors);
      await restoreManyAndCollect(client, 'project_comments', snap.project_comments, errors);
      await restoreManyAndCollect(client, 'stage_transitions', snap.stage_transitions, errors);
      await restoreManyAndCollect(client, 'project_workflow_lines', snap.project_workflow_lines, errors);
      await restoreManyAndCollect(client, 'project_products', snap.project_products, errors);
      await restoreManyAndCollect(client, 'lead_documents', snap.lead_documents, errors);
      await restoreManyAndCollect(client, 'crm_activities', snap.crm_activities, errors);
      await restoreManyAndCollect(client, 'quotations', snap.quotations, errors);
      await restoreManyAndCollect(client, 'orders', snap.orders, errors);
      await restoreManyAndCollect(client, 'invoices', snap.invoices, errors);
    } else if (row.entity_type === 'lead_document') {
      const r = await safeInsert(client, 'lead_documents', snap.document);
      if (!r.ok) { errors.push({ table: 'lead_documents', ...r.error }); primaryFailed = true; }
    } else if (row.entity_type === 'crm_task_attachment') {
      const r = await safeInsert(client, 'crm_task_attachments', snap.attachment);
      if (!r.ok) { errors.push({ table: 'crm_task_attachments', ...r.error }); primaryFailed = true; }
    } else {
      return { ok: false, error: `Loại không hỗ trợ: ${row.entity_type}` };
    }

    if (primaryFailed) {
      // Không xóa trash item — admin có thể thử lại sau khi sửa schema/FK
      const top = errors[0];
      return {
        ok: false,
        error: `Không khôi phục được bản ghi chính: ${top?.message || 'lỗi không xác định'}`,
        errors,
      };
    }

    await client.from('trash_items').delete().eq('id', trashId);
    return { ok: true, errors };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = {
  snapshotCrmLead,
  snapshotProject,
  snapshotLeadDocument,
  snapshotTaskAttachment,
  restoreTrashItem,
};
