# Workflow: Claude Team ↔ GitHub ↔ Cursor

**Trạng thái:** READY (khung docs đã chuẩn hóa)

## Vai trò

| Hệ thống | Trách nhiệm |
|---|---|
| **Claude Team** | Kiến trúc, BA, chia task, acceptance criteria, rà soát nghiệp vụ |
| **GitHub** | Nguồn chuẩn: docs, Issues, code, PR, quyết định |
| **Cursor** | Thực hiện Issue đã duyệt: nhánh → code → migration → test → PR |
| **Anh / Tech Lead** | Duyệt phạm vi, migration, bảo mật, merge, staging → production |

## Nguyên tắc

1. GitHub là nguồn sự thật duy nhất.
2. Đối chiếu schema + migration + API + UI trước khi đề xuất đổi.
3. Không giao Cursor sửa code khi chưa có đặc tả (phạm vi + AC).
4. Không sửa trực tiếp `main` / production.
5. Mọi đổi DB = migration mới + kiểm tra dữ liệu cũ + rollback note.
6. Backend = nguồn business rules; frontend không tự suy diễn trạng thái.
7. Chỉ **DONE** khi có PR, test PASS, migration review, smoke staging.

## Đặc tả giao Cursor (bắt buộc)

Mỗi Issue phải gồm:

- Mục tiêu nghiệp vụ
- Phạm vi được sửa / không được sửa
- API contract
- DB / migration (nếu có)
- Quyền truy cập & phân tách công ty
- Acceptance criteria
- Test bắt buộc
- Bằng chứng hoàn thành

## Luồng một nhiệm vụ

1. Claude đọc BA / schema / API hiện hành (`docs/`)
2. Claude tạo đặc tả → trạng thái **DRAFT**
3. Tech Lead duyệt → **READY** → GitHub Issue
4. Cursor: `feature/<ISSUE-id>-slug`
5. Cursor: code + migration + test + PR gắn Issue
6. Claude rà PR theo AC / kiến trúc
7. Lead merge staging → smoke → **DONE**

## Trạng thái trả lời

Dùng một trong: `DRAFT` | `READY` | `IN PROGRESS` | `BLOCKED` | `DONE`.

## Docs map

Xem [`../README.md`](../README.md).
