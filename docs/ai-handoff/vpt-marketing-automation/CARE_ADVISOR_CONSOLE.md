# Màn hình đối soát bản đề xuất tư vấn

Ngày 04/10/2026. Phạm vi: SQL690, API danh sách/hủy và CareAdvisor trong màn hình Chăm khách. Kế thừa [hợp đồng bản nháp SQL689](CARE_ADVISOR_DRAFTS.md). Runtime 4b4cdc5 đã qua PostgreSQL/CI; chưa phát hành, chưa nối provider hoặc gửi khách.

## Hành vi và giới hạn

Người vận hành đọc các lượt của chính mình trong công ty/hội thoại hiện hành; danh sách phân trang 20 lượt chỉ có metadata. Lượt RUNNING của người khác vẫn khóa tạo mới trên cùng hội thoại, nhưng không lộ nội dung hoặc ID của họ. Reader kiểm quyền hiện hành, cursor gắn actor/company/thread. API báo generationAvailable=false khi router không có inference port dù cờ được bật.

Giao diện hiển thị nguyên văn câu trả lời đã duyệt, nguồn và nhu cầu trích từ lời khách với nhãn chưa xác minh. Không có nút gửi khách. Khi đổi actor/company/thread, khóa thao tác hoặc rời tab Hội thoại, kết quả cũ được ẩn và phản hồi về muộn bị bỏ qua. Quay lại từ tab Nội dung tư vấn phải đọc mới; không giữ bản nháp có nguồn vừa thu hồi. Đọc lỗi không thay bằng số 0 hoặc nội dung cũ.

Trước POST, trình duyệt lưu request vào sessionStorage theo actor/company/thread. Tải lại trong cùng phiên giữ yêu cầu; không tự POST. Storage lỗi hoặc có yêu cầu khác khóa thao tác mới. Đây không phải kho lưu bền vững đa thiết bị: lịch sử server giúp tìm các lượt đã BEGIN; yêu cầu chưa đến server chỉ còn trong phiên trình duyệt. READ có thể đối chiếu BEGIN đã tồn tại, nhưng không thay xác nhận CANCEL.

SQL690 lưu dấu hủy theo request ID trong cùng giao dịch. Hủy trước BEGIN/RETRY chặn lệnh đến muộn; hủy RUNNING đóng lượt và chặn FINISH muộn; nếu kết quả đã ghi trước thì giữ nguyên và báo ALREADY_TERMINAL. Không tuyên bố provider đã dừng hoặc không tính phí. Hủy replay phải đúng actor/company/thread/reason. BEGIN/RETRY và CANCEL dùng cùng khóa request; FINISH/CLOSE/CANCEL giữ thứ tự khóa run trước thread. Bảng và hàm cũ chuyển vào schema private, không cấp app role đường bỏ qua dấu hủy.

Retry vẫn tường minh, có lý do, kiểm quyền và context hiện hành; tối đa ba attempt theo SQL689. Giao diện chỉ mở khi đã đọc điều kiện mới và lượt đủ điều kiện. Không tự retry khi timeout.

## API

- GET /api/facebook/customer-care/advisor/drafts: companyId, threadId, after tùy chọn; trả metadata/readiness, không context/capability.
- POST /api/facebook/customer-care/advisor/draft/cancel: companyId, requestId, threadId, reason; trả ABSENT_CANCELLED, CLOSED hoặc ALREADY_TERMINAL và replay flag.
- Các API read/generate/retry của SQL689 giữ hợp đồng. Actor lấy từ server xác thực; mọi RPC kiểm Primary hiện hành.

## Bằng chứng trước CI

Local Node: 1.344 PASS, 0 fail, 5 skip (native Linux/Express integration được kiểm riêng trong CI); focused adapter/state 29/29. SQL690 được đưa vào suite PostgreSQL cô lập, cài hai lần để kiểm tính lặp. 16 ca mới gồm quyền private, actor/company/thread/cursor, pagination, hủy trước/sau admission, bảo toàn terminal, rollback và cả hai thứ tự tranh chấp CANCEL–BEGIN/RETRY/FINISH với pg_stat_activity xác nhận thực sự chờ khóa.

Browser bằng Computer Use trên 127.0.0.1:5194, component Workspace/Library/CareAdvisor thật, API giả, StrictMode; CSP connect-src none. Đã trực tiếp kiểm:

- Chưa cấu hình thì khóa tạo; bản nháp có nguồn, trích dẫn chưa xác minh, chuỗi HTML hiển thị như văn bản.
- DRAFT → tab thư viện → REVOKE giả → về Hội thoại: tăng lượt GET, không còn câu trả lời cũ; mở lịch sử hiện stale.
- Mất phản hồi tạo → chuyển tab/tải lại → cùng pending còn, số POST không tự tăng.
- Mất phản hồi hủy → READ giữ pending CANCEL → xác nhận lại hủy trả ALREADY_TERMINAL trung thực.
- Giữ phản hồi tạo → đổi người dùng hoặc công ty → trả phản hồi cũ: không hiển thị sang phạm vi mới, không lộ pending cũ.
- Danh sách lỗi: ẩn dữ liệu cũ và khóa tạo, không báo thành công.

Harness nằm ngoài repo tại work/vpt-survey-execution/advisor-browser, là dụng cụ kiểm thử dữ liệu giả, không triển khai. Review độc lập đã tự chạy 29/29 và rà mã/16 ca PG, PASS về mã sau sửa finding tab; xác nhận runtime còn chờ CI đúng commit. Browser do bên triển khai thực hiện, không thay UAT độc lập.

## CI đúng phiên bản

Runtime `4b4cdc5c1e711791f1a8bde21af8b6c9769843c4`, tree `3c63e0b604269f5fb55f42a3f81030a1feec4028`. Reviewer độc lập đã đối chiếu năm published blobs SQL/API/UI/PG, merge tree/parents và log CI; kết luận **PASS checkpoint console/SQL690**. Không chứng nhận provider thật, chất lượng AI, quyền gửi hoặc phát hành.

- [Automation37187822123](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37187822123): 10/10 job SUCCESS; Node18/22 mỗi bản 1.349 PASS/0 fail/0 skip.
- [PostgreSQL111393446370](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37187822123/job/111393446370): 409 PASS/0 fail/0 skip, gồm 16 ca SQL690; ca400 kiểm operator khác và ca404–407 kiểm khóa CANCEL–RETRY/FINISH cả hai thứ tự.
- [Node22](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37187822123/job/111393446365), [frontend](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37187822123/job/111393446481): dựng 10.335 modules trong35,48s.
- [Report37187822132](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37187822132) và [Messenger37187822131](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37187822131): SUCCESS.
- CI merge `4851adec67616dd0bc783cccd505bf28f9aee249` có đúng tree, parents base `e16c885ae7c2305645be02a1227bf378cb59137f` và runtime trên.

Đã khép lỗi stale draft sau thu hồi nguồn bằng invalidation khi rời tab và đọc mới khi quay lại. Browser chứng minh thao tác qua Workspace/Library thật với API giả; SQL chứng minh quyền và hủy đồng thời riêng trên PostgreSQL16, không thay UAT hệ thống thật.

## Hoàn tác và bước tiếp

Giữ các cờ tắt khi chưa phát hành. Khi cần ngừng: khóa admission, chờ/đối soát lượt đang chạy; giữ SQL690 và dấu hủy, không khôi phục public BEGIN/RETRY cũ hoặc xóa bằng chứng. UI có thể ngừng sử dụng trong khi API kiểm soát vẫn giữ. Không replay yêu cầu chưa rõ.

Full goal ACTIVE. Còn provider/model/key, hạn mức chi AI và ủy quyền runtime; đánh giá chất lượng bằng mô hình thật, worker/gửi theo quyền, xác minh nhu cầu, lịch khảo sát/người nhận, kiểm kê chuyển luồng/khôi phục, UAT toàn tuyến và Founder duyệt phát hành. Mục tiêu 250.000 đồng/khách hợp lệ và hạn mức thử 100 triệu/30 ngày không đổi; chưa có dữ liệu vận hành chứng minh đạt.
