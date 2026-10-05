# Đề xuất và giao dịch đặt khảo sát — SQL665

Baseline `f0078683cd875a9b40b2f366dd168a7310534081`. Đây là phần Domain của tuyến xác nhận/đặt lịch, chưa phải luồng gửi tin và nhận xác nhận ngoài thực tế.

## Hành vi đã triển khai

`POST /facebook/customer-care/survey/proposal` tạo đề xuất từ option lịch đang hợp lệ. Server xác lập actor; DB kiểm quyền công ty hiện hành, care WAITING, mapping contact–Lead–Customer, nguồn lịch và nhân sự đã được chuyển quyền ghi theo SQL664. `GET .../survey/proposal` đọc trong phạm vi công ty hiện hành. Cờ `VPT_SURVEY_PROPOSALS=1` mặc định tắt, chỉ Primary.

Đề xuất giữ nguyên công ty, thread/Page/PSID, Lead/Customer, nhân viên khảo sát, chủ Lead, giờ, múi giờ, địa chỉ và buffer. Đổi đề xuất tạo ID/token mới và chuyển bản đang mở thành SUPERSEDED. Hạn tối đa 15 phút, không vượt giờ khảo sát hoặc hạn nguồn. Đề xuất chưa giữ chỗ; một giờ có thể được đề xuất cho nhiều khách nhưng chỉ một khách được đặt.

Mã xác nhận và lượt gửi nằm trong schema riêng; không xuất hiện trong public proposal view/Tool Gateway. Không có lệnh operator/AI tự ghi “khách đã đồng ý”, lấy token hoặc gọi book. Không cấp quyền runtime Agent bằng cách dùng tài khoản người tạo đề xuất.

Hàm nội bộ `crm_survey_control.book(message_id)` chỉ dùng biên nhận đã được đường tin cậy ghi vào `inbound_receipts`. Hàm đối chiếu đúng message/Page/PSID/token/hash, chờ bằng chứng SENT nếu khách xác nhận đến trước ACK, rồi kiểm lại quyền người tạo, trạng thái chăm khách, khách/người nhận, nguồn, enrollment, lịch bận và hạn xác nhận. Thay metadata hộp thư/đọc tin không làm mất hiệu lực; đổi thông tin nghiệp vụ liên quan thì phải đề xuất lại. Trạng thái từ chối cuối được lưu và replay nguyên kết quả, không làm mất nguyên nhân ban đầu.

`deliveries.started_at` là mốc bắt đầu lần gửi; `sent_at` là mốc quan sát ACK, có thể sau lúc khách click. Không dùng thứ tự ACK–click để phủ nhận một xác nhận được liên kết đúng. So sánh thời điểm tạo đề xuất/bắt đầu gửi ở độ chính xác mili giây của provider: cùng mili giây được chấp nhận, trước một mili giây bị từ chối. Transport phải giữ cùng proposal/token/payload khi đối soát, không tự gửi lại nếu lần trước chưa rõ kết quả.

Khi hợp lệ, DB lưu trong cùng giao dịch: một event CRM, một participant là nhân viên khảo sát, tiêu thụ xác nhận, audit và hàng bàn giao PENDING. Creator của event để NULL: actor được lưu trong audit, người nhận Sales được lưu trong bàn giao; họ không tự trở thành người tham dự/bận lịch. Kết quả là `BOOKED_HANDOFF_PENDING`, chưa khẳng định người nhận đã nhận hoặc khách đã được thông báo thành công.

Buffer đã hứa được giữ theo booking, kể cả roster sau này giảm buffer. Availability và lúc đặt đều kiểm cả khoảng này. Việc hủy/đổi lịch phải có lệnh riêng để giải phóng booking; chưa cho phép xóa reservation bằng sửa lịch cũ.

## Phần chưa tích hợp — vẫn là việc bắt buộc

- Dispatcher gọi Meta và đối soát receipt; hiện không có quyền ứng dụng để tạo private receipt hoặc thực thi book. Delivery đang QUEUED không có nghĩa đã gửi.
- [SQL666 nối signed webhook/quick reply với đúng token](SURVEY_CONFIRMATION_INGRESS.md); không dùng boolean từ model hoặc một tin “đồng ý” không liên quan. Generic echo vẫn chuyển HUMAN_REQUESTED. Cần nhận diện riêng echo đã khớp lượt gửi, Page/PSID, app và nội dung; echo chưa rõ nguồn tiếp tục chuyển người.
- Phải xét toàn bộ STOP/takeover trong một batch trước khi thực thi xác nhận, xử lý được ACK/echo/confirmation đảo thứ tự và mất phản hồi. Không tuyên bố gửi đúng một lần nếu provider không chứng minh được.
- Người nhận xem/ack bàn giao, UI đề xuất/xác nhận/trạng thái khảo sát, thông báo khách, hủy/đổi lịch có audit.
- Chuyển/chặn đường ghi lịch cũ có thể báo thành công sai, dữ liệu lịch thật, đo hiệu năng, sao lưu/khôi phục/failover và gói phát hành Founder.

## Bằng chứng kiểm thử và hoàn tác

Runtime243440d qua review độc lập PASS, local7, PostgreSQL123 (12 case mới), Node22 574 và toàn bộ10 job/full build; [bằng chứng đúng phiên bản](SURVEY_PROPOSALS_REVIEW.md). Fixture PostgreSQL owner mô phỏng riêng `deliveries` và `inbound_receipts`; đây là phép kiểm Domain, **không thay bằng chứng gửi Meta/HMAC/khách xác nhận end-to-end**. Đã kiểm customer metadata vs mapping, supersession, replay/từ chối, xác nhận trước ACK/cùng mili giây, hai khách tranh giờ, rollback sau event/participant/audit/handoff và expiry sau trigger chậm.

Chưa chạy migration thật, enrollment thật, gửi tin hoặc đặt lịch thật. Hoàn tác ưu tiên dừng tiếp nhận lệnh mới, giữ proposal/receipt/booking/handoff/audit, đối soát rồi bàn giao quyền ghi; không xóa giao dịch hoặc mở lại writer cũ khi còn booking được bảo vệ. Mục tiêu toàn bộ vẫn ACTIVE.
