# ADR-0012 — Vận hành thống nhất theo Project từ Sản xuất đến Lắp đặt

- Trạng thái: Accepted
- Ngày: 2026-08-26
- Phạm vi: staging một công ty — Công ty TNHH Bếp Vạn Phú Thành

## Bối cảnh

Dashboard Vận hành đang đếm KPI từ `projects` nhưng danh sách bên dưới lại đọc `crm_leads`. Một Project có thể gắn nhiều Lead/Deal nên danh sách bị trùng, nhãn công đoạn lấy sai vị trí và số dòng không đối soát được với KPI. Project do xưởng khác thực thi cũng có thể xuất hiện ở KPI thương mại nhưng bị chặn khi mở chi tiết vì kiểm tra quyền chỉ nhìn `projects.company_id`.

## Quyết định

1. `Project` là đơn vị đếm và đơn vị hàng đợi duy nhất của Operations; Deal chỉ bổ sung khách hàng và ngữ cảnh thương mại.
2. Read model `operations_kpi_v1` đọc dữ liệu thật từ `projects`, Deal thắng, pipeline Sản xuất và pipeline Logistics hiện hữu; không tạo bảng trạng thái song song.
3. Một Project có thể xuất hiện trong nhiều hàng đợi theo chặng thực tế (`production`, `delivery`, `installation`) nhưng chỉ xuất hiện một lần trong từng hàng đợi và một lần ở danh sách tổng.
4. Hàng đợi `attention` gồm hồ sơ chờ xưởng tiếp nhận hoặc quá hạn. KPI và danh sách dùng chung bộ Project đã được tenant/company scope.
5. Phạm vi vận hành của một công ty gồm Project công ty sở hữu, Project công ty Logistics thực hiện và Project được liên kết từ Lead/Deal thương mại của công ty. Quy tắc này dùng chung cho danh sách, chi tiết và công việc theo Project.
6. Màn chi tiết tiếp tục dùng Project, task, vật tư và pipeline thật; bổ sung trạng thái VC/LĐ vào cùng cockpit, không tạo màn chi tiết riêng có dữ liệu sao chép.
7. Route cũ vẫn được giữ để rollback và phục vụ người dùng legacy; Business OS chuyển sang `/api/management/operations-queue`.

## Hệ quả

- KPI Sản xuất/VC/LĐ đối soát được với số Project trong từng hàng đợi.
- Không còn lặp một Project do nhiều Deal cùng liên kết.
- Công ty bán hàng xem được tiến độ Project do xưởng khác thực hiện mà không mở rộng quyền sang Project không liên quan.
- Trang Sản xuất cũ và Business OS dùng cùng định nghĩa hồ sơ trong luồng SX.

## Rollback

- Business OS có thể quay lại `/api/management/deals?module_tab=sx`; không phải rollback dữ liệu.
- Gỡ route read-only `operations-queue` và helper scope/read model; các bảng, pipeline, Kanban và luồng bàn giao hiện hữu không thay đổi.
