-- Cache reverse geocode (Nominatim / Google) theo tọa độ làm tròn
create table if not exists public.geocode_cache (
  key text primary key,
  address text not null,
  raw jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_geocode_cache_created_at
  on public.geocode_cache (created_at desc);
