# Dừng và chờ các worker nhận khách, gửi lịch

Ngày 04/10/2026. Runtime `f3ea85ee6f453ec0931a630c6899cc4331affd3c`, tree `7cb56c23623d9801672badfeb453557e4c0a694f`, baseline `7b4e94cf7d6fac0e8984d12ef60a67adf06faa9c`, PR22 draft. Đây là bước triển khai trong mục tiêu Facebook → CRM → khảo sát → dashboard, không phải nghiệm thu toàn hệ thống hoặc mở đợt quảng cáo.

## Thay đổi vận hành

Năm worker được đăng ký: Messenger receipt, Lead intake, Lead census, gửi đề xuất khảo sát và gửi kết quả khảo sát. Trước đây, gọi `drain()` khi đang chạy trả về ngay; timer không có đầu mối stop/join. Nay các lời gọi cùng nhận promise của lượt đang chạy. `stop()` là chốt một chiều trong RAM; `waitForIdle()` chỉ quan sát và có giới hạn thời gian. Quá hạn không xóa công việc đang chạy hoặc xác nhận nghiệp vụ đã hoàn tất.

- Group sở hữu interval/immediate hiện có; stop hủy lịch và chặn cả callback đã xếp hàng. Tất cả worker được yêu cầu dừng trước khi chờ bất kỳ worker nào. Lỗi một worker không ngăn yêu cầu dừng các worker còn lại.
- Messenger: nếu stop trong lúc claim, không xử lý event; chỉ trả lease của chính lượt đó. Event đã bắt đầu được chờ tới xử lý và lưu kết quả.
- Intake/census: ngừng claim mới và không bắt đầu đọc nguồn/commit tiếp sau stop; RPC đã gửi được chờ. Lease chưa xử lý giữ cơ chế phục hồi DB hiện hành.
- Survey: ngừng claim/gửi mới. Claim về sau stop được ghi UNCERTAIN, không gửi; POST đã bắt đầu vẫn chờ ACK/UNCERTAIN và lưu kết quả, không gửi lại. Stop không xóa các lượt chưa rõ kết quả.

## Tích hợp máy chủ, mặc định tắt

`VPT_WORKER_SHUTDOWN=1` mới cài handler SIGTERM/SIGINT; không thêm endpoint điều khiển từ HTTP. Cờ không được bật trong thay đổi này. Middleware đứng trước mọi HTTP route: sau tín hiệu dừng, yêu cầu mới nhận 503/Retry-After, không ACK giả rằng đã lưu webhook. Các event chưa ACK phải được nguồn giữ/retry và đối soát theo runbook; chưa kiểm nguồn thật.

Server ngừng nhận HTTP/socket, yêu cầu dừng năm worker và chờ đóng mạng cùng các promise đang chạy dưới deadline chung 20 giây. Tín hiệu lặp/reentrant dùng cùng một lượt. Report gồm bootId, revision SHA nếu hợp lệ, phạm vi, thành viên, timeout và mã lỗi đã làm sạch. Exit 0 chỉ có nghĩa các phần đã đăng ký/đóng mạng không báo lỗi trước deadline; exit 1 khi lỗi/quá hạn. Cả hai đều giữ `processesDrained:false`, `processTerminationRequired:true`, không sửa dữ liệu nghiệp vụ hoặc mở hold.

Report **không bao gồm** HTTP receiver đã vào handler, công việc sau ACK, vòng quét/cron/AutoTool/batch queue cũ, tác vụ con không await, socket/mobile push tách rời, tiến trình khác và HTTP/DB đã gửi ở xa. Socket đóng không chứng minh push ở xa đã kết thúc. Công việc cũ còn có thể khởi động trong thời gian chờ; vì vậy **chưa đủ điều kiện bật cờ hoặc dùng report để chuyển Page/tắt hold SQL687**. Phải khép việc ngừng nhận và chờ các đường này, kiểm từng instance/job/script, rồi đối soát UNKNOWN bằng bằng chứng. Không dựa vào TTL leader Redis hoặc thời gian chờ để tự kết luận đã dừng.

## Kiểm chứng

Local Windows: 1.276 ca PASS, 0 fail, 2 skip cho SIGTERM/SIGINT native Linux. Bộ mới kiểm stop trước microtask, promise chung, lỗi/timeout/late completion, dừng từng worker khi claim/provider/commit/send/result, chờ lưu ACK, scheduler đã queued, mọi member stop dù lỗi, middleware 503, cờ mặc định tắt, mạng chưa đóng, tín hiệu lặp và report không lộ lỗi riêng tư. Router registry được thực thi trong VM với worker giả; kiểm thứ tự middleware trong nguồn server. Không khởi động bootstrap CRM thật.

Review độc lập phát hiện lỗi P2 khi đóng socket bỏ qua lỗi callback/promise; đã sửa để chờ cả hai kênh và kiểm callback lỗi, promise reject, callback thành công rồi reject. Reviewer đã đối chiếu năm blob helper/test/fixture đã công bố, log Node22 và CI merge; kết luận PASS checkpoint tại runtime trên. Không còn finding chặn trong phạm vi này.

Hai ca native Linux chạy child Node + HTTP loopback, worker giả và tín hiệu OS thật: SIGTERM rồi SIGINT vẫn chờ lưu receipt trước exit; deadline hết thì giữ active và exit lỗi. Không DB/provider/model hoặc tin gửi khách. Cả hai đã PASS trên Node18/22. PostgreSQL không đổi trong delta này; bộ regression vẫn chạy để kiểm tích hợp nhánh.

- [Automation CI37180023384](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37180023384): cả 10 job SUCCESS. Mỗi bản Node18/22: 843+26+359+50 = **1.278 PASS, 0 fail, 0 skip**; nhóm50 gồm42 ca lifecycle/shutdown (2 ca native Linux) và8 regression Messenger.
- Node22 job111370529825 và Node18 job111370529918 có log xác nhận hai ca native signal; lead-intake PostgreSQL job111370529821: **348/0/0**. Frontend job111370529952 build thành công,10.333 modules.
- [Report CI37180023383](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37180023383) và [Messenger CI37180023406](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37180023406) đều SUCCESS.
- CI checkout merge `6ffd63785867bafb6b46214414435498f5e0dfae`. Git API xác nhận tree đúng runtime, hai parent là `e16c885ae7c2305645be02a1227bf378cb59137f` và runtime `f3ea85ee6f453ec0931a630c6899cc4331affd3c`.

Ca VM/source wiring không thay nghiệm thu bootstrap Express/Socket.IO/Redis/Supabase thật. CI không chứng minh external effect đã ngừng, UNKNOWN đã đối soát hay CPQL thực tế. Commit khép hồ sơ chỉ đổi tài liệu; checks của head đó theo dõi trong PR22, không tự mở quyền phát hành.

## Hoàn tác và phần còn lại

Tắt cờ giữ hành vi tín hiệu cũ trong phiên khởi động tiếp theo; không đặt lại một latch đã stop trong tiến trình hiện tại. Khi bỏ bản sửa, phải ngừng phiên mới đúng quy trình, giữ receipt/attempt/journal/UNKNOWN và đối soát; không xóa lịch sử, mở lại quyền DB cũ hoặc tự nhận đã dừng toàn bộ.

Tiếp theo: bao phủ legacy writer và tác vụ sau ACK/child promise → chứng minh mọi tiến trình cũ đã ngừng → đối soát UNKNOWN/chuyển luồng → cấu hình AI/lịch/người nhận/phạm vi đo → UAT toàn tuyến và gói Founder release. Mục tiêu 250.000đ/khách hợp lệ trả phí chưa được chứng minh bằng dữ liệu thật; không có migration thật, quyền AI mới, mở chi, merge hoặc phát hành trong checkpoint này.
