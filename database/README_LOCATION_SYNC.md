# Đồng bộ vị trí nhân viên (live location)

Chạy các migration theo thứ tự (nếu chưa chạy):

1. `206_user_devices_network_geo.sql` — cột geo trên `user_devices`
2. `207_company_regions_address.sql` — địa chỉ chi nhánh
3. `208_user_current_location.sql` — bảng vị trí hiện tại mỗi user
4. `209_geocode_cache.sql` — cache reverse/forward geocode
5. `210_cleanup_invalid_geo.sql` — xóa vị trí (0,0) không hợp lệ
6. `211_company_regions_geo.sql` — `lat/lng/geocoded_at` cho chi nhánh (để pin trên bản đồ Activity)
7. `212_constrain_vietnam_geo.sql` — dọn dữ liệu vị trí ngoài Việt Nam (sau khi áp ràng buộc bounds VN)

Phạm vi địa lý: **chỉ Việt Nam** (đất liền + Trường Sa + Hoàng Sa).
Khung lat/lng được lọc cứng ở `backend/src/helpers/geoBounds.js`:
`lat ∈ [6.0, 24.0]`, `lng ∈ [101.5, 118.0]`. Mọi toạ độ ngoài phạm vi này sẽ bị từ chối.

Sau deploy backend:

- Web/mobile gửi `POST /devices/ping` kèm `geo_lat`/`geo_lng` → server reverse geocode (Nominatim hoặc `GOOGLE_MAPS_API_KEY`) và upsert `user_current_location`.
- Admin xem bản đồ tại `/crm/activity` (Leaflet/OSM, chỉ vẽ marker chi nhánh + nhân viên — không hiển thị POI mặc định).
- Khi `GET /crm/company-regions` được gọi, server sẽ tự forward-geocode address/map_url của chi nhánh còn thiếu lat/lng (tối đa 5 record/lần, có cache `geocode_cache`).
- Nhân viên: Cài đặt → **Vị trí làm việc** (`/settings/location`).
- Cache GPS phía trình duyệt: 90 giây — vị trí tự refresh ~mỗi 1–2 phút khi ping.

Mobile: rebuild `crm-mobile` sau khi cài `expo-location` + `@react-native-community/netinfo`.
