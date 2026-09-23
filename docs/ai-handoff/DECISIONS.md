# Quyết định dùng chung giữa Cursor, Claude và các AI

## AI-010 — Cột lớn / cột nhỏ VC/LĐ giống SX

- `group_key` trên `logistics_pipeline_stages` = cột lớn (giai đoạn nối tiếp); cột nhỏ cùng key chạy song song.
- NULL = cột đứng riêng — công ty chưa setup vẫn Kanban phẳng.
- Không hardcode tên cột; không seed group_key. User tự gán ở `/vc/pipeline-settings` tab Cột chính.
- Dashboard Gộp cột dùng chung `gopPipeline` với SX. Stepper chi tiết bật `nhomSongSong` khi có group_key.

## AI-009 — KPI Dashboard VC/LĐ map theo cột pipeline

- Ô Đang VC / Đang LĐ / BH / Hoàn thành đếm theo cột Kanban, không theo `projects.status`.
- Mỗi công ty tự gán cột → ô bằng nút tích `dashboard_kpi` trên `/vc/pipeline-settings`.
- Chưa tick: suy từ cột LĐ / bảo hành / hoàn thành / còn lại = đang VC.
- `clears_deadline` tắt quá hạn trên cột; không xóa ngày lắp (lịch sử).

## AI-008 — KPI Dashboard SX map theo cột pipeline

- Ô Đang SX / Chờ VC / Đã VC đếm theo cột Kanban, không theo `logistics_company_id`.
- Mỗi công ty tự gán cột → ô bằng nút tích `dashboard_kpi` trên `/sx/pipeline-settings`.
- Chưa tick: suy từ cờ bàn giao VC / tên «đã giao» / cột SX còn lại.
- Không hardcode tên cột; tick trên cột thắng heuristic.

## AI-001 — Nguồn chuẩn và cách bàn giao

- Code, migration và tài liệu canonical trong `docs/` là nguồn chuẩn.
- `CURRENT.md` mô tả trạng thái làm việc, không thay thế code.
- Mọi AI phải đọc `CURRENT.md` trước khi tiếp tục một công việc đang dở.
- Sau khi sửa code, AI phải ghi file đã đổi, kiểm thử đã chạy và phần chưa xác minh.

## AI-002 — Chính sách deadline theo module

- Deadline phải được giải quyết qua policy chung, không thêm chuỗi `COALESCE` hoặc thứ tự ưu
  tiên riêng rải rác trong route/component mới.
- Thứ tự hạn đang đếm theo module:
  - CRM: hạn CRM vẫn hiện và vẫn gom cột Deadline sau khi đã lập SX (`project_id`).
    Không ẩn hạn vì thiếu SĐT. Chỉ tắt khi user tắt hạn (`deadline_disabled_at`) hoặc
    cột Thắng/Thua/Hoàn thành doanh thu.
  - SX: hạn SX cho đến khi giao hàng / bàn giao VC / cột Đã giao → chuyển hạn lắp.
  - Lắp xong (cột VC Hoàn thành / `status=completed`) → không còn hạn nào.
- Ngày giao/lắp giữ làm lịch sử; không xóa khi hết hạn hiệu lực.
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

## AI-007 — Role quản trị hệ sinh thái

- `ecosystem_admin`: quản trị toàn HST (mọi công ty trong tenant). TenantGate
  vẫn bắt buộc. Không gán `platform_admin` cho admin HST.
- `platform_admin`: SaaS toàn nền tảng, bỏ tenant — chỉ vận hành nền tảng.
- `admin` + `company_id`: admin một công ty. `admin` không `company_id`:
  legacy tương đương HST, ưu tiên chuyển sang `ecosystem_admin`.

## AI-004 — Ranh giới file khi hai AI chạy song song

- Vùng «chính sách deadline» thuộc Cursor; vùng «trang tổng quan nhiệm vụ» thuộc Claude.
  Danh sách file cụ thể: [`HANDOFF-2026-09-08-phan-cong.md`](./HANDOFF-2026-09-08-phan-cong.md) mục 0.
- `routes/management.js` và `routes/logistics.js` là vùng dùng chung: ghi `WORKLOG.md`
  nêu rõ hàm/khối sắp sửa TRƯỚC khi sửa. Không sửa cùng lúc.
- Mỗi luồng việc commit riêng một commit; không gộp hai luồng vào một commit.
- Phản biện lẫn nhau phải kèm số đo và câu lệnh đã chạy; lập luận không có số đo
  không đủ để đảo một kết luận đã có số.
