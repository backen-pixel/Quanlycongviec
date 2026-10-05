# Đối chiếu Supabase sau đăng nhập — 05/10/2026

**Đã đọc được cả Primary và Backup. Không còn chờ đăng nhập.** Giao dịch chỉ đọc, không chạy migration/sync/restore, không chuyển DB hoặc cấp/thu quyền. Rủi ro HIGH; vận hành ứng viên vẫn HOLD. [Kết quả có cấu trúc](DB_CATALOG_20261005.json) ghi phạm vi và giới hạn.

Nguồn: Supabase SQL Editor của Primary `kdxypztstbeovyedmvem` (qlycv), Backup `atcfpgxkgbszglrelfgr` (QLCV_Backup). Các truy vấn SELECT nằm trong BEGIN READ ONLY, có timeout và kết thúc ROLLBACK; dùng Export JSON của UI để đọc hết các hàng thay vì lấy phần lưới đang hiển thị. Không lấy khóa, mật khẩu hay bản ghi khách. UI tự lưu câu truy vấn riêng theo hành vi SQL Editor.

## Những điều đã khép

| Hạng mục | Kết quả |
|---|---|
| Phiên bản DB | Cả hai PostgreSQL17.6; max_locks_per_transaction=64 |
| Cột gây lỗi đồng bộ | Primary có crm_leads.facebook_contact_id UUID nullable, FK về facebook_contacts(id) ON DELETE SET NULL và unique partial index. Backup **thiếu cột/FK/index thật**; refresh cache riêng lẻ không chữa được |
| Hàm atomic639 | Primary SECURITY INVOKER, owner postgres, search_path pg_catalog/public; anon/authenticated không EXECUTE, service_role có EXECUTE. MD5 prosrc `8df33c5a088a21f76c76296b05ca4fe0` khớp thân hàm SQL639 trong repo sau chuẩn hóa CRLF. Backup không có hàm |
| Chênh cấu trúc đã kiểm | So sánh cột bảy bảng, hàm atomic và trigger không nội bộ trên Lead/Contact: ngoài cột/hàm trên, Backup thiếu trg_crm_leads_has_crm_deal của SQL568. Không có khác biệt khác trong tập truy vấn; không phải so sánh toàn DB |
| Ledger tên630–699 | Primary có vpt639, vpt640, vpt641 và 649_va_cot_thieu_projects_drive_acl. Backup không có dòng khớp regex kể cả tiền tố vpt. Không kết luận toàn bộ migration chưa chạy, vì có thể có SQL thủ công/tên khác |
| Schema ứng viên | crm_survey_control, crm_legacy_hold, marketing_measurement chưa có ở cả hai DB; không coi các migration ứng viên đã được triển khai |
| Người nhận và phạm vi | Admin VPT active/admin, company/tenant khớp và cùng active; có phân công HCM/CT active. Page409741855550833 active, gắn đúng VPT/HCM/Admin; loại Bếp, stage TIẾP NHẬN và pipeline Lead active, không won/lost |
| Registry quảng cáo | Tìm account835757498658305 cả ID thuần và bỏ tiền tố act_ đều không có dòng trong fb_ad_accounts. Đây là thiếu binding trong registry đã kiểm, không chứng minh Meta không có tài khoản |
| Bản sao nền tảng | Supabase liệt kê Physical backup Primary lúc04/10/2026 22:33:43 UTC, tức05/10 05:33:43 VN. Chưa restore. UI nói rõ không bao gồm đối tượng Storage; lỗi clone nội bộ trước đó không có nghĩa không có bản sao nền tảng |

## Quyền DB là một lỗi cần sửa riêng

Tập kiểm: companies, crm_leads, customers, facebook_contacts, facebook_pages, facebook_lead_ads, users.

- Primary: anon, authenticated và service_role đều có schema USAGE và SELECT/INSERT/UPDATE/DELETE trên cả bảy bảng.
- Backup: anon không có bốn quyền bảng trong tập này; authenticated và service_role có.
- Companies tắt RLS. Sáu bảng còn lại bật RLS nhưng có policy PERMISSIVE, TO PUBLIC, FOR ALL, USING true; WITH CHECK true hoặc NULL trên policy crm_leads. Các policy được truy vấn riêng để xác nhận loại PERMISSIVE, không suy từ tên “service_all”.

Do đó quyền và policy đã kiểm **không tạo ranh giới công ty ở cấp DB cho các vai trò có quyền bảng**. Quyền EXECUTE chặt của RPC639 không che được đường CRUD trực tiếp. Chưa thử lấy dữ liệu khách qua API công khai; không có bằng chứng khai thác hoặc mất dữ liệu từ lượt kiểm này.

## Gói khắc phục cụ thể và thứ tự

1. **Ngăn quyền bị mở lại.** Chuẩn bị thay cơ chế cấp quyền rộng ở backupSchemaGrants, cả caller replication gặp401/403, sync theo lịch/thủ công và clone. Kiểm các luồng dùng bảng/RPC, thiết kế quyền tối thiểu cho backend và kiểm sai quyền/sai công ty trên PostgreSQL17 cô lập. Sau đó mới trình SQL thu quyền/RLS cụ thể; không sao chép quyền rộng của Primary sang Backup.
2. **Chứng minh restore.** Dùng bản sao được chọn trên môi trường cô lập và kế hoạch Storage riêng; kiểm schema, dữ liệu, ACL, trigger, schema private và lịch sử. Restore11 ca CI PostgreSQL16 chưa thay bước này. Chốt môi trường/chi phí/phạm vi trước khi tạo tài nguyên hoặc restore thật.
3. **Sửa Backup theo nền đang chạy.** Lập migration tiến tới cho phần thiếu của SQL639 cùng trigger SQL568/dependency đã đối chiếu; dùng ledger tên đầy đủ/fingerprint. Không chạy clone DROP CASCADE hoặc tăng max_locks như cách sửa mặc định. Không sửa file migration cũ.
4. **Đối soát replication.** Xử lý queue theo lô đã nhận diện, giữ định danh/audit; kiểm không trùng, đầy đủ dữ liệu/ràng buộc/quyền trước cân nhắc chuyển DB. Queue1.011 ở lượt trước là snapshot14:23, không phải số hiện tại.
5. **Khép tuyến Lead.** Registry account/form, nguồn khách/nguồn chi và binding có phiên bản còn thiếu. Chuẩn bị prerequisite của ứng viên, xác lập Primary-only và drain mọi writer; UAT nguồn → CRM → Admin → báo cáo đúng bản rồi trình Founder phát hành. SQL680 thay RPC639 bằng wrapper có gate; tuyệt đối không chạy lại639 sau680 để ghi đè gate.

Reviewer phiên riêng đối chiếu mã clone/grants/replication và bằng chứng đã thu: **đủ để lập gói khắc phục; HOLD vận hành**. Chưa kết luận gate DB/quyền/restore đã PASS. Khảo sát/lịch và AI gửi tư vấn thuộc gói sau, không phải lý do giữ riêng gói kiểm nhận Lead.

Review delta chín file hồ sơ: **PASS tính nhất quán**, không có finding chặn; đã kiểm JSON/diff, tính lại hash thân RPC639 và xác nhận các giới hạn snapshot/registry/bảy bảng. Đây là review tài liệu, không thay kiểm quyền/khôi phục/UAT hoặc quyết định áp dụng. Delta chỉ đổi hồ sơ; không chạy lại test runtime cho cùng mã đã có CI trong RELEASE_INTEGRATION.

Tài liệu này và JSON không là quyền thực thi DB thật. Chưa có lệnh sửa DB được chạy; quyết định phát hành/áp dụng cụ thể vẫn theo Founder sau gói kiểm thử, tác động và hoàn tác.
