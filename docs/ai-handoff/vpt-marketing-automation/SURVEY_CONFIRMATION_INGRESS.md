# Nhận xác nhận khảo sát từ webhook — SQL666

Baseline `2acd82fc4d617f67daf082bcf69fa3349319135c`. Bổ sung đường nhận xác nhận vào lõi SQL665; toàn bộ mục tiêu Marketing–CRM vẫn ACTIVE, chưa phát hành.

## Cách hoạt động và quyền

Express xác thực HMAC của **raw body** trước khi parse. Khi `VPT_SURVEY_CONFIRMATIONS=1` và Page đã nằm trong cấu hình care, adapter nhận `message.quick_reply.payload` theo định dạng `VPT_SURVEY_V1:<proposal UUID>:<token UUID>`. Tin nhắn chỉ chứa chuỗi này trong nội dung, echo, phiên bản khác hoặc mã không đúng không được xem là xác nhận. Đây là quick reply dạng messages, không phải postback; mẫu nền tảng được đối chiếu với [tài liệu Meta trên Postman](https://www.postman.com/meta/messenger-platform-api/documentation/iyp204x/messenger-platform-api).

Mặc định cờ tắt. Bảng riêng `crm_survey_control.ingress_pages` khởi tạo rỗng; Page/công ty chỉ được ghi bởi thao tác phát hành đã duyệt, có release reference. Không dùng enrollment này để cấp quyền AI hoặc giả danh người tạo đề xuất.

`crm_survey_receive` và `crm_survey_confirmation_reconcile` chỉ dành cho server service_role, kiểm role thực tế trong DB bên cạnh ACL. Việc backup cấp lại quyền EXECUTE rộng cho public không làm anon/authenticated vượt kiểm tra này. Server là biên tin cậy: RPC nhận sự kiện đã chuẩn hóa, **không tự xác thực chữ ký Meta trong DB**. Không có HTTP/Tool Gateway cho người dùng hoặc AI cung cấp normalized event/token/boolean xác nhận. Không cấp service_role credential cho Agent.

## Giao dịch, lặp và hồi phục

Một RPC lưu toàn bộ batch qua care trước; mọi STOP, yêu cầu gặp người và echo không xác định trong batch có hiệu lực trước việc đặt lịch. Sau đó đối chiếu đúng message, Page/PSID, thread/công ty, proposal và token, lưu biên nhận riêng rồi gọi book. Lõi tiếp tục kiểm quyền, mapping, nguồn lịch, giờ bận và hết hạn trong cùng giao dịch.

Tin/xác nhận lặp không tạo lịch mới. Thay payload xác nhận của cùng message bị từ chối. Kết quả terminal được bảo vệ bằng cập nhật có điều kiện: worker đọc WAITING trước đó không được ghi đè BOOKED sau khi quyền/enrollment thay đổi trong lúc chờ.

Xác nhận đến trước bằng chứng SENT được giữ WAITING. Hàm reconcile giới hạn1–100 bản ghi, chọn việc đã SENT hoặc cần kết thúc do hết hạn/trạng thái/ngữ cảnh; các bản cũ chưa ACK không chặn bản sau đã nhận ACK. Worker gửi tin sau này phải gọi reconcile sau ACK và chạy hồi phục định kỳ. Hiện chưa có worker đó được nối hoặc bật.

Thu hồi quyền người tạo hoặc enrollment chặn đặt mới nhưng không bỏ mất tin vừa nhận. Lỗi bất ngờ giữa chừng hoàn tác cả message/receipt/booking để webhook retry; không trả thành công giả. Không tự thử gửi lại tin khi chưa rõ kết quả gửi.

Hash message hiện có được giữ nguyên để không gây xung đột khi nhận lại MID cũ sau rollout. Payload xác nhận được lưu/so sánh riêng trong schema private. Sau khi cả care và Lead Ads đã đọc raw body, bản đưa vào log/hàng chờ/xử lý Messenger cũ được bỏ quick_reply chứa mã khảo sát; tiêu đề/nội dung tin giữ nguyên. Raw body không bị sửa trước kiểm chữ ký.

## Bằng chứng và giới hạn hiện tại

Local31 test PASS cho care/proposal adapter; cú pháp và diff đã kiểm. Bộ PostgreSQL thêm luồng từ raw body ký giả bằng secret thử → receiver thật → PostgreSQL → event/handoff, cùng sai chữ ký/prose, STOP/echo trong batch, sai khách/token, late ACK/restart, conflict replay, thu hồi quyền/enrollment, quyền sau broad grants, đồng thời, starvation và rollback. Log PostgreSQL và verdict cuối ghi riêng khi có đúng phiên bản.

**Bằng chứng gửi từ Meta vẫn được DB owner mô phỏng trong fixture.** Kiểm thử này có thật đường HMAC/receiver/DB nhưng không phải gửi/nhận Meta ngoài thực tế. Dispatcher, thông điệp gửi chứa đúng payload, quyền pages_messaging, giới hạn cửa sổ gửi, own-send echo correlation và cơ chế reconcile sau ACK vẫn cần tích hợp. Hiện mọi outbound echo tiếp tục chuyển HUMAN_REQUESTED; chưa được mở gửi đề xuất vì echo của chính ứng dụng chưa được phân biệt.

UI khảo sát, ACK người nhận, thông báo khách, hủy/đổi lịch, chuyển/chặn writer cũ, dữ liệu sản phẩm/lịch thật, sao lưu/khôi phục và UAT còn bắt buộc. Không có thay đổi DB/account/ad/model thật.

## Hoàn tác

Tắt cờ để dừng nhận lệnh xác nhận mới; giữ care nhận STOP và giữ toàn bộ receipt/booking/handoff/audit để đối soát. Dừng worker reconcile khi rollback. Không xóa lịch đã đặt, không xóa enrollment/guard để mở lại writer cũ không kiểm soát. Khi bật lại phải kiểm tra pending/expired receipts, nguồn và quyền đúng phiên bản.
