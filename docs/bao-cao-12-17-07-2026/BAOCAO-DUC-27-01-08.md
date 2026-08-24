# Báo cáo công việc — Đức (MinDuc)

| | |
|---|---|
| **Người thực hiện** | Đức (git: MinDuc) |
| **Giai đoạn** | 27/07/2026 – 01/08/2026 |
| **Ngày lập** | 04/08/2026 |
| **Số commit** | 16 |

---

## Tóm tắt

Tuần tập trung **tăng tốc & ổn định CRM Kanban** (filter server, pagination theo cột, lazy load, totals Lead/Deal), **tab Deadline trên CRM Mobile 2.2.47**, và **tối ưu summary SX Kanban** trên Render.

---

## II. Công việc thường xuyên

| STT | DANH MỤC | NỘI DUNG CÔNG VIỆC | KẾT QUẢ ĐẠT ĐƯỢC | TRẠNG THÁI |
|-----|----------|--------------------|------------------|------------|
| 1 | CRM / CORS & Companies | Cho phép header `X-No-Cache` trong CORS để preflight `/crm/companies` thành công khi SPA gọi cross-origin bust cache. | Browser không còn báo lỗi CORS khi tải danh sách công ty; filter công ty CRM mở ổn định. | Hoàn thành (31/07) |
| 2 | CRM Pipeline stages | Sửa UI kéo xếp lại stage pipeline không cập nhật sau khi lưu: giữ optimistic order, API trả stages đã cập nhật thay vì reload taxonomy GET (cache cũ). | Sau khi sắp xếp stage, thứ tự trên UI khớp ngay với server, không bị đè bởi cache cũ. | Hoàn thành (31/07) |
| 3 | CRM Tab totals (Lead/Deal) | Sửa Deal total không refresh lúc load trang; tính `deal.tabTotals` trên server từ filter-summary; hiển thị đồng thời tổng Lead và Deal; giữ totals khi stage metadata chưa đủ (đặc biệt «Tất cả công ty»). | Badge tab Lead/Deal hiện đúng ngay khi mở trang; không chờ metadata client; totals không bị ghi đè sai. | Hoàn thành (30–31/07) |
| 4 | CRM Deadline timezone | Căn logic bucket Deadline client với server theo **Asia/Ho_Chi_Minh**; cùng thứ tự nguồn deadline; stamp `deadline_bucket` khi load trang. | Cột/badge Deadline khớp số liệu API; hết lệch bucket giữa local và Render. | Hoàn thành (31/07) |
| 5 | CRM Kanban ổn định | Harden Kanban trước lỗi 500 ngắt quãng (retry + load stage-link an toàn); ổn định virtualization; load cột visible sớm hơn; giảm request noise realtime ngoài cửa sổ đã tải. | Kanban ít trắng/treo hơn khi BE lỗi tạm; cột nhìn thấy đầy thẻ sớm; ít request thừa. | Hoàn thành (30–31/07) |
| 6 | SX Pipeline columns | Hiện lại các cột pipeline SX bị ẩn nhầm; giữ totals Lead/Deal tab luôn thấy cùng lúc. | Board SX đủ cột theo cấu hình; badge Lead/Deal không mất một bên. | Hoàn thành (31/07) |
| 7 | SX Kanban summary / load-more | Tăng tốc đếm summary cột (parallel head counts / GROUP BY RPC, fallback thin-scan); memoize won-deal/participant/stage-map; sửa load-more cột; pause remasure khi sync. | Board SX trên Render đếm cột nhanh hơn; load-more không lệch tổng; ít roundtrip DB. | Hoàn thành (31/07) |

---

## III. Công việc phát triển

| STT | DANH MỤC | NỘI DUNG CÔNG VIỆC | KẾT QUẢ ĐẠT ĐƯỢC | TRẠNG THÁI |
|-----|----------|--------------------|------------------|------------|
| 1 | CRM Mobile / Deadline tab | Thêm tab **Deadline** kiểu Kanban với badge theo bucket; cache đếm bucket giống stage-counts; tối ưu FlatList/first-paint; cache/prefetch thông báo. Ship **crm-mobile-v2 2.2.47**. | NV xem lead/deal theo hạn trên app; badge Deadline đúng; thông báo mở nhanh hơn; bản 2.2.47 trên kênh cập nhật. | Hoàn thành (27/07) |
| 2 | CRM Kanban / Filter server-side | Chuyển bộ lọc Kanban sang **query phía server**: pagination có filter, KPI totals và cache scope đúng khi đổi công ty/vùng/pipeline. | Lọc + phân trang + KPI đồng bộ; đổi filter không còn lệch cache giữa các scope. | Hoàn thành (30/07) |
| 3 | CRM Kanban / Phân trang theo cột | Triển khai **pagination từng cột** (batch request stage visible); cột tự đổ thẻ độc lập, không khôi phục loading cả board. | Pipeline lớn mở nhanh hơn; cuộn cột load dần; totals vẫn hiện ngay từ server. | Hoàn thành (30/07) |
| 4 | CRM Deadline & Kanban lazy load | Load thẻ visible tăng dần, totals ngay; batch pagination cột; giảm batch initial/scroll để pipeline lớn mượt hơn; gộp summary + index tìm kiếm rộng. | Deadline/Kanban ít đơ khi data lớn; ít request DB và work render hơn. | Hoàn thành (30/07) |
| 5 | SX Kanban / Summary RPC | Giảm roundtrip summary bằng một **GROUP BY RPC** (fallback thin-scan); chia sẻ memo lookup giữa instance — tối ưu latency Render. | Dashboard SX summary nhẹ tải BE hơn; mở board nhanh hơn trên môi trường production. | Hoàn thành (31/07) |

---

## IV. Kế hoạch (tuần tới 03/08 – 08/08)

### Công việc thường xuyên

| STT | DANH MỤC | NỘI DUNG CÔNG VIỆC | KẾT QUẢ ĐẠT ĐƯỢC | TRẠNG THÁI |
|-----|----------|--------------------|------------------|------------|
| 1 | CRM Kanban / Hồi quy | Smoke test sau pagination theo cột + filter server: đổi công ty/vùng/pipeline, «Tất cả công ty», totals Lead/Deal, Deadline bucket VN, reorder stage. | Biên bản hồi quy; hotfix nếu còn lệch totals hoặc trắng cột. | Kế hoạch |
| 2 | SX Kanban / Hồi quy summary | Đối chiếu số đếm cột (summary RPC vs board) trên Render; kiểm tra load-more và cột ẩn/hiện sau cấu hình pipeline. | Số cột khớp thực tế; load-more ổn định trên máy thật/production. | Kế hoạch |
| 3 | CRM Mobile 2.2.47 | Theo dõi Deadline tab + notification cache trên production; xử lý phản hồi user (badge lệch, first-paint chậm). | Bản 2.2.47 ổn định; hotfix nếu blocker. | Kế hoạch |
| 4 | CRM CORS / Companies | Rà thêm header/preflight liên quan cache-bust trên staging/production sau khi mở `X-No-Cache`. | Không còn CORS lẻ tẻ khi đổi công ty hoặc hard refresh. | Kế hoạch |

### Công việc phát triển

| STT | DANH MỤC | NỘI DUNG CÔNG VIỆC | KẾT QUẢ ĐẠT ĐƯỢC | TRẠNG THÁI |
|-----|----------|--------------------|------------------|------------|
| 1 | CRM Kanban / Tiếp tục lazy load | Tiếp tục giảm window request, tối ưu virtualization cột dài; cân nhắc prefetch cột kế cận khi cuộn ngang. | Pipeline rất lớn (nhiều stage/thẻ) vẫn cuộn mượt trên web. | Kế hoạch |
| 2 | CRM Mobile / Deadline | Đồng bộ thêm UX Deadline mobile với web (nguồn hạn, badge, filter kỳ); mở rộng cache bucket. | Deadline app ↔ web cùng logic và trải nghiệm gần nhau. | Kế hoạch |
| 3 | SX Kanban / Hiệu năng Render | Mở rộng memo/RPC summary; giảm remasure/sync khi nhiều cột; theo dõi latency sau GROUP BY. | Board SX production mở và đếm cột trong ngưỡng chấp nhận được. | Kế hoạch |
| 4 | CRM Báo cáo / Hub mobile | Tiếp tục căn báo cáo NV/Hub với org overview; bump bản CRM Mobile sau khi ổn. | Báo cáo mobile gần web; sẵn sàng ship bản tiếp theo. | Kế hoạch |

---

## Phân bổ theo ngày

| Ngày | Việc chính |
|------|------------|
| **27/07** | Tab Deadline CRM Mobile + badge bucket; cache/prefetch thông báo; ship **2.2.47** |
| **28–29/07** | Không có commit MinDuc |
| **30/07** | Filter Kanban server-side; pagination theo cột; lazy load Deadline/Kanban; live totals; Deal total refresh |
| **31/07** | Totals Lead+Deal; CORS `X-No-Cache`; reorder stage; Kanban harden/virtualization; hiện cột SX; summary RPC + load-more; Deadline timezone VN |
| **01/08** | Không có commit MinDuc |

---

*Nguồn: git log author MinDuc, 27/07–01/08/2026. Form STT / Danh mục / Nội dung / Kết quả / Trạng thái.*
