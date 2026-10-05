# Kế hoạch hoàn thiện kết nối Facebook và đẩy ngược dữ liệu về Meta

> Viết ngày 01/10/2026. Mọi con số dưới đây đo từ dữ liệu thật trong `kdxypztstbeovyedmvem`,
> không phải ước lượng.

## 0. Sự thật đo được trước khi lập kế hoạch

**Webhook đang nhận gì** (23.191 gói, 16/09 → 01/10):

| Loại | Số gói | Tình trạng code |
|---|---|---|
| Tin nhắn (text/ảnh/video/file/audio/sticker) | 1.264 gói có đính kèm | Đủ |
| Referral quảng cáo | 4.892 | Đủ, từ 29/09 |
| Đã đọc | 3.960 | Chỉ xoá số chưa đọc |
| Thả cảm xúc | 54 | **Về rồi vứt** |
| Bình luận | 2 | Có code, `feed` chưa subscribe |
| Lead Ads | 0 | Có code, `leadgen` chưa subscribe |

**8/12 page có lưu lượng**, 4 page im lặng hoàn toàn:

| Page | Gói webhook | Gói có quảng cáo |
|---|---|---|
| Phúc Đạt Kitchen | 6.964 | **0** |
| Thi Công Tủ Bếp TP.HCM | 3.918 | 1.266 |
| Tủ bếp nhôm cao cấp Phúc Đạt | 3.606 | 978 |
| NextGo | 2.863 | 714 |
| Bếp Vạn Phú Thành | 2.528 | 1.032 |
| Nhà thầu nhôm kính Phúc Đạt | 228 | 0 |
| Bếp Hợp Kim Phúc Đạt | 28 | 0 |
| Nhà máy Tủ bếp Inox Metalla | 5 | 0 |

Phúc Đạt Kitchen là page đông nhất nhưng **không có gói quảng cáo nào** — hoặc page này
không chạy quảng cáo nhắn tin, hoặc quảng cáo của nó trỏ sang page khác. Cần xác minh,
vì 6.964 gói là khối lượng lớn nhất hệ thống.

**Chất lượng dữ liệu lead từ quảng cáo** (288 lead):

- 288/288 có số điện thoại — **100%**
- 1/288 có email
- 19 đơn đã chốt, 19/19 có số điện thoại
- **1/19 đơn có giá trị tiền** — 18 đơn còn lại để `estimated_value = 0`

Hai con số cuối quyết định toàn bộ Giai đoạn 5 bên dưới.

---

## Giai đoạn 1 — Nắm quyền điều khiển webhook (ưu tiên cao nhất)

Hiện không ai biết chắc page nào đang subscribe trường nào, vì việc đó làm tay trong
App Dashboard và hệ thống không đọc lại. Phải sửa chỗ này trước, nếu không mọi giai đoạn
sau đều mò mẫm.

**1.1 Đọc trạng thái thật** — route mới `GET /api/facebook/pages/:pageId/webhook-fields`,
gọi `GET /{page-id}/subscribed_apps?fields=subscribed_fields` bằng chính page token đã lưu.

**1.2 Bật / tắt trường** — route `POST /api/facebook/pages/:pageId/webhook-fields`,
gọi `POST /{page-id}/subscribed_apps` với danh sách `subscribed_fields`.

**1.3 Bảng điều khiển** — trên trang FB CRM, một bảng 12 page × các trường, mỗi ô là
một dấu tích bật/tắt, kèm cột "gói nhận được 7 ngày qua" lấy từ `facebook_webhook_logs`
để thấy ngay trường nào bật mà không có dữ liệu.

**Trường cần bật:**

| Trường | Đang | Để làm gì |
|---|---|---|
| `messages`, `messaging_postbacks` | ✅ | tin nhắn |
| `messaging_referrals` | ✅ | ad_id — nguồn sống của trang phân tích quảng cáo |
| `feed` | ❌ | bình luận bài viết |
| `leadgen` | ❌ | form Lead Ads |
| `message_reactions` | ⚠️ đang về nhưng bị vứt | đo mức độ tương tác |

**Quyền token cần có:** `pages_manage_metadata` (để gọi `subscribed_apps`),
`leads_retrieval` (Lead Ads), `pages_read_engagement` + `pages_manage_engagement`
(đọc và trả lời bình luận). Nếu page token hiện tại thiếu, phải cấp lại token — đây là
rủi ro lịch trình lớn nhất của giai đoạn này.

**Việc kiểm tra bắt buộc:** đối chiếu kết quả `subscribed_apps` của Phúc Đạt Kitchen
với 4 page có gói quảng cáo, để hiểu vì sao nó 0 gói quảng cáo.

---

## Giai đoạn 2 — Hoàn thiện bình luận (`feed`)

Hàm `handleComment` đã viết xong và chạy được: lưu `post_id`, `comment_id`,
`parent_comment_id`, người viết, nội dung, ảnh/video đính kèm, và báo cho admin đúng
công ty của page. Route trả lời bình luận (`POST /{comment_id}/comments`) cũng đã có.

Còn thiếu:

1. **Màn hình bình luận** — hiện chỉ có API trả 100 dòng mới nhất, không có giao diện.
2. **Lọc bình luận của chính page** — nếu không, page tự trả lời sẽ tạo thông báo cho chính mình.
3. **Nối bình luận với bài quảng cáo** — `ads_context_data.post_id` trong referral và
   `post_id` của bình luận là cùng một không gian khoá. Nối được thì biết **bài quảng cáo
   nào kéo bình luận**, không chỉ kéo tin nhắn.
4. **Quyết định cần chốt:** bình luận có tự tạo lead không? Khuyến nghị **không** — bình
   luận hiếm khi có số điện thoại, tạo lead sẽ làm rác pipeline. Chỉ tạo khi nhân viên bấm nút.

---

## Giai đoạn 3 — Hoàn thiện Lead Ads (`leadgen`)

Đây là giai đoạn có giá trị cao nhất mà tốn ít công nhất, vì **Lead Ads là đường duy nhất
lấy được số điện thoại và email do chính Facebook xác thực**, thay vì bóc regex từ chữ
khách gõ (hiện chỉ 4% contact có số).

Hàm `handleLeadGen` đã có. Còn thiếu:

1. **Bản đồ trường form → cột CRM.** Code đang cứng nhắc đoán `full_name`, `phone_number`,
   `email`. Form thật thường có `sản phẩm quan tâm`, `ngân sách`, `khu vực`. Cần bảng
   `fb_lead_form_mapping` để khai từng form.
2. **Kéo lead cũ** — `GET /{form_id}/leads` lấy lại lead đã phát sinh trước khi bật webhook.
3. **Bù lead rơi** — cron đối chiếu `facebook_lead_ads` với danh sách trên Facebook,
   bắt những lần webhook lỗi.
4. **Màn hình xem form và lead thô.**

---

## Giai đoạn 4 — Vét hết thông tin quảng cáo từ tin nhắn

Câu hỏi "lấy thông tin quảng cáo từ tin nhắn như thế nào" có câu trả lời chính xác, đo từ
4.892 gói thật. Facebook gửi về **đúng bốn trường**, không hơn:

```
event.referral = {
  type:   "OPEN_THREAD",        // 1995/1995 gói
  source: "ADS",                // 1995/1995
  ad_id:  "120251368417940105", // 1995/1995  ← khoá nối sang quảng cáo
  ads_context_data: {
    ad_title:  "Quảng cáo Lượt tương tác mới",  // 1995/1995
    post_id:   "122127360560735434",            // 1995/1995
    video_url: "https://scontent...jpg",        // 1993/1995
    photo_url: "https://scontent...jpg"         //    2/1995
  }
}
```

Referral nằm ở một trong ba chỗ — `event.referral`, `event.postback.referral`,
`event.message.referral` — code đã đọc cả ba.

**Đang lưu:** `ad_id`, `ad_title`, `post_id`, `source`, và cả cục thô vào `raw`.

**Chưa khai thác, nên làm:**

1. **`video_url` / `photo_url`** — ảnh hoặc video của chính mẫu quảng cáo. Lưu vào
   `lead_attribution.fb_creative_url` rồi hiện thumbnail trên trang phân tích. Lúc đó
   anh **nhìn thấy mẫu nào ra lead**, chứ không chỉ đọc dãy số.
2. **`post_id`** — nối sang bình luận cùng bài (Giai đoạn 2) và sang bài trên page.
3. **Bù dữ liệu cũ** — `facebook_webhook_logs` còn 4.892 gói chưa vét hết; lần bù trước
   (migration 641) chỉ lấy `ad_id`. Chạy lại để lấy thêm creative url.

**Giới hạn cứng, không vượt được bằng webhook:** không có tên chiến dịch, không có tên
nhóm quảng cáo, không có chi tiêu. Ba thứ đó chỉ Marketing API mới cho — phần này **đã
dựng xong** (`fbMarketingSync.js`, cron 6 giờ, màn hình khai tài khoản), chỉ chờ anh đưa
Ad Account ID và token `ads_read`. Xem `noi-facebook-marketing-api.md`.

---

## Giai đoạn 5 — Đẩy ngược về Facebook để Meta tự tối ưu chiến dịch

Đây là phần có giá trị lớn nhất và cũng nhiều cạm bẫy nhất. Mục tiêu: báo cho Meta biết
lead nào thành đơn, để thuật toán ngừng tìm người giống lead rác và đi tìm người giống
khách đã mua.

### 5.1 Một phát hiện làm đổi cách làm

Cách chính thống để quy kết hội thoại Messenger về quảng cáo là **`ctwa_clid`** — mã định
danh cú nhấp mà Facebook gắn vào referral. Đã quét toàn bộ 23.191 gói:

| Trường | Số gói có |
|---|---|
| `ctwa_clid` | **0** |
| `ref` | **0** |
| `click_id` | **0** |

**Không có `ctwa_clid`.** Nghĩa là không thể dùng ngay đường Conversions API cho Business
Messaging theo kiểu mặc định. Phải chọn đường khác, hoặc làm cho `ctwa_clid` xuất hiện.

### 5.2 Thứ mình thực sự có trong tay

| Dữ liệu | Độ phủ |
|---|---|
| Số điện thoại của lead từ quảng cáo | **288/288 = 100%** |
| Số điện thoại của đơn đã chốt | **19/19 = 100%** |
| `ad_id` của lead | 288/288 |
| Email | 1/288 |
| `ctwa_clid` | 0 |

Số điện thoại mới là tài sản để đối sánh, không phải mã nhấp chuột.

### 5.3 Ba đường, xếp theo độ chắc chắn

**Đường A — Đối sánh theo số điện thoại đã băm (khuyến nghị làm trước).**
Gửi sự kiện chuyển đổi kèm `phone` băm SHA-256 (chuẩn hoá E.164: `0905…` → `84905…`),
để Meta tự đối sánh với người đã nhấp quảng cáo. Không cần `ctwa_clid`. Độ phủ 100%.
Cần: Ad Account ID + token có quyền quản lý sự kiện. Đây là cùng bộ thông tin với
Giai đoạn Marketing API, nên lấy một lần dùng cho cả hai.

**Đường B — Làm cho `ctwa_clid` xuất hiện.** Một đợt thăm dò 1 ngày: kiểm tra phiên bản
API mà app đang đăng ký webhook, kiểm tra loại chiến dịch đang chạy (một số loại quảng cáo
nhắn tin không kèm mã nhấp), và tạo thử một quảng cáo nhắn tin mới rồi soi gói webhook.
**Không hứa trước kết quả** — phải đo mới biết.

**Đường C — Không đẩy gì.** Vẫn giữ báo cáo nội bộ như hiện tại. Đây là phương án lùi
hợp lệ nếu A và B đều vướng.

### 5.4 Chặn cứng trước khi đẩy bất cứ thứ gì

**18 trong 19 đơn chốt đang để giá trị bằng 0.**

Đẩy sự kiện `Purchase` với `value = 0` còn tệ hơn không đẩy: Meta sẽ học rằng những khách
đó vô giá trị và ngừng tìm người giống họ. Tiền quảng cáo sẽ chảy sai hướng, và sai lầm
này mất hàng tuần mới phát hiện.

Thứ tự bắt buộc:

1. Sửa khâu nhập liệu để đơn chốt luôn có giá trị tiền.
2. Bù giá trị cho 18 đơn cũ.
3. **Chỉ khi đó** mới bật đẩy sự kiện.

Trong lúc chờ, có thể đẩy sự kiện `Lead` (không cần tiền) trước — vẫn giúp Meta tối ưu,
mà không dạy nó điều sai.

### 5.5 Bộ sự kiện đề xuất

| Sự kiện | Bắn khi | Có tiền kèm |
|---|---|---|
| `Lead` | Lead có số điện thoại hợp lệ | Không |
| `Contact` | Nhân viên gọi được, lead chuyển sang "ấm" | Không |
| `Purchase` | `actual_close_date` được điền | **Bắt buộc có `value` > 0** |

Mỗi sự kiện gửi kèm: `event_time` (thời điểm thật, không phải lúc gửi), `event_id`
(chống trùng khi gửi lại), `phone` băm, và `action_source` phù hợp.

### 5.6 Nguyên tắc kỹ thuật

- **Băm trước khi rời máy chủ.** Không bao giờ gửi số điện thoại thô.
- **Hàng đợi, không gửi thẳng.** Bảng `fb_conversion_queue` giữ sự kiện chờ gửi, có
  trạng thái và số lần thử. Facebook lỗi thì không mất dữ liệu.
- **`event_id` ổn định** (ví dụ `lead_<uuid>_purchase`) để gửi lại không bị đếm hai lần.
- **Bật từng page một**, bắt đầu bằng page ít lưu lượng nhất, theo dõi Events Manager
  vài ngày rồi mới mở rộng.
- **Nhật ký đối soát**: mỗi ngày ghi số sự kiện đã đẩy so với số đơn chốt trong CRM.

---

## Thứ tự làm và ước lượng

| # | Việc | Phụ thuộc | Công | Giá trị |
|---|---|---|---|---|
| 1 | Bảng điều khiển webhook (GĐ 1) | token có `pages_manage_metadata` | 1 ngày | Cao — mở khoá mọi thứ sau |
| 2 | Bật `leadgen` + hoàn thiện Lead Ads (GĐ 3) | #1, `leads_retrieval` | 2 ngày | **Cao nhất** — SĐT & email thật |
| 3 | Vét creative url + post_id (GĐ 4) | không | 0,5 ngày | Trung bình — nhìn thấy mẫu QC |
| 4 | Nối Marketing API | **anh đưa token `ads_read`** | đã xong, chỉ khai báo | Cao — tên chiến dịch + chi tiêu |
| 5 | Sửa khâu nhập giá trị đơn | quy trình, không phải code | — | **Chặn GĐ 5** |
| 6 | Bật `feed` + màn hình bình luận (GĐ 2) | #1, `pages_manage_engagement` | 2 ngày | Trung bình |
| 7 | Đẩy sự kiện `Lead` về Meta (GĐ 5, đường A) | #4 | 2 ngày | Cao |
| 8 | Đẩy `Purchase` kèm tiền | #5, #7 | 0,5 ngày | **Rất cao** |
| 9 | Thăm dò `ctwa_clid` (đường B) | không | 1 ngày | Chưa rõ |

Đường tới hạn: **#4 chờ token của anh**, và **#5 chờ quy trình nhập liệu**. Hai thứ này
không phải việc lập trình, nên chúng quyết định toàn bộ lịch trình.

## Những quyết định cần anh chốt

1. **Bình luận có tự tạo lead không?** Khuyến nghị: không, chỉ tạo khi nhân viên bấm.
2. **Có bật `feed` cho cả 12 page, hay chỉ 4 page đang chạy quảng cáo?**
3. **Ai chịu trách nhiệm điền giá trị đơn?** Không có người cụ thể thì #5 sẽ không bao giờ xong.
4. **Có chấp nhận đẩy số điện thoại đã băm cho Meta không?** Đây là quyết định về dữ liệu
   khách hàng, không phải quyết định kỹ thuật. Băm là một chiều, Meta không đọc ngược được
   số gốc, nhưng nó vẫn cho phép Meta biết khách của anh là ai nếu người đó đã có tài khoản.

## Rủi ro

| Rủi ro | Ảnh hưởng | Cách giảm |
|---|---|---|
| Page token thiếu quyền mới | Chặn GĐ 1, 2, 3 | Kiểm tra quyền token **trước tiên**, trước khi viết dòng code nào |
| Đẩy `Purchase` value = 0 | Meta tối ưu sai, đốt tiền | Khoá cứng: không đẩy đơn không có giá trị |
| `ctwa_clid` không bao giờ xuất hiện | Đường B chết | Đã có đường A dự phòng, không phụ thuộc |
| Lấy lại token làm gián đoạn webhook | Mất tin nhắn vài phút | Làm ngoài giờ, có `facebook_webhook_logs` để bù |
| Bật `feed` cho page đông bình luận | Ngập thông báo | Bật từng page, bắt đầu từ page nhỏ |

## Việc KHÔNG làm

- **Không** bật `message_deliveries` — 0 giá trị kinh doanh, tăng gấp đôi lưu lượng webhook.
- **Không** tạo lead từ thả cảm xúc.
- **Không** đẩy sự kiện về Meta trước khi giá trị đơn được điền.
- **Không** gửi số điện thoại thô ra ngoài trong bất kỳ trường hợp nào.
