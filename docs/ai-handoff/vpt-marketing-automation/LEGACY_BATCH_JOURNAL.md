04/10/2026: [Bổ sung dừng yêu cầu/tombstone](LEGACY_BATCH_STOP.md) đang nghiệm thu trong SQL686. Phần chưa START có đường hủy; RUNNING/UNKNOWN vẫn phải giữ claim và đối soát. Bằng chứng684 bên dưới giữ nguyên phạm vi lịch sử.

# Nhật ký và khôi phục lượt xử lý khách Facebook

## Phạm vi và trạng thái 04/10/2026

Bản đã kiểm `7b455b9e464b4fbabb4c05816c6076c91cda69a1`, tree `e14b82f58cef4e0405a7c33da83e192b6b94282b`; thuộc PR #22, chưa phát hành. SQL684 và route batch tạo khách lưu yêu cầu cùng kết quả từng contact để đọc lại sau reload hoặc mất phản hồi. Local294/0/0; PostgreSQL323/0/0; cả10job/build/report/Messenger SUCCESS. Reviewer độc lập đã đối chiếu published SQL/log CI và kết luận PASS đúng phạm vi SQL684/helper/API/UI. Không coi ca trình duyệt/API giả là nghiệm thu vận hành.

## Hợp đồng

- POST `/api/facebook/batch-create-leads` nhận một company, danh sách 1–500 contact UUID và requestId cố định. Actor lấy từ phiên đã xác thực. BEGIN lưu toàn bộ lựa chọn trước dispatch; cùng request chỉ trả tiến độ, không chạy lại creator.
- Schema private `crm_batch_control` giữ runs/items, hash capability riêng server, không cấp quyền đọc bảng cho public/anon/authenticated/service_role. RPC chỉ service_role; server phải còn là Primary trước/sau RPC. DB kiểm quyền hiện hành theo actor/company/tenant/Page/region/Lead.
- Unique claim chặn request khác trùng contact PENDING/RUNNING/UNKNOWN. START/CHECK kiểm capability và quyền hiện hành; RESULT xác nhận liên kết thực tế hoặc lý do bỏ qua. RESULT cuối khép COMPLETED trong cùng giao dịch khi tất cả item LINKED/SKIPPED, kể cả không gửi được FINISH.
- STOP giữ RUNNING thành UNKNOWN, PENDING thành CANCELLED; không tự đoán kết quả. UNKNOWN không được chạy lại, không có lease hết hạn hoặc tự nhả claim. FINISH có thể gọi lặp. Kết quả ghi thành công không bị xóa khi HTTP mất phản hồi.
- GET cùng request trả tiến độ đã lưu, kiểm quyền cả Lead lịch sử dù mapping contact đã đổi. GET lịch sử phân trang20 lượt theo keyset, chỉ metadata của actor/company hiện hành; không trả token, liên hệ hoặc nội dung CRM.
- Browser lưu request và UUID lựa chọn trước POST; reload chỉ GET. Retry rõ ràng giữ nguyên request/lựa chọn. Lỗi đọc xóa kết quả cũ đang hiển thị, giữ yêu cầu; chỉ kết quả COMPLETED đúng request mới đóng thông báo. Đổi phạm vi hủy tác dụng phản hồi cũ. Lịch sử server giúp tìm lượt sau khi mất lưu cục bộ.

## Bằng chứng kiểm thử

- Local294 ca: quyền/creator/batch/source regressions, adapter nhật ký và controller UI thực tế; 0 fail/skip. Harness source-route được giới hạn đúng route vì chèn GET lịch sử trước POST batch.
- 16 ca PostgreSQL mới trong intake suite đều PASS: quyền schema/RPC; yêu cầu bất biến; hai replica; claim khác UUID; đọc/replay sau crash; STOP/rollback; thu hồi quyền; Page/Lead lịch sử đổi phạm vi; history pagination; RESULT cuối không FINISH.
- Browser qua công cụ được hỗ trợ, component `FacebookBatchRecovery` thực tế + React StrictMode + API giả trên127.0.0.1:5195, CSP cấm kết nối ngoài. Xác nhận trong trang hoạt động. POST đầu lưu kết quả rồi mất phản hồi; reload chỉ GET, POST giữ1 và đọc COMPLETED đúng request, đóng thông báo được. Đọc403 xóa trạng thái hoàn tất/nút đóng; lịch sử lỗi bị xóa. Phản hồi đọc A đến sau khi chuyển B không hiển thị ở B. Request B UNKNOWN giữ nguyên qua reload và không mở nút tạo/đóng; POST giữ2 sau mọi lượt đọc. Tab/server thử đã đóng. Không CRM/Meta/đăng nhập thật.
- Review độc lập đã khép ba finding: quyền Lead lịch sử, kết quả cũ sau lỗi đọc, và RESULT cuối phải hoàn tất nguyên giao dịch. Kết luận PASS sau đối chiếu bản công bố và CI; không bao gồm UAT/chuyển writer/giải phóng UNKNOWN. CI lần đầu27b17f dừng khi parse CASE trong IF SQL684,16ca mới chưa chạy; thêm ngoặc biểu thức và chạy lại toàn bộ, không bỏ ca lỗi hoặc đổi luật.
- [Automation37173674070](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37173674070) 10/10SUCCESS; [intake111351715846](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37173674070/job/111351715846)323/0/0, gồm16ca307–322; ca315 kiểm RESULT cuối không FINISH. Node18/22 và frontend111351715884SUCCESS; Node22 job111351715786 có843+26+294 PASS,0fail/skip.
- [Report37173674086](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37173674086) và [Messenger37173674069](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37173674069)SUCCESS. Log checkout merge `85194fb5134e104d83086c6d04ce7258723455c2` đối chiếu Git API đúng tree runtime, parents base `e16c885ae7c2305645be02a1227bf378cb59137f` +runtime7b455b9.

## Giới hạn và việc còn mở

Journal này chỉ điều phối batch có sử dụng nó; không khóa mọi writer cũ/manual/auto. CHECK không thu hồi được một HTTP write đã gửi. Creator vẫn là chuỗi nhiều HTTP, chưa nguyên tử toàn nghiệp vụ. Mất BEGIN trước khi server trả capability có thể giữ PENDING; không tự cấp lại capability hoặc chạy lại. RUNNING/UNKNOWN cần quy trình dừng/chờ và đối soát có bằng chứng trước lệnh phục hồi được duyệt; phiên này chưa cung cấp lệnh nhả claim hoặc gộp/xóa CRM.

Toàn mục tiêu ACTIVE: còn chuyển writer cũ, bảo toàn lịch sử, cấu hình AI/lịch/người nhận/phạm vi đo và UAT/Founder release. Chưa áp SQL684 lên DB thật, tăng quyền AI, dùng model hoặc chi quảng cáo; chưa chứng minh250k bằng dữ liệu thật.

## Hoàn tác

Ngừng tiếp nhận batch mới, chờ writer đang chạy và đối soát request còn mở. Giữ nguyên bảng, claim, receipts và liên kết CRM. Không rollback về route bỏ qua journal khi còn request chưa rõ; không xóa lịch sử, không tự mở lại quyền hay creator cũ. Sau khi toàn bộ lượt được xử lý theo gói phát hành mới được chuyển code. Phát hành yêu cầu SQL684 trước code gọi RPC, cùng phiên bản UI/server, DB cô lập đạt và Founder quyết định.
