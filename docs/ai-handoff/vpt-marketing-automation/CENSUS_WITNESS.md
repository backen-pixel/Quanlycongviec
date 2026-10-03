# Nhật ký trang dữ liệu Facebook

Phạm vi tăng thêm từ deabf187: SQL672 lưu từng trang collector đã chấp nhận. Đây là bước chuẩn bị đối soát khách/tiền cho mục tiêu 250.000đ/khách hợp lệ; chưa chứng minh đã đạt chỉ tiêu và chưa chứng nhận toàn bộ khách tại Meta.

## Hợp đồng

- Mỗi claim/reclaim có `lease_started_at` do DB ghi. Đây là lúc nhận quyền xử lý; không phải thời điểm Meta chụp dữ liệu. `acceptedAt` là lúc DB ghi bằng chứng, không phải chữ ký hay xác nhận từ Meta.
- Commit giữ khóa run rồi task, kiểm lease, người thực hiện và phạm vi hiện hành. Cùng giao dịch ghi observation, receipt/item phục hồi, witness và cursor. Hết lease hoặc đổi phạm vi trước kiểm cuối làm tất cả thay đổi của chunk rollback.
- Bằng chứng gồm run/task/ordinal, Page/form, Graph version, phạm vi cấu hình đã băm, mốc khôi phục và mốc đo cố định, cursor vào/ra đã băm, digest trang trước và metadata được whitelist. Không lưu token, URL provider, raw cursor, liên hệ hoặc trường dư của hàng provider.
- Graph version là phiên bản yêu cầu của collector, lấy từ cấu hình và URL yêu cầu; chưa là version được Meta chứng thực qua header. Phiên bản đầu tiên được chấp nhận áp dụng cho mọi task của run. Khác version bị từ chối, kể cả tập ID không giao nhau. Khôi phục bằng run mới sau lỗi, không trộn dữ liệu theo cấu hình API khác phiên bản.
- Giữ mọi lần xuất hiện giữa các trang, tách số dòng/ID duy nhất/lần lặp. Số ID là provider ID của lượt gửi theo Page/form, không phải khách CRM duy nhất hoặc khách hợp lệ.
- Tối đa 5.000 trang/run, 100 dòng/trang; các giới hạn observation/form/task cũ vẫn giữ. Chạm giới hạn trả lỗi, không bỏ bớt trang rồi báo đủ.
- Digest SHA-256 được tạo từ JSONB chuẩn hóa của DB. Cùng DB có thể tính lại; không là chứng thư provider hay bằng chứng chống sửa bởi chủ DB.

## Đọc kết quả

`marketing_fb_census_status` thêm `run.witness` trong cùng SELECT snapshot. Endpoint hiện có `GET /crm/marketing-trials/:trialId/reconciliation?company_id=...` trả summary này sau kiểm quyền. Summary không trả danh sách ID, raw cursor hoặc bí mật. Giao diện kỳ đo chưa hiển thị summary mới; bản chốt kỳ sẽ tiêu thụ bằng chứng riêng sau bước này.

- `MISSING`: chưa lưu witness, bao gồm run cũ không có hồ sơ trang.
- `PARTIAL`: chưa đủ mọi chuỗi trang, hoặc thiếu prefix từ trước migration.
- `TRAVERSED`: run SCANNED, mọi task có ordinal liên tục từ 1, cursor nối nhau và trang cuối terminal; một Graph version. Chỉ xác nhận chuỗi trang collector đã xử lý được lưu đủ.
- `FAILED` / `STALE_SCOPE`: run lỗi hoặc cấu hình nguồn thay đổi. Digest lịch sử được giữ.

`providerCoverage=UNVERIFIED`, `cpqlReady=false`, `allowBudgetExecution=false` vẫn giữ. Trang rỗng terminal có thể là một traversal hợp lệ với 0 ID quan sát; không kết luận có 0 khách. Phạm vi đã băm ở đây là cấu hình census SQL656, không phải bằng chứng đã bao phủ toàn bộ danh mục nguồn SQL671. Chưa có snapshot nhất quán tại Meta, count-before/after có semantics được xác minh, kiểm quyền API từ provider hoặc đối soát bản xuất. Không tự thêm công thức từ tên các trường count.

## Migration, quyền và hoàn tác

Áp dụng sau SQL671 trên PostgreSQL cô lập trước. Migration additive, không điền ngược timestamp hoặc witness cho lịch sử. Pause và drain worker trước rollout; lease cũ không có `lease_started_at` bị từ chối, phải hết lease rồi reclaim. Lượt quét có prefix cũ vẫn PARTIAL và cần chạy lượt mới để có chuỗi đủ. Không xóa lịch sử.

Schema/table/helper riêng không cấp trực tiếp cho anon/authenticated/service_role. Wrapper claim/commit/status có kiểm explicit service_role kể cả khi vô tình được cấp rộng. Status và commit kiểm quyền công ty/tenant/người hiện hành. Không cấp quyền API mới, không bypass đường nghiệp vụ.

Hoàn tác vận hành bằng pause worker/flag census; giữ receipts, observations và pages. Không drop dữ liệu đã phát sinh. Việc phát hành/migration thật vẫn cần gói Founder duyệt. Không thay đổi mức chi, phân vùng 80/20 hoặc quyền AI.

## Kiểm chứng cần đạt

PostgreSQL16 cô lập: migration hai lần; concurrency/replay, reclaim, hết lease tại insert, Graph version khác task, dữ liệu dư được loại, lặp giữa trang, terminal rỗng, lịch sử thiếu prefix, quyền/phạm vi đổi và không lộ bí mật. Bộ intake/measurement/source-registry hiện có phải giữ PASS. Review độc lập theo đúng bản mã được kiểm. Không có kiểm thử Meta thật trong bước này.

Tiếp theo: đối soát tập ID thực và phạm vi đầy đủ, bản chốt kỳ có bằng chứng/invalidation, điểm nhận ngoài Lead Ads, lịch/chờ xử lý trên dashboard, nội dung/nhân sự/quyền vận hành thật và UAT/Founder release. Full goal vẫn ACTIVE.
