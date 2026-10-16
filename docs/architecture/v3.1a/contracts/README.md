# Hợp đồng V3.1a để giao xây dựng

Trạng thái DESIGN_PROPOSAL; version `3.1a.1`. [JSON Schema](bos-contracts.schema.json) dùng [Draft-07](https://json-schema.org/draft-07); [fixture](fixtures.json) hoàn toàn SYNTHETIC. Bảy loại bắt buộc và một receipt intake bổ sung; không phải các endpoint đã triển khai. [Hợp đồng toàn hệ thống](../../overall-design-20261016/CONTRACTS.md) vẫn cung cấp semantics của Party/Need, tiền, campaign, WorkItem và các domain ngoài M1; phần D2/D3/D6 V3.1a ở đây thay các lựa chọn cũ xung đột.

| Record | Chủ ghi | Trách nhiệm / khóa |
|---|---|---|
| IntakeEvent | L2 receiver | Server resolve company qua binding/version; event key từ tenant+company+connector+native account+native event+event type, không từ email/phone hoặc company client gửi |
| IntakeAcceptanceReceipt | L2 transaction | DURABLE chỉ inbox commit; PROJECTED trỏ projection; không cần command giả, không chứng minh đã nhận việc |
| FactProjection | L3 projection service | Source/ref/revision/as_of/expiry/coverage; null + missing_reason khi thiếu, không thay bằng0; AI_GENERATED/EXTERNAL_CLAIM chưa là fact có authority |
| DecisionRecord | L5 governance | Scope, actor/grant/delegation/authority_epoch, target/account, consent refs, typed precondition, immutable fact/rule snapshots, bốn gate, C0–C3 |
| Command | L6 executor | Decision ref+digest bất biến, payload hash, effect key, expected revision, lease+fence; executor resolve toàn context đã ký/ghi bởi L5 |
| Receipt | L6 adapter/reconciler | Command-effect-only; ACCEPTED/COMMITTED/RECONCILED là mốc khác nhau; UNKNOWN không thành success |
| AgentSpec | L7 registry, owner có quyền publish | Exact D6 fields, C0/PROPOSE_ONLY, tool allowlist, model/prompt/eval version, giới hạn vòng/call và memory namespace |
| CycleRecord | L7 orchestrator + L8 links | Liên kết sáu Hệ; scope/session/spec/hash/calls/rounds/taint; reviewer chỉ PASS/FAIL trên artifact_hash cố định |

## Envelope và ràng buộc xuyên bản ghi

ID là định danh opaque, không email/số điện thoại; `company_scope` có đúng một tenant và một company, cả hai do server xác thực. Actor/company/header do client gửi không chứng minh authority. Referenced object khác company bị DENY; cross-company transfer cần hai context/consent/receipt riêng, ngoài M1 mặc định.

AgentSpec/CycleRecord đều bắt buộc đúng tên `taint, company_scope, max_rounds, agent_spec_version, prompt_hash, model_id`. Ba vòng trong fixture chỉ là dữ liệu kiểm, không phải hạn mức vận hành đã duyệt. Model pin `MODEL_PIN_PENDING` chỉ là placeholder synthetic, không đủ điều kiện publish spec.

`taint.labels` giữ EXTERNAL_UNTRUSTED từ đầu đến phiên, tool results, summary và memory. Deterministic validation có thể thêm VALIDATED_FACT nhưng không xóa lineage. AI không được tự nâng authority; output luôn AI_GENERATED. `origin_refs` không chứa raw PII. Một company switch tạo session/namespace mới; không sửa company_id trên phiên đang có.

Reviewer input bound với artifact_hash, reviewer_spec_ref, eval_version. Output object đóng chỉ bốn trường như schema; lý do/checks/rubric ở evidence object liên kết ngoài review. Không nhận replacement text hoặc tool quyền ghi. Round/call budget cộng cả worker, reviewer, repair, retry và subagent; hết giới hạn → ROUND_LIMIT/BUDGET_BLOCKED, không tự mở phiên để né.

## Hash, thời gian và precondition

- Mọi hash là SHA256 lowercase của canonical JSON UTF-8: chọn RFC8785/JCS implementation được pin và test vectors khi build; không dùng thứ tự key hoặc pretty-print làm chuẩn. Fixture hash lặp `a` là placeholder, **không** là chữ ký/kiểm hash mật mã.
- Decision digest bao phủ schema_version, company_scope, toàn authorization_context, action, payload_hash, fact/rule snapshot hashes+refs, authority_class, policy_ref, valid_until và expected_entity_revision. Notice/approval ký đúng digest này. Thay payload, target, revision, quyền, rule, fact hoặc deadline tạo revision/digest mới và hủy authority cũ; approval không mở lại DENY.
- `authorization_context.precondition`: EXISTS_AT_VERSION yêu cầu version khác null và bằng expected_entity_revision; ABSENT yêu cầu version=null, expected_entity_revision='ABSENT', atomic unique-key/create check. Version string opaque, không tự tăng phía client.
- Command.decision_digest/payload_hash/action/revision phải bằng Decision và scoped immutable payload. effect_key ổn định xuyên retry, gồm tenant/company/action/business target/intended revision; không dùng attempt ID để nhân tác động.
- Tất cả thời gian UTC RFC3339; server clock làm chuẩn. `valid_until`, notice.expires_at, lease/deadline phải được kiểm lại khi claim và trước effect. Clock/authority uncertainty → NEEDS_INPUT/UNKNOWN, không tự gia hạn.
- Gate refs trỏ rule versions trong snapshot và evidence cùng scope; snapshot_hash phải tính từ nội dung thực. Schema chỉ kiểm dạng hash, quan hệ này thuộc semantic validation và integration tests.

## API đề xuất, chưa tạo route

| Route dự kiến | Context / kết quả |
|---|---|
| POST /api/bos/v1/intake/:connector | Signature/binding verified; atomic durable receipt; 202 kèm intake_ref sau commit, duplicate same hash trả cùng receipt; key cùng/hash khác409+quarantine; auth401/403, binding404, quota429 |
| GET /api/bos/v1/intake-receipts/:id | Authenticated scoped read; không mutation, không raw PII |
| POST /api/bos/v1/decisions | Service/user authenticated, capability scope; 201 Decision; validation422; forbidden403; stale409; missing data state NEEDS_INPUT |
| POST /api/bos/v1/decisions/:id/approve | Approver authority + If-Match digest; approval exact scope/version; C3 role riêng; approval != notice timeout |
| POST /api/bos/v1/decisions/:id/veto | Actor có quyền theo policy; một lock với dispatch; durable response VETOED hoặc TOO_LATE+dispatch_ref, không im lặng nhận veto trễ |
| POST /api/bos/v1/commands | L5-authorized decision only; idempotency key bắt buộc; 202 là queued, không là thành công nghiệp vụ |
| GET /api/bos/v1/commands/:id/receipts | Pure scoped read; UNKNOWN giữ nguyên và có reconciliation owner/hạn |

Endpoint prefix là đề xuất module BOS, adapter giữ URL legacy trong giai đoạn chuyển. Connector provider ACK theo protocol riêng; internal202 không ép Meta/Zalo trả202 nếu nền tảng cần200. Chi tiết [connectors](../connectors.md), [data model](../data-model.md), [state machines](../state-machines.md).

## Kiểm đã chạy và phần chưa chứng minh

[check-contracts.cjs](../checks/check-contracts.cjs) dùng Ajv có sẵn; positive fixtures và negative cases D6, extra keys, bốn gate, veto, expiry, company, reviewer hash, taint và limits. [Kết quả](../checks/contract-results.json) chỉ LOCAL_DESIGN_CHECK. Date-time validator ở checker chấp nhận UTC chuẩn được dùng trong fixture, không thay provider timestamp parser.

[policy-model.cjs](../checks/policy-model.cjs) là hàm thuần minh họa bảng quyết định, context boolean được harness cung cấp. Không chứa auth resolver, crypto, transaction, distributed lock, worker, gateway hay provider; **PASS không chứng minh concurrency hoặc chống injection của runtime**. Semantic/integration acceptance còn NOT_RUN ở [ma trận](../acceptance-matrix.md). Audit dùng schema2020 riêng, không trộn dialect.

Nguồn kỹ thuật hash: [RFC8785](https://www.rfc-editor.org/rfc/rfc8785). Việc chọn library/canonical fixtures thuộc build gate, chưa cài package.


Consent refs là immutable snapshot refs phải resolve version/purpose/channel/account trong cùng scope. consent_evaluation NOT_APPLICABLE chỉ hợp lệ với action nội bộ không liên hệ khách, reason_code bắt buộc; GRANTED cần refs và policy hiện hành. [] không tự miễn consent gate. Notice bắt buộc recipient_ref và delivery_evidence_ref; server resolve recipient authority, và not_before phải ít nhất delivered_at + published window duration. Model bảo vệ terminal states, precondition/target/version và taint origin/policy; runtime vẫn cần auth/lock/evidence resolver thật.
