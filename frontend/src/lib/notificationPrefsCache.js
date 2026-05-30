/** Bộ nhớ tạm preferences thông báo (đồng bộ từ API + sau khi lưu trong Cài đặt). */
let prefs = {
  sound: true,
  task_assigned: true,
  task_completed: true,
  deadline_warning: true,
  comment_added: true,
  stage_changed: true,
  deal_won: true,
  approval_request: true,
  checklist_completed: true,
  lead_assigned: true,
  order_confirmed: true,
  invoice_overdue: true,
  lead_new: true,
  deal_new: true,
  production_deadlines: true,
  crm_lead_deadlines: true,
  logistics_deadlines: true,
  project_notifications: false,
};

/**
 * `notifications.type` + `entity_type` → cột preferences (đồng bộ backend `notificationPrefTypes.js`).
 */
const NOTIFICATION_TYPE_PREF_MAP = {
  task_assigned: 'task_assigned',
  task_updated: 'task_completed',
  task_completed: 'task_completed',
  crm_task_assigned: 'task_assigned',
  crm_task_completed: 'task_completed',
  crm_assignment_assigned: 'task_assigned',
  crm_assignment_comment: 'comment_added',
  crm_assignment_due_soon: 'deadline_warning',
  crm_assignment_overdue: 'deadline_warning',

  comment_added: 'comment_added',

  stage_changed: 'stage_changed',
  lead_stage_changed: 'stage_changed',

  deal_won: 'deal_won',

  approval_request: 'approval_request',

  checklist_completed: 'checklist_completed',

  lead_assigned: 'lead_assigned',

  order_confirmed: 'order_confirmed',
  order_created: 'order_confirmed',
  order_updated: 'order_confirmed',

  invoice_overdue: 'invoice_overdue',
};

const PREF_KEYS = new Set([
  'task_assigned',
  'task_completed',
  'deadline_warning',
  'comment_added',
  'stage_changed',
  'deal_won',
  'approval_request',
  'checklist_completed',
  'lead_assigned',
  'order_confirmed',
  'invoice_overdue',
  'lead_new',
  'deal_new',
  'production_deadlines',
  'crm_lead_deadlines',
  'logistics_deadlines',
  'project_notifications',
]);

export function preferenceKeyForNotificationType(type, entityType, metadata = null) {
  if (!type || typeof type !== 'string') return null;

  const eco =
    metadata && typeof metadata === 'object' ? String(metadata.ecosystem_module_key || '').trim() : '';

  if (
    type === 'project_assigned' ||
    type === 'project_updated' ||
    type === 'project_stage_changed'
  ) {
    return 'project_notifications';
  }
  if (
    type === 'project_pipeline_deadline_warning' ||
    type === 'project_pipeline_deadline_overdue'
  ) {
    return 'project_notifications';
  }
  if (entityType === 'project') {
    return 'project_notifications';
  }
  if (eco === 'projects') {
    return 'project_notifications';
  }

  const metaPid =
    metadata && typeof metadata === 'object' && metadata.project_id != null && String(metadata.project_id).trim() !== ''
      ? String(metadata.project_id).trim()
      : null;
  if (
    metaPid &&
    [
      'task_assigned',
      'task_updated',
      'task_completed',
      'task_created',
      'comment_added',
      'checklist_completed',
    ].includes(type)
  ) {
    return 'project_notifications';
  }

  if (type === 'task_created') return 'project_notifications';

  if (type === 'lead_created') return 'lead_new';
  if (type === 'deal_created' || type === 'deal_assigned') return 'deal_new';

  if (type === 'lead_stage_sla_reminder') return 'crm_lead_deadlines';

  if (type === 'ai_crm_deadline_digest') return 'crm_lead_deadlines';

  if (
    type === 'crm_deadline_1h' ||
    type === 'crm_deadline_warning' ||
    type === 'crm_deadline_overdue' ||
    type === 'crm_deadline_set'
  ) {
    const mk = metadata && typeof metadata === 'object' ? String(metadata.module_key || '') : '';
    if (mk === 'production') return 'production_deadlines';
    return 'crm_lead_deadlines';
  }

  if (type === 'production_task_deadline_warning' || type === 'production_task_deadline_overdue') {
    return 'production_deadlines';
  }
  if (type === 'logistics_task_deadline_warning' || type === 'logistics_task_deadline_overdue') {
    return 'logistics_deadlines';
  }
  if (type === 'deadline_warning' || type === 'deadline_overdue' || type === 'deadline_reminder') {
    if (entityType === 'task') return 'production_deadlines';
    return 'deadline_warning';
  }

  if (NOTIFICATION_TYPE_PREF_MAP[type]) return NOTIFICATION_TYPE_PREF_MAP[type];
  if (PREF_KEYS.has(type)) return type;
  return null;
}

export function getNotificationPrefsCache() {
  let sound_volume_percent = 100;
  try {
    const raw = localStorage.getItem('notification_volume_percent');
    if (raw != null && raw !== '') {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n)) sound_volume_percent = Math.min(150, Math.max(0, n));
    }
  } catch {
    /* ignore */
  }

  let use_custom_sound = false;
  try {
    use_custom_sound = localStorage.getItem('notification_use_custom_sound') === '1';
  } catch {
    /* ignore */
  }

  let custom_sound_start_sec = 0;
  let custom_sound_play_sec = 15;
  try {
    const s = parseFloat(localStorage.getItem('notification_custom_sound_start_sec'));
    if (Number.isFinite(s)) custom_sound_start_sec = Math.max(0, s);
    const p = parseFloat(localStorage.getItem('notification_custom_sound_play_sec'));
    if (Number.isFinite(p)) custom_sound_play_sec = Math.min(15, Math.max(0.05, p));
  } catch {
    /* ignore */
  }

  let custom_sound_file_duration_sec = 0;
  try {
    const d = parseFloat(localStorage.getItem('notification_custom_sound_file_duration_sec'));
    if (Number.isFinite(d) && d > 0) custom_sound_file_duration_sec = d;
  } catch {
    /* ignore */
  }

  let preset_id = 'classic';
  try {
    const raw = localStorage.getItem('notification_preset_id');
    if (raw) preset_id = raw;
  } catch {
    /* ignore */
  }

  return {
    ...prefs,
    sound_volume_percent,
    use_custom_sound,
    custom_sound_start_sec,
    custom_sound_play_sec,
    custom_sound_file_duration_sec,
    preset_id,
  };
}

export function setNotificationPresetId(id) {
  try {
    if (id) localStorage.setItem('notification_preset_id', String(id));
  } catch {
    /* ignore */
  }
}

export function getNotificationPresetId() {
  try {
    return localStorage.getItem('notification_preset_id') || 'classic';
  } catch {
    return 'classic';
  }
}

export function setNotificationPrefsCache(next) {
  if (next && typeof next === 'object') {
    prefs = { ...prefs, ...next };
  }
}

export function setNotificationVolumePercent(percent) {
  try {
    localStorage.setItem('notification_volume_percent', String(Math.min(150, Math.max(0, Math.round(percent)))));
  } catch {
    /* ignore */
  }
}

export function setUseCustomNotificationSound(enabled) {
  try {
    localStorage.setItem('notification_use_custom_sound', enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** Đoạn phát trong file tùy chỉnh (mp3, v.v.): bắt đầu (giây) + độ dài (giây, tối đa 15). */
export function setNotificationCustomSoundTrim(startSec, playSec) {
  try {
    const st = Math.max(0, Number(startSec) || 0);
    const pl = Math.min(15, Math.max(0.05, Number(playSec) || 15));
    localStorage.setItem('notification_custom_sound_start_sec', String(st));
    localStorage.setItem('notification_custom_sound_play_sec', String(pl));
  } catch {
    /* ignore */
  }
}

export function setNotificationCustomSoundFileDurationSec(sec) {
  try {
    if (sec != null && Number.isFinite(sec) && sec > 0) {
      localStorage.setItem('notification_custom_sound_file_duration_sec', String(sec));
    } else {
      localStorage.removeItem('notification_custom_sound_file_duration_sec');
    }
  } catch {
    /* ignore */
  }
}

export function clearNotificationCustomSoundMeta() {
  try {
    localStorage.removeItem('notification_custom_sound_start_sec');
    localStorage.removeItem('notification_custom_sound_play_sec');
    localStorage.removeItem('notification_custom_sound_file_duration_sec');
  } catch {
    /* ignore */
  }
}

/** Loại không map được → coi như bật (thông báo hệ thống / loại mới). */
export function isNotificationTypeEnabled(type, entityType, metadata = null) {
  const key = preferenceKeyForNotificationType(type, entityType, metadata);
  if (!key) return true;
  return prefs[key] !== false;
}
