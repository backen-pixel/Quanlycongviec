# Đối chiếu CRM chỉ đọc — 05/10/2026

Quan sát lúc khoảng 12:30–12:40, Asia/Ho_Chi_Minh. **PARTIAL — HOLD phát hành.**

Cập nhật sau lượt quan sát này: Founder đã xác nhận Render workspace; [phiếu Render](RENDER_READONLY_20261005.md) ghi backend live `899db5ed`/frontend `ad88a162`, chênh main và điều kiện Primary-only. Các ghi chép “chưa biết commit/chờ workspace” trong phiếu CRM dưới đây là trạng thái tại lúc quan sát, đã được khép một phần bởi phiếu Render; không cần hỏi lại workspace.

Founder đã cho phép đọc tài khoản Admin VPT, công ty/khu vực, người khảo sát và lịch bận/trống. Phiên Chrome đã đăng nhập truy cập được CRM; vì vậy “cần đăng nhập CRM” trong các ghi chép trước không còn là vướng mắc hiện tại. Không nhập thông tin đăng nhập, lấy token, sửa nhân sự/khách/cấu hình, đặt lịch hoặc gửi tin.

Ứng viên sửa kiểm soát Agent vẫn là [PR25](https://github.com/backen-pixel/Quanlycongviec/pull/25), source runtime `add71daf`, bản đóng hồ sơ `a270f7bec238486b6b83f5a48d51aaff7352ff79`, xếp sau PR22. Chưa đối chiếu commit đang chạy. Quan sát dưới đây thuộc giao diện đang vận hành, **không phải UAT của ứng viên PR25**.

## Những gì đã quan sát được

Nguồn: trình duyệt được hỗ trợ, phiên có sẵn trên `tubep-frontend-s30w.onrender.com`; chỉ đọc DOM hiển thị và giá trị các lựa chọn trong biểu mẫu.

| Hạng mục | Bằng chứng quan sát | Giới hạn |
|---|---|---|
| Tài khoản nhận khách | Trang `/users`, lọc Công ty TNHH Bếp Vạn Phú Thành, có hồ sơ “Admin Vạn Phú Thành”. Mở hồ sơ hiển thị Khối Kinh Doanh → Công ty TNHH Bếp Vạn Phú Thành → Phòng kinh doanh; Module & vai trò: crm / Admin. | Chứng minh định danh hiển thị và cơ cấu trên UI; chưa chứng minh active/tenant binding, quyền hiệu lực hoặc routing hiện hành. Không dùng vai trò của phiên quản trị đang xem để thay bằng chứng quyền của người nhận. |
| Company | Giá trị lựa chọn VPT: `991dc79d-cbf5-49f9-a364-35227cb47635`. | ID quan sát từ bộ lọc UI, chưa được kiểm trực tiếp với DB/routing. |
| Người nhận | Bộ lọc “Người tạo / phụ trách” tại `/crm/events` có Admin Vạn Phú Thành, giá trị `49fcd3ff-0d7c-4d54-8f5a-1068bd10d68c`. | Dùng làm ứng viên đối chiếu; chưa cấu hình vào tuyến tự động. |
| Khu vực | UI VPT có TP.Hồ Chí Minh (HCM), Cần Thơ (CT) và T.P Hồ Chí Minh Q2 (Q2). | Sự có mặt trong bộ lọc không chứng minh Admin được gán từng vùng hoặc Q2 được gộp vào nhóm ngân sách HCM. |
| Nguồn lịch | Trang Sự kiện `/crm/events` mở được, VPT đang chọn, khoảng 2026-10-01 → 2026-10-31. Có loại Khảo sát, Đo đạc, Gặp khách hàng và bộ lọc người/khu vực. | Xác nhận UI nguồn CRM có sẵn, chưa xác nhận đầy đủ mọi lịch bận. |
| Độ đủ lịch | Tiêu đề và Feed hiển thị 500 sự kiện; lưới tháng đồng thời thông báo chưa có sự kiện gắn dự án trong tháng này. | Không suy ra 500 là tổng thật, không suy ra lưới trống nghĩa là nhân viên rảnh. Chưa đối soát từng sự kiện, giới hạn nguồn hoặc đầy đủ lịch ngoài CRM. |

Mã khu vực quan sát từ UI: HCM `f68e643d-7999-442c-83ee-edb7f5237ab1`; CT `098538c0-8429-490b-bc10-df3349fb6045`; Q2 `7d7a001a-bf2e-4915-8128-b2166901ec4f`. Không thay quyết định phân bổ 80/20 bằng ba vùng UI. Chưa gán người khảo sát hoặc người thay thế từ tên tài khoản.

Không lưu tên khách, số điện thoại, nội dung sự kiện, toàn bộ ảnh màn hình hoặc dữ liệu phiên vào hồ sơ này.

## Các điều kiện còn mở

1. Đối chiếu server/DB: user/company/tenant đang hoạt động, membership và quyền nhận khách theo từng vùng; kiểm routing đúng Page/form. UI không thay kiểm quyền hoặc RLS.
2. Chỉ định người thực hiện khảo sát và người thay thế tại HCM/CT; xác nhận giờ làm, khoảng trống, thời gian di chuyển, hạn hiệu lực và người xử lý ngoại lệ. Admin nhận khách không mặc nhiên là người đi khảo sát.
3. Kiểm độ đủ lịch bận bằng dịch vụ lịch đã thiết kế trong [SURVEY_AVAILABILITY](SURVEY_AVAILABILITY.md), gồm quan hệ người tạo/phụ trách/tham gia và các nghĩa vụ ngoài CRM. Không tạo chứng nhận `CRM_COMPLETE`/`ALL_BUSY_IN_CRM` chỉ từ việc mở được lịch.
4. Render connector chưa có workspace được chọn. Danh sách đọc được trả một workspace “My Workspace”; câu hỏi xác nhận workspace đã gửi Founder theo yêu cầu của công cụ. Chưa đọc service, deploy, replica/worker/cron hoặc cấu hình; chưa biết commit production, Primary/RLS/migration ledger/backup thật.
5. Giữ các điều kiện thư viện nội dung, quyền/model/hạn mức AI, nguồn quảng cáo, chuyển luồng và UAT trong [RELEASE_READINESS](RELEASE_READINESS.md). Bộ 18 câu đã duyệt không cần duyệt lại câu chữ.

## Tiếp theo và phạm vi phát hành

Tiếp tục kiểm môi trường sau xác nhận workspace, rồi khép mapping và lịch cùng đầu mối vận hành. Lập gói UAT đúng ứng viên/cấu hình; reviewer độc lập rà, sau đó mới trình Founder quyết định mở thử. Không coi việc tìm được tài khoản là PASS toàn tuyến hoặc kết quả đạt 250.000đ/khách.

Phiên này chỉ kiểm tra đọc và cập nhật tài liệu. Không có thay đổi runtime/SQL/quyền hoặc ngoại tác cần hoàn tác; tài liệu có thể sửa/revert trong Git và vẫn giữ lịch sử quan sát. Không chạy lại test runtime cho delta tài liệu.
