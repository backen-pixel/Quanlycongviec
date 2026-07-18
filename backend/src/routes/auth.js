const { Router } = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabase } = require('../config/supabase');
const config = require('../config');
const { auth } = require('../middleware/auth');
const { logAuthEvent } = require('../helpers/authEventLog');
const { buildAuthSessionForUser } = require('../helpers/authSession');
const { assertTenantActive } = require('../helpers/tenantScope');
const {
  getGoogleLoginClientId,
  isGoogleLoginEnabled,
  verifyGoogleIdToken,
} = require('../helpers/googleAuth');
const {
  provisionGoogleFreeSignup,
  findBlockingPendingPurchase,
  provisionPurchase,
} = require('../helpers/saasProvision');
const {
  createQrSession, parseQrText, confirmQrSession, consumeSessionAuth,
  getSessionPublicInfo, targetLabel, deviceFromReq,
} = require('../helpers/qrLoginSessions');
const { createNotification } = require('../helpers/notifications');
const {
  assertLoginAllowed,
  recordLoginFailure,
  clearLoginFailures,
} = require('../helpers/loginLockout');

const r = Router();

async function notifyQrDeviceLogin(req, userId, { target, loginDevice, confirmerDevice }) {
  if (!userId || !req) return;
  const loginName = loginDevice?.device_name || targetLabel(target);
  const confirmerName = confirmerDevice?.device_name || 'thiết bị đã đăng nhập';
  const title = 'Đăng nhập QR — thiết bị mới';
  const message = `${loginName} vừa đăng nhập qua QR (${targetLabel(target)}). Xác nhận từ ${confirmerName}.`;

  void createNotification(
    req,
    userId,
    'device_qr_login',
    title,
    message,
    'device',
    String(userId),
    {
      nav_url: '/settings/devices',
      target,
      login_device: loginDevice,
      confirmer_device: confirmerDevice,
    },
  );

  const io = req.app?.get('io');
  io?.to(`user:${userId}`).emit('qr-login:completed', {
    target,
    loginDevice,
    confirmerDevice,
    message,
  });
}

function emitQrLoginPayload(io, sessionId, payload) {
  io?.to(`qr:${sessionId}`).emit('qr-login:confirmed', { sessionId, ...payload });
}

// Đăng nhập
r.post('/login', async (req, res) => {
  try {
    const emailTrim = String(req.body.email || '').trim();
    const { password } = req.body;
    const clientSessionId = req.body?.session_id ? String(req.body.session_id).slice(0, 80) : null;
    if (!emailTrim || !password) {
      void logAuthEvent({ event: 'login_failed', email: emailTrim || null, reason: 'missing_credentials', req });
      return res.status(400).json({ error: 'Thiếu email/mật khẩu' });
    }

    const lock = assertLoginAllowed(req, emailTrim);
    if (!lock.ok) {
      res.set('Retry-After', String(lock.retryAfterSec));
      void logAuthEvent({ event: 'login_failed', email: emailTrim, reason: 'locked_out', req });
      return res.status(429).json({
        error: lock.error,
        code: 'login_locked',
        retry_after_sec: lock.retryAfterSec,
      });
    }

    const { data } = await supabase.from('users').select('*').eq('email', emailTrim).neq('is_active', false).limit(1);
    if (!data?.length) {
      const fail = recordLoginFailure(req, emailTrim);
      void logAuthEvent({ event: 'login_failed', email: emailTrim, reason: 'user_not_found_or_disabled', req });
      if (fail.banned) {
        res.set('Retry-After', String(fail.retryAfterSec));
        return res.status(429).json({
          error: `Quá nhiều lần đăng nhập sai. Thử lại sau ${fail.retryAfterSec}s.`,
          code: 'login_locked',
          retry_after_sec: fail.retryAfterSec,
        });
      }
      return res.status(401).json({ error: 'Sai email hoặc mật khẩu' });
    }

    const user = data[0];
    if (!(await bcrypt.compare(password, user.password))) {
      const fail = recordLoginFailure(req, emailTrim);
      void logAuthEvent({ event: 'login_failed', email: emailTrim, user_id: user.id, reason: 'wrong_password', req });
      if (fail.banned) {
        res.set('Retry-After', String(fail.retryAfterSec));
        return res.status(429).json({
          error: `Quá nhiều lần đăng nhập sai. Thử lại sau ${fail.retryAfterSec}s.`,
          code: 'login_locked',
          retry_after_sec: fail.retryAfterSec,
        });
      }
      return res.status(401).json({ error: 'Sai email hoặc mật khẩu' });
    }

    if (user.tenant_id && String(user.role || '').trim().toLowerCase() !== 'platform_admin') {
      const tenantCheck = await assertTenantActive(user.tenant_id);
      if (!tenantCheck.ok) {
        void logAuthEvent({
          event: 'login_failed',
          email: emailTrim,
          user_id: user.id,
          reason: 'tenant_inactive',
          req,
        });
        return res.status(403).json({ error: tenantCheck.error, code: 'tenant_inactive' });
      }
    }

    clearLoginFailures(req, emailTrim);
    await supabase.from('users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id);
    const sessionId = clientSessionId || `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    void logAuthEvent({
      event: 'login_success',
      user_id: user.id,
      email: user.email,
      session_id: sessionId,
      reason: 'password',
      req,
    });
    const auth = await buildAuthSessionForUser(user, { sessionId });
    res.json(auth);
  } catch (e) {
    console.error(e);
    void logAuthEvent({ event: 'login_failed', email: req.body?.email || null, reason: 'server_error', req });
    res.status(500).json({ error: 'Lỗi server' });
  }
});

/** Cấu hình Google Sign-In (client id công khai) */
r.get('/google-config', (_req, res) => {
  const clientId = getGoogleLoginClientId();
  res.json({ enabled: isGoogleLoginEnabled(), clientId: clientId || null });
});

/** Lấy email/tên từ Google — dùng khi đăng ký gói (không đăng nhập) */
r.post('/google-profile', async (req, res) => {
  try {
    const idToken = String(req.body.credential || req.body.id_token || '').trim();
    if (!idToken) return res.status(400).json({ error: 'Thiếu token Google' });
    const payload = await verifyGoogleIdToken(idToken);
    const email = String(payload.email || '').trim().toLowerCase();
    res.json({
      email,
      full_name: payload.name || payload.given_name || '',
      picture: payload.picture || null,
      google_id: payload.sub,
    });
  } catch (e) {
    const status = e.code === 'google_not_configured' ? 503 : 401;
    res.status(status).json({ error: e.message || 'Google xác minh thất bại' });
  }
});

/** Đăng nhập bằng Google ID token */
r.post('/google', async (req, res) => {
  try {
    const idToken = String(req.body.credential || req.body.id_token || '').trim();
    if (!idToken) {
      return res.status(400).json({ error: 'Thiếu token Google' });
    }

    // Khóa theo IP trước khi verify token (tránh flood verify Google)
    const preLock = assertLoginAllowed(req, '_google');
    if (!preLock.ok) {
      res.set('Retry-After', String(preLock.retryAfterSec));
      return res.status(429).json({
        error: preLock.error,
        code: 'login_locked',
        retry_after_sec: preLock.retryAfterSec,
      });
    }

    const payload = await verifyGoogleIdToken(idToken);
    const email = String(payload.email || '').trim().toLowerCase();
    const googleId = payload.sub;
    const fullName = payload.name || payload.given_name || email.split('@')[0];

    const emailLock = assertLoginAllowed(req, email);
    if (!emailLock.ok) {
      res.set('Retry-After', String(emailLock.retryAfterSec));
      return res.status(429).json({
        error: emailLock.error,
        code: 'login_locked',
        retry_after_sec: emailLock.retryAfterSec,
      });
    }

    let user = null;
    const { data: byGoogle } = await supabase
      .from('users')
      .select('*')
      .eq('google_id', googleId)
      .neq('is_active', false)
      .maybeSingle();
    user = byGoogle;

    if (!user) {
      const { data: rows } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .neq('is_active', false)
        .limit(1);
      user = rows?.[0] || null;
    }

    if (!user) {
      const blocking = await findBlockingPendingPurchase(email);
      if (blocking) {
        return res.status(403).json({
          error: 'Đơn mua gói trả phí đang chờ thanh toán. Hoàn tất thanh toán hoặc huỷ đơn trước khi đăng ký Free bằng Google.',
          code: 'account_pending',
          purchase_id: blocking.id,
        });
      }

      const { data: openPurchase } = await supabase
        .from('saas_purchases')
        .select('id, status, amount, payment_status')
        .eq('buyer_email', email)
        .in('status', ['pending', 'processing'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (openPurchase) {
        try {
          const prov = await provisionPurchase(openPurchase.id, {
            skipWelcomeEmail: true,
            provisionedBy: 'google_signup',
          });
          const uid = prov.adminUser?.id || prov.purchase?.user_id;
          if (uid) {
            const { data: provisionedUser } = await supabase.from('users').select('*').eq('id', uid).maybeSingle();
            user = provisionedUser;
          }
        } catch (provErr) {
          console.warn('[auth/google] provision open purchase:', provErr.message);
        }
      }

      if (!user) {
        const planId = String(req.body.plan_id || '').trim().toLowerCase();
        if (!planId) {
          void logAuthEvent({ event: 'login_failed', email, reason: 'plan_required', req });
          return res.status(400).json({
            error: 'Vui lòng chọn gói trước khi đăng ký. Truy cập trang Modules để chọn gói.',
            code: 'plan_required',
          });
        }
        if (planId !== 'free') {
          void logAuthEvent({ event: 'login_failed', email, reason: 'plan_purchase_required', req });
          return res.status(400).json({
            error: 'Gói trả phí cần hoàn tất mua gói trước. Đăng ký trên trang Modules với cùng email Google.',
            code: 'plan_purchase_required',
          });
        }
        try {
          const signup = await provisionGoogleFreeSignup({
            email,
            googleId,
            fullName,
            picture: payload.picture,
            planId,
          });
          user = signup.user;
          void logAuthEvent({
            event: 'google_free_signup',
            user_id: user.id,
            email,
            reason: 'free_plan',
            req,
          });
        } catch (signupErr) {
          console.error('[auth/google] free signup:', signupErr.message);
          void logAuthEvent({ event: 'login_failed', email, reason: 'google_free_signup_failed', req });
          return res.status(500).json({
            error: signupErr.message || 'Không tạo được tài khoản Free',
            code: 'signup_failed',
          });
        }
      } else {
        const linkPatch = {
          google_id: googleId,
          auth_provider: user.password ? 'both' : 'google',
          updated_at: new Date().toISOString(),
        };
        if (payload.picture && !user.avatar) linkPatch.avatar = payload.picture;
        await supabase.from('users').update(linkPatch).eq('id', user.id);
        user = { ...user, ...linkPatch };
      }
    }

    if (user.tenant_id && String(user.role || '').trim().toLowerCase() !== 'platform_admin') {
      const tenantCheck = await assertTenantActive(user.tenant_id);
      if (!tenantCheck.ok) {
        return res.status(403).json({ error: tenantCheck.error, code: 'tenant_inactive' });
      }
    }

    const linkPatch = { updated_at: new Date().toISOString() };
    if (!user.google_id) {
      linkPatch.google_id = googleId;
      linkPatch.auth_provider = user.password ? 'both' : 'google';
    }
    if (!user.full_name && fullName) linkPatch.full_name = fullName;
    if (Object.keys(linkPatch).length > 1) {
      await supabase.from('users').update(linkPatch).eq('id', user.id);
      user = { ...user, ...linkPatch };
    }

    await supabase.from('users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id);
    clearLoginFailures(req, email);
    clearLoginFailures(req, '_google');
    const sessionId = req.body?.session_id
      ? String(req.body.session_id).slice(0, 80)
      : `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    void logAuthEvent({
      event: 'login_success',
      user_id: user.id,
      email: user.email,
      session_id: sessionId,
      reason: 'google',
      req,
    });
    const auth = await buildAuthSessionForUser(user, { sessionId });
    res.json(auth);
  } catch (e) {
    console.error('[auth/google]', e.message);
    recordLoginFailure(req, '_google');
    void logAuthEvent({ event: 'login_failed', reason: e.code || 'google_error', req });
    const status = e.code === 'google_not_configured' ? 503 : 401;
    res.status(status).json({ error: e.message || 'Google login thất bại' });
  }
});

// ─── QR đăng nhập chéo web ↔ app ───

/** Thiết bị cần đăng nhập tạo phiên QR (không cần auth) — dùng cho đăng nhập web. */
r.post('/qr/create', async (req, res) => {
  try {
    const target = req.body?.target === 'app' ? 'app' : 'web';
    const created = createQrSession(target);
    res.json(created);
  } catch (e) {
    console.error('[auth/qr/create]', e);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

/**
 * Web đã đăng nhập tạo mã QR để app quét (target=app).
 * Phiên được xác nhận ngay bằng tài khoản web — app chỉ cần quét rồi poll token.
 */
r.post('/qr/create-invite', auth, async (req, res) => {
  try {
    const target = req.body?.target === 'web' ? 'web' : 'app';
    const confirmerId = req.user?.userId || req.user?.id;
    if (!confirmerId) return res.status(401).json({ error: 'Chưa đăng nhập' });

    const created = createQrSession(target);
    const result = await confirmQrSession(created.sessionId, confirmerId, req, req.body || {});
    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    res.json({
      sessionId: created.sessionId,
      qrText: created.qrText,
      expiresAt: created.expiresAt,
      target,
      confirmerDevice: result.session.confirmerDevice || deviceFromReq(req, req.body || {}),
    });
  } catch (e) {
    console.error('[auth/qr/create-invite]', e);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

/** Poll trạng thái — nhận token một lần khi đã xác nhận. */
r.get('/qr/:sessionId/status', async (req, res) => {
  try {
    const sessionId = String(req.params.sessionId || '').trim();
    if (!sessionId) return res.status(400).json({ error: 'Thiếu mã phiên' });
    const result = consumeSessionAuth(sessionId, req, {
      device_name: req.query?.device_name,
      platform: req.query?.platform,
    });
    if (result.status === 'confirmed') {
      const io = req.app.get('io');
      emitQrLoginPayload(io, sessionId, {
        token: result.token,
        user: result.user,
        session_id: result.session_id,
        loginDevice: result.loginDevice,
        confirmerDevice: result.confirmerDevice,
        qrTarget: result.qrTarget,
      });
      const uid = result.user?.id || result.user?.userId;
      void notifyQrDeviceLogin(req, uid, {
        target: result.qrTarget,
        loginDevice: result.loginDevice,
        confirmerDevice: result.confirmerDevice,
      });
    }
    res.json(result);
  } catch (e) {
    console.error('[auth/qr/status]', e);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

/** Theo dõi phiên QR (web đã đăng nhập — không tiêu thụ token). */
r.get('/qr/:sessionId/info', auth, async (req, res) => {
  try {
    const sessionId = String(req.params.sessionId || '').trim();
    if (!sessionId) return res.status(400).json({ error: 'Thiếu mã phiên' });
    res.json(getSessionPublicInfo(sessionId));
  } catch (e) {
    console.error('[auth/qr/info]', e);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

/** Thiết bị đã đăng nhập quét QR và xác nhận đăng nhập thiết bị kia. */
r.post('/qr/confirm', auth, async (req, res) => {
  try {
    let sessionId = req.body?.sessionId ? String(req.body.sessionId).trim() : '';
    if (!sessionId && req.body?.qrText) {
      const parsed = parseQrText(String(req.body.qrText));
      if (parsed) sessionId = parsed.sessionId;
    }
    if (!sessionId) return res.status(400).json({ error: 'Thiếu mã QR' });

    const confirmerId = req.user?.userId || req.user?.id;
    const result = await confirmQrSession(sessionId, confirmerId, req, req.body || {});
    if (result.error) return res.status(result.status || 400).json({ error: result.error });

    const io = req.app.get('io');
    emitQrLoginPayload(io, sessionId, {
      token: result.auth.token,
      user: result.auth.user,
      session_id: result.auth.session_id,
      confirmerDevice: result.session.confirmerDevice,
      qrTarget: result.session.target,
    });

    const confirmerDevice = result.session.confirmerDevice || deviceFromReq(req, req.body || {});
    res.json({
      ok: true,
      target: result.session.target,
      targetLabel: targetLabel(result.session.target),
      sessionId,
      confirmerDevice,
      message: `Đã xác nhận đăng nhập ${targetLabel(result.session.target)}. Thiết bị đích sẽ nhận phiên trong giây lát.`,
    });
  } catch (e) {
    console.error('[auth/qr/confirm]', e);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// Đăng xuất: client gọi trước khi xoá token để audit chính xác (kèm reason, session_id).
//   Body (optional): { reason: 'manual'|'midnight'|'idle'|'forced', session_id }
//   Yêu cầu auth — nhưng nếu token đã hết hạn vẫn cho POST với body { email, reason } để log session_expired.
r.post('/logout', auth, async (req, res) => {
  try {
    const reason = req.body?.reason ? String(req.body.reason).slice(0, 60) : 'manual';
    const event = reason === 'midnight' ? 'auto_logout_midnight'
      : reason === 'expired' ? 'session_expired'
      : 'logout';
    await logAuthEvent({
      event,
      user_id: req.user?.userId || null,
      email: req.user?.email || null,
      session_id: req.body?.session_id || null,
      reason,
      metadata: req.body?.ms_session_duration
        ? { ms_session_duration: Number(req.body.ms_session_duration) || null }
        : null,
      req,
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('[auth/logout]', e);
    res.json({ ok: true }); // không chặn client logout
  }
});

// Đăng ký
r.post('/register', async (req, res) => {
  try {
    const { email, password, full_name, phone, role } = req.body;
    if (!email || !password || !full_name) return res.status(400).json({ error: 'Thiếu thông tin' });
    const { data: ex } = await supabase.from('users').select('id').eq('email', email).limit(1);
    if (ex?.length) return res.status(409).json({ error: 'Email đã tồn tại' });
    const hash = await bcrypt.hash(password, 12);
    const { data, error } = await supabase.from('users').insert({ email, password: hash, full_name, phone, role: role || 'staff' }).select('id,email,full_name,role').single();
    if (error) throw error;
    res.status(201).json({ user: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi server' }); }
});

// Reset password cho tất cả seed users (gọi 1 lần rồi xóa)
r.post('/reset-seed-passwords', async (req, res) => {
  try {
    const seedEmails = ['admin@tubep.vn','sales@tubep.vn','designer@tubep.vn','production@tubep.vn','installer@tubep.vn','manager@tubep.vn'];
    const hash = await bcrypt.hash('admin123', 12);
    const { error } = await supabase.from('users').update({ password: hash }).in('email', seedEmails);
    if (error) throw error;
    res.json({ ok: true, message: 'Đã reset password cho tất cả seed users thành admin123' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi server' }); }
});

// Đổi mật khẩu (đã đăng nhập — nhập mật khẩu cũ)
r.post('/change-password', auth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body || {};
    if (current_password == null || new_password == null) {
      return res.status(400).json({ error: 'Nhập mật khẩu hiện tại và mật khẩu mới' });
    }
    const cur = String(current_password);
    const next = String(new_password);
    if (next.length < 8) {
      return res.status(400).json({ error: 'Mật khẩu mới cần ít nhất 8 ký tự' });
    }
    if (cur === next) {
      return res.status(400).json({ error: 'Mật khẩu mới phải khác mật khẩu hiện tại' });
    }
    const { data: u, error: fErr } = await supabase
      .from('users')
      .select('id, password')
      .eq('id', req.user.userId)
      .single();
    if (fErr || !u) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
    if (!(await bcrypt.compare(cur, u.password))) {
      return res.status(400).json({ error: 'Mật khẩu hiện tại không đúng' });
    }
    const hash = await bcrypt.hash(next, 12);
    const { error: uErr } = await supabase
      .from('users')
      .update({ password: hash, updated_at: new Date().toISOString() })
      .eq('id', req.user.userId);
    if (uErr) throw uErr;
    void logAuthEvent({
      event: 'password_changed',
      user_id: req.user.userId,
      email: req.user.email || null,
      req,
    });
    res.json({ ok: true, message: 'Đã đổi mật khẩu' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// Thông tin user hiện tại
r.get('/me', auth, async (req, res) => {
  try {
    const { data: u, error: uErr } = await supabase.from('users')
      .select('id,email,full_name,role,avatar,phone,department_id,company_id,tenant_id,position,is_active,drive_module')
      .eq('id', req.user.userId).single();
    let userRow = u;
    if (uErr) {
      const { data: u2 } = await supabase.from('users')
        .select('id,email,full_name,role,avatar,phone,department_id,company_id,tenant_id,position,is_active')
        .eq('id', req.user.userId).single();
      userRow = u2 ? { ...u2, drive_module: null } : null;
    }
    if (!userRow) return res.status(404).json({ error: 'User not found' });
    let company_id = userRow.company_id || null;
    if (!company_id && userRow.department_id) {
      const { data: dept } = await supabase.from('departments').select('company_id').eq('id', userRow.department_id).single();
      company_id = dept?.company_id || null;
    }
    let crm_region_ids = [];
    try {
      const { data: ur } = await supabase.from('user_company_regions').select('region_id').eq('user_id', userRow.id);
      crm_region_ids = (ur || []).map((r) => r.region_id).filter(Boolean);
    } catch (_) {
      crm_region_ids = [];
    }
    res.json({
      user: {
        id: userRow.id,
        userId: userRow.id,
        email: userRow.email,
        fullName: userRow.full_name,
        full_name: userRow.full_name,
        role: userRow.role,
        avatar: userRow.avatar,
        phone: userRow.phone,
        department_id: userRow.department_id,
        company_id,
        tenant_id: userRow.tenant_id || null,
        crm_region_ids,
        drive_module: userRow.drive_module || null,
        position: userRow.position,
      },
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi server' }); }
});

// ─────────────────────────────────────────────────────────────
// PERMISSION APIs
// ─────────────────────────────────────────────────────────────
const { hasPermission, getRolePermissions } = require('../middleware/permission');

// Get my permissions
r.get('/my-permissions', auth, async (req, res) => {
  try {
    const permissions = await getRolePermissions(req.user.role);
    res.json({ permissions, role: req.user.role });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// Check specific permission
r.post('/check-permission', auth, async (req, res) => {
  try {
    const { permission, unit_id } = req.body;
    if (!permission) {
      return res.status(400).json({ error: 'Missing permission' });
    }
    
    const allowed = await hasPermission(
      req.user.userId,
      req.user.role,
      permission,
      unit_id || null
    );
    
    res.json({ allowed, permission, unit_id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

module.exports = r;
