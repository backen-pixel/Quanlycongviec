## 2026-10-06 — H1: gói tiếp nhận Facebook Page riêng từ main

Founder giao tiếp tục và giữ quyết định phát hành. Đã tách nhánh `codex/facebook-durable-inbox-20261006` từ main `1f879ea8`, triển khai signed durable inbox + SQL701, giữ worker paused. Không merge PR22/25 toàn khối; không sửa SQL700 của Claude. [Phạm vi, giới hạn, kiểm thử và phương án dừng](FACEBOOK_PAGE_INBOX_H1_20261006.md).

Mã mới chưa triển khai; nghiệp vụ tự tạo Lead/projection/attribution còn pending có chủ đích. Không dùng ACK/inbox làm Lead hợp lệ. Kết quả kiểm thử/review gói H1 đã ghi trong hồ sơ, không tự trở thành quyết định Founder cho phép cutover. Bật hệ thống thật HOLD do hợp đồng downstream và nghiệm thu target chưa hoàn tất. Mục lịch sử bên dưới giữ nguyên theo thời điểm ghi.

---
# 2026-10-01 — Chỉ mục quyết định Business AI OS V1.1

[Sổ Founder V1.1](FOUNDER_DECISIONS_ARCHITECTURE_V1_1_20261001.md) ghi nguồn/phạm vi phê duyệt; [ADR-0016…0020](../adr/README.md) ghi lựa chọn kiến trúc. Các quyết định lịch sử bên dưới được giữ nguyên. Không dùng một hướng dẫn cũ làm quyền vượt phạm vi công việc hiện tại; phần không mâu thuẫn vẫn là tài liệu tham chiếu cần đối chiếu mã.

---

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
# 2026-10-06 — Giao bước tiếp theo H1

Founder: “em làm bước tiếp theo nhé”, tiếp nối bước Facebook → Lead đúng công ty/người nhận Admin Vạn Phú Thành. Phạm vi triển khai: hợp đồng tiếp nhận Lead Ads và kiểm thử/review trong PR29; không tự mở gói C, AI gửi tin, ngân sách hoặc đồng thời bật hai writer. Lựa chọn kỹ thuật: binding rõ mặc định tắt, transaction SQL702, source receipt bất biến, hồ sơ cũ không rõ phải đối soát. Các lựa chọn này là thiết kế thực thi để review, không biến suy luận thành quyết định phát hành Founder. [Chi tiết](FACEBOOK_LEAD_ADS_INTAKE_20261006.md).

---
