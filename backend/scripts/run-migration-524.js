/**
 * Backfill production_finish_date = (install_date || delivery_date) − 2.
 * Usage: node scripts/run-migration-524.js
 */
const fs = require('fs');
const path = require('path');

async function main() {
  require('dotenv').config({ path: path.join(__dirname, '../.env') });
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');

  const sqlPath = path.join(__dirname, '../../database/524_backfill_production_finish_date.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  // Prefer Management API if token present (raw SQL)
  const ref = process.env.SUPABASE_PROJECT_REF || (url.match(/https:\/\/([^.]+)\./) || [])[1];
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (accessToken && ref) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ query: sql }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Management API ${res.status}: ${text}`);
    console.log('[524] OK via Management API:', text.slice(0, 500));
    return;
  }

  // Fallback: row-level update via service role
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data: rows, error } = await supabase
    .from('projects')
    .select('id, install_date, delivery_date, production_finish_date')
    .is('production_finish_date', null)
    .or('install_date.not.is.null,delivery_date.not.is.null');
  if (error) throw error;

  const { subtractCalendarDays } = require('../src/helpers/projectDeliveryDates');
  let updated = 0;
  for (const row of rows || []) {
    const anchor = row.install_date || row.delivery_date;
    const finish = subtractCalendarDays(anchor, 2);
    if (!finish) continue;
    const { error: upErr } = await supabase
      .from('projects')
      .update({ production_finish_date: finish, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (upErr) {
      console.warn('[524] fail', row.id, upErr.message);
      continue;
    }
    updated += 1;
    console.log('[524]', row.id, '→', finish, '(from', row.install_date ? 'install' : 'delivery', ')');
  }
  console.log(`[524] updated ${updated}/${(rows || []).length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
