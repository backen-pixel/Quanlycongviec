/**
 * Zalo OA — Webhook nhận tin khách + API hộp thư CRM
 *
 * Webhook URL: POST /api/zalo/webhook
 * Cấu hình trong Zalo OA → Quản lý ứng dụng → Webhook
 */
const express = require('express');
const r = express.Router();
const { supabase } = require('../config/supabase');
const { auth: authMiddleware } = require('../middleware/auth');
const { isSystemAdmin } = require('../helpers/adminRole');
const { extractContactInfo } = require('../helpers/facebookPhoneExtract');
const { createLeadFromZaloContact, runZaloBatchExtractPhones, runZaloBatchCreateLeads, extractFromZaloContact, syncZaloContactProfile, runZaloBatchRefreshProfiles, isPlaceholderZaloDisplayName, normalizeZaloModuleKey, normalizeZaloTargetType, resolveZaloModuleKeyForOa, resolveZaloCreateType } = require('../helpers/zaloBatchTools');
const {
  isUserSendEvent,
  isOaEchoEvent,
  verifyZaloWebhookSignature,
  parseZaloWebhookMessage,
  fetchZaloUserProfile,
  sendZaloCsTextMessage,
} = require('../helpers/zaloOaMessaging');
const { formatVnPhoneLocal0From84, normalizeVnPhoneTo84 } = require('../helpers/zaloOa');

const ZALO_DISABLE_WEBHOOK_LOGS = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.ZALO_DISABLE_WEBHOOK_LOGS || '').toLowerCase(),
);

const _processingMsgIds = new Set();
const _asyncLockTails = new Map();

function acquireMsgLock(msgId) {
  if (!msgId) return true;
  if (_processingMsgIds.has(msgId)) return false;
  _processingMsgIds.add(msgId);
  setTimeout(() => _processingMsgIds.delete(msgId), 60000);
  return true;
}

function withAsyncLock(key, fn) {
  const prev = _asyncLockTails.get(key) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const run = prev.catch(() => {}).then(() => fn()).finally(() => release());
  _asyncLockTails.set(key, gate);
  return run.finally(() => {
    if (_asyncLockTails.get(key) === gate) _asyncLockTails.delete(key);
  });
}

const _oaConfigCache = {};
async function getOaConfig(oaId) {
  const key = String(oaId || '');
  const cached = _oaConfigCache[key];
  if (cached && Date.now() - cached.ts < 60000) return cached.data;
  const { data } = await supabase.from('zalo_oa_accounts')
    .select('*').eq('oa_id', key).eq('is_active', true).maybeSingle();
  _oaConfigCache[key] = { data, ts: Date.now() };
  return data;
}

async function getOrCreateContact(oaId, userId, displayName, avatarUrl) {
  let { data: contact } = await supabase.from('zalo_contacts')
    .select('*').eq('oa_id', oaId).eq('user_id', userId).maybeSingle();

  if (contact) {
    const upd = {};
    if (displayName && displayName !== contact.display_name) upd.display_name = displayName;
    if (avatarUrl && avatarUrl !== contact.avatar_url) upd.avatar_url = avatarUrl;
    if (Object.keys(upd).length) {
      upd.updated_at = new Date().toISOString();
      await supabase.from('zalo_contacts').update(upd).eq('id', contact.id);
      contact = { ...contact, ...upd };
    }
    return contact;
  }

  const { data: created, error } = await supabase.from('zalo_contacts').insert({
    oa_id: oaId,
    user_id: userId,
    display_name: displayName || `Zalo ${userId.slice(-6)}`,
    avatar_url: avatarUrl || null,
  }).select().single();

  if (error) {
    console.error('[Zalo OA] create contact:', error.message);
    return null;
  }
  return created;
}

async function handleWebhookEvent(body, io) {
  const parsed = parseZaloWebhookMessage(body);
  const { eventName, oaId, partnerUserId, msgId, content, isInbound, isEcho } = parsed;

  if (!isUserSendEvent(eventName) && !isOaEchoEvent(eventName)) {
    return { skipped: true, reason: 'ignored_event', eventName };
  }
  if (!oaId || !partnerUserId) {
    return { skipped: true, reason: 'missing_ids' };
  }

  return withAsyncLock(`zalo-msg:${oaId}:${partnerUserId}`, async () => {
    const oaConfig = await getOaConfig(oaId);
    if (!oaConfig) {
      console.warn('[Zalo OA] OA chưa cấu hình:', oaId);
      return { skipped: true, reason: 'oa_not_configured' };
    }

    if (msgId && !acquireMsgLock(msgId)) {
      return { skipped: true, reason: 'duplicate_lock' };
    }
    if (msgId) {
      const { data: existing } = await supabase.from('zalo_messages')
        .select('id').eq('zalo_msg_id', msgId).limit(1);
      if (existing?.length) return { skipped: true, reason: 'duplicate_db' };
    }

    let profile = null;
    if (isInbound && oaConfig.access_token) {
      profile = await fetchZaloUserProfile(oaConfig.access_token, partnerUserId);
    }

    let contact = await getOrCreateContact(
      oaId,
      partnerUserId,
      profile?.display_name || null,
      profile?.avatar || null,
    );
    if (!contact) return { skipped: true, reason: 'contact_failed' };

    if (isInbound && oaConfig.access_token && isPlaceholderZaloDisplayName(contact.display_name, contact.user_id)) {
      const syncResult = await syncZaloContactProfile(contact, oaConfig).catch((e) => {
        console.warn('[Zalo OA] sync profile on webhook:', e.message);
        return null;
      });
      if (syncResult?.display_name) {
        contact = {
          ...contact,
          display_name: syncResult.display_name,
          avatar_url: syncResult.avatar_url || contact.avatar_url,
        };
      }
    }

    const insertData = {
      contact_id: contact.id,
      lead_id: contact.lead_id,
      zalo_msg_id: msgId,
      event_name: eventName,
      direction: isEcho ? 'outbound' : 'inbound',
      message_type: parsed.messageType,
      content: parsed.content,
      attachment_url: parsed.attachmentUrl,
      attachment_type: parsed.attachmentType,
      metadata: parsed.attachments?.length ? { attachments: parsed.attachments, raw: parsed.rawMessage } : { raw: parsed.rawMessage },
    };

    const { data: savedMsg, error: insertErr } = await supabase.from('zalo_messages')
      .upsert(insertData, { onConflict: 'zalo_msg_id', ignoreDuplicates: true })
      .select().maybeSingle();

    if (insertErr && insertErr.code !== '23505') {
      console.error('[Zalo OA] insert message:', insertErr.message);
      return { ok: false, error: insertErr.message };
    }
    if (!savedMsg) return { skipped: true, reason: 'duplicate_upsert' };

    const preview = content ? String(content).slice(0, 100) : `[${parsed.messageType}]`;
    const contactUpd = {
      last_message_at: new Date().toISOString(),
      last_message_preview: preview,
      updated_at: new Date().toISOString(),
    };
    if (isInbound) {
      contactUpd.unread_count = (contact.unread_count || 0) + 1;
    }
    await supabase.from('zalo_contacts').update(contactUpd).eq('id', contact.id);

    if (isInbound) {
      let extractedPhone = null;
      if (content && content.length > 5) {
        const extracted = extractContactInfo(content);
        extractedPhone = extracted.phone;
        if (extractedPhone) {
          const local = formatVnPhoneLocal0From84(normalizeVnPhoneTo84(extractedPhone));
          if (local) {
            await supabase.from('zalo_contacts').update({ phone: local }).eq('id', contact.id);
          }
        }
      }

      if (oaConfig.auto_create_lead && !contact.lead_id) {
        const lead = await createLeadFromZaloContact(oaConfig, contact, content, extractedPhone, null);
        if (lead?.id) {
          contact.lead_id = lead.id;
          await supabase.from('zalo_messages').update({ lead_id: lead.id }).eq('contact_id', contact.id);
        }
      }

      if (oaConfig.auto_reply_message && oaConfig.access_token) {
        sendZaloCsTextMessage({
          accessToken: oaConfig.access_token,
          userId: partnerUserId,
          text: oaConfig.auto_reply_message,
        }).catch((e) => console.warn('[Zalo OA] auto-reply failed:', e.message));
      }
    }

    try {
      if (io) {
        io.emit('zalo_message', {
          contact_id: contact.id,
          lead_id: contact.lead_id,
          message: savedMsg,
          contact: { ...contact, ...contactUpd },
        });
      }
    } catch (_) { /* ignore */ }

    console.log(`[Zalo OA] Message saved (${isEcho ? 'out' : 'in'}):`, savedMsg.id);
    return { ok: true, message_id: savedMsg.id };
  });
}

// ═══ WEBHOOK (public) ═══════════════════════════════════════

r.post('/webhook', async (req, res) => {
  const body = req.body || {};
  const rawBody = req.rawBody != null ? String(req.rawBody) : JSON.stringify(body);
  const signatureHeader = req.headers['x-zevent-signature'] || req.headers['X-ZEvent-Signature'] || '';

  const oaId = body?.recipient?.id != null ? String(body.recipient.id)
    : body?.sender?.id != null ? String(body.sender.id) : null;

  let oaConfig = null;
  if (oaId) oaConfig = await getOaConfig(oaId);
  if (!oaConfig && body?.app_id) {
    const { data: byApp } = await supabase.from('zalo_oa_accounts')
      .select('*').eq('app_id', String(body.app_id)).eq('is_active', true).limit(1);
    oaConfig = byApp?.[0] || null;
  }

  if (oaConfig?.webhook_verify_enabled !== false && oaConfig?.secret_key) {
    const appId = oaConfig.app_id || String(body.app_id || '');
    const valid = verifyZaloWebhookSignature({
      appId,
      secretKey: oaConfig.secret_key,
      rawBody,
      timestamp: body.timestamp,
      signatureHeader,
    });
    if (!valid && signatureHeader) {
      console.warn('[Zalo OA] Invalid webhook signature');
      return res.status(403).json({ error: 'invalid_signature' });
    }
  }

  res.status(200).json({ status: 'ok' });

  if (!ZALO_DISABLE_WEBHOOK_LOGS) {
    supabase.from('zalo_webhook_logs').insert({
      oa_id: oaId,
      event_name: body.event_name || null,
      payload: body,
      status: 'received',
    }).then(() => {}).catch(() => {});
  }

  try {
    await handleWebhookEvent(body, r._ioRef);
  } catch (e) {
    console.error('[Zalo OA] Webhook error:', e.message, e.stack);
    if (!ZALO_DISABLE_WEBHOOK_LOGS) {
      supabase.from('zalo_webhook_logs').insert({
        oa_id: oaId,
        event_name: body.event_name || null,
        payload: body,
        status: 'error',
        error_message: String(e.message).slice(0, 500),
      }).then(() => {}).catch(() => {});
    }
  }
});

/** Zalo domain verification — trả mã xác minh nếu có query */
r.get('/webhook', (req, res) => {
  const code = req.query.code || req.query.verify || process.env.ZALO_WEBHOOK_VERIFY_CODE;
  if (code) return res.status(200).send(String(code));
  res.status(200).json({ status: 'zalo_webhook_ready' });
});

// ═══ AUTH API ═══════════════════════════════════════════════

async function resolveZaloOaScope(req, res) {
  const { data: accounts, error } = await supabase.from('zalo_oa_accounts').select('oa_id, default_company_id');
  if (error) { res.status(500).json({ error: error.message }); return null; }
  const rows = accounts || [];
  if (isSystemAdmin(req.user)) {
    const co = req.query.company_id && String(req.query.company_id).trim();
    if (co) {
      return { mode: 'filter', oaIds: rows.filter((a) => String(a.default_company_id || '') === co).map((a) => a.oa_id) };
    }
    return { mode: 'all', oaIds: null };
  }
  const cid = req.user?.company_id;
  if (!cid) { res.status(400).json({ error: 'Thiếu company_id trên tài khoản' }); return null; }
  return {
    mode: 'filter',
    oaIds: rows.filter((a) => a.default_company_id && String(a.default_company_id) === String(cid)).map((a) => a.oa_id),
  };
}

function maskToken(token) {
  if (!token) return null;
  const s = String(token);
  if (s.length <= 8) return '****';
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function enrichZaloContact(row) {
  if (!row) return row;
  const c = { ...row };
  const custPhone = c.customer?.phone && String(c.customer.phone).trim() ? String(c.customer.phone).trim() : null;
  const localPhone = c.phone && String(c.phone).trim() ? String(c.phone).trim() : null;
  c.display_phone = custPhone || localPhone || null;
  const msgTs = c.last_message_at ? new Date(c.last_message_at).getTime() : 0;
  const creTs = c.created_at ? new Date(c.created_at).getTime() : 0;
  c.activity_at = Math.max(msgTs, creTs) || null;
  return c;
}

function contactAllowedByZaloScope(scope, contact) {
  if (!scope || !contact?.oa_id) return false;
  if (scope.mode === 'all') return true;
  return Array.isArray(scope.oaIds) && scope.oaIds.includes(String(contact.oa_id));
}

function buildZaloContactsQuery(scope, query) {
  const { oa_id, search, has_lead } = query;
  let q = supabase.from('zalo_contacts')
    .select('*, lead:crm_leads(id, title, code, type), customer:customers(id, full_name, phone, email)', { count: 'exact' });
  if (scope.mode === 'filter') q = q.in('oa_id', scope.oaIds);
  if (oa_id) q = q.eq('oa_id', String(oa_id));
  if (has_lead === 'true') q = q.not('lead_id', 'is', null);
  if (has_lead === 'false') q = q.is('lead_id', null);
  if (search) {
    const s = String(search).trim().replace(/[%_]/g, '');
    if (s) q = q.or(`display_name.ilike.%${s}%,phone.ilike.%${s}%,user_id.ilike.%${s}%`);
  }
  return q.order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
}

function attachZaloOaRouting(row) {
  if (!row) return row;
  return {
    ...row,
    default_module_key: resolveZaloModuleKeyForOa(row),
    default_target_type: normalizeZaloTargetType(row?.default_target_type),
  };
}

r.get('/accounts', authMiddleware, async (req, res) => {
  try {
    let { data, error } = await supabase.from('zalo_oa_accounts')
      .select('id, oa_id, oa_name, app_id, is_active, auto_create_lead, auto_reply_message, default_module_key, default_target_type, default_pipeline_id, default_stage_id, default_source_id, default_company_id, default_region_id, default_lead_owner_id, default_lead_type_id, webhook_verify_enabled, created_at, updated_at')
      .order('created_at', { ascending: false });
    if (error && (error.message?.includes('default_module_key') || error.code === '42703')) {
      ({ data, error } = await supabase.from('zalo_oa_accounts')
        .select('id, oa_id, oa_name, app_id, is_active, auto_create_lead, auto_reply_message, default_target_type, default_pipeline_id, default_stage_id, default_source_id, default_company_id, default_region_id, default_lead_owner_id, default_lead_type_id, webhook_verify_enabled, created_at, updated_at')
        .order('created_at', { ascending: false }));
    }
    if (error && (error.message?.includes('default_target_type') || error.code === '42703')) {
      ({ data, error } = await supabase.from('zalo_oa_accounts')
        .select('id, oa_id, oa_name, app_id, is_active, auto_create_lead, auto_reply_message, default_pipeline_id, default_stage_id, default_source_id, default_company_id, default_region_id, default_lead_owner_id, default_lead_type_id, webhook_verify_enabled, created_at, updated_at')
        .order('created_at', { ascending: false }));
    }
    if (error) throw error;
    res.json((data || []).map((row) => attachZaloOaRouting({
      ...row,
      access_token_masked: null,
      has_access_token: true,
      has_secret_key: true,
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/accounts/:id', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase.from('zalo_oa_accounts')
      .select('*').eq('id', req.params.id).single();
    if (error) throw error;
    res.json(attachZaloOaRouting({
      ...data,
      access_token: data.access_token ? maskToken(data.access_token) : null,
      secret_key: data.secret_key ? '********' : null,
      access_token_set: !!data.access_token,
      secret_key_set: !!data.secret_key,
    }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/accounts', authMiddleware, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.oa_id || !b.access_token) {
      return res.status(400).json({ error: 'Thiếu oa_id hoặc access_token' });
    }
    const moduleKey = normalizeZaloModuleKey(b.default_module_key);
    const inferredTargetType = (moduleKey === 'production' || moduleKey === 'logistics')
      ? 'deal'
      : normalizeZaloTargetType(b.default_target_type);
    const row = {
      oa_id: String(b.oa_id).trim(),
      oa_name: b.oa_name || null,
      app_id: b.app_id ? String(b.app_id).trim() : null,
      access_token: String(b.access_token).trim(),
      secret_key: b.secret_key ? String(b.secret_key).trim() : null,
      is_active: b.is_active !== false,
      auto_create_lead: b.auto_create_lead !== false,
      auto_reply_message: b.auto_reply_message ?? 'Cảm ơn bạn đã liên hệ! Chúng tôi sẽ phản hồi sớm nhất.',
      default_module_key: moduleKey,
      default_target_type: inferredTargetType,
      default_pipeline_id: b.default_pipeline_id || null,
      default_stage_id: b.default_stage_id || null,
      default_source_id: b.default_source_id || null,
      default_company_id: b.default_company_id || null,
      default_region_id: b.default_region_id && String(b.default_region_id).trim() ? String(b.default_region_id).trim() : null,
      default_lead_owner_id: b.default_lead_owner_id || null,
      default_lead_type_id: b.default_lead_type_id || null,
      webhook_verify_enabled: b.webhook_verify_enabled !== false,
      created_by: req.user?.id || null,
      updated_at: new Date().toISOString(),
    };
    let { data, error } = await supabase.from('zalo_oa_accounts').insert(row).select().single();
    if (error?.message?.includes('default_module_key') || error?.message?.includes('default_target_type') || error?.message?.includes('default_company_id') || error?.message?.includes('default_region_id') || error?.message?.includes('default_lead_owner_id') || error?.message?.includes('default_lead_type_id')) {
      delete row.default_module_key;
      delete row.default_target_type;
      delete row.default_company_id;
      delete row.default_region_id;
      delete row.default_lead_owner_id;
      delete row.default_lead_type_id;
      ({ data, error } = await supabase.from('zalo_oa_accounts').insert(row).select().single());
    }
    if (error) throw error;
    delete _oaConfigCache[row.oa_id];
    res.status(201).json(attachZaloOaRouting(data));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/accounts/:id', authMiddleware, async (req, res) => {
  try {
    const b = req.body || {};
    const update = { updated_at: new Date().toISOString() };
    [
      'oa_id', 'oa_name', 'app_id', 'is_active', 'auto_create_lead', 'auto_reply_message',
      'default_pipeline_id', 'default_stage_id', 'default_source_id', 'default_company_id',
      'default_region_id', 'default_lead_owner_id', 'default_lead_type_id', 'webhook_verify_enabled',
      'default_module_key', 'default_target_type',
    ].forEach((f) => {
      if (b[f] !== undefined) update[f] = b[f];
    });
    if (update.default_module_key !== undefined) {
      update.default_module_key = normalizeZaloModuleKey(update.default_module_key);
      if (update.default_module_key === 'production' || update.default_module_key === 'logistics') {
        update.default_target_type = 'deal';
      } else if (update.default_target_type === undefined) {
        update.default_target_type = 'lead';
      }
    }
    if (update.default_target_type !== undefined) {
      update.default_target_type = normalizeZaloTargetType(update.default_target_type);
    }
    if (b.default_region_id !== undefined) {
      const rv = b.default_region_id;
      update.default_region_id = rv && String(rv).trim() ? String(rv).trim() : null;
    }
    if (b.access_token && String(b.access_token).trim() && !String(b.access_token).includes('…')) {
      update.access_token = String(b.access_token).trim();
    }
    if (b.secret_key && String(b.secret_key).trim() && b.secret_key !== '********') {
      update.secret_key = String(b.secret_key).trim();
    }
    let { data, error } = await supabase.from('zalo_oa_accounts')
      .update(update).eq('id', req.params.id).select().single();
    if (error?.message?.includes('default_module_key') || error?.message?.includes('default_target_type')) {
      delete update.default_module_key;
      delete update.default_target_type;
      ({ data, error } = await supabase.from('zalo_oa_accounts')
        .update(update).eq('id', req.params.id).select().single());
    }
    if (error) throw error;
    delete _oaConfigCache[data.oa_id];
    res.json(attachZaloOaRouting(data));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.delete('/accounts/:id', authMiddleware, async (req, res) => {
  try {
    const { data: prev } = await supabase.from('zalo_oa_accounts').select('oa_id').eq('id', req.params.id).single();
    const { error } = await supabase.from('zalo_oa_accounts').delete().eq('id', req.params.id);
    if (error) throw error;
    if (prev?.oa_id) delete _oaConfigCache[prev.oa_id];
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/stats', authMiddleware, async (req, res) => {
  try {
    const scope = await resolveZaloOaScope(req, res);
    if (!scope) return;
    let contactQ = supabase.from('zalo_contacts').select('id', { count: 'exact', head: true });
    let unreadQ = supabase.from('zalo_contacts').select('id', { count: 'exact', head: true }).gt('unread_count', 0);
    if (scope.mode === 'filter') {
      if (!scope.oaIds.length) {
        return res.json({ contacts: 0, unread: 0, messages_today: 0 });
      }
      contactQ = contactQ.in('oa_id', scope.oaIds);
      unreadQ = unreadQ.in('oa_id', scope.oaIds);
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let msgQ = supabase.from('zalo_messages').select('id', { count: 'exact', head: true }).gte('created_at', today.toISOString());
    const [{ count: contacts }, { count: unread }] = await Promise.all([contactQ, unreadQ]);
    let messagesToday = 0;
    if (scope.mode === 'all' || scope.oaIds?.length) {
      let cq = supabase.from('zalo_contacts').select('id');
      if (scope.mode === 'filter') cq = cq.in('oa_id', scope.oaIds);
      const { data: contactIds } = await cq.limit(5000);
      const ids = (contactIds || []).map((c) => c.id);
      if (ids.length) {
        const { count } = await supabase.from('zalo_messages')
          .select('id', { count: 'exact', head: true })
          .in('contact_id', ids)
          .gte('created_at', today.toISOString());
        messagesToday = count || 0;
      }
    }
    res.json({
      contacts: contacts || 0,
      unread: unread || 0,
      messages_today: messagesToday,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/contacts', authMiddleware, async (req, res) => {
  try {
    const scope = await resolveZaloOaScope(req, res);
    if (!scope) return;
    if (scope.mode === 'filter' && !scope.oaIds.length) {
      return res.json({ data: [], total: 0, offset: 0, limit: 200, hasMore: false, nextOffset: 0 });
    }
    const { oa_id, search, has_lead, limit: rawLimit, offset: rawOffset } = req.query;
    const limit = Math.min(parseInt(rawLimit, 10) || 200, 200);
    const offset = Math.max(parseInt(rawOffset, 10) || 0, 0);

    const q = buildZaloContactsQuery(scope, { oa_id, search, has_lead });
    const { data, error, count } = await q.range(offset, offset + limit - 1);
    if (error) throw error;

    const rows = (data || []).map(enrichZaloContact);
    const total = count ?? rows.length;
    const hasMore = offset + rows.length < total;
    res.json({
      data: rows,
      total,
      offset,
      limit,
      hasMore,
      nextOffset: hasMore ? offset + rows.length : offset + rows.length,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/contacts/:id', authMiddleware, async (req, res) => {
  try {
    const scope = await resolveZaloOaScope(req, res);
    if (!scope) return;
    const { data: contact, error } = await supabase.from('zalo_contacts')
      .select('*, lead:crm_leads(id, title, code, type), customer:customers(id, full_name, phone, email)')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!contact) return res.status(404).json({ error: 'Không tìm thấy liên hệ' });
    if (!contactAllowedByZaloScope(scope, contact)) {
      return res.status(403).json({ error: 'Không có quyền xem liên hệ này' });
    }
    if (contact.lead_id && !contact.lead) {
      await supabase.from('zalo_contacts').update({ lead_id: null }).eq('id', contact.id);
      contact.lead_id = null;
      contact.lead = null;
    }
    res.json(enrichZaloContact(contact));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/contacts/:id', authMiddleware, async (req, res) => {
  try {
    const scope = await resolveZaloOaScope(req, res);
    if (!scope) return;
    const { data: prev } = await supabase.from('zalo_contacts').select('*').eq('id', req.params.id).maybeSingle();
    if (!prev) return res.status(404).json({ error: 'Không tìm thấy liên hệ' });
    if (!contactAllowedByZaloScope(scope, prev)) {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    const update = { updated_at: new Date().toISOString() };
    ['display_name', 'phone', 'email', 'lead_id', 'customer_id'].forEach((f) => {
      if (req.body[f] !== undefined) update[f] = req.body[f] || null;
    });
    if (req.body.display_name) update.display_name = String(req.body.display_name).trim();
    const { data, error } = await supabase.from('zalo_contacts')
      .update(update)
      .eq('id', req.params.id)
      .select('*, lead:crm_leads(id, title, code, type), customer:customers(id, full_name, phone, email)')
      .single();
    if (error) throw error;
    res.json(enrichZaloContact(data));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.delete('/contacts/:id', authMiddleware, async (req, res) => {
  try {
    const scope = await resolveZaloOaScope(req, res);
    if (!scope) return;
    const { data: prev } = await supabase.from('zalo_contacts').select('oa_id').eq('id', req.params.id).maybeSingle();
    if (!prev) return res.status(404).json({ error: 'Không tìm thấy liên hệ' });
    if (!contactAllowedByZaloScope(scope, prev)) {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    await supabase.from('zalo_messages').delete().eq('contact_id', req.params.id);
    await supabase.from('zalo_contacts').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/contacts/:id/sync-profile', authMiddleware, async (req, res) => {
  try {
    const scope = await resolveZaloOaScope(req, res);
    if (!scope) return;
    const { data: contact } = await supabase.from('zalo_contacts').select('*').eq('id', req.params.id).maybeSingle();
    if (!contact) return res.status(404).json({ error: 'Không tìm thấy liên hệ' });
    if (!contactAllowedByZaloScope(scope, contact)) {
      return res.status(403).json({ error: 'Không có quyền' });
    }

    const oaConfig = await getOaConfig(contact.oa_id);
    if (!oaConfig?.access_token) {
      return res.status(400).json({ error: 'OA chưa cấu hình access_token' });
    }

    const result = await syncZaloContactProfile(contact, oaConfig);
    if (!result.ok) {
      return res.status(502).json({
        error: result.reason === 'profile_empty'
          ? 'Zalo không trả tên khách (kiểm tra token OA / IP VN)'
          : 'Không lấy được profile',
        ...result,
      });
    }

    const { data: fresh } = await supabase.from('zalo_contacts')
      .select('*, lead:crm_leads(id, title, code, type), customer:customers(id, full_name, phone, email)')
      .eq('id', contact.id)
      .single();

    res.json({ ok: true, contact: enrichZaloContact(fresh), ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/refresh-profiles', authMiddleware, async (req, res) => {
  try {
    const scope = await resolveZaloOaScope(req, res);
    if (!scope) return;
    const oaIds = scope.mode === 'filter' ? scope.oaIds : null;
    const io = r._ioRef;
    const summary = await runZaloBatchRefreshProfiles({ oaIds, io });
    res.json(summary);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/contacts/:id/create-lead', authMiddleware, async (req, res) => {
  try {
    const scope = await resolveZaloOaScope(req, res);
    if (!scope) return;
    const { data: contact } = await supabase.from('zalo_contacts').select('*').eq('id', req.params.id).maybeSingle();
    if (!contact) return res.status(404).json({ error: 'Không tìm thấy liên hệ' });
    if (!contactAllowedByZaloScope(scope, contact)) {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    if (contact.lead_id) {
      const { data: existLead } = await supabase.from('crm_leads').select('id, code').eq('id', contact.lead_id).maybeSingle();
      if (existLead) {
        return res.status(400).json({ error: 'Contact đã có Lead', lead: existLead });
      }
      await supabase.from('zalo_contacts').update({ lead_id: null }).eq('id', contact.id);
      contact.lead_id = null;
    }

    const oaConfig = await getOaConfig(contact.oa_id);
    if (!oaConfig) return res.status(400).json({ error: 'OA chưa cấu hình hoặc không active' });

    const { extractedPhone, extractedAddress } = await extractFromZaloContact(contact);
    const phone = extractedPhone || (contact.phone && String(contact.phone).trim() ? contact.phone : null);

    const lead = await createLeadFromZaloContact(oaConfig, contact, null, phone, extractedAddress);
    if (!lead?.id) {
      return res.status(400).json({ error: 'Không tạo được lead (thiếu SĐT hoặc lỗi dữ liệu)' });
    }

    const { data: fresh } = await supabase.from('zalo_contacts')
      .select('*, lead:crm_leads(id, title, code, type), customer:customers(id, full_name, phone, email)')
      .eq('id', contact.id)
      .single();

    res.json({ ok: true, lead, contact: enrichZaloContact(fresh) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/contacts/:id/link-lead', authMiddleware, async (req, res) => {
  try {
    const scope = await resolveZaloOaScope(req, res);
    if (!scope) return;
    const { lead_id } = req.body;
    if (!lead_id) return res.status(400).json({ error: 'Thiếu lead_id' });
    const { data: prev } = await supabase.from('zalo_contacts').select('oa_id').eq('id', req.params.id).maybeSingle();
    if (!prev) return res.status(404).json({ error: 'Không tìm thấy liên hệ' });
    if (!contactAllowedByZaloScope(scope, prev)) {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    const { data, error } = await supabase.from('zalo_contacts')
      .update({ lead_id, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select('*, lead:crm_leads(id, title, code, type), customer:customers(id, full_name, phone, email)')
      .single();
    if (error) throw error;
    await supabase.from('zalo_messages').update({ lead_id }).eq('contact_id', req.params.id);
    res.json(enrichZaloContact(data));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/contacts/:id/messages', authMiddleware, async (req, res) => {
  try {
    const scope = await resolveZaloOaScope(req, res);
    if (!scope) return;
    const { data: contact } = await supabase.from('zalo_contacts').select('*').eq('id', req.params.id).single();
    if (!contact) return res.status(404).json({ error: 'Không tìm thấy liên hệ' });
    if (scope.mode === 'filter' && !scope.oaIds.includes(String(contact.oa_id))) {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    const { data, error } = await supabase.from('zalo_messages')
      .select('*')
      .eq('contact_id', contact.id)
      .order('created_at', { ascending: true });
    if (error) throw error;

    await supabase.from('zalo_contacts').update({ unread_count: 0 }).eq('id', contact.id);
    res.json({ contact, messages: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/contacts/:id/messages', authMiddleware, async (req, res) => {
  try {
    const text = req.body?.text != null ? String(req.body.text).trim() : '';
    if (!text) return res.status(400).json({ error: 'Thiếu nội dung tin nhắn' });

    const { data: contact } = await supabase.from('zalo_contacts').select('*').eq('id', req.params.id).single();
    if (!contact) return res.status(404).json({ error: 'Không tìm thấy liên hệ' });

    const oaConfig = await getOaConfig(contact.oa_id);
    if (!oaConfig?.access_token) {
      return res.status(400).json({ error: 'OA chưa cấu hình access_token' });
    }

    const result = await sendZaloCsTextMessage({
      accessToken: oaConfig.access_token,
      userId: contact.user_id,
      text,
    });
    if (!result.ok) {
      return res.status(502).json({
        error: result.message || 'Gửi Zalo thất bại',
        zalo_error: result.zalo_error,
        data: result.data,
      });
    }

    const { data: saved } = await supabase.from('zalo_messages').insert({
      contact_id: contact.id,
      lead_id: contact.lead_id,
      zalo_msg_id: result.msg_id,
      event_name: 'oa_send_text',
      direction: 'outbound',
      message_type: 'text',
      content: text,
      sent_by: req.user?.id || null,
    }).select().single();

    await supabase.from('zalo_contacts').update({
      last_message_at: new Date().toISOString(),
      last_message_preview: text.slice(0, 100),
      updated_at: new Date().toISOString(),
    }).eq('id', contact.id);

    res.json({ ok: true, message: saved, zalo: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/leads/:leadId/messages', authMiddleware, async (req, res) => {
  try {
    const { data: contacts } = await supabase.from('zalo_contacts')
      .select('*').eq('lead_id', req.params.leadId).limit(1);
    const contact = contacts?.[0];
    if (!contact) return res.json([]);
    const { data } = await supabase.from('zalo_messages')
      .select('*, contact:zalo_contacts(id, display_name, avatar_url, user_id, oa_id)')
      .eq('contact_id', contact.id)
      .order('created_at', { ascending: true });
    const list = (data || []).map((m) => ({ ...m, contact }));
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/webhook-info', authMiddleware, (_req, res) => {
  const base = process.env.APP_BASE_URL || process.env.PUBLIC_API_URL || '';
  const webhookUrl = base
    ? `${String(base).replace(/\/$/, '')}/api/zalo/webhook`
    : '/api/zalo/webhook';
  res.json({
    webhook_url: webhookUrl,
    events_recommended: [
      'user_send_text', 'user_send_image', 'user_send_file', 'user_send_sticker',
      'user_send_link', 'user_send_location', 'follow',
    ],
    docs: 'https://developers.zalo.me/docs/official-account/webhook/tong-quan',
    note: 'Cần HTTPS công khai. IP Việt Nam để lấy đủ tên/avatar khách. Chỉ trả lời tin tư vấn trong 7 ngày sau tin khách.',
  });
});

// ═══ BATCH — Quét SĐT + Tạo Lead (giống Facebook) ═══════════

r.post('/batch-extract-phones', authMiddleware, async (req, res) => {
  try {
    const io = r._ioRef;
    const offset = parseInt(req.body?.offset, 10) || 0;
    const limit = parseInt(req.body?.limit, 10) || 0;
    const forceRescanPhones = !!req.body?.force_rescan_phones;
    const oaId = req.body?.oa_id ? String(req.body.oa_id) : null;
    const summary = await runZaloBatchExtractPhones({ io, offset, limit, forceRescanPhones, oaId });
    res.json(summary);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/batch-create-leads', authMiddleware, async (req, res) => {
  try {
    const io = r._ioRef;
    const limit = parseInt(req.body?.limit, 10) || 500;
    const requirePhone = req.body?.require_phone !== false;
    const oaId = req.body?.oa_id ? String(req.body.oa_id) : null;
    const summary = await runZaloBatchCreateLeads({ io, limit, requirePhone, oaId });
    res.json(summary);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Quét SĐT rồi tạo lead — một lần bấm */
r.post('/batch-scan-and-create-leads', authMiddleware, async (req, res) => {
  try {
    const io = r._ioRef;
    const limit = parseInt(req.body?.limit, 10) || 500;
    const forceRescanPhones = !!req.body?.force_rescan_phones;
    const requirePhone = req.body?.require_phone !== false;
    const oaId = req.body?.oa_id ? String(req.body.oa_id) : null;
    const extractSummary = await runZaloBatchExtractPhones({ io, limit, forceRescanPhones, oaId });
    const createSummary = await runZaloBatchCreateLeads({ io, limit, requirePhone, oaId });
    res.json({ extract: extractSummary, create: createSummary });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══ AUTO TOOL ══════════════════════════════════════════════

const zaloAutoTool = require('../helpers/zaloAutoTool');
let _zaloAutoToolIo = false;
function ensureZaloAutoToolIo() {
  if (!_zaloAutoToolIo && r._ioRef) {
    zaloAutoTool.setIO(r._ioRef);
    _zaloAutoToolIo = true;
  }
}
zaloAutoTool.loadConfigFromDb().then(() => console.log('[ZaloAutoTool] Config loaded')).catch(() => {});

r.get('/auto-tool/status', authMiddleware, (_req, res) => {
  ensureZaloAutoToolIo();
  res.json(zaloAutoTool.getState());
});

r.get('/auto-tool/config', authMiddleware, (_req, res) => {
  res.json({ config: zaloAutoTool.getConfig() });
});

r.put('/auto-tool/config', authMiddleware, (req, res) => {
  zaloAutoTool.setConfig(req.body || {});
  res.json({ ok: true, config: zaloAutoTool.getConfig() });
});

r.post('/auto-tool/start', authMiddleware, (_req, res) => {
  ensureZaloAutoToolIo();
  zaloAutoTool.startLoop().catch((err) => console.error('[ZaloAutoTool]', err.message));
  res.json({ ok: true, state: zaloAutoTool.getState() });
});

r.post('/auto-tool/stop', authMiddleware, (_req, res) => {
  zaloAutoTool.stop();
  res.json({ ok: true, state: zaloAutoTool.getState() });
});

module.exports = r;
