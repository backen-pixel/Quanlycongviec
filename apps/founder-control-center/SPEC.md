# Founder Control Center — Marketing → CRM V1

Nguồn yêu cầu: nhiệm vụ Founder ngày 07/10/2026; baseline 6e5ef497f507685c94ba39e89426d8b4bb716bfa. Phạm vi implementation/offline; không runtime production, quảng cáo, thông báo hoặc migrations thật.

## Giá trị và giao diện hội thoại
Founder hỏi tình hình, truy bằng chứng và ghi mục tiêu/quyết định có phiên bản. Executive AI Interface diễn giải kết quả backend; không persona CEO Minh, không thêm orchestrator thay OpenClaw. Dữ liệu không phụ thuộc trí nhớ ChatGPT. Một sản phẩm, backend Express chia module; Skybridge chỉ là adapter và view trong ChatGPT, không xây dashboard web riêng.

## Ba luồng
1. Xem tình hình theo công ty/kỳ: sáu hệ, hành trình khách, khoảng cách mục tiêu (null khi thiếu mục tiêu), nguồn/coverage/độ mới, người phụ trách và bước tiếp theo.
2. Truy bằng chứng theo khách: receipt/attribution/CRM → phản hồi con người → trạng thái bán hàng. Đọc trực tiếp allowlist, không dùng CRM detail gây ghi seen_by; không trả PII/raw message/token.
3. Điều hành: tạo mục tiêu kèm người chịu trách nhiệm; ghi quyết định trên đề xuất đúng công ty/phiên bản/hash. Persist atomic + audit, idempotency; chỉ ghi nhận, không thực thi quảng cáo/notification/task assignment. Theo dõi hồ sơ mục tiêu/decision qua tool đọc.

## Tích hợp và quyền
Tái sử dụng /api/mcp/tools/call, apiKeyAuth, MCP audit và actor default_assigned_to. Scopes mới founder_read / founder_write không cấp mặc định. Backend kiểm lại actor active, tenant, công ty/key và vai trò admin/ecosystem_admin; sales_admin chỉ đọc công ty của mình. Từ chối key chỉ một khu vực vì báo cáo này có scope toàn công ty. Model không cấp tenant/actor/role. Feature flags FOUNDER_CONTROL_ENABLED và FOUNDER_CONTROL_WRITES_ENABLED mặc định tắt. Writes chỉ Primary, transaction có kiểm lại actor/key trước persist.

## Dữ liệu và giới hạn
Facebook signed inbox/Lead Ads receipt SQL701–702 là writer và chống trùng hiện có, không tạo intake/scheduler khác. First touch có thể gồm note nên không đủ chứng minh SLA. SLA VPT mới: mọi ngày 08:00–22:00 Asia/Ho_Chi_Minh, mục tiêu <5 phút; không đổi policy marketingAutomation cũ 08–20/15 phút. Chỉ đo khi có thời điểm nguồn đã xác minh và bằng chứng outbound của con người có sent_by hợp lệ. Thiếu nguồn/coverage/độ mới không thành 0. Không tự nhận attribution là toàn bộ intake. Chi tiêu hiện có chưa có watermark completion/cohort mọi kênh: tổng quan CPL/dừng ads UNKNOWN. Quy tắc >=50.000 VND không có điện thoại/00:00 bật lại chỉ dry-run khi policy gốc xác nhận đối tượng; mặc định POLICY_SCOPE_UNVERIFIED.

## API
get_founder_overview(company_id, window_start, window_end): view tóm tắt sáu hệ.
get_founder_evidence(company_id, window_start, window_end, lead_id): view bằng chứng khách và SLA.
get_founder_objectives(company_id, window_start, window_end): mục tiêu và quyết định đã lưu.
create_founder_objective(company_id, request_id, owner_id, title, metric, target, window_start, window_end): lưu mục tiêu.
record_founder_decision(company_id, request_id, proposal_id, expected_version, expected_digest, decision, reason): ghi approve/reject đúng snapshot, không execute.
Mỗi output có contract_version, scope, outcome, source_refs, fetched_at, source_as_of, coverage và synthetic=false; lỗi nguồn trả null+reason, không echo lỗi DB.

## Skybridge và release
Npm theo repository, SDK pin + lock. Mỗi request adapter chuyển bearer key vào backend, không dùng shared service key cho mọi người. Không bearer →401. Production ChatGPT OAuth discovery/delegation cần provider được xác minh, chưa có trong repo; không bịa endpoint. UI synthetic và MCP transport có thể thử offline; không gọi backend DB thật. Review độc lập, staging schema/ACL/RPC và auth ChatGPT/public endpoint trước release.

## Chi tiết chốt sau implementation
Key Founder dùng riêng founder_read/founder_write; admin/ecosystem_admin quản trị và phải có creator/actor active cùng tenant/company. Scope SLA chỉ áp dụng UUID trusted FOUNDER_VPT_COMPANY_ID; thiếu scope trả UNKNOWN. Ba read tools có ba view registry riêng; write tools trả metadata ghi nhận. Sổ mục tiêu/quyết định là registry toàn công ty có kỳ riêng trên objective, không phải counts trong kỳ. SLA target là phần trăm 0–100, paid lead target là số nguyên. Kết quả offline 219 backend +16 app PASS, build/typecheck PASS; Supabase/ChatGPT thật và review độc lập chưa nghiệm thu.
