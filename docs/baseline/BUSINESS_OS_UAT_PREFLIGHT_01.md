# UAT preflight snapshot — Business OS baseline 01

- Thời điểm: `2026-08-26T10:49:48.064Z`
- Database staging: `atcfpgxkgbszglrelfgr`
- Company pilot: `991dc79d-cbf5-49f9-a364-35227cb47635`

Snapshot chỉ gồm số đếm tổng hợp, không chứa tên, số điện thoại, email hoặc nội dung hồ sơ khách. Truy vấn là read-only.

## Trạng thái cổng

- Migration: đủ `15/15`.
- Backup gate: `BLOCKED` do backup gần nhất chưa mới hơn schema freeze.
- Chưa được chạy UAT ghi dữ liệu thật.

## Coverage hiện có

| Chỉ tiêu | Số lượng |
|---|---:|
| Sales process | 1 |
| Lộ trình đầy đủ `full_service` | 1 |
| Lộ trình khách có thiết kế `customer_design` | 0 |
| Sales process có Project link | 0 |
| Production link | 0 |
| Installation link | 0 |
| Project trong scope | 5 |
| Project nội bộ | 2 |
| Project liên công ty | 3 |
| After-sales process | 0 |
| Customer service case | 0 |
| Project change | 1 |
| Project change cần phê duyệt | 1 |

## Phân bổ 5 slot UAT

| Slot | Kịch bản | Preflight | Việc cần làm sau khi gate READY |
|---|---|---|---|
| 01 | Khách chưa có thiết kế | `EXISTING_COVERAGE_FOUND` | Nhân viên phụ trách xác nhận dùng hồ sơ hiện có hoặc chọn hồ sơ mới. |
| 02 | Khách đã có thiết kế | `NEEDS_UAT_RECORD` | Chọn một khách thật có bản vẽ; chạy nhánh `customer_design`. |
| 03 | Sản xuất và lắp đặt nội bộ | `NEEDS_UAT_RECORD` | Chọn/tạo hồ sơ có đủ Production link và Installation link. |
| 04 | Lắp đặt liên công ty và After-sales | `NEEDS_UAT_RECORD` | Project liên công ty đã có; cần hoàn tất một hồ sơ tới After-sales. |
| 05 | Phát sinh và phê duyệt Project | `EXISTING_COVERAGE_FOUND` | Nhân viên phụ trách xác nhận hồ sơ hiện có hoặc chạy phát sinh mới có audit. |

Preflight không tự chọn hồ sơ khách và không coi coverage hiện có là UAT PASS. Kết quả cuối cùng vẫn phải ghi trong [`BUSINESS_OS_UAT_CHECKLIST_01.md`](./BUSINESS_OS_UAT_CHECKLIST_01.md).
