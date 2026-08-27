# ADR-0016 — Blueprint theo công ty và giữ override khi nâng phiên bản

- Trạng thái: Accepted
- Ngày: 2026-08-26

## Bối cảnh

Một tenant có thể chứa nhiều công ty. Control plane ban đầu chỉ có `tenant_blueprint_installations`, nên tất cả công ty cùng đọc một cấu hình và công ty thứ hai không có lifecycle cài/nâng cấp độc lập. Điều này chưa đáp ứng mục tiêu nhân bản hệ sinh thái mà vẫn cho phép từng công ty giữ quy trình và module riêng.

## Quyết định

1. Thêm `company_blueprint_installations` bằng migration additive `582`; khóa duy nhất là `(company_id, blueprint_id)` và trigger xác nhận `company_id` thuộc đúng `tenant_id`.
2. Mỗi bản cài lưu Blueprint version, `company_overrides` và `configuration.effective_definition`. Khi nâng version, override hiện hữu được áp lại lên definition mới thay vì bị ghi đè.
3. Business OS ưu tiên bản cài active theo `company_id`; nếu chưa có thì fallback về Blueprint cấp tenant để tương thích ngược.
4. Apply theo công ty chỉ materialize phòng ban mẫu còn thiếu theo cách idempotent. Quy trình, module và operating kernel được phát hành dưới dạng effective definition; dữ liệu ngoài Blueprint không bị xóa hoặc vô hiệu hóa.
5. Không dùng `app_module_companies` để bật module Blueprint. Bảng đó là ACL của module tùy chỉnh với quy ước “không có dòng = chia sẻ toàn bộ”; ghi một công ty vào đó có thể vô tình khóa các công ty khác.
6. Blueprint không sao chép Customer, Lead, Deal, Order, Project, task đang chạy, hóa đơn, thanh toán hoặc bất kỳ dữ liệu giao dịch nào.

## Override contract v1

```json
{
  "schema_version": 1,
  "modules": {
    "production": { "enabled": false },
    "crm": { "config": { "intake_mode": "referral" } }
  },
  "department_templates": {
    "add": ["installation"],
    "hidden": ["accounting"]
  },
  "processes": {
    "sales_lifecycle_v1": {
      "definition": { "name": "Sales riêng", "stages": ["lead", "deal"] }
    }
  },
  "operating_kernel": {}
}
```

`hidden` chỉ loại template khỏi effective definition; apply không xóa phòng ban đã tồn tại. Process override thay đổi definition dùng cho lần cài đó, không sửa version Blueprint đã publish.
Gửi giá trị `null` cho một key trong `modules` hoặc `processes` sẽ bỏ override của key đó và đưa công ty trở lại cấu hình Blueprint chuẩn ở lần apply kế tiếp.

## Hệ quả

- Có thể cài cùng một Blueprint cho công ty A và B trong một tenant mà không rò override.
- Nâng Blueprint có optimistic version gate; giao diện cũ phải preview lại nếu version đã thay đổi.
- Migration `582` phải được áp dụng sau `567`; trước đó Business OS vẫn fallback về Blueprint tenant, còn API quản trị company installation trả schema-required.
- Rollback code quay về commit trước lát cắt; rollback dữ liệu không dùng down migration và không xóa installation/audit. Có thể giữ bản cài ở trạng thái failed để điều tra.

## Kiểm thử bắt buộc

- Override công ty A còn nguyên khi nâng Blueprint v1 → v2.
- Công ty B vẫn nhận definition chuẩn, không nhận override của A.
- Company/tenant scope sai bị chặn ở backend và trigger database.
- Apply lặp không tạo trùng phòng ban; dữ liệu ngoài Blueprint được giữ.
- Business OS, tenant isolation, frontend build và browser smoke phải PASS trước baseline 02.
