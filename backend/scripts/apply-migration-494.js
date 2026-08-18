/**
 * Apply database/494_handover_confirm_users.sql via Management API.
 * Usage: node scripts/apply-migration-494.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const url = process.env.SUPABASE_URL || '';
  const m = url.match(/https:\/\/([^.]+)/);
  const ref = m && m[1];
  if (!token || !ref) {
    console.error('Missing SUPABASE_ACCESS_TOKEN or SUPABASE_URL');
    process.exit(1);
  }
  const query = fs.readFileSync(
    path.join(__dirname, '../../database/494_handover_confirm_users.sql'),
    'utf8',
  );
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  console.log(res.status, text.slice(0, 800));
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
