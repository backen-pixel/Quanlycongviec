/**
 * Chạy migration 353 (RPC user_has_permission + users.role)
 * node scripts/apply-migration-353.js
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('pg');

const sql = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '353_user_has_permission_system_role.sql'),
  'utf8',
);

async function main() {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!url) throw new Error('Thiếu DATABASE_URL hoặc SUPABASE_DB_URL trong .env');
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query(sql);
  await client.end();
  console.log('353: user_has_permission + system role OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
