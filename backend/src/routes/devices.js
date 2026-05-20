/**
 * Quản lý thiết bị đang đăng nhập (mobile + web) + heartbeat.
 * Cần migration database/205_user_devices.sql
 */

const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { sendMobilePush } = require('../services/pushSender');
const { recordUserPing } = require('../helpers/userPresence');

const r = Router();
r.use(auth);

function currentUserId(req) {
  return req.user?.userId || req.user?.id || null;
}

function clientIp(req) {
  return (
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    null
  );
}

const ONLINE_WINDOW_MS = 90 * 1000;
const ALLOWED_PLATFORMS = ['android', 'ios', 'web', 'desktop'];

function tableMissing(error) {
  if (!error) return false;
  return (
    error.code === '42P01' ||
    String(error.message || '').includes('user_devices')
  );
}

function migrationHint(res) {
  return res.status(503).json({
    error: 'Chạy migration database/205_user_devices.sql',
  });
}

// POST /devices/ping — heartbeat: upsert thiết bị, cập nhật last_ping_at
r.post('/ping', async (req, res) => {
  try {
    const uid = currentUserId(req);
    if (!uid) return res.status(401).json({ error: 'Token không có user id' });

    const deviceId = String(req.body?.device_id || '').trim();
    if (!deviceId) return res.status(400).json({ error: 'Thiếu device_id' });

    const platformRaw = String(req.body?.platform || 'web').trim().toLowerCase();
    const platform = ALLOWED_PLATFORMS.includes(platformRaw) ? platformRaw : 'web';

    const now = new Date().toISOString();
    const payload = {
      user_id: uid,
      device_id: deviceId,
      platform,
      device_name: req.body?.device_name ? String(req.body.device_name).slice(0, 160) : null,
      os_name: req.body?.os_name ? String(req.body.os_name).slice(0, 60) : null,
      os_version: req.body?.os_version ? String(req.body.os_version).slice(0, 60) : null,
      app_version: req.body?.app_version ? String(req.body.app_version).slice(0, 60) : null,
      user_agent: req.headers['user-agent'] ? String(req.headers['user-agent']).slice(0, 500) : null,
      ip: clientIp(req),
      push_token: req.body?.push_token ? String(req.body.push_token).slice(0, 500) : null,
      last_ping_at: now,
    };

    const isLogin = req.body?.is_login === true;
    if (isLogin) payload.last_login_at = now;

    const { data, error } = await supabase
      .from('user_devices')
      .upsert(payload, { onConflict: 'user_id,device_id' })
      .select('id, last_ping_at, last_login_at')
      .single();

    if (error) {
      if (tableMissing(error)) return migrationHint(res);
      throw error;
    }

    // Đồng bộ user-level presence: trang web Active Users dùng bảng `user_last_activity`
    // để đếm "Đang hoạt động". Mobile chỉ ping /devices/ping nên cũng ghi sang đây để
    // user dùng Android hiển thị online đúng (không cần ping riêng /users/ping).
    try {
      await recordUserPing(uid);
    } catch (e) {
      // Không vỡ luồng nếu bảng user_last_activity chưa có migration.
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[devices/ping] recordUserPing:', e?.message || e);
      }
    }

    res.json({ ok: true, device: data });
  } catch (e) {
    console.error('POST /devices/ping:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /devices/me — danh sách thiết bị của user hiện tại
r.get('/me', async (req, res) => {
  try {
    const uid = currentUserId(req);
    if (!uid) return res.status(401).json({ error: 'Token không có user id' });

    const { data, error } = await supabase
      .from('user_devices')
      .select('id, device_id, platform, device_name, os_name, os_version, app_version, ip, last_ping_at, last_login_at, first_seen_at')
      .eq('user_id', uid)
      .order('last_ping_at', { ascending: false });

    if (error) {
      if (tableMissing(error)) return migrationHint(res);
      throw error;
    }

    const threshold = Date.now() - ONLINE_WINDOW_MS;
    const rows = (data || []).map((d) => ({
      ...d,
      online: d.last_ping_at ? new Date(d.last_ping_at).getTime() >= threshold : false,
    }));
    res.json({ devices: rows });
  } catch (e) {
    console.error('GET /devices/me:', e);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /devices/:id — gỡ thiết bị (đăng xuất từ xa)
r.delete('/:id', async (req, res) => {
  try {
    const uid = currentUserId(req);
    if (!uid) return res.status(401).json({ error: 'Token không có user id' });

    const id = String(req.params.id);
    const { data: dev, error: getErr } = await supabase
      .from('user_devices')
      .select('id, user_id, push_token')
      .eq('id', id)
      .single();
    if (getErr || !dev) return res.status(404).json({ error: 'Không tìm thấy thiết bị' });
    if (dev.user_id !== uid) return res.status(403).json({ error: 'Không có quyền' });

    if (dev.push_token) {
      await supabase
        .from('push_device_tokens')
        .delete()
        .eq('user_id', uid)
        .eq('token', dev.push_token)
        .then(() => {}, () => {});
    }

    const { error } = await supabase.from('user_devices').delete().eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /devices/:id:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /devices/test-push — gửi push test cho chính user hiện tại
r.post('/test-push', async (req, res) => {
  try {
    const uid = currentUserId(req);
    if (!uid) return res.status(401).json({ error: 'Token không có user id' });

    const kind = String(req.body?.kind || 'system');
    const isChat = kind === 'chat';

    // Đếm token + trả về preview để mobile biết tình trạng đăng ký push.
    let tokens = [];
    try {
      const { data } = await supabase
        .from('push_device_tokens')
        .select('token, platform, device_id, last_seen_at')
        .eq('user_id', uid);
      tokens = (data || []).filter((t) => t.platform === 'expo' && t.token);
    } catch { tokens = []; }

    const fakeNotif = {
      id: `test-${Date.now()}`,
      type: isChat ? 'messenger_chat' : 'crm_deal',
      title: isChat ? 'Tin nhắn thử nghiệm' : '🎯 Deal mới (thử)',
      message: isChat
        ? 'Push chat đang hoạt động — chạm để mở chat.'
        : 'Push deal đang hoạt động — chạm để mở deal.',
      entity_type: isChat ? 'messenger_group' : 'crm_deal',
      entity_id: req.body?.entity_id || 'test',
      metadata: isChat
        ? { sender_name: 'Hệ thống', group_name: 'TuBep CRM' }
        : {},
    };
    if (tokens.length) {
      try { await sendMobilePush(uid, fakeNotif); } catch (e) { console.warn('[test-push]', e.message || e); }
    }

    res.json({
      ok: true,
      kind,
      tokens_count: tokens.length,
      hint: !tokens.length
        ? 'Chưa có Expo push token cho user này. Mở app → Tài khoản → Thiết lập bong bóng & thông báo → cấp quyền, rồi thử lại. Nếu vẫn không có: cần cấu hình EAS projectId trong app.json và google-services.json (xem docs/PUSH_SETUP.md), build lại APK.'
        : undefined,
      tokens: tokens.map((t) => ({
        device_id: t.device_id,
        last_seen_at: t.last_seen_at,
        token_preview: String(t.token).slice(0, 30) + '…',
      })),
    });
  } catch (e) {
    console.error('POST /devices/test-push:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /devices/online — đếm/ liệt kê các user đang online (cho admin / dashboard)
r.get('/online', async (req, res) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    const isAdmin = ['admin', 'super_admin', 'owner'].includes(role);
    if (!isAdmin) return res.status(403).json({ error: 'Chỉ admin' });

    const threshold = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString();
    const { data, error } = await supabase
      .from('user_devices')
      .select('user_id, platform, device_name, last_ping_at, users:users!user_devices_user_id_fkey(id, full_name, email, avatar)')
      .gte('last_ping_at', threshold)
      .order('last_ping_at', { ascending: false });

    if (error) {
      if (tableMissing(error)) return migrationHint(res);
      throw error;
    }
    res.json({ devices: data || [] });
  } catch (e) {
    console.error('GET /devices/online:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;
