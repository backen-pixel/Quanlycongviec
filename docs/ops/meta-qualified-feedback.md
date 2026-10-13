# Facebook VPT: xác minh CRM và phản hồi Meta

## Phạm vi và trạng thái ngày 13/10/2026

Luồng riêng cho công ty VPT `991dc79d-cbf5-49f9-a364-35227cb47635`, VPT01 `act_835757498658305`, Page Bếp Vạn Phú Thành `409741855550833`. Đã đối chiếu chỉ đọc trên CRM đang chạy: Page đúng công ty, tự tạo lead bật; tài khoản đúng công ty và bật đồng bộ; ba quảng cáo có đầy đủ Page/công ty từ Marketing API. Quảng cáo thiếu liên kết hoặc tài khoản khác bị loại. Tập dữ liệu Meta hiện có `crm` `1575398160676100` thuộc business VPT `815284983995477`, chia sẻ cho VPT01; hướng dẫn tích hợp của Meta hiển thị Graph `v26.0`.

**Mã đã chuẩn bị và kiểm cục bộ; chưa merge/deploy, chưa áp migration trên DB thật, chưa tạo/lưu token CAPI, chưa gửi sự kiện Meta.** Chưa có qualification event của VPT trong DB tại thời điểm đọc; hai receipt Form không tự chứng minh lead hợp lệ. Chưa có kết quả CPL hoặc nghiệm thu thực tế.

Google PR [#124](https://github.com/backen-pixel/Quanlycongviec/pull/124) đã merge và deploy cả backend/frontend tại SHA `3c6761731b0e4a6e248a81e1484d101c3b82e049`. Hành động `VPT CRM - Lead hop le da xac minh` ID `7842337600` đã lưu: Qualified lead, Secondary, One, không giá trị, cửa sổ click 90 ngày. HTTPS đã xác thực nhưng Data Manager chưa đọc được schema do CSV chưa có dòng thật hợp lệ; nguồn/lịch nhập chưa hoàn tất. Người dùng xác nhận chưa có lead Google thật đã xác minh. Facebook không dùng nguồn CSV Google này.

## Quy tắc đo

- Xác minh thủ công hiện hành phải có actor, mã bằng chứng cuộc gọi/tin nhắn, ba điều kiện true: liên hệ dùng được, nhu cầu phù hợp, địa bàn phục vụ. Context v2 phải khớp hồ sơ hiện tại; tiến độ bán hàng không thay thế xác minh.
- Form phải có receipt gốc bất biến, đối chiếu lead/customer/contact/attribution/inbox/provider; Meta Lead ID, Page và Form đúng nhau; `is_organic=false`, quảng cáo thuộc VPT01 được đồng bộ qua Marketing API. Không suy nguồn trả phí từ tên khách hoặc nhãn Facebook.
- Khử trùng theo lịch sử Lead/Deal VPT, customer master dùng chung và điện thoại chuẩn hóa, kể cả `0084`. Customer master phải được tạo từ lần tiếp nhận gốc đến lần lưu lead. Thiếu hoặc mâu thuẫn danh tính/lịch sử giữ lại để đối soát. Không chứng minh khách mới ngoài CRM.
- Messenger có thể đối soát trong CRM nếu receipt gốc chứng minh ADS, Page, PSID, ad và thời điểm. **Luồng này giữ Messenger chờ, không gửi PSID như Lead ID và chưa thiết lập tối ưu lead hợp lệ cho Messenger.**
- Dữ liệu thiếu, lỗi DB, đếm không đầy đủ, vượt giới hạn, backup/failover không an toàn đều chặn kết quả hoặc chặn gửi; không thay lỗi bằng số 0.

## Phản hồi Meta

Instant Form dùng sự kiện `initial_lead` lúc tiếp nhận thật và `qualified_lead` lúc xác minh thật, `action_source=system_generated`, `custom_data.event_source=crm`, `lead_event_source=VPT CRM`, `user_data.lead_id` là chuỗi Meta Lead ID gốc. Không gửi tên, email, số điện thoại, PSID, IP hoặc nội dung trao đổi. Thời gian thật tối đa bảy ngày; không dời thời gian cũ về hiện tại.

Migration mới `database/20261013143556_meta_qualified_feedback.sql` thêm outbox và nhật ký thử gửi. RLS không cấp quyền anon/authenticated; RPC chỉ service_role, không SECURITY DEFINER. Mã khử trùng ổn định theo danh tính/sự kiện/tập dữ liệu/chế độ, không đổi sau xác minh lại. Test/production có ledger riêng. Trước HTTP: đọc lại nguồn, kiểm cấu hình/primary, rồi kiểm lease và qualification/receipt bằng SQL. Các lần đọc không tạo giao dịch nguyên tử với API Meta; vẫn có khoảng đua sau lần kiểm cuối.

Chỉ ghi `accepted` khi Meta trả `events_received=1` và trace ID hợp lệ. Lỗi mạng hoặc kết quả mơ hồ là `unknown`; lease hết hạn không tự quay lại pending. Sự kiện đã thử gửi không được tự gửi lại sau 48 giờ chỉ vì hạn dedup phía Meta. Thu hồi xác minh chặn lần chưa gửi; lần đã accepted giữ lịch sử và yêu cầu đối soát, **không tự xóa/retract Meta**. Lịch sử accepted không bị coi là thu hồi chỉ vì vượt cửa sổ bảy/60 ngày hoặc tạm dừng đồng bộ.

Khi có UNKNOWN, lease gửi hết hạn hoặc accepted cần đối soát, chặn toàn bộ lượt gửi tiếp theo trong đúng company/dataset/account/Page/mode. Chốt này ngăn đổi điện thoại/gộp hồ sơ làm đổi identity key rồi gửi lại cùng người dưới khóa mới. SQL claim/preflight và sender đều kiểm chốt; không có nút tự bỏ chốt. Người vận hành phải kiểm lịch sử Meta và danh tính khách, xác nhận bằng chứng trước khi xử lý trạng thái qua dịch vụ; không đổi UNKNOWN thành accepted chỉ để mở luồng.

## Cấu hình và triển khai

Giữ sender tắt cho tới khi duyệt mã, migration, quyền gửi và mã CAPI riêng. Không dùng lại token đọc quảng cáo/Page. Bí mật chỉ lưu backend Render; không chat, Git, URL hoặc frontend.

```text
VPT_META_FEEDBACK_ENABLED=0
VPT_META_FEEDBACK_CONSENT=1
VPT_META_FEEDBACK_MODE=test
VPT_META_FEEDBACK_COMPANY_ID=991dc79d-cbf5-49f9-a364-35227cb47635
VPT_META_FEEDBACK_AD_ACCOUNT_ID=act_835757498658305
VPT_META_FEEDBACK_PAGE_ID=409741855550833
VPT_META_FEEDBACK_DATASET_ID=1575398160676100
VPT_META_FEEDBACK_GRAPH_VERSION=v26.0
VPT_META_FEEDBACK_TOKEN=<mã riêng, không ghi vào tài liệu>
VPT_META_FEEDBACK_TEST_EVENT_CODE=<mã từ Meta Test Events>
```

1. Sau duyệt, áp migration vào primary `kdxypztstbeovyedmvem`; kiểm quyền, RPC và schema cache. Chưa bật gửi khi failover sang DB thiếu ledger. Không áp thêm bản khác vào backup rồi cho hai worker gửi song song.
2. Merge/deploy mã backend/frontend trên Render My Workspace; cấu hình target nhưng sender vẫn tắt. GET `/api/meta-feedback/preview` yêu cầu admin thuộc VPT/tenant, trả counters/hold reason và lịch sử che Meta Lead ID. POST `/run` chỉ nhận limit 1–20, không nhận target từ client. Worker chạy mỗi năm phút khi được bật; không thêm dịch vụ Render tính phí.
3. Tạo/lưu mã CAPI cho tập dữ liệu CRM sau xác nhận quyền. Ưu tiên chế độ không mở rộng quyền Dataset Quality API ngoài nhu cầu.
4. Dùng lead Form thật đã kiểm để kiểm thử Meta Test Events. Không tạo dòng qualified giả; sự kiện thử nghiệm chỉ chứng minh giao tiếp. Khi chuyển production phải bỏ test code và đối soát ledger riêng, không tính test vào kết quả thật.
5. Chỉ chọn sự kiện qualified và cấu hình phễu/tối ưu trên Meta sau dữ liệu thật, Diagnostics và điều kiện tài khoản được kiểm. Việc này chưa đổi chiến dịch/ngân sách hay cam kết tối ưu.

## Kiểm tra và nghiệm thu

Đã PASS 132 test nguồn/export/qualification/router/service, 20 kiểm thử SQL thật với PGlite, Vite production build. PGlite 0.5.9 chạy PostgreSQL 18.6; baseline bỏ riêng catalog-count assertion cũ dành PG17, SQL mới chạy nguyên bản. Claim được khóa theo target bằng advisory transaction lock và chặn lease mới khi còn processing; kiểm cục bộ dùng một phiên DB, chưa mô phỏng tranh chấp nhiều phiên. DB primary hiện PG17.6 đã đối chiếu các cột; kiểm cục bộ chưa thay thế áp/kiểm DB thật. Cảnh báo Vite externalization/chunk lớn là baseline.

Nghiệm thu cần: lưu CRM sau submit; nguồn trả phí đúng; khách mới/khử trùng và bằng chứng xác minh; ACK Meta và attribution kiểm riêng; chi đúng kỳ/cùng phạm vi và thuế/phí. Meta accepted là số sự kiện, gồm cả tiếp nhận ban đầu, không phải số khách hợp lệ. Mẫu số khách hợp lệ và CPL vẫn cần đối soát. Chưa kết luận ≤250.000đ/khách; 130 triệu so với trần thử 100 triệu chưa rõ.

Rollback: đặt `VPT_META_FEEDBACK_ENABLED=0` và redeploy/restart, kiểm không phát HTTP mới; revert mã nếu cần. Giữ outbox/attempts để điều tra và ngăn gửi trùng, không drop/xóa ledger. Dừng sender không xóa sự kiện Meta đã nhận; xử lý sự kiện sai với Meta riêng.

## Tài liệu chính thức đã đối chiếu

- [CRM integration](https://developers.facebook.com/docs/marketing-api/conversions-api/conversion-leads-integration/crm-integration/3-implementing-the-crm-integration)
- [CRM platform guide](https://developers.facebook.com/docs/marketing-api/conversions-api/guides/conversions-api-crm-for-platforms)
- [Meta sample CRM events](https://github.com/fbsamples/lead-ads-webhook-sample/blob/main/postman/FB%20Lead%20Ads%20%28Part%202%20-%20CRM%20Events%29.postman_collection.json)
- [Business messaging parameters](https://developers.facebook.com/docs/marketing-api/conversions-api/business-messaging)
