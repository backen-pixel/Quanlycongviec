/**
 * Tạo bảng push_device_tokens nếu chưa có (Cách 2: FCM khi app kill).
 * Chạy qua pg pool — cần SUPABASE_DB_URL hoặc SUPABASE_DB_DIRECT_URL trên server.
 */

const { supabase } = require('../config/supabase');
const { pgSessionQuery, isPgEnabled } = require('../config/db');

const ENSURE_SQL = `
create table if not exists public.push_device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('expo', 'fcm', 'apns')),
  device_id text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, token)
);
create index if not exists idx_push_device_tokens_user on public.push_device_tokens(user_id);
create index if not exists idx_push_device_tokens_token on public.push_device_tokens(token);

NOTIFY pgrst, 'reload schema';
`;

async function tableExistsViaRest() {
  const { error } = await supabase.from('push_device_tokens').select('id').limit(1);
  if (!error) return true;
  const msg = String(error.message || '');
  return !(error.code === '42P01' || error.code === 'PGRST205' || /push_device_tokens/i.test(msg));
}

async function ensurePushDeviceTokensTable() {
  if (await tableExistsViaRest()) {
    return { ok: true, created: false };
  }

  if (!isPgEnabled()) {
    console.warn(
      '[push] Bảng push_device_tokens chưa có và pg pool tắt/thiếu SUPABASE_DB_URL.\n'
        + '  → Supabase SQL Editor: chạy backend/migrations/204_push_device_tokens.sql',
    );
    return { ok: false, created: false, reason: 'no_pg_pool' };
  }

  try {
    await pgSessionQuery(ENSURE_SQL);
    const exists = await tableExistsViaRest();
    if (exists) {
      console.log('[push] ✅ push_device_tokens đã sẵn sàng');
      return { ok: true, created: true };
    }
    console.warn('[push] DDL chạy xong nhưng PostgREST chưa thấy bảng — đợi vài giây hoặc reload schema Supabase');
    return { ok: false, created: true, reason: 'schema_cache' };
  } catch (e) {
    console.error('[push] Không tạo được push_device_tokens:', e.message);
    return { ok: false, created: false, reason: e.message };
  }
}

module.exports = { ensurePushDeviceTokensTable };
