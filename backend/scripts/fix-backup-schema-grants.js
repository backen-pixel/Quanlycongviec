/**
 * Sửa quyền schema public trên backup sau pg_restore (fix 403 permission denied).
 * Chạy: node scripts/fix-backup-schema-grants.js
 */
require('dotenv').config();
const { Client } = require('pg');

const SQL = `
GRANT USAGE ON SCHEMA public TO service_role, anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
`;

async function main() {
  const url = process.env.SUPABASE_BACKUP_DB_DIRECT_URL;
  if (!url) throw new Error('Thiếu SUPABASE_BACKUP_DB_DIRECT_URL');
  const c = new Client({ connectionString: url });
  await c.connect();
  await c.query(SQL);
  await c.end();
  console.log('[fix-backup-grants] OK — service_role có quyền schema public');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
