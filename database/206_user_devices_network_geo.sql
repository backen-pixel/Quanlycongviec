-- Bổ sung thông tin mạng + vị trí đăng nhập cho user_devices
alter table if exists public.user_devices
  add column if not exists network_name text,
  add column if not exists network_type text,
  add column if not exists geo_lat double precision,
  add column if not exists geo_lng double precision,
  add column if not exists geo_address text;

create index if not exists idx_user_devices_geo
  on public.user_devices (geo_lat, geo_lng);
