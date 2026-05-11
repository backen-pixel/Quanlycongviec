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
  const { data, error } = await sb
    .from('trash_items')
    .upsert(row, { onConflict: 'entity_type,entity_id' })
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return data?.id;
}

async function snapshotCrmLead(sb, leadId, deletedBy) {
  const client = getClient(sb);
  try {
    const { data: lead } = await client.from('crm_leads').select('*').eq('id', leadId).maybeSingle();
    if (!lead) return { ok: false, error: 'Lead không tồn tại' };

    const { data: children } = await client.from('crm_leads').select('*').eq('parent_lead_id', leadId);
    const { data: documents } = await client.from('lead_documents').select('*').eq('lead_id', leadId);
    const { data: activities } = await client.from('crm_activities').select('*').eq('lead_id', leadId);
    const { data: tasks } = await client.from('crm_tasks').select('*').eq('lead_id', leadId);

    const trashId = await insertTrashRow(client, {
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
    });
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

// Cố gắng insert lại 1 row vào bảng đích; bỏ qua lỗi UNIQUE (row đã tồn tại)
async function safeInsert(sb, table, row) {
  if (!row) return;
  const { error } = await sb.from(table).upsert(row, { onConflict: 'id' });
  if (error) {
    console.warn(`[trash:restore] upsert ${table} failed:`, error.message);
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
    if (row.entity_type === 'crm_lead') {
      // Restore lead chính trước, sau đó children, rồi các bảng liên quan
      await safeInsert(client, 'crm_leads', snap.lead);
      for (const child of snap.children || []) await safeInsert(client, 'crm_leads', child);
      for (const doc of snap.documents || []) await safeInsert(client, 'lead_documents', doc);
      for (const act of snap.activities || []) await safeInsert(client, 'crm_activities', act);
      for (const tk of snap.tasks || []) await safeInsert(client, 'crm_tasks', tk);
    } else if (row.entity_type === 'lead_document') {
      await safeInsert(client, 'lead_documents', snap.document);
    } else if (row.entity_type === 'crm_task_attachment') {
      await safeInsert(client, 'crm_task_attachments', snap.attachment);
    } else {
      return { ok: false, error: `Loại không hỗ trợ: ${row.entity_type}` };
    }

    await client.from('trash_items').delete().eq('id', trashId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = {
  snapshotCrmLead,
  snapshotLeadDocument,
  snapshotTaskAttachment,
  restoreTrashItem,
};
