const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { getTenantUsageSummary } = require('../helpers/tenantQuotas');
const {
  getTenantSetupStatus,
  getTenantSetupProgress,
  completeTenantFirstSetup,
  setupTenantEcosystem,
  setupTenantDepartments,
  setupTenantStaff,
  finishTenantSetup,
} = require('../helpers/tenantSetup');
const { buildAuthSessionForUser } = require('../helpers/authSession');

const r = Router();

/** Trạng thái thiết lập ban đầu + tiến độ các nhiệm vụ */
r.get('/setup-status', auth, async (req, res) => {
  try {
    const status = await getTenantSetupStatus(req.user);
    res.json(status);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Lỗi kiểm tra thiết lập' });
  }
});

r.get('/setup-progress', auth, async (req, res) => {
  try {
    const progress = await getTenantSetupProgress(req.user);
    res.json(progress);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Lỗi kiểm tra tiến độ' });
  }
});

/** Hoàn tất bước 1: tạo công ty đầu tiên + pipeline CRM mặc định */
r.post('/first-setup', auth, async (req, res) => {
  try {
    const result = await completeTenantFirstSetup(req.user, req.body || {});
    const session = await buildAuthSessionForUser(result.user, {
      sessionId: req.body?.session_id || undefined,
    });
    res.status(201).json({
      ok: true,
      company: result.company,
      company_id: result.company_id,
      token: session.token,
      user: session.user,
    });
  } catch (e) {
    const code = e.code || 'setup_failed';
    const status = code === 'validation' ? 400 : (code === 'already_setup' ? 409 : 500);
    res.status(status).json({ error: e.message || 'Không thiết lập được', code });
  }
});

r.post('/setup-ecosystem', auth, async (req, res) => {
  try {
    const result = await setupTenantEcosystem(req.user, req.body || {});
    const progress = await getTenantSetupProgress(req.user);
    res.status(201).json({ ok: true, ...result, progress });
  } catch (e) {
    const code = e.code || 'setup_failed';
    const status = code === 'validation' ? 400 : (code === 'forbidden' ? 403 : 500);
    res.status(status).json({ error: e.message || 'Không cấu hình được hệ sinh thái', code });
  }
});

r.post('/setup-departments', auth, async (req, res) => {
  try {
    const result = await setupTenantDepartments(req.user, req.body || {});
    const progress = await getTenantSetupProgress(req.user);
    res.status(201).json({ ok: true, ...result, progress });
  } catch (e) {
    const code = e.code || 'setup_failed';
    const status = code === 'validation' ? 400 : (code === 'forbidden' ? 403 : 500);
    res.status(status).json({ error: e.message || 'Không tạo được phòng ban', code });
  }
});

r.post('/setup-staff', auth, async (req, res) => {
  try {
    const result = await setupTenantStaff(req.user, req.body || {});
    const progress = await getTenantSetupProgress(req.user);
    res.status(201).json({ ok: true, ...result, progress });
  } catch (e) {
    const code = e.code || 'setup_failed';
    const status = code === 'validation' ? 400 : (code === 'forbidden' ? 403 : 500);
    res.status(status).json({ error: e.message || 'Không tạo được nhân viên', code });
  }
});

r.post('/finish-setup', auth, async (req, res) => {
  try {
    const result = await finishTenantSetup(req.user);
    const progress = await getTenantSetupProgress(req.user);
    res.json({ ok: true, ...result, progress });
  } catch (e) {
    const code = e.code || 'setup_failed';
    const status = code === 'validation' ? 400 : (code === 'forbidden' ? 403 : 500);
    res.status(status).json({ error: e.message || 'Không hoàn tất được thiết lập', code });
  }
});

/** Giới hạn gói + mức sử dụng hiện tại (tenant SaaS) */
r.get('/usage', auth, async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) {
      return res.json({
        enforced: false,
        message: 'Tài khoản legacy — không áp giới hạn gói SaaS',
      });
    }
    const summary = await getTenantUsageSummary(tenantId);
    if (!summary) return res.status(404).json({ error: 'Không tìm thấy hệ sinh thái' });
    res.json({ enforced: true, ...summary });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;
