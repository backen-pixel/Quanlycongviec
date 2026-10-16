# ADR-004 — D4: đủ DENY/UNKNOWN ở bốn cửa

- Trạng thái: **ASSUMPTION_PENDING_FOUNDER**, không sửa luật/runtime thật.
- Nhiệm vụ: BOS-V31A-ARCH-01; ngày **16/10/2026, Asia/Ho_Chi_Minh**.

## Bối cảnh và lựa chọn

V3.1 giữ Pháp → Lệ → Lý → Tình; gói kế thừa mô tả Tình chọn phương án mềm trong giới hạn. D4 thêm Tình được DENY hoặc chuyển người như các cửa khác. W0 A4 cho thấy luật SQL/backend/workflow/prompt rải, flowRuntime có UNKNOWN đi tiếp; không dùng graph completion làm BOS gate.

- **A:** Tình chỉ diễn giải sau ba cửa: đơn giản nhưng thiếu D4.
- **B:** Tình/human approver mở lại hard deny cửa trước: phá precedence/scope/quyền.
- **C:** Cả bốn cửa có PASS/DENY/UNKNOWN và đường chuyển người, mọi effect vẫn cần đủ điều kiện/authorization. Chọn **C** như giả định D4.

## Nội dung đề xuất

| Cửa | Căn cứ owner xác lập | DENY | UNKNOWN / chuyển người |
|---|---|---|---|
| Pháp | Ràng buộc pháp lý/hợp đồng/điều cấm được người có thẩm quyền ghi nhận | Decision DENIED, không phê duyệt mềm để vượt | NEEDS_INPUT, tìm nguồn/owner đúng quyền; không nhận đã chứng nhận tuân thủ pháp luật |
| Lệ | Membership/delegation/process/company/budget/policy còn hiệu lực | Decision DENIED sai quyền/scope/giới hạn cứng | NEEDS_INPUT; explicit approval chỉ với action hợp lệ cần duyệt, thiếu identity không là việc chờ duyệt |
| Lý | Facts đủ mới, tính toán/capacity/evidence và hard limits | Decision DENIED vi phạm bound | NEEDS_INPUT có missing fact/owner/deadline; không biến thiếu dữ liệu thành 0 |
| Tình | Hoàn cảnh/ứng xử/ngoại lệ mềm trong biên độ ban hành | Decision DENIED với reason/evidence, không tự READY | NEEDS_INPUT/chuyển owner đánh giá; timeout không tự PASS/approval |

PASS chỉ nghĩa tiếp tục kiểm, không cấp Command. Decision V3.1a dùng DENIED; REJECTED là trạng thái Command không hợp lệ, không trộn enum hai record hoặc coi tên trong contract cũ là field đích mới. Chuyển người là routing theo reason/contract, không grant cho reviewer. Reviewer AI chỉ PASS/FAIL, không policy authority. Người có quyền kết luận mới phải lưu fact/evaluation/Decision mới đúng scope; thay policy qua version/change authority, không viết đè verdict cũ.

Global → package → tenant → company; cấp dưới chỉ siết hoặc nới đúng phần cấp trên cho phép. Hard DENY thắng ALLOW, conflict chưa giải được UNKNOWN. Tình/approver không vượt DENY hoặc UNKNOWN chưa giải quyết ở cửa trước. Tình DENY do rule mềm vẫn không cho actor ép lại PASS; phương án khác phải là action/Decision hợp lệ trong biên được giao.

## Tác động và kiểm

Decision lưu result/reason/evidence/rule version/fact revision cho từng gate và effective scope. L6 recheck ngay trước intent/effect; lời AI nói đã kiểm hay workflow xanh không thay evaluator. NEEDS_INPUT có owner/deadline, không loop model vô hạn. D3-notice chỉ là mode authorization của action hợp lệ, không thay bốn cửa hoặc biến UNKNOWN thành PASS khi hết dwell.

[TASK](../TASK.md) D4/B5/B8; W0 A4/A5; [contracts](../contracts/), [state machines](../state-machines.md). [Acceptance](../acceptance-matrix.md) V3A-T13/T14/T15 kiểm Tình và truth table bốn cửa; T06/T15/T16 giữ version/precedence/snapshot. Test tương lai NOT_RUN.
