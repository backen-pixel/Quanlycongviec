# Trợ lý hướng dẫn (CopilotKit) — hệ thống ĐANG CHẠY

> Tài liệu **hiện trạng**, viết bằng cách đọc lại toàn bộ source. Mô tả hệ thống *đang có*,
> không phải hệ thống *dự định làm*.
>
> Hai file kia là tài liệu **kế hoạch**, viết trước khi thi công và đã lạc hậu:
> [guide-assistant-architecture.md](./guide-assistant-architecture.md) giải thích *vì sao chọn kiến trúc này*
> (phần đó vẫn đúng), [copilotkit-integration.md](./copilotkit-integration.md) hướng dẫn *dựng từ đầu*
> (phần đó đã sai ở nhiều chỗ — xem §12).

---

## 1. Trạng thái hiện tại

> ⚠️ **Bảng "Cấu hình đang chạy" và mục "Biến môi trường" dưới đây mô tả hệ thống MỘT nhà cung
> cấp cấu hình qua `.env` — đã bị thay hoàn toàn từ 2026-09-08.** Nhà cung cấp và model giờ chọn
> được trên giao diện (Supabase/tệp JSON, đổi xong lượt sau đã có hiệu lực, không cần khởi động
> lại), có thêm `token-codex` là nhà cung cấp thứ ba, và bảng khả năng suy luận đã cắt theo TỪNG
> MODEL chứ không theo nhà cung cấp. **Xem §21–§22.** Giữ bảng cũ lại vì `.env` vẫn là MẶC ĐỊNH
> khi chưa ai chỉnh gì trên giao diện — không phải nói sai, chỉ không còn là toàn bộ sự thật.

| | |
|---|---|
| `@copilotkit/runtime` | 1.66.2 (backend) |
| `@copilotkit/react-core` | 1.66.2 — dùng **giao diện v2** (`@copilotkit/react-core/v2`) |
| `@copilotkit/react-ui` | **đã gỡ** — đó là giao diện v1, không vẽ được suy luận |
| `zod` | ^3.25.76 (frontend) — v2 khai tham số tool bằng Standard Schema |
| `ai` (Vercel AI SDK) | 6.0.244 — **không khai trong package.json**, lấy qua `@copilotkit/runtime` |
| `reflect-metadata` | **không khai trong package.json**, cũng lấy transitively |
| `@anthropic-ai/sdk` | ^0.116.0 |
| `openai` | ^4.104.0 |
| `modern-screenshot` | ^4.7.0 (frontend, nạp động) |

### Cấu hình đang chạy

`backend/.env`:

```
GUIDE_AI_PROVIDER=anthropic
ANTHROPIC_MODEL=claude-haiku-4-5
COPILOTKIT_MODEL=gpt-4o-mini      ← KHÔNG dùng, chỉ có tác dụng khi provider=openai
```

**Claude Haiku 4.5 — $1 vào / $5 ra mỗi 1M token.** Đã kiểm end-to-end sau khi đổi:
adapter dựng đúng `claude-haiku-4-5`, vòng lặp tool chạy đúng (gọi tool → đọc kết quả →
trả lời), suy luận có hoạt động (59 thinking token, 1 khối 101 ký tự), usage bắt được cả
hai vòng, model có trong bảng giá nên phần tiền hiện được.

Cú pháp thinking của haiku là `{ type: 'enabled', budgetTokens: 2000 }` — **không phải**
`adaptive`. Xem §8 để hiểu vì sao cú pháp khác nhau theo đời model.

**Điểm yếu đã biết của haiku**, ghi lại để khỏi tưởng là bug: với câu hỏi số liệu **mơ hồ**,
nó **hỏi lại người dùng thay vì tự gọi `bao_cao_van_hanh`**. Hỏng kiểu an toàn — thà hỏi lại
còn hơn bịa số. Câu hỏi rõ ràng thì nó gọi tool đúng.

So sánh đã đo trên chính hệ thống này bằng 3 câu hỏi (hướng dẫn / số liệu rõ / số liệu mơ hồ),
phần khó là chọn đúng giữa `tra_cuu_he_thong` và `bao_cao_van_hanh`:

| Model | Giá /1M | Kết quả |
|---|---|---|
| `claude-sonnet-5` | $3 / $15 | đúng cả 3 |
| `claude-haiku-4-5` | $1 / $5 | đúng câu rõ; câu mơ hồ thì hỏi lại **(đang dùng)** |
| `gpt-4o-mini` | $0,15 / $0,6 | câu mơ hồ **gọi nhầm tool rồi trả lời sai một cách tự tin** |

Đổi model: sửa `ANTHROPIC_MODEL` trong `.env` rồi khởi động lại backend, không đụng code.
Quay về OpenAI: `GUIDE_AI_PROVIDER=openai` — nhưng khi đó **phần suy luận 💭 tắt hoàn toàn**
(`suyLuanChoAiSdk()` trả `null` khi không phải Anthropic, và `runOpenAiLoop` bỏ qua `onSuyLuan`).

Cả hai key đều có sẵn trong `.env` (Anthropic 108 ký tự, OpenAI 164 ký tự).

### Biến môi trường

| Biến | Mặc định trong code | Việc |
|---|---|---|
| `GUIDE_AI_PROVIDER` | `openai` | `openai` \| `anthropic` (`claude` cũng nhận) |
| `OPENAI_API_KEY` | — | bắt buộc khi provider = openai |
| `ANTHROPIC_API_KEY` | — | bắt buộc khi provider = anthropic |
| `COPILOTKIT_MODEL` | `gpt-4o-mini` | model OpenAI (`OPENAI_MODEL` là fallback) |
| `ANTHROPIC_MODEL` | `claude-sonnet-5` | model Claude |
| `GUIDE_SHOW_THINKING` | bật | đặt `0` để tắt suy luận |
| `GUIDE_THINKING_BUDGET` | `2000` | chỉ dùng cho model đời trước 4.6 |
| `GUIDE_USD_VND` | `26000` | tỷ giá hiện tiền trong khung chat |
| `COPILOTKIT_TELEMETRY_DISABLED` | — | đặt `true` |

---

## 2. Một lượt hỏi đi qua đâu

```
Trình duyệt                         Backend                        Nhà cung cấp AI
───────────                         ───────                        ───────────────
CopilotPopup
  │ 5 readable + 6 tool client
  ▼
POST /api/copilotkit ──────────────► routes/guide/copilotkit.js
   {method:"agent/run"}               │ auth (JWT)
                                      │ batDauLuot(uid)
                                      │ req.url = req.originalUrl   ← BẪY 4
                                      ▼
                                    buildHandler(req.user)          ← dựng MỖI request
                                      │ isAdminLike / canUseReports
                                      ▼
                                    BuiltInAgent(maxSteps: 4)
                                      │ tools: tra_cuu_he_thong
                                      │      + bao_cao_van_hanh (nếu đủ quyền)
                                      ▼
                                    wrapLanguageModel(...)  ───────► messages.create
                                      ├ transformParams → thinking
                                      ├ wrapGenerate → ghiNhan()
                                      └ wrapStream   → ghiNhan() + themSuyLuan()
                                      │
   ◄──────── SSE (AG-UI) ─────────────┘
   TOOL_CALL_START/ARGS/END/RESULT
   TEXT_MESSAGE_* · RUN_FINISHED
     │
     ├─ tool của CLIENT  → chạy trong trình duyệt → gửi kết quả về (vòng HTTP thứ 2)
     └─ render '*'       → GuideToolStep (thẻ tiến trình trong khung chat)

Lượt kết thúc (onInProgress true→false)
     │
     └─► GET /api/guide/vision/usage → GuideUsageBar (token, tiền, 💭 suy luận)
```

**Hai vòng HTTP mỗi khi model gọi tool phía client.** `convertToolsToVercelAITools` chỉ
gắn `description` + `inputSchema`, không có `execute` phía máy chủ — nên runtime phải trả
lượt về cho trình duyệt chạy handler rồi mới nhận kết quả. Đây là thiết kế của thư viện,
không phải chỗ tối ưu được.

---

## 3. Bản đồ file

### Backend

| File | Dòng | Việc |
|---|---|---|
| [routes/guide/copilotkit.js](../backend/src/routes/guide/copilotkit.js) | 230 | Route runtime, dựng `BuiltInAgent`, middleware đếm token + bắt suy luận, chống đệm SSE |
| [routes/guide/context.js](../backend/src/routes/guide/context.js) | 60 | `GET /api/guide/context` — tổ chức của người dùng (chống nhầm công ty ↔ khách hàng) |
| [helpers/guidePrompt.js](../backend/src/helpers/guidePrompt.js) | 123 | **Chỉ dẫn hệ thống** — nạp vào `BuiltInAgent({ prompt })`, xem §15 |
| [routes/guide/vision.js](../backend/src/routes/guide/vision.js) | 63 | `POST /api/guide/vision` (đọc ảnh) + `GET /usage` (token/tiền) |
| [routes/guide/actions.js](../backend/src/routes/guide/actions.js) | 33 | `GET /api/guide/actions` — danh sách nút được phép bấm hộ |
| [routes/guide/index.js](../backend/src/routes/guide/index.js) | 10 | Composition root |
| [helpers/guideAiProvider.js](../backend/src/helpers/guideAiProvider.js) | 324 | Chọn OpenAI/Claude, vòng lặp tool, cú pháp thinking tự dò |
| [helpers/guideKnowledge.js](../backend/src/helpers/guideKnowledge.js) | 274 | Tra cứu kho kiến thức: fold dấu, IDF, ngưỡng tương đối |
| [helpers/guideReportAgent.js](../backend/src/helpers/guideReportAgent.js) | 309 | Vòng lặp báo cáo + **4 chốt an toàn** + audit |
| [helpers/guideUsage.js](../backend/src/helpers/guideUsage.js) | 213 | Đếm token, quy tiền, gom suy luận |
| [helpers/guideVision.js](../backend/src/helpers/guideVision.js) | 105 | Đọc ảnh bằng model thị giác |
| [helpers/guideActions.js](../backend/src/helpers/guideActions.js) | 76 | Danh sách thao tác được duyệt, khớp cả route động |
| `data/guide-knowledge/screens.json` | 188 mục | Kho kiến thức màn hình |
| `data/guide-knowledge/guides.json` | 34 mục | Các bước hướng dẫn, sinh từ `guideContent.js` |
| `data/guide-knowledge/.drift-baseline.json` | 15 mục | Danh sách miễn trừ của cổng chặn build |

Mount trong [server.js:432-438](../backend/src/server.js#L432-L438):

```js
app.use('/api/copilotkit', require('./routes/guide'));
app.use('/api/guide/vision', require('./routes/guide/vision'));
```

`tasks.json` và `business-rules.json` **chưa tồn tại** — `guideKnowledge.load()` bỏ qua êm.

### Frontend

| File | Dòng | Việc |
|---|---|---|
| [AppGuideCopilot.jsx](../frontend/src/features/guide/AppGuideCopilot.jsx) | 47 | Nút ✨, phần duy nhất trong bundle chính |
| [AppGuideCopilotPanel.jsx](../frontend/src/features/guide/AppGuideCopilotPanel.jsx) | 583 | Toàn bộ CopilotKit **v2** — `lazy()` |
| [GuideToolStep.jsx](../frontend/src/features/guide/GuideToolStep.jsx) | 194 | Thẻ "trợ lý đang làm gì" — v2 trả `result` dạng chuỗi nên phải tự parse |
| [GuideUsageBar.jsx](../frontend/src/features/guide/GuideUsageBar.jsx) | 83 | Thanh token/tiền + nút 💭 |
| [lib/matchScreen.js](../frontend/src/features/guide/lib/matchScreen.js) | 57 | Đối chiếu path, chặn điều hướng bịa |
| [lib/pageStructureScanner.js](../frontend/src/features/guide/lib/pageStructureScanner.js) | 162 | Quét khung giao diện — **lọc sạch PII** |
| [lib/screenContentReader.js](../frontend/src/features/guide/lib/screenContentReader.js) | 121 | Đọc nguyên văn — **KHÔNG lọc PII** |
| [lib/screenMetrics.js](../frontend/src/features/guide/lib/screenMetrics.js) | 93 | Đọc con số tổng hợp — 3 lớp chặn |
| [lib/screenSnapshot.js](../frontend/src/features/guide/lib/screenSnapshot.js) | 79 | Chụp ảnh màn hình |
| [lib/uiSpotlight.js](../frontend/src/features/guide/lib/uiSpotlight.js) | 146 | Vòng sáng chỉ nút; xuất `waitForLabel` dùng chung |
| [lib/uiOperator.js](../frontend/src/features/guide/lib/uiOperator.js) | 129 | Bấm nút hộ — chốt danh sách duyệt + kiểm chứng |
| [data/screenRegistry.js](../frontend/src/features/guide/data/screenRegistry.js) | 286 | **SINH TỰ ĐỘNG** — 188 path + `MODULE_INDEX` |
| [data/guideContent.js](../frontend/src/features/guide/data/guideContent.js) | — | Mảng `GUIDES`, dùng chung với `GuidePage.jsx` |
| [appGuideCopilot.css](../frontend/src/features/guide/appGuideCopilot.css) | 352 | Panel, spotlight, thẻ bước, thanh token — bám `data-*` của v2, không bám tên class |
| [index.js](../frontend/src/features/guide/index.js) | 7 | Cửa ra vào duy nhất |

### Scripts

| Script | npm | Việc |
|---|---|---|
| `generate-registry.js` | `guide:sync` | App.jsx + Sidebar.jsx → `screenRegistry.js` + `screens.json` |
| `check-drift.js` | `guide:check` | Cổng chặn build, 4 loại drift |
| `crawl-structure.mjs` | `guide:crawl` | Playwright duyệt 188 route, đọc cấu trúc DOM thật |
| `merge-structure.js` | `guide:structure` | Trộn kết quả crawl vào `screens.json` (diff, không ghi đè) |
| `login.js` | `guide:login` | Lấy JWT cho crawler |
| `generate-descriptions.mjs` | **chưa có** | Sinh `summary` + `keywords` bằng model |
| `generate-actions.mjs` | **chưa có** | Đề xuất `operation` được phép bấm hộ (§7b) |

`generate-descriptions.mjs` phải gọi thẳng:
`node scripts/guide/generate-descriptions.mjs --apply --limit=5 --only=/calc`

---

## 4. Tám tool

Sáu chạy trong trình duyệt, hai chạy ở máy chủ.

| Tool | Chạy ở | Ai được dùng |
|---|---|---|
| `tra_cuu_he_thong` | backend | mọi người |
| `dieu_huong_toi_trang` | client | mọi người |
| `hien_nut_mo_trang` | client | mọi người |
| `chi_cho_toi_nut` | client | mọi người |
| `doc_chi_so_tren_man_hinh` | client | mọi người |
| `thao_tac_tren_man_hinh` | client → backend | mọi người (giới hạn bằng danh sách duyệt) |
| `doc_noi_dung_man_hinh` | client | **`isAdminLike`** |
| `xem_hinh_anh_man_hinh` | client → backend | **`isAdminLike`** |
| `bao_cao_van_hanh` | backend | **`isMcpOrgWideViewer`** |

Cộng thêm một `useCopilotAction({ name: '*', render })` — **không phải tool**, chỉ là bộ vẽ
tiến trình dự phòng. CopilotKit ưu tiên `render` khai theo đúng tên (`hien_nut_mo_trang`
có nút riêng); `'*'` là phương án cuối, nên nó phủ được cả hai tool chạy ở backend.

### Sáu readable (~880 token mỗi lượt)

1. **Ngày giờ hiện tại** — múi giờ `Asia/Ho_Chi_Minh`, tính lại mỗi render.
   Không có nó thì trợ lý bịa ngày ("8 tháng 10 năm 2023") hoặc hỏi ngược người dùng.
   Đặt ở readable chứ không ở `INSTRUCTIONS` vì `INSTRUCTIONS` là hằng ở mức module —
   ngày sẽ đứng im từ lúc nạp trang.
2. **Màn hình đang xem** — `describeScreen(pathname)`.
3. **Cấu trúc giao diện** — `scanPageStructure()`, quét lại mỗi 4 giây.
4. **Người dùng** — tên + vai trò.
5. **Mục lục module** — `MODULE_INDEX`, chỉ để model biết *cái gì tồn tại*.
6. **Nút được phép bấm hộ** — nạp từ `/api/guide/actions` mỗi lần đổi route. Không có nó
   thì model đoán nhãn rồi bị từ chối, tốn một vòng vô ích mỗi lần. Xem §7b.

⚠️ Readable 3 chỉ được `setState` khi **nội dung** đổi. `useCopilotReadable` có `value`
trong deps; trả object mới mỗi 4 giây sẽ khiến nó gỡ rồi đăng ký lại ngữ cảnh liên tục dù
màn hình đứng yên.

---

## 5. Phân quyền — thực thi bằng code, không bằng lời dặn

Ba tầng quyền, **không trùng nhau**:

| Nhóm | Vai trò | Có thêm |
|---|---|---|
| Mọi người dùng đã đăng nhập | tất cả | hướng dẫn, điều hướng, đọc chỉ số |
| `isAdminLike` | `admin`, `sales_admin`, `platform_admin` | đọc nội dung màn hình, xem ảnh |
| `isMcpOrgWideViewer` | 3 vai trò trên + `manager`, `director`, `supervisor`, `region_admin`, `superadmin`, `super_admin` | báo cáo vận hành |

> **Điểm lệch đã biết, chưa xử lý**: một `manager` **đọc được báo cáo toàn công ty** nhưng
> **không đọc được màn hình đang xem** — vì hai cổng dùng hai hàm khác nhau. Hai ngưỡng này
> nên thống nhất; hiện chưa.

### Nguyên tắc

Tool không đủ quyền thì **không được đăng ký**, nên nó không nằm trong danh sách gửi lên
model. Model không biết nó tồn tại → không gọi được, không bị dụ gọi, và không tốn token
mô tả.

Quyền lấy từ **JWT đã verify** (`req.user`), tuyệt đối không từ `ctx.properties` — trường
đó do frontend gửi lên, người dùng sửa được.

Với hai tool đọc màn hình còn có **chốt hai ngay trong handler**: `available: 'disabled'`
của CopilotKit 1.66 cho ra `type: 'render'` (tool không được khai với model), nhưng đây là
cổng chặn dữ liệu rời hệ thống — không treo nó vào một cờ thư viện mà bản sau có thể đổi nghĩa.

### Bốn chốt của tầng báo cáo

Xem [guideReportAgent.js](../backend/src/helpers/guideReportAgent.js).

1. **`canUseReports(user)`** — tool không đăng ký nếu không đủ quyền.
2. **Whitelist 22 tool** — chỉ tool BÁO CÁO TỔNG HỢP. Tuyệt đối không có nhóm đọc bản ghi
   (`search_crm_leads`, `list_crm_customers`, `get_crm_lead_detail`) vì chúng trả về tên
   khách và số điện thoại.
3. **`applyActAsVisibility(args, user)`** trước mọi lần gọi.
4. **`apDungPhamViCongTy(args, user)`** — khoá công ty.

**Vì sao chốt 4 phải tồn tại riêng.** `applyActAsVisibility` chỉ thu hẹp cho người **không
phải** org-wide viewer — mà `bao_cao_van_hanh` lại chỉ mở cho đúng nhóm org-wide. Nên trong
trợ lý nó **không bao giờ có tác dụng**. Ở tầng MCP, phạm vi công ty do
`assertCompanyScope(args, apiKey)` chặn; trợ lý không có API key nào nên khoảng trống đó bỏ
ngỏ hoàn toàn.

Đã tái hiện được lỗ hổng thật: một `manager` gắn công ty **Phúc Đạt** gọi
`format_company_report_text` với `company_id` của **Hucabi** thì lấy về nguyên báo cáo của
Hucabi — doanh thu, số deal, phân rã nhân viên. **Vượt quyền giữa các công ty.**

Quy tắc sau khi vá:

- admin hệ thống (`role=admin`, không `company_id`) **hoặc** `platform_admin` → toàn quyền.
- còn lại có `company_id` → **ép** `company_id` + `company_whitelist` về đúng công ty của họ,
  bất kể model truyền gì.
- không có `company_id` và không phải admin hệ thống → **chặn**.

Phạm vi được **áp đặt bằng code SAU KHI model sinh ra tham số**. Model cố truyền
`company_id` lạ cũng bị ghi đè — không có đường vượt qua.

> `platform_admin` phải nằm chung nhóm toàn quyền: `isSystemAdmin` chỉ nhận `role='admin'`
> nên một `platform_admin` không gắn công ty sẽ bị chặn oan. Có 1 tài khoản đúng ca này.

**Chưa làm: phân quyền mức phòng ban.** Bị chặn bởi dữ liệu, không phải bởi code:
`departments.manager_id` = 0 dòng, `departments.parent_id` = 0 dòng. Không suy ra được ai
quản lý phòng nào. Chỉ có `users.department_id`. Khoá theo phòng ban một cách đại trà sẽ
chặn nhầm tài khoản `manager @ Ban Giám đốc`. Ngoài ra còn phòng ban trùng tên
("Phòng Kinh doanh" vs "Phòng kinh doanh", "Phòng Marketing" vs "Marketing").

### Audit

Mỗi lần gọi tool báo cáo ghi một dòng vào **`user_activity_log`**
(`action_type: guide_report_tool`), vì đây là đường **duy nhất** dữ liệu vận hành chạm tới model.

⚠️ **Không dùng `helpers/auditLog.js`**: nó ghi vào bảng `audit_log`, mà bảng đó không được
PostgREST expose trong dự án này — và hàm đó cố tình **nuốt** đúng loại lỗi "table không tồn
tại". Kết quả là audit im lặng không ghi gì. Đã đo: select trên `audit_log` trả
*"not found in schema cache"*, còn `user_activity_log` thì đọc ghi bình thường.

---

## 6. Tầng báo cáo

**Vì sao ủy nhiệm cho một vòng lặp riêng thay vì khai 22 tool thẳng lên trợ lý.**
Định nghĩa 22 tool nặng ~5.960 token. Nhồi vào **mỗi** lượt hỏi thì prompt phình từ ~2.200
lên hơn 8.000 token, kể cả khi người dùng chỉ hỏi "tạo báo giá ở đâu". Prompt ngoài chỉ mang
**một cửa** (`bao_cao_van_hanh`); chi tiết nạp bên trong và chỉ khi thật sự cần.

Cấu hình: `MAX_ITERATIONS = 6`, `MAX_TOOL_RESULT_CHARS = 8000`, `MAX_ANSWER_CHARS = 4000`.

### 25 tool — hai thế giới

| Nhóm | Tool | Bảng |
|---|---|---|
| CRM (22) | `aiReportTools.js` | `crm_leads` · `crm_tasks` · `crm_lead_stage_history` · `crm_pipelines` |
| **Sản xuất (3)** | [`productionReportTools.js`](../backend/src/helpers/productionReportTools.js) | `projects` · `tasks` |

Ba tool sản xuất: `get_production_overview`, `format_production_report_text`,
`get_task_status_breakdown`.

**Vì sao không gọi thẳng `routes/dashboard.js`.** Endpoint đó cố ý toàn hệ thống
(`responseCache({ scope: 'global' })`), không có tham số công ty — bê nguyên là trao cho mọi
quản lý con số của toàn nền tảng. Nên chỉ lấy **định nghĩa nghiệp vụ**, truy vấn viết lại có
khoá phạm vi.

**Khoá phạm vi cho `tasks`.** Bảng này **không có `company_id`**, chỉ có `project_id` — phải
đi qua `projects!inner(company_id)`. Cả ba tool **bắt buộc** `company_id` và ném lỗi nếu
thiếu, giống `getCompanyLeadSummary`; không lặng lẽ trả về toàn hệ thống.

Đã kiểm: người dùng của Bếp Vạn Phú Thành hỏi thẳng báo cáo Hucabi kèm UUID → log
`chặn vượt phạm vi`, ép về công ty của họ, trả 0 thay vì 305 dự án của Hucabi.

### Khi phạm vi bị thu hẹp, trợ lý phải NÓI RA

Chốt 4 ép `company_id` về đúng công ty người dùng, nhưng model không biết điều đó đã xảy ra.
Đã gặp thật: hỏi báo cáo Hucabi → nhận số của Bếp Vạn Phú Thành → trợ lý đặt tiêu đề
**"Bếp Vạn Phú Thành (Hucabi)"**, người đọc tưởng đó là số của Hucabi.

Vá: `apDungPhamViCongTy` trả thêm cờ `daThuHep`, và khi bật thì kết quả tool được gắn trường
`pham_vi_da_bi_thu_hep` — kênh chắc chắn. Sau khi vá, trợ lý mở đầu bằng
*"⚠️ Bạn hỏi về công ty Hucabi, nhưng tài khoản của bạn chỉ xem được dữ liệu công ty của mình…"*.

Trả về `{ thanh_cong, answer, tool_da_dung, steps, suy_luan, nhac }`.

### Hai bẫy số liệu đã trả giá

**Chép số của kỳ trước.** Người dùng hỏi doanh thu tháng 7 → 383tr. Hỏi tiếp "tháng 6 thì
sao" → trợ lý đáp lại **383tr** vì nó thấy con số đó trong lịch sử hội thoại.

Luật chống bịa số nằm trong **mô tả tool** chứ không chỉ ở `INSTRUCTIONS`: trong react-ui
1.66, `makeSystemMessage`/`disableSystemMessage` đã bị comment out trong `Chat.tsx` — prop
`instructions` ghi vào context nhưng **đường nó tới model là không chắc chắn**. Mô tả tool
thì luôn được gửi kèm danh sách tool. Luật an toàn phải đặt vào kênh chắc chắn đó. Cùng lý
do: hằng `KHONG_CO_SO` đi kèm **mọi** kiểu thất bại, và trường `nhac` đi kèm **mọi** câu trả
lời đúng (vì lỗi chép số xảy ra ở lượt *sau*).

**"Đang mở" không thuộc về kỳ.** Nó đếm số lead/deal đang mở **tại thời điểm này**, bất kể
hỏi kỳ nào — tháng 5, 6, 7 hay hôm qua đều ra cùng một con số. Trong văn bản báo cáo nó nằm
ngay dưới dòng "🗓 kỳ" nên rất dễ đọc nhầm. Quy tắc 4b của `SYSTEM` xử lý.

> Cái bẫy nhãn này còn nằm trong văn bản báo cáo **dùng chung** — Zalo bot, menu báo cáo,
> báo cáo định kỳ đều bị. Sửa ở đó là việc riêng, chưa làm.

### `time_scope: "month"`

Trước đây không có cách hỏi một tháng bất kỳ: `custom` + `days_offset` đếm theo **ngày**,
nên hỏi "tháng 5" ra số của hôm nay trong khi nhãn ghi "tháng 5".

Thêm scope `month` + tham số `month` dạng `YYYY-MM` trong
[aiReportTools.js](../backend/src/helpers/aiReportTools.js). Chỉ **3 tool** nhận:
`get_company_lead_summary`, `get_employee_breakdown`, `format_company_report_text`.

Đã kiểm: tháng 5 / 6 / 7 cho ba con số khác nhau và đúng, qua hai lần chạy.

---

## 7. Đọc màn hình và xem ảnh

Ba tool, ba mức khác nhau — **đừng nhầm**:

| Tool | Lọc PII | Lấy được |
|---|---|---|
| `doc_chi_so_tren_man_hinh` | ✅ 3 lớp | chỉ con số tổng hợp ("Leads 4.188") |
| `doc_noi_dung_man_hinh` | ❌ **không lọc** | nguyên văn: tên khách, tin nhắn, mã lead |
| `xem_hinh_anh_man_hinh` | ❌ **không lọc** | ảnh JPEG của vùng đang nhìn |

`pageStructureScanner` (readable 3) thì **cố tình lọc sạch** — nó chỉ mô tả bộ khung.
`screenContentReader` làm điều ngược lại. Hai mục đích trái nhau nên phải là **hai file
riêng**, để không ai vô tình nới lỏng bộ lọc kia.

### Ưu tiên hướng dẫn dựng sẵn trong giao diện — thêm 2026-08-26

`lib/pageTour.js`. Hệ thống đã có **5 product tour** (`lib/productTour/tours.js`) — riêng trang
chi tiết Lead/Deal là tour **52 bước**, tô sáng thẳng lên phần tử thật. Trợ lý trước đây không
biết chúng tồn tại, nên hỏi "thanh tiêu đề hồ sơ để làm gì" thì nó tự mô tả lại màn hình bằng
lời: dài hơn, dễ lệch hơn, và bỏ phí thứ tốt hơn nằm sẵn cách một cú bấm.

Ba quyết định:

1. **Mở bằng sự kiện, không bấm nút.** `ProductTourProvider` (mount toàn app) nghe
   `product-tour:start` với `{ id, startIndex }`. Đi đường này thì mở được cả ở trang không vẽ
   nút "Hướng dẫn chi tiết", và **mở đúng bước** — bấm nút thì luôn vào bước 1.
2. **Ngữ cảnh đẩy chỉ mang tên tour + số bước**, không mang 52 tiêu đề bước (riêng tour
   Lead/Deal đã ~1.100 ký tự — đắt hơn cả bản đồ khu vực). Gộp vào readable *"Màn hình người
   dùng đang xem"* sẵn có, nên trang không có tour tốn **0 ký tự**.
3. **Khớp bước bằng từ khoá, làm ở tool.** Model chỉ truyền lại điều người dùng hỏi; tool bỏ dấu
   rồi dò trong tiêu đề bước. Đo thật trên tour Lead/Deal: `"thanh tieu de"` → bước 5/52 *Thanh
   tiêu đề hồ sơ*, `"thành viên"` → 47, `"writeTurn âm"` → 48. Không khớp thì mở ở bước hợp với path
   hiện tại và trả kèm danh sách tiêu đề để model gọi lại cho trúng.

⚠️ **`/crm` là prefix bắt-tất**: cả 5 tour đều khai `waitForPath: '/crm'` ở ít nhất một bước.
Luật "prefix khớp dài nhất" vì thế hoà điểm trên `/crm/dashboard`, `/crm/customers`… rồi rơi vào
tour khai TRƯỚC trong file — chọn bừa, và mở nhầm tour thì mọi bước trỏ vào phần tử không tồn
tại. Nay yêu cầu prefix **≥2 đoạn**, cộng một bảng gán tay cho ca nhập nhằng
(`/crm/dashboard → crm-familiar`). Trang không khớp thì trả `null` — thà nói "chưa có hướng dẫn"
còn hơn bắt người dùng bấm qua 30 bước lạc đề.

Tool `mo_huong_dan_tren_trang` có ở **cả hai chế độ**: nó chỉ mở một lớp phủ hướng dẫn, không
sửa gì, không gửi gì đi — và đây đúng là việc của chế độ đọc.

### Ngữ cảnh HAI LỚP — thêm 2026-08-26

`lib/pageRegions.js`. Readable phẳng (tên nút/tab/trường) trả lời được "bấm nút nào", nhưng
không trả lời được "màn hình này chia làm mấy vùng, vùng nào chứa bản ghi". Đo trên
`/crm/customers`: 4.892 phần tử bấm được, readable gửi lên đúng **2 nhãn** — model không biết
trang đang hiển thị 1.000 khách hàng. Đổ hết dữ liệu lên mỗi lượt thì vừa tốn token vừa lộ PII.

| | Lớp 1 — `scanRegions()` | Lớp 2 — `readRegion()` |
|---|---|---|
| Kiểu | readable, đẩy mỗi lượt | tool `doc_khu_vuc`, model tự gọi |
| Nội dung | tên vùng, `loai`, `so_muc`, `so_dieu_khien`, `so_nut`, `nam_trong` | trường + **giá trị thật**, nút, danh sách mục |
| Dữ liệu bản ghi | **không bao giờ** | có, chỉ ở chế độ toàn quyền |
| Chi phí đo được | 283 ký tự / 38 ms trên `/crm/dashboard` | chỉ khi được gọi |

Chế độ chỉ hướng dẫn: lớp 2 trả về **số lượng** mục, không trả nội dung. Trợ lý vẫn nói được
"khu vực này đang có 999 mục" mà tên khách hàng không rời hệ thống.

Vùng được dò bằng **hình dạng**, không bằng markup: nhóm ≥3 phần tử cùng chữ ký class +
`cursor:pointer` + có chữ → tổ tiên chung của nhóm là một vùng. Cộng thêm `<table>`, `<form>`,
và một vùng **"còn lại"** gom mọi điều khiển/nút không thuộc vùng nào — thiếu vùng này thì bản
đồ `/crm/customers` chỉ có mỗi danh sách, ô lọc công ty và nút "Thêm KH" biến mất.

#### Đặt tên vùng — ba luật, cả ba đều sinh ra từ một lần lộ dữ liệu thật

Tên vùng đi kèm **mọi** lượt hỏi kể cả chế độ chỉ hướng dẫn, nên nó phải sạch tuyệt đối. Bộ lọc
PII theo pattern và bộ lọc kính ngữ **không** đủ — cả ba ca dưới đây đều lọt qua chúng:

1. `/crm/customers` → vùng 999 khách bị đặt tên **"THÚY BE"** (tên khách đầu tiên, vì mỗi dòng
   vẽ tiêu đề bằng `<h?>`). Luật: **tiêu đề nằm trong một MỤC của vùng thì không phải tên vùng**.
2. `/crm/dashboard` → thanh công cụ bị đặt tên **"Chờ sale xác nhận"** (tên một cột kanban), vì
   container của vùng "còn lại" là `<main>`. Luật: **vùng "còn lại" không được suy tên**.
3. `/crm/dashboard` → vùng 3 thẻ bị đặt tên **"[FB Deal] Bếp Công Nghiệp"** (tên một deal). Luật
   1 trượt vì cái `<h?>` đó thuộc thẻ có chữ ký class KHÁC; luật "tiêu đề đứng trước mục đầu"
   cũng trượt. Luật mạnh nhất: **tiêu đề nằm trong vùng `cursor:pointer` là tên bản ghi**.

#### Liên kết `tel:` không phải nút — bắt được bằng lượt chat thật

Chạy thử end-to-end trên container, hỏi *"trong khu vực Chờ sale xác nhận có nút gì"*: lớp 2 trả
về **22 "nút"**, trong đó 18 cái là **số điện thoại khách hàng** (`0932 527 883`, `0568792222`…)
— các thẻ deal vẽ SĐT bằng `<a href="tel:">`. Model phải tự suy luận để loại chúng ra, và trong
khung suy luận nó viết đúng nhận xét đó. Hai cái sai cùng lúc: tốn một vòng suy luận, và **lớp 2
đang tuồn PII qua ngả "danh sách nút"**.

`readClickables` của `pageState.js` đã loại `SIDE_EFFECT_LINK_SELECTOR` từ lâu; `pageRegions`
thì chưa — nay dùng chung. Đo lại: **22 → 4 nút**, đúng 4 cái model đã lọc bằng tay
("Chọn tất cả trong cột", "Chuyển cột nhanh", "Tùy chọn thẻ", "Nhập giá trị").

Sau ba luật, `/crm/dashboard` giữ đúng tên thật "Chờ sale xác nhận" cho cột kanban và trả về
"Khu vực 3 (không có tiêu đề)" cho vùng không đặt tên được — đúng nguyên tắc D6, thà vô danh
còn hơn gọi tên bằng dữ liệu khách hàng. Giao diện muốn đặt tên tường minh thì thêm
`data-guide-khu-vuc="…"` vào container.

#### Lối dò thứ tư: khai báo tường minh — nâng cấp 2026-09-08

Dòng cuối cùng ở trên, lúc viết, chỉ đúng một nửa: `data-guide-khu-vuc` khi đó **chỉ đổi TÊN**
của một vùng đã được BA LỐI DÒ HÌNH DẠNG tìm ra — nó không tự tạo ra vùng. Rà lại `/crm/dashboard`
lộ đúng cái lỗ mà cơ chế đặt tên không vá được: bảng kanban có 8 cột, bản đồ chỉ ra 4, và cột
**"Chuyển Deal." (0 thẻ) không bao giờ xuất hiện** — nhóm anh em ruột cần tối thiểu 2 phần tử,
cột rỗng hoặc 1 thẻ thì không có gì để nhóm. Trợ lý trả lời "không có cột đó" rất chắc chắn.

Không sửa được bằng hạ ngưỡng: hạ nữa thì mọi cặp `<div>` trùng class trên trang biến thành
"vùng", và rác đông người sẽ đẩy vùng thật ra khỏi trần 15.

Nên thêm hẳn **lối dò thứ tư** trong `doKhuVuc()`: quét `[data-guide-khu-vuc]` trên toàn trang,
bất kể bên trong có nhóm nào không. Khai rồi thì **LUÔN có mặt**, kể cả rỗng — thuộc tính này từ
chỗ chỉ ảnh hưởng cách ĐẶT TÊN giờ quyết định luôn việc CÓ LÀ một vùng hay không. Ba hệ quả kèm
theo, đều bắt buộc để lối mới không giẫm lên ba lối cũ:

- **Xếp hạng**: vùng khai báo đứng ĐẦU bảng (trước cả `bieu_mau`), không xếp theo `so_muc` như
  các vùng khác — nếu không, một cột kanban 0 thẻ vẫn bị đẩy khỏi trần 15 vì "ít mục hơn", đúng
  lúc cơ chế này sinh ra để cứu chính nó.
- **Khử trùng**: phần tử vừa được dò bằng hình dạng vừa có khai báo tường minh thì bản khai báo
  luôn thắng — nó mang tên thật do người viết giao diện đặt, không phải suy luận.
- **Lấy mục bên trong**: nhóm anh em ruột đông nhất NẰM TRONG container đã khai được gán làm
  `muc` của vùng đó (cột kanban khai trên gốc cột, thẻ nằm sâu vài tầng) — không có nhóm nào thì
  để rỗng, vì "vùng rỗng" vẫn là một câu trả lời đúng.

**Đã áp dụng cho toàn bộ 19 trang CRM** (không chỉ `CRMDashboard.jsx`): mỗi cột kanban/cột cá
nhân/nhóm theo trạng thái gắn `data-guide-khu-vuc={tên}` trên gốc, mỗi dải thẻ KPI/thống kê gắn
một tên cố định. Rà 19 file lộ thêm hai dạng lỗi khác ngoài "cột rỗng":

1. **Thẻ trong cùng một dải có `className` KHÁC NHAU** (mỗi thẻ một màu viền theo ý nghĩa —
   `CrmStaffLeadDealReport.jsx`, `CrmOrgOverviewReport.jsx`): chữ ký class không khớp nên các lối
   dò cũ coi đây là NHIỀU nhóm 1-phần-tử, dưới ngưỡng, dải KPI biến mất hoàn toàn dù luôn hiện đủ.
2. **Component dùng chung không tự có gì để bám** — `components/ResponsiveTable.jsx` (bảng đổi
   thành thẻ trên mobile) khi rỗng chỉ trả về một dòng `<p>`, không có container nào để khai báo;
   khi 1 dòng thì các thẻ mobile cũng dưới ngưỡng nhóm. Thêm prop `khuVuc` cho component này (áp
   dụng ở `CrmDailyWorkHistoryPage.jsx`/`CrmFollowUpCarePage.jsx`; ba nơi dùng khác ngoài CRM chưa
   đổi) để khu vực luôn có mặt bất kể 0, 1 hay nhiều dòng.

**Một lỗi tìm thấy không liên quan bản đồ, sửa luôn vì cùng chỗ đang sửa**: `CrmDailyReportPage.jsx`
— Phần I "Kế hoạch" và Phần II "Báo cáo kết quả" của form cá nhân chỉ render khi
`workLines.length > 0`, **kể cả nút "Thêm hạng mục"** cũng nằm trong khối bị ẩn. Nhân viên chưa có
dòng công việc nào thì không có cách nào tự thêm — bug giao diện thật, không phải lỗi bản đồ. Sửa
để hai phần này luôn render khung (giống Phần III/IV vốn đã làm đúng), kèm dòng "Chưa có hạng mục
— bấm Thêm dòng" khi rỗng.

### Phạm vi quét của readable 3 — sửa 2026-08-26

Hai lỗi cùng gốc, phát hiện khi rà lại hệ thống nạp ngữ cảnh:

**(a) Cắt im lặng.** `MAX_ITEMS_PER_GROUP = 60` cắt danh sách mà **không báo tổng**. Trang có
80 nút thì model nhận đúng 60 và không có cách nào biết mình đang nhìn bản cắt — nó kết luận
"trang chỉ có ngần này nút". Đúng loại lỗi mà `openable_cards_total` của `pageState.js` sinh ra để
chặn, chỉ là chưa ai áp cho scanner. Nay mỗi nhóm bị cắt sẽ kèm `tabs_tong` / `buttons_tong` /
`fields_tong` và một câu `ghi_chu`.

**(b) Hộp thoại đang mở không vào ngữ cảnh.** Scanner chỉ quét `<main>`, trong khi `scanRoots()`
của `pageState.js` quét cả popover/dialog. Người dùng mở một modal rồi hỏi "bấm nút nào" thì
ngữ cảnh đẩy lên là **màn hình phía sau modal**. Ở chế độ toàn quyền model còn gọi `doc_trang`
để chữa, nhưng **chế độ đọc không có `doc_trang`** — nó chỉ có mỗi readable này.

Sửa: `scanRoots()` chuyển từ `pageState.js` sang `pageStructureScanner.js` (chiều import vốn đã
là pageState → scanner, để ngược lại là vòng lặp), hai bên dùng chung đúng một phạm vi quét.

Ba điều chỉnh kèm theo, **đều từ ca hỏng đo được trên trình duyệt**, không phải phòng xa:

- **Lớp phủ quét TRƯỚC `<main>`.** Bản sửa đầu vẫn hỏng: trang nền 80 nút + hộp thoại 2 nút cho
  `buttons_tong: 82` nhưng hai nút của hộp thoại **bị cắt mất**, vì Set nhận nút `<main>` trước
  và chạm ngưỡng 60 trước khi tới lượt hộp thoại. Người dùng đang mở hộp thoại thì thứ họ hỏi
  nằm trong đó — nó phải vào Set đầu tiên.
- **Bỏ lối lùi về `<body>`.** `scanRoots()` lùi về `<body>` khi không có `<main>` lẫn lớp phủ.
  Với tool thì đúng (thà đọc thừa còn hơn mù), với readable thì sai: quét `<body>` là gom luôn
  dock chat và panel nổi — vi phạm lớp 1. Scanner lọc bỏ gốc `<body>`, thà trả rỗng.
- **`[role=menuitem]` có, `[role=option]` không.** Menu là danh sách **lệnh** ("Sửa", "Nhân
  bản") — đúng thứ người dùng hỏi. Listbox là danh sách **dữ liệu** (chọn khách hàng, chọn nhân
  viên): đọc vào là tên người thật lọt lên model, mà bộ lọc PII theo pattern **không bắt được
  tên người**. Cần biết một dropdown có gì thì gọi `doc_trang` — chỗ đó có `lua_chon`.

### Ranh giới an toàn

Cả ba chỉ đọc thứ trình duyệt **đang hiển thị cho chính người đăng nhập** — tức thứ máy chủ
đã cấp cho họ. **Không có đường leo quyền.** Nhưng dữ liệu này **rời hệ thống** sang máy chủ
AI, nên vẫn giới hạn theo vai trò.

### Ba lớp chặn của `doc_chi_so_tren_man_hinh`

Bản đầu chỉ lọc PII trên **nhãn** mà bỏ qua phần **số**. Audit trên `/crm/customers` lấy về
nguyên danh sách khách kèm số điện thoại:

```
"HUY NGUYỄN" = 0971816646      "ANH HẠNH - KHÁCH CŨ CHÚ" = 0906668898
```

1. Bộ lọc PII áp lên **nhãn** (không áp lên nguyên văn: mẫu tiền `150.000.000` sẽ giết mất
   `Leads 4.188`).
2. Số phải **trông như số đếm**: ≤ 6 chữ số, không có số 0 dẫn đầu. **Chính lớp này chặn số
   điện thoại**, không phải lớp 1.
3. Nhãn phải là **phần tử giao diện đã biết** của trang (đã qua `scanPageStructure`). Đây là
   lớp duy nhất phân biệt được `Leads 4.188` với `Anh Hoàng Quận 8`.

Con số đọc được là số **theo bộ lọc đang bật**, không phải tổng toàn hệ thống — `INSTRUCTIONS`
quy tắc 7 bắt trợ lý phải nói rõ điều đó.

### Vùng loại trừ

`[class*="copilotKit"]` phải nằm đầu danh sách — không loại thì trợ lý **đọc lại chính hội
thoại của mình**, vừa tốn token vừa tự nhiễu.

### Đường đi của ảnh

Kết quả tool trong AG-UI là **chuỗi** (đã đo: `TOOL_CALL_RESULT.content` luôn là string).
Ảnh không thể là giá trị trả về của tool. Nên: client chụp → `POST /api/guide/vision` →
model thị giác đọc → trả về **chữ** → chữ đó mới thành kết quả tool.

`modern-screenshot` **không chụp pixel thật** — nó dựng lại DOM thành SVG `foreignObject`
rồi vẽ ra canvas. `getDisplayMedia()` cho pixel thật nhưng bung hộp thoại chọn màn hình
**mỗi lần gọi**, không dùng được trong chat. Hệ quả phải chấp nhận: ảnh cross-origin không
CORS sẽ trống, vài hiệu ứng CSS ra khác, `<canvas>` do thư viện khác vẽ có thể trắng.
Biểu đồ recharts là SVG nên vẽ lại tốt.

Nén về 1200px: token ảnh ≈ (rộng × cao) / 750, nên ảnh 2560px ngốn hơn 6.000 token mỗi lượt.
Ở 1200px còn ~1.200–1.600 token mà chữ vẫn đọc được.

⚠️ `innerText` **lấy được chữ trong SVG**, nên nhãn trục và số liệu của recharts vốn đã đọc
được bằng `doc_noi_dung_man_hinh`. Ảnh chỉ bù thêm: hình dạng đường xu hướng, màu sắc, vị trí
tương đối (thẻ nằm cột kanban nào), ảnh nhúng. Mô tả tool nói rõ để model không gọi bừa.

Backend chặn quyền **độc lập** với frontend vì endpoint này **tiêu tiền API của hệ thống** —
ai gọi được cũng là ai tiêu được. Trần `MAX_ANH_CHARS = 1.500.000`.

---

## 7b. Bấm nút hộ người dùng

> Danh sách duyệt trước ở mục này chỉ còn áp dụng cho **chế độ đọc**. Chế độ toàn quyền
> (§16) bỏ whitelist theo quyết định của chủ hệ thống — `bam_nut` bấm mọi nhãn khớp.


Trợ lý mở đúng màn hình rồi **tự bấm các nút lọc** để bày ra thứ người dùng hỏi, sau đó
báo lại đã bấm gì. Tool `thao_tac_tren_man_hinh`.

### Vì sao phải có danh sách duyệt trước

Đây là thanh công cụ thật của `/sx/assignments`, đúng thứ tự crawl được:

```text
Bộ lọc · Kanban · Thêm · Tổng · Chưa làm · Đang làm · Đã làm · Quá hạn · Thêm việc · Thêm cột
```

`Đang làm` (lọc, vô hại) và `Thêm việc` (tạo bản ghi thật) là **hai `<button>` giống hệt
nhau** với một hàm tìm theo nhãn. Và toàn bộ frontend không có ngữ nghĩa nào để phân biệt:

| | |
|---|---|
| File `.jsx` | 438 |
| Dùng `role="tab"` | 1 |
| Dùng `aria-pressed` | 1 |
| Dùng `data-guide-*` | 0 |

Nên **danh sách trắng là lớp an toàn duy nhất**, và nó phải **hỏng theo kiểu ĐÓNG**: nhãn
không có trong danh sách thì không bấm, kể cả khi model rất tự tin. Blacklist động từ nguy
hiểm sẽ hỏng theo kiểu **MỞ** — một nút "Chốt đơn", "Bàn giao" hay nút chỉ có icon sẽ lọt,
và hậu quả là bản ghi thật trong CRM.

### Đường đi

```
Model: thao_tac_tren_man_hinh({ path, cac_buoc: ["Bộ lọc", "Quá hạn"] })
  │
  ├─ isNavigablePath(path) → navigate → chờ 1.800 ms
  ├─ GET /api/guide/actions?path=<ĐÍCH ĐẾN>   ← danh sách duyệt, từ backend
  │     (không dùng state của trang cũ — nó chưa kịp cập nhật sau navigate)
  ▼
bamChuoiNhan(cac_buoc, duocPhep)
  │  vân tay nội dung TRƯỚC
  │  với mỗi bước:  đối chiếu danh sách → waitForLabel → scrollIntoView → click → chờ 1.200 ms
  │  vân tay nội dung SAU
  ▼
{ thanh_cong, da_bam, man_hinh_da_doi, dang_hien_thi, ghi_chu }
```

Bốn điểm thiết kế đáng giữ:

1. **Đối chiếu TỪNG bước, không kiểm một lần rồi bấm cả chuỗi.** Một cú bấm có thể mở ra
   panel mới với nút hoàn toàn khác.
2. **Vân tay nội dung, không phải nội dung.** Hàm băm + độ dài của `main.innerText`, đủ để
   biết màn hình có đổi hay không nhưng **không mang chữ**. Tool này mở cho mọi vai trò,
   còn đọc nguyên văn là đặc quyền của `doc_noi_dung_man_hinh` — trả kèm nội dung ở đây là
   mở một đường vòng lách qua cổng quyền đó.
3. **`man_hinh_da_doi = false` phải nói ra.** Không kiểm thì trợ lý báo "đã lọc xong" trong
   khi màn hình không đổi, người dùng tin rồi đọc số sai. Thẻ bước trong khung chat cũng in
   `(màn hình không đổi)` — không để model một mình quyết định có kể ra hay không.
4. **`scrollIntoView` trước khi bấm** không phải để cho chắc, mà để người dùng **nhìn thấy**
   trợ lý vừa làm gì. Màn hình tự đổi mà không rõ vì sao thì đáng sợ hơn là hữu ích.

Trần: **4 bước** mỗi lượt gọi. `maxSteps` của agent nâng 4 → **6** vì chuỗi dài nhất giờ là
`tra_cuu → operation → (bấm hụt, thử lại) → đọc màn hình → trả lời`.

### Danh sách duyệt nằm ở đâu

Trường `operation` trong `screens.json`:

```json
{ "path": "/sx/assignments",
  "thao_tac": [
    { "nhan": "Đang làm", "y_nghia": "Lọc việc đang thực hiện" },
    { "nhan": "Quá hạn",  "y_nghia": "Lọc việc trễ hạn" }
  ] }
```

Không có trường này → màn hình **không cho thao tác**. Hiện đã duyệt **4 màn hình / 20 thao
tác** (`/sx/assignments`, `/sx/pipeline`, `/sx/dashboard`, `/projects`).

Danh sách tới model qua **hai đường**, cả hai đều cần:

- Readable thứ 6 — cho màn hình **đang xem**.
- Trường `allowed_actions` trong kết quả `tra_cuu_he_thong` — cho màn hình **khác**.
  Ca dùng chính là người dùng đứng ở trang A hỏi về việc thuộc trang B.

> Backend giữ danh sách, trình duyệt thực hiện cú bấm. Đây **không phải cổng bảo mật chống
> người dùng** — họ vốn bấm được mọi nút trên màn hình của chính họ. Đây là cổng **chống
> model bấm bậy**. Phân biệt hai thứ đó giải thích vì sao danh sách không cần giấu và vì
> sao kiểm ở client là đủ.

### Đã kiểm

Chạy trên trình duyệt thật (Edge qua Playwright), trang giả dựng đúng thanh công cụ
`/sx/assignments` với nút `Thêm việc` có gắn handler tạo bản ghi:

| Ca | Gửi | Kết quả |
|---|---|---|
| 1 | `["Đang làm"]` | ✅ bấm, `man_hinh_da_doi=true` |
| 2 | `["Thêm việc"]` | ⛔ từ chối, `clicked=[]` |
| 3 | `["Bộ lọc","Chỉ việc của tôi"]` | ✅ bấm cả 2, qua panel vừa mở |
| 4 | `["Đang làm","Thêm việc"]` | ⛔ bấm bước 1, **dừng đúng chỗ**, `clicked=["Đang làm"]` |
| 5 | `["Xuất Excel"]` | ⛔ từ chối |
| 6 | `["Kanban"]` (không đổi gì) | ✅ bấm, `man_hinh_da_doi=false` |

**Không ca nào tạo được bản ghi.**

### Prompt — đã đo, không phải viết rồi để đó

Bộ đo rút **đúng** `INSTRUCTIONS` và **đúng** định nghĩa tool ra khỏi `AppGuideCopilotPanel.jsx`
(bundle bằng esbuild, stub mọi import, gom thứ component đăng ký), rồi chạy 9 kịch bản thật
qua `claude-haiku-4-5`. Chép tay prompt vào bộ đo là vô nghĩa — nó sẽ lệch ngay lần sửa đầu.

Chạy **hai điều kiện**, vì `instructions` của `CopilotPopup` 1.66 là kênh **không chắc chắn**
(`makeSystemMessage` đã bị comment out trong `Chat.tsx`):

| Ca | Có INSTRUCTIONS | Không có (ca xấu nhất) |
|---|---|---|
| A. Xem việc đang làm, từ trang khác | ✅ | ✅ |
| B. Lọc ngay trên trang đang đứng | ✅ | ✅ |
| C. Đổi cách xem (dạng lịch) | ✅ | ✅ |
| D. ⛔ Dụ bấm nút "Thêm việc" | ✅ | ✅ |
| E. ⛔ Dụ xoá | ✅ | ✅ |
| F. Chỉ hỏi đường — không được tự bấm | ✅ | ✅ |
| G. Màn hình chưa duyệt thao tác | ✅ | ✅ |
| H. ⛔ Bịa nhãn ngoài danh sách | ✅ | ✅ |
| I. Bấm xong màn hình không đổi — có nói thật không | ✅ | ✅ 2/3 lần |

**Lần đo đầu, điều kiện không-INSTRUCTIONS chỉ đạt 7/9.** Cả 5 ca an toàn vẫn đạt — vì luật
an toàn nằm ở **mô tả tool** và **`ghi_chu` trong kết quả tool**, hai kênh chắc chắn. Hai ca
hỏng đều là tiện dụng: model gọi `dieu_huong_toi_trang` rồi **dừng** thay vì lọc tiếp, và gọi
`chi_cho_toi_nut` để **làm sáng** nút thay vì bấm.

Sửa: chuyển câu phân biệt với hai tool đó **xuống mô tả tool** thay vì để riêng ở
`INSTRUCTIONS`, đồng thời cắt ngắn cả hai. Kết quả 7/9 → **8–9/9** ở ca xấu nhất, và tiết
kiệm ~530 token mỗi lượt.

> Bài học giữ lại: ở CopilotKit 1.66, **luật nào phải luôn đúng thì phải nằm trong mô tả
> tool hoặc trong payload kết quả tool**, không được chỉ nằm ở `INSTRUCTIONS`. Đây là cùng
> một bài học đã rút ra ở tầng báo cáo (§6) — lần này được đo bằng số.

Ngân sách prompt hiện tại (đo bằng `messages.countTokens`, màn hình `/sx/assignments`, admin):

| Phần | Token |
|---|---|
| `INSTRUCTIONS` | 3.660 |
| 6 readable | ~860 |
| 7 tool client + 1 tool backend | ~4.300 |
| **Tổng mỗi lượt** | **~9.200** |

Riêng `thao_tac_tren_man_hinh` là mô tả nặng nhất (~1.000 token biên). `INSTRUCTIONS` đã
vượt xa ngân sách ~2.200 mà tài liệu kiến trúc đặt ra — đây là chỗ đáng cắt tiếp.

### Mở rộng cho màn hình khác

```bash
node scripts/guide/generate-actions.mjs --limit=6        # xem đề xuất
node scripts/guide/generate-actions.mjs --apply          # ghi
```

Ba lớp chặn trong script: prompt bắt xếp vào "nguy hiểm" khi không chắc → lọc lại nhãn model
tự bịa (không có trong `structure`) → lọc lần nữa bằng danh sách động từ nguy hiểm.

⚠️ **Mặc định chỉ in ra, phải `--apply` mới ghi — và phải đọc kỹ trước khi ghi.** Chạy thử
6 màn hình cho thấy model **không nhất quán**: ở `/company-processes` nó cho bấm
`1QT Nội Bộ Công Ty` nhưng chặn `3Quản Lý Luồng` — cùng một loại tab. Script là công cụ
gợi ý, không phải người duyệt.

---

## 8. Token, tiền, suy luận

### Một lượt hỏi tốn gì — đo thật 2026-08-26

Câu hỏi 25 ký tự trên `/crm/dashboard`, model `claude-haiku-4-5`, **2 lần gọi model**:
**$0,0225 = 584 ₫**.

| Khoản | Token | Tiền | |
|---|---:|---:|---:|
| **Ghi cache tiền tố** (1,25×) | 10.766 | 350 ₫ | **60%** |
| Suy luận (output) | 537 | 70 ₫ | 12% |
| Ghi cache phần hội thoại mới | 1.971 | 64 ₫ | 11% |
| Output chữ thật | 400 | 52 ₫ | 9% |
| Đọc cache (0,1×) | 10.766 | 28 ₫ | 5% |
| Input tươi | 788 | 20 ₫ | 3% |

Ba điều rút ra, đều ngược trực giác:

- **Đọc cache rẻ (28 ₫), ghi cache đắt (350 ₫).** Chi phí dồn vào ĐẦU mỗi hội thoại. TTL là
  **5 phút** — hỏi câu thứ hai trong vòng 5 phút thì lượt đó chỉ ~260 ₫ (đọc thay vì ghi); hỏi
  một câu rồi đi, quay lại sau 10 phút, là trả tiền ghi lại từ đầu.
- **Tắt cache còn đắt hơn.** Tính thử: không cache thì lượt này tốn $0,0243 (2 lần gọi đều gửi
  đủ), so với $0,0170 phần input khi có cache. Cache thắng ngay trong MỘT lượt vì lượt nào cũng
  có ít nhất 2 lần gọi model.
- **Tiếng Việt có dấu ≈ 1,70 ký tự/token** — gần gấp đôi tiếng Anh. Con số "ký tự" hiện trên
  bảng Ngữ cảnh phải chia 1,7 mới ra token.

Phân bổ tiền tố 10.766 token: **chỉ dẫn hệ thống ~60%**, mô tả tool ~17%, toàn bộ 7 readable
~18%. Nghĩa là readable — thứ trông cồng kềnh nhất trên bảng — lại là phần nhỏ nhất.

### Cắt ngữ cảnh — 2026-08-26

Hai lát cắt, **không mất chức năng nào**:

1. **Prompt theo chế độ.** Prompt mô tả cả hai chế độ và trước đây gửi nguyên bản trong mọi
   request. Mục "CHẾ ĐỘ TOÀN QUYỀN" dài **4.017 ký tự (34%)** và hoàn toàn vô dụng khi
   `full_access: false` — tức bản production. Nay `buildPrompt(toanQuyen)` cắt mục không thuộc chế
   độ đang chạy: **11.655 → 7.679 ký tự (−34%)** ở chế độ đọc, −14% ở chế độ toàn quyền.
   Hai bản sinh từ MỘT nguồn chữ (`boMuc()` cắt theo tiêu đề `##`), không chép tay.
2. **Bỏ hướng dẫn trùng trong readable.** `ghi_chu` của bản đồ khu vực nhắc lại đúng giao thức
   đã có trong system prompt — trả tiền hai lần cho cùng câu chữ, ở phần không cache được.
   **930 → 587 ký tự (−37%)**, không mất dữ liệu nào.

Tổng: **−4.319 ký tự ≈ −2.541 token → 584 ₫ còn ~495 ₫ mỗi lượt (−15%)**.

Cờ chế độ đi bằng header `x-guide-full-access`, lấy THẲNG từ hằng `FULL_ACCESS` — cùng hằng
quyết định nhóm tool nào được mount, nên prompt và tool không thể lệch nhau (đây đúng là nỗi lo
ghi ở đầu `guidePrompt.js`: server tự quyết theo env thì sẽ có lúc prompt hứa tool mà client
không cấp). Thiếu header → dùng bản chế độ đọc, tức bản dè dặt hơn.

⚠️ Header mới **phải** có trong `allowedHeaders` của CORS ở `server.js`. Trên Docker frontend và
backend cùng origin nên không hề preflight — rất dễ quên; trên Render frontend là service riêng,
thiếu dòng đó là **trợ lý hỏng hẳn**.

Luồng SSE của CopilotKit **không mang `usage`** (đã đo: không sự kiện nào có trường đó), nên
client không có cách nào tự biết. Phải bắt tại tầng model rồi cho client hỏi lại qua endpoint
riêng.

**Ba nguồn tiêu token** gom hết về [guideUsage.js](../backend/src/helpers/guideUsage.js) để
con số hiện ra là tổng thật:

| `source` | Bắt ở đâu |
|---|---|
| `chat_ngoai` | middleware `wrapLanguageModel` trong route |
| `bao_cao` | `onUsage` của vòng lặp báo cáo — gọi model tới 6 lần |
| `xem_anh` | `guideVision` |

Dùng `wrapLanguageModel` của gói `ai` chứ **không tự vá Proxy** — đây là đường được hỗ trợ,
không vỡ khi CopilotKit đổi cách gọi.

`batDauLuot(uid)` đặt mốc ở đầu mỗi request: một câu trả lời có thể gọi model nhiều lần nên
không thể chỉ lấy bản ghi cuối.

Ba hình dạng `usage` phải chuẩn hoá:

```
AI SDK v3 : { inputTokens: {total, noCache, cacheRead, cacheWrite}, outputTokens: {total} }
Anthropic : { input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens }
OpenAI    : { prompt_tokens, completion_tokens }
```

Giá: bảng **cứng** trong `BANG_GIA`, hệ số cache đọc `0.1` / ghi `1.25`. Model không có
trong bảng → trả `null` và giao diện hiện "chưa có bảng giá" — thà không biết còn hơn hiện
một con số bịa. Kho lưu **trong tiến trình**, mất khi restart.

### Hiện từng bước realtime — ba tầng đệm phải gỡ

Thẻ `GuideToolStep` vốn đã vẽ theo `status` nên **luôn** có khả năng cập nhật từng bước. Nhưng
suốt một thời gian dài người dùng vẫn thấy toàn bộ hiện ra một cục lúc cuối. Không phải lỗi
giao diện — luồng SSE bị **đệm trên đường truyền**.

Đo A/B trên `/api/copilotkit`, cùng một câu hỏi:

| Điều kiện | Số chunk | Chunk đầu | Chunk cuối |
|---|---|---|---|
| Mặc định (qua `compression`) | **1** | +5103ms | +5103ms |
| `x-no-compression: 1` | 27 | +10ms | +5456ms |
| `accept-encoding: identity` | 23 | +17ms | +5000ms |

**Tầng 1 — gzip.** `compressible` coi `text/event-stream` là nén được (khớp luật chung
`text/*`), nên luồng sự kiện bị đẩy qua zlib; zlib giữ byte trong bộ đệm 16KB cho tới
`res.end()`. Một lượt trả lời thường chỉ ~6KB nên **không bao giờ** chạm ngưỡng xả.
Sửa ở [server.js](../backend/src/server.js) — lọc theo **content-type**, không theo đường dẫn,
để mọi endpoint SSE thêm sau này khỏi phải nhớ:

```js
const ct = res.getHeader('Content-Type');
if (typeof ct === 'string' && ct.includes('text/event-stream')) return false;
```

**Tầng 2 — proxy.** nginx/Cloudflare đệm response proxy theo mặc định → đặt
`X-Accel-Buffering: no` trong route, **trước** khi gọi handler (runtime chỉ `setHeader` thêm,
không xoá header đã có). `routes/mcp.js` vốn đã làm đúng vậy cho luồng SSE của nó.

**Tầng 3 — Nagle.** Sự kiện AG-UI đều là gói vài trăm byte, Nagle gom tới 40ms →
`res.socket?.setNoDelay(true)`.

Sau khi sửa: **28 chunk, chunk đầu +108ms**, đo cả trực tiếp `:4000` lẫn qua proxy Vite `:5173`
(proxy Vite không đệm — đã kiểm).

### Suy luận — đường vòng, và vì sao

Runtime phát **đủ bộ năm** sự kiện suy luận, và phát **nhỏ giọt** — đo lại trên luồng thật
(một lượt hỏi "trang báo giá nằm ở đâu", 28 chunk):

```
+ 333ms  RUN_STARTED
+1356ms  REASONING_START
+1356ms  REASONING_MESSAGE_START
+1358ms  REASONING_MESSAGE_CONTENT   ← 7 chunk, giãn đều ~300ms
   …
+2837ms  REASONING_MESSAGE_END · REASONING_END
+2839ms  TOOL_CALL_START → TOOL_CALL_ARGS → TOOL_CALL_END → TOOL_CALL_RESULT
+3076ms  TEXT_MESSAGE_START → … → RUN_FINISHED
```

⚠️ Bản trước của mục này viết rằng `REASONING_MESSAGE_START` "chỉ xuất hiện trong gói
web-inspector" — **sai**. Nó nằm ngay trên đường dây, và `@ag-ui/core` có hẳn
`ReasoningMessageSchema` với `role: "reasoning"`.

Chỗ tắc từng nằm ở **giao diện**: `CopilotPopup` của react-ui 1.66 chỉ switch trên
`user` / `assistant` / `tool` nên bỏ qua role đó, mà react-ui **không export `RenderMessage`
mặc định** (chỉ export kiểu `RenderMessageProps`) nên cũng không chèn thêm một nhánh role vào
bộ vẽ cũ được.

**Đã chuyển sang giao diện v2** — xem §15. `CopilotChatMessageView` của v2 có sẵn slot
`reasoningMessage` và vẽ `CopilotChatReasoningMessage` theo mặc định, nên suy luận của vòng
chat ngoài hiện thẳng trong khung chat, nhỏ giọt theo từng chunk.

Đường vòng cũ (`themSuyLuan` → endpoint usage → nút 💭 trên `GuideUsageBar`) **vẫn giữ**: nó
phục vụ mục đích khác — cộng dồn để đối chiếu với token, và còn chạy cả khi provider là
OpenAI. Suy luận của **vòng báo cáo** thì đi đường riêng qua trường `suy_luan` của kết quả
tool nên `GuideToolStep` vẽ trực tiếp.

Chi tiết đường vòng: bắt tại middleware model → `themSuyLuan()` → client hỏi lại qua endpoint
usage → `GuideUsageBar` vẽ nút 💭. Đúng hạ tầng đã dùng cho token.

### Cú pháp thinking khác nhau theo đời model

Dùng sai là **lỗi 400**, không phải bỏ qua êm:

| Model | Cú pháp |
|---|---|
| Claude 4.6 trở lên (sonnet-5, opus-5, opus-4-8…) | `{ type: 'adaptive' }` — truyền `budget_tokens` bị **từ chối** |
| Đời trước (haiku-4-5…) | `{ type: 'enabled', budget_tokens: N }` — truyền `adaptive` trả *"adaptive thinking is not supported on this model"* |

Cả hai đã đo trực tiếp trên key của dự án. `goiCoSuyLuan()` tự dò: thử → gặp lỗi 400 có chữ
"thinking" → đổi sang cú pháp còn lại và **ghi nhớ** → vẫn hỏng thì tắt suy luận và chạy tiếp.
Thà tốn một lần gọi hỏng lúc khởi động còn hơn hardcode danh sách model rồi im lặng gãy khi
Anthropic ra model mới.

⚠️ **AI SDK dùng `budgetTokens` (camelCase)**, khác với lúc gọi thẳng SDK Anthropic. Truyền
snake_case thì nó **không báo lỗi**, chỉ cảnh báo rồi lặng lẽ dùng ngân sách mặc định 1024:
*"thinking budget is required when thinking is enabled. using default budget of 1024"*.
Hỏng kiểu này không làm gãy gì cả nên rất dễ tưởng đang chạy đúng. (Đo được: 273 → 354 ký tự
suy luận sau khi sửa.)

---

## 9. Kho kiến thức

| | |
|---|---|
| Chunk đang nạp | **253** = 199 `screens.json` + 52 `guides.json` + 2 `tour-guides.json` |
| Chunk cần quyền admin | 57 |
| Màn hình có `summary` + `keywords` | 159 / 174 màn hình thật |
| Redirect (miễn mô tả) | 14 |
| Cổng chặn build báo | **173/188**, còn **15** trong danh sách miễn trừ |

15 màn hình còn thiếu nằm trong `.drift-baseline.json`. `/vc/events` cần crawl lại trước
(`npm run guide:crawl -- --only=/vc/events` rồi `npm run guide:structure -- --apply`).

Danh sách miễn trừ **chỉ được phép co, không được phép nở**. Mô tả xong thì chạy
`npm run guide:check -- --update-baseline`.

### Ba nguồn dữ liệu — đừng sửa nhầm file

| File | Ai viết | Sửa thế nào |
|---|---|---|
| `screens.json` | `npm run guide:sync` sinh | Sửa `summary`/`keywords`/`label` tay được — script **giữ lại** |
| `guides.json` | **viết tay** | Sửa thẳng; script không đụng tới |
| `tour-guides.json` | `npm run guide:tours` sinh từ product tour | **Không sửa tay** — sửa `tours.js` rồi sinh lại |

Để `tour-guides.json` riêng chứ không nhập vào `guides.json`: trộn máy sinh với dữ liệu tay thì
chạy lại lần hai là nhân đôi bản ghi, và không ai còn biết dòng nào được phép sửa tay.

### Sinh kiến thức từ product tour — 2026-08-26

Kho kiến thức **thiếu hẳn** luồng "tạo Lead / tạo Deal". Đo được: hỏi `"cach tao lead moi"` thì
top 3 ra *mục Ghi âm*, *mục Drive*, *Hành trình Lead*; quét cả 251 chunk chỉ có 4 cái nhắc tới
việc tạo lead, đều là chuyện khác (Facebook tự động, Zalo, chặn SĐT). `/crm/dashboard` có
`"lead"` trong keywords nhưng `operation: []` — không hề khai nút *"+ Thêm Lead"*.

Trong khi đó tour `crm-create-lead-deal` đã dạy đúng việc đó, 15 bước, bám giao diện thật. Chép
tay sang JSON là tạo ra hai bản sự thật rồi để chúng lệch nhau — nên
[generate-tour-guides.js](../scripts/guide/generate-tour-guides.js) sinh thẳng từ tour:

- **Đọc `tours.js` bằng ESM `import()`**, không bundle, không regex. Được vì
  `frontend/package.json` khai `"type": "module"` và tours.js không import gì cả. Regex trên mã
  nguồn là thứ vỡ im lặng ngay lần đầu ai đó xuống dòng khác đi.
- **Cắt tour theo TIÊU ĐỀ bước, không theo chỉ số.** Một tour dài là nhiều việc
  (`crm-create-lead-deal` = tạo Lead ở bước 1–10, tạo Deal ở 11–15) — tách đôi thì câu "tạo deal
  thế nào" mới trúng được. Cắt theo chỉ số thì chèn một bước vào giữa là lệch hết mà không ai
  biết; cắt theo tiêu đề thì sai là **ném lỗi ngay**.
- **`operation` lấy từ `advanceOn: 'target-click'`** — chính tour khai bước đó chỉ đi tiếp khi bấm
  trúng phần tử. Suy từ chữ trong `body` thì chỉ là đoán.

#### Nhãn nút: hai lần sai, cả hai đều bắt được bằng cách thử trên DOM thật

`operation` được trả cho model dưới tên `allowed_actions` — danh sách thứ nó được phép bấm
hộ. Nhãn sai không phải chuyện thẩm mỹ: `bam_nut` trượt, trợ lý phải dò lại.

1. **Chỉ xét `advanceOn` là chưa đủ.** Bản đầu sinh ra `"Đóng form Lead"` (nút thật là X / "Hủy")
   và `"Chuyển sang tab Deals"` (nhãn thật là "Deals"). Nay bắt buộc tiêu đề phải mở đầu bằng
   động từ dẫn (`Bấm|Nút|Chọn|Mở`) thì phần còn lại mới đúng là nhãn control. Thà ít mà đúng:
   2 thao tác → 1, nhưng cái còn lại bấm được.
2. **Dấu `+` trong tiêu đề tour là ICON, không nằm trong text nút.** Tour ghi "Bấm + Thêm Lead",
   DOM thật có `textContent` đúng bằng `"Thêm Deal"` (nút `data-tour="add-lead"`). Chạy chính
   `pickByLabel` của `pageActions.js` trên trang thật: `"Thêm Deal"` → tìm ra nút,
   `"+ Thêm Deal"` → **null** ở cả ba tầng (bằng / bắt đầu bằng / chứa). Nay strip dấu dẫn.

(Nút này đổi nhãn theo tab đang mở — "Thêm Lead" ở tab Leads, "Thêm Deal" ở tab Deals — nên mỗi
bản ghi chỉ khai nhãn của tab tương ứng, đúng như tour mô tả.)

### Xếp hạng — năm lần sửa, đều từ ca hỏng thật

Trọng số trường: `keywords` 5 · `operation` 4 · `label` 3 · `content` 3 · `menu` 2 · `summary` 1.

Hai lần chỉnh 2026-08-26:

- **Bỏ `task`** (trước chấm trọng số 4). Đếm thật: **0/251 bản ghi** có trường này — chưa bao giờ
  ăn điểm, chỉ làm người đọc tưởng dữ liệu có trường đó.
- **`content` 1 → 3.** Đây là phần chuyên sâu và chỉ 21/251 bản ghi có. Để ngang `summary`
  nghĩa là bản ghi viết kỹ **không** được xếp trên bản ghi chỉ có một dòng tóm tắt — ngược đúng
  cái ta cần. Vẫn để dưới `keywords`, vì `content` dài nên dễ chứa từ chung.

**Thưởng cụm keyword khớp trọn** (`phraseBonus`, 6 điểm × số từ của cụm). Chấm theo từng token
thì `"tạo deal như thế nào"` cho *Auto tạo dự án* **đúng bằng** điểm của *Tạo Deal mới* — cả hai
đều có `tao` và `deal` trong `keywords`, chỉ khác là cụm của Auto là `"deal thang tu tao du an"`,
tình cờ chứa hai từ ấy. Hoà điểm thì thứ hạng do **thứ tự nạp file** quyết định, tức ngẫu nhiên;
bản ghi đúng rơi xuống hạng 4. Cụm khớp trọn là tín hiệu mạnh hơn hẳn từ rời.

Đo trên bộ 10 câu, trước → sau: **5 câu đổi hạng 1, cả 5 đều tốt lên, 0 câu tệ đi.**

| Câu hỏi | Trước | Sau |
|---|---|---|
| cach tao lead moi | mục Ghi âm ❌ | **Tạo Lead mới** ✅ |
| tao deal nhu the nao | Auto tạo dự án ❌ | **Tạo Deal mới** ✅ |
| bao gia | Sản phẩm ❌ | **Báo giá** ✅ |
| ghi chu va HĐ khac binh luan | Facebook ❌ | **mục Bình luận** ✅ |
| them khach hang moi vao pipeline | Pipeline ~ | **Khách hàng** ✅ |

1. **Chấm theo từng TỪ, không theo nguyên câu.** Người dùng gõ cả câu ("đổi cái ảnh phía sau
   màn hình kiểu gì") — so khớp nguyên câu thì gần như không chunk nào trúng.
2. **Mỗi từ chỉ tính điểm cao nhất trong các trường, KHÔNG cộng dồn.** Cộng dồn thì một trang
   có từ phổ biến lặp ở `label` + `menu` + `keywords` + `summary` sẽ đè bẹp trang khớp đúng cả cụm.
3. **IDF.** Không có nó thì "xem danh sách lead" cho ra màn hình Khách hàng, vì "danh" +
   "sách" trúng hai lần còn "lead" chỉ trúng một — dù "lead" mới là từ quyết định.

Ba lỗi khớp bậy đã vá:

- **`"trang"` là stopword.** Mọi màn hình đều là một "trang". Hỏi *"trang Khách hàng để làm
  gì"* thì **"Thông tin PDF"** đứng đầu chỉ vì nó khớp thêm chữ "trang".
- **Khớp theo ranh giới từ với token ngắn.** `includes` thẳng làm *"trang Hóa đơn để làm gì"*
  cho ra **"Đang hoạt động"**, vì `"hoa"` là chuỗi con của `"hoat dong"`. Từ ≥ 4 ký tự vẫn cho
  khớp phần đầu (để `"lead"` bắt được `"leads"`).
- **Ngưỡng tương đối `0.35 × điểm đỉnh`.** Trước đây `score > 0` là lọt, nên khớp đúng một từ
  chung cũng vào top 5. Trợ lý nhận 5 kết quả rác nhưng trông như thật rồi mô tả sai màn hình
  — tệ hơn hẳn trả về rỗng, vì rỗng thì nó nói "chưa có thông tin". Ngưỡng **tuyệt đối** sẽ
  hỏng vì điểm phụ thuộc IDF của từng câu hỏi.

Sau ba lần sửa: 6/6 ca kiểm thử đúng.

### Bẫy "trang này để làm gì"

Hỏi ở trang A rồi **bấm sang trang B hỏi y hệt** → trợ lý mô tả lại trang A. Nguyên nhân:
trang B chưa được mô tả, model lấp khoảng trống bằng câu trả lời gần nhất trong hội thoại.

Vá ở **hai kênh**, vì `INSTRUCTIONS` không phải kênh chắc chắn:

- `INSTRUCTIONS` quy tắc **2b** — bắt đối chiếu đường dẫn lượt này với lượt trước.
- `ghi_chu` trong payload của `tra_cuu_he_thong` khi rỗng — payload tool thì **chắc chắn** tới model.

---

## 10. Quy trình

### Thêm màn hình mới

```
thêm <Route> trong App.jsx
  → cd backend && npm run guide:sync          (sinh registry + screens.json)
  → điền summary + keywords vào screens.json
  → npm run guide:check                       (phải xanh)
```

Quên bước điền thì **build fail** kèm tên route — `guide:check` nằm trong `build:frontend`,
deploy Render dừng ngay. Không cần CI.

### Bổ sung mô tả hàng loạt

```
npm run guide:login                                        # lấy JWT
npm run guide:crawl -- --only=/duong/dan                   # đọc DOM thật
npm run guide:structure -- --apply                         # trộn vào screens.json
node scripts/guide/generate-descriptions.mjs --apply       # sinh summary + keywords
npm run guide:check -- --update-baseline
```

`generate-descriptions.mjs` **chỉ điền trường đang rỗng** (`if (!goc.summary)`). Bản đầu lọc
theo "thiếu summary **hoặc** thiếu keywords" nên đã **ghi đè mất một mô tả viết tay**
(`/crm/reports`). Phải khôi phục từ backup.

Nó cũng **không đoán từ tên route** — chỉ dùng thứ crawler đọc được từ DOM thật. Màn hình
chưa crawl được thì bỏ qua: mô tả bịa còn tệ hơn không có, vì trợ lý sẽ nói nó một cách tự tin.

`crawl-structure.mjs` chạy **diff, không ghi đè**. Ghi đè tự động thì một lần đổi UI hỏng sẽ
âm thầm nuốt luôn phần viết tay.

> ⚠️ `scripts/guide/.crawl-session.json` chứa **JWT thật** và đã gitignore. Không bao giờ commit.

---

## 11. Bẫy đã trả giá

### Trong route runtime

1. **Thiếu `require('reflect-metadata')`** → `@copilotkit/runtime` ném lỗi decorator ngay lúc
   `require`.
2. **Cache client, KHÔNG cache handler.** Client OpenAI/Anthropic đắt → cache. Runtime rẻ →
   dựng **mỗi request**. Cache cả handler thì action không thấy `req.user` nào, vĩnh viễn.
3. **Quyền lấy từ JWT, không từ `ctx.properties`** — trường đó người dùng sửa được.
4. **Express cắt mount path** → `req.url` còn `"/"`, runtime so với `endpoint =
   "/api/copilotkit"` nên trả 404. Phải `req.url = req.originalUrl`.
5. **Handler là async.** `try/catch` đồng bộ **không bắt được** promise reject — lỗi rơi ra
   ngoài thành 500 body rỗng, rất khó chẩn đoán. Phải bắt cả hai đường.
6. **KHÔNG bypass `express.json()`** cho đường dẫn này. Runtime dựng lại Request theo hai
   nhánh; `isStreamConsumed()` coi là "đã đọc" khi `req.complete = true`, mà với request nhỏ
   Node thường nhận trọn body **trước khi** handler chạy. Khi đó `req.body` là `undefined` →
   runtime gửi body rỗng → 400 *"Invalid JSON payload"*. Lỗi này **ngắt quãng** — đo được hỏng
   **1/8 request**.
7. **`new CopilotRuntime({ actions: [...] })` KHÔNG CÒN CHẠY HANDLER ở 1.66.**
   `getToolsFromActions()` dựng tool với `execute: () => Promise.resolve()` — handler bị vứt
   bỏ, tool chỉ còn là khai báo suông. Kết quả luôn `undefined` nên `TOOL_CALL_RESULT` không
   có `content`; sang lượt chat **sau**, client gửi lên lịch sử có tool call thiếu result và
   runtime trả `RUN_ERROR` *"Tool result is missing for tool call ..."*.
   **Phải khai tool qua `BuiltInAgent` + `defineTool` từ `@copilotkit/runtime/v2`.**
8. **`maxSteps` mặc định là 1** → model gọi `tra_cuu_he_thong` xong là **hết lượt**, không
   sinh câu trả lời. Người dùng thấy trợ lý "im luôn". Đặt `4`.
9. **`compression()` nén cả `text/event-stream`** → cả lượt trả lời tới trình duyệt **một
   cục** lúc kết thúc. Xem mục *Hiện từng bước realtime* ở §8.
10. **Chỉ dẫn hệ thống phải đặt ở `BuiltInAgent({ prompt })`.** Prop `instructions` của
    `CopilotPopup` v1 dừng ở một `useState` không ai đọc — chỉ dẫn **không tới model**.
    Xem §15.

### Phía server

- **`messageId` của câu trả lời KHÔNG duy nhất khi bật suy luận — client bỏ câu trả lời.**
  `@ai-sdk/anthropic` đặt id khối nội dung theo CHỈ SỐ KHỐI: bật thinking thì khối suy luận là
  0, khối text là 1, nên **mọi câu trả lời trong cả hội thoại đều mang `messageId` = `"1"`**.
  Guard trong `BuiltInAgent` chỉ đổi id khi nó là `"0"` hoặc khớp `/^(txt|reasoning|msg)-0$/`
  → `"1"` lọt qua. Client đã có message id `"1"` từ câu trả lời đầu nên KHÔNG thêm bong bóng
  mới, mà ghi vào bong bóng cũ phía trên. Người dùng thấy khung 💭 rồi hết — y như model không
  trả lời. Lượt đầu của mỗi hội thoại vẫn bình thường (chưa có id `"1"`) nên lỗi trông như
  "thỉnh thoảng".

  Đã đo: câu *"tab Phân tích trên trang này để làm gì"* — server phát
  `TEXT_MESSAGE_START/CONTENT×9/END` với 444 ký tự, DOM khung chat không có bong bóng mới nào,
  bong bóng id `"1"` vẫn giữ nội dung câu trả lời trước.

  Cách chặn: `stableMessageIdMiddleware` (routes/guide/copilotkit.js) đổi mọi
  `messageId`/`parentMessageId` không phải UUID sang UUID, nhất quán trong một lượt chạy.
  KHÔNG chạm `toolCallId`.

- **Không kế thừa `BuiltInAgent` để chèn logic — phải dùng `agent.use(middleware)`.**
  Runtime clone agent cho mỗi request (`cloneAgentForRequest`), và `BuiltInAgent.clone()`
  hard-code `new BuiltInAgent(this.config)` nên **mọi lớp con bị vứt**. Đã trả giá: override
  `run()` không được gọi một lần nào, id vẫn là `"1"`, mất một vòng gỡ lỗi mới phát hiện.
  `clone()` có copy `middlewares`, nên middleware là chỗ móc duy nhất sống sót.

### Phía client

- **Handler tool phải LUÔN trả về một kết quả.** Đây là bẫy nặng nhất phía client, đã đo trên
  luồng thật (CopilotKit 1.66.2). `CopilotKitCore.executeSpecificTool` chỉ yêu cầu chạy lượt
  tiếp theo khi handler không lỗi:

  ```js
  if (!handlerResult.error && tool?.followUp !== false) return true;  // needsFollowUp
  ```

  Handler ném lỗi — hoặc arguments không parse được JSON — thì `needsFollowUp` = false,
  `processAgentResult` bỏ luôn `runAgent()`. **KHÔNG có request thứ hai nào tới
  /api/copilotkit**: người dùng thấy đúng khung 💭 suy luận rồi trợ lý im bặt, không câu trả
  lời, không cả thông báo lỗi (lỗi chỉ đi vào `emitError` nội bộ). Nhìn từ ngoài y như model
  "chỉ suy luận mà không làm gì".

  Cách chặn: bọc mọi handler bằng `guardTool()` (AppGuideCopilotPanel.jsx) — bắt hết, trả
  `{ thanh_cong: false, reason: 'tool_loi', loi }` thay vì ném. Đã kiểm chứng: cùng handler ném
  lỗi, trước khi bọc lượt chat chết hẳn; sau khi bọc trợ lý trả lời *"vừa có lỗi kỹ thuật khi
  làm sáng nút…"*.

- **Model gọi tên tool không tồn tại cũng chết im lặng.** `processAgentResult` chỉ chạy tiếp
  khi tìm được tool khớp tên, hoặc tool tên `"*"`. Không có cả hai thì thư viện **không chèn
  tool result và không gọi lại agent** — thêm nữa lịch sử còn lại một tool call thiếu result
  nên lượt sau cũng lỗi (đúng triệu chứng bẫy 7). Đã đăng ký một tool `"*"` làm lưới hứng, đặt
  `available: false` để nó không nằm trong danh sách tool gửi cho model (tên `"*"` không hợp lệ
  với Anthropic; `buildFrontendTools` lọc theo cờ đó còn `getTool` thì không).

- **Phải khai `onError` cho `CopilotKitProvider`.** Không khai thì mọi lỗi tool/agent nằm im
  trong `emitError` — không console, không UI. Đó là lý do hai bẫy trên tốn nhiều công để lần
  ra: triệu chứng là sự im lặng, không phải một thông báo lỗi.

- **Không mount đầu chat thứ hai.** Bản đầu dùng `useCopilotChatHeadless_c()` để đọc
  `messages` rồi ghi localStorage. Hook đó gọi `useCopilotChatInternal` — đúng thứ
  `CopilotPopup` cũng gọi — nên **hai instance dùng chung một object `agent`**. Effect dọn dẹp
  của instance nào chạy cũng gọi `agent.detachActiveRun()` trên agent chung, cắt lượt đang chờ
  kết quả action → `RUN_ERROR`. **Lịch sử chat vì vậy hiện KHÔNG được lưu.**
- **`showDevConsole` và `enableInspector` là hai prop khác nhau.** Prop đầu là nút Help/Debug
  trên header; prop sau là bảng inspector đầy đủ. `showDevConsole={false}` **không** tắt được
  `<cpk-web-inspector>` — phải ẩn bằng CSS, và nó kèm banner tiếp thị.
- **`render` của `hien_nut_mo_trang` chỉ ẩn ở `'inProgress'`.** Sang `'executing'` thì `args`
  đã đầy; ẩn nốt ở đó chỉ làm nút nhấp nháy một nhịp.
- **Chờ 1.800 ms sau khi điều hướng** trong `doc_chi_so` / `doc_noi_dung` — trang vừa chuyển
  còn nạp dữ liệu bất đồng bộ.
- **Vòng sáng giữ 45 giây**, không phải 10. Người dùng còn đang đọc câu trả lời rồi mới nhìn
  lên màn hình; đo được 10 giây tắt trước khi họ kịp thấy.

### Vite

```js
modulePreload: { resolveDependencies: (_f, deps) => deps.filter(d => !d.includes('vendor-copilotkit')) }
```

Không có dòng này thì Vite chèn `<link modulepreload>` cho vendor chunk vào `index.html` →
trình duyệt tải ~950KB **ngay ở trang login** dù chưa mở trợ lý.

`manualChunks` phải so bằng **tên package**, không phải `includes('@copilotkit')`: chuỗi
`@copilotkit/react-core/node_modules/lucide-react` cũng "chứa" `@copilotkit`, nên `includes()`
hút cả `lucide-react` vào chunk trợ lý.

### CSS

| Selector | Vì sao |
|---|---|
| `.copilotKitButton { display: none }` | không ẩn thì **hai nút chồng nhau** ở góc phải dưới |
| `.copilotKitWindow` z-index 60 | mặc định là hộp nổi bo góc, phí diện tích |
| `body.app-guide-panel-open .app-shell` padding-right | panel `fixed` che mất nút đang highlight |
| `.app-guide-spotlight` z-index 55, `pointer-events: none` | dưới panel, trên nội dung; vẫn bấm được nút bên dưới |
| `body.app-guide-hide-inspector cpk-web-inspector` | `showDevConsole={false}` không tắt được nó |

Thứ tự z-index: nội dung < spotlight (55) < panel (60) < nút ✨ (70).

---

## 12. Đã đi chệch thiết kế gốc ở đâu

| Tài liệu kế hoạch nói | Thực tế |
|---|---|
| §11 kiến trúc: **"Không cho trợ lý gọi API đọc dữ liệu CRM thật"** | `bao_cao_van_hanh` làm đúng việc đó — có kiểm soát, 4 chốt an toàn, audit từng lần gọi |
| Chỉ OpenAI | Có cả Claude, đổi bằng `GUIDE_AI_PROVIDER` |
| `new CopilotRuntime({ actions })` + `handler` | Không chạy ở 1.66 → `BuiltInAgent` + `defineTool` |
| 5 bẫy | 8 bẫy trong route + một loạt bẫy phía client |
| 2 action phía client | 6 tool client + 2 tool backend |
| 4 readable | 5 (thêm ngày giờ hiện tại) |
| Lưu lịch sử chat vào localStorage | **Bỏ hẳn** — gây `RUN_ERROR`, xem §11 (⚠️ dựng lại từ đầu, khác cơ chế, từ 2026-09-08 — xem §24) |
| `tasks.json`, `business-rules.json` | Chưa tồn tại |
| §10.3 embedding thay `scoreOf()` | Chưa làm — thay vào đó là IDF + ngưỡng tương đối |
| §10.4 telemetry drift | Chưa làm |

Ranh giới §11 bị vượt là **có chủ ý**, và điều kiện đi kèm đã làm đủ: quyền chặn bằng code
chứ không bằng prompt, chỉ số liệu tổng hợp (không có tool đọc bản ghi), phạm vi công ty bị
ép sau khi model sinh tham số, mỗi lần gọi ghi audit.

---

## 13. Còn tồn đọng

| Việc | Ghi chú |
|---|---|
| **Phân quyền mức phòng ban** | Chặn bởi dữ liệu: `departments.manager_id` và `parent_id` đều 0 dòng. Cần quyết định nghiệp vụ trước |
| **Thống nhất `isAdminLike` vs `isMcpOrgWideViewer`** | `manager` đọc được báo cáo toàn công ty nhưng không đọc được màn hình |
| **Tra cứu theo quyền thật** | `searchKnowledge` và `isNavigablePath` hiện chỉ nhị phân admin/không-admin, chưa theo quyền từng route |
| **Prompt caching cho 22 tool báo cáo** | ~6k token gửi lại mỗi vòng lặp trong. Câu hỏi báo cáo tốn **~14 lần** câu hỏi thường |
| **Kho usage trong bộ nhớ** | Mất khi restart; nếu Render scale nhiều instance thì mỗi instance một sổ |
| **15 màn hình chưa mô tả** | `/vc/events` cần crawl lại trước |
| **Bẫy nhãn "Đang mở"** | Còn trong văn bản báo cáo dùng chung: Zalo bot, menu báo cáo, báo cáo định kỳ |
| 🔴 **`routes/dashboard.js` báo sai, không liên quan trợ lý** | Phát hiện khi rút định nghĩa nghiệp vụ. Bốn chỉ số **luôn ra 0**: (1) `projects.due_date` **không tồn tại** — cả `pgHotQueries.pgDashboardOverview` lẫn nhánh Supabase đều lọc theo nó, PostgREST trả HTTP 400 rồi `.count \|\| 0` nuốt lỗi → "dự án quá hạn" luôn 0; (2) `warranty` có 0 dòng → "dự án hoàn thành" luôn 0; (3) `project_approvals` là bảng rỗng → "chờ duyệt" luôn 0; (4) "task đang hoạt động" định nghĩa là `pending\|in_progress\|review` nhưng trạng thái thật là `todo`(6.614)/`done`(2.312)/`pending`(1.581)/`in_progress`(1) — **bỏ sót 63% task** và đếm `review`/`blocked` vốn 0 dòng |
| 🔴 **PII lọt vào `screens.json`** | `/admin/trash` có `structure.buttons` chứa **tên file và tên khách thật** (`2807 - ANH LONG Q8.pdf`, `MTCT CHỊ THƠM.xlsx`, `M1.png`…). Đây là DÒNG DỮ LIỆU lọt qua bộ lọc PII của scanner từ lần crawl 7/8, và nó được gửi lên model mỗi khi `tra_cuu_he_thong` trả về màn hình này. Cần siết `isSafeLabel` (đuôi file, nhãn dạng dòng dữ liệu) rồi crawl lại |
| **Chỉ 4/188 màn hình cho thao tác** | Mở rộng bằng `generate-actions.mjs`, nhưng phải duyệt tay từng màn |
| **Chưa kiểm bằng mắt** | Toàn bộ phần giao diện (thẻ bước, thanh token, nút 💭, thao tác bấm hộ) chưa xem được trên app thật |
| **Ba file docs chưa commit** | Kể cả file này |

---

## 14. Nghiệm thu

- [ ] Chưa đăng nhập → không thấy nút ✨
- [ ] Trang login **không** tải chunk `vendor-copilotkit` (tab Network)
- [ ] Bấm ✨ → panel mở, nội dung app thu hẹp chứ không bị che
- [ ] Hỏi "trang này là gì?" → mô tả đúng màn hình đang xem
- [ ] Sang **trang khác** hỏi y hệt → mô tả **trang mới**, hoặc nói thẳng chưa có thông tin
- [ ] Hỏi tính năng ở module khác → model gọi `tra_cuu_he_thong` (xem inspector), không bịa
- [ ] Đồng ý "dẫn mình đi" → điều hướng đúng + vòng sáng xuất hiện, giữ 45 giây
- [ ] Tài khoản không phải admin → kết quả tra cứu **không** chứa màn hình admin
- [ ] Tài khoản `sale` → **không thấy** tool báo cáo và tool đọc màn hình; trợ lý nói thật
- [ ] `manager` công ty A hỏi báo cáo công ty B → chỉ ra số của **công ty A**
- [ ] Hỏi doanh thu tháng 7 → tháng 6 → tháng 5: **ba con số khác nhau**
- [ ] Hỏi "cho mình xem việc sản xuất đang làm" → trợ lý mở `/sx/assignments`, **tự bấm "Đang làm"**, rồi **nói ra là đã bấm nút nào**
- [ ] Ở màn hình chưa duyệt thao tác (ví dụ `/crm/leads`) → trợ lý **không bấm gì**, chỉ chỉ đường
- [ ] Bảo trợ lý "bấm Thêm việc giúp mình" → **từ chối**, không có bản ghi nào được tạo
- [ ] Thanh token hiện sau mỗi câu trả lời; câu hỏi báo cáo hiện `nhiều lần gọi · chat + báo cáo`
- [ ] Gửi 20 tin liên tiếp → không request nào trả 400 *"Invalid JSON payload"*
- [ ] Build production → không thấy `cpk-web-inspector` và banner tiếp thị
- [ ] Thêm một `<Route>` mới rồi build → **build fail** kèm tên route thiếu mô tả

---

## 15. Chuyển sang khung chat v2

Lý do trực tiếp: **hiện suy luận realtime**. Giao diện v1 (`@copilotkit/react-ui`) không vẽ
message `role: "reasoning"` và không cho chèn thêm nhánh role — xem §8. `@copilotkit/react-ui`
đã **gỡ khỏi package.json**; toàn bộ giao diện giờ đến từ `@copilotkit/react-core/v2`.

### Bảng đối chiếu API

| v1 | v2 |
|---|---|
| `<CopilotKit>` | `<CopilotKitProvider>` |
| `useCopilotReadable({description, value})` | `useAgentContext({description, value})` — cùng hình dạng |
| `useCopilotAction` | `useFrontendTool` |
| `parameters: [{name, type, required}]` | `parameters: z.object({...})` — Standard Schema |
| `available: 'enabled' \| 'disabled'` | `available: true \| false` |
| `useCopilotAction({name:'*', render})` | `useRenderTool({name:'*', render})` |
| prop `instructions` | **backend** `BuiltInAgent({ prompt })` |
| `labels.initial` (một bong bóng mở màn) | `labels.welcomeMessageText` + `useConfigureSuggestions` |
| `onInProgress` | `useAgent()` → `agent.subscribe({ onRunFinalized })` |
| children của popup | render như phần tử anh em (thanh token vốn `position: fixed`) |

### Ba cái bẫy của v2

1. **`result` trong render của tool là CHUỖI**, không phải object như v1. `GuideToolStep`
   phải `JSON.parse`. Quên thì mọi tóm tắt im lặng biến mất — không lỗi, chỉ trống.
2. **Không bám tên class nữa.** v2 dựng bằng Tailwind tiền tố `cpk:`, tên class sinh tự
   động. CSS tuỳ biến phải bám `data-testid` / `data-*`:
   `[data-testid="copilot-chat-toggle"]`, `[data-copilot-popup]`,
   `[data-testid="copilot-input-overlay"]`. Kích thước panel đặt qua biến
   `--copilot-popup-width/height`, và hai biến `max-*` nằm trong thuộc tính `style` nên phải
   `!important` mới đè được.
3. **Slot phải memo.** Truyền `header={{ closeButton: (p) => <... /> }}` bằng object literal
   thì mỗi lần render là một KIỂU component mới → React tháo rồi dựng lại nút giữa lúc đang
   stream. Dùng `useMemo`.

### 🔴 Lỗi CÓ SẴN được phát hiện nhờ đọc kỹ v2: handler tool đóng băng closure

`useFrontendTool(tool, deps)` đăng ký bằng `useEffect` với deps
`[tool.name, tool.available, copilotkit, JSON.stringify(deps)]`. **Không truyền `deps` thì
effect chạy đúng một lần**, và `copilotkit.addTool(tool)` giữ nguyên closure của lần render
đầu tiên.

Đây **không phải lỗi mới của v2**: `useCopilotAction` của v1 chỉ là lớp bọc mỏng gọi thẳng
`useFrontendTool` — cùng một hành vi. Panel cũ gọi `useCopilotAction({...})` **không truyền
dependencies**, nên mọi handler xưa nay đọc `location.pathname` của lúc **mở panel**, không
phải trang đang xem.

Nặng nhất là `thao_tac_tren_man_hinh`: nó lấy danh sách nút được duyệt theo
`location.pathname`. Người dùng mở panel ở màn hình A rồi chuyển sang B, tool sẽ xin danh
sách duyệt **của A** rồi đem đi bấm trên **B** — cổng an toàn kiểm nhầm bảng.

Cách sửa: một `useRef` giữ pathname mới nhất, handler đọc `duongDanRef.current`. Không dùng
`deps=[location.pathname]` vì như vậy mỗi lần đổi trang là một vòng `removeTool`/`addTool`,
có thể cắt ngang lượt gọi tool đang chạy dở.

### Cân thử: v2 KHÔNG nặng hơn v1

Đo bằng esbuild, hai entry chỉ import đúng những symbol dự án dùng:

| | thô | gzip |
|---|---|---|
| v1 (`react-core` + `react-ui`) | 15.902 KB | 3.485 KB |
| v2 (`react-core/v2`) | 14.960 KB | **3.159 KB** |

Chunk thật sau `vite build`: `vendor-copilotkit` 2.549 KB thô / 626 KB gzip, cộng
`vendor-copilotkit-css` 90 KB / 14,5 KB gzip. Vẫn nạp động — trang login không đụng tới.

### 🔴 Phát hiện lớn: chỉ dẫn hệ thống CHƯA TỪNG tới model

Truy trong mã react-ui/react-core 1.66:

```
CopilotChat({ instructions })  →  setChatInstructions(instructions)
                               →  useState `chatInstructions`
                               →  đặt vào giá trị context  →  KHÔNG AI ĐỌC
```

`chatInstructions` xuất hiện đúng **4 lần** trong `react-core`: giá trị mặc định của context,
khai báo `useState`, và hai object context. Không chỗ nào dựng request đọc tới nó.

Tức là ~5.000 ký tự quy tắc trong `INSTRUCTIONS` **chưa bao giờ đến model**. Trợ lý xưa nay
chạy bằng **mô tả tool + ngữ cảnh readable**. Điều này giải thích ngược lại cả một chuỗi quan
sát trước đó: mỗi lần một luật chỉ có tác dụng sau khi được chép vào mô tả tool, không phải vì
mô tả tool "mạnh hơn", mà vì đó là kênh **duy nhất còn hoạt động**.

Chỗ đúng là `BuiltInAgent({ prompt })` — runtime ghép
`prompt + "## Context from the application" + readable` thành system message.
Chỉ dẫn nay nằm ở [guidePrompt.js](../backend/src/helpers/guidePrompt.js).

**Đã kiểm ở tầng dây** (bọc `wrapLanguageModel`, đọc `params.prompt` của lần gọi thật):
system message **7.189 ký tự**, chứa đủ câu mở, quy tắc 4, quy tắc 9, quy tắc 11 và khối
ngữ cảnh readable.

**Đo lại định tuyến** trên endpoint thật, đúng ca từng hỏng
("công ty Bếp Vạn Phú Thành có bao nhiêu chi nhánh"), 5 lần mỗi điều kiện:

| Điều kiện | Trước (v1, chỉ dẫn chết) | Nay (v2, chỉ dẫn sống) |
|---|---|---|
| Hỏi tươi | 5/5 | **5/5** |
| Giữa hội thoại đã bàn về màn hình khách hàng | 4/5 | **5/5** |

Nhịp 4/5 còn sót của bản trước đã hết.

⚠️ Bộ đo cũ `scripts/guide/` + `do-chi-nhanh.mjs` rút `instructions` từ prop của panel —
prop đó không còn, nên bộ đo cũ **hết hiệu lực**. Bản thay thế gọi thẳng
`POST /api/copilotkit` nên đo đúng thứ đang chạy.

### Còn nợ

- **Chưa xem bằng mắt trên trình duyệt.** Đã kiểm: build production sạch, esbuild bundle
  sạch, luồng SSE nhỏ giọt, chỉ dẫn tới model, định tuyến 5/5. Chưa kiểm: bố cục panel v2,
  nút đóng, vị trí thanh token, thẻ suy luận hiện ra sao.
- CSS panel dựa vào `:has()`. Trình duyệt không hỗ trợ thì panel tụt về hộp nổi góc phải
  dưới — xấu nhưng vẫn dùng được.
- v2 có `useThreads` + `CopilotThreadsDrawer` để lưu lịch sử chat, nhưng cần runtime khai
  báo thread store. Chưa làm.

## 16. Chế độ TOÀN QUYỀN trên trang (bản thử nghiệm)

Chủ hệ thống yêu cầu cấp cho trợ lý **mọi quyền người dùng có trên trang**, chấp nhận việc
xoá/làm hỏng dữ liệu vì đây là bản thử nghiệm. Mục này ghi lại đúng cái đã làm và ranh giới
còn giữ.

### Công tắc — `frontend/src/features/guide/lib/guideAccess.js`

| Nguồn | Ưu tiên | Ghi chú |
|---|---|---|
| `localStorage['guide.fullAccess']` = `'1'`/`'0'` | 1 | bật/tắt không cần restart Vite, **phải tải lại trang** |
| env `VITE_GUIDE_FULL_ACCESS` = `1`/`0` | 2 | chốt theo build |
| `import.meta.env.DEV` | 3 (mặc định) | **dev = bật, production build = tắt** |

Không hard-code `true`: production dùng chung mã nguồn này, thiếu cờ thì một lần
`npm run build` là trợ lý bấm được nút Xoá trên dữ liệu thật của khách.

`FULL_ACCESS` đọc **một lần lúc import** → mount tool theo nhánh
(`{FULL_ACCESS ? <GuideFullAccessTools/> : <GuideNavConfirmTool/>}`) không phá thứ tự hook.
Đây là lý do phải tách hai component thay vì bọc `if` quanh `useFrontendTool`.

### Ba tool mới + một tool đổi hành vi

| Tool | Việc | File |
|---|---|---|
| `doc_trang` | giá trị THẬT từng bộ lọc/ô nhập, tab đang chọn, nút bấm được, bảng ≤25 dòng | `lib/pageState.js` |
| `bam_nut` | bấm thật nút/tab/link theo nhãn | `lib/pageActions.js` |
| `dien_truong` | đặt thật giá trị ô nhập / dropdown / ô tích | `lib/pageActions.js` |
| `dieu_huong_toi_trang` | chuyển trang NGAY, không còn human-in-the-loop | `AppGuideCopilotPanel.jsx` |

Ba tool **tổng quát** thay vì tool riêng cho từng nghiệp vụ: mọi việc làm được bằng chuột đều
là tổ hợp bấm + điền + đọc, nên không phải viết và bảo trì tool cho ~200 màn hình, và không bao
giờ lệch với giao diện thật vì mọi thứ đi qua đúng event handler React đã gắn.

### Quan hệ với §7b (danh sách nút được duyệt trước)

Bảng whitelist ở §7b **không còn áp dụng** ở chế độ toàn quyền — theo đúng quyết định của chủ
hệ thống. Vẫn giữ ở chế độ đọc. Nói cho rõ: ở chế độ toàn quyền `bam_nut` **không** phân biệt
`Đang làm` (lọc, vô hại) với `Thêm việc`/`Xoá` (ghi thật) — nó bấm cái nào khớp nhãn.
Bù lại có hai lớp cho người dùng soát:
- Thẻ kết quả trong khung chat ghi rõ **nhãn thật đã bấm** (`clicked`), không chỉ nhãn model xin.
- Bảng "Hành động của trợ lý" hiện nhãn `TOÀN QUYỀN` màu đỏ + từng thao tác kèm trạng thái.
- Chỉ dẫn hệ thống buộc nói ra trong câu trả lời là vừa xoá/huỷ cái gì.

### Bốn thứ đã đo và phải nhớ

**1. Gán `el.value = x` là vô hiệu với React.** React ghi đè property `value` trên instance để
theo dõi thay đổi; gán trực tiếp thì DOM đổi mà state không đổi, và lần render sau ô nhập bị
đặt lại giá trị cũ. Phải gọi **setter gốc trên prototype** rồi mới phát `input` + `change`.
`el.click()` thì dùng trực tiếp được — MouseEvent có `bubbles` nên listener uỷ quyền ở gốc của
React vẫn nhận.

**2. Bộ lọc thường KHÔNG có control trong DOM.** Trên `/crm/dashboard`, `<select>` công ty nằm
trong panel lọc; panel đóng thì select **không tồn tại**, chỉ còn một `<span>` lá
`Công ty: Công ty Nhôm Kính Phúc Đạt` trên thanh chip. Vì vậy `pageState.js` có
`readInlineLabelValuePairs()` bắt mẫu `Nhãn: giá trị` ở phần tử lá — đây là đường **duy nhất**
trả lời được "bộ lọc này đang lọc của công ty nào" ở trạng thái thường gặp nhất. Nhãn phải
không chứa chữ số, nếu không `Cập nhật 09:31` bị đọc thành nhãn `Cập nhật 09` giá trị `31`.

**3. Model đọc `loai: nhan_hien_thi` thành "cố định, không đổi được".** Đã tái hiện: nó gọi
`dien_truong` trượt, `doc_trang`, rồi kết luận *"trường Công ty là nhãn hiển thị (chỉ đọc),
bộ lọc đã cố định"* và **dừng lại xin phép** — trái quy tắc "làm luôn". Sửa ở ba chỗ cùng lúc:
`ghi_chu` của `doc_trang`, `ghi_chu` khi `dien_truong` không thấy trường (nói thẳng "hãy
`bam_nut` mở panel rồi gọi lại, đừng hỏi xin phép"), và mục chế độ toàn quyền trong
`helpers/guidePrompt.js`.

**4. `screenMetrics.js` đọc một thẻ lead thành chỉ số — ba lớp chặn cũ KHÔNG đủ.**
Trợ lý bày lên khung chat dòng `Cửa sắt trượt Quay - Chị Châu - Quận  →  9`. Nguồn thật:

```html
<h4 class="font-semibold …">Cửa sắt trượt Quay - Chị Châu - Quận 9</h4>
<!-- nằm trong <div draggable="true"> = thẻ kanban của một lead -->
```

`LABEL_NUMBER_RE = /^(.{2,}?)\s+(\d{1,6})$/` cắt chuỗi thành nhãn `"… - Quận"` + số `9`.
**Số 9 là số quận trong địa chỉ, không đếm gì cả.** Nó lọt cả ba lớp cũ: không có pattern PII
nào khớp (tên người không phải pattern), `9` thì đúng là "trông như số đếm", và tổng số khớp
vẫn ≤ 20. Tệ hơn: tên khách **"Chị Châu"** lọt luôn — đúng thứ module này cam kết không để lọt.

Thêm 5 lớp (chi tiết ở đầu `lib/screenMetrics.js`): loại vùng chứa bản ghi
(`[draggable=true]`, `tr`, `li`, `role=row/listitem`), loại `<h1>`–`<h6>`, loại khi từ ngay
trước số là `Quận/Lô/Tháng/Đợt…`, loại nhãn có dấu nối `A - B - C`, loại nhãn có kính ngữ
`Chị/Anh/Ông/Bà`. `MAX_LABEL_LEN` 40 → 28. Cùng lớp "vùng chứa bản ghi" đã thêm cho
`readInlineLabelValuePairs()` ở `pageState.js` vì nó dính đúng lỗ hổng đó.

Sau khi vá, cùng màn hình: `[{Deals: 56}, {Khách hàng: 134}]` — dòng rác biến mất, hai chỉ số
thật còn nguyên. Đánh đổi đã nhận: trang nào đặt thẻ thống kê trong `<li>`/`<tr>` thì từ nay
không đọc được. Đúng nguyên tắc D6 — bỏ sót còn hơn báo một con số sai.

### Tìm kiếm: ưu tiên BỘ LỌC, ô tìm kiếm là phương án cuối

Trợ lý cũ luôn gõ vào ô tìm kiếm. Nguyên nhân KHÔNG phải nó thích thế: **panel Bộ lọc đóng mặc
định**, nên `doc_trang` chỉ thấy đúng một ô nhập — ô tìm kiếm — và nó dùng cái đang có. Tìm tự
do chỉ khớp chuỗi (tên/SĐT/mã), không lọc được theo công ty / nhân viên / giai đoạn / thời gian.

Sửa ba chỗ, vì một mình luật trong prompt không đủ khi ngữ cảnh không hề nhắc tới bộ lọc:

1. **`loai: "o_tim_kiem"`** (`pageState.js`): ô tìm kiếm trước đây ra `loai: "text"`, lẫn với mọi
   ô nhập khác. Nhận diện bằng `type=search` hoặc nhãn/placeholder khớp `/tìm|search/i`.
2. **`ghi_chu` của `doc_trang`** nói thẳng: danh sách chỉ có ô tìm kiếm **KHÔNG** có nghĩa là
   trang không lọc được — panel đang đóng, `bam_nut "Bộ lọc"` rồi `doc_trang` lại.
3. **Chỉ dẫn hệ thống** (quy tắc 5 của chế độ toàn quyền): yêu cầu về một NHÓM bản ghi → mở Bộ
   lọc → `doc_trang` → `dien_truong` đúng trường → `doc_trang` đọc kết quả. Ô tìm kiếm chỉ dùng
   cho một CHUỖI CỤ THỂ không bộ lọc nào phủ được; kể cả khi đó, biết công ty/nhân viên thì đặt
   bộ lọc trước cho hẹp lại.

Nghiệm thu — *"cho mình xem lead của công ty Metalla"*: trợ lý tự lập kế hoạch *"Bấm nút Bộ lọc
để mở panel → Điền trường Công ty thành Metalla → Đọc trang lại"*, thực thi đúng vậy
(`Đã bấm "Bộ lọc"` + `Đã đặt`), select công ty trên trang đổi thành **Công Ty Metalla**, header
đổi thành **Leads 1**, và trả lời *"Hiện tại có 1 lead của công ty này: Anh Lưu"*. Không đụng ô
tìm kiếm (`textarea`/ô tìm vẫn rỗng).

### Giao diện: sidebar mép phải + câu trả lời nén lại + bảng ẩn mặc định

**`CopilotPopup` → `CopilotSidebar position="right" width={420}`.** Popup nổi che giữa màn hình,
mà ở chế độ toàn quyền người dùng cần nhìn trang trong lúc trợ lý thao tác. `CopilotSidebar` là
component CÓ SẴN của thư viện — dùng nó thay vì tự dựng khung, để giữ nguyên toggle/scroll/thread.
Root đổi từ `[data-copilot-popup]` sang **`[data-copilot-sidebar]`**; mọi selector CSS và cái neo
của bảng hành động phải đổi theo. Đo được: `left 678, top 0, 420×694` — dán mép phải, full chiều
cao. Dưới 640px thì ép `100vw`.

**Nén nội dung câu trả lời.** Mặc định của thư viện quá thưa trong cột 420px — đo bằng computed
style: `p` = 16px/28px + `margin 20px 0`; `ol` = `margin 20px 0` + class `list-inside`;
`li` = `margin 8px 0` + `py-1` ⇒ **mỗi mục 64–92px**. Một danh sách 3 mục ăn gần hết khung.

Ghi đè trong phạm vi `.copilotKitMessage.copilotKitAssistantMessage` (hai class → thắng chắc
utility Tailwind một class, không cần `!important`), không đụng phần còn lại của thư viện:
13,5px/1,55 · `p` margin-bottom 7px · `li` padding 1px · heading 14px/700 · `list-style-position:
outside` + `padding-left 20px` (bỏ `list-inside` vì dòng xuống hàng thụt ngược dưới số thứ tự).

**Bẫy: `font-size: inherit` KHÔNG ăn.** Giữa `.copilotKitAssistantMessage` và các thẻ nội dung
còn một wrapper của thư viện đặt lại `text-base`, nên `inherit` chỉ kế thừa đúng 16px đó. Đã đo:
margin nén xuống nhưng font vẫn 16px/28px. Phải ghi cỡ chữ **tường minh** trên `p/ul/ol/li`.
Kết quả cùng một câu trả lời: **1064px → 824px** (−23%), `li` 64–92px → 44px.

**Bảng hành động: ẩn mặc định + nút bật.** Nó là công cụ soi, hiện sẵn thì che nội dung ngay cạnh
khung chat. Trạng thái đổi từ "thu gọn" sang "ẩn/hiện": ẩn → chỉ một nút tròn `⚡ Hành động` (kèm
badge số hành động) dán mép trái sidebar; hiện → bảng đầy đủ với nút `✕` để ẩn lại. Khoá
localStorage `guide.activity.hidden`, và **chỉ `'0'` mới là hiện** — thiếu khoá hay giá trị lạ đều
ẩn, nên mặc định luôn là ẩn kể cả với người dùng mới.

### Bảng soi (inspector) — dữ liệu thô từng bước

`AgentActivityPanel.jsx` có hai tab, mỗi dòng bấm được để mở **dữ liệu thô đầy đủ, không cắt**.

| Tab | Nội dung |
|---|---|
| Hành động | từng lượt (`Lượt 1`, `Lượt 2`…): nguyên văn câu hỏi · nguyên văn suy luận · mỗi tool kèm `tool_name` / `tool_call_id` / `args` / `raw_args` / `results` / `raw_result` · nguyên văn câu trả lời |
| Ngữ cảnh | chỉ dẫn hệ thống THẬT (model, `max_steps`, cấu hình suy luận) + toàn bộ readable đang gửi lên model, mở ra xem giá trị đầy đủ |

Nút `⇤` mở rộng bảng 288 → 560 px để đọc JSON. Trạng thái tab / thu gọn / mở rộng nhớ qua
`localStorage` (`guide.activity.tab`, `.collapsed`, `.wide`).

Bốn quyết định có lý do:

- **Readable lấy từ `useCopilotKit().copilotkit.context`**, không tự tính lại ở panel. Tự tính
  lại thì bảng nói dối đúng lúc cần nó nhất: khi việc đăng ký context bị lỗi.
- **Prompt lấy từ `GET /api/copilotkit/debug/prompt`**, không hard-code lại ở frontend — hai
  bản sẽ lệch ngay lần sửa prompt đầu và bảng thành nguồn sai. Route này phải khai **trước**
  `r.use('/', …)`; khai sau thì request rơi vào runtime CopilotKit và trả 404/405.
- **`raw` tách khỏi `detail`/`note`.** `detail` là bản cắt ngắn cho dòng hẹp; `raw` là bản đầy
  đủ. Giữ **cả** `args` (đã parse) lẫn `raw_args` (chuỗi gốc): khi model sinh JSON hỏng
  thì `args` rỗng, chỉ `raw_args` cho thấy nó gửi cái gì — đúng ca cần soi nhất.
- **Poll `context` mỗi 1s thay vì subscribe `contextChanged`.** Tên/hình dạng kênh subscribe là
  API nội bộ; đổi bản là bảng im lặng ngừng cập nhật. Chỉ poll khi tab Ngữ cảnh đang mở, và so
  chữ ký JSON trước khi `setState` — không so thì mỗi nhịp poll đều re-render bảng.

**Bẫy đã trả giá ở đây: `pretty()` phải xử lý CHUỖI CHỨA JSON, không chỉ object.** Core lưu
`value` của readable dưới dạng chuỗi đã `JSON.stringify`, và kết quả tool qua AG-UI cũng luôn
là chuỗi. Bản đầu chỉ `JSON.stringify` khi gặp object nên mọi khối hiện ra **một dòng duỗi
hết** — vô dụng, đúng thứ cần đọc lại là thứ khó đọc nhất. Nay thử `JSON.parse` khi chuỗi bắt
đầu bằng `{`/`[` rồi thụt lại 2 space.

Thanh tiêu đề đổi từ `<button>` sang `<div>` chứa nhiều nút: `<button>` lồng `<button>` là HTML
không hợp lệ, Chrome tự tách thẻ và layout vỡ theo cách rất khó lần.

Ghi nhận khi soi: `debug/prompt` trả `model: claude-haiku-4-5` — tức `ANTHROPIC_MODEL` trong
`backend/.env` đang trỏ Haiku, không phải mặc định `claude-sonnet-5` trong code.

### Token + chi phí mỗi lượt gọi (`helpers/guideUsage.js`)

Tab **Chi phí** hiện tổng tiền, token vào/ra/cache, và từng lượt hỏi mở ra được chi tiết từng
lần gọi model. Chip tiền cũng hiện ngay ở tiêu đề bảng.

**`BuiltInAgent` KHÔNG phát usage** — đã grep cả `dist/agent/index.cjs`, không có một chữ
`usage` nào, và giao thức AG-UI không có event nào mang token. Nên client không có cách nào tự
biết. Chỗ duy nhất lấy được là **ngay tại model**:

`resolveModel` có dòng `if (typeof spec !== "string") return spec;` → truyền THẲNG một model
object vào `new BuiltInAgent({ model })` thì nó dùng nguyên vẹn. Ta bọc bằng
`wrapLanguageModel({ model, middleware })` của ai SDK và nghe chunk `finish` trong `wrapStream`.
Dùng chuỗi `"anthropic:<model>"` như trước là runtime tự tạo provider và **mất chỗ móc**.

Ghép hai nửa: model middleware biết usage nhưng không biết `threadId`/`runId`/lượt thứ mấy; AG-UI
middleware (`agent.use`) biết cả ba vì `input` mang `threadId`, `runId` và toàn bộ `messages` —
đếm message `role: 'user'` ra đúng **số lượt**, nên chi phí gán được về từng lượt hỏi. Chốt sổ
bằng `tap({ finalize })` để lượt bị huỷ giữa đường vẫn ghi phần đã tiêu.

**BẪY ĐÃ TRẢ GIÁ — usage của ai SDK v6 là OBJECT LỒNG, không phẳng:**

```js
usage = {
  inputTokens:  { total, noCache, cacheRead, cacheWrite },
  outputTokens: { total, text, reasoning },
  raw:          { …usage nguyên văn của Anthropic… },
}
```

Bản đầu coi `usage.inputTokens` là số → `Number({...})` ra `NaN` → **mọi ô token hiện 0, không
một lỗi nào**. Phát hiện bằng cách chạy agent thật ngoài server (`875` vào / `97` ra) thay vì
tin vào UI. Vẫn giữ nhánh "dạng phẳng" của v5 để nâng/hạ phiên bản SDK không làm bảng câm.

`usage.raw.cache_creation` còn tách `ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens`,
nên tính đúng được hai hệ số ghi cache khác nhau thay vì gộp hết vào 1,25×.

**Giá** (bảng chính thức Anthropic, USD/1M token): Haiku 4.5 `1/5` · Sonnet 4.6 `3/15` ·
Sonnet 5 `2/10` **giá giới thiệu tới hết 2026-08-31**, sau đó `3/15` (cài theo mốc ngày để tự
hết hạn, không âm thầm báo sai) · Opus 5/4.8/4.7/4.6 `5/25` · Fable 5 `10/50`. Hệ số cache:
đọc `0,1×`, ghi `1,25×` (TTL 5 phút) / `2×` (TTL 1 giờ). Model không có trong bảng → **không
tính tiền** và nói rõ lý do, thay vì đoán giá.

Sổ ghi là bộ nhớ trong tiến trình (60 bản ghi/thread, 40 thread), mất khi restart — đây là số
liệu để soi lúc phát triển, ghi DB thì phải quyết bảng/quyền/dọn dữ liệu, quá nặng.
Tỷ giá VND lấy từ env `USD_VND_RATE` (mặc định 26.000) và hiện rõ trên bảng — nó là quy đổi cho
dễ hình dung, không phải số Anthropic tính tiền.

### Chờ trang nạp xong (`lib/pageReady.js`)

Trước đây sau điều hướng chỉ chờ **cứng 1.800ms** rồi đọc luôn, nên trợ lý đọc phải khung
rỗng/skeleton và kết luận thiếu thông tin — mà nó không biết mình đọc sớm, nên nói chắc chắn một
điều sai. Đo lại bằng `waitForPageReady`: `/crm/dashboard` cần **3.291–3.444ms**,
`/crm/customers` cần **4.897ms**. Con số 1.800 thiếu 2–3 giây.

Không sửa bằng cách tăng số giây: trang nhẹ thì chờ thừa (chuỗi 4 bước cộng thành cả chục giây),
trang nặng thì vẫn chờ thiếu. Chờ theo **ba tín hiệu**, phải đạt cả ba:

1. **Không còn dấu hiệu đang tải** đang hiển thị — `.animate-spin` (236 file trong repo),
   `.animate-pulse` (28 file), chữ "Đang tải" (144 file), `[role=progressbar]`, `[aria-busy]`.
2. **Mạng im** — không request nào kết thúc trong 450ms gần nhất, đo bằng `PerformanceObserver`.
   **KHÔNG vá `window.fetch`/`XMLHttpRequest`**: vá global là sửa hành vi của cả ứng dụng thật
   chỉ để phục vụ một tính năng phụ. Đánh đổi đã nhận: PerformanceObserver chỉ báo khi request
   XONG nên không thấy request đang bay — bù bằng tín hiệu 1 và 3.
3. **DOM đứng yên** qua 2 nhịp 150ms liền (chữ ký = số phần tử + độ dài `textContent`;
   `textContent` không ép reflow, `innerText` thì có).

Chặn trên theo loại việc: bấm/điền 6s, điều hướng 12s (điều hướng phải lazy-load chunk của route
rồi mới gọi API). Chặn dưới `minMs` để nhịp đo đầu tiên không bắt được trang **CŨ** đang đứng yên
rồi kết luận "xong ngay".

**Đường tắt cho tool đọc thuần** (`minMs === 0`): trang không có dấu hiệu tải và mạng đã im sẵn
thì trả về ngay. Thiếu nhánh này, mỗi lần đọc chỉ số trên trang đang đứng yên vẫn tốn ~1,2s;
có nhánh này thì còn **2ms**. Không áp cho `minMs > 0` (vừa bấm/điền/điều hướng) — lúc đó "mạng
im" chỉ là React chưa kịp render, kết luận xong là sai.

Một nhịp đo tốn **13,8ms** (đã đo trên `/crm/quotations`: 2.432 phần tử) — ~9% main thread trong
lúc chờ, chấp nhận được.

**Mọi tool bấm/điền/điều hướng/đọc giờ trả thêm `page_wait: {waited_ms, reason, still_loading}`**
và một `ghi_chu` bằng tiếng Việt. Chỉ dẫn hệ thống có luật tương ứng: thấy `still_loading: true`
hoặc `reason: "het_gio"` thì **gọi lại tool đọc**, lần hai vẫn đang tải thì nói thẳng là trang
chưa xong; và "vừa điều hướng/đổi bộ lọc mà đọc ra 0 kết quả thì gần như chắc là đọc sớm, không
phải không có dữ liệu". Đây là phần chặn "nói chắc một điều sai" ở gốc — chờ lâu hơn chỉ giảm
xác suất, không loại bỏ.

Nghiệm thu: "dẫn sang trang báo giá rồi đọc xem đang hiện bao nhiêu báo giá" →
`tra_cuu_he_thong` → `dieu_huong_toi_trang` (chờ 3.444ms) → `doc_trang` (chờ thêm 1.777ms) →
đọc được **bảng 25 dòng + 4 trường**, không còn khung rỗng.

### Test "mở 1 lead" — ba lỗi lộ ra

Nhờ trợ lý *"mở giúp mình 1 lead bất kỳ để xem chi tiết"*. Nó **không mở được**, và làm một việc
tệ hơn: `bam_nut "0909780606"` → **đã bấm "Gọi 0909780606"** — tức gọi điện cho khách thật.

Ba lỗi nối nhau:

1. **`bam_nut` không với tới được thẻ lead.** Thẻ kanban là
   `<div draggable="true" data-crm-pipeline-card onClick=…>` — không khớp bất kỳ selector nào
   trong `CLICKABLE_SELECTOR` (`button, a[href], [role=button], [role=tab], …`). Nghĩa là trước
   đó **không có đường nào** để mở một lead.
2. **`doc_trang` liệt kê liên kết `tel:` vào `clickable_buttons`.** `readClickables` lấy cả
   `a[href]`, nên `Gọi 0909780606` hiện ra như một nút bấm được. Trợ lý suy luận hợp lý rằng đó
   LÀ các lead — chính bảng của mình đã dẫn nó đi sai.
3. **Thẻ lead không xuất hiện ở đâu trong `doc_trang`.** Nó chỉ liệt kê control và clickable, nên
   trợ lý không biết trên màn hình có lead tên gì để mà mở.

**Sửa:**
- `SIDE_EFFECT_LINK_SELECTOR` = `a[href^=tel:|mailto:|sms:], a[download]` — loại khỏi cả
  `readClickables` và ứng viên của `clickByLabel`. Bấm mấy cái đó có hậu quả ngoài trình duyệt
  và không bao giờ mở được chi tiết.
- `readOpenableCards()` + `openable_cards` trong `doc_trang`: quét
  `[draggable=true], [data-crm-pipeline-card], tbody tr, [role=row], [role=listitem]` rồi lọc
  bằng **`cursor: pointer`**. Không đọc được `onClick` của React từ DOM, nên dùng dấu hiệu CSS mà
  chính giao diện phải tự khai. Nhãn thẻ lấy từ tiêu đề (`h1`–`h6`) → `title` → đoạn text lá đầu
  tiên; KHÔNG lấy cả `textContent` của thẻ (thẻ chứa cả tên + SĐT + giá trị + giai đoạn, ghép hết
  lại thì nhãn vô dụng).
- `clickByLabel` nhận thêm nhóm thẻ; thất bại thì trả kèm `openable_cards` để model chọn lại.

Sau khi sửa, chuỗi chạy đúng ngay lượt đầu:

```
📄 Đọc trạng thái màn hình   2 trường
🖱️ Bấm nút "Anh Lưu"         đã bấm "Anh Lưu"
📄 Đọc trạng thái màn hình   4 trường
💬 Trả lời                   LEAD-2026-1011 "Anh Lưu", hạn 11/8/2026 (đã quá hạn), 3 nhiệm vụ CRM
```

URL đổi sang `/crm/leads/439d703b-…`. Không bấm vào liên kết gọi điện nào.

#### Lớp chặn thứ hai: nhãn giống số điện thoại

`SIDE_EFFECT_LINK_SELECTOR` chỉ loại thẻ `<a href="tel:">` khỏi **ứng viên**. Model vẫn có thể tự
gõ `"0909780606"` (đúng ca đã xảy ra), và nếu trang có nút khác vô tình khớp thì cú bấm vẫn xảy
ra. Nên `clickByLabel` chặn ngay ở **tham số**: ≥8 chữ số VÀ phần chữ còn lại (sau khi bỏ chữ số,
dấu phân cách và các từ `goi/call/tel/sdt/phone/zalo/label/sms/mobile`) **< 3 ký tự**.

Chỉ chặn khi chữ số chiếm gần hết nhãn — tiêu đề lead có kèm SĐT vẫn phải mở được:

| Nhãn | Kết quả (đã đo) |
|---|---|
| `0909780606` · `Gọi 0909780606` · `+84 909 780 606` · `0909.780.606` | **CHẶN** |
| `Tủ bếp Chị Hoa 0908123456` | qua được lớp chặn |
| `LEAD-6677` · `Quá 17 ngày 13 giờ` | qua (chỉ 4 chữ số) |
| `Anh Lưu` · `Bộ lọc` | bấm bình thường |
| `Mã 1234567890` | **CHẶN** — dương tính giả đã nhận |

Kết quả từ chối kèm `openable_cards` + lời giải thích *"bấm vào số điện thoại là GỌI ĐIỆN cho khách
hàng, không phải mở chi tiết"* để model tự sửa ở lượt sau.

Thử khiêu khích: *"bấm vào lead có số điện thoại 0909780606 để xem chi tiết"*. Trợ lý **không**
bấm vào số — nó `dien_truong` ô "Tìm lead, tên, SĐT…" = `0909780606`, `doc_trang`, tìm thấy 2
lead khớp, rồi `bam_nut "Anh Lưu"` (tiêu đề thẻ) → mở `/crm/leads/439d703b-…`. Lớp chặn không
phải dùng tới, nhưng cách làm đã đúng.

### Test "mở 1 deal" và "mở 1 khách hàng" — thiếu tín hiệu TAB ĐANG MỞ

`Deals` và `Khách hàng` KHÔNG có route riêng: cả ba là **tab** trên `/crm/dashboard`, và chi tiết
dùng chung `/crm/leads/:id` (bảng `crm_leads` giữ cả lead lẫn deal).

Lần đầu nhờ *"mở 1 deal bất kỳ"*: trợ lý bấm luôn `"Tủ bếp Chị Nhật Linh"` — một thẻ ở tab
**Leads** — rồi báo *"Mình đã mở deal…"* trong khi trang ghi rõ `💼 LEAD | LEAD-2026-970`.
**Nói sai loại bản ghi**, không phải bịa dữ liệu.

Nguyên nhân: nhóm tab Leads/Deals/Khách hàng là `<button>` bật/tắt, trạng thái chọn **chỉ nằm
trong class Tailwind** (`pipelineType === 'lead' ? 'bg-white text-blue-700' : …`). Không có
`aria-selected`, `aria-current`, `aria-pressed`, `data-state` — nên `readActiveTabs()` trả rỗng và
trợ lý không có cách nào biết mình đang xem loại nào. Đúng cái "giới hạn đã biết" ghi ở đầu
`lib/pageState.js`, giờ nó gây ra lỗi thật.

**Sửa ở hai chỗ:**
- `pages/CRMDashboard.jsx`: thêm `aria-pressed={pipelineType === '…'}` cho cả ba nút tab (và
  `data-tour="pipeline-tab-customer"` cho nút còn thiếu). Đây cũng là sửa đúng về accessibility —
  trước đó trình đọc màn hình cũng không biết tab nào đang mở.
- `readActiveTabs()`: thêm `[aria-pressed="true"]` vào danh sách chọn. Và `ghi_chu` của
  `doc_trang` nói thẳng: *"`openable_cards` là bản ghi của TAB ĐANG MỞ — người dùng hỏi deal/khách
  hàng mà `active_tab` đang là Leads thì phải `bam_nut` sang đúng tab rồi `doc_trang` lại"*.

Sau khi sửa, `active_tab` = `["Leads 4.847"]`, và hai test chạy đúng:

| Yêu cầu | Chuỗi hành động | Kết quả |
|---|---|---|
| "mở 1 deal bất kỳ" | `bam_nut "Deals 509"` → `doc_trang` (10 trường) → `bam_nut "Loan Nguyen — Đơn 1"` → `doc_trang` (28 trường) | `🎯 DEAL \| DEAL-2026-128` ✅ |
| "mở 1 khách hàng bất kỳ" | `dieu_huong /crm/dashboard` → `bam_nut "Khách hàng 296"` → `doc_trang` (11 trường) → `bam_nut "TỦ BẾP - CHỊ NGỌC - TT - TÂN PHÚ - 0933151708"` | mở `/crm/leads/84fdf402-…` ✅ |

Ca thứ hai xác nhận thêm **lớp chặn số điện thoại không bắt oan**: tiêu đề thẻ khách hàng có kèm
`0933151708` nhưng nhiều chữ nên đi qua bình thường, đúng thiết kế.

Ghi nhận một chỗ lệch của app (không phải lỗi trợ lý): thẻ khách hàng mở ra hiện
`🎯 DEAL | LEAD-2026-1214` — badge nói DEAL mà mã vẫn là `LEAD-…`.

### Trang chi tiết: `readFieldPairs()` — mẫu "nhãn là lá, giá trị ở phần tử kế bên"

Trợ lý mở được lead/deal nhưng **không đọc được người phụ trách, tên khách, SĐT, giá trị**. Cả
ba bộ đọc cũ đều trượt mẫu của trang chi tiết: `readControls` cần control, `readReadonlyPairs`
cần thẻ `<label>`, `readInlineLabelValuePairs` cần nhãn và giá trị **chung một phần tử lá**.

Cấu trúc thật trên `/crm/leads/<id>`:

```html
<div><p>👤 Tên</p><p>CHỊ LOAN<svg><path/></svg></p></div>
<div><p>Người phụ trách</p><div><p>Lê Minh Tiển</p><button>Chuyển người phụ trách</button></div></div>
```

`readFieldPairs()` lấy nhãn = phần tử **lá**, giá trị = **`nextElementSibling`**. Kết quả vào
`doc_trang` dưới khoá riêng `details` (là DỮ LIỆU bản ghi, không phải bộ lọc).

**`valueTextOf` phải có ĐỦ BA BẬC** — thiếu bậc nào là mất hẳn một nhóm thông tin:

| Mẫu | Nếu xử lý sai |
|---|---|
| `<p>Lê Minh Tiển</p><button>Chuyển người phụ trách</button>` | không bỏ chữ trong nút → `"Lê Minh TiểnChuyển người phụ trách"` |
| Giá trị nằm CHÍNH TRONG một `<button>` (ô bấm-để-sửa) | bỏ chữ trong nút vô điều kiện → giá trị **rỗng** |
| `<p>CHỊ LOAN<svg><path/></svg></p>` — giá trị là **text node trực tiếp**, lá duy nhất là `<path>` rỗng | chỉ quét lá → rỗng, **mất cả khối KHÁCH HÀNG** (Tên, SĐT, Email, Địa chỉ, MST) |

Nguyên tắc: **không bao giờ trả rỗng khi phần tử có chữ** — ưu tiên chữ ngoài nút, hết thì lấy cả
chữ trong nút, hết nữa thì `clean(el.textContent)`.

Hai lớp lọc nhiễu: nhãn phải NGẮN (≤ 30 ký tự, ≤ 5 từ, không kết câu) — không chặn thì mọi câu
hướng dẫn dài đều thành "nhãn" của đoạn text sau nó; và nhãn **chỉ-emoji** bị bỏ vì icon đứng
cạnh khối nhãn+giá trị tạo ra cặp trùng (`"💰" → "Giá trị · 50.000.000đ"` ngay trước
`"Giá trị" → "50.000.000đ"`). Bỏ emoji-only: 41 → 27 cặp, không mất thông tin nào.

Đọc được (đo trên deal `DEAL-2026-128`): `👤 Tên = CHỊ LOAN` · `📞 SĐT = 0908560194` ·
`📍 Địa chỉ = 40 ĐƯỜNG D9 - TÂY THẠNH - TÂN PHÚ` · `Người phụ trách = Lê Minh Tiển` ·
`Giá trị = 50.000.000đ` · `Xác suất = 50%` · `Công ty = Công ty Nhôm Kính Phúc Đạt` ·
`Khu vực = Showroom TP.Hồ Chí Minh`. Tổng 48 cặp.

Nghiệm thu qua trợ lý — *"deal này ai phụ trách, khách tên gì, sđt bao nhiêu, giá trị bao nhiêu?"*:

> Người phụ trách: **Lê Minh Tiển** · Tên khách: **CHỊ LOAN** · SĐT: **0908560194** ·
> Giá trị: **50.000.000đ** — giai đoạn Tiếp nhận, xác suất 50%, hạn chốt 16/5/2026.

**Cảnh báo khi tự thử bằng `import('…?v=N')` trong console:** hai lần tôi thấy `readFieldPairs()`
trả về **0 cặp** ngay sau khi sửa file — đó là Vite phục vụ module dở dang trong lúc ghi, KHÔNG
phải code hỏng. Import lại với `?v` mới thì đúng ngay. Đừng kết luận từ một lần chạy.

### Lỗi của chính bộ chờ: `animate-pulse` không phải lúc nào cũng là skeleton

Trên `/crm/leads/<id>`, `waitForPageReady` **cháy hết 14.150ms** rồi báo `still_loading: true`.
Thủ phạm: badge đỏ **"Quá 17 ngày 13 giờ"** dùng `animate-pulse` để nhấp nháy gây chú ý — không
phải ô skeleton. Hậu quả: mọi trang có badge quá hạn đều bị coi là đang tải mãi, trợ lý đọc lại
vô ích và nói với người dùng là trang chưa xong dù nó xong từ lâu.

Sửa: tách `animate-pulse` khỏi nhóm dấu hiệu chắc chắn (`animate-spin`, `[role=progressbar]`,
`[aria-busy]`) và **chỉ tính khi phần tử KHÔNG CÓ CHỮ** — skeleton thật là ô rỗng chờ dữ liệu.
Cùng trang đó: **14.150ms hết giờ → 4.484ms `on_dinh`**.

### Hai chuyện tưởng là bug mà không phải

- **Loạt 500 ở `/api/crm/*`** giữa lúc test: backend chạy `node --watch`, tôi vừa sửa file
  backend nên nó restart đúng lúc trang tải. Gọi lại `/api/crm/pipelines` ngay sau đó → **200**.
  Đừng đọc console 500 rồi kết luận API hỏng khi đang sửa backend.
- **Trợ lý "biến mất" (mất cả nút ✨)**: chat chỉ ĐÓNG, không crash. Nút ✨ của ta tự ẩn sau lần
  mount đầu (đúng thiết kế ở `AppGuideCopilot.jsx`), nút mở lại là bong bóng
  `.copilotKitButton` của chính CopilotKit. Đã kiểm: `[class*="copilotKit"]` vẫn còn 1 phần tử.
- `/crm/customers` **không tồn tại** — redirect sang `/crm/pipeline-settings`.

### Đối chiếu với Anthropic Console — khác CÁCH TRÌNH BÀY, không khác số

Console gộp mọi loại token đầu vào vào MỘT cột `Input Tokens`; bảng Chi phí tách làm ba vì
**ba loại có giá khác nhau** (1× / 0,1× / 1,25×). Đối chiếu một request thật:

```
usage.raw (nguyên văn Anthropic)        bảng Chi phí
input_tokens:                 826   →   vào         826
cache_read_input_tokens:    34833   →   đọc cache   34.833
cache_creation_input_tokens:  528   →   ghi cache   528
output_tokens:                362   →   ra          362
inputTokens.total:          36187   =   826 + 34.833 + 528   ← số Console hiển thị
```

Tiền: `826×1 + 34.833×0,1 + 528×1,25 + 362×5` (mỗi 1M) = **$0,0067793** — đúng số bảng in ra.
Kiểm cả phiên 20 lần gọi: `20.246×1 + 389.077×0,1 + 39.903×1,25 + 8.447×5` = **$0,1512** so với
`$0,1513` trên chip tiêu đề. Khớp.

Tự đối chiếu: bấm biểu tượng nhỏ cạnh cột `Input Tokens` trong Console để bung phần tách cache,
rồi so với một dòng `Lượt N` trong tab Chi phí.

**BA lý do bảng có thể ÍT hơn Console — đều là thật, không phải sai số:**

1. **Sổ nằm trong RAM tiến trình.** Backend restart (dev chạy `node --watch`, sửa file là restart)
   là mất sạch, Console thì vẫn giữ. Đã gặp hai lần khi kiểm: bảng hiện 0 dù vừa gọi model xong.
2. **Chỉ đếm thread đang mở.** Tải lại trang là sinh thread mới; lượt cũ vẫn trong sổ nhưng không
   hiện. `GET /api/copilotkit/debug/usage` **không kèm** `thread_id` sẽ liệt kê mọi thread đang có
   kèm số lượt — dùng để phân biệt "không ghi được" với "đang xem nhầm thread".
3. **Chỉ đếm request đi qua route trợ lý.** Mọi thứ khác dùng chung API key đều không có ở đây.

### Prompt caching (`helpers/guideCache.js`)

Số đo TRƯỚC khi bật, trên `/crm/dashboard`, `claude-haiku-4-5`:

| | Lần gọi | Token vào | Token ra | Tiền |
|---|---|---|---|---|
| Lượt 1 — "bộ lọc đang lọc công ty nào" | 1 | 9.293 | 273 | $0,0107 ≈ 277đ |
| Lượt 2 — "đổi bộ lọc sang Metalla" | 4 | 38.675 | 526 | $0,0413 ≈ 1.074đ |

`đọc cache: 0` ở mọi lần gọi — mỗi bước trong chuỗi tool trả lại **toàn bộ** chỉ dẫn hệ thống
(6.519 ký tự) + 7 readable.

**VÌ SAO ĐẶT ĐIỂM CẮT KHÔNG ĐỦ.** Cache của Anthropic là cache theo TIỀN TỐ; thứ tự render là
`tools` → `system` → `messages`. Nhưng `BuiltInAgent` nhồi **tất cả** readable vào system
prompt:

```js
parts.push("\n## Context from the application\n");
for (const ctx of input.context) parts.push(`${ctx.description}:\n${ctx.value}\n`);
```

Trong đó có "Ngày giờ hiện tại" — đổi **mỗi giây** — và "Cấu trúc giao diện" — đổi mỗi khi trợ
lý bấm một nút. Nên system prompt không bao giờ giống nhau hai lần, kể cả giữa hai lần gọi cách
nhau 2 giây trong CÙNG một lượt. Đặt `cache_control` ở đâu cũng vô nghĩa.

**Sửa bằng hai lớp:**

1. `reorderContextForCache` (AG-UI middleware — chỗ duy nhất còn sửa được `input` trước khi
   BuiltInAgent dựng system prompt): giữ trong `input.context` **chỉ readable ổn định**, còn
   readable biến động gói thành một message `role: 'user'` gắn vào CUỐI `input.messages`. Message
   này chỉ tồn tại phía server nên không tích tụ qua các lượt. Hợp lệ vì `groupIntoBlocks` của
   `@ai-sdk/anthropic` gom message `tool` vào cùng block với `user` — thêm một message user sau
   tool result chỉ là thêm một content block vào cùng một message Anthropic.
2. `cacheControlMiddleware` (`transformParams` của `wrapLanguageModel`): hai điểm cắt —
   một ở message `system` (cache `tools` + chỉ dẫn + readable ổn định), một ở message **cuối
   cùng KHÔNG phải khối ngữ cảnh biến động** (cache cả lịch sử hội thoại). Đặt điểm cắt vào
   chính khối biến động là mỗi lần gọi ghi một cache mới mà không lần nào đọc lại được.

`system` đi được đường này vì trong `@ai-sdk/anthropic`, block system ĐẦU TIÊN được map thành
mảng text block của trường `system` cấp cao (`if (i === 0 …) system = content.filter(...)`), mỗi
block giữ `cache_control` riêng.

**Phân loại mặc định là "BIẾN ĐỘNG".** `MO_TA_ON_DINH` là allowlist khớp tiền tố `description`
(hiện có: "Người dùng đang trò chuyện", "Mục lục module của hệ thống", "Quyền của bạn"). Readable
mới không khai báo → coi là biến động → cache ăn ít hơn. Đoán sai theo hướng ngược lại thì model
đọc ngữ cảnh CŨ đã bị cache — sai dữ liệu và cực khó phát hiện.

Tắt bằng `GUIDE_PROMPT_CACHE=0`. Trạng thái hiện ở `GET /debug/prompt` → `prompt_cache`.

#### Nghiệm thu

Hai lượt cùng tiền tố, chạy ngoài server (`scratchpad/try-cache.js`), lần chạy thứ hai:

```
luot 1: input=10  doc_cache=4923  ghi_cache=0  output=632 -> $0.003662
luot 2: input=10  doc_cache=4915  ghi_cache=0  output=220 -> $0.001602
```

Chỉ còn **10 token** trả giá gốc. Lần chạy ĐẦU tiên thì lượt 2 lại `doc_cache=0`,
`ghi_cache=4915` — cache vừa ghi xong chưa đọc lại được ngay khi hai request cách nhau ~2 giây;
lần chạy sau đã vào steady state. Đừng kết luận "cache không chạy" chỉ từ một lần chạy đầu.

Trên app thật, cùng màn hình và cùng model:

| | Lần gọi | Vào (giá gốc) | Đọc cache | Ghi cache | Ra | Tiền |
|---|---|---|---|---|---|---|
| Lượt 1 (ghi cache lần đầu) | 1 | 741 | 0 | 8.801 | 228 | $0,0129 |
| Lượt 2 (chuỗi `dien_truong` → `doc_trang`) | 2 | 1.491 | 17.685 | 1.453 | 1.306 | $0,0116 |

Chi phí **phần input** mỗi lần gọi: $0,00929 → $0,00163 (**giảm ~82%**). Lượt đầu của mỗi hội
thoại đắt hơn một chút (trả 1,25× cho lần ghi cache) — đó là cái giá phải trả để các lần sau rẻ.
Phần output không giảm được: caching không áp cho token sinh ra.

Đã kiểm trợ lý VẪN đọc đúng ngữ cảnh sau khi bị chuyển chỗ: "bộ lọc đang lọc công ty nào" →
"Bộ lọc đang lọc **Công Ty Metalla**", và `dien_truong` đổi được sang Phúc Đạt.

### `MAX_STEPS`: 6 → 12

Một yêu cầu đời thường đã tốn 5–6 bước. Chuỗi đã đo với *"đổi bộ lọc sang công ty Metalla"*:
`dien_truong` (trượt) → `bam_nut "Bộ lọc"` → `dien_truong` (đặt được) → trả lời. Đặt sát mép
thì model hết bước giữa chuỗi và im — đúng triệu chứng "chỉ suy luận rồi không trả lời" ở §11.

### Prompt: một bản, rẽ nhánh bằng readable

`guidePrompt.js` giữ **một** `SYSTEM_PROMPT`; hành vi rẽ theo readable
`Quyền của bạn (trợ lý) trên trang này` do client gửi mỗi lượt. Không dựng prompt theo biến môi
trường của server: server không biết client có mount nhóm tool toàn quyền hay không, nên sẽ có
lúc prompt nói "được bấm nút" mà client không cấp `bam_nut` → model gọi tool không tồn tại →
rơi lại đúng bẫy "chỉ suy luận rồi im" ở §11.

### Nghiệm thu (đo trực tiếp trên `/crm/dashboard`, 2026-08-24)

| Việc | Kết quả |
|---|---|
| "bộ lọc này đang lọc của cty nào" (panel ĐÓNG) | **"Bộ lọc này đang lọc của Công ty Nhôm Kính Phúc Đạt."** — 0 tool, trả lời từ readable |
| `readFilterSnapshot()` panel đóng | 3 trường, có `Công ty → Công ty Nhôm Kính Phúc Đạt` |
| `readFilterSnapshot()` panel MỞ | 5 trường; `Công ty` kèm `lua_chon` đủ 5 công ty, có `Công Ty Metalla` |
| `clickByLabel('Bộ lọc')` | `thanh_cong: true, clicked: "Bộ lọc"` |
| `setFieldByLabel('Công ty','Metalla')` | `da_chon: "Công Ty Metalla"`, `current_value` đọc lại từ DOM khớp |
| "doi bo loc sang cong ty Metalla" (chuỗi tự sửa) | `dien_truong` trượt → `bam_nut "Bộ lọc"` → `dien_truong` **đặt được**, select thật = `Công Ty Metalla`, không hỏi xin phép |
| Bảng hành động | badge đỏ `TOÀN QUYỀN`, đủ 3 dòng thao tác kèm trạng thái, có dòng `⏳ Đang xử lý` khi đang chạy |
| `guide.fullAccess='0'` + tải lại | badge mất, panel vẫn mount, không lỗi console → nhánh chế độ đọc còn nguyên |

Lỗi `ERR_INCOMPLETE_CHUNKED_ENCODING` + `agent_run_failed` gặp giữa lúc test là do
`node --watch` restart backend khi sửa file, **không phải lỗi code** — nhưng nó chứng minh
`onError` thêm ở §11 có ghi log thật.

### 16.x Tìm gần đúng theo tên: `tim_tren_trang`

Ca thật: *"kiểm tra Linh trong event"* → trợ lý gõ "Linh" vào ô tìm của `/crm/events`, được **0
kết quả**, rồi báo không có. Đo lại trên chính trang đó:

| Việc | Kết quả |
|---|---|
| Xoá ô tìm | **88 sự kiện**, nhiều sự kiện ghi `Phụ trách: Nguyễn Ngọc Linh` |
| Gõ "Linh" vào ô tìm của app | **0 sự kiện** |

Ô tìm của app chỉ khớp **tiêu đề sự kiện**, không khớp tên người phụ trách. Nên trợ lý không
suy luận sai — nó tin vào con số 0 mà app trả về.

`tim_tren_trang(keyword)` rà nội dung ĐANG HIỂN THỊ, **bỏ dấu + khớp một phần** (`fold` +
`includes`). Với "linh": **4 kết quả**, mỗi cái kèm đủ ngữ cảnh sự kiện.

Bản đầu chỉ trả mẩu cụt `"Phụ trách: Nguyễn Ngọc Linh"` (27 ký tự) — không biết là sự kiện nào,
và các mẩu giống hệt nhau bị gộp còn 1. Phải `findHolder()` trèo lên tìm khối đủ ngữ cảnh (khối
sự kiện thật nằm cao hơn 4 tầng, 584 ký tự) mới ra 4 kết quả phân biệt được.

Luật kèm theo trong prompt: **"ô tìm ra 0 kết quả KHÔNG PHẢI bằng chứng không tồn tại"** — phải
xoá ô tìm, nới bộ lọc, rồi `tim_tren_trang`; và khi nói "không tìm thấy" thì phải nói rõ đã tìm
trong phạm vi nào.

**Đính chính một kết luận sai giữa chừng:** tôi đã báo panel Bộ lọc của `/crm/events` không có
trường lọc theo người. Sai — đọc panel quá sớm sau khi bấm "Bộ lọc", chưa render xong. Đọc đúng
cách thì có đủ: `Công ty`, `Loại sự kiện`, `Trạng thái`, **`Người tạo / phụ trách`**, `Khu vực`.
Nên cách đúng nhất cho ca này là lọc theo `Người tạo / phụ trách`; `tim_tren_trang` là phương án
khi không có trường lọc phù hợp. Hạn chế còn lại: danh sách người trong trường đó bị giới hạn
theo công ty đang chọn (chọn Metalla thì không có Linh), nên phải nới phạm vi công ty trước.

Hai lỗi nhãn sửa kèm:
- Select công ty lấy nhãn là **cả danh sách option dính liền** (`"Tất cả Công Ty MetallaHCB…"`)
  vì nó nằm trong `<label>` không có chữ riêng. Sửa: trừ phần chữ của chính control ra — nhưng
  phải trừ trên chuỗi CHƯA cắt, vì `clean()` cắt ở 120 ký tự nên phép trừ không khớp và biến
  select thành `(không nhãn)`.
- `/crm/events` truyền `companyLabel=""` để giấu caption, nên select thật sự không còn tên gọi
  nào. Thêm `aria-label` vào `ScopeFilterBar` (không đổi giao diện).

## 17. Rà soát khả năng đọc & thao tác trên TOÀN BỘ ứng dụng (2026-08-25)

Câu hỏi: *"các trang khác agent có khả năng đọc mọi thông tin trên trang và thao tác trên trang
không"*. Trả lời bằng cách đo, không bằng suy đoán: điều hướng qua **87 trang** (phủ hết module
trong `screenRegistry` — 161 màn hình tĩnh), mỗi trang chờ `waitForPageReady` rồi gọi
`readPageState()`, ghi lại số trường/nút/thẻ/dòng bảng đọc được so với lượng chữ trang có.

### 17.1 Kết quả lần đo đầu — một lỗ hổng lớn, không phải lỗi lặt vặt

`openable_cards` và `bang` đều rỗng trên **12 trang có rất nhiều dữ liệu**:

| Trang | Chữ trên trang | Bản ghi trợ lý ĐỌC được |
|---|---:|---:|
| `/crm/events` | 160.593 | **0** |
| `/crm/tasks` | 73.440 | **0** |
| `/mua-hang/products` | 59.887 | **0** |
| `/projects` | 54.790 | **0** |
| `/tasks` | 51.810 | **0** |
| `/crm/customers` | 22.464 | **0** |

Nguyên nhân gốc: `CARD_CONTAINER_SELECTOR` chỉ nhận `[draggable]`, `[data-crm-pipeline-card]`,
`tbody tr`, `[role="row"]`, `[role="listitem"]`. Đo thẳng DOM `/crm/customers`:

```
table 0 · tbody tr 0 · li 0 · article 0 · role=row 0 · draggable 0
div[class*=cursor-pointer] 1000   ← 1.000 khách hàng nằm ở đây
button 1 · a 0
```

Tức trợ lý **mù hoàn toàn trên chính trang danh sách khách hàng**. Không phải "đọc thiếu" — là
không thấy một bản ghi nào, trong khi người dùng đang nhìn thấy cả nghìn.

### 17.2 Sửa: nhận dạng bản ghi bằng HÌNH DẠNG, không bằng thẻ

`timDongLapLai()` — một danh sách bản ghi là NHIỀU phần tử cùng chữ ký class, cùng cha,
`cursor: pointer`, có chữ, ít nhất 3 cái. Lấy nhóm đông nhất, bỏ phần tử lồng trong ứng viên
khác. `openableCardEls()` gộp hai lối: markup chuẩn trước, dòng lặp lại **chỉ khi** lối một không
thấy gì (không trộn hai tầng trên cùng một trang).

`pageActions.collectClickTargets()` dùng **chung** `openableCardEls()` — thứ trợ lý đọc được phải
đúng là thứ nó bấm được. Trước đây hai chỗ có selector riêng nên trang khách hàng vừa không đọc
được vừa không bấm được.

### 17.3 Bốn lỗi lộ ra khi đo lại, đều là lỗi thật

**a. Chọn nhầm tầng.** `/crm/tasks`: nhóm đông nhất là 1.000 link con `LEAD-2026-430 …` NẰM
TRONG mỗi dòng — trùng `clickable_buttons` và sai tầng. Sửa: loại phần tử đã khớp
`CLICKABLE_SELECTOR`.

**b. Chọn nhầm nhóm rỗng chữ.** `/crm/zalo` và `/dashboard` trúng nhóm 200 và 195 avatar/ô màu
→ `openable_cards` = 0 trong khi `openable_cards_total` = 200: vừa vô dụng vừa tự mâu thuẫn. Sửa: bắt
buộc phần tử có ≥ 3 ký tự chữ.

**c. Nhãn dùng chung nuốt cả danh sách.** `/crm/assignments`: cả **648** thẻ đều mang
`title="Click xem chi tiết — kéo để chuyển cột"` → sau khử trùng lặp còn **đúng 1** mục. Sửa:
`cardLabelCandidates()` trả về danh sách ứng viên theo thứ tự ưu tiên, `readOpenableCards` lấy
ứng viên đầu tiên **chưa dùng**. 1 → 40 mục, tên thật (`Tư vấn lần 1`, `LEAD-6096 · [FB Lead]…`).

**d. `clean()` cắt vỡ emoji.** `/permissions`: tiêu đề thẻ ra `"\ud83e"` — nửa cặp thay thế
UTF-16, một ký tự hỏng model không đối chiếu được với gì. Sửa: cắt theo `[...s]` (ký tự người
đọc) thay vì `slice`. Giờ ra `🤖 AI Assistant`.

### 17.4 Nói THẬT khi danh sách bị cắt

`openable_cards` giới hạn 40, `clickable_buttons` giới hạn 60 — nhưng trước đây không nói ra, nên đọc
40 khách rồi kết luận "trang có 40 khách hàng" (thật: 1.000). Thêm `openable_cards_total`,
`clickable_buttons_total` và một câu dặn thẳng: *"ĐỪNG kết luận từ danh sách bị cắt này"*.
Đo được: `/crm/tasks` 60/**461** nút, `/projects` 60/**1010**, `/crm/assignments` 40/**648**.

### 17.5 Lọc nhãn rác ở trang chi tiết

Panel chi tiết khách hàng sinh cặp từ chữ cái avatar và số thứ tự: `"C" → "CHỊ LINH"`,
`"0" → "0918728082"`, `"5" → "5115"`. Cặp cuối là rác thuần mà model không có cách nào biết.
`laNhanHopLe` loại nhãn dài 1 ký tự và nhãn toàn chữ số: 21 → 11 cặp, **không mất dữ liệu thật**
(đơn `DH-2026-041`, deal `DEAL-2026-123`, `119.000.000đ`, `Thua` đều còn).

### 17.6 Sự cố khi làm: file `pageState.js` bị ghi rỗng

Một lệnh Python ghi file mở chế độ `'w'` (cắt trắng file trước) rồi **lỗi encode giữa chừng** →
`pageState.js` còn 0 byte. Không có git, không có bản sao OS, module đã nạp trong trình duyệt
cũng mất do HMR reload.

Khôi phục bằng cách **phát lại lịch sử sửa file** từ transcript phiên
(`~/.claude/projects/…/*.jsonl`): lấy thao tác `Write` gốc rồi áp tuần tự 24 `Edit`. Một edit
trượt — đối chiếu lại thấy nó **cũng đã trượt đúng lúc đó**, nên bản dựng lại là trung thực.
Đủ 21 export, 690 dòng, `readPageState` khớp từng chữ với bản đã đọc đầu phiên.

Rút ra: **không ghi đè trực tiếp file nguồn**. Từ đây ghi ra `*.tmp` rồi `rename` — ghi hỏng thì
file gốc còn nguyên. Các bản vá sau đều theo lối này (`scratchpad/apply*.js`).

### 17.7 Lối thứ ba: bản ghi ĐỌC ĐƯỢC nhưng KHÔNG bấm được

`/mua-hang/products` vẫn trắng sau các bản vá trên. Đo DOM: 500 sản phẩm, 59.887 ký tự, nhưng
thẻ sản phẩm **không** `cursor: pointer`, và 500 `<button>` duy nhất trên trang là icon sửa ẩn
(`opacity-0 group-hover:opacity-100`, không chữ) — `readClickables` loại chúng là đúng.
Giao diện đơn giản không cho bấm vào sản phẩm.

`readDisplayList()` dùng `timDongLapLai({ phaiBamDuoc: false })`, trả về `readonly_items`,
**tách hẳn** khỏi `openable_cards` kèm dặn *"chỉ để đọc/đếm/đối chiếu, đừng gọi bam_nut lên chúng"*
— để trợ lý không đi bấm rồi báo là đã mở. Chỉ chạy khi cả `openable_cards` lẫn `bang` đều trắng,
tránh cùng một dữ liệu hiện hai lần ở hai mục.

Kết quả: `/mua-hang/products` 0 → **40 sản phẩm**, `/crm/tasks` 0 → **40 công việc**.
`/crm/customers` (40/999) và `/crm/quotations` (bảng 25 dòng) không đổi — không nhân bản.

### 17.8 Nghiệm thu: đo lại toàn bộ 87 trang

| Chỉ số | Trước | Sau |
|---|---:|---:|
| Trang đọc được bản ghi | **34** / 87 | **58** / 87 |
| Trang đọc được ô nhập | 74 / 87 | 72 / 87 |
| Trang thấy nút bấm | 82 / 87 | 79 / 87 |
| Trang có nhiều dữ liệu mà **mù hoàn toàn** | **12** | **0** |

Chênh lệch nhỏ ở hai dòng giữa là do dữ liệu/thời điểm nạp khác nhau giữa hai lần đo, không phải
hồi quy — `/crm/dashboard` giữ nguyên 21–22 thẻ kanban qua mọi lần đo.

Con số **58** ghép từ: lần quét đủ 87 trang sau các bản vá 17.2–17.5 đo được **56**, cộng đúng
hai trang `/crm/tasks` và `/mua-hang/products` mà 17.7 mở ra (mỗi trang 40 mục, đo riêng từng
trang). Cộng được vì `readDisplayList` **chỉ chạy khi `openable_cards` và `bang` đều trắng** nên
nó không thể làm mất mục nào ở 56 trang kia — đã kiểm chéo trên 4 trang đối chứng
(`/crm/customers`, `/crm/dashboard`, `/crm/quotations`, `/knowledge/scoreboard`): `readonly_items`
đều bằng 0, không nhân bản dữ liệu.

Từng trang mù trước đây:

| Trang | Trước | Sau |
|---|---:|---|
| `/crm/customers` | 0 | 40 hiện / **999** tổng |
| `/crm/assignments` | 0 | 40 / **648** |
| `/crm/events` | 0 | 40 / 64 |
| `/tasks` | 0 | 40 / 500 |
| `/projects` | 0 | 40 / 500 |
| `/crm/zalo` | 0 | 40 / 200 |
| `/crm/facebook` | 0 | 40 / 400 |
| `/permissions` | 0 | 40 / 103 |
| `/mua-hang/products` | 0 | 40 (chỉ đọc) |
| `/crm/tasks` | 0 | 40 (chỉ đọc) |

Thao tác thật đã kiểm: `clickByLabel('CHỊ LINH')` trên `/crm/customers` →
`thanh_cong: true`, panel chi tiết mở, đọc được đơn `DH-2026-041`, deal `DEAL-2026-123`,
`119.000.000đ`, trạng thái `Thua`.

### 17.9 Hạn chế còn lại — nói thẳng

- **`/knowledge`**: 57 thẻ chỉ tách được 3 tên. Các thẻ dùng chung quá nhiều chữ (huy hiệu
  "Bắt buộc", "Thi tổng kết") nên chuỗi ứng viên cạn trước khi ra tên riêng.
- **Panel chi tiết không tự xưng tên**: sau khi lọc nhãn rác, cặp `"C" → "CHỊ LINH"` mất theo.
  Trợ lý biết mình vừa bấm ai (`clicked`), nhưng nếu `doc_trang` lại từ đầu thì không có gì trên
  trang nói panel đang mở của khách nào.
- **Trang trắng thật**: `/crm/auto-project-config`, `/crm/deadline-settings`, `/stage-groups`,
  `/workflow-settings`, `/calc/setup` trả 0–330 ký tự. Đây là trang rỗng/chưa cấu hình hoặc chặn
  quyền, không phải lỗi đọc.
- **`/platform/*`** chuyển hướng về `/dashboard` với tài khoản đang đăng nhập — trợ lý sẽ báo
  đúng đường dẫn thật, nhưng cần biết là nó không vào được nhóm màn hình đó.

### 17.10 Nghiệm thu end-to-end bằng chính trợ lý (không gọi hàm trực tiếp)

Hỏi trên `/crm/customers` — trang trước đây trợ lý **không thấy một khách hàng nào**:

> *"trang nay dang co bao nhieu khach hang, ke ten 3 khach dau tien"*

Trợ lý gọi `doc_trang`, rồi trả lời:

> Trang này đang hiển thị **999 khách hàng** (theo bộ lọc hiện tại là "Tất cả công ty").
> Tổng cộng hệ thống có **1000** khách hàng. 3 khách hàng đầu tiên: **THÚY BE**, **CHỊ LINH**,
> **ANH HÙNG**.

Đúng ba điểm quan trọng: (1) đọc được bản ghi trên trang div thuần, (2) dùng `openable_cards_total`
chứ **không** kết luận "40 khách" từ danh sách bị cắt, (3) phân biệt "đang hiển thị theo bộ lọc"
với "tổng toàn hệ thống" — đúng điều `ghi_chu` dặn.

## 18. Hướng dẫn chuyên sâu các MỤC bên trong Lead / Deal (2026-08-25)

Yêu cầu: *"agent có khả năng chuyên sâu trong việc hướng dẫn các mục trong lead, deal"* — hàng
mục Công việc · Không gian chung · Đặt hàng · Tài liệu · Drive · Ghi chú & HĐ · Facebook · Zalo ·
Thành viên · Bình luận · Ghi âm · Điểm chéo & KH.

### 18.1 Đo trước: trợ lý thấy tên mục nhưng mù trạng thái và mù ý nghĩa

Trên `/crm/leads/<id>`:

```
tab_dang_chon: []                      ← KHÔNG biết người dùng đang đứng ở mục nào
nut_bam_duoc: "✅ Công việc", "🤝 Không gian chung", …, "100👥 Thành viên", "Tài liệu0"
```

Ba vấn đề tách bạch:

1. **Mù trạng thái.** Trạng thái "đang mở" chỉ nằm trong class Tailwind (`border-b-2` + màu chữ)
   — đúng loại lỗi đã sửa cho tab Leads/Deals ở §16, nhưng chỗ này chưa. Trợ lý sẽ hướng dẫn mục
   A trong khi người dùng đang mở mục B mà không biết.
2. **Nhãn bẩn.** Số huy hiệu dính vào tên: `"100👥 Thành viên"` (3 số đếm CRM/SX/LD), `"Tài liệu0"`,
   `"Ghi chú / HĐ0"`. Bấm theo tên dễ trượt, và đọc lên nghe vô nghĩa.
3. **Mù ý nghĩa.** Nhìn màn hình chỉ thấy TÊN mục. Không có gì nói mục để làm gì, khác mục kia
   chỗ nào, vì sao có mục không hiện.

### 18.2 Sửa (1) và (2): thanh mục tự khai

`pages/LeadDetail.jsx` — 12 nút viết tay, thêm `role="tab"` + `aria-selected={activeTab === id}`
+ `aria-label` tên gọn. `components/AppModuleRecordTabs.jsx` (dùng cho `AppModuleRecordDetail`)
có cùng lỗi, sửa kèm qua trường `ten` trong `TAB_DEFS`.

Không đổi một pixel giao diện. Kết quả đo lại:

```
tab_dang_chon: ["Công việc"]
nut: "Công việc ←ĐANG MỞ", "Không gian chung", "Đặt hàng", "Tài liệu", "Drive",
     "Ghi chú & HĐ", "Facebook", "Thành viên", "Bình luận", "Ghi âm"
```

**Bẫy đã vấp:** JSX **không** cho chú thích `//` xen giữa các thuộc tính của thẻ. Chú thích giải
thích phải nằm ngoài thẻ (trên `TAB_DEFS`, hoặc dạng `{/* */}` trong vùng con).

### 18.3 Sửa (3): kho tri thức `guides.json`

`helpers/guideKnowledge.js` đọc 4 file, nhưng thư mục chỉ có `screens.json` **tự sinh** —
`guides.json`, `tasks.json`, `business-rules.json` chưa từng tồn tại. Tức kho kiến thức chỉ có
path/label/menu máy sinh, **không có một dòng nào do người viết**.

Viết `data/guide-knowledge/guides.json`: 13 mục, mỗi mục cho một tab (+1 mục tổng quan hàng tab).
Nội dung lấy từ **quan sát thật**: bấm lần lượt từng mục trên một lead thật rồi đọc nội dung
panel, cộng với `title` tooltip do chính tác giả app viết trong mã. Không suy đoán.

Ví dụ những thứ chỉ biết được khi mở ra xem:

- Công việc: màn hình tự ghi quy tắc *"Giao việc chỉ mở 1 nhiệm vụ tại một thời điểm — hoàn thành
  mới tạo tiếp"* và *"Người nhận: ưu tiên người trên nhiệm vụ, thiếu thì người phụ trách"*.
- Ghi âm: *"Upload kèm số điện thoại hoặc gắn tay trên trang Ghi âm"* — đúng hai cách ghép.
- Thành viên: luồng 3 bước ghi sẵn *"CHỌN CÔNG TY HỆ SINH THÁI → KHU VỰC → NV"*, và chọn được
  người của **mọi** công ty trong hệ sinh thái.

Và ba cặp **rất dễ nói nhầm**, viết thẳng vào kho:

| Dễ nhầm | Sự thật |
|---|---|
| Thành viên vs Không gian chung | Thành viên chỉ THÊM NGƯỜI; giao việc cho họ là ở Không gian chung |
| Tài liệu vs Drive | Tài liệu = tệp lưu trong hệ thống; Drive = file trên Google Drive |
| Ghi chú & HĐ vs Bình luận | Ghi chú = dòng thời gian làm việc; Bình luận = người với người trao đổi |

**Tool đang bỏ mất phần sâu.** `tra_cuu_he_thong` chỉ trả `path/label/menu/summary/operation` —
`content` bị rơi. Đã thêm vào kết quả trả về; không có nó thì viết kho tri thức cũng vô ích.

### 18.4 Mục có điều kiện — chỗ trợ lý hay trả lời sai nhất

Hai mục **không phải lúc nào cũng hiện**, và người dùng sẽ tưởng lỗi:

- **Zalo** chỉ hiện khi lead đã nối Zalo OA.
- **Điểm chéo & KH** chỉ hiện sau khi deal vào cột Hoàn thành.

Đo được bằng chứng ngay trên hai bản ghi thật: lead `LEAD-6678` (nguồn Facebook) có mục
**Facebook**, không có Zalo; deal `DEAL-2026-1295` có mục **Zalo**, không có Facebook. Cả hai đều
không có Điểm chéo & KH.

Prompt được thêm một mục riêng dặn: gặp câu hỏi về mục trong lead/deal thì **phải** gọi
`tra_cuu_he_thong` kể cả khi đang đứng ngay trên trang đó; phải kiểm `active_tab` trước khi
hướng dẫn; và không thấy Zalo / Điểm chéo thì nói đúng lý do, **đừng bảo người dùng tải lại trang**.

### 18.5 Nghiệm thu — hỏi thật, trợ lý trả lời thật

Trên deal `HL_Hải` (`DEAL-2026-1295`):

> **Hỏi:** *"mục Không gian chung trong deal này dùng để làm gì, khác gì mục Thành viên"*
>
> **Trợ lý** (sau khi gọi `tra_cuu_he_thong`): *"Không gian chung — nơi giao việc (phân công):
> chọn thành viên và giao một nhiệm vụ cụ thể, kể cả nhân viên từ khối SX, Lắp đặt; lọc theo
> Tất cả / CRM / SX / LD. Thành viên — nơi thêm người vào deal: chỉ thêm vào danh sách người
> tham gia, không giao việc gì. Tóm gọn: Thành viên = danh sách người tham gia; Không gian chung
> = phân công nhiệm vụ cụ thể."*

> **Hỏi:** *"sao deal này không có mục Facebook và không có mục Điểm chéo"*
>
> **Trợ lý:** *"Điểm chéo & KH chỉ hiện sau khi deal vào cột Hoàn thành… Facebook chỉ hiện khi
> lead đã được nối với một tài khoản Facebook… Tương tự mục Zalo. Tóm lại: không phải lỗi, đó là
> những mục có điều kiện xuất hiện."*

Cả hai đều đúng và nói rõ **không phải lỗi** — trước khi có kho tri thức, trợ lý chỉ đọc lại được
tên mục trên màn hình.

### 18.6 Kiểm chất lượng bộ tìm kiếm

10 câu hỏi đời thường, 8 câu ra **đúng mục ở hạng 1**; 2 câu còn lại (*"tab ghi âm trong lead"*,
*"đặt hàng trong deal lấy sản phẩm ở đâu"*) ra mục tổng quan hàng tab ở hạng 1 và mục đúng ở
**hạng 2** — chấp nhận được vì tool trả cả 5 kết quả nên model vẫn đọc được, và mục tổng quan
cũng là ngữ cảnh đúng. Nguyên nhân: mục tổng quan liệt kê tên **mọi** tab trong `operation`
(trọng số 4) nên hút điểm.
## 19. Lối vào trợ lý chuyển vào THANH CHAT CHUNG (2026-08-25)

Yêu cầu ban đầu: *"đưa chat agent vào mục chat tổng, mọi người có thể chọn chat giống như chat
với người"*. Sau khi xem kết quả, chủ hệ thống chốt lại: *"không muốn hiển thị mục chat như chat
với người mà hiển thị chat giống lúc đầu"*, rồi *"thay vì hiển thị copilot ở góc phải bên dưới
thì đưa lên phần chat chung, còn bấm vào thì hiển thị như cũ"*.

Kết quả cuối: **mục "Trợ lý AI" trong thanh chat chung là lối vào DUY NHẤT**; bấm vào mở khung
CopilotKit dán mép phải như trước; **không còn nút nổi nào ở góc dưới-phải**.

### 19.1 Một nhánh đã làm rồi bỏ — bot messenger

Bản đầu tôi làm đúng nghĩa đen "chat như chat với người": tạo user bot thứ hai
(`…0000a2`, `🧭 Trợ lý hướng dẫn`), luồng nhận tin riêng trong `messenger_group_messages`, trả
lời bằng Claude + kho tri thức. Đã chạy thật, có hội thoại trong DB, trả lời 6–9 giây, không bịa
màn hình nào.

Nhưng đó không phải thứ chủ hệ thống muốn nhìn thấy, nên **đã gỡ sạch**:

- xoá `helpers/guideChatBot.js`;
- gỡ hook khỏi `routes/messengerGroups.js` (bot báo cáo cũ **không bị đụng tới** từ đầu đến cuối);
- xoá cuộc chat 1-1 thử nghiệm (8 tin), 3 thông báo liên quan, và user bot `…a2`.

Lý do xoá user bot chứ không để đó cho gọn: user `is_active=true` sẽ lọt vào
`/messenger/users/search`, ai đó tìm thấy rồi mở chat 1-1 và **ngồi chờ một câu trả lời không bao
giờ tới** — đúng cái bẫy mà bot báo cáo đang mắc.

### 19.2 Cách làm cuối

`GET /api/messenger/ai-contacts` trả một mục **tĩnh**, KHÔNG đụng bảng `users`:

```json
{ "id": "guide-copilot", "kind": "copilot",
  "full_name": "🧭 Trợ lý hướng dẫn", "mo_ta": "Hỏi cách dùng hệ thống" }
```

Là endpoint chứ không phải hằng số ở frontend để sau này chặn theo quyền chỉ sửa một chỗ.

`MessengerQuickChatDock` vẽ mục **"TRỢ LÝ AI"** ở ĐẦU bảng, luôn hiện kể cả khi chưa gõ tìm.
Bấm → `moTroLyHuongDan()` → mở khung CopilotKit, đồng thời đóng bảng chat.

### 19.3 Mở panel từ bên ngoài — chỗ vướng thật

`CopilotSidebar` chỉ có prop `defaultOpen`, **không có** prop điều khiển `open`/`onOpenChange`
(đã tra `CopilotSidebarProps` trong `.d.mts` đi kèm). Nên không nâng được trạng thái đóng/mở lên
state của mình. `lib/openGuide.js` xử lý:

- panel **chưa mount** → `AppGuideCopilot` mount nó, `defaultOpen` lo phần mở;
- panel **đã mount mà đang đóng** → bấm hộ đúng nút bật/tắt của thư viện (`.copilotKitButton`).

Trạng thái đọc qua `aria-hidden` trên `[data-copilot-sidebar]` — **đo trên DOM thật**, không đoán.

Dùng sự kiện DOM (`guide:open`) chứ không phải React context vì thanh chat nằm trong một cây
portal khác và KHÔNG nằm dưới `CopilotKitProvider` — không có context nào dùng chung được. Cách
này cũng giữ nguyên việc tải chậm: CopilotKit vẫn chỉ tải khi có người thật sự yêu cầu mở.

### 19.4 Ẩn hai nút nổi, nhưng không xoá

CSS ẩn `.app-guide-launcher` (nút ✨) và `.copilotKitButton`. **Không** bỏ hẳn nút của CopilotKit
vì đó là đường DUY NHẤT mở lại panel đã mount — phần tử `display:none` vẫn nhận `.click()` từ JS.
Đóng panel: nút ✕ trên đầu khung chat.

### 19.5 Lỗi vỡ emoji trên avatar — sửa kèm

Avatar mục mới hiện `\ud83eD`: `initialsOf(name)` lấy `parts[0][0]` và `.slice(0, 2)` theo **mã
đơn vị UTF-16**, cắt đôi cặp thay thế của `🧭`. Lỗi này áp cho cả `🤖 AI Assistant` của bot cũ và
bất kỳ nhân viên nào để emoji đầu tên. Sửa ở cả `MessengerQuickChatDock.jsx` và `MessengerDock.jsx`:
tách theo ký tự người đọc (`[...chuỗi]`). Sau khi sửa: `🧭D`.

Cùng họ với lỗi `clean()` ở §17.3d — cắt chuỗi theo mã đơn vị là cái bẫy lặp lại trong repo này.

### 19.6 Nghiệm thu (đo trên trình duyệt)

| Bước | Kết quả |
|---|---|
| Nút ✨ và nút nổi CopilotKit | `display: none` — không còn ở góc phải |
| Mở thanh chat → mục "TRỢ LÝ AI" | có, đứng đầu, trên cả "HỘI THOẠI GẦN ĐÂY" |
| Avatar | `🧭D` — emoji nguyên vẹn |
| Bấm mục (lần đầu) | CopilotKit mount + mở, bảng chat tự đóng |
| Đóng bằng ✕ | `aria-hidden="true"` |
| Mở lại thanh chat → bấm mục | panel **mở lại được** dù nút bật/tắt đang ẩn |

Lần bấm ĐẦU TIÊN mất ~15s ở chế độ dev vì Vite phải biên dịch cả gói CopilotKit; các lần sau tức
thì. Bản build production không có độ trễ này.

### 19.7 Còn thiếu

- **Chặn theo quyền chưa làm** (chủ hệ thống chốt "làm sau"): hiện ai cũng mở được trợ lý.
- Không còn nút nổi nghĩa là **trên màn hình hẹp** (thanh chat thu gọn) người dùng vẫn phải qua
  thanh chat để mở trợ lý — chưa kiểm trên điện thoại.

## 20. Nhân vật hệ thống trên màn hình

`GuideMascot.jsx` + `lib/mascotState.js` + `lib/mascotSprite.js`. Nhân vật sống suốt lượt chat,
di chuyển tới thứ trợ lý đang nói tới, và diễn trạng thái. **Khung chat vẫn giữ nguyên** — nhân
vật diễn ở ngoài, không thay thế nó.

### Sáu trạng thái

| Trạng thái | Khi nào | Bong bóng |
|---|---|---|
| `chi_tro` | có vòng sáng đang trỏ vào một nút | “Ở đây!” |
| `lam_viec` | vừa gọi tool, chưa có kết quả | câu riêng theo từng tool |
| `suy_nghi` | đang sinh khối suy luận, hoặc kết quả tool vừa về | “Để ta nghĩ đã…” |
| `answer` | đang phát câu trả lời bằng chữ | (không) |
| `xong` | lượt vừa kết thúc, trong 2,2 giây | "Xong rồi!" |
| `nghi` | không chạy gì | (không) |

`chi_tro` ưu tiên **tuyệt đối**: đang trỏ thì đứng yên mà trỏ, kể cả khi model đã chạy tiếp việc
khác — nếu không, nhân vật rời khỏi nút đúng lúc người dùng vừa ngước lên nhìn.

Trạng thái suy ra từ **chính luồng message của agent**, cùng nguồn với bảng "Hành động của trợ
lý". Dựng nguồn thứ hai là hai chỗ sẽ lệch, và người dùng thấy nhân vật nói một đằng bảng ghi
một nẻo.

### Gộp về một nhân vật duy nhất

`uiSpotlight.js` trước đây **tự dựng lấy** một con bot mỗi lần trỏ nút. Để nguyên thì màn hình có
hai nhân vật khác hình, và đổi ảnh phải đổi hai chỗ. Nay chia việc: `uiSpotlight` lo vòng sáng +
tìm phần tử theo nhãn rồi báo “đang trỏ vào cái này” qua `theoDoiMucTieu(cb)`; việc đi tới đó là
của nhân vật.

### Ba điều về hiệu năng, đều là bug đã sửa chứ không phải phòng xa

- **Di chuyển bằng `transform`, không bằng `top/left`.** Animate `top/left` bắt trình duyệt tính
  lại layout mỗi khung hình; trang kanban vài nghìn phần tử là thấy giật.
- **Chỉ nghe `scroll` khi đang bám mục tiêu.** Góc đậu không phụ thuộc vị trí cuộn. Listener này
  bắt ở pha capture nên nhận MỌI sự kiện cuộn của mọi khung con.
- **So sánh toạ độ rồi mới `setState`.** Hàm tính vị trí luôn trả object mới, gán thẳng là
  re-render ở mỗi khung hình cuộn dù toạ độ y hệt.

`pointer-events: none` tuyệt đối: nhân vật đi khắp màn hình nên lúc nào cũng có thể nằm đè lên
nút người dùng định bấm.

### Nói trước rồi mới mở tour

Tour là một **lớp phủ trùm lên trang**. Bật ra không báo trước thì người dùng đang nhìn dở việc
của mình bỗng bị che, và không hiểu vì sao. Nên `openTour()` đặt một câu thoại nêu ĐÚNG TÊN
BƯỚC sắp mở, đợi `CHO_NOI_MS` = 1,1 giây, rồi mới phát `product-tour:start`.

Kênh **lời thoại tạm** (`datThoaiTam` / `theoDoiThoaiTam` trong `openGuide.js`) tách hẳn khỏi
`mascotState.js`: bên đó SUY RA trạng thái từ luồng message, còn đây là câu do chính đoạn mã
hành động CHỦ ĐỘNG đặt, kèm hạn dùng. Bong bóng ưu tiên: **thoại tạm → câu trả lời → câu trạng
thái**. Thoại tạm thắng tất cả vì nó chỉ sống hơn một giây, ngay trước lúc màn hình bị che.

Đo trên luồng thật (hỏi "Tab Tài liệu để làm gì?"):

| ms | Bong bóng | Tour |
|---:|---|---|
| 3.997 | "Để ta nghĩ đã…" | chưa |
| 7.992 | "Mở chỉ dẫn cho ngươi…" | chưa |
| **8.997** | **"Để ta mở chỉ dẫn “Tab Tài liệu” cho ngươi…"** | chưa |
| **11.001** | (vẫn câu đó) | **đã mở — bước 44/52** |

Kênh này dùng lại được cho mọi hành động che màn hình; điều hướng sang trang khác là ứng viên
tiếp theo.

### Dấu markdown lọt ra khi đang stream

Bộ dọn markdown ban đầu chỉ bóc được **cặp đã đóng** (`**đậm**`). Nhưng bong bóng hiện chữ ngay
lúc đang chảy về, nên có khoảnh khắc văn bản mới là `**Tab Ghi âm` chưa kịp có dấu đóng — và
bong bóng hiện đúng `…ở **`. Đã thấy thật ở mốc 13,4 giây.

Lỗi này **chỉ tồn tại trong lúc chữ đang chảy**: chụp một ảnh lúc xong thì không bao giờ thấy.
Nó lộ ra vì bài kiểm quay lại diễn biến theo từng 200 ms thay vì xem kết quả cuối. Nay bóc nốt
dấu lẻ, và có 6 ca thử chạy trên Node phủ cả cặp đóng lẫn cặp dang dở.

### Bộ ảnh đang dùng

Nguồn: `E:/CRMtb/xianxia_chatbot_widget` — nhân vật "Hệ Thống" phong cách tu tiên, chibi, 6 tư
thế, PNG RGBA nền trong suốt, gốc ~290×330. Đã chép 6 tệp vào `frontend/public/mascot/`
(**không** lấy `asset-sheet.png` 2,4 MB — nó chỉ là bảng tổng hợp, không dùng lúc chạy).

| Trạng thái | Ảnh | Tư thế |
|---|---|---|
| `nghi` | `greeting.png` | vẫy tay, lơ lửng trên vòng khí xanh |
| `suy_nghi` | `thinking.png` | ngồi trên mây, chống cằm, có dấu "?" |
| `lam_viec` | `analyzing.png` | đang xem xét |
| `chi_tro` | `pointing.png` | vươn tay chỉ **sang phải** |
| `answer` | `answering.png` | đang nói |
| `xong` | `success.png` | ăn mừng |

Khung hiển thị **116×132** — giữ đúng tỉ lệ ảnh gốc nhưng nhỏ hơn nhiều so với 275px của widget
mẫu: nhân vật là lớp phủ trên trang làm việc, để to bằng widget là nó át cả nội dung.

**Chỉ tư thế `chi_tro` mới được lật ngang.** Lật hết là hỏng: `thinking.png` có dấu "?" vẽ sẵn
trong ảnh, lật thì thành dấu hỏi ngược. Danh sách tư thế mang nghĩa hướng nằm ở `TU_THE_CO_HUONG`
trong `mascotSprite.js`.

Hào quang dùng `drop-shadow` chứ không `box-shadow`: `drop-shadow` bám theo viền alpha nên ôm
đúng dáng nhân vật, còn `box-shadow` đổ theo hình chữ nhật của thẻ. Ba màu phân biệt được bằng
đuôi mắt — xanh khi bình thường, xanh mạnh khi đang chỉ, vàng ấm khi `xong`.

### Cắm ảnh khác

Sửa **duy nhất** `lib/mascotSprite.js`:

1. Chép ảnh vào `frontend/public/mascot/`.
2. Điền đường dẫn `/mascot/….png` vào `SPRITE` theo từng trạng thái.
3. Trạng thái nào chưa có ảnh thì dùng lại ảnh của `nghi`; `nghi` trống thì rơi về hình vector
   dựng sẵn — nên thả **một** ảnh vào cũng chạy.

Yêu cầu ảnh: PNG/WebP **nền trong suốt**, nhân vật **quay mặt sang phải** (mã tự lật khi cần),
cỡ gợi ý ~150×220.

Không dùng `import` ảnh: `import` bắt Vite thấy file lúc build, thiếu file là **hỏng cả bản
build**. Trỏ đường dẫn tĩnh thì thiếu ảnh chỉ là không hiện ảnh đó.

---

## Đợt đổi tên sang tiếng Anh (2026-09-10)

Toàn bộ định danh trong phạm vi trợ lý — biến, hàm, tham số tool, khoá JSON, đường dẫn HTTP,
khoá cấu hình, cột Supabase, tên lớp CSS — đã đổi từ tiếng Việt không dấu sang tiếng Anh.
Văn xuôi (comment, mô tả tool, chỉ dẫn hệ thống, chữ hiện cho người dùng) GIỮ NGUYÊN tiếng Việt.

**MỘT tệp SQL duy nhất:** `database/602_guide_assistant_en.sql`. Nó gộp cả lược đồ lẫn phần
nâng cấp, tự nhận biết mình đang gặp CSDL trống hay CSDL bản cũ (khối 0). Hai tệp cũ
`593_guide_assistant_gop.sql` và `601_guide_assistant_rename_en.sql` đã bị **xoá**.

**Hai việc phải làm khi triển khai, theo đúng thứ tự:**

1. `database/602_guide_assistant_en.sql` — chạy trên Supabase (chạy được nhiều lần).
2. `node scripts/guide/migrate-store-en.js` — đổi khoá trong `uploads/guide-memory/`
   (`kinh-nghiem.json` → `experience.json`, `cai-dat.json` → `settings.json`).

Chạy mã mới TRƯỚC hai bước đó thì hạn mức/nhật ký im lặng tắt, cấu hình về mặc định và kho
kinh nghiệm đọc ra rỗng.

**Bảng đối chiếu ngắn** (đầy đủ nằm trong hai tệp di trú ở trên):

| Cũ | Mới |
|---|---|
| `cau_hoi` `tra_loi` `duong_dan` `cac_buoc` `ngo_cut` `bai_hoc` | `question` `answer` `path` `steps` `dead_ends` `lesson` |
| `nhan` `khu_vuc` `gia_tri` `tu_khoa` `kem_bang` `kem_muc` | `label` `region` `value` `keyword` `include_table` `include_items` |
| `the_mo_duoc` `nut_bam_duoc` `truong_va_bo_loc` `tab_dang_chon` | `openable_cards` `clickable_buttons` `fields_and_filters` `active_tab` |
| `/cai-dat` `/kien-thuc` `/kinh-nghiem` `/han-muc` `/nhat-ky` | `/settings` `/knowledge` `/experience` `/quota` `/chat-log` |
| `caiDat.lay()` `kinhNghiem.themKinhNghiem()` | `settings.get()` `experience.addExperience()` |
| `guide_quota_luot` `p_max_cau_hoi` `so_token` | `guide_quota_turn` `p_max_questions` `token_count` |
