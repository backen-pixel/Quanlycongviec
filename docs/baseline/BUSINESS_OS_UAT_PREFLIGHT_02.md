# Preflight coverage — Business OS baseline 02

- Thời điểm: `2026-08-27T04:11:51.279Z`
- Database: `atcfpgxkgbszglrelfgr`
- Công ty pilot: `991dc79d-cbf5-49f9-a364-35227cb47635`
- Chế độ: `read_only=true`, `pii_safe=true`
- Kết quả: 1 slot có coverage hiện hữu, 5 slot cần hồ sơ UAT được nhân viên xác nhận/tạo.

## Snapshot tổng hợp

| Kịch bản | Coverage chính | Trạng thái |
|---|---|---|
| Khách chưa có thiết kế | 1 `full_service` | `EXISTING_COVERAGE_FOUND` |
| Khách đã có thiết kế | 0 `customer_design` | `NEEDS_UAT_RECORD` |
| Sản xuất/lắp đặt nội bộ | 2 Project nội bộ; chưa có process link SX/LĐ | `NEEDS_UAT_RECORD` |
| Liên công ty/After-sales | 3 Project liên công ty; 0 process After-sales | `NEEDS_UAT_RECORD` |
| Phát sinh/Mua hàng/Tài chính | 1 phát sinh cần duyệt, 1 yêu cầu mua; chưa có chuỗi PO–chi phí–hóa đơn | `NEEDS_UAT_RECORD` |
| Báo cáo/AI/Blueprint | 73 Project trong scope, 1 Blueprint published, 6 công ty ứng viên; chưa apply company Blueprint | `NEEDS_UAT_RECORD` |

`EXISTING_COVERAGE_FOUND` chỉ giúp phân công, không cho phép Codex tự chọn khách hàng. Số 73 là toàn bộ Project có quyền truy cập theo owner/logistics/Lead thương mại; hàng đợi điều hành có thể thấp hơn vì chỉ lấy Project đạt điều kiện vận hành.

Không có Lead, tên khách, số điện thoại, email hoặc nội dung chứng từ trong snapshot này. Preflight không tạo/sửa hồ sơ và không apply Blueprint.
