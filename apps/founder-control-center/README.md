# Founder Control Center — Marketing → CRM V1

Skybridge 2.0.3 adapter cho MCP gateway hiện có, ba view trong hội thoại và năm tools. Không thêm orchestrator hoặc dashboard riêng. Xem [SPEC](SPEC.md) và [hồ sơ bàn giao](../../docs/ai-handoff/FOUNDER_CONTROL_CENTER_V1_20261007.md).

## Chạy kiểm thử offline

Node >=24.18; từ thư mục này:

```sh
npm ci --no-audit --no-fund
npm run build
npm run typecheck
npm test
```

Build trước typecheck để sinh registry views. Tests tự mở HTTP server và PostgreSQL WASM synthetic; không cần Supabase, Meta hoặc bearer thật. Không có deployment trong scripts.

## Cấu hình thử tích hợp sau review

Backend: `FOUNDER_CONTROL_ENABLED=1` cho tools đọc; `FOUNDER_CONTROL_WRITES_ENABLED=1` chỉ sau review/migration staging. Cả hai mặc định tắt. `FOUNDER_VPT_COMPANY_ID` phải là UUID Vạn Phú Thành được xác minh, nếu thiếu hoặc không khớp thì SLA trả UNKNOWN. Không thay ca 08–20/15 phút của automation cũ.

Adapter: `FOUNDER_BACKEND_URL` là origin Express backend, mặc định `http://127.0.0.1:3001`. HTTPS bắt buộc ngoài loopback; không đặt credential/query/hash trong URL. `npm run dev` cho Skybridge devtools, `npm start` cho bản build. Đặt port theo cơ chế Skybridge deployment được review; URL Render frontend không phải MCP endpoint.

MCP `/mcp` yêu cầu bearer API key riêng chỉ có `founder_read` và/hoặc `founder_write`. Admin/ecosystem_admin tạo key và gán actor active (`default_assigned_to`), company/allowlist cùng tenant; không dùng key giới hạn region. Manager không được cấp/sửa/xoay key Founder. Actor sales_admin chỉ đọc công ty của mình. Adapter không giữ shared key; mỗi request xác minh qua `/api/mcp/tools` rồi chuyển bearer vào `/api/mcp/tools/call`. Không gửi key trong chat, arguments hay widget.

Tools đọc nhận company_id và window_start/window_end ISO8601 có offset, tối đa 31 ngày. Overview đếm các snapshot trong kỳ; evidence truy khách cụ thể. Sổ objectives/proposals/decisions là registry toàn công ty (không phải số phát sinh trong kỳ); mỗi objective mang kỳ riêng. Nguồn thiếu, cap phân trang hoặc chưa đối soát giữ UNKNOWN/PARTIAL. `fetched_at` không chứng minh nguồn mới/đầy đủ.

Mục tiêu `QUALIFIED_PAID_LEADS`: số nguyên không âm; `FIRST_RESPONSE_SLA`: phần trăm 0–100. Create sinh objective DRAFT và proposal/version/digest. Decision dùng đúng snapshot, request_id duy nhất; chỉ APPROVE/REJECT và NOT_EXECUTED. Khi kết nối ghi không rõ kết quả, truy lại hoặc replay đúng request_id/payload, không tạo request mới.

## Migration và khôi phục

`database/711_founder_control_center.sql` là candidate chưa chạy thật. Staging phải kiểm tra schema/roles/FKs, ACL, tenant scopes, audit và concurrency nhiều session trước khi bật writes. Không tự chạy migration khi start. Rollback: tắt hai flags, dừng adapter; SQL rollback chỉ thu hồi quyền execute và giữ hồ sơ/audit. Không xóa bằng chứng đã ghi.

## Chưa release

Bearer transport đã thử synthetic; OAuth discovery/token exchange/ủy quyền ChatGPT chưa có provider được xác minh. Cần HTTPS MCP endpoint và kiểm thử ChatGPT thực tế, staging Supabase cùng review độc lập. Không lấy tài nguyên devtools làm URL publish. Chính sách >=50.000 VND/không điện thoại và bật lại 00:00 chỉ evaluator dry-run; scope chính sách chưa xác minh nên output mặc định POLICY_SCOPE_UNVERIFIED, không gọi Meta.
