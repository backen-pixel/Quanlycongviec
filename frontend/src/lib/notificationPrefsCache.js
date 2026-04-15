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
};

/**
 * `notifications.type` từ server → cột preferences (đồng bộ backend `notificationPrefTypes.js`).
 */
const NOTIFICATION_TYPE_PREF_MAP = {
  task_assigned: 'task_assigned',
  task_updated: 'task_completed',
  task_completed: 'task_completed',
  project_assigned: 'task_assigned',
  crm_task_assigned: 'task_assigned',
  crm_task_completed: 'task_completed',

  deadline_warning: 'deadline_warning',
  deadline_reminder: 'deadline_warning',
  deadline_overdue: 'deadline_warning',
  crm_deadline_warning: 'deadline_warning',
  crm_deadline_1h: 'deadline_warning',
  crm_deadline_overdue: 'deadline_warning',
  crm_deadline_set: 'deadline_warning',

  comment_added: 'comment_added',

  stage_changed: 'stage_changed',
  project_stage_changed: 'stage_changed',
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
]);

export function preferenceKeyForNotificationType(type) {
  if (!type || typeof type !== 'string') return null;
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

  return {
    ...prefs,
    sound_volume_percent,
    use_custom_sound,
    custom_sound_start_sec,
    custom_sound_play_sec,
    custom_sound_file_duration_sec,
  };
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
export function isNotificationTypeEnabled(type) {
  const key = preferenceKeyForNotificationType(type);
  if (!key) return true;
  return prefs[key] !== false;
}
