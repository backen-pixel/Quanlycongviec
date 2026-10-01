# Sổ quyết định Founder — Business AI OS V1.1

Ngày ghi nhận: 01/10/2026. Người ghi: Codex. Phạm vi: chặng 0, kiến trúc và lộ trình VPT–Metala.

## Bằng chứng và cách hiểu phê duyệt

Nguồn trực tiếp là cuộc trao đổi Founder Control Center đang thực hiện chặng 0:
- Founder chọn **“Lộ trình toàn hệ thống”**.
- Với ownership công việc, Founder chọn **“Tách theo trước/sau bán”**.
- Với đích lộ trình, Founder chọn **“VPT–Metala vận hành (Recommended)”**.
- Sau khi nhận toàn bộ kế hoạch “Lộ trình Business AI OS V1.1 — vận hành VPT–Metala”, Founder gửi **“PLEASE IMPLEMENT THIS PLAN:”** kèm nguyên kế hoạch.

Đây là bản ghi có chọn lọc do Agent chép lại từ chỉ đạo trực tiếp, không phải chữ ký số hoặc xác minh độc lập toàn lịch sử chat. Nội dung nguồn đi kèm yêu cầu thực hiện vẫn là bằng chứng gốc. Không lưu các trao đổi không liên quan hoặc dữ liệu cá nhân trong repo.

Kế hoạch được duyệt ghi rõ: chặng 0 là bước triển khai đầu; mỗi chặng lớn tiếp theo được mở bằng yêu cầu cụ thể; thay DB thật, mở quyền AI và phát hành cần gói bằng chứng và quyết định tương ứng. Duyệt lộ trình không đồng nghĩa nghiệm thu hiện trạng, duyệt merge PR khác, hay cấp credential.

## Các quyết định đã được chốt trong phạm vi định hướng

| Mã | Nội dung được duyệt | Hồ sơ diễn giải |
|---|---|---|
| F-01 | Tiến hóa repo Quanlycongviec; giữ Express/React/Supabase/Render; không chuyển toàn bộ TypeScript trong đợt này | [ADR-0016](../adr/0016-incremental-business-ai-os-v1-1.md) |
| F-02 | CRM giữ công việc trước bán; Work Unified giữ việc sau bán; không gom toàn bộ crm_tasks | [ADR-0017](../adr/0017-presales-postsales-work-ownership.md) |
| F-03 | Đích VPT–Metala vận hành chuỗi; SaaS đăng ký/gói/tính phí nằm ngoài phạm vi | [ADR-0016](../adr/0016-incremental-business-ai-os-v1-1.md) |
| F-04 | Quote có phiên bản → khách chấp thuận → Order → Project; giữ tương thích khi chuyển | [ADR-0018](../adr/0018-versioned-commercial-handoff.md) |
| F-05 | Domain giữ luật; Application Service điều phối; Infrastructure ghi; mỗi dữ liệu một module chủ | [ADR-0017](../adr/0017-presales-postsales-work-ownership.md), [ADR-0019](../adr/0019-governed-commands-data-and-agents.md) |
| F-06 | Quyền, approval, audit, chống trùng; một DB Primary ghi tại một thời điểm; xác minh trước dữ liệu thật | [ADR-0019](../adr/0019-governed-commands-data-and-agents.md) |
| F-07 | Hoàn thiện Workflow Flows bền vững; UNKNOWN/thiếu approval không mở lệnh nhạy cảm | [ADR-0018](../adr/0018-versioned-commercial-handoff.md) |
| F-08 | Agent có danh tính/ủy quyền, chỉ gọi Tool Contract; mở quyền tăng dần sau đánh giá | [ADR-0019](../adr/0019-governed-commands-data-and-agents.md) |
| F-09 | Phân vai Claude Code/Cowork/Codex/reviewer; ECC là tooling Factory; thử ba việc giới hạn | [ADR-0020](../adr/0020-factory-context-review-and-ecc.md) |
| F-10 | Hồ sơ chuẩn trong repo; cập nhật cùng PR; mirror chỉ dẫn nguồn; giữ sources đồng bộ nguyên vẹn | [ADR-0016](../adr/0016-incremental-business-ai-os-v1-1.md), [ADR-0020](../adr/0020-factory-context-review-and-ecc.md) |
| F-11 | Marketing ưu tiên trước; MISA chỉ đọc/đối soát; các chặng có dependency và gate riêng | [Lộ trình](../architecture/BUSINESS_AI_OS_V1_1_ROADMAP.md) |

“Accepted” trong ADR mới chỉ ghi việc Founder đã chọn hướng đi này. Bản diễn giải vừa soạn vẫn qua review/merge; không mang nghĩa hệ thống đã được triển khai, an toàn hoặc nghiệm thu.

## Phần chưa được coi là đã chốt/đã thực hiện

- Kết luận vận hành về ACL/RLS, schema hiện hành, cấu hình failover, phiên bản deployment và độ sẵn sàng Claude Code/Cowork.
- Schema/API cụ thể, loại evidence khách chấp thuận, cấu hình policy/giới hạn tiền theo nghiệp vụ: phải khóa trong gói triển khai liên quan.
- Môi trường kiểm thật, mẫu nghiệp vụ, người Sales Admin nhận; lịch và ngân sách từng chặng.
- Merge/phát hành PR #16, #19; sửa DB/role/config thật; cài ECC vào repo/CI; bật thêm Agent hoặc tự động hóa.
- Quyền chạy quảng cáo có quyết định riêng; approval quảng cáo không mở quyền CRM/DB trong lộ trình này.

Các mặc định diễn giải để tránh lỗi được ghi trong V1.1: phân loại task theo nghiệp vụ, giữ đa xưởng/đa đợt, một writer chuyển đổi, tách nghiệp vụ chấp thuận báo giá và nghiệm thu giao lắp. Chúng là yêu cầu bảo toàn hiện trạng/thiết kế của gói chặng 0, không giả lập một lời duyệt Founder chưa tồn tại cho chi tiết implementation.

## Cách ghi quyết định tiếp theo

Mỗi quyết định ghi người quyết định, ngày, phiên bản/phạm vi, hành động cho phép và các gate còn lại. Thay quyết định dùng ADR kế tiếp; không sửa lời duyệt trước thành nội dung mới. Approval chỉ áp dụng đúng hành động/phạm vi; không suy từ việc tài liệu có tên “chuẩn”, nằm trên main hoặc test PASS.
