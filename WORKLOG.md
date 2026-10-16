## 15/10/2026 — Tự chuyển công đoạn theo kế hoạch (candidate staging)

Anh Hùng yêu cầu mọi nhiệm vụ trong công đoạn hoàn tất mới chuyển; lịch giao/kích hoạt nhiệm vụ theo phụ thuộc giữ nguyên. Domain progression đọc canonical execution, xét tất cả nhiệm vụ kể cả tùy chọn; miễn trừ quản lý đóng việc, needs_review giữ mở. Khâu hiện tại là khâu chưa xong đầu tiên; các khâu ready song song hiển thị riêng. Mở lại việc quay về khâu cần xử lý. Không thay task dependencies/dates hay tự gửi thông báo mới.

Dashboard thêm chế độ Theo kế hoạch tự nhóm theo cấu trúc công đoạn, không ghi pipeline legacy; bảng này không thay KPI/cột Kanban legacy. Chỉ các dự án đã tải và có quyền manager có progression toàn dự án; staff xem phần việc theo cơ chế cũ. Refresh mỗi phút/khi focus; lỗi tải rõ, disabled/unavailable không treo pending. Plan detail đổi ngay theo response command.

38/38 tests PASS gồm browser transition, stage ordering, disabled/denied; staging build PASS 40.34s; reviewer độc lập không còn blocker sau guard cuối. Chưa deploy phiên bản này lúc ghi candidate. Không migration mới; rollback revert code, giữ execution/history. User đã yêu cầu đưa lên staging để nghiệm thu, không production.

## 15/10/2026 08:28 Việt Nam — Tự chuyển công đoạn đã lên staging

Runtime 792cefce6e4db8305f128a86094f6444ea3b213d, deploy dep-db82m2on74is73di5140 LIVE, finished 01:27:41Z. Public smoke PASS lúc 01:28:00Z: hoàn thành t0 chuyển s0→s1, board trả cùng công đoạn; mở lại phục hồi s0. Graph/người nhận/phụ thuộc/hạn giữ nguyên; dữ liệu giả đã mở lại về trạng thái ban đầu, giữ lịch sử kiểm thử. Lần gọi trước khi deploy LIVE chưa thấy progression, không có ghi dữ liệu; kiểm sau LIVE PASS.

Browser thật đã mở Dashboard → Thêm → Theo kế hoạch, thấy hai dự án mẫu tại công đoạn canonical, legacy hiển thị chưa có kế hoạch. Ảnh HoSoTuBepPro/templates/STAGE_PROGRESSION_STAGING.png; proof STAGE_PROGRESSION_VERIFICATION.json. 38/38 tests và build PASS; reviewer cuối no blockers. Không thay Kanban/KPI legacy; bảng mới theo kế hoạch chỉ dự án đã tải, manager toàn dự án, refresh mỗi phút/focus. Không production. Bước sau: nghiệm thu trọn dự án từ hai template mới với tài khoản/lịch thực tế chọn rõ; tự chuyển đã kiểm trên fixture hiện có, không tuyên bố toàn bộ quy trình thật đã nghiệm thu.

## 16/10/2026 — Hiển thị dự án ở mọi công đoạn đang thực hiện

Anh Hùng trả lời lựa chọn trễ: Hiện ở mọi công đoạn đang thực hiện. Thay phương án một thẻ tại khâu chưa xong đầu tiên. Domain progression thêm active_stages gồm khâu có nhiệm vụ mở ready/doing/needs_review; waiting_stages riêng. Board render từng khâu active với closed/total của chính khâu; hoàn tất khâu thì thẻ rời khâu đó, hoàn tất toàn dự án chỉ một thẻ Hoàn tất. Không có khâu active thì hiển thị chờ điều kiện. Nhiều thẻ không cộng thành số dự án duy nhất; giữ lịch/phụ thuộc/giao người, quyền scope và KPI/cột legacy.

38/38 tests PASS, browser phủ hai thẻ cùng dự án và nhánh xong biến mất; review riêng no blockers. Build/deploy mới cần xác nhận trước khi gọi là đã lên staging. Không migration/flag mới; rollback revert code, giữ canonical execution/history. Không production.

## 16/10/2026 08:11 VN — Hiển thị nhiều công đoạn đã lên staging

Runtime 3cccc9bd65d9ffa013816da0195e8284bfa5fc73, deploy dep-db8nh0ivcj2c739smjh0 LIVE 01:10:38Z =08:10:38 VN. Public synthetic smoke PASS 08:11:09 VN: hoàn thành t1 mở đồng thời s2/s3 (Công đoạn3/4), board thống nhất, mở lại phục hồi s1; graph/người/phụ thuộc/hạn giữ nguyên. Proof HoSoTuBepPro/templates/PARALLEL_STAGE_VERIFICATION.json, chỉ fixture mẫu. 38/38 tests PASS gồm real local browser multicard/disappearance, build PASS59.27s, review no blockers.

Kết nối Chrome3 không khả dụng lúc kiểm live UI nên chưa có ảnh/quan sát UI trực tuyến của bản mới; không nhầm browser cục bộ với live. Bản đã triển khai và API đã kiểm, không tuyên bố nghiệm thu trọn mẫu mới hoặc production. Rollback revert code, giữ history/data. Không migration/flag mới. Bước sau anh nghiệm thu staging Dashboard→Thêm→Theo kế hoạch, cùng dự án xuất hiện tại mọi khâu active. Lịch/giao việc nguyên trạng.

