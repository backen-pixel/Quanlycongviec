# 2026-10-05 — Founder xác nhận Render workspace cho kiểm tra chỉ đọc

Quyết định `RENDER-WORKSPACE-READONLY-CONFIRMED-20261005`. Founder phản hồi “đã xác nhận” về câu hỏi chọn My Workspace đã gửi trong task hiện tại. Dùng `tea-d47g0824d50c73856e80` của My Workspace cho các lời gọi chỉ đọc Render; không hỏi lại cùng lựa chọn. Công cụ get_selected_workspace chỉ phản ánh fallback, không phản ánh workspaceId theo từng request.

Phạm vi: đối chiếu service/deployment và bằng chứng cấu hình phục vụ hồ sơ nghiệm thu. Không là phê duyệt deploy/restart, sửa environment/DB/quyền, merge main hoặc mở ngân sách. [Kết quả đọc](vpt-marketing-automation/RENDER_READONLY_20261005.md) ghi phiên bản live, main mới và giới hạn Primary-only còn cần xử lý.

---

# 2026-10-05 — Thứ tự sửa kiểm soát Agent, giữ nguyên kiến trúc đích

Quyết định `AGENT-GUARDRAILS-ORDER-20261005`. Founder xác nhận: “Thứ tự nên sửa: khóa quyền công cụ → chặn điều kiện chưa rõ/chưa duyệt → bắt buộc bằng chứng số liệu → sửa ngữ cảnh và bộ nhớ. Kiến trúc đích vẫn giữ nguyên.”

Cho phép thực hiện bản sửa và kiểm chứng theo thứ tự audit. Không diễn giải thành phê duyệt DB thật, cấp quyền runtime, phát hành hay một kiến trúc mới. [Hồ sơ thực hiện và giới hạn](agent-guardrails-20261005/README.md). Giữ nguyên các quyết định ngân sách, nội dung, người nhận và nguồn lịch đã ghi dưới đây.

---

# 2026-10-05 — Nguồn lịch khảo sát là CRM

Quyết định `VPT-SURVEY-CALENDAR-CRM-20261005`. Khi được hỏi nơi Admin Vạn Phú Thành quản lý lịch khảo sát, Founder trả lời **“crm”** trong task `01a0f6c3-9ed2-73c1-823e-0ad927431877`.

Dùng lịch CRM hiện có làm nguồn lịch khảo sát. Trạng thái: `SOURCE_LOCATION_CONFIRMED_PENDING_ROSTER_VERIFICATION`. Bước cấu hình tiếp theo là đối chiếu người đi khảo sát, giờ trống, vùng phục vụ và các lịch bận trong CRM qua dịch vụ lịch hiện có; chọn giờ còn trống, gửi đề xuất và chờ khách xác nhận theo luồng đã thiết kế.

Câu trả lời xác định nơi quản lý lịch, chưa xác nhận toàn bộ lịch bận đã nằm trong CRM; không tự công bố `CRM_COMPLETE`/`ALL_BUSY_IN_CRM` hoặc tạo roster/đặt lịch thật. Người thực hiện khảo sát và người thay thế vẫn cần xác định. Xem [hợp đồng nguồn lịch](vpt-marketing-automation/SURVEY_AVAILABILITY.md) và [luồng đề xuất/xác nhận](vpt-marketing-automation/CARE_SURVEY_RUNTIME.md). Không cần hỏi lại nơi quản lý lịch.

---

# 2026-10-05 — Admin Vạn Phú Thành là đầu mối nhận khách

Quyết định `VPT-LEAD-RECIPIENT-FOUNDER-SELECTION-20261005`. Founder xác nhận trong task `01a0f6c3-9ed2-73c1-823e-0ad927431877`: **“người nhận khách là admin vạn phú thành”**.

Đầu mối nhận khách VPT được chọn là **Admin Vạn Phú Thành**; phân vùng và phạm vi tiếp nhận giữ theo kế hoạch hiện hành. Trạng thái: `FOUNDER_SELECTED_PENDING_ACCOUNT_MAPPING`. Khi cấu hình, phải đối chiếu đúng tài khoản thuộc công ty VPT và quyền nhận khách hiện hành; không chọn bất kỳ tài khoản có nhãn admin hoặc admin toàn hệ thống, không tự tạo UUID hoặc cấp thêm quyền. Không yêu cầu Founder chọn lại đầu mối đã xác nhận; nếu nhiều tài khoản thực cùng khớp, chỉ làm rõ tài khoản cụ thể.

Quyết định này chỉ xác định đầu mối tiếp nhận. Chưa chỉ định người trực tiếp khảo sát, người thay thế hoặc lịch trống; nguồn lịch CRM được xác nhận riêng trong quyết định cùng ngày ở trên. Chưa thay đổi routing/DB đang chạy. Các phần cấu hình và nghiệm thu còn lại ghi trong [hồ sơ nghiệm thu](vpt-marketing-automation/RELEASE_READINESS.md). Bộ 18 câu V1 đã được duyệt theo quyết định ngày 04/10, giữ nguyên.

---

# 2026-10-04 — Founder duyệt nguyên văn bộ 18 câu tư vấn VPT V1

Quyết định `VPT-CARE-CONTENT-V1-FOUNDER-WORDING-APPROVAL`. Founder xác nhận trong task `01a0f6c3-9ed2-73c1-823e-0ad927431877`: **“anh duyệt bộ 18 câu hỏi”**.

Phạm vi: nguyên văn Q01–Q15 và A01–A03 của `VPT_CARE_CONTENT_DRAFT_V1` tại commit `ee641db9dbdee2a97b65618e8b9f3200487302e5`, file [VPT_CARE_CONTENT_DRAFT.json](vpt-marketing-automation/VPT_CARE_CONTENT_DRAFT.json). Giữ nguyên câu chữ, điều kiện dùng và giới hạn đã trình. [Bản đọc](vpt-marketing-automation/VPT_CARE_CONTENT_DRAFT.md) và JSON đã ghi `FOUNDER_WORDING_APPROVED_PENDING_OPERATIONAL_BINDINGS`.

Đây là duyệt câu chữ theo yêu cầu đã trình; không phải lệnh APPROVE runtime, cấp quyền publisher/Agent, xác nhận mọi dữ liệu website hoặc mở gửi/phát hành. Các bindings công ty/vùng/sản phẩm, hạn hiệu lực, chính sách/phạm vi khảo sát, người nhận/lịch và cấu hình AI còn phải khép. `sendAllowed=false`, `importReady=false`; 18 ca chất lượng vẫn NOT_RUN. Khi đưa đúng bộ vào thư viện theo gói được phép, tham chiếu quyết định này, không hỏi lại Founder duyệt cùng câu chữ. Thay câu chữ sau duyệt cần phiên bản và quyết định mới.

---

# 2026-10-02 — VPT Marketing–Sales execution mandate

Founder explicitly requested implementation of [the approved plan](../architecture/VPT_MARKETING_SALES_AUTOMATION_V1.md).100m VND is a single30-day trial, not recurring monthly.Later in the same task Founder chose interim250,000 VND per qualified paid Lead;300 at target implies75m, while100m remains a one-time cap. Finance integration is deferred and must not block Lead-only preparation.7% remains a later revenue evaluation, not achieved by cheap Leads. AI advises/books surveys; humans final quote/close. See implementation README for unfinished release gates. Historic decisions below remain unchanged.

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
