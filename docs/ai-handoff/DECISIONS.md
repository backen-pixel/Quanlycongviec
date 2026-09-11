# Quyết định dùng chung giữa Cursor, Claude và các AI

## AI-001 — Nguồn chuẩn và cách bàn giao

- Code, migration và tài liệu canonical trong `docs/` là nguồn chuẩn.
- `CURRENT.md` mô tả trạng thái làm việc, không thay thế code.
- Mọi AI phải đọc `CURRENT.md` trước khi tiếp tục một công việc đang dở.
- Sau khi sửa code, AI phải ghi file đã đổi, kiểm thử đã chạy và phần chưa xác minh.

## AI-002 — Chính sách deadline theo module

- Deadline phải được giải quyết qua policy chung, không thêm chuỗi `COALESCE` hoặc thứ tự ưu
  tiên riêng rải rác trong route/component mới.
- Hoàn thành CRM chỉ ảnh hưởng CRM; hoàn thành SX chỉ ảnh hưởng SX.
- Hoàn thành VC thông thường chỉ ảnh hưởng VC; bước hoàn thành dự án cuối mới dọn deadline
  toàn dự án.
- API bổ sung trường dẫn xuất nhưng giữ các trường cũ để tương thích giao diện.
- Không thêm cột DB chỉ để lưu `effective_deadline_*`; đây là dữ liệu dẫn xuất.

## AI-003 — An toàn migration

- Không sửa migration đã chạy; tạo migration số mới nếu cần điều chỉnh sau phát hành.
- Migration 596 phải được xác nhận trên môi trường thử nghiệm trước khi chạy production.
- Không deploy production nếu người dùng chưa yêu cầu rõ ràng.

## AI-005 — Sửa/xóa phân công Không gian chung

- Người tạo được sửa cấu trúc và xóa việc của mình.
- Người được giao chỉ đổi trạng thái / cột.
- Admin hệ thống (`admin` không `company_id`) được sửa/xóa việc người khác tạo.
- Admin/sales_admin gắn công ty chỉ trên việc cùng `company_id` hoặc `executor_company_id`.

## AI-006 — Tách NextGo instance

- Chuẩn bị dump/script được phép; **không cắt** (freeze, webhook, ẩn UI) cho đến khi người dùng ra lệnh.
- Nguồn UUID: `87479a83-1145-43b7-b090-3e40812cb5a9`. Không dùng clone cùng DB.
- Import đích chỉ qua `NEXTGO_SUPABASE_*` khác URL nguồn.

## AI-004 — Ranh giới file khi hai AI chạy song song

- Vùng «chính sách deadline» thuộc Cursor; vùng «trang tổng quan nhiệm vụ» thuộc Claude.
  Danh sách file cụ thể: [`HANDOFF-2026-09-08-phan-cong.md`](./HANDOFF-2026-09-08-phan-cong.md) mục 0.
- `routes/management.js` và `routes/logistics.js` là vùng dùng chung: ghi `WORKLOG.md`
  nêu rõ hàm/khối sắp sửa TRƯỚC khi sửa. Không sửa cùng lúc.
- Mỗi luồng việc commit riêng một commit; không gộp hai luồng vào một commit.
- Phản biện lẫn nhau phải kèm số đo và câu lệnh đã chạy; lập luận không có số đo
  không đủ để đảo một kết luận đã có số.
