# ADR-0015 — Một hợp đồng Executive Intelligence cho Báo cáo và AI

- **Trạng thái:** Accepted
- **Ngày:** 2026-08-26
- **Phạm vi:** Business OS đa công ty; staging tại Công ty TNHH Bếp Vạn Phú Thành
- **Liên quan:** ADR-0012, ADR-0013, ADR-0014

## Ngữ cảnh

Màn Báo cáo trước đây đọc dashboard quản lý tổng hợp, còn AI Agent Center chủ yếu tự xếp ưu tiên từ Sales snapshot. Hai màn có thể đưa ra số và nguyên nhân khác nhau, chưa nhìn xuyên suốt Project và chưa biết độ phủ của dữ liệu tài chính.

## Quyết định

1. Backend phát hành read model `executive_intelligence_v1`; Báo cáo điều hành và AI Agent Center cùng đọc endpoint `/api/management/executive-brief`.
2. Contract hợp nhất bốn nguồn có kiểm soát:
   - Sales và công việc từ Management/Work KPI hiện hữu;
   - danh mục Project từ `operations_kpi_v1`;
   - doanh thu, chi phí, phải thu/phải trả từ `project_finance_v1`;
   - deep link về đúng Project hoặc danh sách nguồn.
3. Mọi rủi ro/khuyến nghị phải có `evidence`, `domain`, mức độ và `href`; frontend không tự dựng một bộ KPI khác.
4. AI giai đoạn này chỉ có mode `read_recommend`. Contract công khai `write_enabled=false`, `external_send_enabled=false`; khuyến nghị luôn cần người xem xét.
5. Không công bố lợi nhuận dự báo toàn danh mục nếu còn bất kỳ Project nào thiếu nguồn chi phí. Response phải trả độ phủ `finance_complete_projects`, `finance_partial_projects` và lý do.
6. Công nợ và tài chính là domain riêng, không làm thay đổi phần trăm hay stage Sản xuất.
7. Company/tenant scope được giải quyết ở backend trước khi tải Project và chứng từ; không tạo bảng dashboard hoặc bản sao nghiệp vụ mới.

## Hệ quả

- Quản lý và AI nhìn cùng danh sách Project trễ, nguyên nhân, công việc và tài chính.
- Khi migration tài chính chưa áp dụng, giao diện vẫn hoạt động ở trạng thái partial nhưng không hiển thị con số lợi nhuận gây hiểu nhầm.
- Khuyến nghị hiện là rule-based có thể kiểm thử và truy nguồn; việc sinh ngôn ngữ hoặc action AI sau này phải nằm ngoài contract đọc và qua approval/audit riêng.

## Rollback

- Route `/api/management/overview` và dashboard quản lý hiện hữu vẫn giữ nguyên contract.
- Có thể quay UI Báo cáo/AI về nguồn cũ mà không thay đổi hoặc xóa dữ liệu nghiệp vụ.
- Không có migration database trong ADR này.
