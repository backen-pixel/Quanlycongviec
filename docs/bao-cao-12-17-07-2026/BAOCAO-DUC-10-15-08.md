# Báo cáo công việc — Đức (MinDuc)

| | |
|---|---|
| **Người thực hiện** | Đức (git: MinDuc) |
| **Giai đoạn** | 10/08/2026 – 15/08/2026 |
| **Ngày lập** | 17/08/2026 |
| **Số commit** | ~40 (gộp WIP/index) |

---

## Tóm tắt

Tuần tập trung **scale CRM/SX mobile** (Tasks KPI, board data lớn, soft-ingest), **lead detail + comment đính kèm**, **toggle Deal/Đơn hàng**, **báo cáo ngày tự điền từ Deadline + xuất Excel**, và **scope thông báo / HCB deadline 17:30**.

---

## II. Công việc thường xuyên

| STT | DANH MỤC | NỘI DUNG CÔNG VIỆC | KẾT QUẢ ĐẠT ĐƯỢC | TRẠNG THÁI |
|-----|----------|--------------------|------------------|------------|
| 1 | Messenger / Inbox | Phân trang inbox stats, work, events, forward thay vì dump full; căn scope công ty VC planner; paginate messenger inbox. | Inbox/Messenger tải theo trang, không treo khi data lớn; planner VC đúng scope công ty. | Hoàn thành (10/08) |
| 2 | SX Mobile / Data lớn | Ổn định board lớn: paginate assignments, patch cache `project:updated`, virtualize tasks; dừng vòng reload Work; filter Work trên API; re-apply socket khi multi-page fetch; Overview summary + first-page thay full board. | SX mobile chịu data lớn ổn hơn; Work không flash spinner/loop; Overview mở nhanh hơn. | Hoàn thành (11/08) |
| 3 | Management / Dashboard | Sửa crash Management dashboard khi VC pipeline strip thiếu icon. | Dashboard quản trị mở bình thường dù pipeline VC thiếu icon. | Hoàn thành (11/08) |
| 4 | SX Mobile / KPI & realtime | Căn Work KPI với web qua `/stats`; soft-ingest board; chia sẻ fetch Overview+Kanban; overdue theo ngày VN; harden refresh/cache sau move cột; silent-refresh Kanban on focus. | KPI Work khớp web; realtime không làm stale board; overdue đúng lịch VN. | Hoàn thành (12/08) |
| 5 | CRM Mobile / Tasks KPI | Sửa `/stats` 500 do enum status sai (`todo`/`doing`/`done`); KPI fallback khi stats lỗi; tách KPI khỏi list phân trang; TTL focus 8s; không reload KPI khi đổi tab status; abort race. | Tasks hiện totals đúng; list >1000 không cắt; đổi tab mượt, KPI không trống. | Hoàn thành (13/08) |
| 6 | CRM Mobile / Pin & battery | Cắt idle battery (FAB glow không chạy 60fps mãi); gộp warm-up Kanban trùng; Deadline/Tasks không kẹt spinner khi abort; keyboard-inset / permission / update-progress (**2.2.129**). | App ít hao pin khi để yên; ít traffic warm-up trùng; loading không kẹt. | Hoàn thành (14/08) |
| 7 | Daily report / Kết quả | Sửa ma trận Kết quả: live CRM theo ngày chọn; tách Sale Admin vs Sale-Deal; chỉ tính nhân sự CRM. | Báo cáo ngày phản ánh đúng số CRM theo ngày và vai trò. | Hoàn thành (14/08) |
| 8 | Thông báo / Deadline / Search | Scope thông báo theo công ty (system admin xem all); **HCB deadline cutoff 17:30 VN**; search suggest mobile không dính filter ngày/SĐT; Deadline hiện loaded/total; tối ưu web CRM (Earth bg, Kanban overscroll). | Thông báo đúng tenant; HCB quá hạn sau 17:30; search/Deadline không gây hiểu nhầm badge. | Hoàn thành (15/08) |

---

## III. Công việc phát triển

| STT | DANH MỤC | NỘI DUNG CÔNG VIỆC | KẾT QUẢ ĐẠT ĐƯỢC | TRẠNG THÁI |
|-----|----------|--------------------|------------------|------------|
| 1 | CRM Mobile / Lead detail | Cải thiện chi tiết lead: info, cọc, badge comment, mở/tải file (serve-local auth, IntentLauncher); preview file comment hệ thống; sửa được customer + field lead/deal trên tab info. Ship **2.2.80–2.2.82**. | NV chỉnh thông tin/cọc/file ngay trên app; file comment xem được như web. | Hoàn thành (12/08) |
| 2 | CRM Mobile / Realtime & comment | Socket badge SX/VC tức thì; sync stage + picker SX khi won/ký HĐ; composer comment đính kèm/camera; sắp tab Comments; thông báo APK release mới. | Chip SX/VC cập nhật realtime; gửi ảnh/file comment trên mobile; biết khi có bản APK mới. | Hoàn thành (12/08) |
| 3 | CRM Mobile / Tasks & Deal-Order | Scale Tasks: KPI `/stats` + paging; chat history phân trang; toggle **Deal ↔ Đơn hàng** trên Hub/List khi Tách ĐH; quick chat dock click-to-open; bump **2.2.113** (code 224). | Tasks chịu data lớn; Deal/ĐH tách trên mobile như web; mở chat nhanh từ assignment. | Hoàn thành (13/08) |
| 4 | Daily report / Kế hoạch & Excel | Tự điền & auto-close mục **Kế hoạch** từ CRM Deadline (Quá hạn + Hôm nay, cùng nguồn board); xuất **Excel** ma trận KH/KQ (overview, heatmap theo role, sheet so sánh). | Báo cáo ngày ít nhập tay; xuất Excel để lọc/so sánh KH vs KQ. | Hoàn thành (14/08) |

---

## IV. Kế hoạch (tuần tới 17/08 – 22/08)

### Công việc thường xuyên

| STT | DANH MỤC | NỘI DUNG CÔNG VIỆC | KẾT QUẢ ĐẠT ĐƯỢC | TRẠNG THÁI |
|-----|----------|--------------------|------------------|------------|
| 1 | CRM / SX Mobile hồi quy | Smoke test Tasks KPI, Deadline loaded/total, search suggest, soft-ingest SX, Work overdue VN, thông báo theo company trên máy thật/LDPlayer. | Biên bản hồi quy; hotfix nếu còn lệch KPI hoặc spam/miss thông báo. | Kế hoạch |
| 2 | Daily report | Đối chiếu ma trận KH/KQ với Deadline board + org report theo ngày; kiểm tra Excel export trên vài công ty (gồm HCB 17:30). | Số báo cáo ngày khớp board; file Excel dùng được cho họp. | Kế hoạch |
| 3 | CRM Mobile pin & warm-up | Theo dõi hao pin/idle sau tắt FAB glow; xác nhận warmCrmHub không còn gọi trùng từ Overview/Menu/Hub. | Idle CPU thấp; warm-up gọn, không nhân bản request. | Kế hoạch |

### Công việc phát triển

| STT | DANH MỤC | NỘI DUNG CÔNG VIỆC | KẾT QUẢ ĐẠT ĐƯỢC | TRẠNG THÁI |
|-----|----------|--------------------|------------------|------------|
| 1 | CRM Mobile / Lead & comment | Tiếp tục parity lead detail với web (field còn thiếu, preview Office); ổn định camera/keyboard inset trên thiết bị khác nhau. | Sửa lead/comment trên app đủ dùng hàng ngày như web. | Kế hoạch |
| 2 | Daily report | Mở rộng Excel/auto-fill (thêm role/filter nếu cần); đồng bộ thêm nguồn Deadline khi đổi cấu hình HCB/công ty khác. | Báo cáo ngày tự động hơn, ít chỉnh tay hơn. | Kế hoạch |
| 3 | CRM / SX hiệu năng web+app | Tiếp tục giảm Earth/GPU web; Kanban overscroll; SX board soft-ingest + Overview summary trên production data lớn. | Web và SX mobile mượt hơn với data production thực tế. | Kế hoạch |

---

## Phân bổ theo ngày

| Ngày | Việc chính |
|------|------------|
| **10/08** | Paginate inbox/messenger; căn VC planner theo công ty |
| **11/08** | SX mobile data lớn (Work/Overview); sửa crash Management VC icon |
| **12/08** | Lead detail/comment/file; realtime SX/VC badge; SX KPI soft-ingest; overview today KPIs |
| **13/08** | Tasks KPI/paging (>1000); Deal↔ĐH toggle; quick chat dock; bump 2.2.113 |
| **14/08** | Daily report KH auto từ Deadline + Excel KH/KQ; sửa ma trận KQ; cắt pin/warm-up |
| **15/08** | Scope thông báo theo company; HCB deadline 17:30; search/Deadline meta; tối ưu web CRM UI |

---

*Nguồn: git log author MinDuc, 10/08–15/08/2026. Form STT / Danh mục / Nội dung / Kết quả / Trạng thái.*
