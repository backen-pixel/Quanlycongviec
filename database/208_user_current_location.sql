-- Vị trí hiện tại của từng nhân viên (cập nhật mỗi heartbeat có geo)
create table if not exists public.user_current_location (
  user_id uuid primary key references public.users(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  address text,
  accuracy_m double precision,
  source text,
  device_id text,
  captured_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_current_location_updated_at
  on public.user_current_location (updated_at desc);

comment on table public.user_current_location is 'Vị trí làm việc mới nhất của nhân viên (từ GPS heartbeat)';
