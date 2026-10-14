# Xác nhận hoàn thành công đoạn sản xuất

Ngày 14/10/2026, anh Hùng chốt: chỉ hiện công đoạn Xong khi tất cả nhiệm vụ bắt buộc bên trong đã hoàn thành.

## Quy tắc và phạm vi

- Nhiệm vụ bắt buộc là cờ hiện có `blocks_stage_advance=true`, không phải mọi nhiệm vụ hay mọi checklist con. Giữ quy tắc trạng thái kết thúc hiện tại: done/completed và cancelled/canceled.
- Áp dụng xác nhận công đoạn SX qua `/production/substage-status`. Không thay gate chuyển cột, chính sách hạn ngày lắp, hoặc các ngoại lệ riêng của VC/LĐ.
- Kiểm cả tasks theo dự án và crm_tasks theo mọi lead trực tiếp gắn cùng dự án. ID cột là nguồn chuẩn; CRM chưa gắn ID dùng slug SX cũ. Không ghép hoặc đóng việc chỉ vì cùng tên.
- PUT Xong có việc bắt buộc mở trả 409 và tên/nguồn nhiệm vụ. Lỗi đọc bất kỳ nguồn nào không được cho qua. Không tự đánh dấu nhiệm vụ xong.
- GET kiểm lại xác nhận đã lưu: nếu có nhiệm vụ bắt buộc được thêm/mở lại thì trả trạng thái hiệu lực dang, không trả mốc xong cũ. Không viết lại lịch sử hoặc sửa hàng loạt dữ liệu cũ.
- Frontend chỉ hiện xác nhận Xong đã được server chấp nhận; không suy từ vị trí Kanban hoặc danh sách nhiệm vụ đang lọc. Cột đơn không chuyển thẻ tiếp nếu lưu xác nhận bị từ chối.

## Kiểm và giới hạn

11 kiểm Node PASS: nhiệm vụ bắt buộc/không bắt buộc, hai bảng, khác cột/dự án, slug cũ, thêm/mở lại, trang thứ hai, lỗi đọc, handler GET/PUT thực tế và quyền ghi dự án. Không chạy server hoặc truy cập DB thật trong test. Build Vite PASS 39.34s; còn cảnh báo dependency/chunk size của baseline.

Gate đọc trước khi ghi, không phải giao dịch DB khóa toàn bộ nhiệm vụ. Khi nhiệm vụ thay đổi đồng thời hoặc từ phiên khác, trạng thái hiệu lực được đối chiếu ở lần GET kế tiếp; phiên đang mở cần tải lại để thấy dữ liệu mới. Không nghiệm thu sự nhất quán tức thời giữa mọi phiên. Nhiệm vụ không gắn đúng ID/slug và liên kết dự án thiếu vẫn cần rà soát dữ liệu. Các số checklist chưa được đổi thành cùng một phép đếm.

Chưa deploy hoặc thay DB. Trước phát hành cần review, smoke staging: nhiệm vụ bắt buộc pending từ chối xác nhận, completed cho phép; mở lại và tải lại mất dấu Xong; cột đơn bị từ chối không đổi Kanban; đối chiếu Chị Nhung. Backend và frontend phải phát hành cùng gói. Rollback: revert commit của gói; không cần SQL và không xóa dữ liệu.
