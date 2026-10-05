# H1 — Tiếp nhận Facebook Page bền vững, gói tách từ main

## Phạm vi và quyết định

Founder: “em làm tiếp đi nhé anh quyết định phát hành.” Codex tiếp tục triển khai và chuẩn bị bằng chứng; quyết định phát hành thuộc Founder. Gói này tách từ main `1f879ea85dfff23629fef79c8d15f2eaf540328e`, nhánh `codex/facebook-durable-inbox-20261006`. Không merge cả PR22/25; không sửa việc đóng quyền anon do Claude phụ trách; không thay kiến trúc Domain/Application Service.

**Đây là hạ tầng nhận sự kiện, chưa hoàn tất nghiệp vụ tự tạo Lead.** `200` có nghĩa cả lô sự kiện đã được ghi bền vững, không có nghĩa khách đã vào CRM hoặc đạt tiêu chí khách hợp lệ. Không tính số dòng inbox vào KPI 250.000 đồng/Lead.

Trạng thái ban đầu: mã và kiểm thử được chuẩn bị; PostgreSQL CI và review độc lập còn chờ kết quả ghi ở phần Bằng chứng. **Triển khai/áp SQL/bật nhận và xử lý dữ liệu thật: HOLD.** Không thay quảng cáo, ngân sách, liên hệ khách hoặc lịch CRM.

## Thay đổi

- Khi bật `VPT_FB_PAGE_INBOX=1`, webhook xác minh HMAC-SHA256 trên đúng bytes JSON nhận được bằng `VPT_FACEBOOK_APP_SECRET`. Toàn bộ sự kiện Page được ghi trong một giao dịch trước ACK. Page chưa có cấu hình và loại sự kiện chưa hỗ trợ vẫn được giữ. Chữ ký sai →403; lô sai/giới hạn vượt →400; DB/RPC/Primary chưa sẵn sàng →503, không fallback chạy legacy rồi ACK.
- SQL701 tạo `facebook_page_inbox` và năm RPC enqueue/claim/renew/finish/health. Chống trùng bằng băm nội dung đã chuẩn hóa theo Page; không lấy timestamp của envelope làm khóa cho sự kiện đã biết. Batch tối đa100, body tối đa2MB. Khóa trùng có nội dung khác bị từ chối; không ghi đè bằng chứng.
- Một lease còn hiệu lực trên mỗi Page, thứ tự theo hàng đợi, lease120 giây và gia hạn30 giây; hoàn tất phải khớp token và chưa hết hạn. Lỗi trả pending với backoff tối đa5 phút, không tự bỏ sau số lần thử. Page lỗi giữ các sự kiện phía sau; Page khác vẫn có thể xử lý. Đây là lựa chọn bảo toàn thứ tự, cần vận hành xử lý backlog.
- `withPrimaryDatabase` giữ mọi truy vấn của receiver/processor tại Primary, kể cả query được tạo trước. Đổi target/auto-failover bật làm lệnh tiếp theo thất bại; không gửi lệnh này sang Backup. Yêu cầu đang gửi tới Primary có thể đã commit dù client gặp lỗi: retry dựa vào định danh bền vững.
- Queue Messenger cũ phải trống trước khi worker mới claim. Không đẩy cùng một sự kiện mới vào hai queue. Cần diễn tập dừng toàn bộ phiên cũ trước chuyển đổi; kiểm tra queue trống không chứng minh không còn process cũ đang chạy ở nơi khác.
- Worker mặc định dừng; `VPT_FB_PAGE_INBOX_WORKER_PAUSED=0` mới cho claim. Shutdown ngừng claim, đợi công việc đang chạy tối đa15 giây ở server; lease bị ngắt được nhận lại sau khi hết hạn. Health mỗi phút ghi các số đếm không chứa payload/điện thoại; pending≥100 hoặc tuổi pending≥300 giây phát mã `FB_INBOX_BACKLOG` trong log. **Chưa phải thông báo gửi đến người trực**; cấu hình cảnh báo Render/người nhận phải nằm trong nghiệm thu triển khai.
- `VPT_FB_LEGACY_SCOPE_GUARD` mặc định tắt; `VPT_FB_MANAGED_PAGE_IDS` mặc định rỗng. Với Page được cấu hình quản lý mới, worker yêu cầu scope guard và hợp đồng `crm_care_legacy_write_check` hợp lệ; RPC thiếu, scope không rõ hoặc thuộc consumer mới →pending. Không mang toàn bộ C vào gói này. Guard ở đây chỉ bảo vệ dispatch webhook, không chứng nhận mọi đường ghi legacy trong hệ thống; C còn cần H2 và rà những điểm ghi khác.
- SQL701 không mở quyền PUBLIC/anon/authenticated, service_role có SELECT/INSERT/UPDATE và EXECUTE cần thiết; không cấp DELETE. Không thay cấu hình hay dữ liệu nghiệp vụ hiện có khi áp schema.

## Phần xử lý được giữ chờ có chủ đích

Chế độ Messenger cũ `durable=true` giữ hành vi hiện tại. Chế độ mới dùng giá trị riêng `page-inbox`, không tự gửi trả lời hoặc thông báo khách. Strict read phân biệt “không có dữ liệu” với DB bị lỗi; không dùng lỗi đọc cấu hình/blocklist làm lý do mở quyền.

| Sự kiện mới | Giới hạn của gói H1 |
|---|---|
| Messenger message/echo | Lưu bản tin có MID; giữ pending trước cập nhật preview/unread và tạo/cập nhật Lead, chờ hợp đồng atomic projection. Không DONE vì bản tin đã tồn tại. |
| Messenger read | Giữ pending trước thay đổi unread; chưa có xử lý watermark an toàn khi phát lại. |
| Postback/delivery/loại chưa biết | Giữ pending với lý do; không bỏ qua rồi DONE. |
| Reaction | Chỉ trường hợp có đủ định danh/hành động được chứng nhận mới ghi; trường hợp thiếu dữ kiện giữ pending. |
| Lead Ads | Lưu snapshot nguồn, phát lại không gọi lại Graph khi snapshot đã lưu. Khách cần tạo Lead/ghi attribution giữ pending; không tự dùng helper cũ chưa an toàn. Link Lead có sẵn phải đúng công ty của Page. |
| Comment add | Lưu comment theo định danh, thử lại không tạo trùng; không gửi notification. Edit/remove giữ pending chờ hợp đồng thứ tự. |

Vì các giới hạn này, **không bật worker/receiver trên Page nhận khách thật với kỳ vọng thay toàn bộ đường cũ**. Receiver mới là cutover toàn endpoint; bật mà processor còn chờ sẽ làm khách chưa được xử lý tiếp. Cần hoàn thiện các hợp đồng pending hoặc lập thử nghiệm cô lập trước khi xin quyết định bật cho Page kinh doanh.

## Bằng chứng

- Kiểm thử Node synthetic: chữ ký/raw bytes, ACK sau commit, enqueue lỗi, scope, paused worker, lease mất, dừng/khởi động, backlog, định danh/trùng/DB lỗi, không gửi tự động và tương thích boolean durable cũ. Không bootstrap ứng dụng, không đọc `.env`, không gọi khách/Meta/DB thật.
- Kiểm thử Primary dùng VM với module thật và AsyncLocalStorage thật, transport giả: thử lại, đổi DB trước/trong fetch, client Backup lưu từ trước, isolation với luồng legacy.
- PostgreSQL17 CI: fresh localhost `vpt_page_inbox_ci`, role giả, SQL700→701→701, ACL/RLS, concurrency theo Page, lỗi giữa chừng, expired/stale token, retry/backoff, batch conflict/rollback, timeout và logical dump/restore vào DB mới. Đây là phục hồi **fixture inbox cô lập**, không phải chứng nhận phục hồi hai DB production.
- Kết quả theo commit/CI và kết luận reviewer sẽ được bổ sung sau khi chạy xong. Không dùng kết quả của PR25 thay cho gói này.

## Điều kiện trước khi phát hành hoặc bật vận hành

1. Node18/22, PostgreSQL17 và review độc lập đạt trên đúng phiên bản; xử lý mọi finding chặn. Xác nhận bản main đích không xung đột thay đổi đang do Claude thực hiện.
2. Thử schema701, raw signature, Page routing, ngắt mạng, restart, backlog và rollback trên môi trường cô lập phù hợp. Có bằng chứng backup/restore đúng target. Xác minh unique keys các bảng raw/contact/message/comment mà handler dựa vào; fixture không thay kiểm schema thực.
3. Hoàn thiện hợp đồng projection/Lead/attribution cần cho Page được chọn; H2/scope đầy đủ nếu mở C. Chốt người nhận backlog, hạn xử lý và Page/app secret đúng; không lưu secret trong hồ sơ.
4. Founder duyệt cụ thể commit, schema, môi trường, flags và phạm vi tác động. Main đang tự deploy Render; merge không phải thao tác chỉ lưu tài liệu.

## Dừng và khôi phục

- Trước activation: giữ `VPT_FB_PAGE_INBOX` tắt, worker paused. Revert mã gói không xóa schema/bằng chứng đã lưu.
- Khi đã có sự kiện trong inbox: đặt worker paused, giữ receiver để lưu thêm nếu DB khỏe; điều tra qua số đếm/mã lỗi. Không xóa event hoặc chỉnh tay `done` để làm sạch báo cáo. DB unavailable phải trả503 cho nhà cung cấp thử lại.
- **Không đơn giản tắt receiver về legacy khi queue còn việc**: có thể tạo hai đường ghi và sai thứ tự. Phải dừng các consumer, chụp bằng chứng, đối soát/replay qua một đường được duyệt, xác nhận queue đã xử lý và không còn process cũ trước khi chuyển. Không thu hồi SQL700, không mở lại anon.
- Lease bảo vệ quyền hoàn tất queue; không biến mọi helper nghiệp vụ nhiều bước thành giao dịch đúng một lần. Các nhánh chưa có hợp đồng được giữ pending chính vì giới hạn này.
