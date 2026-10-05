-- 647_fix_creative_key_ads_image.sql
-- Link dạng .../ads/image/ mang danh tính NGAY TRONG query string.
-- Cắt query (như migration 646 làm) khiến mọi mẫu loại này dồn chung một khoá,
-- nên số mẫu bị đếm thiếu. Với riêng loại link đó, giữ nguyên cả URL làm khoá.
-- Kết quả lần chạy 02/10/2026: số mẫu khác nhau 147 → 153.
update lead_attribution
set fb_creative_key = fb_creative_url
where fb_creative_url is not null
  and split_part(fb_creative_url, '?', 1) ~ '/ads/image/?$';
