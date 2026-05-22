-- Dọn vị trí nằm ngoài Việt Nam (đất liền + Trường Sa + Hoàng Sa).
-- Backend nay chỉ chấp nhận lat/lng trong [6.0..24.0, 101.5..118.0] —
-- toạ độ cũ ngoài phạm vi này (do IP geolocation/VPN/GPS sai) sẽ bị xóa
-- để ping kế tiếp ghi lại vị trí chính xác trong VN.

-- 1) Vị trí hiện tại của user
delete from public.user_current_location
where lat is null or lng is null
   or lat < 6.0 or lat > 24.0
   or lng < 101.5 or lng > 118.0;

-- 2) Geo trên user_devices
update public.user_devices
set geo_lat = null,
    geo_lng = null,
    geo_address = null
where geo_lat is not null
  and (
    geo_lat < 6.0 or geo_lat > 24.0
    or geo_lng < 101.5 or geo_lng > 118.0
  );

-- 3) Chi nhánh — reset lat/lng ngoài VN để backend tự geocode lại lần load tới
update public.company_regions
set lat = null,
    lng = null,
    geocoded_at = null
where lat is not null
  and (
    lat < 6.0 or lat > 24.0
    or lng < 101.5 or lng > 118.0
  );

-- 4) (Tùy chọn) xóa cache forward-geocode đã lưu kết quả ngoài VN
delete from public.geocode_cache
where key like 'fwd:%'
  and (
    (raw->>'lat')::numeric is null
    or (raw->>'lat')::numeric < 6.0
    or (raw->>'lat')::numeric > 24.0
    or (raw->>'lng')::numeric < 101.5
    or (raw->>'lng')::numeric > 118.0
  );
