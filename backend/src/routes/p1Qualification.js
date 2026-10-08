'use strict';

const { createHash } = require('node:crypto');
const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { getActiveTarget, withPrimaryDatabase } = require('../config/supabaseRouter');
const { auth } = require('../middleware/auth');
const { isTenantScopeEnforced } = require('../helpers/tenantScope');
const { canMarkQualified, setQualification, revokeQualification, getQualification } =
  require('../modules/marketingAutomation/qualification');
const { loadTrialCohort } = require('../modules/marketingAutomation/trialCohort');
const { buildTrialSummary } = require('../modules/marketingAutomation/trialSummary');

const router = Router();
router.use((req, res, next) => process.env.VPT_P1_REVIEW_WRITE === '1'
  ? next() : res.status(404).json({ error: 'Không tìm thấy', reason_code: 'NOT_FOUND' }));
router.use(auth);

const SET_KEYS = ['request_id', 'expected_revision', 'status', 'contact_usable',
  'need_in_scope', 'area_in_service', 'evidence_ref', 'reason'];
const REVOKE_KEYS = ['request_id', 'expected_revision', 'reason'];
const PUBLIC_KEYS = ['id', 'status', 'contact_usable', 'need_in_scope',
  'area_in_service', 'evidence_ref', 'reason', 'revision', 'recorded_at', 'actor_id'];
const reply = (res, status, error, reason_code) =>
  res.status(status).json({ error, reason_code });
const visible = row => Object.fromEntries(PUBLIC_KEYS.filter(key => row[key] !== undefined)
  .map(key => [key, row[key]]));

function errorReply(res, error) {
  const code = ['INVALID_COMMAND', 'REASON_REQUIRED', 'EVIDENCE_REQUIRED',
    'REVISION_CONFLICT', 'REQUEST_CONFLICT', 'COMPANY_MISMATCH']
    .find(item => error?.code === item || String(error?.message || '').includes(item));
  if (code === 'INVALID_COMMAND' || code === 'REASON_REQUIRED' || code === 'EVIDENCE_REQUIRED')
    return reply(res, 400, 'Dữ liệu xác nhận không hợp lệ', code);
  if (code === 'REVISION_CONFLICT')
    return reply(res, 409, 'Trạng thái đã đổi, vui lòng tải lại trạng thái', code);
  if (code === 'REQUEST_CONFLICT')
    return reply(res, 409, 'Phát lại đúng cùng request_id hoặc dùng request_id mới', code);
  if (code === 'COMPANY_MISMATCH')
    return reply(res, 409, 'Dữ liệu công ty không khớp', code);
  return reply(res, 503, 'Chưa xử lý được; nếu đã gửi lệnh, hãy phát lại cùng request_id',
    'WRITE_UNAVAILABLE');
}

function validBody(body, keys) {
  return body && typeof body === 'object' && !Array.isArray(body)
    && Object.keys(body).every(key => keys.includes(key))
    && typeof body.request_id === 'string' && body.request_id.trim()
    && Number.isInteger(body.expected_revision) && body.expected_revision >= 0;
}

async function handle(req, res, kind) {
  if (!req.user) return reply(res, 401, 'Chưa đăng nhập', 'UNAUTHENTICATED');
  // Fail closed before any CRM read when failover is active.
  if (getActiveTarget() !== 'primary')
    return reply(res, 503, 'Cơ sở dữ liệu chính chưa sẵn sàng', 'WRITE_GATE_CLOSED');
  try {
    return await withPrimaryDatabase(async () => {
      const { data: lead, error } = await supabase.from('crm_leads')
        .select('id,company_id,customer_id,phone,stage_id').eq('id', req.params.leadId).maybeSingle();
      if (error) throw error;
      if (!lead) return reply(res, 404, 'Không tìm thấy khách', 'NOT_FOUND');
      if (isTenantScopeEnforced(req) && !(req.tenantCompanyIds || []).includes(lead.company_id))
        return reply(res, 403, 'Không tìm thấy khách', 'FORBIDDEN');
      if (!canMarkQualified({ role: req.user.role, userCompanyId: req.user.company_id }, lead.company_id))
        return reply(res, 403, 'Không có quyền xác nhận khách', 'FORBIDDEN');
      if (kind === 'get') {
        const state = await getQualification(supabase,
          { companyId: lead.company_id, canonicalLeadId: lead.id });
        return res.json(state ? visible(state) : { status: 'PENDING', revision: 0 });
      }
      const body = req.body;
      if (!validBody(body, kind === 'set' ? SET_KEYS : REVOKE_KEYS))
        return reply(res, 400, 'Dữ liệu xác nhận không hợp lệ', 'INVALID_COMMAND');
      const contextHash = createHash('sha256').update(JSON.stringify([
        lead.id, lead.company_id, lead.customer_id, lead.phone, lead.stage_id,
      ])).digest('hex');
      const input = { companyId: lead.company_id, actorId: req.user.userId,
        requestId: body.request_id, canonicalLeadId: lead.id,
        expectedRevision: body.expected_revision,
        payload: kind === 'set'
          ? { status: body.status, contact_usable: body.contact_usable,
            need_in_scope: body.need_in_scope, area_in_service: body.area_in_service,
            ...(body.evidence_ref !== undefined && { evidence_ref: body.evidence_ref }),
            ...(body.reason !== undefined && { reason: body.reason }), context_hash: contextHash }
          : { reason: body.reason, context_hash: contextHash } };
      const result = kind === 'set'
        ? await setQualification(supabase, input) : await revokeQualification(supabase, input);
      return res.json(visible(result.event));
    });
  } catch (error) {
    if (getActiveTarget() !== 'primary' || error?.code === 'FB_INBOX_PRIMARY_REQUIRED')
      return reply(res, 503, 'Cơ sở dữ liệu chính chưa sẵn sàng', 'WRITE_GATE_CLOSED');
    return errorReply(res, error);
  }
}

router.get('/leads/:leadId', (req, res) => handle(req, res, 'get'));
router.put('/leads/:leadId', (req, res) => handle(req, res, 'set'));
router.post('/leads/:leadId/revoke', (req, res) => handle(req, res, 'revoke'));
// Queue reads share the command flag, identity policy and primary database.
const readFailure = res => reply(res, 503, 'Chưa tải được nguồn dữ liệu, vui lòng thử lại', 'SOURCE_UNAVAILABLE');
function allowedCompanies(req) {
  if (req.user?.role !== 'admin') return null;
  const own = req.user.company_id;
  if (own) return isTenantScopeEnforced(req) && !(req.tenantCompanyIds || []).includes(own)
    ? [] : [own];
  return isTenantScopeEnforced(req) ? (req.tenantCompanyIds || []) : null;
}
async function readRoute(req, res, action) {
  const companies = allowedCompanies(req);
  if (req.user?.role !== 'admin' || companies?.length === 0)
    return reply(res, 403, 'Không có quyền xác nhận khách', 'FORBIDDEN');
  if (getActiveTarget() !== 'primary') return readFailure(res);
  try {
    return await withPrimaryDatabase(async () => {
      if (action === 'config') return res.json({ enabled: true, can_mark: true });
      if (action === 'trials') {
        let q = supabase.from('p1_trials').select('id,company_id,name,status,start_date,end_date');
        if (companies) q = q.in('company_id', companies);
        if (req.query.company_id) {
          if (companies && !companies.includes(req.query.company_id)) return res.json({ trials: [] });
          q = q.eq('company_id', req.query.company_id);
        }
        const { data, error } = await q.order('start_date', { ascending: false, nullsFirst: false });
        if (error) throw error;
        return res.json({ trials: data || [] });
      }
      const id = req.query.trial_id;
      if (typeof id !== 'string' || !id) return reply(res, 400, 'Thiếu đợt thử', 'INVALID_TRIAL');
      const { data: trial, error: trialError } = await supabase.from('p1_trials')
        .select('id,company_id,name,status,start_date,end_date').eq('id', id).maybeSingle();
      if (trialError) throw trialError;
      if (!trial || (companies && !companies.includes(trial.company_id)) ||
        !canMarkQualified({ role: req.user.role, userCompanyId: req.user.company_id }, trial.company_id))
        return reply(res, 404, 'Không tìm thấy đợt thử', 'NOT_FOUND');
      if (action === 'snapshots') {
        const limit = req.query.limit === undefined ? 30 : Number(req.query.limit);
        if (!Number.isInteger(limit) || limit < 1 || limit > 200)
          return reply(res, 400, 'Giới hạn không hợp lệ', 'INVALID_LIMIT');
        const { data, error } = await supabase.from('p1_trial_snapshots')
          .select('taken_at,as_of,summary').eq('trial_id', trial.id)
          .eq('company_id', trial.company_id).order('taken_at', { ascending: false })
          .range(0, limit - 1);
        if (error || !Array.isArray(data)) throw error || Error('SOURCE_UNAVAILABLE');
        const numberOrNull = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
        return res.json({ snapshots: data.map(row => ({
          taken_at: row.taken_at, as_of: row.as_of,
          spend_vnd: numberOrNull(row.summary?.spend?.vnd),
          candidates: numberOrNull(row.summary?.leads?.candidates),
          qualified: numberOrNull(row.summary?.leads?.qualified),
          milestone_reached: numberOrNull(row.summary?.milestone?.reached),
          cost_to_date_vnd_ceil: numberOrNull(row.summary?.milestone?.cost_to_date?.vnd_ceil),
          spend_status: row.summary?.spend?.status ?? null,
        })) });
      }
      if (!trial.start_date || !trial.end_date) return reply(res, 409, 'Đợt thử thiếu ngày', 'TRIAL_DATES_MISSING');
      if (action === 'summary') {
        const { summary } = await buildTrialSummary({ db: supabase, trial, now: new Date() });
        return res.json(summary);
      }
      const filter = req.query.state || 'ALL', limit = req.query.limit === undefined ? 25 : Number(req.query.limit);
      if (!['ALL', 'PENDING', 'QUALIFIED', 'REJECTED'].includes(filter) ||
        !Number.isInteger(limit) || limit < 1 || limit > 50)
        return reply(res, 400, 'Bộ lọc không hợp lệ', 'INVALID_FILTER');
      let cursor = null;
      if (req.query.cursor) {
        try {
          cursor = JSON.parse(Buffer.from(req.query.cursor, 'base64url').toString('utf8'));
          if (!Array.isArray(cursor) || cursor.length !== 2 ||
            !Number.isFinite(Date.parse(cursor[0])) || typeof cursor[1] !== 'string') throw Error();
        } catch { return reply(res, 400, 'Con trỏ không hợp lệ', 'INVALID_CURSOR'); }
      }
      const { candidates, statesByLead, excludedUnavailable } = await loadTrialCohort(supabase, trial);
      const selected = candidates.filter(row => {
        const status = statesByLead.get(row.lead_id)?.status || 'PENDING';
        return (filter === 'ALL' || filter === status) && (!cursor ||
          Date.parse(row.cham_dau_luc) < Date.parse(cursor[0]) ||
          (row.cham_dau_luc === cursor[0] && row.id > cursor[1]));
      });
      const page = selected.slice(0, limit), ids = page.map(row => row.lead_id);
      let leads = [];
      if (ids.length) {
        const result = await supabase.from('crm_leads').select('id,company_id,code,title')
          .eq('company_id', trial.company_id).in('id', ids);
        if (result.error) throw result.error;
        leads = result.data || [];
      }
      const byId = new Map(leads.map(row => [row.id, row]));
      const rows = page.filter(row => byId.has(row.lead_id)).map(row => ({
        lead_id: row.lead_id, code: byId.get(row.lead_id).code,
        title: byId.get(row.lead_id).title, touched_at: row.cham_dau_luc,
        campaign_ref: row.fb_campaign_id, ad_ref: row.fb_ad_id,
        state: statesByLead.get(row.lead_id) || { status: 'PENDING', revision: 0 },
      }));
      // A touch whose CRM record is gone (or in another company) must not block the whole queue.
      const last = page.at(-1);
      return res.json({ rows, excluded_unavailable: excludedUnavailable + page.length - rows.length,
        scope_check: 'UNVERIFIED', has_more: selected.length > limit,
        next_cursor: selected.length > limit
          ? Buffer.from(JSON.stringify([last.cham_dau_luc, last.id])).toString('base64url') : null });
    });
  } catch { return readFailure(res); }
}
router.get('/config', (req, res) => readRoute(req, res, 'config'));
router.get('/trials', (req, res) => readRoute(req, res, 'trials'));
router.get('/queue', (req, res) => readRoute(req, res, 'queue'));
router.get('/summary', (req, res) => readRoute(req, res, 'summary'));
router.get('/snapshots', (req, res) => readRoute(req, res, 'snapshots'));
module.exports = router;
