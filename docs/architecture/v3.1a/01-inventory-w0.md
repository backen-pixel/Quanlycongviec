# W0 — Kiểm kê hiện trạng cho V3.1a

Nhiệm vụ `BOS-V31A-ARCH-01`. Ngày 16/10/2026, Asia/Ho_Chi_Minh. **Pha A có kết quả nguồn; runtime/cloud/schema live còn UNKNOWN. Không phải chứng nhận hệ đang chạy hoặc M1 đã sẵn sàng.**

## 0. Phạm vi, nguồn và mức chắc chắn

- Nhánh riêng `design/v3.1a`; baseline tài liệu **49c4fda6f256ed1517213fb0a1bf831c869919d6**. So `git diff fe3f4398… HEAD -- backend database frontend` không có thay đổi: source sản phẩm vẫn tại **fe3f4398ebf2186596c108a7570f83e3bbef104a**. Các file:dòng dưới đây ở hai SHA này có cùng nội dung source; tài liệu bàn giao cũ khác SHA phải đọc provenance riêng.
- Đã đọc brief mới UTF-8, `AGENTS.md`, docs map, `CURRENT.md`, `DECISIONS.md`, bộ thiết kế trước ở `overall-design-20261016/` và source được chỉ ra. [Inventory rộng trước](../overall-design-20261016/INVENTORY.md) là nguồn kế thừa, không thay lần kiểm W0 này. D1–D7 của brief vẫn **giả định chờ Founder chốt**, không biến thành quyền thay runtime.
- **ĐÃ CÓ (SOURCE_VERIFIED):** source có implementation/tệp cụ thể. **MỘT PHẦN:** một số cơ chế có source, bất biến đích còn thiếu. **CHƯA CÓ:** không thấy capability trong phạm vi source đã tìm, không khẳng định toàn môi trường. **UNKNOWN:** thiếu metadata/quyền/bằng chứng. Mọi nhãn ĐÃ CÓ dưới đây đều ghi loại bằng chứng, không mặc nhiên LIVE.
- Chỉ đọc source, tên biến cấu hình, Git metadata, health và systemd state cục bộ; không đọc `.env`, secret/token/prompt riêng, dữ liệu khách hoặc quyền giá trị thực. Không gọi API nghiệp vụ hoặc đăng nhập tài khoản thật. Một số GET cũ có tác dụng sửa dữ liệu (`commercialDocs.js:90,160`), nên không thử GET live để suy an toàn.
- Kiểm code thuần đã chạy: migration planner 8/8 và check-new-migrations 0 file mới/0 lỗi. Đây là `LOCAL_SOURCE_CHECK`, không là restore, provider integration hoặc T01–T20 PASS. Sau kiểm đọc, đã được giao chạy thêm **hai ca thất bại thực trên DB trắng cô lập**; kết quả ở A2. Không thử shared/live DB; quyền đọc catalog thật do root đối chiếu riêng.

## A1. Phiên bản và triển khai — MỘT PHẦN

| Tài nguyên | Trạng thái / bằng chứng | Kết luận và phần thiếu |
|---|---|---|
| Repo/check-out | ĐÃ CÓ / SOURCE_VERIFIED: `git rev-parse HEAD` =49c4fda6…; branch design/v3.1a; product diff so fe3f4398… rỗng | Không phải deployed SHA. Các checkout khác giữ nguyên |
| Backend/frontend production | UNKNOWN hôm16/10. `CURRENT.md` lưu release14/10 tại f4d7b8d2… và trạng thái hồ sơ sau đó; đây là RECORDED_EVIDENCE | Cần read-only deploy metadata của từng service + build SHA, UTC read timestamp; không suy HEAD/main là runtime |
| DB primary/backup | UNKNOWN schema/config live hôm16/10; source router `backend/src/config/supabaseRouter.js:1,20,55,64` có active target và cờ riêng | Cần catalog/hash/history và metadata active writer bằng role chỉ đọc; không dùng service-role connection chỉ vì có trong source |
| Paperclip local | ĐÃ CÓ / LOCAL_RUNTIME_READ trong khoảng14:20–14:21 VN16/10: `/api/health` statusok, version2026.1005.0, commit467125fafb47a8520856504fecc48d6e32055db1; user unit vpt-paperclip active/running | Chỉ pilot local; không chứng minh connector, credentials sandbox hay M1 end-to-end |
| OpenClaw local | ĐÃ CÓ / systemd user openclaw-gateway active/running; version unit metadata v2026.7.1-2 theo kiểm trước13:34 VN | Không gọi model/runtime tools, không lấy prompt hoặc bộ nhớ; đầy đủ runtime authority UNKNOWN |
| Cấu hình | SOURCE_VERIFIED tên biến trong `backend/src/config/index.js:62–87`, jobs và receiver | Không lấy giá trị env thật hoặc kết luận cờ đã bật. Tên cần inventory: SUPABASE_URL, SUPABASE_DB_URL, SUPABASE_DB_DIRECT_URL, SUPABASE_FAILOVER_ENABLED, SUPABASE_AUTO_FAILOVER, SUPABASE_AUTO_FAILBACK, SUPABASE_REPLICATION_ENABLED, SUPABASE_BACKUP_URL, JWT_SECRET, CRM_ASSIGNMENT_SCHEDULE_DISABLED, CRM_ASSIGNMENT_SCHEDULE_USE_QUEUE, BATCH_QUEUE_DISABLED, LOG_RETENTION_DISABLED; credential chỉ lưu secret_ref ngoài tài liệu |

**Đầu vào để đóng UNKNOWN:** owner cấp view read-only service/deploy metadata, DB catalog và applied history. Không cần/không xin quyền ghi hay đăng nhập provider để hoàn thiện các phần thiết kế độc lập.

## A2. Schema và migration — MỘT PHẦN; baseline live UNKNOWN

Brief ghi “502 file” là snapshot cũ. Đếm lại source tại SHA trên bằng đúng selector của runner:

| Tập | Số đếm xác minh |
|---|---:|
| SQL trực tiếp `database/` | 738 |
| Forward migration mà `migrationPlan.listMigrations` nhận | 722 |
| Root rollback, không thuộc forward replay | 11 |
| Root SQL không đánh số bị runner bỏ qua | 5 |
| Tiền tố số trùng trong forward set | 68 |
| Forward files thuộc các nhóm số trùng | 150 |
| SQL `backend/migrations/`, ngoài selector runner | 29 |
| SQL `backend/supabase/`, ngoài selector runner | 36 |

[Manifest đọc được bằng máy](inventory/migration-manifest.json) chứa filename đầy đủ, SHA256 normalized và selector; không chứa SQL hoặc row data. `catalog_sha256=acaecabf9c8c62d5ff4e500f4dcb157e5591a519301ac6cc49e8278ac6456afe`, tính trên `JSON.stringify(files)` theo thứ tự `listMigrations`; mỗi content normalize CRLF→LF, giữ final newline. Không dùng số lớn nhất hoặc số lượng file làm applied history.

### Runner hiện có phải dùng lại

`backend/package.json:17–19` có `db:status/db:apply/db:baseline`. `backend/scripts/migrate.js:1–24,42,56,116,128,154,187` và `scripts/lib/migrationPlan.js:7,27,35,44,67,88,100` đã có:

- Chọn root numeric SQL, bỏ rollback/unnumbered, sort số rồi tên; resolve bằng filename hoặc báo lỗi khi số trùng.
- Checksum SHA256 normalize newline; so pending/changed/missing; ghi `public.schema_migrations` theo filename+checksum+source.
- `apply` cần `--yes` mới ghi; `baseline --upto` **chỉ ghi nhận file cũ, không chạy SQL dựng schema**. `722_schema_migrations.sql:6,17` ghi rõ source=baseline không biết thời điểm chạy thật.
- Entry point tự nạp `backend/.env` và chọn Management API nếu token/ref sẵn; vì vậy **không chạy status/apply/baseline entrypoint trên môi trường thật** trong inventory. Không coi dry plan là đảm bảo không đọc credential hoặc không gọi mạng.

**Gap baseline quan trọng:** root forward set không tự đủ cho DB trắng. File đầu `000_verify_crm_supabase_project.sql:13` tham chiếu `public.crm_leads` ngay cả khi có WHERE EXISTS. File kế `19_crm_sales.sql:39,42,60` tham chiếu customers/users/projects. Các base tables lại có ở `backend/supabase/01_migration.sql:10–17`, ngoài selector runner. Lỗi đầu vào đã được tái hiện trên scratch DB như bảng sau; dependency của file19 là kết luận đọc source, chưa chạy file đó.

### Kết quả thử DB trắng thực, có giới hạn

[Harness](checks/probe-blank-db.cjs) và [kết quả](checks/blank-db-results.json), chạy16/10/2026 **14:35:15–14:35:18 VN** trên PostgreSQL18.1. Harness gọi actual `main/apply/readApplied/ensureTable` của runner source (raw SHA256 `706c18b01692fc323d9b07a38d6f82c755fc3bfcc2e4ae00945e59248d5ddf28`); chỉ inject transport tới Unix socket riêng, dotenv no-op, synthetic argv/identity và cấm fetch. Đây không là kiểm mọi mode pg/api hoặc kết nối production của runner.

| Ca cục bộ | Kết quả thực | Nghĩa |
|---|---|---|
| DB vanilla trắng, actual runner apply first000 `--yes` | PostgreSQL **42704: role "anon" does not exist** khi bootstrap722 | Prerequisites Supabase roles chưa được runner chuẩn bị trong DB trắng |
| Chỉ thêm synthetic NOLOGIN roles anon/authenticated/service_role trên DB tạm rồi actual runner apply first000 | PostgreSQL **42P01: relation "public.crm_leads" does not exist** | Bootstrap ledger chạy được nhưng file đầu cần bảng có sẵn; chưa replay được migration đầu |
| Applied ledger sau hai ca | **0 hàng** | Không ghi nhận migration thành công giả |

PGDATA/socket tạo mới dưới `/tmp/bos-v31a-blank-<unique>`, uid1000, mode0700, `listen_addresses=''`, không TCP; đã kiểm SHOW config. Cuối cùng `pg_ctl` stop scratch thành công rồi boundary/realpath/owner-check và xóa scratch; `started/stopped/removed=true`. Không dùng data/backup/config/secret Paperclip. **`baseline_replay_status=FAILED_BEFORE_FIRST_MIGRATION_COMPLETED`; full722 replay NOT_RUN, live schema comparison UNKNOWN, restore NOT_RUN.** Hai lỗi được tái hiện không đóng tiêu chí dựng baseline thành công/đối chiếu live.

Các file seed/backfill/repair/delete theo công ty/người và SQL không đánh số không được blind replay. `backend/src/helpers/migrations.js:78–83` còn có nhánh ALTER TABLE nếu được gọi; call path/deployed use UNKNOWN. Cần lập inventory DDL ngoài runner, không dựa tên helper là “migration tự chạy” để kết luận đã xảy ra live.

### Baseline đề xuất, không thực hiện live

1. Chụp catalog schema live bằng role chỉ đọc: tables/columns/types/defaults/constraints/indexes/RLS/policies/grants/functions/triggers/extensions + `schema_migrations`, source refs và server major version; **không row PII**.
2. Lập baseline schema DDL có provenance và manifest normalized. Tách prerequisites Supabase/auth/roles/extensions khỏi domain DDL; tách data migrations/seed khỏi cấu trúc.
3. Dùng **runner và planner hiện có**, thêm chế độ manifest phụ thuộc/explicit local target và guard cấm shared target cho harness. Baseline stamp chỉ sau đối chiếu schema; không chọn `--upto` để giả mọi file đã áp.
4. Replay baseline curated trên PGDATA/port/user cô lập; apply additive M1 migrations; chụp catalog, so với catalog live theo version-aware normalization; báo diff đầy đủ, không chỉ count.
5. Primary và backup có ledger/parity evidence riêng; không copy ledger từ primary sang backup khi chưa chứng minh schema tương ứng. Khóa phát hành tới khi lệch được phân loại và có kế hoạch sửa.

**Tool availability:** WSL có embedded PostgreSQL18.1 ở `/home/tudonghoa/business-ai-os-paperclip-pilot-20261012/runtime/node_modules/@embedded-postgres/linux-x64/native/bin/{initdb,pg_ctl,postgres}`, owner tudonghoa:tudonghoa mode755; `postgres --version` chỉ in version. Không có psql/pg_dump/docker trong PATH đã kiểm, bindir chỉ ba binary. Thử ở trên dùng binary sẵn và installed pg client với data/socket hoàn toàn mới; không startup/chạm data directory dịch vụ Paperclip. Không coi PostgreSQL18.1 bằng production version khi live chưa kiểm.

## A3. Hai lõi việc — MỘT PHẦN, có tiêu chí chọn

“Hai lõi” là hai luồng nghiệp vụ/giao diện, **ít nhất ba store vật lý**, không chỉ hai bảng:

| Lõi/store | Writer và endpoint | Reader / trạng thái | Chồng lấn và trách nhiệm |
|---|---|---|---|
| CRM stage task `crm_tasks` | `crm/routes/crmTasks.js:825`, `helpers/crmLeadTaskMutations.js:416`; `/api/crm/leads/:leadId/tasks/:taskId`; generation templates | Lead/Deal detail và `unified_tasks_v`; statuses pending/in_progress/completed/cancelled; SQL28:5 | Bám Lead/Deal, pipeline/evidence gates; có cả task SX/VC (production stage), nên không phân loại chỉ theo tên bảng |
| General/project `tasks` | `/api/tasks` create/update/status `routes/tasks.js:215,227,237`; project/work helpers | Work/Project/SX/VC views; SQL base task_status todo/in_progress/review/done/blocked; `backend/supabase/01_migration.sql:7,15` | Bám Project, metadata/workshop_area; semantics done khác completed; không bulk đổi trạng thái theo title |
| CRM assignment `crm_assignments` | `/api/crm/assignments` create/update/move `crmAssignments.js:1260,1301,1466`; scheduler | Assignment Kanban, planner, `unified_tasks_v`; SQL191:36 | Company-scoped standalone assignment có thể liên kết CRM task bằng SQL286, nhiều assignee/artifact sync; không tạo task mới cho cùng business intent |
| Work Unified façade/view | `/api/work-tasks`, view `unified_tasks_v` SQL270/594/715; `workTasks.js:1138,2843` | Ghép source/source_id/unified_id; write trả về bảng gốc | **Có query/API chung, chưa phải một durable work engine sở hữu hết**. Nhắc việc còn có đường gán ngược assignee; read/write phải phân contract |

**Đề xuất G0:** chọn **một cổng WorkItem chuẩn** với ID/source/writer registry và một đường mutation/acceptance có scope; **M1 nhận khách dùng CRM presales làm writer chuẩn**, tận dụng Lead owner + crm_tasks và assignment được đăng ký alias khi thực sự cùng việc. Work Unified dùng như read façade và compatibility adapter; không tạo WorkItem business table thứ tư hoặc một backlog AI song song. Các task sau bán chưa migrate giữ writer Work/SX/VC trong registry; chúng không thành CRM task chỉ vì có cùng tên. Đích một façade không đồng nghĩa ép mọi miền vào cùng schema vật lý ngay M1.

Tiêu chí chọn thay vì tuyên bố hai lõi ngang nhau: M1 có Need/owner/assignment/evidence đúng nghiệp vụ; bảo toàn ID/history/attachment; company scope rõ; replays không nhân task; state adapter tương thích; giảm writer; không bắt Project cho lead mới. CRM đáp ứng liên kết Need sẵn, general tasks lại đang require Project ở base schema. Vì vậy có căn cứ chọn M1, không cần dừng vì không có tiêu chí. ADR lõi chuẩn vẫn PROPOSED theo D5.

Chuyển writer dự kiến: inventory source IDs+relationships → classify duplicates bằng evidence → shadow read diff → alias map immutable → freeze writes theo lát cắt → watermark/unknown/outstanding assignments → một writer/cổng được bật → reconcile → retire legacy route có hạn. Rollback route không xóa canonical history/receipts; không chạy script đồng bộ dữ liệu thật trong thiết kế.

## A4. Luật rải rác — MỘT PHẦN; registry phải xây

[Rule register đọc được bằng máy](inventory/rule-register.json) là danh mục **nguồn luật hiện có**, không phải registry đã published. Mỗi mục có vị trí/dòng, nội dung, company scope, test source/coverage và cách đăng ký đích. Bảng rút gọn:

| Nhóm | Nguồn luật đã thấy | Scope / caveat |
|---|---|---|
| Tenant/company | SQL392:62,87; middleware tenantGate:47–75 | DB trigger kiểm company có tenant khi set; không tự kiểm membership actor cho mọi bảng; legacy bypass phải xử lý |
| Intake/binding/dedup | SQL701/702; externalLeadTracking:10,39; SQL717:19,50 | Company từ binding, source snapshot immutable; generic root path chưa đủ dedup BOS envelope |
| Qualification | SQL712:7,24,69,118; qualification:28 | contact_usable + need_in_scope + area_in_service + evidence; request key/revision có constraint |
| Consent/feedback | website receipt SQL20261014005710:45,104; outbox SQL20261014005713:88,220 | Mục đích đo quảng cáo cụ thể; không thay consent registry mọi kênh |
| Stage/completion | crmTaskStageAdvanceGate:75,123,285; crmTaskCompletionEvidence:95,141 | Gate chặn theo required task/evidence, có terminal/backward/SX exceptions; phải giữ scope và nguồn test khi register |
| Deadline | moduleDeadlinePolicy:1,73,92; companyDeadlineClock; crmPipelineSla | Logic dùng chung có company overrides; comment có thể lịch sử, nội dung hàm + test mới quyết định |
| Finance | SQL423:57,61; accountingDealDetail:431,490; approvals:275,399 | Khoản thu dương, planned/received/derived mirror; không tự biến mirror thành nguồn cash thứ hai |
| Graph/routing | flowRuntime:26,426–450 | UNKNOWN vẫn đi tiếp và wait/approve pass-through; không dùng làm gate policy chuẩn |
| AI prompt | aiConversation:32,53–89,624–651; memory helper/schema | “Phải dùng tool” trong prompt, tool_choice=auto có nhánh trả text trực tiếp; max4 vòng tool không thay reviewer max_rounds hoặc taint gate |
| Job/audit retention | cronLeader:17–38; logRetentionCron:156–157; notificationRetentionCron:42 | Redis lỗi chạy tiếp; retention mặc định code không là retention runtime đã xác minh |

Đăng ký đích: `rule_id, source_ref/hash, immutable_version, owner, tenant/company_scope, predicate, gate, severity/hardness, inputs, effective_from/until, precedence, tests/evidence, exception_policy, change_authority`. Bước đầu wrapper tham chiếu rule implementation hiện hữu, không duplicate predicate giữa SQL/backend/prompt. Xung đột phải ghi và có authority quyết định; không tự sửa source cho khớp tài liệu.

## A5. Tenant, company và quyền — MỘT PHẦN; security stop-items chỉ ghi nhận

- `tenantGate.js:47–75`: platform/system hoặc thiếu tenant có legacy bypass; requireTenant/route checks có thể bổ sung riêng. `392_tenant_isolation_db.sql:62–109` xác thực relation company→tenant, không đủ chứng minh mọi route cách ly.
- `routes/mcp.js:187,193` dùng API key auth; `middleware/apiKeyAuth.js:227–277` resolve credential, company list/tenant companies; `mcpGateway.js:383,415` có write capability crm_write riêng. **Có MCP auth và scope code**, không phải anonymous unrestricted tool.
- `mcpGateway.js:455–486` chọn act-as từ X-User-Id hoặc key default; kiểm active user và company mismatch trừ system admin. Chưa thấy binding đủ chứng minh caller được phép impersonate mọi user được chọn: **static candidate auth gap**, không test khai thác/live. Cần identity allowlist/delegation backend-bound và role fixtures trước mở M1.
- `external.js:100–123` tìm customer bằng phone/email không company filter trong helper; đây là candidate ownership leak/write conflict trên source, không tuyên bố đã đọc chéo khách thật. `customers` route và native SQL702 có các scope checks khác, phải kiểm đúng call path.
- Backend có service-role client (`config/index.js:65–75` chỉ tên biến đã đọc), DB service role có thể bypass RLS. RLS enabled/migration có trong repo không chứng minh grants/schema thực đã áp. Cần role-readonly catalog + tests A/A1/A2 và B/B1; không dùng quyền platform để tự kết luận cách ly người dùng thường.

Những mục này đã báo root ngay như điểm dừng theo mục8 brief: giữ read-only, không gửi yêu cầu giả/khai thác và không sửa production; tiếp tục phần thiết kế độc lập.

## A6. Intake và connectors — MỘT PHẦN

| Connector MVP theo D7 | Đã có source | Thiếu / trạng thái tài khoản thật |
|---|---|---|
| Website/form | external API `external.js:580`; attribution/receipt SQL717 và20261014005710; WordPress bridge repo; source record14/10 TEST form có receipt | General event dedup, scoped customer lookup, handoff accepted/first_response là phần M1. Plugin/provider quyền và deployed version16/10 UNKNOWN; không tạo TEST/lead thật |
| Meta Lead Ads | Signed durable receiver `facebook.js:3560`, helperfacebookPageInbox; SQL701 inbox/702 binding+transaction; native graph ID validation | Page/app publication/lead access/binding enabled thật UNKNOWN hôm16/10. Hồ sơ14/10 PR127 draft, không thay trạng thái hiện tại; không đăng nhập hoặc đổi App |
| Zalo OA | OA account/contact/message/webhook/refresh code `zalo.js:464–520`, tokens scope qua account và helper | Guard chỉ reject `!valid && signatureHeader` tại489, missing header không bị chặn ở guard này; ACK200 tại495 trước log/handler persist. **Không đáp ứng receiver durable/fail-closed chỉ từ code này**. Quyền OA thật UNKNOWN; không gọi webhook thật |

Không giả định n8n đang ở product path hoặc đã gỡ. Source Zalo có `/integrations/n8n` và webhook URLs (`zalo.js:335–456,719`): D2 cần adapter replacement/cutover có inventory; không phải bất khả thi và không là lệnh tắt workflow. Google/TikTok có source ngoài MVP; giữ nguyên, không tự đóng integration khác.

## A7. Audit — MỘT PHẦN

- `auditLog.js:14–40` ghi audit_log: actor/company/module/entity/action/before/after/metadata/IP/user_agent; fail-safe không throw. `mcpAudit.js:69–117` ghi allow/deny/error reason_code+trace_id, allowlist args. `tenantAudit.js:15` ghi tenant_access_audit. Task history SQL270 giữ native source/source_id; inbox/receipt/outbox thêm chứng cứ chuyên miền.
- Không có evidence mọi critical command/audit ghi cùng transaction hoặc fail-closed khi audit mất. Một số metadata nhận object thẳng; cần PII schema/redaction/retention phân loại, không dump log raw ra PR.
- Source `logRetentionCron.js:156–157` có mặc định webhook logs14 ngày và user_activity_log180 ngày; `notificationRetentionCron.js:42` mặc định60 ngày. Các số này là **code defaults**, env/runtime value và retention của audit_log/tenant_access_audit/receipts UNKNOWN; không tự đặt nghĩa vụ pháp lý.

## A8. AI stack — MỘT PHẦN; D6 chưa được chứng minh

- Paperclip/OpenClaw có pilot health/service metadata; **số lượng33 agent, active status, prompt/tool grants và memory riêng từng agent UNKNOWN**. Không đọc agent private prompts hoặc tự resume/cài/gỡ agent để kiểm.
- Đã thấy nhiều direct model call path: aiDeadlineReminder:92, assistant:823, aiBotSender:1025, aiUserMemory:140, aiConversation:625, aiStaffFormFill:318, aiReplyDraft/provider:36; guide/copilotkit:330,349,1602; flowActionRunner:20. Source này không đi qua một canonical cap/gateway rõ ràng; deployed usage/flags UNKNOWN. Không gọi provider để kiểm.
- `aiConversation.js:32,624` max4 tool iterations, `tool_choice=auto`, khi không toolcalls có thể trả content trực tiếp tại651. Vì vậy prompt “phải dùng công cụ” không phải enforcement. Không thấy nhãn/schema `taint,company_scope,AI_GENERATED,prompt_hash,max_rounds` như D6 trên các path tìm; không suy không có trong mọi plugin.
- Memory `aiUserMemory.js:203–224,311–329` delete/insert/load theo user_id; unique index SQL236:25 theo user/source/fact, không company. Session_context SQL388:3 là JSON chứa company_id; điều đó không bằng partition/key bắt buộc một company. D6 cần scope-bound namespace/taint/prompt+model version/memory gate và tests chuyển company; không claim actual leakage khi chưa probe.
- AI draft đã có anonymize/policy/events; service:52–65 kiểm usedToday trước call, chưa atomic reservation. Reviewer PASS/FAIL + max_rounds và independent eval chưa thấy hệ thống chung; tool-loop4 không thay reviewer contract. Số liệu nghiệp vụ phải do code tính; AI explanation không thành canonical Fact.
- Bản audit gốc “9 phát hiện” và danh sách “10 điểm” sửa sơ đồ chưa có trong đầu vào đã đọc. Inventory này cung cấp bằng chứng code để thiết kế D6, không tự thay nội dung hoặc trạng thái từng finding gốc. Original finding mapping giữ UNKNOWN; xem G20.

## A9. Lịch, worker, backup, monitoring — MỘT PHẦN

| Luồng | Chủ/lịch đã thấy | Bằng chứng và gap |
|---|---|---|
| CRM assignments | backend job `crmAssignmentScheduleRunner.js:12,64`; batch queue hoặc direct | Flag names/code có sẵn; schedule enabled runtime UNKNOWN; không thêm lịch Paperclip trùng |
| Generic cron/worker | `server.js:1333–1452`, cronLeader:17–38, batchQueue:382 | Redis lỗi/mất có fallback chạy tiếp; chưa fence bền vững cho side effect multi-instance |
| Native intake/feedback | PostgreSQL inbox/outbox lease + worker; primary pinning `supabaseRouter.js:20` | Tận dụng nhưng scope/replay/UNKNOWN khác nhau theo module; không coi tất cả có idempotency chung |
| Pilot AI control | user units vpt-controller.timer/vpt-watchdog.timer active/waiting tại14:20–14:21 VN | Giữ hiện hữu; built-in controller chỉ health/budget-review/fixture-repair theo source đã đọc trước, không chứng minh autonomous sales pipeline |
| Paperclip backup | Health latest `paperclip-20261016-063408.sql.gz`, mtime16/10 06:34:09Z (13:34VN), size334059bytes, statusok | File freshness **không** là restore test. Không restore hoặc tải backup chứa data vào repo |
| CRM backup | RECORDED_EVIDENCE14/10: queue/failed tăng, PGRST116 project_substage_status, backup thiếu receipt/qualification/outbox theo CURRENT | Latest backup age/last restore/schema parity hiện tại UNKNOWN. Không hứa RPO/RTO/HA, không đổi primary target |
| Quan sát | Code health, queue/cap/latency logs và watchdog local | Observability ngoài process business có một phần pilot; delivery of alerts/owner/SLO và replay afterrestore cần nghiệm thu riêng |

## Kết luận Pha A và điều kiện chuyển tiếp

Đã điền đủ chín chủ đề với source evidence và UNKNOWN có cách đóng. **Không đủ căn cứ gọi W0 live/schema đã hoàn tất.** Những thiếu sót không ngăn soạn V3.1a độc lập, nhưng chặn gate xây/vận hành và tiêu chí baseline/schema-live nếu còn thiếu catalog. [Gap register](03-gap-register.md) tách blocker G0, M1 và capability mở rộng.

Đã xác định có thể dùng lại runner, một cổng work chuẩn cho M1 và danh mục luật nguồn. Không chạy migration/shared DB, đổi env/service/job, gửi khách, tạo lead/đơn/campaign, gọi LLM hoặc merge/deploy. Các finding phân quyền/signature được ghi static và báo ngay; không khai thác để “chứng minh” bằng dữ liệu thật.
