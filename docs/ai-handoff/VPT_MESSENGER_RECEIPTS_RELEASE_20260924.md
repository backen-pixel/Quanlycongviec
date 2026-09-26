# VPT Messenger — receipt bền vững và phạm vi phát hành

**Bản ngày 24/09 được giữ làm lịch sử. Hướng dẫn hiện hành, migration 639 và kết quả review nằm tại [VPT_MESSENGER_REVIEW_20260926.md](./VPT_MESSENGER_REVIEW_20260926.md).**

Ngày: 24/09/2026. Nhánh: `codex/vpt-messenger-attribution-20260924`.

## Kết quả đã chuẩn bị

- Migration 637 lưu từng sự kiện Messenger, khóa chống trùng, lease có thời hạn, thử lại có giãn cách và trạng thái lỗi sau 8 lần. Chỉ `service_role` được đọc/ghi/gọi RPC.
- Webhook của Page được cấu hình chỉ trả HTTP 200 sau khi ghi receipt thành công. Sai chữ ký trả 401; DB lỗi hoặc thiếu chữ ký khi bật durable trả 503 để Meta gửi lại.
- Worker đọc receipt từ DB sau restart, gia hạn lease và xử lý theo hội thoại. Chỉ đọc các Page trong allowlist.
- SĐT trích trực tiếp từ tin vào và thời điểm Facebook được lưu cùng tin nhắn. Replay sửa phone/time và liên kết lead đã có; không lặp tạo customer, lead hoặc tự trả lời.
- Receipt `done` chỉ xác nhận phần nhận sự kiện/attribution đã xử lý. **Không chứng minh mọi tác vụ CRM đã hoàn tất.** Luồng tạo lead cũ chưa có giao dịch/idempotency xuyên suốt.
- Migration 638 thêm metadata nguồn của ba quảng cáo trong chiến dịch thử `120251591865910435`. Quảng cáo chạy thử dự kiến là A2 `120251592173560435` và B `120251591919430435`; mẫu đối chứng ban đầu `120251591884610435` vẫn tắt. Migration không bật quảng cáo hay thêm vào danh sách tự động dừng.

## Cấu hình khi thử trên staging

1. Đối chiếu schema hiện tại; chạy migration 591, 636, 637, 638 theo thứ tự nếu chưa áp dụng. Không chạy lại mù quáng các migration lịch sử khác.
2. Deploy branch vào staging. Cấu hình `FB_APP_SECRET` qua hệ thống bí mật, không ghi vào repo.
3. Bật `FB_MESSENGER_DURABLE_DELIVERY=1`; đặt `FB_MESSENGER_DURABLE_PAGE_IDS=409741855550833`. Mặc định tắt; danh sách rỗng không mở toàn hệ thống.
4. Kiểm thử DB lỗi trước ACK, gửi trùng, restart giữa lần nhận và xử lý, lease hết hạn, nhiều kết nối đồng thời và sự kiện đến trễ.
5. Sau staging mới phát hành có kiểm soát. Subscribe `messaging_referrals`, dùng tài khoản Messenger thử được phép bấm từ quảng cáo và gửi SĐT, xác minh campaign + giờ VN, loại trừ đúng tin thử khỏi báo cáo.

**Lịch dừng 50.000đ và mở lại 00:00 vẫn OFF.** API có các blocker `crm_linkage_not_retry_safe` và `messenger_live_e2e_not_verified`; hàng đợi chưa xử lý/lỗi cũng chặn. Không đổi hai cờ này chỉ để báo sẵn sàng.

## KPI sử dụng

| KPI | Nguồn và giới hạn hiện tại |
|---|---|
| Liên hệ đã gửi SĐT theo campaign/ngày | `facebook_messages.detected_phone` + `facebook_occurred_at` + referral cùng Page, cùng ngày VN, trước tin SĐT. Là số được phát hiện, chưa bảo đảm gọi được. |
| Khách đủ nhu cầu | Nhân viên xác minh nhu cầu làm tủ, khu vực, thời điểm, ngân sách rồi cập nhật CRM. Chưa có mapping trạng thái đã kiểm chứng trực tiếp, không tự suy từ có SĐT. |
| Lịch khảo sát | Cần đối chiếu trường/lịch CRM đang dùng và ánh xạ lead về campaign; chưa phát hành báo cáo tự động. |
| Đơn hàng | Dùng trạng thái thắng/đơn hàng thật của CRM; không suy từ số tin nhắn. Chưa xác minh mapping live. |

Không coi lỗi DB, dữ liệu trống hoặc tracking chưa đủ là 0 khách. Chưa có SLA đảm bảo toàn bộ webhook đã đến từ Meta; receipt health chỉ phản ánh sự kiện hệ thống đã nhận.

## Kiểm thử có thể chạy lại

```bash
node backend/tests/facebook-messenger-receipts.test.js
node backend/tests/facebook-messenger-campaign-attribution.test.js
node backend/tests/facebook-lead-chat-scope.test.js
```

SQL được thực thi trên PostgreSQL 17.5 độc lập qua PGlite 0.3.14: 39 assertion về quyền, trùng lặp, thứ tự hội thoại, Page scope, lease/reclaim/backoff và migration chạy hai lần. Chạy lại bằng package PGlite cài trong thư mục thử riêng:

```bash
PGLITE_TEST_MODULE=/path/to/test/node_modules/@electric-sql/pglite node backend/tests/facebook-messenger-receipts-sql.test.mjs
```

Chưa kiểm thử trên DB staging/production hoặc nhiều kết nối thật. Không dùng chứng cứ PGlite để kết luận production đã sẵn sàng.

## Hoàn tác và xử lý lỗi

- Tắt `FB_MESSENGER_DURABLE_DELIVERY` rồi deploy lại bản đã xác minh nếu cần; lưu lại receipt chưa hoàn tất để điều tra, không xóa migration/table ngay.
- Payload của receipt thành công bị xóa ngay; khóa chống trùng được giữ. Receipt lỗi giữ payload để phục hồi, chỉ service role truy cập. Sau xử lý sự cố, vận hành cần xóa payload lỗi không còn cần thiết theo thời hạn lưu dữ liệu đã duyệt; chưa có tác vụ cleanup tự động.
- Trước khi bật lịch Ads cần hoàn thiện giao dịch tạo/liên kết CRM hoặc cơ chế đối soát không sinh lead trùng, kiểm thử đầu-cuối thật và kiểm tra trạng thái phân phối trực tiếp từ Meta.
