# Theo dõi hoạt động AI và đóng lượt chờ

Ngày 04/10/2026. Phần tiếp theo của [runtime](CARE_RUNTIME.md), [gửi câu tư vấn](CARE_ANSWER_DELIVERY.md) và [khảo sát](CARE_SURVEY_RUNTIME.md). Thêm tab **Hoạt động AI** trong Chăm khách; chỉ dùng API đọc/đóng đã có. Không thêm SQL, backend rules, enrollment hoặc quyền gửi.

## Hành vi

- Lịch sử công ty phân trang20 lượt; phân biệt RUNNING/DRAFT/REVIEW/FAILED, quá hạn và Page không còn đúng phạm vi. Đây là lượt AI, không phải số khách hợp lệ hay tổng hàng chờ.
- Chi tiết phải khớp company/request/thread/principal/grant đã chọn. Server vẫn kiểm người truy cập và phạm vi hiện tại. Nội dung mất nguồn/ngữ cảnh/quyền bị ẩn; lịch sử gửi không bị chuyển thành số0 hoặc kết luận chưa gửi.
- Hiển thị câu từ nguồn đã duyệt và nhu cầu trích dẫn chưa xác minh; ACK và echo riêng, không suy ra khách đã đọc.
- Kết quả SURVEY chỉ cung cấp proposalId để đọc lại proposal console theo quyền hiện tại. Hiển thị OPEN/BOOKED/REJECTED/SUPERSEDED, gửi đề xuất và liên kết hồ sơ bàn giao. DRAFT hoặc Meta nhận tin không đồng nghĩa đã đặt lịch. Hồ sơ không còn trong50đề xuất gần nhất hiển thị giới hạn tra cứu; không suy đoán đã đặt.
- Bấm mở hàng chờ người xử lý nạp mới HUMAN_REQUESTED. Bàn giao lịch sử không chứng minh hiện có người tiếp quản; lịch đã lưu không chứng minh đã khảo sát xong.
- Đóng chỉ cho RUNNING, lý do ít nhất20ký tự. Lưu ID/nội dung yêu cầu trong sessionStorage theo actor/company trước POST; mất ACK giữ nguyên để đối chiếu. Đọc được terminal result không xóa pending close. Chỉ đúng receipt company/thread/command/runtime target mới xóa. Không tự POST khi mount/reload, không gọi lại mô hình hoặc gửi lại tin.
- Đóng không hủy HTTP provider đã nhận/claim, hoàn phí, hủy tin hoặc lịch. Nội dung xác nhận nói rõ giới hạn. sessionStorage chỉ giữ trong phiên tab; không là kho audit lâu dài hoặc khóa liên tab. Server693 xử lý đóng đồng thời bằng trạng thái run/receipt.
- Lỗi đọc ẩn dữ liệu cũ. Đổi actor/company và rời tab unmount panel, vô hiệu phản hồi muộn; quay lại đọc mới. Storage không xác minh được khóa thao tác đóng, vẫn cho đọc.

## Kiểm chứng cục bộ

10ca mới `facebookCustomerCare.runtimeConsole.test.js` kiểm scope/cursor/duplicates, masked draft, survey không tự booking, UNKNOWN/ACK/echo, RUNNING/terminal, durable pending/receipt/reload/actor-company và storage lỗi. Local toàn bộ workflow: **1.393PASS/0FAIL/5SKIP** (hai native process và ba Express theo môi trường, chờ CI Linux). esbuild bundle actual Workspace với API giả thành công.

Browser được hỗ trợ tại localhost5195, actual Workspace/React StrictMode, API giả và CSP `connect-src 'none'`:

1. ANSWER hiển thị nguyên văn có `<script>` dưới dạng chữ; UNCERTAIN hiển thị ACK/echo chưa có, không có nút gửi lại.
2. SURVEY OPEN hiển thị chưa giữ chỗ; chuyển fixture BOOKED rồi đọc lại mới hiện lịch đã lưu, không khẳng định đã nhận bàn giao.
3. Thu hồi nguồn che câu tư vấn, giữ bằng chứng gửi lịch sử.
4. CLOSE mất ACK→reload→READterminal vẫn giữ pending; đổi actor không lộ pending của actor khác; trở lại actor cũ và replay cho POST2 nhưng duy nhất1command, sau đúngACK mớiclear.
5. DelayedREAD qua companyA→B→A và care→runtime không hiện lại chi tiết cũ.
6. GET503ẩnlist/detail, hiển thị lỗi; không thay bằng số0.
7. Từ hàngWAITING, nút mởhàngchờ reset về HUMAN_REQUESTED và đọc mới.

Browser là bằng chứng giao diện synthetic, không thay PostgreSQL, provider/model thật hoặc UAT. Reviewer đã chạy độc lập10/10unit và chưa có finding chặn; checkpoint còn chờ build/CI bản công bố. Cập nhật kết quả bên dưới sau xác minh.

## Bước tiếp và hoàn tác

Gói còn lại: xác nhận nguồn kiến thức/sản phẩm, key/model/giới hạn chi phí AI, người nhận và lịch khảo sát, inventory/chuyển luồng/UNKNOWN, phạm vi đo; UAT toàn tuyến Facebook→CRM→tư vấn→khách xác nhận→khảo sát→dashboard rồi Founder duyệt phát hành. Chỉ tiêu250.000đ/khách hợp lệ là mục tiêu; chưa có số đo thực tế. Không mở Google/các kênh khác trước cổng tuyến đầu.

Hoàn tác UI bằng bỏ tab/component mới hoặc quay bản frontend trước; giữ run, proposal, receipt và pending sessionStorage để đối soát. Không xóa dữ liệu đã phát sinh, mở đường gửi cũ hoặc cấp quyền. Full goal vẫn ACTIVE.
