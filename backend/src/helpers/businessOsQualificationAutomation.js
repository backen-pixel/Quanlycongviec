const { randomUUID } = require('crypto');
const { supabase } = require('../config/supabase');
const { addBusinessMinutes } = require('../services/businessHours');
const { getCompanyScopedAdminIds } = require('./notifications');

const SALES_PROCESS_KEY = 'sales_lead_qualification_v1';
const QUALIFICATION_STAGE_KEY = 'qualification';
const QUALIFICATION_TASK_STAGE_SLUG = 'qualification';
const DEFAULT_SLA_DURATION_MINUTES = 2 * 8 * 60;
const DEFAULT_SLA_WARNING_MINUTES = 4 * 60;
const MAX_TASK_ITEMS = 20;

const DEFAULT_TASK_ITEMS = [
  {
    item_key: 'verify_customer_need',
    title: 'Xác minh nhu cầu và khả năng phục vụ',
    description: 'Liên hệ khách hàng, làm rõ nhu cầu cốt lõi và xác nhận doanh nghiệp có thể phục vụ.',
    priority: 'high',
    deadline_minutes: 120,
    order_index: 1,
    assignment_strategy: 'record_owner',
    blocks_stage_advance: true,
    completion_requires_file_or_note: false,
    required_evidence_file_types: [],
    requires_quick_verdict: false,
  },
  {
    item_key: 'record_qualification_verdict',
    title: 'Ghi nhận kết luận Qualification',
    description: 'Chốt kết luận đủ điều kiện hoặc cần bổ sung và ghi rõ lý do.',
    priority: 'high',
    deadline_minutes: 480,
    order_index: 2,
    assignment_strategy: 'record_owner',
    blocks_stage_advance: true,
    completion_requires_file_or_note: false,
    required_evidence_file_types: [],
    requires_quick_verdict: true,
  },
  {
    item_key: 'plan_next_action',
    title: 'Lập hành động tiếp theo',
    description: 'Ghi lịch follow-up, khảo sát hoặc bước xử lý tiếp theo cho cơ hội.',
    priority: 'medium',
    deadline_minutes: 960,
    order_index: 3,
    assignment_strategy: 'record_owner',
    blocks_stage_advance: false,
    completion_requires_file_or_note: false,
    required_evidence_file_types: [],
    requires_quick_verdict: false,
  },
];

function text(value) {
  return String(value || '').trim();
}

function integerInRange(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function booleanValue(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function itemKeyFromTitle(value, index = 0) {
  const base = text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  const safe = /^[a-z]/.test(base) ? base : `task_${base || index + 1}`;
  return `${safe || 'task'}_${String(index + 1).padStart(2, '0')}`.slice(0, 64);
}

function normalizeEvidenceTypes(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(text).filter(Boolean))].slice(0, 20);
}

function normalizeTaskItems(rawItems, { useDefaults = false } = {}) {
  const source = Array.isArray(rawItems) ? rawItems : (useDefaults ? DEFAULT_TASK_ITEMS : []);
  const usedKeys = new Set();
  return source.slice(0, MAX_TASK_ITEMS).map((raw, index) => {
    const value = raw && typeof raw === 'object' ? raw : {};
    const title = text(value.title).slice(0, 240);
    if (!title) {
      const error = new Error(`Nhiệm vụ số ${index + 1} chưa có tên.`);
      error.status = 400;
      throw error;
    }
    let itemKey = text(value.item_key || value.key).toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!/^[a-z][a-z0-9_]{2,63}$/.test(itemKey)) itemKey = itemKeyFromTitle(title, index);
    while (usedKeys.has(itemKey)) itemKey = `${itemKey.slice(0, 55)}_${randomUUID().slice(0, 6)}`;
    usedKeys.add(itemKey);
    const priority = ['low', 'medium', 'high', 'urgent'].includes(value.priority)
      ? value.priority
      : 'medium';
    const assignmentStrategy = ['record_owner', 'actor', 'unassigned'].includes(value.assignment_strategy)
      ? value.assignment_strategy
      : 'record_owner';
    return {
      id: value.id || null,
      item_key: itemKey,
      title,
      description: text(value.description).slice(0, 2000) || null,
      priority,
      deadline_minutes: integerInRange(value.deadline_minutes, 0, 0, 43200),
      order_index: index + 1,
      assignment_strategy: assignmentStrategy,
      blocks_stage_advance: booleanValue(value.blocks_stage_advance, false),
      completion_requires_file_or_note: booleanValue(value.completion_requires_file_or_note, false),
      required_evidence_file_types: normalizeEvidenceTypes(value.required_evidence_file_types),
      requires_quick_verdict: booleanValue(value.requires_quick_verdict, false),
      is_active: value.is_active !== false,
    };
  });
}

function normalizeQualificationAutomation(raw = {}, taskItems = null) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const persisted = !!value.id;
  const itemsSource = Array.isArray(taskItems)
    ? taskItems
    : (Array.isArray(value.task_items) ? value.task_items : null);
  const slaDurationMinutes = integerInRange(
    value.sla_duration_minutes,
    DEFAULT_SLA_DURATION_MINUTES,
    15,
    43200,
  );
  const slaWarningMinutes = integerInRange(
    value.sla_warning_minutes,
    DEFAULT_SLA_WARNING_MINUTES,
    0,
    slaDurationMinutes,
  );
  return {
    id: value.id || null,
    company_id: value.company_id || null,
    process_key: SALES_PROCESS_KEY,
    stage_key: QUALIFICATION_STAGE_KEY,
    name: text(value.name) || 'Automation Qualification',
    persisted,
    storage_mode: persisted ? 'company_automation' : 'default_automation',
    is_active: value.is_active !== false,
    version: Number(value.version || 1),
    sla_policy: {
      duration_minutes: slaDurationMinutes,
      warning_minutes: slaWarningMinutes,
      escalate_at_risk_to_owner: booleanValue(value.escalate_at_risk_to_owner, true),
      escalate_overdue_to_owner: booleanValue(value.escalate_overdue_to_owner, true),
      escalate_overdue_to_company_admins: booleanValue(value.escalate_overdue_to_company_admins, true),
    },
    task_items: normalizeTaskItems(itemsSource, { useDefaults: !persisted && !Array.isArray(itemsSource) }),
  };
}

function isMissingAutomationTable(error) {
  const message = String(error?.message || error?.details || '').toLowerCase();
  return message.includes('business_os_stage_automations')
    || message.includes('business_os_stage_task_template_items')
    || message.includes('business_os_stage_automation_versions')
    || message.includes('business_os_sla_escalations')
    || (message.includes('relation') && message.includes('does not exist'));
}

function migrationRequiredError(cause) {
  const error = new Error('Chưa cài đặt Qualification automation. Chạy migration database/570_business_os_qualification_automation.sql');
  error.code = 'BUSINESS_OS_QUALIFICATION_AUTOMATION_MIGRATION_REQUIRED';
  error.status = 503;
  error.cause = cause;
  return error;
}

async function getQualificationAutomation(companyId) {
  const { data, error } = await supabase
    .from('business_os_stage_automations')
    .select('*')
    .eq('company_id', companyId)
    .eq('process_key', SALES_PROCESS_KEY)
    .eq('stage_key', QUALIFICATION_STAGE_KEY)
    .eq('is_active', true)
    .maybeSingle();
  if (error) {
    if (isMissingAutomationTable(error)) {
      return normalizeQualificationAutomation({ company_id: companyId });
    }
    throw error;
  }
  if (!data) return normalizeQualificationAutomation({ company_id: companyId });
  const { data: items, error: itemsError } = await supabase
    .from('business_os_stage_task_template_items')
    .select('*')
    .eq('automation_id', data.id)
    .eq('is_active', true)
    .order('order_index')
    .order('created_at');
  if (itemsError) {
    if (isMissingAutomationTable(itemsError)) throw migrationRequiredError(itemsError);
    throw itemsError;
  }
  return normalizeQualificationAutomation(data, items || []);
}

function snapshotPayload(automation) {
  return {
    name: automation.name,
    is_active: automation.is_active,
    sla_duration_minutes: automation.sla_policy.duration_minutes,
    sla_warning_minutes: automation.sla_policy.warning_minutes,
    escalate_at_risk_to_owner: automation.sla_policy.escalate_at_risk_to_owner,
    escalate_overdue_to_owner: automation.sla_policy.escalate_overdue_to_owner,
    escalate_overdue_to_company_admins: automation.sla_policy.escalate_overdue_to_company_admins,
  };
}

async function saveQualificationAutomation({
  companyId,
  input,
  actorUserId,
  changeType = 'update',
  sourceVersion = null,
}) {
  const raw = input && typeof input === 'object' ? input : {};
  const current = await getQualificationAutomation(companyId);
  const normalized = normalizeQualificationAutomation({
    ...raw,
    id: current.id,
    company_id: companyId,
    version: Number(current.persisted ? current.version : 0) + 1,
    sla_duration_minutes: raw.sla_policy?.duration_minutes ?? raw.sla_duration_minutes,
    sla_warning_minutes: raw.sla_policy?.warning_minutes ?? raw.sla_warning_minutes,
    escalate_at_risk_to_owner: raw.sla_policy?.escalate_at_risk_to_owner
      ?? raw.escalate_at_risk_to_owner,
    escalate_overdue_to_owner: raw.sla_policy?.escalate_overdue_to_owner
      ?? raw.escalate_overdue_to_owner,
    escalate_overdue_to_company_admins: raw.sla_policy?.escalate_overdue_to_company_admins
      ?? raw.escalate_overdue_to_company_admins,
    task_items: Array.isArray(raw.task_items) ? raw.task_items : current.task_items,
  }, Array.isArray(raw.task_items) ? raw.task_items : current.task_items);

  if (normalized.sla_policy.warning_minutes > normalized.sla_policy.duration_minutes) {
    const error = new Error('Thời gian cảnh báo SLA không được lớn hơn thời lượng SLA.');
    error.status = 400;
    throw error;
  }

  const payload = {
    company_id: companyId,
    process_key: SALES_PROCESS_KEY,
    stage_key: QUALIFICATION_STAGE_KEY,
    name: normalized.name,
    sla_duration_minutes: normalized.sla_policy.duration_minutes,
    sla_warning_minutes: normalized.sla_policy.warning_minutes,
    escalate_at_risk_to_owner: normalized.sla_policy.escalate_at_risk_to_owner,
    escalate_overdue_to_owner: normalized.sla_policy.escalate_overdue_to_owner,
    escalate_overdue_to_company_admins: normalized.sla_policy.escalate_overdue_to_company_admins,
    is_active: true,
    version: Number(current.persisted ? current.version : 0) + 1,
    created_by: current.persisted ? undefined : (actorUserId || null),
    updated_by: actorUserId || null,
  };
  if (payload.created_by === undefined) delete payload.created_by;

  const { data: saved, error: saveError } = await supabase
    .from('business_os_stage_automations')
    .upsert(payload, { onConflict: 'company_id,process_key,stage_key' })
    .select('*')
    .single();
  if (saveError) {
    if (isMissingAutomationTable(saveError)) throw migrationRequiredError(saveError);
    throw saveError;
  }

  const { data: existingItems, error: existingError } = await supabase
    .from('business_os_stage_task_template_items')
    .select('id, item_key')
    .eq('automation_id', saved.id);
  if (existingError) throw existingError;
  const activeKeys = normalized.task_items.map((item) => item.item_key);
  const removedIds = (existingItems || [])
    .filter((item) => !activeKeys.includes(item.item_key))
    .map((item) => item.id);
  if (removedIds.length) {
    const { error: removeError } = await supabase
      .from('business_os_stage_task_template_items')
      .update({ is_active: false, updated_by: actorUserId || null })
      .in('id', removedIds);
    if (removeError) throw removeError;
  }

  if (normalized.task_items.length) {
    const rows = normalized.task_items.map((item) => ({
      automation_id: saved.id,
      item_key: item.item_key,
      title: item.title,
      description: item.description,
      priority: item.priority,
      deadline_minutes: item.deadline_minutes,
      order_index: item.order_index,
      assignment_strategy: item.assignment_strategy,
      blocks_stage_advance: item.blocks_stage_advance,
      completion_requires_file_or_note: item.completion_requires_file_or_note,
      required_evidence_file_types: item.required_evidence_file_types,
      requires_quick_verdict: item.requires_quick_verdict,
      is_active: true,
      created_by: actorUserId || null,
      updated_by: actorUserId || null,
    }));
    const { error: itemsError } = await supabase
      .from('business_os_stage_task_template_items')
      .upsert(rows, { onConflict: 'automation_id,item_key' });
    if (itemsError) throw itemsError;
  }

  const result = await getQualificationAutomation(companyId);
  const { error: versionError } = await supabase
    .from('business_os_stage_automation_versions')
    .insert({
      automation_id: saved.id,
      company_id: companyId,
      process_key: SALES_PROCESS_KEY,
      stage_key: QUALIFICATION_STAGE_KEY,
      version: result.version,
      automation_snapshot: snapshotPayload(result),
      task_items_snapshot: result.task_items,
      change_type: changeType,
      source_version: sourceVersion,
      created_by: actorUserId || null,
    });
  if (versionError) throw versionError;

  await supabase.from('work_audit_logs').insert({
    company_id: companyId,
    actor_user_id: actorUserId || null,
    entity_type: 'business_os_stage_automation',
    entity_id: saved.id,
    action: `business_os.qualification_automation.${changeType}`,
    before: current.persisted ? { version: current.version } : null,
    after: { version: result.version, ...snapshotPayload(result), task_count: result.task_items.length },
  }).then(({ error }) => {
    if (error) console.warn('[business-os automation audit]', error.message);
  });

  return result;
}

async function listQualificationAutomationVersions(companyId) {
  const { data, error } = await supabase
    .from('business_os_stage_automation_versions')
    .select('*')
    .eq('company_id', companyId)
    .eq('process_key', SALES_PROCESS_KEY)
    .eq('stage_key', QUALIFICATION_STAGE_KEY)
    .order('version', { ascending: false })
    .limit(50);
  if (error) {
    if (isMissingAutomationTable(error)) return [];
    throw error;
  }
  return (data || []).map((row) => ({
    id: row.id,
    version: Number(row.version),
    automation: row.automation_snapshot || {},
    task_items: row.task_items_snapshot || [],
    change_type: row.change_type,
    source_version: row.source_version == null ? null : Number(row.source_version),
    created_by: row.created_by || null,
    created_at: row.created_at,
  }));
}

async function rollbackQualificationAutomation({ companyId, version, actorUserId }) {
  const sourceVersion = Number(version);
  if (!Number.isInteger(sourceVersion) || sourceVersion < 1) {
    const error = new Error('Phiên bản automation cần khôi phục không hợp lệ.');
    error.status = 400;
    throw error;
  }
  const { data, error } = await supabase
    .from('business_os_stage_automation_versions')
    .select('*')
    .eq('company_id', companyId)
    .eq('process_key', SALES_PROCESS_KEY)
    .eq('stage_key', QUALIFICATION_STAGE_KEY)
    .eq('version', sourceVersion)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const notFound = new Error('Không tìm thấy phiên bản automation.');
    notFound.status = 404;
    throw notFound;
  }
  return saveQualificationAutomation({
    companyId,
    input: {
      ...(data.automation_snapshot || {}),
      task_items: data.task_items_snapshot || [],
    },
    actorUserId,
    changeType: 'rollback',
    sourceVersion,
  });
}

async function ensurePersistedQualificationAutomation(companyId, actorUserId) {
  const current = await getQualificationAutomation(companyId);
  if (current.persisted) return current;
  return saveQualificationAutomation({
    companyId,
    input: current,
    actorUserId,
    changeType: 'seed',
  });
}

function taskAssigneeId(item, lead, actorUserId) {
  if (item.assignment_strategy === 'actor') return actorUserId || null;
  if (item.assignment_strategy === 'unassigned') return null;
  return lead.assigned_to || lead.lead_owner_id || actorUserId || null;
}

async function buildQualificationTaskRows({ lead, automation, actorUserId, startedAt = new Date() }) {
  const start = startedAt instanceof Date ? startedAt : new Date(startedAt);
  return Promise.all(automation.task_items.filter((item) => item.is_active !== false).map(async (item) => {
    const deadline = item.deadline_minutes > 0
      ? await addBusinessMinutes(start, item.deadline_minutes, {
        companyId: lead.company_id,
        userId: taskAssigneeId(item, lead, actorUserId),
      })
      : null;
    return {
      lead_id: lead.id,
      title: item.title,
      description: item.description,
      status: 'pending',
      priority: item.priority,
      stage_slug: QUALIFICATION_TASK_STAGE_SLUG,
      order_index: item.order_index,
      assignee_id: taskAssigneeId(item, lead, actorUserId),
      deadline: deadline ? deadline.toISOString() : null,
      checklist: [],
      created_by: actorUserId || null,
      blocks_stage_advance: item.blocks_stage_advance,
      completion_requires_file_or_note: item.completion_requires_file_or_note,
      required_evidence_file_types: item.required_evidence_file_types,
      requires_quick_verdict: item.requires_quick_verdict,
      deadline_days: 0,
      deadline_hours: 0,
      deadline_minutes: item.deadline_minutes,
      business_os_process_key: SALES_PROCESS_KEY,
      business_os_stage_key: QUALIFICATION_STAGE_KEY,
      business_os_template_item_key: item.item_key,
      business_os_template_item_id: item.id || null,
    };
  }));
}

async function ensureQualificationTasks({ lead, actorUserId, startedAt = new Date() }) {
  const automation = await ensurePersistedQualificationAutomation(lead.company_id, actorUserId);
  if (!automation.task_items.length) return { created: 0, reused: 0, tasks: [], automation };
  const rows = await buildQualificationTaskRows({ lead, automation, actorUserId, startedAt });
  const { data: existing, error: existingError } = await supabase
    .from('crm_tasks')
    .select('id, title, stage_slug, business_os_template_item_key')
    .eq('lead_id', lead.id)
    .neq('status', 'cancelled');
  if (existingError) {
    if (isMissingAutomationTable(existingError)) throw migrationRequiredError(existingError);
    throw existingError;
  }

  const existingBySource = new Map((existing || [])
    .filter((task) => task.business_os_template_item_key)
    .map((task) => [task.business_os_template_item_key, task]));
  const existingByTitle = new Map((existing || [])
    .filter((task) => ['qualification', 'lead_qualification', 'consulting'].includes(text(task.stage_slug).toLowerCase()))
    .map((task) => [text(task.title).toLocaleLowerCase('vi-VN'), task]));
  let reused = 0;
  const toInsert = [];
  for (const row of rows) {
    if (existingBySource.has(row.business_os_template_item_key)) continue;
    const titleMatch = existingByTitle.get(text(row.title).toLocaleLowerCase('vi-VN'));
    if (titleMatch && !titleMatch.business_os_template_item_key) {
      const { error: adoptError } = await supabase
        .from('crm_tasks')
        .update({
          business_os_process_key: row.business_os_process_key,
          business_os_stage_key: row.business_os_stage_key,
          business_os_template_item_key: row.business_os_template_item_key,
          business_os_template_item_id: row.business_os_template_item_id,
        })
        .eq('id', titleMatch.id);
      if (adoptError) throw adoptError;
      reused += 1;
      continue;
    }
    toInsert.push(row);
  }

  let inserted = [];
  if (toInsert.length) {
    const { data, error } = await supabase
      .from('crm_tasks')
      .upsert(toInsert, {
        onConflict: 'lead_id,business_os_process_key,business_os_stage_key,business_os_template_item_key',
        ignoreDuplicates: true,
      })
      .select('id, lead_id, title, status, stage_slug, assignee_id, deadline, blocks_stage_advance, business_os_template_item_key');
    if (error) {
      if (isMissingAutomationTable(error)) throw migrationRequiredError(error);
      throw error;
    }
    inserted = data || [];
  }
  return { created: inserted.length, reused, tasks: inserted, automation };
}

function qualificationSlaLevel({ dueAt, now = new Date(), warningMinutes = DEFAULT_SLA_WARNING_MINUTES }) {
  const dueMs = new Date(dueAt).getTime();
  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(dueMs) || !Number.isFinite(nowMs)) return 'none';
  if (dueMs <= nowMs) return 'overdue';
  if (warningMinutes > 0 && dueMs - nowMs <= warningMinutes * 60 * 1000) return 'at_risk';
  return 'on_track';
}

async function insertSlaEscalationNotification({ instance, lead, level, recipientUserId }) {
  const { data: escalation, error: escalationError } = await supabase
    .from('business_os_sla_escalations')
    .insert({
      company_id: instance.company_id,
      process_instance_id: instance.id,
      record_id: instance.record_id,
      stage_key: QUALIFICATION_STAGE_KEY,
      level,
      recipient_user_id: recipientUserId,
      due_at: instance.sla_due_at,
      metadata: { process_key: SALES_PROCESS_KEY, stage_key: QUALIFICATION_STAGE_KEY },
    })
    .select('*')
    .single();
  if (escalationError) {
    if (escalationError.code === '23505') return { created: false, duplicate: true };
    throw escalationError;
  }

  const overdue = level === 'overdue';
  const title = overdue ? 'SLA Qualification đã quá hạn' : 'SLA Qualification sắp đến hạn';
  const leadLabel = text(lead?.title) || text(lead?.code) || 'Lead';
  const message = overdue
    ? `${leadLabel} đã quá hạn Qualification. Vui lòng xử lý hoặc cập nhật người chịu trách nhiệm.`
    : `${leadLabel} đang tiến gần hạn Qualification. Vui lòng hoàn tất checklist và dữ liệu bắt buộc.`;
  const { data: notification, error: notificationError } = await supabase
    .from('notifications')
    .insert({
      user_id: recipientUserId,
      type: overdue ? 'business_os_sla_overdue' : 'business_os_sla_at_risk',
      title,
      message,
      entity_type: 'crm_lead',
      entity_id: String(instance.record_id),
      metadata: {
        company_id: instance.company_id,
        ecosystem_module_key: 'crm',
        module_key: 'crm',
        process_key: SALES_PROCESS_KEY,
        stage_key: QUALIFICATION_STAGE_KEY,
        sla_level: level,
        sla_due_at: instance.sla_due_at,
        nav_url: `/crm/leads/${instance.record_id}`,
        business_os_escalation_id: escalation.id,
        internal_only: true,
      },
    })
    .select('id')
    .single();
  if (notificationError) {
    await supabase.from('business_os_sla_escalations').delete().eq('id', escalation.id);
    throw notificationError;
  }
  await supabase
    .from('business_os_sla_escalations')
    .update({ notification_id: notification.id })
    .eq('id', escalation.id);
  return { created: true, duplicate: false, escalation_id: escalation.id, notification_id: notification.id };
}

async function evaluateQualificationSlaEscalations({ companyId, now = new Date() }) {
  const automation = await getQualificationAutomation(companyId);
  if (!automation.persisted || !automation.is_active) {
    return { company_id: companyId, evaluated: 0, created: 0, skipped: 0, reason: 'automation_not_persisted' };
  }
  const { data: instances, error } = await supabase
    .from('business_os_process_instances')
    .select('id, company_id, record_id, current_stage_key, status, sla_due_at')
    .eq('company_id', companyId)
    .eq('process_key', SALES_PROCESS_KEY)
    .eq('record_type', 'crm_lead')
    .eq('current_stage_key', QUALIFICATION_STAGE_KEY)
    .eq('status', 'active')
    .not('sla_due_at', 'is', null)
    .limit(1000);
  if (error) {
    if (isMissingAutomationTable(error)) return { company_id: companyId, evaluated: 0, created: 0, skipped: 0, reason: 'migration_missing' };
    throw error;
  }
  if (!instances?.length) return { company_id: companyId, evaluated: 0, created: 0, skipped: 0 };
  const recordIds = [...new Set(instances.map((instance) => instance.record_id))];
  const { data: leads, error: leadsError } = await supabase
    .from('crm_leads')
    .select('id, code, title, company_id, assigned_to, lead_owner_id')
    .eq('company_id', companyId)
    .in('id', recordIds);
  if (leadsError) throw leadsError;
  const leadById = new Map((leads || []).map((lead) => [String(lead.id), lead]));
  let adminIds = null;
  const stats = { company_id: companyId, evaluated: instances.length, created: 0, skipped: 0, errors: [] };
  for (const instance of instances) {
    const level = qualificationSlaLevel({
      dueAt: instance.sla_due_at,
      now,
      warningMinutes: automation.sla_policy.warning_minutes,
    });
    if (!['at_risk', 'overdue'].includes(level)) continue;
    const lead = leadById.get(String(instance.record_id));
    if (!lead) continue;
    const ownerId = lead.assigned_to || lead.lead_owner_id || null;
    const recipients = new Set();
    if (level === 'at_risk' && automation.sla_policy.escalate_at_risk_to_owner && ownerId) recipients.add(ownerId);
    if (level === 'overdue' && automation.sla_policy.escalate_overdue_to_owner && ownerId) recipients.add(ownerId);
    if (level === 'overdue' && automation.sla_policy.escalate_overdue_to_company_admins) {
      if (!adminIds) adminIds = await getCompanyScopedAdminIds(companyId, { includeSystemAdmins: false });
      adminIds.forEach((id) => recipients.add(id));
    }
    for (const recipientUserId of recipients) {
      try {
        const result = await insertSlaEscalationNotification({ instance, lead, level, recipientUserId });
        if (result.created) stats.created += 1;
        else stats.skipped += 1;
      } catch (notificationError) {
        stats.errors.push({ record_id: instance.record_id, recipient_user_id: recipientUserId, error: notificationError.message });
      }
    }
  }
  return stats;
}

async function evaluateAllQualificationSlaEscalations({ now = new Date() } = {}) {
  const { data, error } = await supabase
    .from('business_os_stage_automations')
    .select('company_id')
    .eq('process_key', SALES_PROCESS_KEY)
    .eq('stage_key', QUALIFICATION_STAGE_KEY)
    .eq('is_active', true);
  if (error) {
    if (isMissingAutomationTable(error)) return { companies: 0, created: 0, skipped: 0, reason: 'migration_missing' };
    throw error;
  }
  const companyIds = [...new Set((data || []).map((row) => row.company_id).filter(Boolean))];
  const summary = { companies: companyIds.length, created: 0, skipped: 0, errors: [] };
  for (const companyId of companyIds) {
    try {
      const result = await evaluateQualificationSlaEscalations({ companyId, now });
      summary.created += result.created || 0;
      summary.skipped += result.skipped || 0;
      summary.errors.push(...(result.errors || []));
    } catch (companyError) {
      summary.errors.push({ company_id: companyId, error: companyError.message });
    }
  }
  return summary;
}

function percent(numerator, denominator) {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

function buildQualificationFunnelKpi({ records = [], instances = [], audits = [], now = new Date() } = {}) {
  const stateByRecord = new Map((instances || []).map((row) => [String(row.record_id), { ...row }]));
  const auditsOldestFirst = [...(audits || [])].sort(
    (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime(),
  );
  for (const audit of auditsOldestFirst) {
    const key = String(audit.entity_id || '');
    if (!key) continue;
    const state = stateByRecord.get(key) || {};
    const after = audit.after && typeof audit.after === 'object' ? audit.after : {};
    if (audit.action === 'sales.qualification.started') {
      state.sla_started_at = state.sla_started_at || after.sla_started_at || audit.created_at;
      state.sla_due_at = state.sla_due_at || after.sla_due_at || null;
    }
    if (audit.action === 'sales.qualification.completed') {
      state.qualified_at = state.qualified_at || after.qualified_at || audit.created_at;
    }
    if (audit.action === 'sales.lead.converted_to_deal') {
      state.converted_at = state.converted_at || after.converted_at || audit.created_at;
    }
    stateByRecord.set(key, state);
  }

  const totalRecords = records.length;
  let started = 0;
  let qualified = 0;
  let processConverted = 0;
  let dealRecords = 0;
  let activeQualification = 0;
  let slaOverdue = 0;
  let onTimeQualified = 0;
  let qualifiedWithSla = 0;
  const durations = [];
  const nowMs = new Date(now).getTime();
  for (const record of records) {
    const state = stateByRecord.get(String(record.id)) || {};
    const isDealRecord = record.type === 'deal';
    const isProcessConverted = !!state.converted_at || state.current_stage_key === 'deal';
    const isQualified = isProcessConverted || !!state.qualified_at || state.current_stage_key === 'qualified';
    const isStarted = isQualified || !!state.sla_started_at || state.current_stage_key === QUALIFICATION_STAGE_KEY;
    if (isDealRecord) dealRecords += 1;
    if (isStarted) started += 1;
    if (isQualified) qualified += 1;
    if (isProcessConverted) processConverted += 1;
    if (!isQualified && state.current_stage_key === QUALIFICATION_STAGE_KEY) activeQualification += 1;
    const dueMs = new Date(state.sla_due_at || 0).getTime();
    if (!isQualified && Number.isFinite(dueMs) && dueMs > 0 && dueMs <= nowMs) slaOverdue += 1;
    const startMs = new Date(state.sla_started_at || 0).getTime();
    const qualifiedMs = new Date(state.qualified_at || 0).getTime();
    if (Number.isFinite(startMs) && startMs > 0 && Number.isFinite(qualifiedMs) && qualifiedMs >= startMs) {
      durations.push((qualifiedMs - startMs) / 60000);
      if (Number.isFinite(dueMs) && dueMs > 0) {
        qualifiedWithSla += 1;
        if (qualifiedMs <= dueMs) onTimeQualified += 1;
      }
    }
  }
  const averageMinutes = durations.length
    ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
    : 0;
  return {
    total_records: totalRecords,
    deal_records: dealRecords,
    qualification_started: started,
    qualification_completed: qualified,
    converted_to_deal: processConverted,
    active_qualification: activeQualification,
    sla_overdue: slaOverdue,
    start_rate_pct: percent(started, totalRecords),
    qualification_success_rate_pct: percent(qualified, Math.max(started, qualified)),
    lead_to_deal_rate_pct: percent(dealRecords, totalRecords),
    qualified_to_deal_rate_pct: percent(processConverted, Math.max(qualified, processConverted)),
    sla_on_time_rate_pct: percent(onTimeQualified, qualifiedWithSla),
    average_qualification_minutes: averageMinutes,
    average_qualification_hours: Math.round((averageMinutes / 60) * 10) / 10,
    measured_durations: durations.length,
    source: 'crm_leads + business_os_process_instances + process audit',
  };
}

module.exports = {
  SALES_PROCESS_KEY,
  QUALIFICATION_STAGE_KEY,
  DEFAULT_SLA_DURATION_MINUTES,
  DEFAULT_SLA_WARNING_MINUTES,
  DEFAULT_TASK_ITEMS,
  itemKeyFromTitle,
  normalizeTaskItems,
  normalizeQualificationAutomation,
  getQualificationAutomation,
  saveQualificationAutomation,
  listQualificationAutomationVersions,
  rollbackQualificationAutomation,
  ensurePersistedQualificationAutomation,
  buildQualificationTaskRows,
  ensureQualificationTasks,
  qualificationSlaLevel,
  evaluateQualificationSlaEscalations,
  evaluateAllQualificationSlaEscalations,
  buildQualificationFunnelKpi,
  isMissingAutomationTable,
};
