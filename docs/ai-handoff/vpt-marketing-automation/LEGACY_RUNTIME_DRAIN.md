# Dừng các vòng cũ và chờ tác vụ Facebook

Ngày 04/10/2026. Baseline `9245e69f3a17b8dafba0a2f43818de0393091d05`, PR22 draft. Mở rộng [worker drain](WORKER_DRAIN.md) để chuẩn bị chuyển luồng nhận khách; chưa chứng nhận toàn process hoặc mở quyền chạy thật.

## Những đường đã nối

`processWork` giữ promise của root task đã nhận, tác vụ con đã bắt đầu, timer và giấc nghỉ. Stop là chốt một chiều trong RAM: từ chối root mới, hủy lịch và đánh thức sleep, chờ phần đã nhận. Theo dõi child mới sinh trong lúc parent đang kết thúc; không lấy một snapshot Promise.all làm bằng chứng cả nhóm đã rỗng. Deadline của nhóm dùng đồng hồ monotonic và không được cấp lại sau mỗi vòng. Shutdown báo lỗi nếu còn thành viên chưa drain.

| Đường thực thi | Hành vi khi dừng |
|---|---|
| Pipeline theo công ty | Theo dõi starter đang chờ Redis và loop; kiểm latch sau chờ, không reset stop để khởi động muộn; ngắt sleep, chặn timeout restart và chờ cleanup lease. |
| Master schedule, lead scan, rescan | Theo dõi boot/config, callback và batch đang chạy; hủy timer; callback đến muộn không vào nghiệp vụ mới hoặc tự re-arm. Không ghi master=false để shutdown. |
| AutoTool | Chờ vòng đang chạy và các promise lưu config/enable đã nhận. Quiesce chỉ đổi state RAM, không gọi nút stop nghiệp vụ để ghi disabled. Lỗi loop không để running=true giả. |
| Leader jobs | Track cả chờ Redis, callback và release. Stop trong chờ không gọi nghiệp vụ; lock vừa lấy muộn được trả theo owner hiện hành. Không dùng TTL làm bằng chứng drain. |
| Batch queue | Chặn enqueue/resume/retry/pause/cancel và direct process mới; ngừng pump, boot/poll/retry/immediate. ID đã lấy từ BRPOP/shift vẫn được xử lý và chờ lưu kết quả. Không ném STOP vào handler để kích hoạt generic retry. |
| Marketing spend sync | Hủy cả boot timeout5 phút và interval; chờ runOnce/đọc nguồn đang chạy. Stop lịch riêng vẫn có thể start lại trước khi quiesce; process stop một chiều. |
| HTTP Facebook | Root router và hai router `/customer-care`, `/lead-intake` dùng chung tracker. Chờ promise handler cả sau HTTP200 hoặc client disconnect. Middleware async thông thường được theo dõi; Router con phải instrument handler tại lúc tạo. |
| Child được xác định | Theo dõi name resolution; creator chờ pushNotification; helper máy chủ chờ cache invalidation/mobile push. Lock hội thoại nằm trong promise handler/worker, không lấy map size làm chứng cứ. |

Registry có năm durable workers và năm nhóm legacy. Các cờ bật nghiệp vụ và `VPT_WORKER_SHUTDOWN` vẫn giữ mặc định; không bật hệ thống thật. Chốt dừng toàn registry xảy ra trước khi chờ từng nhóm. Những request hoặc job đã được nhận có thể tiếp tục ghi kết quả trong thời gian chờ; `stop()` không có nghĩa mọi giao dịch đã kết thúc ngay.

## Hai lỗi review đã sửa

1. Durable worker có thể sinh child vào legacy tracker sau khi legacy đã trả idle ở lượt đầu. Group nay kiểm lại tất cả thành viên cho tới cùng idle trong deadline; `WORKERS_NOT_DRAINED` không cho exit thành công giả.
2. Bọc `r.use(childRouter)` không theo dõi promise handler con. Hai module Facebook con được instrument ngay trước đăng ký handler và dùng singleton cùng root. Có ca HTTP thật với client ngắt khi RPC giả còn chờ.

## Bằng chứng tại bản làm việc

Local Windows: **1.304 PASS, 0 fail, 5 skip** (2 signal Linux và3 Express thật chỉ bật trên CI). Có25 ca legacy mới trên helper/mã module thật với DB/Redis/provider giả; thêm3 regression nhóm/shutdown. Bao gồm stop trong chờ leader/config/BRPOP, giữ ID đến lưu kết quả, retry pending, boot trả muộn, re-arm, cleanup thất bại và child sinh muộn. Một fixture scan từng đếm nhầm timer quan sát của chính test; đã đổi sang kiểm số lịch nghiệp vụ và số lần scan.

CI cài Express5.2.1 trong thư mục test cô lập, khớp backend lock; không bootstrap server CRM. Ba ca HTTP loopback kiểm post-ACK, lỗi handler tới middleware đúng một lần và nested handler tiếp tục được theo dõi sau client disconnect/HTTP close. Reviewer độc lập đã kiểm lại hai finding và kết luận code-review PASS; CI/native đúng phiên bản còn chờ.

## Giới hạn và điều kiện chuyển luồng

- Report vẫn `processesDrained:false`, `businessReconciled:false`. Bao phủ các điểm đã đăng ký, không khẳng định mọi router/cron/script của hệ thống. Những job qua `runIfLeader` được chặn ở điểm vào, nhưng child không trả promise hoặc tác vụ ngoài registry của các module khác chưa được chứng nhận.
- Pending queue không đồng nghĩa completed: retry có thể được giữ trong DB mà chưa có cơ chế tự nạp lại bền vững sau restart. `pendingInMemory` chỉ là phần thấy ở instance này; `queueReconciled:false`. Không tự chạy lại job đã có tác động một phần hoặc giải phóng UNKNOWN. Việc khôi phục/đối soát queue và các instance khác còn phải hoàn thiện.
- Theo dõi promise HTTP/client ở đây không xác nhận handler của dịch vụ xa đã dừng khi timeout/mất phản hồi. Internal HTTP retry, remote DB/provider và tác vụ socket khác vẫn cần bằng chứng vận hành/đối soát riêng.
- Chưa chấp nhận report này làm căn cứ tắt hold SQL687 hoặc chuyển Page. Phải kiểm đủ inventory instance/job/script, nguồn nhận sự kiện, khôi phục, UNKNOWN và phiên bản triển khai; sau đó mới trình Founder release. Không gộp/xóa CRM vật lý, không thay DB thật, gọi model/provider, gửi khách hoặc đổi ngân sách.

## Hoàn tác

Giữ cờ shutdown tắt trong môi trường thật. Nếu đã được duyệt thử cô lập, ngừng phiên bằng deadline và giữ biên nhận/queue/journal; không reset latch ngay trong tiến trình. Bỏ bản sửa không được tự replay pending/UNKNOWN hoặc mở quyền ghi cũ. Cấu hình enable nghiệp vụ vẫn được giữ; operator phải đối soát các lượt đã bắt đầu trước khi bật tiếp.

Mục tiêu đầy đủ còn ACTIVE: hoàn thiện khôi phục/đối soát chuyển luồng → cấu hình AI, người nhận/lịch/phạm vi đo → UAT toàn tuyến → Founder duyệt phát hành → mở các kênh tiếp theo theo quyền thực tế. 250.000đ/khách hợp lệ trả phí vẫn là mục tiêu, chưa có dữ liệu thật chứng minh.
