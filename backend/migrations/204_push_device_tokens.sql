-- Token push mobile (Expo / FCM / APNs) — nhận TB khi app bị kill
-- Chạy trên Supabase: SQL Editor → New query → paste → Run

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

comment on table public.push_device_tokens is 'Expo/FCM/APNs device tokens cho push khi app không chạy';
