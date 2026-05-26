/**
 * Chuẩn hoá query phạm vi từ request (company / department / team / user / from / to / search).
 * Dùng chung cho các route list/report.
 */

function trimOrNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

/**
 * @param {import('express').Request} req
 * @param {object} [opts]
 * @param {boolean} [opts.forceUserCompany=false] — non-elevated: ép company_id = user.company_id
 * @param {string[]} [opts.elevatedRoles] — role được chọn công ty tự do
 */
function parseScopeFromQuery(req, opts = {}) {
  const elevatedRoles = opts.elevatedRoles || ['admin', 'manager', 'region_admin', 'super_admin', 'owner'];
  const role = String(req.user?.role || '').toLowerCase();
  const elevated = elevatedRoles.includes(role) || req.user?.is_system_admin;

  let companyId = trimOrNull(req.query.company_id);
  const departmentId = trimOrNull(req.query.department_id);
  const teamId = trimOrNull(req.query.team_id);
  const userId = trimOrNull(req.query.user_id);
  const regionId = trimOrNull(req.query.region_id);
  const search = trimOrNull(req.query.search);
  const from = trimOrNull(req.query.from);
  const to = trimOrNull(req.query.to);

  if (opts.forceUserCompany && !elevated && req.user?.company_id) {
    companyId = String(req.user.company_id);
  } else if (!elevated && req.user?.company_id && !companyId) {
    companyId = String(req.user.company_id);
  }

  return {
    companyId,
    departmentId,
    teamId,
    userId,
    regionId,
    search,
    from,
    to,
    elevated,
  };
}

/** Gắn lên req.scope để handler đọc thống nhất */
function attachScope(req, opts) {
  req.scope = parseScopeFromQuery(req, opts);
  return req.scope;
}

module.exports = {
  parseScopeFromQuery,
  attachScope,
};
