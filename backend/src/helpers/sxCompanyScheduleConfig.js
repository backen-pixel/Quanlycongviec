/**
 * Cấu hình giờ deadline xưởng + SLA kính theo công ty.
 * Mặc định: 17:30, cutoff 12:00, kính cường lực 3 ngày LV.
 */

const { supabase } = require('../config/supabase');

const DEFAULTS = {
  default_deadline_time: '17:30:00',
  glass_cutoff_time: '12:00:00',
  tempered_glass_days: 3,
};

const cache = new Map(); // companyId -> { cfg, exp }
const CACHE_MS = 60 * 1000;

function parseTimeToClock(raw, fallbackHour = 17, fallbackMinute = 30) {
  const s = String(raw || '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return { hour: fallbackHour, minute: fallbackMinute, second: 0, ms: 0 };
  const hour = Math.min(23, Math.max(0, Number(m[1])));
  const minute = Math.min(59, Math.max(0, Number(m[2])));
  return { hour, minute, second: 0, ms: 0 };
}

function formatTimeInput(clock) {
  const h = String(clock?.hour ?? 17).padStart(2, '0');
  const mi = String(clock?.minute ?? 30).padStart(2, '0');
  return `${h}:${mi}`;
}

function timeToPg(raw, fallback = '17:30:00') {
  const s = String(raw || '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return fallback;
  const h = String(Math.min(23, Math.max(0, Number(m[1])))).padStart(2, '0');
  const mi = String(Math.min(59, Math.max(0, Number(m[2])))).padStart(2, '0');
  return `${h}:${mi}:00`;
}

function normalizeConfig(row, companyId) {
  const deadlineClock = parseTimeToClock(row?.default_deadline_time || DEFAULTS.default_deadline_time, 17, 30);
  const cutoffClock = parseTimeToClock(row?.glass_cutoff_time || DEFAULTS.glass_cutoff_time, 12, 0);
  const days = Number(row?.tempered_glass_days);
  return {
    company_id: companyId || row?.company_id || null,
    default_deadline_time: formatTimeInput(deadlineClock) + ':00',
    glass_cutoff_time: formatTimeInput(cutoffClock) + ':00',
    tempered_glass_days: Number.isFinite(days) && days >= 1 ? Math.min(30, Math.floor(days)) : 3,
    deadline_clock: deadlineClock,
    cutoff_clock: cutoffClock,
  };
}

async function getSxScheduleConfig(companyId) {
  const cid = companyId ? String(companyId) : '';
  if (!cid) return normalizeConfig(DEFAULTS, null);
  const hit = cache.get(cid);
  if (hit && hit.exp > Date.now()) return hit.cfg;
  let row = null;
  try {
    const { data, error } = await supabase
      .from('sx_company_schedule_config')
      .select('company_id, default_deadline_time, glass_cutoff_time, tempered_glass_days')
      .eq('company_id', cid)
      .maybeSingle();
    if (error && /sx_company_schedule_config/.test(error.message || '')) {
      const cfg = normalizeConfig(DEFAULTS, cid);
      cache.set(cid, { cfg, exp: Date.now() + CACHE_MS });
      return cfg;
    }
    if (error) throw error;
    row = data;
  } catch (_) {
    row = null;
  }
  const cfg = normalizeConfig(row || DEFAULTS, cid);
  try {
    const { rememberCompanyDeadlineClock } = require('./companyDeadlineClock');
    rememberCompanyDeadlineClock(cid, cfg.deadline_clock);
  } catch (_) { /* ignore */ }
  cache.set(cid, { cfg, exp: Date.now() + CACHE_MS });
  return cfg;
}

function invalidateSxScheduleConfig(companyId) {
  if (companyId) cache.delete(String(companyId));
}

async function upsertSxScheduleConfig(companyId, body = {}) {
  const cid = String(companyId || '');
  if (!cid) throw new Error('Thiếu company_id');
  const payload = {
    company_id: cid,
    default_deadline_time: timeToPg(body.default_deadline_time, DEFAULTS.default_deadline_time),
    glass_cutoff_time: timeToPg(body.glass_cutoff_time, DEFAULTS.glass_cutoff_time),
    tempered_glass_days: (() => {
      const n = Number(body.tempered_glass_days);
      if (!Number.isFinite(n) || n < 1) return 3;
      return Math.min(30, Math.floor(n));
    })(),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('sx_company_schedule_config')
    .upsert(payload, { onConflict: 'company_id' })
    .select('company_id, default_deadline_time, glass_cutoff_time, tempered_glass_days')
    .single();
  if (error) throw error;
  invalidateSxScheduleConfig(cid);
  return normalizeConfig(data, cid);
}

module.exports = {
  DEFAULTS,
  parseTimeToClock,
  formatTimeInput,
  getSxScheduleConfig,
  upsertSxScheduleConfig,
  invalidateSxScheduleConfig,
  normalizeConfig,
};
