# ADR-003 — D3: hai nhánh C2, báo trước có cửa veto

- Trạng thái: **ASSUMPTION_PENDING_FOUNDER**, không kích hoạt notice-mode trên runtime.
- Nhiệm vụ: BOS-V31A-ARCH-01; ngày **16/10/2026, Asia/Ho_Chi_Minh**.

## Bối cảnh và lựa chọn

Brief D3 đưa C2-báo trước cho danh sách đóng bốn action; C2 khác cần duyệt từng việc. Gói cũ yêu cầu C2 approval riêng với exact hash/TTL/recheck; giữ làm mặc định tới khi policy notice có authority ban hành. W0 A4/A5/A9 có approval/notification/scheduler rải, chưa có notice/veto engine đã nghiệm thu.

| Phương án | Lợi ích | Rủi ro/chi phí |
|---|---|---|
| A — Mọi C2 explicit approval | Đơn giản, human authorization rõ | Chờ người cả việc nội bộ nhẹ |
| B — Tất cả C2 im lặng thì làm | Ít chờ | Sai allowlist, có thể làm trước khi người nhận biết |
| C — C2-notice phạm vi đóng, C2-approve mặc định | Tự chủ trong policy hữu hạn | Cần notice ledger, delivery proof và veto/dispatch đồng bộ |

Chọn **C** như giả định D3. Chỉ mở notice-mode khi **Founder duyệt policy/allowlist và biên độ** đúng authority. Evaluator backend chọn mode theo effective policy/version, actor/scope/action/target/limit; client tự khai mode không mở quyền. C1 là delegation hữu hạn, C3 thay khung đúng cấp; sai scope/điều cấm bị chặn (Decision **DENIED**, Command nếu có bị **REJECTED**), không hợp thức hóa qua duyệt.

## Bốn action đề xuất M1 và loại trừ

1. Phân công lại lead quá hạn owner ACK sang người trực active đủ scope, expected revision còn đúng.
2. Đổi thứ tự ưu tiên hàng chờ chăm khách trong giới hạn đã ban hành.
3. Dời nhắc việc **nội bộ** trong biên độ của chủ DN; giữ SLA gốc/lịch sử, không đổi cam kết khách hoặc che quá hạn.
4. **Đề xuất** lịch khảo sát muộn hơn khi capacity vượt ngưỡng công bố; khách vẫn được ghi nhận và có người nhận. Chưa là lệnh gửi khách hoặc chốt lịch cam kết.

Chiết khấu, ngân sách Ads, gửi tin/email cho khách và mọi action không nêu trong allowlist **không dùng notice-mode M1**. D3 pending hoặc thiếu allowlist/limit/dwell/recipient/authority thì NEEDS_INPUT; chỉ có thể chuyển explicit approval khi action hợp lệ và policy cho phép. Không âm thầm thành C1.

## Notice, dwell và shared linearization

Notice giữ notice_id, Decision/action digest, company/target, policy/allowlist version, recipient authority, preview, delivered proof/delivered_at, dwell/deadline timezone, veto route và reconciliation state. Enqueue/send-queued/HTTP202 không là DELIVERED. **Missing delivery hoặc UNKNOWN → NEEDS_INPUT** có owner; im lặng sau enqueue không cấp quyền.

Dwell bắt đầu từ delivery proof theo policy/version và clock nguồn chuẩn; deadline nằm trong Decision TTL. Chỉ hết dwell, không có veto hợp lệ và tất cả gate còn fresh mới xét execute. **No-veto là căn cứ policy, không phải approval receipt của người.** Audit ghi mode/căn cứ riêng, không giả chữ ký human approver.

Veto persistence và pre-dispatch authorization phải dùng **cùng aggregate lock hoặc CAS/shared linearization point trong DB** theo action/Decision intent. Trong cùng transaction dispatch: đọc delivery/deadline, veto/cancel ledger, membership/authority, rules/facts/consent/rights, expected state và cap; đủ điều kiện mới ghi DISPATCH_INTENT/claim với fence. Veto trước điểm này chặn intent; không đọc veto rồi thả lock để dispatch stale PASS. Worker/n8n timer riêng không thay guarantee này.

Nếu đường nhận veto chậm/không chứng minh đã tiếp nhận đến deadline, giữ NEEDS_INPUT/đối soát thay vì chọn không thấy veto. Veto/cancel sau DISPATCH_INTENT có thể gặp call đã in-flight: ghi late intent, best-effort stop, UNKNOWN/readback khi cần; không giả đã ngăn effect. Confirmed effect giữ SUCCEEDED và compensation riêng; confirmed no-effect sau cancel giữ CANCELLED/no retry. Claim mới/restore/callback muộn không bỏ veto/tombstone.

## Trade-off, kiểm và nguồn

Cần durable notice/audit, không approval registry thứ hai hoặc workflow engine tổng quát. Redis lock đơn lẻ, cronLeader fallback hoặc prompt không đủ linearization. Đổi payload/rule/fact/owner/TTL/consent/cap phải reevaluate; notice không cấp thêm ngân sách/scope. Tính đảo ngược của action không cho phép gửi tác dụng trước delivery/dwell.

[TASK](../TASK.md) D3/B5/B8; W0 A4/A5/A9; [state machines](../state-machines.md); [contracts](../contracts/); [acceptance](../acceptance-matrix.md) V3A-T08–T12/T15, T06/T10/T12/T15/T32. Các race/DB/network proof tương lai NOT_RUN; ADR không thay runtime.
