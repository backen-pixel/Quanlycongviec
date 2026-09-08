# Trung tâm bàn giao công việc giữa các AI

Thư mục này là nơi Cursor, Claude và các AI khác đọc để nắm nhanh công việc đã làm,
quyết định đã thống nhất, kết quả kiểm thử và phần còn lại.

## Thứ tự đọc

1. [`CURRENT.md`](./CURRENT.md) — trạng thái hiện tại và việc đang làm.
2. [`WORKLOG.md`](./WORKLOG.md) — lịch sử thay đổi theo phiên.
3. [`DECISIONS.md`](./DECISIONS.md) — các quyết định không nên tự ý đảo ngược.
4. Code, migration và tài liệu chuẩn được liên kết trong từng mục.

## Quy tắc cập nhật

- Mỗi phiên thay đổi code phải cập nhật `CURRENT.md` và thêm một mục vào `WORKLOG.md`.
- Ghi sự thật đã kiểm chứng; phân biệt rõ `Đã làm`, `Đã kiểm thử`, `Chưa làm`.
- Ghi đường dẫn file, migration, lệnh kiểm thử và lỗi còn tồn tại.
- Không ghi token, mật khẩu, nội dung `.env` hoặc dữ liệu production nhạy cảm.
- Không dùng tài liệu này thay cho code hoặc migration. Nếu nội dung mâu thuẫn, code và
  migration trên GitHub là nguồn chuẩn.
- Khi một quyết định kỹ thuật thay đổi, cập nhật `DECISIONS.md`; quyết định kiến trúc lớn
  vẫn phải có ADR trong `docs/adr/`.

## Mẫu ghi phiên

```md
## YYYY-MM-DD HH:mm — Tên công việc
- AI thực hiện:
- Yêu cầu:
- Đã làm:
- File thay đổi:
- Kiểm thử:
- Chưa làm/rủi ro:
- Bước tiếp theo:
```
