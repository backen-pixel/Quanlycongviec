# Hướng dẫn mở phiên UAT — Business OS baseline 02

## Một lệnh quyết định

```bash
cd backend
npm run uat:readiness:business-os
```

Lệnh chạy tuần tự:

1. audit 17 capability và backup mới hơn schema freeze;
2. xác nhận tag baseline 02 trỏ đúng commit đang chạy;
3. chạy preflight aggregate, read-only và không PII cho công ty pilot;
4. sinh evidence cục bộ trong `backend/.uat-evidence/`;
5. phân công 6 kịch bản trong checklist 02.

## Nếu BLOCKED

- Không đổi mốc freeze, không giả lập backup và không chạy lại migration đã áp dụng.
- Không tạo hồ sơ khách chỉ để làm đẹp coverage.
- Không tạo tag baseline 02 khi full CRM parity còn chưa chạy liền mạch.
- Có thể tiếp tục unit/build/read-only smoke nhưng không mở UAT ghi dữ liệu thật.

## Nếu READY_TO_ASSIGN

1. Ghi commit, backup id/thời gian và `session_id` vào checklist.
2. Lưu evidence vào kho nội bộ được kiểm soát, không commit vào Git.
3. Nhân viên phụ trách xác nhận hồ sơ hiện hữu hoặc tạo hồ sơ UAT có tiền tố được thống nhất.
4. Chạy tuần tự 6 kịch bản; gặp blocker cao/nghiêm trọng thì dừng.
5. Blueprint công ty thứ hai phải preview trước, apply đúng tenant và kiểm tra không có dữ liệu giao dịch bị sao chép.
6. Mỗi bước lưu `PASS/FAIL/BLOCKED`, evidence, owner và deadline sửa.

Biên bản readiness chỉ cho phép bắt đầu; không thay thế chữ ký nghiệm thu nghiệp vụ trong [`BUSINESS_OS_UAT_CHECKLIST_02.md`](./BUSINESS_OS_UAT_CHECKLIST_02.md).
