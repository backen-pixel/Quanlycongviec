# W0: môi trường HTTP thử riêng

Phạm vi: chuẩn bị và chạy tuyến `GET /api/work-tasks/summary` của bản sửa
`8f2513c7b21adf0ab18e905a08f02b71e9585ca6` với dữ liệu hoàn toàn tổng hợp.
Đây là môi trường kiểm thử HTTP tích hợp có nguồn dữ liệu mô phỏng, không phải
bản ứng dụng đầy đủ, staging SQL, hay giấy phép đưa vào vận hành.

## Thành phần

- Express, jsonwebtoken và Supabase SDK thật; phiên bản phải khớp lockfile.
- Sáu module ứng dụng thật: route workTasks, unifiedTasksQuery, auth, tenantGate,
  tenantScope và adminRole. Loader giới hạn import; không đọc cấu hình ứng dụng.
- Hai máy chủ tạm thời chỉ bind `127.0.0.1`: API và nguồn dữ liệu HTTP mô phỏng.
- Tài khoản/công ty/tenant/công việc và khóa ký JWT chỉ dùng cho lượt thử.
- TTL cache, nhật ký xác thực là bộ nhớ thử; các helper ghi/notification bị chặn.
- Chỉ mở GET summary ở harness. Không đổi chính sách Founder-local.

## Chạy trên laptop

Từ PowerShell, chạy file trong nhánh `codex/w0-summary-fix-20260923`:

```powershell
& 'C:/Users/HUNG/Documents/ChatGPT/sourse thật/_tmp_business-ai-os-w0-summary-fix-20260923/backend/tests/w0-runtime/run-runtime-smoke.ps1' -DependencyBackend 'C:/Users/HUNG/Documents/ChatGPT/sourse thật/_tmp_business-ai-os-founder-local-v1/backend'
```

`DependencyBackend` chỉ cung cấp thư viện đã có trong `node_modules`; mã ứng dụng
được lấy từ nhánh sửa. Không cài package, không dùng server hoặc `.env` của checkout
cung cấp thư viện. Runner đối chiếu phiên bản thư viện với lockfile nhánh sửa.

Launcher kiểm tra SHA-256 byte Windows của sáu module, commit gốc và nhánh trước khi
chạy. Mỗi lần tạo thư mục bằng chứng riêng dưới
`%LOCALAPPDATA%/BusinessAIOS/w0-runtime-evidence/`, gồm metadata đầu/cuối, stdout,
stderr và kết quả JSON. Trước lần thử, git có thể có file harness chưa commit;
trạng thái đó được ghi nhận. Thay đổi mã ứng dụng sẽ bị từ chối cho tới khi có
ràng buộc phiên bản mới được rà soát.

Tiến trình Node nhận môi trường mới, không kế thừa token/cấu hình của shell. Node
permission chỉ cho đọc nguồn/thư viện và ghi thư mục bằng chứng, không cho tạo
tiến trình con. Việc chặn mạng dựa trên loader và fetch giới hạn origin của
harness, không phải tường lửa ở mức hệ điều hành.

## Đọc kết quả

- PASS từng ca là bằng chứng HTTP/JWT/SDK và mã route trên dữ liệu mô phỏng.
- FAIL nghiệp vụ/quyền là điều kiện chưa đạt, không đổi thành PASS vì môi trường
  dựng thành công. Không bỏ ca sai hoặc sửa fixture để che kết quả.
- Runner đóng server trong phần dọn dẹp; launcher giới hạn thời gian 90 giây và
  chỉ dừng tiến trình con do nó tạo nếu hết giờ.
- Kết quả chưa chứng minh SQL view, RLS, schema/migration, UI trình duyệt, dữ liệu
  thật, tốc độ vận hành, đăng nhập thật hay toàn bộ hệ thống Business AI OS.

## Hoàn tác và bước sau

Các file mới nằm riêng trong `backend/tests/w0-runtime/`; không đổi mã sản phẩm,
SQL, quyền hệ thống hoặc service. Sau khi chạy không có dịch vụ được giữ nền.
Hoàn tác bằng commit revert chứa ba file harness hoặc xóa đúng ba file đó nếu
chưa commit; giữ lại bằng chứng nếu cần đối chiếu. Không xóa checkout nguồn.

Để kiểm chứng dữ liệu thật ở môi trường thử: chuẩn bị PostgreSQL/PostgREST hoặc
Supabase riêng có danh tính test rõ ràng; dựng schema/view từ migration được
duyệt và nạp dữ liệu giả. Không lấy URL/key vận hành để lấp chỗ trống. Kiểm chứng
UI cần bản frontend đúng nguồn và tuyến dữ liệu thử tương ứng. Laptop đang
kết nối chưa có Docker/WSL/PostgreSQL được xác nhận sẵn.
