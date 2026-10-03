# Bằng chứng điểm nối khách và ca khảo sát

Runtime được kiểm: `b4e2def38d2cfb165f94d55004e56ac5e9a682ba`, tree `4eb3574f33403ae5b11441c19dbc72e8d98a1b6b`. SQL680/API từ ebbda5b; b4e2def bổ sung sửa API timestamp. Follow-up 692baf6/207a8c9 sửa và mở rộng ca kiểm. Không có tác động DB/Meta thật.

## Kết quả đúng phiên bản

- [Automation37130549591](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37130549591): cả10 job SUCCESS.
- [Intake PostgreSQL111224624373](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37130549591/job/111224624373): **233 PASS /0 FAIL /0 SKIP**, gồm11 ca mới222–232.
- [Census111224624418](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37130549591/job/111224624418): **88/0/0** và HTTP **1/0/0**.
- [Node22 111224624339](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37130549591/job/111224624339): **843/0/0 +11/0/0**, Node18 SUCCESS.
- [Frontend111224624389](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37130549591/job/111224624389):10.327 modules,39,57 giây,SUCCESS.
- [Report37130549552](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37130549552) và [Messenger37130549550](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37130549550): SUCCESS.
- Checkout log và Git API xác minh merge CI `0704856e01de4354c62e2e08e46f69de25c01512` có parents base `e16c885ae7c2305645be02a1227bf378cb59137f` và runtime b4e2def; tree bằng đúng tree runtime.

Local42 ca liên quan PASS. Reviewer phiên riêng tự chạy42 ca và tự đọc log đúng phiên bản; kết luận **PASS phạm vi SQL680/API và hành trình dữ liệu giả**, không còn finding chặn trong phạm vi này.

## Điều đã chứng minh

Migration áp hai lần trong PostgreSQL16 cô lập. App role không có quyền đọc/ghi bảng và permit private; sai công ty/người, Page chưa enrollment, thu hồi người phát hành khi lệnh đang chờ, trigger tắt và sai isolation đều bị từ chối.

Hai yêu cầu đồng thời cùng mã chỉ lưu một mapping/audit. Bằng chứng sai thread, stale view và crash rollback không để lại liên kết nửa chừng. Không ghi đè mapping khác hoặc tự mở STOP. Direct writes, private permit giả, DELETE/TRUNCATE và RPC cũ không vượt guard. Inverse phục hồi khác Lead được đưa vào rà; hai session UPDATE inverse và link cùng chờ gate không tạo danh tính thứ hai. RPC639 chờ gate trước khi lấy khóa contact.

Ca232 tạo Lead qua actual signed intake service + readVerifiedLead với Graph giả; hội thoại bắt đầu chưa có facebook_contact. Sau xác nhận danh tính có bằng chứng, ca đi qua actual availability API → frontend availableOptions → actual proposal API → actual dispatch worker với provider giả → signed echo/click → đúng một booking → handoff read/ack của nhân viên → cohort. Webhook lặp không thêm booking; STOP giữ booking và dừng chăm sóc. Không seed contact–Lead hoặc booking để làm ca này PASS.

Actual collector và dịch vụ lưu chi chạy cho toàn bộ roster tài khoản thử. Báo cáo giữ tổng250.000đ, trong đó50.000đ từ tài khoản không có Lead. Đây không phải CPQL250.000đ: ca chưa chấp nhận đủ census/đích/xuất nguồn, nên costPerQualifiedLeadVnd=NULL và targetMetToDate=false.

## Lỗi tìm thấy, không che bằng fixture

- Ban đầu thiếu khóa người phát hành và projection từ chối phone=NULL. Đã sửa khóa cùng FOUND, nhận phone thiếu và kiểm bằng chứng NULL.
- Xung đột thứ tự khóa RPC639 và inverse phục hồi đã sửa bằng wrapper/gate/guard cùng kiểm đồng thời.
- Ca thử đầu dùng kỳ1 ngày thay vì30 ngày bị từ chối đúng; sửa fixture về kỳ30 ngày, không nới luật.
- Scope-acceptance regression cũ không thấy lock do snapshot pg_stat_activity trong transaction. Thêm pg_stat_clear_snapshot mỗi lần quan sát và tối đa5 giây, giữ điều kiện active/Lock và assertion42501; cleanup luôn khôi phục fixture sau khi pending kết thúc. Bản sau census88/0/0.
- Ca dùng giờ +00:00 phát hiện lỗi thật SQL→API→UI→proposal. Sửa API chuẩn hóa giờ sau kiểm phạm vi/thời hạn; regression dùng module thực và PG journey gọi API. Không sửa lệnh đã lưu khi retry và không nới validator SQL.

## Giới hạn và việc còn lại

Không có browser nghiệm thu giao diện liên kết mới vì giao diện này chưa xây. Kiểm UI-state trong Node không thay nghiệm thu màn hình. SQL guards không chứng nhận các bước phụ của ứng dụng cũ qua nhiều HTTP call là nguyên tử; việc chuyển các đường gọi, đối soát dữ liệu, đo tải và khôi phục còn phải làm trước enrollment.

Chưa có AI model, UAT, dữ liệu thật đạt250k, đa kênh hoàn chỉnh hoặc Founder release. Cấu hình AI/lịch/người nhận vẫn theo quyết định đang chờ. Full goal ACTIVE. [Hợp đồng và bước tiếp](CARE_CONNECTION_ACCEPTANCE.md).
