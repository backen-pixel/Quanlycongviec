# Nối hội thoại với hồ sơ CRM — đang triển khai

Ngày 03/10/2026. Bản làm việc dựa trên commit `14e11d5b503b570d34957f58e2835e09f75c7584`; thay đổi dưới đây chưa commit, chưa thuộc bằng chứng CI của bản đó. Trạng thái: **HOLD nghiệm thu điểm nối và toàn tuyến**, công việc tổng thể vẫn ACTIVE.

## Vì sao cần điểm nối này

Tiếp nhận biểu mẫu Lead Ads tạo Customer, Lead và bằng chứng quảng cáo nhưng không có PSID của người nhắn Messenger. Tiếp nhận hội thoại tạo thread/message; định tuyến chăm sóc hiện dựa vào liên kết trong `facebook_contacts`. Hai nguồn không mặc nhiên là cùng người.

Các ca khảo sát trước đã tạo sẵn liên kết contact–Lead. Các ca cohort đã thêm bằng chứng nguồn vào hồ sơ khảo sát có sẵn. Chúng vẫn chứng minh các hành vi thành phần đã ghi trong báo cáo, nhưng chưa chứng minh khách mới từ biểu mẫu đi xuyên tuyến vào chính lịch khảo sát đó. Không dùng fixture nối sẵn để công bố nghiệm thu xuyên tuyến.

## Bản đang xây

- SQL680 và API đọc/ghi liên kết cùng công ty; kiểm người thực hiện, Page, người phát hành phạm vi, Lead, Customer và người nhận CRM hiện hành.
- Lệnh giữ phiên bản đã đọc, mã yêu cầu bất biến, tin nhắn đầu vào làm bằng chứng, lời xác nhận và lý do của người vận hành; lưu liên kết cùng audit trong một giao dịch.
- Đây là xác nhận danh tính của người vận hành. Hệ thống không tự suy diễn từ tên/số điện thoại, không tự xác minh thay người, không phân loại khách hợp lệ hoặc tự mở gửi tin.
- Không ghi đè mapping đã có sang khách khác. STOP và trạng thái người tiếp quản được giữ.
- API tắt mặc định (`VPT_CARE_CONNECTIONS`); phạm vi Page riêng đang rỗng. Chưa có giao diện thao tác, chưa kết nối mô hình AI hoặc tác động hệ thống thật.

## Kiểm tra đã thực hiện

11 ca Node chạy cục bộ PASS trên adapter hiện tại: danh tính lấy từ phiên đăng nhập; từ chối thông tin vượt phạm vi; tắt mặc định/Primary; số điện thoại CRM được phép thiếu; lọc dữ liệu trả về; yêu cầu xác nhận bằng chứng; biên nhận đúng phạm vi; STOP/tiếp quản; lỗi nguồn; mất phản hồi và gửi lại đúng yêu cầu.

Reviewer phiên độc lập tìm thấy: quyền người phát hành chưa giữ khóa và projection không nhận phone=NULL. Đã sửa khóa người phát hành kèm kiểm FOUND, nhận phone=NULL, kiểm chế độ giao dịch ở row guard và từ chối bằng chứng nội dung NULL. **Chưa có kiểm thử PostgreSQL cho SQL680**, không suy ra an toàn đồng thời từ 11 ca Node.

Reviewer giữ HOLD vì hai điểm cần bằng chứng PostgreSQL. Bản đang kiểm đã bổ sung wrapper RPC639 lấy cùng gate trước khóa contact, gate/guard bảo vệ inverse link trên crm_leads, và đưa inverse khác Lead chọn vào trạng thái cần rà. Chưa có kết quả chạy cho bản sửa:

1. RPC cũ SQL639 lấy khóa contact trước global gate, ngược thứ tự với SQL680. Cần sửa đường gọi/chuyển đổi cùng thứ tự khóa và kiểm thử đúng RPC cũ chạy đồng thời; không chỉ kiểm lệnh UPDATE mô phỏng.
2. Contact có thể trống lead_id nhưng Lead khác vẫn có facebook_contact_id trỏ về contact. Cần nhận diện liên kết phục hồi này và đưa vào rà soát, không xem là liên kết lần đầu. Kiểm cả thay đổi đồng thời; không xóa hoặc đổi Lead cũ để làm ca kiểm thử thành công.

## Công việc tiếp theo, theo thứ tự

Đã thêm 10 ca PostgreSQL trong careConnections.cases.js, chạy sau migration679 và áp SQL680 hai lần. Ca xuyên tuyến dùng actual intake/receiver/dispatch và nguồn Meta giả, giữ cùng Lead từ intake tới cohort và bàn giao; chưa gọi AI model. Chưa nối toàn bộ chi tiêu và xác nhận phạm vi CPQL trong ca này, nên không được gọi là nghiệm thu đầy đủ. Gate trên INSERT Lead và thay đổi inverse là đồng bộ toàn hệ thống; phải đo tác động tải và tạm dừng đường cũ khi chuyển Page trước phát hành.

1. Khép hai điểm review trên; kiểm PostgreSQL cô lập cho sai công ty/quyền, thu hồi người phát hành, yêu cầu lặp, stale version, crash rollback, đường ghi cũ và liên kết phục hồi. Chỉ ghi PASS khi có bằng chứng đúng bản.
2. Hoàn thiện màn hình chọn hồ sơ, đọc bằng chứng và xác nhận; giữ yêu cầu chưa rõ kết quả qua tải lại, tránh gõ mã hồ sơ kỹ thuật. Review độc lập và kiểm giao diện bằng dữ liệu giả.
3. Tạo một khách mới qua webhook có chữ ký và nguồn Graph giả: intake → Lead thật của ca thử → hội thoại chưa liên kết → liên kết có bằng chứng → đánh giá hợp lệ → đề xuất lịch → khách xác nhận qua webhook → người khảo sát nhận → dashboard. Kiểm lại đúng Lead ID, không trùng, không bỏ chi tiêu, STOP và nguồn lỗi. Việc tư vấn bằng mô hình vẫn phụ thuộc quyết định cấu hình AI đang chờ, không gọi API trước quyết định đó.
4. Khi tuyến đạt, hoàn thiện cấu hình người nhận/lịch/ngoại lệ và hồ sơ vận hành, trình Founder gói phát hành cụ thể. Mở kênh tiếp theo theo quyền thực tế sau tuyến đầu.

## Giới hạn kinh doanh và hoàn tác

Mục tiêu hiện hành là 250.000đ/khách hợp lệ trả phí duy nhất. 300 khách ở đúng mức mục tiêu tương ứng 75 triệu; 100 triệu vẫn là hạn mức một đợt 30 ngày, gồm Facebook, không bắt buộc chi hết hoặc tự lặp lại. 7% doanh thu là đánh giá giai đoạn sau; không suy ra đạt 7% từ chi phí Lead.

Chưa có số liệu vận hành thật chứng minh đạt mục tiêu. Chưa merge, phát hành, cấp quyền ghi thật hoặc mở ngân sách. Hoàn tác bản thử ưu tiên tắt điểm nối và giữ biên nhận; không xóa lịch sử hoặc mở đường ghi cũ để bỏ qua kiểm soát. SQL680 chỉ là candidate, không áp vào DB thật.
