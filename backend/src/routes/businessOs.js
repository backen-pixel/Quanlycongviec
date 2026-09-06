/**
 * Founder Cockpit V1 — authenticated, permissioned, read-in-place aggregate.
 * Mount: GET /api/business-os
 */
const { Router } = require('express');
const { createHash } = require('node:crypto');
const { auth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/newPermission');
const {
  CONTRACT_VERSION,
  FounderCockpitError,
  defaultReaders,
  resolveFounderCockpitScope,
  loadFounderCockpit,
} = require('../helpers/founderCockpitReadModel');

const FOUNDER_ROLES = new Set(['admin']);

function requireFounderAccess(req, res, next) {
  const role = String(req.user?.role || '').trim().toLowerCase();
  if (!FOUNDER_ROLES.has(role)) {
    return res.status(403).json({
      error: 'Founder Executive Cockpit chỉ dành cho Founder/admin được ủy quyền.',
      code: 'BUSINESS_OS_FOUNDER_ACCESS_REQUIRED',
    });
  }
  return next();
}

function auditRef(value) {
  return createHash('sha256').update(String(value || 'unknown')).digest('hex').slice(0, 16);
}

function createBusinessOsRouter({
  authMiddleware = auth,
  founderMiddleware = requireFounderAccess,
  permissionMiddleware = requirePermission('reports', 'view'),
  readers = defaultReaders,
  resolveScope = resolveFounderCockpitScope,
  loadCockpit = loadFounderCockpit,
} = {}) {
  const router = Router();
  router.use(authMiddleware);
  router.use(founderMiddleware);

  router.get('/', permissionMiddleware, async (req, res) => {
    try {
      const scope = await resolveScope(req, { readers });
      const payload = await loadCockpit({
        scope,
        user: req.user,
        period: req.query?.period || 'week',
        periodAnchor: req.query?.period_anchor || null,
        readers,
        gateContext: {
          permission: true,
          audit: true,
        },
      });
      console.info('[business-os/audit]', JSON.stringify({
        event: 'founder_cockpit_read',
        actor_ref: auditRef(req.user?.userId || req.user?.id),
        ecosystem_ref: auditRef(scope.ecosystem_id),
        scope_level: scope.level,
        company_count: scope.company_ids.length,
        generated_at: payload.generated_at,
        outcome: 'allowed',
      }));
      res.set('Cache-Control', 'no-store');
      res.set('X-Business-OS-Contract', CONTRACT_VERSION);
      return res.json(payload);
    } catch (error) {
      if (error instanceof FounderCockpitError || error?.code?.startsWith?.('BUSINESS_OS_')) {
        return res.status(error.status || 400).json({
          error: error.message,
          code: error.code,
        });
      }
      console.error('[business-os/founder-cockpit]', error);
      return res.status(500).json({
        error: 'Không tải được Founder Cockpit từ các nguồn dữ liệu hiện hữu.',
        code: 'BUSINESS_OS_READ_FAILED',
      });
    }
  });

  return router;
}

const router = createBusinessOsRouter();
router.createBusinessOsRouter = createBusinessOsRouter;
router.requireFounderAccess = requireFounderAccess;

module.exports = router;
