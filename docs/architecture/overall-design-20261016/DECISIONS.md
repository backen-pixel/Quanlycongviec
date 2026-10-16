# Hồ sơ quyết định thiết kế BOS-ARCH-DESIGN-01

- Ngày: **16/10/2026 — Asia/Ho_Chi_Minh**. Baseline repo: `fe3f4398ebf2186596c108a7570f83e3bbef104a`.
- Các ADR cục bộ dưới đây là **PROPOSED** để review/giao xây; không phải `APPROVED V3.2`, không mở setup/migration/merge/deploy hoặc quyền runtime. Không cấp số hoặc sửa trạng thái ADR Accepted trong `docs/adr`.
- Kế thừa [ADR-0016](../../adr/0016-incremental-business-ai-os-v1-1.md), [0017](../../adr/0017-presales-postsales-work-ownership.md), [0018](../../adr/0018-versioned-commercial-handoff.md), [0019](../../adr/0019-governed-commands-data-and-agents.md) trong phạm vi định hướng; code/SQL và bằng chứng vận hành vẫn cần đối chiếu riêng.

## P01 — Modular backend, process thực thi có ranh giới

**Ngữ cảnh.** Repo đã có Express backend, React frontend, Supabase/PostgreSQL và adapter nghiệp vụ; các tầng L1–L10 là trách nhiệm logic. `server.js` vẫn start nhiều timer/jobs trong process web. Dựng mười microservice/DB ngay tạo thêm giao dịch phân tán và chi phí chưa có số tải chứng minh.

**Phương án.** (A) Mười service/DB theo tầng; (B) monolith giữ mọi timer/side effect trong web; (C) modular backend + codebase chung, web và durable worker có thể chạy process riêng sau gate xây dựng.

**Đề xuất C.** Tách domain/application/infrastructure contracts trong repo hiện có; transactional inbox/outbox/Decision/Command/ledger cùng nguồn ghi chuẩn PostgreSQL. Web xác thực/nhận inbox và đọc UI; worker claim/lease/fencing rồi thực thi adapter. Worker là vai trò thực thi hữu hạn, không xây workflow engine tổng quát. Redis hiện hữu có thể dùng cache/notify/rate-limit nhưng không làm nguồn chuẩn receipt/cap hoặc điều kiện duy nhất ngăn ghi trùng.

**Hệ quả.** Local/dev dùng fixture không secret thật; staging dự kiến tách DB/credential/account thử, outbound deny mặc định; production chỉ thay từng adapter/writer sau readback/fencing/rollback. Không sao credential hay PII production sang môi trường thử. Một worker chết không mất inbox; web còn nhận khách khi DB còn ghi được; DB không bền vững thì trả retryable failure, không ACK giả. Process worker riêng chỉ đề xuất, chưa tạo hạ tầng. Không cam kết HA/RPO/RTO nếu chưa rehearsal.

**Điều kiện đổi.** Tách service thêm khi có load/SLO, quyền dữ liệu, chu kỳ release hoặc yêu cầu cô lập cụ thể; có ADR và dữ liệu đo. Dùng topology/nguồn lực ở ARCHITECTURE/BACKLOG, không tự đặt giá hosting.

**Kiểm tương lai.** Restart worker sau inbox commit, lease expire/stale writer, outbox atomicity, scale2/mất Redis, receiver không chờ AI, backup restore và failover fencing.

## P02 — n8n tùy chọn, backend/worker là xương sống pilot

**Ngữ cảnh và hiện trạng có bằng chứng.** `backend/src/helpers/zaloN8nWebhook.js` tạo payload/callback URL và HTTP POST (timeout8s), `routes/zalo.js` có callback xác thực; đó là mã kết nối. Không chứng minh n8n đã cài, đang chạy, workflow đã deploy hoặc có đủ credential. Không có lệnh gỡ. `jobs/zaloOaTokenRefresh.js` và `server.js` chứng minh backend có lịch/timer; `helpers/cronLeader.js` hiện cho phép chạy khi Redis thiếu/lỗi, nên không được tái dùng nguyên trạng làm fencing cho side effect quan trọng. POST helper thành công chỉ là HTTP accept, không là business completion hoặc durable delivery.

### So sánh trách nhiệm và nơi công việc chuyển tới

| Chức năng | A — backend/worker hiện có, bổ sung hữu hạn (**khuyến nghị pilot**) | B — backend/worker + n8n tùy chọn | Owner và hạn chế chung |
|---|---|---|---|
| Lịch / timezone / missed run | Reuse job registry hiện hữu, chuẩn hóa timezone/kỳ; durable scheduled job record + due scan/lease; chỉ một owner cho mỗi schedule. Timer chỉ đánh thức, không là sổ lịch | n8n Schedule Trigger cho workflow ngoại vi; publish/timezone/version, map `schedule_id/workflow_execution_id`. Backend vẫn giữ command business và catch-up theo watermark | Platform maintainer duy trì registry; không để backend+n8n cùng schedule một hành động. Tài liệu Schedule Trigger có timezone/workflow activation [N3] |
| Kết nối / mapping | Reuse Facebook/website/Zalo/Google CSV adapter; bổ sung từng capability đã kiểm quyền. Công viết mapping/test nằm ở backend | n8n node/HTTP có thể giảm viết glue cho connector mới; outbound business vẫn qua backend command, callback qua inbox. Node có sẵn không chứng minh API/account hỗ trợ | Integration engineer pin endpoint/node/version và schema; không lách backend bằng credential Ads trong workflow |
| Retry / backoff | Durable attempt + due_at/jitter/max attempts + lease/fencing và error taxonomy. Pure read retry được; write UNKNOWN chỉ reconcile | n8n có retry/error workflow tùy node/plan; tắt blind retry đối với business write, tái dùng cùng command/idempotency key. Backend authority giữ trạng thái và retry budget | Execution owner ở backend; n8n chịu transport attempt, không quyết định một UNKNOWN đã thất bại |
| Đối soát / duplicate | Native readback/watermark/reconciliation jobs do domain adapter; immutable receipt/audit và exception queue | n8n có thể gọi job/cung cấp report, không tự match hoặc clear UNKNOWN bằng logic riêng. Kết quả reconciliation nhận qua contract backend | Finance/CRM xác nhận nghiệp vụ; platform quản lý transport. Cùng khóa khác payload là conflict, không overwrite |
| Quan sát / lỗi / SLA | Heartbeat worker/receiver/DB, backlog age, lease staleness, UNKNOWN, callback lag, cap holds và alert ngoài process web. UI exception từ DB | Thêm execution health/error workflow + workflow ID/correlation; log n8n hỗ trợ debug, không thay business audit. Queue mode thêm main/worker và hạ tầng [N4] | Platform maintainer và business owner exception; redaction, retention, alert route trong backlog; không dựa n8n UI là dashboard duy nhất |
| Sửa / review / rollback | Code review/fixture/CI theo repo; feature flag từng adapter; rollback giữ inbox/receipt/guard, không rollback bằng xóa dữ liệu | Workflow export/version/review và node upgrades ngoài code; rollback workflow không tự undo API đã gửi. Một inventory owner cho workflow/credential/schedule | Cần năng lực bảo trì cả backend lẫn workflow nếu B; chưa có tên người/SLA xác nhận |
| Chi phí / năng lực | Không thêm license workflow engine; vẫn tốn backend engineer, DB/worker, log và bảo trì. Chi phí thật UNPRICED tới khi đo capacity | Có thể giảm công glue nhưng thêm hosting/license, execution quota, backup/key, upgrade/node compatibility và người vận hành. Không mặc định mọi automation rẻ hơn | Xem mô hình chi phí dưới; không lấy130 triệu marketing bù chi phí sản phẩm |

**Đề xuất.** Chọn **A cho lát cắt Marketing–Sales đầu tiên**, dùng pattern receiver/inbox/CRM/worker/receipt có sẵn và bổ sung chỗ thiếu; giữ n8n là adapter ngoại vi tùy chọn, không cài/gỡ/chuyển runtime trong nhiệm vụ này. Giữ inventory tương thích các callback hiện hữu; không gỡ helper vì quyết định kiến trúc đích. Không xây visual designer hay workflow engine mới thay n8n.

**Điều kiện chọn B.** Có ít nhất một workflow cụ thể mà node/visual editing giảm tổng công; người bảo trì được chỉ định; fixture chứng minh callback duplicate/muộn/mất, version restore và no-credential-bypass; license scope/plan phù hợp; measured execution volume/chi phí chấp nhận. Workflow đó phải có owner và có thể tắt độc lập; core intake/CRM không phụ thuộc n8n còn sống. Nếu cả A/B chưa đáp ứng unknown/reconcile/lease thì chưa mở writes.

### Giấy phép hiện hành và giá có nguồn

Đọc nguồn chính thức ngày **16/10/2026**; mô tả phạm vi để chọn công cụ, chưa xác nhận một license cụ thể của doanh nghiệp và không phải quyết định mua:

- [N1 — LICENSE chính thức](https://github.com/n8n-io/n8n/blob/master/LICENSE.md): SUL giới hạn sử dụng theo điều khoản nội bộ/phi thương mại/cá nhân; mã `.ee` có license riêng. Không gọi Community là phần mềm OSI unrestricted.
- [N2 — n8n Help Center, cập nhật06/10/2026](https://support.n8n.io/article/can-i-use-your-license-for-my-use-case): Community cho phép nhân sự tổ chức tạo/sửa workflow; tài liệu cũng cho phép làm workflow cho client và client nối tài khoản nếu không được sửa workflow. Khách ngoài tự cấu hình logic qua UI/API/MCP/AI, hosting như dịch vụ/white-label hoặc dùng tính năng có license key cần license thương mại. BOS nội bộ nhiều company và SaaS future phải xác nhận phạm vi tổ chức/ai sửa logic; không suy cứ có tenant là vi phạm hay cứ tự host là miễn license. Trường hợp không rõ giữ **LICENSE_SCOPE_UNVERIFIED** để làm rõ trước giai đoạn cung cấp dịch vụ.
- [N3 — Schedule Trigger](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.scheduletrigger/), [N4 — Queue mode](https://docs.n8n.io/deploy/host-n8n/configure-n8n/scaling/enable-queue-mode.md): là khả năng sản phẩm chung; queue mode thêm thành phần worker/broker/storage và vận hành, không chứng minh bản cài hiện tại có tính năng/plan đó.
- URL SUL cũ `https://docs.n8n.io/sustainable-use-license/` trả Page Not Found ở lần đọc này; dùng LICENSE và N2, không giả trang cũ còn đọc được.

Giá niêm yết [N5 — n8n pricing](https://n8n.io/pricing/) đọc16/10/2026; đây là **tham chiếu công khai, không báo giá đã mua**, không quy đổi VND hoặc suy đã gồm thuế:

| Phương án | Giá hiển thị / kỳ | Execution / điều kiện | Chưa tính/chưa xác minh |
|---|---|---|---|
| Community self-host phù hợp SUL | Phần Community miễn phí theo phạm vi license | Tự host; không đồng nghĩa có mọi paid feature | Host/DB/backup/operations, features/phiên bản, license scope doanh nghiệp **UNVERIFIED** |
| Cloud Starter | **€20/tháng, thanh toán năm** | 2.500 workflow executions/tháng tại tier hiển thị | Thuế/FX/quota thực/overage/chi phí API ngoài/plan phù hợp |
| Cloud Pro | **€50/tháng, thanh toán năm** | 10.000 executions/tháng tại tier hiển thị | Tương tự; không lấy giá làm cam kết tổng chi phí |
| Business self-host | **€667/tháng, thanh toán năm** | 40.000 executions/tháng; trang ghi self-hosted | Hosting vẫn riêng; tính năng/license/source/contract scope phải kiểm |
| Enterprise / quyền nhúng hoặc mô hình thương mại cụ thể | **UNPRICED — liên hệ nhà cung cấp ở nhiệm vụ mua riêng** | Theo phạm vi/hợp đồng | Không tự gán giá, discount hay SLA |

Một execution tính theo lần chạy workflow, không phải mỗi step; quota/retention là điều kiện plan. Ví dụ lịch5 phút tạo khoảng8.600–8.900 lượt/tháng theo tháng, trước webhook/retry/AI; không tự xếp vào Starter chỉ vì ít workflow [N5]. AI model, provider message, Ads media spend và công kỹ thuật đều ngoài phép so sánh license này.

### Ước lượng công riêng cho quyết định A/B

Đây là **ước lượng thiết kế**, không cam kết lịch: giả định2–3 connector đầu, reuse DB/auth, không migration dữ liệu lịch sử và có backend engineer hiểu repo. Đơn vị engineer-day tập trung, không đổi thành tiền khi chưa có rate:

| Hạng mục | A: công bổ sung dự kiến | B: công bổ sung dự kiến | Diễn giải |
|---|---:|---:|---|
| Hợp đồng/lease/idempotency/reconciliation/ledger/exception chung | 12–20 ngày | 12–20 ngày | Cả hai đều cần; n8n không loại phần core |
| Glue cho2–3 connector và lịch hữu hạn | 6–12 ngày | 3–7 ngày workflow +3–6 ngày callback/version/security boundary | Chỉ giảm nếu node phù hợp API; viết provider adapter khó vẫn là chi phí chung |
| Thiết kế vận hành/restore/alert/runbook ban đầu | 3–5 ngày | 5–8 ngày | B có thêm n8n backup/key/node/runtime ownership |
| Bảo trì sau ổn định / tháng | 1–3 ngày | 2–4 ngày | Giả định ít connector/API change, chưa có dữ liệu sự cố; phải đo lại sau staging |

Không cộng bảng này lần nữa vào backlog nếu backlog đã chứa cùng work package; đây là phân tích so sánh. Mức bất định cao nếu scope entitlement/API/schema không có hoặc cần di chuyển legacy writer.

## P03 — Dùng lại CRM và façade một writer

**Ngữ cảnh.** CRM đã giữ `customers/crm_leads` và việc trước bán; một số `crm_tasks` legacy phục vụ xưởng. Tên bảng không đủ xác định domain. Marketing cần khách/nhu cầu/owner và phản hồi; mở sổ khách riêng gây trùng và sai attribution.

**Phương án.** CRM Marketing riêng; gom tất cả task vào Work; hoặc CRM authority + domain façade/phân loại bằng quan hệ/nghiệp vụ.

**Đề xuất.** CRM sở hữu Party/Need/qualification/owner và hoạt động trước bán, kể cả chăm khách còn mở sau Order. Marketing giữ Plan/Asset/Campaign/Touchpoint/Consent evidence/handoff projection; tham chiếu CRM IDs. Work/Operations giữ công trình/milestone/work item sau bán; chuyên môn giữ QC/giao lắp. Orders/Finance giữ Order/Payment/Refund có chứng từ, không lấy `estimated_value` làm cash revenue.

**Hệ quả.** Một mutation đi qua façade đúng owner; adapter legacy không được ghi song song. Chuyển writer theo inventory có mapping IDs/history/attachments/company, canary read diff, fenced cutover, compatibility window và rollback route về writer cũ đã khóa quyền mới. Không có migration thật trong gói này. Ambiguous task giữ nguyên + exception, không auto chuyển chỉ vì `type=deal`.

**Kiểm.** Hai lead cùng phone nhưng khác nhu cầu không bị xóa; cùng provider event không tạo lần2; khách chung chỉ hiện trong company được phép; báo giá→đơn→Project→ServiceCase giữ nguồn chứng cứ; conversion/refund không nhân bản do revision.

## P04 — Paperclip điều phối AI; runtime thay qua adapter

**Ngữ cảnh.** Brief yêu cầu executive interface, Paperclip và OpenClaw/runtime. Lịch sử chat/tài liệu có thông tin cài đặt nhưng không thay current version/readback. Không dùng con số33 agent lịch sử làm inventory đang hoạt động. Sự tồn tại Paperclip/runtime không chứng minh callback/auth/cap đạt.

**Phương án.** Paperclip giữ cả sự thật CRM/quyết định; mỗi persona có credential đầy đủ; hoặc Paperclip chỉ điều phối AI task/run qua gateway và domain tools.

**Đề xuất.** Business OS giữ business WorkItem/Rule/Decision/Command/Receipt/cap. Paperclip giữ AI task dispatch/review/scheduling trong phạm vi AI và mapping `ai_task_id`; mỗi lần chạy là `ai_run_id`. OpenClaw/runtime qua adapter cho submit/status/cancel/callback/usage; đủ capability mới dùng, không lock-in tên sản phẩm. Executive interface được đọc/tóm tắt/đề xuất; hành động đi chung cổng nghiệp vụ. Codex ở ngoài runtime, xây phần mềm theo nhiệm vụ được giao; không persona CEO cạnh quyết định BOS.

**Hệ quả.** Không đưa Ads/CRM service credential vào prompt hoặc agent filesystem. Callback có identity, mapping, revision/correlation, signature, timestamp/nonce/replay defense; duplicate trả receipt cũ, stale/out-of-scope bị reject. Cancel thành request, chưa suy provider đã dừng; mất callback poll/reconcile, usage UNKNOWN giữ reservation. Paperclip down không chặn intake/CRM; AI backlog chờ, người làm tiếp theo quyền. Nếu runtime thiếu stable run IDs/auth/usage/cancel không bật capability đó; dùng fixture/manual workflow như phương án thay ở staging, không gọi model để chứng minh thiết kế.

**Điều kiện đổi.** Thay runtime hoặc scheduler AI khi capability tests fail; giữ API adapter và source mapping. Chỉ một scheduler chịu nhiệm vụ AI cụ thể; n8n không lập lịch trùng Paperclip/backend. Inventory version/live exact nằm EVIDENCE, trạng thái tài liệu này không là claim đang deploy.

## P05 — Tenant và company là hai phạm vi khác nhau

**Ngữ cảnh.** VPT/Phúc Đạt là company/pháp nhân; tenant là không gian thuê/hợp đồng. Không có bằng chứng ở brief đủ để kết luận mỗi company một tenant hoặc cả hai chung tenant. Code có tenant/company guards nhưng service_role/legacy path vẫn cần audit.

**Phương án.** Tenant=company; mọi company chung tenant mặc định; hoặc tenant membership + company membership/binding rõ ràng.

**Đề xuất.** Tenant chứa một/nhiều company khi mapping có thẩm quyền được xác nhận; Company thuộc tenant rõ theo valid-time binding. Backend resolve actor→tenant membership→company scope→integration account; fail closed nếu thiếu/mâu thuẫn. UUID tự khai, `verified=true`, Page token hoặc global admin UI không tự cấp quyền cross-company. Company-scoped Party/Need/Consent/account audience/spend; shared metadata chỉ theo classification có chủ, intercompany exchange qua hợp đồng riêng.

**Hệ quả.** Logical model triển khai phải hỗ trợ tenant A có A1/A2 và tenant B có B1; test cùng actor/cùng native user ID/same phone nhưng scope khác. RLS/DB constraints và backend policy cùng kiểm, audit cả khi service_role. Mapping VPT/Phúc Đạt **UNVERIFIED**: staging dùng fixture A/A1/A2/B/B1, live gate cần xác nhận membership/account authority; thiết kế vẫn đủ xây cơ chế độc lập mapping.

**Điều kiện đổi.** Quyết định thương mại tenant/hợp đồng mới không làm đổi khái niệm Company; di chuyển company cần cutover/key scope/audit, không chỉ sửa tenant_id. Founder cần chốt mapping trước migrate thật, không cần hỏi lại để soạn ADR này.

## P06 — Một cap authority ở L10, quota công cụ là giới hạn con

**Ngữ cảnh.** Brief đặt130 triệu marketing và cap AI theo từng call. Repo có `modules/aiReplyDraft/budget.js` là kiểm toán học budget từng draft (missing input deny), không chứng minh atomic reservation/usage ledger toàn hệ. Nhiều agent/reviewer/retry có thể vượt cap nếu mỗi công cụ tự quyết.

**Phương án.** Cap độc lập ở Paperclip/n8n/agent; chỉ sum usage cuối kỳ; hoặc ledger BOS với reservation atomically trước side effect.

**Đề xuất.** L10 sở hữu `BudgetEnvelope/Cap/Reservation/UsageEntry` có currency/unit/period/scope/version. Mọi model call gồm retry/reviewer phải reserve theo worst-case bound/pricing version; quota Paperclip/runtime ≤ delegated child budget, không cộng thành tiền mới. Domain Marketing dùng envelope marketing riêng, Finance đối soát cost; chi sản phẩm/AI khác130 triệu Ads. Reservation lifecycle và settlement/UNKNOWN theo CONTRACTS; không dùng boolean budget check thay transaction reservation.

**Hệ quả.** Giữ chỗ chưa rõ usage không tự release. Price/currency/quota thiếu → paid call HELD/DENIED. Cancel/timeout không suy free. Usage late sau rollover quay về kỳ reservation gốc + audit; quá bound giữ exception/chặn call mới theo policy, không che overspend. Khi hold thành commitment/actual phải match/đóng để không đếm đôi; ledger invariant kiểm nhiều worker đồng thời.

**Chuyển chủ cap nếu hiện đã có ở công cụ.** Inventory nguồn cap/usage → dừng nhận mới trong phạm vi chuyển ở nhiệm vụ riêng → snapshot/đối soát pending + UNKNOWN → cấp epoch/owner mới → cài delegated subquota/fence chủ cũ → readback → mở lại theo gate. Không thực hiện bước chuyển trong nhiệm vụ này; không tự reset pending hold hoặc quota Paperclip.

**Kiểm.** Race hai model run giữ chỗ cuối cùng, retry+reviewer, thiếu price, lost callback, stale epoch, late usage/refund, hai company/tenant, ceiling130 triệu và settlement khử trùng.

## P07 — Rollout từng capability, giữ đường nhận khách

**Ngữ cảnh.** Có mã intake/feedback/CSV đang làm việc nhưng bằng chứng chính thức và connector entitlement khác nhau. Mở campaign write trước read/reconcile dễ chi sai; dừng AI không được làm mất khách.

**Phương án.** Bật toàn kênh một lần; yêu cầu AI tham gia mọi intake; hoặc nhận deterministic trước, read capabilities trước write, rollout có receipt/owner/rollback.

**Đề xuất.** Giai đoạn đầu reuse website + một native source có proof; CRM/owner ACK và outcome projections là lát cắt dọc. Mở metadata/report read → fixture incoming → staging signed intake → actual business acceptance ở nhiệm vụ khác → write có cap/consent/UNKNOWN reconciliation. Kênh thiếu API như Zalo Ads được thiết kế file import có nguồn, không giả capability write. Organic source UNKNOWN không gán theo thời điểm.

**Hệ quả.** AI outage: nhận khách/CRM còn chạy; worker outage: inbox pending + cảnh báo; integration token hết hạn: ngưng send/read bị ảnh hưởng, giữ khách đã nhận và người xử lý; DB outage: không ACK chưa bền vững, người vận hành dùng kênh/provider inbox và quy trình backfill có key gốc sau phục hồi. Retention/quyền native provider có hạn nên reconciliation window phải xác minh trước launch; không bảo đảm provider retry mãi.

**Rollback.** Tắt outgoing capability/schedule mới trước; giữ receipt/consent/security guards và callback intake; release worker bằng fence; đối soát mọi UNKNOWN và hold trước đổi owner. Rollback không undo Ads đã chi/tin đã gửi/chuyển đổi đã nhập; reconciliation/refund/adjustment do owner và adapter capability có proof.

## Quyết định còn mở thực sự và điều kiện giao xây

| Mã | Cần chốt ở đâu / lựa chọn cụ thể | Tác động và mặc định thiết kế an toàn |
|---|---|---|
| F-D01 | Founder/đại diện hợp đồng: VPT/Phúc Đạt cùng tenant hay khác tenant, và ai có quyền liên công ty | Chưa map live; mechanism hỗ trợ cả hai, test fixture A1/A2/B1 không phụ thuộc đáp án |
| F-D02 | Founder + Finance: kỳ/phạm vi130 triệu, gross/net/thuế phí/dự phòng, quyền cap và người owner exception | Không phân bổ lại; giữ write gate HELD tới khi envelope đầy đủ; tách quỹ sản phẩm |
| F-D03 | Người phụ trách sản phẩm: staffing/rate/cap sản phẩm và mức SLO/RPO/RTO chấp nhận khi mở giai đoạn xây | Backlog có ước lượng giả định và UNPRICED; không hứa giá/HA trước capacity/restore proof |
| G-D01 | Technical lead: A làm pilot; B chỉ khi một workflow cụ thể đạt tiêu chí giảm tổng công + maintainer/license | Đã có đề xuất rõ; đây là lựa chọn kỹ thuật PROPOSED, không đòi Founder duyệt từng node/timer |
| G-D02 | Account owner từng kênh: capability proof và quyền/đích/consent; xác nhận CPL definition với Marketing/Finance | Không suy quyền từ plugin; thử write/paid/live đều cần nhiệm vụ riêng sau thiết kế; bảng CHANNELS nêu exact unknowns |

Các lựa chọn còn mở không làm tài liệu thành lệnh setup. Mục tiêu gói hiện tại là đủ hợp đồng/đánh đổi/ca thử để review và giao xây; trạng thái nghiệm thu thiết kế nằm SUMMARY/BACKLOG, không tự đánh live PASS từ ADR này.
