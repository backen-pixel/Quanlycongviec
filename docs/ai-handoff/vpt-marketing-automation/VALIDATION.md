# Validation — VPT Marketing–Sales candidate

Ngày02/10/2026. PR22 stacked trên PR19 `e16c885ae7c2305645be02a1227bf378cb59137f`. Không phải production acceptance.

## Kết quả đã có

- **163/163 unit/regression PASS** ở candidate đo Lead V2, Node24 cục bộ; reviewer chạy độc lập cùng163 case. Bao gồm25 case đo Lead mới,53 regression PR19 kế thừa (hai assertion estimate sửa đúng nghĩa), historical financial ranking, MCP/insights và domain/command controls. Không skipped.
- **CI bản Lead V2 `9877a751a762d1f1468652b45cdd321dfecc79e9` PASS:** [run36977749416](https://github.com/backen-pixel/Quanlycongviec/actions/runs/36977749416), Node18/22 và PostgreSQL16; [report regression36977749467](https://github.com/backen-pixel/Quanlycongviec/actions/runs/36977749467) PASS. Đã đối chiếu đủ26 file trên GitHub với Git blob hash của candidate, không sai khác. Commit đóng hồ sơ sau mốc này chỉ đổi tài liệu; nếu thay code tiếp phải kiểm lại delta tương ứng và checks head trước merge.
- **Browser synthetic smoke PASS:** biên dịch component React đã sửa với API giả, CSS fixture; mở loopback4182 bằng công cụ trình duyệt được hỗ trợ. Thấy mục tiêu250.000/khách, số115 triệu gắn nhãn estimate, nhãnấm/nóng tách khỏi hợp lệ; bật lỗi CRM rồi tải lại làm mất số liệu cũ, hiện UNKNOWN thay0. Nhật ký không có lỗiJS. CSP `connect-src 'none'`, không đăng nhập/CRM/khách thật. Đây không phải full app build, mobile UAT hoặc test auth thật.
- Review độc lập code/domain/SQL/report/UI PASS trong phạm vi runtime đang tắt; [chi tiết](INDEPENDENT_REVIEW.md). Fullplan, adapters và release vẫn IN PROGRESS/HOLD.

## PostgreSQL cô lập

Workflow tạo PostgreSQL16 mới trên loopback, database `marketing_automation_test`, không dùng credentials thật. Kiểm reapply migration, anon/authenticated bị từ chối, RLS không lộ hàng, sai company/version/action, grant malformed/NULL,12 concurrent duplicate submits, conflict đổi nội dung, thu hồi/hết hạn grant, claim đồng thời, idempotent terminal và phục hồi RUNNING thành UNKNOWN không replay.

Máy cục bộ chưa có PostgreSQL binary. Kiểm xử lý đồng thời của queue không chứng minh atomic budget reservation, calendar slot hoặc takeover barrier — các phần đó chưa được triển khai. Không áp migration648 lên DB thật.

## Giới hạn còn lại

Nguồn toàn bộ spend/qualification/CRM canonical chưa bind, nên không có CPQL thật hoặc bằng chứng đạt250k. Số lượng ID trong fixture không chứng minh khả năng gộp cùng khách giữa Facebook/Google; xem [hợp đồng adapter](LEAD_MEASUREMENT_CONTRACT.md). Nguồn kế toán hoãn theo Founder; không chặn giai đoạn Lead nhưng chưa được báo7% doanh thu.

Runtime command service chưa mount/khởi chạy, chưa nối API nhà cung cấp hoặc model, chưa có grant thật. Chưa hoàn tất sáu kênh, thư viện tài sản, lịch khảo sát/roster, dừng và đổi ngân sách thật, chi phí API, gói phát hành. Không dùng unit tests để suy quyền sản xuất hoặc hiệu quả kinh doanh.

Local Node child test-runner/esbuild từng gặp spawn EPERM. Unit chạy cùng process với node:test; esbuild chạy qua cơ chế escalation được chấp thuận. Không có auto-review rejection trong đợt này, không truy cập tài khoản thật bằng đường thay thế.
