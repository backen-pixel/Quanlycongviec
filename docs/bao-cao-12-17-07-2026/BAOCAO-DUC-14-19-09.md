# Báo cáo công việc — Đức (MinDuc)

| | |
|---|---|
| **Người thực hiện** | Đức (git: MinDuc) |
| **Giai đoạn** | 14/09/2026 – 19/09/2026 |
| **Ngày lập** | 22/09/2026 |
| **Số commit** | 4 (đều ngày 16/09) |

---

## Tóm tắt

Tuần tập trung **sửa cột Kanban CRM rỗng khi đổi lọc/tab nhanh**, và **tăng diện tích board** Work Unified + Tổng quan nhiệm vụ dự án (bỏ KPI trùng, chỉnh chiều cao cột).

---

## II. Công việc thường xuyên

| STT | DANH MỤC | NỘI DUNG CÔNG VIỆC | KẾT QUẢ ĐẠT ĐƯỢC | TRẠNG THÁI |
|-----|----------|--------------------|------------------|------------|
| 1 | CRM Kanban | Sửa cột Kanban CRM kết rỗng sau khi đổi bộ lọc/tab quá nhanh: lần tải trang đầu bị hủy theo thế hệ request nhưng effect không chạy lại vì tập id cột không đổi. | Đổi lọc/tab không còn cột trống dù tổng đếm vẫn đúng; không cần F5. | Hoàn thành (16/09) |
| 2 | Work Unified / chiều cao board | Bỏ `min-h-[28rem]` ép cột cao hơn khung thật (không cuộn được); ẩn hàng KPI trùng chức năng lọc với tab; trừ đúng `pt-12` (48px) dưới lg. | Vùng thẻ dự án ~438px → ~590px (+35%); Kanban/Deadline/Planner cuộn đủ, không cắt đáy. | Hoàn thành (16/09) |
| 3 | Tổng quan nhiệm vụ dự án | Bỏ hàng 6 thẻ KPI trùng header cột; nâng trần chiều cao cột; chỉnh lại `100vh−326px` (lg) / `100vh−374px` (dưới lg) sau khi tách hàng module + ô tìm kiếm. | Cột «Chưa có hạn» (266 NV) nằm trọn màn hình; lọc theo nhóm hạn vẫn dùng trong panel Bộ lọc. | Hoàn thành (16/09) |

---

## III. Công việc phát triển

| STT | DANH MỤC | NỘI DUNG CÔNG VIỆC | KẾT QUẢ ĐẠT ĐƯỢC | TRẠNG THÁI |
|-----|----------|--------------------|------------------|------------|
| 1 | Work Unified / UX board | Tối ưu không gian Kanban·Deadline·Planner: ưu tiên vùng thẻ dự án, bỏ KPI trùng, căn chiều cao theo breakpoint. | Board Work Unified dùng được nhiều diện tích hơn trên desktop và laptop nhỏ. | Hoàn thành (16/09) |
| 2 | Tổng quan nhiệm vụ / UX | Đơn giản hóa layout: một lớp header cột + board cao hơn; lọc trạng thái/hạn gom vào panel Bộ lọc. | Màn tổng quan gọn, ít trùng UI, cột cao hơn để xem nhiều nhiệm vụ. | Hoàn thành (16/09) |

---

## IV. Kế hoạch (tuần tới 21/09 – 26/09)

### Công việc thường xuyên

| STT | DANH MỤC | NỘI DUNG CÔNG VIỆC | KẾT QUẢ ĐẠT ĐƯỢC | TRẠNG THÁI |
|-----|----------|--------------------|------------------|------------|
| 1 | Hồi quy Kanban CRM | Smoke test đổi lọc/tab nhanh nhiều lần trên pipeline lớn; xác nhận cột không còn rỗng khi totals vẫn đúng. | Biên bản hồi quy; hotfix nếu còn race thế hệ request. | Kế hoạch |
| 2 | Work Unified / Tổng quan NV | Đối chiếu chiều cao board trên 1440 / laptop / mobile web sau chỉnh `100vh`; kiểm tra cuộn cột «Chưa có hạn» nhiều thẻ. | Board không tràn/cắt đáy ở các độ phân giải chính. | Kế hoạch |

### Công việc phát triển

| STT | DANH MỤC | NỘI DUNG CÔNG VIỆC | KẾT QUẢ ĐẠT ĐƯỢC | TRẠNG THÁI |
|-----|----------|--------------------|------------------|------------|
| 1 | Work Unified | Tiếp tục tối ưu không gian và lọc board theo phản hồi dùng thực tế. | Board dự án dễ quét hơn, ít trùng KPI/lọc. | Kế hoạch |
| 2 | Tổng quan nhiệm vụ dự án | Mở rộng lọc/nhóm hạn trong panel Bộ lọc nếu cần thay hàng KPI đã bỏ. | Lọc theo hạn vẫn đủ mạnh khi không còn hàng KPI trên board. | Kế hoạch |

---

## Phân bổ theo ngày

| Ngày | Việc chính |
|------|------------|
| **14–15/09** | Không có commit MinDuc |
| **16/09** | CRM Kanban cột rỗng khi đổi lọc/tab; Work Unified tăng chiều cao board; Tổng quan nhiệm vụ bỏ KPI trùng + chỉnh trần cột |
| **17–19/09** | Không có commit MinDuc |

---

*Nguồn: git log author MinDuc, 14/09–19/09/2026. Form STT / Danh mục / Nội dung / Kết quả / Trạng thái.*
