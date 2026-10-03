# Survey Proposal Console — hợp đồng và phạm vi

## Mục đích
Người phụ trách xem giờ trống từ nguồn lịch đã xác nhận, tạo đề xuất để khách xác nhận và theo dõi trạng thái. Màn hình nằm trong chi tiết chăm sóc Facebook. Các worker gửi và đặt lịch hiện có vẫn tắt mặc định, cần enrollment/phát hành riêng. Tạo đề xuất không giữ chỗ hoặc xác nhận thay khách.

## Giao tiếp và kiểm soát
- GET /facebook/customer-care/survey/proposals: VPT_SURVEY_PROPOSAL_CONSOLE=1, Primary, người đăng nhập và công ty/hội thoại đã kiểm quyền. SQL679 chỉ nhận service_role; grant nhầm cho browser cũng không mở đường.
- GET availability và POST proposal dùng dịch vụ hiện có, có cờ bật riêng. Server chịu trách nhiệm quyền, lịch, địa bàn và dữ liệu hợp lệ.
- Proposal mới khóa thread, từ chối khi bất kỳ lịch sử gửi đề xuất/thông báo có SENDING hoặc UNCERTAIN. Replay UUID/body cũ chỉ đối chiếu, không reset gửi.
- Read/replay kiểm Page/contact/Lead/customer đang cùng phạm vi. Khi liên kết lịch sử không còn hợp lệ, danh sách chỉ trả ID/thời điểm và che nội dung; chi tiết/replay bị từ chối.
- Cùng snapshot cho care mode, lịch sử, tổng số và barrier. Hiện 50 mục gần nhất; tổng và ràng buộc gửi tính tất cả lịch sử.
- Không trả token xác nhận, payload gửi, PSID hoặc nội dung lỗi nguồn. Backend lọc trường và reason; các cờ confirm/resend/AI-send luôn false.
- Appointment hiển thị là nội dung đề xuất bất biến. Lịch hiện hành, bàn giao và hoàn tất khảo sát theo màn hình bàn giao; BOOKED không chứng minh lịch chưa đổi hoặc khảo sát đã xong.

## Giao diện và sự cố
Giờ nhập theo Việt Nam. Option có hạn kiểm tra và không giữ chỗ. Trước POST lưu UUID/body chính xác trong sessionStorage khóa theo actor/company/thread; có địa điểm khách đã trao đổi. Xóa sau receipt đúng hoặc lỗi xác định giao dịch không ghi; mất phản hồi giữ nguyên để đối chiếu. Không có nút bỏ qua request chưa rõ, gửi lại Meta hoặc xác nhận thay khách. SessionStorage chỉ tồn tại trong phiên/tab, không phải sổ giao dịch; lịch sử DB vẫn là nguồn chuẩn. Nếu bộ nhớ bị hỏng/khóa, dừng tạo đề xuất và đối soát hồ sơ máy chủ trước khi xử lý ngoại lệ.

Chuyển người/thread, unmount hoặc StrictMode vô hiệu hóa phản hồi cũ. Tải lỗi xóa dữ liệu cũ; STOP/takeover khóa đề xuất mới nhưng giữ lịch sử và khả năng đối chiếu yêu cầu cũ. HTTP40001 chỉ trả STALE_OPTION sau giao dịch rollback; UUID xung đột không được tự xóa.

## Kiểm chứng
Local30 ca liên quan PASS; 14 ca mới cho phép chiếu/phạm vi/quyền/cờ/giờ Việt Nam/request bất biến. SQL fixture gồm8 ca mới: migration hai lần, grant nhầm, helper private, booking/outcomes, Lead/customer/contact/Page drift, STOP, uncertain barrier, snapshot đồng thời, thu hồi quyền. CI PostgreSQL16 đạt222/0/0, Node22 đạt842/0/0, cả10job/build và regression PASS. Review độc lập PASS; browser component thật/API giả đã kiểm StrictMode, retry/reload, STOP, phạm vi, TTL và lỗi nguồn. [Bằng chứng đúng phiên bản và giới hạn](SURVEY_PROPOSAL_CONSOLE_REVIEW.md).

## Hoàn tác / phát hành
Ngừng cờ console để khóa đọc màn hình; nếu cần ngừng đề xuất mới, tắt cờ proposal và worker tương ứng trong gói vận hành đã duyệt. Giữ SQL679 kiểm quyền an toàn, receipt, audit và giao dịch đã tạo; không xóa dữ liệu hay khôi phục quyền cũ. Không mở DB thật, enrollment, AI provider hoặc Meta trong thay đổi này.

Full goal còn cần ngoại lệ vận hành và điểm nhận còn thiếu, cấu hình được xác nhận, UAT đúng phiên bản và Founder release. 250k là mục tiêu, chưa phải kết quả thật.
