# Báo cáo công việc — Đức (MinDuc)

| | |
|---|---|
| **Người thực hiện** | Đức (git: MinDuc) |
| **Giai đoạn** | 31/08/2026 – 05/09/2026 |
| **Ngày lập** | 08/09/2026 |
| **Số commit** | 24 |

---

## Tóm tắt

Tuần tập trung **Giao việc CRM** (thiết kế lại + lọc + tốc độ), **báo cáo hàng ngày** (~9s → ~1s), **CRM/SX dashboard** trên data lớn, và **cảnh báo cắt PostgREST 1.000 dòng**.

---

## II. Công việc thường xuyên

| STT | DANH MỤC | NỘI DUNG CÔNG VIỆC | KẾT QUẢ ĐẠT ĐƯỢC | TRẠNG THÁI |
|-----|----------|--------------------|------------------|------------|
| 1 | Work Unified / cache | Cache 20s cho `/work-unified`, giảm số lượt gọi Supabase; mount `invalidateProjectsListOnWrite` để xóa cache ngay khi ghi `projects`. | Tải danh sách nhanh hơn; sửa dự án thấy ngay, không trễ tới 20s. | Hoàn thành (31/08) |
| 2 | CRM Dashboard | Không báo «Mất kết nối máy chủ» khi lần tải đã bị thay thế; giữ scope công ty khi chưa resolve được `pipeline_id`. | Đổi filter/công ty ít báo lỗi giả; không mất phạm vi đang xem. | Hoàn thành (31/08) |
| 3 | Giao việc CRM — dữ liệu & tốc độ | Bịt lệch `crm_assignments` ↔ `crm_tasks`; tách sửa lệch khỏi GET danh sách; giảm lượt gọi + không bỏ sót khi phân trang; bỏ nạp cả bảng, tách lớp chỉ số + thẻ theo cột; cuộn riêng từng cột. | Trang mở nhanh, ít giật; cột đủ thẻ; status assignment khớp task. | Hoàn thành (03/09) |
| 4 | Giao việc CRM — bộ lọc | Sửa Bộ lọc nhanh không chạy; bỏ «Chọn nhóm»; sửa lọc NV đã xóa; thêm lọc công ty + dropdown tùy chỉnh; thanh «Thống kê theo NV» khớp đúng %. | Lọc NV/trạng thái/ưu tiên áp đúng board; thống kê không lệch phần trăm. | Hoàn thành (03/09) |
| 5 | Báo cáo hàng ngày | Bảng tổng hợp ~9s → ~1,0s (135 → 22 truy vấn, cache theo request); debounce ô tìm NV; nâng trần phân trang thẻ đang mở cả công ty. | Ma trận KH/KQ tải nhanh hơn; không bị cắt âm thầm ở 8.000 thẻ. | Hoàn thành (04/09) |
| 6 | CRM / SX dashboard tốc độ | Tăng tốc kpi-ledger, deadline-bucket, báo cáo tổ chức; giảm polling khi đổi tab; sửa nạp thẻ theo cột; bỏ cuộn toàn trang. | Dashboard mở nhanh hơn trên data lớn; ít request thừa khi chuyển tab. | Hoàn thành (04/09) |
| 7 | SX dashboard quy mô lớn | `client-companies` 15s → 1,6s; chia lô id URL (tránh HTTP 500); hết cắt 1.000 dòng `crm_tasks`; backfill staff 8,7s → 0,36s; view Lịch/Danh sách 13s → 3,1s. | Xưởng data lớn mở ổn, không 500, không mất dự án/staff. | Hoàn thành (05/09) |
| 8 | PostgREST cảnh báo | Lớp log khi query trả đúng 1.000 dòng không phân trang hoặc `.in()` quá lớn / URL dài. | Biết chỗ cắt dữ liệu âm thầm trên traffic thật, không đổi hành vi UI. | Hoàn thành (05/09) |

---

## III. Công việc phát triển

| STT | DANH MỤC | NỘI DUNG CÔNG VIỆC | KẾT QUẢ ĐẠT ĐƯỢC | TRẠNG THÁI |
|-----|----------|--------------------|------------------|------------|
| 1 | Giao việc CRM — thiết kế | Làm lại theo mockup: thẻ KPI ngang (icon + số + dòng phụ so 7 ngày / tỷ trọng); cột trái Bộ lọc nhanh + thống kê NV; ô «Thêm cột mới»; thu gọn cột trái trên mobile. | UI khớp mockup; lọc và thống kê gắn dữ liệu thật. | Hoàn thành (03/09) |
| 2 | Báo cáo hàng ngày — UI | Thiết kế lại trang: bộ lọc cột phải dính theo trang, header mục sáng hơn, thẻ KPI có icon. | Bảng tổng hợp dễ đọc; tìm NV không gọi lại cả bảng mỗi ký tự. | Hoàn thành (04/09) |

---

## IV. Kế hoạch (tuần tới 07/09 – 12/09)

### Công việc thường xuyên

| STT | DANH MỤC | NỘI DUNG CÔNG VIỆC | KẾT QUẢ ĐẠT ĐƯỢC | TRẠNG THÁI |
|-----|----------|--------------------|------------------|------------|
| 1 | Hồi quy Giao việc & dashboard | Smoke test Giao việc CRM và SX dashboard trên công ty data lớn; đối chiếu không còn 500 / mất thẻ. | Biên bản hồi quy; hotfix nếu còn lệch. | Kế hoạch |
| 2 | Báo cáo hàng ngày | Đối chiếu ma trận live vs snapshot sau tối ưu cache; kiểm tra công ty nhiều thẻ đang mở. | Số KH/KQ khớp; không cắt dữ liệu. | Kế hoạch |
| 3 | Theo dõi log PostgREST | Xem cảnh báo runtime và vá chỗ đang cắt thật (badge thông báo, `.in()` sát ngưỡng). | Query cắt 1000 dòng được sửa có chủ đích. | Kế hoạch |

### Công việc phát triển

| STT | DANH MỤC | NỘI DUNG CÔNG VIỆC | KẾT QUẢ ĐẠT ĐƯỢC | TRẠNG THÁI |
|-----|----------|--------------------|------------------|------------|
| 1 | Giao việc CRM | Hoàn thiện mockup còn lại (mobile, nhiều cột, realtime khi giao/xong việc). | Kanban giao việc ổn trên web mobile và desktop. | Kế hoạch |
| 2 | SX / CRM dashboard | Tiếp tục giảm latency trên Render; dùng log PostgREST vá chỗ chậm/cắt còn sót. | Board production mở trong ngưỡng chấp nhận. | Kế hoạch |

---

## Phân bổ theo ngày

| Ngày | Việc chính |
|------|------------|
| **31/08** | Cache Work Unified + invalidate khi ghi; CRM dashboard không báo mất kết nối giả, giữ scope công ty |
| **01–02/09** | Không có commit MinDuc |
| **03/09** | Giao việc CRM: mockup KPI + Bộ lọc nhanh; lệch assignment/task; tốc độ + cuộn theo cột |
| **04/09** | Báo cáo ngày ~9s → ~1s; CRM/SX dashboard tốc độ + bỏ cuộn toàn trang |
| **05/09** | SX dashboard quy mô lớn (500, cắt 1000, staff); lớp cảnh báo PostgREST |

---

*Nguồn: git log author MinDuc, 31/08–05/09/2026. Form STT / Danh mục / Nội dung / Kết quả / Trạng thái.*
