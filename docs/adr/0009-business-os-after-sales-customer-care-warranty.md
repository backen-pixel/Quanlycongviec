# ADR-0009 — After-sales tách khỏi Sales: Chăm sóc 7/30/90 ngày và case Bảo hành

- Trạng thái: Accepted
- Ngày: 2026-08-26
- Phạm vi: staging một công ty — Công ty TNHH Bếp Vạn Phú Thành
- Quan hệ: mở rộng ADR-0008; thay thế quy tắc “chỉ cột Hoàn thành đóng Sales” bằng mốc CSKH thật và giữ Hoàn thành làm fallback idempotent

## Bối cảnh

Sales process đã kết thúc ở mốc lắp đặt/bàn giao. Chăm sóc và bảo hành có thể kéo dài nhiều tháng, phát sinh lặp lại nhiều lần và do bộ phận CSKH chịu trách nhiệm. Nếu đưa bảo hành thành stage tiếp theo của Deal, một case mới sẽ mở lại hồ sơ Sales, làm sai thời gian chốt, KPI doanh thu và quyền sở hữu công việc.

Hệ thống cũ đã có khách hàng, Project, `crm_tasks`, cột Logistics “Bảo hành/CSKH” và người phụ trách chăm sóc, nhưng chưa có hồ sơ case với SLA, trạng thái và kết quả xử lý chuẩn.

## Quyết định

1. Giữ `sales_lead_qualification_v1` ở trạng thái `completed` sau khi lắp đặt hoàn tất. Không mở lại Deal vì một yêu cầu bảo hành.
2. Tự tạo process riêng `customer_after_sales_v1`, `record_type = project`, `record_id = projects.id`. Một Project có tối đa một process sau bán nhưng có thể có nhiều case.
3. Tín hiệu mở After-sales:
   - nội bộ: Project vào cột Logistics có `crm_sync_type = customer_care`; cột Hoàn thành là fallback cho pipeline chưa cấu hình cột CSKH;
   - thuê ngoài: sự kiện Lắp đặt đã liên kết với thẻ bàn giao chuyển sang `completed`.
4. Khi mở process, materialize ba lịch 7/30/90 ngày vào `crm_tasks` với `business_os_process_key = customer_after_sales_v1`. `crm_tasks` tiếp tục là nguồn công việc duy nhất; retry không tạo trùng.
5. Tạo `business_os_customer_service_cases` làm System of Record mới cho case `warranty/service/complaint`. Case có mã, ưu tiên, SLA theo giờ làm việc, người phụ trách, trạng thái, kết quả và actor.
6. Vòng đời case: `open → triaged → in_progress → resolved → closed`; cho phép `resolved → in_progress` khi cần xử lý lại và cho phép hủy trước khi kết thúc. Không được đi thẳng `open → resolved`.
7. `resolved/closed` bắt buộc có kết quả xử lý. Khi còn case mở, After-sales ở `warranty_active`; hết case mở thì quay lại `care_active`.
8. Chỉ đóng process sau bán khi không còn case mở và cả ba lịch chăm sóc đã `completed/cancelled`.
9. Quyền ghi giới hạn cho Admin/Manager/Sales Admin/CSKH/Logistics Admin và vẫn đi qua tenant/company guard. Mọi read model, case và task đều lọc theo company.
10. Business OS Customer hiển thị KPI thật, kế hoạch sau bán, SLA case và hành động xử lý; không dùng dữ liệu demo.

## Hệ quả

- KPI Sales dừng đúng tại bàn giao, trong khi CSKH có vòng đời, SLA và trách nhiệm riêng.
- Khách có thể phát sinh nhiều lần bảo hành trên cùng Project mà vẫn giữ trọn lịch sử.
- Nhân viên dùng task CRM hiện có cho lịch chăm sóc; không phải theo dõi thêm một danh sách công việc song song.
- Migration 578 chỉ thêm bảng case và index; Customer, Deal, Project, task và event hiện hữu không bị sao chép.
- Migration 579 bổ sung cột `Bảo hành / CSKH` còn thiếu ngay trước cột Hoàn thành cho từng scope Logistics; không xóa hay đổi ID cột cũ.

## Rollback

- Bỏ lời gọi khởi tạo After-sales trong adapter hoàn tất lắp đặt và tháo route `/api/business-os/customer-care`; Sales/Logistics legacy vẫn hoạt động.
- Giữ bảng case và event đã ghi để bảo toàn audit; không xóa dữ liệu lịch sử khi tắt giao diện.
- Nếu cần ngừng tự sinh lịch 7/30/90, tắt adapter trước; các `crm_tasks` đã materialize được đóng/hủy theo nghiệp vụ, không xóa hàng loạt.
