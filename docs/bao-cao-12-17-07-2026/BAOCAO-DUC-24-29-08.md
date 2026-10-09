# Báo cáo công việc — Đức (MinDuc)

| | |
|---|---|
| **Người thực hiện** | Đức (git: MinDuc) |
| **Giai đoạn** | 24/08/2026 – 29/08/2026 |
| **Ngày lập** | 31/08/2026 |
| **Số commit** | 34 |
| **Ghi chú** | Yêu cầu ghi «24–29/09» — không có commit tháng 9; đã tổng hợp **tháng 8** (đúng kế hoạch tuần trước). |

---

## Tóm tắt

Tuần tập trung **tốc độ CRM/SX Kanban**, **sửa cắt PostgREST 1.000 dòng + phân trang trang Dự án**, **Work Unified thay /projects**, và **mobile-first web** (CRM/SX/VC/CSKH/Messenger + vuốt Kanban cảm ứng).

---

## II. Công việc thường xuyên

| STT | DANH MỤC | NỘI DUNG CÔNG VIỆC | KẾT QUẢ ĐẠT ĐƯỢC | TRẠNG THÁI |
|-----|----------|--------------------|------------------|------------|
| 1 | CRM / SX Kanban tốc độ | Tối ưu tải CRM: bớt JOIN thừa trên RPC khi không search; song song enrich ghim + chip SX. SX: RPC `sx_kanban_stage_page_ids`; sửa `getWonDealProjectIds` lọc theo company **dự án** (hết thiếu dự án HCB gia công); cache cột pipeline; Deadline snapshot sắp đúng hạn; reset total/hasMore cột 0. | Kanban CRM ~820→~600ms/batch; SX không phình wonIds; xưởng gia công đủ dự án; Deadline/cột trống đúng hành vi. | Hoàn thành (24/08) |
| 2 | Hạ tầng / PostgREST 1000 dòng | Sửa cắt âm thầm 1.000 dòng + URL ~25KB (`supabaseFetchAll`); cache single-flight + no-cache; sửa cột sai (`budget`→`estimated_value`, …); division scope 3 liên kết; dedup thông báo theo ngày VN; bỏ `quotation_files` nặng khỏi list Dự án. | Quota/KPI/progress không còn số 0 hoặc kẹt 1000; trang Dự án ~3,4s/5,8MB → ~1,9s/2,3MB. | Hoàn thành (25/08) |
| 3 | Trang Dự án / KPI bất biến | Phân trang server 4 view (Kanban/Danh sách/Lịch/Theo hạn); KPI lead/deal **GROUP BY SQL**; mốc quá hạn dùng `production_deadline`/`delivery`/`install`; index + gộp enrich; migration **569–574**. | Đủ dự án (569/569); KPI khớp DB; tải không phụ thuộc tổng 8.000 dự án. | Hoàn thành (25/08) |
| 4 | CRM tìm kiếm / lọc | Sửa bấm kết quả tìm không hiện thẻ trên Kanban; **xóa ghim tìm cũ** khi đổi Công ty/NV/KV (nguyên nhân «lọc phải F5»); tăng retry khi backend `--watch` restart (2 lần, 800ms+2200ms). | Tìm → thẻ lên board; đổi filter không còn thẻ ghim sai; ít kẹt data khi BE restart. | Hoàn thành (28–29/08) |
| 5 | Kanban cảm ứng | Bỏ 2 nút mép vô hình chặn vuốt ngang (~21% bề ngang); sửa vòng lặp đồng bộ scrollbar cố định ghi ngược `scrollLeft` giữa lúc vuốt. | Vuốt ngang trên điện thoại mượt, không còn «lúc được lúc không». | Hoàn thành (29/08) |
| 6 | Web mobile layout (CRM/SX/VC) | Fix tràn/cắt: toolbar CRM, form Lead, chat nhanh, Messenger, Drive banner, CSKH bảng→thẻ, Ghi âm, Nghỉ phép, Công việc CRM, SX khung hẹp, Giao việc/VC KPI. | Các trang chính dùng được trên mobile web không cuộn ngang / không bóp layout. | Hoàn thành (28–29/08) |

---

## III. Công việc phát triển

| STT | DANH MỤC | NỘI DUNG CÔNG VIỆC | KẾT QUẢ ĐẠT ĐƯỢC | TRẠNG THÁI |
|-----|----------|--------------------|------------------|------------|
| 1 | Work Unified | Chi tiết dự án (công việc trọng yếu, hồ sơ liên thông); gom Deal/SX/VC-LĐ; tab Không gian chung/Thành viên; badge bình luận; xóa `/projects`, chuyển `/management/work-unified`. | Một trang Work Unified thay Dự án cũ. | Hoàn thành (26/08) |
| 2 | Mobile-first web | CSS toàn cục + `ResponsiveTable`; sidebar off-canvas bước 1; redesign Giao diện & Hình nền; ProductionLayout/`SearchInlineFilterChips` mobile. | Nền tảng responsive: bảng→thẻ, sidebar trượt, layout không bóp nội dung. | Hoàn thành (28/08) |
| 3 | SX / VC / Giao việc mobile UX | SX thanh tóm tắt KPI 1 dòng (~293px); VC KPI 2 cột mặc định đóng; Giao việc CRM/SX/VC KPI mặc định thu gọn + nút trải đều. | Kanban mobile thấy board sớm hơn; KPI không chiếm hết viewport. | Hoàn thành (28–29/08) |

---

## IV. Kế hoạch (tuần tới 31/08 – 05/09)

### Công việc thường xuyên

| STT | DANH MỤC | NỘI DUNG CÔNG VIỆC | KẾT QUẢ ĐẠT ĐƯỢC | TRẠNG THÁI |
|-----|----------|--------------------|------------------|------------|
| 1 | Hồi quy mobile web | Smoke test CRM/SX/VC/CSKH/Messenger/Giao việc + vuốt Kanban + đổi filter không ghim tìm cũ. | Biên bản hồi quy; hotfix còn sót. | Kế hoạch |
| 2 | Dự án / Work Unified | Đối chiếu KPI phân trang server + điều hướng `/projects` → work-unified trên 4 view. | KPI ổn; không regress chi tiết dự án. | Kế hoạch |
| 3 | CRM/SX tốc độ production | Theo dõi latency Kanban trên Render; xác nhận wonIds/company gia công. | Board production trong ngưỡng; đủ dự án xưởng. | Kế hoạch |

### Công việc phát triển

| STT | DANH MỤC | NỘI DUNG CÔNG VIỆC | KẾT QUẢ ĐẠT ĐƯỢC | TRẠNG THÁI |
|-----|----------|--------------------|------------------|------------|
| 1 | Responsive web tiếp | Mở rộng ResponsiveTable/sidebar; chuẩn hóa KPI thu gọn các dashboard. | Web ổn trên điện thoại cho luồng hàng ngày. | Kế hoạch |
| 2 | Work Unified | Tiếp tục chi tiết (tài liệu/bình luận/nhắc việc); deep-link CRM/SX/VC. | Một điểm vào dự án đa module. | Kế hoạch |

---

## Phân bổ theo ngày

| Ngày | Việc chính |
|------|------------|
| **24/08** | Tối ưu CRM/SX Kanban; sửa wonIds chéo công ty; Deadline snapshot |
| **25/08** | PostgREST 1000 dòng + cache; phân trang/KPI trang Dự án (migration 569–574) |
| **26/08** | Work Unified chi tiết; xóa `/projects` |
| **27/08** | Không có commit MinDuc |
| **28/08** | Mobile-first hàng loạt (CRM/SX/VC/CSKH/Messenger/ResponsiveTable/sidebar) |
| **29/08** | Kanban cảm ứng; VC layout; xóa ghim tìm khi đổi filter; retry BE restart |

---

*Nguồn: git log author MinDuc, 24/08–29/08/2026. Form STT / Danh mục / Nội dung / Kết quả / Trạng thái.*
