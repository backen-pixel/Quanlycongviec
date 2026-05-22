-- Bổ sung nơi gắn địa chỉ chi nhánh (khu vực CRM)
alter table if exists public.company_regions
  add column if not exists address text,
  add column if not exists map_url text;

comment on column public.company_regions.address is 'Địa chỉ chi nhánh / khu vực';
comment on column public.company_regions.map_url is 'Link Google Maps của chi nhánh (tùy chọn)';
