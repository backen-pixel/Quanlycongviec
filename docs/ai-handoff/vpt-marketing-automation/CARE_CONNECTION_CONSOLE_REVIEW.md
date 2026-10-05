# Bằng chứng giao diện đối chiếu khách

Runtime: `8f42595e1a895d8c997ccdf11b946f9617ff38ad`, tree `642d6628b5e2f1296eea19ee7e638728c3f114e0`. Ngày03/10/2026. Không kết nối DB/Meta/CRM thật; đây là nghiệm thu kỹ thuật trong môi trường cô lập, chưa phải UAT vận hành.

## CI đúng phiên bản

- [Automation37133277982](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37133277982): cả10job SUCCESS.
- [Intake PostgreSQL111232521379](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37133277982/job/111232521379): **244 PASS /0 FAIL /0 SKIP**, gồm11ca SQL681 mới233–243.
- [Census111232521501](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37133277982/job/111232521501): **88/0/0**, HTTP **1/0/0**.
- [Node22 111232521537](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37133277982/job/111232521537): **843 +26 PASS**, không fail/skip; Node18 cũng SUCCESS.
- [Frontend111232521509](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37133277982/job/111232521509):10.329modules,36,31giây,SUCCESS.
- [Report37133277976](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37133277976) và [Messenger37133277975](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37133277975):SUCCESS.

Log checkout xác định mergeCI `01ad39a2c2ed8379e9cc07714caeb43fcb601528`. Git API xác nhận tree bằng runtime, parents gồm base `e16c885ae7c2305645be02a1227bf378cb59137f` và runtime8f42595.

## Điều đã kiểm

Migration681 chạy hai lần, giữ version của yêu cầu680 còn chờ. Search có giới hạn20, literal, cùng công ty/người nhận/khu vực; kết quả rỗng vẫn kiểm quyền. Hai tenantNULL theo cùng policy của context; mismatch bị loại. Bảng cancellation và helper private không mở cho app role.

Mapping thiếu Customer còn đường hoàn thiện có bằng chứng. Customer khác hoặc inverse khác không được báo hoàn tất hoặc ghi đè. Backend/UI yêu cầu `mappingComplete` và từ chối trạng thái complete mâu thuẫn; không đổi nghĩa `alreadyLinked` lịch sử.

Concurrent CLOSE chỉ lưu một cancellation; LINK đến muộn cùng request bị từ chối. Thay command dùng lại request bị từ chối. Context đổi vẫn có thể đóng yêu cầu cũ; rollback không lưu cancellation giả. Hai session kiểm cả CLOSE thắng trước LINK và LINK thắng trước CLOSE: liên kết đã ghi được giữ, STOP không đổi. Ca cuối gọi actual API→frontend state→SQL link/close.

Reviewer phiên riêng tự đối chiếu4blob mã trọng yếu với GitHub, đọc logCI, chạy26unit và kết luận **PASS phạm vi SQL681/API/UI**, không còn finding chặn. Hai P2 tenantNULL và mapping thiếu/mâu thuẫn đã khép. Reviewer không tuyên bố độc lập thao tác browser.

## Trình duyệt do bên triển khai kiểm

Dùng component thật `CareConnections` và state thật, React development StrictMode, API giả tại loopback5191. CSP `connect-src 'none'`; không đăng nhập, không gọi mô hình, không gửi tin thật. CSS fixture chỉ phục vụ kiểm hành vi, không chứng nhận toàn bộ bố cục ứng dụng.

- Tìm và chọn hồ sơ thiếu phone: hiện rõ chưa có số; radio và xác nhận ban đầu chưa chọn, nút ghi khóa. Mapping thiếu Customer vẫn hiện form bằng chứng; mapping mâu thuẫn hiện cảnh báo và bỏ form.
- Với trạng thái STOP, gửi liên kết rồi giả mất phản hồi sau ghi: UI giữ pending và khóa tìm mới. Reload giữ yêu cầu. Đổi người xem không thấy yêu cầu cũ; trở lại đúng người thì tiếp tục được. Retry cùng request/command xác nhận1liên kết sau2POST, không có thao tác mở gửi tin.
- Với hội thoại thứ hai, giả mất phản hồi trước ghi rồi CLOSE mất phản hồi sau ghi: reload về hội thoại đầu không lộ pending của hội thoại khác. Mở đúng hội thoại chỉ có nút tiếp tục CLOSE, không còn nút LINK. Retry kết thúc và mở lại tìm kiếm.
- Bằng chứng fixture hiển thị request `65ea750f-87ed-4fcd-bfc0-2c3b2a2f3fa4`: LINK→LINK, recorded=true; request `eebc4809-0b95-45d7-afd6-b05430b0b911`: LINK→CLOSE→CLOSE, cancelled=true. `exact=true`; tổng5POST,1liên kết. Đây là UUID giả trong phép thử, không phải hồ sơ thật.
- Lỗi quyền trả thông báo chưa xác định và không giữ danh sách khách. Phản hồi tìm kiếm trì hoãn10giây sau đổi người không hiển thị hồ sơ của người trước; screenshot/AX vẫn là bảng rỗng của người mới.
- Khóa bảng khi một lần tìm kiếm khác còn đang chờ: kết quả cũ không hiện sau mở lại; lần tìm mới hoạt động bình thường. Ở hội thoại30/người20, LINK mất phản hồi sau ghi rồi CLOSE hiển thị đúng thông báo giữ liên kết đã ghi; checkpoint cuối7POST,2liên kết,3lần đối chiếu kết thúc,`exact=true`.

## Giới hạn còn giữ

Browser dùng API giả; PostgreSQL kiểm service thật trong môi trường cô lập. Hai loại bằng chứng không thay UAT trên đúng bản triển khai. Chưa kiểm toàn bộ trình duyệt production hoặc chuyển các tác vụ cũ qua nhiều bước; enrollment Page vẫn chưa mở thật.

Full goal ACTIVE. Còn chuyển đường gọi cũ, đối soát dữ liệu/đo tải/khôi phục, cấu hình AI/lịch/người nhận, đủ phạm vi đo và các điểm nhận/kênh khác, UAT và Founder release. Chưa dữ liệu thật đạt250k/khách hợp lệ hoặc7%doanhthu. [Hợp đồng, chuyển đường cũ và hoàn tác](CARE_CONNECTION_CONSOLE.md).
