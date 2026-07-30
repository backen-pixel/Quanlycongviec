/** Client-side: đồng bộ field flat từ meta (sau PATCH) giống decorate backend. */

const NEW_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export function sanitizeAppModuleRecordName(raw) {
  let name = String(raw || '').trim();
  if (/^undefined/i.test(name)) {
    name = name.replace(/^undefined\s*/i, '').trim();
  }
  return name;
}

export function decorateAppModuleRecord(row) {
  if (!row) return row;
  const meta = row.meta && typeof row.meta === 'object' && !Array.isArray(row.meta) ? { ...row.meta } : {};
  const name = sanitizeAppModuleRecordName(row.name);
  const idShort = String(row.id || '').replace(/-/g, '').slice(0, 8).toUpperCase();
  const code = meta.code || row.code || (idShort ? `AM-${idShort}` : null);
  const deadline = meta.kanban_deadline_at || meta.deadline || row.kanban_deadline_at || null;
  const createdMs = row.created_at ? new Date(row.created_at).getTime() : 0;
  const isNewDefault = createdMs > 0 && (Date.now() - createdMs) < NEW_WINDOW_MS;
  const typeName = meta.record_type || meta.type_name || row.record_type?.name || null;

  return {
    ...row,
    name,
    title: name,
    code,
    meta,
    estimated_value: Number(meta.estimated_value ?? row.estimated_value) || 0,
    kanban_deadline_at: deadline,
    is_pinned: meta.is_pinned != null ? !!meta.is_pinned : !!row.is_pinned,
    is_interacted: meta.is_interacted != null ? !!meta.is_interacted : !!row.is_interacted,
    is_new_for_current_user:
      meta.is_new_for_current_user != null
        ? !!meta.is_new_for_current_user
        : (row.is_new_for_current_user != null ? !!row.is_new_for_current_user : isNewDefault),
    lost_reason: meta.lost_reason || row.lost_reason || null,
    customer: {
      full_name: meta.customer_name || meta.customer?.full_name || row.customer?.full_name || null,
      phone: meta.customer_phone || meta.customer?.phone || row.customer?.phone || null,
      email: meta.customer_email || meta.customer?.email || row.customer?.email || null,
    },
    record_type: typeName
      ? { name: typeName, color: meta.type_color || row.record_type?.color || '#6d28d9' }
      : null,
    crm_region: meta.region_name
      ? { name: meta.region_name }
      : (row.crm_region || null),
  };
}

export function decorateAppModuleRecords(rows) {
  return (rows || []).map(decorateAppModuleRecord);
}
