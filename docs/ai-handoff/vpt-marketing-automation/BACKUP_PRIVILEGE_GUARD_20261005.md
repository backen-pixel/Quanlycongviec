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

20/20 kiểm thử hành vi cô lập PASS trên Windows/Node24: helper/CLI không nạp cấu hình/DB; force không vượt khóa; lỗi HTTP và FK; queue Redis giả lập/bộ nhớ qua retry12/13; Storage403; đồng bộ bình thường và thất bại; hai đường manual-switch không clone. Tám file JavaScript qua kiểm cú pháp. Không gọi nhà cung cấp hoặc DB thật.

Ứng viên cuối `f437db543fb65e6e46444b5a8dbe608a4df727db`, tree `31983f8cfa97703054d6684c1d4d90b04e35e66f`. CI merge `28d6327b4c77ab9b2aa74399c4fbfce0d460c335` đã lấy về và khớp cùng tree. Runtime guard tại36a6f06d; hai commit sau chỉ sửa cấu hình/điều kiện bộ diễn tập.

- [Backup guard37290310025](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37290310025): Node18/22 mỗi bản20 PASS,0 FAIL,0 SKIP.
- [Marketing37290310047](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37290310047):10/10 job SUCCESS, full frontend build; Node18/22 mỗi bản1.521 PASS. Đã đọc log job111698909613: PostgreSQL17 intake507 PASS và restore11 PASS,0 FAIL,0 SKIP.
- Restore chạy hai cluster PostgreSQL17 khác nhau, dữ liệu giả124 bảng; archive SHA256 `5909a8681d14b02758bca3d120b4b65c0f53281a1f1eef9c5cd363144956fbf9`. **Không phải bản sao Primary thật hoặc Storage thật.**
- [Report37290310275](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37290310275) và [Agent guardrails37290310085](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37290310085): SUCCESS.

Reviewer độc lập chạy20/20 PASS và khép finding về job bị từ chối quyền chặn hàng bộ nhớ: defer xuống cuối hàng, có test mixed queue Redis/bộ nhớ. Reviewer xác nhận các blob bản xuất bản và PASS hai file sửa bộ diễn tập tạif437db54. Lần CI36a6f06d từng FAIL restore do test ghim16; đã chuyển expected major thành cấu hình ghim17 và dừng trước restore nếu prerequisite lỗi, không bỏ kiểm cluster/target rỗng/role/quyền. CI cuối trênhead mới ở trên đã PASS. Test isolated không thay restore bản sao Primary hoặc UAT vận hành.

## Giới hạn và khôi phục

Chưa thu quyền anon/authenticated trên DB thật, chưa sửa cột/RPC/trigger Backup, queue tồn đọng hoặc form/account binding. Mất Redis/chạy bằng bộ nhớ, crash giữa pop và requeue, lỗi khác quá giới hạn retry và failover nói chung vẫn thuộc gói khắc phục tiếp; giữ job lỗi quyền không là chứng nhận durability toàn hàng đợi. Job quyền có thể giữ queue chưa hết, vì vậy không chuyển DB dựa trên nhãn kết nối healthy.

Khi chuẩn bị phát hành phải đưa tác động khóa clone/grants vào hướng dẫn operator. Nếu bản mới lỗi, dừng đường sync/replication liên quan và giữ queue/bằng chứng để sửa tiến tới; không rollback về helper grant rộng, tự chạy clone cũ hoặc bật lại quyền chỉ để tiếp tục. Không áp dụng patch vào production chỉ từ PASS unit/CI. Kế hoạch migration quyền/cấu trúc và restore vẫn cần gói riêng có tác động, kiểm thử, cách dừng và quyết định Founder.
