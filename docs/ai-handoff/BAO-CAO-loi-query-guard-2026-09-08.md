# Báo cáo lỗi query-guard + 42703 — 2026-09-08 15:31

- Viết bởi: Cursor, gửi Claude lên kế hoạch sửa.
- Nguồn: log backend local `npm run dev` (terminal 5), đoạn tổng hợp query-guard + `GET /api/management/deals`.
- DB đối chiếu: Supabase production `qlycv` (MCP `user-supabase-QLCV-system`) lúc viết báo cáo.
- **Chưa sửa code.** `routes/management.js` là vùng dùng chung — ghi `WORKLOG.md` trước khi đụng (AI-004).

Đọc kèm: [`CURRENT.md`](./CURRENT.md), [`DECISIONS.md`](./DECISIONS.md), [`HANDOFF-2026-09-08-phan-cong.md`](./HANDOFF-2026-09-08-phan-cong.md) mục 0, [`REVIEW-596-deadline.md`](./REVIEW-596-deadline.md) §7.3b (đã ghi `crm_leads.budget` trên prod).

---

## 0. Triệu chứng người dùng thấy

```
GET /api/management/deals?company_id=b78baba2-2486-434c-a72d-9c937fac2164
    &record_type=all&module_tab=overview&all=1500
191 ms — body 50 bytes
```

Log ngay trước đó:

```
[management/deals] {
  code: '42703',
  details: null,
  hint: null,
  message: 'column crm_leads.budget does not exist'
}
```

Postgres mã `42703` **hủy cả câu**. PostgREST không trả hàng. Route nuốt lỗi → HTTP vẫn đi tiếp nhưng payload ~50 byte (rỗng / lỗi ngắn). Tab tổng quan deal/lead trên module Dự án mất danh sách.

Cùng phiên, query-guard in bảng 5 chỗ (số lần cộng dồn từ lúc process start, không phải 1 request):

| Lần | Mã guard | Bảng | Call site |
|---|---|---|---|
| 122× | `COT-KHONG-TON-TAI` | `crm_leads` | `src/routes/management.js:1951` |
| 61× | `NGHI-BI-CAT-1000-DONG` | `tasks` | `src/routes/dashboard.js:1275` |
| 61× | `FILTER-ID-QUA-DAI` | `projects` | `src/routes/management.js:546` |
| 60× | `NGHI-BI-CAT-1000-DONG` | `notifications` | `src/routes/dashboard.js:209` |
| 30× | `RPC-KHONG-TON-TAI` | `rpc` | `khong-xac-dinh` |

Các dòng `GET /api/production/backup-sync/sync/public-status 304` là polling bình thường — **không liên quan**.

---

## 1. P0 — `crm_leads.budget` / `deadline` không tồn tại (giết câu)

### Đo trên production

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='crm_leads'
  AND column_name IN ('budget','deadline','estimated_value','expected_close_date','kanban_deadline_at');
```

Kết quả thật:

| Cột | Có? |
|---|---|
| `estimated_value` | có (`numeric`) |
| `expected_close_date` | có (`date`) |
| `kanban_deadline_at` | có (`timestamptz`) |
| `budget` | **không** |
| `deadline` | **không** |

Hạn CRM dẫn xuất theo AI-002 / `moduleDeadlinePolicy` — **không** thêm cột `crm_leads.deadline` chỉ để select cho hết lỗi.

### Chỗ hỏng

`backend/src/routes/management.js` — `GET /deals` (~dòng 1885–1953):

```js
const listSelect = `
  id, code, title, type, budget, estimated_value, created_at, updated_at, deadline,
  ...
`;
```

`fetchTypeRows` (dòng 1951, đúng site query-guard) dùng `listSelect`. Postgres báo cột sai **đầu tiên** (`budget`); `deadline` cũng sai nhưng chưa tới lượt.

Cùng hàm, filter quá hạn CRM (dòng 1930–1931) cũng gọi cột không có:

```js
query = query.lt('deadline', new Date().toISOString()).not('deadline', 'is', null);
```

Chỗ **đã đúng** trong cùng file: `loadDealPipelineMetrics` (dòng 341) ghi chú và chỉ select `estimated_value`. Dòng 492 map `d.budget || d.estimated_value` là đọc object JS sau khi đã query — không phải lỗi schema, nhưng sẽ luôn đi nhánh `estimated_value` nếu bỏ `budget` khỏi select.

### Việc đã biết

REVIEW-596 §7.3b: log prod 08/09 **91×/giờ** `crm_leads.budget`. Lỗi này **đã sống trên production**, không chỉ local.

### Kế hoạch sửa (đề xuất Claude)

1. Ghi `WORKLOG.md` trước: sẽ sửa `listSelect` + `applyDealQueryFilters` trong `GET /management/deals`.
2. Bỏ `budget` và `deadline` khỏi `listSelect` của `crm_leads`.
3. Giá trị hiển thị: `estimated_value`. Hạn thẻ: `kanban_deadline_at` / `expected_close_date` / policy `crmEffectiveDeadline` — **một** nguồn, không `COALESCE` rải (AI-002).
4. Đổi filter `overdue_crm` (dòng 1930) sang cột/policy thật, không `.lt('deadline')` trên `crm_leads`.
5. `rg "from\\('crm_leads'\\).*budget|crm_leads.*\\bdeadline\\b" backend` — dọn chỗ select/filter còn sót.
6. Kiểm thử: gọi lại
   `GET /api/management/deals?company_id=<công ty>&record_type=all&module_tab=overview&all=1500`
   kỳ vọng JSON có `rows`/`items`, không 42703; query-guard `COT-KHONG-TON-TAI crm_leads` về 0 sau restart.
7. **Không** tạo migration thêm `crm_leads.budget` / `crm_leads.deadline`.

Rollback: hoàn tác `listSelect` + filter. Không đụng schema.

---

## 2. P1 — `FILTER-ID-QUA-DAI` `projects` tại `management.js:546`

### Cơ chế

`loadSxPipelineSummary`:

```js
let wonIds = await getWonDealProjectIds(); // không truyền companyId
let pq = supabase.from('projects').select('id').in('id', wonIds);
```

Guard cảnh báo khi `.in(...)` ≥ 300 id; **gãy URL** đo được quanh **556–643** id (`supabaseQueryGuard.js`).

`getWonDealProjectIds()` không có `companyId` lấy **toàn hệ thống**, gồm fallback «mọi deal có `project_id`» + `crm_deal_projects` (`workshopKanban.js` ~180–224).

### Đo production lúc viết

| Tập | Số |
|---|---|
| Deal đang cột thắng + có `project_id` | 46–47 |
| Mọi deal có `project_id` | **657** |
| `crm_deal_projects.project_id` | **525** |

Union dễ **> 556** → cảnh báo là thật, và có thể đã cắt/gãy filter tùy lúc cache.

Commit `deccee87` đã hạ lô `.in()` xuống 300 — chỗ này vẫn nhồi một lần.

### Kế hoạch sửa

1. Truyền `companyId` (hoặc `scope.companyIds`) vào `getWonDealProjectIds` từ `loadSxPipelineSummary`.
2. Nếu vẫn > 300 id: chia lô 300 (cùng pattern `deccee87`) hoặc RPC `id = ANY($1::uuid[])`.
3. Không thu hẹp ý nghĩa «won» nếu chưa đo intake xưởng (comment HCB thiếu card trong `workshopKanban.js`).

Kiểm thử: mở tổng quan module Dự án / SX; guard `FILTER-ID-QUA-DAI projects` hết sau restart; cột Tiếp nhận HCB không mất card.

---

## 3. P1 — `NGHI-BI-CAT-1000-DONG` `tasks` tại `dashboard.js:1275`

```js
supabase.from('tasks').select('assignee_id')
  .in('status', ['pending', 'in_progress', 'review'])
```

Không `.range()`. PostgREST max-rows = 1000; trả đúng 1000 ⇒ KPI `resource_overload` (user > 20 task) **thiếu**.

Đo production: **2213** task `pending|in_progress|review` → mất hơn nửa.

Sửa: `fetchAll` phân trang, hoặc `count`/`group` bằng RPC. Kiểm thử: số active tasks API = 2213 (± delta), không còn guard 1000 dòng.

---

## 4. P2 — `NGHI-BI-CAT-1000-DONG` `notifications` tại `dashboard.js:209`

```js
.from('notifications')
.select('type, entity_type, metadata')
.eq('user_id', req.user.userId)
.eq('is_read', false)
.is('dismissed_at', null)
.limit(1000)
```

`.limit(1000)` **chạm trần** max-rows. Đo: **130141** notification chưa đọc / chưa dismiss (toàn bảng, mọi user). Per-user vẫn có thể ≥ 1000 → badge unread thiếu.

Sửa: đếm theo loại bằng SQL/RPC; hoặc phân trang + không `limit(1000)` giả full. Prefer path `pgDashboardNotificationStats` nếu đã cover.

---

## 5. P2 — `RPC-KHONG-TON-TAI` site `khong-xac-dinh`

Mã PostgREST `PGRST202`. Guard chỉ gắn stack cho `select/insert/update/upsert/delete`, **không** bọc `.rpc()` → site luôn `khong-xac-dinh` (`supabaseQueryGuard.js` ~84, 196–205).

### Kế hoạch

1. Bọc `.rpc` giống các verb khác để log ra file:dòng.
2. Đối chiếu `list_migrations` / `pg_proc` với tên RPC trong code (ứng viên: deadline 596, `project_tasks_overview`, dashboard stats).
3. Đừng đoán tên từ ký ức — đo log sau khi có stack.

---

## 6. Thứ tự đề xuất (Claude lập kế hoạch chi tiết rồi mới sửa)

| # | Việc | File | Chặn? |
|---|---|---|---|
| 0 | Ghi `WORKLOG.md` trước khi sửa `management.js` | `docs/ai-handoff/WORKLOG.md` | AI-004 |
| 1 | Bỏ `budget`/`deadline` khỏi select+filter `GET /deals` | `routes/management.js` | **P0 UI trống** |
| 2 | Quét sót `crm_leads.budget` / `.deadline` | backend | P0 sót |
| 3 | Chia lô / scope `wonIds` trong `loadSxPipelineSummary` | `management.js`, có thể `workshopKanban.js` | P1 gãy URL |
| 4 | Phân trang active `tasks` dashboard | `dashboard.js` ~1275 | P1 KPI sai |
| 5 | Badge notification không `limit(1000)` | `dashboard.js` ~209 | P2 |
| 6 | Guard bắt stack `.rpc` + tìm RPC thiếu | `supabaseQueryGuard.js` | P2 quan sát |
| 7 | Restart backend, xác nhận bảng tổng hợp 15 phút không còn 5 dòng trên | — | Done |

Không gộp vào commit deadline 596. Không deploy production nếu người dùng chưa yêu cầu.

### Kiểm thử Done

- [ ] `GET /api/management/deals?...&all=1500` có danh sách, không 42703
- [ ] `node --check src/routes/management.js`
- [ ] `rg "crm_leads" -g "*.js"` không còn select `budget` / filter `deadline` trên bảng đó
- [ ] Query-guard sau 15 phút: 0× `COT-KHONG-TON-TAI crm_leads`
- [ ] Đo lại số id trong `.in('id', wonIds)` sau khi scope/chia lô (< 300)
- [ ] Active tasks dashboard khớp COUNT production (~2213 lúc viết)

### Rollback

Chỉ revert JS. Không migration.
