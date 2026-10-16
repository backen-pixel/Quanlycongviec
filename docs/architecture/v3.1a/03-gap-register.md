# Gap register — V3.1a

Nhiệm vụ `BOS-V31A-ARCH-01`,16/10/2026. Các trạng thái dưới đây mô tả **source và độ phủ kiểm**, không phải kết quả production. Baseline49c4fda6… có source sản phẩm không đổi so fe3f4398…. Chi tiết file:dòng, counts và runtime read ở [W0 inventory](01-inventory-w0.md).

## 1. Cách phân loại

- **P0 / G0:** chặn claim W0 hoàn chỉnh hoặc chặn mở writer M1 nếu chưa có bằng chứng/biện pháp tương ứng.
- **P1 / M1:** phải hoàn thành trong lát cắt nhận khách→phân công→ACK→theo dõi→đối soát trước vận hành.
- **P2 / sau M1:** được hoãn có ranh giới và owner; không tự mở scope.
- `SOURCE_GAP`: thiếu cơ chế trong source đã kiểm; `UNKNOWN`: chưa đủ evidence; `DESIGN_DEFINED`: phương án đã nêu nhưng chưa xây/kiểm runtime; `LOCAL_SOURCE_CHECK`: chỉ logic thuần chạy local.

## 2. Gaps có chủ và tiêu chí đóng

| ID / mức | Tầng / trạng thái | Gap và bằng chứng | Phụ thuộc / cách đóng cần giao | Owner vai trò |
|---|---|---|---|---|
| G01 P0/G0 | L10 UNKNOWN | Deployed SHA từng Render service, DB engine/schema/flags hiện hành chưa đọc. Source49c4fda/fe3f4398 không tự là runtime | Read-only deployment metadata + time/source ref, catalog theo từng primary/backup; không lấy service-role secret hay đăng nhập provider | Operator + DB owner |
| G02 P0/G0 | L3/L10 UNKNOWN + DESIGN_DEFINED | Root738SQL/722forward,68prefix trùng; brief502 không đúng source snapshot. Applied history/catalog live UNKNOWN | Manifest hash đã có; catalog read-only, dependency classification, root baseline evidence. Gate baseline chỉ đóng với blank-DB replay + live catalog match hoặc danh sách drift được owner phân loại | DB owner + builder |
| G03 P0/G0 | L10 REPLAY_FAILURE_OBSERVED | Runner có nhưng baseline--upto chỉ stamp; actual runner scratch DB trắng lỗi42704 thiếu roleanon ở bootstrap, sau synthetic roles lỗi42P01 thiếu crm_leads ở000. [Kết quả thực](checks/blank-db-results.json); source19 còn phụ thuộc base tables ngoài runner | Reuse migrationPlan/migrate.js; curate schema-only baseline/prerequisites và additive M1 plan; explicit local target. Hai lỗi được tái hiện không là baseline PASS; full catalog replay/live comparison chưa đạt | DB builder/reviewer |
| G04 P0/G0 | L3/L6 DESIGN_DEFINED | Hai lõi nghiệp vụ,3stores physical; WorkUnified là view, không canonical engine. Đồng bộ state/title có thể nhân hoặc đóng sai task | ADR chọn một WorkItem façade và writer registry; M1 CRM presales writer, aliased assignments, Workpost adapter. Identity/state contract+shadow diff+single-writer cutover; không thứ tư worktable | CRM/Work owner |
| G05 P0/G0 | L4 DESIGN_DEFINED | Luật ở SQL/functions/backend/workflow/prompt, chưa unified version/authority/precedence | [Rule register](inventory/rule-register.json), owner xác nhận từng scope/override/test; wrapper tham chiếu implementation chuẩn thay duplicate predicate. Snapshot/hash/version và conflict resolution trước publish | Domain owners + Governance |
| G06 P0/G0 | L10 SOURCE_GAP / SECURITY_STOP_ITEM | MCP act-as X-User-Id mcpGateway455, legacy tenantGate bypass, global customer phone/email lookup external100 | Không khai thác live. Workload delegation/backend binding, company-scoped Party lookup và explicit legacy policy; tests A1/A2/B1, field+read+write routes. Catalog ACL/RLS role-only để đóng runtime UNKNOWN | Security/identity + CRM |
| G07 P0/M1 | L1/L2 SOURCE_GAP / SECURITY_STOP_ITEM | Zalo guard489 bỏ lọt missing signature ở nhánh kiểm; ACK200495 trước durable log/handler | Fail-closed source/binding+nonce/time schema; inbox commit trước ACK; polling reconciliation/dedup; fixtures missing/bad signature, auth scope, replay/crash. Không gửi webhook thật để chứng minh | Connector owner + reviewer |
| G08 P0/M1 | L2/L6 SOURCE_GAP | Composite event key/different-hash conflict chưa chuẩn hóa mọi connector; generic external không durable envelope chung | Tenant/company/integration/source_event_id/type+hash atomic, same-key receipt replay; source validation per native protocol; no LLM on ingress | Backend integration |
| G09 P1/M1 | L3/L6 SOURCE_GAP | Handoff assigned/delivered/accepted/first_response chưa đủ semantic evidence chung | Atomic assignment+outbox; delivery-confirmed/inbox-write evidence; human ACK thật; WAITING_OWNER fallback/SLA, stable key; timeout không tự làm khách biến mất | Sales Admin + backend |
| G10 P0/M1 | L4/L5 DESIGN_DEFINED | D1–D7 còn chờ Founder; C2 báo trước danh sách đóng, deadline và block chưa live mechanism | ADR giả định có nhãn; C2notice persisted+delivered evidence/deadline/block/recheck, ngoài allowlist human approve. Bốn cửa kể cả Tình phải DENY/UNKNOWN; hard-deny không hợp thức qua approval | Founder/Governance |
| G11 P0/M1 | L5/L6 SOURCE_GAP | Graphflow UNKNOWN đi tiếp/wait/approve pass-through; cronLeader mất Redis chạy tiếp | Không dùng graph làm canonical gate; DB lease/fence+intent+exactdecision/version/tombstone; UNKNOWN giữ hold, no blind retry, old worker denied | Execution owner |
| G12 P0/M1 | L7/L10 SOURCE_GAP | Direct model calls nhiều path; draft check budget trước call không atomic reservation | Central gateway per-call reserve retry/reviewer/subagent, priced cap and denied bypass; mapping fourIDs/callbackauth/cancel/usageUNKNOWN; cap transfer explicit, không tự dừng pilot | AI platform + Finance |
| G13 P0/M1 | L7 SOURCE_GAP | User memory partition user_id; session JSON company hint không enforced partition; taint/company scope/prompt_hash nhãn AI chưa chung | D6 taintC0, onecompany session+memory key, no external instruction authority, AI_GENERATED/outputprovenance, immutable AgentSpec/prompt/model, boundedreview PASS/FAIL+maxrounds, evalbehaviour. Không đọc memory khách/private để test | AI owner + security |
| G14 P1/M1 | L1 UNKNOWN | Meta app/leadaccess/binding/connector version, Zalo OA quyền/account trạng thái thật chưa verify16/10 | Operator cung cấp existing readonly config metadata, scopes/expiry/capability matrix; unknown giữ disabled/candidate. Không đăng nhập hoặc lấy token thật | Connector/operator |
| G15 P1/M1 | L10 SOURCE_GAP + UNKNOWN | auditLog fail-safe, retention chỉ default code; một số metadata chưa schema redaction; critical transaction/audit binding chưa rõ | Versioned audit/event schema, maskedpayload, immutable refs/hash/retention class, owner và event-loss monitoring. Catalog/actualretention read-only; không dumprawlogs | Platform/DB owner |
| G16 P0/G0 | L10 UNKNOWN | CRM backup parity/restore chưa đạt theo hồ sơ14/10; Paperclip freshness có nhưng chưa restore | Isolated restore+schema/ID/watermark/singlewriter epoch evidence; recovery read/reconcile mode; actualRPO/RTO measured. Không gọi healthOK thànhHA | Operator/DB owner |
| G17 P1/M1 | L8 SOURCE_GAP | Stage/proxy/provider ACK không chứng minh qualified/customer/cash; coverage/missingvalue có thể bị hiểusai | M1 operationalmetrics ownerACK/validNeed/latency/exception/dataquality codecalculated; Finance/order outcome refs tách; no fakeCPL/revenue; missing=null+reason | Reporting + CRM |
| G18 P2/sauM1 | L3/L6 DESIGN_DEFINED | Finance mirror/directpayment writers còn2đường; Order/ServiceCase integrations là rộng, chưa phảiM1 cashautomation | Giữ source/alias identity, receipts và scoped query; financialeffect/C2 phải gate riêng trướcM2; refundappendonly, no doublecount; servicepolicyverifiedbeforeadjudication | Finance/Service |
| G19 P2/sauM1 | L1/L7 UNKNOWN | 33agent cũ không được inventory đầy đủ; Google/TikTok và n8n workflowinventory chưa đủ | Không tự giữ/xóa33agent hoặc tắt workflow. M1 chỉ3connectors được chốt; n8ninternal-only là giảđịnhD2, cầndependencyinventory trướccutover | AI/operator + Founder |
| G20 P1/source trace | L7 UNKNOWN / INPUT_MISSING_CONTINUE_AUTHORIZED | Bản audit gốc9 phát hiện và danh sách10 điểm sửa sơ đồ không nằm trong đầu vào đã đọc; Founder đã xác nhận tiếp tục phần thiết kế độc lập. D6 có thể thiết kế đầy đủ, original finding mapping vẫn UNKNOWN | Hoàn thiện V3.1a theo nguồn có sẵn; provisional findings gắn code evidence, không bịa9 kết luận hoặc báo đóng audit gốc. Bổ sung provenance/mapping khi nguồn được cung cấp; không đòi duyệt lại để viết kiến trúc tổng thể | Source owner + reviewer |

## 3. G0 thiết kế rõ để giao xây

G0 không phải dựng runner mới hoặc gom mọi bảng task vào một bảng ngay. Ba nhánh có thể giao độc lập rồi hội tụ:

1. **Migration/baseline:** reuse runner/planner/ledger, bổ sung verified schema baseline + explicit replay manifest + local-only guard; danh sách drift/catalog phải có nguồn. Baseline stamp không chứng minh DDL đã tồn tại.
2. **Work core:** M1 chọn CRM presales theo tiêu chí Need/owner/evidence/id/history; một façade và writer registry; readWorkUnified giữ compatibility. Dữ liệu sau bán chỉ chuyển theo riêng scope/phase, không bulkconvertcrm_tasks.
3. **Rule registry:** nhập source rule references/version/owner/test vào registry kế hoạch; không duplicate policy trong n8n/Paperclip/prompt. C2notice vàTìnhDENY là semantics đích còn chờFounder, không tự sửa luật runtime.

G0 xây chỉ mở sau read-only source/environment evidence đủ, security-stop review có người nhận, baseline thử cô lập có kết quả ghi thật và policy/authority lựa chọn rõ. Gate có thể vẫn HOLD vì thiếu live catalog; tiếp tục thiết kế không làm criterion này PASS.

## 4. Những gì đã đóng trong phạm vi nguồn, không đóng vận hành

| Câu hỏi | Kết quả có bằng chứng | Giới hạn |
|---|---|---|
| Có runner chưa? | Có: migrate.js + migrationPlan + schema_migrations;8puretestsPASS; hai lỗi replay đầu được tái hiện trên scratch DB riêng | Không chứng minh đã áp live. Replay hiện dừng trước migration đầu; không đạt baseline/live comparison |
| “502” có đúng snapshot hiện tại? | Không:738rootSQL/722forward/68duplicateprefixes,manifesthash xác định | Không suy722fileđãáp; không tự thay lịch sử |
| Có tiêu chí chọn workcore không? | Có: M1 Need-specific CRMwriter vàsinglefaçade tốt hơn bắtProject | Chưa migrate/chuyển writer; ADR vẫnproposed |
| Paperclip cài/chạy chưa? | Healthversioncommit + activeuserunit đọc lại16/10 | Không là chứng minh33agentsafe/AIgateway/M1đạt |
| Có auth/audit/tenant source không? | Có APIkeyscope,tenantchecks,MCPaudit | Không là role-boundimpersonation/crosscompany/retentionlivePASS |

## 5. Điểm dừng đã báo và việc còn độc lập

Các static security candidates G06/G07 đã báo root ngay; không khai thác, không thử dữ liệu chéo công ty hoặc missing-signature trên hệ thật. Cần quyền ghi/login/chi phí mới thì dừng đúng nhánh đó. Chưa thấy D1–D7 bất khả thi về kỹ thuật; code cũ thiếu bất biến là phần cần xây, không phải quyền thay quyết định. Nếu baseline thật thất bại hoặc catalog live chưa có, ghi nguyên lỗi/UNKNOWN trong output root, không “baseline --upto” để lách nghiệm thu.

Mọi ca staging/live trong acceptance matrix giữ NOT_RUN. Pure source/schema/fixture checks có nhãn LOCAL_DESIGN_CHECK/LOCAL_SOURCE_CHECK riêng; baseline probe có hai EXPECTED_FAILURE_OBSERVED và trạng thái replay FAILED_BEFORE_FIRST_MIGRATION_COMPLETED, không gọi PASS baseline. Không đặt ngày hoàn tất M1, ngân sách xây hay RPO/RTO khi chưa có căn cứ.
