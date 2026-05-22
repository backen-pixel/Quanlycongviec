-- ════════════════════════════════════════════════════════════════════
-- CHẨN ĐOÁN VỊ TRÍ TRÊN BẢN ĐỒ ACTIVITY
-- Chạy lần lượt từng query để xem dữ liệu thực tế trong DB,
-- đối chiếu với bản đồ trên frontend để xác định chỗ sai.
-- ════════════════════════════════════════════════════════════════════

-- 1) Chi nhánh: lat/lng hiện tại có hợp lệ không?
--    (Việt Nam: lat ~ 8.5..23.5, lng ~ 102..110)
select
  id,
  name,
  address,
  map_url,
  lat,
  lng,
  geocoded_at,
  case
    when lat is null or lng is null then '— chưa có toạ độ'
    when abs(lat) < 0.0001 and abs(lng) < 0.0001 then '!! Null Island (0,0) — INVALID'
    when lat between 8.0 and 24.0 and lng between 102.0 and 110.0 then 'OK — trong Việt Nam'
    when lat between -90 and 90 and lng between -180 and 180 then 'NGOÀI VN — kiểm tra lại'
    else '!! lat/lng vượt ngưỡng — có thể bị swap'
  end as check_status
from public.company_regions
order by check_status desc, name;


-- 2) Vị trí nhân viên (user_current_location)
select
  ucl.user_id,
  u.full_name,
  u.email,
  ucl.lat,
  ucl.lng,
  ucl.address,
  ucl.source,
  ucl.captured_at,
  case
    when ucl.lat between 8.0 and 24.0 and ucl.lng between 102.0 and 110.0 then 'OK — trong Việt Nam'
    when ucl.lat between -90 and 90 and ucl.lng between -180 and 180 then 'NGOÀI VN — kiểm tra'
    else '!! Bất thường'
  end as check_status
from public.user_current_location ucl
left join public.users u on u.id = ucl.user_id
order by ucl.captured_at desc nulls last
limit 50;


-- 3) Thiết bị (user_devices) có geo_lat/geo_lng
select
  ud.user_id,
  u.full_name,
  ud.platform,
  ud.device_name,
  ud.geo_lat,
  ud.geo_lng,
  ud.geo_address,
  ud.last_ping_at
from public.user_devices ud
left join public.users u on u.id = ud.user_id
where ud.geo_lat is not null and ud.geo_lng is not null
order by ud.last_ping_at desc nulls last
limit 50;


-- 4) Cache geocode hiện tại
select
  key,
  address,
  raw->'lat' as raw_lat,
  raw->'lng' as raw_lng,
  raw->>'source' as source,
  created_at
from public.geocode_cache
order by created_at desc
limit 30;


-- ════════════════════════════════════════════════════════════════════
-- KHẮC PHỤC NHANH
-- ════════════════════════════════════════════════════════════════════

-- 5) Xóa toạ độ chi nhánh sai → bấm "Sửa toạ độ" trên trang Activity
--    hoặc /api/crm/company-regions/:id/regeocode để geocode lại.
-- update public.company_regions set lat = null, lng = null, geocoded_at = null where id = '<region_id>';

-- 6) Xóa toàn bộ cache forward-geocode (nếu nghi cache pollution)
-- delete from public.geocode_cache where key like 'fwd:%';

-- 7) Xóa vị trí nhân viên sai → ping kế tiếp sẽ ghi lại
-- delete from public.user_current_location where user_id = '<user_id>';
-- update public.user_devices set geo_lat = null, geo_lng = null, geo_address = null where user_id = '<user_id>';

-- 8) Reset toàn bộ (CẨN THẬN — chỉ dùng khi cần khắc phục triệt để)
-- update public.company_regions set lat = null, lng = null, geocoded_at = null;
-- delete from public.geocode_cache where key like 'fwd:%';
