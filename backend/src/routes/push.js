const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');
let webpush;
try { webpush = require('web-push'); } catch { webpush = null; }

const r = Router();
r.use(auth);

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

    const { data, error } = await supabase.from('push_subscriptions').upsert({
      user_id: req.user.userId,
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

    await supabase.from('push_subscriptions')
      .delete()
      .eq('user_id', req.user.userId)
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
    let { data, error } = await supabase.from('notification_preferences')
      .select('*')
      .eq('user_id', req.user.userId)
      .single();

    if (error && error.code === 'PGRST116') {
      // Not found, create default
      const { data: newPrefs } = await supabase.from('notification_preferences')
        .insert({ user_id: req.user.userId })
        .select()
        .single();
      return res.json(newPrefs);
    }

    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('Get preferences error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /push/preferences — Update user notification preferences
// ═══════════════════════════════════════════════════════════════════════════
r.put('/preferences', async (req, res) => {
  try {
    const allowed = [
      'browser_push', 'sound',
      'task_assigned', 'task_completed', 'deadline_warning', 'comment_added',
      'stage_changed', 'deal_won', 'approval_request', 'checklist_completed',
      'lead_assigned', 'order_confirmed', 'invoice_overdue'
    ];

    const update = { updated_at: new Date().toISOString() };
    allowed.forEach(f => {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    });

    // Upsert: create if not exists, update if exists
    const { data, error } = await supabase.from('notification_preferences')
      .upsert({
        user_id: req.user.userId,
        ...update,
      })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('Update preferences error:', e);
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

    // Get user subscriptions
    const { data: subscriptions } = await supabase.from('push_subscriptions')
      .select('*')
      .eq('user_id', userId);

    if (!subscriptions?.length) return;

    // Get user preferences
    const { data: prefs } = await supabase.from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!prefs?.browser_push) return; // User disabled browser push

    // Check notification type preference
    const typePrefs = {
      'task_assigned': prefs.task_assigned,
      'task_completed': prefs.task_completed,
      'deadline_warning': prefs.deadline_warning,
      'comment_added': prefs.comment_added,
      'stage_changed': prefs.stage_changed,
      'deal_won': prefs.deal_won,
      'approval_request': prefs.approval_request,
      'checklist_completed': prefs.checklist_completed,
      'lead_assigned': prefs.lead_assigned,
      'order_confirmed': prefs.order_confirmed,
      'invoice_overdue': prefs.invoice_overdue,
    };

    if (typePrefs[notification.type] === false) return;

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

module.exports = r;
module.exports.sendWebPush = sendWebPush;
