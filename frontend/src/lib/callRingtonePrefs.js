const USE_KEY = 'call_use_custom_ringtone';
const VOL_KEY = 'call_ringtone_volume_percent';
const NAME_KEY = 'call_ringtone_file_name';

export function getUseCustomCallRingtone() {
  try {
    return localStorage.getItem(USE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setUseCustomCallRingtone(on) {
  try {
    localStorage.setItem(USE_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function getCallRingtoneVolumePercent() {
  try {
    const v = parseInt(localStorage.getItem(VOL_KEY) || '85', 10);
    if (Number.isNaN(v)) return 85;
    return Math.min(150, Math.max(0, v));
  } catch {
    return 85;
  }
}

export function setCallRingtoneVolumePercent(n) {
  try {
    const v = Math.min(150, Math.max(0, Math.round(Number(n) || 0)));
    localStorage.setItem(VOL_KEY, String(v));
  } catch {
    /* ignore */
  }
}

export function getCallRingtoneFileName() {
  try {
    return localStorage.getItem(NAME_KEY) || '';
  } catch {
    return '';
  }
}

export function setCallRingtoneFileName(name) {
  try {
    if (name) localStorage.setItem(NAME_KEY, String(name));
    else localStorage.removeItem(NAME_KEY);
  } catch {
    /* ignore */
  }
}

export function clearCallRingtonePrefs() {
  try {
    localStorage.removeItem(USE_KEY);
    localStorage.removeItem(NAME_KEY);
  } catch {
    /* ignore */
  }
}
