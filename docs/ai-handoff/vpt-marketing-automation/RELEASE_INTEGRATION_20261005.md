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
- Full Vite build cục bộ PASS, 41,73 giây trước sửa câu giải thích đơn vị đếm cuối cùng; CI đã dựng lại bản cuối và PASS. Cảnh báo bundle lớn còn như trước.
- Reviewer phiên riêng chạy trực tiếp 158/158 PASS; đã sửa câu giải thích P3 theo đề nghị. Review không chứng nhận auth/JWT thu hồi tức thì, toàn bộ SX/mobile hoặc vận hành thật.
- Đã xuất bản ứng viên `fd3babeb0a1ba25a9ec7b98f3e5918b3ef216798` lên [PR25](https://github.com/backen-pixel/Quanlycongviec/pull/25). CI kiểm merge commit `7774edd9b8a3c27d7b1d9dba465eeb2b1042b444`; đã lấy về và xác nhận cùng tree `4c8d1caba38d8e9c6a2710d4f65f41e09bc99f76` với ứng viên.
- [Manifest ứng viên tích hợp](RELEASE_INTEGRATION_MANIFEST_20261005.json) ghim source/tree/CI, bản live và 50 SQL thêm so với main3375ef71. Đây là kiểm kê, không phải thứ tự áp dụng hoặc chứng nhận ledger của DB thật; manifest cũ giữ giá trị lịch sử.
- [Marketing CI 37276593013](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37276593013): **10/10 job SUCCESS**, gồm build bản cuối, Node18/22 mỗi bản **1.521 PASS / 0 FAIL / 0 SKIP**, các nhóm PostgreSQL về quyền, concurrency, identity, quality, spend, census và trial.
- Đã đọc log intake PostgreSQL: **507 PASS / 0 FAIL / 0 SKIP**; backup/restore sang cluster cô lập khác: **11 PASS / 0 FAIL / 0 SKIP**. Đây là fixture, không phải bản sao/khôi phục DB thật.
- [Report CI 37276592963](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37276592963) và [Agent guardrails CI 37276592953](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37276592953): **SUCCESS**. Reviewer độc lập xác nhận lại P3 UI, blob backend/test và published head: **PASS trong phạm vi tích hợp báo cáo/guardrails đã rà**.

## Cấu hình và bước nghiệm thu còn thực hiện

Workspace Render đã xác nhận; không hỏi lại. Trang Giám sát Supabase qua CRM đã mở khóa lúc khoảng 14:23. Đã đọc active Primary, failover Bật, queue 1.011 và lỗi replication/schema cache ở Backup. [Bằng chứng DB và phương án xử lý](DB_READONLY_20261005.md). Supabase Dashboard cần phiên đăng nhập riêng để đọc catalog/ledger/quyền; đã mời Founder đăng nhập trực tiếp. Không lấy token/mật khẩu hoặc đi vòng qua khóa.

Lúc khoảng 14:14–14:19 giờ Việt Nam, đọc được Page `409741855550833` Bếp Vạn Phú Thành: active, auto-create Lead bật, company VPT, vùng HCM, loại Bếp, pipeline stage TIẾP NHẬN và owner Admin Vạn Phú Thành. Chờ các lựa chọn tải xong rồi đọc giá trị đã chọn; không lấy trạng thái placeholder lúc đang tải làm cấu hình thật. Đã đóng biểu mẫu bằng Hủy, không lưu. Chi tiết ID trong [phiếu CRM](CRM_READONLY_VERIFICATION_20261005.md).

Đây là **mapping Page legacy**; không chứng nhận binding Page/form/account có phiên bản của intake mới hoặc quyền hiệu lực của owner. Tab Lead Ads hiển thị chưa có dữ liệu, không là bằng chứng không có khách ở Meta hay pipeline mới. Cảnh báo “token quá 30 ngày” được suy từ ngày cập nhật cài đặt, chưa là phép kiểm token hợp lệ/hết hạn.

Đọc lại Render: backend hiện live `3375ef71`, deploy `dep-db1kavrtqb8s739ed59g`, hoàn tất 13:37:49 ngày 05/10; frontend vẫn `ad88a162`. Không có thay đổi frontend giữa hai SHA. Bản ứng viên đã chứa main này; PR25 vẫn chưa live.

Monitor đã khép active target và failover hiện hành nhưng chưa khép ledger/schema/RLS. Lịch sử lần clone gần nhất ghi lỗi thiếu bộ nhớ khóa khi chuẩn bị Backup. Cần đọc catalog và sửa kế hoạch clone/kiểm restore phù hợp trước gói áp dụng; không tự chạy lại clone vì script có DROP CASCADE và grant rộng. Chỉ đọc không cấp quyền sửa môi trường. Phải kiểm ledger theo tên tệp đầy đủ, quyền các vai trò, binding form và bằng chứng chuyển luồng. Feature gửi AI/tự đặt lịch chưa được mở chỉ vì gói Lead đã đạt.

Nghiệm thu được chia rõ: CI dùng PostgreSQL/dữ liệu giả; kiểm môi trường thật chỉ đọc; chạy một Lead thử có nhãn và đúng tài khoản nhận chỉ sau khi có môi trường/bản triển khai cùng phạm vi ghi thử được duyệt. Không đánh dấu UAT thật khi chưa có biên nhận nguồn → CRM → người nhận → báo cáo.

## Hoàn tác và phát hành

Chưa merge main/deploy, không sửa DB, environment, quyền hoặc quảng cáo. Cả frontend/backend Render auto-deploy main nên merge main nằm trong quyết định phát hành. Gói cuối phải ghim SHA, migration/ledger, cờ bật/tắt, Page/form/người nhận, thời điểm, bằng chứng UAT và cách dừng; không mặc nhiên mở toàn bộ PR22/25.

Nếu chưa khép điều kiện, giữ tuyến ứng viên tắt. Khi cần dừng sau một gói được duyệt, dùng cơ chế dừng admission/dispatch và giữ durable receive/receipt theo [RELEASE_READINESS](RELEASE_READINESS.md); không xóa dữ liệu hoặc bỏ guard/đưa writer cũ trở lại. Trạng thái hiện tại: **HOLD vận hành; đang hoàn tất kiểm chứng ứng viên**.

## Phiếu mở tuyến đầu — điều kiện còn thiếu cụ thể

Rủi ro HIGH. Ưu tiên nghiệp vụ Lead trước không làm biến mất tác động của toàn bộ mã trong PR22/25, 50 SQL mới hoặc các chức năng legacy bị khóa. Không chọn một vài SQL để chạy theo số thứ tự, không coi gói này chỉ có ba file báo cáo.

| Điều kiện | Bằng chứng hiện tại / việc phải khép | Phụ trách |
|---|---|---|
| Phiên bản và kiểm thử | PASS ứng viên fd3babeb cùng tree CI; main 3375ef71 đã ghép; scoped independent review PASS | Codex + reviewer |
| Page → VPT → Admin | Đã đọc mapping legacy HCM. Còn quyền active/tenant/region hiện hành và binding form mới | Codex kiểm chỉ đọc; Admin VPT nghiệm thu nhận |
| Meta/App/form/account | ID dự kiến theo inventory cũ: account 835757498658305, form 1438656288329447. Còn form ownership, field map và quyền thật. Khi bật intake, shared webhook đòi chữ ký App cho mọi Page cùng endpoint; cần kiểm các Page chung App | Codex chuẩn bị, chủ tài khoản xử lý nếu có yêu cầu đăng nhập/quyền |
| DB và chuyển luồng | Monitor đã mở: active Primary, failover Bật, lỗi replication và clone Backup. Còn đăng nhập Supabase đọc catalog/ledger/quyền; lập sửa/restore phù hợp PostgreSQL17, xác minh mọi writer | Codex đối chiếu; Founder duyệt thay đổi DB/cấu hình cụ thể sau khi có phương án |
| Thu nhận và cách dừng | Enrollment Page mới phải độc quyền, legacy phải drain mọi instance. Pause worker giữ enrollment/receipt; không gỡ allowlist để rollback vì có thể mở lại legacy | Codex diễn tập trên môi trường được duyệt |
| Đo 250.000đ/khách | Chứng nhận đủ nguồn chi/kỳ đo, paid-source, chống trùng và qualification. Một form gửi thành công chưa là khách hợp lệ | Codex + Admin VPT đối soát |
| UAT và phát hành | Chưa có biên nhận thực nguồn → CRM → Admin → báo cáo của ứng viên. Sau DB preflight mới trình gói áp dụng/UAT và ngày mở; merge main tự deploy | Founder quyết định phạm vi, thời điểm phát hành |

AI/model/hạn mức gửi, 18 câu runtime, người khảo sát/lịch đầy đủ thuộc gói sau; không dùng thiếu các đầu vào đó để trì hoãn riêng việc kiểm tuyến Lead. Không mở thêm kênh, tăng ngân sách hoặc tự gửi khách trong phiếu này.
