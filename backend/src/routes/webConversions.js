'use strict';

// /api/marketing-web — W3/W4 website conversions report and manual ad spend (admin only).
const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { getActiveTarget, withPrimaryDatabase } = require('../config/supabaseRouter');
const { auth } = require('../middleware/auth');
const { isTenantScopeEnforced } = require('../helpers/tenantScope');
const { buildWebConversions } = require('../modules/marketingAutomation/webConversions');

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROVIDERS = ['GOOGLE', 'CHATGPT', 'TIKTOK', 'ZALO', 'OTHER'];
const MAX_DAYS = 120;
const MAX_ROWS = 500;

const reply = (res, status, error, reason_code) => res.status(status).json({ error, reason_code });

function validDay(value) {
  if (!DAY.test(value || '')) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}

// Same identity policy as the P1 trial routes: role admin; a company admin sees only its company.
function resolveCompany(req) {
  if (req.user?.role !== 'admin') return { status: 403 };
  const own = req.user.company_id;
  const asked = req.query.company_id;
  if (asked !== undefined && !UUID.test(asked)) return { status: 400 };
  const company = own || asked;
  if (!company) return { status: 400 };
  if (own && asked && asked !== own) return { status: 403 };
  if (isTenantScopeEnforced(req) && !(req.tenantCompanyIds || []).includes(company)) return { status: 403 };
  return { company };
}

function range(req) {
  const { from, to } = req.query;
  if (!validDay(from) || !validDay(to) || from > to) return null;
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 + 1;
  return days <= MAX_DAYS ? { from, to } : null;
}

function createWebConversionsRouter({ db = supabase, primary = getActiveTarget, withPrimary = withPrimaryDatabase,
  authMiddleware = auth } = {}) {
  const router = Router();
  router.use(authMiddleware);
  async function guarded(req, res, fn) {
    const scope = resolveCompany(req);
    if (scope.status === 403) return reply(res, 403, 'Không có quyền xem chuyển đổi website', 'FORBIDDEN');
    if (scope.status === 400) return reply(res, 400, 'Thiếu công ty', 'COMPANY_REQUIRED');
    if (primary() !== 'primary') return reply(res, 503, 'Cơ sở dữ liệu chính chưa sẵn sàng', 'SOURCE_UNAVAILABLE');
    try { return await withPrimary(() => fn(scope.company)); } catch (error) {
      if (error?.code === 'INVALID_RANGE') return reply(res, 400, 'Khoảng ngày không hợp lệ', 'INVALID_RANGE');
      console.warn('[marketing-web]', req.method, req.path, 'SOURCE_UNAVAILABLE');
      return reply(res, 503, 'Chưa tải được dữ liệu, vui lòng thử lại', 'SOURCE_UNAVAILABLE');
    }
  }

  router.get('/summary', (req, res) => {
    const r = range(req);
    if (!r) return reply(res, 400, 'Khoảng ngày không hợp lệ (tối đa 120 ngày)', 'INVALID_RANGE');
    return guarded(req, res, async company =>
      res.json(await buildWebConversions({ db, companyId: company, from: r.from, to: r.to })));
  });

  router.get('/spend', (req, res) => {
    const r = range(req);
    if (!r) return reply(res, 400, 'Khoảng ngày không hợp lệ (tối đa 120 ngày)', 'INVALID_RANGE');
    return guarded(req, res, async company => {
      const { data, error } = await db.from('ad_spend_daily_manual')
        .select('provider,campaign_key,campaign_name,ngay,chi_tieu_vnd,nguon,updated_at')
        .eq('company_id', company).gte('ngay', r.from).lte('ngay', r.to)
        .order('ngay', { ascending: false }).order('provider', { ascending: true }).range(0, 1999);
      if (error) throw error;
      return res.json({ rows: data || [] });
    });
  });

  // Overwrites the day + campaign row and appends every write to the log.
  router.put('/spend', (req, res) => {
    const body = req.body;
    const nguon = body?.nguon === 'csv' ? 'csv' : 'manual';
    const input = Array.isArray(body?.rows) ? body.rows : null;
    if (!input || !input.length || input.length > MAX_ROWS)
      return reply(res, 400, `Cần 1–${MAX_ROWS} dòng chi tiêu`, 'INVALID_ROWS');
    const rows = [];
    const seen = new Set();
    for (const item of input) {
      const provider = String(item?.provider || '').toUpperCase();
      const key = String(item?.campaign_key ?? '').trim();
      const name = item?.campaign_name == null ? null : String(item.campaign_name).trim().slice(0, 300) || null;
      const amount = item?.chi_tieu_vnd;
      if (!PROVIDERS.includes(provider) || !validDay(item?.ngay) || key.length > 200 ||
          !Number.isSafeInteger(amount) || amount < 0)
        return reply(res, 400, 'Dòng chi tiêu không hợp lệ', 'INVALID_ROWS');
      const id = JSON.stringify([provider, key, item.ngay]);
      if (seen.has(id)) return reply(res, 400, 'Có dòng trùng ngày và chiến dịch', 'DUPLICATE_ROWS');
      seen.add(id);
      rows.push({ provider, campaign_key: key, campaign_name: name, ngay: item.ngay, chi_tieu_vnd: amount });
    }
    return guarded(req, res, async company => {
      const now = new Date().toISOString();
      const stamped = rows.map(row => ({ ...row, company_id: company, nguon,
        entered_by: req.user.userId || null, updated_at: now }));
      const { error } = await db.from('ad_spend_daily_manual')
        .upsert(stamped, { onConflict: 'company_id,provider,campaign_key,ngay' });
      if (error) throw error;
      const { error: logError } = await db.from('ad_spend_daily_manual_log').insert(stamped.map(row => ({
        company_id: row.company_id, provider: row.provider, campaign_key: row.campaign_key, ngay: row.ngay,
        chi_tieu_vnd: row.chi_tieu_vnd, nguon: row.nguon, entered_by: row.entered_by })));
      if (logError) throw logError;
      return res.json({ saved: stamped.length });
    });
  });
  return router;
}

module.exports = { createWebConversionsRouter, resolveCompany };
