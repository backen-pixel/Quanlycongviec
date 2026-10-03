# Khảo sát và khách cần xử lý theo nhóm quảng cáo

Trạng thái 03/10/2026: runtime3486c59 đã review mã PASS, local44 và Node22 828/0/0, full frontend build PASS; browser dữ liệu giả đạt các tình huống chính. Đang sửa phép quan sát khóa trong một ca PostgreSQL rồi chạy lại. Không phát hành hoặc mở quyền thực thi.

## Hành vi

`GET /crm/marketing-trials/:trialId/operations?company_id=...` nối nhóm khách trả phí đã quan sát với Messenger và hồ sơ khảo sát được khách xác nhận trong hệ thống. Quyền lấy từ phiên đăng nhập và công ty hiện hành. API chỉ đọc, mặc định tắt; cần `VPT_MARKETING_COHORT_OPERATIONS=1`, `VPT_MARKETING_TRIAL_REPORT=1` và DB primary.

Nhóm khách do `reportTrial` xác định bằng nguồn đầu tiên trong các ngày Việt Nam đã khép của kỳ, dùng nhận diện và chất lượng hiện hành. QUALIFIED/PENDING/REJECTED đều giữ trong nhóm trả phí; hiển thị riêng từng trạng thái. Khách cũ, tự nhiên, nguồn chưa rõ, nhận diện chưa đối soát, biểu mẫu chưa xử lý và bằng chứng chưa nối giữ riêng. Không coi số đã nối là toàn bộ khách của nền tảng.

Lịch hẹn thuộc nhóm theo nguồn khách, không theo ngày hẹn. Lịch sau khi kỳ quảng cáo kết thúc vẫn hiện. Báo cáo giữ thời điểm tiếp nhận/cutoff riêng với thời điểm tình trạng chăm sóc; ACK chỉ là nhận bàn giao, lịch qua giờ chưa chứng minh đã khảo sát xong.

“Khách cần rà / xử lý” là hợp các nhóm có việc CARE/SURVEY, chờ xác minh nhu cầu, hoặc khách QUALIFIED/PENDING chưa có hội thoại nối đúng nhóm. Loại trùng trên toàn bộ dữ liệu trước khi giới hạn danh sách 50 dòng. Thiếu kết nối chăm sóc không có nghĩa khách chưa được chăm bên ngoài và không cấp quyền liên hệ. STOP giữ nguyên; nghĩa vụ lịch đã xác nhận vẫn hiển thị. Các nhóm bị REJECTED không tự phát sinh việc liên hệ do thiếu hội thoại.

Mỗi khách có thể có nhiều hội thoại/lịch. Số khách, số việc và số lịch ghi đơn vị riêng. Thông tin liên hệ, địa chỉ khảo sát, nội dung tin nhắn, token và bằng chứng nguồn riêng không xuất ra báo cáo. Ánh xạ mất/khác công ty giữ số hồ sơ chưa quy thuộc, không đoán nhóm hoặc trả tên khách ngoài phạm vi.

## Đồng nhất dữ liệu và quyền

SQL678 đưa phép đọc vận hành thành helper STABLE dùng chung cho bảng toàn công ty và bảng theo kỳ. Trial facts, identity và operations được đọc trong một câu SQL với cùng MVCC snapshot. Helper nhận đúng inventory từ trial, dùng cùng asOf; backend từ chối lệch phạm vi, thời điểm, identity hoặc nguồn bị cắt bởi giới hạn 5.000.

RPC công khai yêu cầu service_role ngay cả khi vô tình có grant thêm. Kiểm quyền công ty hiện hành sau khi helper quản trị đã chờ khóa. Helper riêng bị thu hồi quyền của cả service_role. Không có bảng mới, lệnh ghi dữ liệu, gửi khách hoặc thay ngân sách.

## Kiểm chứng và hoàn tác

Unit/API/UI contract: 20 ca mới, 44 ca gồm các ca vận hành liên quan PASS cục bộ. Các ca PostgreSQL mới dùng booking qua dispatch/confirmation giả và bản ghi nguồn quảng cáo giả rõ ràng; kiểm quyền, lịch sau kỳ, mất/khác công ty, thay qualification+STOP trong lúc đọc, công ty mất quyền lúc chờ khóa. CI3486c59: 5/6 ca PostgreSQL mới PASS, ca quan sát chờ khóa dùng service_role không nhìn được wait_event của phiên khác nên thất bại trước assertion kết quả; log cho thấy RPC vẫn từ chối sau commit. Đổi observer sang kết nối chủ DB thử và xóa cache pg_stat mỗi lượt, không đổi runtime hay nới quyền ứng dụng. Chờ kết quả chạy lại.

Browser được kiểm qua công cụ hỗ trợ, component thật + API giả, CSP connect-src none: số nhóm/việc/lịch; lịch2027 sau kỳ2026; lỗi nguồn ẩn số cũ; STOP bỏ việc CARE nhưng giữ lịch; đổi actor trong lúc phản hồi cũ chậm không khôi phục lịch; bảng theo kỳ vẫn hoạt động khi report cha lỗi. CSS fixture chỉ phục vụ kiểm chức năng, chưa nghiệm thu toàn bộ giao diện production.

Tắt `VPT_MARKETING_COHORT_OPERATIONS` để ngừng bảng theo kỳ. SQL678 chỉ đọc; bảng toàn công ty tiếp tục gọi helper chung. Nếu cần quay toàn công ty về bản cũ, phát hành một migration mới khôi phục định nghĩa public RPC từ SQL673, không sửa file migration đã chạy. Không xóa lịch, nguồn khách hoặc bằng chứng.

Full goal ACTIVE: còn điểm nhận khác, cấu hình AI/lịch/ngoại lệ, UAT đúng phiên bản và Founder release. Không dùng kiểm thử giả để tuyên bố dữ liệu thật đạt250k hay cho phép chi.
