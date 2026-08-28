# UAT checklist — Business OS vNext baseline 02

## Điều kiện bắt đầu

- [ ] Tag `business-os-vnext-staging-baseline-02` tồn tại và trỏ đúng commit đang chạy.
- [ ] `npm run uat:readiness:business-os` exit `0`, đủ `17/17` migration và trả `READY_TO_ASSIGN`.
- [ ] Có backup `COMPLETED` sau `2026-08-27T01:01:30.141Z`; backup id: `____________`.
- [ ] Full CRM parity chạy liền mạch và PASS; không còn backend connection reset.
- [ ] Lưu evidence JSON/Markdown ngoài Git và phân công người phụ trách từng hồ sơ.
- [ ] Frontend/backend staging chạy đúng tag; không deploy production trong phiên.
- [ ] Dữ liệu khách hiện hữu chỉ được dùng sau khi nhân viên phụ trách xác nhận.

Quy ước: `PASS`, `FAIL`, `BLOCKED`. Mọi `FAIL/BLOCKED` phải có link hồ sơ, bằng chứng, owner và deadline sửa.

## Hồ sơ 1 — Khách chưa có thiết kế

- [ ] Lead chỉ bắt buộc các trường quan trọng theo Stage Contract; trường tùy chọn được bỏ trống.
- [ ] Qualification sinh đúng task, owner, SLA và chặn khi thiếu điều kiện bắt buộc.
- [ ] Lead → Deal idempotent, không nhân đôi Customer/Deal.
- [ ] `full_service`: Khảo sát → Thiết kế → Báo giá → Thương lượng → Đơn hàng.
- [ ] Đơn hàng xác nhận tạo/liên kết đúng một Project.

Kết quả: `________` · Hồ sơ: `________` · Người test: `________`

## Hồ sơ 2 — Khách đã có thiết kế

- [ ] Chọn `customer_design`, không tạo mốc Khảo sát giả.
- [ ] File khách cung cấp được kiểm tra kỹ thuật/kích thước và có evidence.
- [ ] Gate chặn Báo giá khi thiếu task bắt buộc.
- [ ] Khi đủ điều kiện, Đơn hàng/Project đi tiếp bình thường và không tạo bản thiết kế giả.

Kết quả: `________` · Hồ sơ: `________` · Người test: `________`

## Hồ sơ 3 — Project và vận hành nội bộ

- [ ] Cockpit có đúng 8 chặng và mỗi chặng trả lời %, phần thiếu, owner, deadline, blocker.
- [ ] Thu mua/Sản xuất/KCS/Kho/Giao/Lắp đặt/Nghiệm thu chuyển đúng tín hiệu thật.
- [ ] Hóa đơn, công nợ và thu tiền không làm thay đổi phần trăm Sản xuất.
- [ ] Retry bàn giao không tạo trùng Project, task hoặc event.

Kết quả: `________` · Project: `________` · Người test: `________`

## Hồ sơ 4 — Liên công ty và After-sales

- [ ] Công ty sở hữu và công ty vận hành hiển thị đúng; không rò dữ liệu ngoài tenant.
- [ ] Hoàn thành giao/lắp đặt mở đúng After-sales, không mở lại Deal.
- [ ] Sinh lịch CSKH 7/30/90; case Bảo hành/Dịch vụ/Khiếu nại có SLA.
- [ ] Đóng case/process bắt buộc kết quả và không còn task mở.

Kết quả: `________` · Project: `________` · Người test: `________`

## Hồ sơ 5 — Phát sinh, Mua hàng và Tài chính Project

- [ ] Phát sinh có loại, tiêu đề, nguyên nhân; approval/audit đúng quyền.
- [ ] Yêu cầu mua → PO gắn Project → nhận hàng/QC truy ngược được nguồn.
- [ ] Hóa đơn và thanh toán nhà cung cấp cập nhật phải trả/PO, không ghi trùng khi retry.
- [ ] Chi phí Project, hóa đơn/thu tiền khách và phát sinh đã duyệt drill-down được chứng từ.
- [ ] `project_finance_v1` tách đúng doanh thu, chi phí, phải thu/phải trả, cashflow và forecast P&L.
- [ ] Không công bố biên lợi nhuận là hoàn chỉnh khi nguồn chi phí còn thiếu.

Kết quả: `________` · Project: `________` · Người test: `________`

## Hồ sơ 6 — Báo cáo, AI và Blueprint công ty thứ hai

- [ ] Báo cáo và AI đọc cùng `executive_intelligence_v1`, cùng company/tenant scope.
- [ ] Cảnh báo Project trễ, công nợ và biên lợi nhuận có evidence/deep link đúng hồ sơ.
- [ ] AI chỉ khuyến nghị; không tự duyệt, gửi ra ngoài hoặc ghi dữ liệu nhạy cảm.
- [ ] Platform Admin preview Blueprint cho công ty thứ hai trước khi apply.
- [ ] Apply chỉ tạo cấu hình/phòng ban mẫu còn thiếu, không sao chép Lead/Deal/Project/chứng từ.
- [ ] Override công ty A không ảnh hưởng B; nâng version giữ override; tenant khác bị chặn.

Kết quả: `________` · Công ty: `________` · Người test: `________`

## Tổng kết

| Chỉ tiêu | Kết quả |
|---|---|
| Kịch bản đã chạy | `__/6` |
| PASS | `__` |
| FAIL | `__` |
| BLOCKED | `__` |
| Blocker cao/nghiêm trọng | `________________` |
| Người duyệt nghiệp vụ | `________________` |
| Ngày duyệt | `________________` |

Chỉ cutover hoặc triển khai rộng khi không còn blocker cao/nghiêm trọng, tenant isolation đạt và đường rollback đã được xác nhận.
