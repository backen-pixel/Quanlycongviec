// Default checklists for each project task title
// Key = task title, Value = array of checklist items
const DEFAULT_CHECKLISTS = {
  'Tiếp nhận yêu cầu khách hàng': ['Ghi nhận tên, SĐT, địa chỉ KH','Xác nhận loại sản phẩm cần','Ghi nhận ngân sách dự kiến','Hẹn lịch tư vấn chi tiết'],
  'Tư vấn sản phẩm & vật liệu': ['Giới thiệu các loại vật liệu','Tư vấn phụ kiện phù hợp','Gửi hình ảnh mẫu tham khảo','Báo giá sơ bộ cho KH'],
  'Khảo sát thực tế': ['Đo đạc kích thước công trình','Chụp ảnh hiện trạng','Kiểm tra hệ thống điện nước','Ghi nhận yêu cầu đặc biệt'],
  'Ghi nhận nhu cầu chi tiết': ['Tổng hợp yêu cầu KH','Xác nhận màu sắc, kiểu dáng','Xác nhận timeline mong muốn'],
  'Thiết kế bản vẽ sơ bộ': ['Vẽ layout tổng thể','Xác nhận vị trí tủ bếp','Trình bày bản vẽ cho KH'],
  'Thiết kế 3D render': ['Render 3D góc nhìn chính','Render 3D góc nhìn phụ','Thêm ánh sáng & vật liệu thực tế','Xuất file hình ảnh cho KH'],
  'Chỉnh sửa theo feedback KH': ['Ghi nhận feedback KH','Chỉnh sửa bản vẽ','Gửi bản vẽ chỉnh sửa','Xác nhận KH đồng ý'],
  'Xuất bản vẽ kỹ thuật & CNC': ['Xuất bản vẽ chi tiết từng module','Xuất file CNC cắt ván','Kiểm tra kích thước lần cuối'],
  'Bóc tách & lập báo giá': ['Bóc tách vật liệu','Tính toán phụ kiện','Tính công lắp đặt','Lập bảng báo giá chi tiết'],
  'Thương lượng & chốt giá': ['Gửi báo giá cho KH','Giải đáp thắc mắc về giá','Đàm phán chiết khấu (nếu có)','Chốt giá cuối cùng'],
  'Ký hợp đồng & thu cọc': ['Soạn hợp đồng','KH ký hợp đồng','Thu cọc 50%','Lưu hợp đồng & biên lai'],
  'Soạn hợp đồng chi tiết': ['Soạn điều khoản hợp đồng','Đính kèm bản vẽ & báo giá','Xác nhận timeline giao hàng'],
  'Ký hợp đồng & xác nhận': ['KH xác nhận hợp đồng','Ký hợp đồng 2 bên','Scan lưu trữ hợp đồng','Chuyển bộ phận sản xuất'],
  'Chuẩn bị nguyên vật liệu': ['Đặt mua ván MDF/gỗ','Đặt mua phụ kiện','Đặt kính ốp bếp','Đặt mặt đá (nếu có)','Kiểm tra NVL nhập kho'],
  'Gia công CNC & dán cạnh': ['Cắt ván theo file CNC','Dán cạnh các tấm ván','Kiểm tra chất lượng cắt','Phân loại theo module'],
  'Lắp ráp & hoàn thiện': ['Lắp ráp khung tủ','Lắp bản lề & ray trượt','Lắp tay nắm','Kiểm tra đóng mở','Vệ sinh sản phẩm'],
  'Kiểm tra QC & đóng gói': ['Kiểm tra kích thước','Kiểm tra bề mặt','Kiểm tra phụ kiện đầy đủ','Đóng gói bảo vệ','Dán nhãn module'],
  'Chuẩn bị & vận chuyển': ['Sắp xếp hàng lên xe','Kiểm tra đủ số lượng module','Liên hệ KH xác nhận ngày giao','Vận chuyển đến công trình'],
  'Xác nhận giao hàng': ['KH kiểm tra hàng nhận','Ký biên bản giao nhận','Chụp ảnh giao hàng'],
  'Lắp đặt tại công trình': ['Kiểm tra mặt bằng','Lắp tủ dưới','Lắp tủ trên','Lắp mặt đá/bàn bếp','Lắp kính ốp','Lắp thiết bị điện','Căn chỉnh cửa tủ'],
  'Nghiệm thu & bàn giao': ['KH kiểm tra tổng thể','Test đóng mở tất cả cửa','Test thiết bị điện','Ký biên bản nghiệm thu','Bàn giao sổ bảo hành','Thu tiền còn lại'],
  'Chăm sóc sau lắp đặt': ['Gọi hỏi thăm sau 3 ngày','Gọi hỏi thăm sau 1 tuần','Ghi nhận phản hồi KH'],
  'Xử lý bảo hành': ['Tiếp nhận yêu cầu bảo hành','Kiểm tra & xác nhận lỗi','Sửa chữa/thay thế','Xác nhận KH hài lòng'],
  'Xin đánh giá & giới thiệu': ['Xin KH đánh giá 5 sao','Xin phép chụp ảnh công trình','Hỏi giới thiệu KH mới'],
};

module.exports = { DEFAULT_CHECKLISTS };
