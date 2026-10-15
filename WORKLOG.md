## 15/10/2026 — Tự chuyển công đoạn theo kế hoạch (candidate staging)

Anh Hùng yêu cầu mọi nhiệm vụ trong công đoạn hoàn tất mới chuyển; lịch giao/kích hoạt nhiệm vụ theo phụ thuộc giữ nguyên. Domain progression đọc canonical execution, xét tất cả nhiệm vụ kể cả tùy chọn; miễn trừ quản lý đóng việc, needs_review giữ mở. Khâu hiện tại là khâu chưa xong đầu tiên; các khâu ready song song hiển thị riêng. Mở lại việc quay về khâu cần xử lý. Không thay task dependencies/dates hay tự gửi thông báo mới.

Dashboard thêm chế độ Theo kế hoạch tự nhóm theo cấu trúc công đoạn, không ghi pipeline legacy; bảng này không thay KPI/cột Kanban legacy. Chỉ các dự án đã tải và có quyền manager có progression toàn dự án; staff xem phần việc theo cơ chế cũ. Refresh mỗi phút/khi focus; lỗi tải rõ, disabled/unavailable không treo pending. Plan detail đổi ngay theo response command.

38/38 tests PASS gồm browser transition, stage ordering, disabled/denied; staging build PASS 40.34s; reviewer độc lập không còn blocker sau guard cuối. Chưa deploy phiên bản này lúc ghi candidate. Không migration mới; rollback revert code, giữ execution/history. User đã yêu cầu đưa lên staging để nghiệm thu, không production.

## 15/10/2026 08:28 Việt Nam — Tự chuyển công đoạn đã lên staging

Runtime 792cefce6e4db8305f128a86094f6444ea3b213d, deploy dep-db82m2on74is73di5140 LIVE, finished 01:27:41Z. Public smoke PASS lúc 01:28:00Z: hoàn thành t0 chuyển s0→s1, board trả cùng công đoạn; mở lại phục hồi s0. Graph/người nhận/phụ thuộc/hạn giữ nguyên; dữ liệu giả đã mở lại về trạng thái ban đầu, giữ lịch sử kiểm thử. Lần gọi trước khi deploy LIVE chưa thấy progression, không có ghi dữ liệu; kiểm sau LIVE PASS.

Browser thật đã mở Dashboard → Thêm → Theo kế hoạch, thấy hai dự án mẫu tại công đoạn canonical, legacy hiển thị chưa có kế hoạch. Ảnh HoSoTuBepPro/templates/STAGE_PROGRESSION_STAGING.png; proof STAGE_PROGRESSION_VERIFICATION.json. 38/38 tests và build PASS; reviewer cuối no blockers. Không thay Kanban/KPI legacy; bảng mới theo kế hoạch chỉ dự án đã tải, manager toàn dự án, refresh mỗi phút/focus. Không production. Bước sau: nghiệm thu trọn dự án từ hai template mới với tài khoản/lịch thực tế chọn rõ; tự chuyển đã kiểm trên fixture hiện có, không tuyên bố toàn bộ quy trình thật đã nghiệm thu.

