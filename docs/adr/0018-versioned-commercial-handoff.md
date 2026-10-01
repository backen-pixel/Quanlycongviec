# ADR-0018: Bàn giao thương mại có phiên bản và điều phối bền vững

- **Trạng thái:** Accepted — định hướng theo yêu cầu Founder ngày 01/10/2026; bản ghi này thuộc gói chặng 0 chờ review/merge, chưa phải kết quả triển khai.
- **Ngày:** 2026-10-01.
- **Nguồn quyết định:** [Sổ Founder](../ai-handoff/FOUNDER_DECISIONS_ARCHITECTURE_V1_1_20261001.md).
- **Kiến trúc liên quan:** [V1.1](../architecture/BUSINESS_AI_OS_ARCHITECTURE_V1_1.md).

## Ngữ cảnh

Đã có quotations/orders, helper tạo nhiều Project và flowRuntime chọn đường qua cả UNKNOWN. Chưa có bằng chứng đạt toàn bộ invariant mục tiêu về khách chấp thuận và durable approval.

## Quyết định

Phát triển trên lõi thương mại hiện có: Quote version → CustomerAcceptance đúng bản → Order → Project theo đơn vị thực hiện. Giữ khả năng nhiều đợt/nhiều xưởng. Journey là góc nhìn đọc. Workflow Flows điều phối, lưu chờ/retry/ngoại lệ; luật và approval được kiểm trong dịch vụ module. UNKNOWN không mở lệnh nhạy cảm.

Ánh xạ quyết định Founder: F-04, F-07.

## Phương án đã xét

Giữ is_won làm bằng chứng duy nhất không đủ truy phiên bản khách đồng ý. Tạo Order/Journey writer mới tạo lõi cạnh tranh. Chỉ thêm node approve vào đồ thị không tạo kiểm soát thực thi.

## Hệ quả và kiểm chứng

Chưa thêm API/schema/migration. Thiết kế idempotency theo đơn vị thực hiện được phê duyệt, không áp một Order chỉ một Project. Chuyển từng nhóm với adapter cũ; không xóa lịch sử khi hoàn tác. Test concurrency, đổi báo giá sau duyệt, mất phản hồi, retry và lỗi bàn giao.

## Liên kết

- [Lộ trình/gate](../architecture/BUSINESS_AI_OS_V1_1_ROADMAP.md).
- [Bằng chứng hiện trạng](../ai-handoff/ARCHITECTURE_V1_1_EVIDENCE_20261001.md).
