# Hướng dẫn mở phiên UAT — Business OS baseline 01

## Một lệnh quyết định

Tại máy chạy backend staging:

```bash
cd backend
npm run uat:readiness:business-os
```

Lệnh thực hiện tuần tự:

1. kiểm tra 15 migration và backup mới hơn schema freeze;
2. nếu gate `BLOCKED`, dừng ngay và không chạy UAT thật;
3. nếu gate `READY`, chạy preflight coverage không PII cho công ty pilot;
4. sinh biên bản JSON/Markdown cục bộ trong `backend/.uat-evidence/`;
5. nhân viên phân công 5 slot trong checklist, không để Codex tự chọn khách hàng.

## Khi kết quả là BLOCKED

- Backup vật lý của Supabase chạy theo lịch tự động; Management API của luồng này chỉ dùng để đọc và xác minh recovery point, không gọi restore hoặc giả lập một backup mới.
- Tài liệu tham chiếu: <https://supabase.com/docs/guides/platform/backups>.
- Không tạo Lead/Deal/Project chỉ để vượt gate.
- Không chạy lại migration đã áp dụng.
- Không bỏ qua backup bằng cách đổi mốc schema freeze.
- Không sinh biên bản UAT khi gate còn `BLOCKED`.
- Chờ backup `COMPLETED` đủ mới hoặc chuẩn bị logical dump đã mã hóa và thử restore theo runbook.
- Có thể tiếp tục kiểm thử unit/build/read-only nhưng không thay đổi hồ sơ khách thật.

## Khi kết quả là READY

1. Ghi commit đang chạy, backup id và thời gian vào checklist.
2. Lưu hai file evidence JSON/Markdown vào nơi lưu trữ nội bộ được kiểm soát; thư mục cục bộ đã bị loại khỏi Git.
3. Đối chiếu snapshot preflight để biết slot nào đã có coverage và slot nào cần hồ sơ mới.
4. Nhân viên chịu trách nhiệm xác nhận từng Lead/Project được phép dùng.
5. Chạy lần lượt từng hồ sơ; không chạy đồng thời cả 5 hồ sơ trong lần UAT đầu.
6. Mỗi bước phải lưu trạng thái `PASS`, `FAIL` hoặc `BLOCKED` cùng bằng chứng.
7. Gặp blocker mức cao/nghiêm trọng thì dừng hồ sơ, không cố chuyển bước bằng sửa trực tiếp database.

## Trật tự 5 hồ sơ

| Thứ tự | Kịch bản | Mục tiêu chính |
|---|---|---|
| 1 | Khách chưa có thiết kế | Lead → Qualification → Deal → Khảo sát → Thiết kế |
| 2 | Khách đã có thiết kế | Deal → Kiểm tra thiết kế → Báo giá |
| 3 | Sản xuất/lắp đặt nội bộ | Project 8 chặng và tách trạng thái tài chính |
| 4 | Lắp đặt liên công ty | Tenant scope → bàn giao → After-sales |
| 5 | Phát sinh Project | Approval, audit, blocker và ảnh hưởng chi phí/tiến độ |

## Kết thúc phiên

- Tổng hợp kết quả tại [`BUSINESS_OS_UAT_CHECKLIST_01.md`](./BUSINESS_OS_UAT_CHECKLIST_01.md).
- Không mở lát cắt Mua hàng → Chi phí → Công nợ nếu còn blocker cao/nghiêm trọng.
- Không deploy production hoặc nhân Blueprint sang công ty thứ hai ở giai đoạn này.
