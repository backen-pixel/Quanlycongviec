# BÀI 3 & BÀI 4 — bản thảo bài tập

Thuộc khoá **Hướng dẫn sử dụng module sản xuất**. Chưa đưa lên hệ thống.

---

# BÀI 3 — Kiểm tra kiến thức module sản xuất

- **Loại bài tập:** `quiz` · **Thứ tự:** 3
- **Số câu:** 20 · **Điểm đạt:** 70 (14/20 câu đúng)
- **Thời gian:** 25 phút · **Số lượt làm:** 3
- **Hướng dẫn hiển thị cho học viên:**
  > Bài gồm 20 câu về các trang quản lý nhiệm vụ, công việc và phát sinh của module sản xuất. Có câu một đáp án, có câu nhiều đáp án — câu nhiều đáp án phải chọn đủ mới tính đúng. Đạt từ 14/20 câu.

Ghi chú soạn bài: **Đ** = đáp án đúng. Phần *Giải thích* hiện sau khi nộp bài.

---

## Phần A — Khái niệm (câu 1–7)

**Câu 1.** Trang nào trả lời câu hỏi «hôm nay ai phải làm gì, việc nào đang trễ»? *(một đáp án)*
- A. Dashboard xưởng `/sx/dashboard`
- **B. Quản lý nhiệm vụ `/sx/project-tasks`** ✔
- C. Pipeline xưởng `/sx/pipeline-settings`
- D. Báo cáo phát sinh

*Giải thích:* Dashboard trả lời «dự án tới công đoạn nào». Câu hỏi về việc phải làm trong ngày thuộc trang Quản lý nhiệm vụ.

**Câu 2.** Khác biệt đúng giữa **nhiệm vụ dự án** và **giao việc**? *(một đáp án)*
- A. Nhiệm vụ dự án do người dùng tạo tay, giao việc do hệ thống sinh
- **B. Nhiệm vụ dự án gắn vào dự án và công đoạn; giao việc gắn vào người** ✔
- C. Hai cái là một, chỉ khác tên gọi
- D. Nhiệm vụ dự án không có hạn, giao việc mới có hạn

*Giải thích:* Nhiệm vụ dự án trả lời «công đoạn xong chưa», giao việc trả lời «người này ôm bao nhiêu việc».

**Câu 3.** Một **việc phát sinh** thực chất là gì trong hệ thống? *(một đáp án)*
- A. Một bảng dữ liệu riêng tách khỏi giao việc
- **B. Một dòng Giao việc có gắn thêm «loại phát sinh»** ✔
- C. Một nhiệm vụ dự án đặc biệt
- D. Một bình luận được đánh dấu

*Giải thích:* Hệ thống cố ý không dựng bảng thứ hai, để dùng lại nguyên thẻ, bình luận, tệp đính kèm và thông báo của Giao việc.

**Câu 4.** Sáu rổ hạn ở trang Quản lý nhiệm vụ gồm những rổ nào? *(nhiều đáp án)*
- **A. Quá hạn** ✔
- **B. Hôm nay** ✔
- **C. Ngày mai** ✔
- **D. Trong tuần** ✔
- **E. Tuần sau** ✔
- **F. Chưa có hạn** ✔
- G. Tháng sau

*Giải thích:* Đúng sáu rổ A–F. Không có rổ «Tháng sau».

**Câu 5.** Điều gì quyết định một việc phát sinh nằm ở tab **Có phí** hay **Không phí**? *(một đáp án)*
- A. Người tạo chọn tab trước khi bấm tạo
- B. Số tiền nhập vào ô chi phí
- **C. Thuộc tính «có phí» của LOẠI phát sinh, do admin khai sẵn** ✔
- D. Kế toán duyệt rồi mới xếp tab

*Giải thích:* Không lưu «có phí» trên từng việc. Hai nơi cùng giữ một sự thật thì sớm muộn sẽ lệch nhau.

**Câu 6.** Hai giá trị của trường **Loại nhiệm vụ** khi tạo phát sinh? *(nhiều đáp án)*
- **A. Phát sinh từ khách hàng** ✔
- **B. Lỗi từ nhân viên** ✔
- C. Phát sinh từ nhà cung cấp
- D. Phát sinh do thời tiết

*Giải thích:* Chỉ hai giá trị. Chọn «Lỗi từ nhân viên» thì phải chỉ thêm khối gây lỗi.

**Câu 7.** «Người chịu trách nhiệm» và «người làm» khác nhau thế nào? *(một đáp án)*
- A. Giống nhau, hệ thống tự điền cả hai
- **B. Người chịu trách nhiệm là MỘT người bị hỏi khi việc trễ; người làm có thể nhiều người** ✔
- C. Người chịu trách nhiệm là nhóm, người làm là cá nhân
- D. Người chịu trách nhiệm chỉ dùng cho việc có phí

*Giải thích:* Thiếu người chịu trách nhiệm thì việc trễ không biết hỏi ai, nên hệ thống bắt buộc trường này.

---

## Phần B — Ý nghĩa (câu 8–13)

**Câu 8.** Vì sao rổ **Chưa có hạn** được coi là nguy hiểm nhất? *(một đáp án)*
- A. Vì chứa nhiều việc nhất
- **B. Vì việc không có hạn thì không bao giờ báo trễ, nên nằm im tới lúc có người hỏi** ✔
- C. Vì hệ thống tự xoá sau 30 ngày
- D. Vì không gán được người

*Giải thích:* Cảnh báo trễ dựa trên hạn. Không hạn thì không có cảnh báo.

**Câu 9.** Vì sao tách riêng hai tab Có phí / Không phí thay vì gộp một danh sách? *(một đáp án)*
- A. Để trang tải nhanh hơn
- **B. Vì tab Không phí đo chất lượng quy trình, tab Có phí đo doanh thu bổ sung — trộn chung thì cả hai con số đều sai** ✔
- C. Vì quyền xem của hai tab khác nhau
- D. Vì kế toán yêu cầu

*Giải thích:* Hai tab phục vụ hai mục tiêu quản trị khác nhau.

**Câu 10.** Ghi nhận cả phát sinh **không mất tiền** để làm gì? *(nhiều đáp án)*
- **A. Để có người chịu trách nhiệm rõ ràng** ✔
- **B. Để biết lỗi lặp ở khâu nào mà sửa quy trình** ✔
- C. Để tính thêm tiền cho khách
- **D. Để thống kê chất lượng quy trình của từng khối** ✔

*Giải thích:* Phát sinh không phí không sinh doanh thu nhưng là dữ liệu chất lượng.

**Câu 11.** Tiến độ một nhiệm vụ được tính dựa trên gì? *(một đáp án)*
- A. Phần trăm người thực hiện tự nhập
- **B. Số việc con đã xong trên tổng số việc con** ✔
- C. Thời gian đã trôi so với hạn
- D. Quản lý đánh giá thủ công

*Giải thích:* Vì vậy muốn nhiệm vụ sang «Đã làm» phải tích hết việc con, không có đường tắt.

**Câu 12.** «Hết hạn» trong ngày được tính tới thời điểm nào? *(một đáp án)*
- A. 23:59 cùng ngày
- **B. Giờ kết thúc làm việc của công ty** ✔
- C. 12:00 trưa
- D. 17:00 cố định cho mọi công ty

*Giải thích:* Hết giờ làm mà chưa xong là tính trễ ngay hôm đó.

**Câu 13.** Báo cáo cho thấy một loại phát sinh lặp đi lặp lại rất nhiều lần. Kết luận hợp lý nhất? *(một đáp án)*
- A. Nhân viên khối đó làm việc kém, cần kỷ luật
- **B. Nên đưa hẳn việc đó vào bộ mẫu nhiệm vụ cho lần sau, thay vì mỗi lần lại tạo phát sinh** ✔
- C. Nên xoá loại phát sinh đó đi
- D. Nên chuyển loại đó sang tab Có phí

*Giải thích:* Việc lặp đều đặn không còn là «phát sinh» — nó là một bước của quy trình.

---

## Phần C — Các bước thực hiện (câu 14–20)

**Câu 14.** Trình tự đúng khi mở Quản lý nhiệm vụ mỗi sáng? *(một đáp án)*
- A. Chưa có hạn → Tuần sau → Hôm nay → Quá hạn
- **B. Quá hạn → Hôm nay → Chưa có hạn** ✔
- C. Hôm nay → Ngày mai → Tuần sau
- D. Thứ tự nào cũng như nhau

*Giải thích:* Quá hạn là nợ của hôm qua, xử lý trước. Rổ Chưa có hạn soát để không bỏ sót việc chìm.

**Câu 15.** Các trường **bắt buộc** khi tạo một việc phát sinh? *(nhiều đáp án)*
- **A. Loại phát sinh** ✔
- **B. Loại nhiệm vụ** ✔
- **C. Người chịu trách nhiệm** ✔
- **D. Ít nhất một người làm** ✔
- E. Số tiền phát sinh
- F. Ngày hết hạn

*Giải thích:* Không phải nhập hạn — hệ thống tự tính theo SLA của loại. Số tiền không bắt buộc lúc tạo.

**Câu 16.** Chọn **Lỗi từ nhân viên** thì phải điền thêm trường nào? *(một đáp án)*
- A. Số tiền bồi thường
- **B. Khối gây lỗi (CRM / Xưởng / Lắp đặt)** ✔
- C. Tên quản lý trực tiếp
- D. Mức độ nghiêm trọng

*Giải thích:* Không có khối gây lỗi thì báo cáo chất lượng không quy được về đâu.

**Câu 17.** Cách nhanh nhất để tạo một việc phát sinh khi đang trao đổi trong bình luận của deal? *(một đáp án)*
- A. Mở tab mới vào `/sx/phat-sinh`
- **B. Gõ dấu `/` ngay trong ô bình luận để bật form gọn** ✔
- C. Gửi email cho quản lý
- D. Ghi vào tab Ghi chú rồi tạo sau

*Giải thích:* Form `/` gửi vào cùng một luồng với form đầy đủ: vẫn bắn thông báo, vẫn tự đăng bình luận nhắc tên, vẫn đồng bộ sang nhiệm vụ.

**Câu 18.** Kéo thẻ dự án sang cột mới trên Dashboard thì bị chặn. Nguyên nhân đúng? *(một đáp án)*
- A. Mạng chậm
- B. Không có quyền kéo thẻ
- **C. Cột hiện tại còn nhiệm vụ gắn cờ «chặn chuyển giai đoạn» chưa hoàn thành** ✔
- D. Dự án chưa có ngày lắp

*Giải thích:* Hệ thống chặn và liệt kê rõ các việc còn thiếu. Hoàn thành hoặc huỷ chúng rồi kéo lại.

**Câu 19.** Lỡ chọn nhầm loại phát sinh, việc nằm sai tab. Xử lý đúng? *(một đáp án)*
- A. Huỷ việc rồi tạo lại từ đầu
- **B. Mở việc, đổi lại loại — việc tự nhảy sang tab đúng và hạn tính lại theo loại mới** ✔
- C. Nhờ admin sửa trực tiếp dưới cơ sở dữ liệu
- D. Để nguyên, cuối tháng báo kế toán điều chỉnh

*Giải thích:* Lưu ý hạn sẽ tính lại theo SLA của loại mới, nên kiểm tra lại hạn sau khi đổi.

**Câu 20.** Loại phát sinh cần dùng chưa có trong danh mục. Làm gì? *(một đáp án)*
- A. Chọn tạm một loại gần giống cho xong việc
- **B. Báo admin thêm loại mới ở trang Setup phát sinh rồi mới tạo việc** ✔
- C. Bỏ trống trường loại
- D. Ghi tên loại vào phần mô tả

*Giải thích:* Một lần lấy đỡ loại khác là báo cáo hỏng cả quý. Trường loại cũng không bỏ trống được — hệ thống chặn.

---

### Đáp án nhanh

| Câu | Đ | Câu | Đ | Câu | Đ | Câu | Đ |
|---|---|---|---|---|---|---|---|
| 1 | B | 6 | A,B | 11 | B | 16 | B |
| 2 | B | 7 | B | 12 | B | 17 | B |
| 3 | B | 8 | B | 13 | B | 18 | C |
| 4 | A,B,C,D,E,F | 9 | B | 14 | B | 19 | B |
| 5 | C | 10 | A,B,D | 15 | A,B,C,D | 20 | B |

---
---

# BÀI 4 — Tình huống: xử lý phát sinh tại xưởng

- **Loại bài tập:** `simulation` · **Thứ tự:** 4
- **Điểm đạt:** 70 · **Thời gian:** 20 phút · **Số lượt làm:** 3
- Bước đánh dấu **[BẮT BUỘC]** mà sai thì **không đạt**, dù tổng điểm vẫn trên ngưỡng.

## Đề bài hiển thị cho học viên

> **Bối cảnh — thứ Năm, 14:30**
>
> Dự án **Bếp chị Hoa — Quận 7** đang ở công đoạn **Gia công**, ngày lắp theo kế hoạch là **thứ Tư tuần sau**.
>
> 14:30 chị Hoa gọi cho bạn: *«Em ơi chị đổi ý, 3 cánh tủ trên chị muốn đổi sang kính cường lực thay vì gỗ. Chị trả thêm tiền cũng được, miễn là kịp ngày lắp.»*
>
> Mười phút sau, tổ trưởng gia công nhắn: *«Sếp ơi, hôm qua thợ cắt nhầm kích thước 1 ngăn dưới, bên em phải làm lại, mất thêm 1 ngày. Lỗi của bên em.»*
>
> Bạn phải ghi nhận **cả hai việc** vào hệ thống, đúng loại, đúng người, đúng hạn.
>
> Biết rằng công ty đã khai sẵn các loại phát sinh sau:
>
> | Tên loại | Quy tắc hạn | Có phí |
> |---|---|---|
> | Kính cường lực | Cộng 3 ngày làm việc | Có phí |
> | Sơn lại cánh | Cộng 2 ngày làm việc | Có phí |
> | Làm lại chi tiết sai | Trong ngày | Không phí |
> | Sửa bản lề | Trong ngày | Không phí |

## Các bước chấm điểm

### Phần 1 — Việc của khách hàng (đổi sang kính cường lực)

**Bước 1.1** — Mở đúng trang để tạo việc *(2 điểm)*
- Đáp án đúng: `/sx/phat-sinh` — Quản lý phát sinh
- *Gợi ý khi sai:* Đây là việc ngoài kế hoạch, không phải nhiệm vụ của bộ mẫu. Vào Quản lý phát sinh.

**Bước 1.2 [BẮT BUỘC]** — Chọn loại phát sinh *(3 điểm)*
- Đáp án đúng: **Kính cường lực**
- *Gợi ý khi sai:* Chọn đúng tên loại khách yêu cầu. Loại quyết định cả hạn lẫn tab.

**Bước 1.3** — Việc này sẽ nằm ở tab nào? *(2 điểm)*
- Đáp án đúng: **Có phí**
- *Gợi ý khi sai:* Nhìn cột «Có phí» của bảng loại trong đề. Người tạo không chọn tab, loại quyết định.

**Bước 1.4 [BẮT BUỘC]** — Chọn Loại nhiệm vụ *(3 điểm)*
- Đáp án đúng: **Phát sinh từ khách hàng**
- *Gợi ý khi sai:* Khách đổi ý, nội bộ không làm sai gì. Đừng đánh là lỗi nhân viên.

**Bước 1.5** — Hạn hệ thống tự tính là ngày nào? *(3 điểm)*
- Đáp án đúng: **Thứ Ba tuần sau** (thứ Năm + 3 ngày làm việc = Sáu, Hai, Ba)
- *Gợi ý khi sai:* Cộng 3 **ngày làm việc**, bỏ qua thứ Bảy và Chủ nhật.

**Bước 1.6** — Điền người chịu trách nhiệm *(2 điểm)*
- Đáp án đúng: chọn **đúng một người**
- *Gợi ý khi sai:* Trường bắt buộc, và chỉ một người.

**Bước 1.7** — Việc này kịp ngày lắp thứ Tư tuần sau không? *(2 điểm)*
- Đáp án đúng: **Kịp, nhưng sát — chỉ dư 1 ngày**
- *Gợi ý khi sai:* Hạn thứ Ba, lắp thứ Tư. Kịp nhưng không có chỗ cho sự cố, phải báo khách điều này.

### Phần 2 — Việc lỗi nội bộ (cắt nhầm kích thước)

**Bước 2.1 [BẮT BUỘC]** — Chọn loại phát sinh *(3 điểm)*
- Đáp án đúng: **Làm lại chi tiết sai**
- *Gợi ý khi sai:* Không có loại nào khớp hơn. Đừng lấy đỡ loại khác.

**Bước 2.2 [BẮT BUỘC]** — Chọn Loại nhiệm vụ *(3 điểm)*
- Đáp án đúng: **Lỗi từ nhân viên**
- *Gợi ý khi sai:* Tổ trưởng đã nhận lỗi của bên mình. Ghi đúng để báo cáo chất lượng phản ánh thật.

**Bước 2.3 [BẮT BUỘC]** — Chọn khối gây lỗi *(3 điểm)*
- Đáp án đúng: **Xưởng (SX)**
- *Gợi ý khi sai:* Thợ cắt thuộc xưởng. Trường này chỉ hiện khi đã chọn «Lỗi từ nhân viên».

**Bước 2.4** — Việc này nằm ở tab nào? *(2 điểm)*
- Đáp án đúng: **Không phí**
- *Gợi ý khi sai:* Lỗi nội bộ, công ty tự chịu. Không tính tiền khách.

**Bước 2.5** — Có được bỏ qua không ghi việc này vì không thu tiền không? *(3 điểm)*
- Đáp án đúng: **Không — vẫn phải ghi**
- *Gợi ý khi sai:* Phát sinh không phí là dữ liệu chất lượng. Không ghi thì không biết lỗi lặp ở khâu nào.

### Phần 3 — Hệ quả và xử lý tiếp

**Bước 3.1** — Lỗi nội bộ làm chậm 1 ngày. Việc cần làm ngay là gì? *(3 điểm)*
- Đáp án đúng: **Rà lại ngày lắp và báo khách nếu có nguy cơ trễ**
- *Gợi ý khi sai:* Hai việc cộng lại đang ăn hết khoảng dư trước ngày lắp.

**Bước 3.2** — Ghi lý do dời hạn ở đâu? *(2 điểm)*
- Đáp án đúng: **Bình luận của việc / dự án**
- *Gợi ý khi sai:* Ghi lại để tháng sau còn truy được vì sao trễ.

**Bước 3.3** — Sang tuần, soát hai việc này ở đâu để biết đã xong chưa? *(2 điểm)*
- Đáp án đúng: `/sx/phat-sinh` — soát cả hai tab, hoặc **Báo cáo phát sinh**
- *Gợi ý khi sai:* Hai việc nằm hai tab khác nhau, phải soát cả hai.

**Bước 3.4** — Việc «Kính cường lực» đã làm xong nhưng chưa ghi chi phí. Hậu quả? *(2 điểm)*
- Đáp án đúng: **Đang để rơi tiền — kế toán có cảnh báo riêng cho trường hợp này**
- *Gợi ý khi sai:* Việc có phí mà không ghi phí thì cuối tháng không xuất được hoá đơn bổ sung.

---

### Tổng điểm

| Phần | Số bước | Điểm |
|---|---|---|
| Phần 1 — việc của khách | 7 | 17 |
| Phần 2 — lỗi nội bộ | 5 | 14 |
| Phần 3 — hệ quả | 4 | 9 |
| **Tổng** | **16** | **40** |

Đạt từ **28/40 điểm (70%)** và **không sai bước bắt buộc nào**.

Năm bước bắt buộc: 1.2 · 1.4 · 2.1 · 2.2 · 2.3 — đều là bước phân loại. Phân loại sai thì mọi con số phía sau đều sai, nên không cho qua.
