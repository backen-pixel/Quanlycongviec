# Bằng chứng Survey Proposal Console

**Bổ sung 03/10/2026:** kiểm xuyên tuyến sau đó phát hiện fixture browser dưới đây dùng giờ Z, chưa bao phủ timestamp +00:00 từ PostgreSQL. Lỗi API thật đã được sửa và kiểm ở b4e2def; xem [bằng chứng mới](CARE_CONNECTION_REVIEW.md). Kết quả cũ giữ giá trị trong phạm vi đã thử, không dùng riêng nó để chứng nhận đường SQL→API→UI→proposal.

Phiên bản kiểm chứng: `46c680b0fae31818b620eb85e89854907920c37a`, tree `702719718850026eaefb7e65d0d7c37c64876dd4`. Runtime từ `963e86246124927bb49e15a68b7fa457d52bd02e`; follow-up chỉ sửa observer PostgreSQL và tài liệu.

## Kiểm tự động
- [Automation37127443347](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37127443347): cả10 job SUCCESS.
- [Intake PostgreSQL111215528473](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37127443347/job/111215528473): **222 PASS /0 FAIL /0 SKIP**, gồm8 ca console mới214–221.
- [Census PostgreSQL111215528598](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37127443347/job/111215528598): **88/0/0** và HTTP **1/0/0**.
- [Node22 111215528590](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37127443347/job/111215528590): **842/0/0**; Node18 SUCCESS.
- [Frontend111215528599](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37127443347/job/111215528599): 10.327 modules,37,54 giây,SUCCESS.
- [Report37127443354](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37127443354) và [Messenger37127443388](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37127443388): SUCCESS.
- Git API xác nhận merge CI `9c1a818dc643385dbf9c01558ee57773acca180a` có parent base `e16c885ae7c2305645be02a1227bf378cb59137f` và bản kiểm chứng46c680b; tree bằng đúng7027197.

Local30 ca liên quan PASS (14 mới); reviewer độc lập tự chạy30ca. PostgreSQL fixture chạy migration hai lần và giữ các phép thử:
1. Browser anon/authenticated bị từ chối kể cả grant nhầm public RPC; service_role không gọi được helper private; sales/sai công ty bị từ chối.
2. OPEN/QUEUED khác BOOKED/SENT/thông báo kết quả; token/payload/PSID không có trong dữ liệu console.
3. Lead/customer đổi công ty và contact đổi Lead/customer che lịch sử, từ chối chi tiết/replay; Page đổi công ty từ chối cả list.
4. STOP giữ lịch sử và biên nhận cũ; không tạo đề xuất mới.
5. UNCERTAIN khóa yêu cầu mới; replay không tạo thêm proposal hoặc reset delivery.
6. Lead chuyển công ty trong lúc đọc không trộn hai snapshot; lần đọc sau che dữ liệu.
7. Người/công ty mất quyền không dùng được list/read/replay.

## Lỗi phát hiện và xử lý
- Reviewer P2: StrictMode cleanup không mở khóa, lần mount sau có thể kẹt. Đã reset khóa và kiểm thực tế dưới React.StrictMode.
- Reviewer phát hiện fixture tạo OPEN trước worker booking cùng Page có thể bị drain ngoài ý định. Đã tạo booking trước, giữ assertion OPEN/QUEUED.
- Candidate963e862:9/10 job; census ca cũ66 thất bại observer không thấy Lock. Observer ở transaction giữ snapshot pg_stat_activity.46c680b gọi pg_stat_clear_snapshot mỗi poll, cho tối đa5 giây; vẫn yêu cầu active/Lock, lỗi40001 và không ghi audit. Không sửa runtime hay cấp thêm quyền. Bản sau đạt cả10job.

## Trình duyệt cục bộ
Do bên triển khai thực hiện qua công cụ trình duyệt được hỗ trợ. Actual `SurveyProposals` trong React development StrictMode; API giả, CSP connect-src none, không đăng nhập hoặc kết nối Meta/CRM thật.
- Mount hai lần không kẹt; màn hình mở lịch sử và cho tìm giờ.
- Nhập ngày giờ Việt Nam02/01/2027 08–09h, chọn option, nhập địa điểm giả.
- Mô phỏng POST lưu xong mất phản hồi: có pending, khóa tạo mới. Reload giữ yêu cầu; chuyển actor không thấy pending của người trước.
- Quay về actor cũ và giả lập STOP: có thể đối chiếu đúng UUID/body cũ; tổng số tạo thực vẫn1. Receipt nói đã lưu đề xuất, chưa giữ chỗ.
- UNCERTAIN hiển thị rào gửi và khóa tạo. Liên kết đổi che địa điểm/lịch sử riêng. Nguồn lỗi ẩn bảng cũ.
- GET cũ chậm, đổi actor và phạm vi: phản hồi muộn không khôi phục địa chỉ đã che.
- Option hết hạn: radio/nút tạo khóa và yêu cầu tìm lại.
- Lịch sử ghi rõ là giờ/địa điểm tại thời điểm đề xuất, không xác nhận lịch canonical còn nguyên.
Tab/server thử đã đóng. CSS fixture chỉ phục vụ kiểm chức năng, chưa là nghiệm thu đầy đủ giao diện production. Reviewer không tự nhận là người thực hiện browserQA.

## Review và giới hạn
Reviewer độc lập kết luận PASS đúng bản46c680b sau khi tự đọc log intake/census/Node22/build, kiểm cả10job và hai workflow report/Messenger. Không còn finding chặn trong increment; reviewer không xác nhận UAT, Meta thật hoặc hoàn tất full goal.
Không production/UAT, dữ liệu thật đạt250k, mở quyền AI, tạo chi hoặc khởi động đợt thử. Default flags/enrollment giữ nguyên. [Hợp đồng và hoàn tác](SURVEY_PROPOSAL_CONSOLE.md).

Bước tiếp: kiểm xuyên tuyến tiếp nhận→khách hợp lệ→chăm sóc→khảo sát→dashboard, chốt các ngoại lệ gửi/lịch và đường lịch cũ còn thiếu; nối cấu hình đã xác nhận và kiểm vận hành/khôi phục trước gói Founder release. Lựa chọn khóa OpenAI, lịch và người nhận đã có câu hỏi chờ; không tự đặt hoặc hỏi lặp. Full goal ACTIVE; các kênh khác chưa được coi là đã vận hành.
