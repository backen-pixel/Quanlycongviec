# Hợp đồng xây dựng đề xuất — BOS-ARCH-DESIGN-01

Version 0.1.0, DESIGN_PROPOSAL, 16/10/2026. Tất cả đường /api/bos/v1 và /internal/bos/v1 dưới đây là hợp đồng đích, CHƯA phải endpoint đã tồn tại. Builder phải bind vào façade hiện có theo INVENTORY trước khi thêm đường mới. Không gọi endpoint thật hoặc chạy SQL trong nhiệm vụ thiết kế.

## 1. Quy ước bắt buộc

- Thời điểm RFC3339 có offset, lưu UTC; kỳ báo cáo Asia/Ho_Chi_Minh và khoảng nửa mở [start,end). Tiền Money gồm currency ISO, amount_minor integer, exponent và basis_ref; VND exponent 0. Không float tiền, không cộng khác currency khi chưa có FX fact/version.
- ID BOS dùng UUID; native ID giữ nguyên string cùng source_system/account/object_type. ID không là quyền. Source_ref không chứa token/raw PII.
- ResolvedContext do server tạo từ identity + membership + binding: tenant_id, company_id, actor_id, actor_type, delegation_ref, scopes, authenticated_at, authority_epoch. Request ngoài chỉ gửi company selector; selector không mở quyền.
- Các entity quan trọng có revision tăng đơn điệu trong scope, created_at/updated_at, writer_id, authority_ref, source_ref; thay nội dung đã dùng quyết định cần revision/snapshot bất biến. Row version legacy phải được wrapper giữ theo transaction hoặc hash snapshot, không giả định updated_at tự đủ.
- Request thay đổi yêu cầu Idempotency-Key + payload canonical hash, If-Match/expected_revision khi tác động tài nguyên có version, correlation_id và reason. Canonical JSON/hash ghi rõ algorithm/version; hash không thay xác thực. Cùng key/khác hash → 409.
- Bộ kiểm quyết định xác minh evidence tại server. Không chấp nhận verified=true, tenant/company, role, approval hoặc amount_limit tự khai từ AI/workflow.
- PII tách private payload, projection masked; người đọc chỉ thấy trường trong scope. Tenant A/A1, A/A2 và B/B1 được test riêng. Quyền cross-company chỉ theo transaction/service account được cấp rõ.
- Schema illustrative ở schemas/bos-contracts.schema.json; schemas/state-machines.json là mô hình kiểm thiết kế. Đây không là migration, OpenAPI runtime hoặc server validation đã triển khai.

### 1.1 Ma trận actor/role và phân tách trách nhiệm

Đây là **logical roles đề xuất**, không phải tên role đã cấp trên hệ thật. Mặc định **DENY** cho mọi khả năng không được cấp rõ. Mỗi ô cho phép còn phải thỏa authenticated identity, tenant/company membership, field policy, delegation, trạng thái tài nguyên và contract tương ứng. Không có membership hoặc binding hợp lệ thì từ chối; không kế thừa legacy bypass. Đọc tổng hợp nhiều company chỉ khi có membership/delegation cho từng phạm vi; **aggregate read không cấp quyền ghi** hay đọc PII chi tiết. `Propose` chỉ tạo đề xuất/draft, không tự thành quyền `Approve`, `Execute`, `Reconcile` hoặc `Publish rule`.

| Actor / logical role | Read | Propose | Approve | Execute | Reconcile | Publish rule |
|---|---|---|---|---|---|---|
| Founder / policy owner | Projection và evidence trong phạm vi được cấp; aggregate có kiểm scope từng company | Objective, ủy quyền, ngoại lệ, policy/C3 | C2 khi là approver hợp lệ khác người đề xuất; C3 khi có authority chính sách tương ứng | Yêu cầu service thực thi sau các gate; không ghi DB/đích trực tiếp hoặc bỏ hard deny | Xem/chốt ngoại lệ thuộc quyền; không tự xác nhận giao dịch thay Finance | Chỉ policy authority được cấp tại tenant/company và immutable reviewed version; không vượt quy tắc cấp trên |
| Marketing | Plan/content/campaign, source/spend và kết quả CRM/Finance projection được phép | Plan, asset/content revision, campaign/action/adjustment | Approver Marketing được ủy quyền, độc lập tác giả, đúng revision/hash/TTL; không duyệt tiền hoặc chính sách toàn hệ | Domain service cho draft/plan; publish/contact/Ads chỉ qua L6 với quyền đích, consent/rights và cap hợp lệ | Đối soát native state/spend evidence trong scope; không xác nhận cash | DENY; chỉ đề xuất rule change |
| CRM / Sales | Party/Need/Quote/handoff và tiến độ/receivable projection theo scope | Need, tư vấn/khảo sát, Quote, acceptance evidence, Order request | Người được giao duyệt thương mại độc lập tác giả theo giới hạn; không tự duyệt thu/hoàn | CRM façade thực hiện mutation được cấp; ACK chỉ actual assignee hoặc delegation rõ; external effect qua L6 | Đối chiếu handoff/khảo sát/acceptance evidence; không reconcile cash | DENY; chỉ đề xuất |
| Finance | Order/payment/refund/cost/chứng từ và evidence cần thiết trong scope | Payment report, refund/cost request, budget basis và reconciliation proposal | Finance checker độc lập maker; giao dịch vượt hạn đi C2/C3 theo policy | Finance façade/L6 đúng quyền; báo cáo payment không tự mark RECONCILED; không direct bank/DB bypass | Finance reconciler được cấp quyền và độc lập người lập/duyệt trên cùng giao dịch; native statement/evidence bắt buộc | DENY mặc định; thay policy tài chính cần authority C3 riêng, không do role Finance tự có |
| Ops / Work / SX / VC | Order accepted revision, Project/WorkItem/capacity và trường khách tối thiểu | Kế hoạch, phân công, milestone/QC/delivery evidence, chi phí đề xuất | Người nghiệm thu được ủy quyền khác người nộp bằng chứng ở bước yêu cầu độc lập | Work façade/L6 trong buyer/executor company scopes; không sửa Order price hoặc tiền | Đối chiếu tiến độ/giao/lắp/QC theo evidence, không reconcile cash | DENY; chỉ đề xuất |
| Service | Party/case, Order/Project/product context và policy đúng scope | Case, lịch hẹn, resolution, warranty/compensation proposal | Service checker được giao theo policy, độc lập tác giả khi cần; tiền đi Finance | Service façade; liên hệ cần consent; không tự cam kết warranty/chi tiền khi thiếu quyền | Đối chiếu case/resolution/khách xác nhận, không reconcile cash | DENY; chỉ đề xuất |
| Executive / EO AI interface | Masked projection/evidence trong resolved scope; aggregate không mở thêm write scope | Tóm tắt, Objective/action/adjustment/AI task draft | DENY: AI không tự phê duyệt hoặc nhận C3 authority | Chỉ tool C0 hoặc C1 được ủy quyền rõ action/target/amount/time/calls qua service; không native credential | Chỉ đọc/soạn đề xuất reconciliation; không tự ghi kết luận có thẩm quyền | DENY |
| Executor / adapter workload | Đúng Command/Decision, nguồn và secret reference tối thiểu cho target đã bind | Chỉ kết quả/receipt của attempt; không mở mục tiêu/command thay thế | DENY | Claim/fence + decision/recheck hợp lệ cho đúng Command; cancel tombstone chặn dispatch mới; không tự nâng C1 | DENY mặc định; nếu có reconciler workload riêng thì cấp contract đọc/append chuyên biệt, không kèm quyền approve | DENY |
| Reviewer độc lập / QA | Đầu ra, diff, source/evidence được giao, có che PII | Review finding, yêu cầu sửa, bằng chứng kiểm | Review kỹ thuật không là duyệt kinh doanh. C2 chỉ khi còn có approver role/delegation cụ thể và khác proposer/executor | DENY đối với effect kinh doanh; kiểm fixture cô lập theo task | Review chứng cứ; không tự settlement/mark cash; người reconcile phải có role riêng | DENY; có thể review draft rule, không publish |
| Integration / source workload | Receipt/readback đúng binding/account và phạm vi contract | Nộp event/payment report/usage evidence do nguồn được bind | DENY | Receiver/adapter chỉ tác động allowlisted contract; inbound event không cấp quyền outbound, chọn account hay sửa policy | Chỉ cung cấp native evidence; kết luận do owner/reconciler được cấp quyền | DENY |

C1 là delegation có hạn action/target/company/amount/cap/time/expected state; không phải đặc quyền tự chủ cho mọi việc của một role. C2 cần duyệt từng action gắn exact digest, không dùng một lần duyệt cho payload khác. C3 dành cho người có authority policy/framework đúng cấp; không hợp thức hóa sai tenant/company, điều cấm hoặc evidence thiếu. Một người có nhiều role vẫn chịu kiểm **khác actor trên cùng giao dịch**: proposer/maker không tự approve; executor không tự chứng thực thành công; callback không thay independent readback. Với Finance tách maker, checker và reconciler; thiếu người độc lập thì WAITING_APPROVAL/WAITING_INPUT có owner, không tự hạ yêu cầu phân tách. Human approver và service executor phải được ghi actor IDs riêng trong audit.

## 2. Authority map đến trường

Mỗi nhóm chỉ có một canonical writer. Dữ liệu legacy có hai đường ghi phải đăng ký và chọn façade trong B01, không tự nhận đã giải quyết ở source.

| Đối tượng | Trường canonical / writer đích | Nguồn/ánh xạ hiện có và revision | Nơi khác chỉ được giữ |
|---|---|---|---|
| Tenant, Company, Membership | identity service: status, relations, membership/scopes, credential binding | tenants/companies/users và scope helpers; mapping thật UNVERIFIED | signed context, selector và reference; không tự tạo tenant từ tên công ty |
| Party | CRM Party façade: display/contact fields, scoped relationships, merge evidence | customers và company membership/projection đề xuất; lookup phone hiện chưa đủ scope | party_ref + masked display; tenant-shared chỉ khi policy cho phép |
| Need | CRM: nhu cầu, stage, qualification/evidence, assigned owner, dates | leads/deal liên kết customer; native stage map có version | Need fact snapshot và state tham chiếu |
| WorkItem | CRM cho chăm khách; Work/SX/VC cho việc sau bán: assignee, due, state, acceptance | tasks/crm_tasks/unified_tasks_v; register source_type+native_id và writer theo nghiệp vụ | mapping business_work_item_id, không đổi trạng thái bằng AI callback |
| Fact | L3 projection service: immutable revision, source/observed/recorded, verification, coverage | đọc owner entity/snapshot; không thành sổ khách/tiền thứ hai | decision lưu revision/snapshot hash, AI giải thích bản đã scope |
| Consent | CRM consent façade: purpose/channel/account scope, notice_version, grant/revoke, validity, evidence | website receipt metadata/consent gate làm adapter; mở rộng consent registry cần xây | consent_ref+revision; grant nguồn chưa kiểm là REPORTED |
| MarketingPlan | Marketing: objective_ref, period, segment, message, AIDA, approval_ref, budget_plan_ref | template hiện có + registry đề xuất | tham chiếu metric/objective, không sửa canonical cap |
| Content / Asset | Marketing content service: text/blob_ref, rights/evidence, version, company, review/publish refs | tài sản/nguồn nội dung hiện có, authority checklist trước nhập | native published ID/readback, không sao chép binary tùy ý |
| CampaignPlan / Binding | Marketing: objective, plan_revision, native account/campaign/group/ad bindings, schedule, requested cap | Facebook/config hiện có + provider adapters, mapping khác nhau theo nền tảng | platform giữ actual spend/status; plan không tự là native live state |
| Touchpoint / Attribution | Marketing evidence: first/source-Need/last refs, identity proof, model_version/share | website_intake, attribution/receipts hiện có | không tự gộp người giữa nền tảng hoặc đếm trọn đơn nhiều kênh |
| Handoff | CRM assignment façade: assignee_id, assigned/delivered/accepted/first_response timestamps+evidence | existing intake/assignment; receipt transport và human ACK tách | Paperclip giữ handoff_ref và ngoại lệ |
| Quote / Acceptance | Sales commercial service: line/price/tax/terms/version; khách chấp thuận đúng version | quotations/quotation_items, acceptance evidence cần khóa theo gói | Order/Project lưu đúng version/ref, không tái sử dụng đồng ý bản cũ |
| Order | Order service: confirmed revision, lines/amounts/status, acceptance_ref, execution_unit refs | orders + routes/helpers hiện có | không tạo lõi Order thứ hai |
| Payment / Refund / DirectCost | Finance façade: transaction identity, amount/currency, evidence, reconciliation state/date | crm_deal_payments/payment_records/invoices và nguồn kế toán; register từng source trước cắt writer | projection/order paid_amount là derived, không authority receipt |
| Project / Capacity | Work/SX/VC owner: execution_unit, milestone/QC/delivery refs, capacity availability/reservations | projects, production, logistics, tasks; multi-xưởng/đợt | CRM nhận tiến độ; Finance nhận evidence đã có quyền |
| ServiceCase | Service owner: party_ref bắt buộc; order_ref/project_ref tùy chọn; request/category, policy_ref/revision nullable khi WAITING_POLICY, warranty_context_ref, appointment, resolution/evidence | warranty fields/tasks/checklist làm adapter; case registry cần bổ sung. Đánh giá bảo hành cần policy và context có chứng cứ, không tạo Project giả để nhận case | Marketing chỉ đọc kết quả có quyền để cải tiến |
| Rule / Delegation | Governance: immutable published version, predicate, scope, hard limits, validity/issuer | dùng approval/permissions phù hợp; unified registry còn thiếu | runtime/n8n/Paperclip chỉ tham chiếu |
| Decision / Approval | Governance: exact actor/scope/action/hash/fact+rule refs, gates, outcome, approver, TTL | existing approvals chỉ được reuse sau mapping object/version/audit | UI không tự ghi APPROVED; C3 không hợp thức hóa sai scope |
| Command / Claim / Receipt | L6: command state, idempotency, lease/fence, durable cancel intent/tombstone, effect attempt, external/readback evidence | durable inbox/outbox/adapters có phần dùng lại; chưa có L6 chung | n8n log/workflow result không receipt canonical; AI task cancellation không xóa nghĩa vụ command/usage |
| Budget / Reservation / Usage | L10 ledger: cap/basis/period, holds, settlement, unknown exposure; Finance xác nhận actual | cap hiện có cần chuyển chủ có đối soát; source spend ở platform | Paperclip quota là sublimit; không hai sổ cap ngang quyền |
| AI Task / Run | Paperclip: task/run identity, execution status/usage evidence | bản cài có live health, integration đầy đủ chưa nghiệm thu | BOS mapping+receipt; không tạo backlog AI song song |
| WorkflowExecution | native backend job hoặc n8n khi được chọn: attempt/progress/native_execution_id | loại engine được ghi trong mapping, optional n8n | không thay Business WorkItem/AI task |
| Expectation / Outcome / Adjustment | L8: metric version, cohort/window, result/coverage/evidence và proposal | source facts do các miền phát; registry đề xuất | không tự sửa fact/rule hoặc tuyên bố causal uplift |

Thay chủ field: authority_change_id + source/target writer + mapping + checksums + watermark + outstanding effects/reservations + rollback. Shadow chỉ đọc. Cắt writer cũ rồi mở writer mới trong cửa được giao; không dual-write vô điều kiện. Incoming revision cũ không ghi đè mới; cùng source key khác nội dung → CONFLICT, owner giải quyết với audit.

## 3. ID, event và vòng đời dữ liệu

Event envelope bắt buộc: schema_version, event_id, event_type, source_event_id, source_system, integration_id, occurred_at, received_at, resolved_context, subject_type/id/revision, payload_hash, correlation_id, causation_id, is_test, data, evidence_ref. Payload private không đưa vào audit/public response. event_id do receiver sinh; source_event_id của provider không tự sửa mỗi lần retry.

Dedup nhận: (tenant,company,integration,source_event_id,event_type). Atomic unique key và compare hash trong transaction lưu inbox. Same key/hash trả receipt cũ; khác hash trả SOURCE_EVENT_CONFLICT và giữ evidence để đối soát. Party merge và Need equivalence dùng policy riêng; không dùng phone làm event dedup hoặc chặn mọi nhu cầu mới.

Event catalog tối thiểu:

| Producer | Sự kiện | Consumer và tác động |
|---|---|---|
| L2 | channel.event.accepted.v1 | CRM nhận inbox item; không phụ thuộc AI |
| CRM | need.created/qualified.v1, handoff.assigned/delivered/accepted/first_response.v1 | Marketing/Reporting cập nhật projection có nguồn |
| Marketing | content.approved/published.v1, campaign.state_observed.v1 | L8 đo theo native readback; publish command theo L6 |
| Sales/Order | quote.issued.v1, customer_acceptance.recorded.v1, order.confirmed/revised/cancelled.v1 | Work thực hiện theo execution_unit_key; Finance cập nhật công nợ |
| Finance | payment.reconciled.v1, refund.reconciled.v1, direct_cost.reconciled.v1 | Order/Reporting và conversion adapter có scope |
| Work | project.accepted.v1, milestone.accepted.v1, delivery.accepted.v1 | Service mở khả năng chăm/bảo hành theo policy; Finance đọc bằng chứng |
| Service | service.resolved/reopened.v1 | Work sửa; Finance nhận cost proposal; Marketing chỉ dữ liệu được phép |
| Governance/L6 | rule.published.v1, consent.revoked.v1, command.state_changed.v1 | invalidate decision tương ứng; worker recheck; không replay tự động |
| Paperclip bridge | ai.run.completed/failed/cancelled.v1 | update AI mapping sau callback xác thực; domain state không tự đổi |
| L8 | outcome.observed.v1, adjustment.proposed.v1 | Founder/domain owner xem; thay luật qua decision riêng |

Versioning: event v1 additive optional mới tương thích; đổi nghĩa/required field dùng major mới và adapter song song có hạn deprecate. Builder đăng ký consumer versions và replay mode trước phát hành. is_test theo nguồn server/binding, không tin AI gỡ nhãn TEST.

## 4. Catalog API/contract

Auth chung: user access token hoặc workload credential TTL/audience/scopes, server resolve effective scope; integration receiver dùng cơ chế chữ ký/token native + binding được provision riêng. Không cho workflow tự lựa chọn credential/account bằng URL tùy ý.

| ID | Endpoint đề xuất / request bắt buộc | Response / trạng thái | Luật, lỗi và permission |
|---|---|---|---|
| C-QUERY | GET /api/bos/v1/views/{view}?company_selector&period&cursor&as_of | 200 data, source_refs, coverage, observed_as_of, next_cursor, unknown_reasons | bos.read + field policy; pure read; không gọi dispatch/restore helper; 403/409scope/503source |
| C-INGEST | POST /api/bos/v1/integrations/{binding}/events: schema_version,source_event_id,event_type,occurred_at,data,payload_hash | native protocol ACK sau inbox commit; 202 intake_id, receipt_ref, state=RECEIVED; duplicate trả same IDs | verified source + server binding; server computes canonical hash, never trusts client digest; 401signature/403binding/409hash/422schema/503persist; ACK không chứng minh Lead |
| C-FACT | GET /api/bos/v1/facts/{type}/{id}?revision; internal POST /facts/project: source_ref+revision+snapshot | immutable Fact revision + verification/coverage | owner read projection only; source conflict quarantine; VERIFIED do validator/authorized actor |
| C-CONSENT | POST /api/bos/v1/parties/{id}/consent-events: purpose,channel,grant/revoke,evidence,notice,source_ref | append event + new consent revision/effective view | consent.record, scope match; revoke supersedes future use; 409revision, 422missing proof |
| C-HANDOFF | POST /needs/{id}/handoffs: rule_ref, owner, due, expected_need_revision; POST /handoffs/{id}/ack: accepted/rejected + evidence; POST /handoffs/{id}/response-evidence | separate assigned/delivered/accepted/first_response milestones; 202delivery attempt, 200human ACK after persist | crm.assign vs actual assignee crm.accept; actor cannot ACK for another without explicit role; no owner→WAITING_OWNER |
| C-CONTENT | POST /marketing/contents; POST /contents/{id}/revisions: brief,asset_refs,rights,payload; POST /revisions/{id}/review | versioned draft/review; approved_revision_ref + decision_ref | content.create/review separated; approval binds hash/assets/license expiry; publish only C-ACTION/C-COMMAND |
| C-CAMPAIGN | POST /marketing/campaign-plans; PUT /plans/{id}/revisions: objective,channel_bindings,schedule,budget_plan_ref,expected_revision | versioned plan + comparison/native observation refs | campaign.plan, not ads.write; unsupported native fields fail validation; no automatic reallocation of130m |
| C-ACTION | POST /api/bos/v1/action-proposals: action,target,payload,precondition,objective_ref,fact_refs,requested_autonomy; POST /decisions/{id}/approval: exact digest/version + outcome | Decision with PASS/WAITING_INPUT/WAITING_APPROVAL/REJECTED, gate trace, expires_at; approver response immutable | actor/service/policy intersection; hard deny cannot queue approval; stale facts/rule→reevaluate; ABSENT create không ép revision giả |
| C-COMMAND | POST /decisions/{id}/commands: idempotency_key,payload_hash,reservation_ref; POST /commands/{id}/cancel: cancel_request_id,expected_generation,reason; internal POST /commands/{id}/claim and /execute | 202 command_id,state,receipt_ref; cancel persists intent/tombstone before cancellation delivery; worker claim includes lease_token/fencing_epoch | execute/cancel permissions riêng + same resolved scope; claim/dispatch guard kiểm cancel atomically; external caller cannot pick arbitrary URL/credential |
| C-RECEIPT | GET /commands/{id}/receipts; internal POST /commands/{id}/reconciliation: readback_ref,conclusion | immutable receipt list + current projection, gồm SUCCEEDED/FAILED/UNKNOWN/RECONCILING/CANCEL_REQUESTED/CANCELLED; 200 even UNKNOWN with reason | pure GET; only authorized reconciler can append; no-effect + cancel intent → CANCELLED/no retry; raw provider error sanitized |
| C-AI | POST /business-work-items/{id}/ai-tasks: AgentSpec/template version,input_refs,output_schema,cap_ref,deadline; POST /ai/callbacks: mapping IDs,event/revision,mapping_version,generation,result_kind,signature_ref; result_kind ∈ {TASK_RESULT, EFFECT_RESULT, USAGE}; command_id nullable cho task/usage, UUID bắt buộc cho effect | task/run refs; callback accepted idempotently, not business success; native IDs có thể null trước ACK | ai.dispatch scope and paid-cap; server validates result_kind/sender/mapping/scope và execution binding; EFFECT_RESULT phải gắn đúng Command, không tự ghi tiền hay business success; late aftercancel recorded+quarantined |
| C-BUDGET | internal POST /budgets/{id}/reservations: action/call,units,basis,currency,upper_bound,key; /reservations/{id}/settle or /release | atomic reservation + available/exposure; UNKNOWN keeps unresolved amount | ledger.reserve/settle separated, scope period match; UNSET/UNPRICED→CAP_UNSET; compare-and-update prevents overspend |
| C-PAYMENT | POST /orders/{id}/payment-reports; internal POST /payments/{id}/reconcile; POST /payments/{id}/refund-requests | REPORTED/PENDING_RECONCILIATION/RECONCILED + source_ref; refund distinct ID | Finance verifies evidence; reports cannot mark money received; issue/refund external effect through C-COMMAND |
| C-PROJECT | POST /orders/{id}/execution-units: acceptance_ref,unit_key,deliverables,scope; POST /projects/{id}/milestone-evidence | stable project_ref per unit_key, state/expected revision | Work/SX/VC scope; retry not newproject; acceptance/QC roles validated; capacity reservation if constrained |
| C-SERVICE | POST /service-cases: party_ref,request/category,evidence; order_ref/project_ref optional; PATCH /cases/{id}: owner/appointment/resolution/policy_ref/warranty_context_ref + expected_revision | versioned case, resolution acceptance,next_action; policy_ref nullable tại intake/WAITING_POLICY; không bắt có Order/Project để tiếp nhận | service scope + all linked refs same authorized company/relationship; warranty adjudication requires verified policy/revision + contextual entitlement evidence; no fake Project/policy; financial commitment routed C-ACTION |
| C-OUTCOME | POST /expectations; internal POST /outcomes: metric_ref/version,cohort/window,sourcefacts,coverage,result | WAITING_OUTCOME/OBSERVED/INCONCLUSIVE/NEEDS_DATA + adjustment_ref | L8 writes observed calculation; AI explanation cannot overwrite; changing metric policy creates version |

Prefix /api/bos/v1 applies to abbreviated public paths; internal endpoints require workload auth on restricted network. No endpoint grants arbitrary SQL, filesystem or proxy HTTP. Existing endpoint binding is an implementation task: map auth, writes, transaction and errors before reuse; same name is not equivalence.

ServiceCase intake luôn có party_ref được CRM scope-validate, nhưng yêu cầu hỗ trợ có thể đến trước khi tìm được Order/Project. order_ref và project_ref độc lập nullable; không sinh Order/Project giả hoặc sao chép dữ liệu khách để vượt schema. policy_ref có thể null khi chưa xác minh: lưu case và trách nhiệm xử lý ở WAITING_POLICY, vẫn cho phép phân loại/hẹn phù hợp quyền. Trước mọi kết luận thuộc/không thuộc bảo hành, thời hạn bảo hành hoặc cam kết xử lý theo bảo hành, bắt buộc có policy_ref + policy_revision đã xác minh và warranty_context_ref có source_type/source_id/source_revision/evidence_ref, chứng minh sản phẩm/đơn/công trình hoặc entitlement thực tế liên quan Party. Context có thể trỏ Order, Project, sản phẩm/installation record hoặc chứng cứ quyền lợi được owner xác nhận; thiếu context giữ WAITING_POLICY/WAITING_INPUT, không suy từ tên case. Case hỗ trợ thông thường không bị ép có context bảo hành; chi/hoàn hay bồi thường luôn đi Finance/C-ACTION riêng.

## 5. Decision, command và lỗi

Rule lifecycle: DRAFT → REVIEWED → PUBLISHED → RETIRED; rollback creates new effective version referencing old content. Hierarchy global → industry package → tenant → company; lower scope may tighten, may relax only explicitly configurable bounds. DENY wins ALLOW; unresolved rule conflict → WAITING_INPUT/UNKNOWN.

Bốn cửa: Pháp (legal/contract constraints authorized by human owner; no legal compliance claim), Lệ (scope/delegation/process/budget), Lý (fresh facts/capacity/hard limits), Tình (soft permitted alternatives). C0 read/propose; C1 authorized automatic action; C2 valid action requiring per-action approval; C3 policy/framework/major exception proposal to Founder. Invalid identity/scope/forbidden action is REJECTED, never escalated into permission to execute.

DecisionRecord stores decision_id, resolved actor/scope/authority_epoch, objective, action/target/account, payload_hash, exact rule_versions, fact revisions or immutable snapshot hash, consent_context, precondition, gate results, autonomy ceiling, approval_ref/digest, reservation_ref, issued_at/expires_at. consent_context ghi REQUIRED với các consent_id/revision/party/purpose/channel/account cụ thể, hoặc NOT_APPLICABLE kèm lý do được evaluator xác nhận; không chỉ một số revision không biết thuộc consent nào. Approval binds same digest/scope/limit/time. Recheck effective membership, company/tenant status, all relevant versions, consent purpose/channel, asset rights, quote/customer acceptance and exposure immediately before effect. A cached PASS is not permanent authority.

Precondition có loại ABSENT (tạo mới: absence_key ổn định theo tài nguyên nghiệp vụ/scope; native resource_id và revision chưa có), MATCH_REVISION (tác động đối tượng đã có: resource_id + revision bắt buộc), READ_ONLY (chỉ query/C0, không phát command có tác dụng). Service kiểm absence và giữ intent/idempotency atomically; provider thiếu conditional-create vẫn cần readback/UNKNOWN, không suy khóa DB ngăn được mọi sửa ngoài. expected_revision ở các API cập nhật là cách rút gọn MATCH_REVISION; tạo campaign/order/project mới dùng ABSENT, không bịa revision1 trước khi đối tượng tồn tại. Reservation/approval có thể null khi action không tiêu tài nguyên/không cần duyệt theo policy; paid action bắt buộc reservation đúng purpose/currency/period.

Receipt ghi phase và stage_result riêng với command_outcome. DURABLE_ACCEPTANCE/DISPATCH_INTENT chỉ RECORDED, command_outcome=null; native/execution/readback IDs chưa có được để null. PROVIDER_ACCEPTED chỉ ACCEPTED, chưa tự là SUCCEEDED. BUSINESS_COMMITTED có bằng chứng giao dịch nội bộ; RECONCILED có readback đủ để xác nhận outcome SUCCEEDED/FAILED/CANCELLED hoặc vẫn UNKNOWN. Receipt liên kết intake_id hoặc command_id phù hợp; không ép receipt tiếp nhận tạo external ID giả. Callback canonical chỉ dùng result_kind ∈ {TASK_RESULT, EFFECT_RESULT, USAGE} theo schema. TASK_RESULT/USAGE không bắt buộc gắn Command; command_id=null khi không có Command (field vẫn có mặt theo envelope schema). EFFECT_RESULT bắt buộc command_id UUID hợp lệ trong cùng scope/mapping và execution binding, tham chiếu receipt hoặc attempt thật. Callback và AI mapping cũng cho native_task_id/native_run_id/workflow_execution_id=null trước ACK, supplement sau ACK; trạng thái phải thể hiện chưa xác nhận đích. Task-only status/usage không được dựng Command giả chỉ để gửi callback.

Command state:

~~~text
RECEIVED -> VALIDATED -> READY -> EXECUTING -> SUCCEEDED
                  \-> WAITING_APPROVAL -> READY
Any pre-effect invalid scope/hard-deny -> REJECTED
Any required missing fact -> WAITING_INPUT -> VALIDATED
Known no-effect error and no cancel intent -> FAILED
Possible effect / lost response -> UNKNOWN -> RECONCILING
RECONCILING + confirmed effect -> SUCCEEDED (compensation separate)
RECONCILING + confirmed no effect + cancel intent -> CANCELLED (no retry)
RECONCILING + confirmed no effect + no cancel intent -> FAILED
RECONCILING + still ambiguous -> MANUAL_REVIEW (hold remains)
Pre-dispatch cancellation + no dispatch intent/in-flight attempt -> CANCELLED
During dispatch cancellation -> CANCEL_REQUESTED -> RECONCILING
FAILED -> VALIDATED -> READY only with no-effect evidence, no cancel tombstone and fresh decision
MANUAL_REVIEW -> RECONCILING when new evidence is available
Any redispatch blocked while cancellation tombstone is present
~~~

Claim is an internal row linked to Command: lease owner/expires_at + monotonically increasing fence; DB transaction and CAS control state/reservation/outbox. Worker before remote call records DISPATCH_INTENT with effect key; old fence cannot append effect/settlement. A fencing DB lock alone cannot stop an already in-flight external call: adapter must respect provider idempotency/conditional mutation when available; otherwise serialize target, preserve intent, reconcile/manual review before redispatch. No exactly-once guarantee beyond provider support.

Cancel intent/tombstone lưu bền theo command_id + generation, gồm cancel_request_id, cancel_requested_at, cancelled_by, reason và identity/scope đã xác thực. Persist intent và CAS command state trước khi gửi best-effort stop sang worker/runtime; replay cùng cancel key/hash trả trạng thái cũ, khác hash là conflict. Claim, tạo DISPATCH_INTENT và mọi retry phải atomically kiểm cancellation tombstone; không chỉ dựa tín hiệu process hoặc trạng thái AI task. Canceled command không được mở lại bằng stale claim, late callback, lease mới, restore replay hoặc đổi idempotency key. Ý định kinh doanh mới sau hủy cần proposal/Decision mới và kiểm unresolved effect identity để tránh lách UNKNOWN.

UNKNOWN is never FAILED by timeout alone. Reconciler checks provider/account/native object/business identity and operation fingerprint. **Confirmed no effect + cancel intent** chuyển RECONCILING → CANCELLED, giải phóng đúng phần hold đã chứng minh chưa dùng và **không retry**. **Confirmed no effect + no cancel intent** có thể chuyển FAILED, chỉ cho phép cùng command/effect key attempt mới sau fresh decision và ghi bằng chứng no-effect; dispatch guard kiểm lại tombstone ngay trước tác dụng. **Confirmed effect** chuyển SUCCEEDED với receipt kể cả cancel đã đến (ghi completed_after_cancel/cancel_ref); settle usage/effect thực một lần, không giả CANCELLED để che tác dụng. **Still uncertain** giữ MANUAL_REVIEW/UNKNOWN exposure và owner, không hoàn hold tự động. Compensation/refund là Command mới có authority và compensates_command_id trỏ lệnh gốc; không sửa/xóa receipt đã xảy ra.

| HTTP | Stable error | Meaning / permitted client action |
|---|---|---|
| 400/422 | INVALID_SCHEMA, INVALID_TRANSITION | correct input; no effect |
| 401 | AUTH_REQUIRED, SOURCE_SIGNATURE_INVALID, CALLBACK_SIGNATURE_INVALID | reauthenticate/rebind; never log secret |
| 403 | SCOPE_DENIED, TENANT_RESTRICTED, ACTION_FORBIDDEN | stop request; no approval bypass |
| 409 | IDEMPOTENCY_CONFLICT, SOURCE_EVENT_CONFLICT, REVISION_CONFLICT, AUTHORITY_CONFLICT, COMMAND_CANCELLED | read canonical state, resolve; don't generate new key to evade cancellation or UNKNOWN |
| 409/412 | DECISION_STALE, CONSENT_REVOKED, APPROVAL_EXPIRED, CAPACITY_CHANGED | reevaluate original intent; newapproval only if required |
| 202 | WAITING_INPUT, WAITING_APPROVAL, EXECUTION_PENDING, UNKNOWN | poll pure receipt/owner workflow; not success |
| 429 | CAP_EXCEEDED, CONCURRENCY_LIMIT | retry after stated window only if noeffect; keep stable key |
| 503 | SOURCE_UNAVAILABLE, CAP_UNSET, PERSISTENCE_UNAVAILABLE | missing required evidence/cap; no effect/ACK until durable |

Errors include code, safe_message, correlation_id, retryable, effect_certainty, receipt_ref and next_action; never token/provider raw payload. 2xx is transport/protocol status; success requires business receipt/readback appropriate to action.

## 6. Luồng nhận khách, consent và nguồn

Website/form and native form/message are peers. Source adapter verifies raw body/nonce/time when supported and binding before inbox commit; provider validation challenges are separate pure protocol flows. A signed source proves provenance, not correctness of every field or conversion.

Google Organic: capture landing URL/referrer/source evidence at first eligible visit, preserve explicit session/source token through internal navigation/form with purpose/retention policy. Server validates token/signature/scope and source trail. Missing referrer, rejected cookies or shared-device ambiguity → UNKNOWN; temporal proximity never proof. Paid click IDs must be original, allowed and tied to source; no synthetic ID for live import.

Consent separates purpose CONTACT, AD_MEASUREMENT, REMARKETING and channel/account constraints. Grant for one purpose is not all purposes. Current effective consent is evaluated at effect, revoked revision invalidates queued actions; accepting inquiry without measurement consent still saves lawful contact under verified applicable policy. Remarketing/customer list requires own evidence/rights/provider support, never assume cross-platform identity.

Handoff persists assignment + outbox atomically. DELIVERED cần bằng chứng ghi vào hộp việc nghiệp vụ hoặc delivery-confirmed từ đích; provider202/send-queued/accepted chỉ là transport milestone, vẫn ASSIGNED. Human authenticated ACK gives accepted, verified actual outbound gives first_response. Missing assignee keeps WAITING_OWNER + accountable fallback/hard deadline. Lost notification ACK is reconciled using notification key; no new Lead or random owner. SLA definition/version, calendar and start/end evidence must be explicit percompany; do not silently inherit conflicting legacy15min vs5min policy.

## 7. AI lifecycle, cap và quyền

AgentSpec: template_id/version, goal, input/output schema, effective scope, allowed tools, autonomy_ceiling, owner, cap_ref, max_calls/retries/reviews, deadline, timeout, review criteria. Paperclip owns ai_task_id/ai_run_id; BOS owns business_work_item_id and cycle refs; native engine owns workflow_execution_id. Persist mapping+dispatch intent before request, supplement native IDs after ACK. Mapping includes generation/version and cancellation tombstone.

Callback authenticated by sender binding/key ID + signature on body digest/timestamp/nonce, max clock skew from policy, expected audience and replay key. Resolve mapping/scope server-side. Callback canonical khai result_kind theo đúng enum schema: TASK_RESULT cho task/run status hoặc output; USAGE cho usage evidence; EFFECT_RESULT cho bằng chứng tác dụng nghiệp vụ. TASK_RESULT/USAGE có thể không liên kết Command, khi đó command_id=null; envelope vẫn gửi field này như schema yêu cầu, không tạo Command giả. EFFECT_RESULT bắt buộc command_id UUID trỏ Command/attempt thật. Backend resolve execution binding từ ai_task_id/ai_run_id + mapping_version + generation và kiểm native execution/target binding/scope; không tin command_id do sender tự khai hoặc coi có UUID là đủ quyền. Sender phải được bind quyền gửi result_kind tương ứng. Không chấp nhận đổi result_kind để ghi business outcome qua TASK_RESULT/USAGE. IDs native có thể chưa có trước ACK, nhưng BOS mapping và dispatch correlation phải tồn tại. Duplicate callback same digest returns previous receipt; conflicting digest 409/quarantine. Lost callback polls pure receipt/runtime readback. Cancelled task is not reopened by late callback; late usage/effect still reconciled and billed once. AI task/run cancellation tombstone tách command cancellation tombstone: hủy task cha phải lưu/forward cancellation intent cho từng Command liên quan, rồi xác minh từng tác dụng; không mặc định task CANCELLED làm Command không còn effect. Command no-effect sau cancel chỉ CANCELLED/no retry; effect-confirmed vẫn SUCCEEDED và compensation là lệnh riêng. Cancelling parent does not pretend an in-flight effect disappeared.

L10 canonical AI cap reserves worst-case priced input/output/tool cost before EACH model call, reviewer/retry/subagent included. Paperclip quota constrains within canonical ledger, not a second total. Price/FX/cap UNSET blocks paid call; fixture remains possible. Timeout usage unknown keeps PENDING_RECONCILIATION, no automatic refund. User/provider direct API routes, shell/browser and adapter egress must be denied or mediated; absence of enforceable gateway is a blocking build gate, not prompt instruction.

Transfer cap owner only after inventory existing holds/usage, shadow reconcile, freeze newdispatch, settle/markUNKNOWN, import balances with exactcutover reference, revoke old paid-egress, resume new ledger. If incomplete keep old bounded pilot and do not open unattended/multi-tenant AI.

## 8. Ngân sách marketing, tiền và đo lường

Marketing cap is 130,000,000 VND for the assigned plan, separate from product/AI budget. This document does not allocate or activate channel budgets. The gross/net/tax/fee basis must be reconciled by Finance before operational use; missing basis is UNVERIFIED, not extraavailable money.

Each cost item has source_line_id, provider/account/company, period, amount/currency, tax/fee inclusion flags, invoice_ref, reservation/commitment_ref, reconciliation state. Exposure = reconciled actual + incurred-not-yet-included cost + remaining unmatched commitments/reservations + UNKNOWN holds + not-yet-included tax/fees + permitted safety buffer. Settlement atomically replaces corresponding reserved portion; never add full actual and full original commitment for the same obligation. Release only confirmed unused/noeffect amount. Native Ads budget/overspend delays require buffer+platform limit where supported; internal cap is not instant platform stop.

Order confirmed value, revenue, net cash and profit have distinct metric definitions. Finance-approved source/policy determines revenue recognition; no accounting/tax claims are inferred from stage. Payment.refund is append-only, distinct ID referencing original payment. Source transfer/import replay keeps transaction identity. Conversion key is (tenant,company,destination account,order_or_payment_id,conversion_type); definition_version là metadata, không thuộc khóa duy nhất để tạo Purchase khác chỉ vì đổi công thức. Nâng định nghĩa giữ native/export identity và mapping cũ, hoặc có kế hoạch migration/retraction/adjustment được cấp quyền riêng; không tự re-import thành Purchase mới. Entity revision alone does not create another Purchase. Adjustment/refund has own stable adjustment_id referencing originalconversion; actual platform support in CHANNELS.

Metric registry:

| Metric version | Numerator / denominator | Coverage and qualification |
|---|---|---|
| CPL_NEW_PARTY_V1 | actual paid media + attributable platform tax/fees / distinct company-scoped newly qualified Party in Need cohort | full priorhistory proves new customer; qualified Need/evidence and paidsource required; count Party once across Needs/channels |
| COST_PER_QUALIFIED_NEED_V1 | same paidcost basis / distinct qualified Need | repeat legitimate needs count; must not label newcustomer acquisition |
| CAC_FULLY_LOADED_V1 | reconciled media+allocated content/OA/acquisition operations / distinct acquired Party | allocation/basis versioned; AI/product cost reported separately unless explicit metricversion includes it |
| NET_CASH_V1 | reconciled receipts minus reconciled refunds during cash window | not Order total or platform conversions |
| CONTRIBUTION_V1 | approved management revenue minus reconciled direct costs and allocation | PARTIAL if any source missing; never label total netprofit |

Denominator0 or required missing spend/history yields null+reason, not 0 or infinity. Separate spend-day view from Need-cohort outcome view, show maturity window/late orders/refunds. Attribution shares per financial object total <=1, residual UNKNOWN; firsttouch, Needsource and latesttouch distinct. Platform reportedconversions displayed separately from verified businessresults.

Expectation contains metric/version, cohort, baseline_ref, hypothesis, guardrails, observation_window, evaluate_after, owner, sample_requirement, stoppingrule. Outcome OBSERVED/WAITING_OUTCOME/INCONCLUSIVE/NEEDS_DATA includes source revisions/coverage and limitations. AdjustmentProposal binds oldruleversion+proposeddiff+test/rollback; publish only through Governance. No self-learning rule overwrite or causal-growth claim from a few jobs.

## 9. JSON minh họa và compatibility

Ví dụ trao đổi request/response và event sạch ở [examples/contract-exchange.json](examples/contract-exchange.json). Đây là transcript thiết kế SYNTHETIC cho intake, action/create, callback task-only và receipt read; không phải log gọi endpoint. Actor/scope do server resolve, không lấy từ request body; schema record minh họa không thay request validator của từng contract.

examples/design-fixtures.json contains only SYNTHETIC labels and fictional scope IDs. Schema and LOCAL_DESIGN_CHECK validate envelope shapes, scope rejection, same-key hash conflict, decision invalidation, UNKNOWN reservation, callback cancellation, budget settlement and metric semantics. They do not prove DB locking, cryptographic callbacks, effective network policy, provider APIs or production acceptance. Those remain NOT_RUN in BACKLOG_ACCEPTANCE.

Builder must implement contract tests against existing API/adapters, multi-session PostgreSQL race/failure recovery, signed callback replay and end-to-end role tests before rollout. Legacy API clients keep adapter compatibility until owners accept retirement; no breaking rename solely for this architecture.
