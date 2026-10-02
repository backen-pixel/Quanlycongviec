# ADR-0015 — Marketing là mô-đun nghiệp vụ tích hợp Business AI OS

Ngày: 2026-10-01. Issue: #15. Trạng thái: **IN PROGRESS — implementation candidate**.

Founder yêu cầu triển khai hướng tích hợp trong cuộc trao đổi ngày 01/10/2026. Quyết định này cho phép làm nhánh kỹ thuật có kiểm soát; không đồng nghĩa phê duyệt merge, sửa quyền, migration, deploy hay chi quảng cáo. `AGENTS.md` hiện hành vẫn áp dụng. Tài liệu này không tuyên bố toàn bộ Architecture V2 đã được triển khai.

## Quyết định và ranh giới

Marketing là một mô-đun nghiệp vụ, không phải CRM thứ hai hoặc một Business AI OS riêng. Giữ dự án/kết nối đang có. Dùng chung chuẩn công việc, quyền, phê duyệt, bằng chứng và nhật ký; ranh giới dữ liệu, thương hiệu, tài khoản và ngân sách vẫn riêng. VPT là phạm vi đầu tiên; mở rộng sang công ty khác cần cấu hình và kiểm thử riêng, không hardcode cặp công ty.

Founder → giao diện điều hành → ranh giới kiểm soát → mô-đun Marketing, CRM/Sales, Khảo sát/Thiết kế/Báo giá, Sản xuất/Giao lắp, Kế toán/Chăm sóc. Năng lực AI và công cụ hỗ trợ các mô-đun, không sở hữu luật nghiệp vụ. Sáu hệ là góc nhìn quản trị xuyên suốt, không phải sáu cơ sở dữ liệu.

ChatGPT là đầu mối tương tác khi Founder làm việc trong cuộc trò chuyện. Không coi một phiên chat là tiến trình thường trực. Công việc tự động cần runtime/lịch/hàng đợi đã triển khai riêng và có kiểm soát. Không tạo thêm persona CEO cho marketing; cũng không xóa CEO Minh hoặc agent hiện có trước khi kiểm kê trách nhiệm, lịch chạy và kế hoạch thay thế được nghiệm thu.

## Quyền sở hữu sự thật

| Phạm vi | Nguồn chính thức / trách nhiệm |
|---|---|
| Mã, quyết định kỹ thuật, phiên bản | GitHub và quy trình review của repository |
| Luật nghiệp vụ và quyền | Backend/domain hiện hành; middleware và DB giữ nguyên |
| Nhu cầu khách, người nhận, Lead→Deal | CRM; marketing không tự chuyển Deal hoặc tạo luật chấp nhận Lead |
| Chi tiêu, phân phối, nội dung đã công khai | Nguồn nền tảng có định danh và thời điểm đọc; lịch đăng không phải receipt công khai |
| Hợp đồng, doanh thu, tiền thực thu | Hồ sơ nghiệp vụ/kế toán riêng; không đồng nhất ba chỉ số |
| Tổng hợp và ngoại lệ | Dashboard là projection có nguồn/thời điểm, không tự tạo số liệu |
| Bộ nhớ AI | Hỗ trợ bàn giao, không thay hồ sơ chính thức hoặc quyết định quyền |

## Phần triển khai M0

Thêm helper thuần `backend/src/helpers/marketingEvidenceContract.js` và kiểm thử synthetic. Đây là hợp đồng quan sát dữ liệu đã chuẩn hóa, chưa được nối vào bất kỳ route/worker nào. Không mở HTTP API mới, không thêm bảng, hàng đợi, lịch, credential hay npm dependency; không đọc `.env` hoặc chạy server.

Helper nhận `trustedContext` do backend xác thực riêng, ba nguồn `source`, `crm`, `attribution` và chính sách độ mới tường minh. Nếu phạm vi tenant/company sai: không trả số liệu. Không có dữ liệu, đọc lỗi hoặc dữ liệu quá cũ: `UNKNOWN`, không đổi thành 0. Tin nhắn nền tảng không phải lead CRM đã chấp nhận. UTM chỉ phân loại nguồn, không chứng minh paid click. Kết quả `LINKED` chỉ phản ánh quan sát đầu vào đã được adapter tin cậy xác minh; không phải kiểm chứng chữ ký hoặc live E2E do helper tự thực hiện.

Không tính CPL/ROI trong M0: chưa có phép đối soát cohort/kỳ báo cáo và lead hợp lệ để chia chi phí. Không đọc trực tiếp toàn bộ CRM/PII để tạo báo cáo.

## Tích hợp và bảo mật

Mọi adapter tương lai phải giữ tenant, company, quyền trường dữ liệu, thời điểm đọc, phiên bản nguồn và error taxonomy; xác minh chữ ký/referral/receipt ở biên nguồn thật trước khi đặt `verified=true`. Không chấp nhận giá trị đó từ HTTP body, UTM hoặc câu trả lời model. Hash event là khóa giả danh, không phải ẩn danh hay chứng minh quyền. Chống trùng bền vững vẫn thuộc writer/DB hiện hành.

Mỗi dữ liệu có một writer theo phạm vi. Đối chiếu lịch/checkpoint đang có trước khi thêm bất kỳ tác vụ định kỳ nào. Không thay dashboard production hoặc checkpoint giám sát bằng dữ liệu synthetic. Không tự tạo một Control Plane tổng quát mới trong CRM chỉ để hợp với sơ đồ.

## Đánh đổi và cổng tiếp theo

Ưu điểm: bước đầu nhỏ, có kiểm thử, không đổi hành vi đang chạy; chuẩn hóa ranh giới trước khi kết nối thật. Giới hạn: chưa tăng khả năng thu lead hoặc chứng minh campaign đang có lead; chưa enforce một Policy Engine toàn hệ thống.

M1: adapter chỉ đọc, xác minh đúng target và quyền/schema trên môi trường được phép. M2: source→CRM/người nhận đúng→báo cáo, fault/retry/duplicate/company isolation và so sánh shadow. M3: review + staging + quyền phát hành cụ thể + rollout/rollback, sau đó mới sử dụng kết quả làm căn cứ vận hành. Không coi merge/deploy là nghiệm thu đo lead.

Hoàn tác M0: bỏ/revert đúng helper, test và tài liệu bổ sung; không xóa Lead/contact/receipt/evidence. Không sửa luật Lead→Deal, database, quảng cáo, runtime hoặc quyền bằng ADR này.
