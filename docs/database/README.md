# Database

| File | Mô tả |
|---|---|
| [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) | Toàn bộ bảng/cột public schema |
| [generate-db-schema-doc.js](./generate-db-schema-doc.js) | Script sinh schema doc |

Migration SQL (nguồn chuẩn thay đổi schema):

- Thư mục repo: `/database/*.sql` (đánh số tăng dần)
- Không sửa migration đã chạy trên production — chỉ thêm file mới
- Mọi thay đổi DB phải có migration + kiểm tra dữ liệu cũ + rollback note trong PR

```bash
node docs/database/generate-db-schema-doc.js docs/_tmp_columns.json
```

Quan hệ nghiệp vụ bổ sung: [`../architecture/cau-truc-he-thong-co-ban/`](../architecture/cau-truc-he-thong-co-ban/).
