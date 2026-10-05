# Bảng đóng gói extract (giữ UUID)

Thứ tự nạp: xem `LOAD_ORDER` trong [`backend/scripts/import-nextgo-instance.js`](../../../backend/scripts/import-nextgo-instance.js).

## Lọc

| Cách | Bảng |
|---|---|
| `company_id` / `default_company_id` = nguồn | CRM/SX config, customers, leads, projects, users, drive_roots, FB page, … |
| Tổ tiên `ecosystem_units` | Group + Khối KD/SX + subsidiary NextGo |
| Con theo FK | stages, tasks, comments, FB contacts/messages, drive files, user_roles |
| `entity_id` ∈ lead/project/task | `file_attachments` |
| User ngoài | assignee/created_by không thuộc NextGo → copy, `is_active=false` |

## Không mang

- Công ty tủ bếp, clone tenant `nextgo` cùng DB
- `internal_social_*`, audit, job, log API
- Knowledge toàn hệ (trừ `knowledge_categories` nếu gắn company)
- Thông báo cũ (không có trong spec)

## Lệnh

```bash
cd backend
node scripts/export-nextgo-instance.js --dry-run
node scripts/export-nextgo-instance.js
# Dump: backend/uploads/_nextgo_instance_export/ (gitignore)

# Khi đã có Supabase đích (chưa cắt webhook):
# set NEXTGO_SUPABASE_URL + NEXTGO_SUPABASE_SERVICE_ROLE_KEY
node scripts/import-nextgo-instance.js --dry-run
node scripts/import-nextgo-instance.js --apply
node scripts/copy-nextgo-storage.js --dry-run
```

Delta trước giờ cắt: `--since=ISO`.
