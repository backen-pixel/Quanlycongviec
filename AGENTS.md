# AGENTS.md — hướng dẫn agent (Claude / Cursor)

Repo: **Quanlycongviec** (CRM–ERP tủ bếp). UI text tiếng Việt.

## Nguồn chuẩn

1. Code + SQL migration trên GitHub
2. Tài liệu trong [`docs/README.md`](./docs/README.md)
3. Bản rút gọn vận hành agent: [`CLAUDE.md`](./CLAUDE.md)

## Map docs (đọc trước khi đổi lớn)

| Cần biết | Đọc |
|---|---|
| Kiến trúc | `docs/architecture/` |
| Quyết định | `docs/adr/` |
| Nghiệp vụ / guide | `docs/ba/` |
| API | `docs/api/API_DOCUMENT.md` |
| Schema | `docs/database/DATABASE_SCHEMA.md` |
| Migration | `/database/*.sql` (root) |
| Coding | `docs/project/CODING_STANDARD.md` |
| Workflow giao việc | `docs/project/workflow-claude-cursor-github.md` |

## Quy tắc làm việc

- Chỉ làm đúng Issue / phạm vi được giao.
- Không sửa `main` trực tiếp; không deploy production.
- Không sửa migration SQL đã chạy — chỉ thêm file số mới.
- Không dùng / commit secret production (`.env`, token).
- Backend là nguồn business rules.
- Trước khi báo DONE: có PR (hoặc diff rõ), liệt kê file đổi, nêu cách test / rollback.

## Lệnh dev

```bash
cd backend && npm run dev    # :4000
cd frontend && npm run dev   # :5173
```

## Regenerate docs máy sinh

```bash
node docs/api/generate-api-doc.js
node docs/database/generate-db-schema-doc.js docs/_tmp_columns.json
node docs/project/generate-coding-standard-doc.js
```
