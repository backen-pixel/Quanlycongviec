/**
 * Entry point cũ đã khóa; quyền Backup chỉ thay bằng migration được duyệt.
 * Chạy: node scripts/fix-backup-schema-grants.js
 */
const { applyBackupSchemaGrants } = require('../src/helpers/backupSchemaGrants');

applyBackupSchemaGrants({ force: true }).catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
