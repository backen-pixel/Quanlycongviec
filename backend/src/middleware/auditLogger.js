const { writeAuditLog } = require('../helpers/auditLog');

/**
 * Ghi audit sau khi handler thành công (res.json đã gọi).
 * Dùng: `auditAfter(req, { module, action, entity_type, entity_id, ... })` trong route.
 */
function auditAfter(req, entry) {
  void writeAuditLog(req, entry);
}

module.exports = { auditAfter, writeAuditLog };
