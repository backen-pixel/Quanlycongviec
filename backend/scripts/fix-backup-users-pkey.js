/** Chạy 391_fix_backup_users_pkey.sql trên Supabase BACKUP. */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'database', '391_fix_backup_users_pkey.sql'), 'utf8');

async function query(q) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ query: q }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function main() {
  if (!TOKEN) throw new Error('Thiếu SUPABASE_ACCESS_TOKEN');
  console.log('Applying 508 on BACKUP', REF, '…');
  await query(sql);
  console.log('Done.');

  const v = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM public.users) AS users_count,
      (SELECT COUNT(DISTINCT id)::int FROM public.users) AS distinct_ids,
      EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.users'::regclass AND conname = 'users_pkey'
      ) AS has_users_pkey,
      EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.users'::regclass AND conname = 'users_email_key'
      ) AS has_email_unique,
      EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ai_bot_user_skills_user_id_fkey'
      ) AS has_skills_user_fk
  `);
  console.log('Verify:', v[0] || v);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
