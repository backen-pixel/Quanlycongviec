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

Không backfill hoặc chuyển lịch cũ. Kanban, `tasks`/`crm_tasks`, hạn theo ngày lắp đặt và các báo cáo legacy vẫn giữ cơ chế hiện tại. Các views mới có đường dẫn riêng; candidate hiện có adapter tổng hợp qua private view (mặc định tắt), chưa bật trên môi trường thật. Không coi các báo cáo legacy là tổng tiến độ canonical của kế hoạch linh hoạt. Mỗi dự án phải chọn và duyệt kế hoạch mới rõ ràng, tránh lập trùng việc đang thực hiện ở hệ thống cũ. Chưa có tự cân tải giữa nhiều dự án, tự chuyển cột Kanban hay nhắc việc tự động. Các phần này cần adapter/chặng triển khai tiếp, không được tuyên bố đã đồng nhất toàn hệ thống.

## Kiểm chứng và phát hành

Chạy từ root:

```powershell
$env:PLAYWRIGHT_CHANNEL='chrome' # hoặc cài Chromium cho Playwright và bỏ biến này
npm --prefix backend run test:work-plans
cd frontend
npm run build
```

PGlite thực thi migration thật trong PostgreSQL WASM cô lập: kiểm transaction, rollback FK, replay, conflict, company guard, snapshot/template bất biến và browser-role denial/RLS. Chưa xác minh đa kết nối Postgres/Supabase thật hoặc chạy advisor môi trường thật. HTTP fixture dùng router thật; browser fixture dùng component/service thật, repo dữ liệu giả, không đọc `.env`/khởi động jobs sản xuất. Reviewer phiên riêng đã kiểm các lỗi quyền, đổi mẫu, miễn trừ/mở lại, bảo toàn kết quả, ngày nghỉ mẫu và hoàn thành trễ; không còn blocker trong phạm vi review.

Sau phê duyệt phát hành: staging trước, áp `database/20261014034959_flexible_work_plans.sql` qua quy trình migration; backend trước frontend; tạo một dự án mới thí điểm. Kiểm quyền công ty, người nhận việc, hai tab đồng thời, mẫu phiên bản mới không sửa dự án cũ; kiểm dự án cũ/đếm legacy riêng. Chỉ lên production khi có phê duyệt rõ ràng theo AGENTS.md.

Rollback: revert code PR, giữ nguyên bốn bảng/lịch sử đã ghi; không drop hoặc xóa execution. Không tự chuyển kế hoạch mới về task legacy. Các màn hình cũ vẫn hoạt động; cần giải quyết các dự án thí điểm đang chạy trước khi ngưng UI mới.

## Adapter tổng hợp và staging (bước 1–2 ngày 14/10)

Migration mới 20261014050004_work_plan_task_read_model.sql tạo unified_work_tasks_v SECURITY INVOKER, chỉ server/service_role. Sau khi áp cả hai migrations, bật WORK_PLANS_AGGREGATES_ENABLED=1. Snapshot planned_tasks v2 được ghi khi duyệt, chỉ cấu trúc/hạn kế hoạch; actuals vẫn từ execution. View thay nhiệm vụ tasks SX/Dự án và crm_tasks gắn stage SX của dự án đã chọn plan v2; không ghi lại hay xóa task cũ, không thay CRM trước bán/VC. Kế hoạch v1 muốn vào tổng hợp cần duyệt lại để có snapshot hạn; không tự backfill.

Gateway dùng cùng projection cho phân trang và count; việc cùng tên khác ID giữ riêng. SX project overview nhận tập approved project độc lập bộ lọc nhân viên, không khôi phục legacy. Work Unified giữ tiến độ luồng giao hàng, thêm số việc kế hoạch SX riêng. Báo cáo ngày có phần kế hoạch linh hoạt: revision gần nhất trước cutoff (cuối ngày VN hoặc giờ đọc nếu hôm nay), đến hạn/hoàn thành trong ngày và tồn quá hạn ở cutoff; miễn trừ không phải hoàn thành thực tế; needs_review còn mở. Bảng này chưa cộng dữ liệu nhiệm vụ legacy vào chỉ tiêu plan.

Rollback adapter: tắt WORK_PLANS_AGGREGATES_ENABLED, giữ bảng/view/lịch sử. Dự án đang thực hiện plan vẫn phải dùng UI kế hoạch để cập nhật; các task cũ không tự phản ánh execution mới khi tắt adapter.

Staging: user chọn Render My Workspace. Không có service staging hiện hữu. Hai Supabase projects qlycv, QLCV_Backup là production/failover, không dùng làm DB thử. Chờ user chọn tổ chức DB mới trước khi kiểm chi phí/tạo project. Chưa tạo service, áp SQL hoặc deploy; chỉ test cô lập bằng dữ liệu giả. 30 test PASS; browser hiện kiểm editor/service, chưa kiểm các trang aggregate trong full-stack staging.

## Staging được cấp ngày 14/10/2026

DB riêng: jdwgcivfqajpnlatrfwq (“Trang chuẩn bị”), Pkmax-bit's Org, MICRO +10 USD/tháng user duyệt; Render My Workspace. Bootstrap chỉ cấu trúc public từ catalog primary; không customer/user/order/task data, legacy functions/triggers/policies hoặc provider config. Toàn bộ bảng service-only/RLS, views security_invoker, extensions ở extensions schema. Đây là fixture tương thích các tuyến Work Plans/aggregate đang thử, không chứng minh mọi module/trigger legacy của production.

backend/src/stagingServer.js là entry riêng: pin database ref, strong JWT, disable dotenv và lọc env provider/backup, không import server.js/jobs. Health probes tới staging còn chạy; business_jobs=false. Chỉ mở một số API cần cho kiểm tính năng và frontend, module không bật trả 404. Build VITE_STAGING_MODE=1, VITE_API_URL trống (same-origin); không để frontend fallback về production. Synthetic accounts/private fixture nằm ngoài repo.

Test opt-in: STAGING_TEST_CREDENTIALS trỏ private fixture, node backend/tests/work-plans-staging-smoke.js (origin mặc định localhost:44010, hoặc Render staging đã kiểm định). Tự từ chối origin production. Kết quả tại local host + DB staging thật: PASS 13 task, same-title distinct IDs, employee/other-company gates, personal/team/project overview/report/WorkUnified, legacy not migrated. Frontend stage build và 30 local regression tests PASS.

Rollback staging: dừng service staging hoặc quay lại candidate trước; giữ DB/history giả để tra soát. Không đổi production/backup. Chưa xóa DB có phí; chỉ xóa/dừng theo yêu cầu user sau nghiệm thu.
## 2026-10-14 — Staging Render hoạt động, sửa báo cáo SX và liên kết nhiệm vụ

Đã deploy candidate e047a3a9 lên https://tubep-staging-work-plans.onrender.com (srv-db7hhgc9v7es73c3mdsg, My Workspace, runtime free, autoDeploy off). Health xác nhận DB riêng jdwgcivfqajpnlatrfwq/business_jobs=false. Smoke public HTTP thực PASS 13 nhiệm vụ, phân quyền, báo cáo, tổng hợp và dự án cũ. Browser manager kiểm editor, mẫu và overview; phát hiện và sửa liên kết phụ Công việc sang canonical plan, thêm /sx/plan-reports cho quản lý xưởng không có quyền tab báo cáo CRM team. Báo cáo bổ sung mã/tên công trình và người phụ trách từ tập nhiệm vụ đã lọc quyền, thời gian hiển thị giờ Việt Nam. Reviewer riêng không còn blocker. 30/30 regression PASS, build PASS, latest local full-stack smoke PASS. Bản sửa cuối đang chờ redeploy/kiểm browser; không merge main hoặc deploy production. Staging chỉ fixtures/tuyến tính năng này, chưa chứng minh mọi module legacy.

---

