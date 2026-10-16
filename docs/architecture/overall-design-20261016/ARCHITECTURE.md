# BOS-ARCH-DESIGN-01 — Kiến trúc tổng thể đề xuất

Ngày 16/10/2026, Asia/Ho_Chi_Minh. Trạng thái: DESIGN_PROPOSAL; không phải APPROVED V3.2 hoặc nghiệm thu runtime. Baseline mã: fe3f4398ebf2186596c108a7570f83e3bbef104a.

## 1. Ranh giới và cách đọc

Một Business AI OS chứa Founder Interface, Marketing, Sales/CRM, Vận hành & giao giá trị, Chăm sóc & bảo hành, Tài chính & đơn hàng. Các miền dùng chung nền L1–L10. Thứ tự xây Marketing–Sales trước không thu hẹp kiến trúc toàn hệ thống. Tận dụng Quanlycongviec, không dựng CRM/ERP hoặc bộ điều phối AI cạnh tranh.

- [Tóm tắt và quyết định còn mở](SUMMARY.md).
- [Hiện trạng có nguồn](INVENTORY.md), [nguồn và kiểm chứng](EVIDENCE.md).
- [Hợp đồng, authority và vòng đời](CONTRACTS.md), [schema minh họa](schemas/bos-contracts.schema.json).
- [Marketing và ma trận kênh](CHANNELS.md), [các lựa chọn/ADR đề xuất](DECISIONS.md).
- [Backlog/ca nghiệm thu](BACKLOG_ACCEPTANCE.md), [nguồn lực/chi phí](RESOURCES.md).
- [Hình tổng thể](diagrams/overall.png), [nguồn tổng thể](diagrams/overall.mmd), [kỹ thuật](diagrams/technical.mmd), [ERD](diagrams/ownership-erd.mmd).

Nguồn chưa tìm thấy trong phạm vi kiểm tra: hai PNG tổng thể/Marketing nêu trong brief và CODEX_SETUP_BUSINESS_AI_OS_V3_1_V1_20261016.md. Không tái tạo nội dung bị thiếu dưới danh nghĩa bản gốc. Thiết kế một boundary bám brief hiện hành; V3.1 PDF có sẵn được dùng cho bất biến và T01–T20. Mọi mapping live chưa xác minh giữ UNVERIFIED.

## 2. Góc nhìn kinh doanh và sáu hệ

Hành trình dùng chung: điểm chạm → Party/Need → tiếp nhận → tư vấn/khảo sát → Quote version → CustomerAcceptance → Order → đơn vị thực hiện/Project → giao/lắp/nghiệm thu → thu/hoàn tiền → ServiceCase/chăm sóc. Tiền có thể đến trước hoặc sau giao hàng; một Order có nhiều Project/đợt/xưởng. Need lặp lại của cùng Party là hồ sơ mới khi có nhu cầu mới, không bị số điện thoại chặn vĩnh viễn.

| Sáu hệ | Hồ sơ do hệ thống giữ | Ai chịu trách nhiệm | Khi chưa đủ dữ liệu |
|---|---|---|---|
| Tư tưởng | Objective, phạm vi, mục tiêu/guardrail và kỳ | Founder/domain owner | WAITING_INPUT có owner/hạn, không tự đặt ngân sách |
| Tư duy | phương án, Decision, Expectation, giả định có nhãn | điều phối + chuyên môn | tìm nguồn được phép; giả định không thay consent/quyền/chứng từ |
| Nguồn lực | quyền, người nhận, budget/cap/capacity reservation | owner + Governance/L10 | chặn đúng nhánh thiếu điều kiện |
| Vận hành | WorkItem, Command, lease/fence, Receipt | service của miền và worker | UNKNOWN giữ exposure và đối soát |
| Báo cáo | Outcome, metric version, coverage/as_of, sai lệch | Reporting đọc nguồn có chủ | null + reason, không biến thành 0 |
| Sửa chữa | AdjustmentProposal, việc sửa, reviewer, đo lại | owner; người có quyền công bố luật | không tự sửa luật/quyền; giữ dấu vết cũ |

CycleRecord chỉ liên kết các hồ sơ trên. Không sao chép sáu sổ trạng thái, không buộc sáu lượt LLM hay sáu vòng duyệt.

## 3. Trách nhiệm từng miền

Chức danh dưới đây là vai trò cần phân công khi mở gói xây, chưa phải khẳng định đã có người nhận. Trường audit chung được định nghĩa ở CONTRACTS.

### 3.1 Founder Control Center / Executive Interface

- Mục tiêu: thấy mục tiêu, hiện trạng, chênh lệch, nguồn lực, ngoại lệ và quyết định cần chốt.
- Chủ: Founder hoặc người được ủy quyền; sở hữu Objective gồm metric_ref, target, period, guardrails, accountable_owner và ưu tiên. Governance giữ bản ghi duyệt chính thức.
- Đọc: các projection đã scope, nguồn/as_of/coverage của L3/L8; không tự ghi Party, tiền, luật hay trạng thái domain.
- Ghi: Objective draft/version, yêu cầu Decision/Adjustment qua C-ACTION; quyết định được ghi bởi Governance sau xác thực người duyệt và hash.
- Vào/ra: objective.changed, decision.requested/recorded, exception.opened/acknowledged. Giao AI qua C-AI, không xem câu trả lời ChatGPT là receipt nghiệp vụ.
- Trạng thái: objective DRAFT → ACTIVE → PAUSED → CLOSED; CLOSED cần kết quả hoặc lý do. Ngoại lệ OPEN → ACKNOWLEDGED → RESOLVED/ESCALATED.
- Chỉ số: khoảng cách tới mục tiêu, việc quá hạn, quyết định chờ, coverage, chi phí/usage thực có nguồn. Thiếu dữ liệu hiển thị UNKNOWN.
- Ngoại lệ: sai quyền REJECTED; thiếu nguồn WAITING_INPUT; trình bày đúng người và hạn thay vì spam nhiều lịch báo cáo.

### 3.2 Marketing

- Chủ: Marketing owner; sở hữu MarketingPlan, Content/Asset và revision/rights, CampaignPlan/channel bindings, Touchpoint/source evidence, các liên kết Attribution. Native platform sở hữu trạng thái phát hành và spend gốc.
- Sáu phần bắt buộc: chiến lược & kế hoạch; nội dung & tài sản; chiến dịch; hành trình & quyền liên hệ; bàn giao Sales; đo lường & cải tiến. Chi tiết và khả năng từng kênh ở CHANNELS.
- Đọc: thông tin sản phẩm/công trình có quyền, Party/Need đã scope, trạng thái tiếp nhận và đơn/thu tiền qua projection; đọc consent hiện hành từ chủ Consent.
- Ghi: tạo/duyệt plan/content qua C-CONTENT/C-CAMPAIGN; xuất bản hoặc đổi ad là C-ACTION → C-COMMAND. Marketing không trực tiếp sửa Lead/Deal hoặc nhận tiền.
- Vào: channel.event.accepted, handoff.accepted, sales.stage.changed, order.confirmed, payment.reconciled/refund.reconciled. Ra: content.review_requested, campaign.action_requested, need.intake_requested, attribution.proposed, adjustment.proposed.
- Trạng thái content DRAFT → IN_REVIEW → APPROVED → SCHEDULED → PUBLISHED; REJECTED quay revision mới; REVOKED/ARCHIVED dừng việc tương lai. CampaignPlan DRAFT → APPROVED → ACTIVE/PAUSED → CLOSED; trạng thái nội bộ tách trạng thái native.
- Chỉ số: cost/qualified-new-Party, cost/qualified-Need riêng, owner accepted/first response, quote/order/cash cohort, coverage và quyền nguồn. Attribution không tự chứng minh nhân quả.
- Ngoại lệ: hết quyền tài sản/consent hoặc sai company chặn trước publish/contact; native result chưa rõ → UNKNOWN; nguồn Organic thiếu bằng chứng giữ UNKNOWN, không đoán theo thời điểm.

### 3.3 Sales / CRM

- Chủ: Sales Admin/CRM owner. Party sở hữu tên/liên hệ và quan hệ phạm vi; Need sở hữu nhu cầu, qualification/reason/evidence, source refs, stage, owner và deadline; không đồng nhất Party với Need.
- Dùng lại customers/leads/CRM workflows có adapter. Hiện lookup phone/email chưa đủ company scope; thiết kế membership và scoped façade trước khi mở luồng mới. Không chạy migration hoặc gộp hồ sơ khách trong gói thiết kế.
- Đọc: receipt/Touchpoint/Consent, sản phẩm/giá được duyệt, công suất từ Vận hành; không tự ghi công suất hay spend.
- Ghi: tiếp nhận/chống trùng Need qua C-INGEST; phân công/deliver/accept/first_response qua C-HANDOFF; tư vấn, khảo sát và Quote version qua dịch vụ Sales.
- Ra: need.created/qualified, handoff.assigned/delivered/accepted/first_response, quote.issued, customer_acceptance.recorded, order.requested. Human outbound cần nguồn có thời điểm, người gửi hợp lệ; ghi note hoặc gán owner chưa là first_response.
- Trạng thái Need NEW → WAITING_OWNER → ASSIGNED → ACCEPTED → QUALIFIED/UNQUALIFIED → CONVERTED/CLOSED; đối chiếu stage native bằng mapping có version, không đổi nhãn hiện tại hàng loạt.
- Chỉ số: thời gian tiếp nhận/thực phản hồi, tỷ lệ khảo sát/báo giá, nhu cầu hợp lệ/trùng, kết quả bàn giao. Business stage không tự là bằng chứng đã thu tiền.
- Ngoại lệ: thiếu owner tạo WAITING_OWNER với SLA/đầu mối dự phòng; không chọn admin ngẫu nhiên; retry không nhân Need; nhu cầu mới có chứng cứ được mở riêng.

### 3.4 Vận hành & giao giá trị

- Chủ: quản lý dự án/xưởng/giao lắp. Sở hữu Project execution unit, Milestone, WorkItem sau bán, nguồn lực/capacity, tiến độ và bằng chứng thực hiện. Domain sản xuất giữ QC/WIP; domain giao lắp giữ nghiệm thu chuyên môn.
- Dùng lại projects, production/logistics, tasks/crm_tasks/unified_tasks_v theo façade đang có. CRM vẫn sở hữu việc chăm khách trước bán; không chuyển mọi crm_tasks chỉ vì tên bảng.
- Vào: order.execution_requested với Order/Quote revision, acceptance_ref, execution_unit_key, deliverables và scope hai bên khi liên công ty.
- Ghi qua C-PROJECT: lập/đổi kế hoạch, giữ chỗ công suất, phân công, nộp bằng chứng, xác nhận milestone theo role. L6 không đánh dấu QC đạt thay người có thẩm quyền.
- Ra: project.accepted, work.assigned/completed, milestone.accepted, delivery.accepted, capacity.reserved/released, service.handover_ready.
- Trạng thái Project PROPOSED → ACCEPTED → PLANNED → IN_PROGRESS → DELIVERED → ACCEPTED_BY_CUSTOMER → CLOSED; ON_HOLD/CANCELLED có lý do/ảnh hưởng tiền. WorkItem OPEN/ASSIGNED/IN_PROGRESS/WAITING_INPUT/REVIEW/COMPLETED/CANCELLED.
- Chỉ số: hạn theo công đoạn, WIP, workload/capacity, làm lại, giao/lắp/acceptance đúng hạn; không lấy shipped thay paid.
- Ngoại lệ: thiếu vật tư/công suất hoặc thay ngày → đánh giá lại dependency, reservation và hạn; không tự dời việc để che quá hạn. Retry Order không tạo Project thừa; một Order nhiều xưởng vẫn hợp lệ theo execution_unit_key.

### 3.5 Chăm sóc & bảo hành

- Chủ: Service owner được phân công. ServiceCase gồm Party/Need/Order/Project refs, loại yêu cầu, mô tả, bằng chứng, lịch hẹn, owner, policy_ref/revision, eligibility và kết quả.
- Party bắt buộc; Order/Project và policy_ref có thể null lúc tiếp nhận/chờ xác minh, không tạo dự án/chính sách giả để mở case. Warranty adjudication cần liên kết đối tượng được bảo hành và policy có nguồn; WAITING_POLICY chưa cam kết eligibility, chi phí hoặc bồi thường.
- Dùng lại trường warranty/status, nhiệm vụ/checklist hiện có làm adapter. ServiceCase là hợp đồng đề xuất; chưa có bằng chứng một registry case hoàn chỉnh đang chạy.
- Đọc: bàn giao/acceptance, sản phẩm/serial nếu có, thời hạn/chính sách được người có quyền xác minh; consent cho chăm sóc lại. Không tự đặt số tháng bảo hành hoặc cam kết bồi thường.
- Vào: service.requested, delivery.accepted, customer.feedback.received. Ghi C-SERVICE để nhận, phân loại, hẹn, thực hiện và đóng theo bằng chứng.
- Ra: service.accepted/scheduled/resolved/reopened, warranty.decision_required, cost.proposed, followup.permission_required.
- Trạng thái OPEN → TRIAGED → ASSIGNED → SCHEDULED → IN_PROGRESS → RESOLVED → CLOSED; REOPENED giữ liên kết case cũ; WAITING_POLICY/WAITING_CUSTOMER có owner/hạn.
- Chỉ số: phản hồi, lịch xử lý, reopen, nguyên nhân lỗi, chi phí đã đối soát và hài lòng có nguồn.
- Ngoại lệ: không xác minh được policy/đối tượng → chờ người nghiệp vụ; yêu cầu liên hệ lại thiếu quyền không được tự gửi; chi/hoàn tiền đi Finance qua Decision riêng.

### 3.6 Tài chính & đơn hàng

- Chủ: Commercial owner cho Quote/Order; Finance owner cho chứng từ/payment/refund/cost/reconciliation. Đây là một miền trình bày rộng, vẫn có bounded service ownership cho từng đối tượng.
- Quote/version và CustomerAcceptance được Sales xác nhận; Order service là writer duy nhất trạng thái đơn, dòng hàng/giá/thuế/chiết khấu và cam kết.
- Payment/Refund ghi theo nguồn chứng từ và adapter Finance. Hiện crm_deal_payments và payment_records có writer/mirror khác nhau: B01 đăng ký authority từng transaction_ref, khóa routing rồi đối soát trước chuyển; không dựng ledger tiền thứ ba.
- Đọc: Order version, CustomerAcceptance, delivery/acceptance và nguồn kế toán MISA nếu có quyền; không dùng nhãn Hot/Win, pixel hoặc thank-you page làm nguồn tiền.
- Vào: order.requested, payment.reported, accounting.statement.imported, refund.requested, delivery.accepted. Ghi C-PAYMENT theo transaction/provider key và reconciliation evidence.
- Ra: order.confirmed/revised/cancelled, payment.reconciled, refund.reconciled, receivable.adjusted, direct_cost.reconciled. Purchase conversion là projection có định nghĩa, không là lệnh thu tiền.
- Trạng thái Order DRAFT → CONFIRMED → IN_FULFILMENT → FULFILLED/CANCELLED; Payment REPORTED → PENDING_RECONCILIATION → RECONCILED/REJECTED; Refund REQUESTED → APPROVED → RECONCILED/REJECTED.
- Chỉ số tách riêng: giá trị đơn, công nợ, tiền thu ròng, doanh thu theo policy được duyệt, cost và lãi đóng góp có coverage; chưa tuyên bố lợi nhuận toàn doanh nghiệp khi thiếu nguồn.
- Ngoại lệ: đơn đổi version cần đánh giá ảnh hưởng acceptance, execution và tiền; refund có ID riêng trỏ payment gốc; lỗi ghi/mất đáp ứng giữ UNKNOWN, không tự tạo conversion hoặc thu tiền lần nữa.

## 4. Nền dùng chung L1–L10

| Tầng | Module logic đề xuất / reuse | Quyền sở hữu và giao tiếp |
|---|---|---|
| L1 Kênh | channel adapters, integrations WordPress, Meta/Google/Zalo có sẵn | tài khoản/native IDs, permission inventory; nền tảng giữ trạng thái gốc |
| L2 Tiếp nhận | source receivers + durable inbox, routing bindings | ACK sau commit; C-INGEST; không chờ AI |
| L3 Sự thật | scoped façades trên CRM/Work/Finance + fact projections | authority từng field, revision/snapshot, source/as_of/coverage |
| L4 Quy luật | governance/rules | một registry versioned; không sao chép registry vào n8n/Paperclip |
| L5 Quyết định | governance/decision + approval adapter | C-ACTION, C0–C3, bốn cửa, exact payload/scope/fact/rule refs |
| L6 Thực thi | execution service + DB leases/fences/outbox + native adapters | C-COMMAND/C-RECEIPT; worker không bypass domain service |
| L7 AI | ai gateway/model adapter + Paperclip bridge | AI task/run mapping, per-call reservation; runtime thay được |
| L8 Đo/học | reporting/measurement | metric definitions, Expectation/Outcome, proposals; không ghi đè facts/rules |
| L9 Trải nghiệm | Founder/Cockpit và giao diện hiện hữu | query projection + yêu cầu command; không ghi DB trực tiếp |
| L10 Nền tảng | identity, tenant/company, audit, cap, ops | canonical effective scope, usage ledger; tenant lifecycle mở rộng sau |

Ban đầu một backend Express chia module và worker có thể chạy process riêng; React hiện hữu; PostgreSQL Primary hiện hữu theo môi trường. L1–L10 không tương ứng 10 microservice/DB. Paperclip giữ backlog/lịch AI; backend giữ lịch nghiệp vụ; nền tảng giữ lịch xuất bản; OS giữ backup/health. Một job chỉ có một lịch/chủ retry đang active; inventory và bàn giao trước khi đổi chủ.

## 5. Đường điều hành và thực thi

1. Founder/nhân sự gửi Objective hoặc yêu cầu; Executive Interface chuẩn hóa và trả preview có nguồn.
2. Paperclip giữ AI task/run theo template, hai vai trò điều phối/thực hiện; reviewer theo việc, Codex ngoài runtime làm kỹ thuật.
3. Mọi hành động kinh doanh đi qua C-ACTION: server resolve danh tính/scope, L4/L5 đánh giá; thiếu điều kiện thì chờ đúng nhánh; sai quyền/điều cấm thì REJECTED.
4. L6 lưu command và reservation, claim bằng transaction; kiểm lại rule/fact/consent/TTL/approval/expected version ngay trước effect.
5. Adapter nhận credential đích tối thiểu; AI/n8n không giữ token DB/Ads/shell/browser có thể vòng service. Thiếu cơ chế chặn đường vòng là STOP cho ghi thật.
6. Receipt chỉ chứng minh mốc cụ thể. Provider accepted, dữ liệu business committed và readback reconciled là các mốc khác nhau. GET receipt thuần đọc.
7. Outcome có thể chờ nhiều ngày sau AI task hoàn tất. Callback không tự đóng Need/Order hay ghi doanh thu.

Sequence chỉnh sửa được: [intake](diagrams/seq-01-intake.mmd), [campaign/action](diagrams/seq-02-action.mmd), [order/payment/refund](diagrams/seq-03-money.mmd), [AI/callback](diagrams/seq-04-ai.mmd), [trùng/đổi quyền/UNKNOWN](diagrams/seq-05-failure.mmd).

## 6. Triển khai dự kiến và vận hành

[Sơ đồ triển khai](diagrams/deployment.mmd). Không tạo tài nguyên hạ tầng trong nhiệm vụ này.

| Môi trường | Process/storage | Secret/network | Điều kiện chuyển bước |
|---|---|---|---|
| Local design hiện tại | Markdown, JSON schema, fixture offline; không import application startup | không credential/provider call | LOCAL_DESIGN_CHECK không là live PASS |
| Dev đề xuất | backend/worker + PostgreSQL cô lập + mock channel + Paperclip test organization | test identities riêng; deny outbound mặc định; seed tổng hợp | auth/contract/transactions/multi-session tests |
| Staging đề xuất | build SHA pin, worker, DB riêng, adapters sandbox/test | vault refs theo company; egress allowlist; tắt schedule/paid/external sends trừ ca được giao | T01–T20 và ca miền mở rộng; restore/fencing và evidence |
| Production hiện hữu/candidate | Express/React/Render, DB primary/backup và Paperclip WSL được inventory riêng | quyền đang có giữ nguyên; rollout từng adapter/flag | nhiệm vụ phát hành riêng sau design review; không suy từ PR docs |

Không coi desktop/laptop là HA. Backup Paperclip health OK chỉ xác nhận file backup, chưa xác nhận restore. Backup CRM còn khoảng trống replication theo hồ sơ; RPO/RTO mục tiêu phải đo trong staging theo từng nguồn. Một business writer Primary tại một thời điểm: fencing epoch lưu bền, dừng writer cũ, đối soát đến watermark rồi mới cấp writer mới; không mở hai nơi ghi.

Runbook dự kiến:

- Health tách liveness/readiness/source freshness/queue age/reconciliation lag/cap exposure. Mất AI vẫn nhận inbox và bàn giao theo route nghiệp vụ đủ quyền; mất worker vẫn ACK sau lưu nếu còn capacity, nếu inbox không commit được trả lỗi retryable, không ACK giả.
- Mất integration ghi: dừng riêng đích đó; inbox/domain đủ độc lập tiếp tục; dùng backoff+jitter với cap và DLQ có owner/hạn. Cảnh báo có xác nhận đã giao, không chỉ có log gửi.
- UNKNOWN: giữ claim/effect record và reservation phù hợp, reconcile bằng ID đích; không dùng hết lease để coi chưa ghi. Restore không tự replay outbox; staged recovery mode đọc/đối soát trước.
- Logs loại token/raw PII, giữ correlation IDs; evidence private object storage có quyền và retention class. Thời hạn lưu/chính sách xóa dữ liệu cá nhân do người có thẩm quyền chốt, không tự đặt nghĩa vụ pháp lý.
- Secret rotate theo integration/account/company, revoke có hiệu lực ở dispatch; ứng dụng không lưu model API key trong prompt hoặc agent workspace.
- Initial AI concurrency đề xuất 1; cap cross-runtime phải chặn tại gateway/dispatch, tính retry/reviewer/subagent. Chưa rõ price/cap thì UNSET và fixture, không paid call.
- Tenant lifecycle đề xuất ACTIVE → RESTRICTED → SUSPENDED → CLOSING → CLOSED. Kênh ingress trong trạng thái bị hạn chế phải có policy riêng cho nhận dữ liệu, retention và người nhận; mặc định chặn paid/ghi chủ động, không tự xóa hồ sơ/giả ACK. SaaS billing/onboarding tự phục vụ hoãn.

## 7. Chuyển đổi không làm mất nguồn chuẩn

Inventory → scoped read adapter → shadow projection/diff → contract + quyền + atomic writer → rehearsal → chọn một writer → rollout có flag → đối soát → ngừng đường cũ sau bàn giao. Nhóm chưa phân loại giữ legacy với nhãn, không bulk backfill theo tên bảng. Không sửa schema hay quyền thật trong gói này.

Reconciliation checkpoint gồm source watermark, object counts/hashes theo scope, ID mapping, pending command/reservation, DLQ/UNKNOWN và owner quyết định. Rollback mã/flag không xóa receipt, đơn/tiền hoặc lịch sử; nghiệp vụ bù là command mới có quyền và liên kết tác động gốc. Các controller/timer hiện có được giữ đến khi xác minh dependency và nhiệm vụ chuyển đổi riêng.

## 8. Phần còn mở trước xây/vận hành

Các thiết kế độc lập đã xác định trong tài liệu này. Trước gói xây tương ứng cần xác nhận tenant/company mapping thật, domain owner/authority thanh toán, policy giá/bảo hành/pháp lý, ngân sách sản phẩm/AI và provider scope, hạ tầng staging/RPO/RTO, điều kiện sử dụng n8n nếu chọn. Cách chọn và tác động ở SUMMARY/DECISIONS/RESOURCES; chưa có dữ liệu thì không tự mở quyền hoặc dừng thiết kế phần độc lập.
