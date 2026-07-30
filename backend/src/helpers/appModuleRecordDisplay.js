/** Chuẩn hóa bản ghi module để UI giống CRM lead/deal card + detail. */

const NEW_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

function sanitizeName(raw) {
  let name = String(raw || '').trim();
  if (/^undefined/i.test(name)) {
    name = name.replace(/^undefined\s*/i, '').trim();
  }
  return name;
}

function buildCode(row, meta) {
  if (meta?.code) return String(meta.code);
  if (row?.code) return String(row.code);
  const idShort = String(row?.id || '').replace(/-/g, '').slice(0, 8).toUpperCase();
  return idShort ? `AM-${idShort}` : null;
}

function decorateAppModuleRecord(row) {
  if (!row) return row;
  const meta = row.meta && typeof row.meta === 'object' && !Array.isArray(row.meta) ? { ...row.meta } : {};
  const name = sanitizeName(row.name);
  const code = buildCode(row, meta);
  const deadline = meta.kanban_deadline_at || meta.deadline || null;
  const createdMs = row.created_at ? new Date(row.created_at).getTime() : 0;
  const isNewDefault = createdMs > 0 && (Date.now() - createdMs) < NEW_WINDOW_MS;
  const typeName = meta.record_type || meta.type_name || null;

  return {
    ...row,
    name,
    title: name,
    code,
    meta,
    estimated_value: Number(meta.estimated_value) || 0,
    kanban_deadline_at: deadline,
    is_pinned: !!meta.is_pinned,
    is_interacted: !!meta.is_interacted,
    is_new_for_current_user:
      meta.is_new_for_current_user != null ? !!meta.is_new_for_current_user : isNewDefault,
    lost_reason: meta.lost_reason || null,
    customer: {
      full_name: meta.customer_name || meta.customer?.full_name || null,
      phone: meta.customer_phone || meta.customer?.phone || null,
      email: meta.customer_email || meta.customer?.email || null,
    },
    record_type: typeName
      ? { name: typeName, color: meta.type_color || '#6d28d9' }
      : null,
    crm_region: meta.region_name ? { name: meta.region_name } : null,
  };
}

function decorateAppModuleRecords(rows) {
  return (rows || []).map(decorateAppModuleRecord);
}

const RECORD_LIST_SELECT = [
  '*',
  'stage:app_module_pipeline_stages(id, name, color, icon, order_index, crm_target_stage_id, tab_id, is_done, is_lost)',
  'assignee:users!assignee_id(id, full_name)',
  'company:companies!company_id(id, name, short_name)',
  'creator:users!created_by(id, full_name)',
].join(', ');

const RECORD_DETAIL_SELECT = [
  '*',
  'stage:app_module_pipeline_stages(*)',
  'assignee:users!assignee_id(id, full_name)',
  'company:companies!company_id(id, name, short_name)',
  'creator:users!created_by(id, full_name)',
  'tasks:app_module_tasks(*, assignee:users!assignee_id(id, full_name))',
].join(', ');

module.exports = {
  decorateAppModuleRecord,
  decorateAppModuleRecords,
  RECORD_LIST_SELECT,
  RECORD_DETAIL_SELECT,
  sanitizeName,
};
