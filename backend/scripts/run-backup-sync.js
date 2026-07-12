#!/usr/bin/env node
/** Chạy đồng bộ Primary → Backup (incremental + verify). */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { runBackupSync } = require('../src/helpers/supabaseBackupSync');

runBackupSync({
  includeDb: true,
  includeStorage: false,
  verifyAfter: true,
  verifyBefore: false,
  userId: 'local-sync-script',
})
  .then((result) => {
    console.log('\n[sync] Kết quả:', JSON.stringify(result, null, 2));
    process.exit(result?.status === 'failed' ? 1 : 0);
  })
  .catch((e) => {
    console.error('[sync] Lỗi:', e.message);
    process.exit(1);
  });
