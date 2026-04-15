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

export function getNotificationPrefsCache() {
  let readTitleAloud = true;
  try {
    if (localStorage.getItem('notification_read_title_aloud') === '0') readTitleAloud = false;
  } catch {
    /* ignore */
  }

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

  let speech_volume_percent = 100;
  try {
    const raw = localStorage.getItem('notification_speech_volume_percent');
    if (raw != null && raw !== '') {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n)) speech_volume_percent = Math.min(100, Math.max(0, n));
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
    read_title_aloud: readTitleAloud,
    sound_volume_percent,
    speech_volume_percent,
    use_custom_sound,
    custom_sound_start_sec,
    custom_sound_play_sec,
    custom_sound_file_duration_sec,
  };
}

export function setNotificationPrefsCache(next) {
  if (next && typeof next === 'object') {
    const { read_title_aloud: _r, ...rest } = next;
    prefs = { ...prefs, ...rest };
  }
}

/** Bật/tắt đọc to tiêu đề (lưu máy, không cần cột DB). */
export function setReadTitleAloudEnabled(enabled) {
  try {
    localStorage.setItem('notification_read_title_aloud', enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function setNotificationVolumePercent(percent) {
  try {
    localStorage.setItem('notification_volume_percent', String(Math.min(150, Math.max(0, Math.round(percent)))));
  } catch {
    /* ignore */
  }
}

export function setNotificationSpeechVolumePercent(percent) {
  try {
    localStorage.setItem('notification_speech_volume_percent', String(Math.min(100, Math.max(0, Math.round(percent)))));
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

/** Nếu không có cột loại trên server → coi như bật. */
export function isNotificationTypeEnabled(type) {
  if (!type) return true;
  const v = prefs[type];
  return v !== false;
}
