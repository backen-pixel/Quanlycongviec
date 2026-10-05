# Sửa kiểm soát Agent — 05/10/2026

Nguồn gốc: [audit tại 679cb926](../audits/2026-10-05-agent-architecture/README.md).
Founder xác nhận thứ tự: khóa quyền công cụ → chặn điều kiện chưa rõ/chưa duyệt → bắt buộc bằng chứng số liệu → sửa ngữ cảnh và bộ nhớ. Kiến trúc đích V1.1, phạm vi Marketing và các quyết định ngân sách giữ nguyên.

Nhánh sửa: `codex/agent-guardrails-20261005`, tách từ source PR22 `679cb9266ecb87c560421f3f6fc3c3e31b50b831`. Rủi ro HIGH do thay đổi tương thích của báo cáo/luồng cũ. Đây là bản sửa cục bộ để review; không thay DB, không phát hành hoặc gọi nhà cung cấp thật.

## Thay đổi và tác động sử dụng

| Thứ tự | Bản sửa | Giới hạn có chủ đích |
|---|---|---|
| 1 — AA01 | Một điểm gọi công cụ kiểm lại người dùng đang hoạt động, tenant/công ty, người phụ trách và kênh nhận. MCP report dùng đúng danh tính gắn với API key; header không đổi người. Quyền được kiểm lại sau đọc và trước gửi, gắn với chính bằng chứng đã lấy. | Chỉ mở 7 công cụ đọc đã có hợp đồng bên dưới. Vai trò rộng không tự cho quyền xuyên công ty. Thiếu tenant/công ty hoặc dữ liệu quyền thì dừng. |
| 2 — AA02 | Cổng tạo sản xuất/bàn giao chặn UNKNOWN, lỗi nguồn, thiếu graph/điều kiện. Cả điểm gọi cũng dừng nếu gate ném lỗi. Không đi qua wait/approve/join khi chưa có trạng thái bền vững. | Áp dụng cả khi FLOW_RUNTIME_ENFORCE=0. Action runner chỉ xem trước báo cáo có kiểm quyền; hành động AI/gửi thật giữ HOLD. Chưa xây bộ điều phối chờ/tiếp tục/phê duyệt bền vững. |
| 3 — AA03/04 | Server dựng câu trả lời từ kết quả công cụ đã xác minh, không gửi lại lời tự viết của model. Mỗi bằng chứng có nguồn, thời điểm, công ty và phạm vi thực. Lỗi/thiếu hàng do giới hạn nguồn không thành 0 hoặc tổng thiếu. | JSON dài vẫn hợp lệ, ghi incomplete và yêu cầu thu hẹp; không gửi số liệu bị cắt. Chưa có phân trang toàn bộ kết quả dài. Giá trị ước tính hồ sơ thắng không phải doanh thu kế toán hay CPQL. |
| 4 — AA05/06 | Chỉ ghi ngữ cảnh đã xác nhận; lỗi không đổi phạm vi. Trường cần xóa có giá trị null để không bị phép gộp khôi phục. Correction được lấy trước suy luận, kèm nguồn/thời điểm và nhãn không phải quyền/phê duyệt. | Bộ nhớ chỉ tham khảo. Mâu thuẫn cần làm rõ; chưa có mô hình supersession theo chủ đề hoặc lưu trạng thái suy luận như quyết định Founder. |

Bảy công cụ: `list_companies_in_scope`, `find_users_by_name`, `resolve_assignee_scope`, `resolve_time_range`, `get_company_lead_summary`, `format_company_report_text`, `get_user_learned_facts`.

Company admin/sales admin/CRM production admin/accounting được đọc tổng trong công ty đã gắn, trừ khi server yêu cầu phạm vi cá nhân. Các vai trò khác chỉ xem hồ sơ giao cho mình. Bộ lọc người phụ trách phải thuộc đúng tenant/công ty và không rộng hơn quyền. Bộ lọc phòng/khu vực, hồ sơ nhân viên liên công ty, quản trị lịch/skill và công cụ cũ chưa di chuyển giữ khóa. Báo cáo trong hội thoại chỉ mở ở DM đúng hai thành viên người gọi và bot; báo cáo vào nhóm/phòng chờ hợp đồng người nhận.

Các lối tắt sửa lịch/skill và gửi báo cáo trực tiếp trước vòng gọi công cụ đã gỡ khỏi luồng hội thoại để không đi vòng qua kiểm quyền. Không tự xác nhận các bản duyệt cũ thành quyền thực thi mới.

## Phạm vi chưa được chứng nhận

- Scheduled sender/menu legacy còn gọi helper trực tiếp trong `aiBotSender.js` và `aiReportMenu.js`; chúng không nằm sau registry mới. Cần rà/migrate riêng trước khi chứng nhận toàn bộ báo cáo legacy.
- MCP CRM read bridge và MCP Ads dùng hợp đồng riêng. Thay đổi này không chứng nhận lại logic dữ liệu của hai bridge; nhánh Ads không dùng report act-as.
- Chưa chạy PostgreSQL/RLS cô lập cho phạm vi mới, chưa UAT CRM thật, chưa đo chất lượng model. Các test fake ports không thay các cổng đó.
- Chưa chứng minh mọi dữ liệu tài khoản thật có tenant/company binding đầy đủ. Người dùng chưa gắn đúng sẽ bị chặn, cần đối chiếu trước rollout.
- Không chỉnh các quyết định 18 câu tư vấn, Admin VPT nhận khách, lịch CRM hoặc mục tiêu tạm thời 250.000 đồng/khách hợp lệ. Chưa có kết quả vận hành để kết luận đạt mục tiêu.

## Kiểm chứng và hoàn tác

Bộ regression `backend/tests/agentGuardrails.test.js` chạy mã thật với DB/provider giả, cấm network trong VM. Bao gồm quyền, thu hồi giữa đọc/gửi, scope drift, lỗi/thiếu nguồn, output dài, persistence, correction, flow gate và điểm tích hợp. Workflow `agent-guardrails.yml` đặt Node 18/22; CI chưa chạy khi chưa publish.

Kết quả cục bộ Node 24.19.0: [112 PASS, 0 FAIL/SKIP](unit-tests.tap), gồm 48 regression mới và 64 Care; [hồi quy báo cáo hiện có](report-tests.tap) PASS. Runner chuẩn được chạy ngoài giới hạn sandbox tạo tiến trình con; vẫn chỉ dùng fixture, không có DB/provider thật. Lượt đầu bị sandbox EPERM không phải kết quả kiểm mã; không tính là PASS.

[Reviewer độc lập](REVIEW.md) đọc đủ yêu cầu, audit, diff và bằng chứng, chạy riêng 48/48 PASS và git diff --check. [Fingerprint source](source-manifest.json) xác định đúng file đã kiểm; kết luận kỹ thuật không phải phê duyệt phát hành. CI Node18/22 chưa phải bằng chứng đã có tại thời điểm đóng gói này; theo dõi trực tiếp trên PR.

Không có migration hoặc chuyển dữ liệu. Nếu ứng viên gây vấn đề trong môi trường thử: dừng entry point liên quan và giữ log/bằng chứng, sửa tiếp hoặc loại ứng viên. Không rollback bằng cách mở lại công cụ/luồng fail-open. Production chỉ mở sau inventory bindings, kiểm DB và người nhận, UAT đúng phiên bản cùng quyết định phát hành Founder; trạng thái hiện tại **HOLD**.
