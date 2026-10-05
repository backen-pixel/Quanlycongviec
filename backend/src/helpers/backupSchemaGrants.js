'use strict';

// ACL changes belong to reviewed migrations, never backup error recovery.
// Keep the old entry point fail-closed for callers/scripts from older versions.
async function applyBackupSchemaGrants() {
  const error = new Error('BACKUP_GRANT_MIGRATION_REQUIRED: Tự cấp quyền Backup đã bị khóa. Cần migration quyền cụ thể đã review và duyệt áp dụng.');
  error.code = 'BACKUP_GRANT_MIGRATION_REQUIRED';
  throw error;
}

function isBackupPermissionDeniedError(err) {
  const status = Number(err?.status || err?.statusCode);
  const msg = String(err?.message || err || '');
  return status === 401 || status === 403 || String(err?.code || '') === '42501'
    || /42501|permission denied|Grant the required privileges|→ (401|403)\b/i.test(msg);
}

module.exports = { applyBackupSchemaGrants, isBackupPermissionDeniedError };
