# Kiểm chứng gói khảo sát MCRM-D0 v1
Ngày: 02/10/2026. Phạm vi: tài liệu, tham chiếu mã và dữ liệu minh họa; không phải kiểm thử ứng dụng.

## Kết quả kiểm tra
- **PASS — tính nhất quán hồ sơ và fixture.** Đối chiếu 33 file nguồn với Git blob tại main `0db11ce1adb0fb89fc87529036e495a62d58fce7`; mọi file khớp. Kiểm liên kết nội bộ, đường dẫn và dòng trích dẫn trong bản đồ nguồn.
- Tính lại từ fixture: 7 lần nhận, 6 sự kiện khác nhau, 5 sự kiện có liên kết, 1 chưa liên kết, 4 Lead khác nhau; 3 Lead cần xác minh. Các cờ chồng nhau không cộng thành số Lead mới.
- Kiểm bằng chứng chăm sóc gắn đúng Lead, nguồn, cửa sổ thời gian; dữ liệu chi tiêu/CPL/SLA thiếu vẫn null/UNKNOWN.
- Kiểm 26 case có ID khác nhau và đều NOT_RUN; manifest giữ live HOLD, API access chưa xác minh và ngân sách API chưa đặt.
- Lịch sử CURRENT/WORKLOG được giữ nguyên ở phần sau mục mới; chỉ cập nhật trong `docs/ai-handoff/`.
- **Review độc lập: PASS** — reviewer `/root/architecture_v11_review`, phiên riêng với bên soạn gói, ngày 02/10/2026. Không có finding chặn trong phạm vi hồ sơ.
- 26 kịch bản runtime: NOT_RUN. Chưa gọi OpenAI API, chạy server, DB hoặc kết nối Meta/CRM.
- Nghiệm thu dữ liệu thật và phát hành: HOLD.

## Chạy lại phép đối soát mẫu
Từ thư mục gốc repo:

```text
node docs/ai-handoff/marketing-crm-assistant/verify-fixture.cjs
```

Script dùng Node built-in, không cài thư viện, không kết nối mạng, không ghi nghiệp vụ. Kết quả chỉ xác minh tính nhất quán dữ liệu minh họa và trạng thái ma trận. File [source-manifest.json](source-manifest.json) chứa commit/path/blob cho việc kiểm lại nguồn.

Mẫu JSON có policy FIXTURE_ONLY, mã DEMO và nguồn chi tiêu giả lập lỗi. Mọi số liệu chỉ phục vụ đối chiếu mẫu báo cáo. Không dùng kết quả kiểm tài liệu để chứng nhận công cụ đọc an toàn hoặc Agent đạt chất lượng.

## Bằng chứng theo phiên bản
Bản kiểm hồ sơ được gắn với nội dung candidate và Git commit khi công bố. [verification-results.json](verification-results.json) lưu kết quả và SHA-256 các tài liệu/fixture/script được kiểm; không tự băm chính file kết quả hoặc VALIDATION để tránh vòng tham chiếu.

## Phạm vi review độc lập
Reviewer đọc đủ 12 tệp của gói, đối chiếu S01–S12 với đoạn nguồn được dẫn và chạy độc lập `verify-fixture.cjs`: PASS. Hash 9 tệp nội dung được đo độc lập khớp hồ sơ; hash script: `6e69bb2e1f91352e02c0ebd15835f5773020eb099b8820e828093c2cce415900`.

Reviewer xác nhận tách intake/Lead/owner/ack/care, không coi AI đọc là người tiếp nhận, không dùng attribution thay sổ intake và giữ rõ giới hạn chỉ đọc. Nhận xét về metadata số tệp/liên kết của lượt kiểm ban đầu đã được xử lý bằng lượt kiểm toàn gói cuối trước công bố.

Giới hạn: không audit mọi dòng của 33 file nguồn, không kiểm runtime/DB/Meta hoặc quyền OpenAI API thật; không tái kiểm độc lập tài liệu Agents API bên ngoài. PASS chỉ áp dụng gói khảo sát, không chứng nhận Agent hoặc production. Không có thay đổi nội dung thiết kế sau verdict; các thay đổi cuối chỉ ghi kết luận và metadata bằng chứng.
