# Máy trạng thái Decision và Command — V3.1a

DESIGN_PROPOSAL, D3/D4 ASSUMPTION_PENDING_FOUNDER. Bản mới giữ bốn cửa **Pháp → Lệ → Lý → Tình** từ V3.1 trang8 và bổ sung quyền DENY/UNKNOWN cho Tình như brief. [Schema](contracts/bos-contracts.schema.json), [mô hình thuần](checks/policy-model.cjs), [diagram](diagrams/decision.mmd).

## 1. Decision: đánh giá, authority và điểm chờ

PROPOSED → EVALUATING. Mỗi cửa trả PASS/DENY/UNKNOWN, reason_code, rule version và evidence. Thiếu input ở cửa chưa đánh giá ghi UNKNOWN với reason rõ. DENY tại bất kỳ cửa nào → DENIED; UNKNOWN khi không có DENY → NEEDS_INPUT. Hard deny không được Founder, AI, gate sau hoặc approval nâng thành PASS. NEEDS_INPUT có owner, nguồn cần lấy, hạn và escalation; timeout không là approval.

Sau bốn PASS và fact/rule/scope/revision/TTL còn hiệu lực:

| Authority | Chuyển trạng thái | Điều kiện bổ sung |
|---|---|---|
| C0 | kết quả đọc, không phát Command | Không side effect; external content chỉ nằm nhánh này và được phép đề xuất |
| C1 | AUTHORIZED | Published policy cho đúng actor/scope/action/budget; không suy risk thấp khi chưa phân loại |
| C2_NOTIFY | WAITING_NOTICE → NOTICE_PENDING → AUTHORIZED hoặc VETOED | Chỉ bốn action thuộc policy allowlist đã được Founder duyệt; delivery và window hợp lệ; no-veto chỉ là NOTICE_WINDOW_ELAPSED |
| C2_APPROVE | WAITING_APPROVAL → AUTHORIZED | Approver có quyền, exact digest/target/scope/expiry; từ chối → DENIED |
| C3 | WAITING_APPROVAL → AUTHORIZED | Escalate đến thẩm quyền C3 được policy chỉ định; không dùng người duyệt C2 thay thế |
| Bất kỳ | EXPIRED | Quá valid_until; request revision mới và đánh giá lại, không resurrect bằng retry |

Mọi payload/fact/rule/permission/precondition đổi làm authority cũ stale → NEEDS_INPUT/EVALUATING trên revision mới. AUTHORIZED chỉ được CONSUMED sau tạo command bền vững với effect key; transaction thất bại không tiêu authority hoặc tạo nửa command.

## 2. C2-báo trước là một policy có giới hạn

Bốn action code đề xuất, **chưa được bật**:

1. lead_reassign_on_ack_timeout: owner chưa ACK quá hạn, người trực có scope/capacity, không đổi khách/nhu cầu.
2. internal_followup_reprioritize: đổi priority nội bộ trong policy band.
3. internal_reminder_reschedule: đổi reminder nội bộ trong biên độ đã ban hành, giữ original deadline/audit.
4. site_visit_later_slot_propose: lưu đề xuất nội bộ khi capacity vượt threshold; không gửi tin hoặc đổi cam kết lịch với khách.

Ngoài allowlist, hoặc thiếu điều kiện “thấp, đảo ngược, trong hạn mức, có tiền lệ” → C2_APPROVE/NEEDS_INPUT theo policy; không tự thêm action. Discount, ad spend/budget và customer outbound không thuộc C2_NOTIFY M1.

Notice gồm exact digest, recipient có quyền veto, nội dung preview, thời điểm delivered, not_before, expires_at, policy version và veto revision. DELIVERED cần bằng chứng kênh đạt mức delivery policy quy định; queued/sent/HTTP accepted chưa đủ. Window chỉ bắt đầu sau delivered; retry delivery không rút ngắn window. Missing/UNKNOWN/FAILED delivery → NEEDS_INPUT, không “im lặng = đồng ý”. Notification log tách khỏi Approval; approval_id vẫn null khi đủ điều kiện no-veto.

### Đồng bộ veto với dispatch

Một transaction lock theo (tenant,company,decision_id) điều phối **cả** API veto và executor claim. Transaction veto ghi tombstone/veto_revision rồi commit; claim kiểm digest, gate, thời gian, delivery, veto_revision, owner/cap/consent hiện tại, giữ reservation, tạo dispatch token/fence và đóng window atomically. Trước effect, executor kiểm token/fence + cancellation tombstone dưới cùng cơ chế serialization.

Điểm tuyến tính là transaction chuyển dispatch sang EXECUTING có dispatch_ref. Veto đã commit trước điểm này thắng, không được gọi adapter. Veto đến sau điểm này phải trả TOO_LATE với dispatch_ref; ghi yêu cầu cancel/reconcile, không trả VETOED giả. Không thể hứa đảo ngược một provider request đã ra mạng; bù trừ là command riêng. Nếu action internal DB được phép, mutation và receipt/audit ở cùng transaction với transition; tránh khoảng trống check-then-write.

ACK của owner đến trước dispatch làm mất precondition “chưa ACK”; phải hủy reassign hoặc đánh giá revision mới. Khi owner ACK và reassignment chạy đồng thời, cùng row version/lock quyết định một kết quả, receipt ghi version thật. Thử pure functions không chứng minh race này; V3A integration cases phải chạy khi build.

## 3. Command, effect và receipt

RECEIVED → VALIDATED → READY → EXECUTING. Invalid scope/authority/precondition → REJECTED; chưa đủ dữ liệu giữ decision NEEDS_INPUT, chưa READY. Người hủy trước effect → CANCELLED với tombstone. Claim cần lease + monotonic fence và exact Decision digest. Worker stale/fence cũ không được write hoặc release reservation.

| Trạng thái | Điều kiện / đường ra |
|---|---|
| EXECUTING → SUCCEEDED | Evidence business effect confirmed và reconciled theo adapter contract; provider accept riêng chưa đủ |
| EXECUTING → FAILED_NO_EFFECT | Có bằng chứng chắc chắn không effect; không dùng timeout/network error để đoán |
| EXECUTING → UNKNOWN | Timeout, mất đáp ứng, lease chết hoặc provider result thiếu; giữ exposure/cap reservation, không retry effect mù |
| UNKNOWN → RECONCILING | Reconciler nhận quyền đọc status/readback bằng cùng effect key |
| RECONCILING → SUCCEEDED | Xác nhận effect dù cancel đã yêu cầu; nếu cần undo tạo command mới có authority |
| RECONCILING → FAILED_NO_EFFECT | Xác nhận không effect, giữ idempotency history |
| RECONCILING → MANUAL_REVIEW | Không đủ nguồn để kết luận, có owner/hạn/escalation |
| CANCEL_REQUESTED → RECONCILING | Không biết effect; không tự trả CANCELLED |
| FAILED_NO_EFFECT → VALIDATED | Cùng command/effect key, retry policy cho phép, fresh decision, chưa cancellation tombstone; tăng attempt/fence |
| RECONCILING → CANCELLED | Có cancellation intent và bằng chứng không effect |
| SUCCEEDED/REJECTED/CANCELLED | Terminal; bù trừ/yêu cầu mới dùng command riêng, không xóa lịch sử |

Durable accepted receipt chỉ chứng minh đã tiếp nhận. COMMITTED chứng minh transaction/effect tại hệ đích; RECONCILED chứng minh readback/sourceauthority. Receipt bất biến, scope/effect key/command/hash match; callback trễ có thể bổ sung evidence nhưng không vượt cancellation/fence hoặc sửa domain trực tiếp. GET receipt không phát lại lệnh.

## 4. Bất biến kiểm trong build

- Command không được phát từ C0, UNKNOWN, DENY, VETOED, expired hoặc stale hash.
- Lease timeout không chứng minh NO_EFFECT; unknown giữ cap cho đến evidence settle/release.
- Snapshot provenance và actor delegation được resolve từ auth server, không từ LLM/clientheader.
- Precondition typed và expected version nhất quán như contract README; create ABSENT được unique-key transaction bảo vệ.
- Rule update/permission revoke/consent revoke được kiểm lại ngay trước effect; C3 không bypass hard DENY.
- Notification window dùng durable timestamps; restart/retry giữ deadline gốc.
- [Acceptance matrix](acceptance-matrix.md) là test runtime tương lai, NOT_RUN. [Kiểm offline](checks/contract-results.json) là kiểm hình dạng/hàm thuần tại thời điểm sinh, không thay execution engine.
