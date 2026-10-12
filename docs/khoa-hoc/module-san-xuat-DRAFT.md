# BẢN THẢO KHOÁ HỌC — Hướng dẫn sử dụng module sản xuất

**Số bài:** 4 (2 bài thực hành · 1 bài kiểm tra 20 câu · 1 bài tình huống)
**Soạn lại:** 12/10/2026 — bỏ lối dạy định nghĩa, chuyển sang thao tác thật
**Trạng thái:** nháp trong `/knowledge`, chỉ admin xem được

> Tên trang, tên nút, tên trường lấy từ mã nguồn đang chạy. Chỗ nào khác thực tế trên máy
> thì báo lại — có thể công ty đó bật cấu hình riêng.

---

# BÀI 1 — Các trang quản lý nhiệm vụ / công việc

- **Thứ tự:** 1 · **Thời lượng:** 20 phút · **Bắt buộc:** có
- **Tóm tắt:** Một ngày làm việc thật ở xưởng, từ lúc mở máy 7h30 tới lúc đóng máy. Mở trang nào, bấm nút nào, xử lý ra sao.

## 1. Tư tưởng

### 7h30 sáng, anh Hùng mở máy

Trong đầu anh Hùng có đúng ba câu hỏi, không hơn:

> *«Hôm qua còn việc gì chưa xong?»*
> *«Hôm nay phải làm những gì?»*
> *«Đơn chị Hoa tới đâu rồi, khách đang hỏi.»*

Ba câu hỏi, ba trang khác nhau. Anh Hùng mở nhầm trang thì mất 10 phút lạc giữa một
đống thẻ, rồi bỏ cuộc và đi hỏi miệng tổ trưởng — đúng cái việc phần mềm sinh ra để
khỏi phải làm.

### Vì sao không gom hết vào một màn hình

Một xưởng 40 dự án đang chạy, mỗi dự án 15–20 nhiệm vụ. Gom hết là **600–800 dòng** trên
một màn hình. Không ai đọc 800 dòng. Nên hệ thống chia theo câu hỏi, mỗi trang trả lời
đúng một câu:

| Câu hỏi trong đầu | Mở trang | Đường dẫn |
|---|---|---|
| Hôm nay ai làm gì, việc nào trễ? | Quản lý nhiệm vụ | `/sx/project-tasks` |
| Đơn này đang ở công đoạn nào? | Dashboard xưởng | `/sx/dashboard` |
| Riêng đơn này còn vướng gì? | Chi tiết dự án → tab ✅ Công việc | bấm thẻ ở Dashboard |
| Anh Toại đang ôm bao nhiêu việc? | Giao việc Sản xuất | `/sx/assignments` |

**Nguyên tắc: mở trang theo câu hỏi, không mở theo thói quen.**

## 2. Tư duy

### 2.1. Hai thứ hay bị gọi lẫn tên

Chuyện có thật và lặp lại: quản lý bảo *«giao cho thằng Toại làm cái cắt CNC»*, nhân
viên vào **Quản lý nhiệm vụ** tìm mãi không thấy — vì cái vừa tạo là **Giao việc**, nằm
ở trang khác.

| | **Nhiệm vụ dự án** | **Giao việc** |
|---|---|---|
| Treo vào | Dự án + công đoạn | Một người |
| Ai tạo | Hệ thống tự sinh khi thẻ vào cột | Người bấm tạo, hoặc gõ `/` trong bình luận |
| Hỏi gì | *Công đoạn Gia công xong chưa?* | *Toại đang ôm mấy việc?* |
| Xem ở | `/sx/project-tasks`, tab Công việc của dự án | `/sx/assignments`, `/sx/phat-sinh` |

Việc **phát sinh** là một dòng **Giao việc** có gắn thêm loại — Bài 2 nói kỹ.

### 2.2. Nhiệm vụ không xanh vì còn việc con chưa tích

Tình huống hay gặp nhất: *«Em làm xong rồi mà sao nó vẫn vàng?»*

Hệ thống không cho ai tự gõ phần trăm. Nó đếm **việc con đã tích / tổng việc con**:

| Việc con | Nhiệm vụ hiện |
|---|---|
| 0/5 tích | **Chưa làm** (xám) |
| 3/5 tích | **Đang làm** (xanh dương) |
| 5/5 tích | **Đã làm** (xanh lá) |

Thấy nhiệm vụ mãi không xanh → mở ra, kéo xuống, soát việc con còn sót. Gần như lần
nào cũng còn một cái chưa tích.

### 2.3. Sáu rổ hạn và cái rổ nguy hiểm nhất

Trang không bày lịch. Nó đổ việc vào sáu rổ để mắt đọc trong ba giây:

**Quá hạn · Hôm nay · Ngày mai · Trong tuần · Tuần sau · Chưa có hạn**

Rổ **Chưa có hạn** là chỗ việc đi chết. Không hạn thì không bao giờ báo trễ, nên nó nằm
im cho tới hôm khách gọi hỏi. **Mỗi sáng liếc rổ này trước khi liếc bất cứ gì khác.**

Một lưu ý về giờ: hạn hôm nay tính tới **giờ tan làm của công ty**, không phải 23h59.
Xưởng tan 17h30 thì 17h31 việc đã nhảy sang Quá hạn.

## 3. Nguồn lực

Thiếu một trong bốn thứ này thì trang sẽ trống hoặc sai, và không phải lỗi người dùng:

| Cần có | Ai lo | Dấu hiệu khi thiếu |
|---|---|---|
| Pipeline xưởng đã khai cột — `/sx/pipeline-settings` | Admin | Dashboard không có cột nào |
| Bộ mẫu nhiệm vụ theo cột — `/sx/task-templates` | Admin | Dự án mới vào mà không sinh nhiệm vụ nào |
| Mỗi cột đã gán người phụ trách | Admin | Nhiệm vụ sinh ra không có ai nhận |
| Dự án đã bàn giao từ CRM sang xưởng | Sale | Không thấy đơn trên Dashboard xưởng |

Về quyền: nhân viên xưởng thấy việc của mình và của dự án mình tham gia. Quản lý thấy
toàn công ty và lọc được theo nhân viên, khu vực.

## 4. Vận hành

### 4.1. Mười phút đầu ngày — làm đúng thứ tự này

**Bước 1.** Mở `/sx/project-tasks` (menu *Sản xuất → 1. Tổng quan → Quản lý nhiệm vụ*).
Để nguyên module **Sản xuất**.

**Bước 2.** Bấm nút chế độ xem ở góc trên, chọn **Hạn**.

**Bước 3 — cột Quá hạn trước tiên.** Mỗi thẻ ở đây là nợ của hôm qua. Với từng thẻ, chọn một trong ba:
- còn làm được hôm nay → để nguyên, nhắn người làm
- không kịp → mở ra, **dời hạn** và **ghi lý do vào bình luận**
- không làm nữa → **huỷ**, đừng để treo

**Bước 4 — cột Hôm nay.** Đây là khối lượng thật của ngày. Đếm xem có quá tải không;
quá tải thì dời bớt ngay từ sáng, đừng đợi 16h mới dời.

**Bước 5 — cột Chưa có hạn.** Việc nào còn sống thì gán hạn ngay tại đây.

**Bước 6 — giục việc của người khác.** Bấm nút **🔔 Nhắc** trên thẻ. Nút đổi thành
*Đã nhắc*. Người kia nhận thông báo, không cần gọi điện.

> Nút **Nhắc** bị mờ khi nhiệm vụ chưa gắn danh mục. Mở nhiệm vụ, bổ sung danh mục rồi
> mới nhắc được.

### 4.2. Dải số liệu đầu trang — bấm vào là lọc

**Tổng · Chưa làm · Đang làm · Đã làm · Quá hạn**

Đây không phải chỉ để nhìn. Bấm ô **Quá hạn** là trang lọc còn mỗi việc quá hạn, bấm
lần nữa là bỏ lọc. Nhanh hơn mở bộ lọc.

**Số trên dải này chạy theo bộ lọc đang bật, không phải số toàn hệ thống.** Thấy số
không khớp với cái mình đếm thì xoá hết chip lọc dưới thanh công cụ rồi đếm lại.

### 4.3. Bộ lọc — dùng khi cần tìm, không dùng khi xem hằng ngày

Nút **Bộ lọc** mở bảng bên: module (CRM / Sản xuất / VC-LĐ) · dự án · công ty · khu vực ·
nhân viên · khoảng hạn từ–đến · ô tìm kiếm.

Điều kiện đang bật hiện thành **chip** ngay dưới thanh công cụ. Bấm **×** trên chip để
gỡ từng cái. Thói quen tốt: xem xong thì gỡ hết chip, lần sau mở trang không bị lọc sót.

### 4.4. Khách gọi hỏi «đơn tôi tới đâu rồi?»

1. Mở `/sx/dashboard`
2. Tìm thẻ theo tên khách hoặc mã đơn
3. Thẻ đang nằm cột nào thì đơn đang ở công đoạn đó — trả lời khách được ngay
4. Cần chi tiết hơn thì bấm thẻ → vào trang dự án

Trên Dashboard:
- **Kéo thẻ** sang cột khác = chuyển công đoạn
- Bật **Gộp cột** để các cột nhỏ cùng nhóm nằm chung một cột lớn, bảng ngắn lại
- Kéo không được → cột hiện tại còn nhiệm vụ gắn cờ *chặn chuyển giai đoạn* chưa xong. Hệ thống liệt kê rõ việc nào; làm xong hoặc huỷ rồi kéo lại

### 4.5. Trong trang dự án

Đầu trang là **thanh tiến độ** vẽ lại pipeline: cột lớn xếp ngang nối nhau bằng dấu **›**,
việc song song xếp dọc bên trong, mỗi việc một vòng tròn.

- Bấm **vòng tròn** = tích hoàn thành
- Bấm **tên cột** = chuyển thẻ sang cột đó

Các tab: **✅ Công việc** · 🤝 Không gian chung · 📋 Tài liệu · ☁️ Drive · 📝 Ghi chú ·
💬 Bình luận · 🕘 Lịch sử · 📦 Vật tư / Mua hàng · 👥 Đội · ✅ Gửi duyệt.

Làm việc thật nằm ở tab **✅ Công việc**: tích việc con, đổi trạng thái, gắn ảnh, ghi chú.

## 5. Báo cáo và sửa chữa

### 5.1. Cuối ngày nhìn gì

- **Dải KPI** đầu trang Quản lý nhiệm vụ — xoá hết chip lọc trước khi đọc số
- **Tab 🕘 Lịch sử** trong dự án — ai đổi gì lúc nào, dùng khi cần truy lại
- **Báo cáo phát sinh** `/management/shared-workspace-report` — Bài 2 nói kỹ

### 5.2. Năm triệu chứng và cách chữa

| Thấy gì trên màn hình | Nguyên nhân | Làm gì |
|---|---|---|
| Tích hết rồi mà nhiệm vụ vẫn «Đang làm» | Còn việc con chưa tích | Mở nhiệm vụ, kéo xuống soát hết việc con |
| Nhiệm vụ không ai thấy, không ai làm | Chưa gán người thực hiện | Mở nhiệm vụ, gán người |
| Việc nằm lì ở rổ «Chưa có hạn» | Dự án chưa có ngày lắp, hoặc nhiệm vụ chưa gắn công đoạn | Cập nhật ngày lắp cho dự án; kiểm tra nhiệm vụ đã gắn cột công đoạn chưa |
| Kéo thẻ không sang cột mới được | Cột hiện tại còn nhiệm vụ gắn cờ chặn chuyển giai đoạn | Đọc danh sách hệ thống liệt kê, làm xong hoặc huỷ |
| Số KPI khác số mình đếm tay | Đang có bộ lọc bật | Xoá hết chip lọc rồi đếm lại |

### 5.3. Ba thói quen giữ cho số liệu sạch

1. Sáng mở **Quá hạn** trước mọi thứ khác
2. Việc không làm nữa thì **huỷ**, đừng để treo — việc treo làm hỏng mọi con số
3. Dời hạn thì **ghi lý do vào bình luận** — tháng sau họp còn truy được

---

# BÀI 2 — Trang quản lý phát sinh và tạo phát sinh

- **Thứ tự:** 2 · **Thời lượng:** 25 phút · **Bắt buộc:** có
- **Tóm tắt:** Hai cuộc gọi quen thuộc — khách đổi ý và thợ làm sai — đi hết từ lúc nghe máy tới lúc đối soát cuối tháng.

## 1. Tư tưởng

### Hai cuộc gọi, một buổi chiều

**14h30.** Chị Hoa: *«Em ơi chị đổi ý, 3 cánh tủ trên chị muốn kính cường lực thay vì gỗ.
Chị trả thêm tiền cũng được.»*

**14h40.** Tổ trưởng: *«Sếp ơi hôm qua thợ cắt nhầm 1 ngăn dưới, bên em làm lại, mất thêm
1 ngày. Lỗi bên em.»*

Hai việc này **không** nằm trong bộ mẫu, **không** ai lên kế hoạch trước, nhưng cả hai
đều phải làm. Đó là phát sinh.

### Không ghi thì mất ba thứ cùng lúc

| Không ghi | Một tháng sau |
|---|---|
| Không có tên ai trên giấy | Việc trễ, không biết hỏi ai |
| Không có dòng «kính cường lực» nào | Không xuất được hoá đơn bổ sung — mất tiền thật |
| Không có dòng «cắt nhầm» nào | Không biết khâu cắt sai bao nhiêu lần, không sửa được quy trình |

**Phát sinh nào cũng ghi, kể cả loại không thu tiền của khách.**

### Vì sao không có giao diện riêng

Phát sinh dùng chung bảng với Giao việc, chỉ thêm một thuộc tính *loại phát sinh*. Nhờ
vậy thẻ, kéo thả, bình luận, tệp đính kèm, thông báo — mọi thứ đã chạy ổn ở Giao việc
thì phát sinh dùng lại nguyên, không ai phải học thêm giao diện thứ hai.

## 2. Tư duy

### 2.1. Hai câu hỏi khác nhau, đừng trộn

Mỗi việc phát sinh trả lời **hai** câu hỏi độc lập.

**Câu 1 — Ai trả tiền?** → quyết định tab **Có phí** / **Không phí**

Cái này **người tạo không chọn**. Nó nằm sẵn trong **loại phát sinh** mà admin đã khai.
Chọn loại «Kính cường lực» là tự vào tab Có phí; chọn «Làm lại chi tiết sai» là tự vào
tab Không phí.

> Vì sao không cho chọn tay? Vì cùng một loại việc mà người này đánh có phí, người kia
> đánh không phí, thì tới cuối tháng không ai dám tin con số nào nữa.

**Câu 2 — Lỗi do đâu?** → trường **Loại nhiệm vụ**, bắt buộc chọn

- **Phát sinh từ khách hàng** — khách đổi ý, khách bổ sung
- **Lỗi từ nhân viên** — nội bộ làm sai. Chọn cái này thì phải chỉ rõ **khối gây lỗi**: CRM / Xưởng / Lắp đặt

Áp vào hai cuộc gọi lúc nãy:

| Việc | Loại | Tab | Loại nhiệm vụ | Khối gây lỗi |
|---|---|---|---|---|
| Đổi 3 cánh sang kính | Kính cường lực | **Có phí** | Phát sinh từ khách hàng | — |
| Làm lại ngăn cắt sai | Làm lại chi tiết sai | **Không phí** | Lỗi từ nhân viên | **Xưởng** |

### 2.2. Hạn tự tính, không ai gõ

Tạo xong là hạn hiện ra, tính theo lịch làm việc xưởng, tự nhảy qua thứ Bảy, Chủ nhật
và ngày lễ. Ba kiểu quy tắc:

| Kiểu | Nghĩa là | Ví dụ thật |
|---|---|---|
| **Trong ngày** | Xong trước giờ tan làm hôm nay. Tạo sau giờ đó thì sang ngày làm kế tiếp | Dán cạnh, chỉnh bản lề |
| **Mốc giờ → ngày làm sau** | Tạo trước mốc (mặc định 12h) thì xong trong ngày; muộn hơn thì ngày làm sau | Việc phải gom lô trong ngày |
| **Cộng N ngày làm việc** | Cộng N ngày làm việc kể từ hôm nay | Kính cường lực — thường 3 ngày |

**Đếm thử:** tạo kính cường lực 14h30 **thứ Năm**, loại cộng 3 ngày làm việc
→ Sáu (1) → Hai (2) → **Ba (3)**. Hạn là **thứ Ba tuần sau**. Bỏ qua Bảy và Chủ nhật.

### 2.3. Vì sao phải tách hai tab

| | Tab Không phí | Tab Có phí |
|---|---|---|
| Là gì | Việc nội bộ phải nuốt | Việc sẽ ra hoá đơn |
| Đo cái gì | Chất lượng quy trình | Doanh thu bổ sung |
| Nhiều lên nghĩa là | Quy trình đang hở | Khách đang đặt thêm |

Trộn chung thì cả hai con số đều vô nghĩa.

## 3. Nguồn lực

### Admin phải khai loại trước, nếu không thì không tạo được việc nào

Vào `/management/shared-workspace-settings` (menu *Setup phát sinh*). Mỗi loại khai:

| Trường | Ví dụ |
|---|---|
| **Tên loại** | Kính cường lực |
| **Quy tắc hạn** | Cộng N ngày làm việc |
| **Số ngày** | 3 |
| **Có phí / Không phí** | Có phí |
| **Người phụ trách** | NV mặc định nhận loại việc này |

Danh mục khai **theo từng công ty**. Công ty chưa khai loại nào thì tab tương ứng rỗng
trơn — không phải lỗi, là chưa setup.

Người dùng cần: quyền vào module Sản xuất · dự án đã có trong hệ thống để gắn việc vào ·
biết trước ai chịu trách nhiệm.

## 4. Vận hành

### 4.1. Ghi việc của chị Hoa — từng bước

Menu *Sản xuất → 1. Tổng quan → Quản lý phát sinh* (`/sx/phat-sinh`)

**Bước 1.** Bấm **Tạo phát sinh**.

**Bước 2.** Chọn **dự án / deal** — bắt buộc. Việc sẽ nằm trong không gian chung của
đúng dự án đó, ai mở dự án ra cũng thấy.

**Bước 3.** Điền:

| Trường | Điền gì | Bắt buộc |
|---|---|---|
| Loại phát sinh | Kính cường lực | ✅ |
| Loại nhiệm vụ | Phát sinh từ khách hàng | ✅ |
| Khối gây lỗi | *(không hiện, vì không phải lỗi NV)* | — |
| Người chịu trách nhiệm | **Một người** — người bị hỏi khi trễ | ✅ |
| Người làm | Ít nhất một, gán vai trò từng người | ✅ |
| Tiêu đề | «Đổi 3 cánh tủ trên sang kính cường lực» | ✅ |
| Mô tả | Chi tiết + ảnh hiện trạng nếu có | — |

**Bước 4.** Lưu. Hạn hiện ra **thứ Ba tuần sau**, không phải gõ.

> **Người chịu trách nhiệm ≠ người làm.** Một người chịu trách nhiệm, nhiều người cùng
> làm. Không có người chịu trách nhiệm thì lúc trễ không biết gọi ai — nên hệ thống bắt buộc.

### 4.2. Ghi việc cắt nhầm — khác ở hai chỗ

Cùng các bước trên, khác đúng hai trường:

- **Loại phát sinh** → «Làm lại chi tiết sai» → việc tự vào tab **Không phí**
- **Loại nhiệm vụ** → «Lỗi từ nhân viên» → hiện thêm ô **Khối gây lỗi** → chọn **Xưởng**

Đừng ngại ghi lỗi nội bộ. Không ghi thì tháng sau không ai biết khâu cắt sai mấy lần.

### 4.3. Đang nói chuyện với khách thì ghi ngay bằng dấu `/`

Không phải lúc nào cũng rảnh mở trang. Đang gõ bình luận trong deal mà nảy ra việc:

1. Gõ dấu **`/`** trong ô bình luận
2. Form gọn bật lên ngay tại chỗ
3. Điền tiêu đề, hạn, khối xử lý, nguồn phát sinh, chọn người
4. Gửi

Đường này **chạy đúng luồng như form đầy đủ**: vẫn bắn thông báo cho từng người nhận,
vẫn tự đăng một bình luận nhắc tên vào deal, vẫn đồng bộ sang danh sách nhiệm vụ.

### 4.4. Mỗi sáng soát 2 phút

1. Mở tab **Không phí** — thường là việc gấp, hạn ngắn. Soát việc quá hạn, nhắc người chịu trách nhiệm
2. Sang tab **Có phí** — soát việc nào **xong rồi mà chưa ghi chi phí**. Đây là chỗ rơi tiền
3. Việc xong thì chuyển trạng thái hoàn thành. Đừng để treo

## 5. Báo cáo và sửa chữa

### 5.1. Báo cáo phát sinh

`/management/shared-workspace-report` (menu *2. Làm việc → Báo cáo phát sinh*)

Gom cả hai tab, lọc theo module · khoảng thời gian · công ty · người. Số đưa ra: tổng
việc, chưa làm, đang làm, hoàn thành, đã huỷ, **quá hạn**, và tách riêng **phát sinh từ
khách hàng** với **lỗi từ nhân viên**. Có nút **xuất Excel** để mang đi họp hoặc đối
soát với kế toán.

### 5.2. Đọc báo cáo sao cho ra việc phải làm

| Thấy gì | Nghĩ gì | Làm gì |
|---|---|---|
| Lỗi nhân viên dồn vào một khối | Quy trình khối đó hở, không phải người kém | Soát lại bước bàn giao vào khối đó |
| Một loại phát sinh lặp 10+ lần/tháng | Nó không còn là «phát sinh» | Đưa hẳn vào bộ mẫu nhiệm vụ |
| Tab Có phí nhiều việc xong mà chưa ghi phí | Đang rơi tiền | Ghi phí ngay, kế toán có cảnh báo riêng cho việc này |
| Nhiều việc quá hạn cùng một loại | SLA đặt quá chặt, hoặc thiếu người | Xem lại số ngày ở trang Setup |

### 5.3. Lỡ làm sai thì chữa thế nào

| Tình huống | Cách chữa |
|---|---|
| Chọn nhầm loại → việc nằm sai tab | Mở việc, đổi lại loại. Việc tự nhảy tab đúng. **Hạn tính lại theo loại mới — nhớ kiểm tra lại hạn** |
| Đánh nhầm «Lỗi từ nhân viên» trong khi khách đổi ý | Mở việc, đổi **Loại nhiệm vụ**. Phải sửa, không thì báo cáo chất lượng đổ oan cho khối đó |
| Tạo trùng hai việc cho một phát sinh | **Huỷ** một việc, ghi lý do vào bình luận. Đừng xoá trắng — xoá là mất dấu vết |
| Loại cần dùng chưa có trong danh mục | Báo admin thêm ở trang Setup. **Không lấy đỡ loại gần giống** — một lần lấy đỡ là báo cáo hỏng cả quý |
| Giao nhầm người | Mở việc, đổi người chịu trách nhiệm và người làm. Hệ thống bắn thông báo cho người mới |

### 5.4. Ba câu nhớ nhất

1. **Phát sinh nào cũng ghi**, kể cả loại không thu tiền
2. **Loại quyết định tab và hạn** — chọn cẩn thận ngay từ đầu, đừng chọn bừa rồi sửa
3. **Người chịu trách nhiệm là một người**, không phải một nhóm
