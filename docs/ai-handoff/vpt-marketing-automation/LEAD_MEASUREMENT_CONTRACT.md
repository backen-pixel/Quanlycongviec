# Hợp đồng đo khách hợp lệ — V2

Founder cập nhật mục tiêu thử 250.000 VND/khách. Giữ định nghĩa khách hợp lệ đã chốt: khác nhau, có nhu cầu thuộc sản phẩm VPT, trong vùng phục vụ, thông tin liên hệ dùng được. Chỉ số hiện tại không cần nguồn kế toán; không chứng minh doanh thu hoặc tỷ lệ 7%.

## Nguồn được phép

`measureLeadTrial` là phép tính thuần nhận bản đọc do server chuẩn bị, chưa là endpoint hay dịch vụ đang chạy. Model/HTTP body không được tự cung cấp `sourceVerified`, `coverage`, quyền công ty, hoặc bằng chứng xác minh. Chỉ adapter đã nghiệm thu mới dựng snapshot này.

- `canonicalLeadId` là định danh CRM **sau đối soát và ghép các lượt khách trùng liên kênh**. Không mặc định raw `crm_leads.id`, platform Lead ID, tên, số điện thoại chưa chuẩn hóa là định danh duy nhất. Calculator không tự ghép hai ID khác nhau; mapping và bằng chứng merge thuộc CRM.
- Mỗi khách có một nguồn đầu tiên có bằng chứng trả phí theo `FIRST_VERIFIED_PAID_LEAD_V1`; các điểm chạm khác lưu riêng. Account, công ty, trial và thời điểm tiếp nhận phải khớp. Khách cũ/tự nhiên ngoài cohort không đưa vào nguồn này.
- Mỗi khách có một kết quả xác minh hiện hành: `QUALIFIED`, `PENDING`, `REJECTED`. Kết quả đã quyết phải có evidence, người/bộ quy tắc được duyệt, thời điểm. `QUALIFIED` yêu cầu cả liên hệ, nhu cầu và vùng phục vụ được xác minh. Nhãn ấm/nóng hay điểm AI không thay các bằng chứng này.
- `spend` gồm toàn bộ tài khoản/chiến dịch được khai báo trong trial, cả phần không tạo khách. Trước khi mở trial phải có registry và mốc bắt đầu/kết thúc để tính cả Facebook hiện hữu, cùng cơ chế tránh chi ngoài hạn mức. Báo cáo cũ chỉ lấy ads có Lead chưa đủ nguồn này.
- Độ đầy đủ kiểm riêng chi tiêu, khách, xác minh và nguồn; kiểm phân trang, lỗi nền tảng, tiền tệ VND, độ mới. Không chứng minh được một nguồn thì UNKNOWN; không dùng số 0 thay lỗi.

## Kết quả và giới hạn

Chi phí = toàn bộ chi quảng cáo / số canonical Lead có trạng thái QUALIFIED. PENDING và REJECTED báo riêng. Nếu chưa có khách hợp lệ thì chi phí là null và mục tiêu chưa đạt. Cùng receipt hoặc cùng canonical Lead chỉ tính một lần; snapshot mâu thuẫn phải đối soát, không tự chọn bản thuận lợi.

Xác minh có thể đến sau khi kỳ chi kết thúc; báo cáo theo thời điểm quan sát và cập nhật lại khi khách bị loại. `targetMetToDate` chỉ mô tả snapshot đủ nguồn lúc đó; không phải cam kết hoặc quyền tăng tiền. `allowBudgetExecution` luôn false. Điều chỉnh vẫn qua policy7ngày/10khách/10%/48h/80-20, dữ liệu so sánh tương đương, transaction giữ chỗ và giảm-trước-tăng-sau.

300 khách tại mục tiêu tương ứng75 triệu; trần100 triệu không buộc tiêu hết. Nếu dùng hết100 triệu cần ít nhất400 khách hợp lệ để chi phí <=250.000. Đây là phép tính từ mục tiêu, chưa là dự báo thị trường.

## Nghiệm thu adapter còn phải thực hiện

1. Cùng khách gửi lại qua Facebook và Google được CRM đối soát thành một canonical Lead, giữ hai receipt và bằng chứng nguồn.
2. Hai khách thật khác nhau không bị gộp chỉ vì tên/số liên hệ dùng chung; ngoại lệ chuyển người.
3. Pending thành qualified/rejected; qualified bị thu hồi; báo cáo cập nhật mẫu số đúng và giữ lịch sử.
4. Account không tạo Lead vẫn cộng spend; thiếu trang/quyền hết hạn/khác tiền tệ khóa phép kết luận mục tiêu và tăng ngân sách.
5. Sai công ty, gửi lặp, khởi động lại, lỗi giữa chừng thử với PostgreSQL và phiên bản tích hợp thực tế. Unit test calculator không thay UAT này.
