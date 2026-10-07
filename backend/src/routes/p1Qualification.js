'use strict';

const { createHash } = require('node:crypto');
const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { getActiveTarget, withPrimaryDatabase } = require('../config/supabaseRouter');
const { auth } = require('../middleware/auth');
const { isTenantScopeEnforced } = require('../helpers/tenantScope');
const { canMarkQualified, setQualification, revokeQualification, getQualification } =
  require('../modules/marketingAutomation/qualification');

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
module.exports = router;
