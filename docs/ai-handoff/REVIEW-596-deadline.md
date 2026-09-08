# Rà soát migration 596 + chính sách deadline liên module

- Người rà: Claude (Opus 5), phiên 2026-09-08 ~22:00 UTC+7
- Đối tượng: `CURRENT.md` 15:02, `WORKLOG.md` 14:53 + 15:02, `database/596_unified_module_deadline_policy.sql`
- Cách rà: đối chiếu code trong working tree với DB production `qlycv` (`kdxypztstbeovyedmvem`).
  Mọi con số dưới đây là **đo được**, không suy đoán.

---

## Kết luận

Hướng đi đúng, code đã viết tốt, nhưng **596 chưa được áp là may** — trong bản
hiện tại nó sẽ **làm hỏng bảng deadline VC/Lắp đặt**. Sửa 1 dòng là xong, cộng
4 việc bổ sung trước khi chạy production.

---

## 1. CHẶN PHÁT HÀNH — 596 làm bảng deadline VC mất hạn

`project_deadline_board` (bảng deadline VC/Lắp đặt) gọi:

```sql
public.project_deadline_at(p) AS d          -- 596 dòng ~498
```

Nhưng 596 định nghĩa lại chính hàm đó thành **chuỗi Sản xuất**:

```sql
CREATE OR REPLACE FUNCTION public.project_deadline_at(p public.projects) ...
  SELECT public.project_module_deadline_at(p, 'production');   -- 596 dòng 335-341
```

Chuỗi `production` **không có `install_date`** — mà `install_date` chính là nguồn
có dữ liệu nhiều nhất của VC.

**Đo trên 671 dự án đang chạy:**

| | Số dự án |
|---|---|
| Dự án có mặt trên bảng VC (`vc_kanban_column_id` hoặc `logistics_company_id`) | 118 |
| `project_deadline_at` **cũ** ra được hạn | 205 |
| `project_deadline_at` **sau 596** ra được hạn | 97 |
| Nếu dùng đúng chuỗi `logistics` | 197 |
| **Dự án trên bảng VC MẤT hạn hoàn toàn sau 596** | **86** |
| **Dự án trên bảng VC hiện SAI hạn sau 596** | **114** |

**Cách sửa:** trong `project_deadline_board`, đổi
`public.project_deadline_at(p)` → `public.project_module_deadline_at(p, 'logistics')`.

`project_kanban_board` (bảng SX) **giữ nguyên** `project_deadline_at` — chỗ đó đúng rồi.

Gợi ý thêm: `project_deadline_at(p)` giờ chỉ còn là bí danh của nhánh production.
Nên để nó `DEPRECATED` trong COMMENT và bắt mọi RPC gọi thẳng
`project_module_deadline_at(p, <module>)`, để lần sau không ai vấp lại đúng chỗ này.

---

## 2. Bốn việc phải làm trước khi áp

### 2.1 Thu quyền EXECUTE của 4 hàm MỚI

`CREATE OR REPLACE` **giữ nguyên grant cũ**, nhưng hàm **tạo mới** mặc định
`EXECUTE TO PUBLIC`. Bốn hàm mới trong 596 — `company_deadline_at`,
`crm_effective_deadline_at`, `crm_deadline_bucket_key`,
`project_module_deadline_at` — sẽ gọi được từ `anon` qua `/rest/v1/rpc`.

Thêm vào cuối 596, theo đúng khuôn migration 592 đã dùng:

```sql
REVOKE ALL ON FUNCTION public.company_deadline_at(date, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.company_deadline_at(date, uuid) TO service_role;
-- lặp cho crm_effective_deadline_at, crm_deadline_bucket_key, project_module_deadline_at
```

**Đừng trông vào RLS để chặn.** Đo được trên prod: **184 bảng** có policy
`USING (true)` cho role `public`, và `anon` có **cả SELECT lẫn UPDATE** trên cả
184 bảng đó — gồm `crm_leads`, `customers`, `users`, `projects`, `crm_tasks`,
`tasks`. RLS ở đây là hình thức, không bảo vệ gì. Đây là việc riêng cần xử lý,
nhưng nó xoá mất đúng lớp phòng thủ mà `SECURITY INVOKER` đang dựa vào.

### 2.2 Lưu định nghĩa CŨ để rollback

`grep -c "rollback"` trong 596 = **0**. `CREATE OR REPLACE` không tự lùi được, và
`DECISIONS.md` AI-003 cấm sửa migration đã chạy. Vậy phải có sẵn
`database/596_rollback.sql` chứa 5 định nghĩa cũ, lấy **TRƯỚC** khi áp:

```sql
SELECT pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('project_deadline_at','crm_deadline_bucket_counts',
                    'crm_deadline_bucket_page_ids','project_kanban_board','project_deadline_board');
```

Không lấy trước thì lúc cần lùi phải đi đọc lại định nghĩa trên chính prod đang lỗi.

### 2.3 Thiếu `SET search_path` ở 2 hàm

`company_deadline_at` và `crm_effective_deadline_at` có `SET search_path = public`;
`project_module_deadline_at` và `project_deadline_at` **không có**. Advisor Supabase
sẽ báo `function_search_path_mutable`. Thêm cho đồng bộ.

### 2.4 Test chưa vào được CI

`node tests/module-deadline-policy.test.js` → **`module-deadline-policy: OK`**, chạy được.
Nhưng:

- **Không có `npm script` nào gọi nó** → thực tế sẽ không ai chạy.
- Nó `require('dotenv')` và khởi động `[supabase-health] Probe mỗi 15000ms` → cần
  mạng + `.env`, nên không chạy được trong CI hay trên máy không có egress.
- Hai test deadline **đã có sẵn từ trước** cũng chưa có script:
  `tests/crm-kanban-deadline-dedup-smoke.js`, `tests/project-kanban-grouping-smoke.js`.

Đề nghị: tách phần thuần hàm (ma trận thứ tự ưu tiên, mốc 17:30 VN, `sla_days=0`,
cột hoàn thành) thành test **offline** không đụng DB, rồi thêm
`"test:deadline": "node tests/module-deadline-policy.test.js"` vào `package.json`.

---

## 3. Những chỗ 596 làm ĐÚNG — giữ nguyên

- Chỉ `CREATE OR REPLACE FUNCTION`, không `ALTER TABLE` / `DROP`, gói trong
  `BEGIN … COMMIT`. Đúng cam kết «không đổi schema» trong `DECISIONS.md` AI-003.
- **Không có index biểu thức nào trên `project_deadline_at`** (đã kiểm `pg_indexes`)
  → đổi định nghĩa không phải reindex. `CURRENT.md` không nói, nhưng điều này đúng
  và là lý do migration an toàn.
- Chuỗi `production` trong `project_module_deadline_at` **khớp chính xác** với JS
  `resolveProductionDeadline`. Đây là giá trị lớn nhất của 596:

  **Prod hiện vẫn giữ định nghĩa CŨ** (đã xác nhận bằng `pg_get_functiondef`), nên
  ngay lúc này JS và SQL đang nói hai chuyện khác nhau:

  | | Số dự án |
  |---|---|
  | JS chuỗi SX ≠ SQL `project_deadline_at` | **117** |
  | JS chuỗi VC ≠ SQL `project_deadline_at` | **93** |
  | Cả hai đều ra hạn nhưng **KHÁC NGÀY** | **9** |

  9 dự án đó là hai màn hình nói hai ngày khác nhau cho cùng một dự án. Áp 596
  (sau khi sửa mục 1) dứt điểm được chuyện này.

---

## 4. Điều `CURRENT.md` chưa nói mà quyết định hiệu quả

**Nguồn deadline gần như rỗng.** Đo trên prod:

| Nguồn | Có giá trị | Tỷ lệ |
|---|---|---|
| `crm_leads.kanban_deadline_at` | 1.614 / 8.912 | **18,1 %** ← nguồn sống duy nhất của CRM |
| `crm_pipeline_stages.sla_days > 0` | 34 / 222 | 15,3 % |
| `projects.install_date` | 194 / 672 | 28,9 % |
| `projects.production_finish_date` | 94 | 14,0 % |
| `projects.production_deadline` | 91 | 13,5 % |
| `projects.delivery_date` | 82 | 12,2 % |
| `crm_leads.expected_close_date` | 11 | 0,1 % |
| **`projects.sx_kanban_deadline_at`** | **0 / 672** | **0 %** ← mắt xích ĐẦU chuỗi SX |
| **`projects.deadline`** | **0 / 669** | **0 %** ← đuôi cả hai chuỗi |
| `crm_tasks.deadline` (nhiệm vụ mở) | 886 / 104.440 | **0,9 %** |
| `tasks.due_date` (nhiệm vụ mở) | 13 / 17.821 | **0,1 %** |

Hệ quả đo được: trang `/management/project-tasks` hiện có **6.347 nhóm nhiệm vụ →
5 quá hạn, 0 cảnh báo**.

Nghĩa là: 596 sẽ làm hệ thống **đúng**, nhưng **không** làm hai cột «Cảnh báo» và
«Quá hạn» có dữ liệu. Đề nghị thêm **bước 0 — chốt nguồn hạn mặc định**, ba lựa chọn:

1. **Bật SLA cột cho nhiều stage hơn** (hiện 34/222) — nguồn duy nhất tự sinh hạn
   mà không cần ai nhập tay. Đòn bẩy lớn nhất.
2. Bắt buộc nhập hạn khi tạo nhiệm vụ (`requires_deadline` hiện bật ở 23/222 cột).
3. Chấp nhận hai cột đó gần rỗng, chỉ dùng cho ngoại lệ.

Ngoài ra: 3 index đang nằm trên `projects.deadline` — cột **100 % NULL** —
(`idx_projects_deadline_created`, `idx_projects_company_deadline_created`,
`idx_projects_sx_kanban_col_company_deadline`). Mọi UPDATE dự án vẫn trả phí ghi
cho chúng mà không index được gì. Nên gộp dọn vào cùng đợt.

---

## 5. Một điểm cần chốt về thang trạng thái

`moduleDeadlinePolicy.js` đang có **hai thang song song**:

- `deadlineState`: `overdue` / `soon` (≤1 ngày) / `warning` (≤3 ngày) / `ok` / `none`
- `deadlineBucket`: `overdue` / `today` / `this_week` / `next_week` / `this_month` / `later` / `none`

`CURRENT.md` chỉ nhắc thang thứ nhất. Cần chốt rõ: hai thang độc lập, hay bucket
suy ra từ state? Không chốt thì hợp nhất xong **badge** và **bộ lọc** vẫn lệch nhau —
đúng loại lỗi mà cả đợt này đang đi sửa.

Liên quan: `crm_deadline_bucket_counts` / `_page_ids` nhận **4 tham số ngưỡng ngày**
từ frontend. Đổi ruột hàm mà không khớp cách frontend đang truyền thì **số đếm** và
**trang chi tiết** sẽ lệch nhau — khó phát hiện hơn cả lỗi hiện tại.

---

## 6. Danh sách việc, theo thứ tự

| # | Việc | Chặn phát hành? |
|---|---|---|
| 1 | `project_deadline_board` → `project_module_deadline_at(p,'logistics')` | **CÓ** |
| 2 | `REVOKE` EXECUTE 4 hàm mới khỏi PUBLIC/anon/authenticated | **CÓ** |
| 3 | Tạo `596_rollback.sql` từ `pg_get_functiondef` trước khi áp | **CÓ** |
| 4 | Thêm `SET search_path = public` cho 2 hàm còn thiếu | Không |
| 5 | Thêm npm script + tách test offline | Không |
| 6 | Chốt quan hệ `deadlineState` ↔ `deadlineBucket` | Không |
| 7 | Bước 0: chốt nguồn hạn mặc định (SLA cột) | Không, nhưng quyết định hiệu quả cuối cùng |
| 8 | Dọn 3 index trên `projects.deadline` | Không |
| 9 | Xử lý 184 bảng policy `USING(true)` — việc riêng, ưu tiên cao | Không (với 596) |

---

## 7. Hợp nhất hai kế hoạch — đổi gì ở mỗi bên

Có hai luồng việc đang chạy song song trên **cùng một working tree**:

- **Cursor**: chính sách deadline liên module + migration 596.
- **Claude**: tối ưu request/loading trang `/management/project-tasks` (dự kiến gộp
  ~120 round trip PostgREST thành 1 RPC) + đợt sửa lỗi backend/DB tuần 08–13/09.

### 7.1 Kế hoạch Cursor — 4 điểm đổi

1. `project_deadline_board` → `project_module_deadline_at(p, 'logistics')` (mục 1).
2. Thêm `REVOKE`/`GRANT` cho 4 hàm mới (mục 2.1).
3. Tạo `596_rollback.sql` **trước** khi áp (mục 2.2).
4. Thêm **bước 0** (chốt nguồn hạn mặc định) và chốt quan hệ
   `deadlineState` ↔ `deadlineBucket` (mục 4, 5).

### 7.2 Kế hoạch Claude — 3 điểm đổi, trong đó 1 điểm là lỗi của tôi

1. **RPC `project_tasks_overview` KHÔNG được tự tính deadline.**
   Bản prototype tôi đo hôm nay lấy hạn bằng
   `min(deadline) FILTER (WHERE status chưa xong)` đọc thẳng
   `crm_tasks.deadline` / `tasks.due_date`. Đó là **chuỗi ưu tiên thứ tư**, vi phạm
   `DECISIONS.md` **AI-002** («không thêm chuỗi `COALESCE` hoặc thứ tự ưu tiên riêng
   rải rác trong route/component mới»).
   → Phải gọi `public.crm_effective_deadline_at()` và
   `public.project_module_deadline_at()` của 596.

2. **Số đo của tôi phải làm lại sau khi 596 áp.**
   Con số «228 ms / 6.843 buffers / 1 round trip» đo trên chuỗi tự tính. Khi chuyển
   sang gọi hàm chính sách, mỗi nhóm thêm một lời gọi `STABLE` mà bên trong
   `company_deadline_at` có **subquery vào `sx_company_schedule_config`**. Bảng đó
   hiện chỉ 1 dòng nên chi phí nhỏ, nhưng **chưa đo** thì chưa được khẳng định.

3. **Thứ tự bắt buộc: 596 lên trước, RPC làm sau.**
   Làm ngược lại thì RPC mới sẽ đóng băng chuỗi ưu tiên CŨ vào một hàm mới, và ta
   có thêm một nguồn sự thật nữa đúng lúc đang đi hợp nhất.

### 7.3 Hai việc chung, gấp hơn cả hai kế hoạch

**a) Một working tree, hai AI, chưa commit gì.**
Đo lúc 22:10: 12 file của Cursor đang sửa **chồng lên** phần chưa commit của Claude ở
`backend/src/routes/management.js` (+233/−36) và `backend/src/routes/logistics.js`
(+46/−13). `HEAD` vẫn là `1981ab1f` (05/09) — **chưa ai commit gì**.
Hệ quả: `0005-tuan-08-09-2026-backend-db.patch` (tạo 05:00) **đã lỗi thời**; tạo lại
bây giờ sẽ trộn lẫn hai luồng việc.
→ Cần: xoá `.git/index.lock` (0 byte, còn từ 01:42, đang chặn mọi `git commit`),
`git pull`, rồi commit **tách hai commit riêng** trước khi deploy.

**b) Chưa deploy thì cả hai kế hoạch đều không có tác dụng.**
Log prod 08/09 lúc 10:23–11:32: **136 lỗi/giờ** (`crm_leads.budget` ×91,
`projects.due_date` ×45) vẫn đang chạy. Và mỗi lần giao việc vẫn sinh thêm bản
«Giao việc» mồ côi cho tới khi patch lên máy chủ.

### 7.4 Thứ tự làm, đã hợp nhất

| # | Việc | Của ai | Chặn ai |
|---|---|---|---|
| 1 | Dọn `.git/index.lock`, `git pull`, commit tách 2 nhánh | Người | Chặn tất cả |
| 2 | Deploy phần đã xong (patch 0005 + phần Cursor) | Người | Chặn mọi đo lường sau |
| 3 | Quét lại log 24h, xác nhận 42703/23505 về 0 | Claude | — |
| 4 | Sửa 3 điểm chặn của 596 rồi áp trên môi trường thử | Cursor | Chặn #5, #6 |
| 5 | Bước 0: chốt nguồn hạn mặc định (SLA cột) | Người quyết | Quyết định hiệu quả của cả #4 và #6 |
| 6 | RPC `project_tasks_overview` gọi hàm chính sách của 596, đo lại | Claude | — |
| 7 | Dọn 184 bảng policy `USING(true)` cho `public` | Chưa gán | — |
