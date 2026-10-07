# Founder Control Center V1 — bàn giao 2026-10-07

## Vấn đề và kết quả

Founder cần điều hành Marketing → CRM trong ChatGPT theo sáu hệ, truy bằng chứng và lưu mục tiêu/quyết định bền vững. Gói này thêm domain/Application Service và Skybridge adapter vào backend hiện có. Chưa vận hành production: flags mặc định tắt, migration chưa chạy trên Supabase, không gọi Meta, không gửi thông báo, không thay OpenClaw hoặc hệ approval dự án.

Baseline `6e5ef497f507685c94ba39e89426d8b4bb716bfa`; branch `codex/founder-control-center-v1`. Yêu cầu từ văn bản Founder 07/10/2026. Đã áp dụng build-mcp-apps và nguyên tắc sáu hệ; không phát sinh agent hoặc approval theo từng hệ.

## Hoạch định trước vận hành

- Tư tưởng: dữ liệu có bằng chứng, thiếu nguồn không thành 0; approval không thành execution.
- Tư duy: domain canonical cho SLA/policy; service xác minh quyền và đối soát nguồn; adapter chỉ giao tiếp/hiển thị.
- Nguồn lực: tái sử dụng Express/Supabase router, API-key auth, MCP audit, inbox/receipt, attribution và CRM. Thiếu provider OAuth, endpoint HTTPS MCP, watermark/cohort và policy gốc được xác minh.
- Vận hành: ba luồng xem tổng quan, drill bằng chứng, ghi mục tiêu/quyết định. Không job hoặc side effect ngoại hệ.
- Báo cáo: nguồn, fetched_at, độ mới, coverage và UNKNOWN/PARTIAL hiện trong output/view; không tự quy observed lead thành khách quảng cáo hợp lệ.
- Sửa chữa: request replay idempotent, conflict phiên bản/digest, rollback transaction nếu audit lỗi; tắt flags/thu hồi RPC giữ hồ sơ.

## Nguồn chuẩn đã kiểm tra

| Nguồn | Kết luận | Giới hạn |
|---|---|---|
| AGENTS/CLAUDE, architecture V1.1, ADR0019, Founder decisions, CURRENT/DECISIONS | Giữ backend module và OpenClaw; không tạo orchestrator thay thế | Kiểm tra repository, không phải runtime inventory |
| mcpGateway/apiKeyAuth/settings | Có auth, audit và delegated actor để tái sử dụng | Scope Founder mới cần key riêng, không cấp mặc định |
| SQL701–702 và Facebook Page inbox/Lead Ads intake | Có durable inbox và atomic receipt chống trùng | Inbox không có immutable company; chỉ truy IDs qua receipt đã scoped |
| lead_attribution/crm_leads/fb_ad_accounts/fb_ad_spend_daily | Có nguồn observed, account/company mapping | Không có bằng chứng complete cohort/paid-qualified/watermark |
| first_touch_time và Messenger outbound | Note cũng có thể cập nhật first_touch | SLA chỉ dùng receipt + outbound có provider id và sender sales hợp lệ |
| marketingAutomation | Policy hiện tại 08–20/15 phút | Không đổi policy này; SLA VPT mới cần UUID trusted server config |
| Quy tắc >=50.000/không điện thoại/00:00 | Scope chính sách gốc chưa xác minh | Default POLICY_SCOPE_UNVERIFIED, chỉ pure dry-run |
| Skybridge npm 2.0.3 API/types | Đã dùng API thật và transport tests | docs.skybridge.tech bị HTTP403; không nhận đã kiểm tra tài liệu web |

## Files và trách nhiệm

- `backend/src/modules/founderControl/{domain,contracts,service}.js`: canonical SLA 08–22 mọi ngày UTC+7, strict <5 phút; dry-run; schema và tenant-safe reads/commands.
- `backend/src/helpers/mcpFounderBridge.js`, `mcpGateway.js`: exact five tools, Primary pin và feature gates; legacy tools vẫn giữ hành vi cũ.
- `founderKeyPolicy.js`, `routes/settings.js`: dedicated scopes và quản trị key chỉ admin/ecosystem_admin. Actor/key/creator/company kiểm lại trong service, rồi RPC khi ghi.
- `database/711_founder_control_center.sql`: objectives/proposals/immutable decisions/command receipts, RLS, service-only guarded RPC, audit atomic. Digest tính trên canonical PostgreSQL jsonb trong RPC; không dùng digest JS để approve.
- `database/711_founder_control_center_rollback.sql`: thu hồi execute, giữ dữ liệu.
- `apps/founder-control-center`: SDK pin/lock, bearer forwarding, ba views, five tools, safe narration/source errors. Không shared service token hoặc model-supplied actor/tenant/role.
- `backend/tests/founder-control`, app `tests`: regression, PostgreSQL WASM, MCP HTTP và React rendering synthetic.

## Hợp đồng và tính đúng dữ liệu

UUID/company do model yêu cầu là phạm vi truy vấn, không phải quyền. Quyền lấy từ fresh DB key, người cấp và actor active cùng tenant/company; X-User-Id không được thay actor. Keys giới hạn region bị từ chối cho company-wide reports. Reads không ghi seen_by. Dữ liệu inbox lịch sử không dựa vào Page config hiện tại. Lỗi nguồn không trả raw database message/token/PII.

Overview dùng kỳ <=31 ngày; sổ mục tiêu là registry toàn công ty với kỳ trên từng objective, không diễn giải là số phát sinh trong window. Reads luôn PARTIAL tới khi đối soát nguồn; spend/CPL/gap thiếu watermark/qualification giữ null. Giới hạn 3000 rows trả PARTIAL và count UNKNOWN. Đồng bộ >15 phút là cảnh báo vận hành, không phải chứng minh completeness; `source_as_of=null` khi chưa có watermark.

Mục tiêu chỉ QUALIFIED_PAID_LEADS (số nguyên) và FIRST_RESPONSE_SLA (0–100%). Create sinh DRAFT và proposal; approve/reject bắt buộc object/version/digest. Receipt/audit cùng transaction, request_id trùng giữ cùng kết quả; payload khác conflict. Không blind retry với request_id mới khi kết quả ghi chưa rõ. Quyết định luôn NOT_EXECUTED.

## Bằng chứng kiểm thử

Đã chạy trên Node24.19/npm11.9 với dependencies lock:

```sh
node --test backend/tests/founder-control/*.test.js backend/tests/facebookPageLeadAdsIntake.test.js backend/tests/facebookAtomicLead.test.js backend/tests/facebookPageInbox.test.js backend/tests/marketingEvidenceContract.test.js
cd apps/founder-control-center
npm ci --cache /workspace/.npm --no-audit --no-fund
npm run build
npm run typecheck
npm test
```

- Backend 219/219 PASS: 34 Founder và 185 regressions hiện có. Bao phủ tenant/key/actor, Primary gate, nguồn lỗi/cap, schema, SLA giờ/ngoài giờ/cuối tuần/<5 phút và dry-run/reset.
- App 16/16 PASS (gồm parent/subtests): bridge và rendered UI, PostgreSQL WASM migration chạy hai lần/ACL/idempotency/version/audit rollback, MCP HTTP401/permission/strict args/view metadata/structuredContent với backend synthetic.
- Build/typecheck PASS. Tổng 235 tests; không coi parent test là nghiệp vụ riêng. Có fixture chỉ synthetic, không dùng khóa thật.
- Chưa chạy PostgreSQL concurrent multi-session, Supabase staging, OAuth/ChatGPT, browser host thật, dữ liệu Marketing/CRM thật hoặc review độc lập. Không chứng minh runtime DB schema bằng mock.

## Chạy thử, release và rollback

Xem [README adapter](../../apps/founder-control-center/README.md). Không nhập bearer vào chat hoặc commit .env. Release cần review diff/schema, Supabase staging catalog/ACL/audit/concurrency, xác minh VPT UUID và policy gốc, nguồn watermark/cohort, OAuth provider và HTTPS MCP endpoint; sau đó nghiệm thu ChatGPT read/write theo user identity. Frontend Render đã nêu trong chat không phải MCP endpoint.

Tắt FOUNDER_CONTROL_ENABLED/FOUNDER_CONTROL_WRITES_ENABLED, dừng adapter, thu hồi execute RPC theo rollback SQL. Không xóa receipts/objectives/decisions/audit. Hệ project approvals và automation cũ giữ nguyên.

## Sửa review 07/10

Phạm vi chỉ PR51; migration 711 chưa triển khai nên sửa cùng rollback tại chỗ. Test hồi quy được viết và chạy trên mã cũ trước khi sửa:

| Lỗi | Trước sửa (FAIL) | Sau sửa / test | Giới hạn còn lại |
|---|---|---|---|
| L1 | `Missing expected rejection` khi dùng UUID cho Founder read/write; `tools/list` cũng hiện Founder tools theo scope. | Middleware gắn loại credential và SHA-256 digest của access secret; list rỗng nếu UUID; service so với key mới; RPC so digest dưới `FOR SHARE`. Backend auth/service/gateway PASS, PGlite rotation giữa service và RPC PASS. Refresh token bị từ chối. | Chưa thử rotation trên Supabase thật hoặc nhiều session. MCP cũ vẫn nhận UUID. |
| L2 | `Missing expected rejection` với `tenants.is_active=false`. | Service chặn đọc/ghi; RPC khóa tenant `FOR SHARE`, trả `TENANT_INACTIVE`. Backend/PGlite PASS. | `subscription_end` không nằm trong `assertTenantActive` hiện hành (`backend/src/helpers/tenantScope.js:78-89`), nên không tự áp chính sách hết hạn mới. |
| L3 | SLA PostgreSQL `4:59.999999` trả `UNKNOWN` thay `MET`. | Parser integer microseconds xử lý dấu cách/T, 1–6 số lẻ, Z/offset giờ/phút; kiểm ngày/giờ/offset; `windowOf`, freshness, dry-run và biên SLA dùng cùng parser. Backend PASS. | JSON minutes vẫn là Number, so ngưỡng bằng BigInt. |
| L4 | Chỉ có enqueue mà SLA trả `MET` thay `UNKNOWN`. | `first_response` trả bốn milestones và basis; chỉ dùng `provider_data.created_time` của receipt Lead Ads đã scope, hợp lệ về thứ tự/thời gian, cùng human outbound. Thiếu/lệch nguồn trả UNKNOWN; backend PASS, không trả provider_data/PII. | Không có cột nhận webhook riêng nên `webhook_received_at=null`; so độ lệch nguồn→enqueue tối đa 24 giờ là guard bảo thủ. SLA Messenger chưa có receipt gắn Lead trong luồng này. |
| L5 | Adapter gốc trả `BACKEND_UNAVAILABLE` cho `REQUEST_CONFLICT` (assertion FAIL); DB CHECK trả `WRITE_UNAVAILABLE` thay `INVALID_ARGUMENTS`. | Bridge chỉ giữ 10 mã cho phép, không echo upstream, có `retryable`/`replay_same_request_id`; service map 23514/22P02/22023. Backend PASS, kiểm bridge trực tiếp 10/10. | (build và app suite đã được Claude chạy độc lập: xem mục xác minh). |

Đối chiếu mốc SLA: SPEC hiện tại yêu cầu thời điểm nguồn đã xác minh và outbound con người (`apps/founder-control-center/SPEC.md:18`); kế hoạch CRM cũ dùng `first_touch_time`/15 phút (`docs/architecture/ke-hoach-cong-du-lieu-lead-facebook.md:226`), còn quyết định Founder 01/10 chưa chốt KPI/SLA (`docs/ai-handoff/FOUNDER_DECISIONS_ARCHITECTURE_V1_1_20261001.md:55`). Với luồng Lead Ads mới, webhook được xác thực chữ ký (`backend/src/helpers/facebookPageInbox.js:80-85`), Graph lấy `created_time` (`backend/src/services/facebookLeadAdsIntake.js:60`), receipt giữ `provider_data` (`database/702_facebook_lead_ads_intake.sql:59,353-355`). Inbox chỉ có `created_at` khi enqueue (`database/701_facebook_page_inbox.sql:20-24`); receipt `created_at` cũng là thời điểm ghi. Vì vậy chọn Graph `provider_data.created_time` làm source event; không thay 08–22/<5 phút/policy_version. **Cần Founder xác nhận** cách đo khi nguồn Messenger hoặc mốc webhook nhận được lưu bền vững; các trường hợp đó hiện trả UNKNOWN.

Xác minh tại checkout: backend 41/41 PASS; PGlite 10/10 PASS; `npx tsc --noEmit` PASS; bridge trực tiếp 10/10 mã PASS. Claude kiểm độc lập (ngoài sandbox Codex): `npx skybridge build` OK; `npx tsx --test tests/*.test.ts` sau build 18/18 PASS; backend 41/41, typecheck sạch. Trên mã cũ (657faf88) cùng các test mới: 7 backend + 2 app FAIL, nên test hồi quy tái hiện đúng lỗi. Không kết nối DB/mạng thật, không bật flags, không migration/deploy. Rollback: tắt Founder flags theo quy trình release, dùng `711_founder_control_center_rollback.sql` để thu quyền RPC; dữ liệu lịch sử được giữ.

## Draft PR

Dùng phần vấn đề/kết quả, phạm vi files, kiểm thử và release gates của hồ sơ này làm PR body. Đã push branch với implementation commit `d9a26c36`. Lệnh tạo draft PR trả `Post https://api.github.com/graphql: Forbidden`; draft PR chưa được tạo. [Nội dung PR](FOUNDER_CONTROL_CENTER_V1_PR.md) đã lưu; [mở trang tạo PR](https://github.com/backen-pixel/Quanlycongviec/pull/new/codex/founder-control-center-v1). Diff/branch là vật phẩm review thay thế; không merge hoặc deploy.
