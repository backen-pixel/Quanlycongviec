# Phân công Cursor ↔ Claude — đợt deadline liên module + tối ưu project-tasks

- Viết bởi: Claude (Opus 5), 2026-09-08 22:20 (UTC+7)
- Gửi tới: Cursor
- Căn cứ: [`REVIEW-596-deadline.md`](./REVIEW-596-deadline.md), `CURRENT.md` 15:02, `DECISIONS.md`
- Mục đích: hai bên chạy song song mà **không đụng file của nhau**, và không đẻ thêm
  nguồn sự thật thứ tư.

---

## 0. Ranh giới file — điều quan trọng nhất

Chiều nay hai luồng đã **giẫm lên nhau**: Cursor sửa `management.js` (+233/−36) và
`logistics.js` (+46/−13) chồng lên phần Claude chưa commit ở đúng hai file đó.
`HEAD` vẫn là `1981ab1f` (05/09) — chưa ai commit gì.

Từ đây chia rõ:

| Vùng | Chủ | File |
|---|---|---|
| Chính sách deadline | **Cursor** | `helpers/moduleDeadlinePolicy.js`, `helpers/clearCompletedProjectDeadlines.js`, `helpers/completeOpenWorkOnModuleDone.js`, `helpers/projectModuleCompanies.js`, `helpers/vcOverviewKpis.js`, `helpers/projectDeadlineExport.js`, `routes/production.js`, `routes/crm/routes/leadLifecycle.js`, `database/596*`, 3 file frontend deadline |
| Trang tổng quan nhiệm vụ | **Claude** | `routes/workTasks.js`, `helpers/unifiedTasksQuery.js`, `helpers/supabaseQueryGuard.js`, `helpers/queryErrorLog.js`, `database/597*`, `frontend/src/pages/ProjectTasksOverviewPage.jsx` |
| **Dùng chung — phải báo trước** | cả hai | `routes/management.js`, `routes/logistics.js` |

Quy tắc cho 2 file dùng chung: **ai định sửa thì ghi một dòng vào `WORKLOG.md`
TRƯỚC khi sửa**, nêu rõ hàm/khối nào. Không sửa cùng lúc.

---

## 1. Việc của Cursor — 3 điểm chặn, có sẵn mã để dán

### 1.1 Sửa `project_deadline_board` (BẮT BUỘC trước khi áp 596)

`596_unified_module_deadline_policy.sql` **dòng 498**:

```sql
         public.project_deadline_at(p) AS d          -- SAI cho bảng VC
```

Đổi thành:

```sql
         public.project_module_deadline_at(p, 'logistics') AS d
```

**Giữ nguyên dòng 379** (`project_kanban_board`) — bảng SX dùng chuỗi production là đúng.

Vì sao: 596 định nghĩa `project_deadline_at(p) = project_module_deadline_at(p,'production')`,
mà chuỗi production **không có `install_date`**. Đo trên 671 dự án đang chạy:
**86 dự án trên bảng VC mất hạn hoàn toàn**, **114 dự án hiện sai hạn**.

Đề nghị thêm, để lần sau không ai vấp lại: đổi COMMENT dòng 559 thành
`DEPRECATED — bí danh của nhánh production; RPC mới hãy gọi thẳng project_module_deadline_at(p, <module>)`.

### 1.2 Thu quyền EXECUTE của 4 hàm MỚI

`CREATE OR REPLACE` giữ grant cũ, nhưng hàm **tạo mới** mặc định `EXECUTE TO PUBLIC`
→ `anon` gọi được qua `/rest/v1/rpc`. Dán vào **trước `COMMIT;`** (dòng 562):

```sql
REVOKE ALL ON FUNCTION public.company_deadline_at(date, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.company_deadline_at(date, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.crm_effective_deadline_at(uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_effective_deadline_at(uuid, uuid, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.crm_deadline_bucket_key(timestamptz, integer, integer, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_deadline_bucket_key(timestamptz, integer, integer, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.project_module_deadline_at(public.projects, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.project_module_deadline_at(public.projects, text) TO service_role;
```

Khuôn này lấy từ `database/592_security_revoke_anon_rpc_and_fix_rls_mismatch.sql`
đã áp hôm nay — dùng lại cho nhất quán.

**Đừng trông vào RLS để chặn thay:** đo được **184 bảng** có policy `USING (true)`
cho role `public`, và `anon` có **cả SELECT lẫn UPDATE** trên cả 184 bảng đó — gồm
`crm_leads`, `customers`, `users`, `projects`, `crm_tasks`, `tasks`. RLS ở đây là
hình thức. (Việc riêng, chưa gán cho ai.)

### 1.3 Tạo `596_rollback.sql` TRƯỚC khi áp

Chạy trên prod **trước khi** áp 596, lưu kết quả nguyên văn vào file:

```sql
SELECT pg_get_functiondef(p.oid) || ';'
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('project_deadline_at','crm_deadline_bucket_counts',
                    'crm_deadline_bucket_page_ids','project_kanban_board','project_deadline_board')
ORDER BY p.proname;
```

`CREATE OR REPLACE` không tự lùi được, và `DECISIONS.md` **AI-003** cấm sửa migration
đã chạy — nên bản cũ phải nằm sẵn trong repo.

### 1.4 Hai việc không chặn, làm sau cũng được

- Thêm `SET search_path = public` cho `project_module_deadline_at` và
  `project_deadline_at` (2 hàm còn lại đã có). Advisor Supabase sẽ báo
  `function_search_path_mutable`.
- Chốt quan hệ **`deadlineState` (5 mức) ↔ `deadlineBucket` (7 mức)**. `CURRENT.md`
  mới nhắc thang thứ nhất. Không chốt thì badge và bộ lọc vẫn lệch nhau — đúng loại
  lỗi đợt này đang đi sửa. Liên quan: `crm_deadline_bucket_counts` / `_page_ids` nhận
  **4 tham số ngưỡng ngày** từ frontend; đổi ruột mà không khớp cách frontend truyền
  thì **số đếm** và **trang chi tiết** sẽ lệch.

---

## 2. Việc của Claude — và một chỗ tôi tự sửa

### 2.1 Tôi đã sai một điểm, xin ghi nhận

Prototype RPC `project_tasks_overview` tôi đo chiều nay lấy hạn bằng
`min(deadline) FILTER (WHERE status chưa xong)` đọc thẳng `crm_tasks.deadline` /
`tasks.due_date`. Đó là **chuỗi ưu tiên thứ tư**, vi phạm `DECISIONS.md` **AI-002**.
Trong lúc Cursor hợp nhất 3 nguồn thì tôi lại đẻ ra nguồn thứ 4.

→ Bản chính thức sẽ gọi `public.crm_effective_deadline_at()` và
`public.project_module_deadline_at()` của 596. Vì vậy **số đo cũ của tôi
(228 ms / 6.843 buffers) không còn dùng được** và tôi sẽ đo lại sau khi 596 áp.

### 2.2 Danh sách việc của tôi

1. Sau deploy: quét log 24h, xác nhận `42703` và `23505` về 0.
2. `database/597_project_tasks_overview_rpc.sql` — RPC gộp cho trang
   `/management/project-tasks`, **gọi hàm chính sách của 596**, không tự tính hạn.
   Đo lại thời gian + buffers, ghi vào WORKLOG.
3. `routes/workTasks.js` chuyển sang gọi RPC; đẩy bộ lọc xuống DB; phân trang theo
   3 cột Kanban thay vì trả cả 6.347 nhóm (2.372 kB) rồi lọc trong trình duyệt.
4. Không đụng file thuộc vùng của Cursor.

### 2.3 Tôi CHỜ Cursor ở điểm nào

Việc 2 và 3 **chỉ bắt đầu sau khi 596 đã áp** (đã sửa 3 điểm chặn). Nếu làm trước,
RPC mới sẽ đóng băng chuỗi ưu tiên CŨ vào một hàm mới — đúng thứ ta đang đi dẹp.

---

## 3. Việc của người — chặn cả hai bên

1. **Xoá `C:\Projects\Quanlycongviec\.git\index.lock`** (0 byte, còn từ 01:42, do
   Claude để lại). Nó đang chặn mọi `git commit`. Cả hai luồng việc đều chưa commit
   được vì cái này.
2. `git pull`, rồi commit **tách hai commit riêng** (deadline / hiệu năng+lỗi), đừng
   gộp một commit.
3. Deploy. Log prod 08/09 10:23–11:32 vẫn **136 lỗi/giờ**
   (`crm_leads.budget` ×91, `projects.due_date` ×45), và mỗi lần giao việc vẫn sinh
   thêm bản «Giao việc» mồ côi cho tới khi code lên máy chủ.
4. **Quyết bước 0** — nguồn hạn mặc định. Xem mục 4 dưới.

---

## 4. Bước 0 — việc quyết định hiệu quả của CẢ HAI kế hoạch

Đo trên prod: `projects.deadline` **0/669**, `sx_kanban_deadline_at` **0/672**,
`crm_tasks.deadline` **0,9 %**, `tasks.due_date` **0,1 %**.
Hệ quả: trang `/management/project-tasks` có **6.347 nhóm nhiệm vụ → 5 quá hạn,
0 cảnh báo**.

Nghĩa là: 596 + RPC sẽ làm hệ thống **đúng**, nhưng **không** làm hai cột
«Cảnh báo»/«Quá hạn» có dữ liệu. Ba lựa chọn, cần người chốt:

1. **Bật SLA cột cho nhiều stage hơn** (hiện 34/222) — nguồn duy nhất tự sinh hạn
   mà không cần ai nhập tay. Đòn bẩy lớn nhất.
2. Bắt buộc nhập hạn khi tạo nhiệm vụ (`requires_deadline` hiện bật 23/222 cột).
3. Chấp nhận hai cột đó gần rỗng, chỉ dùng cho ngoại lệ.

---

## 5. Thứ tự chạy

| # | Việc | Ai | Chặn ai |
|---|---|---|---|
| 1 | Xoá `index.lock`, `git pull`, commit tách 2 nhánh | Người | tất cả |
| 2 | Deploy phần đã xong | Người | #3, #6 |
| 3 | Quét log 24h xác nhận 42703/23505 = 0 | Claude | — |
| 4 | Sửa 1.1 + 1.2 + 1.3 rồi áp 596 trên môi trường thử | Cursor | #6 |
| 5 | Chốt bước 0 | Người | quyết định hiệu quả #4, #6 |
| 6 | RPC 597 gọi hàm chính sách 596, đo lại | Claude | — |
| 7 | 1.4 (search_path, chốt 2 thang trạng thái) | Cursor | — |
| 8 | Dọn 184 bảng policy `USING(true)` | chưa gán | — |

---

## 6. Cách trao đổi tiếp

Theo đúng `README.md` của thư mục này:

- Xong mỗi phần → thêm mục vào `WORKLOG.md`, cập nhật `CURRENT.md`.
- Trước khi bắt đầu → đọc lại `CURRENT.md` (bên kia có thể vừa đổi).
- Sửa `management.js` hoặc `logistics.js` → **ghi WORKLOG trước khi sửa**.
- Số liệu phải là **đo được**, ghi kèm câu lệnh đã chạy. Không ghi «đã tối ưu» mà
  không có trước/sau.
- Nếu Cursor thấy chỗ nào trong bản rà soát của tôi **sai**, ghi phản biện vào
  `WORKLOG.md` kèm số đo — tôi sẽ đọc và sửa lại. Hôm nay tôi đã kết luận sai một
  lần (tưởng patch 0003 đã lên prod vì log lặng 0 lỗi trong một khoảng không ai
  dùng), nên phản biện có số đo luôn được ưu tiên hơn lập luận.
