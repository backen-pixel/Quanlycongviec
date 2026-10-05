# Primary/Backup — bằng chứng chỉ đọc và phương án khép lỗi

> Cập nhật sau đăng nhập 05/10: [kết quả catalog trực tiếp](DB_CATALOG_20261005.md) thay các mục “chờ đăng nhập/chưa đọc catalog” trong snapshot này. Backup thiếu cấu trúc thật; quyền DB đã đọc nhưng chưa an toàn, restore chưa PASS. Số queue1.011 dưới đây chỉ thuộc lúc14:23:36, không là số hiện tại. Giữ nguyên phần dưới làm lịch sử.

Quan sát UI Giám sát Supabase của CRM, ngày 05/10/2026 khoảng 14:23–14:30 (Asia/Ho_Chi_Minh). **Đã mở khóa trang giám sát; HOLD điều kiện DB/khôi phục.** Không còn chờ mật khẩu CRM. Supabase Dashboard là phiên đăng nhập riêng, hiện chưa đăng nhập; đã gửi yêu cầu Founder đăng nhập trực tiếp, không gửi mật khẩu vào chat.

## Bằng chứng hiện hành

| Dữ kiện | Quan sát | Giới hạn |
|---|---|---|
| DB đang dùng | Primary `kdxypztstbeovyedmvem` | Chứng minh active target của ứng dụng báo trên UI; chưa chứng minh mọi writer của các hệ thống khác |
| Backup | `atcfpgxkgbszglrelfgr` | Không chuyển sang Backup |
| Kết nối | Auth/REST/PostgreSQL/Storage hai DB đều báo OK; PostgreSQL 17.6 | Khả dụng không chứng minh dữ liệu đồng bộ hoặc restore thành công |
| Schema/dung lượng | Primary 322 bảng public, 1,52 GB; Backup 327 bảng, 1,20 GB | Chênh số bảng không xác định bảng nào thiếu; chưa kiểm catalog |
| Storage | Primary 7,72 GB / 15.462 file; Backup 5,63 GB / 9.267 file | Không suy toàn bộ chênh lệch là dữ liệu bị mất; cần đối soát theo tập tệp/phiên bản |
| Failover | Bật; số lần failover 0; failback pending 0 | Xác nhận cấu hình hiện hành vẫn không đáp ứng guard Primary-only của ứng viên |
| Replication | Queue 1.011 tại 14:23:36 | Snapshot tức thời; chưa chứng minh queue tăng liên tục, đã mất dữ liệu hoặc có thể phát lại mọi mục |
| Lỗi replication | Backup upsert `crm_leads` trả `PGRST204`: không tìm được `facebook_contact_id` trong schema cache | Có thể thiếu cột hoặc cache/schema không khớp; phải đọc catalog trước chọn cách sửa |

Lịch sử đồng bộ đã có hiển thị lần mới nhất 04:00:01 ngày 04/10, chạy 342 phút 7 giây, lỗi `full_clone_required / clone-primary-to-backup.js exit 1`. Log cuối ghi lúc 09:40:53 cần clone do thiếu schema; lúc 09:42:08 bước chuẩn bị schema Backup lỗi `out of shared memory`, gợi ý `max_locks_per_transaction`. Đây là log lịch sử, không kết luận mọi schema hiện tại vẫn như thời điểm đó. Không lưu raw log/kết nối hoặc dữ liệu khách.

## Đối chiếu với mã và tác động

- `backend/scripts/clone-primary-to-backup.js`, hàm `prepareBackupSchemaForRestore`, xóa toàn bộ schema public trên Backup bằng DROP CASCADE rồi tạo schema/grant/extension trước restore. Vì vậy bấm đồng bộ lớn/chạy lại clone có tác động rộng và không là phép kiểm chỉ đọc.
- Reviewer độc lập đọc script xác nhận thêm: restore nonzero có thể bị bỏ qua khi stderr chứa “schema public already exists” dù kèm lỗi khác; bước sau chỉ in năm row count, không bắt buộc bằng nhau. Cuối luồng có gọi `backend/src/helpers/backupSchemaGrants.js` cấp quyền rộng lại, cần đối chiếu với các contract service-only của ứng viên. Đây là rủi ro legacy sẵn có, chưa sửa trong fd3babeb.
- `supabaseBackupSync.js` gọi cấp quyền rộng trước cả incremental sync; vì vậy cả sync theo lịch/thủ công và đường chuyển DB cần được đối chiếu, không chỉ full clone. Dump clone hiện chỉ lấy schema public, bỏ các schema kiểm soát của ứng viên như crm_survey_control, crm_legacy_hold và marketing_measurement; không dùng làm bằng chứng backup đầy đủ cho bản mới.
- Log lỗi ở prepare chỉ chứng minh lần đó dừng trước restore; chưa chứng minh dữ liệu Backup đã bị xóa hoặc còn nguyên. Không dùng “retry thành công/không báo lỗi” làm tiêu chí restore PASS khi validator/quyền còn các giới hạn trên.
- `database/639_facebook_contact_lead_atomic.sql` có khai báo cột `crm_leads.facebook_contact_id` cùng index/ràng buộc và logic atomic. Không suy ledger đã/chưa áp dụng từ tên file hoặc tự chạy riêng một ALTER thiếu dependency.
- Guard intake tại `backend/src/routes/facebook.js` yêu cầu active Primary **và** failover bị tắt. UI hiện Primary nhưng failover Bật: điều kiện chưa đạt. Không bỏ guard hoặc đổi failover chỉ để cho phép chạy.
- Tab Kiểm tra drift của CRM có thể tự POST verify và ghi trạng thái kiểm. Phiên này chỉ đọc Giám sát và Lịch sử, không bấm tab đó, sync/clone/chuyển DB hoặc sửa lịch.

## Phương án xử lý để chuẩn bị gói áp dụng

1. **Đọc catalog hai DB:** kiểm tồn tại/type/default/FK/index của cột, migration ledger theo đầy đủ tên/checksum, phiên bản và thiết lập khóa. Dùng [SQL metadata chỉ đọc](READONLY_DB_PREFLIGHT_20261005.sql) trong phiên được phép; SQL không chọn bản ghi khách hoặc thay đổi schema. Đối chiếu RLS/grants/owner của bảng liên quan. Đây mới là kiểm cấu trúc, chưa chứng minh tenant routing/runtime grants đúng.
2. **Xác định đường sửa:** nếu cột có thật mà REST cache cũ, lập thay đổi refresh cache riêng; nếu thiếu schema, đối chiếu toàn bộ delta/prerequisite và lập migration tương ứng. Không áp dụng 50 SQL ứng viên để chữa lỗi Backup cũ. Không mặc định tăng max_locks hoặc chạy DROP CASCADE theo gợi ý log.
3. **Chuẩn bị khả năng khôi phục:** xác nhận nguồn snapshot/backup gần nhất và phạm vi DB + Storage; phục hồi vào môi trường cô lập tương thích PostgreSQL17, kiểm dữ liệu/ràng buộc/quyền và phần chênh lệch cần giữ. 11 ca restore CI PostgreSQL16 không thay bằng chứng này.
4. **Gói sửa cụ thể trình Founder:** liệt kê đúng DB, câu lệnh/thay đổi cấu hình, các writer cần dừng, phạm vi ảnh hưởng, thời gian, snapshot để quay lại, bước đối soát queue và tiêu chí dừng. Sửa Backup/Primary hoặc tắt failover chưa được thực hiện bởi hồ sơ chỉ đọc này.
5. **Sau áp dụng được duyệt:** kiểm schema/cache, đối soát queue/idempotency và độ đủ dữ liệu; chỉ thử chuyển/khôi phục theo kịch bản đã duyệt. Sau đó mới khép binding form/quyền và UAT tuyến Lead trên ứng viên.

Không có bằng chứng mất Lead trên Primary từ các lỗi này. Không được coi nhãn “Bình thường” của màn kết nối là PASS cho Backup/khôi phục. Kết luận hiện tại: đã xác định được lỗi vận hành có nguồn; chưa có đủ dữ liệu để chọn và thực hiện sửa DB thật.

Reviewer phiên riêng kết luận PASS cho SQL chuẩn bị đọc metadata, chưa chạy DB thật. SQL chỉ khám phá cấu trúc ledger, chưa chứng nhận lịch sử đã áp dụng; ACL bảng/RLS không đủ kiểm quyền hiệu lực, đặc biệt ACL null không có nghĩa không có quyền. Còn kiểm schema/function/default ACL, trigger và các schema riêng trước kết luận tổng thể.
