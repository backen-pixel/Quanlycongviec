# Migration DB — quy trình

Mỗi DB (primary, backup) có bảng `public.schema_migrations` ghi lại file nào đã chạy, lúc nào, ai chạy, checksum nội dung. Công cụ: `backend/scripts/migrate.js` (chạy trong thư mục `backend/`).

## Thêm migration mới

1. Lấy **số lớn nhất hiện có + 1** (CI chặn số trùng): `ls database | sort -n | tail -3`
2. Tên: `<số>_<snake_case>.sql` — chữ thường, không dấu, không gạch ngang. Ví dụ `723_project_cost_index.sql`.
3. Có thể kèm `<số>_<cùng_tên>_rollback.sql` (không được chạy tự động, không tính là migration).
4. Viết SQL chạy lại được (`IF NOT EXISTS`, `CREATE OR REPLACE`…). Không tự ghi `BEGIN/COMMIT` trừ khi cần.
5. **Không sửa file đã chạy trên production** — thêm file mới. CI chỉ cảnh báo, `status` sẽ báo "đã sửa sau khi ghi sổ".

## Chạy

```bash
cd backend
npm run db:status                                   # file nào chưa chạy trên primary
npm run db:status -- --target backup
npm run db:apply -- 723                             # in kế hoạch, KHÔNG chạy
npm run db:apply -- 723 --target both --yes         # chạy trên primary rồi backup, ghi sổ
```

- Không có `--yes` thì chỉ in kế hoạch.
- File đã ghi sổ → bỏ qua. Nội dung khác bản đã ghi → từ chối (`--force` để chạy lại và cập nhật sổ).
- Kết nối: mặc định Management API (`SUPABASE_ACCESS_TOKEN` + `PRIMARY_PROJECT_REF` / `BACKUP_PROJECT_REF`); `--via pg` để dùng URL Postgres trong `backend/.env`.
- SQL lỗi thì không ghi sổ.

## Bắt đầu dùng (một lần cho mỗi DB)

Lịch sử cũ không có sổ, nên đánh dấu các file cũ là "baseline" (KHÔNG chạy lại SQL):

```bash
npm run db:baseline -- --upto 721 --target both          # xem sẽ ghi bao nhiêu dòng
npm run db:baseline -- --upto 721 --target both --yes
npm run db:apply -- 722 --target both --yes              # ghi chính file tạo sổ
```

Chọn `--upto` = số migration cuối cùng **chắc chắn** đã chạy trên DB đó. Baseline không chứng minh file đã chạy thật — nó chỉ là điểm xuất phát; các file sau mốc này sẽ được theo dõi chính xác.

## Ghi chú

- 734 file cũ có ~66 số bị trùng (trước khi có kiểm tra); `apply <số>` sẽ yêu cầu ghi rõ tên file khi số trùng.
- File không đánh số (`fix_*.sql`, `diagnose_*.sql`, `audit/`, `repairs/`) là script tay, không thuộc chuỗi migration.
- `backend/supabase/*.sql` (01–32) là bộ migration đời đầu, nằm ngoài chuỗi này và không được `migrate.js` theo dõi.
- Các script `backend/scripts/apply-migration-NNN.js` cũ vẫn chạy được nhưng không ghi sổ — dùng `migrate.js` cho file mới.
