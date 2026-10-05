# Chặng 0 — đối chiếu kiến trúc V1.1 với nguồn

Ngày: 01/10/2026. Loại kiểm tra: tài liệu, cây Git và mã nguồn tĩnh. **Không kiểm DB/config/runtime thật; không chạy ứng dụng.**

Baseline main: 0db11ce1adb0fb89fc87529036e495a62d58fce7. Git tree: f9d33069dc9058be4cf312f4013f477915ef6954. Cây trả đủ 4.471 mục, không truncated. Đã lấy 31 bản tệp nguồn có phiên bản và đối chiếu Git blob SHA của bản cục bộ: 31/31 khớp. Các đoạn mã liên quan được đọc để xác minh khẳng định dưới đây; đây không phải audit toàn bộ 4.471 mục hoặc toàn bộ sản phẩm.

## 1. Phát hiện ảnh hưởng trực tiếp V1.1

| Mã | Điều xác minh được | Nguồn cố định | Hệ quả |
|---|---|---|---|
| E-01 | Repo hiện dùng Express ^5.2.1 và React ^19.1.0 trong manifest; CLAUDE.md cũ mô tả React 18 | [backend package](https://github.com/backen-pixel/Quanlycongviec/blob/0db11ce1adb0fb89fc87529036e495a62d58fce7/backend/package.json), [frontend package](https://github.com/backen-pixel/Quanlycongviec/blob/0db11ce1adb0fb89fc87529036e495a62d58fce7/frontend/package.json) | Giữ stack hiện có, sửa mô tả manifest; không khẳng định bản deployed theo package. |
| E-02 | unified_tasks_v ghép tasks, crm_tasks, crm_assignments; phân nhánh primary lead | [migration 594](https://github.com/backen-pixel/Quanlycongviec/blob/0db11ce1adb0fb89fc87529036e495a62d58fce7/database/594_unified_tasks_v_primary_lead_branch_split.sql), [gateway workTasks](https://github.com/backen-pixel/Quanlycongviec/blob/0db11ce1adb0fb89fc87529036e495a62d58fce7/backend/src/routes/workTasks.js) | View tổng hợp không chứng minh đã có engine Work Unified sở hữu mọi việc. |
| E-03 | projectOrderFulfillment đọc/sửa crm_tasks sx_ và production_pipeline_stage_id | [helper](https://github.com/backen-pixel/Quanlycongviec/blob/0db11ce1adb0fb89fc87529036e495a62d58fce7/backend/src/helpers/projectOrderFulfillment.js#L136) | Phân loại theo nghiệp vụ; không coi mọi crm_tasks là việc trước bán. |
| E-04 | Đã có quotations, quotation_items, orders và endpoint convert-to-order | [commercialDocs](https://github.com/backen-pixel/Quanlycongviec/blob/0db11ce1adb0fb89fc87529036e495a62d58fce7/backend/src/routes/crm/routes/commercialDocs.js#L825) | Bổ sung version/acceptance và sửa đường ghi hiện có; không xây Order thứ hai. Chưa chứng minh mọi invariant mới đã được enforce. |
| E-05 | Helper tạo một hoặc nhiều Project, có mode additional và trả partial result | [autoDealWonProject](https://github.com/backen-pixel/Quanlycongviec/blob/0db11ce1adb0fb89fc87529036e495a62d58fce7/backend/src/helpers/autoDealWonProject.js#L713) | Khóa chống trùng phải theo đơn vị thực hiện; giữ đa xưởng/đa đợt. Không giới hạn một Order chỉ một Project. |
| E-06 | Bộ duyệt đồ thị chỉ bỏ cạnh FAIL; UNKNOWN vẫn được lần theo; wait/approve thuộc nhóm đi xuyên qua | [flowRuntime](https://github.com/backen-pixel/Quanlycongviec/blob/0db11ce1adb0fb89fc87529036e495a62d58fce7/backend/src/helpers/flowRuntime.js#L26), [duyệt cạnh](https://github.com/backen-pixel/Quanlycongviec/blob/0db11ce1adb0fb89fc87529036e495a62d58fce7/backend/src/helpers/flowRuntime.js#L426) | Không coi flowRuntime hiện tại là durable approval engine. Chưa kết luận mọi lệnh runtime bị bypass vì còn các lớp kiểm tra khác. |
| E-07 | Auto failover và auto failback có công tắc riêng; config so sánh với '1'; router có thể đổi active client | [config](https://github.com/backen-pixel/Quanlycongviec/blob/0db11ce1adb0fb89fc87529036e495a62d58fce7/backend/src/config/index.js#L79), [router](https://github.com/backen-pixel/Quanlycongviec/blob/0db11ce1adb0fb89fc87529036e495a62d58fce7/backend/src/config/supabaseRouter.js) | Code không chứng minh cờ live đang bật. Kiểm thực tế trước sửa và diễn tập single-writer. |
| E-08 | attachTenantContext đặt enforced=false với platform/system hoặc user thiếu tenant; requireTenant có thể từ chối riêng | [tenantGate](https://github.com/backen-pixel/Quanlycongviec/blob/0db11ce1adb0fb89fc87529036e495a62d58fce7/backend/src/middleware/tenantGate.js) | Phải kiểm chuỗi middleware từng route và role; không kết luận tenant isolation đã đầy đủ hoặc mọi route đều hở. |
| E-09 | Migration 592 thu quyền RPC khỏi anon/authenticated và cấp service_role; ghi rõ service_role bypass RLS | [migration 592](https://github.com/backen-pixel/Quanlycongviec/blob/0db11ce1adb0fb89fc87529036e495a62d58fce7/database/592_security_revoke_anon_rpc_and_fix_rls_mismatch.sql) | RLS bật không đủ chứng minh backend được bảo vệ. Migration trong repo không chứng minh đã áp dụng. |
| E-10 | Gateway resolveMcpActAsUser lấy x-user-id/default_assigned_to và kiểm user | [MCP gateway](https://github.com/backen-pixel/Quanlycongviec/blob/0db11ce1adb0fb89fc87529036e495a62d58fce7/backend/src/helpers/mcpGateway.js#L210), [route](https://github.com/backen-pixel/Quanlycongviec/blob/0db11ce1adb0fb89fc87529036e495a62d58fce7/backend/src/routes/mcp.js) | Workload identity + delegation vẫn là chuyển đổi phải kiểm chứng; không suy Agent hiện đã có danh tính mục tiêu. |
| E-11 | Có 686 tệp SQL trực tiếp dưới database/, 54 tiền tố số xuất hiện trên nhiều tệp | [cây database](https://github.com/backen-pixel/Quanlycongviec/tree/0db11ce1adb0fb89fc87529036e495a62d58fce7/database) | Inventory tên đầy đủ + checksum. Ví dụ 639/640/641 đều có nhiều tệp. Không dùng số migration lớn nhất làm trạng thái applied. |
| E-12 | Hàm restoreConvertedQuotationsWithoutOrders cập nhật quotations và được gọi từ GET danh sách/chi tiết | [hàm](https://github.com/backen-pixel/Quanlycongviec/blob/0db11ce1adb0fb89fc87529036e495a62d58fce7/backend/src/routes/crm/routes/commercialDocs.js#L90), [GET gọi hàm](https://github.com/backen-pixel/Quanlycongviec/blob/0db11ce1adb0fb89fc87529036e495a62d58fce7/backend/src/routes/crm/routes/commercialDocs.js#L160) | Không thử GET live với giả định không ghi; chặng 1 phải xác định tác động theo call path. |

## 2. PR và tài liệu được tham chiếu

- PR #19: OPEN, không draft, chưa merge; head e16c885ae7c2305645be02a1227bf378cb59137f. [Review và kiểm thử đã lưu](https://github.com/backen-pixel/Quanlycongviec/blob/e16c885ae7c2305645be02a1227bf378cb59137f/docs/ai-handoff/PR19_BROWSER_INDEPENDENT_REVIEW_20261001.md). Metadata/hồ sơ ghi 53 test, browser fixture và review agent; chặng 0 không chạy lại test phần mềm. Vận hành vẫn HOLD.
- PR #16: OPEN/DRAFT, chưa merge; head 19c35323bb932e55a78fff1eee312fff5f6c12ea. [ADR-0015](https://github.com/backen-pixel/Quanlycongviec/blob/19c35323bb932e55a78fff1eee312fff5f6c12ea/docs/adr/0015-marketing-business-os-boundary.md) và [bản đồ Marketing](https://github.com/backen-pixel/Quanlycongviec/blob/19c35323bb932e55a78fff1eee312fff5f6c12ea/docs/architecture/MARKETING_BOS_INTEGRATION_V1.md) là candidate, không nhập sang branch này.
- Main chỉ có template ADR-0000; cây của sáu PR đang mở (#1/#2/#4/#14/#16/#19) chỉ bổ sung ADR-0015. Cấp mới 0016–0020 sau kiểm kê đó; phải kiểm lại xung đột số khi merge, không tự đổi ADR đã Accepted.
- [Kiến trúc Work Unified cũ](https://github.com/backen-pixel/Quanlycongviec/blob/0db11ce1adb0fb89fc87529036e495a62d58fce7/docs/architecture/kien-truc-cu-moi-work-unified.html) và schema JSON trong docs là tài liệu/snapshot có phiên bản; không thay schema live.
- KT-01 cục bộ có SHA-256 15612EBC09C4455FA987FD2D60610FAB6197D95E279A4A74FEBE982F7690624A. Bản V1 Founder gửi và mục lục được dùng làm nguồn vấn đề; lựa chọn mới của Founder và kế hoạch được duyệt được ghi tại sổ quyết định, không gán toàn bộ V1 cũ thành đã duyệt.

## 3. Phần chưa xác minh

| Khoảng trống | Cách xử lý |
|---|---|
| Báo cáo companies/crm_tasks có ACL rộng, RLS tắt ngày 30/09 | Chưa tái kiểm live; không ghi như kết luận hiện hành. Chặng 1 lấy metadata được phép và test role cụ thể. |
| Schema DB chạy thật, applied migrations, drift, primary đang active và cấu hình cờ | Chặng 1 xác minh đúng môi trường; không đọc secret trong chặng 0. |
| Vision Overview / Unified Rebuild Blueprint gốc, toàn bộ PDF lịch sử | Chưa truy hồi/đọc đầy đủ; không dùng để suy approval hoặc coi không tồn tại. HTML/schema được đối chiếu không thay việc kiểm toàn bộ PDF. |
| Claude Code sẵn sàng trên máy | Không tìm thấy lệnh claude trong PATH của shell đã kiểm; chưa kết luận chưa cài ở mọi môi trường. |
| ECC/hook Cowork và baseline AI-FAC-001…005 | ECC Codex 2.2.2 có manifest cục bộ; hook Cowork chưa có bằng chứng độc lập; tìm default branch không thấy baseline, không kết luận mất trên mọi nguồn. |
| Sales Admin, môi trường và mẫu live cho Marketing | Còn đầu vào để nghiệm thu; không chọn/đổi người nhận thay Founder. |
| RPO/RTO, ngưỡng cảnh báo, lịch và chi phí | Chưa có số đo/đầu vào đủ; khóa theo gói phát hành, không tự đặt cam kết kinh doanh. |

## 4. Phạm vi kiểm gói tài liệu

Kiểm liên kết nội bộ của phần thêm/sửa; tính đầy đủ ADR ↔ quyết định ↔ roadmap; giữ nguyên byte lịch sử CURRENT/DECISIONS/WORKLOG phía sau prefix mới; chỉ cho phép file tài liệu/hướng dẫn; đối chiếu blob nguồn.

[Review độc lập](ARCHITECTURE_V1_1_INDEPENDENT_REVIEW_20261001.md) đã kết luận PASS cho gói tài liệu, gắn hash ba tệp trọng yếu; CURRENT ghi kết quả riêng với trạng thái vận hành. Kiểm tài liệu PASS không làm PASS các bài thử trong roadmap và không chứng nhận hệ thống vận hành.
