/**
 * Sửa quyền schema public trên backup sau pg_restore (fix 403 permission denied).
 * Chạy: node scripts/fix-backup-schema-grants.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { applyBackupSchemaGrants } = require('../src/helpers/backupSchemaGrants');

applyBackupSchemaGrants({ force: true }).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
