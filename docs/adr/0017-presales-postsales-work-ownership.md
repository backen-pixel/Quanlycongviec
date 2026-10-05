# ADR-0017: Tách việc trước bán và sau bán theo nghiệp vụ

- **Trạng thái:** Accepted — định hướng theo yêu cầu Founder ngày 01/10/2026; bản ghi này thuộc gói chặng 0 chờ review/merge, chưa phải kết quả triển khai.
- **Ngày:** 2026-10-01.
- **Nguồn quyết định:** [Sổ Founder](../ai-handoff/FOUNDER_DECISIONS_ARCHITECTURE_V1_1_20261001.md).
- **Kiến trúc liên quan:** [V1.1](../architecture/BUSINESS_AI_OS_ARCHITECTURE_V1_1.md).

## Ngữ cảnh

Founder chọn tách trước/sau bán. Mã thực tế dùng crm_tasks cả cho một số việc xưởng; unified_tasks_v ghép nhiều nguồn chứ chưa chứng minh một writer thống nhất.

## Quyết định

CRM sở hữu nhiệm vụ chăm khách/bán hàng, kể cả nhiệm vụ còn mở khi đã có Order. Work Unified sở hữu Project/Milestone/WorkItem sau bán. Phân loại theo nghiệp vụ/quan hệ, không chỉ tên bảng/is_won. Module chuyên môn sở hữu QC, giao lắp, chứng từ; Work giữ tiến độ chung và liên kết bằng chứng.

Ánh xạ quyết định Founder: F-02, F-05.

## Phương án đã xét

Gom mọi task vào Work Unified không khớp lựa chọn Founder. Giữ mọi crm_tasks ở CRM cũng sai với việc xưởng đang nằm trong bảng. Chọn chuyển các nhóm sau bán có mapping và giữ lịch sử trước bán.

## Hệ quả và kiểm chứng

Không di chuyển DB trong ADR. Bảng legacy hỗn hợp giữ một façade ghi được kiểm soát; nhóm không xác định giữ nguyên. View tổng hợp tiếp tục đọc hai hệ. Test chuyển đổi phải giữ ID liên kết, người nhận, hạn, tệp/lịch sử và company scope.

## Liên kết

- [Lộ trình/gate](../architecture/BUSINESS_AI_OS_V1_1_ROADMAP.md).
- [Bằng chứng hiện trạng](../ai-handoff/ARCHITECTURE_V1_1_EVIDENCE_20261001.md).
