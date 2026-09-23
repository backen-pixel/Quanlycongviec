# W0: môi trường HTTP thử riêng

Phạm vi: chuẩn bị và chạy tuyến `GET /api/work-tasks/summary` của bản sửa
phạm vi tenant kế thừa commit `34e2862469163a089372950289d834891d1a1daa`,
với dữ liệu hoàn toàn tổng hợp. Hash mã hiện tại được khóa trong launcher.
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
stderr và kết quả JSON. Trước lần thử, git có thể có bản sửa chưa commit;
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

Đợt dựng môi trường ban đầu chỉ thêm ba file harness. Bản sửa tenant hiện tại
thay đổi hai file sản phẩm (unifiedTasksQuery.js và workTasks.js), hai bộ unit
test và ba file harness/tài liệu. Không đổi SQL, quyền hệ thống hoặc service.
Sau khi chạy không có dịch vụ được giữ nền. Nếu cần hoàn tác, revert đúng
commit sửa tenant trên nhánh thử; giữ lại bằng chứng. Việc revert sẽ khôi phục
lỗi phạm vi đã tái hiện, nên bản đã revert không được coi là đủ điều kiện dùng
vận hành. Không xóa checkout nguồn hoặc chỉ bỏ kiểm thử để che lỗi.

Để kiểm chứng dữ liệu thật ở môi trường thử: chuẩn bị PostgreSQL/PostgREST hoặc
Supabase riêng có danh tính test rõ ràng; dựng schema/view từ migration được
duyệt và nạp dữ liệu giả. Không lấy URL/key vận hành để lấp chỗ trống. Kiểm chứng
UI cần bản frontend đúng nguồn và tuyến dữ liệu thử tương ứng. Laptop đang
kết nối chưa có Docker/WSL/PostgreSQL được xác nhận sẵn.


## Bản sửa phạm vi tenant — W0-HTTP-TENANT-01

Route summary truyền riêng `req.tenantContext` từ auth vào helper. Với người dùng
thuộc tenant, thiếu ngữ cảnh đã xác minh hoặc ngữ cảnh sai định dạng/khác tenant
sẽ trả 403 trước khi truy vấn dữ liệu. Danh sách công ty được xác minh bổ sung
bộ lọc IN vào cả công việc (kể cả exact count) và tra lead người phụ trách.
Danh sách công ty rỗng trả số liệu 0, không truy vấn rộng. Bộ lọc công ty/nhân viên
hiện có vẫn được giao cắt; tham số query không cấp quyền.

Các ca HTTP bổ sung kiểm tra quản trị viên T1 chỉ thấy A+B, chọn B, chỉ định C bị
403, lọc người phụ trách, tenant rỗng, giả mạo query, lead ngoài tenant và hành vi
legacy/platform/system. Ca tái hiện cũ yêu cầu 5 dòng (thay vì 6) được giữ nguyên.

Phạm vi đóng lỗi chỉ là GET `/api/work-tasks/summary` và tra lead bên trong nó.
Các tuyến list, lead-options, by-project, heartbeat và consumer trực tiếp khác
cần kiểm tra quyền riêng; không suy ra toàn bộ ứng dụng đã cách ly tenant.
Tenant không có công ty được phép trả tổng 0 và coverage EXACT cho tập dữ liệu
được phép truy cập, kể cả có lọc người phụ trách: tập này đã được xác minh rỗng,
không thực hiện tra lead. Các phạm vi người phụ trách khác vẫn giữ UNKNOWN khi
chưa có bằng chứng đầy đủ về tra lead.

## Kết quả thực thi ngày 23/09/2026

Trên LAPTOP-25460QND, Node 22.20.0:

- HTTP/JWT/SDK với dữ liệu giả: 23/23 PASS, exit 0; giữ ca tái hiện 5 dòng.
- Kiểm thử hồi quy cô lập: 122/122 PASS, không bỏ qua ca nào, exit 0.
- Run ID: `20260923T053030702Z-6d08822e`; hai cổng 61175/61176 đã đóng,
  toàn bộ socket được xác nhận đóng. Chi tiết nằm trong thư mục bằng chứng
  dưới `%LOCALAPPDATA%/BusinessAIOS/w0-runtime-evidence/`.
- Mã lúc thử được xác nhận bằng hash; commit cuối và kiểm tra hậu chạy được
  ghi trong báo cáo bàn giao. Không suy rộng kết quả sang SQL/RLS hoặc UI thật.
