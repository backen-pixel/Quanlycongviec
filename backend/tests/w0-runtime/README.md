# W0: môi trường HTTP thử riêng

Phạm vi hiện tại: bốn tuyến GET `/api/work-tasks/summary`, `/api/work-tasks`,
`/api/work-tasks/lead-options` và `/api/work-tasks/by-project/:projectId`.
Bản sửa kế thừa commit `48b6735669d5b2b9e0544d87801d1504e1b75e22`.
Hash byte Windows của mã hiện tại được khóa trong launcher.
Đây là HTTP tích hợp với dữ liệu tổng hợp, không phải ứng dụng đầy đủ,
PostgreSQL/PostgREST thật, staging SQL hoặc giấy phép đưa vào vận hành.

## Thành phần và giới hạn

- Express, jsonwebtoken và Supabase SDK thật; phiên bản khớp lockfile.
- Bảy module ứng dụng thật: workTasks, unifiedTasksQuery, auth, tenantGate,
  tenantScope, adminRole và crmTaskAttachmentCounts. Loader giới hạn import,
  không đọc cấu hình ứng dụng, token hoặc `.env` thật.
- Hai server tạm chỉ bind `127.0.0.1`: API và HTTP mô phỏng PostgREST.
- Tài khoản, công ty, tenant, công việc và khóa JWT chỉ dùng cho lượt thử.
- TTL cache và nhật ký xác thực nằm trong bộ nhớ; helper ghi/notification bị chặn.
- Harness chỉ mở bốn GET trên; project ID phải là UUID. Không đổi chính sách
  Founder-local. Nguồn mô phỏng chỉ cho GET, kể cả khi SDK gọi RPC đọc bằng POST:
  POST đó bị chặn trước mạng, helper thật chuyển sang fallback GET.
  Nhánh RPC thành công chưa được chứng minh.
- Node permission giới hạn đọc/ghi tệp và chặn tiến trình con. Fetch chỉ cho
  origin nguồn mô phỏng, chặn redirect. Đây không phải tường lửa hệ điều hành.

## Chạy trên laptop

Từ PowerShell, trên nhánh `codex/w0-summary-fix-20260923`:

```powershell
& 'C:/Users/HUNG/Documents/ChatGPT/sourse thật/_tmp_business-ai-os-w0-summary-fix-20260923/backend/tests/w0-runtime/run-runtime-smoke.ps1' -DependencyBackend 'C:/Users/HUNG/Documents/ChatGPT/sourse thật/_tmp_business-ai-os-founder-local-v1/backend'
```

DependencyBackend chỉ cung cấp thư viện trong node_modules; mã ứng dụng lấy từ
nhánh sửa. Không cài package, không dùng server hoặc `.env` checkout cung cấp
thư viện. Launcher kiểm SHA-256 bảy module, nhánh và commit tổ tiên trước chạy;
commit tổ tiên chỉ là nguồn gốc, không thay thế hash mã thực tế.

Mỗi lượt tạo thư mục riêng dưới
`%LOCALAPPDATA%/BusinessAIOS/w0-runtime-evidence/`, ghi HEAD, tree, git status,
metadata đầu/cuối, stdout, stderr và JSON đầy đủ. Bản sửa chưa commit được ghi
rõ. Node nhận môi trường mới; launcher giới hạn 90 giây và chỉ dừng tiến trình
con của lượt thử khi hết hạn. Runner chờ server đóng và kiểm tra cổng/socket.

## Quyền và hợp đồng dữ liệu

Bốn đường đọc dùng tenant context đã được middleware xác minh, tách khỏi query
của người gọi. Thiếu/sai context trả 403 `tenant_scope_unverified` trước đọc dữ
liệu. Tenant không có công ty trả dữ liệu rỗng, không thực hiện truy vấn rộng.
Bộ lọc tenant IN đi vào cả công việc, exact count, tìm lead theo người phụ trách,
lead-options, tìm lead dự án và hai nhánh lấy công việc dự án.

Tài khoản bị giới hạn công ty không thể thay bằng `company_id` khác qua query:
trả 403 `company_scope_denied`. Quản trị viên không gắn công ty vẫn có thể chọn
công ty hợp lệ trong phạm vi tenant. Giữ hạn chế assignee/creator của nhân viên.
List chuẩn hóa khoảng trắng tìm kiếm giống summary; các bộ lọc giao cắt nhau.

By-project giữ `progress.completed` và `progress.total`, bổ sung `cancelled`
và `closed`. Completed chỉ tính done/completed; cancelled không tính hoàn thành.
Giữ loại trùng theo unified_id. Lỗi tìm lead dự án được báo lỗi thay vì âm thầm
coi như không có lead; helper này còn dùng trong reminder nên reminder cũng
sẽ dừng khi truy vấn lead thất bại. Không mở thêm quyền ghi/notification.
Việc thiếu tên assignee vẫn giữ fallback cũ.

## Bằng chứng thực thi 23/09/2026

LAPTOP-25460QND, Node 22.20.0:

| Lượt | Mã nguồn | Kết quả | Run ID |
| --- | --- | --- | --- |
| Tái hiện trước sửa | Sản phẩm gốc 48b6735, harness mở rộng | 26/42 PASS, 16 FAIL, exit 1 | 20260923T061455971Z-549e4f64 |
| Sau sửa | Mã sửa khóa bằng hash, cùng harness | 42/42 PASS, exit 0 | 20260923T061654926Z-304f7a44 |
| Hồi quy offline | Bộ 122 ca cũ + 23 ca biên mới | 145/145 PASS, exit 0 | Ghi kèm thư mục lượt sau sửa |

Không có ca bỏ qua/cancel. Lượt RED có 16 ca chưa đạt, không có nghĩa là 16 lỗi
độc lập. Những ví dụ tái hiện: list trả 6 thay vì 5 dòng; lead-options trả 3 thay
vì 2 lead; completed dự án là 3 thay vì 2; tài khoản công ty A có thể lọc công ty B.
Ca nhân viên còn kiểm cả bộ lọc được gửi, không chỉ số lượng kết quả.

23 ca mới trong `backend/tests/work-tasks-read-scope.test.js` kiểm context thiếu/
sai/rỗng, giả mạo query, lỗi tìm lead, lọc hai nhánh, loại trùng và quyền công ty
trên cả bốn tuyến. Đây là route/helper thật với transport, auth và role test
doubles; HTTP harness bổ sung bằng JWT, middleware và SDK thật. 23 ca này nằm
trong tổng 145, không cộng lại. Bảy hash sản phẩm và runner được ghi trong JSON.

Lượt RED đóng cổng 62693/62694; GREEN đóng cổng 62714/62715. Mọi socket sở hữu
đều đóng. Warning Express về Promise-like handler qua VM được giữ trong stderr;
không đổi kết quả ca thử. Không để dịch vụ thử chạy nền.

## Phạm vi chưa chứng minh và bước sau

- Chưa chạy SQL view/RLS/schema/migration hoặc UI trình duyệt thật.
- Summary/list đếm dòng của unified_tasks_v, không khẳng định số việc nghiệp vụ
  duy nhất khi SQL view nhân dòng. By-project vẫn dùng liên kết legacy
  crm_leads.project_id; chưa chứng minh đầy đủ N:N của migration 502.
- Hai helper đếm heartbeat và các đường đọc/ghi khác chưa thuộc đợt này.
- UI consumer đã được đọc để kiểm tra giữ hợp đồng completed/total; đó không
  phải nghiệm thu hiển thị trình duyệt hoặc bản frontend đang vận hành.
- Laptop có node_modules và dist của checkout cũ, nhưng candidate chưa có
  frontend build. Không dùng dist cũ làm bằng chứng cho mã hiện tại.
- Kiểm tra 06:18 UTC: laptop không tìm thấy Docker/PostgreSQL trên PATH; WSL
  báo chưa cài. Chưa có cấu hình DB test được xác minh. Alias openclaw-pc có
  trong SSH config nhưng `ssh -G openclaw-pc` kết thúc 255, không có diagnostic;
  chưa xác minh được kết nối máy bàn từ phiên này.

Bước tiếp theo: xác minh máy thử truy cập được, chuẩn bị PostgreSQL/PostgREST
hoặc Supabase riêng có danh tính test rõ ràng; dựng schema/view từ nguồn đã rà
soát và nạp dữ liệu giả. Sau đó chạy ca quyền với SQL thật và frontend đúng
commit. Không lấy URL/key vận hành để lấp chỗ trống hoặc chạy lại hàng loạt
migration cũ trên dữ liệu đang dùng.

## Hoàn tác

Đợt này sửa hai file sản phẩm, bổ sung một file unit test và cập nhật ba file
harness/tài liệu. Không sửa SQL, hệ thống quyền, dịch vụ vận hành hoặc checkout
gốc. Commit cuối được ghi trong báo cáo bàn giao. Nếu cần hoàn tác, revert
đúng commit trên nhánh thử; giữ bằng chứng. Revert phục hồi lỗi đã tái hiện,
vì vậy không coi bản đã revert là đủ điều kiện triển khai. Chưa push/merge/deploy.
