# Bảo vệ lịch trước khi nối đặt khảo sát

Baseline: PR22 `24ad483262f88aaecfd531af60bf927146a02856`. Phần này bổ sung điều kiện để đặt lịch an toàn; chưa có lệnh đặt lịch, giữ chỗ, gửi tin hoặc xác nhận khách hàng.

## Hiện trạng đã đọc từ mã

Lịch chuẩn vẫn là `crm_events` và `crm_event_participants`. Nhân sự có thể được mời sang sự kiện của công ty/module khác, nên bảo vệ theo ID nhân sự trên toàn lịch, không giới hạn bằng company của sự kiện.

| Đường ghi | Tác động cần xử lý trước khi mở thật |
|---|---|
| `backend/src/routes/events.js` | Tạo/sửa sự kiện rồi ghi người tham gia ở giao dịch riêng; thay danh sách bằng DELETE rồi INSERT; có chỗ bỏ qua lỗi. |
| `backend/src/helpers/createPlannedVcLdEvents.js` | Tạo/sửa lịch sản xuất, lấy hàng, lắp đặt rồi upsert người tham gia riêng. |
| `backend/src/helpers/applyPlannedOpsEvents.js` | Thay lịch vận hành, ghi người tham gia và trạng thái riêng. |
| `backend/src/routes/vcHandover.js` | Tạo lịch/bổ sung người tham gia sau xác nhận bàn giao; nhiều thao tác riêng. |
| `backend/src/helpers/clearCompletedProjectDeadlines.js`, `completeOpenWorkOnModuleDone.js` | Hủy lịch theo Lead/Project; lỗi có thể chỉ được ghi cảnh báo. |
| `backend/scripts/backfill-vc-ld-event-participants.js`, `purge-test-plan-data.js` | Bổ sung/xóa dữ liệu qua đường bảo trì. Không chạy trong công việc này. |
| SQL275 và khóa ngoại | Xóa người, bỏ liên kết hoặc cascade xóa người tham gia có thể làm mất bằng chứng bận. |
| `backupSchemaGrants.js`, replication và script sao lưu | Cấp lại quyền rộng trong schema public; có đường dùng replica mode và tắt USER triggers khi khôi phục. Không thể coi backup mặc nhiên đủ quyền/kiểm soát để nhận ghi. |

## Thay đổi SQL664

- Enrollment và permit đặt riêng trong schema `crm_survey_control`, không phải schema public mà công cụ backup đang tự cấp lại quyền. Không cấp USAGE/CREATE, quyền bảng hay hàm cho anon/authenticated/service_role; RLS được bật. Migration không đăng ký nhân sự nào và không cấp lệnh đăng ký qua API.
- Enrollment là bản ghi chuyển quyền ghi có `release_reference`; không tự hết hạn theo roster. Không có FK cascade làm tự xóa enrollment khi xóa dữ liệu nghiệp vụ.
- Một khóa giao dịch chung được dùng cho ghi hai bảng lịch và thay enrollment. Trigger đọc lại quan hệ trước/sau sau khi lấy khóa; từ chối isolation khác READ COMMITTED để tránh dùng snapshot cũ bỏ sót enrollment mới.
- Khi một bản ghi liên quan nhân sự đã đăng ký, mọi INSERT/UPDATE/DELETE cũ đều bị từ chối, kể cả hủy, từ chối tham gia, thay ID/người phụ trách và xóa quan hệ trước khi thêm lại. Các mutation không liên quan vẫn được phép tại READ COMMITTED.
- Permit riêng chỉ có hiệu lực cho đúng event, transaction ID và backend PID; GUC do ứng dụng đặt không tạo quyền. Chưa có RPC ứng dụng nào tạo permit. Lệnh đặt lịch tương lai phải tạo/xóa permit trong cùng giao dịch, kiểm lại quyền, lịch bận, nguồn và xác nhận khách ngay trước ghi, đồng thời lưu audit/bàn giao.
- Trigger bật ALWAYS để replica mode không bỏ qua. TRUNCATE bị từ chối khi có enrollment. Người sở hữu DB vẫn có thể tắt trigger để bảo trì: hàm nội bộ `assert_ready` khóa bảng chống thay trigger giữa kiểm tra và commit, kiểm năm trigger ALWAYS và quyền riêng trước mỗi lệnh đặt lịch tương lai.

## Giới hạn phải giữ trong cổng phát hành

Đây là **cơ chế chuẩn bị**, không phải bằng chứng luồng đặt khảo sát hoàn tất. Guard chưa được bật cho người thật. Cả khi enrollment rỗng, ghi lịch được tuần tự hóa và yêu cầu READ COMMITTED; phải đo ảnh hưởng hiệu năng và kiểm các job bảo trì trước phát hành.

Không đăng ký nhân sự thật khi các đường cũ vẫn có thể báo thành công sau lỗi người tham gia: ví dụ event chưa có người được tạo thành công, bước thêm nhân sự đã đăng ký bị chặn nhưng code cũ bỏ qua lỗi. Guard giữ dữ liệu được bảo vệ không bị sửa, nhưng không tự sửa thông báo thành công sai hoặc làm các bước rời rạc thành một giao dịch. Cần chuyển đường liên quan sang dịch vụ ghi nguyên khối, hoặc chặn có thông báo rõ trước khi nhận yêu cầu đó; nghiệm thu cả UI/flow gọi helper.

Backup chỉ đồng bộ public sẽ bỏ sót schema mới; restore có thể tắt trigger hoặc làm mất trạng thái ALWAYS. Trước failover/phát hành phải khôi phục đủ schema, enrollment và lịch, kiểm quyền/trigger và đối soát; không tự bật ghi AI. Không chạy công cụ backup/live trong đợt này.

REST replication hiện bỏ qua `/rest/v1/rpc/` trong `supabaseReplication.js`. Giao dịch đặt lịch qua RPC tương lai vì vậy không tự được sao chép bởi đường này. So sánh số dòng public không chứng minh đã giữ đủ event/người tham gia/enrollment/audit trong cùng phiên bản. Cần chọn và kiểm thử nguồn sao lưu nhất quán trước khi nhận ghi thật hoặc chuyển Primary.

Phần tiếp theo: đề xuất có phiên bản gắn đúng người–giờ–địa chỉ; bằng chứng khách xác nhận đề xuất đó; ghi event/người tham gia/audit/bàn giao trong một giao dịch và chống trùng; màn hình vận hành; kiểm thử mọi đường cũ đã chuyển. Mọi tài nguyên được coi là bận (creator/assignee/participants) đều phải kiểm tra trước ghi, không chỉ nhân viên khảo sát.

## Kiểm thử và hoàn tác

`backend/tests/surveyCalendarGuard.cases.js` chạy sau bộ khảo sát trên PostgreSQL16 cô lập. Bao phủ quyền sau GRANTS_SQL backup thật, old/new quan hệ khác công ty, xóa rồi thêm người tham gia, mixed-statement rollback, hai chiều chờ enrollment, snapshot REPEATABLE READ, permit sai transaction/event, giả GUC, cascade, replica mode và readiness khi trigger/quyền sai. Kết quả CI/review được ghi riêng khi có bằng chứng.

Không hoàn tác bằng xóa enrollment/permit hoặc tắt trigger khi đã có lịch do tuyến mới tạo. Dừng nhận lệnh mới, giữ lịch/audit/bằng chứng, đối soát và bàn giao lại quyền ghi có kiểm soát. Trong bản chưa enroll này, migration bổ sung chưa cho phép gọi đặt lịch từ ứng dụng.
