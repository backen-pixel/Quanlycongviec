/**
 * Sửa quyền schema public trên backup sau pg_restore (fix 403 permission denied).
 * Chạy: node scripts/fix-backup-schema-grants.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const {
  listBackupPgProbeCandidates,
  connectPgWithProbeCandidates,
  describePgTarget,
} = require('../src/config/pgConnection');

const SQL = `
GRANT USAGE ON SCHEMA public TO service_role, anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
`;

async function main() {
  const candidates = listBackupPgProbeCandidates();
  if (!candidates.length) {
    throw new Error('Thiếu SUPABASE_BACKUP_DB_URL hoặc SUPABASE_BACKUP_DB_DIRECT_URL');
  }
  const { pool, url } = await connectPgWithProbeCandidates(candidates, {
    label: 'Backup grants',
    onLog: (m) => console.log(`[fix-backup-grants] ${m}`),
  });
  try {
    await pool.query(SQL);
    console.log(`[fix-backup-grants] OK — service_role có quyền schema public (${describePgTarget(url)})`);
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
