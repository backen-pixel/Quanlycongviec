# Thông báo kết quả đặt khảo sát — SQL669

Phạm vi rủi ro cao: gửi tin cho khách và đọc lịch/quyền hiện hành. Mặc định tắt, chưa áp dụng DB thật, chưa gửi Meta thật. SQL669 tiếp nối SQL665–668 trong PR22; không thay kết quả đặt lịch hoặc receipt người nhận.

## Kết quả chuẩn và hàng chờ

Booking tạo ý định BOOKED trong cùng giao dịch. Chỉ confirmation riêng đã xác thực, bị từ chối và proposal REJECTED mới tạo NOT_BOOKED. Ingress BLOCKED, sai token, sai Page hoặc một receipt lỗi sau booking không tạo thông báo phủ định lịch. Mỗi proposal/kind chỉ có một ý định; migration không gửi bù lịch sử. Trước enrollment, ý định được giữ HELD và không tự mở lại khi đăng ký Page.

Claim BOOKED kiểm lại lịch, người phụ trách và membership, khách/Lead/Page/công ty, trạng thái chăm khách và bằng chứng gửi đề xuất. Không lấy hạn đề xuất hoặc roster làm hạn của lịch đã đặt. Người tạo đề xuất hiện vẫn phải có quyền admin; nếu quyền này bị thu hồi, giữ thông báo để xử lý ngoại lệ, không đổi booking thành thất bại. NOT_BOOKED chỉ được gửi nếu không có booking nào cùng hội thoại và không có đề xuất mới hơn hoặc cùng thời điểm. Nội dung không nêu lỗi quyền nội bộ, không hứa nhân viên đã nhận hay sẽ gọi lại.

Cờ `VPT_SURVEY_OUTCOMES=1`, `VPT_SURVEY_CONFIRMATIONS=1`, Primary và Page trong CARE cho phép worker đối soát. Gửi mới còn cần **`VPT_SURVEY_OUTCOMES_SEND=1` tường minh** cùng ba enrollment riêng (ingress/dispatch/outcome) hợp lệ; `outcome_pages` ban đầu rỗng. SEND thiếu, 0 hoặc giá trị khác chuỗi 1 chỉ chạy recovery, không đọc credential/candidates, claim hoặc POST. Đây là công tắc admission, không cấp quyền DB và không thay kiểm luật.

Muốn tạm ngừng gửi, đặt SEND=0 và giữ OUTCOMES/CONFIRMATIONS/Page để nhận bằng chứng và recovery. Tắt OUTCOMES vẫn dừng cả gửi và recovery của worker này. Khi mở SEND lại theo cấu hình được duyệt, ý định QUEUED còn chờ vẫn phải qua kiểm quyền, lịch và cửa sổ inbound hiện tại. HELD/UNCERTAIN không tự requeue hoặc gửi lại. Request HTTP đã phát đi không bị chứng minh đã hủy bởi việc đổi flag; ACK/timeout vẫn phải lưu.

Đây là thay đổi yêu cầu cấu hình so với bản kiểm kê 1b7c00f: chỉ OUTCOMES=1 không còn cho phép gửi. Không có fallback hoặc bật SEND tự động. Worker schedule vẫn phụ thuộc CONFIRMATIONS lúc khởi động; gói phát hành phải ghim cấu hình/version và restart có kiểm soát từng replica. Không gỡ enrollment Page làm rollback.

## Gửi và bằng chứng

Một attempt/payload bất biến được ghi trước HTTP và chỉ trả một lần. Kiểm đúng outcome ID, Page, công ty, credential hiện hành, deadline tối đa5 giây và cửa sổ inbound24 giờ. Dùng RESPONSE và plain text; không nhận nội dung tự do từ mô hình/khách. Xem giao thức [Meta Messenger](https://www.postman.com/meta/messenger-platform-api/documentation/iyp204x/messenger-platform-api); cấu hình app/version/quyền thực còn phải nghiệm thu.

Proposal và outcome dùng chung hàng rào SENDING/UNCERTAIN dưới khóa hội thoại: tin chưa rõ kết quả chặn cả hai chiều. Mất phản hồi claim hoặc HTTP không gây gửi lại. Chỉ retry lưu đúng ACK tối đa3 lần; recovery chuyển attempt cũ sang UNCERTAIN. ACK đến muộn vẫn lưu lịch sử ngay cả sau STOP; không cấp thêm quyền gửi. ACK chứng minh Meta tiếp nhận, không chứng minh giao đến/đọc.

Echo outcome có namespace riêng, khớp Page/PSID/công ty/app/attempt/nội dung/MID và thời điểm. Dùng chung registry proof với proposal để chống replay đổi metadata. Echo không tự thành SENT, không gỡ STOP/tiếp quản, không mở rộng cửa sổ gửi. Mismatch tạo ngoại lệ; lịch và bàn giao đã tạo giữ nguyên. Metadata riêng được che ở đường legacy.

## Kiểm chứng và hoàn tác

Local51 test worker/parser PASS. Candidate44d80b1: PostgreSQL199, Node22 618, cả10 job/full build và regression PASS; review độc lập PASS. [Bằng chứng đúng phiên bản](SURVEY_OUTCOMES_REVIEW.md). Đây chưa là nghiệm thu vận hành. Các case bao gồm nguyên giao dịch booking/outbox, bấm lặp, receipt sai sau booking, expiry độc lập, quyền/STOP/lịch thay đổi, hai claim đồng thời, mất phản hồi/late ACK, echo replay, enrollment/credential và hàng rào hai chiều.

Hoàn tác vận hành: tạm ngừng gửi bằng OUTCOMES_SEND=0, giữ OUTCOMES=1/CONFIRMATIONS=1 và enrollment Page để tiếp tục đối soát; giữ nguyên lịch, outbox/attempt và bằng chứng. Không reset UNCERTAIN hoặc xóa giao dịch. Phải đối soát các attempt đang gửi trước khi mở lại. Không rollback SQL bằng xóa bảng hoặc nới quyền. Không quay về binary cũ với OUTCOMES=1 và giả định nó hiểu SEND=0; binary cũ có thể gửi lại các ý định QUEUED. Nếu cần đổi binary, dùng gói dừng/chuyển phiên bản được kiểm riêng, bảo toàn ingress/receipt và xác minh mọi instance. Việc thu hồi quyền sau thời điểm claim không thể thu hồi HTTP đã bắt đầu; claim commit là điểm cấp quyền gửi, worker kiểm lại cờ và deadline ngay trước POST.

Checkpoint tách SEND ngày04/10: thêm unit cho thiếu/sai flag, pause tại candidates/claim, ACK/timeout sau pause và restart; PostgreSQL thêm ba ca cho QUEUED không phát claim, recovery/echo/ACK giữ một attempt và STOP trước resume giữ booking. Fixture journey/runtime/drain bật SEND tường minh để vẫn đi qua nhánh gửi. Không đổi SQL. Local focused và PostgreSQL/CI/review cuối được cập nhật sau khi chạy; bằng chứng lịch sử bên trên không tự chứng minh delta mới.

Còn cần: UI đề xuất và xử lý HELD/UNCERTAIN/CONFLICT, hủy/đổi lịch, chuyển writer lịch cũ, dữ liệu VPT và lịch thật, nguồn/chi tiêu/CPQL đầy đủ, hiệu năng, sao lưu/khôi phục, Meta/UAT và gói Founder duyệt phát hành. Không mở OpenAI API trong gói này. Mục tiêu250.000đ/khách hợp lệ và trần100 triệu/30 ngày/80:20 giữ nguyên; chưa có CPQL thực tế chứng minh đạt.
