# ADR-0003 — Business OS Deal → Khảo sát → Thiết kế

- Trạng thái: Accepted
- Ngày: 2026-08-25
- Phạm vi: staging một công ty — Công ty TNHH Bếp Vạn Phú Thành

## Bối cảnh

Vertical slice Lead → Qualification → Deal đã có process kernel, task gate, SLA và KPI. Bước kế tiếp cần điều khiển Khảo sát và Thiết kế nhưng hệ thống hiện tại đã có Deal, CRM task, file minh chứng và lịch sự kiện. Tạo thêm bản sao Deal hoặc một kho task riêng sẽ làm sai nguyên tắc một nguồn dữ liệu nghiệp vụ.

## Quyết định

1. Tiếp tục dùng process key ổn định `sales_lead_qualification_v1` và mở rộng stage thành `survey`, `design`, `design_completed`; không đổi khóa đã phát hành.
2. `crm_leads` vẫn là nguồn duy nhất của Deal và `crm_tasks` vẫn là nguồn duy nhất của công việc thực thi.
3. Khi Deal bắt đầu Khảo sát, backend materialize task template stage `survey`. Hoàn tất Khảo sát chỉ được phép khi toàn bộ task chặn, minh chứng và quick verdict đạt yêu cầu.
4. Hoàn tất Khảo sát chuyển thẳng sang Thiết kế, bắt đầu SLA mới và materialize task template `design`. Hoàn tất Thiết kế đưa hồ sơ tới `design_completed`, sẵn sàng cho lát cắt Báo giá tiếp theo.
5. SLA Khảo sát và Thiết kế dùng lịch giờ làm việc hiện tại. Ledger escalation có thêm `stage_key` để cùng một process instance có thể cảnh báo độc lập theo stage.
6. Mỗi stage có automation/version/rollback theo company. Pilot Vạn Phú Thành dùng 3 task Khảo sát và 3 task Thiết kế mặc định.
7. KPI Deal → Khảo sát → Thiết kế chỉ tính từ Deal thật và mốc process kernel, không suy đoán từ tên cột CRM.

## Gate mặc định

### Khảo sát

- Lên lịch khảo sát hiện trạng.
- Khảo sát và ghi nhận kích thước hiện trạng; cần ghi chú hoặc file minh chứng.
- Xác nhận hồ sơ khảo sát đủ để thiết kế; cần kết luận `Đã đủ`.

SLA mặc định: 1.440 phút làm việc, cảnh báo trước 240 phút.

### Thiết kế

- Lập phương án thiết kế từ hồ sơ khảo sát; cần minh chứng.
- Duyệt phương án với khách hàng; cần kết luận `Đã đủ`.
- Hoàn thiện hồ sơ để bàn giao Báo giá; cần minh chứng.

SLA mặc định: 1.920 phút làm việc, cảnh báo trước 480 phút.

## Hệ quả

- Deal cũ vẫn ở stage `deal` và không bị tự động sinh task; chỉ Deal do người dùng bấm bắt đầu Khảo sát mới vào kernel mới.
- Gọi command lặp không tạo task hoặc event trùng nhờ idempotency key và source key.
- Chưa đồng bộ tự động với tên cột pipeline CRM hoặc tự tạo lịch khảo sát; việc tích hợp lịch sẽ dùng API sự kiện hiện tại trong một lát cắt sau.
- Chưa deploy production hoặc mở sang công ty khác.

## Rollback

- Tắt worker bằng `BUSINESS_OS_SLA_CRON_DISABLED=1` nếu cần dừng cảnh báo.
- Đặt automation `survey`/`design` không active hoặc quay về version trước để ngừng materialize task mới.
- Giữ task và event đã sinh để bảo toàn audit. Chỉ rollback schema sau khi sao lưu và xác nhận không còn process instance ở ba stage mới.
