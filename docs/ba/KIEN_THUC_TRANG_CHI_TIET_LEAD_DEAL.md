# Kiến thức trang chi tiết Lead / Deal

> Dành cho Sale CRM, admin công ty và người bàn giao xưởng / VC.  
> Màn hình: **CRM → Kanban → bấm thẻ** → `/crm/leads/:id` (cùng một trang cho cả Lead và Deal).  
> Nguồn đối chiếu UI: `LeadDetail`, `PipelineStepper`, các tab trên cột phải.

**Cách đọc tài liệu:** mỗi vùng có *chức năng / mục đích*, rồi ngay dưới là **Hướng dẫn thao tác từng bước** (đúng nhãn nút trên phần mềm).

### Mục lục

- [0. Vì sao phải nắm từng vùng](#0-vì-sao-phải-nắm-từng-vùng-trên-trang-này)
- [Vào trang chi tiết](#vào-trang-chi-tiết--thao-tác-mở-hồ-sơ)
- [1. Header](#1-header--nhận-diện-hồ-sơ-và-thao-tác-lớn)
- [2. Stepper giai đoạn](#2-stepper-giai-đoạn-pipeline)
- [3. Bản đồ hàng tab](#3-bản-đồ-hàng-tab--chọn-đúng-kênh)
- [4. Công việc](#4-tab-công-việc) · [5. Không gian chung](#5-tab-không-gian-chung) · [6. Đặt hàng](#6-tab-đặt-hàng)
- [7. Tài liệu](#7-tab-tài-liệu) · [8. Drive](#8-tab-drive) · [9. Ghi chú & HĐ](#9-tab-ghi-chú--hoạt-động)
- [10. Facebook / Zalo](#10-tab-facebook-và-zalo-oa) · [11. Thành viên](#11-tab-thành-viên)
- [12. Bình luận](#12-tab-bình-luận) · [13. Lịch sử](#13-tab-lịch-sử) · [14. Ghi âm](#14-tab-ghi-âm)
- [16. Thứ tự khi mở hồ sơ](#16-mục-tiêu-tổng-thể--dùng-trang-như-một-bàn-làm-việc)
- [17. Checklist](#17-checklist-tự-kiểm-deal-thật-hoặc-deal-thuchanh)

---

## 0. Vì sao phải nắm từng vùng trên trang này

Một hồ sơ khách không phải “một form”. Đó là **nơi làm việc cả vòng đời**: từ hỏi giá → khảo sát → báo giá → ký HĐ → đặt hàng phụ → bàn giao xưởng / lắp đặt.

Mục tiêu của trang:

1. **Không mất ngữ cảnh** — người khác mở cùng hồ sơ vẫn biết khách đang ở đâu, đã nói gì, file nào đã có.
2. **Không nhầm kênh** — việc bán hàng, chat nội bộ, hội thoại khách, file, PO, ghi âm… mỗi thứ một tab.
3. **Chặn tiến độ giả** — kéo giai đoạn khi task chưa xong thì hệ thống chặn; KPI và báo cáo mới đúng.

### Ba vùng trên một màn hình

| Vùng | Ở đâu | Việc chính |
|------|--------|------------|
| **Header** | Thanh trên cùng | Nhận diện hồ sơ + thao tác lớn (chuyển Deal, sự kiện, kế hoạch SX…) |
| **Stepper giai đoạn** | Ngay dưới header | Xem / đổi cột pipeline (cùng nghĩa với kéo thẻ Kanban) |
| **Cột trái Thông tin** | Trái | Sửa SĐT, giá trị, nguồn, phụ trách, deadline thẻ |
| **Hàng tab (cột phải)** | Phải | Nơi làm việc hàng ngày: task, file, chat, PO… |

Lead và Deal **dùng chung trang**. Khác nhau ở nút header và một số tab chỉ hiện theo điều kiện.

### Vào trang chi tiết — thao tác mở hồ sơ

1. Đăng nhập → menu trái **CRM**.
2. Mở **Bảng Lead** hoặc **Bảng Deal** (Kanban).
3. Lọc đúng **công ty** (nếu admin thấy nhiều công ty).
4. Bấm **thẻ** khách trên Kanban (hoặc tìm theo tên / SĐT / mã rồi bấm thẻ).
5. Trang chi tiết mở. Cuộn nhẹ: trên là header + stepper, trái là Thông tin, phải là hàng tab.
6. (Tuỳ chọn) Bấm **Hướng dẫn chi tiết** trên header để tour từng nút ngay trên màn hình đang mở.

Quay Kanban: bấm **mũi tên** góc trái header — hệ thống giữ bộ lọc và focus lại thẻ vừa xem.

---

## 1. Header — nhận diện hồ sơ và thao tác lớn

**Chức năng:** Thanh hành động của cả ca làm việc. Không nằm ở menu trái.

**Mục đích:** Thao tác “đổi trạng thái hồ sơ” hoặc “mở luồng lớn” phải một chỗ, không rải trong từng tab.

**Mục tiêu:** Người phụ trách mở hồ sơ là biết đây Lead hay Deal, khách nào, phân loại gì, rồi bấm đúng nút cho bước tiếp theo.

### 1.1. Khối nhận diện (trái)

| Thành phần | Tác dụng | Mục tiêu |
|------------|----------|----------|
| Nút mũi tên về | Quay Kanban CRM, giữ filter / thẻ đang focus | Không lạc pipeline đang lọc |
| Ghim | Ghim thẻ lên đầu Kanban **của bạn** | Ưu tiên hồ sơ nóng, không mất trong đống thẻ |
| Đã tương tác | Đánh dấu đã liên hệ khách (bật/tắt tay) | Phân biệt “đã đụng” vs “chưa gọi” trên bảng |
| Badge **LEAD** / **DEAL** | Phân biệt giai đoạn kinh doanh | Lead = chưa cam kết mua; Deal = đã chốt / đang làm HĐ–SX |
| Mã (`LEAD-6535`…) | Định danh cố định | Tra cứu, bàn giao, đối soát KPI |
| Tên hồ sơ + bút sửa | Đổi tiêu đề tại chỗ | Tiêu đề phải nhận ra khách + khu vực + sản phẩm |
| **Phân loại** (vd. Bếp) | Loại lead/deal theo danh mục công ty | Báo cáo theo loại SP; xưởng nhận đúng pack việc |

### 1.2. Nút hành động (phải) — đúng nhãn phần mềm

| Nút | Khi hiện | Chức năng / tác dụng | Mục đích | Mục tiêu |
|-----|----------|----------------------|----------|----------|
| **Hướng dẫn chi tiết** | Luôn | Bật tour từng vùng trên trang | Onboarding tại chỗ | Nhân viên mới biết bấm đâu, không cần hỏi Zalo |
| **Chuyển Deal** | Chỉ **Lead** | Đổi type Lead → Deal, sang pipeline Deal | Khi khách đã cam kết mua | Một chiều (có **Trả về Lead** phía Deal nếu cần sửa) |
| **Trả về Lead** | Chỉ **Deal** | Deal → Lead, chọn lại phụ trách. Nếu đã có dự án SX: **gỡ liên kết**, không xóa xưởng | Sửa nhầm “đã chốt” | Hồ sơ về đúng giai đoạn chăm sóc |
| **Chuyển người phụ trách** | Đúng quyền | Đổi công ty / khu vực / Sale | Bàn giao vùng, không tạo hồ sơ mới | Một khách — một người chịu KPI |
| **Tạo sự kiện** | Luôn | Lịch gắn đúng hồ sơ này (khảo sát, gặp, ký HĐ…) | Nhắc hẹn trên lịch CRM | Team thấy cùng một lịch, không hẹn miệng |
| **Thêm / Sửa phiếu khảo sát** | Khi giai đoạn có form khảo sát | Nhảy tab **Công việc** và mở form | Thu thập số đo / hiện trạng | Phiếu nằm trên task, không ghi Zalo rời |
| **Import Excel** | Luôn | Nhập báo giá từ file Excel vào hồ sơ | Đưa BG khách vào hệ thống | Xưởng / kế toán lấy đúng file, không gửi USB |
| **Thiết lập kế hoạch SX & VC/LĐ** | **Deal**, chưa có dự án | Form công ty xưởng, ngày lắp, VC/LĐ → tạo dự án | Bàn giao sản xuất có lịch | Deal có project_id, xưởng nhận việc |
| **Kế hoạch SX & VC/LĐ** | Deal **đã** có dự án | Sửa lịch lắp / VC (đúng quyền) | Điều chỉnh sau khi đã tạo xưởng | Lịch trên deal và dự án khớp |
| **Tạo đơn hàng phát sinh** | Deal khách hàng (đúng điều kiện) | Tạo **deal + dự án SX mới**, cột đầu tab Khách hàng | Phát sinh thêm hạng mục sau đơn gốc | Không nhầm với tab **Đặt hàng** (PO mua vật tư) |

**Phân biệt dễ nhầm**

- **Tạo đơn hàng phát sinh** (header) = deal mới từ khách đang có.  
- **Tab Đặt hàng** = lệnh mua hàng (PO) **trong** deal đang mở.

Khi Deal có dự án, dưới header còn **dải CRM · Sản xuất · VC/LĐ** — bấm để nhảy sang chi tiết cùng đơn ở module khác.

### Hướng dẫn thao tác từng bước — Header

#### A. Sửa tên hồ sơ

1. Bấm **icon bút** cạnh tiêu đề.
2. Gõ tên rõ: *Tên khách — khu vực — sản phẩm* (vd. `Chicuong Chen — Bếp`).
3. Bấm **Lưu** (xanh) hoặc **Hủy**.

#### B. Ghim / đánh dấu đã tương tác

1. Bấm **ghim** (icon pin) → thẻ lên đầu Kanban của bạn. Bấm lại để bỏ ghim.
2. Bấm **dấu check** (đã tương tác) sau khi đã liên hệ khách. Bấm lại nếu đánh nhầm.

#### C. Chạy tour hướng dẫn

1. Bấm **Hướng dẫn chi tiết** (nút xanh nhạt, icon sách).
2. Làm theo từng bước trên overlay. **Tiếp** để qua bước; có thể bỏ qua bước tùy chọn nếu hồ sơ chưa có task.

#### D. Chuyển Lead → Deal

1. Chỉ hiện khi badge đang là **LEAD**.
2. Kiểm tra cột trái: đủ **tên khách + SĐT** (thiếu thì hệ thống báo, bổ sung rồi thử lại).
3. Bấm **Chuyển Deal** (nút xanh lá).
4. Đọc popup: điều kiện, pipeline Deal, người phụ trách (nếu hệ thống yêu cầu).
5. Xác nhận **Chuyển sang Deal**.
6. Badge đổi thành **DEAL**. Hồ sơ sang pipeline Deal; tài liệu / task / hoạt động giữ nguyên.

#### E. Trả Deal → Lead

1. Chỉ hiện khi đang là **DEAL**.
2. Bấm **Trả về Lead**.
3. Chọn **người phụ trách Lead mới** (bắt buộc).
4. Nhập **lý do**.
5. Nếu deal đã có dự án SX: đọc cảnh báo, **tích** «Tôi xác nhận gỡ liên kết dự án SX khỏi deal này» (không xóa xưởng).
6. Bấm **Trả về Lead**. Deal về cột nhận Lead trả về của pipeline Lead.

#### F. Chuyển người phụ trách

1. Bấm **Chuyển người phụ trách**.
2. Xem khối xám: công ty / khu vực / phụ trách **hiện tại**.
3. Nếu được chuyển công ty: chọn **Công ty** trước.
4. Chọn **Khu vực** → danh sách NV của khu vực đó.
5. Chọn **nhân viên** mới → xác nhận.
6. Kiểm lại cột trái: phụ trách đã đổi.

#### G. Tạo sự kiện gắn hồ sơ

1. Bấm **Tạo sự kiện**.
2. Chọn **loại sự kiện** (khảo sát, gặp khách, ký HĐ…).
3. Điền thời gian, địa điểm, ghi chú nếu có.
4. Lưu. Sự kiện gắn đúng lead/deal này — xem lại tại menu CRM → **Sự kiện**.
5. Đóng form. Sửa / xóa sau trên trang Sự kiện.

Một số cột pipeline bật «tạo sự kiện khi vào» — khi bấm stepper vào cột đó, hệ thống **tự hỏi** lịch hẹn (giống bước G).

#### H. Phiếu khảo sát (nút cam trên header)

1. Nút chỉ hiện khi giai đoạn có form khảo sát.
2. Cam đậm **Thêm phiếu khảo sát** = chưa điền; cam nhạt **Sửa phiếu khảo sát** = đã có phiếu.
3. Bấm nút → hệ thống mở tab **Công việc** và mở form.
4. Điền số đo / hiện trạng → lưu.
5. Không tìm phiếu ở tab Ghi chú.

#### I. Import Excel báo giá

1. Bấm **Import Excel**.
2. Chọn file theo **mẫu báo giá của công ty** (không dùng file khách tùy hứng nếu lệch cột).
3. Xem trước / xác nhận import.
4. Kiểm tra kết quả trên hồ sơ (dòng hàng / file BG). Sai file thì hủy, không import đè bừa.

#### J. Thiết lập / sửa kế hoạch SX & VC/LĐ (chỉ Deal)

1. Deal **chưa** có dự án: bấm **Thiết lập kế hoạch SX & VC/LĐ**.
2. Deal **đã** có dự án: bấm **Kế hoạch SX & VC/LĐ** để sửa lịch (đúng quyền).
3. Trong form: chọn **công ty SX**, ngày lắp, thông tin VC/LĐ — chi tiết điền form học khoá **Kế hoạch SX & VC/LĐ**.
4. Lưu → hệ thống tạo / cập nhật dự án xưởng.
5. Kiểm tab **Thành viên**: phụ trách VC thường được **tự thêm**.
6. Dải **CRM · Sản xuất · VC/LĐ** hiện dưới header: bấm **Sản xuất** để sang trang xưởng cùng đơn, rồi quay lại deal.

#### K. Tạo đơn hàng phát sinh (Deal khách hàng)

1. Không nhầm với tab **Đặt hàng**.
2. Bấm **Tạo đơn hàng phát sinh**.
3. Chọn lại công ty SX và kế hoạch lắp (theo form).
4. Lưu → hệ thống tạo **deal mới + dự án SX**, thẻ ở cột đầu tab Khách hàng.
5. Banner teal trên hồ sơ phát sinh: bấm tên để **mở deal nguồn**.

---

## 2. Stepper giai đoạn (Pipeline)

**Chức năng:** Hàng vòng tròn dưới header. Mỗi vòng = một cột pipeline (vd. Chờ sale xác nhận → Khảo sát → Báo giá → Ký HĐ → Đang sản xuất…).

**Tác dụng:**

- Vòng hiện tại tô màu cột; vòng đã qua có dấu ✓; vòng chưa tới xám.
- **Bấm một vòng** = chuyển giai đoạn (cùng nghiệp vụ kéo thẻ Kanban).
- Hệ thống có thể **chặn** và mở popup: nhiệm vụ bắt buộc chưa xong, thiếu người, thiếu deadline, lý do thua, hoặc hỏi tạo sự kiện (vd. vào cột khảo sát).

**Mục đích:** Pipeline phản ánh **tiến độ thật** của khách — không phải trang trí bảng.

**Mục tiêu:**

1. Mọi người nhìn hồ sơ biết khách đang ở bước nào, không hỏi lại.
2. Báo cáo / KPI theo cột đúng (kéo sai cột = số liệu sai).
3. Gate nhiệm vụ: không “kéo đẹp” khi việc chưa làm.

**Cách dùng đúng**

1. Làm việc trên tab **Công việc** (hoàn thành task, ghi chú, file).
2. Khi đủ điều kiện mới bấm vòng tiếp theo (hoặc kéo Kanban).
3. Nếu bị chặn: đọc thông báo, bổ sung task / người / deadline rồi thử lại.

### Hướng dẫn thao tác từng bước — Stepper

#### Chuyển giai đoạn từ trang chi tiết

1. Nhìn hàng vòng: **✓ xanh** = đã qua; **vòng tô màu + chữ đậm** = đang đứng; **vòng xám** = chưa tới.
2. Cuộn ngang nếu pipeline dài (nhiều cột).
3. Bấm **vòng cột muốn tới** (thường là cột kế tiếp; nhảy xa có thể bị chặn tùy cấu hình).
4. Nếu **không có popup** — đã chuyển. Kiểm lại chữ đậm dưới vòng.
5. Nếu **có popup**, xử lý đúng loại:
   - *Nhiệm vụ bắt buộc chưa xong* → **Đóng** popup → tab **Công việc** → hoàn thành (ô tròn + ghi chú/file nếu bắt) → bấm stepper lại.
   - *Thiếu người / deadline* → chọn NV, đặt hạn → xác nhận.
   - *Lý do thua* → nhập lý do → xác nhận (cột thua).
   - *Tạo sự kiện khi vào cột* (vd. khảo sát) → điền lịch như mục G header → lưu.
6. Cách khác: về Kanban, **kéo thẻ** sang cột mới — cùng một rule chặn.

#### Deal / Lead đang thua — hồi lại

1. Banner đỏ **Hồi lại deal** (hoặc tương đương) trên hồ sơ thua.
2. Bấm → xác nhận.
3. Hồ sơ trở lại pipeline đang chạy; không tạo mã mới.

#### Cột hiện tại không nằm trên thanh

Nếu có khung vàng *«Giai đoạn hiện tại … không nằm trong danh sách cột đang hiển thị»*: cột đã tắt hoặc đổi pipeline — báo admin, **đừng** bấm lung tung các vòng để “sửa”.

**Lưu ý CRM (không linear như xưởng)**

- Deal có thể bỏ qua cột SX/VC trên stepper CRM (cột đó thuộc module xưởng / lắp).
- Cột **thua** có banner **Hồi lại deal**.
- Tên cột **do công ty cấu hình** — ví dụ trên ảnh: *Chuyển về lead → Chờ sale xác nhận → Chờ khảo sát → Đã khảo sát → Đang báo giá → Đã gửi BG → Theo dõi thêm → Cọc lên bản vẽ → Đã ký HĐ → Đang sản xuất*.

---

## 3. Bản đồ hàng tab — chọn đúng kênh

Dùng bảng này **trước** khi ghi gì đó vào hồ sơ:

| Tab | Kênh gì | Đối tượng đọc | Không dùng để |
|-----|---------|---------------|----------------|
| **Công việc** | Checklist bán hàng theo mẫu pipeline | Sale + người được gán task | Chat tán gẫu; giao việc xưởng (dùng Không gian chung) |
| **Không gian chung** | Giao việc cho **người** (CRM / SX / VC), kể cả công ty khác | Người được giao | Checklist mẫu giai đoạn |
| **Đặt hàng** | PO mua hàng gắn deal | Sale + mua hàng | Tạo deal phát sinh (dùng nút header) |
| **Tài liệu** | File / văn bản **trên hệ thống** | Team được chia sẻ khối | Chat Messenger với khách |
| **Drive** | File **Google Drive** gắn hồ sơ | Team dùng Drive chung | Thay thế 100% tab Tài liệu |
| **Ghi chú & HĐ** | Nhật ký chăm sóc khách + ghi chú nội bộ | Người xem hồ sơ | Chat nhóm thay cho quyết định |
| **Facebook / Zalo OA** | Hội thoại **với khách** trên kênh gốc | Sale phụ trách inbox | Thảo luận giá nội bộ |
| **Thành viên** | Ai được **vào** hồ sơ | Admin / phụ trách | Giao từng việc (dùng Không gian chung) |
| **Bình luận** | Chat **nội bộ** trên hồ sơ (+ thẻ bàn giao VC) | Thành viên hồ sơ | Ghi cuộc gọi với khách (dùng Ghi chú & HĐ) |
| **Lịch sử** | Nhật ký **hệ thống** (chuyển cột, hoàn thành task…) | Mọi người xem vết | Viết trao đổi (dùng Bình luận) |
| **Ghi âm** | File thoại / cuộc gọi gắn hồ sơ | Người bàn giao, QC | Thay thế ghi chú kết quả cuộc gọi |
| **Điểm chéo & KH** | Điểm sau nghiệm thu | Khi deal **Hoàn thành** | Bán hàng hàng ngày |

Tab **Facebook** / **Zalo OA** chỉ hiện khi hồ sơ có `inboxChannel` tương ứng.  
Tab **Điểm chéo & KH** chỉ hiện khi Deal ở cột Hoàn thành.

---

## 4. Tab Công việc

**Nhãn UI:** `✅ Công việc`  
**Tooltip:** Nhiệm vụ CRM (pipeline deal / lead)  
**Tour:** `lead-tab-tasks`

### Chức năng

Danh sách nhiệm vụ theo **mẫu pipeline** của giai đoạn: gọi khách, khảo sát, gửi BG, checklist “đủ thông tin”… Có phiếu khảo sát, ghi chú/file trên từng việc, gán người, deadline.

Deal có thể gạt **CRM / SX** để xem pack việc bán hàng hoặc pack xưởng (khi đã liên kết dự án).

### Tác dụng

- Tự tạo / gắn việc khi vào cột mới (auto-task theo mẫu).
- Nhiều cột **bắt buộc hoàn thành task** trước khi kéo stepper / Kanban.
- File và ghi chú trên task đồng bộ sang tab Tài liệu (và có thể chia sẻ xưởng).
- Widget lịch sử task thống nhất (CRM + dự án nếu có).

### Mục đích

Biến “cột Kanban” thành **việc cụ thể có chủ, có hạn, có minh chứng** — không chỉ đổi màu thẻ.

### Mục tiêu

1. Sale biết hôm nay phải làm gì trên hồ sơ này.
2. Quản lý đối soát: đã gọi chưa, đã đo chưa, đã đủ file chưa.
3. Chặn chuyển cột khi việc bắt buộc chưa xong → KPI đúng.

### Việc thường làm

- Hoàn thành (ô tròn) / đặt **Ngày hẹn** / gán người.
- Icon kẹp giấy: mô tả mẫu, checklist con, ghi chú, upload ảnh/PDF.
- Đủ / Chưa (verdict) — checklist thông tin trước khi kéo cột.
- **Gắn mẫu**, **Thêm việc**, **Xong hết** (cả nhóm — chỉ khi thật sự xong).
- Phiếu khảo sát: từ header hoặc từ dòng việc.

### Hướng dẫn thao tác từng bước — Công việc

#### Mở tab và đổi cách xem

1. Bấm **✅ Công việc** trên hàng tab (gạch chân xanh khi đang chọn).
2. Deal đã có pack xưởng: gạt **CRM / SX** để xem việc bán hàng hoặc việc xưởng.
3. Đổi kiểu xem: **List** (mặc định) · **Deadline** · **Planner** · **Lịch** — cùng một danh sách, khác cách sắp.

#### Gắn mẫu / bổ sung việc thiếu

1. Bấm **Gắn mẫu** (có thể có **Gắn mẫu VC/LĐ** nếu đúng ngữ cảnh lắp).
2. Chọn bộ mẫu **đúng pipeline / công ty** của hồ sơ — bấm tên mẫu.
3. Việc mẫu xuất hiện theo nhóm giai đoạn.
4. Nếu deal đã chuyển xưởng mà thiếu việc: **Bổ sung thiếu CRM** hoặc **Bổ sung thiếu SX**.

#### Thêm một việc trong nhóm

1. Trong nhóm giai đoạn, bấm **Thêm việc**.
2. Điền tiêu đề, hạn, người (nếu form hỏi) → lưu.
3. Việc mới nằm dưới nhóm đang mở.

#### Xử lý một dòng nhiệm vụ (hàng ngày)

1. Đọc **tên việc** — đây là việc phải làm.
2. Bấm **ô tròn bên trái** khi đã xong / bấm lại nếu chưa xong. Cột có gate: chưa tick thì **không kéo** được stepper.
3. Bấm **+ Ngày hẹn** (hoặc ngày đã có) để đặt / đổi deadline gọi-gặp.
4. Bấm **icon người** để gán 1 hoặc nhiều NV — họ nhận việc, có thể được @ trên Bình luận.
5. **Đủ / Chưa**: tick nhanh «Đã đủ thông tin» hoặc «Chưa» (+ lý do) trước khi chuyển cột.
6. Nút ghi nhận file/ghi chú: đánh dấu đã bổ sung minh chứng (theo dõi đủ thông tin — **không** tự chặn cột).
7. **Sửa** (icon bút): đổi tiêu đề, mô tả, ưu tiên, người.
8. **Xóa**: chỉ khi tạo nhầm. Cẩn thận với việc bắt buộc của giai đoạn.
9. **Giao việc CRM / SX / VC** trên dòng: mở bảng giao việc của khối (một số pack chỉ cho mở 1 việc tới lượt).

#### Ghi chú, file, checklist trên việc

1. Bấm **icon kẹp giấy** bên phải dòng → khung mở dưới dòng.
2. Đọc **mô tả / hướng dẫn mẫu** (nếu có).
3. **Checklist con**: tick từng mục; thêm ghi chú/file riêng mục nếu hiện ô.
4. Ô **ghi chú task**: viết kết quả cụ thể, vd. *«15h30 gọi chị Lan, hẹn đo T5 sáng, KH đồng ý»* — không chỉ «đã gọi».
5. **Đính kèm**: upload ảnh khảo sát, PDF BG, HĐ… Đồng nghiệp mở cùng hồ sơ đều thấy; file hiện badge trên dòng và có thể lên tab Tài liệu.
6. Nhiều giai đoạn **bắt** ghi chú hoặc file trước khi đánh dấu xong / kéo cột — đọc thông báo nếu bị chặn.

#### Phiếu khảo sát trên việc

1. Từ header **Thêm/Sửa phiếu khảo sát**, hoặc nút **Sửa phiếu** / **Xóa phiếu** trên đúng việc khảo sát.
2. Điền form → lưu. Xóa phiếu chỉ khi nhập nhầm.

#### Xong hết cả nhóm

1. Bấm **Xong hết** trên nhóm chỉ khi **mọi việc trong nhóm thật sự xong**.
2. Không bấm đầu ca «cho đẹp bảng».

#### Khôi phục việc xóa nhầm

Dùng **Khôi phục từ mẫu** (khi có) nếu việc mẫu bị xóa — gắn lại từ bộ mẫu, không tạo tay tên lệch.

### Lỗi hay gặp

- Bấm **Xong hết** khi khách chưa chốt → KPI/checklist sai.
- Tìm phiếu khảo sát ở Ghi chú — phiếu nằm **Công việc**.
- Nhầm với **Không gian chung**: đây là checklist mẫu, không phải “giao việc cho thợ xưởng”.

---

## 5. Tab Không gian chung

**Nhãn UI:** `🤝 Không gian chung`  
**Tooltip:** Phân công thành viên deal và nhiệm vụ giao chéo công ty  
**Tour:** `lead-tab-shared`

### Chức năng

Nơi **giao việc cho người** trên cùng một Deal: Sale, xưởng, VC, công ty khác. Lọc theo khối Bán hàng / Xưởng / Lắp đặt. Form giao việc: người, mô tả, hạn, ảnh, khối.

### Tác dụng

Người được giao thấy việc trên app (bảng giao việc + tab này), không phụ thuộc tin nhắn Zalo riêng. Deal phát sinh có link về deal nguồn / đơn anh em.

### Mục đích

Phối hợp đa công ty / đa khối trên **một đơn**, có vết trên hệ thống.

### Mục tiêu

1. Xưởng / VC nhận đúng việc Sale giao, đúng hạn.
2. Tránh “nhắn riêng rồi quên, không ai chịu trách nhiệm”.
3. Tách rõ: **mẫu pipeline** (Công việc) vs **việc giao cho người** (tab này).

### Việc thường làm

- Lọc **Tất cả / Bán hàng / Xưởng / Lắp đặt**.
- **Thêm** giao việc mới → Lưu.
- Sửa / xóa / thêm ảnh trên từng dòng.
- Link **Giao việc** ra bảng đầy đủ của khối.

### Hướng dẫn thao tác từng bước — Không gian chung

1. Bấm **🤝 Không gian chung**.
2. Đọc danh sách việc đã giao. Deal phát sinh: dùng link **Mở deal nguồn** / đơn anh em nếu có.
3. Lọc chip **Tất cả** · **Bán hàng** · **Xưởng** · **Lắp đặt** để thu hẹp theo khối.
4. **Giao việc mới:**
   1. Bấm **Thêm** (hoặc link **Giao việc** để ra bảng đầy đủ).
   2. Form «Giao việc mới»: chọn **người**, **khối**, mô tả, hạn, ảnh nếu cần.
   3. **Lưu**. Hủy nếu chỉ xem form (thực hành).
5. Trên từng dòng: **Sửa** nội dung/hạn/người; **Thêm ảnh**; **Xóa** nếu giao nhầm.
6. Người được giao phải có trong tab **Thành viên** (hoặc được hệ thống thêm) thì mới vào được deal — thiếu thì thêm Thành viên trước, rồi giao việc.

Thứ tự chuẩn: **Thành viên** (ai được vào) → **Không gian chung** (giao việc cho họ) → họ làm trên app.

### Lỗi hay gặp

- Giao việc trong tab Công việc rồi tưởng xưởng nhận — xưởng nhận ở đây / bảng Giao việc SX.
- Chỉ nhắn Zalo — mất vết, KPI không đối soát được.

---

## 6. Tab Đặt hàng

**Nhãn UI:** `🛒 Đặt hàng`  
**Tooltip:** Lệnh đặt hàng của deal — lọc theo trạng thái  
**Tour:** `lead-tab-orders`  
**Chỉ có trên chi tiết CRM** (trang SX/VC không có tab này).

### Chức năng

Quản lý **lệnh đặt hàng (PO)** gắn deal: tạo từ catalog hoặc nhập tay, lọc trạng thái, xem/sửa/xóa. Badge số = số PO.

Trạng thái: Nháp → Đã gửi MH → Xác nhận → Đã đặt NCC → Nhận 1 phần → Đã nhận / Đã hủy.

### Tác dụng

Theo dõi mua vật tư / hàng phát sinh **của đúng deal này**, hiện cả module Mua hàng. Tiêu đề PO tự theo deal.

### Mục đích

Tách luồng **mua hàng** khỏi luồng bán hàng và khỏi “đơn phát sinh” (deal mới).

### Mục tiêu

1. Sale / mua hàng biết deal này đã đặt gì, bao nhiêu tiền, đang ở bước nào.
2. Không nhầm PO với deal phát sinh trên header.
3. Catalog + dòng tay: đủ cả SP chuẩn và hạng mục ngoài list.

### Việc thường làm

- **Thêm** → chọn SP catalog hoặc gõ tên → Lưu.
- Chip lọc trạng thái; mắt / sửa / xóa từng dòng.

### Hướng dẫn thao tác từng bước — Đặt hàng

#### Tạo lệnh đặt hàng

1. Bấm **🛒 Đặt hàng**.
2. Bấm **Thêm** (góc phải) hoặc **Thêm mới** nếu danh sách trống.
3. Form hiện deal đang gắn (không đổi tay — PO theo hồ sơ này).
4. Chọn **Ngày** và **Trạng thái** (mới tạo thường **Nháp**).
5. Thêm dòng hàng — **một trong hai cách** (có thể kết hợp):
   - *Nhập tay:* gõ **Tên hàng** → SL → đơn giá → **+ Thêm**. Enter cũng thêm.
   - *Catalog:* lọc thương hiệu / danh mục / ô tìm tên-mã-SKU → **tick** SP. Tick lại để bỏ.
6. Sửa SL, đơn giá, tên trên từng dòng đã chọn; icon thùng rác để xóa dòng.
7. Ghi chú nếu cần → **Lưu**. Cần **ít nhất 1 dòng có tên**.
8. PO mới hiện trên bảng; badge số trên tab tăng.

#### Lọc, xem, sửa, xóa

1. Chip **Tất cả** hoặc chip trạng thái (chỉ hiện trạng thái đang có PO).
2. **Mắt** → popup chi tiết: mã, ngày, tổng, VAT, dòng hàng, khách. **Đóng**.
3. **Bút sửa** → cùng form, đổi dòng/trạng thái → **Lưu**.
4. **Thùng rác** → xác nhận `Xóa {mã}?` — không xóa PO đã đặt NCC nếu chưa hỏi mua hàng.

Luồng trạng thái gợi ý: Nháp → Đã gửi MH → Xác nhận → Đã đặt NCC → (Nhận 1 phần) → Đã nhận. **Đã hủy** khi thôi mua.

### Lỗi hay gặp

- Bấm **Tạo đơn hàng phát sinh** khi chỉ cần PO phụ kiện.
- Tạo PO rỗng (không có dòng hàng) — hệ thống yêu cầu ít nhất 1 dòng có tên.

---

## 7. Tab Tài liệu

**Nhãn UI:** `📋 Tài liệu`  
**Tour:** `lead-tab-documents`

### Chức năng

Kho file **trên app**: upload, nhập văn bản, tải ZIP (chia thư mục Deal → giai đoạn → nhiệm vụ → checklist). Gồm:

- File gắn trên nhiệm vụ (panel theo giai đoạn).
- Tài liệu xưởng **đã chia sẻ về CRM**.
- File đồng bộ từ task.
- File thêm trực tiếp trên lead/deal.

### Tác dụng

Bản vẽ, HĐ, ảnh khảo sát, BG… nằm trên hồ sơ. Có thể chia sẻ sang khối SX / VC. Xưởng không thấy file **chưa chia sẻ**, dù CRM đã upload.

### Mục đích

Hồ sơ giấy tờ **một nguồn** — không gửi Zalo riêng rồi mất.

### Mục tiêu

1. Người mới mở deal là tải được HĐ / bản vẽ.
2. Minh chứng KPI (ảnh đo, scan HĐ) đúng chỗ.
3. Xưởng nhận file khi được share — tránh “không có bản vẽ”.

### Việc thường làm

- **Nhập văn bản** / **Upload file** / **Tải tất cả**.
- Từng file: mở, in, tải, chia sẻ khối, xóa (đúng quyền).

### Hướng dẫn thao tác từng bước — Tài liệu

#### Upload file lên hồ sơ

1. Bấm **📋 Tài liệu**.
2. Bấm **Upload file** → chọn PDF / ảnh / CAD từ máy. Chờ «Đang tải lên...».
3. File vào nhóm **Tài liệu Lead** (thêm trực tiếp trên deal).

#### Nhập văn bản (không phải file máy)

1. Bấm **Nhập văn bản**.
2. Điền tên, loại, nội dung / ghi chú; chọn phòng ban / công ty được xem nếu form hỏi.
3. Lưu. Dùng cho biên bản, ghi nhớ chữ — không thay upload scan HĐ.

#### Tải cả kho về máy

1. Khi badge số > 0, bấm **Tải tất cả (N)**.
2. Chờ nén ZIP. File trong ZIP chia thư mục: Deal → giai đoạn → nhiệm vụ → checklist.

#### File từ nhiệm vụ / từ xưởng

1. Khối trên cùng: file gắn **theo task / giai đoạn** — bấm ảnh để xem lớn.
2. Khối tím **Tài liệu từ Sản xuất**: xưởng đã share về CRM — chỉ xem, không xóa từ CRM.
3. Khối đồng bộ từ NV: file task đẩy lên hồ sơ.

#### Chia sẻ sang xưởng / VC (quan trọng)

1. Trên dòng file CRM, mở **bánh răng / chia sẻ**.
2. Bật khối **SX** và/hoặc **VC**.
3. Lưu. **Chưa share thì xưởng không thấy**, dù file đã có trên tab này.

#### Xóa file

Chỉ file mình quản lý được / đúng quyền `canManageDeal`. Không xóa file xưởng read-only.

### Lỗi hay gặp

- Upload HĐ nhưng không share SX → xưởng báo thiếu file.
- Nhét cuộc gọi vào Tài liệu — cuộc gọi thuộc **Ghi chú & HĐ**.

---

## 8. Tab Drive

**Nhãn UI:** `☁️ Drive`  
**Tooltip:** File trên Google Drive đã gắn vào lead/deal này  
**Tour:** `lead-tab-drive`

### Chức năng

Gắn thư mục / file Google Drive vào hồ sơ: tải lên Drive, tạo Doc/Sheet, liên kết file có sẵn, tải xuống, xóa.

### Tác dụng

Team đang làm việc trên Drive công ty vẫn **neo file vào đúng khách**, không copy hết vào server app.

### Mục đích

Cầu nối CRM ↔ Drive: cùng một deal, mở tab là thấy folder khách.

### Mục tiêu

1. File lớn / cộng tác Google (bản vẽ, sheet BOQ) không phải upload lại mỗi lần.
2. Người bàn giao biết “folder Drive của đơn này là gì”.

### Khi nào dùng Tài liệu vs Drive

- **Tài liệu:** file cần kiểm soát trên hệ thống, share khối, ZIP theo task.  
- **Drive:** file sống trên Google, nhiều người sửa trên Drive.

Hai tab **bổ sung**, không thay thế nhau.

### Hướng dẫn thao tác từng bước — Drive

1. Bấm **☁️ Drive**.
2. **Thư mục:** bấm **Thư mục** → gõ tên → Enter (Esc hủy).
3. **Tải lên từ máy:** bấm **Tải lên từ máy** → chọn file (nhiều file được). File vào folder Drive của hồ sơ và tự gắn.
4. **Tạo Google Doc / Sheet:** bấm **Doc** hoặc **Sheet** — file mới gắn vào bản ghi.
5. **Gắn file đã có trên Drive:** bấm **Liên kết file Drive** → chọn file/folder có sẵn → xác nhận.
6. Đổi **list / lưới** bằng hai icon góc phải thanh công cụ.
7. Mở file bằng bấm tên (tab Google). **Tải xuống** / **Xóa** trên từng dòng khi cần gỡ khỏi hồ sơ.
8. Công ty chưa kết nối Drive: làm theo hướng dẫn trên tab (admin cấu hình), không upload vào đây được.

---

## 9. Tab Ghi chú & hoạt động

**Nhãn UI:** `📝 Ghi chú & HĐ`  
**Tooltip:** Ghi chú và lịch sử hoạt động  
**Tour:** `lead-tab-notes`

### Chức năng

Hai lớp:

1. **Ghi chú nội bộ** (ô soạn → Gửi Ctrl+Enter; sửa/xóa; có thể chia sẻ sang khối khác).
2. **Hoạt động** — timeline sự kiện với khách: Gọi điện, Gặp mặt, Email, Zalo, Ghi chú, Gửi báo giá… (nút **Thêm**). Hệ thống cũng ghi một số mốc (icon 🔄).

### Tác dụng

Nhật ký chăm sóc: ai gọi lúc nào, khách nói gì, kết quả ra sao. Đọc 30 giây trước cuộc gọi tiếp theo.

### Mục đích

Lưu **tương tác với khách** (và ghi chú vận hành), tách khỏi chat nội bộ team.

### Mục tiêu

1. Bàn giao ca / nghỉ phép: người mới đọc được lịch sử, không hỏi lại khách.
2. Minh chứng đã liên hệ (SLA, KPI đúng hạn).
3. Không nhầm với **Bình luận** (nội bộ) hay **Facebook** (tin khách).

### Phân biệt nhanh

| Cần ghi | Đúng tab |
|---------|----------|
| “15h gọi chị Lan, hẹn đo T5” | Ghi chú & HĐ (hoạt động Gọi điện) |
| “@Nam xem giúp giá cánh” | Bình luận |
| Tin Messenger khách | Facebook |
| Ảnh hiện trạng khảo sát | Công việc (file task) hoặc Tài liệu |

### Hướng dẫn thao tác từng bước — Ghi chú & HĐ

#### Gửi ghi chú nội bộ

1. Bấm **📝 Ghi chú & HĐ**.
2. Gõ vào ô soạn (trên cùng).
3. **Gửi** hoặc **Ctrl+Enter**.
4. **Sửa** ghi chú cũ → **Lưu** / **Hủy**. Admin/manager có thể sửa ghi chú người khác.
5. **Chia sẻ sang khối khác** nếu xưởng/VC cần đọc ghi chú CRM.

#### Thêm hoạt động (gọi, gặp, Zalo…)

1. Kéo xuống khối **Hoạt động** → bấm **Thêm**.
2. Chọn loại: **Gọi điện** · **Gặp mặt** · **Email** · **Zalo** · **Ghi chú** · **Bình luận @** · **Gửi báo giá**.
3. Nhập **tiêu đề** + **nội dung** (khách nói gì, hẹn gì) + **kết quả** nếu có.
4. Ngày hoạt động: mặc định hôm nay, đổi nếu ghi muộn.
5. Lưu. Dòng mới hiện trên timeline (icon theo loại, người tạo, giờ).

Quy tắc ghi tốt: *thời điểm + đã làm gì + khách phản hồi + bước tiếp*. Ví dụ: *«14h gọi, hẹn đo thứ 5, KH đồng ý»*.

### Lỗi hay gặp

- Chỉ chat Bình luận, không ghi hoạt động → KPI / lịch sử chăm sóc trống.
- Thảo luận giá với khách trên Facebook rồi không tóm tắt vào hoạt động.

---

## 10. Tab Facebook (và Zalo OA)

**Nhãn UI:** `📘 Facebook` (hoặc `💬 Zalo OA`)  
**Tour:** `lead-tab-facebook` / `lead-tab-zalo`  
**Chỉ hiện** khi hồ sơ đến từ kênh inbox đó.

### Chức năng

Hội thoại Messenger (hoặc Zalo OA) **gắn đúng lead/deal**: xem lịch sử, trả lời, đính ảnh/file, đồng bộ thread.

### Tác dụng

Sale trả lời khách ngay trên hồ sơ, không mở Facebook riêng rồi mất ngữ cảnh CRM.

### Mục đích

Giữ **kênh khách** và **hồ sơ CRM** là một. Lead từ fanpage không bị “chat một nơi, task một nơi”.

### Mục tiêu

1. Không bỏ sót tin khách khi đang làm việc trên deal.
2. Nội bộ không thảo luận giá / quyết định trên kênh khách — quyết định ghi Ghi chú / Tài liệu / Công việc.

### Lỗi hay gặp

- Đàm phán nội bộ trên Messenger khách.
- Lead không từ Facebook thì **không có tab** — đừng tìm.

### Hướng dẫn thao tác từng bước — Facebook / Zalo OA

1. Chỉ làm khi thấy tab **📘 Facebook** hoặc **💬 Zalo OA** trên hàng tab.
2. Bấm tab → khung hội thoại với khách (cuộn trong khung chat, không kéo cả trang).
3. Đọc tin chưa trả. Nếu ít tin, hệ thống có thể **tự đồng bộ** lịch sử; hoặc bấm làm mới nếu có nút.
4. Gõ trả lời → **Gửi**. Đính ảnh / file / bộ ảnh (Facebook) bằng icon kẹp / ảnh trên ô soạn.
5. Quyết định nội bộ (giá, ngày lắp) **không** viết vào thread khách — ghi **Bình luận** hoặc **Ghi chú & HĐ**, file vào **Tài liệu**.
6. Sau cuộc chat: vào **Ghi chú & HĐ → Thêm** loại Zalo/gọi để tóm tắt (để người không mở Messenger vẫn nắm).

---

## 11. Tab Thành viên

**Nhãn UI:** `👥 Thành viên`  
**Badge:** ba số CRM / SX / VC (xanh / teal / cam)  
**Tour:** `lead-tab-team`

### Chức năng

Danh sách người được **xem và vào** hồ sơ. Thêm / xóa / đổi vai trò. Ai không trong list (trừ admin đúng quyền) thì không vào deal.

Khi lưu kế hoạch SX & VC/LĐ, hệ thống **tự thêm** phụ trách VC vào đây — nên kiểm lại sau khi lưu kế hoạch.

Nút mở sang **Không gian chung** để giao việc sau khi đã thêm người.

### Tác dụng

Phân quyền theo hồ sơ: Sale, xưởng, lắp đặt cùng thấy deal nhưng KPI phụ trách chính không đổi.

### Mục đích

Kiểm soát **ai được nhìn khách này** — không phải nơi giao từng task.

### Mục tiêu

1. Đủ người cần phối hợp; không lộ deal cho người ngoài.
2. Badge theo khối: biết deal đã “kéo” bao nhiêu người CRM / SX / VC.
3. Thành viên hỗ trợ ≠ thay người phụ trách chính (KPI vẫn một chủ).

### Lỗi hay gặp

- Thêm người nhưng không giao việc → họ vào được deal nhưng không có task (dùng Không gian chung).
- Nhầm “thêm thành viên” với “chuyển người phụ trách” (nút header đổi Sale chịu KPI).

### Hướng dẫn thao tác từng bước — Thành viên

1. Bấm **👥 Thành viên**. Ba số trên tab = số người theo khối **CRM / SX / VC**.
2. **Thêm người:**
   1. Khối xanh **Thêm thành viên**.
   2. Chọn **công ty hệ sinh thái** → **khu vực** → tìm NV (ô lọc).
   3. Chọn **Quyền mặc định** (thường `member`).
   4. Tick từng người (hoặc **Chọn tất cả** / **Bỏ chọn**).
   5. Bấm **+ Thêm N người vào danh sách** (hàng chờ).
   6. Kiểm list chờ → lưu / gửi vào nhóm.
3. Trên từng dòng đã có: đổi **vai trò** nếu được; **Xóa** → xác nhận «Xóa thành viên khỏi nhóm?».
4. Cần họ **làm việc** (không chỉ xem): bấm sang **Không gian chung** (nút trên tab nếu có) rồi giao việc.
5. Sau **lưu kế hoạch SX & VC/LĐ**: mở lại tab này, xác nhận phụ trách VC đã có mặt.

Đổi **người chịu KPI** không làm ở đây — dùng header **Chuyển người phụ trách**.

---

## 12. Tab Bình luận

**Nhãn UI:** `💬 Bình luận`  
**Tour:** `lead-tab-comments`  
**Đây là kênh trao đổi nội bộ chuẩn trên từng hồ sơ.**

### Chức năng

Thread chat trên lead/deal: gửi tin, @mention, đính file, trả lời, sửa/xóa, reaction, đã đọc. Deal có mẫu trả lời nhanh.

Sau khi xưởng bàn giao lắp: thẻ **Bàn giao Lắp đặt** — Sale đọc rồi **Chọn & bàn giao** (luồng chi tiết ở khoá Kế hoạch SX & VC/LĐ).

Thông báo hệ thống (chuyển cột, hoàn thành task…) **không** nằm đây — nằm tab **Lịch sử**.

### Tác dụng

Mọi thành viên mở cùng hồ sơ thấy một luồng. Hỏi đồng nghiệp / xưởng tại chỗ, có file, có vết.

### Mục đích

Thay chat Zalo nhóm rời: bàn giao và hỏi đáp **neo vào đúng khách**.

### Mục tiêu

1. Ưu tiên viết ở đây khi hỏi về hồ sơ này — tour gọi đây là tab quan trọng nhất.
2. @ đúng người để họ nhận việc / thông báo.
3. File trao đổi nhanh vẫn gắn deal (bản vẽ gửi kèm comment), bên cạnh tab Tài liệu.

### Lỗi hay gặp

- Chỉ nhắn Zalo riêng → người thay ca không đọc được.
- Nhầm Bình luận với Ghi chú: Bình luận = team; Ghi chú & HĐ = nhật ký khách / ghi nhớ vận hành.
- Tìm log “đã chuyển cột” trong Bình luận — sang **Lịch sử**.

### Hướng dẫn thao tác từng bước — Bình luận

#### Trao đổi nội bộ

1. Bấm **💬 Bình luận**.
2. Gõ tin. Gõ **@** rồi chọn người (phụ trách / thành viên) để họ nhận thông báo.
3. Đính file/ảnh nếu cần (bản vẽ gửi kèm cho xưởng xem nhanh).
4. Deal: có thể bấm **mẫu trả lời nhanh** rồi sửa trước khi gửi.
5. **Gửi**. Thread realtime — người khác mở cùng hồ sơ thấy ngay.
6. Trên từng tin: **Trả lời** (thread con), **Sửa**, **Xóa** (tin mình / đúng quyền), thả **reaction**.
7. Cuộn lên tin cũ; hệ thống đánh dấu **đã đọc** khi bạn mở tab.

#### Thẻ bàn giao lắp đặt (khi xưởng xong)

1. Cuộn thread, tìm thẻ **Bàn giao Lắp đặt** (không lẫn với chat thường).
2. Đọc thông tin xưởng gửi (ngày, ghi chú, file).
3. Bấm **Chọn & bàn giao** khi đồng ý. Chi tiết cột tạm / ngày lắp: khoá **Kế hoạch SX & VC/LĐ**.
4. Không bấm nếu chưa kiểm file — hỏi lại trên cùng thread bằng @ xưởng.

---

## 13. Tab Lịch sử

**Nhãn UI:** `🕘 Lịch sử`  
**Tour:** `lead-tab-history`

### Chức năng

Timeline **comment loại hệ thống**: hoàn thành nhiệm vụ, chuyển giai đoạn, mốc máy sinh. Chỉ đọc, không phải ô chat.

### Tác dụng

Đối soát “ai / lúc nào / hệ thống ghi gì” khi tranh cãi tiến độ hoặc audit.

### Mục đích

Tách **vết máy** khỏi **chat người**, để Bình luận không bị lẫn thông báo tự động.

### Mục tiêu

1. Truy vết chuyển cột và hoàn thành task.
2. QC / quản lý xem hồ sơ đã đi qua những mốc nào mà không đọc hết chat.

### Lỗi hay gặp

- Viết trao đổi vào đây — không gửi được; dùng Bình luận.
- Tưởng Lịch sử = hoạt động gọi khách — hoạt động nằm **Ghi chú & HĐ**.

### Hướng dẫn thao tác từng bước — Lịch sử

1. Bấm **🕘 Lịch sử**.
2. Đọc timeline từ mới → cũ: hoàn thành task, chuyển giai đoạn, mốc máy.
3. Mỗi dòng: nội dung hệ thống + giờ + người liên quan (nếu có).
4. **Không có ô gửi tin.** Cần hỏi đồng nghiệp → tab **Bình luận**. Cần ghi cuộc gọi → **Ghi chú & HĐ**.

Dùng khi: «Ai kéo cột lúc nào?», «Task X xong chưa theo máy?», audit KPI.

---

## 14. Tab Ghi âm

**Nhãn UI:** `Ghi âm` (icon micro)  
**Tour:** `lead-tab-voice`

### Chức năng

Danh sách file ghi âm / cuộc gọi gắn lead/deal: nghe lại, hướng gọi (đến/đi), trạng thái chuyển văn bản (STT) nếu có. Upload thường ở trang **Cuộc gọi & ghi âm**, rồi hiện lại đây.

### Tác dụng

Bàn giao ca, QC nội dung trao đổi với khách, đối soát cam kết miệng.

### Mục đích

Giữ **bằng chứng thoại** trên đúng hồ sơ, không nằm máy cá nhân.

### Mục tiêu

1. Người nhận bàn giao nghe lại được cuộc gọi.
2. Lead có thể yêu cầu STT; Deal tùy cấu hình.
3. Vẫn tóm tắt kết quả vào **Ghi chú & HĐ** — file nghe không thay thế nhật ký.

### Lỗi hay gặp

- Chỉ lưu ghi âm, không ghi “khách hẹn T5 đo” → người sau phải nghe cả file.
- Tìm nút ghi âm cuộc gọi trên tab này — tab chủ yếu **nghe / xem**, ghi mới ở module cuộc gọi.

### Hướng dẫn thao tác từng bước — Ghi âm

1. Bấm **Ghi âm** (icon micro).
2. Danh sách file gắn hồ sơ: hướng **Gọi đến / Gọi đi**, giờ, badge STT (Đã có văn bản / Đang chuyển / Lỗi…).
3. Bấm phát để **nghe**.
4. Nếu là Lead và có nút chuyển văn bản: bấm để STT (chờ trạng thái **Đã có văn bản**), mở bản ghi chữ.
5. Làm mới danh sách nếu vừa ghi cuộc gọi ở trang **Cuộc gọi & ghi âm**.
6. **Bắt buộc sau khi nghe / gọi:** tab **Ghi chú & HĐ → Thêm → Gọi điện**, tóm tắt kết quả — người sau không phải nghe cả file.

Ghi cuộc gọi mới: vào module cuộc gọi / tổng đài của hệ thống, gắn đúng lead/deal — **không** giả định nút Record nằm trên tab này.

---

## 15. Tab ẩn theo điều kiện (cùng hàng tab)

| Tab | Điều kiện | Vai trò ngắn |
|-----|-----------|----------------|
| **Zalo OA** | `inboxChannel === 'zalo'` | Như Facebook, kênh Zalo |
| **Điểm chéo & KH** | Deal ở cột Hoàn thành | Nhập/xem điểm chéo sau nghiệm thu — không dùng lúc đang bán |
| **Phê duyệt** (nếu bật) | Deal có `project_id` | Gửi duyệt xưởng; chưa có dự án thì hướng dẫn thắng / tạo dự án |

**Điểm chéo từng bước (khi tab hiện):** bấm **⭐ Điểm chéo & KH** → nhập/xem điểm theo form → lưu. Không dùng tab này lúc đang tư vấn / khảo sát.

---

## 16. Mục tiêu tổng thể — dùng trang như một “bàn làm việc”

| Thứ tự ưu tiên khi mở hồ sơ | Việc |
|-----------------------------|------|
| 1 | Đọc stepper: khách đang cột nào |
| 2 | Cột trái: SĐT, địa chỉ, phụ trách, 6 trường bắt buộc |
| 3 | **Ghi chú & HĐ** + **Lịch sử**: đã xảy ra gì |
| 4 | **Công việc**: hôm nay làm task nào, có bị gate không |
| 5 | **Bình luận**: team đang hỏi gì, có thẻ bàn giao không |
| 6 | **Tài liệu / Drive**: đủ file chưa, đã share SX chưa |
| 7 | **Không gian chung / Thành viên**: đúng người cùng làm |
| 8 | **Đặt hàng / Ghi âm / Facebook**: khi đúng ngữ cảnh |

**Ba nguyên tắc**

1. **Đúng tab đúng việc** — nhầm kênh = mất vết, KPI sai, xưởng “không thấy file”.  
2. **Kéo cột sau khi làm việc** — stepper là kết quả, không phải trang trí.  
3. **Neo vào hồ sơ** — Zalo/Messenger chỉ là kênh khách; quyết định và file phải lên app.

### Một vòng làm việc trong ngày (làm lần lượt)

1. Mở Kanban → bấm thẻ cần xử lý (ghim / đã tương tác nếu đúng).
2. Đọc **stepper**: đang cột nào.
3. Cột trái: kiểm SĐT, địa chỉ, phụ trách; bấm dòng để sửa thiếu.
4. **Ghi chú & HĐ** + **Lịch sử**: 30 giây nắm đã gọi gì, máy ghi gì.
5. **Công việc**: làm task hôm nay — tick xong, ngày hẹn, file/ghi chú.
6. Đủ điều kiện → **bấm vòng stepper** (hoặc kéo Kanban). Bị chặn thì quay bước 5.
7. **Bình luận**: @ người cần; kiểm thẻ bàn giao nếu deal đã qua xưởng.
8. File mới: **Tài liệu** (+ share SX) hoặc **Drive**.
9. Cần người khác cùng làm: **Thành viên** rồi **Không gian chung**.
10. PO / ghi âm / Facebook: chỉ khi đúng việc hôm đó.
11. Mũi tên về Kanban, sang thẻ tiếp.

---

## 17. Checklist tự kiểm (deal thật hoặc deal THUCHANH)

- [ ] Nhìn header: gọi đúng LEAD hay DEAL, mã, phân loại.
- [ ] Biết nút nào chỉ Lead (Chuyển Deal) và chỉ Deal (Trả về Lead, kế hoạch SX).
- [ ] Không nhầm **Tạo đơn hàng phát sinh** với tab **Đặt hàng**.
- [ ] Stepper: hiểu ✓ / cột hiện tại / bị chặn vì task.
- [ ] Công việc ≠ Không gian chung.
- [ ] Bình luận ≠ Ghi chú & HĐ ≠ Lịch sử ≠ Facebook.
- [ ] Tài liệu: biết chia sẻ sang SX; Drive: file Google.
- [ ] Thành viên: ai được vào; badge 3 khối.
- [ ] Ghi âm: nghe lại được; vẫn ghi kết quả cuộc gọi ở hoạt động.

**Thực hành thao tác (Hủy form nếu không muốn lưu dữ liệu thật):**

- [ ] Sửa tên hồ sơ → Hủy, hoặc Lưu nếu tiêu đề đang xấu.
- [ ] Bấm **Hướng dẫn chi tiết**, đi 3–4 bước tour rồi đóng.
- [ ] Lead: mở popup **Chuyển Deal**, đọc điều kiện, **đóng** nếu chưa chốt thật.
- [ ] Stepper: bấm cột hiện tại (không đổi); thử cột kế — nếu popup chặn thì đọc lý do, Đóng.
- [ ] Công việc → List → mở kẹp giấy một việc → thấy ô ghi chú/file.
- [ ] Không gian chung → **Thêm** → xem form → **Hủy**.
- [ ] Thành viên: thấy mình trong list; biết chỗ tick thêm người.
- [ ] Tài liệu: thấy **Upload file** / **Nhập văn bản**.
- [ ] Bình luận: gửi một tin test `@` đồng nghiệp rồi xóa nếu chỉ thực hành.
- [ ] Ghi chú & HĐ → **Thêm** hoạt động → Hủy.
- [ ] Đặt hàng → **Thêm** → thấy form gắn deal → Hủy.
- [ ] Drive: thấy **Tải lên từ máy** / **Liên kết file Drive** (nếu công ty đã kết nối).
- [ ] Lịch sử: mở và đọc ít nhất 1 dòng hệ thống (nếu có).
- [ ] Deal có dải CRM · SX · VC: bấm **Sản xuất**, xác nhận đúng dự án, quay lại deal.

Deal thực hành đặt tên **THUCHANH - tên bạn - ngày** — nhờ admin xóa sau, đừng để lệch báo cáo.

---

## 18. Liên kết đào tạo trong hệ thống

Khoá Kiến thức **«Thao tác chi tiết CRM — từng nút trên Lead / Deal»** (`scripts/knowledge/_detail_seed_crm.py`) dạy **chỗ bấm**.  
Khoá **Kế hoạch SX & VC/LĐ** dạy form ngày lắp, cột tạm, **Chọn & bàn giao**.

Hướng dẫn nghiệp vụ liên quan trong `docs/ba/`:

- `HUONG_DAN_CRM.md` — luồng Lead → Deal → BG → đơn → dự án  
- `guides/huong-dan-khong-gian-chung/` — giao việc chéo  
- `HUONG_DAN_CHUYEN_DEAL_SX.md` — thắng deal → xưởng  

Tài liệu này mô tả **từng vùng UI trên trang chi tiết** và **thao tác từng bước** theo đúng nhãn đang chạy trên phần mềm.
