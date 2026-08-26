# UAT checklist — Business OS vNext baseline 01

## Điều kiện bắt đầu

- [ ] Tag `business-os-vnext-staging-baseline-01` tồn tại và commit đã được ghi vào biên bản.
- [ ] `cd backend && npm run uat:readiness:business-os` hoàn tất exit code `0`, `all_applied=true` và `uat_gate.status="READY"`.
- [ ] Lưu phần đếm preflight tổng hợp và phân công hồ sơ cho các slot còn `NEEDS_UAT_RECORD`.
- [ ] Có backup `COMPLETED` sau `2026-08-26T10:21:23.977Z`; ghi backup id: `____________`.
- [ ] Frontend/backend staging đang chạy đúng commit của tag.
- [ ] Chỉ Công ty TNHH Bếp Vạn Phú Thành được bật pilot.
- [ ] Mỗi hồ sơ có người phụ trách thật, deadline thật và bằng chứng thật; không dùng dữ liệu giả xen vào hồ sơ khách.

Quy ước kết quả: `PASS`, `FAIL`, `BLOCKED`. Mọi `FAIL/BLOCKED` phải có link hồ sơ, ảnh/chứng cứ, người xử lý và deadline sửa.

Preflight chỉ đọc và chỉ trả số lượng tổng hợp, không hiển thị PII. `EXISTING_COVERAGE_FOUND` chỉ hỗ trợ chọn hồ sơ; nhân viên chịu trách nhiệm phải xác nhận trước khi dùng hồ sơ khách hiện hữu cho UAT.

## Hồ sơ 1 — Khách chưa có thiết kế, lộ trình đầy đủ

- [ ] Tạo Lead với các trường bắt buộc; trường tùy chọn có thể bỏ trống.
- [ ] Qualification sinh đúng checklist, owner, SLA; thiếu task bắt buộc thì không hoàn tất.
- [ ] Chuyển Lead → Deal không tạo trùng Customer/Deal khi bấm lại.
- [ ] Chọn `full_service`: Khảo sát → Thiết kế → đủ điều kiện Báo giá.
- [ ] Báo giá được gửi/chấp nhận → Thương lượng → Đơn hàng xác nhận.
- [ ] Đơn hàng xác nhận tạo/liên kết đúng một Project.

Kết quả: `________` · Hồ sơ: `________` · Người test: `________` · Ngày: `________`

## Hồ sơ 2 — Khách đã có thiết kế

- [ ] Chọn `customer_design`, không tạo mốc Khảo sát giả.
- [ ] Có file thiết kế khách cung cấp.
- [ ] Hoàn tất kiểm tra file, kỹ thuật/kích thước và xác nhận đủ dữ liệu.
- [ ] Gate chặn Báo giá khi thiếu task/bằng chứng bắt buộc.
- [ ] Khi đạt, tạo Báo giá và tiếp tục Đơn hàng/Project bình thường.

Kết quả: `________` · Hồ sơ: `________` · Người test: `________` · Ngày: `________`

## Hồ sơ 3 — Sản xuất và lắp đặt nội bộ

- [ ] Project Cockpit hiển thị đúng 8 chặng: Thiết kế → Thu mua → Sản xuất → KCS → Kho/Đóng gói → Giao nhận → Lắp đặt → Nghiệm thu.
- [ ] Mỗi chặng trả lời được phần trăm, còn thiếu, owner, deadline và blocker.
- [ ] Công nợ/đã thu/hóa đơn không làm sai phần trăm Sản xuất.
- [ ] Bàn giao SX → Logistics/Lắp đặt không tạo trùng Project hoặc task.
- [ ] Nghiệm thu hoàn tất mở After-sales đúng Project.

Kết quả: `________` · Hồ sơ: `________` · Người test: `________` · Ngày: `________`

## Hồ sơ 4 — Lắp đặt thuê ngoài và After-sales

- [ ] Đơn vị thực hiện khác company sở hữu được hiển thị rõ; không rò dữ liệu ngoài tenant.
- [ ] Event lắp đặt thuê ngoài liên kết đúng Project và thẻ bàn giao.
- [ ] Hoàn thành giao/lắp đặt chuyển đúng chặng, không nhân đôi event.
- [ ] Sinh kế hoạch CSKH 7/30/90 ngày.
- [ ] Case bảo hành có SLA và không mở lại Deal đã kết thúc.

Kết quả: `________` · Hồ sơ: `________` · Người test: `________` · Ngày: `________`

## Hồ sơ 5 — Phát sinh, phê duyệt và rủi ro Project

- [ ] Tạo phát sinh với đúng ba trường bắt buộc: loại, tiêu đề, nguyên nhân.
- [ ] Bổ sung ảnh hưởng chi phí/tiến độ, bên chịu chi phí và bằng chứng theo tình huống.
- [ ] Hồ sơ cần duyệt không được đóng khi còn `pending`.
- [ ] Duyệt/từ chối có actor, thời gian và audit; blocker Project giảm khi xử lý xong.
- [ ] Doanh thu phát sinh chỉ tính Deal phát sinh đã thắng; số liệu P&L có thể drill-down về chứng từ nguồn.

Kết quả: `________` · Hồ sơ: `________` · Người test: `________` · Ngày: `________`

## Tổng kết UAT

| Chỉ tiêu | Kết quả |
|---|---|
| Số hồ sơ đã chạy | `__/5` |
| PASS | `__` |
| FAIL | `__` |
| BLOCKED | `__` |
| Blocker phải sửa trước lát cắt tiếp theo | `________________` |
| Người duyệt nghiệp vụ | `________________` |
| Ngày duyệt | `________________` |

Chỉ khi không còn blocker mức nghiêm trọng/cao mới bắt đầu lát cắt **Mua hàng → Chi phí → Công nợ**.
