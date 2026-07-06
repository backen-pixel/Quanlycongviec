const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { getTenantUsageSummary } = require('../helpers/tenantQuotas');

const r = Router();

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
