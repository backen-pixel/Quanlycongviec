# Review nền bảo vệ lịch khảo sát — 03/10/2026

**PASS cho phạm vi SQL664; phát hành/UAT vẫn HOLD.** Reviewer độc lập: phiên `/root/architecture_v11_review`, tách với người triển khai, đọc mã, các writer cũ và log CI. Không còn finding chặn trong phạm vi này. Lỗi delimiter SQL phát hiện trước publish đã sửa và được PostgreSQL kiểm chứng.

## Phiên bản được kiểm tra

- Runtime: `7576ecf7b8a236f5ad89e5bda97d93589617d6f7`.
- Thêm regression race: `d242e114e18522a9a5ffa1a7d76c453b3a1f5dd3`; chỉ thay test, giữ nguyên runtime.
- SQL664 blob: `56ba834a93a9ecde581e1d9df2274ad330784c38`.
- Tests blob: `3ade2e61bc4d74a1bcbcc51ad22979546663cbd5`.
- Checkout CI merge: `3d11357cb02474024edfeb643a3bcd88a6f0fdf4`, chứa bản d242e114 và base PR19 `e16c885ae7c2305645be02a1227bf378cb59137f`.

## Bằng chứng thực thi

| Kiểm tra | Kết quả | Nguồn |
|---|---|---|
| PostgreSQL16 cô lập | 111 PASS / 0 FAIL / 0 SKIP, gồm 11 case guard mới | [Job111097316628](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37086333854/job/111097316628) |
| Domain/regression Node22 | 567 PASS / 0 FAIL / 0 SKIP | [Job111097316634](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37086333854/job/111097316634) |
| Frontend đầy đủ | 10.307 modules, build thành công 36,11 giây | [Job111097316707](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37086333854/job/111097316707) |
| Automation | Cả 10 job SUCCESS, gồm Node18 và các bộ PostgreSQL liên quan | [Run37086333854](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37086333854) |
| Messenger/report regression | SUCCESS | [Messenger](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37086333748), [Report](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37086333787) |

Root và reviewer cùng đọc log thực tế, không chỉ trạng thái job. Local kiểm cú pháp JS và diff whitespace; không chạy PostgreSQL thật cục bộ. Không thay UI, không có tuyên bố nghiệm thu browser mới.

Đã thử quyền sau GRANTS_SQL backup trong mã hiện có; OLD/NEW creator/assignee/participant kể cả công ty khác; split DELETE/INSERT bị chặn trước khi làm mất occupancy; rollback toàn statement; hai chiều chờ enrollment; UPDATE chờ rồi đọc participant vừa commit; snapshot cũ REPEATABLE READ; GUC giả/permit sai transaction hoặc event; cascade và replica mode; readiness khi trigger hoặc quyền không đúng.

## Những việc chưa đạt

Guard là bước chuẩn bị để chuyển quyền ghi, không phải booking. Chưa có RPC đặt lịch, bằng chứng khách xác nhận đề xuất, ghi event/participants/audit/handoff nguyên giao dịch hoặc UI khảo sát. Enrollment rỗng; không đăng ký nhân sự hoặc đổi DB thật.

Các đường cũ có thể bỏ qua lỗi participant và báo thành công sau thay đổi dở dang; phải chuyển/chặn chúng trước enrollment. Cần đo tác động tuần tự hóa toàn lịch và yêu cầu READ COMMITTED. Backup hiện cấp quyền rộng trong public, có thể tắt USER triggers và bỏ qua RPC; schema riêng giải quyết phần quyền của guard nhưng chưa chứng minh sao lưu/khôi phục hoặc failover của booking. Xem [contract và cổng phát hành](SURVEY_CALENDAR_GUARD.md).

Không merge, deploy, gửi tin, gọi model, đặt lịch thật hoặc mở ngân sách. Toàn bộ mục tiêu Marketing–CRM vẫn ACTIVE.
