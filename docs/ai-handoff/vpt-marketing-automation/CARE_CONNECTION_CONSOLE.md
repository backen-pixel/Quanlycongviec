# Đối chiếu hồ sơ khách — bản làm việc

Ngày 03/10/2026. Thay đổi cục bộ trên HEAD `1dce6d2321857ae24d0696efcba1592d1620ce62`, chưa commit hoặc phát hành. Không dùng kết quả PostgreSQL233 của SQL680 để chứng nhận SQL681.

## Thay đổi

- Màn hình trong Chăm khách tìm tên, số điện thoại hoặc mã CRM, tối đa20 kết quả cùng công ty và người nhận/khu vực hợp lệ. Tìm kiếm không tự xác nhận danh tính. Tenant cả hai NULL tuân cùng luật context; chỉ một phía NULL bị loại.
- Người vận hành chọn hồ sơ, đọc tin đến, chọn bằng chứng và xác nhận căn cứ. Không gõ UUID. Không tự đổi trạng thái khách hợp lệ, STOP, người tiếp quản hoặc gửi tin.
- SQL681 thêm `mappingComplete` để phân biệt nối đủ Lead/Customer, nối một phần và mâu thuẫn. Giữ nghĩa cũ của `alreadyLinked` và tài liệu tạo version SQL680. UI ưu tiên cảnh báo `canLink=false`; mapping thiếu Customer còn đường hoàn thiện bằng chứng.
- Yêu cầu LINK được lưu nguyên trong sessionStorage theo người/công ty/hội thoại trước khi gửi. Mất phản hồi thì giữ cùng request/command. Lỗi quyền hoặc context đổi không bị diễn giải thành chưa ghi.
- Đối chiếu và kết thúc dùng CLOSE, lưu ý định này trước khi gửi. SQL cùng khóa giao dịch: nếu LINK đã ghi thì trả ALREADY_RECORDED và giữ liên kết; nếu chưa ghi thì lưu cancellation và chặn LINK đến muộn. Reload sau CLOSE chỉ tiếp tục CLOSE.
- API mới GET `/facebook/customer-care/connection/choices`, POST `/facebook/customer-care/connection/close`. Cả hai lấy actor từ phiên đăng nhập, yêu cầu Primary và `VPT_CARE_CONNECTIONS=1`. Enrollment Page vẫn riêng, mặc định rỗng; không có UI tự cấp quyền.

## Kiểm chứng và phần còn chờ

Local26 ca API/state PASS; syntax backend/test và diff được kiểm. Reviewer độc lập đã tìm hai P2 (tenant NULL và mapping thiếu/mâu thuẫn); bản làm việc đã sửa, kết luận cuối cần kiểm lại. Không coi unit tests là browser hoặc PostgreSQL.

Đã viết11 ca PostgreSQL mới vào `careConnections.console.cases.js`, nối sau SQL680: chạy migration hai lần, giữ version cũ, tìm kiếm literal/có giới hạn, quyền và tenant, mapping cũ một phần/mâu thuẫn, đóng lặp, lệnh đến muộn, rollback, hai thứ tự cạnh tranh LINK/CLOSE, STOP, actual API qua frontend state. **Chưa chạy các ca này.** Workflow đã nhận migration/component/test mới.

Bước tiếp theo trong phạm vi đã giao:

1. Chạy PostgreSQL16 cô lập và build; sửa lỗi rồi lấy kết luận review đúng phiên bản.
2. Kiểm component thật trên trình duyệt dữ liệu giả: tìm/chọn, mất phản hồi, reload, giữ UUID/command, CLOSE không quay lại LINK, đổi người/hội thoại, quyền mất, phản hồi cũ, mapping một phần và mâu thuẫn. Chưa đăng nhập CRM thật.
3. Hoàn thiện chuyển các đường ghi cũ theo bản đồ bên dưới trước enrollment thật; không mở đồng thời hai đường ghi.
4. Khép cấu hình AI, người nhận/lịch, phạm vi đo CPQL, ngoại lệ/khôi phục và UAT; trình Founder gói phát hành. Quyết định khóa AI còn chờ, không gọi mô hình/API trước quyết định đó.

## Chuyển đường ghi cũ — kết quả khảo sát độc lập, chưa triển khai

Các đường nhiều bước có thể ghi phụ trước khi guard mapping từ chối; phải kiểm trước bước ghi đầu tiên và xử lý việc đang chạy khi chuyển Page:

- `backend/src/routes/facebook.js`: xóa contact xóa message trước; gộp trùng thay Customer/Lead và các bảng con; helper tạo Lead ghi Customer trước RPC639; một số nhánh không kiểm `{error}` trả về. GET contact còn tự sửa mapping. Rà cả batch scan/phone cleanup và tạo thủ công.
- `backend/src/server.js`: cron tạo Customer/Lead/contact không đi qua cùng helper.
- `backend/src/helpers/facebookLeadDeleteWhenNoPhone.js` và script `rescan-fb-inbound-phones.js`: xóa dữ liệu con hoặc thêm blocklist trước khi mapping bị từ chối.
- `backend/src/routes/crm/shared/helpersBundle.js` và `routes/leadDuplicates.js`: gộp Customer/Lead và chuyển dữ liệu con qua nhiều bước.

Phạm vi Page phải đọc authoritative enrollment trên Primary, gồm hàng `active=false`; lỗi đọc phải dừng thao tác. Rà cả liên kết trực tiếp/ngược của bản giữ và bản gộp. Preflight nhiều HTTP call không tự giải quyết race với enrollment: cần tạm dừng và chờ tác vụ cũ kết thúc hoặc chuyển vào dịch vụ giao dịch phù hợp. Cần kiểm cả Page chưa chuyển và batch trộn hai loại; không tuyên bố SQL680 đã bảo vệ nguyên tử toàn bộ ứng dụng cũ.

## Hoàn tác và giới hạn

Chưa áp DB thật, merge, deploy hoặc mở ngân sách. SQL681 và backend/UI phải nghiệm thu cùng gói vì API yêu cầu trường `mappingComplete`; không bật UI mới khi DB chỉ có680. Khi cần dừng, tắt điểm nối và giữ audit/cancellation; không xóa giao dịch hoặc mở lại đường ghi không an toàn.

Mục tiêu tạm thời vẫn250.000đ/khách hợp lệ trả phí duy nhất, tổng chi gồm phần không tạo khách. Chưa có dữ liệu thật chứng minh đạt mục tiêu. Full goal ACTIVE; Google và kênh còn lại mở tiếp sau tuyến đầu được nghiệm thu.
