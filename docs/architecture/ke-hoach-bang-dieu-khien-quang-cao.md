# Kế hoạch: Bảng điều khiển quảng cáo + phân tích từng bài

Ngày lập: 02/10/2026 · Trạng thái: chờ duyệt · Liên quan: `noi-facebook-marketing-api.md`, `ke-hoach-hoan-thien-facebook.md`

---

## 0. Đo trước, vẽ sau

Mọi con số dưới đây đo trực tiếp trên database sản xuất ngày 02/10/2026. Chúng quyết
định cái gì làm được, cái gì phải bỏ — không suy đoán.

| Thứ cần đo | Kết quả | Hệ quả |
|---|---|---|
| Dòng chi tiêu `fb_ad_spend_daily` | **0** | Mọi chỉ số tiền (CPL, CPA, ROAS) **chưa tính được** |
| Tài khoản quảng cáo đã khai | **0** | Chưa kéo được gì từ Marketing API |
| Quy kết có `campaign_id` | **10 / 361** | Cấp "chiến dịch" của Facebook **gần như trống** |
| Số chiến dịch / nhóm quảng cáo phân biệt được | **1 / 2** | Không gom nổi theo chiến dịch |
| Bài viết / quảng cáo | **27 / 43** | **Bài viết là đơn vị phân tích đúng**, không phải chiến dịch |
| Tin nhắn Facebook | **151.509** (1.316 thuộc lead quảng cáo) | Mỏ dữ liệu lớn nhất chưa khai thác |
| Lịch sử chuyển giai đoạn | **21.772 dòng** | Dựng được phễu thật |
| Ngày có lead quảng cáo | 36 ngày, nhưng **293/361 lead nằm trong 3 tuần gần nhất** | Biểu đồ xu hướng phải vẽ **theo ngày, 4–6 tuần gần đây**, không phải theo tuần 5 tháng |

**Kết luận quan trọng nhất:** quảng cáo thật sự chỉ chạy từ **14/09/2026**. Trước đó
mỗi tuần 1–3 lead — đó là nhiễu webhook, không phải chiến dịch. Mọi phân tích xu hướng
phải lấy mốc từ 14/09, nếu không đường biểu đồ sẽ phẳng lì 4 tháng rồi dựng đứng, nhìn
như lỗi.

### Hai phát hiện đã lộ ra ngay khi đo

**1. Lead đang tụt mạnh.** Tuần 14/09: 115 lead · tuần 21/09: 141 lead · tuần 28/09
(mới 5 ngày): 37 lead. Từ ~20 lead/ngày xuống ~7 lead/ngày. Bảng điều khiển phải bắt
được việc này ngay ở màn đầu.

**2. Trả lời nhanh gắn với chốt đơn.** Trong 86 lead đo được thời gian phản hồi:

| Trả lời sau | Số lead | Chốt | Tỉ lệ |
|---|---|---|---|
| ≤ 5 phút | 46 | 7 | **15,2%** |
| 5–30 phút | 16 | 0 | 0% |
| 30 phút – 2 giờ | 16 | 0 | 0% |
| > 2 giờ | 8 | 1 | 12,5% |

Mẫu còn nhỏ (86 lead) và đây là **tương quan, không phải nhân quả** — có thể khách sốt
sắng thì vừa được trả lời nhanh vừa dễ chốt. Nhưng chênh lệch đủ lớn để đáng theo dõi,
và đây là loại số mà không ai trong công ty đang nhìn thấy.

---

## 1. Hình dạng sản phẩm

Thêm **một nút chuyển ở đầu tab "Chiến dịch quảng cáo"**:

```
[ Tổng quan ]  [ Theo page ]            ← mặc định vẫn là "Theo page"
```

- **Theo page** — lưới thẻ hiện tại, giữ nguyên không đụng tới.
- **Tổng quan** — bảng điều khiển mới, mô tả ở mục 2.

Mặc định không đổi: màn thẻ page anh vừa duyệt vẫn là thứ hiện ra đầu tiên. Bảng điều
khiển là chỗ đi vào khi muốn nhìn toàn cảnh, không phải thứ chen ngang.

Đi kèm là **màn phân tích sâu một bài viết** (mục 3), mở từ nút trên mỗi hàng bài.

---

## 2. Bảng điều khiển tổng — 4 giai đoạn

### Giai đoạn 1 · Xu hướng theo thời gian (nền móng)

**Trả lời:** quảng cáo đang lên hay đang tụt, tụt từ ngày nào, bài nào kéo xuống.

- **Dải số chính** (5 ô): lead · deal · chốt · doanh thu · số bài đang chạy. Mỗi ô kèm
  **so với kỳ trước cùng độ dài** (14 ngày trước so với 14 ngày liền trước đó), ghi rõ
  mốc so sánh dưới số, không để người đọc phải đoán.
- **Biểu đồ đường: lead theo ngày**, 28 ngày gần nhất, có đường trung bình trượt 7 ngày
  để nhiễu cuối tuần không làm hiểu sai. Một trục duy nhất, không bao giờ hai trục.
- **Biểu đồ cột xếp chồng: chất lượng lead theo tuần** — dùng lại đúng dải một màu đậm
  dần (lạnh → ấm → nóng → đã chốt) và xám trung tính cho rác, như thanh chất lượng đang có.
- **Bảng "Đang tụt"**: bài nào có lead 7 ngày qua thấp hơn 7 ngày trước đó ≥ 40%, và
  bài nào im lặng ≥ 7 ngày. Có nút bấm thẳng sang màn chi tiết của bài đó.

**Dữ liệu:** `lead_attribution` + `crm_leads` + `lead_quality_scores`. Đủ, không cần gì thêm.

**Endpoint mới:** `GET /ad-analytics/tong-quan?from=&to=&company_id=&page_id=`
trả về `{ chinh, chuoi_ngay[], chat_luong_tuan[], dang_tut[] }`.

**Rủi ro:** 28 ngày × 27 bài là ma trận thưa — phần lớn ô bằng 0. Biểu đồ **tổng toàn hệ
thống** luôn vẽ; biểu đồ **theo từng bài** chỉ vẽ cho bài có ≥ 10 lead, còn lại gộp vào
"các bài nhỏ khác". Không vẽ đường cho 2 điểm dữ liệu rồi gọi đó là xu hướng.

**Khối lượng:** 1 endpoint (~180 dòng), 1 file component biểu đồ (~260 dòng).

---

### Giai đoạn 2 · Phễu chuyển đổi theo giai đoạn

**Trả lời:** 312 lead vào, chỉ 20 đơn — 292 người kia rơi ở đâu.

Đo sẵn trên lead quảng cáo, qua `crm_lead_stage_history`:

| Giai đoạn chạm tới | Số lead | Thời gian ở lại (TB) |
|---|---|---|
| Lead mới | 312 | 11,8 giờ |
| **Chưa phân loại (slug rỗng)** | **82** | 22,3 giờ |
| Đã báo giá | 34 | 164,2 giờ |
| Nguội | 28 | 353,2 giờ |
| Nóng | 18 | — |
| Mất | 11 | — |
| Ấm | 8 | 461,2 giờ |
| Chờ cọc | 2 | — |
| Đang thiết kế | 1 | — |

**Hai điều đọc ra ngay:** chỗ rơi lớn nhất là **lead mới → báo giá (312 → 34, giữ lại
11%)**; và **82 lead đang nằm ở cột chưa được phân loại** — đúng 7 cột pipeline chưa xếp
nhóm đang treo trong danh sách việc tồn. Phễu sẽ còn khuyết cho tới khi 7 cột đó được
gán `canonical_slug`.

> **Việc chặn:** gán `canonical_slug` cho 7 cột pipeline chưa phân loại. Không làm thì
> 1/4 lead quảng cáo rơi khỏi phễu một cách âm thầm. Cần anh xác nhận mỗi cột thuộc
> nhóm nào — em không tự đoán vì đoán sai thì phễu sai mà không ai biết.

- **Biểu đồ phễu ngang**, mỗi bậc ghi số còn lại và % so với bậc ngay trước (không phải
  % so với đầu phễu — cách đó giấu mất chỗ rơi thật).
- **Thời gian trung vị ở mỗi bậc**, dùng trung vị chứ không dùng trung bình: 353 giờ ở
  bậc "nguội" là do vài lead nằm hàng tháng kéo lên.
- **So phễu giữa các bài**: chọn 2–3 bài, xem bài nào rơi ở bậc nào — đây là cách thấy
  "bài ra nhiều lead nhưng lead rác" khác với "bài ra ít lead nhưng lead chuẩn".

**Endpoint mới:** `GET /ad-analytics/phieu?post_id=&page_id=&from=&to=`

**Khối lượng:** 1 endpoint (~150 dòng), 1 component phễu (~180 dòng), 1 migration gán slug.

---

### Giai đoạn 3 · Tốc độ phản hồi tin nhắn

**Trả lời:** có phải mình đang để khách chờ rồi mất đơn không.

Đo được trên **86/289 lead quảng cáo (30%)**. Trung vị 3,5 phút, nhóm chậm nhất 91,5 phút.
Phần không đo được là do page nhắn trước hoặc hội thoại chỉ có một chiều — màn hình phải
ghi rõ "đo được 86/289", không được lặng lẽ lấy 86 làm mẫu số rồi gọi đó là toàn bộ.

- **Biểu đồ cột: phân bố thời gian phản hồi lần đầu** theo 4 nhóm (≤5 phút / 5–30 / 30–120 / >2 giờ).
- **Tỉ lệ chốt theo từng nhóm** — bảng số, kèm cảnh báo mẫu nhỏ khi nhóm có < 20 lead.
- **Độ sâu hội thoại**: trung vị số lượt trao đổi của lead chốt so với lead không chốt.
- **Bảng "khách bị bỏ rơi"**: lead có tin nhắn đến mà chưa có tin đi sau 60 phút, trong
  7 ngày qua. Đây là thứ dùng được **ngay hôm nay** — không phải báo cáo, mà là việc cần làm.

**Dữ liệu:** `facebook_messages` (151.509 dòng, `direction` = inbound/outbound).

**Rủi ro:** 151k dòng không được quét mỗi lần mở trang. Tính sẵn bằng cron hằng đêm, ghi
vào bảng mới `fb_hoi_thoai_chi_so` (lead_id, tin_vao_dau, tra_loi_dau, phut_phan_hoi,
so_luot, tinh_luc). Trang chỉ đọc bảng đã tính.

**Endpoint mới:** `GET /ad-analytics/phan-hoi` + job `jobs/fbConversationMetrics.js`
+ migration `648_fb_hoi_thoai_chi_so.sql`.

**Khối lượng:** 1 migration, 1 job (~140 dòng), 1 endpoint (~120 dòng), 1 component (~200 dòng).

---

### Giai đoạn 4 · Nối Marketing API (chạy song song, đang chờ anh)

Phần code đã viết xong từ trước: `helpers/fbMarketingSync.js`, bảng `fb_ad_accounts`,
`fb_ad_spend_daily`, 4 endpoint `/marketing/*`. **Chưa chạy được vì thiếu hai thứ:**

1. **Ad Account ID** của 4 tài khoản (đuôi `0105` / `0267` / `0352` / `0435`).
2. **Access token có quyền `ads_read`** — token page hiện tại không có quyền này.

Nối xong thì mở khoá ngay: chi tiêu theo ngày, CPL, CPA, ROAS, **tên chiến dịch thật**
(hiện 5/5 quảng cáo NextGo đều mang đúng một tiêu đề vô nghĩa "Quảng cáo Lượt tương tác mới"),
và cấp chiến dịch/nhóm quảng cáo mới có dữ liệu để gom.

Trước khi bật bất kỳ chỉ số ROAS nào: **19 đơn đã chốt đang để giá trị 0** phải được điền.
Không điền thì ROAS sẽ báo gần 0 trên những quảng cáo thật sự có lãi, và đó là loại sai
khiến người ta tắt nhầm quảng cáo tốt.

---

## 3. Màn phân tích sâu một bài viết

Mở từ nút trên mỗi hàng bài. Mỗi bài một trang, gồm:

1. **Đầu trang**: ảnh mẫu lớn, tiêu đề, link mở bài gốc, số quảng cáo đang chạy bài này.
2. **Xu hướng của riêng bài**: lead theo ngày, so với trung bình của page.
3. **Phễu của riêng bài**: so sánh cạnh phễu trung bình toàn hệ thống.
4. **Chân dung lead bài này kéo về**: phân bố chất lượng, tỉ lệ rác, thời gian phản hồi
   trung vị, tỉ lệ chốt.
5. **Danh sách lead** — đã làm xong, chính là khung `/post-leads` hôm nay.
6. **Nhận xét tự động**: mở rộng bộ luật hiện có từ 14 lên ~20 luật, thêm luật xu hướng
   ("bài này tuần rồi ra 40 lead, tuần này 9"), luật phễu ("ra lead nhiều nhưng 0 lead
   nào tới bước báo giá"), luật phản hồi ("trung vị trả lời 47 phút, gấp 13 lần mặt bằng").

**Nguyên tắc giữ nguyên từ bộ luật cũ:** mỗi câu nhận xét phải chỉ ra được con số đứng
sau nó, và phải ra kết quả y hệt khi tải lại. Quảng cáo là chuyện tiền — không đoán.

---

## 4. Quy tắc vẽ biểu đồ (áp dụng cho toàn bộ mục 2 và 3)

Giữ đúng bộ quy tắc đã dùng cho thanh chất lượng, để cả trang đọc như một hệ thống:

- Thang có thứ tự (lạnh → ấm → nóng → chốt) = **một màu đậm dần**, không phải cầu vồng.
- "Rác" nằm ngoài thang → **xám trung tính**.
- Màu trạng thái (lục / hổ phách / đỏ) là **màu dành riêng**, không mượn để trang trí.
- **Không bao giờ hai trục y.** Hai đại lượng khác thang thì tách thành hai biểu đồ.
- Từ 2 chuỗi trở lên **luôn có chú thích**; số liệu mặc chữ màu mực, không mặc màu chuỗi.
- Khe 2px giữa các mảng xếp chồng.
- Mọi biểu đồ có **bảng số tương ứng** mở ra được — ai cần con số chính xác thì có chỗ lấy.

---

## 5. Thứ tự làm và lý do

| # | Việc | Phụ thuộc | Giá trị ngay |
|---|---|---|---|
| 1 | Giai đoạn 1 — xu hướng | Không | Thấy ngay việc lead tụt từ 20/ngày xuống 7/ngày |
| 2 | Gán `canonical_slug` cho 7 cột pipeline | **Cần anh xác nhận** | Mở khoá 82 lead đang rơi khỏi phễu |
| 3 | Giai đoạn 2 — phễu | #2 | Biết 292 lead rơi ở đâu |
| 4 | Giai đoạn 3 — phản hồi | Không | Bảng "khách bị bỏ rơi" dùng được ngay trong ngày |
| 5 | Điền giá 19 đơn chốt đang để 0 | **Cần anh/sales** | Tiền đề cho mọi chỉ số doanh thu |
| 6 | Giai đoạn 4 — Marketing API | **Cần Ad Account ID + token `ads_read`** | Mở khoá toàn bộ nhóm chỉ số tiền |
| 7 | Màn phân tích sâu từng bài | #1, #3 | Gom mọi thứ về một trang cho mỗi bài |

Thứ 1, 3, 4, 7 em làm được một mình. Thứ 2, 5, 6 **chặn ở phía anh** — và đó là ba thứ
mở khoá nhiều giá trị nhất so với công bỏ ra.

---

## 6. Những thứ cố tình KHÔNG làm

- **Không** dựng màn "theo chiến dịch" cho tới khi Marketing API chạy. Hiện chỉ 10/361
  dòng có `campaign_id` — dựng lên sẽ là một màn hình trống rỗng giả vờ có dữ liệu.
- **Không** dự đoán hay chấm điểm bằng mô hình. 361 lead quảng cáo, 20 đơn chốt là quá ít
  để huấn luyện bất cứ thứ gì; luật tường minh đọc được vẫn đúng hơn và kiểm chứng được.
- **Không** gửi dữ liệu ngược về Facebook (CAPI) ở giai đoạn này. Đã đo: 0/23.191 gói
  webhook có `ctwa_clid`, nên chỉ còn đường khớp bằng số điện thoại băm — để sau khi
  Marketing API chạy và số liệu tiền đã đúng.
- **Không** bật RLS hàng loạt, không thêm 311 chỉ mục khoá ngoại, không xoá 159 chỉ mục
  "không dùng" — giữ nguyên các quyết định đã chốt trước đây.
