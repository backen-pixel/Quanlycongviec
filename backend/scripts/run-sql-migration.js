/**
 * Chạy một file .sql lên Postgres (Supabase).
 * Cần DATABASE_URL trong backend/.env — lấy tại Supabase: Project Settings → Database → Connection string (URI).
 * Ví dụ: postgresql://postgres.[ref]:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error('Usage: node scripts/run-sql-migration.js <path-to.sql>');
    process.exit(1);
  }
  const sqlPath = path.isAbsolute(fileArg) ? fileArg : path.join(process.cwd(), fileArg);
  if (!fs.existsSync(sqlPath)) {
    console.error('File not found:', sqlPath);
    process.exit(1);
  }
  const url = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!url) {
    console.error(
      'Thiếu DATABASE_URL trong backend/.env.\n'
        + 'Vào Supabase → Project Settings → Database → copy "Connection string" (URI, có mật khẩu DB),\n'
        + 'thêm một dòng: DATABASE_URL=postgresql://... rồi chạy lại lệnh này.',
    );
    process.exit(1);
  }
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    console.log('OK:', sqlPath);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
