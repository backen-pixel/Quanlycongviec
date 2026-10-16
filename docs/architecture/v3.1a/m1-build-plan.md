# V3.1a — G0 và gói xây M1 có giới hạn

Nhiệm vụ `BOS-V31A-ARCH-01`, kế thừa `BOS-ARCH-DESIGN-01`. Ngày lập **16/10/2026, Asia/Ho_Chi_Minh**. Trạng thái: **DESIGN_PLAN**, chưa xây hoặc mở vận hành M1. Mọi D1–D7 trong brief mới là **ASSUMPTION_PENDING_FOUNDER**, không phải quyết định đã được kích hoạt trên runtime.

M1 có một lát hữu hạn: **website/form + Meta Lead Ads + Zalo OA → durable intake → Party/Need trong CRM → phân công → bằng chứng giao việc → người nhận xác nhận → theo dõi phản hồi/quá hạn → đối soát**. Việc cố định không cần AI phải chạy khi Paperclip/runtime/model dừng. Đường sản phẩm do backend Business OS sở hữu; n8n chỉ có thể dùng nội bộ theo giả định D2, không nằm trên critical path.

## 1. Kế thừa và phần chưa mở

- Dùng lại [kiến trúc tổng thể](../overall-design-20261016/ARCHITECTURE.md), authority/role/Command/Receipt/cap contracts, source inventory và mẫu durable inbox/outbox/domain adapter đã có. Sáu miền vẫn ở trong một Business AI OS; scope M1 không xóa đơn/tiền/Project/ServiceCase khỏi kiến trúc.
- [Backlog B00–B12](../overall-design-20261016/BACKLOG_ACCEPTANCE.md) và [nguồn lực/TCO](../overall-design-20261016/RESOURCES.md) là căn cứ cũ có giả định. ROM 66–117 NC của toàn gói cũ **không phải estimate M1 V3.1a**, không cộng thêm rồi gọi là chi phí đã duyệt.
- Google/TikTok và các kênh khác tiếp tục có capability map/lộ trình sau M1. Việc xếp sau không là lệnh dừng tích hợp đang chạy hoặc rút quyền đã cấp. M1 không mở Ads spend, campaign, discount, gửi khách, tạo Order hoặc xác nhận Payment.
- Không dựng CRM/ledger/policy registry/scheduler cạnh tranh. Một business writer theo entity/field/scope; mọi chuyển writer có mapping, reconciliation và fencing.
- Không cài/gỡ/nâng/dừng dịch vụ host, đổi env/binding/webhook hoặc chạy migration trên môi trường dùng chung trong nhiệm vụ thiết kế. DB trắng chỉ local/ephemeral đúng đích, không credential thật hoặc outbound effects. Thử schema không cần model trả phí.

## 2. G0 — inventory, baseline, lõi việc và luật

G0 là cửa chuẩn bị, không là cách diễn giải để mở production. Pha A báo riêng, sau đó tiếp tục Pha B phần độc lập theo brief. Codex/reviewer kiểm chéo inventory và baseline trước khi Founder/người được giao nghiệm thu Pha A; điểm chưa thể kiểm giữ UNKNOWN cùng quyền/nguồn cần có.

| Gói G0 | Đầu vào và việc có giới hạn | Owner / kỹ năng | Đầu ra và tiêu chí đạt | Phụ thuộc / effort hiện tại |
|---|---|---|---|---|
| G0-01 — Manifest W0 chín mục | Source repo/SHA; deploy/schema/config/log/account evidence đã giảm nhạy cảm và được đọc hợp lệ; env chỉ tên | Technical lead + BA; đọc code/SQL, identity/permissions và provenance | Chín mục A1–A9 có ĐÃ CÓ/MỘT PHẦN/CHƯA CÓ/UNKNOWN, source/time và quyền thiếu; code seen tách live/deployed; inventory cũ là đầu vào có thời điểm | Cần đầu mối từng hệ; **UNKNOWN NC** tới khi biết số môi trường/endpoints và quyền đọc |
| G0-02 — Manifest migration và runner | Dùng lại `backend/scripts/migrate.js`, `scripts/lib/migrationPlan.js`, test và CI có sẵn; đọc code trước chạy bất kỳ lệnh nào | Backend/PostgreSQL + QA; DDL dependency/checksum/role/schema diff | Filename+checksum+dependency graph, duplicates/rollback policy; đánh giá dry plan/history/bootstrap của runner. Không tạo tool trùng hoặc suy baseline từ `--upto`/số lớn nhất | G0-01 source manifest; **UNKNOWN NC** tới khi phân loại DDL và drift |
| G0-03 — Baseline DB trắng và so live | Target local/ephemeral có marker/port/role riêng, no outward effects; snapshot catalog/live history chỉ đọc khi đủ quyền | PostgreSQL/DevOps + reviewer độc lập; target safety, catalog canonicalization, roles/RLS/function/view/trigger | Từ empty catalog dựng baseline tái lập; log/hash/manifest/schema fingerprint; so snapshot live ra MATCH hoặc danh sách lệch/UNKNOWN. LOCAL_BASELINE_CHECK riêng; không stamp ledger rồi tuyên bố đã dựng DB | G0-02, local toolchain/read-only source; **UNKNOWN NC**. Root probe thực tế FAILED42704/42P01, ledger0/teardownOK; full curated baseline chưa đạt, live UNKNOWN; [evidence](checks/blank-db-results.json) |
| G0-04 — Chọn lõi việc chuẩn | Đối chiếu cả hai lõi mà W0/audit xác định, không suy từ tên bảng: entity/ID/lifecycle/ownership/API/writer/reader/overlap | Technical lead + BA CRM/Ops; domain mapping và writer cutover | Bảng tiêu chí và đề xuất canonical contract/source, mapping legacy/attachments/history/deadlines/company; migration/cutover/rollback có scope. Nếu ngang nhau thiếu tiêu chí → điểm dừng riêng, giữ nguồn đang chạy | G0-01; thiếu audit gốc phải ghi ảnh hưởng; **UNKNOWN NC** theo số nguồn và mức overlap |
| G0-05 — Register luật rải rác | SQL trigger/function, backend, workflow và prompt agent trong quyền đọc hiện có | Backend/domain owner + QA; rule ownership/test extraction | Mỗi rule có vị trí/nội dung/condition/company/owner/test/version hoặc UNKNOWN; gắn registry target. Prompt không làm policy có thẩm quyền; chưa di chuyển luật thật | G0-01/G0-04; **UNKNOWN NC** tới khi có số rule/conflict |
| G0-06 — Review W0/điểm dừng | Inventory/baseline/diff, original audit9 và diagram10 nếu có | Reviewer/Codex khác phiên người tạo; source/code/schema verification | Báo cáo Pha A, gate đạt/chưa đạt/lý do; gap có owner/quyền cần có. Không gán DESIGN_COMPLETE của brief cũ sang tiêu chí mới | G0-01–05; source thiếu tiếp tục nhánh độc lập; **UNKNOWN NC** |

Con số “502 file migration” trong brief là mốc nguồn cần xác minh, không phải test oracle. W0 phải đếm theo đúng rule file/đường dẫn/SHA và ghi lý do khác; prefix trùng cần filename đầy đủ + checksum. Runner có mode đọc/ghi, nạp env hoặc chọn đích theo cấu hình; không gọi apply/baseline/history bootstrap vào DB live chỉ vì đang làm inventory. Chứng minh role read-only và safe query trước mọi truy vấn catalog thật.

G0 **chưa được báo DONE chỉ vì có gói thiết kế hoặc runner code**. Tiêu chí baseline local/live comparison còn NOT_RUN/UNKNOWN ở nơi chưa có bằng chứng; không ngầm miễn điều kiện bắt buộc. Thiếu một nguồn không làm dừng schema/proposal/fixture độc lập.

## 3. Pha B — các gói thiết kế đủ giao xây

| Gói thiết kế | Dùng lại / delta phải soạn | Phụ thuộc | Điều kiện bàn giao |
|---|---|---|---|
| VD-01 — V3.1a crosswalk và ADR | L1–L10/domain/authority có sẵn; ADR D1–D7 thêm rõ assumption, delta n8n/C2/Tình/G0/AI/MVP | W0 có scope/status; được làm phần chưa phụ thuộc live | Mỗi layer trỏ module/table/endpoint/code state thật hoặc UNKNOWN; không “có trong code” thành “đã vận hành” |
| VD-02 — Contract/model/state | Intake/Fact/Decision/Command/Receipt kế thừa; thêm AgentSpec/CycleRecord D6, Decision hai nhánh C2/bốn gate, M1 data model và migration proposals | B3 được làm song song Pha A; chốt mapping từ G0 trước build | Schema+fixture positive/negative, state consistency, existing table map, error/version/scope/idempotency; planned migration chưa chạy |
| VD-03 — Connector và AI boundary | Framework chung + đúng ba connector, taint/session/memory/reviewer/eval; n8n ngoài product path | D2/D6/D7 assumptions; W0 quyền/capability | Auth/binding/rate/paging/webhook+polling/API pin/owner có hợp đồng; AI C0 cho external content và không egress bypass |
| VD-04 — Acceptance/audit/sơ đồ/kế hoạch | T01–T20 giữ nguồn, T21–T32 giữ breadth, V3A-T01–24 mới; audit9 evidence; dùng lại Mermaid và map sửa diagram10 khi có nguồn | VD-01–03; original audit/diagram source cho phần phụ thuộc | Có diff review, source lineage, thiếu gì nói đúng; audit đúng schema, không bịa findings. Báo Pha B đầy đủ/partial theo tiêu chí thực |

Các gói VD là đầu ra thiết kế hiện tại. Những bước MB dưới đây **chỉ là kế hoạch xây tương lai**, không tự cấp quyền bắt đầu viết hoặc phát hành sản phẩm.

## 4. Thứ tự xây M1 trong nhiệm vụ riêng

| ID / đầu ra hữu hạn | Module / contract tác động | Input và phụ thuộc | Owner / kỹ năng | Effort và cơ sở cần có | Acceptance / rollback dự kiến |
|---|---|---|---|---|---|
| MB-01 — Scope/authority và read façade | L3/L10, CRM Party/Need/Work; C-QUERY/C-FACT | G0 review, tenant/company mapping/binding/field authority; scoped read identity | Backend/PostgreSQL + BA/QA quyền | **UNKNOWN NC**: cần endpoint/field count, legacy bypass và source ownership | T01/T04/T16/T18/T27; thiếu tenant fail closed, lookup phone/email không xuyên company. Rollback adapter/read flag, giữ nguồn chính |
| MB-02 — Durable receiver/framework | L1/L2/L6; C-INGEST/C-RECEIPT | MB-01; one writer, canonical event/key/hash, verified source binding | Backend/integration + QA concurrency | **UNKNOWN NC**: phải đo gap inbox/atomic transaction/legacy event keys | T03/T05/T07/T10/T30 + V3A-T18/T19; durable ACK, same key/hash replay, conflict quarantine. Rollback giữ receiver/buffer, dừng dispatch mới và fence writer |
| MB-03 — Website/form | Website adapter + CRM intake/attribution/consent | MB-02; source bridge hiện có, server binding và source trail có căn cứ | Integration/PHP hoặc site owner + CRM BA | **UNKNOWN NC**: cần source/version compatibility và số form/site | T02/T07/T08/V3A-T01/T04; Organic thiếu evidence UNKNOWN, TEST tách KPI; không bắt native lead qua site. Rollback về writer cũ chỉ sau đối soát IDs/UNKNOWN |
| MB-04 — Meta Lead Ads | Signed webhook, lead retrieval + polling bù | MB-02; Page/form/app/account binding quyền đọc hợp lệ, entitlement chứng minh | Integration + backend/QA provider fixture | **UNKNOWN NC**: retrieval/version/rate/pagination và permission gap chưa chốt | T01/T03/T07/T30/V3A-T18/T19; cùng native lead qua webhook/poll không nhân Need. M1 không mở Ads campaign/spend. Rollback pause adapter dispatch, giữ inbox/native IDs |
| MB-05 — Zalo OA | Authenticated receiver + durable queue, native message/lead mapping và polling bù khi API/capability cho phép | MB-02; OA quyền/config/version, hardening ACK-before-persist/missing-auth gap | Integration/backend + QA auth/fault | **UNKNOWN NC**: cần OA product/API entitlement, recoverable history và signing semantics | T01/T03/T07/T10/T30/V3A-T02/T18/T19; không có recovery API thì ghi gap/giới hạn reconciliation, không hứa polling điều provider không hỗ trợ. Rollback ngắt write/dispatch mới, không ACK giả hoặc tự gửi khách |
| MB-06 — Owner/handoff/SLA | CRM assignment, notification outbox/backend scheduler; C-HANDOFF | MB-01/02; owner active đúng scope, lịch ca/SLA version và fallback owner | CRM backend + BA/UX + QA | **UNKNOWN NC**: recipient routing/notification source proof và lịch thật còn cần chốt | T02/T08; assigned/delivered/accepted/first_response tách, không 202=delivered. No owner có WAITING_OWNER + escalation. Rollback scheduler mới sau handoff owner, giữ timeline/history |
| MB-07 — Rule/Decision/Command M1 | L4–L6, C-ACTION/C-COMMAND/C-RECEIPT/C-BUDGET | MB-01/02, canonical Work/Rule từ G0; D3/D4 policy được người có quyền ban hành trước mở mode thật | Domain/backend lead + QA/security | **UNKNOWN NC**: count rules/commands và notice delivery substrate chưa đủ | T06/T11/T15/T17 + V3A-T08–15; bốn cửa, C1/C2 hai nhánh/C3, lease/fence, UNKNOWN/cancel. Rollback tắt new effects, đối soát và giữ cancel/veto/reservation; không xóa bằng chứng |
| MB-08 — AI hẹp và hành vi | L7/L10, Paperclip/runtime gateway; AgentSpec/CycleRecord/C-AI/C-BUDGET | MB-01/07; D6 boundary/behavior eval, cap và gateway enforcement | AI/backend integration + reviewer độc lập | **UNKNOWN NC**: runtime tools/session/memory/egress và model cap chưa xác minh | V3A-T01–07/T20–22 + T12/T13; external content C0/taint, company-bound memory, PASS/FAIL immutable, max_rounds, provenance. Rollback tắt AI dispatch mới, giữ intake, reconcile late usage/effects |
| MB-09 — Đối soát/coverage/cockpit M1 | L8/L9, C-QUERY/C-FACT/C-OUTCOME | MB-03–06; source events, human ACK/response evidence và definition version | Analytics/backend/frontend + BA | **UNKNOWN NC**: source completeness/metric/UI reuse chưa được đo | T07/T08/T14/T19/T29/V3A-T21; counts/deadline/code tính, coverage/UNKNOWN rõ, không dùng LLM xác nhận thành tích. Rollback projection/view, không sửa source |
| MB-10 — Restore/load/cutover và đóng gate | L2/L6/L10, observer ngoài process và on-call | MB-01–09 phần được mở; staging cô lập, owner/RPO/RTO/retention policy | DevOps/backend + QA fault/restore | **UNKNOWN NC**: tải, giới hạn host và restore actual chưa có | T03/T05/T10/T13/T18/T30/T32 + V3A-T20/T23; old writer fenced, outgoing-off restore, UNKNOWN reconcile, no n8n critical dependency. Rollback freeze new → reconcile → revoke new writer → return old authority có bằng chứng |

MB-03/04/05 có thể làm song song **sau framework/scope ổn định**, bằng adapter/credential riêng và không đụng writer canonical đồng thời. MB-06 không cần chờ MB-08 AI để nhận khách. MB-07/08 phần tác dụng không thể bỏ qua vì gọi là “pilot”; nếu chưa đủ quyền/cap/eval thì AI/notice-mode giữ tắt, intake cố định đủ quyền vẫn làm việc.

## 5. C2-báo trước trong kế hoạch M1

Danh sách dưới đây giữ đúng bốn đề xuất D3; **chưa là runtime allowlist đã duyệt**:

1. Phân công lại lead quá hạn owner ACK sang người trực đủ quyền/active, có expected revision và nguyên nhân; không chọn admin bất kỳ hoặc bỏ mất người chịu trách nhiệm.
2. Đổi thứ tự ưu tiên hàng chờ chăm khách trong giới hạn được ban hành, giữ lịch sử và không đổi sự thật đã quá hạn.
3. Dời nhắc việc **nội bộ** trong biên độ cấu hình; không đổi hạn cam kết với khách hoặc che SLA gốc.
4. Đề xuất lịch khảo sát muộn hơn khi capacity vượt ngưỡng đã công bố; khách vẫn được ghi nhận và có người nhận. Đây chưa là lệnh gửi khách hoặc tự chốt lịch cam kết mới.

Notice window bắt đầu theo delivery proof tới đúng người, có deadline/timezone/policy version, veto endpoint/audit và last-moment recheck. Thiếu delivery/recipient/policy, veto hợp lệ, stale facts/rights, hard deny, cap hết hoặc unknown effect thì không execute theo im lặng. Chiết khấu, Ads budget và gửi khách ở ngoài allowlist M1; C2 khác phải có người duyệt, sai scope/điều cấm bị REJECTED. Không giả absence-of-veto là human approval.

## 6. Nguồn lực, chi phí và cách đổi UNKNOWN thành estimate

| Vai trò cần chỉ định | Kỹ năng / trách nhiệm | Capacity và rate |
|---|---|---|
| Technical lead + domain BA | Ownership/lõi việc/rule register, source/code mapping và trade-off D1–D7 | Tên/capacity **UNSET**, rate **UNPRICED** |
| Backend/PostgreSQL engineer | Baseline dependency/roles/RLS, transaction/inbox/lease/cap, compatibility façade | **UNKNOWN**, không mặc định có nhân sự rảnh |
| Integration/site engineer | Form/Meta/Zalo source auth/version/rate/paging/polling, native IDs/permission proof | **UNKNOWN** theo connector gap |
| QA/Codex reviewer độc lập | Review inventory/baseline/schema, behavior eval/injection/company isolation và fault tests | **UNKNOWN**, người tạo không tự nghiệm thu độc lập phần mình |
| DevOps/operator | Local target safety, môi trường thử, secrets/egress, backup/restore/observer/on-call | **UNKNOWN**, không hứa HA/24×7 |
| CRM owner/owner trực + người có quyền policy | Qualification/SLA/calendar/handoff, notice/veto/approval và domain acceptance | Tên/capacity **UNSET**, không dùng AI làm approver |
| Finance/product owner | Scope/kỳ/cap/basis, charge reconciliation và rate/budget xác minh | Rate/host/model **UNPRICED**, cap thiếu thì không gọi trả phí |

Đơn vị estimate khi đủ căn cứ là khoảng **NC (1 NC=8 giờ công)**, không đổi sang lịch hoặc đặt ngày go-live. Với mỗi MB/G0 cần lấy: số endpoint/field/rule/migration/connector operation; phần code thực reuse được; số permission/fault cases; source capability; năng lực đội; mức drift/backfill và review/restore effort. Sau đó owner chia deliverable nhỏ, ghi khoảng optimistic–conservative và giả định; QA/DevOps đã phân bổ không cộng đôi. Thời gian chờ quyền/provider/Founder là dependency riêng, không bịa thành NC hoặc deadline.

Chi phí = công đã ước × rate được duyệt + host/license/storage/egress/maintenance/support + usage model qua gateway có price/version. Rate/tải chưa rõ giữ UNPRICED/UNKNOWN. Giữ mô hình quỹ sản phẩm tách Marketing 130 triệu; không coi số Marketing là tiền chi xây/runtime, không phân bổ lại hoặc tự tăng giới hạn cũ.

## 7. Gate, rủi ro và điểm dừng

| Gate / rủi ro | Cách xử lý hữu hạn |
|---|---|
| Original audit9/diagram10 chưa có | Ghi SOURCE_PENDING/UNKNOWN và evidence gap; phần AgentSpec/taint/C2 độc lập vẫn soạn. Không tạo chín findings hoặc mười điểm rồi nhận là nguồn gốc |
| Live schema/read-only role chưa có hoặc local DB chưa dựng được | Baseline/live diff chưa đạt được báo rõ, nêu quyền/toolchain cần có. Không dùng service role hoặc môi trường dùng chung để vượt gate |
| Code làm D1–D7 không khả thi, hai lõi chưa đủ tiêu chí chọn | Viết phương án thay thế, tác động và điểm cần Founder quyết định ở open-questions; dừng mục đó, tiếp tục phần độc lập |
| Phát hiện secret lộ/phân quyền đáng ngờ/data leak trong đọc source | Báo vị trí và evidence đã che; không khai thác thử hoặc sửa production; không công khai giá trị secret |
| Nguồn/app/account cần login thật, cần write hoặc chi phí mới | Không tự mở; ghi input/authority/cap cần có cho nhiệm vụ sau. Connector có tên hoặc đã có token không là proof đủ quyền |
| Hệ cũ có nhiều lịch/writer, restore/response không rõ | Inventory owner/execution IDs, giữ intake, freeze đúng phạm vi trong nhiệm vụ chuyển đổi riêng; UNKNOWN không retry mù hoặc tạo key mới |
| W0/thiết kế đủ nhưng runtime tests chưa chạy | Báo DESIGN_READY_FOR_REVIEW hoặc PARTIAL theo tiêu chí; T01–T32/V3A-T01–24 vẫn NOT_RUN. Không nói M1 LIVE_READY/ACCEPTED |

Báo hai mốc: **sau Pha A** và **khi xong Pha B**. Mỗi báo cáo có file/PR, tiêu chí đạt/chưa đạt/lý do, khác biệt code so V3.1, UNKNOWN/quyền thiếu và việc tiếp theo. Nếu cần sửa sau Founder review, cập nhật cùng branch với ngày/mục/lý do và bài học; không merge/deploy từ nhiệm vụ thiết kế.

Ma trận chi tiết và bằng chứng cần có: [acceptance-matrix](acceptance-matrix.md). Cửa giao xây M1 đòi contract/owner/scope/nguồn lực/test plan cụ thể; cửa mở tác dụng thật và pilot có nhiệm vụ/phê duyệt phát hành riêng đúng quyền. Các lựa chọn D1–D7 vẫn giữ nhãn pending đến khi có quyết định có thẩm quyền.
