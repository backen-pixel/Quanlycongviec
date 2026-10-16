# Khung connector và ba nguồn MVP V3.1a

**DESIGN_ONLY — 16/10/2026.** D2/D7 dùng làm **ASSUMPTION — PENDING_FOUNDER**, không tuyên bố đã gỡ n8n hoặc đã nối đủ tài khoản. V3.1 là nền; chi tiết kênh rộng hơn giữ ở [CHANNELS của gói tổng thể](../overall-design-20261016/CHANNELS.md). Ba nguồn M1: **website/form, Meta Lead Ads, Zalo OA**; Google/TikTok và các write Ads ngoài M1 được hoãn theo D7, không bị xóa thiết kế dài hạn.

Đích M1: nguồn → xác thực/binding → durable inbox → cùng CRM Party/Need → owner → delivered/accepted/first_response → reconciliation. Intake, assignment và notification nội bộ chạy deterministic trong backend Business OS; không đợi model/n8n. Chưa setup, đổi webhook/app, gửi thử khách thật hoặc gọi provider API có credential ở lượt thiết kế này.

## 1. Thành phần dùng chung và chủ trách nhiệm

| Thành phần backend | Hợp đồng / chủ | Mã đã thấy / cần bổ sung |
|---|---|---|
| Binding & secret reference | Map verified tenant+company+integration+provider account/native source; credential_ref/env riêng, version/validity, allowed capabilities; server resolve, không tin company trong payload | Existing website API key/Page/form/OA bindings có phần; cần inventory owner và registry thống nhất, không copy token sang n8n/AI |
| Receiver | Native raw verification + payload limits + allowed account/binding + source protocol; normalize không gọi LLM | Meta durable helper tốt; website có receipt path; Zalo cần thay ACK/security boundary trước mở M1 |
| Inbox | Atomic unique `(tenant,company,integration,source_event_id,event_type)` + payload_hash; cùng key/hash trả cũ, khác hash CONFLICT | Dùng lại DB patterns hiện hữu; không coi execution log/timer memory là inbox |
| Processor / CRM façade | Claim/lease/fence → typed normalization → CRM create/link Need + owner/handoff + outbox theo transaction có thẩm quyền | Tái dùng CRM; không tạo customer DB mới. Same phone không phải global event dedup |
| Outbox / notification | Sau business commit; nhắc nội bộ do backend adapter/policy. Accepted notification transport chưa DELIVERED, human ACK riêng | Bổ sung durable notification key/recipient evidence/reconciliation; chưa có owner giữ WAITING_OWNER |
| Scheduler / watermark | Một backend owner per job; polling bù có cursor/window/watermark version, last_attempt/last_success/coverage | Timer chỉ wake-up. DB job/lease là authority; cronLeader Redis fallback không là fencing chuẩn |
| Retry / reconciliation | Read backoff+jitter; queue retry giữ key; side effect UNKNOWN giữ exposure và native identity | `MATCHED/MISSING/CONFLICT/UNKNOWN`; chỉ MISSING khi scope/window đọc đủ và hết thời gian chờ đã policy xác lập |
| Observability | binding health/token expiry/lastsource seen/inbox age/DLQ/ownerACK lag/reconcile lag/UNKNOWN; alerts có owner nhận | Log/audit che PII/token; alarm ngoài process chính; retention theo class/policy, không claim đã rehearsal |

### Token, rate limit và nâng phiên bản

- Secret binding có **tenant + company + native account + environment**. “Token theo tenant” không cho phép dùng token đó cho mọi company trong tenant; mọi request kiểm company/account entitlement. Shared provider credential nếu có phải được wrapper chia scope và audit riêng; không gửi giá trị vào workflow/export/Git/prompt/log.
- Rate-limit bucket theo provider app/account/native limits và fairness tenant/company; rotate access/refresh token có khóa chống concurrent refresh và durable update. Lỗi auth không fallback credential khác company. Chưa có quota proof giữ `UNVERIFIED`, không bịa số request/minute.
- Phân trang có cursor opaque + page count + coverage + last native time; page lỗi không đánh dấu full sync. Polling overlap là cấu hình có evidence về provider retention, không tự giả định mọi nguồn giữ30/90 ngày.
- Pin API version/adapter version/schema version; verify provider deprecation và test corpus trước nâng. Event version major khi đổi nghĩa; adapter compatibility có thời hạn và owner.
- Outbound allowlist host/path/method/capability do code cấu hình; không nhận URL/token tùy ý từ payload/AI/n8n. HTTP redirect tắt hoặc kiểm lại allowlist; attachment URL có fetch policy riêng/size/MIME, không coi URL từ khách là quyền nội bộ.

## 2. Envelope chung và nhận định về bằng chứng

Schema máy đọc của V3.1a ở [contracts](contracts/); tương thích ý nghĩa intake/fact/Decision/Command/Receipt trong [hợp đồng tổng thể](../overall-design-20261016/CONTRACTS.md). Đường endpoint đích là **đề xuất**, không khẳng định đã có API mới.

| Trường | Nguồn có thẩm quyền / yêu cầu |
|---|---|
| integration_id, resolved_context | Backend tra credential/binding được provision; actor/scope không lấy từ dữ liệu khách |
| source_system, native_account/source IDs | Adapter + tài liệu native; giữ string nguyên, không ép UUID/đổi precision |
| source_event_id, event_type | Stable business event native; nếu native không có ID thì canonical fingerprint có collision/conflict policy riêng được kiểm, không dùng timestamp-now hoặc toàn payload làm duy nhất |
| payload_hash, schema_version | Server canonicalization/algorithm/version; hash payload tách identity key để phát hiện cùng event khác nội dung |
| occurred_at, received_at | Native time có provenance và server time; UTC lưu, provider timezone tách; clock lỗi/thiếu giữ reason |
| private_payload_ref, evidence_ref | Raw private store có ACL/retention; public ACK không lộ contact/Lead ID/token |
| taint, company_scope | Do receiver/gateway tạo và propagate theo [AI boundary](ai-boundary.md); raw text ngoài luôn untrusted dù signature hợp lệ |
| correlation/causation/is_test | Server hoặc source binding xác lập; client không gỡ TEST để đếm khách thật |

**ACK đúng mốc:** native protocol yêu cầu200 thì trả200 sau inbox commit; API nội bộ có thể202 với intake_id/receipt_ref và trạng thái accepted vào inbox. V3.1a dùng **IntakeAcceptanceReceipt** riêng: `intake_ref`, `phase=DURABLE`, `outcome=CONFIRMED` chỉ xác nhận durable acceptance; đây là mốc DURABLE_ACCEPTANCE trong hợp đồng tổng thể, chưa chứng minh Need/handoff thành công. `phase=PROJECTED` chỉ dùng khi projection có chứng cứ; CONFLICT/QUARANTINED phản ánh nhánh tương ứng. **Receipt** còn lại là command-effect receipt, không tạo command giả cho incoming intake. Pure query trả receipt đúng loại; không bịa native/readback ID khi chưa có.

Handoff state canonical `WAITING_OWNER/ASSIGNED/DELIVERED/ACCEPTED/REJECTED`; các mốc assigned/delivered/accepted/first_response có timestamps/evidence riêng. DELIVERED cần durable business inbox hoặc delivery-confirmed, provider queued/accepted chưa đủ. Không owner → Need vẫn lưu, fallback owner có trách nhiệm+hạn, không chọn người ngẫu nhiên.

## 3. Connector website/form

### Bằng chứng code và phạm vi dùng lại

| Nguồn baseline | Đã thấy | Gap / trạng thái |
|---|---|---|
| `integrations/wordpress/vpt-v1-crm-bridge/vpt-v1-crm-bridge.php:102–118,127–135,196–200` | Durable job/request_id, public receipt lookup và HTTP POST API key tới CRM | **MỘT PHẦN**: scope website cụ thể, không chứng minh framework mọi site hoặc live handshake M1 |
| `integrations/wordpress/vpt-v1-crm-bridge/core.php:121,159–176` | website metadata/request identity, public delivery states, không coi2xx thiếu Lead ID là business confirmed | Giữ semantics public receipt không PII; HTTP/email/form UI success khác CRM receipt |
| `backend/src/routes/external.js:224–251` và `domain/websiteIntakeReceipt.js` | External intake path + API-key tracking/context; website receipt domain contract | Map đúng writer/transaction/idempotency trước reuse; không bật legacy deal creation do payload tự khai |
| `database/20261014005710_website_intake_receipts.sql`, `backend/tests/website-intake-receipt.js` | Migration/test source có tồn tại | Không suy migration đã áp/replay DB trắng pass hoặc live qualified từ tên file; inventory W0 xác nhận riêng |

### Thiết kế M1

- Native identity `site_host/site_id + form_id + request_id`; company/integration từ API key/binding server. Browser có thể gửi hidden fields nhưng backend không tin company/owner/source_verified do browser khai.
- Site worker gửi immutable request_id qua mọi retry. Backend normalize → inbox commit → ACK; processor deterministic tạo/link Party/Need theo CRM và one-writer; owner theo binding/rotation policy hiện hành. Không hai path legacy+connector tạo Lead song song.
- Consent CONTACT và AD_MEASUREMENT/REMARKETING riêng; thiếu phép đo không làm mất inquiry hợp lệ. Source paid click ID giữ nguyên nếu có; Organic lưu first landing/referrer bằng chứng + carry qua trang nội bộ; thiếu chứng cứ → UNKNOWN, không suy từ thời gian.
- Poll bù **nguồn website do mình quản lý**: pending jobs/receipt state và request ledger. Mất đáp ứng CRM → receipt lookup bằng original request_id; không submit form mới để “thử lại”. Không scrape PII qua public endpoint hoặc coi WP transient public lookup là nơi giữ nguồn business duy nhất.
- Reconciliation row: request → inbox → Party/Need → Handoff owner/milestones + source refs. WordPress mail_failed không là CRM failed; form thank-you/page_view không là qualified/order/payment.
- Website content/post publishing, ad measurement feedback và campaign spend-write ngoài nhận khách M1; chỉ mở theo nhiệm vụ/phép/cap riêng.

**Contract test cần có (NOT_RUN):** same request concurrent; same ID changed payload409; forged company/owner; restart trước/sau ACK; WordPress retry/mất reply; native source persistence qua2 trang; no consent Ads vẫn nhận inquiry; TEST tách; AI/n8n down intake còn chạy; humanACK không giả từ assigned.

## 4. Connector Meta Lead Ads

### Bằng chứng code và phạm vi dùng lại

| Nguồn baseline | Đã thấy | Gap / trạng thái |
|---|---|---|
| `backend/src/helpers/facebookPageInbox.js:16–44,80–119,232–285` | Feature/managed Page gates, raw HMAC verification, enqueue trước ACK; claim/renew/finish RPC | **MỘT PHẦN**, tốt để reuse; không suy feature enabled/provider app verified từ mã |
| `facebookPageInbox.js:61` | event_key hash của Page + toàn canonical payload | **Gap identity**: payload thay đổi làm key mới, chưa đạt cùng native event/khác hash CONFLICT. Cần native leadgen identity/key tách payloadhash |
| `backend/src/domain/facebookLeadAdsIntake.js:8–20` | Extract Page/form/leadgen identity, validate provider identity | Dùng lại parser sau contract/fuzz/scope checks; không đoán phone là consent |
| `backend/src/services/facebookLeadAdsIntake.js:34–85` | Binding Page/form/company/recipient/version; fetched lead/form; dedicated-token separation; RPC tạo durable handoff | Reuse facade/RPC sau inventory SQL/live/version; không tự gọi app thật; missed lead polling cần contract |

### Thiết kế M1

- Webhook kiểm app signature trên raw body, binding Page/form/integration, giới hạn payload; không nhận chỉ vì verify GET challenge đã pass. Ghi inbox batch bền vững trước200. Dedicated Lead App token không fallback Messenger token.
- Event identity ổn định đề xuất `leadgen_id + event_type` trong tenant/company/integration và native Page/form binding; không dùng hash toàn event làm identity. Preserve `page_id/form_id/leadgen_id/ad_id/adset_id/campaign_id/platform/created_time` khi được trả; ad/campaign metadata thiếu giữ unknown, không fabricate.
- Leadgen webhook chỉ mang pointer; worker read lead+form ownership với least scopes, rate limit và pinned Graph version; fetch lỗi retry read cùng inbox. Kiểm provider form/Page/company trước CRM; receipt replay phải khớp binding version, không dùng cached receipt scope cũ âm thầm.
- Create/link CRM Need + source + durable assignment/handoff qua RPC/façade hiện có. Nhu cầu cùng phone khác leadgen không tự xóa/gộp; merge riêng theo nghiệp vụ có evidence, không mất native lineage.
- Poll bù: provider `/{form_id}/leads` hoặc supported ad leads endpoint, cursor/watermark và overlap/retention theo account/API proof. Cả webhook và poll chuyển về cùng **canonical lead-pointer projection** (`page_id`, `form_id`, `leadgen_id`, loại sự kiện chuẩn), rồi hash projection bằng cùng version; raw delivery/fetched detail giữ ở evidence riêng. Không hash raw polling body rồi so với raw webhook pointer vì hai representation khác nhau sẽ tạo false CONFLICT. Enrichment/profile/field revision cập nhật theo contract Fact/CRM riêng, không tạo lead lần hai; native pointer mâu thuẫn cùng key vẫn CONFLICT. Webhook và polling không hai writer. Chưa đọc đủ mọi page/window → UNKNOWN, không MISSING.
- Native form wording/custom_disclaimer là consent evidence có nguồn, không tự đồng nghĩa remarketing. Instant lead không bắt đi qua website. Chỉ nhận lead + handoff M1; quảng cáo mới/ngân sách/native content publish/CAPI optimization không tự mở.

**Quyền/capability:** official Meta source mô tả App/Page subscription, leadgen IDs và lead retrieval; account-specific app review, leads retrieval scope, Page access, approved Graph version/retention **UNVERIFIED** ở lượt này. Cần readback người có quyền trong nhiệm vụ khác; không đăng nhập để đóng unknown.

**Contract test cần có (NOT_RUN):** wrong app/Page/form/company; missing/tampered signature; native lead pointer refetch lỗi; webhook+poll simultaneous; same leadgen changed body→CONFLICT; stale binding/token rotation; no owner; lostCRMreply; duplicatecallback; receiptGET no side effect.

## 5. Connector Zalo OA

### Bằng chứng code và khoảng trống chặn mở luồng mới

| Nguồn baseline | Đã thấy | Gap / trạng thái |
|---|---|---|
| `backend/src/helpers/zaloOaMessaging.js:37–53,66–107` | Signature helper và parser event/OA/partner/msg_id | **MỘT PHẦN**: helper hỗ trợ hai công thức, chưa kiểm spec hiện hành bằng test vectors official; không tự tuyên bố cả hai hợp lệ |
| `backend/src/routes/zalo.js:464–507` | Webhook handler, OA resolution, signature branch, immediate200, business handler sau đó | **Gap high**: thiếu signature có nhánh không reject;200 trước durable log/handler. Không đạt source authentication/durableACK chỉ vì có helper; không live probe |
| `backend/src/routes/zalo.js:283–298`, `helpers/zaloN8nWebhook.js:131–158` | Legacy trigger n8n inbound/profile, HTTP timeout | D2 chưa đúng đích ở source; có thể chuyển dần backend adapter, không cần gỡ sản phẩm n8n hoặc sửa luồng đang chạy trong nhiệm vụ này |
| `helpers/zaloOaToken.js`, `jobs/zaloOaTokenRefresh.js` | Access/refresh token helper và lịch backend | Dùng lại ý tưởng, xác minh credential storage/rotation locking/company binding trước M1; không in giá trị secret |

### Thiết kế M1

- Mỗi OA/App có verified binding tenant/company + recipient OA. Không lookup app fallback rồi lấy OA đầu tiên để quyết company; ambiguous recipient/app → reject/quarantine có owner, không random routing.
- Native webhook verification theo đúng spec/version đã kiểm + replay/timestamp khi provider hỗ trợ; signature bắt buộc cho luồng cần ký. Missing secret/config → notready/retryable hoặc reject theo giao thức, không accept unsigned. So sánh constant-time phù hợp và official vectors; không thêm thuật toán fallback chưa có proof.
- Ghi durable inbox trước200, rồi worker normalize. Event identity `oa_id + native message/event_id + event_type` trong integration scope. Event không có message ID (follow/status/profile) cần event-specific stable key có spec/conflict policy; thiếu identity giữ UNKNOWN/quarantine, không dùng sốđiệnthoại hay timestamp-now.
- Parse `sender/recipient/msg_id/event_name/timestamp/app_id` và preserve OA-scoped user ID. Echo/outbound events phân loại riêng, không tạo khách inbound mới từ tin OA tự gửi. Content/attachment taint ở C0; không thực thi hướng dẫn nằm trong Zalo text.
- Profile fetch/read qua backend token adapter; kết quả profile thiếu không làm mất tin. Party/Need link theo OA-scoped identity + nghiệp vụ CRM, phone chỉ là thuộc tính/bằng chứng, không global identity hoặc dedup mọi Need.
- Poll bù khả năng **phụ thuộc API/quyền thật**: chỉ dùng conversation/history endpoint nếu official spec + account access chứng minh; chưa có proof thì `POLL_BACKFILL_UNVERIFIED`. Fallback thiết kế là provider replay/retry đã xác minh hoặc operator import đã che có source ID/manifest; không hứa kéo được toàn bộ lịch sử tin.
- M1 nhận khách và notification nội bộ trong backend; gửi tin khách/tin tư vấn/template là capability khác, không C2-báo trước. Nếu mở sau này phải kiểm effective consent, cửa sổ tương tác, entitlement/cost và Decision ngay trước send; timeout sau có thể ghi → UNKNOWN/readback, không blind resend.

**Contract test cần có (NOT_RUN):** missing/wrong signature; no/ambiguousOA binding; wrongtenant/sameuserID khácOA; webhook restarttrướcACK; duplicate+changedpayload; echo không tạoLead; tainted text không đổi quyền; profile API down vẫn lưu inquiry; tokenrefresh race; polling capability unavailable hiện UNKNOWN; ownerACK và provider retry giữkey.

## 6. Reconciliation, failure và chuyển writer

Một report có per-row source_ref/window/coverage + native/source/inbox/Need/handoff IDs, observation `MATCHED/MISSING/CONFLICT/UNKNOWN` và reason. Full source read không đủ do permission/retention/pagefail thì UNKNOWN. Không auto tạo Need “bù” từ số đo aggregate hoặc thêm owner để báo cáo đẹp. Reconciliation write nghiệp vụ là command riêng có quyền; M1 reconciliation read/proposal không tự sửa source.

| Sự cố | Hành vi đúng | Bằng chứng cần có khi nghiệm thu |
|---|---|---|
| AI/Paperclip/n8n down | 3 receivers+CRM/assignment không phụ thuộc; AI task chờ | Native event→durable receipt→Need/owner chain |
| Worker down | Inbox lưu nếu DB/capacity còn; backlog alert; nếu khôngcommit được trảretryable, khôngACK giả | Queue age/capacity + alarm sink acknowledgement |
| Token/providerread fail | Giữ inbox/retrybound/watermark; khôngthay company/token hoặc markMISSING | Safe error/authstate/lastsuccess/coverage |
| Lost response sau cóthể ghi | UNKNOWN; queryreceipt/nativeidentity; giữeffectkey/exposure | Readback/evidence hoặc manualreview owner |
| Restore/cutover | Outbound/schedule defaultoff; fence writercũ, reconcile pending/UNKNOWN trước mởmới | Watermark/checksum/authorityepoch/writerinventory |

Cutover D2 từng luồng: inventory n8n legacy callbacks/schedules/credential owners → backend adapter fixture → shadow read/reconciliation → scoped rehearsal → drain/fence old product dispatch → mở writer/scheduler backend → readback → retire old route theo quyền. Không dualwriter, không copy n8n execution log thành businesstruth. Nếu W0 cho thấy chưa thay được một workflow thì đánh dấu dependency/HOLD riêng và tiếp tục design phần khác; không giả đã bỏ n8n.

## 7. Nguồn và điều kiện mở capability

Nguồn chính thức đã đọc **16/10/2026**, chỉ tài liệu công khai; dùng lại ngày/source registry đầy đủ trong [CHANNELS](../overall-design-20261016/CHANNELS.md):

- [Meta official lead retrieval checker](https://github.com/facebookincubator/catalogue-of-api-solutions/blob/main/solutions/leads/leads-retrieval-set-up-checker.md): App/Page subscriptions, native lead identity và lead/form/ad read. Developer page trực tiếp có lỗi truy cập ở lượt trước; advanced permission/quota/version exact giữ UNVERIFIED tới khi kiểm.
- [Zalo OA cấp quyền](https://oa.zalo.me/home/documents/guides/Khoi-tao-ung-dung-va-cap-quyen_117071366476220195): OA-App grant, permission groups và POST webhook. [Webhook developer](https://developers.zalo.me/docs/official-account/webhook/tong-quan) không trả text trong web tool; exact signing/pollbackfill chưa verified.
- [Zalo tin tư vấn](https://oa.zalo.me/home/documents/guides/tin-tu-van): điều kiện/cửa sổ provider là capability riêng, không suy từ token OA. Không gọi/bật gửi để nghiệm thu ở đợt thiết kế.
- Website connector sở hữu code nội bộ theo nguồn bảng trên; native request validity không chứng minh customerqualification hoặc quyền Adsmeasurement.

Mỗi capability cần manifest `provider/version/account/company/authscope/readwrite/verified_at/proof_ref/status/owner`; có connector label hoặc source code chưa là READY. Live status: **NOT_RUN/UNVERIFIED** trong tài liệu này. Mở M1 sau G0, 3connector contract tests/scope/race/durableACK/ownerACK/restore proofs và quyết định phát hành riêng; lỗi chữký/scope không được bypass bằng duyệt mềm.
