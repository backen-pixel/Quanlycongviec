# Dashboard tư vấn và khảo sát

Phạm vi từ81584f8: nối vận hành chăm khách với dashboard Marketing, không phải báo cáo chuyển đổi theo nhóm quảng cáo. Khách hôm nay cần được xử lý ngay, trong khi phép đo chi phí/khách dùng ngày Việt Nam đã hoàn tất.

## Phạm vi dữ liệu và chỉ số

Dashboard vận hành dùng toàn công ty được chọn: hội thoại Messenger đã vào Business OS và lịch khách đã xác nhận qua dịch vụ khảo sát. Không phụ thuộc trial, ngày quảng cáo, bộ lọc Page hay nguồn trả phí. Chưa bao phủ lịch thủ công, lịch ngoài hệ thống, hoặc kênh chưa tích hợp. Nhãn và API giữ `adCohortAttribution=false`; số lịch theo kỳ quảng cáo vẫn chưa được quy thuộc, không lấy số toàn công ty thay vào đó.

- Tin đến chưa có tin đi mới hơn được đếm từ thời điểm trong nhật ký hai chiều, không từ thứ tự webhook đến hoặc mode WAITING. Timestamp bằng nhau hoặc tương lai là ngoại lệ; không coi đó là chứng minh đã tư vấn xong.
- HUMAN_REQUESTED và HUMAN_ACTIVE là trạng thái công việc, không phải bằng chứng đã trả lời. Người phụ trách/tiếp quản không còn hợp lệ vẫn vào hàng cần xử lý.
- OPTED_OUT loại hội thoại khỏi follow-up, giữ trạng thái riêng. Không xóa lịch đã xác nhận. STOP trên một thread không tự thay luật Domain cho các thread khác của cùng nhóm; các bucket không cộng thành số khách duy nhất.
- Số nhóm khách cần xử lý được gộp bằng chính sách identity CRM hiện có. Mapping Messenger hiện hành không chứng minh qualification hay nguồn quảng cáo. Thiếu mapping hoặc identity chưa đối soát làm tổng khách duy nhất thành chưa xác định; số hội thoại/lịch cùng ngoại lệ vẫn hiển thị.
- Lịch hiện hành cần `scope_ready`, `assigned`, `consistent` từ handoff_inventory. Tách sắp tới, đang trong giờ hẹn và đã qua giờ nhưng chưa có bằng chứng hoàn tất. ACK của nhân viên chỉ xác nhận nhận hồ sơ, không xác nhận khảo sát xong hoặc khách vắng mặt.
- Lịch/người nhận bị đổi đi vào ngoại lệ; lịch sử đã đặt vẫn giữ. Phạm vi bị chuyển công ty chỉ trả định danh hồ sơ nội bộ và trạng thái không khả dụng, không trả tên/liên hệ/lịch/nội dung ngoại công ty.

## Kiến trúc và quyền

SQL673 bổ sung RPC chỉ đọc `marketing_operations_snapshot(actor,company)`, sau SQL655/659/668/671. Kiểm explicit service_role + admin hiện hành/company/tenant trước đọc. Helper identity/handoff STABLE và mọi fact vận hành dùng cùng một câu SELECT MVCC. Không gọi read có ghi, không sửa business rules của booking/care/identity.

Backend `/crm/marketing-operations?company_id=...` lấy actor từ phiên đăng nhập, chỉ primary, mặc định tắt qua `VPT_MARKETING_OPERATIONS_REPORT=1`. Không nhận ngày hoặc trial do client tự gán. Kiểm phạm vi phản hồi, schema và giới hạn; lỗi nguồn/thiếu migration không được đổi thành0. Giới hạn5.000thread/5.000handoff cùng giới hạn identity; vượt giới hạn báo unavailable. Giới hạn này là giới hạn kết quả, chưa là chứng minh hiệu năng truy vấn production.

UI remount theo company/actor, hủy và bỏ phản hồi cũ, xóa số khi tải lại hoặc lỗi. Hiển thị tối đa50 mục cần xử lý, kèm tổng số mục (một hồ sơ có thể có nhiều việc). Link tới hộp thư/bàn giao yêu cầu chọn đúng công ty tại trang đích; chưa giả làm deep-link tự chọn scope.

## Kiểm chứng và hoàn tác

Unit/service/UI-state: mode/reply, thời điểm, identity nhiều thread, STOP, lịch/ACK/mapping thay đổi, bounds, scope/actor/primary. PostgreSQL cô lập dùng booking qua worker/webhook giả đã có; migration áp dụng hai lần, quyền/current scope, ACK/STOP, foreign mapping, out-of-order, snapshot đồng thời và quá giới hạn. Browser chỉ component thật với API giả, không CRM/Meta thật. Không thay các ca hiện có để bỏ kiểm soát.

Rollback: tắt flag báo cáo mới để dừng đọc; giữ toàn bộ hội thoại, lịch, ACK và audit. Không migration xóa dữ liệu hoặc bật quyền legacy. Phát hành cùng gói kiểm chứng/UAT và quyết định Founder, chưa được mở trong increment này.

Full goal còn tiếp tục: quy thuộc lịch cho kỳ quảng cáo nếu dùng làm tín hiệu tối ưu, đối soát phạm vi/ID nguồn và chốt kỳ; ngoại lệ gửi/hủy/đổi và writer lịch cũ; cấu hình/nội dung/nhân sự/quyền runtime thật, hiệu năng/khôi phục, nghiệm thu Facebook→CRM→dashboard và mở Google/kênh tiếp theo. Không tự kết luận đạt250.000đ/khách hoặc mở ngân sách.
