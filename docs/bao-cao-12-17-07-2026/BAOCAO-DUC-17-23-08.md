# Báo cáo công việc — Đức (MinDuc)

| | |
|---|---|
| **Người thực hiện** | Đức (git: MinDuc) |
| **Giai đoạn** | 17/08/2026 – 23/08/2026 |
| **Ngày lập** | 24/08/2026 |
| **Số commit** | 21 |

---

## Tóm tắt

Tuần tập trung **VC mobile** (Work inbox, filter, board sync, overview-kpis), **SX Work file/status + Kanban load-more**, **giảm traffic Auto Tool socket**, và **CRM search/suggest + thông báo theo module**.

---

## II. Công việc thường xuyên

| STT | DANH MỤC | NỘI DUNG CÔNG VIỆC | KẾT QUẢ ĐẠT ĐƯỢC | TRẠNG THÁI |
|-----|----------|--------------------|------------------|------------|
| 1 | VC Mobile / Work & Overview | Kết nối tab Công việc với nhiệm vụ logistics dự án; căn inbox với project-detail; lọc công ty/NV; căn vùng Nhiệm vụ với tab giao hàng deal; bỏ fallback CRM-sales để inbox chỉ hiện việc VC/LĐ. | Inbox/Work VC khớp ProjectDetail; lọc công ty–NV dùng chung; số nhiệm vụ không lẫn CRM sales. | Hoàn thành (17/08) |
| 2 | VC Mobile / Board sync | Sửa sync board: disk cache snapshot cắt ngắn; realtime patch web từ mobile; map cột install/inplace theo bucket khi xem tất cả công ty; ẩn dự án chỉ SX còn cột VC cũ (stale) khỏi board logistics. | Board VC mobile↔web đồng bộ hơn; all-company không map nhầm cột; hết thẻ SX «ma» trên VC. | Hoàn thành (19/08) |
| 3 | VC / Overview KPI & cache | Sửa route overview-kpis 500 (thenable query); ngăn cache tab Công việc ghi đè Tổng quan; hết overwrite pull-to-refresh / optimistic patch; lọc ưu tiên nằm trong filter chung (không tải board 2 lần). | KPI Tổng quan VC ổn định; các tab không làm trống lẫn nhau; ít tải board trùng. | Hoàn thành (20/08) |
| 4 | Socket / Auto Tool & pin | Ngừng broadcast Auto Tool state (~5KB/log) tới mọi client — chỉ emit room admin; sx-mobile: bỏ drain 40 trang KPI khi `/stats` lỗi; tách banner quá hạn (task vs project). | Giảm ~240MB/ngày traffic thừa trên điện thoại; KPI không silent-fail; chạm banner quá hạn đúng loại. | Hoàn thành (20/08) |
| 5 | SX Mobile / Task status & file | Đồng bộ trạng thái `crm_tasks` ↔ `crm_assignments` (Công việc không còn «Chưa làm» sau khi hoàn thành trên detail); mở/xem file đính kèm; bỏ list file CRM+assignment trùng; gallery yêu cầu xem ảnh/Office. | Status Work khớp web; xem/tải file trên thẻ việc; không còn file nhân đôi. | Hoàn thành (21/08) |
| 6 | SX Kanban / Load-more & badge | Sửa cột trống khi summary có KPI nhưng fetch thẻ bị ghi đè; load-more không skip trang trùng; ưu tiên thẻ cột khi chạm cap board; badge dùng tổng server (không cộng dồn khi cuộn). | Cột SX đầy thẻ đúng; load-more ổn; badge = tổng server. | Hoàn thành (21/08) |
| 7 | CRM / Tìm kiếm & thông báo | Sửa tìm CRM không lên board (pin thẻ + bỏ lọc thời gian khi Enter); siết chuông/badge theo module sidebar, không broadcast cả công ty; sửa leave staff picker cho `sales_admin` (load `/users`, select tìm NV). | Deal tìm thấy hiện trên Kanban; thông báo đúng module/tài khoản; sales_admin quản lý nghỉ phép được. | Hoàn thành (22/08) |

---

## III. Công việc phát triển

| STT | DANH MỤC | NỘI DUNG CÔNG VIỆC | KẾT QUẢ ĐẠT ĐƯỢC | TRẠNG THÁI |
|-----|----------|--------------------|------------------|------------|
| 1 | VC Mobile / Filters & realtime | Căn filter VC mobile với web (người/SĐT/ưu tiên); chip owner dễ đọc; keyboard inset như CRM; realtime Kanban/Work qua assignment socket. Ship **1.1.62**. | Lọc VC giống web; board/Work cập nhật realtime; UX gần CRM mobile. | Hoàn thành (18/08) |
| 2 | VC Mobile / Overview & deal task | Cải thiện Overview (bỏ summary board nặng); thông báo chỉ logistics; chip VC/LĐ gọn; batch load file task; harden checklist/status/file trên deal detail. Board sync **1.1.83**. | Overview nhẹ hơn; notif đúng module VC; thao tác task/file trên deal ổn định hơn. | Hoàn thành (19/08) |
| 3 | VC / Overview KPIs API | Thêm `/logistics/overview-kpis` đếm theo cột phía server; mobile dùng một lớp query/board cache chung cho Kanban / Kế hoạch / Quá hạn / Danh sách. | Tổng quan không cần tải full board chỉ để đếm KPI; các tab chia sẻ một lần tải board theo filter. | Hoàn thành (20/08) |
| 4 | SX Mobile / File preview | Xem ảnh work-task trong lightbox in-app; tải Word/Excel/PPT/PDF về Downloads; gallery yêu cầu assignment preview ảnh/Office thay link trần. | Hành vi file gần web: ảnh xem ngay, Office tải về máy. | Hoàn thành (21/08) |
| 5 | CRM / Search & all-region | Tăng tốc tìm CRM bằng **suggest API**; load thẻ khớp lên board không reload full; cho phép Kanban «Tất cả vùng» (VPT) không bắt buộc chọn vùng. | Tìm nhanh hơn; kết quả hiện trên board ngay; admin/NV xem all-region được. | Hoàn thành (22/08) |

---

## IV. Kế hoạch (tuần tới 24/08 – 29/08)

### Công việc thường xuyên

| STT | DANH MỤC | NỘI DUNG CÔNG VIỆC | KẾT QUẢ ĐẠT ĐƯỢC | TRẠNG THÁI |
|-----|----------|--------------------|------------------|------------|
| 1 | VC / SX Mobile hồi quy | Smoke test Work inbox VC, overview-kpis, board all-company, SX load-more/badge, sync status task↔assignment, file preview trên máy thật. | Biên bản hồi quy; hotfix nếu còn cột trống / KPI đè / file trùng. | Kế hoạch |
| 2 | CRM tìm kiếm & thông báo | Đối chiếu tìm Enter → pin board; chuông theo module CRM/SX/VC; leave picker sales_admin trên vài công ty. | Tìm và thông báo đúng phạm vi; không regress Kanban filter thời gian. | Kế hoạch |
| 3 | Bảo mật tenant CRM | Rà soát admin «Tất cả công ty» / RPC stage-counts & kanban page (tiếp nối siết scope); xác nhận không lẫn dữ liệu tenant trên Hub/Kanban. | Admin hệ thống không còn nhìn/đếm nhầm dữ liệu công ty khác khi không chọn filter. | Kế hoạch |

### Công việc phát triển

| STT | DANH MỤC | NỘI DUNG CÔNG VIỆC | KẾT QUẢ ĐẠT ĐƯỢC | TRẠNG THÁI |
|-----|----------|--------------------|------------------|------------|
| 1 | VC Mobile parity | Tiếp tục căn filter/UX deal task với web; mở rộng realtime và cache query dùng chung cho màn còn refetch thừa. | VC mobile gần web hơn trên luồng Công việc / Tổng quan / Kanban. | Kế hoạch |
| 2 | SX Work / File & nhóm deal | Hoàn thiện nhóm task theo deal trên Overview/Work; UX xem/thêm file trên thẻ; đồng bộ status edge case còn sót. | Công việc SX mobile thao tác file và trạng thái thống nhất với web. | Kế hoạch |
| 3 | CRM Search / Kanban | Mở rộng suggest + pin kết quả; tối ưu all-region VPT; giảm reload khi đổi filter tìm. | Tìm trên web/mobile nhanh, kết quả luôn thấy trên board. | Kế hoạch |

---

## Phân bổ theo ngày

| Ngày | Việc chính |
|------|------------|
| **17/08** | VC Work inbox ↔ project tasks; lọc công ty/NV; căn vùng Nhiệm vụ |
| **18/08** | VC filters + Kanban/Work realtime; ship **1.1.62** |
| **19/08** | VC overview/notifs/deal task; board disk cache + all-company map (**1.1.83**); ẩn SX stale trên VC |
| **20/08** | `/logistics/overview-kpis` + shared board cache; sửa KPI 500/cache đè; Auto Tool socket → room |
| **21/08** | SX sync status task↔assignment; file preview/tải; Kanban load-more + badge server |
| **22/08** | CRM suggest search + all-region; notif theo module; leave picker sales_admin |
| **23/08** | Không có commit MinDuc |

---

*Nguồn: git log author MinDuc, 17/08–23/08/2026. Form STT / Danh mục / Nội dung / Kết quả / Trạng thái.*
