# Ứng viên mở tuyến Facebook nhận khách — tích hợp 05/10/2026

Founder yêu cầu hoàn tất việc tích hợp, kiểm thử và đối chiếu cấu hình. Ưu tiên gói đầu: Facebook Lead Ads → CRM → Admin Vạn Phú Thành → báo cáo chi phí trên khách hợp lệ. Mục tiêu 250.000đ/khách, ngân sách và kiến trúc giữ nguyên; AI gửi tư vấn/đặt lịch và các kênh khác có cổng mở riêng.

## Bản ghép và thay đổi

- Nhánh `codex/agent-guardrails-20261005`, trước ghép `d5fa89d4` (runtime guardrails `add71daf`).
- Main lấy về ngày 05/10: `3375ef712c7a18a75fec8ee79f5e69a347c5f68d`, thêm 11 commit/49 file từ `ca8810c5`. Bản này mới hơn snapshot Render `899db5ed`; phải xác nhận lại bản live tại thời điểm phát hành.
- Giữ thay đổi SX/mobile/lịch giao lắp của main và cả hai SQL649 khác tên. Không sửa SQL đã tồn tại hoặc tự áp dụng SQL.
- Giữ cách lọc lead_id null ở adInsights để không đưa chuỗi null vào truy vấn UUID.
- Giải xung đột thẻ Page: giữ nhãn ấm/nóng, Deal chốt ước tính, Finance UNKNOWN và các panel chi tiêu/kỳ đo/khách hợp lệ.
- Sửa chỉ số mới “chưa thành Lead”: chỉ đếm attribution đã gắn công ty trong quyền hiện hành; không suy từ Page/ad dùng chung. Quyền cá nhân/khu vực hoặc thiếu phạm vi xác định trả UNKNOWN. Đọc exact count để phát hiện PostgREST cắt hàng; lỗi/thiếu count không thành số 0. UI phân biệt chưa xác minh với số 0 thật.
- Số mới là **lượt chạm đã gắn công ty, chưa liên kết Lead**, không là khách duy nhất/hợp lệ; không đưa vào CPQL hoặc tối ưu ngân sách. Nhóm chưa có Lead có thể chưa hiện ở các màn legacy.

## Kiểm chứng

- Ba suite báo cáo: **158/158 PASS** (thêm 30 ca về Page dùng chung, sai công ty/quyền, lỗi/thiếu/cắt nguồn, số 0 thật và không đổi Lead/Finance).
- Toàn bộ các lệnh unit cô lập trong workflow cộng Agent guardrails: **1.566 ca, 1.564 PASS, 0 FAIL, 2 SKIP** trên Windows/Node24. Hai ca native signal cần CI Linux.
- Full Vite build PASS, 41,73 giây trước sửa câu giải thích đơn vị đếm cuối cùng; CI phải dựng bản cuối. Cảnh báo bundle lớn còn như trước.
- Reviewer phiên riêng chạy trực tiếp 158/158 PASS; đã sửa câu giải thích P3 theo đề nghị. Review không chứng nhận auth/JWT thu hồi tức thì, toàn bộ SX/mobile hoặc vận hành thật.
- CI PostgreSQL, restore, Node18/22 và build trên commit xuất bản: **PENDING**, sẽ ghi kết quả đúng phiên bản. Không dùng PASS của commit cũ thay cho bản ghép.

## Cấu hình và bước nghiệm thu còn thực hiện

Workspace Render đã xác nhận; không hỏi lại. Đã mở trang Giám sát Supabase qua CRM, nhưng UI yêu cầu mật khẩu giám sát riêng. Đã mời Founder nhập trực tiếp trên trang, không lấy token/mật khẩu hoặc đi vòng qua khóa để đọc DB.

Sau mở khóa, đối chiếu active Primary/failover và backup theo [phiếu Render](RENDER_READONLY_20261005.md). Chỉ đọc không cấp quyền sửa môi trường. Phải kiểm ledger/schema theo tên tệp đầy đủ, quyền các vai trò, mapping Page/form/company/Admin/vùng và bằng chứng chuyển luồng trước gói phê duyệt áp dụng. Feature gửi AI/tự đặt lịch chưa được mở chỉ vì gói Lead đã đạt.

Nghiệm thu được chia rõ: CI dùng PostgreSQL/dữ liệu giả; kiểm môi trường thật chỉ đọc; chạy một Lead thử có nhãn và đúng tài khoản nhận chỉ sau khi có môi trường/bản triển khai cùng phạm vi ghi thử được duyệt. Không đánh dấu UAT thật khi chưa có biên nhận nguồn → CRM → người nhận → báo cáo.

## Hoàn tác và phát hành

Chưa merge main/deploy, không sửa DB, environment, quyền hoặc quảng cáo. Cả frontend/backend Render auto-deploy main nên merge main nằm trong quyết định phát hành. Gói cuối phải ghim SHA, migration/ledger, cờ bật/tắt, Page/form/người nhận, thời điểm, bằng chứng UAT và cách dừng; không mặc nhiên mở toàn bộ PR22/25.

Nếu chưa khép điều kiện, giữ tuyến ứng viên tắt. Khi cần dừng sau một gói được duyệt, dùng cơ chế dừng admission/dispatch và giữ durable receive/receipt theo [RELEASE_READINESS](RELEASE_READINESS.md); không xóa dữ liệu hoặc bỏ guard/đưa writer cũ trở lại. Trạng thái hiện tại: **HOLD vận hành; đang hoàn tất kiểm chứng ứng viên**.
