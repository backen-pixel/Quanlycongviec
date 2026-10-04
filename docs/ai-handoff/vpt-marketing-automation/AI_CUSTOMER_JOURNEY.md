# Hành trình tích hợp AI Marketing–CRM

Ngày 04/10/2026. Trạng thái: mã kiểm thử đã chuẩn bị; syntax PASS, PostgreSQL/CI và review cuối đang chờ. Đây là kiểm chứng trên fixture cô lập, không phải UAT vận hành hoặc phê duyệt chạy thật.

CI9f7a23c: intake502PASS/2FAIL gồm ca journey và parent; takeover/STOP PASS. Journey dừng trước AI vì fixture công ty dùng chung vượt giới hạn source_inventory (100accounts/100Pages/1000bindings/1000forms). Bản sửa tạo tenant/company/users/region/account/pipeline/source/library riêng trong journey.fixture, giữ signed intake và các RPC nghiệp vụ; không lọc nguồn hoặc nâng giới hạn. Assertion inventory.complete=true, đúng2accounts/1Page trước hành trình. Restore harness chọn công ty thực sự có receipt AUTHORIZED/UNKNOWN để kiểm bảo toàn reservation, thay vì chọn ngẫu nhiên công ty chỉ có usage thành công. Không đổi runtime/SQL. Cần CI mới chứng minh nhánh happy đầy đủ.

## Điểm nối cần chứng minh

Các checkpoint trước kiểm từng chức năng hoặc dùng hàm infer giả ở lượt khảo sát. Ca mới tại facebookCustomerCare.journey.cases.js giữ cùng Lead/Customer/thread/Agent qua cả lượt ANSWER và SURVEY; cả hai đi qua careRuntime và Responses adapter thực, chỉ HTTP nhà cung cấp được giả lập.

Fixture đầu đi qua webhook Lead Ads có chữ ký, Graph reader, lệnh CRM nguyên tử và hội thoại ký. Người vận hành liên kết danh tính và xác minh khách bằng RPC; mô hình không tự xác minh danh tính hoặc đánh dấu Lead hợp lệ. Owner DB chỉ tạo cấu hình/enrollment giả và đọc assertions; các dịch vụ nghiệp vụ dùng service_role qua giao tiếp SQL thực. Không seed các kết quả tư vấn, usage, send attempt, proposal, booking hoặc handoff.

## Tiêu chí kiểm

- Tiền quảng cáo được thu qua actual collector và publication cho mọi account thuộc công ty; account không có Lead vẫn đóng góp50.000đ vào tổng250.000đ giả. Tạo kỳ đo theo ngày đóng ở múi giờ Việt Nam.
- Khách bắt đầu PENDING; xác minh đúng nguồn làm tăng một nhóm hợp lệ. Intake lặp giữ một source proof và một hồ sơ.
- Lượt ANSWER ghi receipt dưới danh tính Agent, chọn nguyên văn câu đã duyệt; send policy riêng gắn đúng entry/version. ACK chưa có echo không mở lượt inference tiếp; echo có chữ ký mới nối đủ lịch sử.
- Lượt SURVEY qua cùng Responses adapter, dùng trích dẫn yêu cầu/địa chỉ từ alias message thực. Domain chọn người/lịch trống từ roster và phạm vi policy; mô hình không chọn người, giờ hoặc tự xác nhận.
- Proposal chưa tạo lịch. Click ký trước ACK được giữ chờ; khi đủ ACK/echo/click thì tạo đúng một booking/event/participant/handoff. Gửi lại cùng dữ liệu hoặc đổi worker không gửi/đặt trùng.
- Outcome xác nhận lịch được gửi qua worker, người khảo sát đọc hội thoại/câu tư vấn/địa chỉ rồi ACK một lần; dashboard cohort phản ánh lịch và bàn giao đang chờ/đã nhận. Kiểm actual API và bộ kiểm dữ liệu frontend.
- API chi phí thấy hai receipt/60token, dự phòng4.000đ; actualCostVnd vẫn NULL vì không có hóa đơn. Phạm vi công ty sai trả403.
- STOP sau đặt lịch giữ lịch và dừng các worker. Takeover hoặc STOP ký trong lúc chờ HTTP mô hình giữ usage nhưng không công bố câu trả lời.
- Lỗi lấy spend mới làm số chi và CPQL không xác định, không lấy số cũ/0 để kết luận đạt.

## Giới hạn và cổng tiếp theo

Kịch bản HTTP AI được lập sẵn để kiểm giao tiếp/alias/quyền/usage, chưa chứng minh chất lượng một mô hình thật hoặc nhu cầu khách thực tế. API/backend và bộ kiểm frontend được gọi trực tiếp, chưa thay kiểm browser/router/auth session/deployment. Lịch, nội dung, Page, model/key, tài khoản và quyền đều là giả trong cluster cô lập.

Ca hành trình này không xác nhận đầy đủ census/provenance của phạm vi quảng cáo; CPQL công bố phải còn NULL, targetMetToDate=false. Các ca phạm vi đo riêng vẫn cần kết hợp với dữ liệu vận hành thật trước phát hành; không suy ra mục tiêu250.000đ đã đạt.

Cần chốt nội dung, người nhận/lịch và chi phí AI, kiểm cấu hình/nguồn/chuyển luồng, UAT đúng phiên bản rồi Founder duyệt phát hành. Hoàn tác của thay đổi này là bỏ require/file kiểm thử nếu cần, không đổi migration hoặc dữ liệu vận hành. Full goal ACTIVE; chưa cấp quyền, gọi provider thật hoặc phát hành.
