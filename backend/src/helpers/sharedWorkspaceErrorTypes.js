/**
 * Danh mục loại lỗi Không gian chung + NV mặc định theo vai trò.
 */
const { supabase } = require('../config/supabase');
const { isAdminLike, isSystemAdmin } = require('./adminRole');
const { normalizeAssignRole } = require('./assignmentAssigneeRoles');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCE_KINDS = new Set(['customer_request', 'employee_error']);

function normalizeErrorTypeId(raw) {
  if (raw === undefined) return undefined;
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  return UUID_RE.test(s) ? s : null;
}

function normalizeSourceKind(raw, fallback = 'employee_error') {
  const v = String(raw || '').trim().toLowerCase();
  return SOURCE_KINDS.has(v) ? v : fallback;
}

function isErrorTypeSchemaError(err) {
  const m = String(err?.message || '').toLowerCase();
  return m.includes('shared_workspace_error_types')
    || m.includes('shared_workspace_error_type_staff')
    || m.includes('error_type_id');
}

function resolveStaffCompanyId(req, requested) {
  if (isSystemAdmin(req.user)) {
    const q = requested && String(requested).trim();
    return UUID_RE.test(q || '') ? q : (req.user?.company_id || null);
  }
  if (req.user?.company_id) return String(req.user.company_id);
  return requested && UUID_RE.test(String(requested)) ? String(requested) : null;
}

function canManageErrorTypes(req) {
  return isAdminLike(req.user);
}

async function listErrorTypes({ companyId, includeInactive = false } = {}) {
  let q = supabase
    .from('shared_workspace_error_types')
    .select('id, company_id, name, slug, source_kind, is_active, sort_order, created_at, updated_at')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (!includeInactive) q = q.eq('is_active', true);
  if (companyId) {
    q = q.or(`company_id.is.null,company_id.eq.${companyId}`);
  } else {
    q = q.is('company_id', null);
  }
  const { data, error } = await q;
  if (error) {
    if (isErrorTypeSchemaError(error)) return [];
    throw error;
  }
  const types = data || [];
  if (!types.length) return [];
  const { data: staffRows, error: staffErr } = await supabase
    .from('shared_workspace_error_type_staff')
    .select('error_type_id, user_id, role, user:users(id, full_name, email, avatar, company_id)')
    .in('error_type_id', types.map((t) => t.id));
  if (staffErr && !isErrorTypeSchemaError(staffErr)) throw staffErr;
  const byType = new Map();
  for (const s of staffRows || []) {
    if (!byType.has(s.error_type_id)) byType.set(s.error_type_id, []);
    byType.get(s.error_type_id).push({
      user_id: s.user_id,
      role: normalizeAssignRole(s.role, 'executor'),
      user: s.user || null,
    });
  }
  return types.map((t) => ({ ...t, staff: byType.get(t.id) || [] }));
}

async function replaceErrorTypeStaff(errorTypeId, staff) {
  await supabase
    .from('shared_workspace_error_type_staff')
    .delete()
    .eq('error_type_id', errorTypeId);
  const seen = new Set();
  const rows = [];
  for (const s of staff || []) {
    const uid = String(s?.user_id || s?.id || '').trim();
    if (!UUID_RE.test(uid) || seen.has(uid)) continue;
    seen.add(uid);
    rows.push({
      error_type_id: errorTypeId,
      company_id: null,
      user_id: uid,
      role: normalizeAssignRole(s.role, 'executor'),
    });
  }
  if (!rows.length) return [];
  const { error } = await supabase.from('shared_workspace_error_type_staff').insert(rows);
  if (error) throw error;
  return rows;
}

module.exports = {
  UUID_RE,
  SOURCE_KINDS,
  normalizeErrorTypeId,
  normalizeSourceKind,
  isErrorTypeSchemaError,
  resolveStaffCompanyId,
  canManageErrorTypes,
  listErrorTypes,
  replaceErrorTypeStaff,
};
