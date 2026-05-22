-- Thêm toạ độ địa lý cho chi nhánh để vẽ marker trên bản đồ Activity.
-- Backend sẽ tự forward-geocode `address` lần đầu nếu lat/lng còn null.
alter table if exists public.company_regions
  add column if not exists lat numeric(10,6),
  add column if not exists lng numeric(10,6),
  add column if not exists geocoded_at timestamptz;

comment on column public.company_regions.lat is 'Vĩ độ chi nhánh (tự forward-geocode hoặc nhập tay)';
comment on column public.company_regions.lng is 'Kinh độ chi nhánh (tự forward-geocode hoặc nhập tay)';
comment on column public.company_regions.geocoded_at is 'Lần geocode address → lat/lng gần nhất';

create index if not exists idx_company_regions_geo
  on public.company_regions (lat, lng)
  where lat is not null and lng is not null;
