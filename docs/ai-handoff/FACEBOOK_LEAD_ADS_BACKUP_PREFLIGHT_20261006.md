# Kiểm tra Backup trước khi mở tuyến Lead Ads — 06/10/2026

**Đã xác định nguyên nhân đồng bộ custom Backup thất bại; bên triển khai đã tìm thấy restore point native của Primary trên Dashboard. Chưa chạy khôi phục production.** Lượt điều tra này chỉ đọc mã, log đã lọc và trạng thái. Không chạy clone/restore, không đổi cấu hình DB/Render hoặc quyền, không truy cập hồ sơ khách/credential và không mở phạm vi sửa SQL700.

Mã đối chiếu tại repo commit `327864b759c6e5663949b87723ed7049c209d193`: clone script blob `0f0be4da8d296b0bb323745d877fc3060516e315`, backup helper `a566aac692485817d56f26a389c4fbe88230a5c6`, incremental helper `f7ca8b34ffafd6f46664ae10d06546102d4234fe`. Không dùng việc đọc source thay cho chứng cứ deployed artifact; kết luận thứ tự/transaction dưới đây nêu theo mã này và các mốc log khớp.

## Bằng chứng trực tiếp

| Nguồn | Kết quả đã đọc |
|---|---|
| Primary `app_settings`, key `supabase_backup_sync` | `last_run_at=2026-10-05T21:00:17.143Z`, `last_run_status=failed`, lỗi gọn `clone-primary-to-backup.js exit 1`; schedule/include DB/include Storage đang true. |
| `run_history` đúng `started_at` trên | `finished_at=2026-10-05T22:51:24.310Z`, `db_mode=full_clone_required`; 49 dòng log được giữ. |
| Run log dòng47, `22:51:23.273Z` | Đến bước chuẩn bị schema public trên Backup. |
| Run log dòng48, `22:51:24.291Z` | `ERROR: out of shared memory`; PostgreSQL gợi ý tăng `max_locks_per_transaction`. |
| Run log dòng49, `22:51:24.300Z` | `[clone] prepare backup schema failed (exit 1)`. |
| Render app log `9eaca65a-c846-4020-a693-ef5eb5364595`, `22:51:24.67795952Z` | Process ghi unhandled rejection `clone-primary-to-backup.js exit 1`. Service `srv-d6gguqq4d50c73emh20g`, workspace `tea-d47g0824d50c73856e80`. |
| Supabase project status Primary | `ACTIVE_HEALTHY`, PostgreSQL `17.6.1.063`. Đây là trạng thái dịch vụ, không phải chứng cứ backup. |

Mốc bắt đầu tương ứng 04:00:17 ngày06/10 giờ Việt Nam; kết thúc 05:51:24. Lần tìm log Render quanh thời điểm bắt đầu không có lỗi clone; lỗi thực nằm gần thời điểm kết thúc. Log chi tiết child process được giữ trong `run_history`: helper thu stdout/stderr vào bộ log của job, không tự in từng dòng ra Render console ([supabaseBackupSync.js](../../backend/src/helpers/supabaseBackupSync.js), dòng198–215,255,436–451).

## Diễn giải nguyên nhân và trạng thái Backup

Nguyên nhân trực tiếp đã được log xác nhận là PostgreSQL không cấp đủ shared-memory locks trong **bước chuẩn bị schema**, không phải lỗi mật khẩu hoặc lỗi phân tích JSON của Lead Ads. Chưa đọc giá trị thực tế `max_locks_per_transaction`, số object/lock cùng thời điểm ở Backup; chưa kết luận chỉ một giá trị cấu hình là toàn bộ nguyên nhân hạ tầng.

Mã [clone-primary-to-backup.js](../../backend/scripts/clone-primary-to-backup.js), dòng122–138, gửi `DROP SCHEMA public CASCADE`, tạo lại schema, grants và extensions bằng **một** chuỗi `psql -c` (hàm dòng85–100), không có `BEGIN/COMMIT` tách đoạn. PostgreSQL xử lý một chuỗi `-c` nhiều lệnh như một transaction; lỗi khiến transaction chuẩn bị này rollback. Vì vậy, theo đúng mã đang đối chiếu, không nên diễn giải log này thành “DROP public đã commit, chỉ restore thất bại”. Đây là suy luận từ mã và semantics PostgreSQL, chưa phải phép đối soát trực tiếp toàn bộ dữ liệu Backup sau lỗi. [Tài liệu PostgreSQL17 về `psql -c`](https://www.postgresql.org/docs/17/app-psql.html#APP-PSQL-OPTION-C).

Luồng chỉ gọi `pg_restore` sau khi bước chuẩn bị trả thành công (dòng273–281). Log lỗi dừng ở chuẩn bị nên chưa có bằng chứng `pg_restore` bắt đầu trong lượt này. Theo cùng thứ tự mã, `pg_dump` đã trả thành công trước đó; tuy nhiên archive của script chỉ lấy schema `public`, bỏ owner/ACL (dòng62–82). Chưa xác minh checksum, tồn tại lâu dài hay khả năng đọc/khôi phục archive đó; không gọi nó là snapshot native hoặc bản sao production đã nghiệm thu.

Rollback của bước chuẩn bị **không rollback cả lần đồng bộ**. Trước khi fallback clone, [supabaseBackupSync.js](../../backend/src/helpers/supabaseBackupSync.js), dòng502–532, đã gọi cấp grants và đồng bộ incremental; [supabaseIncrementalDbSync.js](../../backend/src/helpers/supabaseIncrementalDbSync.js) có xử lý replication queue và đồng bộ bảng bằng các kết nối/lệnh riêng. Các thay đổi đã commit trước lỗi có thể còn trên Backup. Không kết luận Backup trống, không đổi hoặc đã đồng bộ đủ chỉ từ lỗi này; cần đối soát trạng thái thực.

Ngoài ra, trong mã hiện tại, bước chuẩn bị và `pg_restore` là hai tiến trình/giao dịch tách rời; restore không có `--single-transaction` (dòng158–176). Vì vậy một lỗi **ở lượt khác, sau khi chuẩn bị đã thành công** có thể để Backup ở trạng thái khôi phục dở. Điều đó không phải bằng chứng rằng đã xảy ra trong lượt đang điều tra; cũng không thể suy clone hiện tại nguyên tử từ rollback của bước chuẩn bị này.

## Bằng chứng snapshot native — đã có cập nhật Dashboard

Ban đầu reviewer chưa truy cập được qua connector: các công cụ Supabase hiện có không cung cấp danh sách native backup/PITR/restore point; `get_project` chỉ có trạng thái dự án. Điều này không chứng minh snapshot không tồn tại.

Sau đó **bên triển khai (root)** đã mở [Scheduled Backups của Primary](https://supabase.com/dashboard/project/kdxypztstbeovyedmvem/database/backups/scheduled) bằng CUA Chrome với tài khoản Supabase đã đăng nhập sẵn, không tạo đăng nhập mới. Người thực hiện báo đã đọc đúng project `qlycv`, nhánh `main`, nhãn `PRODUCTION`:

- Restore point `05 Oct 2026 22:35:34 (+0000)`, loại `PHYSICAL`, có nút `Restore` — tương ứng05:35:34 ngày06/10 giờ Việt Nam, khoảng3 giờ trước lúc kiểm tra.
- Có các mốc trước đó `04 Oct 22:33:43` và `03 Oct 22:35:43`.
- Dashboard cảnh báo **Storage objects không nằm trong backup này**.
- Không nhấn `Restore`, không chạy khôi phục hoặc đọc nội dung backup.

Đây là bằng chứng UI do bên triển khai cung cấp, không ghi thành lần quan sát Dashboard độc lập của reviewer. Nó xác nhận restore point được hiển thị, chưa chứng minh integrity hay thời gian khôi phục production qua thực nghiệm. Custom Backup sync thất bại và native physical backup của Primary là hai cơ chế khác nhau; không dùng tình trạng một cơ chế để phủ nhận hoặc chứng nhận cơ chế kia.

Kết quả logical restore trong CI của SQL701/702 dùng fixture cô lập là bằng chứng kiểm thử phần mềm riêng, không thay thế snapshot native hoặc đối soát Backup production. Xem [phạm vi kiểm thử SQL702](FACEBOOK_LEAD_ADS_RESTORE_20261006.md).

## Áp dụng cho phạm vi additive701/702

Ý kiến kỹ thuật có giới hạn: có thể dùng restore point native đã quan sát, bằng chứng CI khôi phục SQL701/702 đúng bản và phương án **pause trước, giữ dữ liệu** làm phần phục hồi cho bước additive trên Primary. Việc sửa tuyến full-clone cũ không cần trở thành dependency bắt buộc cho bước này nếu gói phát hành thỏa các điều kiện dưới đây; không coi đó là xác nhận Backup đang đồng bộ hoặc full release PASS.

1. Xác minh runtime thực sự dùng Primary/pin Primary và automatic failover tắt; không chuyển sang Backup chưa đối soát. Đây là kiểm tra riêng do bên triển khai thực hiện, không được suy từ `ACTIVE_HEALTHY`.
2. Khi dừng tuyến mới, dùng `VPT_FB_PAGE_INBOX_WORKER_PAUSED=1`, giữ durable ingress, managed Page allowlist và legacy scope guard. Không bật lại đường Lead Ads cũ để cùng ghi, không xóa inbox/receipt/Customer/Lead hay revert migration bằng DROP. Cấu hình được đọc lúc tạo worker; việc đổi env phải có hiệu lực trên mọi replica và chờ tác vụ cũ kết thúc. Pause không thu hồi một thao tác DB/HTTP đã bắt đầu.
3. Physical restore là phương án cuối: khôi phục về22:35:34Z có thể mất phát sinh sau mốc này và không phục hồi Storage objects. Cần đối soát/giữ giao dịch sau snapshot trước khi chọn restore đè; SQL701/702 không ghi Storage nên giới hạn đó không tự trở thành dependency mở thêm phạm vi storage.
4. Giữ lỗi custom sync thành ngoại lệ cần DBA xử lý riêng: kiểm dung lượng lock/object và tải đồng thời tại Backup, sửa nguyên nhân rồi xác minh sync/restore trong cửa sổ phù hợp. Không tăng tham số hoặc chạy clone tự động trong lượt điều tra này; clone exit0 không thay đối soát schema, dữ liệu, ACL và khả năng phục hồi.

Tài liệu không thu hồi hoặc yêu cầu Founder duyệt lại thao tác triển khai thường lệ đã được cho phép. Quyết định phát hành vẫn dùng đầy đủ các kiểm tra còn lại của gói Lead Ads; không suy riêng bằng chứng snapshot thành nghiệm thu runtime.

Không thay script đồng bộ hoặc chạy tác vụ ghi trong checkpoint điều tra này.
