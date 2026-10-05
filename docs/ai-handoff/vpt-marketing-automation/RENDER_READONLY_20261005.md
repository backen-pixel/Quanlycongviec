# Render — kiểm tra chỉ đọc sau xác nhận workspace

Ngày 05/10/2026, khoảng 12:45–12:51 giờ Việt Nam. **Đã truy cập; HOLD phát hành.**

Founder xác nhận workspace “My Workspace” đã được chọn cho bước đọc. Dùng `workspaceId=tea-d47g0824d50c73856e80` tường minh trong mọi lời gọi Render. Không cần hỏi chọn lại vì giá trị fallback của công cụ vẫn rỗng; workspace theo từng request không được phản ánh bởi `get_selected_workspace`. Không đổi cấu hình tài khoản hoặc workspace.

[Bằng chứng có cấu trúc](RENDER_READONLY_20261005.json) lưu các trường cần thiết từ Render connector và GitHub compare; không có token, secret, dữ liệu khách hoặc toàn bộ biến môi trường.

## Hiện trạng quan sát

| Thành phần | Bản đang live theo Render | Cấu hình quan sát |
|---|---|---|
| [tubep-frontend](https://dashboard.render.com/static/srv-d6gh2mc50q8c73a3d1c0) | `ad88a16202c167f144411c16c0b45969b2c49378`; deploy `dep-db1hqd3tqb8s739caitg`, hoàn tất 10:46:06 ngày 05/10 | Static site, `frontend`, URL khớp CRM vừa kiểm, main, tự deploy khi commit, preview off. |
| [tubep-backend](https://dashboard.render.com/web/srv-d6gguqq4d50c73emh20g) | `899db5ed0d2aaf5a72b90e3aa5cc961c1bd6e090`; deploy `dep-db1ih3bm8hqs73e2h51g`, hoàn tất 11:34:30 ngày 05/10 | Web service Node, `backend`, Singapore, một instance cấu hình, main, tự deploy khi commit, preview off; healthCheckPath rỗng. |
| tubep-frontend1 | Không chứng nhận bản chạy | Web frontend cũ đang suspended. Không bật lại hoặc xóa. |

Danh sách workspace (kể cả previews) không có dịch vụ background worker/cron riêng. Điều này **không chứng minh** không có job chạy trong backend, nguồn GitHub Actions hoặc hệ thống khác; một instance cấu hình không là bằng chứng chỉ một writer DB. Sự kiện Render từ 04:33 UTC trong bộ lọc đã hỏi có deploy_ended/succeeded lúc 04:34:31; không thay kiểm sức khỏe ứng dụng hoặc UAT.

Frontend và backend khác SHA nhưng chênh bốn commit chỉ sửa backend, sx-mobile và tài liệu; GitHub compare không có thay đổi `frontend/` trong đoạn này. Vì vậy chưa có căn cứ gọi chênh SHA là lỗi frontend. HealthCheckPath rỗng là dữ kiện cấu hình, không suy ra Render không có kiểm tra khả dụng nào.

## Các điều kiện mới cần khép

1. **Ứng viên cần đối chiếu với main mới.** Backend đang live đi trước nền đã kiểm `ca8810c5` 10 commit, 49 file thay đổi. Compare từ runtime PR25 `add71daf` sang backend live trả diverged, merge-base `ca8810c5`: ahead 10 / behind 172. Bản sửa chưa nằm trong lịch sử triển khai này; không dùng PASS ở nền cũ để chứng nhận phối hợp với main hiện tại.
2. Thay đổi mới chạm `adInsights.js`, `adAnalytics.js`, `AdAnalyticsPage.jsx`, lịch dự án/giao lắp và các helper ghi DB. Cần tích hợp có kiểm soát trong nhánh ứng viên, giữ bằng chứng/permission/CPQL, kiểm hồi quy phần bị ảnh hưởng và reviewer riêng. Chưa sửa hoặc merge mã trong phiên chỉ đọc này.
3. Main thêm `database/649_va_cot_thieu_projects_drive_acl.sql`, trong khi ứng viên đã có `649_marketing_spend_evidence.sql`. Đây là hai tên khác nhau có cùng tiền tố 649, ngoài các tiền tố trùng 647/648 đã biết. Không coi cùng số là đã chạy, không sửa migration đã áp dụng. Kế hoạch migration phải ghi đầy đủ tên/blob/prerequisite và đối chiếu ledger thực.
4. **Điều kiện Primary chưa khớp bằng chứng cấu hình.** Log khởi động backend lúc 11:34:25 ghi `[supabase-health] Probe mỗi 15000ms (failover=on, auto=off)`. Tuyến ứng viên tại `backend/src/routes/facebook.js:22` đòi `!isFailoverEnabled() && getActiveTarget() === 'primary'`. Nếu cấu hình failover=on này giữ nguyên khi mở tuyến mới, kiểm soát sẽ từ chối. Không bỏ guard hoặc tự tắt failover để vượt điều kiện. Log khởi động không chứng minh target hiện tại, sao lưu khỏe hay hai DB cùng ghi; phải đối chiếu trạng thái hiện hành và phương án chuyển luồng.
5. **Merge main có tác động phát hành.** Cả hai service để autoDeploy=yes/trigger=commit trên main. Vì vậy gói duyệt phát hành phải bao gồm thao tác ghép main và tác động triển khai tự động; không coi merge là thao tác chỉ lưu mã. Không tắt auto-deploy hoặc bấm deploy trong lượt này.

Nguồn so sánh: [main từ nền đã kiểm](https://github.com/backen-pixel/Quanlycongviec/compare/ca8810c57d2078087a7d0afdd95776fba6e84cc3...899db5ed0d2aaf5a72b90e3aa5cc961c1bd6e090), [chênh frontend/backend](https://github.com/backen-pixel/Quanlycongviec/compare/ad88a16202c167f144411c16c0b45969b2c49378...899db5ed0d2aaf5a72b90e3aa5cc961c1bd6e090).

## Chưa xác minh

Biến môi trường/feature flag hiện hành, active Primary và mọi writer, key/grant AI, RLS/quyền DB, schema/ledger thực, backup/restore thật, Page/form/nhận khách, đầy đủ lịch và UAT đúng ứng viên. Connector hiện có công cụ sửa environment nhưng không có công cụ đọc environment tương ứng; không gọi công cụ sửa để lấy cấu hình. Giữ các điều kiện trong [RELEASE_READINESS](RELEASE_READINESS.md) và [phiếu CRM](CRM_READONLY_VERIFICATION_20261005.md).

Phiên này chỉ đọc Render/GitHub và cập nhật hồ sơ. Không deploy/restart/merge, không thay DB, environment, quyền hoặc ngân sách. Delta tài liệu được kiểm JSON/liên kết/diff; không cần chạy lại test runtime. Hoàn tác tài liệu bằng sửa/revert và giữ lịch sử quan sát; không có thay đổi production để hoàn tác. Hồ sơ mới đang cục bộ, chưa publish lên PR.
