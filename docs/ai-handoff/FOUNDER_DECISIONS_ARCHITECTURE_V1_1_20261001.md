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

## F-12 — 02/10/2026: ưu tiên Marketing đa kênh để có khách

- Người quyết định: Founder, chỉ đạo trực tiếp trong task Founder Control Center sau khi xem kiến trúc V1.1.
- Nguồn: “anh muốn hoàn thiện hệ thống marketing đa kênh trước. túc là ưu tiên để có khách hàng về”. Kênh bổ sung được Founder nêu: “website, Google, ads chatgpt TikTok, zalo”. Ngân sách: “Lập phương án tăng ngân sách để anh duyệt”.
- **Đã chốt:** ưu tiên thu hút/tiếp nhận/chăm sóc khách đa kênh trước phát triển chuyên sâu sau bán. Kiến trúc V1.1, ownership, quyền và đích dài hạn VPT–Metala giữ nguyên. Mở công việc chuẩn bị lộ trình/gói Marketing; kiểm soát liên quan vẫn là điều kiện cho kết nối và ghi dữ liệu thật.
- **Được giao:** đối chiếu kênh, chuẩn bị kế hoạch triển khai và phương án tăng ngân sách để Founder duyệt. Tận dụng phê duyệt Facebook đã có trong phạm vi của nó.
- **Chưa chốt:** phân bổ A/B, ngân sách chi thêm, lịch chạy/địa bàn/tài khoản cụ thể của kênh mới, KPI/SLA, người Marketing/Sales Admin và cấu hình tracking. Không suy việc liệt kê kênh thành xác minh tài khoản hoặc hiệu quả.
- Hồ sơ đề xuất: [Marketing đa kênh](MARKETING_MULTICHANNEL_PRIORITY_20261002.md). Hướng ưu tiên này cập nhật F-11 và thứ tự roadmap; không hủy F-01…F-10, không tự merge/release/mở quyền AI/DB thật.
- Lần cập nhật chỉ sửa tài liệu; approval chi tiền và phát hành vẫn gắn đúng gói cụ thể. Không đổi nghĩa các phê duyệt trước.


## F-13 — 02/10/2026: giao triển khai Marketing–Sales tự động hóa tối đa

- Người quyết định: Founder, gửi “PLEASE IMPLEMENT THIS PLAN” cùng kế hoạch Marketing–Sales VPT. Đây là phê duyệt hướng đi, phạm vi triển khai và bộ giới hạn; phát hành/dữ liệu thật giữ gói phê duyệt tương ứng.
- Thay đề xuất A/B14/21 triệu và phương án agency/nội dung thường xuyên. Một người nội bộ kiêm nhiệm cùng dự phòng nhận ngoại lệ; AI làm việc thường ngày; người khảo sát, báo giá cuối, thương lượng/chốt đơn. Codex/Claude là Factory, không là runtime.
- Trần một đợt100 triệu/30 ngày, gồm Facebook; HCM80 triệu/Cần Thơ20 triệu. Google35/FB30/TikTok20/Zalo10/ChatGPT5 triệu khởi điểm; không tự gia hạn tháng sau. Giữ7ngày đầu,10%/48h,10khách/nhóm, giảm xác nhận trước tăng và không chuyển giữa vùng.
- Mục tiêu doanh thu gốc <=7% tiền quảng cáo/doanh thu paid-attributed được kế toán ghi nhận, chưa VAT sau điều chỉnh.300 khách hợp lệ là sản lượng phụ. Đánh giá dài hơn30 ngày chi; không lấy estimate/deal chốt thay doanh thu.
- Hồ sơ chuẩn: [kế hoạch](https://github.com/backen-pixel/Quanlycongviec/blob/codex/vpt-marketing-automation-20261002/docs/architecture/VPT_MARKETING_SALES_AUTOMATION_V1.md), [triển khai PR22](https://github.com/backen-pixel/Quanlycongviec/blob/codex/vpt-marketing-automation-20261002/docs/ai-handoff/vpt-marketing-automation/README.md). Quyền Facebook cũ giữ phạm vi hiện hữu tới gói chuyển đổi; ngân sách này không tự điều chỉnh ads đang chạy. Không tự merge/deploy/cấp quyền AI hoặc DB thật.

## F-14 — 02/10/2026: đo Lead trước, mục tiêu thử250.000 đồng/khách

- Nguồn: Founder trả lời “tạm thời đo bằng lead nha. có kha nagw 250000 trên 1 lead cho dễ” khi được hỏi nguồn kế toán/lịch khảo sát.
- Chỉ tiêu vận hành trước mắt: toàn bộ tiền quảng cáo/số khách hợp lệ khác nhau, có bằng chứng nguồn trả phí, mục tiêu <=250.000 đồng. Dùng định nghĩa khách hợp lệ từ kế hoạch trước; pending/rejected và nhãn ấm/nóng báo riêng. Chưa có dữ liệu chứng minh mục tiêu khả thi.
- 300 khách tại mức này tương ứng75 triệu. Giữ trần100 triệu một lần, tỷ lệ80/20 và các quyền/giới hạn F-13; không yêu cầu chi hết hoặc tự nâng sản lượng. Nếu dùng hết trần, cần ít nhất400 khách hợp lệ để đạt chi phí mục tiêu — phép tính, không dự báo.
- Nối kế toán và kết luận7% chuyển sang bước đánh giá sau; thiếu kế toán không chặn triển khai giai đoạn Lead. Vẫn cần nguồn toàn bộ spend, canonical khách đã đối soát trùng, xác minh chất lượng, quyền, caps và nghiệm thu/phát hành. Rẻ theo Lead không đồng nghĩa đạt7% doanh thu.
- Policy implementation VPT-MS-20261002-v2; không tái dùng phê duyệt/payload của phiên bản cũ. Hoàn tác giữ quyết định lịch sử, bằng chứng và dữ liệu nghiệp vụ.
