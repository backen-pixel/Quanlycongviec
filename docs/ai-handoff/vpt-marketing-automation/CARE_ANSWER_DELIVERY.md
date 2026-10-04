# Gửi câu tư vấn đã được cấp quyền riêng

Ngày 04/10/2026. Tiếp nối [runtime tư vấn](CARE_RUNTIME.md). Mục tiêu là đưa câu ADVICE/QUALIFY đã duyệt đến khách qua transport được kiểm soát; không coi DRAFT hay quyền gọi mô hình là quyền gửi. SQL694 và worker mới mặc định chưa có policy, cờ gửi tắt. Không enrollment, token thật, gọi Meta hoặc phát hành trong thay đổi này.

## Quyền và điểm quyết định

`send_policies` private gắn Agent, grant, công ty, Page, app, Graph version, credential hash, kỳ hiệu lực, hạn mức số tin và tham chiếu phê duyệt. `allowed_entries` chỉ rõ ID và phiên bản từng câu được phép tự gửi. Nội dung policy bất biến; thay active xoay authorization ID. Không có API để AI tự thêm policy hoặc nới hạn mức.

CLAIM kiểm lại runtime/grant, đúng lượt DRAFT, ngữ cảnh và nguồn hiện hành, phiên bản câu trong danh sách được duyệt, thông tin nhận khách và trạng thái WAITING. Chỉ gửi nguyên văn câu tối đa2.000 ký tự; không ngầm cắt/chia câu dài. Latest inbound phải chính tin đã sinh lượt, có chữ, không yêu cầu STOP/người xử lý, không ở tương lai và trong24giờ. Lịch sử có tệp đính kèm chuyển người xử lý vì adapter hiện chỉ hiểu văn bản.

Điểm cấp quyền gửi là commit trả payload một lần. Lease tối đa5giây, bị giới hạn tiếp bởi grant, send policy, draft, nguồn và cửa sổ phản hồi. Worker kiểm lại cờ/phạm vi/thời hạn ngay trước HTTP. Thu hồi hoặc STOP được ghi trước CLAIM chặn gửi; không thể hủy chắc chắn HTTP đã được cấp trong lease hoặc đã bắt đầu. Giữ bằng chứng các trường hợp này, không tuyên bố STOP thu hồi được một tin đã tới nền tảng.

Nền tảng giới hạn trả lời thông thường trong cửa sổ24giờ sau tin của khách; triển khai chỉ dùng RESPONSE, chưa hỗ trợ gửi ngoài cửa sổ. Nguồn: [Meta Messenger API chính thức trên Postman](https://www.postman.com/meta/messenger-platform-api/folder/vilwbh4/send-api). Trang tài liệu developers.facebook.com không đọc được ở phiên này (429); phải nghiệm thu quyền/app/version/echo trên đúng tài khoản trước mở thật.

## Ghi nhận và chống lặp

Một `send_attempts` duy nhất trên runtime request lưu payload, nguồn, policy snapshot, danh tính thực thi và thời hạn. Trạng thái HELD/SENDING/SENT/UNCERTAIN/CONFLICT khác nhau. Các lệnh gửi lại không trả payload; worker không retry POST kể cả timeout, mất ACK hoặc khởi động lại. Retry chỉ ghi cùng receipt, tối đa3 lần. Receipt lớn/quá hạn/lỗi đều giữ ngoại lệ, không lộ token hoặc nội dung provider trong log.

ACK là bằng chứng nền tảng nhận tin, chưa chứng minh khách đọc. Echo chỉ là bằng chứng hội thoại, không tự đổi thành SENT. Đối chiếu app, Page, PSID, metadata, nội dung, tệp, thời điểm và MID. Sai MID/recipient chuyển CONFLICT; không ghi đè OPTED_OUT/HUMAN_ACTIVE. Receipt sau thu hồi grant vẫn ghi được vì là sự kiện lịch sử.

Thread lock dùng chung với survey/outcome. `delivery_busy` chặn SENDING/UNCERTAIN/CONFLICT và câu tư vấn đã ACK nhưng chưa có echo. `answer_context_busy` còn chặn suy luận khi survey/outcome đã ACK nhưng chưa vào transcript. Không tạo tin inbound giả để bù echo. Khi thiếu echo quá1phút, giữ SENT cùng ACK và chuyển hàng chờ đối soát; không tự mở lại AI khi echo tới muộn.

Khóa CLAIM: quyền → policy → run → thread → attempt. ACK/echo/recovery: thread → attempt, không quay lại khóa run. `crm_care_runtime_read` trả metadata delivery riêng với trạng thái stale của draft; echo làm draft stale không có nghĩa gửi thất bại.

## Cấu hình, quan sát và hoàn tác

`VPT_CARE_RUNTIME_SEND` và policy UUID riêng mở sender; các biến principal/company/grant/Page xác định phạm vi. `VPT_CARE_RUNTIME_ECHO` cùng Page nhận được bật độc lập với `VPT_SURVEY_CONFIRMATIONS`; không cần bật booking để nhận echo tư vấn. Tắt gửi vẫn giữ echo/recovery đối soát. Legacy sender tiếp tục bị chặn trên Page đã đưa vào care.

Worker đăng ký trong registry stop/drain. Khi hoàn tác: tắt SEND để ngừng cấp việc mới, dừng/chờ công việc đã nhận, giữ ECHO và quyền đọc để đối soát. Không xóa attempt/quota, tự requeue UNCERTAIN hoặc dùng Backup. Hạn mức đếm các attempt đã cấp payload, kể cả không rõ kết quả, không chỉ tin ACK.

## Kiểm chứng

Local:1.380PASS/5skip/0fail, gồm11ca transport mới. PostgreSQL bổ sung19ca đang chờ CI: runtime→SQL→Meta giả→signed echo/ACK, quyền và nguồn đổi, hai worker, STOP, lease hết khi chờ, mất ACK/restart, cap, nguồn/tệp/câu dài, thứ tự ACK/echo, scope và cạnh tranh với survey/outcome. Reviewer độc lập đang rà đúng mã.

Chưa chứng minh chất lượng chọn câu của model thật, API/tài khoản thật, giao diện ngoại lệ, AI tự đề xuất lịch và khách xác nhận, người nhận/lịch thật hoặc nghiệm thu/phát hành. Full goal ACTIVE; chỉ tiêu250.000đ/khách hợp lệ cần dữ liệu vận hành, không suy từ kiểm thử giả.
