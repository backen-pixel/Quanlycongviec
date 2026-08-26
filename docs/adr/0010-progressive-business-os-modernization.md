# ADR-0010: Cải tổ Business OS theo phương pháp cuốn chiếu

- **Trạng thái:** Accepted
- **Ngày:** 2026-08-26
- **Người đề xuất:** Anh Hùng / Codex
- **Liên quan:** `docs/PROJECT_DECISION_LOG.md`

## Ngữ cảnh

Hệ thống hiện hữu đã có dữ liệu thật, đăng nhập, phân quyền, CRM, Project, task, Sản xuất, VC/LĐ và chứng từ tài chính. Business OS mới có shell và một số vertical slice tốt hơn, nhưng audit giao diện cho thấy ngữ cảnh công ty chưa xuyên suốt, một số read model lệch schema, KPI giữa module chưa thống nhất và phần lớn màn hình nghiệp vụ vẫn là giao diện cũ.

Viết lại toàn bộ sẽ tạo rủi ro mất quy tắc nghiệp vụ, sai dữ liệu và kéo dài thời gian cutover. Tiếp tục sửa từng màn hình không giải quyết được các lỗi dùng chung.

## Quyết định

Áp dụng cải tổ cuốn chiếu theo kiểu progressive replacement:

1. Giữ Supabase, API nghiệp vụ, đăng nhập, tenant/permission và các bảng chứng từ hiện hữu làm System of Record.
2. Ổn định nền tảng dùng chung trước: company context, schema compatibility, KPI/read model và điều hướng giữa Business OS với module hiện hữu.
3. Thay module theo thứ tự: Dự án & Công việc → Vận hành/Sản xuất/VC-LĐ → CRM chi tiết → Mua hàng & Tài chính → Báo cáo & AI.
4. Mỗi lát cắt có staging/UAT, feature flag hoặc gateway, quan sát lỗi và đường quay lại giao diện cũ.
5. Chỉ rút phần cũ khi lát cắt mới đạt tương đương nghiệp vụ, dữ liệu, quyền, hiệu năng và truy vết.

## Phương án đã xét

1. **Tiếp tục sửa vá:** nhanh ở từng lỗi nhưng giữ nguyên sự phân mảnh dữ liệu, KPI và trải nghiệm.
2. **Viết lại toàn bộ:** kiến trúc sạch trên giấy nhưng rủi ro cao với dữ liệu thật và quy tắc nghiệp vụ đã tích lũy.
3. **Cải tổ cuốn chiếu:** chậm hơn một bản demo viết mới, nhưng kiểm soát rủi ro và tạo giá trị dùng được sau từng vertical slice.

## Hệ quả

- Không cần migration dữ liệu lớn hoặc nguồn dữ liệu song song.
- Trong giai đoạn chuyển đổi sẽ tồn tại gateway giữa giao diện mới và cũ.
- Phải định nghĩa rõ owner, nguồn dữ liệu và phạm vi company/time/status cho từng KPI.
- Mọi deep link sang module cũ phải mang company context và vẫn chịu tenant guard ở backend.
- Rollback của từng lát cắt là tắt entry point mới hoặc quay lại gateway cũ; không xóa dữ liệu nghiệp vụ.

## Liên kết

- Nhật ký quyết định: `docs/PROJECT_DECISION_LOG.md`
- Kiến trúc Business OS: `docs/BUSINESS_OS_BLUEPRINT.md`
