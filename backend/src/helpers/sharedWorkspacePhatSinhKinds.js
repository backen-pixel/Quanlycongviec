/**
 * Danh mục loại phát sinh + SLA hạn (Không gian chung).
 */
const { supabase } = require('../config/supabase');
const { isAdminLike, isSystemAdmin } = require('./adminRole');
const { parseTimeToClock } = require('./sxCompanyScheduleConfig');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLA_MODES = new Set(['same_day', 'noon_cutoff', 'working_days']);
const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,62}$/;
const LEGACY_SLUGS = new Set(['tempered_glass', 'glass_unpainted', 'glass_painted']);

const cache = new Map();
const CACHE_MS = 60 * 1000;

function isPhatSinhKindSchemaError(err) {
  const m = String(err?.message || '').toLowerCase();
  return m.includes('shared_workspace_phat_sinh_kinds');
}

function normalizeSlaMode(raw, fallback = 'same_day') {
  const v = String(raw || '').trim().toLowerCase();
  return SLA_MODES.has(v) ? v : fallback;
}

function normalizeSlaDays(raw, fallback = 1) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(30, Math.floor(n));
}

function slugFromName(name) {
  const s = String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48);
  return SLUG_RE.test(s) ? s : `ps_${Date.now().toString(36)}`;
}

function normalizePhatSinhKindToken(raw) {
  if (raw === undefined) return undefined;
  if (raw == null || raw === '') return null;
  const v = String(raw).trim();
  if (UUID_RE.test(v)) return v;
  const slug = v.toLowerCase();
  if (LEGACY_SLUGS.has(slug) || SLUG_RE.test(slug)) return slug;
  return null;
}

function canManagePhatSinhKinds(req) {
  return isAdminLike(req.user);
}

function findPhatSinhKind(kinds, raw) {
  const v = String(raw || '').trim();
  if (!v) return null;
  const lower = v.toLowerCase();
  return (kinds || []).find((k) => String(k.id) === v || String(k.slug || '').toLowerCase() === lower) || null;
}

function slaHint(kind) {
  if (!kind) return '';
  if (kind.sla_mode === 'working_days') {
    const d = Number(kind.sla_days) > 0 ? Number(kind.sla_days) : 1;
    return `${d} ngày làm việc`;
  }
  if (kind.sla_mode === 'noon_cutoff') {
    const t = String(kind.cutoff_time || '12:00').slice(0, 5);
    return `trước ${t} xong trong ngày; muộn hơn thì ngày làm sau`;
  }
  return 'xong trong ngày';
}

async function listPhatSinhKinds({ companyId, includeInactive = false } = {}) {
  const cacheKey = `${companyId || 'global'}:${includeInactive ? 1 : 0}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.exp > Date.now()) return hit.rows;

  let q = supabase
    .from('shared_workspace_phat_sinh_kinds')
    .select('id, company_id, name, slug, sla_mode, sla_days, cutoff_time, is_active, sort_order')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (!includeInactive) q = q.eq('is_active', true);
  if (companyId) q = q.or(`company_id.is.null,company_id.eq.${companyId}`);
  else q = q.is('company_id', null);
  const { data, error } = await q;
  if (error) {
    if (isPhatSinhKindSchemaError(error)) return [];
    throw error;
  }
  const rows = data || [];
  cache.set(cacheKey, { rows, exp: Date.now() + CACHE_MS });
  return rows;
}

function invalidatePhatSinhKindsCache() {
  cache.clear();
}

function cutoffClockFromKind(kind, fallbackClock) {
  const raw = kind?.cutoff_time;
  if (!raw) return fallbackClock || { hour: 12, minute: 0, second: 0, ms: 0 };
  return parseTimeToClock(raw, 12, 0);
}

function legacyKindRow(kind) {
  const v = String(kind || '').trim().toLowerCase();
  if (v === 'tempered_glass') return { slug: v, sla_mode: 'working_days', sla_days: 3 };
  if (v === 'glass_painted') return { slug: v, sla_mode: 'noon_cutoff', cutoff_time: '12:00:00' };
  if (v === 'glass_unpainted') return { slug: v, sla_mode: 'same_day' };
  return null;
}

module.exports = {
  UUID_RE,
  SLA_MODES,
  LEGACY_SLUGS,
  isPhatSinhKindSchemaError,
  normalizeSlaMode,
  normalizeSlaDays,
  slugFromName,
  normalizePhatSinhKindToken,
  canManagePhatSinhKinds,
  findPhatSinhKind,
  slaHint,
  listPhatSinhKinds,
  invalidatePhatSinhKindsCache,
  cutoffClockFromKind,
  legacyKindRow,
  isSystemAdmin,
};
