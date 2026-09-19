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
const { resolveCrmSocialInboxCompanyId } = require('../helpers/crmSocialInboxScope');
const { canUsePersonalAccount, pickAccountForUser, listUsableAccounts, describePersonalAvailability } = require('../helpers/zaloPersonalAccess');
const { findContactsForLead } = require('../helpers/zaloLeadConversations');
const { extractContactInfo } = require('../helpers/facebookPhoneExtract');
const { createLeadFromZaloContact, runZaloBatchExtractPhones, runZaloBatchCreateLeads, extractFromZaloContact, syncZaloContactProfile, runZaloBatchRefreshProfiles, isPlaceholderZaloDisplayName, applyZaloDisplayNameToCustomer, normalizeZaloModuleKey, normalizeZaloTargetType, resolveZaloModuleKeyForOa, resolveZaloCreateType, applyZaloOaRoutingToLead, runZaloBatchApplyOaRouting, ensureZaloLeadAutoTasks } = require('../helpers/zaloBatchTools');
const {
  isUserSendEvent,
  isOaEchoEvent,
  verifyZaloWebhookSignature,
  parseZaloWebhookMessage,
  fetchZaloUserProfile,
  sendZaloCsTextMessage,
} = require('../helpers/zaloOaMessaging');
const { formatVnPhoneLocal0From84, normalizeVnPhoneTo84 } = require('../helpers/zaloOa');
const {
  registerOaConfigCacheInvalidator,
  ensureZaloOaAccessToken,
  refreshZaloOaTokens,
  attachZaloTokenMeta,
  isZaloTokenExpiredError,
  computeAccessTokenExpiresAt,
  computeRefreshTokenExpiresAt,
} = require('../helpers/zaloOaToken');
const { triggerZaloInboundN8nWebhook, triggerZaloSyncProfileN8nWebhook, getN8nIntegrationInfo, generateN8nTriggerToken, buildOaN8nTriggerUrls, resolveOaN8nInboundUrl, resolveOaN8nSyncProfileUrl } = require('../helpers/zaloN8nWebhook');

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

function invalidateOaConfigCache(oaId) {
  if (oaId) delete _oaConfigCache[String(oaId)];
  else Object.keys(_oaConfigCache).forEach((k) => delete _oaConfigCache[k]);
}
registerOaConfigCacheInvalidator(invalidateOaConfigCache);

async function getOaConfig(oaId) {
  const key = String(oaId || '');
  const cached = _oaConfigCache[key];
  if (cached && Date.now() - cached.ts < 60000) return cached.data;
  const { data } = await supabase.from('zalo_oa_accounts')
    .select('*').eq('oa_id', key).eq('is_active', true).maybeSingle();
  _oaConfigCache[key] = { data, ts: Date.now() };
  return data;
}

/**
 * Tra tài khoản theo oa_id, KHÔNG lọc is_active.
 *
 * getOaConfig() lọc is_active nên tài khoản đang tắt trả về null, và mọi chỗ
 * kiểm "có phải Zalo cá nhân không" đều trượt rồi rơi xuống đường Zalo OA —
 * người dùng nhận thông báo về token OA trong khi họ đang ở tab cá nhân.
 */
async function getAccountAny(oaId) {
  const { data } = await supabase.from('zalo_oa_accounts')
    .select('*').eq('oa_id', String(oaId || '')).maybeSingle();
  return data || null;
}

async function getOaConfigWithValidToken(oaId) {
  const oaConfig = await getOaConfig(oaId);
  if (!oaConfig) return null;
  const ensured = await ensureZaloOaAccessToken(oaConfig);
  if (!ensured.ok) return { ...oaConfig, _tokenError: ensured.message || ensured.error };
  invalidateOaConfigCache(oaId);
  _oaConfigCache[String(oaId)] = { data: ensured.oaConfig, ts: Date.now() };
  return ensured.oaConfig;
}

async function fetchZaloProfileWithToken(oaConfig, userId) {
  let ensured = await ensureZaloOaAccessToken(oaConfig);
  if (!ensured.ok) return { profile: null, oaConfig, error: ensured.message || ensured.error };
  let profile = await fetchZaloUserProfile(ensured.accessToken, userId);
  if (!profile) {
    ensured = await ensureZaloOaAccessToken(ensured.oaConfig, { forceRefresh: true });
    if (ensured.ok) {
      profile = await fetchZaloUserProfile(ensured.accessToken, userId);
    }
  }
  return { profile, oaConfig: ensured.ok ? ensured.oaConfig : oaConfig, error: profile ? null : 'profile_empty' };
}

async function sendZaloCsWithToken(oaConfig, { userId, text }) {
  let ensured = await ensureZaloOaAccessToken(oaConfig);
  if (!ensured.ok) {
    return { ok: false, error: 'config', message: ensured.message || ensured.error || 'Token không hợp lệ' };
  }
  let result = await sendZaloCsTextMessage({
    accessToken: ensured.accessToken,
    userId,
    text,
  });
  if (!result.ok && isZaloTokenExpiredError(result.zalo_error)) {
    ensured = await ensureZaloOaAccessToken(ensured.oaConfig, { forceRefresh: true });
    if (ensured.ok) {
      result = await sendZaloCsTextMessage({
        accessToken: ensured.accessToken,
        userId,
        text,
      });
    }
  }
  return result;
}

const BRIDGE_STALE_MS = 5 * 60 * 1000;

/**
 * Gửi tin từ CRM qua tài khoản Zalo cá nhân.
 * Tin được ghi ngay vào hộp thư (trạng thái chờ) rồi xếp hàng cho bridge gửi,
 * nên nhân viên thấy phản hồi tức thì và không mất tin khi bridge rớt tạm.
 */
async function sendViaPersonalBridge(req, res, { contact, account, text }) {
  if (!contact.lead_id) {
    return res.status(400).json({ error: 'Hội thoại chưa gắn lead nên chưa gửi được' });
  }

  // Cổng đang chết thì VẪN nhận tin và xếp hàng đợi, không từ chối.
  // Từ chối là nhân viên mất công gõ lại; xếp hàng thì cổng sống lại là gửi đi,
  // và giao diện hiện rõ tin đang chờ chứ không giả vờ đã gửi xong.
  const lastSeen = account.bridge_last_seen_at ? new Date(account.bridge_last_seen_at).getTime() : 0;
  const stale = !lastSeen || Date.now() - lastSeen > BRIDGE_STALE_MS;
  const bridgeDown = stale || account.bridge_status === 'need_qr';
  const bridgeNote = account.bridge_status === 'need_qr'
    ? 'Zalo cá nhân đã đăng xuất — cần quét lại mã QR trên máy công ty'
    : 'Máy công ty đang không chạy';

  const now = new Date().toISOString();
  const { data: saved, error: msgErr } = await supabase.from('zalo_messages').insert({
    contact_id: contact.id,
    lead_id: contact.lead_id,
    event_name: 'personal_send_text',
    direction: 'outbound',
    message_type: 'text',
    content: text,
    sent_by: req.user?.id || null,
    metadata: { source: 'personal_bridge', delivered: false },
  }).select().single();

  if (msgErr) return res.status(500).json({ error: msgErr.message });

  const { data: queued, error: qErr } = await supabase.from('zalo_outbox').insert({
    oa_id: contact.oa_id,
    contact_id: contact.id,
    message_id: saved.id,
    thread_id: contact.user_id,
    thread_type: 'user',
    content: text,
    requested_by: req.user?.id || null,
  }).select('id').single();

  if (qErr) {
    await supabase.from('zalo_messages').delete().eq('id', saved.id);
    return res.status(500).json({ error: qErr.message });
  }

  await supabase.from('zalo_contacts').update({
    last_message_at: now,
    last_message_preview: text.slice(0, 100),
    updated_at: now,
  }).eq('id', contact.id);

  try {
    r._ioRef?.emit('zalo_message', {
      contact_id: contact.id,
      lead_id: contact.lead_id,
      message: saved,
      contact,
    });
  } catch (_) { /* ignore */ }

  return res.json({
    ok: true,
    message: saved,
    pending: true,
    outbox_id: queued.id,
    bridge_down: bridgeDown,
    bridge_note: bridgeDown ? bridgeNote : null,
  });
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
    let activeOaConfig = oaConfig;

    if (msgId && !acquireMsgLock(msgId)) {
      return { skipped: true, reason: 'duplicate_lock' };
    }
    if (msgId) {
      const { data: existing } = await supabase.from('zalo_messages')
        .select('id').eq('zalo_msg_id', msgId).limit(1);
      if (existing?.length) return { skipped: true, reason: 'duplicate_db' };
    }

    let profile = null;
    if (isInbound && (activeOaConfig.access_token || activeOaConfig.refresh_token)) {
      const fetched = await fetchZaloProfileWithToken(activeOaConfig, partnerUserId);
      profile = fetched.profile;
      if (fetched.oaConfig) activeOaConfig = fetched.oaConfig;
    }

    let contact = await getOrCreateContact(
      oaId,
      partnerUserId,
      profile?.display_name || null,
      profile?.avatar || null,
    );
    if (!contact) return { skipped: true, reason: 'contact_failed' };

    if (isInbound && (activeOaConfig.access_token || activeOaConfig.refresh_token) && isPlaceholderZaloDisplayName(contact.display_name, contact.user_id)) {
      const syncResult = await syncZaloContactProfile(contact, activeOaConfig).catch((e) => {
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

      if (activeOaConfig.auto_create_lead && !contact.lead_id) {
        const lead = await createLeadFromZaloContact(activeOaConfig, contact, content, extractedPhone, null);
        if (lead?.id) {
          contact.lead_id = lead.id;
          await supabase.from('zalo_messages').update({ lead_id: lead.id }).eq('contact_id', contact.id);
        }
      }

      if (activeOaConfig.auto_reply_message && (activeOaConfig.access_token || activeOaConfig.refresh_token)) {
        sendZaloCsWithToken(activeOaConfig, {
          userId: partnerUserId,
          text: activeOaConfig.auto_reply_message,
        }).catch((e) => console.warn('[Zalo OA] auto-reply failed:', e.message));
      }

      if (resolveOaN8nInboundUrl(activeOaConfig) || resolveOaN8nSyncProfileUrl(activeOaConfig)) {
        let leadSummary = null;
        if (contact.lead_id) {
          const { data: ld } = await supabase.from('crm_leads')
            .select('id, code, title')
            .eq('id', contact.lead_id)
            .maybeSingle();
          if (ld) leadSummary = ld;
        }
        const n8nCtx = {
          contact: { ...contact, ...contactUpd },
          message: savedMsg,
          partnerUserId,
          eventName,
          lead: leadSummary,
          extractedPhone,
          needsProfileSync: isPlaceholderZaloDisplayName(contact.display_name, contact.user_id),
        };
        if (resolveOaN8nInboundUrl(activeOaConfig)) {
          triggerZaloInboundN8nWebhook(activeOaConfig, n8nCtx)
            .catch((e) => console.warn('[Zalo→n8n]', e.message));
        }
        if (n8nCtx.needsProfileSync && resolveOaN8nSyncProfileUrl(activeOaConfig)) {
          triggerZaloSyncProfileN8nWebhook(activeOaConfig, n8nCtx)
            .catch((e) => console.warn('[Zalo→n8n sync-profile]', e.message));
        }
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

function verifyZaloN8nCallbackSecret(req, res, next) {
  const expected = process.env.ZALO_N8N_CALLBACK_SECRET;
  if (!expected) {
    return res.status(503).json({
      error: 'Server chưa cấu hình ZALO_N8N_CALLBACK_SECRET (Render/hosting env)',
    });
  }
  const got = req.headers['x-zalo-n8n-secret'] || req.headers['X-Zalo-N8n-Secret'];
  if (String(got || '') !== String(expected)) {
    return res.status(401).json({ error: 'Sai X-Zalo-N8n-Secret' });
  }
  return next();
}

async function getOaAccountByN8nTriggerToken(token) {
  const t = String(token || '').trim();
  if (!t) return null;
  const { data } = await supabase.from('zalo_oa_accounts')
    .select('*')
    .eq('n8n_trigger_token', t)
    .maybeSingle();
  return data;
}

async function runN8nSyncProfileForContact(req, res, scopedOaConfig) {
  const contactId = req.body?.contact_id && String(req.body.contact_id).trim();
  const oaId = req.body?.oa_id && String(req.body.oa_id).trim();
  const userId = req.body?.user_id && String(req.body.user_id).trim();

  let contact = null;
  if (contactId) {
    const { data } = await supabase.from('zalo_contacts').select('*').eq('id', contactId).maybeSingle();
    contact = data;
  } else if (oaId && userId) {
    const { data } = await supabase.from('zalo_contacts')
      .select('*').eq('oa_id', oaId).eq('user_id', userId).maybeSingle();
    contact = data;
  }
  if (!contact) {
    return res.status(404).json({ error: 'Không tìm thấy zalo_contacts (cần contact_id hoặc oa_id+user_id)' });
  }
  if (scopedOaConfig && String(contact.oa_id) !== String(scopedOaConfig.oa_id)) {
    return res.status(403).json({ error: 'Contact không thuộc OA của token này' });
  }

  const oaConfig = await getOaConfigWithValidToken(contact.oa_id);
  if (!oaConfig || (!oaConfig.access_token && !oaConfig.refresh_token)) {
    return res.status(400).json({ error: 'OA chưa cấu hình token' });
  }

  const result = await syncZaloContactProfile(contact, oaConfig);
  if (!result.ok) {
    return res.status(502).json({
      error: result.reason === 'profile_empty'
        ? 'Zalo không trả tên (token OA / IP server VN)'
        : 'Không lấy được profile',
      ...result,
    });
  }

  const { data: fresh } = await supabase.from('zalo_contacts')
    .select('*, lead:crm_leads(id, title, code, type), customer:customers(id, full_name, phone, email)')
    .eq('id', contact.id)
    .single();

  return res.json({
    ok: true,
    display_name: result.display_name,
    avatar_url: result.avatar_url,
    contact: enrichZaloContact(fresh),
    ...result,
  });
}

/** Thông tin trigger riêng theo token OA (n8n). */
r.get('/integrations/n8n/o/:token', async (req, res) => {
  try {
    const oa = await getOaAccountByN8nTriggerToken(req.params.token);
    if (!oa) return res.status(404).json({ error: 'Token OA không hợp lệ' });
    res.json({
      ok: true,
      oa_id: oa.oa_id,
      oa_name: oa.oa_name,
      is_active: oa.is_active,
      n8n_trigger: buildOaN8nTriggerUrls(oa),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/integrations/n8n/o/:token/sync-profile', async (req, res) => {
  const oa = await getOaAccountByN8nTriggerToken(req.params.token);
  if (!oa) return res.status(404).json({ error: 'Token OA không hợp lệ' });
  res.json({
    ok: true,
    method: 'POST',
    oa_id: oa.oa_id,
    oa_name: oa.oa_name,
    url: buildOaN8nTriggerUrls(oa).crm?.sync_profile,
    body: { contact_id: 'uuid zalo_contacts' },
  });
});

r.post('/integrations/n8n/o/:token/sync-profile', async (req, res) => {
  try {
    const oa = await getOaAccountByN8nTriggerToken(req.params.token);
    if (!oa) return res.status(404).json({ error: 'Token OA không hợp lệ' });
    if (!oa.is_active) return res.status(403).json({ error: 'OA đang tắt' });
    await runN8nSyncProfileForContact(req, res, oa);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** n8n gọi lại CRM → lấy tên/avatar Zalo (CRM giữ OA token). Chỉ POST (trình duyệt mở URL = GET → dùng curl/n8n). */
r.get('/integrations/n8n/sync-profile', (_req, res) => {
  res.json({
    ok: true,
    endpoint: '/api/zalo/integrations/n8n/sync-profile',
    method: 'POST',
    note: 'Không hỗ trợ GET thao tác — dùng n8n HTTP Request hoặc curl POST.',
    headers: {
      'Content-Type': 'application/json',
      'X-Zalo-N8n-Secret': '<trùng ZALO_N8N_CALLBACK_SECRET trên server>',
    },
    body: {
      contact_id: 'uuid zalo_contacts (ưu tiên)',
      oa_id: 'optional nếu không có contact_id',
      user_id: 'optional cùng oa_id',
    },
    secret_configured: !!process.env.ZALO_N8N_CALLBACK_SECRET,
  });
});

r.post('/integrations/n8n/sync-profile', verifyZaloN8nCallbackSecret, async (req, res) => {
  try {
    await runN8nSyncProfileForContact(req, res, null);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

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
  const socialCid = await resolveCrmSocialInboxCompanyId(req.user);
  if (socialCid) {
    const reqCo = req.query.company_id && String(req.query.company_id).trim();
    if (reqCo && String(reqCo) !== String(socialCid)) {
      res.status(403).json({ error: 'Chỉ được xem Zalo OA công ty NextGo.' });
      return null;
    }
    return {
      mode: 'filter',
      companyId: socialCid,
      oaIds: rows.filter((a) => a.default_company_id && String(a.default_company_id) === String(socialCid)).map((a) => a.oa_id),
    };
  }
  if (isSystemAdmin(req.user)) {
    const co = req.query.company_id && String(req.query.company_id).trim();
    if (co) {
      return { mode: 'filter', companyId: co, oaIds: rows.filter((a) => String(a.default_company_id || '') === co).map((a) => a.oa_id) };
    }
    return { mode: 'all', oaIds: null, companyId: null };
  }
  const cid = req.user?.company_id;
  if (!cid) { res.status(400).json({ error: 'Thiếu company_id trên tài khoản' }); return null; }
  return {
    mode: 'filter',
    companyId: String(cid),
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


/**
 * Những oa_id cá nhân mà người này KHÔNG được xem.
 *
 * Trang Hộp thư và các endpoint danh sách lọc theo phạm vi công ty, không biết
 * gì về quyền sở hữu Zalo cá nhân — nên phải loại thẳng ở đây, nếu không nhân
 * viên mở hộp thư là đọc được chat của đồng nghiệp.
 */
async function blockedPersonalOaIds(user) {
  const { data } = await supabase.from('zalo_oa_accounts')
    .select('*').eq('account_kind', 'personal');
  return (data || [])
    .filter((a) => !canUsePersonalAccount(user, a).ok)
    .map((a) => a.oa_id);
}

/** Chặn thao tác lên một hội thoại cá nhân không thuộc về người này. */
async function guardContactAccess(req, res, contact) {
  const account = await getAccountAny(contact.oa_id);
  if (account?.account_kind !== 'personal') return true;
  const allowed = canUsePersonalAccount(req.user, account);
  if (allowed.ok) return true;
  res.status(403).json({ error: allowed.reason });
  return false;
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

function sanitizeZaloAccountForApi(row) {
  if (!row) return row;
  const safe = attachZaloTokenMeta(attachZaloOaRouting({ ...row }));
  delete safe.refresh_token;
  delete safe.access_token;
  delete safe.secret_key;
  // bridge_token là mật khẩu của bridge Zalo cá nhân — không bao giờ trả ra API
  delete safe.bridge_token;
  // Ảnh QR = quyền đăng nhập vào tài khoản Zalo đó. Chỉ lấy qua endpoint riêng
  // dành cho admin, không đi kèm danh sách tài khoản.
  delete safe.qr_image;
  return {
    ...safe,
    has_qr: !!row.qr_image,
    qr_updated_at: row.qr_updated_at || null,
    access_token_set: !!row.access_token,
    refresh_token_set: !!row.refresh_token,
    has_secret_key: !!row.secret_key,
    bridge_token_set: !!row.bridge_token,
    n8n_trigger: buildOaN8nTriggerUrls(row),
  };
}

function applyManualTokenFields(row, body) {
  const nowIso = new Date().toISOString();
  if (body.access_token && String(body.access_token).trim() && !String(body.access_token).includes('…')) {
    row.access_token = String(body.access_token).trim();
    row.access_token_expires_at = computeAccessTokenExpiresAt(body.access_token_expires_in || null);
    row.token_refreshed_at = nowIso;
  }
  if (body.refresh_token && String(body.refresh_token).trim() && !String(body.refresh_token).includes('…')) {
    row.refresh_token = String(body.refresh_token).trim();
    row.refresh_token_expires_at = computeRefreshTokenExpiresAt();
  }
  return row;
}

r.get('/accounts', authMiddleware, async (req, res) => {
  try {
    let { data, error } = await supabase.from('zalo_oa_accounts')
      .select('id, oa_id, oa_name, app_id, is_active, auto_create_lead, auto_reply_message, default_module_key, default_target_type, default_pipeline_id, default_stage_id, default_source_id, default_company_id, default_region_id, default_lead_owner_id, default_lead_type_id, webhook_verify_enabled, n8n_trigger_token, n8n_webhook_url, n8n_sync_profile_webhook_url, access_token, refresh_token, secret_key, access_token_expires_at, refresh_token_expires_at, token_refreshed_at, last_token_error, created_at, updated_at')
      .order('created_at', { ascending: false });
    if (error && (error.message?.includes('access_token_expires_at') || error.message?.includes('refresh_token') || error.code === '42703')) {
      ({ data, error } = await supabase.from('zalo_oa_accounts')
        .select('id, oa_id, oa_name, app_id, is_active, auto_create_lead, auto_reply_message, default_module_key, default_target_type, default_pipeline_id, default_stage_id, default_source_id, default_company_id, default_region_id, default_lead_owner_id, default_lead_type_id, webhook_verify_enabled, created_at, updated_at')
        .order('created_at', { ascending: false }));
    }
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
    res.json((data || []).map((row) => sanitizeZaloAccountForApi({
      ...row,
      access_token: 'set',
      refresh_token: row.refresh_token ? 'set' : null,
      secret_key: row.secret_key ? 'set' : null,
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
    res.json(sanitizeZaloAccountForApi({
      ...data,
      access_token: data.access_token ? maskToken(data.access_token) : null,
      secret_key: data.secret_key ? '********' : null,
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
    const row = applyManualTokenFields({
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
      n8n_webhook_url: b.n8n_webhook_url && String(b.n8n_webhook_url).trim()
        ? String(b.n8n_webhook_url).trim()
        : null,
      n8n_sync_profile_webhook_url: b.n8n_sync_profile_webhook_url && String(b.n8n_sync_profile_webhook_url).trim()
        ? String(b.n8n_sync_profile_webhook_url).trim()
        : null,
      n8n_trigger_token: generateN8nTriggerToken(),
      created_by: req.user?.id || null,
      updated_at: new Date().toISOString(),
    }, b);
    if (b.refresh_token && String(b.refresh_token).trim()) {
      row.refresh_token = String(b.refresh_token).trim();
      row.refresh_token_expires_at = computeRefreshTokenExpiresAt();
    }
    let { data, error } = await supabase.from('zalo_oa_accounts').insert(row).select().single();
    if (error?.message?.includes('default_module_key') || error?.message?.includes('default_target_type') || error?.message?.includes('default_company_id') || error?.message?.includes('default_region_id') || error?.message?.includes('default_lead_owner_id') || error?.message?.includes('default_lead_type_id') || error?.message?.includes('n8n_webhook_url') || error?.message?.includes('n8n_trigger_token')) {
      delete row.default_module_key;
      delete row.default_target_type;
      delete row.default_company_id;
      delete row.default_region_id;
      delete row.default_lead_owner_id;
      delete row.default_lead_type_id;
      delete row.n8n_webhook_url;
      delete row.n8n_sync_profile_webhook_url;
      delete row.n8n_trigger_token;
      ({ data, error } = await supabase.from('zalo_oa_accounts').insert(row).select().single());
    }
    if (error) throw error;
    delete _oaConfigCache[row.oa_id];
    res.status(201).json(sanitizeZaloAccountForApi(data));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/accounts/:id', authMiddleware, async (req, res) => {
  try {
    const b = req.body || {};
    const { data: existing } = await supabase.from('zalo_oa_accounts')
      .select('n8n_trigger_token')
      .eq('id', req.params.id)
      .maybeSingle();
    const update = { updated_at: new Date().toISOString() };
    [
      'oa_id', 'oa_name', 'app_id', 'is_active', 'auto_create_lead', 'auto_reply_message',
      'default_pipeline_id', 'default_stage_id', 'default_source_id', 'default_company_id',
      'default_region_id', 'default_lead_owner_id', 'default_lead_type_id', 'webhook_verify_enabled',
      'default_module_key', 'default_target_type',
    ].forEach((f) => {
      if (b[f] !== undefined) update[f] = b[f];
    });
    if (b.n8n_webhook_url !== undefined) {
      update.n8n_webhook_url = b.n8n_webhook_url && String(b.n8n_webhook_url).trim()
        ? String(b.n8n_webhook_url).trim()
        : null;
    }
    if (b.n8n_sync_profile_webhook_url !== undefined) {
      update.n8n_sync_profile_webhook_url = b.n8n_sync_profile_webhook_url && String(b.n8n_sync_profile_webhook_url).trim()
        ? String(b.n8n_sync_profile_webhook_url).trim()
        : null;
    }
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
    applyManualTokenFields(update, b);
    if (b.refresh_token !== undefined) {
      const rv = b.refresh_token && String(b.refresh_token).trim() && !String(b.refresh_token).includes('…')
        ? String(b.refresh_token).trim()
        : null;
      if (rv) {
        update.refresh_token = rv;
        update.refresh_token_expires_at = computeRefreshTokenExpiresAt();
      }
    }
    if (!existing?.n8n_trigger_token || !String(existing.n8n_trigger_token).trim()) {
      update.n8n_trigger_token = generateN8nTriggerToken();
    }
    let { data, error } = await supabase.from('zalo_oa_accounts')
      .update(update).eq('id', req.params.id).select().single();
    if (error?.message?.includes('default_module_key') || error?.message?.includes('default_target_type')) {
      delete update.default_module_key;
      delete update.default_target_type;
      ({ data, error } = await supabase.from('zalo_oa_accounts')
        .update(update).eq('id', req.params.id).select().single());
    }
    if (error?.message?.includes('n8n_webhook_url') || error?.message?.includes('n8n_sync_profile_webhook_url') || error?.message?.includes('n8n_trigger_token')) {
      delete update.n8n_webhook_url;
      delete update.n8n_sync_profile_webhook_url;
      delete update.n8n_trigger_token;
      ({ data, error } = await supabase.from('zalo_oa_accounts')
        .update(update).eq('id', req.params.id).select().single());
    }
    if (error) throw error;
    delete _oaConfigCache[data.oa_id];
    res.json(sanitizeZaloAccountForApi(data));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/accounts/:id/refresh-token', authMiddleware, async (req, res) => {
  try {
    const { data: account, error } = await supabase.from('zalo_oa_accounts')
      .select('*').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!account) return res.status(404).json({ error: 'Không tìm thấy OA' });
    const result = await refreshZaloOaTokens(account, { reason: 'manual_api' });
    if (!result.ok) {
      return res.status(400).json({ error: result.message || result.error, ...result });
    }
    invalidateOaConfigCache(account.oa_id);
    res.json({
      ok: true,
      account: sanitizeZaloAccountForApi(result.oaConfig),
      access_token_expires_at: result.access_token_expires_at,
      refresh_token_expires_at: result.refresh_token_expires_at,
    });
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

    let q = buildZaloContactsQuery(scope, { oa_id, search, has_lead });
    const blocked = await blockedPersonalOaIds(req.user);
    if (blocked.length) q = q.not('oa_id', 'in', `(${blocked.map((id) => `"${id}"`).join(',')})`);
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
    if (!await guardContactAccess(req, res, contact)) return;
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
    if (!await guardContactAccess(req, res, prev)) return;
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
    if (!await guardContactAccess(req, res, prev)) return;
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
    if (!await guardContactAccess(req, res, contact)) return;
    if (!contactAllowedByZaloScope(scope, contact)) {
      return res.status(403).json({ error: 'Không có quyền' });
    }

    const baseAccount = await getAccountAny(contact.oa_id);
    if (baseAccount?.account_kind === 'personal') {
      // Đồng bộ hồ sơ chạy bằng API của Zalo OA. Tài khoản cá nhân không có
      // token OA — tên và avatar lấy từ chính lúc cổng tra số / nhận tin.
      return res.status(400).json({
        error: 'Hội thoại Zalo cá nhân không dùng được đồng bộ hồ sơ của OA',
      });
    }

    const oaConfig = await getOaConfigWithValidToken(contact.oa_id);
    if (!oaConfig || (!oaConfig.access_token && !oaConfig.refresh_token)) {
      return res.status(400).json({ error: 'OA chưa cấu hình token (access / refresh)' });
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

r.post('/contacts/:id/apply-oa-routing', authMiddleware, async (req, res) => {
  try {
    const scope = await resolveZaloOaScope(req, res);
    if (!scope) return;
    const { data: contact } = await supabase.from('zalo_contacts').select('*').eq('id', req.params.id).maybeSingle();
    if (!contact) return res.status(404).json({ error: 'Không tìm thấy liên hệ' });
    if (!await guardContactAccess(req, res, contact)) return;
    if (!contactAllowedByZaloScope(scope, contact)) {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    if (!contact.lead_id) {
      return res.status(400).json({ error: 'Contact chưa có lead — tạo lead trước' });
    }
    const oaConfig = await getOaConfig(contact.oa_id);
    if (!oaConfig?.default_company_id) {
      return res.status(400).json({ error: 'OA chưa cấu hình module/công ty/khu vực' });
    }
    const result = await applyZaloOaRoutingToLead(contact.lead_id, oaConfig);
    if (!result.ok) {
      return res.status(400).json({ error: result.message || result.error, ...result });
    }
    res.json(result);
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
    if (!await guardContactAccess(req, res, contact)) return;
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

    res.json({ ok: true, lead, tasks_created: lead.tasks_created || 0, contact: enrichZaloContact(fresh) });
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
    if (!await guardContactAccess(req, res, prev)) return;
    const { data: contactRow } = await supabase.from('zalo_contacts')
      .select('id, display_name, user_id, customer_id')
      .eq('id', req.params.id)
      .maybeSingle();
    const { data, error } = await supabase.from('zalo_contacts')
      .update({ lead_id, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select('*, lead:crm_leads(id, title, code, type), customer:customers(id, full_name, phone, email)')
      .single();
    if (error) throw error;
    await supabase.from('zalo_messages').update({ lead_id }).eq('contact_id', req.params.id);
    const { data: linkedLead } = await supabase.from('crm_leads')
      .select('customer_id')
      .eq('id', lead_id)
      .maybeSingle();
    const syncCustomerId = linkedLead?.customer_id || contactRow?.customer_id;
    if (syncCustomerId && contactRow?.display_name) {
      await applyZaloDisplayNameToCustomer(syncCustomerId, contactRow.display_name, { zaloUserId: contactRow.user_id });
    }
    const oaConfig = await getOaConfig(prev.oa_id);
    const tasksCreated = oaConfig
      ? await ensureZaloLeadAutoTasks(lead_id, oaConfig.default_lead_owner_id || oaConfig.created_by || req.user?.userId)
      : 0;
    res.json({ ...enrichZaloContact(data), tasks_created: tasksCreated });
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
    if (!await guardContactAccess(req, res, contact)) return;
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
    if (!await guardContactAccess(req, res, contact)) return;

    // Tài khoản Zalo cá nhân: không có CS API — xếp vào hàng đợi cho bridge gửi.
    const baseConfig = await getAccountAny(contact.oa_id);
    if (baseConfig?.account_kind === 'personal') {
      if (!baseConfig.is_active) {
        return res.status(400).json({
          error: `Tài khoản Zalo cá nhân “${baseConfig.oa_name || baseConfig.oa_id}” đang tắt. Quản trị viên bật lại trong trang quản trị của máy công ty.`,
        });
      }
      const allowed = canUsePersonalAccount(req.user, baseConfig);
      if (!allowed.ok) return res.status(403).json({ error: allowed.reason });
      return sendViaPersonalBridge(req, res, { contact, account: baseConfig, text });
    }

    const oaConfig = await getOaConfigWithValidToken(contact.oa_id);
    if (!oaConfig || (!oaConfig.access_token && !oaConfig.refresh_token)) {
      return res.status(400).json({ error: 'OA chưa cấu hình token (access / refresh)' });
    }

    const result = await sendZaloCsWithToken(oaConfig, {
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

/**
 * Chọn hội thoại đúng kênh: 'personal' = Zalo cá nhân, 'oa' = Zalo OA,
 * bỏ trống = hội thoại có tin mới nhất (giữ nguyên hành vi cũ).
 */
async function pickContactByKind(contacts, kind, user = null) {
  if (!contacts.length) return null;

  const newest = (list) => [...list].sort((a, b) =>
    new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0))[0] || null;

  const wanted = String(kind || '').trim().toLowerCase();
  if (wanted !== 'personal' && wanted !== 'oa') return newest(contacts);

  const oaIds = [...new Set(contacts.map((c) => c.oa_id))];
  const { data: accounts } = await supabase.from('zalo_oa_accounts')
    .select('*').in('oa_id', oaIds);

  const byOa = new Map((accounts || []).map((a) => [a.oa_id, a]));

  const matched = contacts.filter((c) => {
    const acc = byOa.get(c.oa_id);
    const accKind = acc?.account_kind || 'oa';
    if (accKind !== wanted) return false;
    // Hội thoại Zalo cá nhân chỉ hiện cho người được dùng tài khoản đó
    if (accKind === 'personal' && user) return canUsePersonalAccount(user, acc).ok;
    return true;
  });

  return newest(matched);
}

/**
 * Gắn tình trạng gửi cho từng tin đi.
 *
 * Tin của Zalo cá nhân đi qua hàng đợi nên có độ trễ và có thể hỏng. Không hiện
 * trạng thái thì nhân viên tưởng đã gửi xong trong khi tin nằm chết ở hàng đợi.
 */
async function attachDeliveryStatus(messages, contact) {
  const outboundIds = messages.filter((m) => m.direction === 'outbound').map((m) => m.id);
  if (!outboundIds.length) return messages.map((m) => ({ ...m, contact }));

  const { data: queued } = await supabase
    .from('zalo_outbox')
    .select('id, message_id, status, attempts, last_error')
    .in('message_id', outboundIds);

  const byMessage = new Map((queued || []).map((q) => [q.message_id, q]));

  return messages.map((m) => {
    const q = byMessage.get(m.id);
    return {
      ...m,
      contact,
      delivery: q ? {
        outbox_id: q.id,
        status: q.status,           // pending | sending | sent | failed
        attempts: q.attempts,
        error: q.last_error,
      } : null,
    };
  });
}

r.get('/leads/:leadId/messages', authMiddleware, async (req, res) => {
  try {
    // Một khách có thể có nhiều lead nhưng chỉ một hội thoại Zalo. Tra theo cả
    // khách hàng và số điện thoại, không chỉ theo lead này.
    const { data: lead } = await supabase.from('crm_leads')
      .select('id, phone, customer_id, customer:customers(id, phone)')
      .eq('id', req.params.leadId)
      .maybeSingle();

    const contacts = lead ? await findContactsForLead(supabase, lead) : [];

    // Một lead có thể có cả hội thoại Zalo OA lẫn Zalo cá nhân. Hai cửa sổ chat
    // là hai kênh riêng, không được trộn tin của nhau.
    const contact = await pickContactByKind(contacts || [], req.query.kind, req.user);
    // Hội thoại vừa tạo thì chưa có tin nào. Vẫn phải trả về `contact`, nếu không
    // giao diện tưởng chưa có hội thoại và quay lại màn hình "tìm khách".
    if (!contact) return res.json({ contact: null, messages: [] });
    const { data } = await supabase.from('zalo_messages')
      .select('*, contact:zalo_contacts(id, display_name, avatar_url, user_id, oa_id)')
      .eq('contact_id', contact.id)
      .order('created_at', { ascending: true });

    const list = await attachDeliveryStatus(data || [], contact);

    // Giao diện cần biết hội thoại này đi qua tài khoản nào, để hiện đúng kênh
    // và đúng cặp số: số khách ↔ số Zalo của mình.
    const { data: acc } = await supabase.from('zalo_oa_accounts')
      .select('oa_id, oa_name, account_kind, account_phone, bridge_status, owner_user_id, owner:users!zalo_oa_accounts_owner_user_id_fkey(id, full_name)')
      .eq('oa_id', contact.oa_id)
      .maybeSingle();

    res.json({
      contact,
      messages: list,
      account: acc ? {
        oa_id: acc.oa_id,
        oa_name: acc.oa_name,
        account_kind: acc.account_kind || 'oa',
        account_phone: acc.account_phone,
        bridge_status: acc.bridge_status,
        // Tên người sở hữu số — hữu ích hơn tên tài khoản, vì tên tài khoản
        // thường bị đặt trùng chính số điện thoại
        owner_name: acc.owner?.full_name || null,
      } : null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/webhook-info', authMiddleware, (_req, res) => {
  const base = process.env.APP_BASE_URL || process.env.PUBLIC_API_URL || '';
  const webhookUrl = base
    ? `${String(base).replace(/\/$/, '')}/api/zalo/webhook`
    : '/api/zalo/webhook';
  const n8nInfo = getN8nIntegrationInfo();
  res.json({
    webhook_url: webhookUrl,
    events_recommended: [
      'user_send_text', 'user_send_image', 'user_send_file', 'user_send_sticker',
      'user_send_link', 'user_send_location', 'follow',
    ],
    docs: 'https://developers.zalo.me/docs/official-account/webhook/tong-quan',
    note: 'Cần HTTPS công khai. IP Việt Nam để lấy đủ tên/avatar khách. Chỉ trả lời tin tư vấn trong 7 ngày sau tin khách.',
    n8n: n8nInfo,
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

/** Gán lại công ty / khu vực / stage / pipeline / NV theo cấu hình OA (lead đã tạo trước khi cấu hình). */
r.post('/batch-apply-oa-routing', authMiddleware, async (req, res) => {
  try {
    const oaId = req.body?.oa_id ? String(req.body.oa_id) : null;
    const limit = parseInt(req.body?.limit, 10) || 500;
    const summary = await runZaloBatchApplyOaRouting({ oaId, limit });
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

/**
 * Trả tệp đính kèm đã chép về kho.
 *
 * Đi qua CRM thay vì link công khai của Supabase để: cùng gốc với trang (không
 * bị chặn nội dung hỗn hợp), và quan trọng hơn — kiểm quyền, vì ảnh khách hàng
 * không được để ai có link cũng xem.
 */
r.get('/messages/:id/attachment', authMiddleware, async (req, res) => {
  try {
    const { data: msg } = await supabase.from('zalo_messages')
      .select('id, contact_id, stored_path, stored_bucket, attachment_name, message_type')
      .eq('id', req.params.id)
      .maybeSingle();

    if (!msg?.stored_path) return res.status(404).json({ error: 'Không có tệp đã lưu' });

    const { data: contact } = await supabase.from('zalo_contacts')
      .select('*').eq('id', msg.contact_id).maybeSingle();
    if (!contact) return res.status(404).json({ error: 'Không tìm thấy hội thoại' });
    if (!await guardContactAccess(req, res, contact)) return;

    const { downloadStorageObject } = require('../helpers/storageUpload');
    const blob = await downloadStorageObject(msg.stored_bucket || 'attachments', msg.stored_path);
    if (!blob) return res.status(404).json({ error: 'Tệp không còn trong kho' });

    const buffer = Buffer.from(await blob.arrayBuffer());
    const name = msg.attachment_name || `zalo-${msg.message_type || 'file'}`;

    res.setHeader('Content-Type', blob.type || 'application/octet-stream');
    res.setHeader('Content-Length', buffer.length);
    // Đệm ngắn: đủ để cuộn qua lại không tải lại, nhưng không giấu lỗi hàng giờ
    // trong bộ nhớ đệm trình duyệt khi đang dò sự cố.
    res.setHeader('Cache-Control', 'private, max-age=300');
    // Ảnh xem trực tiếp; tệp khác thì tải về kèm đúng tên
    res.setHeader(
      'Content-Disposition',
      `${['image', 'sticker', 'gif'].includes(msg.message_type) ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`,
    );
    res.end(buffer);
  } catch (e) {
    console.error('[Zalo đính kèm] phục vụ tệp:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ═══ ZALO CÁ NHÂN — tình trạng tích hợp ═══════════════════════

/**
 * Vì sao người đang đăng nhập chưa dùng được Zalo cá nhân.
 * Giao diện dùng cái này để nói thẳng lý do thay vì ẩn tab đi.
 */
r.get('/personal/status', authMiddleware, async (req, res) => {
  try {
    const status = await describePersonalAvailability(req.user);
    res.json({
      ok: true,
      ...status,
      account: status.account ? {
        oa_id: status.account.oa_id,
        oa_name: status.account.oa_name,
        account_phone: status.account.account_phone,
        bridge_status: status.account.bridge_status,
      } : null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══ ZALO CÁ NHÂN — gửi lại tin hỏng ══════════════════════════

/**
 * Đưa một tin gửi hỏng trở lại hàng đợi.
 *
 * Tin hỏng 3 lần thì dừng để khỏi quay vòng vô ích, nhưng phải có đường cho
 * người bấm gửi lại — thường lỗi là do cổng rớt mạng hoặc phiên Zalo hết hạn,
 * sửa xong là gửi được.
 */
r.post('/personal/messages/:messageId/retry', authMiddleware, async (req, res) => {
  try {
    const { data: msg } = await supabase.from('zalo_messages')
      .select('id, contact_id, direction, content')
      .eq('id', req.params.messageId)
      .maybeSingle();

    if (!msg) return res.status(404).json({ error: 'Không tìm thấy tin nhắn' });
    if (msg.direction !== 'outbound') return res.status(400).json({ error: 'Chỉ gửi lại được tin đi' });

    const { data: contact } = await supabase.from('zalo_contacts')
      .select('*').eq('id', msg.contact_id).maybeSingle();
    if (!contact) return res.status(404).json({ error: 'Không tìm thấy hội thoại' });

    const account = await getAccountAny(contact.oa_id);
    if (account?.account_kind !== 'personal') {
      return res.status(400).json({ error: 'Chỉ áp dụng cho Zalo cá nhân' });
    }
    if (!account.is_active) {
      return res.status(400).json({
        error: `Tài khoản Zalo cá nhân “${account.oa_name || account.oa_id}” đang tắt — bật lại rồi mới gửi lại được.`,
      });
    }
    const allowedRetry = canUsePersonalAccount(req.user, account);
    if (!allowedRetry.ok) return res.status(403).json({ error: allowedRetry.reason });

    const now = new Date().toISOString();
    const { data: existing } = await supabase.from('zalo_outbox')
      .select('id, status').eq('message_id', msg.id).maybeSingle();

    if (existing) {
      if (existing.status === 'sent') {
        return res.status(400).json({ error: 'Tin này đã gửi thành công rồi' });
      }
      await supabase.from('zalo_outbox').update({
        status: 'pending', attempts: 0, last_error: null, claimed_at: null, updated_at: now,
      }).eq('id', existing.id);
      return res.json({ ok: true, outbox_id: existing.id, requeued: true });
    }

    // Không còn hàng đợi (bị dọn) thì xếp lại từ nội dung đã lưu
    const { data: created, error } = await supabase.from('zalo_outbox').insert({
      oa_id: contact.oa_id,
      contact_id: contact.id,
      message_id: msg.id,
      thread_id: contact.user_id,
      thread_type: 'user',
      content: msg.content,
      requested_by: req.user?.id || null,
    }).select('id').single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, outbox_id: created.id, requeued: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══ ZALO CÁ NHÂN — khớp lead theo số điện thoại ══════════════

/**
 * Nhân viên mở tab Zalo cá nhân của một lead chưa có hội thoại → tạo yêu cầu
 * tra cứu ĐÚNG MỘT số. Cổng sẽ hỏi Zalo số đó thuộc tài khoản nào.
 *
 * Cố tình làm theo yêu cầu từng số, không quét hàng loạt: dò số điện thoại
 * hàng loạt là hành vi khiến Zalo khoá tài khoản.
 */
r.post('/personal/leads/:leadId/resolve', authMiddleware, async (req, res) => {
  try {
    const { data: lead } = await supabase.from('crm_leads')
      .select('id, phone, customer_id, customer:customers(id, phone)')
      .eq('id', req.params.leadId)
      .maybeSingle();

    if (!lead) return res.status(404).json({ error: 'Không tìm thấy lead' });

    const raw = lead.customer?.phone || lead.phone;
    const phone = formatVnPhoneLocal0From84(normalizeVnPhoneTo84(raw));
    if (!phone) return res.status(400).json({ error: 'Lead chưa có số điện thoại hợp lệ' });

    // Đã có hội thoại rồi thì khỏi tra — kể cả hội thoại thuộc lead khác của
    // cùng khách này. Tra lại số đã biết vừa tốn lượt vừa tăng rủi ro bị khoá.
    const existing = await findContactsForLead(supabase, lead);
    if (existing.length) {
      return res.json({ ok: true, already_linked: true, contact_id: existing[0].id });
    }

    // Nhắn từ ĐÚNG số Zalo của người đang thao tác — không mượn số người khác
    const account = await pickAccountForUser(req.user, String(req.body?.oa_id || '').trim() || null);
    if (!account) {
      return res.status(400).json({
        error: 'Bạn chưa có tài khoản Zalo cá nhân nào đang chạy. Số Zalo phải trùng số điện thoại trong hồ sơ nhân viên của bạn.',
      });
    }
    const allowedResolve = canUsePersonalAccount(req.user, account);
    if (!allowedResolve.ok) return res.status(403).json({ error: allowedResolve.reason });

    // Hạn mức theo giờ — chặn biến việc này thành quét hàng loạt
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await supabase.from('zalo_link_requests')
      .select('id', { count: 'exact', head: true })
      .eq('oa_id', account.oa_id)
      .gte('created_at', since);

    const limit = account.lookup_hourly_limit ?? 30;
    if ((count || 0) >= limit) {
      return res.status(429).json({
        error: `Đã tra ${count}/${limit} số trong một giờ qua. Chờ sang giờ sau — tra quá nhiều số dễ bị Zalo khoá tài khoản.`,
      });
    }

    const { data: pending } = await supabase.from('zalo_link_requests')
      .select('id, status').eq('oa_id', account.oa_id).eq('phone', phone)
      .eq('status', 'pending').maybeSingle();
    if (pending) return res.json({ ok: true, request: pending, queued: true });

    const { data: created, error } = await supabase.from('zalo_link_requests').insert({
      oa_id: account.oa_id,
      lead_id: lead.id,
      phone,
      requested_by: req.user?.id || null,
    }).select('id, status, phone').single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, request: created, queued: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Kết quả tra cứu gần nhất của một lead, để giao diện hiện trạng thái. */
r.get('/personal/leads/:leadId/resolve', authMiddleware, async (req, res) => {
  try {
    const { data } = await supabase.from('zalo_link_requests')
      .select('id, status, phone, zalo_uid, error, created_at, done_at')
      .eq('lead_id', req.params.leadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    res.json({ ok: true, request: data || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══ ZALO CÁ NHÂN — quản trị cổng & tài khoản ═════════════════

/** Ảnh QR để quét từ xa. Chỉ admin — xem được QR là đăng nhập được. */
r.get('/personal/accounts/:id/qr', authMiddleware, async (req, res) => {
  try {
    if (!isSystemAdmin(req.user) && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Chỉ quản trị viên xem được mã QR' });
    }

    const { data } = await supabase.from('zalo_oa_accounts')
      .select('oa_id, oa_name, qr_image, qr_updated_at, bridge_status')
      .eq('id', req.params.id)
      .eq('account_kind', 'personal')
      .maybeSingle();

    if (!data) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
    if (!data.qr_image) {
      return res.status(404).json({ error: 'Chưa có mã QR — máy công ty chỉ đẩy lên khi cần đăng nhập lại' });
    }

    res.json({
      ok: true,
      oa_id: data.oa_id,
      oa_name: data.oa_name,
      image: data.qr_image,
      updated_at: data.qr_updated_at,
      bridge_status: data.bridge_status,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Ra lệnh cho máy công ty: đăng xuất, khởi động lại, đăng nhập lại. */
r.post('/personal/accounts/:id/command', authMiddleware, async (req, res) => {
  try {
    if (!isSystemAdmin(req.user) && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Chỉ quản trị viên ra lệnh được' });
    }

    const command = String(req.body?.command || '').trim();
    if (!['logout', 'restart', 'relogin'].includes(command)) {
      return res.status(400).json({ error: 'Lệnh không hợp lệ' });
    }

    const { data: account } = await supabase.from('zalo_oa_accounts')
      .select('id, oa_id, gateway_id')
      .eq('id', req.params.id)
      .eq('account_kind', 'personal')
      .maybeSingle();

    if (!account) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
    if (!account.gateway_id) return res.status(400).json({ error: 'Tài khoản chưa gắn với máy nào' });

    const { data: cmd, error } = await supabase.from('zalo_gateway_commands').insert({
      gateway_id: account.gateway_id,
      oa_id: account.oa_id,
      command,
      requested_by: req.user?.id || null,
    }).select('id, command, status').single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, command: cmd });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Danh sách máy công ty + số tài khoản đang giữ. */
r.get('/personal/gateways', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('zalo_gateways')
      .select('id, name, description, is_active, last_seen_at, agent_version, host_info')
      .order('created_at');

    if (error) return res.status(500).json({ error: error.message });

    const { data: accounts } = await supabase
      .from('zalo_oa_accounts')
      .select('gateway_id')
      .eq('account_kind', 'personal');

    const counts = {};
    (accounts || []).forEach((a) => {
      if (a.gateway_id) counts[a.gateway_id] = (counts[a.gateway_id] || 0) + 1;
    });

    res.json({
      ok: true,
      gateways: (data || []).map((g) => ({ ...g, account_count: counts[g.id] || 0 })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══ ZALO CÁ NHÂN — hội thoại chờ gắn lead ════════════════════
// Tin nhắn của TK cá nhân chỉ được lưu sau khi hội thoại gắn vào một lead.
// Trước đó chỉ có tên + thời điểm ở đây để nhân viên bấm gắn.

r.get('/personal/pending-threads', authMiddleware, async (req, res) => {
  try {
    let q = supabase.from('zalo_personal_pending_threads')
      .select('*')
      .eq('dismissed', false)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(Math.min(Number(req.query.limit) || 100, 500));

    if (req.query.oa_id) q = q.eq('oa_id', String(req.query.oa_id));

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, threads: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Gắn hội thoại chờ vào một lead → tạo zalo_contacts, từ giờ tin nhắn được lưu. */
r.post('/personal/pending-threads/:id/link-lead', authMiddleware, async (req, res) => {
  try {
    const leadId = String(req.body?.lead_id || '').trim();
    if (!leadId) return res.status(400).json({ error: 'Thiếu lead_id' });

    const { data: thread } = await supabase.from('zalo_personal_pending_threads')
      .select('*').eq('id', req.params.id).maybeSingle();
    if (!thread) return res.status(404).json({ error: 'Không tìm thấy hội thoại' });

    const { data: lead } = await supabase.from('crm_leads')
      .select('id, customer_id').eq('id', leadId).maybeSingle();
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy lead' });

    const { data: contact, error: upErr } = await supabase.from('zalo_contacts')
      .upsert({
        oa_id: thread.oa_id,
        user_id: thread.thread_id,
        display_name: thread.display_name || `Zalo ${String(thread.thread_id).slice(-6)}`,
        avatar_url: thread.avatar_url || null,
        phone: thread.phone || null,
        lead_id: lead.id,
        customer_id: lead.customer_id || null,
        last_message_at: thread.last_message_at,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'oa_id,user_id' })
      .select().single();

    if (upErr) return res.status(500).json({ error: upErr.message });

    await supabase.from('zalo_personal_pending_threads')
      .update({ dismissed: true, updated_at: new Date().toISOString() })
      .eq('id', thread.id);

    res.json({ ok: true, contact });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/personal/pending-threads/:id/dismiss', authMiddleware, async (req, res) => {
  try {
    const { error } = await supabase.from('zalo_personal_pending_threads')
      .update({ dismissed: true, updated_at: new Date().toISOString() })
      .eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;
