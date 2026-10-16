# ADR-008 — Một WorkItem façade, writer đúng miền

- Trạng thái: **ASSUMPTION_PENDING_FOUNDER**, lựa chọn kỹ thuật theo D5, không chuyển dữ liệu/writer thật.
- Nhiệm vụ: BOS-V31A-ARCH-01; ngày **16/10/2026, Asia/Ho_Chi_Minh**.

## Bối cảnh và nguồn

W0 A3 xác định hai luồng nghiệp vụ/giao diện nhưng ít nhất ba store: crm_tasks, tasks, crm_assignments. Work Unified/unified_tasks_v là query/API façade có write routing về nguồn, chưa là durable engine giữ mọi việc. Lead/Deal có cả task SX/VC; tên bảng/title trùng không đủ gộp. General tasks base schema bám Project, không phù hợp ép lead mới có Project.

Nguồn: W0 A3; SQL28/191/270/594/715; routes/tasks:215,227,237; crm/routes/crmTasks:825; crmLeadTaskMutations:416; crmAssignments:1260,1301,1466; workTasks:1138,2843. [ADR cũ P03](../../overall-design-20261016/DECISIONS.md) giữ CRM trước bán/Work sau bán.

## Lựa chọn theo tiêu chí

| Phương án | Need/owner M1 | History/compatibility | Rủi ro |
|---|---|---|---|
| A — Gom tất cả vào tasks | Cần phụ thuộc Project | Di chuyển schema/state/artifact nhiều | Mất ngữ nghĩa CRM, cutover lớn |
| B — Gom tất cả vào crm_tasks | Lead thuận lợi | Work/SX/VC có semantics riêng | Ép sau bán về CRM/hardcoded pipeline |
| C — Bảng WorkItem business thứ tư | Schema sạch được thiết kế mới | Thêm sync/mapping lớn | Dữ liệu chuẩn/writer cạnh tranh |
| D — Một façade + ID/writer registry, CRM M1, domain sau bán giữ đăng ký | Sẵn liên kết Need/owner | Adapter/alias giữ lịch sử | Cần phân loại và routing, view đơn thuần chưa đủ |

Chọn **D**. Tiêu chí: đúng Need/handoff/SLA M1; scope tenant/company; bảo toàn ID/history/attachment; replay không nhân việc; state/evidence compatibility; giảm writer; không bắt Project cho lead mới; chuyển từng lát/rollback được. Có căn cứ ưu tiên CRM presales, không tuyên bố hai lõi ngang nhau sau khi đã có tiêu chí.

## Quyết định đề xuất hữu hạn

- WorkItem là **contract/façade**, không business table thứ tư. business_work_item_id map source_type/native_id/canonical_writer/company/authority_epoch; projection/alias metadata không trở thành hồ sơ công việc cạnh tranh.
- CRM presales giữ Need/Lead owner và crm_tasks/assignment đúng nghiệp vụ. Assignment chỉ alias cùng work khi evidence chứng minh cùng business intent; việc độc lập giữ ID/lifecycle riêng, không dedup theo title.
- Work/SX/VC registered writers giữ sau bán, kể cả row ở crm_tasks có production relations. Không bulk classify theo bảng/type/status. View tổng hợp không tự được quyền mutation mọi nguồn.
- Business work tách Paperclip task/run/workflow IDs; AI done không đóng work. Native done/completed map theo contract và acceptance evidence.
- Mutation đi service owner, effective scope, expected revision/evidence và Decision/Command khi là effect. Assigned/delivered/accepted/first_response riêng; một event nguồn không tạo hai work intents.

## Chuyển đổi, rollback và kiểm

Inventory IDs/writers/readers → classify overlap có evidence → immutable alias map/shadow diff → chọn một writer theo scope → freeze/fence legacy và outstanding commands/UNKNOWN → watermark/reconcile → mở façade → retire route cũ có compatibility window. Thiết kế không chạy cutover. Rollback dừng writer mới/đối soát rồi trả nguồn cũ đã đăng ký, giữ history/receipt/artifacts; không hai writer hoặc bulk replay.

Nếu W0 mới chứng minh core khác phù hợp hơn hoặc overlap chưa đủ evidence, cập nhật phương án/criteria/open question; nhóm chưa phân loại giữ nguồn cũ với exception owner. [Acceptance](../acceptance-matrix.md) T02/T03/T04/T08/T27/T32; [plan](../m1-build-plan.md) G0-04/MB-01/06; [TASK](../TASK.md) D5/A3/B2. Kiến trúc vẫn đủ sáu miền, M1 chỉ chọn writer cho lát trước bán.
