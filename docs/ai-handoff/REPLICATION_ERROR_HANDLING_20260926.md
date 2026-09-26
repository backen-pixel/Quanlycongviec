# Xử lý lỗi đồng bộ dự phòng — 26/09/2026

## Phạm vi

Founder cho phép sửa phần xử lý lỗi đồng bộ trên nhánh riêng, kiểm thử cô lập và mở PR để review. Chưa cho phép merge/deploy bản này, thay cấu hình hoặc tác động hàng đợi/dữ liệu thật.

Nhánh `codex/replication-error-handling-20260926` bắt đầu từ `3d098a4d5ff49ccc93343b15d8aec2b1a446a6bf`, bản đã chứa PR #3 gỡ handler mật khẩu. Bản sửa này độc lập với draft Messenger, lỗi 403 nghiệp vụ và cấu hình tên miền.

## Vấn đề

`backupFetchWithGrantRetry()` đã đọc body lỗi và trả `{res, text}`. Hai caller upsert Facebook contact và upsert generic bỏ `text`, rồi đọc response body lần nữa. Response body chỉ đọc được một lần, nên thông báo và phân loại lỗi mất đầu vào cần thiết.

Parser FK trước đó áp regex trực tiếp lên chuỗi JSON PostgREST, trong đó tên bảng trong `details` đã escape; vì vậy bỏ sót lỗi thiếu khóa ngoại. Mặt khác, lỗi raw được đưa vào `last_error`, sau đó xuất qua health, nên khôi phục thông tin lỗi phải kèm bảo vệ dữ liệu.

## Thay đổi được thiết kế

- Giữ cached error text từ helper; giữ nguyên response thành công để caller đọc JSON như cũ.
- Đọc PostgREST JSON và nhận diện FK đơn, đồng thời hỗ trợ thông báo văn bản cũ. Không suy diễn FK tổng hợp hoặc định dạng không rõ.
- Giữ thông tin lỗi cho nhánh xử lý nội bộ, nhưng diagnostics công khai chỉ chứa HTTP status/mã lỗi kỹ thuật đã kiểm tra; không đưa message/details/hint, giá trị dòng, query hoặc secret ra ngoài.
- Giữ giới hạn retry/depth, cấu trúc hàng đợi và điều kiện cấp grant hiện hữu. Không bổ sung hoặc thực thi grant, sửa schema, quyền truy cập hoặc business rules.

## Kiểm thử

Lệnh đã chạy:

```sh
node --test backend/tests/supabase-replication-errors.test.js
```

Harness dùng mã xử lý thật trong VM và dependency mock; Response/HTTP/DB là dữ liệu giả. Không require application config, đọc `.env`, mở socket, khởi động app/cron/worker hoặc gọi dịch vụ thật. Grant retry chỉ được mô phỏng bằng stub.

Kết quả trên bản sửa: **14/14 kiểm thử cô lập đạt**; `node --check` cho helper/test và `git diff --check` đạt. Suite kiểm cả contact/generic 400, body thành công, FK JSON/văn bản/định dạng không hỗ trợ/giới hạn depth, duplicate PATCH, retry quyền bằng stub, worker/drain giả và che nội dung lỗi tại các đường diagnostics. Đây là bộ thử mới trên module sửa, không phải proof ở lượt trước.

Rà độc lập: **PASS, không có phát hiện chặn PR**; reviewer chạy lại suite và xác nhận 14/14 đạt. Bản local sẵn sàng công bố nhánh/PR để review. Không có bằng chứng CI hoặc staging từ các kiểm thử local này.

## Giới hạn và điều kiện phát hành

Bản sửa giúp xử lý/quan sát lỗi đúng định dạng; **chưa chứng minh nguyên nhân HTTP 400 thực tế trên backup đã được khắc phục**. Cần mã lỗi thực và đối soát catalog primary/backup trước bất kỳ thay đổi dữ liệu/schema nào.

Khi Redis disabled, module hiện dùng hàng đợi RAM. Restart hoặc deploy có thể làm mất tác vụ sao chép đang chờ. Trước phát hành phải có kế hoạch bảo toàn hoặc đối soát/tái lập backlog được nghiệm thu, cùng phê duyệt triển khai riêng. Không restart để làm sạch queue hoặc coi queue giảm là đã đồng bộ thành công; job có thể bị bỏ khi vượt số retry.

Phạm vi này không sửa persistence, không chạy drain/replay, không chuyển primary/backup và không thay chính sách retry. Chưa kiểm startup toàn hệ thống, schema thật, grant thật, failover hoặc lưu trữ.

## Hoàn tác

Trước merge: đóng PR hoặc bỏ nhánh. Chưa có dữ liệu thật phải hoàn tác.

Sau một lần phát hành được duyệt riêng: nếu cần revert, chỉ revert commit xử lý lỗi đồng bộ, giữ bản gỡ handler mật khẩu của PR #3. Việc thay tiến trình vẫn phải bảo toàn/đối soát hàng đợi. Revert sẽ đưa lỗi mất chi tiết/parsing cũ trở lại; ưu tiên sửa tiếp theo nguyên nhân đã chứng minh.
