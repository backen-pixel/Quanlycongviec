# Thu quyền anon/authenticated trên schema public

Phạm vi: chỉ schema `public`. Không chạy các file này từ Codex. Người vận hành DB có quyền phù hợp chạy trên từng database; kết quả audit và snapshot là bằng chứng riêng của từng database, không commit dữ liệu thật. `security_snapshot.anon_exposure_pre_700` chứa metadata ACL/policy, không chứa hàng nghiệp vụ.

## Thứ tự và người thực hiện

1. **Bước 0 — người vận hành DB:** chạy `database/audit/anon_exposure_audit.sql` trên primary và backup, lưu kết quả đếm và tên object riêng. Đối chiếu quyền của `anon`, `authenticated`, bảng tắt RLS, policy `true`, hàm `SECURITY DEFINER`, view và default ACL. Chạy `database/audit/anon_exposure_snapshot.sql` trên **mỗi** database ngay trước khi sửa. Snapshot dùng tên cố định và cố ý báo lỗi nếu đã có: không ghi đè bằng chứng cũ.
2. **Bước 1 — người vận hành staging:** tạo bản sao DB, chạy `database/700_revoke_anon_public_access.sql` trên staging. Chạy lần hai để kiểm tính lặp lại. File là một transaction, timeout khóa 3 giây; nếu lỗi, transaction rollback toàn bộ. Không chạy production khi chưa có Founder duyệt riêng.
3. **Bước 2 — QA/backend:** chạy lại audit trên staging. Các phần 1–5 phải không có object; phần 6 không được còn grant public schema cho anon/authenticated và function `PUBLIC`. Dùng `ANON_SMOKE_TARGET=staging`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` của staging chạy `cd backend; npm run test:anon-exposure`. Script in tên phép thử và mã HTTP, không in dữ liệu. Mọi GET/POST/PATCH/DELETE bốn bảng và RPC phải PASS. Chạy các smoke test hiện có `test:tenant`, `test:crm-access`, `test:crm-http`, `test:crm-outbox`, `test:shared-workspace`, `test:query-guard` với cấu hình staging. Đăng nhập web, mở CRM/SX/VC, tải ảnh Kiến thức và mở một app mobile. Theo dõi log backend để phát hiện `42501 permission denied`.
4. **Bước 3 — Founder phê duyệt phát hành; người vận hành DB thực hiện:** sau khi review độc lập và staging đạt, chạy audit, snapshot và migration trên primary rồi backup ngoài giờ cao điểm. Theo dõi log 30 phút và chạy audit sau sửa trên cả hai. Giữ kết quả đếm trước/sau ngoài git.

## Hoàn tác

Nếu nghiệp vụ lỗi, người vận hành chạy `database/700_revoke_anon_public_access_rollback.sql` trên **đúng database đã snapshot**, rồi chạy audit và so với kết quả trước sửa. Script lấy quyền và grant option của `PUBLIC`, `anon`, `authenticated`, `service_role`, trạng thái RLS và định nghĩa policy từ `security_snapshot.anon_exposure_pre_700`. Giữ snapshot để đối chiếu; không dùng snapshot primary cho backup. Nếu object bị sửa/xóa sau snapshot, rollback có thể dừng và cần phục hồi thủ công từ backup catalog tương ứng. Báo Founder và xác định nguyên nhân trước khi phát hành lại.

## Điều cần theo dõi

- Bất kỳ `42501` từ backend có thể cho thấy đường đi không dùng `service_role` hoặc quyền backend khác với giả định. Dừng phát hành và kiểm tra đường gọi, nhất là khi failover sang backup.
- Backup replication/sync có thể ghi lại ACL hoặc policy cũ, hoặc đồng bộ snapshot không đúng thời điểm. Audit cả hai database sau migration và sau chu kỳ sync.
- `ALTER DEFAULT PRIVILEGES ... IN SCHEMA public` không hủy được quyền `PUBLIC EXECUTE` mặc định toàn cục của PostgreSQL cho **hàm mới**. Không đổi default của schema `auth`/`storage`/`realtime` trong migration này. Quy trình tạo hàm mới trong `public` phải `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` trong cùng migration tạo hàm; audit sau mỗi phát hành. Nếu muốn chặn mặc định toàn cục, cần quyết định riêng vì ảnh hưởng các schema khác.
- `GRANT ALL` cho `service_role` trên bảng/sequence và `GRANT EXECUTE` trên hàm được cấp trực tiếp để backend không phụ thuộc grant `PUBLIC`; rollback phục hồi ma trận quyền được snapshot.
