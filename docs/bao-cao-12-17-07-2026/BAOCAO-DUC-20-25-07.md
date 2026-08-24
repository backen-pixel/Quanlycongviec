# Báo cáo công việc — Đức (MinDuc)

| | |
|---|---|
| **Người thực hiện** | Đức (git: MinDuc) |
| **Giai đoạn** | 20/07/2026 – 25/07/2026 |
| **Ngày lập** | 27/07/2026 |
| **Số commit** | 26 |

---

## Tóm tắt

Tuần **20–25/07** tập trung ổn định CRM/SX/VC mobile + web (Kanban cache, KPI, filter công ty, timezone), phát hành CRM Mobile **2.2.27 → 2.2.46**, và thông báo giao việc SX.

**Kế hoạch tuần tới (27/07 – 01/08):** hồi quy thông báo/Hub/Kanban; tiếp tục báo cáo mobile, Planner/Voice, UX điều hướng; branding SX mobile.

---

## II. Công việc thường xuyên

| STT | DANH MỤC | NỘI DUNG CÔNG VIỆC | KẾT QUẢ ĐẠT ĐƯỢC | TRẠNG THÁI |
|-----|----------|--------------------|------------------|------------|
| 1 | CRM / Ngày & SLA | Thống nhất logic ngày báo cáo, kỳ KPI, open-deal KPI và hạn SLA Kanban theo **Asia/Ho_Chi_Minh** (backend + web + crm-mobile). | Web/app/Render không còn lệch ngày; filter kỳ và deadline SLA dùng chung múi giờ VN. | Hoàn thành (20/07) |
| 2 | CRM Mobile / Báo cáo | Sửa mẫu số tỷ lệ chốt deal NV; format VND «X tỷ Y tr»; đồng bộ metric Hub với org overview (tách QH SLA Lead/Deal, loại deal lost). | Biểu đồ NV và KPI Hub khớp web; số tiền lớn đọc đúng, không lệch làm tròn. | Hoàn thành (20/07) |
| 3 | App Update | Cho phép URL APK host trên GitHub trong kiểm tra download cập nhật; phát hành CRM Mobile **2.2.27** và các bản **2.2.44–2.2.46**. | Kênh cập nhật in-app hoạt động khi file chỉ còn trên GitHub; nhiều bản CRM Mobile lên production. | Hoàn thành (20–23/07) |
| 4 | SX Mobile / KPI & thông báo | Căn KPI board với web; bật column enrich từ BE (`sx_kanban_column_id`/`sx_inplace`); giảm spam push/tray. | KPI Overview/Kanban khớp web; cột Đang SX không lệch; thông báo ít nhiễu hơn. | Hoàn thành (21/07) |
| 5 | SX / VC Kanban (web) | Sửa khoảng trống virtual list dưới header cột; thắt layout board VC; cải thiện bảng danh sách VC (scroll, grid, tên dự án). | Kanban SX/VC hết khoảng trống lệch; list VC dễ đọc, sticky header đầy viewport. | Hoàn thành (21/07) |
| 6 | SX / VC / CRM cache & rename | Sửa race Kanban SX trống; thẻ biến mất sau khi ra khỏi project detail (SX + VC); totals Lead/Deal/Order; đồng bộ đổi tên lead/deal sang cache CRM và tên dự án xưởng; cập nhật thẻ ngay sau rename. | Quay lại dashboard không mất cột/thẻ; totals tab khớp stage-counts; đổi tên phản ánh tức thì trên SX/VC. | Hoàn thành (22/07) |
| 7 | CRM filter & pipeline-stages | Sửa filter công ty hiện thiếu / UUID từ cache cũ; `pipeline-stages` không còn leak toàn bộ stage hệ thống khi công ty chưa có pipeline; Lead tab total dùng stage-counts như Hub mobile; admin mặc định «tất cả công ty». | Chọn công ty không còn stage/tổng số ảo; filter ổn định; KPI tab Lead/Deal khớp Hub. | Hoàn thành (22/07) |
| 8 | CRM Dashboard | Sửa CRM dashboard **kẹt loading gate** sau deploy. | Dashboard mở được bình thường sau khi deploy frontend mới. | Hoàn thành (23/07) |
| 9 | SX Mobile / Work & Overview | Sửa bug Work/Overview; cứng hóa upload file assignment chống **IDOR**; ổn định realtime/upload race; sửa metric Quá hạn Overview; ProjectDetail resolve deal khi focus; Work tab refresh overdue khi focus/foreground. | Work/Overview số liệu đúng; upload file an toàn hơn; danh sách quá hạn cập nhật khi quay lại tab. | Hoàn thành (23–24/07) |
| 10 | SX Kanban & push assignment | Sửa Kanban load stall; hydrate board cache đúng; căn filter all-company; gửi FCM/system-tray cho giao việc, sắp đến hạn, quá hạn sản xuất. | Board load ổn định; NV nhận thông báo giao việc/deadline SX trên máy. | Hoàn thành (24/07) |

---

## III. Công việc phát triển

| STT | DANH MỤC | NỘI DUNG CÔNG VIỆC | KẾT QUẢ ĐẠT ĐƯỢC | TRẠNG THÁI |
|-----|----------|--------------------|------------------|------------|
| 1 | CRM Mobile / Sự kiện | Form tạo/sửa sự kiện đầy đủ; admin chọn công ty trong form; bộ lọc sự kiện; hướng dẫn LDPlayer + screenshot; ship **2.2.27**. | Tạo/lọc sự kiện trên app; admin bỏ bước lọc công ty trước; bản 2.2.27 trên kênh cập nhật. | Hoàn thành (20/07) |
| 2 | Messenger / Lịch sử cuộc gọi | API lịch sử cuộc gọi **batch**; tích hợp CallContext/Messenger trên CRM Mobile; tối ưu boot/back, cache Events/Messenger; virtualize danh sách NV báo cáo. | Xem lịch sử gọi theo batch; app mượt hơn khi mở Hub/Events/Messenger. | Hoàn thành (20/07) |
| 3 | SX Pipeline Settings (web) | Thiết kế lại layout cấu hình pipeline SX (2 cột, panel loại sticky); portal modal chi tiết giao việc khỏi stacking sidebar; ẩn UUID thô khỏi danh sách loại. | Trang cấu hình pipeline dễ dùng hơn; modal assignment không bị cắt bởi sidebar. | Hoàn thành (21/07) |
| 4 | CRM Mobile / Planner & Voice | Cải thiện lời chào Planner; Hub filters; sync voice **chỉ cuộc gọi CRM** (API `match-phones` bỏ cuộc gọi cá nhân); bump **2.2.44**. | Planner/Hub thân thiện hơn; auto-upload ghi âm không lấy nhầm cuộc gọi cá nhân. | Hoàn thành (23/07) |
| 5 | CRM Mobile Hub / Cập nhật app | Ẩn cột stage trống mặc định (**2.2.45–2.2.46**); prefetch neighbor; verify APK **sha256**; bỏ `READ_CALL_LOG` thừa; prune cache CRM/planner phiên dài; quick-move sang stage đang bị filter. | Hub gọn, ít cột rỗng; cập nhật APK có kiểm tra checksum; phiên dài không phình RAM; ẩn stage vẫn move được. | Hoàn thành (23/07) |
| 6 | SX Mobile / Thông báo giao việc | Đẩy thông báo hệ thống/FCM cho assign, due-soon, overdue production; refresh Work khi focus để đồng bộ danh sách quá hạn. | NV SX nhận cảnh báo giao việc/deadline trên tray; Work tab luôn cập nhật khi quay lại app. | Hoàn thành (24/07) |

---

## Phân bổ theo ngày

| Ngày | Việc chính |
|------|------------|
| **20/07** | Unify timezone VN; báo cáo NV/Hub; form sự kiện + admin chọn công ty; Messenger call-history batch; release CRM Mobile 2.2.27; GitHub APK URL |
| **21/07** | KPI SX mobile khớp web; layout Kanban SX/VC + list VC; redesign pipeline settings SX |
| **22/07** | Cache/rename SX–VC–CRM; sửa filter công ty & pipeline-stages leak; totals Lead/Deal/Order |
| **23/07** | CRM loading gate; Planner/voice CRM-only; Hub 2.2.44–46 (ẩn stage trống, sha256); SX Work/Overview + IDOR upload |
| **24/07** | SX Kanban load stall + push assignment; Work tab refresh overdue on focus |
| **25/07** | Không có commit MinDuc |

---

## IV. Kế hoạch (tuần tới 27/07 – 01/08)

### Công việc thường xuyên

| STT | DANH MỤC | NỘI DUNG CÔNG VIỆC | KẾT QUẢ ĐẠT ĐƯỢC | TRẠNG THÁI |
|-----|----------|--------------------|------------------|------------|
| 1 | SX Mobile / Hồi quy thông báo | Kiểm thử trên máy thật: FCM/tray cho giao việc, sắp đến hạn, quá hạn; xác nhận Work tab refresh khi focus; ghi nhận case miss/spam còn lại sau bản 24/07. | Biên bản smoke test thông báo SX; hotfix nếu còn miss hoặc spam. | Kế hoạch |
| 2 | CRM Mobile / Ổn định Hub 2.2.46 | Theo dõi ẩn stage trống sau column picker; totals Lead/Deal sau đổi công ty; cache filter không còn UUID thô; xử lý phản hồi user sau phát hành. | Hub ổn định trên production; không regress totals/filter. | Kế hoạch |
| 3 | SX / VC Kanban (web) | Hồi quy: quay lại từ project detail không mất cột/thẻ; rename lead/deal phản ánh tức thì; không race empty board khi mạng chậm. | Dashboard SX/VC ổn định trong luồng mở–đóng detail thường dùng. | Kế hoạch |
| 4 | CRM / Báo cáo & SLA | Rà edge case timezone sau unify VN (filter «tháng này», lead không SĐT, QH Lead vs Deal) trên org overview + mobile; sửa lệch số nếu QA báo. | Web và mobile cùng bộ số liệu trong các kỳ filter chính. | Kế hoạch |
| 5 | Thông báo CRM / SX | Rà badge, Notifications screen, assignment/comment realtime trên crm-mobile và sx-mobile; đảm bảo không miss giao việc quan trọng. | Badge khớp chưa đọc; thông báo đủ, ít nhiễu. | Kế hoạch |

### Công việc phát triển

| STT | DANH MỤC | NỘI DUNG CÔNG VIỆC | KẾT QUẢ ĐẠT ĐƯỢC | TRẠNG THÁI |
|-----|----------|--------------------|------------------|------------|
| 1 | CRM Mobile / Báo cáo | Tiếp tục căn báo cáo NV/Hub với org overview (pipeline, activity feed, KPI row, format VND); hoàn thiện WIP đang mở trên Report* + CrmHubScreen. | Báo cáo mobile gần web hơn; ship bản CRM Mobile mới sau khi ổn. | Kế hoạch |
| 2 | CRM Mobile / Planner & Voice | Hoàn thiện filter Planner, sync voice CRM-only (`match-phones`), Recordings/VoiceShareHandler; giảm upload nhầm cuộc gọi cá nhân trên máy thật. | Planner lọc đúng; ghi âm chỉ đồng bộ cuộc gọi CRM. | Kế hoạch |
| 3 | CRM Mobile / Điều hướng & UX | Cải thiện tab bar, Android back, Notifications/Drive/Menu; prune cache phiên dài; chuẩn bị bump version tiếp theo sau 2.2.46. | Điều hướng mượt; phiên dài không phình RAM; bản mới sẵn sàng cập nhật in-app. | Kế hoạch |
| 4 | SX Mobile / Branding & Login | Cập nhật icon/notification icon; chỉnh LoginScreen; đồng bộ app.json cho bản release tiếp theo. | App SX có bộ icon mới; màn login rõ ràng hơn trước khi ship. | Kế hoạch |
| 5 | Messenger / Lịch sử cuộc gọi | Mở rộng UI lịch sử gọi + chat info (wallpaper, cluster); xử lý edge case mạng yếu / realtime lệch trạng thái. | Messenger CRM Mobile gần web; lịch sử gọi dùng ổn trên LDPlayer/máy thật. | Kế hoạch |

---

*Nguồn: git log author MinDuc 20/07–25/07/2026 + kế hoạch tuần 27/07–01/08 (theo dõi WIP crm-mobile / sx-mobile). Form STT / Danh mục / Nội dung / Kết quả / Trạng thái.*
