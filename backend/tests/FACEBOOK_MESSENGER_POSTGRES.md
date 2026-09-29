# VPT Messenger: PostgreSQL độc lập — Issue #7

Workflow `.github/workflows/vpt-messenger-postgres.yml` chạy PostgreSQL 16 riêng,
không có credential production. Tự chạy cho PR thay đổi đúng các file Messenger
liên quan hoặc được gọi bằng `workflow_dispatch`. Quyền GitHub chỉ `contents: read`.
Không deploy, gọi Meta, import app server, đọc `.env` hoặc truy cập Supabase.

Script `facebookMessenger.postgres.test.py` dùng Python standard library và `psql`
có trên Actions runner; mỗi worker là một kết nối PostgreSQL độc lập. Không cài
dependency dự án. Mọi hàng là dữ liệu giả. Schema `lead_attribution` lấy từ hai
fixture metadata đã được đối chiếu runtime; các bảng phụ chỉ chứa phần contract
cần cho các RPC. Đây không phải bản sao đầy đủ schema ứng dụng.

## Các kiểm chứng

1. Giữ khóa contact, quan sát đủ 8 phiên RPC cùng chờ khóa rồi giải phóng bằng
   cách kết thúc phiên giữ khóa. Tám lời gọi trả cùng một Lead; chỉ một lời gọi
   báo `created=true` và contact trỏ đúng Lead đó.
2. Trigger thử nghiệm chặn giữa insert Lead và update contact. Kết thúc kết nối
   ở vị trí này phải rollback toàn bộ, không để Lead mồ côi; retry rồi replay
   phải tạo đúng một Lead.
3. Worker giữ claim chưa commit; worker khác phải nhận receipt kế tiếp trong
   timeout 2 giây (`SKIP LOCKED`). Hủy worker đầu trả receipt đầu về queue.
4. Claim ở phiên khác không lấy được lease đang hiệu lực. Làm hết hạn lease
   trong fixture; worker thay thế nhận token mới, token cũ không được finish.
   Retry backoff và trạng thái `done` ngăn claim sớm hoặc nhận lại.
5. Gửi referral đồng thời rồi link Lead đồng thời vẫn giữ một attribution, đúng
   ad/campaign/adset đã ánh xạ. Không dùng nội dung tin nhắn để suy nguồn.

Các phiên được đồng bộ bằng trạng thái khóa quan sát trong `pg_stat_activity`,
không giả định chỉ `Promise.all`/chạy đồng thời là đủ. Thời hạn trong fixture
được cập nhật trực tiếp để không cần chờ lease 5 phút; việc này chỉ nằm trong
test. Trigger gây lỗi và phiên SQL bị hủy chỉ tồn tại trong database riêng.

## Chạy và giới hạn

Môi trường phải có một database **mới, rỗng**, tên `vpt_messenger_ci`, trên
`127.0.0.1`, cùng `VPT_ISOLATED_PG_TEST=1`. Script từ chối host/database khác và
database có bảng public. Chạy từ repository:

```bash
python3 backend/tests/facebookMessenger.postgres.test.py -v
```

Đặt `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` chỉ cho database
fixture này; Actions đã thiết lập sẵn. Database bị thay đổi bởi test và service
bị hủy cuối job, không dùng trên database có dữ liệu. Không cần cleanup migration
trên bất kỳ hệ thống chạy thật nào.

Ngày 29/09/2026, môi trường soạn bản sửa không có PostgreSQL/psql/Docker và không
được cài qua đường khác. Chỉ kiểm tra cú pháp/static đã chạy tại đây; **chưa có
kết quả PASS thực thi PostgreSQL từ workflow**. Phải đọc kết quả CI trên đúng
commit sau khi PR được tạo. PASS chỉ xác nhận các RPC trên fixture độc lập,
không chứng minh webhook Meta đã được đăng ký, backend đang chạy đúng SHA,
referral thật đã đi hết luồng, hay quảng cáo đã bật.

Hoàn tác CI: bỏ workflow và hai file test/tài liệu mới; không có dữ liệu thật
hoặc cấu hình production cần hoàn tác.
