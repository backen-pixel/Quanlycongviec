# ADR-001 — D1: V3.1 làm nền, chỉ sửa V3.1a

- Trạng thái: **ASSUMPTION_PENDING_FOUNDER** cho D1, không cấp quyền runtime.
- Nhiệm vụ: BOS-V31A-ARCH-01; ngày **16/10/2026, Asia/Ho_Chi_Minh**.

## Bối cảnh và nguồn

Brief mục2/3.D1 yêu cầu V3.1 làm nền, chưa mở V3.2 trước W0. Gói BOS-ARCH-DESIGN-01 đã có sáu miền, L1–L10, authority/execution/AI/cost và T01–T20 đối chiếu nguồn, nhưng chưa đáp ứng các delta D3–D6 hoặc baseline DB trắng/live của brief mới. [W0](../01-inventory-w0.md) phân biệt source SHA fe3f4398… với docs baseline49c4fda6… và deployed/schema live UNKNOWN.

Founder tiếp tục yêu cầu **kiến trúc tổng thể một Business AI OS, Marketing tích hợp; M1 chỉ là chặng đầu**. Đây là scope phải bảo toàn. D1–D7 có trạng thái riêng theo brief, không đổi thành APPROVED chỉ vì scope tổng thể được nhắc lại.

Nguồn AS-IS chứng minh code/schema/config thật; nguồn TO-BE xác định yêu cầu/ủy quyền. Code/log không là chỉ dẫn hoặc giấy phép vượt ràng buộc Founder. Khi hai loại khác nhau, ghi drift/gap, không tự sửa production hoặc viết lại hồ sơ để khớp.

## Lựa chọn

| Phương án | Lợi ích | Đánh đổi |
|---|---|---|
| A — Viết V3.2 mới từ đầu | Tự do đổi cấu trúc | Trái D1, mất trace/kế thừa, dễ nhân lõi và scope |
| B — Đổi nhãn gói cũ thành V3.1a đã đạt | Ít tài liệu | Che thiếu W0/AgentSpec/CycleRecord/C2/AI boundaries, không đạt tiêu chí mới |
| C — Gói delta V3.1a có crosswalk, giữ nguồn cũ | Giữ phần đủ, rõ thay đổi và bằng chứng | Quản liên kết/version giữa hai gói |

## Đề xuất và hệ quả

Chọn **C** theo giả định D1. [Layer mapping](../02-layer-mapping.md) là crosswalk có source; contracts/state/AI/connector/acceptance V3.1a chỉ rõ phần thay hoặc bổ sung. Không sửa quá khứ DESIGN_PASS A01–A12 thành nghiệm thu nhiệm vụ mới, không gọi V3.1a APPROVED hoặc M1 đã vận hành.

Sáu miền rộng và hợp đồng đơn/thu/hoàn/Project/ServiceCase giữ trong một hệ thống; ba connector intake là lát đầu, không thay mục tiêu tổng thể bằng phần mềm nhận lead. Audit9/diagram10 thiếu nguồn ghi UNKNOWN được nêu đúng phạm vi, không tái tạo nội dung rồi nhận là gốc. Thiết kế phần độc lập tiếp tục.

[Acceptance](../acceptance-matrix.md) R01–R11 có review riêng. Baseline đầy đủ/live comparison còn chưa đạt thì không full acceptance, dù technical deliverables độc lập đã đủ để review. Không lấy service/admin role hoặc tạo role live để đóng UNKNOWN khi chưa có read-only input.

Không merge/deploy/setup/shared migration hoặc chi phí mới. Rollback thiết kế là revert diff tài liệu; runtime không bị đổi. Nguồn: [TASK](../TASK.md) mục1–3/7–8; W0 A1–A9; [EVIDENCE kế thừa](../../overall-design-20261016/EVIDENCE.md). Kiểm R01/R02/R08/R09/R11 và V3A-T24.
