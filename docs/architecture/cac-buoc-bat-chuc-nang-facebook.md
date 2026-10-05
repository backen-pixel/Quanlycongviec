# Các bước bật từng chức năng Facebook

> Viết ngày 01/10/2026, Graph API v22.0. Code phía hệ thống đã sẵn sàng trước khi làm
> các bước này — bật tới đâu là có dữ liệu chảy về tới đó, không phải sửa thêm gì.

## Điều quan trọng nhất phải hiểu trước

Webhook Facebook có **hai tầng đăng ký**, phải bật cả hai mới có dữ liệu:

| Tầng | Ở đâu | Ai làm |
|---|---|---|
| **1. App đăng ký trường** | App Dashboard → Webhooks → đối tượng `Page` | Làm tay, một lần cho cả app |
| **2. Từng Page đăng ký app** | `/{page-id}/subscribed_apps` | **Tab Webhook trong CRM** làm hộ |

Bật tầng 1 mà quên tầng 2 là trạng thái phổ biến nhất: App Dashboard hiện xanh, nhưng
page vẫn không nhận gì. Tab Webhook mới đọc đúng tầng 2 nên sẽ lộ ngay.

---

## Bước 0 — Soi hiện trạng trước khi đụng vào gì

Vào **CRM → Facebook → tab Webhook** (chỉ quản trị thấy).

Bảng này hỏi thẳng Facebook, không đọc từ cơ sở dữ liệu của mình. Đọc theo thứ tự:

- Page nào báo **"token thiếu quyền"** → phải lấy token mới trước, các bước sau vô ích.
- Page nào **"Chưa có access token"** → vào tab Cài đặt dán token.
- Cột **7 ngày** bằng 0 trong khi nút hiện **Bật** → trường đã bật nhưng không có dữ
  liệu về. Thường là tầng 1 chưa đăng ký, hoặc page thật sự không có hoạt động đó.

Việc cần làm ngay ở bước này: **xem Phúc Đạt Kitchen**. Page đó nhận 6.964 gói — nhiều
nhất hệ thống — mà không có gói quảng cáo nào. Bảng sẽ cho biết là do thiếu
`messaging_referrals`, hay do page đó thật sự không chạy quảng cáo nhắn tin.

---

## Bước 1 — Xin quyền cho App

Vào **developers.facebook.com → App của anh → App Review → Permissions and Features**.

| Quyền | Để làm gì | Bắt buộc cho |
|---|---|---|
| `pages_messaging` | nhận và gửi tin nhắn | đang có |
| `pages_manage_metadata` | gọi `/subscribed_apps` | **nút Bật/Tắt trong tab Webhook** |
| `pages_read_engagement` | đọc bình luận | `feed` |
| `pages_manage_engagement` | trả lời / ẩn bình luận | `feed` |
| `leads_retrieval` | tải nội dung form | `leadgen` |

App đang ở chế độ Live thì mỗi quyền cần **Advanced Access**, không phải Standard
Access. Standard chỉ chạy được với tài khoản có vai trò trong app, nên sẽ "chạy được
khi test, không chạy khi thật" — rất dễ tưởng nhầm là lỗi code.

---

## Bước 2 — Lấy lại Page Access Token với quyền mới

Token cũ **không tự có quyền mới**. Cấp thêm quyền xong vẫn phải sinh lại token.

Khuyến nghị dùng **System User token** (giống cách làm cho Marketing API) vì nó không
hết hạn:

1. business.facebook.com → Cài đặt doanh nghiệp → Người dùng → Người dùng hệ thống.
2. Chọn System User → **Thêm tài sản** → tab **Trang** → tick các page → quyền
   **Quản lý Trang**.
3. **Tạo mã truy cập mới** → chọn app → tick đủ 5 quyền ở Bước 1 → tạo.
4. Lấy page token từ đó: `GET /me/accounts` bằng token vừa tạo, mỗi page có một
   `access_token` riêng.
5. Dán vào **CRM → Facebook → Cài đặt**, từng page một.

Làm ngoài giờ cao điểm: trong lúc đổi token có thể rơi vài tin nhắn.
`facebook_webhook_logs` vẫn ghi lại nên bù được sau.

---

## Bước 3 — Đăng ký trường ở tầng App

**App Dashboard → Products → Webhooks → chọn đối tượng `Page`.**

Callback URL và Verify Token lấy đúng cái đang chạy (xem `webhook_verify_token` trong
tab Cài đặt của từng page).

Tick các trường:

| Trường | Bật? | Lý do |
|---|---|---|
| `messages` | ✅ | xương sống |
| `messaging_postbacks` | ✅ | khách bấm nút |
| `messaging_referrals` | ✅ | **ad_id — tắt là mất cả trang Hiệu quả quảng cáo** |
| `message_reactions` | ✅ | đang về rồi, giờ đã có code lưu |
| `feed` | ✅ | bình luận |
| `leadgen` | ✅ | form Lead Ads |
| `message_deliveries` | ❌ | **không bật** — 0 giá trị, tăng gấp đôi lưu lượng |
| `message_echoes` | ❌ | không bật |

---

## Bước 4 — Bật cho từng Page ở tầng 2

Quay lại **CRM → Facebook → tab Webhook**, bấm nút ở từng ô.

Thứ tự an toàn: bắt đầu bằng page ít lưu lượng nhất (Metalla — 5 gói), xem dữ liệu về
đúng không, rồi mới mở các page đông.

Hệ thống luôn gửi lại **đủ** danh sách trường đang bật, nên tắt một trường không làm
rơi những trường khác. Đây là chỗ rất dễ sai nếu gọi API bằng tay: Facebook **ghi đè**
cả danh sách, gửi thiếu là tắt mất.

---

## Bước 5 — Kiểm chứng từng chức năng

**Bình luận (`feed`):** vào một bài trên page, tự bình luận một câu. Trong 1 phút:
tab Bình luận phải hiện nó, và admin đúng công ty phải nhận thông báo. Bình luận do
chính page viết giờ vẫn được lưu (để hiện đủ luồng) nhưng không bắn thông báo.

**Lead Ads (`leadgen`):** dùng **Lead Ads Testing Tool** của Meta
(developers.facebook.com/tools/lead-ads-testing), chọn page và form, bấm gửi lead thử.
Kiểm tra `facebook_lead_ads` có dòng mới, và lead sinh ra có **đúng số điện thoại** —
không phải chuỗi rỗng.

**Cảm xúc (`message_reactions`):** thả tim vào một tin nhắn trong hộp thư, kiểm tra
bảng `fb_message_reactions`.

**Nguồn quảng cáo:** không cần test, 4.892 gói đã về sẵn.

---

## Bước 6 — Khai bản đồ trường cho từng form Lead Ads

Mỗi form có bộ câu hỏi riêng do người chạy quảng cáo tự đặt. Hệ thống **đoán được**
các tên chuẩn (`full_name`, `phone_number`, `email`) và cả câu hỏi tiếng Việt có chứa
"số điện thoại", "họ tên", "email". Nhưng câu hỏi đặt lạ thì phải khai tay.

Sau lead thử đầu tiên, mở `facebook_lead_ads.field_data` xem tên câu hỏi thật, rồi
thêm một dòng vào `fb_lead_form_mapping`:

```sql
insert into fb_lead_form_mapping (form_id, page_id, form_name, truong) values (
  '<form_id>', '<page_id>', 'Form tủ bếp tháng 10',
  '{"ho_ten":"Họ và tên của bạn","sdt":"Số ĐT liên hệ","email":"Email"}'::jsonb
);
```

Câu hỏi nào không khai vẫn **không bị mất** — chúng tự động vào phần ghi chú của lead,
nên thông tin kiểu "sản phẩm quan tâm", "ngân sách", "khu vực" vẫn còn nguyên.

---

## Lỗi hay gặp

| Hiện tượng | Nguyên nhân |
|---|---|
| Tab Webhook báo `(#200)` | Token thiếu `pages_manage_metadata` |
| Bật xanh nhưng cột 7 ngày = 0 | Tầng 1 (App Dashboard) chưa tick trường đó |
| Lead Ads về nhưng tên rỗng | Form dùng `first_name`/`last_name`, đã sửa ở bản này |
| Lead Ads báo `(#100) leadgen_id` | Thiếu `leads_retrieval`, hoặc chỉ có Standard Access |
| Bình luận không về | Tick `feed` chứ không phải `feed_comments` — Facebook gộp vào `feed` |
| Đổi token xong mất tin nhắn vài phút | Bình thường; bù từ `facebook_webhook_logs` |
