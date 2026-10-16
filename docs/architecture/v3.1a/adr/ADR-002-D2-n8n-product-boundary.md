# ADR-002 / D2 — n8n ngoài đường sản phẩm

- Ngày: **16/10/2026**; trạng thái **ASSUMPTION — PENDING_FOUNDER** theo BOS-V31A-ARCH-01 §3, **không APPROVED/Accepted**.
- Phạm vi: thiết kế V3.1a; chưa cài/gỡ/dừng/chuyển scheduler/credential/deploy bất kỳ hệ đang chạy nào.
- Kế thừa: V3.1 trang3/5/11/13/18/20; [P02 gói tổng thể](../../overall-design-20261016/DECISIONS.md). ADR cũ giữ nguyên lịch sử; D2 thu hẹp phương án tùy chọn trước đó.

## Ngữ cảnh và chênh lệch với code

V3.1 cho phép n8n orchestration tích hợp nhưng giữ inbox/Command/Receipt ở backend. Brief V3.1a đề xuất rõ hơn: đường sản phẩm gồm nhận khách, connector, notification và reconciliation chạy trong backend; n8n chỉ phục vụ nội bộ.

Mã `backend/src/routes/zalo.js:283–298` còn trigger n8n inbound/profile; `helpers/zaloN8nWebhook.js:131–158` là HTTP delivery có timeout, không durable business receipt. `jobs/zaloOaTokenRefresh.js` và jobs trong `server.js` cho thấy backend có schedule; `helpers/cronLeader.js` chạy fallback khi Redis thiếu/lỗi, nên chưa đủ fencing cho tác dụng quan trọng.

Đây là **MỘT PHẦN / cần chuyển có kiểm soát**, không đủ kết luận D2 không khả thi. Chưa có evidence tất cả dependency n8n thật đã được inventory; nếu gặp một workflow chưa thay được, giữ mục dependency/HOLD và phương án staging tương ứng, không tự bỏ D2 hoặc gỡ n8n.

## Phương án

| Phương án | Lợi ích | Công/đánh đổi |
|---|---|---|
| A: n8n ở đường sản phẩm theo một số adapter V3.1 | Visual glue/connector hữu ích nếu đúng capability | Thêm runtime/license/secret/retry/version/ops boundary; còn phụ thuộc ngoài backend cho M1 |
| B: backend product path, n8n internal-only **(giả định D2)** | Một owner intake/queue/Command/notification/reconcile; giảm phụ thuộc runtime người dùng sản phẩm | Backend engineer phải làm glue/schedule/retry/monitoring hữu hạn; không gọi lựa chọn này miễn công vận hành |
| C: tự xây visual workflow engine mới | Không thêm sản phẩm n8n | Công lớn/rủi ro không có căn cứ, lệch M1; **không chọn** |

## Quyết định thiết kế giả định

Chọn B cho gói V3.1a: reuse modular backend/worker/PostgreSQL và adapter hiện có; inbox/outbox/leases/fences/receipts/scope/cap giữ chủ chuẩn như CONTRACTS. n8n có thể dùng nội bộ để hỗ trợ engineering/report không tác dụng sản phẩm, với credential hẹp; không ở luồng yêu cầu khách hoặc phụ thuộc để nhận/giữ/giao việc khách. Một API product call từ n8n cũng không cấp quyền tự triển khai automation sản phẩm.

| Trách nhiệm từng luồng | Chủ đích | Điều kiện chuyển |
|---|---|---|
| Lịch nghiệp vụ/missed runs | Backend job registry + durable due scan | Job ID/timezone/watermark, một active schedule; timer chỉ wake-up |
| Connector/token/rate/page | Backend provider adapter | Company/account entitlement, secretrefs, pinversion, contracttest |
| Retry/UNKNOWN | Backend execution/adapter | Stable key, boundedattempt, no blindretry; native readback/manualowner |
| Reconciliation | Backend domain projections + operator/CRM owner | Window/coverage/sourceauthority; MISSING khi đủevidence |
| Notifications/humanACK | Backend outbox + inbox/channel adapter | Provider accepted khác delivered; authenticated assigneeACK |
| Observability/restore | Platform maintainer + external alert/check | Queueage/lag/unknown/rotation, protectedbackup/restore/fencing |
| Code/upgrade/maintenance | Repo owner + integration engineer | Review/CI/version/rollback, runbook và người duy trì |

## Giấy phép, chi phí và nguồn

Đọc **16/10/2026**: [n8n LICENSE](https://github.com/n8n-io/n8n/blob/master/LICENSE.md), [License FAQ cập nhật06/10](https://support.n8n.io/article/can-i-use-your-license-for-my-use-case), [pricing](https://n8n.io/pricing/). Internal-only cần đối chiếu tổ chức/ai sửa workflow; không suy mọi cách dùng nội bộ miễn mọi paid feature. Khách ngoài tự cấu hình logic qua UI/API/MCP/AI có phạm vi thương mại khác; **LICENSE_SCOPE_UNVERIFIED** tới khi model triển khai cụ thể được xác nhận.

Giá tham chiếu và giả định công A/B đã ghi ở P02, không mua hoặc quy đổi mới. B không thêm license n8n trên đường sản phẩm nhưng vẫn cần compute/DB/backup/log/công backend/bảo trì; tổng **UNPRICED** tới khi có capacity/staff rate. Không đổi quỹ marketing130 triệu. Internal n8n nếu giữ cũng phải inventoryversion/plan/cost riêng, không tự claim gỡ bỏ tiết kiệm khoản nào.

## Chuyển đổi, rollback và điều kiện xét lại

Inventory dependencies → fixture/backendadapter → shadowread → rehearsal → drain pending/UNKNOWN → fence legacyproductwriter/schedule → mởbackend → reconcile → retire route theo nhiệm vụ riêng. Không dualwriter, không chuyển credential bằng xuất workflow công khai. Rollback ngừng dispatchmới, đọc/đối soát receipts, trả owner cũ sau fencing; không replay tác dụng đã gửi.

T01–T08/T10–T13/T18 và connector-specific tests vẫn **NOT_RUN**. Nếu một capability không thể làm qua API/backend trong hạn nguồn lực, chuẩn bị adapter manual có evidence hoặc đề xuất xem lại D2 kèm chi phí/risks; Founder chốt thay đổi lớn. Không tự thêm engine mới hoặc n8n product path vì tiện viết workflow.
