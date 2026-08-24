# Báo cáo công việc — Đức (MinDuc)

| | |
|---|---|
| **Người thực hiện** | Đức (git: MinDuc) |
| **Giai đoạn** | 19/07/2026 – 24/07/2026 |
| **Ngày lập** | 21/07/2026 |
| **Phạm vi** | Đã làm (19–21/07) + có thể làm tiếp (22–24/07) |

---

## II. Công việc thường xuyên

| STT | DANH MỤC | NỘI DUNG CÔNG VIỆC | KẾT QUẢ ĐẠT ĐƯỢC | TRẠNG THÁI |
|-----|----------|--------------------|------------------|------------|
| 1 | CRM Mobile / Báo cáo | Đồng bộ báo cáo CRM mobile với org overview web: tách KPI QH SLA Lead/Deal; loại deal lost khỏi thẻ Deal/Pipeline; prefetch tổng Hub; sửa lệch số liệu SLA do timezone (local vs Render lệch 1 ngày). | Số liệu Hub/báo cáo NV trên app khớp org overview web; SLA Lead/Deal tách rõ; không còn lệch ngày giữa máy local và production. | Hoàn thành (20/07) |
| 2 | CRM / Ngày & SLA | Thống nhất toàn bộ logic ngày báo cáo, kỳ KPI, open-deal KPI và hạn SLA Kanban theo **Asia/Ho_Chi_Minh** (backend + web + crm-mobile: `vnDate`, `crmReportDateBounds`, `kpiCalculator`). | Filter kỳ, deadline SLA và KPI không còn lệch ngày khi deploy Render; web và app dùng cùng múi giờ VN. | Hoàn thành (20/07) |
| 3 | CRM Mobile / Báo cáo NV | Sửa mẫu số tỷ lệ chốt deal NV (dùng `open_deal_count` + mẫu số conversion đầy đủ); format số VND ngắn chính xác dạng «X tỷ Y tr» thay vì làm tròn 1 chữ số thập phân. | Biểu đồ NV trên app và org overview hiển thị tỷ lệ chốt đúng; số tiền lớn đọc được, không lệch do làm tròn. | Hoàn thành (20/07) |
| 4 | CRM Mobile / Hiệu năng & Messenger | Tối ưu app: API lịch sử cuộc gọi batch; virtualize danh sách NV báo cáo; polish boot/back, cache Events/Messenger; giảm giật khi mở Hub/Events. | App mở và cuộn báo cáo mượt hơn; lịch sử gọi Messenger load theo batch; trải nghiệm back/boot ổn định hơn trên thiết bị. | Hoàn thành (20/07) |
| 5 | CRM Mobile / Sự kiện | Cho phép admin chọn công ty ngay trong form tạo sự kiện (bỏ bước bắt buộc lọc công ty trước); phát hành **CRM Mobile 2.2.27 (138)** kèm hướng dẫn LDPlayer; kích hoạt tải APK trên web. | Admin tạo sự kiện nhanh hơn; bản 2.2.27 lên kênh cập nhật app; tài liệu/screenshot hướng dẫn tạo sự kiện sẵn sàng. | Hoàn thành (20/07) |
| 6 | App Update / Phát hành | Cho phép URL APK host trên GitHub trong kiểm tra download cập nhật app — khi Render disk không còn file nhưng GitHub raw vẫn phục vụ được. | Release CRM/SX mobile không bị chặn tải khi file chỉ còn trên GitHub; kênh cập nhật in-app hoạt động lại. | Hoàn thành (21/07) |
| 7 | SX Mobile / KPI Board | Căn KPI board SX mobile với web (công thức giống ProductionDashboard); tắt spam push/tray thừa; bật lại column enrich — dùng cùng `sx_kanban_column_id` / `sx_intake` từ BE thay vì ghi đè resolve phía client (sửa lệch cột «Đang sản xuất»). | KPI Overview/Kanban mobile khớp web; thông báo ít nhiễu hơn; cột Đang SX không còn lệch số so với dashboard web. | Hoàn thành (21/07) |
| 8 | SX Mobile / Kiểm thử hồi quy | Smoke test trên máy thật / LDPlayer: đối chiếu KPI Overview–Kanban–web (Đang SX, Quá hạn, công nợ); xác nhận không còn spam notification sau bản 21/07; ghi nhận case lệch nếu còn. | Biên bản đối chiếu KPI web ↔ mobile; danh sách bug còn lại (nếu có) để xử lý trong tuần. | Kế hoạch (22–23/07) |
| 9 | CRM Mobile / Ổn định bản 2.2.27 | Theo dõi cập nhật in-app sau phát hành 2.2.27; kiểm tra tải APK qua GitHub URL; xác nhận admin tạo sự kiện chọn công ty trên bản production; xử lý phản hồi lỗi nhỏ từ user (crash, back Android, cache Events). | Bản 2.2.27 ổn định trên kênh cập nhật; hotfix nhanh nếu phát sinh lỗi blocker. | Kế hoạch (22–24/07) |
| 10 | CRM / Báo cáo & SLA | Rà soát thêm edge case timezone/SLA sau unify VN: kỳ filter «tháng này», deadline lead không SĐT, KPI QH Lead vs Deal trên org overview + mobile; sửa lệch số còn sót nếu QA báo. | Web và mobile cùng một bộ số liệu báo cáo/SLA trong các kỳ filter thường dùng. | Kế hoạch (23–24/07) |
| 11 | Thông báo CRM / SX / VC | Tiếp tục giảm nhiễu và lỗ hổng thông báo (tiếp nối tuần trước + cắt spam 21/07): kiểm tra badge, tray, assignment, comment realtime trên sx-mobile và crm-mobile; đảm bảo không miss thông báo giao việc quan trọng. | Thông báo đủ, đúng, ít spam; badge khớp số chưa đọc trên các module chính. | Kế hoạch (22–24/07) |

---

## III. Công việc phát triển

| STT | DANH MỤC | NỘI DUNG CÔNG VIỆC | KẾT QUẢ ĐẠT ĐƯỢC | TRẠNG THÁI |
|-----|----------|--------------------|------------------|------------|
| 1 | CRM Mobile / Sự kiện | Xây form tạo/sửa sự kiện đầy đủ trên app (`EventFormModal`): chọn thời gian, người liên quan, công ty; bộ lọc sự kiện (`EventFilterModal`); admin chọn công ty ngay trong form; kèm tài liệu hướng dẫn LDPlayer + screenshot. | User tạo và lọc sự kiện ngay trên CRM Mobile; admin không cần bước lọc công ty trước; có tài liệu hướng dẫn thao tác. | Hoàn thành (20/07) |
| 2 | Messenger / Lịch sử cuộc gọi | Thêm API lịch sử cuộc gọi **batch** phía backend (`messengerGroups`); tích hợp CallContext / màn Messenger trên CRM Mobile để xem lịch sử gọi theo hội thoại, giảm số request rời rạc. | App xem được lịch sử cuộc gọi Messenger theo batch; tải nhanh hơn, ổn định hơn khi hội thoại có nhiều cuộc gọi. | Hoàn thành (20/07) |
| 3 | CRM Mobile / Báo cáo & Hub | Phát triển UI báo cáo: biểu đồ cột dọc (`ReportVerticalBarChart`); tách thẻ KPI QH SLA Lead/Deal; prefetch tổng Hub; đồng bộ metric với org overview web để NV xem báo cáo trên điện thoại như trên web. | Hub và báo cáo NV trên app có biểu đồ/KPI rõ; số liệu gần với org overview; mở Hub nhanh nhờ prefetch. | Hoàn thành (20/07) |
| 4 | CRM Mobile / Nền tảng app | Bổ sung BootSplash, AndroidBackGuard, PermissionBootstrap; plugin Google Services; đồng bộ wallpaper chat; cải thiện push/realtime Messenger và cache Events — nền tảng cho bản 2.2.27. | App khởi động, xin quyền, xử lý nút Back ổn định hơn; chat có wallpaper; sẵn sàng ship production **2.2.27 (138)**. | Hoàn thành (20/07) |
| 5 | SX Mobile / Overview & KPI | Mở rộng công thức KPI board trên Overview/Kanban (`sxBoardKpis`) khớp ProductionDashboard web; enrich cột từ BE (`sx_kanban_column_id`, `sx_intake`) để mobile và web cùng một nguồn cột «Đang sản xuất». | Overview SX mobile phản ánh đúng board web; KPI và phân cột dự án thống nhất giữa hai nền tảng. | Hoàn thành (21/07) |
| 6 | CRM / SX Mobile / Tối ưu APK | Triển khai tối ưu dung lượng APK (plugin `withApkSizeOptimizations`, cấu hình build release) cho crm-mobile-v2 và sx-mobile; giảm kích thước gói cập nhật in-app. | APK nhẹ hơn, tải cập nhật nhanh hơn trên kênh GitHub/Render; dễ phân phối bản mới trong tuần. | Kế hoạch (22–24/07) |
| 7 | Messenger CRM Mobile | Tiếp tục hoàn thiện lịch sử cuộc gọi và chat info (wallpaper, cluster tin nhắn, file): UI xem lại cuộc gọi, đồng bộ trạng thái realtime, xử lý edge case khi mạng yếu. | Trải nghiệm Messenger trên CRM Mobile gần web hơn; lịch sử gọi/chat info dùng ổn định trên máy thật. | Kế hoạch (22–24/07) |
| 8 | CRM Mobile / Báo cáo | Mở rộng báo cáo NV trên app: drill-down chi tiết, căn thêm metric còn lệch với org overview (pipeline, lost, SLA), cải thiện biểu đồ và filter kỳ theo timezone VN đã unify. | NV theo dõi KPI cá nhân/đội trên điện thoại đầy đủ hơn, số khớp web trong các kỳ filter chính. | Kế hoạch (23–24/07) |

---

## Phân bổ theo ngày

| Ngày | Việc |
|------|------|
| **19/07** (CN) | Không có commit |
| **20/07** | Báo cáo/Hub CRM mobile; unify timezone VN; tỷ lệ chốt + VND; form sự kiện + filter; lịch sử gọi batch; nền tảng app (BootSplash, quyền, wallpaper); release 2.2.27 |
| **21/07** | GitHub APK URL; KPI SX mobile khớp web + enrich cột Đang SX; giảm spam thông báo |
| **22–24/07** | Hồi quy KPI/thông báo; ổn định 2.2.27; tối ưu APK; hoàn thiện Messenger/báo cáo mobile |

---

*Nguồn: git log author MinDuc 19–21/07 + kế hoạch 22–24/07. Form theo mẫu STT / Danh mục / Nội dung / Kết quả / Trạng thái.*
