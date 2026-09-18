/**
 * Zalo cá nhân — API cho cổng (gateway) chạy tại máy công ty.
 *
 * Xác thực bằng header `X-Gateway-Token` khớp zalo_gateways.gateway_token.
 * Một máy công ty = một khoá, giữ nhiều tài khoản Zalo; mọi endpoint nhận
 * `oa_id` và backend kiểm tra tài khoản đó có thuộc máy này không.
 * KHÔNG dùng JWT: gateway là máy, không phải người.
 *
 * Gateway ở máy công ty gọi LÊN CRM (VPS) — mọi kết nối đều do nó khởi tạo,
 * nên máy công ty không cần mở cổng nào ra Internet.
 *
 *   GET  /api/zalo-bridge/accounts          danh sách tài khoản của máy này
 *   POST /api/zalo-bridge/inbound           đẩy tin nhắn vào CRM
 *   GET  /api/zalo-bridge/allowlist         hội thoại được phép đồng bộ nội dung
 *   GET  /api/zalo-bridge/outbox            nhận tin CRM cần gửi
 *   POST /api/zalo-bridge/outbox/:id/ack    báo kết quả gửi
 *   POST /api/zalo-bridge/status            báo tình trạng từng tài khoản
 *   POST /api/zalo-bridge/qr                đẩy mã QR lên để admin quét từ xa
 *   GET  /api/zalo-bridge/commands          lấy lệnh admin (đăng xuất, khởi động lại)
 *   POST /api/zalo-bridge/commands/:id/ack  báo đã thi hành
 */
const express = require('express');
const r = express.Router();
const { supabase } = require('../config/supabase');
const { ingestPersonalMessage } = require('../helpers/zaloPersonalIngest');
const { syncAccountOwner } = require('../helpers/zaloPersonalAccess');

const OUTBOX_MAX_ATTEMPTS = 3;
const OUTBOX_CLAIM_LIMIT = 20;
const QR_MAX_BYTES = 200 * 1024;

/**
 * Gateway chạy ở máy công ty, CRM chạy trên VPS — request đi qua Internet, nên
 * KHÔNG lọc theo dải mạng nội bộ được. Lớp bảo vệ chính là `gateway_token`
 * (32 byte ngẫu nhiên) đi trên HTTPS.
 *
 * ZALO_BRIDGE_ALLOW_IPS là lớp thứ hai, tuỳ chọn: danh sách IP hoặc tiền tố IP
 * ngăn cách bằng dấu phẩy (IP tĩnh của văn phòng). Bỏ trống = chỉ dựa vào token,
 * hợp với văn phòng dùng IP động.
 */
function parseAllowList() {
  const raw = String(process.env.ZALO_BRIDGE_ALLOW_IPS || '').trim();
  if (!raw) return null;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function remoteIp(req) {
  const ip = String(req.ip || req.socket?.remoteAddress || '');
  return ip.replace(/^::ffff:/, '');
}

function guardIp(req, res, next) {
  const prefixes = parseAllowList();
  if (!prefixes) return next();
  const ip = remoteIp(req);
  if (prefixes.some((p) => ip === p || ip.startsWith(p))) return next();
  console.warn('[Zalo gateway] Chặn IP ngoài danh sách cho phép:', ip);
  return res.status(403).json({ error: 'IP không được phép' });
}

async function authGateway(req, res, next) {
  const token = String(req.get('X-Gateway-Token') || '').trim();
  if (!token) return res.status(401).json({ error: 'Thiếu X-Gateway-Token' });

  const { data: gateway, error } = await supabase
    .from('zalo_gateways')
    .select('*')
    .eq('gateway_token', token)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!gateway) return res.status(401).json({ error: 'Gateway token không hợp lệ' });
  if (!gateway.is_active) return res.status(403).json({ error: 'Gateway đang bị tắt' });

  req.gateway = gateway;
  next();
}

/**
 * Lấy tài khoản theo oa_id VÀ kiểm tra nó thuộc gateway đang gọi.
 * Dùng cho sửa/xoá — tài khoản đang tắt vẫn phải thao tác được.
 */
async function resolveAccountAny(req, oaId) {
  const id = String(oaId || '').trim();
  if (!id) return { error: 'Thiếu oa_id' };

  const { data: account } = await supabase
    .from('zalo_oa_accounts')
    .select('*')
    .eq('oa_id', id)
    .eq('account_kind', 'personal')
    .maybeSingle();

  if (!account) return { error: 'Không tìm thấy tài khoản Zalo cá nhân' };
  if (account.gateway_id !== req.gateway.id) {
    return { error: 'Tài khoản không thuộc máy này' };
  }
  return { account };
}

/** Như trên, nhưng dùng cho luồng chạy — tài khoản tắt thì từ chối. */
async function resolveAccount(req, oaId) {
  const found = await resolveAccountAny(req, oaId);
  if (found.error) return found;
  if (!found.account.is_active) return { error: 'Tài khoản đang tắt' };
  return found;
}

function io() {
  return r._ioRef || null;
}

async function touchGateway(gateway, patch = {}) {
  await supabase.from('zalo_gateways').update({
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...patch,
  }).eq('id', gateway.id);
}

// ═══ Danh sách tài khoản của máy này ═══════════════════════════

r.get('/accounts', guardIp, authGateway, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('zalo_oa_accounts')
      .select('oa_id, oa_name, is_active, auto_create_lead, bridge_status, account_phone, expected_phone, share_mode, owner_user_id, owner:users!zalo_oa_accounts_owner_user_id_fkey(id, full_name)')
      .eq('gateway_id', req.gateway.id)
      .eq('account_kind', 'personal')
      .order('oa_name');

    if (error) return res.status(500).json({ error: error.message });

    await touchGateway(req.gateway, {
      agent_version: req.get('X-Agent-Version') || null,
    });

    // Trang quản trị ở máy công ty cần biết số của tài khoản và ai sở hữu, để
    // người trực thấy ngay tài khoản nào chưa gán được cho nhân viên nào.
    const accounts = (data || []).map(({ owner, ...a }) => ({
      ...a,
      owner_name: owner?.full_name || null,
    }));

    res.json({ ok: true, accounts });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Thêm tài khoản Zalo cá nhân vào máy này. */
r.post('/accounts', guardIp, authGateway, async (req, res) => {
  try {
    const oaId = String(req.body?.oa_id || '').trim();
    const oaName = String(req.body?.oa_name || '').trim();

    if (!oaId) return res.status(400).json({ error: 'Thiếu oa_id' });
    if (!oaName) return res.status(400).json({ error: 'Thiếu tên hiển thị' });
    if (!/^[A-Za-z0-9_:.-]+$/.test(oaId)) {
      return res.status(400).json({ error: 'oa_id chỉ được dùng chữ, số và _ : . -' });
    }

    const { data: existing } = await supabase.from('zalo_oa_accounts')
      .select('id, gateway_id, account_kind').eq('oa_id', oaId).maybeSingle();

    if (existing) {
      return res.status(409).json({
        error: existing.gateway_id === req.gateway.id
          ? 'Tài khoản này đã có trên máy'
          : 'Mã tài khoản đã được dùng ở nơi khác',
      });
    }

    const { normalizePhone } = require('../helpers/zaloPersonalAccess');
    const expected = normalizePhone(req.body?.expected_phone);
    if (req.body?.expected_phone && !expected) {
      return res.status(400).json({ error: 'Số điện thoại dự kiến không hợp lệ' });
    }

    const { data, error } = await supabase.from('zalo_oa_accounts').insert({
      oa_id: oaId,
      oa_name: oaName,
      account_kind: 'personal',
      gateway_id: req.gateway.id,
      is_active: req.body?.is_active !== false,
      auto_create_lead: req.body?.auto_create_lead === true,
      expected_phone: expected,
      auto_reply_message: null,
    }).select('oa_id, oa_name, is_active, auto_create_lead, bridge_status, expected_phone').single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json({ ok: true, account: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Sửa tên / bật tắt / chế độ tự tạo lead. */
r.patch('/accounts/:oaId', guardIp, authGateway, async (req, res) => {
  try {
    const { account, error } = await resolveAccountAny(req, req.params.oaId);
    if (error) return res.status(400).json({ error });

    const patch = { updated_at: new Date().toISOString() };
    if (req.body?.oa_name != null) patch.oa_name = String(req.body.oa_name).trim().slice(0, 200);
    if (req.body?.is_active != null) patch.is_active = req.body.is_active === true;
    if (req.body?.auto_create_lead != null) patch.auto_create_lead = req.body.auto_create_lead === true;
    if (req.body?.expected_phone !== undefined) {
      const { normalizePhone } = require('../helpers/zaloPersonalAccess');
      const exp = normalizePhone(req.body.expected_phone);
      if (req.body.expected_phone && !exp) {
        return res.status(400).json({ error: 'Số điện thoại dự kiến không hợp lệ' });
      }
      patch.expected_phone = exp;
    }

    const { data, error: upErr } = await supabase.from('zalo_oa_accounts')
      .update(patch).eq('id', account.id)
      .select('oa_id, oa_name, is_active, auto_create_lead, bridge_status').single();

    if (upErr) return res.status(500).json({ error: upErr.message });
    res.json({ ok: true, account: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Gỡ tài khoản khỏi máy. Hộp thư và lead cũ giữ nguyên. */
r.delete('/accounts/:oaId', guardIp, authGateway, async (req, res) => {
  try {
    const { account, error } = await resolveAccountAny(req, req.params.oaId);
    if (error) return res.status(400).json({ error });

    const { error: delErr } = await supabase.from('zalo_oa_accounts').delete().eq('id', account.id);
    if (delErr) return res.status(500).json({ error: delErr.message });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══ Tin đến ═══════════════════════════════════════════════════

r.post('/inbound', guardIp, authGateway, async (req, res) => {
  try {
    const { account, error } = await resolveAccount(req, req.body?.oa_id);
    if (error) return res.status(400).json({ error });

    const items = Array.isArray(req.body?.messages) ? req.body.messages : [];
    if (!items.length) return res.status(400).json({ error: 'Không có tin nhắn' });

    const results = [];
    for (const item of items) {
      try {
        results.push(await ingestPersonalMessage(account, item, io()));
      } catch (e) {
        console.error('[Zalo gateway] ingest:', e.message);
        results.push({ ok: false, error: e.message });
      }
    }

    await touchGateway(req.gateway);
    res.json({ ok: true, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══ Hội thoại được phép đồng bộ nội dung ══════════════════════

r.get('/allowlist', guardIp, authGateway, async (req, res) => {
  try {
    const { account, error } = await resolveAccount(req, req.query.oa_id);
    if (error) return res.status(400).json({ error });

    const { data, error: qErr } = await supabase
      .from('zalo_contacts')
      .select('user_id')
      .eq('oa_id', account.oa_id)
      .not('lead_id', 'is', null);

    if (qErr) return res.status(500).json({ error: qErr.message });
    res.json({ ok: true, thread_ids: (data || []).map((row) => row.user_id) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══ Tin đi ════════════════════════════════════════════════════

r.get('/outbox', guardIp, authGateway, async (req, res) => {
  try {
    const { account, error } = await resolveAccount(req, req.query.oa_id);
    if (error) return res.status(400).json({ error });

    const limit = Math.min(Number(req.query.limit) || 10, OUTBOX_CLAIM_LIMIT);

    const { data: pending, error: qErr } = await supabase
      .from('zalo_outbox')
      .select('id')
      .eq('oa_id', account.oa_id)
      .eq('status', 'pending')
      .lt('attempts', OUTBOX_MAX_ATTEMPTS)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (qErr) return res.status(500).json({ error: qErr.message });
    if (!pending?.length) return res.json({ ok: true, messages: [] });

    // Giành quyền xử lý: chỉ những hàng còn 'pending' mới đổi được sang 'sending',
    // nên hai tiến trình chạy song song không gửi trùng.
    const { data: claimed, error: claimErr } = await supabase
      .from('zalo_outbox')
      .update({ status: 'sending', claimed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .in('id', pending.map((row) => row.id))
      .eq('status', 'pending')
      .select('id, thread_id, thread_type, content, attempts');

    if (claimErr) return res.status(500).json({ error: claimErr.message });
    res.json({ ok: true, messages: claimed || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/outbox/:id/ack', guardIp, authGateway, async (req, res) => {
  try {
    const { data: row } = await supabase
      .from('zalo_outbox')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (!row) return res.status(404).json({ error: 'Không tìm thấy tin trong hàng đợi' });

    const { account, error } = await resolveAccount(req, row.oa_id);
    if (error) return res.status(403).json({ error });

    const ok = req.body?.ok === true;
    const now = new Date().toISOString();
    const attempts = (row.attempts || 0) + 1;
    const zaloMsgId = req.body?.zalo_msg_id ? `${account.oa_id}:${req.body.zalo_msg_id}` : null;

    if (ok) {
      await supabase.from('zalo_outbox').update({
        status: 'sent', attempts, sent_at: now, updated_at: now,
        zalo_msg_id: zaloMsgId, last_error: null,
      }).eq('id', row.id);

      if (row.message_id) {
        await supabase.from('zalo_messages')
          .update({ zalo_msg_id: zaloMsgId, metadata: { source: 'personal_bridge', delivered: true } })
          .eq('id', row.message_id);
      }
    } else {
      const giveUp = attempts >= OUTBOX_MAX_ATTEMPTS;
      await supabase.from('zalo_outbox').update({
        status: giveUp ? 'failed' : 'pending',
        attempts,
        last_error: String(req.body?.error || 'unknown').slice(0, 500),
        claimed_at: null,
        updated_at: now,
      }).eq('id', row.id);
    }

    try {
      io()?.emit('zalo_outbox_ack', {
        outbox_id: row.id,
        contact_id: row.contact_id,
        message_id: row.message_id,
        ok,
        error: ok ? null : String(req.body?.error || ''),
      });
    } catch (_) { /* ignore */ }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══ Tình trạng ════════════════════════════════════════════════

/** Một lần gọi báo trạng thái nhiều tài khoản cùng lúc. */
r.post('/status', guardIp, authGateway, async (req, res) => {
  try {
    const allowed = ['offline', 'online', 'need_qr', 'error'];
    const items = Array.isArray(req.body?.accounts) ? req.body.accounts : [];

    const applied = [];
    for (const item of items) {
      const { account } = await resolveAccount(req, item.oa_id);
      if (!account) continue;

      // Máy công ty báo số của chính tài khoản Zalo → khớp ra nhân viên sở hữu
      if (item.account_phone) {
        await syncAccountOwner(account, item.account_phone).catch((e) =>
          console.warn('[Zalo gateway] khớp chủ tài khoản:', e.message));
      }

      const status = allowed.includes(item.status) ? item.status : 'offline';
      await supabase.from('zalo_oa_accounts').update({
        bridge_status: status,
        bridge_transport: item.transport ? String(item.transport).slice(0, 40) : null,
        bridge_note: item.note ? String(item.note).slice(0, 500) : null,
        bridge_last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', account.id);

      applied.push({ oa_id: account.oa_id, status });

      try {
        io()?.emit('zalo_bridge_status', { oa_id: account.oa_id, status, note: item.note || null });
      } catch (_) { /* ignore */ }
    }

    await touchGateway(req.gateway, {
      agent_version: req.get('X-Agent-Version') || null,
      host_info: req.body?.host || null,
    });

    res.json({ ok: true, applied });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══ Mã QR để admin quét từ xa ═════════════════════════════════

r.post('/qr', guardIp, authGateway, async (req, res) => {
  try {
    const { account, error } = await resolveAccount(req, req.body?.oa_id);
    if (error) return res.status(400).json({ error });

    const image = req.body?.image ? String(req.body.image) : null;
    if (image && image.length > QR_MAX_BYTES) {
      return res.status(413).json({ error: 'Ảnh QR quá lớn' });
    }

    await supabase.from('zalo_oa_accounts').update({
      qr_image: image,
      qr_updated_at: image ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq('id', account.id);

    try {
      io()?.emit('zalo_bridge_qr', { oa_id: account.oa_id, has_qr: !!image });
    } catch (_) { /* ignore */ }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══ Tra cứu số điện thoại → tài khoản Zalo ════════════════════

r.get('/link-requests', guardIp, authGateway, async (req, res) => {
  try {
    const { account, error } = await resolveAccount(req, req.query.oa_id);
    if (error) return res.status(400).json({ error });

    const { data, error: qErr } = await supabase
      .from('zalo_link_requests')
      .select('id, phone, lead_id')
      .eq('oa_id', account.oa_id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(5);

    if (qErr) return res.status(500).json({ error: qErr.message });
    res.json({ ok: true, requests: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Cổng báo kết quả tra cứu. Tìm được thì tạo luôn hội thoại gắn với lead,
 * để tin nhắn sau đó chảy thẳng vào cửa sổ Zalo cá nhân của lead.
 */
r.post('/link-requests/:id/ack', guardIp, authGateway, async (req, res) => {
  try {
    const { data: request } = await supabase
      .from('zalo_link_requests').select('*').eq('id', req.params.id).maybeSingle();
    if (!request) return res.status(404).json({ error: 'Không tìm thấy yêu cầu' });

    const { account, error } = await resolveAccount(req, request.oa_id);
    if (error) return res.status(403).json({ error });

    const now = new Date().toISOString();
    const uid = req.body?.zalo_uid ? String(req.body.zalo_uid) : null;

    if (!uid) {
      await supabase.from('zalo_link_requests').update({
        status: req.body?.not_found ? 'not_found' : 'failed',
        error: String(req.body?.error || '').slice(0, 300) || null,
        done_at: now,
      }).eq('id', request.id);
      return res.json({ ok: true, linked: false });
    }

    const { data: lead } = await supabase.from('crm_leads')
      .select('id, customer_id').eq('id', request.lead_id).maybeSingle();

    const { data: contact, error: upErr } = await supabase.from('zalo_contacts').upsert({
      oa_id: account.oa_id,
      user_id: uid,
      display_name: req.body?.display_name || `Zalo ${uid.slice(-6)}`,
      avatar_url: req.body?.avatar_url || null,
      phone: request.phone,
      lead_id: lead?.id || null,
      customer_id: lead?.customer_id || null,
      updated_at: now,
    }, { onConflict: 'oa_id,user_id' }).select().single();

    if (upErr) return res.status(500).json({ error: upErr.message });

    await supabase.from('zalo_link_requests').update({
      status: 'done', zalo_uid: uid, display_name: req.body?.display_name || null, done_at: now,
    }).eq('id', request.id);

    await supabase.from('zalo_personal_pending_threads')
      .update({ dismissed: true, updated_at: now })
      .eq('oa_id', account.oa_id).eq('thread_id', uid);

    try {
      io()?.emit('zalo_bridge_linked', { oa_id: account.oa_id, lead_id: lead?.id, contact_id: contact.id });
    } catch (_) { /* ignore */ }

    res.json({ ok: true, linked: true, contact_id: contact.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══ Lệnh từ admin xuống máy công ty ═══════════════════════════

r.get('/commands', guardIp, authGateway, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('zalo_gateway_commands')
      .select('id, oa_id, command')
      .eq('gateway_id', req.gateway.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(20);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, commands: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/commands/:id/ack', guardIp, authGateway, async (req, res) => {
  try {
    const { error } = await supabase
      .from('zalo_gateway_commands')
      .update({
        status: req.body?.ok === true ? 'done' : 'failed',
        result: req.body?.result ? String(req.body.result).slice(0, 500) : null,
        done_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .eq('gateway_id', req.gateway.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;
