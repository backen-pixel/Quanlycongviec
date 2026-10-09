'use strict';

const { randomUUID } = require('node:crypto');
const { anonymizeConversation, restore } = require('./anonymize');
const { buildSystemPrompt, validateDraft } = require('./policy');
const { checkBudget, estimateVnd } = require('./budget');

const result = (status, reason) => ({ status, reason });
const read = async query => {
  const { data, error } = await query;
  if (error) throw error;
  return data;
};
const providerCode = error => ['PROVIDER_AUTH', 'PROVIDER_RATE_LIMIT', 'PROVIDER_TIMEOUT', 'PROVIDER_ERROR'].includes(error?.code) ? error.code : 'PROVIDER_ERROR';
const fromEvent = event => event.kind === 'GENERATED'
  ? { status: 'GENERATED', draftId: event.draft_id, text: event.draft_text }
  : { status: 'DISCARDED', reason: event.policy_reasons?.[0] || 'POLICY_REJECTED' };

function createDraftService({ db, store, provider, now = () => new Date(), config = {} }) {
  const inFlight = new Map();
  async function run(leadId, requestId) {
    if (config.enabled !== true) return result('DISABLED', 'DISABLED');
    try {
      const lead = await read(db.from('crm_leads')
        .select('id,company_id,customer_id,install_address').eq('id', leadId).maybeSingle());
      if (!lead) return result('LEAD_NOT_FOUND', 'LEAD_NOT_FOUND');
      if (!Array.isArray(config.companyIds) || !config.companyIds.includes(lead.company_id))
        return result('COMPANY_NOT_ENABLED', 'COMPANY_NOT_ENABLED');
      const prior = await store.getByRequest(db, { companyId: lead.company_id, requestId });
      if (prior) return prior.lead_id === leadId && ['GENERATED', 'DISCARDED'].includes(prior.kind)
        ? fromEvent(prior) : result('REQUEST_CONFLICT', 'REQUEST_CONFLICT');
      const rows = await read(db.from('facebook_messages')
        .select('direction,content,sent_by,created_at,id').eq('lead_id', leadId)
        .eq('message_type', 'text').not('content', 'is', null)
        .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(20));
      const messages = (rows || []).filter(m => typeof m.content === 'string' && m.content.trim())
        .reverse();
      if (!messages.some(m => m.direction === 'inbound')) return result('NO_INBOUND', 'NO_INBOUND');
      const last = messages.at(-1);
      if (last.direction === 'outbound' && last.sent_by) return result('ALREADY_REPLIED', 'ALREADY_REPLIED');
      const customer = lead.customer_id ? await read(db.from('customers')
        .select('full_name,address').eq('id', lead.customer_id).maybeSingle()) : null;
      if (lead.customer_id && !customer) return result('CUSTOMER_NOT_FOUND', 'CUSTOMER_NOT_FOUND');
      const anonymous = anonymizeConversation({ messages: messages.map(m =>
        ({ direction: m.direction, text: m.content })),
        customer: { name: customer?.full_name || '',
          address: [customer?.address, lead.install_address].filter(Boolean).join(', ') },
        maxMessages: 20 });
      if (anonymous.safe !== true) return result('UNSAFE_CONTEXT', 'UNSAFE_CONTEXT');
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric', month: '2-digit', day: '2-digit' }).format(now());
      const usedToday = await store.getUsage(db, { companyId: lead.company_id, leadId, day });
      const system = buildSystemPrompt({ pilotFacts: config.pilotFacts });
      const promptTokens = Math.ceil((system.length + anonymous.text.length) / 4);
      const maxOutputTokens = config.maxOutputTokens;
      const estimate = { ...config.pricing, promptTokens, maxOutputTokens };
      const budget = checkBudget({ usedToday, caps: config.caps, estimate });
      if (!budget.allowed) return result('BUDGET_DENIED', budget.reason);
      let generated;
      try {
        generated = await provider.generate({ system, user: anonymous.text, maxOutputTokens });
      } catch (error) { return result(providerCode(error), providerCode(error)); }
      const usage = generated?.usage;
      if (!Number.isSafeInteger(usage?.promptTokens) || usage.promptTokens < 0 ||
        !Number.isSafeInteger(usage?.completionTokens) || usage.completionTokens < 0)
        return result('PROVIDER_ERROR', 'PROVIDER_ERROR');
      const cost = estimateVnd({ ...config.pricing, promptTokens: usage.promptTokens,
        maxOutputTokens: usage.completionTokens });
      if (cost === null) return result('PROVIDER_ERROR', 'PROVIDER_ERROR');
      const checked = validateDraft(generated.text, { allowedFacts: config.pilotFacts });
      const text = checked.ok ? restore(generated.text.trim(), anonymous.placeholders) : null;
      const reasons = checked.ok ? validateDraft(text, { allowedFacts: config.pilotFacts }).reasons : checked.reasons;
      const base = { companyId: lead.company_id, leadId, requestId, draftId: randomUUID(),
        expectedRevision: 0, payload: { model: generated.model, prompt_version: config.promptVersion,
          prompt_tokens: usage.promptTokens, completion_tokens: usage.completionTokens, cost_vnd: cost } };
      if (reasons.length) {
        const saved = await store.recordDiscarded(db, { ...base,
          payload: { ...base.payload, policy_reasons: reasons } });
        return fromEvent(saved.event);
      }
      const saved = await store.recordGenerated(db, { ...base,
        payload: { ...base.payload, draft_text: text } });
      return fromEvent(saved.event);
    } catch (error) {
      const code = ['REQUEST_CONFLICT', 'REVISION_CONFLICT', 'DRAFT_CLOSED',
        'COMPANY_MISMATCH'].includes(error?.code) ? error.code : 'DRAFT_ERROR';
      return result(code, code);
    }
  }
  return { generateForLead(leadId, { requestId } = {}) {
    if (typeof leadId !== 'string' || !leadId.trim() ||
      typeof requestId !== 'string' || !requestId.trim())
      return Promise.resolve(result('INVALID_REQUEST', 'INVALID_REQUEST'));
    const key = `${leadId}:${requestId}`;
    if (inFlight.has(key)) return inFlight.get(key);
    const pending = run(leadId, requestId).finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
    return pending;
  } };
}
module.exports = { createDraftService };
