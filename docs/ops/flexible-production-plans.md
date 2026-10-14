# Kế hoạch sản xuất linh hoạt — bản triển khai để review

Thiết kế: [quy trình linh hoạt](../ba/THIET_KE_QUY_TRINH_SAN_XUAT_LINH_HOAT.md). User duyệt triển khai ngày 14/10/2026; chưa áp migration, merge hoặc deploy hệ thống thật.

## Phạm vi

- Dự án → **Kế hoạch sản xuất**: tự tạo công đoạn/nhiệm vụ hoặc dùng phiên bản mẫu. Đặt hạn **hoàn thành sản xuất**, chỉnh thời lượng, vai trò, phụ trách, phụ thuộc. Mẫu minh họa tủ bếp 7 ngày và cánh kính 6 ngày; không khóa thời gian dự án vào 7 ngày.
- Tính ngược theo ca, ngày làm việc và ngày nghỉ riêng của dự án. Nhiệm vụ chờ nhà cung cấp có thể dùng giờ liên tục. Nhánh song song được hỗ trợ; vòng tròn bị từ chối. Dự báo từ thời điểm hiện tại, tách ngày kế hoạch đã duyệt. Đang làm tính đủ thời lượng; chưa có ghi nhận số giờ còn lại hoặc tối ưu nguồn lực.
- Lưu nháp → xem lịch → quản lý duyệt. Nhiệm vụ bắt buộc phải có người nhận; kế hoạch không kịp hạn yêu cầu quản lý xác nhận. Thay kế hoạch đang chạy cần lý do; không được xóa việc đã có lịch sử hoặc đổi nội dung việc đã hoàn thành mà chưa mở lại.
- Menu **Nhiệm vụ kế hoạch SX**: xem việc của mình, toàn công ty trong phạm vi quyền dự án và lọc trễ hạn/hoàn thành trễ; phân trang 50 dự án mỗi nguồn (công ty và việc được giao, gồm người nhận ngoài công ty; luôn kiểm scope dự án). Chi tiết xem việc chặn, bắt đầu, hoàn thành, minh chứng; bỏ qua/mở lại cần quản lý và lý do. Mở lại tiền nhiệm giữ kết quả/minh chứng của các việc sau, đánh dấu cần kiểm tra lại; không công nhận công đoạn xong khi còn cờ này.
- Mẫu xuất bản là phiên bản bất biến trong công ty. Chỉ sao chép cấu trúc, thời lượng, vai trò, phụ thuộc, điều kiện minh chứng và tuần/ca làm. Không mang người phụ trách, ngày nghỉ dự án, hạn chót, khách hàng hoặc trạng thái. Tên tự nhập có thể chứa PII: UI nhắc kiểm tra trước khi xuất bản.

## Kiến trúc và dữ liệu

Module `backend/src/modules/work-plans`: Domain lập lịch/điều kiện hoàn thành; Application điều phối command; Infrastructure lưu trữ; Public router `/api/work-plans`. Gói thuộc Work Unified sau bán, không mirror vào CRM trước bán.

Canonical execution của dự án đã chọn dùng kế hoạch mới nằm trong `work_plan_instances.document.execution`, duy nhất một writer qua command RPC. Graph active, draft, baseline pointers và execution được lưu cùng document để CAS áp dụng lên cả cấu trúc và trạng thái. `work_plan_versions` lưu snapshot từng revision; baseline trỏ revision đã duyệt, không sửa bản cũ. Template lưu độc lập `work_plan_template_versions`, không FK cascade vào kế hoạch đang chạy. Quy mô tối đa 250 nhiệm vụ, 100 công đoạn/dự án; phiên bản/lịch sử UI giới hạn 50 bản gần nhất, mẫu trả 200 phiên bản gần nhất.

`work_plan_commit` transaction: advisory locks command/aggregate → replay/hash/actor/company → compare expected revision → ghi trạng thái + snapshot + command/audit receipt. Đồng thời sai revision trả 409, không âm thầm ghi đè. Không có tác vụ ngoài DB nên chưa cần outbox. Actor lấy từ JWT; công ty từ dự án đã qua project/tenant scope. Admin công ty logistics không có quyền duyệt kế hoạch của công ty sản xuất khác; quản lý được chỉ định dự án có quyền quản lý. Nhân viên chỉ sửa task được giao.

Tất cả bốn bảng bật RLS, không cấp quyền browser; RPC SECURITY INVOKER, chỉ service_role. Không đưa service key ra frontend. UI mới không được đọc DB trực tiếp.

## Dự án cũ và giới hạn tích hợp

Không backfill hoặc chuyển lịch cũ. Kanban, `tasks`/`crm_tasks`, hạn theo ngày lắp đặt và các báo cáo legacy vẫn giữ cơ chế hiện tại. Các views mới có đường dẫn riêng; chưa thay tổng hợp/badge/dashboard legacy bằng execution mới. Không coi các báo cáo legacy là tổng tiến độ canonical của kế hoạch linh hoạt. Mỗi dự án phải chọn và duyệt kế hoạch mới rõ ràng, tránh lập trùng việc đang thực hiện ở hệ thống cũ. Chưa có tự cân tải giữa nhiều dự án, tự chuyển cột Kanban hay nhắc việc tự động. Các phần này cần adapter/chặng triển khai tiếp, không được tuyên bố đã đồng nhất toàn hệ thống.

## Kiểm chứng và phát hành

Chạy từ root:

```powershell
$env:PLAYWRIGHT_CHANNEL='chrome' # hoặc cài Chromium cho Playwright và bỏ biến này
node --test backend/tests/work-plans.test.js backend/tests/work-plans-sql.test.js backend/tests/work-plans-ui.test.js
cd frontend
npm run build
```

PGlite thực thi migration thật trong PostgreSQL WASM cô lập: kiểm transaction, rollback FK, replay, conflict, company guard, snapshot/template bất biến và browser-role denial/RLS. Chưa xác minh đa kết nối Postgres/Supabase thật hoặc chạy advisor môi trường thật. HTTP fixture dùng router thật; browser fixture dùng component/service thật, repo dữ liệu giả, không đọc `.env`/khởi động jobs sản xuất. Reviewer phiên riêng đã kiểm các lỗi quyền, đổi mẫu, miễn trừ/mở lại, bảo toàn kết quả, ngày nghỉ mẫu và hoàn thành trễ; không còn blocker trong phạm vi review.

Sau phê duyệt phát hành: staging trước, áp `database/20261014034959_flexible_work_plans.sql` qua quy trình migration; backend trước frontend; tạo một dự án mới thí điểm. Kiểm quyền công ty, người nhận việc, hai tab đồng thời, mẫu phiên bản mới không sửa dự án cũ; kiểm dự án cũ/đếm legacy riêng. Chỉ lên production khi có phê duyệt rõ ràng theo AGENTS.md.

Rollback: revert code PR, giữ nguyên bốn bảng/lịch sử đã ghi; không drop hoặc xóa execution. Không tự chuyển kế hoạch mới về task legacy. Các màn hình cũ vẫn hoạt động; cần giải quyết các dự án thí điểm đang chạy trước khi ngưng UI mới.
