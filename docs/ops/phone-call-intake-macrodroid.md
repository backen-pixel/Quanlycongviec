# Ghi cuộc gọi đến từ điện thoại Android (MacroDroid) vào CRM

Điện thoại bán hàng (Android) dùng app **MacroDroid** báo mỗi cuộc gọi đến từ **số chưa lưu danh bạ** về CRM.
CRM ghi nhật ký cuộc gọi, gắn vào lead/deal/khách hàng sẵn có, hoặc tạo lead mới.

## Điều kiện trước khi bật

1. Đã chạy migration `database/720_phone_call_intake.sql` (thêm `crm_call_logs.company_id`).
   Chưa chạy thì endpoint trả 503 và không ghi gì.
2. Có một API key (Cài đặt → API ngoài) **gắn công ty**; nên đặt sẵn pipeline, khu vực, người phụ trách mặc định,
   vì lead mới tạo theo đúng mặc định của key (giống `POST /api/external/leads`).

## Endpoint

```
POST https://<domain CRM>/api/external/phone-calls
Header: X-Api-Key: <API key>
Content-Type: application/json
Body: {"phone":"{call_number}"}
```

- `phone` (bắt buộc): số gọi đến đúng như MacroDroid đưa ra (`+84908…`, `0908 309 222`, …). CRM tự chuẩn hóa về dạng `0xxxxxxxxx`.
- `at` (không bắt buộc): thời điểm cuộc gọi, ISO hoặc unix (giây/mili giây). Không gửi thì lấy giờ máy chủ.
- Mọi trường khác bị bỏ qua. **Không gửi và CRM không lưu tên danh bạ.**

## Kết quả trả về (luôn nhanh, MacroDroid không cần thử lại khi nhận 200)

| Trường hợp | Phản hồi |
|---|---|
| Số ẩn / không hợp lệ | `200 {"ok":true,"skipped":"invalid_phone"}` |
| Cùng số đã báo trong 30 phút | `200 {"ok":true,"duplicate":true}` — không ghi thêm |
| Số đã thuộc lead/deal/khách của công ty | `200 {"ok":true,"lead_id":"…","created":false,"matched":true}` — chỉ ghi nhật ký, không tạo lead |
| Số mới | `200 {"ok":true,"lead_id":"…","created":true,"matched":false}` — tạo lead «Cuộc gọi đến — 0908…», nguồn «Cuộc gọi đến điện thoại» |
| Thiếu / sai API key | `401` |
| Quá 30 lần/phút | `429` |
| Không tạo được lead (VD công ty chưa có pipeline) | `4xx/502 {"ok":false,"error":"…"}` — chưa ghi nhật ký, có thể gửi lại |

Nhật ký nằm ở `crm_call_logs` với `provider='android_phone'`, `direction='inbound'`, `status='incoming'`.

## Đoán nguồn quảng cáo

Nếu trong **10 phút trước** cuộc gọi có lượt bấm nút gọi trên website (bảng `web_conversion_events`, kind `call`)
của cùng công ty, lead mới nhận nguồn của lượt bấm gần nhất (kênh `website`, platform, UTM, gclid/fbclid, chiến dịch,
landing page) và mô tả ghi «Đoán nguồn theo lượt bấm gọi trên web lúc HH:MM». Đây là **đoán theo thời gian**, không
chắc chắn cùng một người. Không có lượt bấm thì lead không có attribution (danh sách kênh hiện chưa có giá trị «điện thoại»).

## Cấu hình MacroDroid

1. Trigger: **Call Incoming** → chọn *Không có trong danh bạ* (Non-contact).
2. Action: **HTTP Request**
   - Method: `POST`, URL như trên.
   - Header: `X-Api-Key` = API key.
   - Content type: `application/json`; Body: `{"phone":"{call_number}"}`.
   - Timeout ~10 giây; không cần lặp lại khi lỗi mạng (cuộc sau sẽ ghi lại).
3. Thử bằng một số lạ gọi vào, kiểm tra lead mới trong CRM.

Giữ API key trong MacroDroid, không gửi qua chat. Thu hồi key nếu mất máy.
