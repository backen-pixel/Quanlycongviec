'use strict';

const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { getActiveTarget, withPrimaryDatabase } = require('../config/supabaseRouter');
const { auth } = require('../middleware/auth');
const { isAdminLike } = require('../helpers/adminRole');
const store = require('../modules/aiReplyDraft/store');
const { createDraftService } = require('../modules/aiReplyDraft/service');
const { createOpenAiProvider } = require('../modules/aiReplyDraft/provider');
const { loadDraftConfig } = require('../modules/aiReplyDraft/config');
const { summarizeDrafts } = require('../modules/aiReplyDraft/report');

// Pilot-only drafting. This router records and reads drafts; it never sends a message.
// Staff send through the existing Facebook reply route and then record the outcome here.
const router = Router();
const reply = (res, status, error, reason_code) => res.status(status).json({ error, reason_code });
router.use((req, res, next) => process.env.P2_AI_DRAFTS_ENABLED === '1'
  ? next() : reply(res, 404, 'Không tìm thấy', 'NOT_FOUND'));
router.use(auth);

let cached = null;
const getConfig = () => (cached ||= loadDraftConfig(process.env));
let service = null;
const getService = () => (service ||= createDraftService({ db: supabase, store,
  provider: createOpenAiProvider({ getApiKey: () => process.env.OPENAI_API_KEY }), config: getConfig() }));

const STORE_CODES = ['INVALID_COMMAND', 'REQUEST_CONFLICT', 'REVISION_CONFLICT', 'COMPANY_MISMATCH', 'DRAFT_CLOSED'];
function storeError(res, error) {
  const code = STORE_CODES.find(c => error?.code === c || String(error?.message || '').includes(c));
  if (code === 'INVALID_COMMAND') return reply(res, 400, 'Dữ liệu không hợp lệ', code);
  if (code) return reply(res, 409, 'Bản nháp đã thay đổi hoặc đã đóng, vui lòng tải lại', code);
  return reply(res, 503, 'Chưa ghi nhận được, vui lòng thử lại', 'WRITE_UNAVAILABLE');
}

// Admin + named pilot user only; fail closed when the allow-lists are empty.
function pilotUser(req) {
  const config = getConfig();
  return Boolean(req.user && isAdminLike(req.user) && config.userIds.includes(req.user.userId)
    && config.companyIds.length && config.pageIds.length);
}

// Lead must be in a pilot company and on a pilot Page.
async function pilotLead(leadId) {
  const config = getConfig();
  const { data: lead, error } = await supabase.from('crm_leads')
    .select('id,company_id').eq('id', leadId).maybeSingle();
  if (error) throw error;
  if (!lead || !config.companyIds.includes(lead.company_id)) return null;
  const { data: contact, error: contactError } = await supabase.from('facebook_contacts')
    .select('page_id').eq('lead_id', lead.id).limit(1).maybeSingle();
  if (contactError) throw contactError;
  return contact && config.pageIds.includes(contact.page_id) ? lead : null;
}

async function guarded(req, res, work) {
  if (!pilotUser(req)) return reply(res, 403, 'Không có quyền dùng bản nháp AI', 'FORBIDDEN');
  if (getActiveTarget() !== 'primary')
    return reply(res, 503, 'Cơ sở dữ liệu chính chưa sẵn sàng', 'WRITE_GATE_CLOSED');
  try {
    return await withPrimaryDatabase(async () => {
      const lead = await pilotLead(req.params.leadId || req.body?.lead_id);
      if (!lead) return reply(res, 403, 'Khách không thuộc phạm vi thử nghiệm', 'FORBIDDEN');
      return work(lead);
    });
  } catch (error) {
    return storeError(res, error);
  }
}

router.get('/config', (req, res) => pilotUser(req)
  ? res.json({ enabled: true }) : reply(res, 403, 'Không có quyền dùng bản nháp AI', 'FORBIDDEN'));

// Usage summary for the pilot companies: counts and cost only, never draft text.
router.get('/report', async (req, res) => {
  if (!pilotUser(req)) return reply(res, 403, 'Không có quyền dùng bản nháp AI', 'FORBIDDEN');
  const days = [7, 30].includes(Number(req.query?.days)) ? Number(req.query.days) : 7;
  if (getActiveTarget() !== 'primary')
    return reply(res, 503, 'Cơ sở dữ liệu chính chưa sẵn sàng', 'SOURCE_UNAVAILABLE');
  try {
    return await withPrimaryDatabase(async () => {
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const { data, error } = await supabase.from('ai_reply_draft_events')
        .select('draft_id,revision,kind,policy_reasons,prompt_tokens,completion_tokens,cost_vnd')
        .in('company_id', getConfig().companyIds).gte('recorded_at', since)
        .order('recorded_at', { ascending: true }).limit(5000);
      if (error) throw error;
      return res.json({ days, truncated: (data || []).length >= 5000, ...summarizeDrafts(data || []) });
    });
  } catch {
    return reply(res, 503, 'Chưa tải được báo cáo, vui lòng thử lại', 'SOURCE_UNAVAILABLE');
  }
});

router.post('/leads/:leadId/generate', (req, res) => guarded(req, res, async lead => {
  const requestId = req.body?.request_id;
  if (typeof requestId !== 'string' || !requestId.trim())
    return reply(res, 400, 'Thiếu request_id', 'INVALID_COMMAND');
  const result = await getService().generateForLead(lead.id, { requestId });
  return res.json({ status: result.status, reason: result.reason ?? null,
    ...(result.status === 'GENERATED' && { draft_id: result.draftId, text: result.text }) });
}));

router.get('/leads/:leadId/latest', (req, res) => guarded(req, res, async lead => {
  const { data, error } = await supabase.from('ai_reply_draft_events')
    .select('draft_id,revision,kind,draft_text,policy_reasons,recorded_at')
    .eq('company_id', lead.company_id).eq('lead_id', lead.id)
    .order('recorded_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data) return res.json({ draft: null });
  return res.json({ draft: { draft_id: data.draft_id, revision: data.revision, kind: data.kind,
    text: data.kind === 'DISCARDED' || data.kind === 'REJECTED' ? null : data.draft_text,
    policy_reasons: data.policy_reasons || [] } });
}));

const ACTIONS = { edited: store.recordEdited, sent: store.recordSentByHuman, rejected: store.recordRejected };
for (const [name, record] of Object.entries(ACTIONS)) {
  router.post(`/drafts/:draftId/${name}`, (req, res) => guarded(req, res, async lead => {
    const { request_id: requestId, expected_revision: expectedRevision, draft_text: text } = req.body || {};
    if (typeof requestId !== 'string' || !requestId.trim() || !Number.isInteger(expectedRevision))
      return reply(res, 400, 'Dữ liệu không hợp lệ', 'INVALID_COMMAND');
    const saved = await record(supabase, { companyId: lead.company_id, actorId: req.user.userId,
      requestId, leadId: lead.id, draftId: req.params.draftId, expectedRevision,
      payload: name === 'rejected' ? {} : { draft_text: text } });
    return res.json({ draft_id: saved.event.draft_id, revision: saved.event.revision, kind: saved.event.kind });
  }));
}

module.exports = router;
