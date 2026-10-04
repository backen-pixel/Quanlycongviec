# Dừng lượt tiếp nhận Facebook có lưu bằng chứng

## Phạm vi 04/10/2026

Runtime đã kiểm e7d35d1bf97d490da59834563ec800266d92fa15, tree be09250813bf49ad6c34071293062e61633276b0, PR22 chưa phát hành. Hoàn thiện đường khôi phục khi BEGIN mất phản hồi/capability: dừng đúng yêu cầu, hủy phần chưa bắt đầu và giữ phần đã bắt đầu để đối soát. Không tự suy từ mapping hiện tại rằng một HTTP cũ đã kết thúc.

## Hợp đồng và thứ tự đồng thời

- POST /api/facebook/batch-create-leads/:requestId/stop nhận duy nhất company_id và ordered contact_ids từ1–500UUID, không trùng. Actor từ phiên đã xác thực; Primary trước/sau RPC. Không cấp capability cho browser.
- SQL686 dùng quyền actor/company/tenant/Page/Lead hiện hành và historical Lead như READ. Chỉ người sở hữu yêu cầu được dừng đúng công ty/danh sách; request tái dùng với actor/company/thứ tự khác bị từ chối. Schema và stops audit private, service_role chỉ được gọi RPC.
- STOP và BEGIN dùng cùng advisory khóa request. Chưa có run thì ghi tombstone REVIEW/allCANCELLED theo đúng danh sách, không chiếm contact claim; BEGIN đến muộn trảexecute=false. Nếu BEGIN đã ghi thì STOP khóa run giống START/CHECK/RESULT.
- STOP thu hồi token cũ ngay trong giao dịch; không cấp token mới. PENDING→CANCELLED giải phóng phần chưa chạy; RUNNING→UNKNOWN giữ claim. LINKED/SKIPPED giữ kết quả đã commit; COMPLETED không bị diễn giải thành chưa chạy. RESULT đến sau STOP bị từ chối. STOP/FINISH cũ không đổi audit.
- Một audit/run giữ before/after và actor/company/ordered IDs. Lặp STOP kiểm lại quyền và trả hiện trạng, không thêm audit hoặc gửi creator. Rollback khôi phục token/claim/trạng thái, không có receipt dừng giả.
- UI lưu intentSTOP cùng request/lựa chọn trước mạng. Reload chỉ GET. Resend đọc lại storage để nhận STOP từ tab khác, chỉ gửi STOP khi đã lưu ý định đó. Chọn từ lịch sử thì giữ đúng IDs server; confirmation gắnrequestID, đổi dòng không được dừng nhầm.
- Có thể đóng thông báo nếu COMPLETED hoặc REVIEW chỉ gồm LINKED/SKIPPED/CANCELLED. CANCELLED được báo riêng, không tính đã tạo. Còn PENDING/RUNNING/UNKNOWN thì giữ yêu cầu, không mở tạo lượt thay thế. Lỗi đọc xóa kết quả cũ nhưng giữ intent.

## Kiểm chứng

- Local/Node22=1228/0/0, gồm30ca mới (20backend+10UI). Reviewer tự chạy67/67 cùng37regressions; sau đối chiếu published blobs và log CI kết luận PASS độc lập checkpoint SQL686/helper/API/UI.
- Đã viết12ca PostgreSQL thật trong facebookBatchStop.cases.js: quyền/private audit; STOP↔BEGIN, STOP↔START, STOP↔RESULT qua hai connection và quan sát Lock; nhóm hỗn hợp; replay/mismatch; thu hồi quyền và Lead lịch sử; rollback; workerSTOPmuộn. Nạp684→686hai lần. Intake PostgreSQL335/0/0, đủ12ca323–334PASS.
- Browser component FacebookBatchRecovery thật/StrictMode/API giả tại127.0.0.1:5197, CSPconnect-srcnone, khôngCRM/Meta/đăng nhập thật. BEGIN chưa tới→STOP đã lưu nhưng mất phản hồi→reload GET đọc2CANCELLED,0đãtạo và cho đóng thông báo; BEGIN giữ1,STOPgiữ1. Lượt thứhai RUNNING+PENDING→STOP→UNKNOWN+CANCELLED, reload giữ yêu cầu/không có nútđóng/không cho tạo khác; BEGINgiữ2,STOPgiữ2. Confirmation hiện đúngUUID và nói rõ phần đã bắt đầu cần đối soát. Tab/server đã đóng; đây không phải UAT/backend thật.

## CI đúng phiên bản

[Automation37176604445](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37176604445):10/10SUCCESS. [Intake111360403652](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37176604445/job/111360403652)=335/0/0; Node22 job111360403604=843+26+359=1228/0/0; frontend111360403582SUCCESS. [Report37176604521](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37176604521) và [Messenger37176604431](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37176604431)SUCCESS.

CImerge cf048998717afca4fb5e65328798af696a756ecf đã đối chiếu Git API đúng tree be09250813bf49ad6c34071293062e61633276b0, parents basee16c885ae7c2305645be02a1227bf378cb59137f + runtimee7d35d1bf97d490da59834563ec800266d92fa15. Bản đóng hồ sơ chỉ sửa5file tài liệu, không đổi runtime/tests.

## Điều kiện phát hành và hoàn tác

SQL686 theo sau684; UI/server cùng phiên bản. Chưa áp DB thật, gọi mô hình, chi quảng cáo hoặc mở quyền Business Agent. Founder duyệt gói phát hành sau kiểm thử/đối soát đầy đủ.

Không thể hoàn tác STOP bằng khôi phục token hoặc biến CANCELLED/UNKNOWN thành PENDING. Giữ tombstone/audit/claim, không cho BEGIN cũ chạy lại. Khi dừng chức năng, giữ khả năng GET đọc và ý địnhSTOP đã lưu; không quay về UI cũ không hiểu intent hoặc route bỏ qua journal. Hồ sơ CRM đã phát sinh giữ nguyên.

## Phần còn mở để đạt mục tiêu đầy đủ

UNKNOWN vẫn giữ claim. Các bước Customer/Lead/message/task/notification của creator cũ là nhiều giao dịch, CHECK không giữ khóa xuyên HTTP. SQL680 mới chặn mapping/inverse; SQL682 reservationMade=false; khóa bộ nhớ một instance và stopRequested không chứng minh mọi writer đã dừng. Muốn khép UNKNOWN cần fence bền vững bao phủ writer hoặc gói dừng/chờ tất cả process/queue có bằng chứng, rồi đối soát nguyên tử; khóa maintenance ngắn rồi nhả chưa đủ.

Đã bổ sung [hold DB bền vững SQL687](LEGACY_WRITE_HOLD.md), kiểm PostgreSQL trên bản9ecbec4. Nó chặn DML/TRUNCATE của manifest trong cửa sổ bảo trì nhưng không dừng process/HTTP/socket/mobile. UNKNOWN vẫn giữ nguyên; còn inventory/dừng/drain đầy đủ và đối soát nguyên tử trước mở lại. Chưa bật hold hoặc áp DB thật.

Tiếp tục khép chuyển writer/UNKNOWN, cấu hình AI/lịch/người nhận/phạm vi đo, UAT toàn tuyến và Founder release. Mục tiêu250k/khách hợp lệ duy nhất chưa được chứng minh bằng dữ liệu thật; full goal ACTIVE.
