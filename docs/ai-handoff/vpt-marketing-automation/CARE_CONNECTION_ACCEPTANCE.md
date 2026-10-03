# Nối hội thoại với hồ sơ CRM — hợp đồng và nghiệm thu

Ngày 03/10/2026. Bản đã kiểm: `b4e2def38d2cfb165f94d55004e56ac5e9a682ba`. SQL680/API và hành trình bằng dữ liệu giả đã PASS trong phạm vi dưới đây; toàn mục tiêu vẫn ACTIVE, chưa UAT hoặc phát hành. [Bằng chứng đúng phiên bản](CARE_CONNECTION_REVIEW.md).

## Điểm nối đã bổ sung

Tiếp nhận Lead Ads tạo Customer, Lead và bằng chứng quảng cáo nhưng không có PSID của người nhắn Messenger. Luồng hội thoại lưu thread/message; định tuyến chăm sóc dựa vào facebook_contacts. Hai nguồn không mặc nhiên là cùng người.

SQL680/API nối hai nguồn bằng lệnh có phạm vi công ty, phiên bản hồ sơ, mã yêu cầu bất biến, tin nhắn đầu vào, xác nhận danh tính và lý do của người vận hành. Quyền actor, người phát hành phạm vi Page, Lead, Customer, người nhận và khu vực CRM được kiểm lại khi ghi. Liên kết và audit nằm cùng giao dịch.

Đây là xác nhận của người vận hành, chưa phải AI tự xác minh. Không suy diễn bằng tên/số điện thoại, không tự tạo Lead/Customer, phân loại hợp lệ hoặc mở gửi tin. Số điện thoại CRM được phép thiếu. STOP và trạng thái người tiếp quản không đổi.

Lệnh chỉ nối lần đầu hoặc cùng mapping. Contact đã có Lead/Customer khác, hoặc Lead khác còn facebook_contact_id dùng khôi phục, được giữ để rà. Không trả ID của inverse khác trong projection. Hai đường ghi contact và inverse được bảo vệ; RPC639 lấy cùng gate trước khóa contact và từ chối Page đã được quản lý.

API GET /facebook/customer-care/connection và POST /facebook/customer-care/connection/link lấy actor từ phiên đăng nhập. VPT_CARE_CONNECTIONS mặc định tắt; connection_pages riêng đang rỗng. Không có endpoint cấp quyền enrollment. Receipt replay là kết quả lịch sử kèm currentLink; careMode trong receipt không cấp quyền gửi hiện hành. Cần đọc lại hội thoại trước hành động tiếp.

## Hành trình đã kiểm

Khách mới vào qua webhook ký HMAC và actual intake service, đọc Graph giả để tạo Lead và bằng chứng nguồn. Một hội thoại chưa liên kết được nhận qua actual signed receiver. Lệnh có bằng chứng nối đúng Lead đó; đánh giá hợp lệ dùng dịch vụ CRM.

Ca thử gọi actual availability API → hàm trạng thái frontend → actual proposal API → worker gửi với provider giả → webhook echo/khách xác nhận → một booking → người khảo sát đọc và xác nhận nhận việc → cohort. Nhận lặp không tạo thêm lịch; STOP giữ lịch đã đặt và dừng chăm sóc.

Collector và dịch vụ lưu chi tiêu chạy cho mọi tài khoản trong phạm vi thử, gồm 50.000đ của tài khoản không có Lead; tổng chi 250.000đ được giữ. Đây là tổng tiền của dữ liệu giả, **không phải bằng chứng chi phí 250.000đ/khách đã đạt**. Chưa xác nhận đầy đủ census/đích lịch sử/xuất nguồn trong chính ca này nên CPQL công bố vẫn NULL, targetMetToDate=false.

## Lỗi tích hợp đã khép

SQL availability trả timestamp có offset +00:00, còn lệnh proposal yêu cầu UTC Z. API hiện chuẩn hóa timestamp sau khi kiểm phạm vi và thời hạn, trước khi frontend lưu yêu cầu mới. Không thay đổi yêu cầu đã lưu khi retry. Regression đi qua các module thực, không chỉ dùng mock Z.

Giữ khóa quyền người phát hành Page tới lúc ghi; từ chối hàng không tồn tại khi khóa. Kiểm READ COMMITTED ở cả statement và row guard; từ chối bằng chứng nội dung rỗng/NULL. Liên kết phục hồi và RPC cũ có kiểm đồng thời riêng.

## Phần cần hoàn tất trước vận hành

1. Màn hình chọn Lead, đọc bằng chứng và xác nhận; giữ yêu cầu chưa rõ kết quả qua tải lại, không bắt người vận hành gõ UUID.
2. Chuyển các đường gọi ứng dụng cũ trước khi enrollment Page: tạo khách tự động/thủ công, sửa liên kết và xóa contact/message. Guard DB từ chối mapping sai nhưng không chứng nhận các bước ghi phụ qua nhiều HTTP call là nguyên tử. Tạm dừng đường cũ và xử lý việc đang chạy khi chuyển; kiểm hồi quy cả Page chưa chuyển.
3. Đo tác động gate toàn cục trên INSERT Lead và thay đổi inverse, đối soát dữ liệu cũ, kiểm khôi phục và ngoại lệ vận hành. Không mở hai đường ghi cho cùng nhóm dữ liệu.
4. Nối cấu hình AI, dữ liệu tư vấn, lịch khảo sát và người nhận đã xác nhận; lựa chọn khóa AI đang chờ, không gọi mô hình/API trước quyết định đó. Hoàn tất phạm vi CPQL, các điểm nhận và kênh còn lại.
5. Review/UAT trên đúng phiên bản triển khai, rồi trình Founder gói phát hành và mở thử. Kiểm bằng dữ liệu giả không thay UAT.

## Giới hạn kinh doanh và hoàn tác

Mục tiêu hiện hành là 250.000đ/khách hợp lệ trả phí duy nhất. 300 khách ở mức mục tiêu tương ứng 75 triệu; 100 triệu vẫn là hạn mức một đợt 30 ngày gồm Facebook, không bắt buộc chi hết hoặc tự lặp lại. 7% doanh thu là đánh giá sau, không suy ra từ Lead rẻ.

Chưa có dữ liệu thật chứng minh mục tiêu, chưa merge/deploy/cấp quyền ghi thật/mở ngân sách. Hoàn tác ưu tiên tắt điểm nối và giữ audit/receipt; không xóa lịch sử, gỡ bảo vệ hoặc mở đường ghi cũ không an toàn. SQL680 chưa được duyệt áp DB thật.
