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

## Draft PR

Dùng phần vấn đề/kết quả, phạm vi files, kiểm thử và release gates của hồ sơ này làm PR body. GitHub API trong environment trả Forbidden khi đọc repository; draft PR chưa được tạo qua API. Diff/branch là vật phẩm review thay thế; không merge hoặc deploy.
