# Bảo trì đường ghi CRM cũ trước đối soát

## Phạm vi

SQL687 tại runtime `df51b95cdc2252774a46e343c6795b1ad7cc2fd1`; bản kiểm đầy đủ `9ecbec45750c15cdfbf20bdbb60b181bc5f24bcc`, tree `fea75d19ae12786c8bd55cd71c1fcc25d822d135`. PostgreSQL 348/0/0 gồm 13 ca mới; Node22 1228/0/0 và 10 job CI đều SUCCESS. Reviewer phiên riêng đã đối chiếu published SQL/test và log CI, kết luận PASS checkpoint maintenance; không xác nhận cutover hoặc vận hành thật. Chưa áp dụng DB thật, bật bảo trì hoặc phát hành; gói vận hành vẫn cần Founder duyệt.

Hold bảo vệ **toàn bộ công ty trên các bảng trong manifest**, không giới hạn một Page. Nó chặn cả công việc CRM hợp lệ trên các bảng này trong cửa sổ bảo trì. Không dùng như nút dừng chiến dịch hoặc nút dừng một khách. Không coi đây là bằng chứng tiến trình/HTTP/queue cũ đã kết thúc.

## Cơ chế

- Migration cài trạng thái INACTIVE; không reset trạng thái/audit khi chạy lại. Thiếu bảng bắt buộc hoặc bảng phân vùng/kế thừa chưa hỗ trợ thì lỗi và rollback.
- 18 bảng gốc gồm Customer, Lead, contact, message, comment, Lead Ads, Page, nguồn, attribution, task, task assignees, notifications, assignment columns/assignments/assignees/files, task attachments và customer interactions. Thêm mọi bảng tham chiếu khóa ngoại xuống từ các bảng này, kể cả schema khác. Những bảng không có cạnh FK và không thuộc danh sách gốc chưa được bảo vệ.
- Guard BEFORE STATEMENT cho INSERT/UPDATE/DELETE/TRUNCATE, ENABLE ALWAYS, kể cả câu lệnh không khớp dòng nào. READ vẫn theo quyền cũ. Không có token/cờ GUC để ứng dụng bỏ qua guard.
- Bật/tắt lấy SHARE ROW EXCLUSIVE trên toàn manifest theo thứ tự tên trước khóa trạng thái. Giao dịch đã ghi phải commit/rollback trước khi bật; câu ghi chờ sau lệnh bật kiểm trạng thái mới rồi bị từ chối. Giới hạn chờ 3 giây, lỗi trả về giữ trạng thái cũ; không tự thử lại như thể đã bật.
- Các ghi trên bảng được bảo vệ yêu cầu READ COMMITTED, kể cả khi hold tắt, để không đọc snapshot cũ. Cần xác minh cấu hình client trước phát hành. Manifest giữ tên/OID và kiểm đúng trigger hiện hành; thêm FK/table, mất/đổi trigger làm inspect/set_hold từ chối cho đến khi migration/gói mới được rà.
- Chỉ DB operator tin cậy gọi hàm private `crm_legacy_hold.inspect()` và `set_hold(...)`. Không cấp quyền schema/bảng/hàm cho anon, authenticated, service_role; không tạo API/UI bật/tắt. Guard chỉ đọc trạng thái qua SECURITY DEFINER.
- Lệnh gắn request UUID, revision, hash SHA256 của manifest/trigger, release reference, và drain reference khi tắt. Audit cùng giao dịch lưu trước/sau, manifest/hash, session user và thời điểm. Cùng request/nội dung trả audit và trạng thái hiện tại; replay lệnh bật cũ sau khi đã tắt không bật lại. Đổi nội dung hoặc revision cũ bị từ chối.
- Reference là lời xác nhận của operator và đường dẫn hồ sơ, **không phải kiểm chứng tự động** tiến trình đã dừng. `inspect.processesDrained` luôn false. Không tự hết hạn hold.
- Đóng băng DDL/thay đổi schema trong cửa sổ bảo trì. Bảng mới tạo sau lúc bật không tự có guard; phải cập nhật migration/manifest và kiểm lại trước mọi thao tác. Không suy từ graph đã cài rằng mọi bảng tương lai được bảo vệ.

## Hai cổng nghiệm thu riêng

1. **DB HELD:** kiểm đúng manifest/hash/phiên bản, active và revision sau commit; kiểm canary trong môi trường đã được duyệt. Cổng này chỉ chứng minh các DML trong manifest bị chặn. Nó không hủy yêu cầu HTTP đã gửi và không chặn tác động bên ngoài DB.
2. **WRITERS DRAINED:** kiểm bằng chứng mọi instance, worker, timer, tiến trình một lần và queue của thế hệ cũ đã dừng. Không chấp nhận TTL/lease hết hạn, Redis mất leader hoặc cờ trong bộ nhớ làm bằng chứng. Chỉ sau đó mới đối soát giao dịch nguyên tử và xem xét mở lại đường đã nghiệm thu.

UNKNOWN và contact claim không thay đổi bởi SQL687. Dừng batch phải làm trước cửa sổ bảo trì; READ và nhật ký vẫn dùng để quan sát. Không giải phóng UNKNOWN chỉ vì mapping hiện tại hợp lệ hoặc hold đã bật. Chưa có cơ chế đối soát/giải phóng UNKNOWN được nghiệm thu trong checkpoint này.

## Danh sách tiến trình và tác động phải đối soát

| Nguồn mã | Phần phải dừng/chờ và kiểm lại |
|---|---|
| `routes/facebook.js`, helper legacy batch/creator | Request thủ công/batch, autoPipeline, thao tác nguồn và cleanup; nhiều bước HTTP Customer → Lead → contact/message → attribution → task/assignment → notification. |
| `facebookMessengerReceipt.js`, timer khởi động Facebook | Worker drain 5 giây, xử lý sự kiện trước finish/lease check; chưa có pause/awaitIdle chung. |
| `routes/facebook.js` lead-scan/rescan/AutoTool | Timer và auto-resume riêng, không được suy từ autoPipeline đã dừng. |
| `cronLeader.js` | Redis thiếu/lỗi có đường chạy tiếp; không chứng minh chỉ một process ghi. |
| `server.js` scanMissingLeads | Hàm legacy còn trong mã; chưa thấy lời gọi khởi động hiện hành. Xác minh bản triển khai thực tế, không mặc định đang chạy. |
| `autoGenCrmTasks.js` và helper assignment/artifact | crm_tasks, task_assignees, assignment columns/assignments/assignees/files, task attachments. Manifest phải có cả các nhánh phụ. |
| `leadAttribution.js` | Ghi attribution có đường nuốt lỗi; hold chỉ chặn bản ghi, cần đối soát phần thiếu. |
| `facebook.js` notification và `server.js` pushNotification | Nhánh cũ có thể bỏ qua lỗi ghi notifications rồi phát socket/mobile push. Hold DB **không chặn các tác động này**; cần dừng/drain hoặc sửa đường gọi trước mở lại. |
| CRM merge/cleanup, script quét phone, worker khác | Không coi manifest gốc là inventory toàn hệ thống. Rà mã/bản triển khai, thêm bảng không có FK khi phát hiện và kiểm migration/hash lại. |

## Trình tự dự kiến trong gói phát hành

Lập inventory process/queue, kiểm sao lưu/khôi phục và kênh giữ sự kiện trong lúc bảo trì → Founder duyệt phạm vi ảnh hưởng/cửa sổ → dừng nhận việc mới và batch có bằng chứng → bật hold và xác nhận commit → dừng/chờ mọi process thế hệ cũ, đối chiếu tác động ngoài DB → snapshot/đối soát có kiểm quyền và lịch sử → triển khai đường mới/enrollment được nghiệm thu → operator tắt hold theo revision/hash và hồ sơ drain → nghiệm thu đúng bản triển khai.

Các bước trên là điều kiện vận hành cần thực hiện sau duyệt; chưa có bước thật nào được chạy. Receipt/webhook và hàng chờ private không nằm hết trong manifest, vì vậy phải chứng minh không mất sự kiện trong cửa sổ bảo trì trước phát hành. Không bật hold khi chưa có phương án này.

## Kiểm thử và hoàn tác

13 ca PostgreSQL mới nối cuối suite intake: migration lặp; quyền private; mọi DML/TRUNCATE trên từng bảng; hai thứ tự cạnh tranh qua connection thật và quan sát Lock; timeout/rollback; snapshot cũ/replica và isolation khi inactive; cascade/set-null từ parent ngoài manifest sang bảng con khác schema; idempotency/revision/audit; đổi manifest; UNKNOWN giữ claim. Bảng nghiệp vụ đã có dùng fixture intake thực; một số bảng nhánh phụ chỉ cần khóa chính vì guard không đọc cột nghiệp vụ. Không coi đó là kiểm toàn bộ nghiệp vụ assignments hoặc schema production.

[Automation37178090976](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37178090976): 10/10 SUCCESS. [Intake111364839406](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37178090976/job/111364839406): 348/0/0, đủ 13 ca mới 335–347. Node22 job111364839436: 843+26+359=1228/0/0; frontend111364839245 SUCCESS. [Report37178090944](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37178090944) và [Messenger37178090940](https://github.com/backen-pixel/Quanlycongviec/actions/runs/37178090940) SUCCESS.

CI merge `9f4ee09c0f1eae6e0aba00d22494c5217c4121c7` được đối chiếu Git API đúng tree của bản kiểm, parents base `e16c885ae7c2305645be02a1227bf378cb59137f` và `9ecbec45750c15cdfbf20bdbb60b181bc5f24bcc`. Node syntax/diff được kiểm cục bộ; PostgreSQL thực chạy trên CI cô lập, không phải máy local. Không có thay đổi UI nên không dùng browser làm bằng chứng cho guard SQL.

CI đầu df51b95 cũng 348 PASS nhưng log cho thấy nhánh SET NULL bị câu CASCADE không khớp dòng chặn trước. Bản9ecbec4 chỉ sửa fixture, tách hai parent; log mới chứng minh cả DELETE CASCADE lẫn UPDATE SET null_id=NULL thực sự bị guard chặn, parent/child giữ nguyên. Không đổi hoặc nới SQL/assertion để lấy kết quả PASS.

Nếu bật hold lỗi, giao dịch/audit rollback; đọc trạng thái bằng request/revision trước thao tác tiếp. Nếu đã bật, không bỏ trigger/migration hay sửa state để mở lại; giữ audit, manifest và claim. Chỉ tắt qua lệnh operator sau hồ sơ drain/phương án khôi phục được duyệt. Hoàn tác ứng dụng không được khôi phục writer cũ khi chưa đối soát. Chưa có quyền vận hành thật từ việc hoàn thiện mã này.

Mục tiêu đầy đủ vẫn là Facebook → CRM → tư vấn/khảo sát → dashboard → Founder duyệt phát hành, rồi mở kênh tiếp. Mục tiêu 250.000đ/khách hợp lệ duy nhất chưa được chứng minh bằng dữ liệu thật.
