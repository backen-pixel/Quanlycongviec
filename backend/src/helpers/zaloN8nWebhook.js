/**
 * Gửi trigger tới n8n (hoặc URL webhook bất kỳ) khi có tin Zalo inbound mới.
 * Mỗi zalo_oa_accounts có n8n_trigger_token → đường dẫn webhook riêng.
 */
const crypto = require('crypto');

function isValidOutboundWebhookUrl(url) {
  try {
    const u = new URL(String(url || '').trim());
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

function normalizeOutboundWebhookUrl(url) {
  const s = String(url || '').trim();
  return s || null;
}

function getCrmPublicBaseUrl() {
  return String(process.env.APP_BASE_URL || process.env.PUBLIC_API_URL || '').replace(/\/$/, '');
}

function getN8nWebhookBaseUrl() {
  return String(process.env.N8N_WEBHOOK_BASE_URL || '').replace(/\/$/, '');
}

function generateN8nTriggerToken() {
  return crypto.randomBytes(16).toString('hex');
}

function oaN8nPathSuffix(token, kind) {
  const t = String(token || '').trim();
  if (!t) return null;
  if (kind === 'sync_profile') return `zalo-${t}-sync-profile`;
  return `zalo-${t}-inbound`;
}

/**
 * URL trigger / callback riêng theo từng OA (hiển thị trên web sau khi lưu cấu hình).
 */
function buildOaN8nTriggerUrls(oaConfig) {
  const token = oaConfig?.n8n_trigger_token || null;
  const crmBase = getCrmPublicBaseUrl();
  const n8nBase = getN8nWebhookBaseUrl();
  const inboundSuffix = oaN8nPathSuffix(token, 'inbound');
  const syncSuffix = oaN8nPathSuffix(token, 'sync_profile');

  const crm = token && crmBase ? {
    sync_profile: `${crmBase}/api/zalo/integrations/n8n/o/${token}/sync-profile`,
    info: `${crmBase}/api/zalo/integrations/n8n/o/${token}`,
  } : null;

  const n8nAuto = token && n8nBase ? {
    inbound: `${n8nBase}/${inboundSuffix}`,
    sync_profile: `${n8nBase}/${syncSuffix}`,
  } : null;

  const n8nPaths = token ? {
    inbound: `/webhook/${inboundSuffix}`,
    sync_profile: `/webhook/${syncSuffix}`,
    inbound_suffix: inboundSuffix,
    sync_profile_suffix: syncSuffix,
  } : null;

  return {
    token,
    crm,
    n8n_auto: n8nAuto,
    n8n_paths: n8nPaths,
    n8n_webhook_base_env: 'N8N_WEBHOOK_BASE_URL',
    n8n_webhook_base_set: !!n8nBase,
    effective: {
      inbound: resolveOaN8nInboundUrl(oaConfig),
      sync_profile: resolveOaN8nSyncProfileUrl(oaConfig),
    },
  };
}

/** URL CRM POST tới n8n khi có tin inbound — ưu tiên ghi đè thủ công, rồi N8N_WEBHOOK_BASE_URL + token. */
function resolveOaN8nInboundUrl(oaConfig) {
  const manual = normalizeOutboundWebhookUrl(oaConfig?.n8n_webhook_url);
  if (manual) return manual;
  const token = oaConfig?.n8n_trigger_token;
  const n8nBase = getN8nWebhookBaseUrl();
  if (token && n8nBase) return `${n8nBase}/${oaN8nPathSuffix(token, 'inbound')}`;
  return null;
}

function resolveOaN8nSyncProfileUrl(oaConfig) {
  const manual = normalizeOutboundWebhookUrl(oaConfig?.n8n_sync_profile_webhook_url);
  if (manual) return manual;
  const token = oaConfig?.n8n_trigger_token;
  const n8nBase = getN8nWebhookBaseUrl();
  if (token && n8nBase) return `${n8nBase}/${oaN8nPathSuffix(token, 'sync_profile')}`;
  return null;
}

function buildN8nSyncProfileAction(contact, oaConfig) {
  const token = oaConfig?.n8n_trigger_token;
  const crmBase = getCrmPublicBaseUrl();
  if (token && crmBase) {
    return {
      method: 'POST',
      url: `${crmBase}/api/zalo/integrations/n8n/o/${token}/sync-profile`,
      headers: { 'Content-Type': 'application/json' },
      body: {
        contact_id: contact?.id || null,
        oa_id: contact?.oa_id || oaConfig?.oa_id || null,
        user_id: contact?.user_id || null,
      },
    };
  }
  if (!crmBase) return null;
  return {
    method: 'POST',
    url: `${crmBase}/api/zalo/integrations/n8n/sync-profile`,
    headers: {
      'Content-Type': 'application/json',
      'X-Zalo-N8n-Secret': '<trùng ZALO_N8N_CALLBACK_SECRET>',
    },
    body: {
      contact_id: contact?.id || null,
      oa_id: contact?.oa_id || oaConfig?.oa_id || null,
      user_id: contact?.user_id || null,
    },
  };
}

async function postJsonWebhook(url, payload) {
  if (!url || !isValidOutboundWebhookUrl(url)) return { ok: false, error: 'invalid_url' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TubepCRM-ZaloWebhook/1.0',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[Zalo→n8n] ${url} → HTTP ${res.status}`);
      return { ok: false, status: res.status };
    }
    console.log(`[Zalo→n8n] Trigger OK → ${url}`);
    return { ok: true, status: res.status };
  } catch (e) {
    const msg = e.name === 'AbortError' ? 'timeout' : e.message;
    console.warn(`[Zalo→n8n] ${url}:`, msg);
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

function buildInboundPayload(oaConfig, ctx = {}) {
  const { contact, message, partnerUserId, eventName, lead, extractedPhone, needsProfileSync } = ctx;
  const syncAction = buildN8nSyncProfileAction(contact, oaConfig);
  const triggers = buildOaN8nTriggerUrls(oaConfig);
  return {
    event: 'zalo_inbound_message',
    triggered_at: new Date().toISOString(),
    needs_profile_sync: !!needsProfileSync,
    n8n_trigger_token: oaConfig?.n8n_trigger_token || null,
    trigger_urls: triggers,
    oa: {
      id: oaConfig.oa_id || null,
      name: oaConfig.oa_name || null,
      account_id: oaConfig.id || null,
    },
    contact: contact ? {
      id: contact.id,
      user_id: contact.user_id || partnerUserId || null,
      display_name: contact.display_name || null,
      avatar_url: contact.avatar_url || null,
      phone: contact.phone || extractedPhone || null,
      lead_id: contact.lead_id || null,
      customer_id: contact.customer_id || null,
      unread_count: contact.unread_count ?? null,
      last_message_preview: contact.last_message_preview || null,
    } : null,
    message: message ? {
      id: message.id,
      zalo_msg_id: message.zalo_msg_id || null,
      event_name: eventName || message.event_name || null,
      direction: message.direction || 'inbound',
      message_type: message.message_type || null,
      content: message.content || null,
      attachment_url: message.attachment_url || null,
      created_at: message.created_at || null,
    } : null,
    lead: lead ? {
      id: lead.id,
      code: lead.code || null,
      title: lead.title || null,
    } : null,
    actions: syncAction ? { sync_profile: syncAction } : undefined,
  };
}

function buildSyncProfileRequestPayload(oaConfig, ctx = {}) {
  const { contact, message, partnerUserId, lead, extractedPhone } = ctx;
  const syncAction = buildN8nSyncProfileAction(contact, oaConfig);
  return {
    event: 'zalo_sync_profile_request',
    triggered_at: new Date().toISOString(),
    reason: 'needs_display_name',
    n8n_trigger_token: oaConfig?.n8n_trigger_token || null,
    trigger_urls: buildOaN8nTriggerUrls(oaConfig),
    oa: {
      id: oaConfig.oa_id || null,
      name: oaConfig.oa_name || null,
      account_id: oaConfig.id || null,
    },
    contact: contact ? {
      id: contact.id,
      user_id: contact.user_id || partnerUserId || null,
      display_name: contact.display_name || null,
      avatar_url: contact.avatar_url || null,
      phone: contact.phone || extractedPhone || null,
      lead_id: contact.lead_id || null,
    } : null,
    message: message ? {
      id: message.id,
      content: message.content || null,
      message_type: message.message_type || null,
    } : null,
    lead: lead ? { id: lead.id, code: lead.code || null, title: lead.title || null } : null,
    actions: syncAction ? { sync_profile: syncAction } : undefined,
  };
}

async function triggerZaloInboundN8nWebhook(oaConfig, ctx = {}) {
  const url = resolveOaN8nInboundUrl(oaConfig);
  if (!url) return { skipped: true, reason: 'no_url' };
  return postJsonWebhook(url, buildInboundPayload(oaConfig, ctx));
}

async function triggerZaloSyncProfileN8nWebhook(oaConfig, ctx = {}) {
  const url = resolveOaN8nSyncProfileUrl(oaConfig);
  if (!url) return { skipped: true, reason: 'no_sync_url' };
  return postJsonWebhook(url, buildSyncProfileRequestPayload(oaConfig, ctx));
}

function getN8nIntegrationInfo() {
  const base = getCrmPublicBaseUrl();
  const n8nBase = getN8nWebhookBaseUrl();
  return {
    crm_base_url: base || null,
    n8n_webhook_base_url: n8nBase || null,
    n8n_webhook_base_env: 'N8N_WEBHOOK_BASE_URL',
    per_oa_pattern: {
      n8n_inbound: n8nBase ? `${n8nBase}/zalo-{token}-inbound` : '/webhook/zalo-{token}-inbound',
      n8n_sync_profile: n8nBase ? `${n8nBase}/zalo-{token}-sync-profile` : '/webhook/zalo-{token}-sync-profile',
      crm_sync_profile: base ? `${base}/api/zalo/integrations/n8n/o/{token}/sync-profile` : null,
      crm_info: base ? `${base}/api/zalo/integrations/n8n/o/{token}` : null,
    },
    legacy_callback: base ? `${base}/api/zalo/integrations/n8n/sync-profile` : null,
    workflow_hint: [
      'Mỗi OA có n8n_trigger_token riêng sau khi Lưu cấu hình.',
      'n8n Webhook path: /webhook/zalo-{token}-inbound (hoặc full URL nếu có N8N_WEBHOOK_BASE_URL).',
      'Lấy tên: HTTP Request POST → /api/zalo/integrations/n8n/o/{token}/sync-profile',
    ],
  };
}

module.exports = {
  isValidOutboundWebhookUrl,
  normalizeOutboundWebhookUrl,
  getCrmPublicBaseUrl,
  getN8nWebhookBaseUrl,
  generateN8nTriggerToken,
  buildOaN8nTriggerUrls,
  resolveOaN8nInboundUrl,
  resolveOaN8nSyncProfileUrl,
  buildN8nSyncProfileAction,
  postJsonWebhook,
  buildInboundPayload,
  buildSyncProfileRequestPayload,
  triggerZaloInboundN8nWebhook,
  triggerZaloSyncProfileN8nWebhook,
  getN8nIntegrationInfo,
};
