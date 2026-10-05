# Review độc lập — 05/10/2026

Reviewer: agent phiên riêng `/root/pr19_independent_review`, chỉ đọc diff và nguồn, không tham gia viết mã. Phạm vi: nhánh guardrails, base `679cb926`; yêu cầu giữ kiến trúc và thứ tự đã được Founder chốt. Phát hành HOLD.

Kết luận cuối: **PASS phạm vi diff kỹ thuật**, không còn finding chặn trong phần đã rà. Reviewer chạy riêng direct Node đủ 48/48 PASS, không fail/skip, git diff --check PASS. Bộ test có Git blob `0b6907479bc17683a9ab1308fd60e1668e1e104a`.

Reviewer đã yêu cầu sửa và kiểm lại:

- Quyền đổi giữa lấy báo cáo và gửi: company move, role downgrade, thêm người nhận DM phải chặn bằng chứng cũ.
- Memory source error phải là lỗi khi gọi tool, không thành success count0.
- Lỗi đọc flow đầu tiên và lỗi ném ra không được caller bỏ qua để ghi tiếp.
- Phạm vi cá nhân/bộ lọc và kỳ thực phải nằm trong evidence; số ước tính không được gọi là doanh thu kế toán.
- Context fields cần xóa phải sống qua phép gộp khi lưu; correction đứng trước derived facts.
- Lỗi upstream không lộ trong câu trả lời; log phải ghi cổng thật sự đang chặn dù cờ shadow chưa bật.

Các probe dùng mã thật với DB/provider giả. Giới hạn: scheduled sender/menu và MCP Ads ngoài chứng nhận; chưa có durable approval executor; chưa kiểm CRM/model thật, HTTP/auth/RLS đầy đủ hoặc UAT. Một số chức năng cũ giữ khóa có chủ đích. PASS không là quyết định production.
