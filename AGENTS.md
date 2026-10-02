# AGENTS.md — hướng dẫn agent (Claude / Codex / Cursor)

Repo: **Quanlycongviec** (CRM–ERP tủ bếp). UI text tiếng Việt.

## Nguồn chuẩn

1. Code + SQL migration trên GitHub
2. Tài liệu trong [`docs/README.md`](./docs/README.md)
3. Bản rút gọn vận hành agent: [`CLAUDE.md`](./CLAUDE.md)

## Map docs (đọc trước khi đổi lớn)

| Cần biết | Đọc |
|---|---|
| Kiến trúc đích V1.1 và hiện trạng | `docs/architecture/README.md` |
| Quyết định | `docs/adr/` |
| Nghiệp vụ / guide | `docs/ba/` |
| API | `docs/api/API_DOCUMENT.md` |
| Schema | `docs/database/DATABASE_SCHEMA.md` |
| Migration | `/database/*.sql` (root) |
| Coding | `docs/project/CODING_STANDARD.md` |
| Workflow giao việc | `docs/project/workflow-claude-cursor-github.md` |
| Bàn giao AI hiện tại | `docs/ai-handoff/CURRENT.md` |

## Quy tắc làm việc

- Chỉ làm đúng Issue / phạm vi được giao.
- Không sửa `main` trực tiếp; không deploy production.
- Không sửa migration SQL đã chạy — chỉ thêm file số mới.
- Không dùng / commit secret production (`.env`, token).
- Domain của module backend chủ sở hữu canonical Business Rules; Application Service điều phối kiểm soát, Infrastructure ghi dữ liệu. Agent chỉ gọi Tool Contract được phép.
- Trước khi báo DONE: có PR (hoặc diff rõ), liệt kê file đổi, nêu cách test / rollback.
- Trước khi tiếp tục công việc cũ: đọc `docs/ai-handoff/CURRENT.md` và `DECISIONS.md`.
- Sau mỗi phiên sửa code: cập nhật `docs/ai-handoff/CURRENT.md` và thêm mục vào `WORKLOG.md`.

## Đọc chung khi triển khai Business AI OS V1.1

- Đọc [mục lục kiến trúc](docs/architecture/README.md), sau đó CURRENT, quyết định liên quan và nguồn mã tại đúng SHA.
- [Sổ Founder](docs/ai-handoff/FOUNDER_DECISIONS_ARCHITECTURE_V1_1_20261001.md) ghi phạm vi đã duyệt; chuẩn đích/ADR không chứng minh đã triển khai hoặc tự cấp quyền runtime.
- Giữ CRM cho việc trước bán và Work Unified cho việc sau bán; không gom mọi crm_tasks chỉ theo tên bảng.
- Thay mã và hồ sơ liên quan trong cùng PR. Chưa phân loại rủi ro không mặc định thấp; reviewer dùng phiên riêng và đọc đầy đủ yêu cầu đã chốt.
- Hướng dẫn/brief/ECC không thay quyền công cụ. Không tự mở chặng lớn, DB thật, merge/deploy hoặc cài ECC vào CI từ việc đọc tài liệu.

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
