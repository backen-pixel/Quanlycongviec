# Nhật ký và khôi phục lượt xử lý khách Facebook

## Phạm vi và trạng thái 04/10/2026

Bản làm việc tiếp nối `52299379cecdc3df29192cfec15bee93d4b459e2`; thuộc PR #22, chưa phát hành. SQL684 và route batch tạo khách lưu yêu cầu cùng kết quả từng contact để đọc lại sau reload hoặc mất phản hồi. Local294/0/0; reviewer độc lập PASS phần mã. PostgreSQL CI và frontend build của bản công bố còn chờ; không coi ca trình duyệt/API giả là nghiệm thu vận hành.

## Hợp đồng

- POST `/api/facebook/batch-create-leads` nhận một company, danh sách 1–500 contact UUID và requestId cố định. Actor lấy từ phiên đã xác thực. BEGIN lưu toàn bộ lựa chọn trước dispatch; cùng request chỉ trả tiến độ, không chạy lại creator.
- Schema private `crm_batch_control` giữ runs/items, hash capability riêng server, không cấp quyền đọc bảng cho public/anon/authenticated/service_role. RPC chỉ service_role; server phải còn là Primary trước/sau RPC. DB kiểm quyền hiện hành theo actor/company/tenant/Page/region/Lead.
- Unique claim chặn request khác trùng contact PENDING/RUNNING/UNKNOWN. START/CHECK kiểm capability và quyền hiện hành; RESULT xác nhận liên kết thực tế hoặc lý do bỏ qua. RESULT cuối khép COMPLETED trong cùng giao dịch khi tất cả item LINKED/SKIPPED, kể cả không gửi được FINISH.
- STOP giữ RUNNING thành UNKNOWN, PENDING thành CANCELLED; không tự đoán kết quả. UNKNOWN không được chạy lại, không có lease hết hạn hoặc tự nhả claim. FINISH có thể gọi lặp. Kết quả ghi thành công không bị xóa khi HTTP mất phản hồi.
- GET cùng request trả tiến độ đã lưu, kiểm quyền cả Lead lịch sử dù mapping contact đã đổi. GET lịch sử phân trang20 lượt theo keyset, chỉ metadata của actor/company hiện hành; không trả token, liên hệ hoặc nội dung CRM.
- Browser lưu request và UUID lựa chọn trước POST; reload chỉ GET. Retry rõ ràng giữ nguyên request/lựa chọn. Lỗi đọc xóa kết quả cũ đang hiển thị, giữ yêu cầu; chỉ kết quả COMPLETED đúng request mới đóng thông báo. Đổi phạm vi hủy tác dụng phản hồi cũ. Lịch sử server giúp tìm lượt sau khi mất lưu cục bộ.

## Bằng chứng kiểm thử

- Local294 ca: quyền/creator/batch/source regressions, adapter nhật ký và controller UI thực tế; 0 fail/skip. Harness source-route được giới hạn đúng route vì chèn GET lịch sử trước POST batch.
- 16 ca PostgreSQL mới đăng ký trong intake suite: quyền schema/RPC; yêu cầu bất biến; hai replica; claim khác UUID; đọc/replay sau crash; STOP/rollback; thu hồi quyền; Page/Lead lịch sử đổi phạm vi; history pagination; RESULT cuối không FINISH. Chưa có kết quả CI tại lúc lập hồ sơ.
- Browser qua công cụ được hỗ trợ, component `FacebookBatchRecovery` thực tế + React StrictMode + API giả trên127.0.0.1:5195, CSP cấm kết nối ngoài. Xác nhận trong trang hoạt động. POST đầu lưu kết quả rồi mất phản hồi; reload chỉ GET, POST giữ1 và đọc COMPLETED đúng request, đóng thông báo được. Đọc403 xóa trạng thái hoàn tất/nút đóng; lịch sử lỗi bị xóa. Phản hồi đọc A đến sau khi chuyển B không hiển thị ở B. Request B UNKNOWN giữ nguyên qua reload và không mở nút tạo/đóng; POST giữ2 sau mọi lượt đọc. Tab/server thử đã đóng. Không CRM/Meta/đăng nhập thật.
- Review độc lập đã khép ba finding: quyền Lead lịch sử, kết quả cũ sau lỗi đọc, và RESULT cuối phải hoàn tất nguyên giao dịch. Kết luận mã PASS; bằng chứng PostgreSQL/build vẫn cần đối chiếu đúng tree.

## Giới hạn và việc còn mở

Journal này chỉ điều phối batch có sử dụng nó; không khóa mọi writer cũ/manual/auto. CHECK không thu hồi được một HTTP write đã gửi. Creator vẫn là chuỗi nhiều HTTP, chưa nguyên tử toàn nghiệp vụ. Mất BEGIN trước khi server trả capability có thể giữ PENDING; không tự cấp lại capability hoặc chạy lại. RUNNING/UNKNOWN cần quy trình dừng/chờ và đối soát có bằng chứng trước lệnh phục hồi được duyệt; phiên này chưa cung cấp lệnh nhả claim hoặc gộp/xóa CRM.

Toàn mục tiêu ACTIVE: còn chuyển writer cũ, bảo toàn lịch sử, cấu hình AI/lịch/người nhận/phạm vi đo và UAT/Founder release. Chưa áp SQL684 lên DB thật, tăng quyền AI, dùng model hoặc chi quảng cáo; chưa chứng minh250k bằng dữ liệu thật.

## Hoàn tác

Ngừng tiếp nhận batch mới, chờ writer đang chạy và đối soát request còn mở. Giữ nguyên bảng, claim, receipts và liên kết CRM. Không rollback về route bỏ qua journal khi còn request chưa rõ; không xóa lịch sử, không tự mở lại quyền hay creator cũ. Sau khi toàn bộ lượt được xử lý theo gói phát hành mới được chuyển code. Phát hành yêu cầu SQL684 trước code gọi RPC, cùng phiên bản UI/server, DB cô lập đạt và Founder quyết định.
