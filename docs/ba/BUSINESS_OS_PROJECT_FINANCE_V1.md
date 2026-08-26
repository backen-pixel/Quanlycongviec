# Business OS — Mua hàng, tài chính và lợi nhuận Project v1

## Mục tiêu

Nối một tuyến dữ liệu duy nhất:

`Yêu cầu mua → Đơn mua → Nhận hàng/KCS → Hóa đơn NCC → Chi tiền → Chi phí Project → Lợi nhuận/Công nợ`

Không trộn trạng thái tài chính vào tám chặng vận hành Project. Business OS chỉ tổng hợp và điều phối; chứng từ nguồn vẫn nằm tại module CRM, Mua hàng, Project và Kế toán.

## Nguồn chuẩn

| Số liệu | System of Record |
|---|---|
| Nhu cầu/kế hoạch vật tư | `purchase_requests` |
| Chi phí đã cam kết | `purchase_orders` |
| Chi phí nhà cung cấp thực tế | `supplier_bills` |
| Tiền đã chi nhà cung cấp | `supplier_payments` |
| Chi phí trực tiếp ngoài hóa đơn NCC | `project_expenses` |
| Doanh thu hợp đồng | `orders`, fallback `projects.estimated_value` / `quotations` |
| Phát sinh thương mại duyệt | Deal con đã thắng của Project |
| Hóa đơn/phải thu | `invoices` |
| Tiền khách đã trả | `payment_records`, đối chiếu `invoices.paid_amount` |

Migration additive: `database/581_project_procurement_finance_bridge.sql`.

## Contract `project_finance_v1`

Ba góc nhìn được tách riêng:

1. **P&L**: doanh thu hợp đồng + phát sinh duyệt − chi phí dự báo.
2. **Dòng tiền**: tiền khách đã thu − tiền đã trả NCC − chi phí trực tiếp.
3. **Công nợ**: phải thu khách hàng và phải trả nhà cung cấp.

Chi phí gồm:

- `planned`: tổng giá dự kiến của yêu cầu mua;
- `committed`: tổng PO đã xác nhận/đặt/nhận;
- `actual`: hóa đơn NCC đã xác nhận + chi phí trực tiếp;
- `forecast`: actual + phần PO chưa hóa đơn + phần kế hoạch chưa đặt PO.

Hồ sơ `project_expenses` có `supplier_bill_id` chỉ là liên kết/mirror và không được cộng lần hai vào actual cost.

## Quy tắc nghiệp vụ

- PO phải gắn đúng công ty nghiệp vụ; Project liên công ty chỉ hợp lệ khi có Deal của công ty đó liên kết Project.
- Hóa đơn NCC có thể ở `draft`, `confirmed`, `partial_paid`, `paid`, `cancelled`.
- `partial_paid` và `paid` chỉ do giao dịch `supplier_payments` tính; client không được tự gán.
- Không cho ghi chi vượt số công nợ còn lại.
- Trigger database và backend cùng đối chiếu `paid_amount`/`payment_status` để retry không làm sai số tổng.
- Chứng từ nháp, hủy hoặc void không tham gia KPI tài chính.
- Hóa đơn/phải thu quá hạn, hóa đơn NCC/phải trả quá hạn, vật tư/PO trễ và biên lợi nhuận dưới 15% tạo cảnh báo.

## Giao diện

- Business OS → **Mua hàng**: hai hàng đợi `Đơn mua` và `Công nợ NCC`; có form ghi hóa đơn NCC và ghi chi.
- Business OS → **Vận hành** → mở Project → tab **Tài chính & lợi nhuận**: doanh thu, chi phí, lợi nhuận, biên, phải thu, phải trả, dòng tiền và cảnh báo.
- Giao diện cũ `/mua-hang`, `/ketoan` và `/projects/:id` vẫn là đường fallback.

## Apply và rollback

Apply staging sau khi có backup:

```bash
cd backend
npm run db:migrate:581
```

Rollback code: quay về commit trước lát cắt; không chạy down migration và không xóa dữ liệu. Các cột/bảng 581 là additive nên code cũ bỏ qua được. Nếu migration chưa chạy, API/read model trả trạng thái `partial`, đơn mua cũ vẫn đọc qua legacy select và chức năng công nợ NCC trả mã `SUPPLIER_PAYABLES_SCHEMA_REQUIRED`.

## Kiểm thử bắt buộc trước baseline 02

1. Tạo yêu cầu mua gắn Project và tạo PO từ đúng công ty.
2. Ghi hóa đơn NCC từ PO, trả một phần rồi trả đủ; đối chiếu bill và PO.
3. Chặn trả vượt công nợ và chặn Project ngoài scope.
4. Đối chiếu Project `project_finance_v1` với từng chứng từ nguồn.
5. Kiểm tra không cộng trùng chi phí mirror.
6. Tenant isolation, Business OS regression, frontend build và browser smoke.
