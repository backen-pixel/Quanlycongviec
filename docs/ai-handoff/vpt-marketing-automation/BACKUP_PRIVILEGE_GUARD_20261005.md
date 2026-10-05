# Chặn tự mở quyền Backup — ứng viên 05/10/2026

Sau [đối chiếu DB thật](DB_CATALOG_20261005.md), sửa bước đầu để ACL thu hồi sau này không bị cơ chế backup cấp rộng trở lại. Nền là commit b0955e23, kế thừa ứng viên fd3babeb đã kiểm. **Rủi ro HIGH, chưa triển khai hoặc sửa quyền DB thật.** Đây chưa là gói khôi phục hay chứng nhận Backup đồng bộ.

## Thay đổi và tác động

- backupSchemaGrants không còn chứa SQL cấp quyền hoặc kết nối DB. Entry point cũ luôn trả BACKUP_GRANT_MIGRATION_REQUIRED, kể cả force. CLI fix grants dừng lỗi trước đọc .env; quyền phải thay bằng migration cụ thể được review/duyệt.
- Replication gửi bằng quyền hiện có, không grant rồi retry. Ba caller giữ nội dung lỗi HTTP; hai caller Contact/row trước đây đọc lại body đã bị tiêu thụ được sửa để vẫn xử lý FK409 và giữ lý do từ chối. Response thành công giữ JSON.
- Job lỗi401/403/42501, gồm lỗi quyền Storage, không bị bỏ sau12 lần. Giữ ID/payload/enqueued_at; dừng batch khi gặp lỗi quyền, tránh thử cùng job liên tục trong một batch. Không tăng applied khi lỗi.
- Backup sync bỏ cấp quyền trước incremental. Khi yêu cầu full clone, sync trả lỗi, ghi trạng thái thất bại và chưa chạy Storage. Manual switch không fallback clone hoặc báo đã đủ điều kiện chỉ từ cờ SUPABASE_BACKUP_ALLOW_FULL_CLONE=1.
- CLI clone cũ đã thay bằng thông báo lỗi trước mọi IO. Không còn đường CLI này đọc secret, đổi mật khẩu, DROP public, restore thiếu schema riêng hoặc cấp lại quyền rộng. **Chức năng clone toàn bộ kiểu cũ bị khóa**, kể cả operator gọi trực tiếp; cần gói restore thay thế đã kiểm trước khi mở lại.
- Không sửa migration đã chạy. SQL cấp quyền rộng cũ được chuyển nguyên nội dung sang fixture chỉ dùng kiểm thử âm; không cài vào runtime. Test calendar guard tiếp tục kiểm schema riêng trước quyền legacy rộng.

## Kiểm chứng

18/18 kiểm thử hành vi cô lập PASS trên Windows/Node24: helper/CLI không nạp cấu hình/DB; force không vượt khóa; lỗi HTTP và FK; queue Redis giả lập/bộ nhớ qua retry12/13; Storage403; đồng bộ bình thường và thất bại; hai đường manual-switch không clone. Tám file JavaScript qua kiểm cú pháp. Không gọi nhà cung cấp hoặc DB thật.

Thêm CI Node18/22 riêng cho guard. Job intake và restore của workflow Marketing chuyển từ PostgreSQL16 sang17, dùng hai cluster dữ liệu giả. Kết quả CI và review đúng phiên bản đang chờ, chưa kế thừa PASS fd3babeb cho delta mới. Test isolated không thay restore bản sao Primary hoặc UAT vận hành.

## Giới hạn và khôi phục

Chưa thu quyền anon/authenticated trên DB thật, chưa sửa cột/RPC/trigger Backup, queue tồn đọng hoặc form/account binding. Mất Redis/chạy bằng bộ nhớ, crash giữa pop và requeue, lỗi khác quá giới hạn retry và failover nói chung vẫn thuộc gói khắc phục tiếp; giữ job lỗi quyền không là chứng nhận durability toàn hàng đợi. Job quyền có thể giữ queue chưa hết, vì vậy không chuyển DB dựa trên nhãn kết nối healthy.

Khi chuẩn bị phát hành phải đưa tác động khóa clone/grants vào hướng dẫn operator. Nếu bản mới lỗi, dừng đường sync/replication liên quan và giữ queue/bằng chứng để sửa tiến tới; không rollback về helper grant rộng, tự chạy clone cũ hoặc bật lại quyền chỉ để tiếp tục. Không áp dụng patch vào production chỉ từ PASS unit/CI. Kế hoạch migration quyền/cấu trúc và restore vẫn cần gói riêng có tác động, kiểm thử, cách dừng và quyết định Founder.
