# ADR-0014 — Phát sinh, hóa đơn, công nợ và lãi lỗ theo Project

- **Trạng thái:** Accepted
- **Ngày:** 2026-08-26
- **Phạm vi:** Business OS đa công ty; triển khai staging trước tại Công ty TNHH Bếp Vạn Phú Thành
- **Liên quan:** ADR-0012, ADR-0013

## Ngữ cảnh

Project Cockpit cần cho quản lý nhìn toàn cảnh công trình, bao gồm phát sinh, nghĩa vụ tài chính và hiệu quả. Tuy nhiên, nếu đưa Công nợ, Thu tiền hoặc Xuất hóa đơn vào pipeline Sản xuất thì tiến độ vận hành bị sai nghĩa. Nếu dùng số tiền đã thu làm lợi nhuận thì báo cáo tài chính Project cũng sai.

## Quyết định

1. Project Cockpit là nơi xem tổng hợp; dữ liệu vẫn được ghi ở đúng System of Record theo miền nghiệp vụ.
2. **Phát sinh & Thay đổi** là một facet riêng của Project. Mỗi phát sinh phải có:
   - loại phát sinh và nguyên nhân;
   - người/bộ phận chịu trách nhiệm;
   - bằng chứng, ảnh hoặc tài liệu;
   - ảnh hưởng chi phí và số ngày tiến độ;
   - bên chịu chi phí;
   - trạng thái phê duyệt và người phê duyệt;
   - liên kết tới task, mua hàng, báo giá bổ sung hoặc phụ lục phát sinh.
3. Phát sinh chưa xử lý có thể tạo blocker/risk cho macro phase liên quan. Chỉ phát sinh thương mại đã được duyệt mới điều chỉnh doanh thu Project.
4. **Hóa đơn, thanh toán và công nợ** thuộc module Finance. Project Cockpit chỉ hiển thị tóm tắt, cảnh báo và đường mở chứng từ nguồn.
5. Chuỗi chứng từ tài chính chuẩn là:

   **Project → Đơn hàng/Hợp đồng → Kế hoạch thanh toán → Hóa đơn → Thanh toán → Công nợ**

6. Trạng thái Finance không phải stage Sản xuất và không được tính vào phần trăm hoàn thành vận hành. Quy tắc tài chính chỉ tạo blocker vận hành khi được cấu hình công khai, ví dụ chưa đủ điều kiện tài chính để giao hàng.
7. Hiệu quả Project phải tách ba góc nhìn:
   - **P&L:** doanh thu được ghi nhận, chi phí và lợi nhuận;
   - **Cashflow:** đã thu, đã chi, phải thu và phải trả;
   - **Forecast:** doanh thu/chi phí dự kiến đến khi hoàn thành.
8. Công thức quản trị chuẩn:

   **Doanh thu hợp đồng + Phát sinh thương mại đã duyệt − Vật tư − Nhân công − VC/LĐ − Nhà thầu phụ − Chi phí phát sinh doanh nghiệp chịu − Chi phí chung phân bổ = Lợi nhuận Project**

9. Dashboard Project phải hiển thị doanh thu dự kiến/chốt, chi phí cam kết/thực tế/dự báo, lợi nhuận dự kiến/thực tế, biên lợi nhuận và công nợ. Không dùng riêng giá trị hóa đơn hoặc tiền đã thu để suy ra lợi nhuận.
10. AI giai đoạn đầu chỉ đọc cùng Project health + Project finance read model để giải thích rủi ro tiến độ và nguyên nhân giảm lợi nhuận; không tự duyệt phát sinh, xuất hóa đơn hoặc ghi nhận thanh toán.
11. Trước khi bổ sung schema, phải kiểm kê và ưu tiên tái sử dụng quotation, order, invoice, payment, purchase, task và cost source hiện hữu. Nếu thiếu mới thêm migration additive; không tạo kho tài chính Project song song.

## Phương án đã xét

1. Đưa Finance vào pipeline Sản xuất — dễ nhìn một bảng nhưng sai miền nghiệp vụ và làm hỏng KPI tiến độ.
2. Chỉ xem Finance ở module Kế toán — đúng nguồn nhưng quản lý Project thiếu bức tranh tổng hợp.
3. Project Cockpit tổng hợp + Finance làm nguồn chuẩn — được chọn vì giữ đúng nghiệp vụ và vẫn cho quản lý nhìn toàn cảnh.

## Hệ quả

- Project Cockpit cần các facet: Tổng quan, Công việc, Tiến độ, Vật tư/Thu mua, Chất lượng, Phát sinh, Tài liệu, Tài chính và Hoạt động.
- Operations có thể lọc Project theo blocker phát sinh; Finance/Báo cáo có thể lọc theo biên lợi nhuận, công nợ và dòng tiền.
- Phát sinh được duyệt phải cập nhật forecast và giữ audit; không sửa ngược giá trị hợp đồng/chứng từ cũ mà không có dấu vết.
- Không có migration hoặc thay đổi dữ liệu trong chính quyết định này.

## Rollback

- Đây là lớp tổng hợp/read model; rollback UI không xóa phát sinh hoặc chứng từ nguồn.
- Các module Project, Purchasing và Finance hiện tại vẫn là đường quay lại trong staging.

## Liên kết

- Blueprint: `docs/BUSINESS_OS_BLUEPRINT.md`
- Nhật ký quyết định: `docs/PROJECT_DECISION_LOG.md`
