const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { isNotificationTypeAllowed } = require('../helpers/notificationPrefTypes');
const { DEFAULT_PREFS, invalidateNotificationPrefsCache } = require('../helpers/notificationPrefsUser');
const { isExpiryDeadlineNotificationType } = require('../helpers/notificationOperationalFilter');
const { isRestTableMissingError } = require('../helpers/pushDeviceTokensPg');
let webpush;
try { webpush = require('web-push'); } catch { webpush = null; }

const r = Router();
r.use(auth);

function currentUserId(req) {
  return req.user?.userId || req.user?.id || null;
}

// Initialize web-push with VAPID keys
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidEmail = process.env.VAPID_EMAIL || 'admin@tubep.vn';

if (webpush && vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);
}

// ═══════════════════════════════════════════════════════════════════════════
// GET /push/vapid-key — Return public VAPID key for frontend
// ═══════════════════════════════════════════════════════════════════════════
r.get('/vapid-key', async (req, res) => {
  try {
    if (!vapidPublicKey) {
      return res.status(503).json({ error: 'Web push not configured' });
    }
    res.json({ vapidPublicKey });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /push/subscribe — Register push subscription
// ═══════════════════════════════════════════════════════════════════════════
r.post('/subscribe', async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Invalid subscription' });
    }

    const uid = currentUserId(req);
    if (!uid) return res.status(401).json({ error: 'Token không có user id' });

    const { data, error } = await supabase.from('push_subscriptions').upsert({
      user_id: uid,
      endpoint: subscription.endpoint,
      keys_p256dh: subscription.keys?.p256dh,
      keys_auth: subscription.keys?.auth,
    }).select().single();

    if (error) throw error;

    res.json({ ok: true, subscription: data });
  } catch (e) {
    console.error('Push subscribe error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /push/unsubscribe — Remove push subscription
// ═══════════════════════════════════════════════════════════════════════════
r.post('/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) {
      return res.status(400).json({ error: 'Missing endpoint' });
    }

    const uid = currentUserId(req);
    if (!uid) return res.status(401).json({ error: 'Token không có user id' });

    await supabase.from('push_subscriptions')
      .delete()
      .eq('user_id', uid)
      .eq('endpoint', endpoint);

    res.json({ ok: true });
  } catch (e) {
    console.error('Push unsubscribe error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /push/preferences — Get user notification preferences
// ═══════════════════════════════════════════════════════════════════════════
r.get('/preferences', async (req, res) => {
  try {
    const uid = currentUserId(req);
    if (!uid) {
      return res.json({ ...DEFAULT_PREFS });
    }

    let { data, error } = await supabase.from('notification_preferences')
      .select('*')
      .eq('user_id', uid)
      .single();

    if (error && error.code === 'PGRST116') {
      // Not found, create default
      const { data: newPrefs, error: insErr } = await supabase.from('notification_preferences')
        .insert({ user_id: uid })
        .select()
        .single();
      if (insErr) throw insErr;
      return res.json(newPrefs);
    }

    if (error) throw error;
    res.json({ ...DEFAULT_PREFS, ...data });
  } catch (e) {
    console.error('Get preferences error:', e.message);
    res.json({ ...DEFAULT_PREFS });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /push/preferences — Update user notification preferences
// ═══════════════════════════════════════════════════════════════════════════
r.put('/preferences', async (req, res) => {
  try {
    const uid = currentUserId(req);
    if (!uid) {
      return res.json({ success: true, message: 'Preferences saved (default)' });
    }

    const allowed = [
      'browser_push', 'sound',
      'task_assigned', 'task_completed', 'deadline_warning', 'comment_added',
      'stage_changed', 'deal_won', 'approval_request', 'checklist_completed',
      'lead_assigned', 'order_confirmed', 'invoice_overdue',
      'lead_new', 'deal_new', 'production_deadlines', 'crm_lead_deadlines', 'logistics_deadlines',
      'project_notifications',
    ];

    const update = { updated_at: new Date().toISOString() };
    allowed.forEach(f => {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    });

    // Upsert: create if not exists, update if exists
    const { data, error } = await supabase.from('notification_preferences')
      .upsert({
        user_id: uid,
        ...update,
      })
      .select()
      .single();

    if (error) throw error;
    invalidateNotificationPrefsCache(uid);
    res.json({ ...DEFAULT_PREFS, ...data });
  } catch (e) {
    console.error('Update preferences error:', e.message);
    // Graceful fallback if table doesn't exist
    res.json({ success: true, message: 'Preferences saved (default)' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Send web push to user
// ═══════════════════════════════════════════════════════════════════════════
async function sendWebPush(userId, notification) {
  try {
    if (!vapidPublicKey || !vapidPrivateKey) {
      console.log('Web push not configured, skipping');
      return;
    }

    if (isExpiryDeadlineNotificationType(notification?.type)) return;

    // Get user subscriptions
    const { data: subscriptions } = await supabase.from('push_subscriptions')
      .select('*')
      .eq('user_id', userId);

    if (!subscriptions?.length) return;

    // Get user preferences
    const { data: prefsRow } = await supabase.from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    const prefs = { ...DEFAULT_PREFS, ...(prefsRow || {}) };

    if (!prefs?.browser_push) return; // User disabled browser push

    if (!isNotificationTypeAllowed(prefs, notification.type, notification.entity_type, notification.metadata)) return;

    // Send to each subscription
    const payload = JSON.stringify({
      title: notification.title,
      message: notification.message,
      tag: notification.type,
      url: `/notifications?entity=${notification.entity_type}&id=${notification.entity_id}`,
    });

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.keys_p256dh,
            auth: sub.keys_auth,
          },
        }, payload);
      } catch (pushErr) {
        if (pushErr.statusCode === 410) {
          // Subscription expired, remove it
          await supabase.from('push_subscriptions')
            .delete()
            .eq('id', sub.id);
        }
        console.warn('Web push error:', pushErr.message);
      }
    }
  } catch (e) {
    console.error('Send web push error:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GET /push/status — Trạng thái push (bảng DB, FCM, token của user)
// ═══════════════════════════════════════════════════════════════════════════
r.get('/status', async (req, res) => {
  try {
    const uid = currentUserId(req);
    if (!uid) return res.status(401).json({ error: 'Token không có user id' });
    const { getPushInfraStatus } = require('../services/pushSender');
    const status = await getPushInfraStatus(uid);
    res.json({
      ok: status.tableOk && status.fcmConfigured,
      ...status,
      hint: !status.tableOk
        ? 'Chạy NOTIFY pgrst, \'reload schema\'; trên Supabase SQL Editor (bảng có nhưng API chưa reload cache)'
        : !status.fcmConfigured
          ? 'Backend thiếu FCM_SA_JSON (Render Environment)'
          : status.tokens.fcm === 0
            ? 'App chưa đăng ký FCM token — mở app, đăng nhập lại, cấp quyền thông báo'
            : null,
    });
  } catch (e) {
    console.error('GET /push/status:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /push/device-token — Đăng ký token Expo/FCM/APNs (mobile)
// ═══════════════════════════════════════════════════════════════════════════
r.post('/device-token', async (req, res) => {
  try {
    const uid = currentUserId(req);
    if (!uid) return res.status(401).json({ error: 'Token không có user id' });

    const token = String(req.body?.token || '').trim();
    const platform = String(req.body?.platform || 'expo').trim().toLowerCase();
    const deviceId = req.body?.device_id != null ? String(req.body.device_id).trim() : null;

    if (!token) return res.status(400).json({ error: 'Thiếu token' });
    if (!['expo', 'fcm', 'apns'].includes(platform)) {
      return res.status(400).json({ error: 'platform phải là expo, fcm hoặc apns' });
    }

    const { data, error } = await supabase.from('push_device_tokens').upsert(
      {
        user_id: uid,
        token,
        platform,
        device_id: deviceId || null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,token' },
    ).select('id, platform, last_seen_at').single();

    if (error) {
      if (isRestTableMissingError(error)) {
        const { upsertDeviceTokenPg } = require('../helpers/pushDeviceTokensPg');
        const row = await upsertDeviceTokenPg(uid, token, platform, deviceId);
        if (row) return res.json({ ok: true, registration: row });
        return res.status(503).json({
          error: 'PostgREST chưa thấy bảng push_device_tokens — chạy NOTIFY pgrst, \'reload schema\'; hoặc thêm SUPABASE_DB_URL trên server',
        });
      }
      throw error;
    }
    res.json({ ok: true, registration: data });
  } catch (e) {
    console.error('POST /push/device-token:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE /push/device-token — Gỡ token khi logout
// ═══════════════════════════════════════════════════════════════════════════
r.delete('/device-token', async (req, res) => {
  try {
    const uid = currentUserId(req);
    if (!uid) return res.status(401).json({ error: 'Token không có user id' });
    const token = String(req.body?.token || req.query?.token || '').trim();
    if (!token) return res.status(400).json({ error: 'Thiếu token' });

    await supabase.from('push_device_tokens').delete().eq('user_id', uid).eq('token', token);
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /push/device-token:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /push/call-reject — Từ chối cuộc gọi từ native (app kill, không có socket)
// ═══════════════════════════════════════════════════════════════════════════
r.post('/call-reject', async (req, res) => {
  try {
    const uid = currentUserId(req);
    if (!uid) return res.status(401).json({ error: 'Token không có user id' });

    const callId = String(req.body?.callId || req.body?.call_id || '').trim();
    const toUserId = String(req.body?.toUserId || req.body?.to_user_id || '').trim();
    if (!callId || !toUserId) {
      return res.status(400).json({ error: 'Thiếu callId hoặc toUserId' });
    }

    const io = req.app.get('io');
    // Finalize log + dọn session giống socket handler `call:reject` — nếu không, khi app bị
    // kill và từ chối qua REST sẽ chỉ tắt UI caller mà không ghi "cuộc gọi bị từ chối" và
    // session vẫn treo trong activeDirectCalls (gây hiện lại cuộc gọi khi mở app).
    const activeDirectCalls = req.app.get('activeDirectCalls');
    const finalizeDirectCallLog = req.app.get('finalizeDirectCallLog');
    if (io && activeDirectCalls && finalizeDirectCallLog) {
      const session = activeDirectCalls.get(callId);
      if (session && !session.logged) {
        session.logged = true;
        activeDirectCalls.delete(callId);
        void finalizeDirectCallLog(io, session, { endedByUserId: uid, reason: 'rejected' });
      }
    }
    if (io) {
      io.to(`user:${toUserId}`).emit('call:rejected', { callId, reason: 'rejected' });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('POST /push/call-reject:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /push/call-accept — Nhận cuộc gọi từ native (app kill / chưa có socket)
// Set answeredAt ngay để syncPendingIncomingCalls KHÔNG reo lại + báo caller.
// ═══════════════════════════════════════════════════════════════════════════
r.post('/call-accept', async (req, res) => {
  try {
    const uid = currentUserId(req);
    if (!uid) return res.status(401).json({ error: 'Token không có user id' });

    const callId = String(req.body?.callId || req.body?.call_id || '').trim();
    const toUserId = String(req.body?.toUserId || req.body?.to_user_id || '').trim();
    if (!callId || !toUserId) {
      return res.status(400).json({ error: 'Thiếu callId hoặc toUserId' });
    }

    const io = req.app.get('io');
    const activeDirectCalls = req.app.get('activeDirectCalls');
    // Đánh dấu đã nhận để vòng đời tiến trình có chết/khởi động lại thì server cũng KHÔNG
    // re-emit call:incoming (syncPendingIncomingCalls bỏ qua session có answeredAt).
    if (activeDirectCalls) {
      const session = activeDirectCalls.get(callId);
      if (session && !session.answeredAt) session.answeredAt = Date.now();
    }
    if (io) {
      io.to(`user:${toUserId}`).emit('call:accepted', { callId });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('POST /push/call-accept:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;
module.exports.sendWebPush = sendWebPush;
