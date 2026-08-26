# ADR-0011: Project & Work Unified dùng read model thống nhất và KPI chính xác

- **Trạng thái:** Accepted
- **Ngày:** 2026-08-26
- **Người đề xuất:** Anh Hùng / Codex
- **Liên quan:** ADR-0010, `docs/architecture/kien-truc-cu-moi-work-unified.html`

## Ngữ cảnh

Project và công việc hiện được tạo bởi nhiều nghiệp vụ thật: `projects`, `tasks`, `crm_tasks` và `crm_assignments`. Giao diện Work Unified đã có view `unified_tasks_v`, nhưng API tổng hợp chỉ đọc tối đa 3.000 dòng rồi đếm trong bộ nhớ. Vì vậy KPI Công việc có thể lệch rất xa Dashboard/Báo cáo khi một công ty có hàng chục nghìn công việc.

Danh sách Business OS cũng chỉ tải một trang gần nhất rồi lọc trạng thái ở trình duyệt, nên tab Quá hạn/Đã xong không đại diện cho toàn bộ dữ liệu của công ty.

## Quyết định

1. `projects` tiếp tục là System of Record cho Dự án; `tasks`, `crm_tasks`, `crm_assignments` tiếp tục là System of Record cho từng loại công việc.
2. `unified_tasks_v` là read gateway duy nhất cho danh sách và KPI Work; không tạo bảng task song song.
3. Ban hành hợp đồng `work_kpi_v1`:
   - `done`: trạng thái `done`, `completed`, `cancelled`;
   - `open`: tổng trừ `done`;
   - `overdue`: việc đang mở, có deadline nhỏ hơn thời điểm hiện tại;
   - tất cả số đếm là exact count trên toàn phạm vi tenant/company/employee, không giới hạn 3.000 dòng.
4. Dashboard quản trị và module Work gọi cùng helper đếm để không tự định nghĩa trạng thái riêng.
5. Các nhóm Cần làm/Hôm nay/Quá hạn/Đã xong được lọc ở backend trước phân trang; việc đang mở ưu tiên deadline gần nhất.
6. Business OS hiển thị phiên bản hợp đồng KPI, nguồn read model và phân bổ nguồn việc để người dùng hiểu con số.
7. Mọi endpoint danh sách, summary, lịch sử và chi tiết theo Project đều áp tenant/company guard ở backend. Project được phép thuộc công ty sở hữu hoặc công ty vận hành/logistics trong cùng scope; response tách rõ hai ngữ cảnh này.
8. Chi tiết Project trả `next_actions`: việc mở được xếp theo quá hạn → gần hạn → chưa có hạn, sau đó mới tới việc đã kết thúc. Đây là lớp đọc đầu tiên của Next Action Engine, chưa tạo nguồn task mới.

## Hệ quả

- KPI Work nhất quán giữa Trung tâm điều hành, Báo cáo và Không gian công việc.
- Không còn tải hàng chục nghìn dòng về backend chỉ để tổng hợp KPI.
- Mỗi lần mở summary có nhiều truy vấn exact-count nhỏ; khi quy mô lớn hơn sẽ xem xét RPC/materialized aggregate nhưng vẫn giữ nguyên hợp đồng `work_kpi_v1`.
- Không cần migration và không thay đổi dữ liệu nghiệp vụ.
- Người vận hành thấy ngay việc cần xử lý tiếp theo ở cấp Project; danh sách đầy đủ vẫn cho phép lọc Đang mở/Quá hạn/Đã xong.

## Rollback

Khôi phục helper summary và màn hình Work trước ADR này. Vì thay đổi chỉ ở read model/API/UI, rollback không đụng tới Project, task hoặc lịch sử công việc.
