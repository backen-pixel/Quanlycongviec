# Nối Facebook Marketing API để lấy tên chiến dịch và chi tiêu

> Viết ngày 29/09/2026. Áp dụng cho Graph API v22.0.

## 1. Vì sao phải làm

Webhook Messenger của Facebook **chỉ gửi `ad_id`** — một dãy số trần. Nó có kèm
`fb_ad_title`, nhưng giá trị đó hầu hết là tên mặc định vô nghĩa: trong 39 quảng
cáo đang có, bảy cái cùng mang tên *"Quảng cáo Lượt tương tác mới"*. Không có cách
nào suy ra tên chiến dịch từ dữ liệu webhook.

Marketing API là nguồn duy nhất cho hai thứ:

| Thứ | Không có nó thì sao |
|---|---|
| Tên chiến dịch / nhóm QC / quảng cáo | Tab "Theo chiến dịch" không gom được, mọi QC dính nhãn "Chưa gắn tên" |
| Chi tiêu theo ngày | Không tính được giá mỗi lead, không tính được ROAS, không biết QC nào đốt tiền mà không ra lead |

## 2. Cần chuẩn bị hai thứ

1. **Ad Account ID** — dạng `act_1234567890`.
2. **Access token có quyền `ads_read`** — nên dùng token System User vì nó **không hết hạn**.

Nhìn vào đuôi các `ad_id` đang có thì hệ thống đang chạy khoảng **4 tài khoản quảng cáo**
(đuôi `0105`, `0267`, `0352`, `0435`). Mỗi tài khoản khai một dòng riêng.

## 3. Lấy Ad Account ID

Cách nhanh: mở **Trình quản lý quảng cáo** (Ads Manager), ô chọn tài khoản ở góc trên
hiện sẵn dãy số. Hoặc vào **business.facebook.com → Cài đặt doanh nghiệp → Tài khoản →
Tài khoản quảng cáo**, cột ID chính là con số cần lấy.

Khai vào hệ thống dạng nào cũng được — có `act_` hay không, hệ thống tự chuẩn hoá.

## 4. Lấy token `ads_read` (System User — không hết hạn)

1. Vào **business.facebook.com → Cài đặt doanh nghiệp**.
2. Cột trái: **Người dùng → Người dùng hệ thống** (System users).
3. Bấm **Thêm**, đặt tên (ví dụ `CRM đọc quảng cáo`), vai trò **Nhân viên** là đủ — không cần Quản trị.
4. Chọn người dùng vừa tạo → **Thêm tài sản** → tab **Tài khoản quảng cáo** → tick
   đúng những tài khoản cần đọc → quyền **Xem hiệu suất** (View performance).
   *Bỏ sót bước này là nguyên nhân số một khiến token báo lỗi quyền.*
5. Bấm **Tạo mã truy cập mới** (Generate new token).
6. Chọn **ứng dụng** đang dùng cho webhook Messenger.
7. Tick quyền **`ads_read`**. Nếu muốn chắc chắn lấy được số liệu insights thì tick thêm
   **`read_insights`**. **Không cần** `ads_management` — hệ thống chỉ đọc, không đụng vào
   quảng cáo của anh.
8. Bấm tạo, **sao chép ngay** — Facebook chỉ hiện token đúng một lần.

## 5. Khai vào hệ thống

Vào **CRM → Hiệu quả quảng cáo FB**, mở khung **Marketing API** ở đầu trang:

1. Dán Ad Account ID, đặt tên gợi nhớ (ví dụ `NextGo`), dán token.
2. Bấm **Thử kết nối** — chạy được sẽ hiện tên tài khoản và loại tiền tệ.
3. Bấm **Lưu tài khoản**.
4. Bấm **Đồng bộ ngay**.

Lặp lại cho từng tài khoản quảng cáo. Sau lần đầu, hệ thống **tự đồng bộ 6 giờ một lần**;
tên chiến dịch mới sẽ tự về, không phải làm gì thêm.

Sửa lại tài khoản sau này thì **để trống ô token** — hệ thống giữ token cũ.

## 6. Sau khi nối xong sẽ khác gì

- Tab "Theo chiến dịch" gom đúng theo chiến dịch thật của Facebook.
- Cột **Chi tiêu** hiện số tiền thật, kèm **giá mỗi lead** và **ROAS**.
- Bộ nhận xét tự động có thêm ba luật về tiền:
  - *Giá mỗi lead đắt hơn mặt bằng* (cảnh báo, khi đắt hơn 1,5 lần)
  - *Giá mỗi lead rẻ hơn mặt bằng* (tốt, khi rẻ hơn 40%)
  - *Doanh thu chốt được thấp hơn tiền quảng cáo* (xấu, khi ROAS < 1)
- Nhận xét "Nhiều lead nhưng chưa ra đơn nào" sẽ nói thẳng đã tiêu bao nhiêu tiền.

## 7. Lỗi hay gặp

| Thông báo | Nguyên nhân thường gặp |
|---|---|
| `(#200) requires ads_read permission` | Token thiếu quyền `ads_read`, hoặc System User chưa được gán tài khoản quảng cáo ở bước 4.4 |
| `(#100) Unsupported get request` | Sai Ad Account ID, hoặc token thuộc doanh nghiệp khác |
| `Error validating access token` | Token đã bị thu hồi, hoặc đổi mật khẩu Facebook làm token cũ hết hiệu lực |
| Kết nối được nhưng `0 quảng cáo` | Tài khoản đó thật sự chưa có quảng cáo nào, hoặc quảng cáo nằm ở tài khoản khác |

## 8. Hai điều hệ thống cố tình KHÔNG làm

**Không ghi đè tên anh đã đặt tay.** Dòng nào có `nguon = 'thu_cong'` và đã có tên thì
đồng bộ giữ nguyên tên đó. Người biết rõ hơn API.

**Không đoán ROI.** ROAS chỉ được tính từ những đơn đã điền giá trị. Hiện tại **17 trong
18 đơn chốt từ quảng cáo đang để `estimated_value = 0`** — nghĩa là ROAS sẽ hiện rất thấp
và *sai*, cho tới khi giá trị đơn được điền. Đây là việc phải sửa ở khâu nhập liệu, không
phải ở đây.

## 9. Bảo mật

Token nằm trong bảng `fb_ad_accounts`, đã bật RLS **không có policy nào** — chỉ backend
(chạy bằng service role) đọc được, gọi thẳng từ trình duyệt không lấy được. API chỉ trả
về **độ dài** token, không bao giờ trả giá trị. Log lỗi cũng chỉ in độ dài.
