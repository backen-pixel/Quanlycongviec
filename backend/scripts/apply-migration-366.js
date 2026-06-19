/**
 * Chạy migration 366a → 366 → 367 (mỗi file một transaction riêng — bắt buộc cho enum accounting)
 * node scripts/apply-migration-366.js
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('pg');

async function runFile(name) {
  const filePath = path.join(__dirname, '..', '..', 'database', name);
  if (!fs.existsSync(filePath)) {
    console.warn('Skip missing', name);
    return;
  }
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const sql = fs.readFileSync(filePath, 'utf8');
    await client.query(sql);
    console.log(name, 'OK');
  } finally {
    await client.end();
  }
}

async function main() {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!url) throw new Error('Thiếu DATABASE_URL hoặc SUPABASE_DB_URL trong .env');
  await runFile('366a_user_role_add_accounting_enum.sql');
  await runFile('366_accounting_external_company_link.sql');
  await runFile('367_crm_rpc_external_company_scope.sql');
  console.log('366a+366+367: migration OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
