# VPT — khôi phục vận hành và quy tắc khách hợp lệ ngày 15/10/2026

## Phạm vi được giao

Founder yêu cầu hoàn thành bốn việc: tự ghi nhận khách hợp lệ khi chuyển mới sang Warm, Hot hoặc thẳng từ Lead sang Deal; khôi phục đồng bộ dự phòng và bảo toàn dữ liệu; kiểm chứng email/form; nghiệm thu Google/Meta bằng khách thật. Sau yêu cầu tạm dừng, Founder đã yêu cầu tiếp tục cả bốn việc. Phạm vi quảng cáo vẫn là VPT Google Ads `975-957-2942`, website `vanphuthanh.net`, Meta website dataset `1000623629782763`.

Mỗi khách giữ mốc đủ điều kiện đầu tiên, không cộng lặp Warm → Hot → Deal; không tự tính lại hồ sơ đã ở giai đoạn hợp lệ trước khi phát hành. Không cần lập thêm phiếu sale cho phương pháp giai đoạn. Consent, nguồn quảng cáo, khách mới, chống trùng và dữ liệu TEST vẫn là các kiểm tra độc lập trước khi xuất/gửi quảng cáo. Quyết định loại/thu hồi thủ công vẫn có hiệu lực.

## Kết quả đã thực hiện trên hệ thống

- Plugin/form website của PR #128 đã phát hành ngày 14/10. Một hồ sơ TEST được kiểm chứng vào primary; hậu kiểm ngày 15/10 đã thấy bản mirror trên backup. TEST vẫn không đồng ý đo quảng cáo và không được dùng làm khách/CPL.
- Bản vá mirror column `website_intake` của PR #130 đã áp lên backup ngày 14/10; không đồng nghĩa backup đã đủ schema riêng qualification/receipt/outbox hoặc được nghiệm thu failover.
- Ngày 15/10, WP Mail SMTP đã lưu SMTP Host `mail93132.maychuemail.com`, giữ SSL/465, xác thực và credential hiện có. Đây là CNAME đích của `mail.itso.vn`, khớp chứng chỉ `*.maychuemail.com`; không tắt xác minh TLS.
- Một email thử đã được yêu cầu gửi tới hộp thư VPT được Founder cho phép. UI không còn lỗi kết nối và chuyển sang kết quả cảnh báo deliverability. Chưa có bằng chứng thư tới inbox. DNS `itso.vn` trả hai TXT SPF; đã soạn nội dung để Founder chuyển bên quản trị DNS/email kiểm tra, chưa sửa DNS hay liên hệ bên thứ ba.
- Backend Render My Workspace đã được chuyển **Auto-Deploy: Off** qua Settings trong phiên khôi phục. Không restart/suspend/deploy bởi tác vụ này. Mục đích là tránh commit khác tiếp tục làm mất queue RAM trước khi có kế hoạch khôi phục. Khi vận hành ổn định, người phụ trách phát hành cần quyết định khôi phục On Commit hoặc After CI Checks Pass; không tự bật lại khi queue chưa bền vững.
- **11:44:16 Asia/Saigon ngày 15/10**, migration policy giai đoạn đã áp riêng lên primary `qlycv`, history `20261015044416 / crm_stage_qualification_policy_vpt_20261015`, file SHA256 `555dc310042617d70f073b04fb43e671f986106b059e21b94489e62c01e102c9`. Hậu kiểm 04:44:50 UTC: đủ ba cột, hai constraint validated, unique index và ba hàm invoker chỉ service-role được execute; qualification/outbox/attempts vẫn 0. Không ghi CRM/backfill hay restart Render. Backend cũ chưa dùng RPC mới nên **tự qualification chưa được kích hoạt**.

Ảnh kiểm nhận lưu ngoài repo: `vpt-smtp-test-20261015.png` và `vpt-backend-autodeploy-hold-20261015.png` trong workspace vận hành. Không đưa secret, nội dung liên hệ khách hoặc raw queue vào repo.

## Candidate chưa phát hành

Migration mới `20261015020200_crm_stage_qualification_policy.sql` thêm phương pháp `stage_based_v1` vào ledger hiện có. RPC service-only ghi thay đổi CRM, lịch sử người/thời điểm thật và qualification trong cùng giao dịch; ba boolean bằng chứng sale không bị đổi thành true. Năm đường chuyển stage/type hiện có dùng cùng adapter; các thao tác khác giữ đường ghi hiện tại. Sau RPC, chỉ mirror trạng thái CRM đã commit qua queue, không replay RPC nghiệp vụ trên backup.

Google/Meta đọc bằng chứng của phương pháp giai đoạn, kiểm lại giai đoạn/pipeline/công ty đang có và dữ liệu nguồn. Rời Warm/Hot hoặc vào cột thua thì giữ; vào lại không tạo khách/mốc mới. Qualification của lead đã xóa không làm đóng toàn bộ exporter. Thu hồi conversion đã được Google nhập và Meta accepted-stale vẫn cần quy trình đối soát hiện có; không tự gửi sự kiện đảo giả.

Kiểm candidate giai đoạn: **11/11 PostgreSQL mới, 21/21 PostgreSQL website hiện có và 158/158 Node** đạt. Frontend `npm run build` đạt (Vite 6.4.1, 19.181 modules); còn các cảnh báo bundle/dependency hiện có. CI Node 18/22 được bổ sung để chạy các kiểm mới. Kiểm cô lập không chứng minh đã triển khai hoặc Google/Meta đã nhận khách thật.

Candidate replication đã qua review độc lập và **36/36 kiểm focused**: giữ job đến khi write/ACK được xác nhận, retry có backoff và giữ thứ tự từng đối tượng, không coi PATCH 0 hàng là thành công, bảo toàn body lỗi FK, đọc primary có kiểm tra lỗi, chặn xung đột định danh và không tự đổi owner/FK để né lỗi. Guard kiểm cả code cũ/current, mọi type và PATCH không có company; source vắng tường minh được đối soát exact-ID, lỗi đọc/alias giữ lại. HTTP 401/403 không còn tự gọi broad schema grants. Main tích hợp có **218 Node**, frontend build đạt và **3/3 CI SUCCESS tại `ec02dc7f`**. Bản sửa tương thích parser pg và gói capture đang chuẩn bị cần kiểm lại tại SHA cuối; chưa nghiệm thu runtime.

## Gate khôi phục backup

Lần đọc health `2026-10-15T03:59:34.849Z`: active primary, cả hai API healthy, Redis disabled, uptime khoảng 879 giây, queue 684, applied 309, failed 33. Đây là số trong vòng đời process mới, không phải tổng lịch sử đồng bộ.

Render ghi các auto-deploy từ commit khác ở 02:59, 03:08, 03:32 và 03:45 UTC; live 03:45:08 tại `aaff6568fb9e96a86c0b42e54cd8db4147fe26b5`. Hàng đợi khoảng 45.998 đã quan sát ở process cũ không được chứng minh đã bảo toàn; không lấy queue mới nhỏ hơn/queue bằng 0 làm bằng chứng khôi phục. Endpoint hiện có chỉ trả tối đa 200 metadata đã giảm dữ liệu, không xuất đầy đủ body hoặc chuyển RAM sang Redis. Không mở inspector/đọc raw process memory để lấy queue.

Audit chỉ đọc xác nhận có user canonical thiếu trên backup và va chạm email. UUID alias trên backup cũng có trên primary; phải so cùng UUID và dữ liệu nguồn, không suy hai hồ sơ là một người chỉ vì email trùng. Tài liệu forensic/guard/rollback chứa định danh chi tiết lưu riêng ngoài repo. Chưa sửa email, merge/rekey user hoặc replay hàng loạt hồ sơ.

Một nhóm Lead backup đã bị ghép theo code với UUID khác; có thay đổi owner/công ty và hồ sơ đã xóa ở primary. Không bulk upsert nhóm này hoặc đổi FK mù quáng. Cần snapshot trước sửa, mapping có bằng chứng, đối soát current-state và tombstone/deletes. Khôi phục parent/FK chỉ là một phần; không chứng nhận toàn bộ backup/failover.

Audit metadata ngày 15/10 thấy 28 bảng chỉ-primary và 32 bảng chỉ-backup (bao gồm Work/Manufacturing/Business OS và nghiệp vụ tài chính), nên không clone/drop toàn schema. Script incremental hiện có xóa toàn bảng rồi restore riêng lẻ; `runBackupSync` còn gọi broad grants, cấp authenticated CRUD trên mọi bảng public. **Không chạy các tuyến này cho đợt khôi phục.** Runtime permission retry đã được đóng trong candidate, manual helper/ACL production chưa đổi. Backup `lead_attribution` còn thiếu `ttclid`; schema/service-only receipt/qualification chưa có trên backup.

Kiểm metadata storage attachments thấy primary 16.346, backup 8.704 object; chưa so nội dung/tệp. Dữ liệu queue, DB và storage phải nghiệm thu riêng. Snapshot FK/count ngoài repo không phải bản sao có thể rollback đầy đủ. Bản sửa ba hàng cần snapshot mã hóa thực sự và source/backup fingerprint/transaction guards trước khi chạy; chưa được áp bởi báo cáo audit.

## Nghiệm thu và rollback

Tool khôi phục giới hạn `backend/scripts/recover-backup-user-parent-20261015.js` có **27/27 PostgreSQL tests** cho candidate khóa riêng. Mặc định `--dry-run`, không sửa hàng nghiệp vụ. `--snapshot` chỉ lưu ciphertext AES-256-GCM vào schema owner-only `vpt_recovery_20261015` trên backup. Migration kho private đã áp lúc **04:47:48 UTC**, history `20261015044748 / vpt_bounded_recovery_private_snapshot_20261015`; hậu kiểm owner postgres, RLS + FORCE RLS, cả bốn app roles không có schema usage hoặc CRUD, snapshot 0. Migration tiếp `20261015045032_vpt_recovery_dedicated_snapshot_key_v2.sql` bổ sung định danh khóa riêng và giữ tương thích ciphertext cũ; cần áp trước CLI v2. `--apply --snapshot-id <UUID>` là bước riêng, yêu cầu snapshot decrypt/read-back và fingerprint toàn hàng/nguồn/catalog/inbound FK còn khớp. Nguồn giữ hai user và một department bằng FOR SHARE trong REPEATABLE READ qua lúc backup SERIALIZABLE COMMIT. Chỉ email của cùng UUID được đổi, thêm đúng department/user nguồn; không đổi FK, role hoặc memberships.

Snapshot v2 dùng HKDF theo domain từ **khóa mã hóa ngẫu nhiên riêng 32 byte**, base64 chuẩn trong `VPT_RECOVERY_SNAPSHOT_KEY`, cùng UUID phiên bản `VPT_RECOVERY_SNAPSHOT_KEY_ID` ràng buộc vào AAD/HKDF. Không dùng JWT cho snapshot mới. Các ciphertext v1 cũ, nếu có, cần đúng JWT key cũ để giải mã; không fallback JWT cho ghi mới. Hai biến khóa riêng đã lưu qua Render **Save only**, giá trị được che và không đưa vào chat/repo; hậu kiểm không có deploy mới. Khi cấp cho CLI hiện tại, dùng silent read với shell trace tắt, biến môi trường chỉ cho tiến trình và unset sau chạy. Giữ đúng từng phiên bản khóa trong kho vận hành riêng đến khi hết nhu cầu phục hồi; UUID không thay cho lưu khóa. Không xuất khóa, URL DB, contact hoặc password ra terminal/repo. Private schema/table không cấp quyền app, không nằm trong Data API, không sửa ACL công khai. Script giữ lỗi numeric có thể bị JavaScript làm tròn, sai kiểu/PK/unique, mất kết nối/khóa nguồn, schema hoặc FK thay đổi. Runtime grant tự động đã được đóng ở candidate; manual helper vẫn không được chạy.

Tool **không có undo tự động sau commit**. Nếu COMMIT mất phản hồi, kiểm `applied_at/result` của snapshot và exact postimage bằng kênh bảo mật trước khi thử lại; không suy client báo lỗi nghĩa là đã rollback. Có FK mới sau commit thì không xóa user/department vừa thêm để đảo thao tác. Snapshot trước ảnh và rollback trong transaction không chứng minh đã khôi phục queue hoặc toàn bộ backup. Giữ bước `--apply` cho đến khi worker đang chạy có guard định danh phù hợp; mở FK khi worker cũ còn ghép code khác UUID có thể cho ghi sai tiếp diễn.

Dry-run thực tế đã nối TLS bằng Supabase Root 2021 CA lấy từ URL phân phối trong [mã Studio chính thức](https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json), chỉ đặt `NODE_EXTRA_CA_CERTS` cho tiến trình CLI; không tắt certificate validation hoặc đổi môi trường app. Lỗi metadata `name[]` OID 1003 được sửa bằng cast `attname::text` thành `text[]` OID 1009 và regression parser pg thực tế. **Dry-run bản `9c6799a8` trên server đã PASS, eligible=true, production_rows_changed=0.** Lần thử snapshot v1 giữ ở `RECOVERY_KEY_UNAVAILABLE`, không lưu ciphertext hoặc sửa hàng nghiệp vụ; vì vậy chuẩn bị v2 với khóa riêng như trên, không hạ yêu cầu khóa hoặc đổi JWT. CI **3/3 SUCCESS tại `397e9472`**; candidate khóa riêng tiếp theo cần CI tại SHA mới.

Không có API hiện hành để pause/export đủ RAM queue trong process. Maintenance Mode có thể giữ ingress nhưng worker nền vẫn chạy. Phương án cutover đang chuẩn bị cần baseline mã hóa và journal bền vững bắt thay đổi/xóa trong khoảng capture–deploy; sau đó deploy worker disabled, chứng minh process cũ đã dừng rồi mới mở FK/reconcile. Không lấy new deploy LIVE làm bằng chứng old worker đã ngừng; không drain worker cũ bằng cách mở parent trước guard.

1. Review không còn lỗi chặn; kiểm lại trên SHA cuối sau tích hợp main, không phát hành bản cũ làm mất cập nhật khác.
2. Có kế hoạch queue/reconciliation trước restart; dữ liệu thiếu, backup-only, lịch sử và các thao tác xóa phải được đối chiếu riêng.
3. Áp migration primary trước backend sử dụng RPC; hậu kiểm schema, grants, RLS và không backfill. Không áp policy nghiệp vụ chỉ-primary lên backup như một bản mirror.
4. Kiểm một chuyển trạng thái có kiểm soát, đúng actor/time, một ledger đầu tiên và trạng thái mirror; không qualify TEST để giả nghiệm thu quảng cáo.
5. Email cần bằng chứng hộp nhận và kết quả form, không chỉ SMTP Save Settings hoặc yêu cầu gửi được chấp nhận.
6. Google Data Manager còn chờ dòng khách thật đủ điều kiện để đọc/map/import. Meta website vẫn giữ gửi thật tắt; chỉ xét bật sau kiểm nhận đúng nguồn/consent và provider ACK. Chưa có CPL hoặc kết luận ≤250.000đ/khách.

Hậu kiểm primary **04:12:58 UTC ngày 15/10**: qualification VPT `QUALIFIED` 0, website receipt gắn lead thật không TEST 0, website outbox/attempts 0. Không tạo dữ liệu giả để hoàn tất mapping hoặc nghiệm thu quảng cáo.

Rollback ứng dụng có thể giữ schema/phương pháp mới; không drop cột/index/ledger đã dùng hoặc phục hồi constraint ba boolean true khi có sự kiện giai đoạn. Giữ lịch sử nghiệp vụ và consent gates của cả hai Google exporters. Rollback không tự đảo conversion đã nhập hoặc khôi phục hàng đợi RAM đã mất.
