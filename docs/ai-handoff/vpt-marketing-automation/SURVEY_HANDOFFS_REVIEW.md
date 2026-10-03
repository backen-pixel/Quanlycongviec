# Review bàn giao khảo sát — 03/10/2026

**PASS trong phạm vi bàn giao khảo sát; phát hành HOLD; toàn bộ mục tiêu ACTIVE.** Reviewer độc lập `/root/architecture_v11_review` đọc mã, đối chiếu GitHub/local, chạy11 kiểm thử service/UI-state cục bộ và tự đọc log CI cuối. Không còn finding chặn trong phạm vi đã rà. Reviewer đọc hồ sơ browser của bên triển khai, không tự chạy lại browser.

## Phiên bản và bằng chứng

- Runtime `a35deef4eca942be5b5caa6c33d03126176447c0`, tree `4205d214a7d9f56b41fd56b957fc2f5e9234f10f`.
- CI checkout `c81c796a115940a45007bfc6796b46a91eb50d3f`, cha runtime trên và base `e16c885ae7c2305645be02a1227bf378cb59137f`; tree giống runtime. Đây là checkout kiểm thử, chưa merge nhánh vận hành.
- SQL668 `fbc882497acf173d0eb0158009044bff640a71e2`; PG cases `f298a8a3a369406dc7a6188a159493ed9e7e760d`.
- Service `717f1099011ad170a6e9873834536cb4fdf5fba6`; UI `3440f0f2c1377c9bccedeac0cc3eabf738075863`; UI state `0d25a503b58cfb8ef1a6e79421ffb23300f69aba`.
- Root kiểm từng blob trước cập nhật ref; reviewer kiểm riêng SQL/test/UI. Bản đóng hồ sơ sau runtime chỉ thay tài liệu.

[CI37095978398](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37095978398): cả10 job SUCCESS.

| Kiểm chứng | Kết quả | Bằng chứng |
|---|---|---|
| PostgreSQL16 intake/care/calendar/handoff |179 PASS,0 FAIL,0 SKIP;21 case handoff mới|[Job111125864746](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37095978398/job/111125864746)|
| Node22 domain/regression |604 PASS,0 FAIL,0 SKIP|[Job111125864784](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37095978398/job/111125864784)|
| Toàn bộ frontend |10.310 module;31,39 giây;SUCCESS|[Job111125864622](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37095978398/job/111125864622)|
| Service/UI-state cục bộ |11 PASS,0 FAIL,0 SKIP|Root và reviewer chạy riêng; không có PostgreSQL local|
| Browser với API giả |8 nhóm hành vi đạt|[Phạm vi và thao tác](SURVEY_HANDOFFS_BROWSER.md)|

[Report37095978365](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37095978365) và [Messenger37095978364](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37095978364) SUCCESS.

## Hành vi được kiểm

Người nhận hiện hành xem đủ hồ sơ/hội thoại và nhận bàn giao; Sales owner hiện hành/admin chỉ giám sát, không ký thay. Kiểm công ty/tenant/region/user hoạt động; owner NULL, đổi người phụ trách, chuyển Lead/Customer/Page/Event sang công ty khác, contact trùng và mapping khác đều có ca thử. Hồ sơ không biến mất chỉ vì proposer nghỉ hoặc roster hết hạn.

ACK và audit cùng giao dịch; mất phản hồi replay đúng request sau kiểm quyền hiện hành; đồng thời chỉ một receipt; rollback không để lại trạng thái một phần. RSVP và BOOKED_HANDOFF_PENDING lịch sử không bị sửa thành staff ACK. STOP giữ nguyên. Lịch hiện tại khác xác nhận ban đầu, thêm participant hoặc occurrence_dates đều ngăn ACK mới. Kiểm thay quyền trong lúc ACK chờ, thu hồi membership phải chờ giao dịch ACK, và barrier đúng khoảng trống membership để chống inventory nâng quyền sau câu khóa. Queue53 hồ sơ phân trang đủ; hội thoại đủ55 tin, cursor cũ bị vô hiệu khi có tin mới. Quyền function công khai cấp lại không vượt service-role gate.

## Finding đã đóng và lần thử trước

- Quyền owner NULL làm biểu thức từ chối thành NULL: đổi thành `IS NOT TRUE`, regression người thứ ba không được đọc.
- Tên live của nhân sự đã chuyển công ty: dùng tên lịch sử nếu ra khỏi phạm vi.
- Membership xuất hiện sau locking read: xác lập quyền từ chính hàng đã khóa, từ chối ngay khi thiếu; contact phải có đúng một hàng đã khóa; version gồm membership.
- Thêm ngày vào occurrence_dates: không còn được xem là nguyên lịch khách đã xác nhận.
- CI đầu runtime76340d8: PG lỗi fixture cố tạo contact trùng unique key. Sửa thành kiểm việc từ chối trùng rồi kiểm mapping khác. Follow-up57a54f0 có176 PG PASS; SQL locking/occurrence sau đó được kiểm lại bằng bản cuối179 PASS phía trên. Không dùng run đầu thất bại làm bằng chứng PASS.

## Phạm vi còn thiếu

Provider/HMAC/API trình duyệt dùng dữ liệu giả; chưa xác nhận Meta thật, company selector theo tài khoản thật hoặc vận hành UAT. SQL phải đo hiệu năng lịch sử lớn và tranh chấp calendar gate trước release. Cờ VPT_SURVEY_HANDOFFS mặc định tắt, không có DB thật, gửi khách, OpenAI call, đổi quảng cáo hoặc mở trial.

Vẫn còn UI đề xuất/ngoại lệ gửi, thông báo kết quả đặt lịch cho khách, hủy/đổi lịch và chuyển writer lịch cũ; nội dung/lịch/người nhận thật, nguồn và chi tiêu đầy đủ, CPQL thực tế, budget execution, backup/restore và gói duyệt Founder. Mốc250.000đ/khách là mục tiêu. [Contract và rollback](SURVEY_HANDOFFS.md) giữ lịch, receipts và audit khi tắt tính năng; không mở lại chăm khách hay xóa bằng chứng.
