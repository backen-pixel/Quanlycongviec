# Đánh giá kế hoạch «Đồng bộ deadline CRM / SX / VC-LĐ»

Ngày rà: 08/09/2026 · đối chiếu với `C:\Projects\Quanlycongviec` và DB `qlycv`

Mọi con số dưới đây đều **đo được**, không suy đoán.

---

## Kết luận trong ba câu

1. Kế hoạch **đúng hướng** — một chính sách deadline dùng chung là việc nên làm.
2. Nhưng nó viết trên **ảnh chụp cũ của repo**: bước 1 và bước 3 **đã làm xong rồi**.
3. Việc đáng giá nhất — hai nguồn sự thật xếp **ngược thứ tự nhau**, đang cho hai
   ngày khác nhau trên 9 dự án — bị chôn làm gạch đầu dòng thứ hai của bước 4.

---

## 1. Hai bước đã xong — xoá khỏi kế hoạch

### Bước 1 «Tạo lõi chính sách» — ĐÃ CÓ

`backend/src/helpers/moduleDeadlinePolicy.js` **đã tồn tại, 215 dòng**, đúng y
những gì kế hoạch mô tả sẽ tạo:

- `MODULE = { CRM, PRODUCTION, LOGISTICS }`
- `resolveCrmDeadline` / `resolveProductionDeadline` / `resolveLogisticsDeadline`
- `deadlineState` (`overdue|soon|warning|ok|none`) và `deadlineBucket`
- `withEffectiveModuleDeadline` trả đúng `effective_deadline_at`,
  `effective_deadline_source`, `deadline_state`
- Đã `require` sẵn `companyDeadlineClock` và `crmPipelineSla` như kế hoạch nói.

→ Bước 1 không còn việc. Nếu làm lại sẽ tạo file thứ hai cùng chức năng.

### Bước 3 «Tách lifecycle hoàn thành» — ĐÃ CÓ

`completeOpenWorkOnModuleDone.js` **đã có đủ 4 nhánh** `crm | production |
logistics | project_final` (dòng 594–656), đúng tên kế hoạch đề nghị.

`clearCompletedProjectDeadlines.js` **đã tách sẵn 3 hàm riêng**:
`clearSxSchedulesOnCompletedForProjects`, `clearCrmCompletedLeadDeadlines`,
`clearVcCompletedProjectDeadlines`. Ngay dòng 43–44 của file ghi:

> *«chỉ xóa deadline SX + hoàn thành NV SX còn mở + hủy lịch hẹn SX.
> **Không đụng deadline CRM, VC/LĐ** và các ngày giao/lắp lịch sử.»*

→ Cáo buộc **«hoàn thành SX xoá `crm_leads.kanban_deadline_at`» không còn đúng**.
Nếu kế hoạch dựa vào đó để xin ưu tiên thì lý do đã hết hiệu lực.

---

## 2. Việc thật sự còn thiếu — và nó nặng hơn kế hoạch mô tả

**Hai nguồn sự thật, xếp ngược nhau.**

| | Thứ tự |
|---|---|
| JS `resolveProductionDeadline` | `sx_kanban_deadline_at` → `production_finish_date` → `production_deadline` → `delivery_date` → `deadline` |
| SQL `project_deadline_at(projects)` | `deadline` → `sx_kanban_deadline_at` → `production_deadline` → `design_deadline` → `delivery_date` → `install_date` |

`deadline` đứng **đầu** ở SQL và **cuối** ở JS. SQL không biết
`production_finish_date`; JS không biết `design_deadline`. SQL không có khái niệm
module — một dự án chỉ có một hạn duy nhất.

**Đo trên 671 dự án đang chạy:**

| | Số dự án |
|---|---|
| JS chuỗi SX ra được hạn | 97 |
| SQL `project_deadline_at` ra được hạn | 205 |
| JS chuỗi VC ra được hạn | 197 |
| **Lệch: JS-SX ≠ SQL** | **117** |
| **Lệch: JS-VC ≠ SQL** | **93** |
| **Cả hai đều có hạn nhưng KHÁC NGÀY** | **9** |

9 dự án đó là loại tệ nhất: hai màn hình nói hai ngày khác nhau cho cùng một dự
án, không ai biết cái nào đúng.

→ **Đây phải là việc số 1**, không phải gạch đầu dòng trong bước 4.

Một tin tốt cho kế hoạch: **không có index biểu thức nào trên
`project_deadline_at`** (đã kiểm `pg_indexes`), nên `CREATE OR REPLACE FUNCTION`
là đủ, không phải reindex. Chỗ này kế hoạch nói đúng.

---

## 3. Chuỗi ưu tiên cần sửa — 3 mắt xích mang toàn bộ dữ liệu

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
| **`projects.deadline`** | **0 / 669** | **0 %** ← đuôi của CẢ chuỗi SX lẫn VC |
| `projects.design_deadline` | 0 | 0 % (chỉ có trong SQL) |
| `crm_tasks.deadline` (NV mở) | 886 / 104.440 | **0,9 %** |
| `tasks.due_date` (NV mở) | 13 / 17.821 | **0,1 %** |

**Cần đổi trong kế hoạch:** bỏ hoặc hạ xuống cuối các mắt xích rỗng —
`sx_kanban_deadline_at` (đang là đầu chuỗi SX), `projects.deadline` (đuôi cả hai
chuỗi), `design_deadline`, `expected_close_date`. Giữ chúng không sai, nhưng đọc
kế hoạch sẽ tưởng chuỗi có 5 nguồn trong khi thực tế chỉ 2 nguồn có dữ liệu.

---

## 4. Điều kế hoạch không nói mà quyết định hiệu quả

Đo trang `/management/project-tasks` hôm nay: **6.347 nhóm nhiệm vụ →
5 quá hạn, 0 cảnh báo.** Vì **99,1 % crm_tasks và 99,9 % tasks không có hạn nào**.

Nghĩa là: thống nhất chính sách deadline sẽ làm hệ thống **đúng**, nhưng **sẽ
không làm hai cột «Cảnh báo» và «Quá hạn» có dữ liệu**. Công sức bước 2, 4, 5
sẽ không đổi gì trên màn hình người dùng cho tới khi có hạn để mà tính.

**Đề nghị thêm bước 0 — quyết định nguồn hạn mặc định.** Ba lựa chọn:

1. **Bật SLA cột cho nhiều stage hơn** (hiện 34/222). Đây là nguồn duy nhất tự
   sinh được hạn cho mọi thẻ mà **không cần ai nhập tay** — đòn bẩy lớn nhất.
2. Bắt buộc nhập hạn khi tạo nhiệm vụ (`requires_deadline` hiện bật ở 23/222 cột).
3. Chấp nhận hai cột đó gần như rỗng, chỉ dùng cho ngoại lệ.

Không chọn bước 0 thì bước 2–5 là làm đẹp phần móng của một căn nhà chưa có ai ở.

---

## 5. Ba chỗ phải sửa trong bản kế hoạch

**a) Đảo thứ tự.** Thứ tự đúng theo giá trị đo được:

| Ưu tiên | Việc | Vì sao |
|---|---|---|
| 0 | Chốt nguồn hạn mặc định (SLA cột) | Không có nó thì mọi bước sau vô hình |
| 1 | Đồng bộ `project_deadline_at` + 3 RPC với lõi JS | 117 + 93 dự án đang lệch, 9 khác ngày |
| 2 | Bước 2 cũ (CRM đọc/ghi qua lõi) | `leadLifecycle.js`, `crmOpenTaskDeadlineSync.js`, `helpersBundle.js` chưa import lõi |
| 3 | Bước 4b MỚI (xem dưới) | Chặn nguồn sự thật thứ ba |
| 4 | Bước 5 cũ (frontend adapter) | Chỉ chạy được sau 4b |
| ~~—~~ | ~~Bước 1, bước 3~~ | Đã xong |

**b) Thiếu hẳn một bước: đưa `effective_deadline_*` ra ngoài API.**
Hiện `effective_deadline_at` chỉ xuất hiện ở **đúng 2 dòng** trong
`moduleDeadlinePolicy.js`, và lõi mới được import bởi **2 file**
(`projectDeadlineExport.js`, `projectModuleCompanies.js`) — cả hai dùng nội bộ,
**không API nào trả field này ra client**. Bước 5 viết «chỉ fallback tính cục bộ
khi payload cũ chưa có field» — nhưng hiện *mọi* payload đều chưa có, nên adapter
frontend sẽ **luôn** chạy nhánh fallback, và ta có nguồn sự thật **thứ ba**.
→ Phải chèn bước 4b: đưa `withEffectiveModuleDeadline` vào payload của các
endpoint CRM/SX/VC **trước** khi làm frontend.

**c) Bước 6 chưa nhìn cái đang có.** Đã có 2 test deadline
(`tests/crm-kanban-deadline-dedup-smoke.js`, `tests/project-kanban-grouping-smoke.js`)
nhưng **không có `npm script` nào gọi chúng** → không ai chạy. Thêm script trước
khi viết test mới. Ngoài ra cả hai đều cần mạng + DB thật; **test ma trận thứ tự
ưu tiên phải viết OFFLINE** (gọi thẳng hàm thuần, dữ liệu giả) thì mới chạy được
trong CI và trên máy không có mạng ra ngoài.

---

## 6. Bốn rủi ro kế hoạch bỏ sót

1. **Hai thang trạng thái đang song song.** `deadlineState` có 4 mức
   (`overdue` / `soon` ≤1 ngày / `warning` ≤3 ngày / `ok`), còn `deadlineBucket`
   có 6 (`overdue` / `today` / `this_week` / `next_week` / `this_month` / `later`).
   Kế hoạch chỉ nhắc `overdue, soon, warning, ok, none`. Phải chốt rõ: hai thang
   độc lập, hay bucket suy ra từ state? Không chốt thì hợp nhất xong badge và bộ
   lọc vẫn lệch nhau.
2. **`crm_deadline_bucket_counts` / `_page_ids` nhận 4 tham số ngưỡng ngày.**
   Đổi logic bên trong mà không khớp cách frontend đang truyền thì **số đếm** và
   **trang chi tiết** sẽ lệch nhau — lỗi khó thấy hơn cả lỗi hiện tại.
3. **3 index trên `projects.deadline` — cột 100 % NULL**
   (`idx_projects_deadline_created`, `idx_projects_company_deadline_created`,
   `idx_projects_sx_kanban_col_company_deadline`). Mọi UPDATE dự án vẫn trả phí
   ghi cho chúng mà không index được gì. Nên gộp dọn vào cùng đợt.
4. **Rollback không đơn giản như kế hoạch nói.** Câu «rollback bằng cách trả các
   adapter về helper cũ» chỉ đúng cho phần JS. Phần SQL (`CREATE OR REPLACE` 4
   function) cần giữ sẵn bản `.sql` của định nghĩa CŨ trong migration, nếu không
   lúc rollback phải đi đọc lại `pg_get_functiondef` trên prod.

---

## 7. Chấm từng bước

| Bước | Đánh giá | Hành động |
|---|---|---|
| 1 · Lõi chính sách | ✅ Đã xong | Xoá khỏi kế hoạch |
| 2 · CRM đọc/ghi qua lõi | ⬜ Chưa làm, đúng và cần | Giữ, ưu tiên 2 |
| 3 · Tách lifecycle | ✅ Đã xong | Xoá khỏi kế hoạch |
| 4 · Đồng bộ API/KPI/RPC | 🟡 2/5 file JS xong, **SQL chưa** | Tách đôi: SQL lên ưu tiên 1, JS còn lại ưu tiên 2 |
| 4b · Trả `effective_deadline_*` ra API | ❌ Kế hoạch thiếu hẳn | Thêm mới, chặn bước 5 |
| 5 · Frontend adapter | ⬜ Chưa làm | Giữ, nhưng chỉ sau 4b |
| 6 · Kiểm thử | 🟡 Ý đúng, bỏ sót test đang có | Wire 2 test cũ + viết test ma trận OFFLINE |
| 0 · Nguồn hạn mặc định | ❌ Kế hoạch thiếu hẳn | **Quyết định trước tiên** |

**Tổng: kế hoạch dùng được sau khi cắt 2 bước đã xong, thêm 2 bước còn thiếu và
đảo thứ tự.** Khối lượng thật còn lại nhỏ hơn bản kế hoạch mô tả, nhưng phần
quan trọng nhất (SQL lệch JS) thì nặng hơn.
