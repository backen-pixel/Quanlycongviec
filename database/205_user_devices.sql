-- Thiết bị đang đăng nhập của user (mobile + web) + heartbeat
create table if not exists public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  device_id text not null,
  platform text not null check (platform in ('android','ios','web','desktop')),
  device_name text,
  os_name text,
  os_version text,
  app_version text,
  user_agent text,
  ip text,
  push_token text,
  first_seen_at timestamptz not null default now(),
  last_ping_at timestamptz not null default now(),
  last_login_at timestamptz not null default now(),
  unique (user_id, device_id)
);

create index if not exists idx_user_devices_user on public.user_devices(user_id);
create index if not exists idx_user_devices_ping on public.user_devices(last_ping_at desc);

comment on table public.user_devices is 'Heartbeat phiên đăng nhập – biết user nào đang online ở đâu';
