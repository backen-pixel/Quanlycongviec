-- Dọn các bản ghi vị trí không hợp lệ (Null Island - 0,0 hoặc rất gần)
-- do thiết bị mô phỏng / API trả về giá trị mặc định.

delete from public.user_current_location
where abs(lat) < 0.0001 and abs(lng) < 0.0001;

update public.user_devices
set geo_lat = null,
    geo_lng = null,
    geo_address = null
where geo_lat is not null
  and geo_lng is not null
  and abs(geo_lat) < 0.0001
  and abs(geo_lng) < 0.0001;
