const CHANGE_TYPES = new Set([
  'operational_incident',
  'customer_request',
  'design_change',
  'material_change',
  'quantity_change',
  'site_condition',
  'rework',
  'commercial_change',
  'other',
]);
const PROJECT_PHASE_KEYS = new Set([
  'design', 'procurement', 'production', 'quality', 'packing',
  'delivery', 'installation', 'acceptance',
]);
const CHANGE_SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);
const CHANGE_STATUSES = new Set(['open', 'in_progress', 'resolved', 'closed']);
const COST_BEARERS = new Set(['company', 'customer', 'supplier', 'employee', 'shared', 'undetermined']);
const APPROVAL_SENSITIVE_FIELDS = new Set([
  'change_type', 'title', 'cause', 'description', 'phase_key', 'owner_user_id',
  'severity', 'cost_impact', 'schedule_impact_days', 'cost_bearer',
  'attachments', 'related_links',
]);

function cleanText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function parseNonNegativeNumber(value, label, { integer = false } = {}) {
  if (value === null || value === undefined || value === '') return { value: null };
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || (integer && !Number.isInteger(number))) {
    return { error: `${label} phải là số ${integer ? 'nguyên ' : ''}không âm` };
  }
  return { value: number };
}

function cleanFileList(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 30).filter((file) => file && typeof file === 'object').map((file) => ({
    file_name: cleanText(file.file_name || file.original_name) || 'Tệp đính kèm',
    file_url: cleanText(file.file_url || file.url),
    file_size: Number.isFinite(Number(file.file_size)) ? Number(file.file_size) : null,
    mime_type: cleanText(file.mime_type),
  })).filter((file) => file.file_url);
}

function cleanRelatedLinks(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 30).filter((item) => item && typeof item === 'object').map((item) => ({
    kind: cleanText(item.kind) || 'link',
    id: cleanText(item.id),
    label: cleanText(item.label),
    url: cleanText(item.url),
  })).filter((item) => item.id || item.url);
}

function validateProjectChangePayload(body = {}, { partial = false } = {}) {
  const value = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);

  if (!partial || has('title')) {
    value.title = cleanText(body.title);
    if (!value.title) return { ok: false, error: 'Nhập tiêu đề phát sinh' };
    if (value.title.length > 255) return { ok: false, error: 'Tiêu đề phát sinh tối đa 255 ký tự' };
  }

  if (!partial || has('change_type')) {
    value.change_type = cleanText(body.change_type) || 'operational_incident';
    if (!CHANGE_TYPES.has(value.change_type)) return { ok: false, error: 'Loại phát sinh không hợp lệ' };
  }

  if (!partial || has('cause')) {
    value.cause = cleanText(body.cause) || (!partial ? cleanText(body.description) : null);
    if (!value.cause) return { ok: false, error: 'Nhập nguyên nhân phát sinh' };
  }

  if (has('description')) value.description = cleanText(body.description);
  if (!partial && !has('description')) value.description = null;

  if (!partial || has('severity')) {
    value.severity = cleanText(body.severity) || 'medium';
    if (!CHANGE_SEVERITIES.has(value.severity)) return { ok: false, error: 'Mức độ phát sinh không hợp lệ' };
  }

  if (has('status')) {
    value.status = cleanText(body.status);
    if (!CHANGE_STATUSES.has(value.status)) return { ok: false, error: 'Trạng thái phát sinh không hợp lệ' };
  }

  if (has('phase_key')) {
    value.phase_key = cleanText(body.phase_key);
    if (value.phase_key && !PROJECT_PHASE_KEYS.has(value.phase_key)) return { ok: false, error: 'Chặng Project không hợp lệ' };
  } else if (!partial) value.phase_key = null;

  if (has('owner_user_id')) value.owner_user_id = cleanText(body.owner_user_id);
  else if (!partial) value.owner_user_id = null;

  if (has('cost_impact')) {
    const parsed = parseNonNegativeNumber(body.cost_impact, 'Ảnh hưởng chi phí');
    if (parsed.error) return { ok: false, error: parsed.error };
    value.cost_impact = parsed.value;
  } else if (!partial) value.cost_impact = null;

  if (has('schedule_impact_days')) {
    const parsed = parseNonNegativeNumber(body.schedule_impact_days, 'Ảnh hưởng tiến độ', { integer: true });
    if (parsed.error) return { ok: false, error: parsed.error };
    value.schedule_impact_days = parsed.value;
  } else if (!partial) value.schedule_impact_days = null;

  if (has('cost_bearer')) {
    value.cost_bearer = cleanText(body.cost_bearer);
    if (value.cost_bearer && !COST_BEARERS.has(value.cost_bearer)) return { ok: false, error: 'Bên chịu chi phí không hợp lệ' };
  } else if (!partial) value.cost_bearer = null;

  if (has('requires_approval')) value.requires_approval = body.requires_approval === true;
  else if (!partial) value.requires_approval = false;

  if (has('attachments')) value.attachments = cleanFileList(body.attachments);
  else if (!partial) value.attachments = [];

  if (has('related_links')) value.related_links = cleanRelatedLinks(body.related_links);
  else if (!partial) value.related_links = [];

  return { ok: true, value };
}

function hasApprovalSensitiveChanges(body = {}) {
  return Object.keys(body).some((key) => APPROVAL_SENSITIVE_FIELDS.has(key));
}

async function validateProjectChangeOwnerForProject(db, projectId, ownerUserId) {
  if (!ownerUserId) return { ok: true };
  const [{ data: project, error: projectError }, { data: owner, error: ownerError }] = await Promise.all([
    db.from('projects').select('id, company_id, logistics_company_id').eq('id', projectId).maybeSingle(),
    db.from('users')
      .select('id, company_id, department:departments!users_department_id_fkey(company_id)')
      .eq('id', ownerUserId)
      .maybeSingle(),
  ]);
  if (projectError) throw projectError;
  if (ownerError) throw ownerError;
  if (!owner) return { ok: false, error: 'Người chịu trách nhiệm không tồn tại' };
  const ownerCompanyId = owner.company_id || owner.department?.company_id || null;
  const allowedCompanyIds = new Set([project?.company_id, project?.logistics_company_id].filter(Boolean).map(String));
  if (!ownerCompanyId || !allowedCompanyIds.has(String(ownerCompanyId))) {
    return { ok: false, error: 'Người chịu trách nhiệm không thuộc đơn vị thực hiện Project' };
  }
  return { ok: true };
}

module.exports = {
  CHANGE_TYPES,
  PROJECT_PHASE_KEYS,
  CHANGE_SEVERITIES,
  CHANGE_STATUSES,
  COST_BEARERS,
  APPROVAL_SENSITIVE_FIELDS,
  hasApprovalSensitiveChanges,
  validateProjectChangeOwnerForProject,
  validateProjectChangePayload,
};
