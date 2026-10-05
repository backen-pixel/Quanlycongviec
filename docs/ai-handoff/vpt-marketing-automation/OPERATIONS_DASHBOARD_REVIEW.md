# Kiểm chứng dashboard tư vấn và khảo sát

Ngày 03/10/2026. Runtime `9c3173109b4d321d28011d876e6661d26db3721f`, tree `a708cac69bf912f5b8eb2be0ded38ffd65f6e4ca`, trong PR22 draft. Kết luận PASS cho phần báo cáo vận hành chỉ đọc trong môi trường cô lập; full goal ACTIVE. Không thay nghiệm thu Meta/CRM thật, hiệu năng production hoặc quyết định phát hành.

## Phạm vi và kết quả

SQL673, API `/crm/marketing-operations`, projection và React component cung cấp số liệu toàn công ty về hội thoại Messenger và lịch khách xác nhận. Độc lập kỳ quảng cáo; chưa quy thuộc số lịch cho nhóm khách quảng cáo. Lỗi nguồn, sai phạm vi/người, dữ liệu vượt giới hạn không được thành số0. Không thêm ghi lịch, gửi tin, tự chốt khảo sát hoặc quyền ngân sách.

Reviewer độc lập `/root/architecture_v11_review` đã tự đọc mã/SQL, chạy local24/24 và đọc trực tiếp CI. Hai phát hiện P2 đã sửa:

- Lịch thay đổi với `end_time` NULL/infinity đi vào ngoại lệ, không làm hỏng toàn báo cáo.
- Nhóm khách cần xử lý gộp cả nghĩa vụ CARE và SURVEY; STOP loại follow-up nhưng không xóa booking/nghĩa vụ bàn giao.

Không còn finding chặn trong phạm vi đã rà. Reviewer không tính kiểm trình duyệt do tác giả thực hiện vào bằng chứng độc lập của mình.

## CI đúng phiên bản

- [Automation37109400042](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37109400042): cả10job SUCCESS.
- [PostgreSQL intake111164221888](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37109400042/job/111164221888):208 PASS/0 FAIL/0 SKIP, gồm9ca mới199–207: quyền/current scope, lịch cùng ngày, ACK/STOP, mapping ngoại công ty, recipient thu hồi, lịch sửa/NULL/infinity, tin đến sai thứ tự, một snapshot khi STOP đồng thời và giới hạn5.000.
- [Node22 111164221873](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37109400042/job/111164221873):721 PASS/0 FAIL/0 SKIP. Node18 SUCCESS.
- [Frontend111164221891](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37109400042/job/111164221891):10.316modules, build30.12s SUCCESS.
- [Report37109400035](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37109400035) và [Messenger37109400033](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37109400033) SUCCESS.
- CI checkout merge `3d0e84813352f4c330861e59381cbd9310648612`; GitHub Git API xác nhận hai parent `e16c885ae7c2305645be02a1227bf378cb59137f` và runtime trên, tree giống hệt candidate `a708cac69bf912f5b8eb2be0ded38ffd65f6e4ca`.

Giữ lịch sử thất bại: candidate551046c/run37108790893 đạt9/10job; intake204PASS/4FAIL (ba ca và test cha) vì assertion giả định hồ sơ mới luôn nằm trong50 mục ưu tiên. Bản sửa kiểm biến động tổng snapshot và giữ giới hạn50; không loại bỏ ca cũ hoặc giảm điều kiện nghiệp vụ.

## Kiểm trình duyệt của tác giả

Dùng công cụ trình duyệt được hỗ trợ, component MarketingOperations thật tại runtime trên, API giả tạo từ reportOperations + fixture giả; loopback127.0.0.1:4189. Không đăng nhập, đọc CRM/Meta, gửi tin hoặc gọi API ngoài. CSP connect-src none. Fixture ở thư mục công việc `operations-browser/`, ngoài repo. Giao diện kiểm chứng dùng CSS giản lược; chưa phải nghiệm thu toàn trang/định dạng production.

| Tình huống | Kết quả quan sát |
|---|---|
| Bình thường | 4nhóm cần xử lý;2lịch sắp tới;1trong giờ;3chờ nhân viên nhận;1qua giờ chưa ghi kết quả;7mục việc. Có nhãn toàn công ty và không theo kỳ quảng cáo. |
| Lịch đổi, giờ kết thúc NULL | Báo cáo vẫn hiển thị;1lịch thay đổi trong ngoại lệ; số sắp tới/chờ nhận giảm đúng fixture. |
| Cả4hội thoại STOP | Không còn việc CARE;4mục khảo sát vẫn giữ,2lịch sắp tới/3chờ nhận; tổng nhóm chờ4. |
| Identity chưa đối soát | Ô nhóm khách hiển thị Chưa đối soát, kèm cảnh báo; không hiển thị0khách. |
| Nguồn lỗi sau lần đọc thành công | Chỉ còn thông báo lỗi, toàn bộ số cũ và hàng chờ bị ẩn. |
| Phản hồi sai actor | Không hiển thị các số hoặc danh sách trong phản hồi. |
| Giữ phản hồi A, đổi công ty B, trả A muộn | Trong lúc chờ không có số cũ; B hiển thị fixture riêng có0lịch; trả A không đổi màn hình B. |
| Giữ phản hồi người A, đổi người B, trả A muộn | Người B nhận báo cáo riêng; phản hồi người A không khôi phục dữ liệu phiên trước. |

Đã đóng tab và dừng server kiểm thử sau khi hoàn tất. Không đi theo các link tới CRM vì server chỉ phục vụ fixture.

## Gate và công việc tiếp theo

Hoàn tác bằng tắt `VPT_MARKETING_OPERATIONS_REPORT`; giữ lịch, hội thoại, receipt/audit. Không xóa giao dịch hoặc mở lại quyền cũ. [Hợp đồng và giới hạn](OPERATIONS_DASHBOARD.md).

Tiếp tục đối soát tậpID/nguồn thực, xác nhận đầy đủ chi tiêu và khách, chốt kỳ đo có phiên bản trước khi dùng CPQL để điều hành. Còn quy thuộc khảo sát theo kỳ quảng cáo nếu dùng tối ưu; UI ngoại lệ gửi/hủy/đổi, writer lịch cũ, dữ liệu/nội dung/lịch/người nhận thật, AI identity và ủy quyền, hiệu năng/khôi phục, UAT và quyết định Founder. Chưa chứng minh đạt250.000đ/khách, chưa bật quảng cáo hoặc phát hành.
