/**
 * Chạy migration 364 (CRM Kanban — lead_members visibility)
 * node scripts/apply-migration-364.js
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('pg');

const sql = fs.readFileSync(
  path.join(__dirname, '..', '..', 'database', '364_crm_leads_member_visibility.sql'),
  'utf8',
);

async function main() {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!url) throw new Error('Thiếu DATABASE_URL hoặc SUPABASE_DB_URL trong .env');
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query(sql);
  await client.end();
  console.log('364: migration OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
