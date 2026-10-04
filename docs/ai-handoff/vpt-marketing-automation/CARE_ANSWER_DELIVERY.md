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

Runtime`c822e3354b3a59008e362274ce596711236f248e`, bản kiểm`a38843349af385455876f9d1a4f96289a7c81779`, tree`5178ac0e6114c0972063ae4e3ef96a460a89b5b5`. [Automation37193667132](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37193667132) cả10job SUCCESS: Node18/22 jobs111410939119/111410939054 mỗi bản1.385PASS/0fail/0skip; intake PostgreSQL111410939371 đạt469/0/0, gồm21ca mới; build111410939047 đạt10.335modules/32,70s. [Report37193667124](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37193667124) và [Messenger37193667127](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37193667127) SUCCESS. CI merge`a97254a20fca26a4f36e61171ada15ee88335313` khớp tree, parents`e16c885ae7c2305645be02a1227bf378cb59137f` + bản kiểm.

Local1.380PASS/5skip/0fail gồm11ca transport mới; CI thêm native/Express. PostgreSQL21ca mới kiểm runtime→SQL→Meta giả→signed echo/ACK, quyền và nguồn đổi, hai worker, STOP, lease hết khi chờ, mất ACK/restart, cap, nguồn/tệp/câu dài, thứ tự ACK/echo, scope, cạnh tranh với survey/outcome và recovery/ingress hai thread có UUID ngược PSID. Reviewer độc lập đối chiếu published blobs/log/tree và kết luận PASS checkpoint trên a388433 (runtime c822e33); không còn finding chặn trong phạm vi đã rà. Kết luận chỉ áp dụng PostgreSQL cô lập và provider giả, không thay UAT/chuyển luồng hoặc phê duyệt phát hành.

Lịch sử kiểm chứng: CI đầu7e0670b448/19 do cột payload trùng tên biến trong phép đếm hạn mức; đã sửa alias. Bổ sung giới hạn lease theo hạn publisher. Reviewer phát hiện thứ tự khóa recovery khác signed ingress; đã đổi sang Page/PSID và có regression đạt.

Bảnc822e33 có PostgreSQL467/2 (một subtest và parent). Fixture câu dài sửa một entry APPROVED bất kỳ nên không bảo đảm là câu mô hình chọn; a388433 thay bằng actualcontextentry0, SAVE/APPROVE đúng câu qua service, assert2001ký tự trước FINISH và giữ yêu cầu HELD. Kết quả469/0/0 ở bản kiểm cuối mới là bằng chứng nghiệm thu, không dùng các bản lỗi làm PASS.

Chưa chứng minh chất lượng chọn câu của model thật, API/tài khoản thật, giao diện ngoại lệ, AI tự đề xuất lịch và khách xác nhận, người nhận/lịch thật hoặc nghiệm thu/phát hành. Full goal ACTIVE; chỉ tiêu250.000đ/khách hợp lệ cần dữ liệu vận hành, không suy từ kiểm thử giả.
