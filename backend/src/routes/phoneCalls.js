'use strict';

// POST /api/external/phone-calls — an Android phone (MacroDroid "Call Incoming", numbers NOT in
// the phone's contacts) reports an incoming call. Auth: X-Api-Key (same keys as /api/external).
// Body: { phone, at? }. Everything else is ignored; contact names are never stored.
// Flow: normalize → 30-min dedupe → link to an existing lead/deal/customer of the key's company,
// otherwise create a lead through the SAME handler as POST /api/external/leads → log the call.
const express = require('express');
const { validateVnSubscriberPhoneStored } = require('../helpers/facebookPhoneExtract');

const PROVIDER = 'android_phone';
const DEDUPE_MS = 30 * 60_000;
const CLICK_WINDOW_MS = 10 * 60_000;
const CLICK_SKEW_MS = 60_000; // phone clock vs server clock
const SOURCE_NAME = 'Cuộc gọi đến điện thoại';
const TRACKED = ['platform', 'campaign_id', 'adset_id', 'ad_id',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'gclid', 'fbclid', 'gbraid', 'wbraid', 'landing_url'];

function normalizeCallerPhone(raw) {
  if (raw == null || (typeof raw !== 'string' && typeof raw !== 'number')) return null;
  const v = validateVnSubscriberPhoneStored(String(raw).slice(0, 40));
  return v.valid ? v.normalized : null;
}

/** Call time from `at` (ISO or unix s/ms); anything implausible falls back to server time. */
function callTime(at, now) {
  let t = NaN;
  if (typeof at === 'number' || (typeof at === 'string' && /^\d{9,13}$/.test(at.trim()))) {
    const n = Number(at);
    t = n < 1e12 ? n * 1000 : n;
  } else if (typeof at === 'string' && at.trim()) {
    t = Date.parse(at);
  }
  if (!Number.isFinite(t) || t > now + 5 * 60_000 || t < now - 24 * 3600_000) return new Date(now);
  return new Date(t);
}

const hhmm = d => new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(d);

const phoneVariants = p => [p, `+84${p.slice(1)}`, `84${p.slice(1)}`];

async function findExisting(db, companyId, phone) {
  const variants = phoneVariants(phone);
  const { data: customers } = await db.from('customers')
    .select('id, company_id').in('phone', variants).limit(20);
  const customerIds = (customers || []).map(c => c.id);
  const ors = [`phone.in.(${variants.join(',')})`];
  if (customerIds.length) ors.push(`customer_id.in.(${customerIds.join(',')})`);
  const { data: lead } = await db.from('crm_leads')
    .select('id, customer_id')
    .eq('company_id', companyId)
    .or(ors.join(','))
    .order('actual_close_date', { ascending: false, nullsFirst: true })
    .order('created_at', { ascending: false })
    .limit(1).maybeSingle();
  if (lead) return { lead_id: lead.id, customer_id: lead.customer_id || null };
  const own = (customers || []).find(c => String(c.company_id) === String(companyId));
  return own ? { lead_id: null, customer_id: own.id } : null;
}

async function findCallClick(db, companyId, at) {
  const { data } = await db.from('web_conversion_events')
    .select(`occurred_at, ${TRACKED.join(', ')}`)
    .eq('company_id', companyId)
    .eq('kind', 'call')
    .gte('occurred_at', new Date(at.getTime() - CLICK_WINDOW_MS).toISOString())
    .lte('occurred_at', new Date(at.getTime() + CLICK_SKEW_MS).toISOString())
    .order('occurred_at', { ascending: false })
    .limit(1).maybeSingle();
  return data || null;
}

function attributionFromClick(click) {
  const out = { kenh: 'website' };
  for (const key of TRACKED) {
    if (typeof click[key] === 'string' && click[key].trim()) out[key] = click[key].trim();
  }
  return out;
}

/** Runs POST /api/external/leads' handler in-process and captures its response. */
function leadCreatorFrom(handler) {
  return async (req, body) => {
    const original = req.body;
    const res = { statusCode: 200, body: null,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; } };
    req.body = body;
    try { await handler(req, res); } finally { req.body = original; }
    return { status: res.statusCode, body: res.body };
  };
}

function createPhoneCallsRouter({ getDb, createLead, auth, checkRateLimit, now = () => Date.now() }) {
  const router = express.Router();
  const authenticate = auth || require('../middleware/apiKeyAuth').apiKeyAuth;
  // Some MacroDroid setups send the JSON with text/plain.
  router.post('/', express.text({ type: 'text/plain', limit: '4kb' }), authenticate, async (req, res) => {
    const key = req.apiKey || {};
    if (!key.company_id) return res.status(400).json({ error: 'API key chưa gắn công ty' });
    if (checkRateLimit && !checkRateLimit({ apiKeyId: `phone-calls:${key.id}`, ip: req.ip, limit: 30 }).ok) {
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    if (!body || typeof body !== 'object') body = {};

    const phone = normalizeCallerPhone(body.phone);
    if (!phone) return res.json({ ok: true, skipped: 'invalid_phone' });
    const at = callTime(body.at, now());
    const db = getDb();
    const companyId = key.company_id;

    try {
      const { data: recent, error: dupErr } = await db.from('crm_call_logs')
        .select('id')
        .eq('company_id', companyId)
        .eq('provider', PROVIDER)
        .eq('phone_from', phone)
        .gte('started_at', new Date(at.getTime() - DEDUPE_MS).toISOString())
        .limit(1).maybeSingle();
      if (dupErr) throw dupErr;
      if (recent) return res.json({ ok: true, duplicate: true });

      let link = await findExisting(db, companyId, phone);
      let created = false;
      if (!link) {
        const click = await findCallClick(db, companyId, at);
        const lines = [`Cuộc gọi đến điện thoại lúc ${hhmm(at)} (số không có trong danh bạ máy).`];
        const leadBody = {
          title: `Cuộc gọi đến — ${phone}`,
          phone,
          type: 'lead',
          source_name: SOURCE_NAME,
        };
        if (click) {
          lines.push(`Đoán nguồn theo lượt bấm gọi trên web lúc ${hhmm(new Date(click.occurred_at))}.`);
          leadBody.attribution = attributionFromClick(click);
        }
        // No allowed lead_attribution.kenh means "direct phone call"; without a click we omit it.
        leadBody.description = lines.join('\n');
        const result = await createLead(req, leadBody);
        if (result.status !== 201 || !result.body?.lead?.id) {
          console.warn('[phone-calls] LEAD_CREATE_FAILED', result.status);
          return res.status(result.status >= 400 && result.status < 500 ? result.status : 502)
            .json({ ok: false, error: result.body?.error || 'Không tạo được lead' });
        }
        const leadId = result.body.lead.id;
        const { data: row } = await db.from('crm_leads').select('customer_id').eq('id', leadId).maybeSingle();
        link = { lead_id: leadId, customer_id: row?.customer_id || null };
        created = true;
      }

      const { error: logErr } = await db.from('crm_call_logs').insert({
        company_id: companyId,
        provider: PROVIDER,
        direction: 'inbound',
        status: 'incoming',
        phone_from: phone,
        lead_id: link.lead_id,
        customer_id: link.customer_id,
        started_at: at.toISOString(),
      });
      // The lead (if any) exists already; a log failure must not make the phone retry and duplicate it.
      if (logErr) console.warn('[phone-calls] LOG_WRITE_FAILED');
      return res.json({ ok: true, lead_id: link.lead_id, created, matched: !created });
    } catch {
      console.warn('[phone-calls] FAILED');
      return res.status(503).json({ ok: false, error: 'Chưa ghi được' });
    }
  });
  return router;
}

module.exports = { createPhoneCallsRouter, leadCreatorFrom, normalizeCallerPhone, callTime };
