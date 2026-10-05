# Danh mục nguồn khách theo kỳ đo

SQL671 bổ sung bản xác nhận phạm vi kinh doanh cần đo: công ty, kỳ, toàn bộ tài khoản Facebook đang cấu hình, Page/biểu mẫu và điểm nhận khác. Đây là bước trước bằng chứng provider và bản chốt kết quả; không xác nhận đã thu đủ khách, không thay chỉ tiêu 250.000 đồng/khách và không cấp quyền chạy/tăng quảng cáo.

## Hành vi và quyền

- Người có quyền quản trị tiếp nhận hiện hành xác nhận danh mục; người thực hiện lấy từ phiên đăng nhập, SQL kiểm lại công ty/tenant/role đang hoạt động. Công ty có is_active NULL bị từ chối. Primary và cả VPT_MARKETING_TRIAL_REPORT/VPT_MARKETING_SOURCE_REGISTRY phải mở; mặc định tắt.
- Tất cả tài khoản, kể cả tài khoản không tạo khách, phải có điểm nhận hoặc khai báo NO_LEAD_SOURCE kèm lý do. Không suy ra NO_LEAD_SOURCE từ việc không quan sát thấy Lead. Không thể đồng thời khai không có điểm nhận và có điểm nhận trong cùng tài khoản. Danh mục không loại tài khoản khỏi tiền chi.
- Biểu mẫu đã biết từ cấu hình, receipt hoặc census không được bỏ sót. Biểu mẫu lịch sử chưa rõ tài khoản có UNRESOLVED_FORM, account null và lý do; cả Page đã chuyển công ty vẫn giữ được ngoại lệ lịch sử. Không tự gán tài khoản, không khẳng định quyền đối với Page công ty khác. Một biểu mẫu có thể được khai cho nhiều tài khoản; routing chưa khớp là cảnh báo, không tự đổi cấu hình nhận khách.
- Tài khoản/token không sẵn sàng không chặn ghi nhận phạm vi kinh doanh; chúng vẫn là gap và không trở thành bằng chứng đủ nguồn.
- Hồ sơ gồm tham chiếu, ngày và ghi chú. Server tính declarationDigest từ chính nội dung xác nhận và inventory. Đây không phải hash tệp đã được tải/kiểm chứng. Tham chiếu và địa chỉ chỉ là văn bản; không tự tải URL/tệp.

## Nhất quán và giới hạn

Bản hiện hành có revision, trial revision, inventory version và người/ngày ghi nhận. Inventory bao gồm tất cả tài khoản/Page/các biểu mẫu đã biết/cấu hình routing và fingerprint credential riêng; API không trả token hoặc fingerprint riêng. Mọi thay đổi quan sát được làm danh mục cần rà lại. Người đã ghi không còn đủ quyền thì STALE_AUTHORITY. Đây là kiểm eligibility hiện hành, không phải lịch sử generation để chứng minh không từng thu hồi rồi cấp lại.

Lưu bằng optimistic revision + inventory version; registry và audit lưu cùng giao dịch. Request ID toàn cục, so khớp người/công ty/kỳ/nội dung khi retry; replay vẫn kiểm quyền hiện hành, không làm mới ngày bằng chứng hay phiên bản cũ. Client lưu đúng request theo actor/company/trial trong sessionStorage trước POST. Mất phản hồi giữ yêu cầu để retry chính xác. Lỗi thay đổi nguồn có mã riêng cho biết giao dịch đã bị từ chối; cần tải lại trước xác nhận mới.

SQL khóa các hàng cấu hình hiện có và kiểm lại inventory cuối giao dịch. Không tuyên bố khóa phantom của mọi legacy writer: bản xác nhận gắn inventory quan sát; lần đọc sau đổi cấu hình sẽ đánh dấu stale. Bản projection STABLE được gọi trong cùng câu SELECT của snapshot báo cáo, tránh trộn phạm vi với dữ liệu đọc ở thời điểm khác. Giới hạn100 tài khoản/100 Page/1000 biểu mẫu đã biết và300 dòng khai báo; vượt giới hạn không cắt thầm dữ liệu.

Giao diện nằm trong kỳ đo ở trang phân tích quảng cáo. Nó gợi ý biểu mẫu đã biết, để trống lựa chọn cho tài khoản chưa thấy khách và yêu cầu người khai báo xác nhận. API đọc trả scope/actor; UI thay phiên/công ty/kỳ sẽ hủy hiệu lực phản hồi cũ. Lỗi đọc ẩn danh mục xác nhận cũ; thao tác mới cần tải được bản hiện hành.

## Kiểm thử và triển khai

Runtime9363535a đã qua review độc lập, local129 và24 ca mới reviewer chạy, PostgreSQL census41/0/0, Node22 697/0/0 và cả10job/fullbuild. SQL671 được fixture census áp dụng hai lần;11 ca mới kiểm quyền trực tiếp, broad grant, tất cả tài khoản/biểu mẫu, concurrency/replay, multi-account form, lịch sử không rõ tài khoản, token thiếu, quyền hiện hành, roster/ngày thay đổi, binding thêm trong lúc đợi khóa, Page moved và cùng snapshot. Browser dữ liệu giả kiểm lưu/retry/reload/đổi người/lỗi/heldPOST-close. [Bằng chứng đúng phiên bản và giới hạn](SOURCE_REGISTRY_REVIEW.md).

Không chạy migration thật, không cấu hình Meta, không gửi khách hoặc mở chi. Hoàn tác ứng dụng bằng tắt flag và gỡ giao diện/API mới nếu cần; giữ registry/events để bảo toàn bằng chứng. Không xóa dữ liệu hoặc mở quyền trực tiếp.

## Việc còn lại trong mục tiêu đầy đủ

Provider witness/đối soát bản xuất có phạm vi thực, bản chốt kỳ với nguồn và invalidation, lịch/chờ xử lý trên dashboard, các nguồn ngoài biểu mẫu Facebook, cấu hình VPT thật, nghiệm thu Meta/UAT và quyết định phát hành. CURRENT của danh mục chỉ nói cấu hình còn khớp; không thể nâng CPQL đầy đủ, công bố đạt250k hoặc mở ngân sách.
