# Kế hoạch thu thập & tổng hợp hành vi người dùng

> Viết ngày 16/10/2026. Khảo sát trực tiếp trên mã nguồn hiện tại, không phải đề xuất từ đầu —
> phần lớn hạ tầng cần thiết đã tồn tại, chỉ còn thiếu tầng nối và 2 khoảng trống nhỏ.

## Kiểm thử với dữ liệu THẬT (17/10/2026) — 3 lỗi tìm ra và đã sửa

Chạy `getUserBehaviorInsight()` thẳng trên Supabase thật (chỉ đọc), đối chiếu từng con số bằng
truy vấn độc lập. Thời gian chạy 2,8–3,2s cho kỳ 7 ngày.

**Khớp:** `activity_rows` 632 = DB 632 ✓ · phát sinh 0 = 0 ✓

**Lỗi 1 — kênh không lọc theo công ty (NGHIÊM TRỌNG).** Bảng tin nhắn không có `company_id` nên
`fetchChannelTouches` gom cả page công ty khác: mở báo cáo công ty **HCB** lại thấy page của
**Phúc Đạt** và **NextGo**. Đã lọc theo `facebook_pages/zalo_oa_accounts.default_company_id`
(page chưa gán công ty thì vẫn giữ, bỏ đi sẽ giấu mất dữ liệu).

**Lỗi 2 — việc quá hạn biến mất âm thầm (NGHIÊM TRỌNG).** Công ty HCB có **210** việc quá hạn
nhưng báo cáo hiện **0**; Phúc Đạt **268** thì báo cáo **14**. Nguyên nhân: việc thuộc công ty
nhưng người thực hiện có `company_id = NULL` (7/9 người) hoặc thuộc công ty khác, nên bị
`userSet.has()` loại. Cộng theo từng người → mất sạch. Đã thêm `sources.overdue_total` +
`overdue_unassigned` và cảnh báo trên giao diện. Kiểm lại: 14 + 254 = 268 = DB ✓.

**Lỗi 3 — cột "Người phụ trách" trống dù đã gán.** Toàn bộ page Phúc Đạt do một người có
`company_id = NULL` phụ trách, mà tên lại tra trong tập user của công ty → trống. Đã tra tên
riêng, không phụ thuộc tập user. Kiểm lại: 4/4 kênh hiện đúng "Sale Admin Nhã" ✓.

**Giới hạn đo được trên dữ liệu thật — chưa sửa, cần biết khi đọc báo cáo:**

| Quan sát thật | Hệ quả |
|---|---|
| `outbound_by_via` = 2.317 tin "(chưa ghi nguồn)", **0 tin** có `sent_by` | Thời gian phản hồi khách = 0 cho mọi người. Chỉ số này chỉ chạy khi nhân viên trả lời **trong phần mềm** |
| "Làm việc/ngày" chỉ 1–7 phút dù có 84–230 thao tác | `active_minutes` chỉ cộng khoảng cách ≤ 2 phút giữa 2 thao tác; log hiện quá thưa (chủ yếu `navigate`) nên gần như không cộng được gì. **Con số này chưa đáng tin** |
| `xong=37` nhưng `đúng hạn=0, trễ=0` | Việc hoàn thành phần lớn **không có deadline** → không tách được sớm/trễ |
| `xử lý TB = 2.383 giờ` (≈99 ngày) | Việc tạo từ rất lâu mới hoàn thành; đúng về mặt tính toán nhưng cần đọc là "tuổi việc", không phải "công sức" |
| `facebook_comments.replied_by does not exist` | Migration 725 **chưa chạy** trên DB này |

## Giai đoạn 10 — Chỉ số thời gian + phân loại tổ chức + giao diện chat (17/10/2026)

**Giao diện khách & tin nhắn theo mẫu CRM Facebook/Zalo.** Khảo sát trước: hai trang
`FacebookPage.jsx`/`ZaloPage.jsx` **không tách component dùng chung** (toàn bộ nằm trong hàm nội
bộ `InboxTab`, không export; Zalo vẽ lại riêng) nên không import lại được — phải dựng lại theo
mẫu. Đã bám đúng: dòng hội thoại có avatar + badge chưa đọc + chip SĐT/Lead; bong bóng chat tin
khách trái nền trắng viền xám, tin mình phải nền gradient xanh, có dải ngày, ảnh hiện trực tiếp.
(Nếu sau này muốn gọn hơn: tách `components/messenger/ConversationList + MessageBubble` rồi
refactor cả 3 trang — hiện Facebook/Zalo đang trùng lặp đáng kể.)

**Bốn nhóm chỉ số thời gian**, mỗi nhóm một nguồn khác nhau nên **không cộng dồn được**:

| Chỉ số | Nguồn | Cách tính |
|---|---|---|
| Phản hồi khách | `facebook_messages`/`zalo_messages` | Từ tin khách đầu chuỗi đến tin nhân viên trả lời kế tiếp; chỉ tính tin có `sent_by`. Cờ chậm: quá 1 giờ |
| Làm việc thực tế/ngày | `user_activity_log` | `active_minutes / days_active` (đã có sẵn từ `computeHabitByUser`) |
| Xử lý 1 việc | `unified_tasks_v` | `completed_at − created_at` (khác sớm/trễ hạn vốn so với `deadline`) |
| Xử lý 1 giai đoạn deal | `crm_lead_stage_history` | `duration_seconds`, quy cho `changed_by` (người bấm chuyển giai đoạn) |

Thời gian phản hồi tính **ngay trong `fetchChannelTouches`** để không phải đọc lại bảng tin nhắn
lần hai. Khách còn đang chờ chưa ai trả lời → `sources.pending_replies`.

**Phân loại theo công ty + module.** `fetchCompanyUsers` lấy thêm `position`, `department_id`,
join `departments`/`companies` (có fallback nếu DB thiếu cột). Module lấy từ bảng
`user_module_roles` (database/505) — truy vấn riêng vì bảng này không có FK cứng tới `users` nên
PostgREST không join được; user chưa có dòng nào thì suy từ `users.role`, không suy được thì xếp
"(chưa gán module)" chứ không đoán. Giao diện: dropdown lọc Công ty/Module (chỉ hiện khi có ≥2 giá
trị) + chia bảng thành nhóm có tiêu đề — nhóm theo **công ty** khi đang xem nhiều công ty, ngược
lại nhóm theo **module**.

## Giai đoạn 9 — Đọc nội dung bình luận + nhiệm vụ phát sinh (17/10/2026)

**Nội dung bình luận** — thêm nguồn drill `comments` (`module=internal` cho Dự án + Phân công,
`module=customer` cho Lead/Deal). Trả nguyên văn kèm tên dự án/lead đang nói tới (bù từ `projects`
/`crm_leads` vì bảng bình luận chỉ lưu id). Cả hai thẻ bình luận có nút "Đọc nội dung bình luận →".

**Nhiệm vụ phát sinh** — khảo sát trước khi code xác định: phát sinh nằm ở `crm_assignments` có
`phat_sinh_kind IS NOT NULL`, **không lấy được qua `unified_tasks_v`** (view gộp crm_assignments
nhưng bỏ cột `phat_sinh_kind` và gán cứng `task_kind='Giao việc'`). Vì vậy `fetchPhatSinhByAssignee`
truy vấn thẳng bảng gốc, song song với các truy vấn view hiện có. Trả: tổng / đang mở / quá hạn /
đã xong + phân loại theo loại phát sinh. `phat_sinh_kind` lưu UUID hoặc slug cũ
(`tempered_glass`…) nên tra `shared_workspace_phat_sinh_kinds` để đổi sang tên tiếng Việt, không
khớp thì giữ giá trị thô thay vì bỏ trống.

Lưu ý khi đọc báo cáo: số phát sinh **độc lập** với thẻ "Thời gian hoàn thành việc" (lấy từ
`unified_tasks_v`) — hai nguồn khác nhau, không cộng dồn được.

Cũng có 2 khái niệm "phát sinh" khác nhau trong hệ thống, báo cáo này chỉ tính loại thứ hai:
(a) "đơn phát sinh" = dự án con bên Sản xuất (`projects.source_project_id`), (b) "việc phát sinh"
= dòng `crm_assignments` có `phat_sinh_kind`.

## Giai đoạn 8 — Mở được khách và nội dung chat FB/Zalo (17/10/2026)

**"(không rõ)" giờ nói rõ là màn hình nào.** Trước đây chỉ hiện nhãn "(không rõ)" với con số, phải
bấm vào mới biết. Nay `packHabit` trả thêm `unknown_paths` (top màn hình của các dòng
`user_activity_log.module IS NULL`) và hiển thị thẳng dưới thẻ "Phân hệ và màn hình hay dùng", kèm
giải thích đây là log ghi trước khi `ROUTE_LABELS` được mở rộng.

**Danh sách khách + nội dung chat.** `getUserBehaviorEvents` thêm 2 nguồn:
- `channel_customers` — khách của một page/OA (tên, SĐT, số tin đến/đi, lần cuối nhắn), đọc
  `facebook_contacts`/`zalo_contacts`
- `chat` — nội dung hội thoại với một khách, đọc `facebook_messages`/`zalo_messages`, hiển thị
  dạng bong bóng chat hai chiều, tin gửi đi có tên nhân viên (hoặc "không rõ người gửi" nếu trả
  lời bằng app gốc)

Bấm vào tên kênh (ở bảng mức công ty hoặc ở thẻ "Kênh được giao phụ trách" của từng người) → danh
sách khách → bấm một khách → nội dung trao đổi, có nút quay lại.

**Phạm vi dữ liệu phải chặn riêng cho 2 nguồn này**: chúng không gắn với `user_id` (khách thuộc về
KÊNH, không thuộc nhân viên) nên không dùng được phép kiểm tra "user có thuộc công ty không" như
các nguồn khác. Thay vào đó kiểm theo `facebook_pages/zalo_oa_accounts.default_company_id` — chặn
người công ty A đoán tên page hoặc `contact_id` của công ty B.

Lưu ý: đây là đảo ngược có chủ ý của ghi chú cũ trong `getUserBehaviorEvents` ("không trả nội dung
bình luận"). Nội dung chat với khách là dữ liệu hội thoại của chính công ty, cùng loại với trang
Facebook/Zalo inbox sẵn có; route vẫn chặn bằng `isManagerLike` nên chỉ cấp quản lý mở được.

## Giai đoạn 7 — Quy kênh theo người phụ trách đã cấu hình (17/10/2026)

Báo cáo trước đây chỉ quy tin nhắn cho nhân viên qua `sent_by` (ai bấm gửi trong phần mềm) nên
phần lớn hiện "Chưa quy được tin nhắn Facebook/Zalo nào cho người này". Tìm thấy cấu hình đã có
sẵn: `facebook_pages.default_lead_owner_id` và `zalo_oa_accounts.default_lead_owner_id`
(`database/290_zalo_oa_inbox.sql:21`) — nhân viên được chỉ định phụ trách từng page/OA trong trang
thiết lập, hiện đang dùng để gán chủ lead mới (`routes/facebook.js:3286-3287`).

Đã đưa vào báo cáo nhưng **để riêng, không trộn với `sent_by`** — vì hai thứ khác nhau về bản chất:
- `channels` (cũ) = kênh người đó **tự tay gửi tin**, bằng chứng là `sent_by`
- `owned_channels` (mới) = kênh người đó **được giao phụ trách** theo cấu hình

Trộn hai thứ sẽ biến "được giao phụ trách" thành "đã làm" — một người phụ trách page 1.200 khách
nhưng chưa trả lời tin nào sẽ trông như đã làm việc rất nhiều. Giữ riêng thì chênh lệch giữa hai
con số chính là tín hiệu quản lý đáng giá nhất (kênh có khách, người phụ trách không trả lời).
Bảng "Khách đổ về theo kênh" mức công ty thêm cột **Người phụ trách**, kênh chưa gán hiện cảnh báo.

**Sửa lỗi sót từ Giai đoạn 4**: sau khi tách `comments` thành `internal`/`customer`, ba chỗ ở
frontend vẫn đọc `r.comments.total` (không còn tồn tại) → cột "Bình luận" trong bảng và sắp xếp
"Bình luận nhiều nhất" luôn bằng 0. Đã thêm helper `commentTotal(r)` cộng lại hai nhóm.

## Giai đoạn 6 — Bỏ mật khẩu, sửa "(không rõ)", thêm thời gian hoàn thành (17/10/2026)

**Bỏ kiểm tra mật khẩu giám sát Supabase** khỏi trang báo cáo (theo yêu cầu) — vẫn giữ nguyên lớp
chắn JWT đăng nhập + `isManagerLike` ở backend, chỉ bỏ lớp mật khẩu thứ 2. Đã gỡ ở cả 3 chỗ:
`BehaviorInsightPage.jsx` (bỏ `SupabaseMonitorGate`), `userBehaviorInsight.js` route (bỏ
`monitorGate` middleware), `lib/api.js` (bỏ gắn header token cho route này).

**"(không rõ)" chiếm số lượng lớn nhất trong "Phân hệ hay dùng"** — tìm ra nguyên nhân:
`useActivityRouteTracker.js` (`ROUTE_LABELS`) trước đây chỉ phủ 9 tiền tố route
(`/crm,/tasks,/projects,/messenger,/dashboard,/kpi,/reports,/admin,/settings`) trong khi app thật
có hơn 30, bao gồm chính module Dự án (`/management/work-unified`) và Sản xuất (`/sx`) — mọi lần
vào các trang đó bị ghi `module: null` → "(không rõ)". Đã mở rộng danh sách phủ gần hết route thật
(xem file). **Lưu ý: chỉ áp dụng cho dữ liệu MỚI từ nay** — các dòng `user_activity_log` cũ đã ghi
`module=null` không tự sửa lại được, không có cách suy đoán ngược an toàn.

**Thêm "thời gian hoàn thành nhiệm vụ"** — trước đây chỉ đếm số việc xong/quá hạn, giờ thêm:
đúng/sớm hạn bao nhiêu (kèm số ngày sớm trung bình), trễ hạn bao nhiêu (kèm số ngày trễ trung
bình), và việc đang quá hạn thì trễ trung bình bao nhiêu ngày tính đến hôm nay. Tính thẳng từ
`unified_tasks_v.deadline` so với `completed_at`/thời điểm hiện tại, không cần bảng mới
(`fetchDoneByAssignee`/`fetchOverdueByAssignee` trong `userBehaviorInsight.js`).

## Giai đoạn 5 — Bình luận & trả lời khách hàng qua Facebook (17/10/2026)

Khảo sát trước khi code: `facebook_comments` (bình luận công khai trên post/quảng cáo, KHÁC tin
nhắn Messenger riêng đã đọc ở `fetchChannelTouches`) đã tồn tại từ `database/42_facebook_integration.sql`
và đang được ghi nhận qua webhook `feed` — tài liệu cũ (`ke-hoach-hoan-thien-facebook.md`) nói
"feed chưa subscribe" đã LỖI THỜI. Zalo OA xác nhận **không có** khái niệm bình luận công khai,
chỉ có chat riêng — không có gì để bổ sung ở phía Zalo.

**Khoảng trống thật tìm thấy**: `facebook_comments` có `replied`/`reply_text` nhưng KHÔNG có cột
nào gán nhân viên nào đã bấm trả lời. Route `POST /comments/:id/reply` trong `routes/facebook.js`
chỉ cập nhật `replied`/`reply_text`, không ghi `req.user.id`.

**Đã bổ sung**:
- Migration [725_facebook_comments_replied_by.sql](../../database/725_facebook_comments_replied_by.sql) — thêm cột `replied_by UUID REFERENCES users(id)`
- `routes/facebook.js` — route reply giờ ghi `replied_by: req.user?.id`, có fallback nếu migration chưa chạy (không làm hỏng việc ghi `replied`/`reply_text` vốn đã chạy ổn)
- `userBehaviorInsight.js` — hàm `fetchFacebookCommentStats` mới: mức công ty (tổng/đã trả lời/chưa trả lời/theo trang), mức nhân viên (`fb_comments_replied`, chỉ tính được từ sau migration 725)
- Frontend: thẻ "Bình luận Facebook" (mức công ty, cạnh "Khách đổ về theo kênh") + cột "Bình luận FB đã trả lời" trong thẻ "Khách đã trao đổi" (mức từng người)

**Giới hạn phải nói rõ cho người xem**: bình luận đã trả lời TRƯỚC khi chạy migration 725 không
biết nhân viên nào — không suy đoán ngược, hiển thị cảnh báo thay vì số 0 giả. Số liệu theo nhân
viên sẽ tăng dần theo thời gian khi nhân viên trả lời bình luận mới qua phần mềm này.

## Giai đoạn 4 — Tách "giao tiếp nội bộ" khỏi "giao tiếp khách hàng" (17/10/2026)

Trang chi tiết 1 người từng gộp chung bình luận Dự án + Phân công + Lead/Deal vào 1 thẻ "Trao đổi /
bình luận" — nhìn vào dễ tưởng bình luận Dự án (nội bộ, giữa nhân viên) là cùng loại với giao tiếp
khách hàng qua FB/Zalo. Đã kiểm tra: dữ liệu CHƯA BAO GIỜ bị lẫn (chỉ `crm_lead_comments` có cờ
`isCustomer`), vấn đề thuần là cách trình bày gộp chung.

Đã tách theo Ý NGHĨA (`computeCommentByUser` trong [userBehaviorInsight.js](../../backend/src/helpers/userBehaviorInsight.js)
gắn `group: 'internal' | 'customer'` cho từng nguồn bình luận), trả về `comments.internal` và
`comments.customer` riêng biệt thay vì 1 tổng gộp. Frontend thêm `SectionHeading` chia trang chi
tiết người dùng thành 2 khu: **"Giao tiếp nội bộ"** (Sửa dữ liệu thật + Bình luận Dự án/Phân công)
và **"Giao tiếp khách hàng"** (Khách đã trao đổi + Bình luận Lead/Deal).

## Giai đoạn 3 — Trang xem báo cáo + gửi PDF tự động hằng ngày (16/10/2026)

**Trang xem (module Dự án/Work Unified)**: [BehaviorInsightPage.jsx](../../frontend/src/pages/BehaviorInsightPage.jsx)
tại route `/management/behavior-insight`, khoá bằng **đúng mật khẩu trang giám sát Supabase**
(`SUPABASE_MONITOR_PASSWORD`) — tái dùng nguyên component `SupabaseMonitorGate` và endpoint
`/api/production/backup-sync/unlock` đã có sẵn, không tạo mật khẩu/token riêng. Backend gắn thêm
`monitorGate` (đọc header `x-supabase-monitor-token`, xem `supabaseMonitorAuth.js`) vào
`GET /api/analytics/behavior-insight`.

**Gửi PDF tự động hằng ngày qua 🤖 AI Assistant**: hệ thống lịch chat bot sẵn có
(`ai_chat_bot_schedules`) đã hỗ trợ gửi riêng 1 người (toggle `channel_type='user'` trong
`AiChatBotSettingsPage.jsx`, fan-out qua DM trong `aiBotSender.js`) — chỉ thiếu khả năng đính kèm
file. Đã bổ sung:
- `attachments` param cho `insertDepartmentBotMessage`/`insertGroupBotMessage` ([aiBotSender.js](../../backend/src/helpers/aiBotSender.js))
- PDF sinh từ [userBehaviorInsightPdf.js](../../backend/src/helpers/userBehaviorInsightPdf.js) (Buffer, không qua LLM — tái dùng pattern `staffLeadDealReportPdf.js`), upload qua `uploadBufferToStorage` (bucket `attachments`, cùng cơ chế Messenger group đang dùng)
- `data_source` mới `'user_behavior_insight'` — nhánh xử lý trong `runScheduleSend()`, migration [723_ai_chat_bot_user_behavior_insight.sql](../../database/723_ai_chat_bot_user_behavior_insight.sql) (mở rộng CHECK constraint + seed playbook), đồng bộ `VALID_DATA_SOURCES` ở `backend/src/routes/aiChatBot.js:310`

**Còn lại, admin tự làm qua UI** (không tự động tạo lịch gửi thật cho 1 người cụ thể — việc này
cấu hình đích danh người nhận, phải do người có thẩm quyền chọn): chạy migration 723, vào
`AiChatBotSettingsPage.jsx` tạo lịch mới → kênh "1 người cụ thể" chọn người nhận → playbook
"Báo cáo hành vi & khó khăn người dùng (PDF)" → giờ chạy 16:00 → lưu.

## 0. Sự thật đã có — không xây lại

Bốn nguồn dữ liệu sau đã ghi đúng những gì cần, chỉ là chưa ai đọc chúng cùng nhau:

| Nguồn | Bảng | Ghi gì | Nơi ghi |
|---|---|---|---|
| Hành vi màn hình | `user_activity_log` | view/filter/search/sort/navigate/click/create/update/delete/export/open_modal/submit_form/chat_open/chat_send, theo `user_id`, `path`, `module`, `created_at` | [userActivityLog.js](../../backend/src/routes/userActivityLog.js), `POST /api/user-activity` |
| Hỏi đáp trợ lý | `guide_chat_log` | câu hỏi, câu trả lời, các bước thực hiện, **`has_failed_step`** (bước nào hỏng), `turn_no` trong cùng `thread_id` | [guideChatLog.js](../../backend/src/helpers/guideChatLog.js) |
| Việc quá hạn | `unified_tasks_v` (view gộp `tasks` + `crm_tasks`) | `deadline`, `status`, `assignee_id`, `task_kind`, `company_id` | [unifiedTasksQuery.js](../../backend/src/helpers/unifiedTasksQuery.js) |
| Trao đổi dự án | `project_comments` (+ reaction, read receipt) | nội dung bình luận theo dự án/task | [projects.js](../../backend/src/routes/projects.js) |

Không có cột `company_id` trực tiếp trên `user_activity_log` — phải lọc theo công ty qua bảng
`users` (join user_id → company_id) chứ không query thẳng.

## 1. Hai khoảng trống thật sự

**a) Thời gian chờ màn hình (idle)** — không có event riêng, nhưng **không cần thêm**: suy ra được
từ khoảng cách giữa 2 bản ghi `user_activity_log` liên tiếp của cùng 1 user. Ngưỡng đề xuất:
- > 2 phút không có event mới = đang "chờ" (đọc, suy nghĩ, bị kẹt)
- Giới hạn trần mỗi khoảng chờ ở 15 phút — gap dài hơn (qua đêm, nghỉ trưa) không phải "chờ màn
  hình", là kết thúc phiên, không tính vào tổng.

**b) "Khó khăn / chưa biết thao tác"** — không phải field có sẵn, là **tín hiệu suy ra** từ 2 cột
đã có sẵn trong `guide_chat_log` mà chưa ai tổng hợp:
- `has_failed_step = true` — trợ lý tự ghi nhận bước thực hiện bị hỏng (failed/empty/cancelled)
- `turn_no >= 3` trong cùng `thread_id` — người dùng hỏi lại nhiều lần về cùng một việc, dấu hiệu
  trợ lý trả lời chưa đủ hoặc thao tác chưa rõ

Không cần bảng mới, không cần đổi schema, không cần cron — v1 tính on-the-fly khi có người mở báo
cáo (đồng dạng với `GET /summary` đã có trong `userActivityLog.js`).

## Kiểm chứng liên kết dữ liệu (16/10/2026)

Sau khi code xong Giai đoạn 1, rà lại khoá nối giữa 4 bảng (kiểu dữ liệu, tên cột, ý nghĩa) để chắc
báo cáo không join lệch âm thầm. Đọc trực tiếp các file SQL migration, không đoán:

| Khoá nối | Kết quả |
|---|---|
| `unified_tasks_v.assignee_id` ↔ `users.id` | Khớp — cả 3 nhánh (task/crm_task/crm_assignment) đều `UUID REFERENCES users(id)` |
| `unified_tasks_v.company_id` ↔ `users.company_id` | Khớp — cùng UUID tham chiếu `companies(id)` |
| `project_comments.id/user_id/project_id` ↔ code `projects.js:3690-3751` | Khớp tên cột, không lệch field |
| `user_activity_log` thiếu cột `company_id` | Đúng như ghi nhận ban đầu — `userBehaviorInsight.js` né bằng cách lọc `users.company_id` trước rồi `.in('user_id', ...)`, không lệch logic |
| **`path` giữa `guide_chat_log` và `user_activity_log`** | **LỆCH** — `guide_chat_log.path` chỉ lưu pathname (client gửi từ `useLocation().pathname`), còn `user_activity_log.path` lưu kèm `?query` (`window.location.pathname + search`, xem `activityLogger.js:78`). Cùng 1 màn hình Lead nhưng đổi filter/trang sẽ bị tính thành nhiều path khác nhau. |

**Đã sửa**: thêm `normalizePath()` trong `userBehaviorInsight.js` — cắt bỏ phần `?query` trước khi
gộp nhóm theo path ở cả `computeIdleByUser` và `computeDifficultySignals`. Hai hàm này hiện mỗi
hàm chỉ gộp trong nội bộ 1 bảng (chưa cross-join path giữa activity log và guide log), nên lệch
format chưa gây sai số ở Giai đoạn 1 — nhưng nếu sau này muốn tương quan "idle lâu trên path X rồi
mới hỏi trợ lý về path X", bắt buộc phải dùng path đã chuẩn hoá, không dùng path thô.

**Ghi chú thêm cho Giai đoạn 2**: `project_comments` không có cột `company_id` riêng — khi cần lọc
bình luận theo công ty phải join gián tiếp qua `project_id → projects.company_id`, không lọc thẳng
trên `project_comments`.

## Giai đoạn 1 — API tổng hợp read-only (đã code, xem mục Triển khai)

Một helper (`userBehaviorInsight.js`) + một route (`GET /api/analytics/behavior-insight`), gộp 3
nguồn — **activity, trợ lý, quá hạn** — thành báo cáo theo từng user trong 1 công ty, khoảng thời
gian tuỳ chọn:

```
{
  user_id, name,
  active_events, idle_minutes, top_idle_paths: [{path, minutes}],
  difficulty_signals: [{path, kind: 'failed_step'|'repeated_question', count, sample_question}],
  overdue_tasks
}
```

Quyền xem: `isManagerLike` (đã dùng thống nhất trong `unifiedTasksQuery.js`) — admin, manager, và
các role quản lý sản xuất/CRM. Không mở cho nhân viên thường xem dữ liệu người khác.

Không tạo migration, không chạy SQL mới — chỉ đọc 3 bảng/view đã tồn tại.

## Giai đoạn 2 — chưa code, cần làm rõ thêm trước khi động vào

1. **"Công việc phát sinh"** — khi đọc `sharedWorkspacePhatSinhKinds.js` / `phatSinhKinds.js` thì
   đây là một hệ danh mục + SLA riêng (không phải một cờ đơn giản trên `tasks`/`crm_tasks`). Trước
   khi đưa vào báo cáo tổng hợp cần xác nhận lại: phát sinh gắn trực tiếp cột nào trên
   `unified_tasks_v`, và mỗi công ty có thể có danh mục phát sinh khác nhau (bảng cấu hình riêng).
   Ghép sai sẽ ra số liệu sai cho cả báo cáo, nên để riêng giai đoạn này.
2. **Trao đổi dự án (`project_comments`)** — tương quan với dự án trễ hạn (vd. dự án quá hạn
   nhưng không ai bình luận gì = đang bị bỏ quên). Cần quyết định đơn vị tổng hợp là theo dự án
   hay theo user trước khi code.
3. **Trang dashboard phía frontend** — hiện Giai đoạn 1 chỉ có API JSON. Khi đã có người dùng
   thật kiểm tra số liệu đúng, mới làm trang hiển thị (tái dùng pattern export Excel đã có trong
   `crmOrgEmployeeExcelExport.js` nếu cần xuất báo cáo).
4. **Lưu lịch sử theo thời gian** — Giai đoạn 1 tính on-the-fly, không lưu quá khứ. Nếu sau này
   cần biểu đồ xu hướng (vd. "độ khó giảm dần qua từng tuần"), mới cần bảng
   `user_behavior_daily_summary` + 1 cron ghi mỗi đêm (giống `logRetentionCron.js`). Chưa cần ở
   bước này — thêm bảng khi đã biết chắc số liệu Giai đoạn 1 đúng và có người thật sự dùng.

## Vì sao không làm cron/bảng tổng hợp ngay từ đầu

`CLAUDE.md` của dự án yêu cầu không chạy SQL sống hay đổi schema ngoài phạm vi được giao mà
chưa xác nhận. Một API read-only trên dữ liệu đã có là cách thấp rủi ro nhất để kiểm chứng toàn bộ
giả thuyết (ngưỡng idle 2 phút có hợp lý không, `has_failed_step` có đủ để bắt "khó khăn" không)
trước khi cam kết vào một bảng + cron chạy lâu dài.

## Sửa statement timeout (16/10/2026)

Mở trang lần đầu trả `canceling statement due to statement timeout`. Nguyên nhân và cách sửa trong
`userBehaviorInsight.js` (không đổi schema, không thêm index):

| Nguyên nhân | Sửa |
|---|---|
| Frontend không gửi `date_from` → quét toàn bộ lịch sử `user_activity_log` | `resolveWindow()` mặc định **7 ngày gần nhất** khi thiếu `date_from` (`DEFAULT_WINDOW_DAYS`) |
| `ORDER BY user_id, created_at` buộc sort toàn bộ kết quả trước `LIMIT`, ngược chiều index `idx_user_activity_user_time (user_id, created_at DESC)` | Chỉ `ORDER BY created_at DESC` ở DB, sắp lại theo `(user_id, created_at ASC)` ở Node cho `computeIdleByUser` |
| `IN (hàng trăm uuid)` trên `guide_chat_log` và view `unified_tasks_v` làm planner bỏ index | Khi có `companyId`: lọc bằng `company_id` (cả 2 nguồn đều có cột này) rồi lọc tập user ở Node. Không có `companyId` mới giữ `IN` |

Vẫn giữ `ROW_LIMIT = 20000`. Muốn xem kỳ khác thì gọi API kèm `?date_from=&date_to=` — trang hiện
chưa có bộ chọn ngày.

## Trang lưới số liệu chi tiết (16/10/2026)

`BehaviorInsightPage.jsx` dựng lại thành lưới: mỗi dòng 1 người, bấm vào mở chi tiết thói quen.
Backend `userBehaviorInsight.js` lấy thêm `action_type, module, feature, session_id, importance`
trong **cùng một lần quét** `user_activity_log` (không query thêm), `computeHabitByUser()` dựng
khối `habit` cho mỗi user:

| Trường | Ý nghĩa |
|---|---|
| `days_active`, `sessions` | số ngày có mặt, số phiên (`session_id`, thiếu thì tách theo 30 phút im lặng) |
| `active_minutes` | tổng khoảng cách giữa 2 thao tác **≤ 2 phút** = thời gian làm thật (bù cho `idle_minutes`) |
| `write_events`, `important_events` | create/update/delete/submit_form/export; và `importance >= 2` |
| `actions`, `modules`, `features`, `top_screens` | xếp hạng theo số lần |
| `hours[24]`, `by_day[]`, `peak_hour` | nhịp theo giờ VN (UTC+7) và theo ngày |

API đổi shape: `getUserBehaviorInsight()` trả `{ range, items }` thay vì mảng — đã sửa 2 caller
(`routes/userBehaviorInsight.js`, nhánh PDF trong `aiBotSender.js`).

**Quy ước màu** (theo skill dataviz): độ lớn chỉ dùng 1 hue teal đậm nhạt theo giá trị — không
dùng bảng màu phân loại vì mọi thanh đều cùng một đại lượng; hổ phách = chờ lâu, đỏ = khó khăn /
quá hạn, luôn kèm nhãn chữ nên không bao giờ phân biệt bằng màu đơn thuần.

## Giai đoạn 2 — thêm CRUD thật + bình luận, giao diện console (16/10/2026)

**Nguồn mới nối vào `userBehaviorInsight.js`:**

| Nguồn | Bảng | Trả về |
|---|---|---|
| CRUD thật phía server | `activity_logs` (user_id, action, entity_type, description) | `crud.total`, `by_action`, `by_entity`, `matrix` (action × entity), `recent` 12 bản ghi |
| Trao đổi | `crm_lead_comments` + `project_comments` + `crm_assignment_comments` | `comments.total/replies/avg_chars/by_source/hours` |
| Việc hoàn thành | `unified_tasks_v.completed_at` | `done_tasks` — đối trọng với `overdue_tasks` |
| Entity chạm tới (ý định UI) | `user_activity_log.entity_type` | `habit.entities` |
| Event tail | `user_activity_log.label/path/action_type` | `habit.recent` 15 bản ghi mới nhất |

`action` của `activity_logs` dùng **thì quá khứ** (`updated`, `deleted`, `created`, `status_changed`,
`stage_changed`, `approval_requested`) — khác taxonomy hiện tại của `user_activity_log`
(`update`, `delete`, …). Trang map cả hai bộ trong `ACTION_LABEL`, không gộp nhầm.

**Giới hạn 1000 dòng của PostgREST** — đo thật: xin `.range(0, 4999)` vẫn chỉ trả 1000 dòng, nên
bản phân trang đầu tiên dừng sớm và chỉ đọc được 1000/3263 event mà không báo gì. `fetchAllPaged()`
nay lấy page size thật từ trang đầu rồi lặp cho tới khi hết; chạm trần `ROW_LIMIT = 60000` thì bật
cờ `sources.truncated` và trang hiện cảnh báo vàng, **không im lặng cắt số liệu**.

Đối chiếu với SQL trực tiếp (công ty 991dc79d…, 7 ngày): helper đọc 3.263 activity + 2.218 bình
luận, khớp đúng số đếm bằng SQL. Thời gian chạy ~1,6 giây.

**Giao diện**: console tối (`bg-slate-950`, `font-mono`), gồm thanh trạng thái nguồn (số dòng đã
đọc từng bảng), 9 ô tổng, lưới 13 cột (events/crud/bình luận/làm/chờ/khó/trễ/xong + dải 24h),
ma trận nhiệt người × giờ, và khi bung 1 dòng thì có 10 khung chi tiết gồm ma trận CRUD, thống kê
bình luận, màn hình chờ, khó khăn kèm câu hỏi mẫu, nhịp giờ/ngày, event tail và crud tail.

## Giai đoạn 4 — mở rộng nguồn: CRUD server + bình luận (16/10/2026)

Thêm 3 nguồn vào cùng 1 báo cáo, vẫn không bảng mới / không cron:

| Nguồn | Bảng | Dùng cho |
|---|---|---|
| CRUD thật phía server | `activity_logs` (`action`, `entity_type`, `description`) | ma trận entity × action, tail 12 bản ghi mới nhất |
| Trao đổi | `crm_lead_comments` (`body`), `project_comments` (`content`), `crm_assignment_comments` (`content`) | tổng, số trả lời, độ dài TB, phân bố theo giờ |
| Việc hoàn thành | `unified_tasks_v.completed_at` | đối trọng với `overdue_tasks` |

**Ba cạm bẫy đã xử lý — đo thật, không đoán:**

1. **PostgREST chặn 1000 dòng/request.** `.limit(60000)` là vô nghĩa: xin 5000 vẫn trả 1000.
   Mọi nguồn nay đọc qua `fetchAllPaged()` (tiến con trỏ theo số dòng thực nhận). Kiểm chứng:
   `crm_lead_comments` 7 ngày có 4.283 dòng trong DB — báo cáo đọc đúng 4.283, không dừng ở 1.000.
2. **`parent_id` / `deleted_at` chỉ có sau migration 172 / 195 / 248.** Bản cũ `catch { return [] }`
   biến "thiếu cột" thành "0 bình luận" — số 0 giả nguy hiểm hơn lỗi. Nay thử select đầy đủ, hỏng
   thì hạ xuống bộ cột chắc chắn có và đẩy cảnh báo lên `sources.comment_issues` cho UI hiện.
3. **`users.name` không tồn tại** — cột đúng là `full_name`.

**Giới hạn đã biết của ma trận CRUD**: chỉ 4 nơi trong backend ghi `activity_logs`
(`routes/projects.js`, `routes/tasks.js`, `routes/approvals.js`, `helpers/projectTaskMutations.js`)
→ thực đo 100 dòng / 7 ngày toàn hệ thống. CRUD của CRM (lead, deal, báo giá, hoá đơn) **chưa được
ghi audit**, nên ma trận hiện chỉ phản ánh dự án/công việc/phê duyệt. Muốn phủ CRM phải gắn thêm
lệnh ghi `activity_logs` ở các route CRM — việc đó đổi hành vi ghi dữ liệu, cần quyết định riêng.

**Đo hiệu năng thật (7 ngày)**: lọc theo 1 công ty 0,7s / 210 dòng; không lọc công ty (admin hệ
thống, 51 người, 16.503 dòng activity + 4.283 bình luận) 5,3s.

## Nâng đồ hoạ trang thiên hà (16/10/2026)

**Chọn thư viện — không thêm dependency**: `@react-three/postprocessing@3.2.0` đòi
`@react-three/fiber >= 9.7.0`, dự án đang `9.6.1` và có 3 trang 3D khác (`BoxStudioViewport`,
`Family3dThumb`, `RigidBoxFoldPreview`) đang chạy trên bản này — nâng lên là rủi ro ngoài phạm vi.
Dùng thẳng pass gốc trong `three@0.172`: `EffectComposer` + `RenderPass` + `UnrealBloomPass` +
`OutputPass`, cho hiệu ứng toả sáng tương đương.

| Thành phần | Cách làm |
|---|---|
| Toả sáng (bloom) | `UnrealBloomPass(strength 0.85, radius 0.55, threshold 0.18)`; `useFrame` ưu tiên 1 nên R3F nhường quyền vẽ — **tắt bloom phải tự gọi `gl.render`**, nếu không màn hình đen |
| Đĩa bụi thiên hà | `Points` ~9.000 hạt theo 3 nhánh xoắn log, màu chuyển teal (lõi) → tím (rìa), blending additive, xoay rất chậm |
| Quầng sáng | 1 texture radial-gradient vẽ bằng canvas, dùng chung cho mọi mặt trời/hành tinh qua `sprite` additive |
| Bay tới một hệ | `CameraRig` nội suy `controls.target` + vị trí camera theo hệ số phụ thuộc delta (không lệ thuộc FPS) |
| Hành tinh đang chọn | vành trắng `Billboard` + emissive tăng |

**Hai nút hiệu năng** (ảnh người dùng gửi có FPS 23 nên để sẵn): **Dừng** chuyển `frameloop` sang
`'demand'` (GPU nghỉ hẳn, kéo/zoom vẫn chạy); **Đồ hoạ nhẹ** tắt bloom, giảm bụi còn 3.000 hạt và
**bỏ toàn bộ 8 đèn điểm động** — thứ tốn khung hình nhất — bù lại bằng `emissiveIntensity` cao hơn.

## Chuyển động: khảo sát thư viện (16/10/2026)

Đã tra registry và đối chiếu peer deps với `three@0.172` + `@react-three/fiber@9.6.1` + React 19:

| Thư viện | Bản | Kết luận |
|---|---|---|
| `maath` 0.10.8 | **đã có sẵn** (drei kéo theo) | **Đang dùng** — `damp3` hãm theo hằng số thời gian thật |
| `gsap` 3.15.0 + `@gsap/react` 2.1.2 | hợp, cần cài | Khuyến nghị nếu muốn kịch bản mở màn phức tạp hơn |
| `@react-spring/three` 10.1.2 | hợp, cần cài | Trùng công dụng với `damp3`, chưa cần |
| `r3f-perf` 7.2.3 / `leva` 0.10.1 | hợp, cần cài (dev) | Đo FPS / gạt thử tham số |
| `@theatre/r3f` 0.7.2 | **KHÔNG hợp** — peer `fiber ^8.13.6` | Bỏ |
| `three.quarks` 0.17.1 | **KHÔNG hợp** — peer `three >=0.182` | Bỏ |
| `motion` 14.3.0 | chỉ DOM, `framer-motion-3d` đã khai tử | Bỏ |

**Đã áp dụng (không cài thêm gói nào)**: `maath` được khai báo thành dependency trực tiếp trong
`frontend/package.json` (trước đó chỉ là dep bắc cầu của drei — import thẳng mà không khai báo là
mắc nợ ngầm). Dùng `damp3` cho: camera bay tới hệ, phóng to hành tinh khi rê chuột/chọn, và hiệu
ứng mở màn (mặt trời bung ra, hành tinh bay từ ngoài vào quỹ đạo, mỗi hệ trễ 0,14s theo thứ tự).

## Bấm vào số để xem dòng thô (17/10/2026)

Báo cáo trước chỉ có số đã gộp, không trả lời được "1.087 lần lọc đó là những lần nào". Thêm
`GET /api/analytics/behavior-insight/events` (cùng `monitorGate` + `isManagerLike`):

| Tham số | Ý nghĩa |
|---|---|
| `user_id` | bắt buộc; **kiểm tra người này có thuộc công ty của người gọi không** rồi mới đọc |
| `source` | `activity` (mặc định) · `audit` (activity_logs) · `guide` (guide_chat_log) |
| `action_type` / `module` / `path` | lọc đúng hạng mục vừa bấm |
| `limit` | mặc định 200, trần cứng 500 |

`path` của `user_activity_log` lưu kèm `?query` nên bộ lọc dùng `path.eq.X` **hoặc** `path.like.X?*`
— khớp đúng cách `computeHabitByUser` gộp nhóm, nếu chỉ `eq` sẽ mất hết dòng có filter.

Không trả nội dung bình luận: người quản lý cần biết ai trao đổi lúc nào, không cần đọc nội dung
khách hàng. Câu hỏi gửi trợ lý thì có trả vì bản thân nó là tín hiệu khó khăn cần đọc.

Trên giao diện: mọi dòng trong "thói quen thao tác / phân hệ / màn hình / màn hình chờ", từng ô
của ma trận CRUD, và từng thẻ khó khăn đều bấm được → mở hộp liệt kê tối đa 300 dòng gần nhất, mỗi
dòng có giờ, loại thao tác, nhãn và nút **Mở** để nhảy thẳng tới màn hình đó.

**Đo thật trên dữ liệu sống**: lọc theo action trả 36/50 dòng, theo path 50/50, theo module 36/50;
gọi với user của công ty khác bị chặn đúng ("Người dùng không thuộc công ty này").

## Tương tác khách qua Facebook / Zalo (17/10/2026)

Nguồn (tên cột lấy nguyên văn từ SQL, không đoán):

| Bảng | Cột dùng | File SQL |
|---|---|---|
| `facebook_messages` | `contact_id`, `lead_id`, `direction` ('inbound'/'outbound'), **`sent_by`** | `42_facebook_integration.sql:42-57` |
| `facebook_contacts` | `id`, `page_id`, `lead_id` | `42_facebook_integration.sql:24-39` |
| `facebook_pages` | `page_id`, `page_name` | `42_facebook_integration.sql:6-21` |
| `zalo_messages` / `zalo_contacts` / `zalo_oa_accounts` | tương ứng `contact_id`/`oa_id`/`oa_name` | `290_zalo_oa_inbox.sql` |

Cả 4 bảng tin nhắn/hội thoại **không có `company_id`** — phạm vi công ty suy ra từ `sent_by` thuộc
tập user công ty (mức cá nhân) hoặc chấp nhận mức toàn hệ (mức kênh).

### Sự thật phải nói thẳng: không quy được tin nhắn cho cá nhân

Đo trên dữ liệu sống (7 ngày gần nhất):

| | Tin gửi đi | Trong đó có `sent_by` |
|---|---|---|
| Facebook | 3.316 | **0** |
| Zalo | 33 | 1 |

Tin FB cuối cùng có `sent_by` là **28/07/2026**. Lý do nằm ở `routes/facebook.js`: chỉ nhánh gửi
chủ động qua phần mềm (dòng ~5714) mới set `sent_by`; các nhánh echo từ webhook (5518, 7495, 8175,
8210) chỉ set `direction`. Nhân viên đang trả lời khách bằng app Facebook/Zalo gốc.

**Hệ quả thiết kế**: cột "Khách" của từng người chỉ đếm được khách chạm qua **bình luận Lead/Deal**
(`crm_lead_comments.lead_id`). Báo cáo nói rõ điều này bằng một dòng cảnh báo kèm số tin không quy
được, thay vì hiện cột rỗng để người đọc tự hiểu nhầm là nhân viên không chăm khách.

### Thống kê theo kênh (mức công ty) — luôn đúng

Không phụ thuộc `sent_by` nên dùng được ngay: mỗi fanpage/OA có **số khách**, **số đã nối sang
`crm_leads`** (kèm tỉ lệ), **số tin khách nhắn đến**, **số tin trả lời**. Khách = `lead_id` nếu đã
nối, không thì chính cuộc hội thoại (1 contact = 1 khách).

Đo thật 7 ngày: Phúc Đạt Kitchen 283 khách (113 thành lead, 40%), Tủ bếp nhôm cao cấp Phúc Đạt 189
(31), Thi Công Tủ Bếp TP.HCM 131 (60), NextGo 128 (28), OA Phúc Đạt 14 (14). Tổng khách distinct
toàn hệ 1.535.

**Muốn quy tin nhắn cho từng nhân viên** thì phải sửa `routes/facebook.js` để gắn `sent_by` ở các
nhánh echo webhook — đổi hành vi ghi dữ liệu, cần quyết định riêng, không làm trong phạm vi báo cáo.

## Gắn người gửi cho tin Facebook (17/10/2026)

**Điều KHÔNG làm được**: Facebook không tiết lộ admin nào bấm gửi ở Page Inbox / Business Suite.
Sự kiện echo chỉ có `is_echo`, `app_id`, `mid`, `metadata` — không có id người. Vì vậy không thể
"gắn `sent_by` cho mọi nhánh webhook"; gán bừa (ví dụ gán cho chủ lead) là bịa số liệu.

**Điều đã làm** trong `routes/facebook.js`:

| Thay đổi | Vì sao |
|---|---|
| `sendMessengerReply` / `sendMessengerAttachment` nhận thêm `echoMeta`, đẩy vào `message.metadata` của Send API | Facebook trả chuỗi này **nguyên văn** trong echo (trần 1000 ký tự) — đường duy nhất để echo tự khai nguồn |
| Dấu dạng `vpt1:<via>:<uuid>` (45 ký tự), `via` ∈ app / auto_reply / tool | Ngắn, không chứa thông tin nhạy cảm vì chuỗi đi qua máy chủ Facebook |
| `resolveEchoOrigin(msg)` ở nhánh webhook | Có dấu hợp lệ → `sent_by` + `metadata.sent_via='app'`; có `app_id` lạ → `other_app`; không gì cả → `meta_inbox` |
| Nhánh gửi chủ động đổi `INSERT` → `UPSERT onConflict fb_message_id` | **Lỗ thật**: echo có thể về trước, tạo dòng không `sent_by`; INSERT sau đó đụng unique rồi im lặng, mất luôn người gửi |
| Auto-reply và công cụ gửi ảnh mang dấu `auto_reply` / `tool` | Phân biệt máy tự gửi với người trả lời ngoài phần mềm |
| Nhánh đồng bộ ngược từ Graph ghi `metadata.sent_via='sync_unknown'` | Không đoán, nói rõ là không xác định |

Kiểm thử bộ giải mã (chạy thật 7 ca): dấu hợp lệ → đúng uuid; dấu hệ thống → `sent_by` null + đúng
`via`; không dấu → `meta_inbox`; có `app_id` → `other_app` + ghi `app_id`; **metadata rác và uuid
giả mạo → từ chối**, rơi về `meta_inbox` (không cho chuỗi bịa gán người gửi).

Báo cáo nay có `sources.outbound_by_via` và trang hiện dãy nhãn "Tin trả lời đến từ đâu". Đo ngay
sau khi vá: `{"(chưa ghi nguồn)": 3345, "app": 1}` — nhóm "chưa ghi nguồn" là tin trước bản vá, sẽ
tự co lại; tin mới gửi qua phần mềm sẽ rơi vào `app`, tin trả lời bằng app Facebook gốc rơi vào
`meta_inbox` và **vẫn không quy được cho ai** — đó là giới hạn của Facebook, không phải của code.
