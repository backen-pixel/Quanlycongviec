# Tài liệu hệ thống — Quanlycongviec (Tủ Bếp Pro)

GitHub repository là **nguồn chuẩn**. Claude / Cursor đọc theo map bên dưới; không kết luận từ ký ức nếu chưa đối chiếu file hiện hành.

## Cấu trúc chuẩn

| Thư mục | Nội dung |
|---|---|
| [`architecture/`](./architecture/) | Kiến trúc tổng thể, sơ đồ hệ thống, quan hệ module |
| [`adr/`](./adr/) | Architecture Decision Records (quyết định kỹ thuật) |
| [`ba/`](./ba/) | Nghiệp vụ, hướng dẫn vận hành, guide có ảnh |
| [`api/`](./api/) | Inventory HTTP API + Postman; OpenAPI stub |
| [`database/`](./database/) | Schema đầy đủ bảng/cột; liên kết migration SQL |
| [`ui/`](./ui/) | UI / cài đặt giao diện |
| [`project/`](./project/) | Coding standard, kế hoạch module, báo cáo, workflow |
| [`ops/`](./ops/) | Triển khai server, call/Coturn, vận hành hạ tầng |

Migration SQL thật nằm ở `/database/*.sql` (root repo) — không nhân bản vào `docs/`.

## Điểm vào nhanh

1. Tổng quan kiến trúc → [`architecture/kien-truc-tong-the.html`](./architecture/kien-truc-tong-the.html)
2. Schema DB → [`database/DATABASE_SCHEMA.md`](./database/DATABASE_SCHEMA.md)
3. API → [`api/API_DOCUMENT.md`](./api/API_DOCUMENT.md)
4. Coding / inventory → [`project/CODING_STANDARD.md`](./project/CODING_STANDARD.md)
5. Workflow Claude ↔ Cursor ↔ GitHub → [`project/workflow-claude-cursor-github.md`](./project/workflow-claude-cursor-github.md)

## Regenerate tài liệu máy sinh

```bash
node docs/api/generate-api-doc.js
node docs/database/generate-db-schema-doc.js docs/_tmp_columns.json
node docs/project/generate-coding-standard-doc.js
```

## Gắn Claude Project (Context)

Ưu tiên sync các path:

- `docs/architecture/`
- `docs/adr/`
- `docs/ba/`
- `docs/api/`
- `docs/database/`
- `docs/ui/`
- `docs/project/`
- `database/` (migrations SQL)
- `README.md`
- `AGENTS.md`
- `CLAUDE.md`
