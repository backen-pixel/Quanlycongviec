# Đối soát liên kết của lượt Facebook bị ngắt

Ngày 04/10/2026; baseline `3a19a287364f1170cf597d258323c2d637d4983b`. SQL688 và phần hiển thị đang nghiệm thu, chưa áp DB thật hoặc cấp quyền vận hành.

## Kết quả và giới hạn

Một lượt có thể đã nối Contact–Lead–Customer nhưng mất phản hồi trước khi ghi nhật ký. Không chạy lại creator để thử xem đã thành công hay chưa. Operator đọc bằng chứng hiện tại, đối soát trong cửa sổ được duyệt rồi ghi **RECONCILED_LINKED**. Đây là xác nhận liên kết hiện tại, không khẳng định chính lượt UNKNOWN đã tạo hồ sơ: người khác có thể đã liên kết sau đó.

Claim của contact được giữ vĩnh viễn trong index chống trùng; một batch mới không được tạo lại contact này. Run vẫn REVIEW, capability bị thu hồi, giao diện không cho xác nhận như toàn bộ công việc đã xong. Bước này không sửa CRM, message, nguồn quảng cáo, qualification hoặc dữ liệu lịch sử. Không tự gộp/xóa hồ sơ, gửi thông báo, giải phóng UNKNOWN thiếu bằng chứng, cấp enrollment, tắt hold hoặc phát hành.

## Hợp đồng operator

Chỉ DB operator tin cậy gọi hai hàm private; không cấp schema/table/function cho anon, authenticated hoặc service_role, không thêm endpoint HTTP thực thi:

- `crm_batch_control.link_snapshot(request, contact)`: yêu cầu READ COMMITTED và hold SQL687 đang active; giữ khóa state tới cuối giao dịch. Đọc đủ mọi message của contact, không giới hạn 1.000 dòng. Snapshot gồm ID, trạng thái, số lượng và hash toàn dòng; không xuất nội dung hội thoại, thông tin liên hệ hay token Page.
- `crm_batch_control.confirm_link(command, request, contact, revision, manifest_hash, snapshot_hash, release_reference, drain_reference, review_reference)`: ràng đúng snapshot, hold epoch/manifest và ba hồ sơ tham chiếu. Khóa run rồi kiểm lại snapshot sau khi chờ. Ghi item, token, run và audit cùng giao dịch. Cùng command/nội dung trả receipt đã ghi cùng run hiện tại; không apply lại sau khi đã tắt hold. Đổi nội dung với cùng command bị từ chối.

Điều kiện xác nhận: đã có durable STOP của SQL686; run REVIEW, item UNKNOWN và không còn PENDING/RUNNING; công ty/tenant hoạt động; Page thuộc đúng công ty và module CRM; Contact–Lead–Customer nhất quán, đúng loại Lead/Deal; không có inverse Lead hoặc danh tính Page/PSID mâu thuẫn; mọi message hiện có của contact đã nối đúng Lead. Thiếu mapping, message chưa nối hoặc mâu thuẫn thì giữ UNKNOWN và xuất mã vấn đề, không tự sửa.

Snapshot không xác nhận đầy đủ attribution, task/assignment, tệp, thông báo, socket/mobile push hoặc dịch vụ xa. Hồ sơ release/drain/review là xác nhận có nguồn của operator, **không phải bằng chứng máy tự kiểm được**. `businessReconciled` và `processesDrained` luôn false. Phải đọc hồ sơ và kiểm các tác động còn lại trước chuyển luồng.

Audit giữ trước/sau, snapshot/hash, command/references, operator và thời điểm. Public journal chỉ trả mã receipt, thời điểm và các cờ phạm vi; không trả hồ sơ operator. Kiểm quyền lịch sử bao gồm RECONCILED_LINKED, kể cả sau khi contact được remap và Lead cũ chuyển công ty/người phụ trách. Guard không cho run chứa trạng thái này chuyển thành COMPLETED.

## Generic queue là một phụ thuộc vận hành riêng

Khảo sát mã và review độc lập không thấy Facebook handler chạy qua `system_batch_jobs`. Registry hiện có lịch giao việc CRM, giao việc hàng loạt và ping. Không mở dự án sửa queue chung để đối soát journal Facebook.

Khi bảo trì, vẫn phải cô lập các writer này vì chúng ghi bảng nằm trong hold. Chỉ đặt `BATCH_QUEUE_DISABLED=1` không đủ: `crmAssignmentScheduleRunner` chuyển sang xử lý trực tiếp, và API enqueue/resume/retry có thể kích hoạt memory pump. Gói vận hành cần ngừng runner nguồn bằng cấu hình phù hợp, chặn admission API, dừng/chờ mọi consumer/instance và lưu pending/delayed/running để đối soát. Không tự bật lại hoặc replay queue chung khi mở tuyến marketing. Khôi phục tự động queue chung cần chống lặp theo nghiệp vụ riêng.

## Kiểm chứng và bước tiếp

Local Windows: **1.315 PASS, 0 fail, 5 skip**; 78 ca liên quan journal/STOP/UI gồm 11 ca mới. CI runtime b6be0989: Node 18/22 mỗi bản 1.320 PASS/0 fail/0 skip, build và các job khác đạt; intake PostgreSQL có một ca fixture lỗi do tạo trùng Page/PSID bị UNIQUE hiện hữu chặn trước khi đến hàm mới. Đã sửa ca đó thành kiểm ràng buộc thật và thêm inverse Lead mâu thuẫn; không sửa SQL hoặc gỡ constraint. PostgreSQL và review cuối chờ kiểm lại. Các ca mới kiểm quyền private, durable STOP, đúng/sai mapping, toàn bộ message, snapshot/revision, replay và hai operator, rollback, hai thứ tự cạnh tranh với release hold, giữ claim, thu hồi token và quyền lịch sử. Không dùng dữ liệu giả làm bằng chứng đạt 250.000đ/khách.

Sau checkpoint này vẫn cần kiểm inventory vận hành và các tác động ngoài liên kết, các UNKNOWN thiếu/mâu thuẫn hồ sơ, dữ liệu AI/người nhận/lịch/phạm vi đo, UAT xuyên tuyến và gói Founder phát hành. Mục tiêu đầy đủ còn ACTIVE.

## Hoàn tác

Không downgrade SQL684/686 lên DB đã có RECONCILED_LINKED vì reader/constraint cũ không hiểu trạng thái mới. Giữ SQL688, claim, audit và hold; ngừng tác vụ mới và triển khai bản tương thích. Không đổi RECONCILED_LINKED về PENDING hoặc xóa audit để chạy lại creator. Rollback một giao dịch confirm chưa commit phục hồi UNKNOWN và không để lại receipt thành công giả. Mọi thao tác DB thật cần gói phát hành được duyệt.
