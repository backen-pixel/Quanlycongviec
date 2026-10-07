# PR19 — tích hợp cập nhật main, 2026-10-05

## Phạm vi và phiên bản

- PR19 trước tích hợp: `e16c885ae7c2305645be02a1227bf378cb59137f`.
- Main được tích hợp: `ca8810c57d2078087a7d0afdd95776fba6e84cc3`.
- PR22 trước tích hợp: `10ed7b73adb4d5f7accab11e4f2c3e9029d869c8`; phải kiểm tra lại tương thích sau khi PR19 cập nhật.
- Giải quyết xung đột tại `backend/src/routes/adAnalytics.js` và `frontend/src/pages/AdAnalyticsPage.jsx`; giữ các thay đổi CRM/Sản xuất khác của main.

## Kết quả thay đổi

Giữ giao diện Page/bài viết/quảng cáo và chế độ nhúng Facebook mới của main. Đọc CRM theo lô 200 ID, kiểm tra từng lô bắt buộc; lỗi hoặc dữ liệu không hợp lệ làm toàn báo cáo trả UNKNOWN thay vì số 0. Áp dụng lỗi đã làm sạch cho bốn route mới. Các chỉ số Lead trong nhóm, bảy ngày và bộ lọc dùng định danh khách duy nhất.

Mọi màn dùng cơ chế loại kết quả cũ, xóa snapshot khi đổi phạm vi và tải lại màn hiện tại khi thao tác trước đó hoàn tất. Lỗi thao tác tách khỏi lỗi đọc báo cáo; lỗi của thao tác ở phạm vi cũ không che báo cáo hiện tại.

Review phát hiện hai đường lộ chi tiết trong route mới `/post-leads`: quyền xem báo cáo công ty chưa đủ để đọc từng khách, và quan hệ chung khách hàng chưa đủ để đọc dự án. Đã áp dụng policy CRM hiện có (vai trò/phạm vi khu vực, người phụ trách/tham gia), sau đó chỉ lấy chi tiết liên quan cho khách được xem. Hai đường liên kết dự án đều qua `assertProjectAccessible` READ. Không thay đổi policy quyền chung.

Kiểm chứng thêm với helper vai trò thật cho thấy admin công ty trước đây được xem công ty khác cùng tenant. Phạm vi rộng nay chỉ dành cho system/ecosystem/platform admin theo helper hiện có; admin công ty và Sales Admin bị giới hạn đúng công ty. Sales Admin thiếu công ty không được cấp phạm vi mặc định.

## Bằng chứng và giới hạn

- 127/127 ca kiểm thử cục bộ PASS trên Node 24.19.0: 53 ca bảo vệ PR19 trước đây + 74 ca cho route mới, lỗi lô thứ hai, số đếm trùng, quyền khách/dự án, chuyển màn, phản hồi lỗi trễ và unmount.
- Harness chạy route/callback và các helper quyền thật với DB/tenant/participant giả. Chưa thay thế middleware đăng nhập, RLS hoặc nghiệm thu PostgreSQL/CRM thật.
- Vite build toàn bộ frontend PASS; có cảnh báo kích thước bundle và module vừa import tĩnh/vừa động. Không phải kiểm thử toàn bộ chức năng CRM/Sản xuất.
- Trình duyệt được hỗ trợ chạy component React thật với API giả; kết nối mạng của bản thử bị chặn bằng CSP. Đã xem thẻ Page, bài viết, quảng cáo, khung khách; đổi A/11 sang B/22; giả lỗi CRM cho thấy lỗi và bỏ số cũ; hồi phục và bật chế độ nhúng Facebook. Không có lỗi JS trong quan sát này. Không chạy lại toàn bộ ma trận thiết bị hoặc E2E thật.
- CI Node 18/22 phải được đọc trên commit đã xuất bản; kết quả cũ không chứng minh phiên bản tích hợp.

## Cổng vận hành: HOLD

Founder đã cho phép kiểm tra **chỉ đọc CRM**: tài khoản Admin Vạn Phú Thành, công ty/khu vực, người khảo sát và giờ bận/trống. Quyền này không cho sửa khách, đặt lịch, gửi tin hay đổi cấu hình. Trình duyệt CRM được mở đúng URL từ `render.yaml`, nhưng vẫn ở màn đăng nhập; chưa xác minh tài khoản/lịch thật. Kết nối Render yêu cầu xác nhận workspace trước khi đọc dịch vụ; chưa có đối chiếu phiên bản đang chạy.

PR19 chưa phải bản tối ưu theo chi phí 250.000 đồng/Lead hợp lệ. PR22 giữ quyết định này và các hợp đồng chi tiêu/Lead hợp lệ; khi tích hợp phải bảo toàn `revenue:null`, `roas:null`, `revenue_status:UNKNOWN` cho cả route/thẻ/khung khách mới. Giá trị ước tính không phải doanh thu kế toán. Chưa có quyền phát hành, DB thật, AI thực thi, gửi khách hoặc tăng chi.

## Migration và hoàn tác

Main có `647_fix_creative_key_ads_image.sql` và `648_sx_phat_sinh_order.sql`. Repo còn `647_remove_truong_trong_thanh_assignments.sql`; PR22 có `648_marketing_automation_command_queue.sql` cùng chuỗi phụ thuộc đến 697. Các tệp cùng tiền tố là khác migration, chưa thấy runner bỏ qua theo tiền tố; runner nhận đường dẫn đầy đủ. Chưa xác minh ledger thực tế. Không đổi tên/sửa tệp đã áp dụng; cần ledger theo môi trường + đường dẫn đầy đủ + blob + kết quả và thứ tự phụ thuộc trước phát hành.

Hoàn tác bản tích hợp chưa phát hành bằng revert commit tích hợp theo parent PR19 phù hợp trên nhánh review. Không thay đổi main, deploy hay migration thật; không xóa Lead/lịch/giao dịch và không nới lại quyền. Nếu đã phát hành phải lập riêng gói hoàn tác và giữ các sửa bảo vệ dữ liệu.
