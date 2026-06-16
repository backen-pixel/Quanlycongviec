-- 352: Drive module — reset metadata sang cấu trúc folder theo cây tổ chức.
--
-- Trước đây Drive cá nhân nằm ở `<ROOT>/users/<userId>`, Drive công ty ở `<ROOT>/companies/<companyId>`.
-- Sau khi áp dụng helper driveOrgPath mới, layout chuẩn là:
--    <ROOT>/<Tên công ty>/Khu vực/<KV>/Phòng ban/<PB>/Nhân viên/<Tên NV>     (drive_roots.scope='user')
--    <ROOT>/<Tên công ty>/                                                    (drive_roots.scope='company')
--
-- Script này XOÁ TOÀN BỘ METADATA Drive ở local DB (KHÔNG xoá file thật trên Google Drive)
-- để hệ thống tự ensure lại path mới khi user truy cập.
--
-- ▶ CHỈ chạy ở môi trường dev/test, khi chưa có file thật.
-- ▶ Trên prod: dùng endpoint POST /api/drive/roots/reset-personal cho từng user, hoặc
--   migrate thủ công bằng cách MOVE folder GDrive sang path mới + update google_folder_id.
--
-- Sau khi chạy:
--   1. Folder cũ `users/...` và `companies/...` trên Google Drive vẫn còn → có thể tự xoá thủ công.
--   2. Khi user mở `/drive`, frontend gọi `ensure-personal` → backend tạo lại cấu trúc Cty→KV→PB→NV.

BEGIN;

TRUNCATE TABLE drive_activity_log RESTART IDENTITY;
TRUNCATE TABLE drive_entity_links RESTART IDENTITY CASCADE;
TRUNCATE TABLE drive_stars RESTART IDENTITY;
TRUNCATE TABLE drive_acl RESTART IDENTITY CASCADE;
TRUNCATE TABLE drive_files RESTART IDENTITY CASCADE;
TRUNCATE TABLE drive_folders RESTART IDENTITY CASCADE;
TRUNCATE TABLE drive_roots RESTART IDENTITY CASCADE;

COMMIT;

-- Sau khi commit: refresh tab /drive trên frontend — Drive cá nhân sẽ được tạo lại với layout mới.
