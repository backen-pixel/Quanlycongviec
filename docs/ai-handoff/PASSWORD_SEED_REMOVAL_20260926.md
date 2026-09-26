# Loại chức năng HTTP đặt lại mật khẩu mẫu — 26/09/2026

## Phạm vi và trạng thái

Founder cho phép sửa trên nhánh local riêng và kiểm thử cô lập; chưa cho phép đưa lên GitHub hoặc Production. Nhánh `codex/remove-public-password-seed-20260926` bắt đầu từ baseline `a458a192e83a4d656561fc87b56f926c16c6140c`, SHA đã được đối chiếu với Render. Nhánh draft Messenger vẫn giữ nguyên.

Đây là bản sửa code local. Production chưa được sửa bởi công việc này. Chưa gọi hai endpoint trên hệ thống thật, chưa xác minh tài khoản mẫu còn tồn tại hoặc có hành vi khai thác.

## Vấn đề và thay đổi

Hai handler HTTP không yêu cầu xác thực có thể đặt lại mật khẩu cố định của các tài khoản mẫu nếu dữ liệu tương ứng tồn tại. Đường thứ hai được tìm thấy khi rà toàn repo để sửa chức năng đã được duyệt.

| File | Thay đổi |
|---|---|
| `backend/src/server.js` | Gỡ handler POST `/api/seed-passwords` |
| `backend/src/routes/auth.js` | Gỡ handler POST `/reset-seed-passwords`, được mount dưới `/api/auth` |
| `backend/tests/password-seed-removal.test.js` | Regression cô lập cho route đã gỡ và các luồng được giữ |
| `docs/api/API_DOCUMENT.md` | Bỏ endpoint cũ khỏi inventory; chỉnh count theo phần thay đổi, chưa tái quét toàn bộ |
| `docs/ai-handoff/CURRENT.md`, `WORKLOG.md` | Trạng thái, quyền thực hiện, bằng chứng và giới hạn |
| Tệp này | Hồ sơ review, kiểm thử và bàn giao |

Runtime chỉ bỏ 23 dòng ở hai handler. Không thay logic đăng nhập, đổi mật khẩu có xác thực, health, schema/migration, tài khoản hoặc cấu hình. Không bổ sung seed command hay endpoint quản trị thay thế. Không tìm thấy caller frontend/mobile cho hai đường gọi trong lần rà.

## Kiểm thử

**PASS: 7/7 test, 0 fail**, tác giả và reviewer độc lập đều chạy đạt. Bao gồm 16 tổ hợp HTTP cho hai route cũ (có/không phiên giả; URL thường, dấu `/` cuối, query, chữ hoa) trả 404 với 0 DB read/write/hash; root và health 200/503; login thiếu thông tin và login thành công với dữ liệu giả; đổi mật khẩu có auth, kiểm mật khẩu hiện tại và ghi đúng user.

Đối chứng dùng hai file baseline qua `git show` và thay đầu vào đọc file trong bộ nhớ: đúng 2 test route-presence thất bại + 5 test còn lại đạt. Kiểm registry dừng trước request, không thực thi handler seed cũ. Không gọi baseline trên Production.

Lệnh chạy từ repo có dependencies backend đã cài:

```sh
node --test backend/tests/password-seed-removal.test.js
```

Trong workspace lượt này dùng dependencies sẵn có, không cài mới:

```sh
NODE_PATH=/workspace/scratch/3c2fbcb14be2/crm-attribution/backend/node_modules node --test backend/tests/password-seed-removal.test.js
```

Auth/JWT/session/bcrypt/DB/health đều có mock rõ; HTTP thực chỉ trong bộ thử dùng Express ở cổng loopback tạm. Không chạy application startup, không đọc `.env`, không kết nối dịch vụ bên ngoài. Cảnh báo Express về Promise khác VM realm xuất hiện nhưng không làm fail. Kiểm thử không thay thế nghiệm thu full startup/auth integration hoặc deploy thật.

Reviewer xác nhận runtime chỉ bỏ 23 dòng, không phát hiện blocker trong phạm vi này; các luồng khác giữ nguyên. Đã kiểm cú pháp và `git diff --check`.


Đã kiểm cú pháp hai file runtime, so sánh với baseline để xác nhận chỉ bỏ hai handler, kiểm `git diff --check`. Phải dùng các module mock/dữ liệu giả cho kiểm thử hành vi; không require hoặc khởi động `backend/src/server.js` đầy đủ vì startup có Redis, worker/cron và ghi dữ liệu.

## Giới hạn và việc tiếp theo

- Test cô lập không chứng minh bản đang chạy trên Render đã được sửa; không thay thế thử staging với đúng cấu hình.
- Quyền mới chỉ cho local. Chưa push, chưa PR, chưa merge, chưa deploy hoặc chạy SQL.
- Trước khi triển khai riêng: review commit cuối; xác minh DB/Redis/storage/backup staging tách biệt, không token tích hợp thật; kiểm side effects khi startup; kiểm bản đang chạy và kế hoạch phát hành.
- Nếu có nhu cầu xác minh tài khoản mẫu/log thực tế, thực hiện thành bước quản trị riêng với quyền phù hợp; không dùng endpoint cũ để kiểm tra.

## Hoàn tác

Không có dữ liệu, migration hay cấu hình đã thay đổi cần hoàn tác. Có thể đảo commit local để bỏ bản sửa, nhưng việc phục hồi handler cũ sẽ mở lại lỗ hổng; không coi đó là phương án rollback bảo mật an toàn. Nếu phát hiện regression khi chuẩn bị phát hành, giữ route seed bị loại và sửa regression trên bản mới được review.
