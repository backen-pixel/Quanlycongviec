# Kiểm tra màn hình danh mục nguồn — dữ liệu giả

Ngày03/10/2026, root dùng trình duyệt được hỗ trợ (IAB tab20), localhost4189. Fixture tại work/vpt-survey-execution/source-registry-browser dựng SourceRegistry.jsx thật/React StrictMode; API giả, CSP connect-src none, không đăng nhập hoặc gọi Meta/CRM. CSS thử giản lược, không chứng minh bố cục toàn ứng dụng hay UAT thật.

Đã quan sát:

1. Danh mục hiện hành có hai tài khoản; chỉ cho lưu sau checkbox. Lưu thành công trả phiên bản2 và yêu cầu tải lại tình trạng hiện tại.
2. Danh mục chưa có: biểu mẫu đã biết được gợi ý; tài khoản act_78 chưa có khách vẫn để trống lựa chọn điểm nhận. Không tự chọn NO_LEAD_SOURCE. Hồ sơ/ngày/ghi chú trống, chưa cho lưu.
3. Mất phản hồi sau mock đã lưu: danh mục xác nhận cũ ẩn, yêu cầu đúng nội dung còn chờ. Tải lại trang và mở editor vẫn có retry, các trường bị khóa. Đổi người dùng thử không nhận pending của người cũ; trở lại người gốc thấy pending. Retry trả đúng phiên bản2, không thành phiên bản3 (mock so sánh toàn bộ nội dung request).
4. Phản hồi sai actor: editor từ chối, không hiển thị nội dung danh mục. Phát hiện summary cũ còn hiển thị CURRENT; đã sửa callback xóa summary khi load/error/save. Dựng lại, reload và kiểm lại: chỉ hiện “Chưa xác nhận được danh mục hiện tại”.
5. Lỗi nguồn503 trên bản sửa: cả summary xác nhận và editor cũ được ẩn, có thông báo lỗi và tải lại.
6. Cấu hình thay đổi: hiện cảnh báo cần rà lại và tài khoản khác kỳ đo; editor vẫn hiển thị hồ sơ để người có quyền đối chiếu. Không có nút mở/tăng quảng cáo.

Trạng thái khi đổi kịch bản được remount; kiểm đổi người sau pending và reload đã thực hiện thật qua UI. Chưa kiểm browser response-race độc lập với server, chưa chứng minh Meta pagination/lead coverage hoặc nối hệ thống thật. Bằng chứng concurrency SQL được chạy riêng trong PostgreSQL, không thay bằng mock.
