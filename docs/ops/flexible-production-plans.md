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

## Nghiệm thu staging — 14/10/2026 13:17 giờ Việt Nam

Render deploy dep-db7hq8a5b2lc7380skjg LIVE, runtime SHA 12c22f918984c1689f0ca5a13d2cb3b7cf272dd7. Public smoke chạy lại PASS 13 nhiệm vụ, phân quyền, manager/personal/team/report/WorkUnified, legacy preserved. Browser production_admin mở /sx/plan-reports thành công: ngày 14/10, hoàn thành trong ngày 1, quá hạn 0 (dữ liệu mẫu); mốc/giờ đọc VN đúng. Local HTTP bổ sung kiểm project_code/assignee_name đầy đủ PASS cho 13 dòng. Ảnh kiểm chứng ngoài tracked files: docs/_tmp_staging_FINAL.png. Hoàn thành bước 1–2 trong phạm vi candidate + staging; không merge/deploy production. Đường dẫn và đăng nhập thử lưu ngoài repo, chỉ dữ liệu giả. Rollback/giới hạn như hồ sơ ops.

---

## 14/10/2026 — Quản lý dự án: tiến độ kế hoạch trên Kanban (candidate staging)

Anh Hùng đồng ý nối quản lý dự án sau khi xem ảnh dashboard production. Thêm GET /work-plans/board bật bằng flag aggregates, tối đa 30 project IDs/request, kiểm scope từng dự án. Manager xem tổng tiến độ, tên mẫu/version nguồn, hạn SX; staff chỉ thống kê việc mình, không nhãn xong toàn dự án. Domain tính done/waived/review/overdue và mọi công đoạn có nhiệm vụ ready song song. Không tự ghi pipeline stage hoặc deadlines legacy.

Dashboard card thêm tiến độ và đường mở canonical plan, manager dự án chưa có plan có link lập từ mẫu. Provider fetch batches theo tập IDs/user, đổi phạm vi không lộ cache cũ; refresh 60 giây/focus; lỗi không đổi thành zero. Legacy task buttons giữ khi không có plan; feature default off trên production. Không có migration mới.

33 tests PASS, staging frontend build PASS, reviewer riêng không còn blocker sau sửa successor doing nhưng predecessor reopened. Chưa nghiệm thu runtime dashboard ở thời điểm mục này. Rollback tắt aggregate flag hoặc revert code; không xóa task/template/history. Không merge/main/deploy production. Tiếp theo manual deploy staging và kiểm API/browser trên dữ liệu giả.

---

## 14/10/2026 — Kanban kế hoạch SX đã kiểm runtime staging

Deploy dep-db7o12ek1f9s738e7io0 LIVE, runtime 56d0d2eace13f49ce022435bafbd7bb92192d54c; finished 13:19:43Z. GET board kiểm public API PASS: manager/staff đúng scope, other-company không thấy project, legacy no-plan giữ nguyên. Browser dashboard có 3 project giả: Cánh kính 0/6, Tủ bếp 1/7, các hạn SX và ready stages; nút Nhiệm vụ của 2 plan đến canonical editor, legacy vẫn đến project-tasks. Manager dự án no-plan có link Lập kế hoạch SX từ mẫu. Hai CRM deal giả mới chỉ để đưa các project fixture sẵn có vào Kanban; không đổi project/execution hoặc production.

33/33 regression PASS, frontend build PASS, reviewer riêng no blockers. Ảnh: D:/quản trị vận hành/HoSoTuBepPro/templates/KANBAN_PLAN_STAGING.png; API proof BOARD_VERIFICATION.json cùng thư mục. Các KPI tổng/cột Kanban vẫn theo workflow hiện có, không tự đổi cột vì các công đoạn song song; thẻ riêng hiển thị công đoạn có việc sẵn sàng. Mẫu kính 6,5/7,5 ngày đã xuất bản trước đó vẫn dùng cho dự án mới; fixture demo 7/6 task dùng kiểm phần tích hợp, không phải các template mới đã duyệt để chạy.

Đã hoàn thành phần hiển thị tiến độ quản lý dự án trên staging. Chưa merge/deploy production; không tự đồng bộ cột legacy hay giao người thật. Rollback tắt flag aggregate hoặc revert code, giữ lịch sử/template. Source template badge chỉ có khi kế hoạch được lập từ template; người cá nhân chỉ nhận số việc được giao.

---

## 14/10/2026 — Chi tiết nhiệm vụ kế hoạch, bình luận và tài liệu (candidate staging)

Anh Hùng yêu cầu nối ngay không gian làm việc chi tiết sang nhiệm vụ kế hoạch: bình luận, tài liệu, thao tác nhiệm vụ, không gian dự án. Thêm modal dùng Modal/ProjectCommentsPanel hiện có; tab chi tiết dùng command canonical, bình luận riêng task, upload/private signed download (8 MB/tệp), tab trao đổi chung dùng project_comments. Liên kết UnifiedTaskRow và personal task page thêm ?task= để mở đúng modal. Giao người vẫn ở editor kế hoạch; không tự gán người thật từ tên mẫu.

Migration mới CLI-generated 20261014162507_work_plan_collaboration.sql đã áp riêng jdwgcivfqajpnlatrfwq: hai bảng service-only/RLS, bucket work-plan-files private; khóa row plan kiểm task/company và current-assignee hoặc quản lý DB khi insert; ngăn xóa task có bình luận/tệp. Feature WORK_PLANS_COLLABORATION_ENABLED mặc định off, staging bật1. Không áp production.

36 regression PASS, collaboration SQL/privacy/assignment/replay/cleanup tests PASS; staging build PASS. Actual local HTTP+Supabase/private Storage PASS: staff post file/comment, manager read, wrong company/task file denied, replay no duplicate, private public URL denied, project room text POST/GET works. Reviewer không còn blocker sau sửa race quyền, giữ private object khi metadata result UNKNOWN thay vì xóa nhầm file đã commit, và review-required done revalidation.

Giới hạn: task comments chưa có reactions/edit/delete/thread; pagination 30; private download 60s; upload unknown có thể cần đối soát private object, không claim zero orphan. Staging chỉ bật private task uploader; legacy project public uploader không bật, tab project chỉ trao đổi và dẫn tài liệu sang task. Không chuyển bình luận legacy sang nhiệm vụ mới, không sửa legacy execution. Browser/public deploy cuối còn chờ. Rollback tắt flag hoặc revert, giữ tables/bucket/history.

---

## Chi tiết nhiệm vụ: bổ sung giao lại người ngay trong workspace

User yêu cầu giao việc ở cùng giao diện. Command reassign chỉ manager, phải có lý do và người nhận hợp lệ theo công ty/đội dự án; nhiệm vụ đã đóng cần mở lại/kiểm tra lại. Cập nhật graph và planned_tasks cùng CAS, giữ hạn, assignment_latest có kích thước theo task; lịch sử revision giữ thay đổi. Modal có dropdown người phụ trách/nút giao lại, hiển thị cả lỗi command trong popup.

37/37 test PASS sau frontend build cuối; reviewer reassign không thấy blocker. Initial collab runtime a64ad313 LIVE ở dep-db7r2hhsrm7s7390cucg; public HTTP+Storage smoke PASS (comment/file, đúng scope, private public URL denied, project room, replay). Local browser query ?task=t1 mở đúng modal, bình luận text gửi từ UI và tệp cũ hiển thị. Follow-up assignment runtime/browser còn chờ kiểm sau deploy. Không migration mới cho giao lại và không production.

## 15/10/2026 00:03 Việt Nam — Workspace nhiệm vụ đã nghiệm thu staging

Runtime 9716425e81434564c68fa2bcf1c75886c369ca20, deploy dep-db7r6lbrjlhs73cnou90 LIVE (finished 14/10 16:56:41Z = 23:56:41 VN). 37/37 tests PASS, build staging PASS, review riêng không còn blocker. Public HTTP smoke PASS task comments/file upload/private download/replay/project room. Reassign public smoke trên glass PASS: chỉ manager, lý do bắt buộc, người cũ bị thu hồi task room, hạn và execution giữ, đã phục hồi assignee. Browser canonical query mở modal, gửi comment từ UI và thấy tài liệu API đã tải; dropdown giao lại thao tác UI đã ghi vào DB, phục hồi người mẫu.

Ảnh TASK_DETAIL_STAGING.png và TASK_DISCUSSION_STAGING.png; API proof TASK_COLLABORATION_VERIFICATION.json và TASK_REASSIGN_VERIFICATION.json trong D:/quản trị vận hành/HoSoTuBepPro/templates. Helper localhost44012 đã dừng. Trình duyệt giữ staging task dialog.

Giới hạn QA: CUA chọn tệp bị extension chặn do chưa Allow access to file URLs, không tự đổi quyền extension. Upload/download thật đã kiểm qua HTTP/Storage; chưa hoàn tất tự động chọn file qua Chrome. Bình luận task cơ bản chưa có edit/delete/reactions/thread hoặc realtime; đóng/mở để đọc lại. Shared project room dùng panel cũ; staging chỉ bật private task uploader, không legacy public upload. Không claim toàn bộ module chi tiết cũ đã chuyển hết.

Fixture cabinet hiện chỉ định staff là production_person_id, nên staff có quyền quản lý plan của riêng dự án đó theo rule đã có; không phải lỗi vượt quyền. Kiểm ordinary-assignee/revocation dùng glass do manager dẫn. Test opt-in điều chỉnh dùng glass cho staff draft403. Không đổi project lead, không sửa production hoặc dữ liệu thật. Chưa merge/phát hành production; cần nghiệm thu và rollout riêng theo hồ sơ ops, ba migrations trước flags. Rollback tắt flag collab/aggregate hoặc revert code, giữ bucket/bảng/history.

---

