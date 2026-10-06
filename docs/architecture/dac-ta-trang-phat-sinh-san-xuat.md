# Trang Phát sinh ở Sản xuất — đặc tả (bản 2)

Thay thế hoàn toàn bản 1. Bản 1 sai ở điểm trung tâm, xem mục 0.

---

## 0. Đính chính bản 1

Bản 1 cho rằng một đơn phát sinh là một dòng `projects` (sinh ra từ
`POST /production/projects/:id/phat-sinh`, nối về đơn gốc bằng `source_project_id`),
và tab được quyết định bởi cột Kanban nó đang đứng.

**Sai.** Khảo sát lại ngày 06/10/2026 theo đúng chỗ anh chỉ:

- Phát sinh là **một dòng `crm_assignments`** — tức là một việc trong **Không gian
  chung**, không phải một đơn sản xuất. Cột `crm_assignments.phat_sinh_kind` giữ
  slug của loại. **Đã có 10 dòng thật**, mang 3 loại: `glass_painted`,
  `glass_unpainted`, `tempered_glass`.
- Loại phát sinh khai ở bảng **`shared_workspace_phat_sinh_kinds`**, đúng trang
  `/management/shared-workspace-settings` anh nói. Trang đó đã gọi sẵn
  `/crm/phat-sinh-kinds` để xem, thêm, sửa, xoá.
- `crm_assignments` **đã là Kanban sẵn**: có `column_id` trỏ sang
  `crm_assignment_columns`, có `position`, `status`, `assignee_id`, `deadline`,
  `company_id`.

Nhánh `projects` + `is_phat_sinh` là một cơ chế **khác**, của pipeline Sản xuất, và
chưa ai dùng (0 đơn, 0 cột đánh dấu). Đừng trộn hai thứ vào nhau.

---

## 1. Còn thiếu đúng hai thứ

Bảng `shared_workspace_phat_sinh_kinds` hiện có:
`id, company_id, name, slug, sla_mode, sla_days, cutoff_time, is_active, sort_order`.

Thiếu đúng hai cột anh yêu cầu:

| Cột thêm | Kiểu | Ý nghĩa |
|---|---|---|
| `co_phi` | `boolean not null default false` | Phát sinh **có phí** hay **không phí**. Quyết định việc nằm ở tab nào. |
| `nguoi_phu_trach_id` | `uuid references users(id) on delete set null` | Người chịu trách nhiệm loại này **ở công ty đó**. |

Không cần thêm gì vào `crm_assignments`: nó đã có `phat_sinh_kind`, và `co_phi`
tra ngược từ loại. Một nguồn sự thật, không có chỗ cho hai số liệu lệch nhau.

### Ghi chú về phạm vi công ty

Ba loại đang có đều mang `company_id = NULL`, tức là dùng chung. Anh muốn "sinh
hoạt theo công ty" nên từ nay mỗi công ty khai loại riêng. Ba dòng cũ **giữ nguyên
làm mẫu dùng chung** — đừng xoá, có 10 việc đang trỏ vào chúng qua slug.

`phat_sinh_kind` là **chuỗi slug**, không phải khoá ngoại. Khi tra loại phải khớp
theo `slug` **và** `company_id` của việc, có dự phòng về dòng `company_id IS NULL`
khi công ty chưa khai riêng. Chỉ khớp slug là hai công ty cùng slug sẽ đè nhau.

---

## 2. Việc phải làm

### 2.1 Migration (thêm cột, không đụng dữ liệu)

```sql
ALTER TABLE public.shared_workspace_phat_sinh_kinds
  ADD COLUMN IF NOT EXISTS co_phi BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.shared_workspace_phat_sinh_kinds
  ADD COLUMN IF NOT EXISTS nguoi_phu_trach_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
```

Mặc định `false` nghĩa là mọi loại đang có vào tab **không phí** cho tới khi anh đánh
dấu lại. Đó là lựa chọn an toàn: không tự gán phí cho thứ chưa ai xác nhận là có phí.

### 2.2 Trang cài đặt `/management/shared-workspace-settings`

File `frontend/src/pages/SharedWorkspaceErrorTypesPage.jsx` (636 dòng) đã có sẵn khối
quản lý loại phát sinh. Thêm vào biểu mẫu của khối đó:

- Ô chọn **Có phí / Không phí**.
- Ô chọn **Người chịu trách nhiệm** (danh sách người dùng trang này đã nạp sẵn qua
  `api.get('/users')`).

Gửi kèm trong payload của `POST` và `PUT /crm/phat-sinh-kinds`. Backend nhận thêm
hai trường, có lọc giá trị, không nhận trường lạ.

### 2.3 Khi tạo phát sinh thì tự gán người

Tạo một việc phát sinh mà chưa chọn người thực hiện → lấy `nguoi_phu_trach_id` của
loại đó **trong công ty đang mở**. Đúng ý anh: mở công ty nào thì người được khai
cho công ty đó làm.

Người tạo vẫn đổi người khác được — tự gán là gợi ý, không phải khoá.

### 2.4 Trang mới `/sx/phat-sinh`

- Hai tab: **Không phí** và **Có phí**, lọc theo `co_phi` của loại.
- Mỗi tab là Kanban dựng từ `crm_assignment_columns` + `crm_assignments.column_id`,
  **dùng lại component Kanban của Không gian chung**, đừng viết cái thứ hai.
- Chỉ lấy việc có `phat_sinh_kind IS NOT NULL`, cắt theo công ty đang chọn.
- Kéo thẻ đổi cột: dùng lại đúng đường API Không gian chung đang dùng.
- Thẻ hiện: tiêu đề, loại phát sinh, người thực hiện, hạn, mức ưu tiên.
- Nút **Tạo phát sinh** mở đúng hộp thoại của Không gian chung, đặt sẵn loại theo
  tab đang mở.

---

## 3. Thứ tự làm

1. Migration 2.1.
2. Hai ô trong trang cài đặt (2.2) + backend nhận hai trường.
3. Anh vào khai: mỗi công ty, mỗi loại — có phí hay không, ai chịu trách nhiệm.
4. Tự gán người khi tạo (2.3).
5. Trang `/sx/phat-sinh` (2.4).

Bước 1–3 xong là dữ liệu đã đúng và dùng được ngay trong Không gian chung. Bước 5
chỉ là gom lại cho Sản xuất dễ nhìn.

---

## 4. Những chỗ dễ sai

- **Đừng trộn với `projects` + `is_phat_sinh`.** Hai cơ chế khác nhau.
- **Đừng tra loại chỉ bằng slug.** Phải kèm `company_id`, có dự phòng về `NULL`.
- **Đừng xoá ba loại cũ** — 10 việc đang trỏ vào.
- **Đừng thêm `co_phi` vào `crm_assignments`.** Tra từ loại ra.
- **Đừng gắn cứng tên người vào code.** Để trong `nguoi_phu_trach_id`.

---

## 5. Chưa rõ

Một việc phát sinh đang gắn `company_id` (công ty chủ) và `executor_company_id`
(công ty thực hiện). Khi anh nói "mở công ty đó thì người được setup đó thực hiện",
em hiểu là theo **công ty thực hiện**. Cần anh xác nhận trước khi làm bước 2.3 —
chọn nhầm cột thì việc sẽ giao sai người ở các đơn làm chéo công ty.
