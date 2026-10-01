# Marketing → Business AI OS — bản đồ triển khai V1

Ngày 01/10/2026 • Issue #15 • Base GitHub `0bc6392286df0b986cdd6dfc59b499916dd6fd31`.

Đây là bản đồ tích hợp và candidate M0, không phải trạng thái production. Tham chiếu [ADR-0015](../adr/0015-marketing-business-os-boundary.md).

## Giữ / kết nối / chưa đụng

| Thành phần hiện có | Cách đưa vào kiến trúc chung | M0 làm gì? |
|---|---|---|
| `backend/src/routes/facebook.js` | Adapter tiếp nhận Meta; giữ writer hiện hành | Không sửa route |
| `backend/src/helpers/facebookMessengerReceipt.js`, `facebookAtomicLead.js` | Receipt/retry/link nguyên tử của intake; không tạo bản sao | Không sửa helper cũ |
| `database/639_*`, `640_*`, `641_*` | Cấu trúc intake đã có trong mã nguồn; triển khai live phải kiểm riêng | Không chạy hay sửa migration |
| `backend/src/routes/external.js` | Biên website/API vào CRM; backend quản quyền và luật | Không mở endpoint mới |
| `backend/src/routes/crm/routes/leadLifecycle.js` | CRM sở hữu vòng đời nhu cầu, Lead và Deal | Không sửa luật hoặc assignment |
| `backend/src/middleware/tenantGate.js` | Ranh giới tenant hiện có | Không thay hay bỏ middleware |
| PR #14 — WordPress ChatGPT source bridge | Workstream riêng, đang OPEN lúc đọc; UTM không phải paid-click proof | Không merge, cherry-pick hoặc sửa AGENTS của PR đó |
| Dashboard/checkpoint/lịch marketing hiện có | Projection và đầu việc dùng chung với Business AI OS | Không deploy, không tạo lịch/worker trùng; chưa kiểm live lượt này |
| Founder / Executive interface | Một đầu mối giao việc; nhận dữ liệu theo quyền, không thay database | Chuẩn hóa hướng tích hợp; chưa đổi runtime |
| CEO Minh / agent inventory | Kiểm kê rồi mới quyết định gộp/chuyển skill | Không xóa/tắt agent, không giả định 33 workspace đang chạy |
| Codex/OpenClaw/các runtime khác | Implementation có thể thay thế sau kiểm thử contract/quyền | Không cài ECC hoặc runtime mới |

Nguồn mapping: cây mã tại base SHA; `AGENTS.md`; `docs/ai-handoff/CURRENT.md`, `DECISIONS.md`; workflow của repository; metadata PR #14. Hồ sơ Library dùng làm chỉ dẫn kiểm kê, không chứng minh trạng thái live mới.

## Hợp đồng quan sát `marketing-evidence/v1`

API nội bộ thuần:

```js
assessMarketingEvidence(trustedContext, evidence, policy)
```

`trustedContext` chứa `tenantId`, `companyId` dạng chuỗi định danh không rỗng, do backend sau auth/authorization cấp. Không được dùng context lấy từ body người dùng. M0 chưa có HTTP adapter và không tự xác thực caller.

`policy` có `now` UTC ISO và `maxAgeMs.source/crm/attribution` là số nguyên dương. Không ngầm dùng đồng hồ máy hoặc TTL tùy tiện. Caller được phép phải chọn chính sách phù hợp nguồn; model không tự nới TTL để làm dữ liệu cũ thành đạt.

Mỗi phần quan sát có `tenantId`, `companyId`, `status`, `checkedAt`. `status: ok` chỉ khi nguồn đọc thành công. ISO UTC dạng `YYYY-MM-DDTHH:mm:ss[.sss]Z`; adapter chuyển múi giờ trước khi gọi. Dữ liệu tương lai hoặc ngày bị rollover bị loại. Timestamp giữ theo từng nguồn, không thay bằng giờ refresh màn hình.

| Phần | Trường bổ sung | Ý nghĩa |
|---|---|---|
| `source` | `system`, `metric`, `count`, `periodStart`, `periodEnd` | Hệ nguồn enum; clicks/conversations/platform_leads; số nguyên không âm; kỳ hợp lệ kết thúc không sau lần đọc |
| `crm` | `leadExists`, `leadId`, `accepted`, `acceptanceRuleRef`, `owner` | Verdict từ CRM/backend, không do helper đặt; owner có `id`, `active`, tenant/company đúng |
| `attribution` | `method`, `verified`, `eventId`, `receiptRef`, `leadId`, `sourceSystem` | UTM chỉ classified; platform receipt được adapter xác minh và cùng source/Lead mới LINKED |

Output chỉ có phiên bản, trạng thái phạm vi, quan sát allowlist, reason codes, event key giả danh và `writeAuthorization: NOT_PROVIDED`. Không echo customer ID, lead ID, phone/email, body/referral, token hoặc raw error. Định danh đầu vào phải là opaque machine ID; không gửi thông tin cá nhân vào trường ID. Hash cần bảo vệ như dữ liệu giả danh, không được gọi là dữ liệu ẩn danh.

Kết quả source count và CRM quan sát một Lead **không** tạo accepted-lead count của toàn campaign. `LINKED` **không** khẳng định Lead thuộc kỳ source metric. Trước KPI tổng hợp phải có adapter/cohort/time-window reconciliation riêng. Không lấy `reasonCodes=[]` làm lệnh bật Ads/merge/deploy.

## Ma trận nghiệm thu tối thiểu

Phạm vi thiếu/sai; nguồn thiếu/lỗi/stale/future; zero thật so với unknown; loại metric/kỳ sai; người nhận thiếu/inactive/sai công ty; CRM chưa chấp nhận; UTM giả verified; receipt thiếu proof/cùng Lead/cùng source; field nhạy cảm dư; chống đổi input; event key ổn định và tách scope; import không khởi động ứng dụng.

M0 chạy synthetic qua Node builtin, không npm install. CI PR riêng chỉ đọc source và chạy test, không credential ứng dụng hoặc service thật.

```sh
node --check backend/src/helpers/marketingEvidenceContract.js
node --check backend/tests/marketingEvidenceContract.test.js
node --test backend/tests/marketingEvidenceContract.test.js
```

## Thứ tự chuyển đổi

1. M0: ranh giới + helper thuần + test + hồ sơ bàn giao (candidate của PR này).
2. M1: chốt backend SHA/DB target/page-owner/schema/config và inventory scheduler/single-writer. Tạo adapter READ trên target được duyệt; đối chiếu PR #8/#14, không suy schema live từ số migration.
3. M2: controlled E2E và shadow comparison với hiện hành; nguồn thật → số tự nguyện → CRM đúng công ty/người nhận → báo cáo, chống trùng/retry và trường hợp từ chối. Không dùng contact cũ làm chứng cứ luồng mới.
4. M3: chỉ release sau review, staging, bằng chứng và quyền phát hành cụ thể. Giữ giới hạn chi hiện hành; mọi tác động quảng cáo qua quyết định riêng. Theo dõi rollback không xóa dữ liệu khách.

Job registry đi cùng tại `docs/ai-handoff/MARKETING_BOS_JOBS_V1.json` là backlog trong repo, **không** là worker/scheduler, không phải Job State production thứ hai. Khi Control Plane chính thức có sẵn, nhập/mapping vào đó thay vì tạo bảng cạnh tranh.
