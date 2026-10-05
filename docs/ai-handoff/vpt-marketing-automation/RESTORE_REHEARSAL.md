# Diễn tập khôi phục dữ liệu Marketing–CRM

Ngày 04/10/2026. SQL697 và `facebookRestore.postgres.test.js` kiểm khôi phục logical backup sang cluster PostgreSQL16 thứ hai. Đây là chuẩn bị trong môi trường cô lập; chưa có backup, khôi phục hoặc lệnh bảo trì trên hệ thống thật.

## Vấn đề và cách xử lý

SQL687 lưu tên bảng cùng OID để phát hiện bảng bị thay thế. Logical restore có thể cấp OID khác; khi đó `inspect/set_hold` cũ phải từ chối thay vì bỏ qua kiểm soát. SQL697 bổ sung `restore_plan` và `rebind_restored_manifest` chỉ dành cho DB operator tin cậy. Không có grant cho anon, authenticated hoặc service_role, không API/UI và không SECURITY DEFINER.

Plan yêu cầu nguyên tập tên bảng trong graph root/FK, loại bảng thường không partition/inheritance và đúng trigger ALWAYS/guard/type/arguments. Lệnh gắn request, revision, hash manifest lưu trong backup, hash đích và tham chiếu backup/phát hành. Khóa bảng theo cùng thứ tự SQL687 rồi khóa state, tính lại plan, thay metadata OID cùng audit trong một giao dịch. DELETE+INSERT manifest tránh UNIQUE va chạm khi OID cũ/mới hoán vị. Audit cũ giữ nguyên tên/OID/hash lịch sử; audit restore lưu cả hai phía.

Kết thúc rebind luôn giữ/bật hold và tăng revision; không mở ghi nghiệp vụ. Replay cùng lệnh trả kết quả lịch sử/trạng thái hiện hành, không tự bật lại nếu sau đó đã có lệnh tắt hold. Dừng hold vẫn cần set_hold với revision/hash mới và bằng chứng drain/phát hành. Không thay UNKNOWN, claim, quota, receipt hoặc kết luận chi phí.

Tên bảng và trigger khớp chưa chứng minh dữ liệu/FK giống backup. Tham chiếu backup/phát hành là xác nhận của operator, không phải chứng thực tự động. Chỉ dùng rebind sau khi đã đối chiếu artifact, schema, dữ liệu và quyền trên target cô lập.

## Diễn tập tự động

- Chạy sau suite intake/care/survey hiện có, trên dữ liệu giả do suite tạo. Hai service PostgreSQL16 riêng, kiểm system_identifier khác nhau, DSN loopback/tên DB/cổng/credential test cố định; target bắt buộc rỗng. Không app/worker/model/provider được khởi động trên target.
- Cài697 hai lần trên nguồn, bật hold qua687 trong DB test. Lấy inventory và pg_dump custom archive từ cùng exported snapshot. Archive chỉ nằm trong RAM của tiến trình CI, không in nội dung, không upload; log hash SHA256/kích thước/số bảng.
- Target có ba role NOLOGIN được cấp lại theo fixture và đối chiếu thuộc tính. pg_dump không bao gồm role toàn cluster; đây không phải backup role Supabase/Auth hoặc bí mật môi trường. Giữ owner/ACL trong archive; pg_restore dùng single-transaction và exit-on-error, không bỏ ACL, không dùng clean để ghi đè DB có sẵn.
- Đối chiếu toàn bộ bảng fixture bằng số dòng và digest, sequence, schema/owner/ACL/RLS, cột/default, FK/constraints, trigger, function và index trước rebind. Yêu cầu có khách, Lead, care events, booking, handoff và inference receipts thực sự trong fixture.
- Chứng minh lỗi OID của inspect trước rebind; kiểm role không đọc private hoặc rebind; manifest/hash/revision/guard/graph/inheritance sai bị từ chối; chờ khóa có quan sát và timeout không ghi một phần; OID permutation và snapshot inactive; lệnh cạnh tranh cùng mã có đúng một audit.
- Sau rebind, giữ nguyên mọi bảng nghiệp vụ và audit cũ, schema và sequence; chỉ manifest/state/restore_events đổi. Kiểm mọi bảng trong manifest vẫn bị hold, service đọc đúng tổng usage và UNKNOWN/reservation; replay sau release không bật lại hold. Release thử nằm trong giao dịch rollback, target cuối vẫn held.

Node syntax đã kiểm cục bộ; rehearsal chưa chạy local vì không có PostgreSQL/Docker. CI a6c523c có intake502 PASS/0 fail, rehearsal2 PASS/9 fail. Lỗi đầu là inventory hiểu ACL NULL thành tập rỗng trong khi PostgreSQL dùng quyền mặc định; các lỗi sau phụ thuộc bước so sánh đầu. Harness sửa chuẩn hóa ACL bằng acldefault đúng loại/owner (sequence dùng loại s), giữ grantor/grantee/grant-option và thêm ca phát hiện grant PUBLIC thay đổi. Hai sequence synthetic có last_value700/is_calledtrue và901/false, cấu hình khác nhau, được yêu cầu tồn tại trước backup và đối chiếu sau restore/rebind; tránh kết luận từ tập rỗng. SQL697 không đổi. CI/review độc lập bản sửa đang chờ; không dùng test SKIP làm bằng chứng PASS.

Quyền mặc định tham chiếu [acldefault PostgreSQL16](https://www.postgresql.org/docs/16/functions-info.html). Trạng thái sequence trong rehearsal được lấy khi không có writer; snapshot không thay thế yêu cầu dừng writer/ngoại tác trong vận hành.

Nguồn công cụ: [pg_dump PostgreSQL16](https://www.postgresql.org/docs/16/app-pgdump.html), [pg_restore PostgreSQL16](https://www.postgresql.org/docs/16/app-pgrestore.html). Snapshot nhất quán của DB không tự chứng minh các tác động ở Meta/model đã hoàn tất.

## Kết quả đúng phiên bản

Bản kiểm `eb42ff85b04c98f214a4af22a2660b50920f55f5`, tree `d8f775404218fa87282afcb55e1a62bd2fb23397`; SQL697 giữ nguyên từ a6c523c. [Automation 37200820753](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37200820753) đạt cả10job:

- Node18 và22 mỗi bản1.412 PASS/0 fail/0 skip (job111431964805 và111431964794).
- [PostgreSQL intake và restore](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37200820753/job/111431964694): intake502/0/0; rehearsal11/0/0 gồm10subtests+parent. Restore124bảng fixture, archive2.185.545bytes, SHA256 `f041559b477e49cc55079b96a343098038307c1f5d9846547592437324accfe3`. Hai sequence synthetic, quyền sau grant drift/rollback, OID permutation, khóa thật, replay và UNKNOWN đều đạt.
- Full frontend10.339modules/28,03s; [Report37200820778](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37200820778) và [Messenger37200820720](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37200820720) SUCCESS.
- CI merge `a7ae00c52d59b66d4449d23f6531cdedb71d0c4b` có cùng tree và đúng parents base `e16c885ae7c2305645be02a1227bf378cb59137f` + bản kiểm. Không thay rehearsal thất bại a6c523c thành bằng chứng đạt.

Reviewer độc lập đã đối chiếu published SQL/harness, log PostgreSQL/Node22/build, trạng thái10job và CI tree/parents; kết luận PASS checkpoint đúng bản trên. Không có finding chặn trong phạm vi. Nội dung lịch sử “đang chờ” phía trên mô tả lần chạy trước; kết luận hiện hành là mục này.

## Cổng vận hành và hoàn tác

Kiểm hồi quy tại7789338 sau khi thêm company riêng cho [hành trình AI](AI_CUSTOMER_JOURNEY.md): restore11/0/0, intake504/0/0, reviewer độc lập PASS. Selector test chọn operator của company có AUTHORIZED/UNKNOWN receipt; vẫn so toàn dữ liệu của mọi company và kiểm summary nguồn=đích/unresolved>0. Không đổi SQL697 hoặc thu hẹp danh mục backup. Bằng chứng archive/run mới nằm trong hồ sơ hành trình.

Kết quả này chỉ bao phủ schema/dữ liệu fixture và lệnh metadata riêng. Chưa chứng nhận schema đầy đủ của production, file trong object storage, role/auth platform, secret, lịch bên ngoài, replication/Primary–Backup, hiệu năng/RPO/RTO hoặc webhook phát sinh sau thời điểm backup. Các mục đó cần gói diễn tập đúng môi trường và quyết định Founder. Không mở worker từ chính sách/grant active được phục hồi: phải giữ môi trường cách ly, đối soát UNKNOWN và tác động ngoài DB trước khi nghiệm thu/chuyển luồng.

Hoàn tác: không dùng chức năng rebind nếu chưa đủ bằng chứng; transaction lỗi rollback toàn bộ. Sau rebind, giữ hold/audit mới; không viết lại OID cũ, xóa lịch sử hoặc mở writer cũ. Chỉ xem xét tắt hold qua hồ sơ vận hành đã duyệt. Migration không thay687 hoặc tự rebind khi cài.

Full goal ACTIVE: hoàn thiện cấu hình nội dung/người nhận/lịch/hạn mức AI, đối soát provider/nguồn thật, nghiệm thu toàn tuyến và Founder release vẫn còn. Chưa có kết quả250.000đ/khách thật.
