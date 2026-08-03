const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { restMarkCallAnswered, restRejectCall } = require('../realtime/callSignaling');
const { isNotificationTypeAllowed } = require('../helpers/notificationPrefTypes');
const { DEFAULT_PREFS, invalidateNotificationPrefsCache } = require('../helpers/notificationPrefsUser');
const { isExpiryDeadlineNotificationType } = require('../helpers/notificationOperationalFilter');
const { isRestTableMissingError } = require('../helpers/pushDeviceTokensPg');
const { isAdminLike, hasCompanyId } = require('../helpers/adminRole');
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
      'comment_show_on_screen',
      'stage_changed', 'deal_won', 'approval_request', 'checklist_completed',
      'lead_assigned', 'order_confirmed', 'invoice_overdue',
      'lead_new', 'deal_new', 'production_deadlines', 'crm_lead_deadlines', 'logistics_deadlines',
      'project_notifications',
    ];

    const update = { updated_at: new Date().toISOString() };
    allowed.forEach(f => {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    });
    // Hiển thị BL trên màn hình do admin chọn NV — user thường không tự đổi
    if (update.comment_show_on_screen !== undefined && !isAdminLike(req.user)) {
      delete update.comment_show_on_screen;
    }

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

function resolveCommentDisplayCompanyId(req) {
  const fromBody = req.body?.company_id;
  const fromQuery = req.query?.company_id;
  const requested = fromBody != null && String(fromBody).trim() !== ''
    ? String(fromBody).trim()
    : (fromQuery != null && String(fromQuery).trim() !== '' ? String(fromQuery).trim() : null);
  if (hasCompanyId(req.user)) {
    const own = String(req.user.company_id).trim();
    if (requested && requested !== own) return { error: 'Chỉ cấu hình trong phạm vi công ty của bạn', status: 403 };
    return { companyId: own };
  }
  if (!requested) return { error: 'Thiếu company_id', status: 400 };
  return { companyId: requested };
}

async function listActiveUsersForCompany(companyId) {
  // Phần lớn NV gắn công ty qua departments.company_id (users.company_id thường null).
  const { data: depts, error: deptErr } = await supabase
    .from('departments')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_active', true);
  if (deptErr) throw deptErr;
  const deptIds = (depts || []).map((d) => d.id);

  const byId = new Map();
  const cols = 'id, full_name, email, avatar, role, position, department_id, is_active';

  if (deptIds.length) {
    const { data: viaDept, error } = await supabase
      .from('users')
      .select(cols)
      .in('department_id', deptIds)
      .neq('is_active', false)
      .order('full_name', { ascending: true });
    if (error) throw error;
    for (const u of viaDept || []) byId.set(String(u.id), u);
  }

  const { data: viaCompany, error: coErr } = await supabase
    .from('users')
    .select(cols)
    .eq('company_id', companyId)
    .neq('is_active', false)
    .order('full_name', { ascending: true });
  if (coErr) throw coErr;
  for (const u of viaCompany || []) byId.set(String(u.id), u);

  return [...byId.values()].sort((a, b) =>
    String(a.full_name || '').localeCompare(String(b.full_name || ''), 'vi'),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// GET /push/comment-display-users — Admin: danh sách NV + trạng thái hiện BL trên màn hình
// ═══════════════════════════════════════════════════════════════════════════
r.get('/comment-display-users', async (req, res) => {
  try {
    if (!isAdminLike(req.user)) {
      return res.status(403).json({ error: 'Cần quyền quản trị' });
    }
    const resolved = resolveCommentDisplayCompanyId(req);
    if (resolved.error) return res.status(resolved.status).json({ error: resolved.error });
    const { companyId } = resolved;

    const users = await listActiveUsersForCompany(companyId);
    const ids = users.map((u) => u.id);
    let prefsByUser = {};
    if (ids.length) {
      const { data: prefs, error: prefsErr } = await supabase
        .from('notification_preferences')
        .select('user_id, comment_show_on_screen')
        .in('user_id', ids);
      if (prefsErr) throw prefsErr;
      prefsByUser = Object.fromEntries((prefs || []).map((p) => [p.user_id, p.comment_show_on_screen !== false]));
    }

    res.json({
      company_id: companyId,
      users: users.map((u) => ({
        id: u.id,
        full_name: u.full_name,
        email: u.email,
        avatar: u.avatar,
        role: u.role,
        position: u.position,
        comment_show_on_screen: prefsByUser[u.id] !== false,
      })),
    });
  } catch (e) {
    console.error('Get comment-display-users error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /push/comment-display-users — Admin: chọn NV được hiện bình luận trên màn hình
// Body: { company_id?, user_ids: string[] }
// ═══════════════════════════════════════════════════════════════════════════
r.put('/comment-display-users', async (req, res) => {
  try {
    if (!isAdminLike(req.user)) {
      return res.status(403).json({ error: 'Cần quyền quản trị' });
    }
    const resolved = resolveCommentDisplayCompanyId(req);
    if (resolved.error) return res.status(resolved.status).json({ error: resolved.error });
    const { companyId } = resolved;

    const userIds = Array.isArray(req.body?.user_ids)
      ? [...new Set(req.body.user_ids.map((id) => String(id)).filter(Boolean))]
      : null;
    if (!userIds) {
      return res.status(400).json({ error: 'Thiếu user_ids (mảng)' });
    }

    const users = await listActiveUsersForCompany(companyId);
    const allowed = new Set(users.map((u) => String(u.id)));
    const enabledIds = userIds.filter((id) => allowed.has(id));
    const disabledIds = users.map((u) => String(u.id)).filter((id) => !enabledIds.includes(id));
    const now = new Date().toISOString();

    const upsertRows = [
      ...enabledIds.map((user_id) => ({
        user_id,
        comment_show_on_screen: true,
        updated_at: now,
      })),
      ...disabledIds.map((user_id) => ({
        user_id,
        comment_show_on_screen: false,
        updated_at: now,
      })),
    ];

    if (upsertRows.length) {
      const { error } = await supabase.from('notification_preferences').upsert(upsertRows, { onConflict: 'user_id' });
      if (error) throw error;
      for (const row of upsertRows) invalidateNotificationPrefsCache(row.user_id);
    }

    res.json({
      ok: true,
      company_id: companyId,
      enabled_count: enabledIds.length,
      disabled_count: disabledIds.length,
      user_ids: enabledIds,
    });
  } catch (e) {
    console.error('Update comment-display-users error:', e.message);
    res.status(500).json({ error: e.message });
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
    const rawAppKey = req.body?.app_key != null ? String(req.body.app_key).trim() : '';
    const appKey = rawAppKey || null;

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
        app_key: appKey,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,token' },
    ).select('id, platform, app_key, last_seen_at').single();

    if (error) {
      // Cột app_key chưa migrate — upsert không app_key để không chặn đăng ký.
      const missingAppKey = /app_key/i.test(String(error.message || error.code || ''));
      if (missingAppKey) {
        const retry = await supabase.from('push_device_tokens').upsert(
          {
            user_id: uid,
            token,
            platform,
            device_id: deviceId || null,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,token' },
        ).select('id, platform, last_seen_at').single();
        if (!retry.error) return res.json({ ok: true, registration: retry.data, warning: 'app_key column missing' });
      }
      if (isRestTableMissingError(error)) {
        const { upsertDeviceTokenPg } = require('../helpers/pushDeviceTokensPg');
        const row = await upsertDeviceTokenPg(uid, token, platform, deviceId, appKey);
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
    const finalizeDirectCallLog = req.app.get('finalizeDirectCallLog');
    await restRejectCall(io, null, finalizeDirectCallLog, callId, uid, toUserId);
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
    await restMarkCallAnswered(io, null, callId, uid, toUserId);
    res.json({ ok: true });
  } catch (e) {
    console.error('POST /push/call-accept:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;
module.exports.sendWebPush = sendWebPush;
