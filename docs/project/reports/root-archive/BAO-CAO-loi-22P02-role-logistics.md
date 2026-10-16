# Lỗi `22P02 invalid input value for enum user_role: "logistics"`

Ngày phân tích: 08/09/2026 — DB `qlycv` (`kdxypztstbeovyedmvem`)

## 1. Lỗi là gì

`users.role` là kiểu **enum `user_role`**, không phải text. PostgREST dịch
`.in('role', [...])` thành `WHERE role = ANY ($1)`. Nếu **một** phần tử trong
mảng không có trong enum, Postgres trả `22P02` và **huỷ cả câu query** — không
phải chỉ bỏ qua phần tử đó.

`'logistics'` là **module key** (`crm | production | logistics | projects | ...`),
**không phải role**. Role tương ứng trong enum là `logistics_admin`.

Đã kiểm chứng: enum `user_role` có 23 giá trị, **không có** `logistics`
(cũng không có `employee`, `viewer`). Bảng `users` cũng **không có ai** mang
role `logistics` → bỏ giá trị này đi không mất người nào.

## 2. Bằng chứng — câu SQL nguyên văn lấy từ log, không đoán

Trong 24 giờ gần nhất DB chỉ còn **4 lỗi**, cả 4 đều là `22P02`, thuộc đúng 2 dạng:

```sql
-- Dạng A (08:19:00, 08:18:59, 08:22:50)
SELECT users.id FROM users
WHERE users.role = ANY ($1) AND users.is_active = $2 AND users.company_id = $3
LIMIT $4 OFFSET $5

-- Dạng B (08:20:37)
SELECT users.id, full_name, email, role, avatar FROM users
WHERE users.role = ANY ($1) AND users.is_active = $2
ORDER BY users.full_name ASC LIMIT $3 OFFSET $4
```

Khớp chính xác 2 chỗ trong code:

| Dạng | File | Dòng |
|---|---|---|
| A | `backend/src/helpers/vcLogisticsNotify.js` | 13 + 124 (`VC_ROLE_BLAST`) |
| B | `backend/src/routes/workshopTeams.js` | 394 (`GET /workshop-teams/users`) |

## 3. Hậu quả thật (không phải chỉ "log đỏ")

Cả 2 chỗ đều viết `const { data } = await supabase...` — **không đọc `error`**.
Query hỏng → `data === undefined` → code trả `[]` và **chạy tiếp như không có gì**.

| Chỗ | Trước khi sửa | Sau khi sửa |
|---|---|---|
| `GET /workshop-teams/users` (danh sách người gán vào đội SX/lắp đặt) | luôn trả **0 người** — dropdown trống | **37 người** |
| Blast thông báo VC/Lắp đặt theo role | mất hết người nhận theo role, chỉ còn người trong cấu hình bàn giao + admin hệ thống | **6 người** đang hoạt động |

## 4. Đã sửa

- `helpers/vcLogisticsNotify.js` — bỏ `'logistics'` khỏi `VC_ROLE_BLAST`; thêm đọc `error` + `console.warn`.
- `routes/workshopTeams.js` — bỏ `'logistics'`; thêm đọc `error`, trả 500 thay vì `[]` im lặng.
- `src/test-permissions.js` — `.eq('role', 'employee')` → `'staff'`.
  (`employee` có trong bảng `roles` nhưng **không có** trong enum → cũng `22P02`.)

## 5. Chốt lại bằng test

`backend/tests/role-enum-guard.js` — `npm run test:role-enum`

Quét toàn bộ `backend/src`, tìm mọi chỗ lọc theo `users.role`
(`.in('role', [...])`, `.in('role', HẰNG_SỐ)`, `getCompanyScopedRoleUserIds(...)`,
`from('users').eq('role','...')`) và đối chiếu với enum. Hiện quét **20 chỗ**.

Đã chứng minh test bắt được lỗi: cố tình đặt lại `'logistics'` → test **THẤT BẠI**
đúng file, đúng giá trị; bỏ ra → **ĐẠT**.

## 6. Hai việc cần anh xác nhận

**a) Thư mục `C:\Projects\Quanlycongviec` đang CŨ hơn code đang chạy thật.**
`backend/src/middleware/permission.js` trong thư mục vẫn là bản hỏng
(`role_permissions.permission` — cột không tồn tại), bản này chắc chắn sinh lỗi
`42703` mỗi lần kiểm tra quyền. Nhưng 24h qua DB có **0 lỗi 42703**.
→ Server đang chạy bản mới hơn bản trong thư mục này.
**Nên `git pull` trước khi commit**, để không đè mất phần người khác đã sửa.
(Riêng 2 file gây lỗi ở trên thì giống hệt bản đang chạy — SQL trong log khớp
từng ký tự — nên vá vào là đúng.)

**b) Bảng `roles` và enum `user_role` đang lệch nhau.**

- Có trong `roles` nhưng **không có** trong enum: `employee` (9 quyền), `viewer` (7 quyền), `1` (0 quyền) → gán role này cho user sẽ lỗi `22P02`.
- Đang có user nhưng **không có hàng** trong `roles`: `staff` (37), `sales` (18), `production` (6), `installer` (6), `designer` (3), `driver` (1) → **71 user** (≈51 đang hoạt động) không có bản ghi phân quyền nào.

Cái (b) chưa gây lỗi trong log nhưng là quả bom hẹn giờ cho phân quyền. Cần quyết
định: đồng bộ `roles` theo enum, hay bỏ hẳn enum chuyển `users.role` sang text
có `CHECK` tham chiếu `roles`.

## 7. Áp patch

File: `0004-sua-loi-22P02-role-logistics-khong-co-trong-enum.patch`

```
git pull
git apply --ignore-whitespace 0004-sua-loi-22P02-role-logistics-khong-co-trong-enum.patch
cd backend && npm run test:role-enum
```

(Nếu anh commit thẳng từ thư mục này thì các file đã được sửa sẵn tại chỗ, patch
chỉ để dùng khi cần áp lên máy/nhánh khác.)
