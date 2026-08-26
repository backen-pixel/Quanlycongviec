const { supabase } = require('../config/supabase');

const SALES_PROCESS_KEY = 'sales_lead_qualification_v1';
const QUALIFICATION_STAGE_KEY = 'qualification';
const CRM_LEAD_ENTITY_TYPE = 'crm_lead';
const CUSTOM_FIELD_TYPES = new Set(['text', 'textarea', 'number', 'date', 'select', 'boolean']);
const CUSTOM_FIELD_MODES = new Set(['required', 'optional', 'hidden']);

function text(value) {
  return String(value ?? '').trim();
}

function customFieldError(message, status = 400, code = 'BUSINESS_OS_CUSTOM_FIELD_INVALID') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function isMissingCustomFieldTable(error) {
  const message = String(error?.message || error?.details || '').toLowerCase();
  return message.includes('business_os_custom_field_definitions')
    || message.includes('business_os_custom_field_values')
    || message.includes('business_os_stage_contract_versions')
    || (message.includes('relation') && message.includes('does not exist'));
}

function migrationRequiredError(cause) {
  const error = customFieldError(
    'Chưa cài đặt Dynamic Custom Fields. Chạy migration database/569_business_os_dynamic_custom_fields.sql',
    503,
    'BUSINESS_OS_CUSTOM_FIELDS_MIGRATION_REQUIRED',
  );
  error.cause = cause;
  return error;
}

function normalizeOption(option, index = 0) {
  if (option && typeof option === 'object' && !Array.isArray(option)) {
    const value = text(option.value || option.label);
    if (!value) return null;
    return { value: value.slice(0, 120), label: text(option.label || value).slice(0, 120) };
  }
  const value = text(option);
  if (!value) return null;
  return { value: value.slice(0, 120), label: value.slice(0, 120), order: index };
}

function normalizeOptions(value) {
  const input = Array.isArray(value)
    ? value
    : text(value).split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
  const unique = new Map();
  input.slice(0, 50).forEach((option, index) => {
    const normalized = normalizeOption(option, index);
    if (normalized && !unique.has(normalized.value)) unique.set(normalized.value, normalized);
  });
  return [...unique.values()].map(({ value: optionValue, label }) => ({ value: optionValue, label }));
}

function normalizeValidation(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const result = {};
  const minLength = Number(source.min_length);
  const maxLength = Number(source.max_length);
  const min = Number(source.min);
  const max = Number(source.max);
  if (Number.isInteger(minLength) && minLength >= 0) result.min_length = Math.min(minLength, 5000);
  if (Number.isInteger(maxLength) && maxLength > 0) result.max_length = Math.min(maxLength, 5000);
  if (Number.isFinite(min)) result.min = min;
  if (Number.isFinite(max)) result.max = max;
  if (result.min_length != null && result.max_length != null && result.min_length > result.max_length) {
    throw customFieldError('Độ dài tối thiểu không được lớn hơn độ dài tối đa.');
  }
  if (result.min != null && result.max != null && result.min > result.max) {
    throw customFieldError('Giá trị tối thiểu không được lớn hơn giá trị tối đa.');
  }
  return result;
}

function slugifyVietnamese(value) {
  return text(value)
    .replace(/[đĐ]/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

function customFieldKeyFromLabel(label) {
  return `custom_${slugifyVietnamese(label) || 'truong_moi'}`;
}

function normalizeCustomFieldInput(input = {}, { partial = false } = {}) {
  const label = text(input.label);
  const fieldType = text(input.field_type || 'text').toLowerCase();
  const hasMode = Object.prototype.hasOwnProperty.call(input, 'default_mode')
    || Object.prototype.hasOwnProperty.call(input, 'mode');
  const defaultMode = text(input.default_mode || input.mode || 'optional').toLowerCase();
  if (!partial || Object.prototype.hasOwnProperty.call(input, 'label')) {
    if (label.length < 2 || label.length > 80) {
      throw customFieldError('Tên trường phải có từ 2 đến 80 ký tự.');
    }
  }
  if (!partial && !CUSTOM_FIELD_TYPES.has(fieldType)) {
    throw customFieldError('Kiểu trường không hợp lệ.');
  }
  if ((!partial || hasMode) && !CUSTOM_FIELD_MODES.has(defaultMode)) {
    throw customFieldError('Chế độ trường phải là required, optional hoặc hidden.');
  }
  const options = fieldType === 'select' ? normalizeOptions(input.options) : [];
  if (!partial && fieldType === 'select' && options.length === 0) {
    throw customFieldError('Trường danh sách cần ít nhất một lựa chọn.');
  }
  return {
    ...(label ? { label } : {}),
    ...(!partial ? { field_type: fieldType } : {}),
    ...(!partial || hasMode ? { default_mode: defaultMode } : {}),
    ...(!partial || Object.prototype.hasOwnProperty.call(input, 'placeholder')
      ? { placeholder: text(input.placeholder).slice(0, 240) || null }
      : {}),
    ...(!partial || Object.prototype.hasOwnProperty.call(input, 'help_text')
      ? { help_text: text(input.help_text).slice(0, 500) || null }
      : {}),
    ...(!partial || Object.prototype.hasOwnProperty.call(input, 'options') ? { options } : {}),
    ...(!partial || Object.prototype.hasOwnProperty.call(input, 'validation')
      ? { validation: normalizeValidation(input.validation) }
      : {}),
  };
}

function normalizeCustomFieldDefinition(row = {}) {
  return {
    id: row.id || null,
    key: row.field_key,
    field_key: row.field_key,
    label: row.label,
    custom: true,
    system_required: false,
    edit_field: `custom.${row.field_key}`,
    field_type: row.field_type || 'text',
    default_mode: row.default_mode || 'optional',
    placeholder: row.placeholder || null,
    help_text: row.help_text || null,
    options: normalizeOptions(row.options),
    validation: normalizeValidation(row.validation),
    order_index: Number(row.order_index || 100),
    is_active: row.is_active !== false,
    version: Number(row.version || 1),
  };
}

async function listQualificationCustomFields(companyId, { includeInactive = false } = {}) {
  let query = supabase
    .from('business_os_custom_field_definitions')
    .select('*')
    .eq('company_id', companyId)
    .eq('process_key', SALES_PROCESS_KEY)
    .eq('stage_key', QUALIFICATION_STAGE_KEY)
    .eq('entity_type', CRM_LEAD_ENTITY_TYPE)
    .order('order_index')
    .order('created_at');
  if (!includeInactive) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) {
    if (isMissingCustomFieldTable(error)) return [];
    throw error;
  }
  return (data || []).map(normalizeCustomFieldDefinition);
}

async function nextCustomFieldKey(companyId, label) {
  const base = customFieldKeyFromLabel(label);
  const { data, error } = await supabase
    .from('business_os_custom_field_definitions')
    .select('field_key')
    .eq('company_id', companyId)
    .eq('process_key', SALES_PROCESS_KEY)
    .eq('stage_key', QUALIFICATION_STAGE_KEY)
    .eq('entity_type', CRM_LEAD_ENTITY_TYPE)
    .like('field_key', `${base}%`);
  if (error) {
    if (isMissingCustomFieldTable(error)) throw migrationRequiredError(error);
    throw error;
  }
  const used = new Set((data || []).map((row) => row.field_key));
  if (!used.has(base)) return base;
  for (let suffix = 2; suffix <= 999; suffix += 1) {
    const candidate = `${base.slice(0, 59 - String(suffix).length)}_${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  throw customFieldError('Không thể tạo mã trường duy nhất.', 409, 'BUSINESS_OS_CUSTOM_FIELD_KEY_CONFLICT');
}

async function createQualificationCustomField({ companyId, input, actorUserId }) {
  const normalized = normalizeCustomFieldInput(input);
  const existing = await listQualificationCustomFields(companyId, { includeInactive: true });
  const nextOrder = existing.length
    ? Math.max(...existing.map((field) => Number(field.order_index || 0))) + 10
    : 100;
  const payload = {
    company_id: companyId,
    process_key: SALES_PROCESS_KEY,
    stage_key: QUALIFICATION_STAGE_KEY,
    entity_type: CRM_LEAD_ENTITY_TYPE,
    field_key: await nextCustomFieldKey(companyId, normalized.label),
    ...normalized,
    order_index: nextOrder,
    created_by: actorUserId || null,
    updated_by: actorUserId || null,
  };
  const { data, error } = await supabase
    .from('business_os_custom_field_definitions')
    .insert(payload)
    .select('*')
    .single();
  if (error) {
    if (isMissingCustomFieldTable(error)) throw migrationRequiredError(error);
    if (error.code === '23505') {
      throw customFieldError('Mã trường đã tồn tại.', 409, 'BUSINESS_OS_CUSTOM_FIELD_KEY_CONFLICT');
    }
    throw error;
  }
  return normalizeCustomFieldDefinition(data);
}

async function updateQualificationCustomField({ companyId, fieldId, input, actorUserId }) {
  const normalized = normalizeCustomFieldInput(input, { partial: true });
  const { data: current, error: currentError } = await supabase
    .from('business_os_custom_field_definitions')
    .select('*')
    .eq('id', fieldId)
    .eq('company_id', companyId)
    .eq('process_key', SALES_PROCESS_KEY)
    .eq('stage_key', QUALIFICATION_STAGE_KEY)
    .eq('entity_type', CRM_LEAD_ENTITY_TYPE)
    .eq('is_active', true)
    .maybeSingle();
  if (currentError) {
    if (isMissingCustomFieldTable(currentError)) throw migrationRequiredError(currentError);
    throw currentError;
  }
  if (!current) throw customFieldError('Không tìm thấy trường tùy biến.', 404, 'BUSINESS_OS_CUSTOM_FIELD_NOT_FOUND');
  const payload = {
    ...normalized,
    options: current.field_type === 'select'
      ? (Object.prototype.hasOwnProperty.call(input, 'options') ? normalizeOptions(input.options) : current.options)
      : [],
    version: Number(current.version || 1) + 1,
    updated_by: actorUserId || null,
  };
  if (current.field_type === 'select' && payload.options.length === 0) {
    throw customFieldError('Trường danh sách cần ít nhất một lựa chọn.');
  }
  const { data, error } = await supabase
    .from('business_os_custom_field_definitions')
    .update(payload)
    .eq('id', fieldId)
    .eq('company_id', companyId)
    .select('*')
    .single();
  if (error) throw error;
  return normalizeCustomFieldDefinition(data);
}

async function deactivateQualificationCustomField({ companyId, fieldId, actorUserId }) {
  const { data, error } = await supabase
    .from('business_os_custom_field_definitions')
    .update({ is_active: false, updated_by: actorUserId || null })
    .eq('id', fieldId)
    .eq('company_id', companyId)
    .eq('process_key', SALES_PROCESS_KEY)
    .eq('stage_key', QUALIFICATION_STAGE_KEY)
    .eq('entity_type', CRM_LEAD_ENTITY_TYPE)
    .eq('is_active', true)
    .select('*')
    .maybeSingle();
  if (error) {
    if (isMissingCustomFieldTable(error)) throw migrationRequiredError(error);
    throw error;
  }
  if (!data) throw customFieldError('Không tìm thấy trường tùy biến.', 404, 'BUSINESS_OS_CUSTOM_FIELD_NOT_FOUND');
  return normalizeCustomFieldDefinition(data);
}

function isEmptyCustomFieldValue(value, fieldType) {
  if (value == null) return true;
  if (fieldType === 'boolean') return value === '';
  if (fieldType === 'number') return value === '';
  return typeof value === 'string' ? value.trim() === '' : false;
}

function normalizeCustomFieldValue(field, value) {
  const type = field.field_type;
  if (isEmptyCustomFieldValue(value, type)) return null;
  if (type === 'boolean') {
    if (value === true || value === false) return value;
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
    throw customFieldError(`${field.label}: giá trị Có/Không không hợp lệ.`);
  }
  if (type === 'number') {
    const number = Number(value);
    if (!Number.isFinite(number)) throw customFieldError(`${field.label}: vui lòng nhập số hợp lệ.`);
    if (field.validation?.min != null && number < field.validation.min) {
      throw customFieldError(`${field.label}: giá trị tối thiểu là ${field.validation.min}.`);
    }
    if (field.validation?.max != null && number > field.validation.max) {
      throw customFieldError(`${field.label}: giá trị tối đa là ${field.validation.max}.`);
    }
    return number;
  }
  if (type === 'date') {
    const date = text(value);
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
    if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      throw customFieldError(`${field.label}: ngày không hợp lệ.`);
    }
    return date;
  }
  if (type === 'select') {
    const selected = text(value);
    if (!field.options.some((option) => option.value === selected)) {
      throw customFieldError(`${field.label}: lựa chọn không hợp lệ.`);
    }
    return selected;
  }
  const stringValue = String(value).trim();
  const minLength = field.validation?.min_length;
  const maxLength = field.validation?.max_length || (type === 'textarea' ? 5000 : 500);
  if (minLength != null && stringValue.length < minLength) {
    throw customFieldError(`${field.label}: cần tối thiểu ${minLength} ký tự.`);
  }
  if (stringValue.length > maxLength) {
    throw customFieldError(`${field.label}: tối đa ${maxLength} ký tự.`);
  }
  return stringValue;
}

function customFieldValueComplete(field, value) {
  if (isEmptyCustomFieldValue(value, field.field_type)) return false;
  try {
    normalizeCustomFieldValue(field, value);
    return true;
  } catch {
    return false;
  }
}

function customFieldDisplayValue(field, value) {
  if (isEmptyCustomFieldValue(value, field.field_type)) return null;
  if (field.field_type === 'boolean') return value === true ? 'Có' : 'Không';
  if (field.field_type === 'select') {
    return field.options.find((option) => option.value === value)?.label || text(value) || null;
  }
  return value;
}

async function loadCustomFieldValuesByRecords({ companyId, recordIds, definitions = null }) {
  const ids = [...new Set((recordIds || []).map(text).filter(Boolean))];
  const fields = definitions || await listQualificationCustomFields(companyId);
  const valuesByRecord = new Map(ids.map((id) => [id, {}]));
  if (!ids.length || !fields.length) return valuesByRecord;
  const fieldById = new Map(fields.map((field) => [String(field.id), field]));
  const { data, error } = await supabase
    .from('business_os_custom_field_values')
    .select('field_definition_id, record_id, value')
    .eq('company_id', companyId)
    .eq('record_type', CRM_LEAD_ENTITY_TYPE)
    .in('record_id', ids)
    .in('field_definition_id', [...fieldById.keys()]);
  if (error) {
    if (isMissingCustomFieldTable(error)) return valuesByRecord;
    throw error;
  }
  for (const row of data || []) {
    const field = fieldById.get(String(row.field_definition_id));
    if (!field) continue;
    const recordKey = String(row.record_id);
    if (!valuesByRecord.has(recordKey)) valuesByRecord.set(recordKey, {});
    valuesByRecord.get(recordKey)[field.key] = row.value;
  }
  return valuesByRecord;
}

async function saveQualificationCustomFieldValues({ companyId, leadId, values, actorUserId }) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    throw customFieldError('values phải là một object theo mã trường.');
  }
  const fields = await listQualificationCustomFields(companyId);
  const fieldByKey = new Map(fields.map((field) => [field.key, field]));
  const requestedKeys = Object.keys(values);
  const unknown = requestedKeys.filter((key) => !fieldByKey.has(key));
  if (unknown.length) throw customFieldError(`Trường tùy biến không hợp lệ: ${unknown.join(', ')}`);

  const currentMap = await loadCustomFieldValuesByRecords({ companyId, recordIds: [leadId], definitions: fields });
  const before = currentMap.get(String(leadId)) || {};
  const normalized = {};
  for (const key of requestedKeys) normalized[key] = normalizeCustomFieldValue(fieldByKey.get(key), values[key]);

  const rows = requestedKeys
    .filter((key) => normalized[key] !== null)
    .map((key) => ({
      company_id: companyId,
      field_definition_id: fieldByKey.get(key).id,
      record_type: CRM_LEAD_ENTITY_TYPE,
      record_id: leadId,
      value: normalized[key],
      created_by: actorUserId || null,
      updated_by: actorUserId || null,
    }));
  if (rows.length) {
    const { error } = await supabase
      .from('business_os_custom_field_values')
      .upsert(rows, { onConflict: 'field_definition_id,record_type,record_id' });
    if (error) {
      if (isMissingCustomFieldTable(error)) throw migrationRequiredError(error);
      throw error;
    }
  }
  const deleteIds = requestedKeys
    .filter((key) => normalized[key] === null)
    .map((key) => fieldByKey.get(key).id);
  if (deleteIds.length) {
    const { error } = await supabase
      .from('business_os_custom_field_values')
      .delete()
      .eq('company_id', companyId)
      .eq('record_type', CRM_LEAD_ENTITY_TYPE)
      .eq('record_id', leadId)
      .in('field_definition_id', deleteIds);
    if (error) throw error;
  }
  const after = { ...before, ...normalized };
  Object.keys(after).forEach((key) => { if (after[key] === null) delete after[key]; });
  const { error: auditError } = await supabase.from('work_audit_logs').insert({
    company_id: companyId,
    actor_user_id: actorUserId || null,
    entity_type: 'business_os_custom_fields',
    entity_id: leadId,
    action: 'business_os.custom_fields.updated',
    before,
    after,
  });
  if (auditError) throw auditError;
  return after;
}

module.exports = {
  SALES_PROCESS_KEY,
  QUALIFICATION_STAGE_KEY,
  CRM_LEAD_ENTITY_TYPE,
  CUSTOM_FIELD_TYPES,
  CUSTOM_FIELD_MODES,
  customFieldKeyFromLabel,
  normalizeOptions,
  normalizeValidation,
  normalizeCustomFieldInput,
  normalizeCustomFieldDefinition,
  normalizeCustomFieldValue,
  customFieldValueComplete,
  customFieldDisplayValue,
  isMissingCustomFieldTable,
  listQualificationCustomFields,
  createQualificationCustomField,
  updateQualificationCustomField,
  deactivateQualificationCustomField,
  loadCustomFieldValuesByRecords,
  saveQualificationCustomFieldValues,
};
