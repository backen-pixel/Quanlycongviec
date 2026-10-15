## 15/10/2026 — Tự chuyển công đoạn theo kế hoạch (candidate staging)

Anh Hùng yêu cầu mọi nhiệm vụ trong công đoạn hoàn tất mới chuyển; lịch giao/kích hoạt nhiệm vụ theo phụ thuộc giữ nguyên. Domain progression đọc canonical execution, xét tất cả nhiệm vụ kể cả tùy chọn; miễn trừ quản lý đóng việc, needs_review giữ mở. Khâu hiện tại là khâu chưa xong đầu tiên; các khâu ready song song hiển thị riêng. Mở lại việc quay về khâu cần xử lý. Không thay task dependencies/dates hay tự gửi thông báo mới.

Dashboard thêm chế độ Theo kế hoạch tự nhóm theo cấu trúc công đoạn, không ghi pipeline legacy; bảng này không thay KPI/cột Kanban legacy. Chỉ các dự án đã tải và có quyền manager có progression toàn dự án; staff xem phần việc theo cơ chế cũ. Refresh mỗi phút/khi focus; lỗi tải rõ, disabled/unavailable không treo pending. Plan detail đổi ngay theo response command.

38/38 tests PASS gồm browser transition, stage ordering, disabled/denied; staging build PASS 40.34s; reviewer độc lập không còn blocker sau guard cuối. Chưa deploy phiên bản này lúc ghi candidate. Không migration mới; rollback revert code, giữ execution/history. User đã yêu cầu đưa lên staging để nghiệm thu, không production.

