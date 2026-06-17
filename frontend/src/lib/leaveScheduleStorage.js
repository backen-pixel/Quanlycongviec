/** Trạng thái UI lịch nghỉ — tách biệt hoàn toàn với `events_*` / `crm_events_*`. */
const STORAGE_KEY = 'leave_schedule_ui_v1';

const DEFAULTS = {
  mode: 'calendar',
  month: new Date().getMonth() + 1,
  year: new Date().getFullYear(),
  statusFilter: '',
  timePreset: '',
  rangeFrom: '',
  rangeTo: '',
  filterUserId: '',
  filterRegionId: '',
};

function parse(raw) {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? o : null;
  } catch {
    return null;
  }
}

function normalize(saved) {
  return {
    mode: saved?.mode === 'approval' ? 'approval' : 'calendar',
    month: Number(saved?.month) >= 1 && Number(saved?.month) <= 12
      ? Number(saved.month)
      : DEFAULTS.month,
    year: Number(saved?.year) > 2000 ? Number(saved.year) : DEFAULTS.year,
    statusFilter: typeof saved?.statusFilter === 'string' ? saved.statusFilter : DEFAULTS.statusFilter,
    timePreset: typeof saved?.timePreset === 'string' ? saved.timePreset : DEFAULTS.timePreset,
    rangeFrom: typeof saved?.rangeFrom === 'string' ? saved.rangeFrom : DEFAULTS.rangeFrom,
    rangeTo: typeof saved?.rangeTo === 'string' ? saved.rangeTo : DEFAULTS.rangeTo,
    filterUserId: typeof saved?.filterUserId === 'string' ? saved.filterUserId : DEFAULTS.filterUserId,
    filterRegionId: typeof saved?.filterRegionId === 'string' ? saved.filterRegionId : DEFAULTS.filterRegionId,
  };
}

/** Chuyển state cũ gắn trong trang Sự kiện sang storage riêng (một lần). */
function migrateLegacyEventsOffState(base) {
  try {
    const legacySection = localStorage.getItem('events_page_section');
    const legacyMode = localStorage.getItem('events_off_mode');
    if (legacySection !== 'off' && !legacyMode) return base;
    const next = { ...base };
    if (legacyMode === 'approval' || legacyMode === 'calendar') {
      next.mode = legacyMode;
    }
    localStorage.removeItem('events_page_section');
    localStorage.removeItem('events_off_mode');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch {
    return base;
  }
}

export function loadLeaveScheduleUi() {
  try {
    const saved = parse(localStorage.getItem(STORAGE_KEY));
    const merged = normalize(saved || DEFAULTS);
    return migrateLegacyEventsOffState(merged);
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeLeaveScheduleUi(patch) {
  try {
    const saved = parse(localStorage.getItem(STORAGE_KEY));
    const prev = normalize(saved || DEFAULTS);
    const next = { ...prev, ...patch };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch {
    return patch;
  }
}

export function patchLeaveScheduleUi(patch) {
  return writeLeaveScheduleUi(patch);
}
