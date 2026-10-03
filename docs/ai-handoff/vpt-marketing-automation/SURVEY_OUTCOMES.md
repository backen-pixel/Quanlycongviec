# Thông báo kết quả đặt khảo sát — SQL669

Phạm vi rủi ro cao: gửi tin cho khách và đọc lịch/quyền hiện hành. Mặc định tắt, chưa áp dụng DB thật, chưa gửi Meta thật. SQL669 tiếp nối SQL665–668 trong PR22; không thay kết quả đặt lịch hoặc receipt người nhận.

## Kết quả chuẩn và hàng chờ

Booking tạo ý định BOOKED trong cùng giao dịch. Chỉ confirmation riêng đã xác thực, bị từ chối và proposal REJECTED mới tạo NOT_BOOKED. Ingress BLOCKED, sai token, sai Page hoặc một receipt lỗi sau booking không tạo thông báo phủ định lịch. Mỗi proposal/kind chỉ có một ý định; migration không gửi bù lịch sử. Trước enrollment, ý định được giữ HELD và không tự mở lại khi đăng ký Page.

Claim BOOKED kiểm lại lịch, người phụ trách và membership, khách/Lead/Page/công ty, trạng thái chăm khách và bằng chứng gửi đề xuất. Không lấy hạn đề xuất hoặc roster làm hạn của lịch đã đặt. Người tạo đề xuất hiện vẫn phải có quyền admin; nếu quyền này bị thu hồi, giữ thông báo để xử lý ngoại lệ, không đổi booking thành thất bại. NOT_BOOKED chỉ được gửi nếu không có booking nào cùng hội thoại và không có đề xuất mới hơn hoặc cùng thời điểm. Nội dung không nêu lỗi quyền nội bộ, không hứa nhân viên đã nhận hay sẽ gọi lại.

Cờ `VPT_SURVEY_OUTCOMES=1`, `VPT_SURVEY_CONFIRMATIONS=1`, Primary, Page trong CARE và ba enrollment riêng (ingress/dispatch/outcome) phải hợp lệ. `outcome_pages` ban đầu rỗng. Tắt OUTCOMES dừng cả gửi và recovery của worker này. Khi bật lại sau khi đã enrollment, ý định QUEUED có thể còn chờ; vẫn phải qua toàn bộ kiểm quyền, lịch và cửa sổ inbound hiện tại. HELD không được tự requeue.

## Gửi và bằng chứng

Một attempt/payload bất biến được ghi trước HTTP và chỉ trả một lần. Kiểm đúng outcome ID, Page, công ty, credential hiện hành, deadline tối đa5 giây và cửa sổ inbound24 giờ. Dùng RESPONSE và plain text; không nhận nội dung tự do từ mô hình/khách. Xem giao thức [Meta Messenger](https://www.postman.com/meta/messenger-platform-api/documentation/iyp204x/messenger-platform-api); cấu hình app/version/quyền thực còn phải nghiệm thu.

Proposal và outcome dùng chung hàng rào SENDING/UNCERTAIN dưới khóa hội thoại: tin chưa rõ kết quả chặn cả hai chiều. Mất phản hồi claim hoặc HTTP không gây gửi lại. Chỉ retry lưu đúng ACK tối đa3 lần; recovery chuyển attempt cũ sang UNCERTAIN. ACK đến muộn vẫn lưu lịch sử ngay cả sau STOP; không cấp thêm quyền gửi. ACK chứng minh Meta tiếp nhận, không chứng minh giao đến/đọc.

Echo outcome có namespace riêng, khớp Page/PSID/công ty/app/attempt/nội dung/MID và thời điểm. Dùng chung registry proof với proposal để chống replay đổi metadata. Echo không tự thành SENT, không gỡ STOP/tiếp quản, không mở rộng cửa sổ gửi. Mismatch tạo ngoại lệ; lịch và bàn giao đã tạo giữ nguyên. Metadata riêng được che ở đường legacy.

## Kiểm chứng và hoàn tác

Local51 test worker/parser PASS. PostgreSQL cô lập và kết luận review mã cuối đang chờ; không gọi đây là nghiệm thu vận hành. Các case bao gồm nguyên giao dịch booking/outbox, bấm lặp, receipt sai sau booking, expiry độc lập, quyền/STOP/lịch thay đổi, hai claim đồng thời, mất phản hồi/late ACK, echo replay, enrollment/credential và hàng rào hai chiều.

Hoàn tác vận hành: tắt OUTCOMES trước, giữ nguyên lịch, outbox/attempt và bằng chứng; không reset UNCERTAIN hoặc xóa giao dịch. Phải đối soát các attempt đang gửi trước khi mở lại. Không rollback SQL bằng xóa bảng hoặc nới quyền. Việc thu hồi quyền sau thời điểm claim không thể thu hồi HTTP đã bắt đầu; claim commit là điểm cấp quyền gửi, worker kiểm lại cờ và deadline ngay trước POST.

Còn cần: UI đề xuất và xử lý HELD/UNCERTAIN/CONFLICT, hủy/đổi lịch, chuyển writer lịch cũ, dữ liệu VPT và lịch thật, nguồn/chi tiêu/CPQL đầy đủ, hiệu năng, sao lưu/khôi phục, Meta/UAT và gói Founder duyệt phát hành. Không mở OpenAI API trong gói này. Mục tiêu250.000đ/khách hợp lệ và trần100 triệu/30 ngày/80:20 giữ nguyên; chưa có CPQL thực tế chứng minh đạt.
