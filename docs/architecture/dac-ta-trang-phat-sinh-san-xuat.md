# Trang Phát sinh ở Sản xuất — đặc tả

Hai tab, mỗi tab một Kanban: **Phát sinh không chi phí** và **Phát sinh có chi phí**.

---

## 0. Kết luận quan trọng nhất: gần như không phải dựng mới

Khảo sát ngày 05/10/2026 cho thấy **toàn bộ cơ chế đã có sẵn** trong hệ thống.
Không cần thêm bảng mới, không cần thêm cột mới vào database.

| Thứ cần có | Đã có sẵn ở đâu |
|---|---|
| Tách bảng Kanban thành nhiều tab | `production_pipeline_stages.board_tab` — đang chạy thật với `sx` (11 cột) và `cong_no` (6 cột) của HCB |
| Tab tự thêm ngoài hai tab cứng | `normalizeBoardTabValue` trả nguyên giá trị lạ (`t.slice(0, 80)`), `sxTachCongNo.js` ghi rõ "cột nào có board_tab thì vào đúng tab đó" |
| Cột khai báo riêng theo công ty | `production_pipeline_stages.company_id` + trang Cài đặt pipeline đã sửa được `board_tab` |
| Đánh dấu cột tiếp nhận phát sinh | `production_pipeline_stages.is_phat_sinh` (migration 648, chạy 05/10) |
| Tạo đơn phát sinh | `POST /production/projects/:id/phat-sinh` + helper `createPhatSinhProject` |
| Nối về đơn gốc | `projects.source_project_id` (migration 648) |
| **Người chịu trách nhiệm theo công ty** | `production_pipeline_stage_default_staff` (có `is_primary`) — gắn vào cột tiếp nhận của từng tab |
| Kanban, kéo thả | `KanbanView` dùng chung cho mọi tab |

Hiện trạng: **0 đơn phát sinh, 0 cột nào được đánh dấu `is_phat_sinh`** — vì 648 mãi
hôm qua mới chạy. Nên đây là lần đầu tiên tính năng được bật, không phải sửa cái hỏng.

---

## 1. Hai tab là hai luồng việc riêng

Theo anh mô tả: hai tab là hai luồng việc độc lập, HCB giao cho hai người khác nhau
(Công Trương và Sang), **và phải đổi được người theo từng công ty**.

Thiết kế theo đúng cách `sx` / `cong_no` đang chạy:

- `board_tab = 'ps_khong_chi_phi'` → tab **Phát sinh không chi phí**
- `board_tab = 'ps_co_chi_phi'` → tab **Phát sinh có chi phí**

**Một đơn thuộc tab nào là do CỘT nó đang đứng quyết định**, y hệt cơ chế hiện tại.
Không thêm cột `loai_phat_sinh` vào bảng `projects`: thêm vào là có hai nguồn sự thật,
rồi sẽ tới ngày chúng lệch nhau.

**Người chịu trách nhiệm** gắn vào **cột tiếp nhận** của mỗi tab qua
`production_pipeline_stage_default_staff` với `is_primary = true`. Mỗi công ty khai
cột riêng nên tự nhiên mỗi công ty có người riêng — không gắn cứng tên ai trong code.

---

## 2. Việc phải làm

### 2.1 Khai cột cho hai tab (dữ liệu, không phải DDL)

Chạy tay trên Supabase cho HCB (`18c2563f-3495-498d-8199-23200c9f420e`), hoặc khai
bằng tay trong trang Cài đặt pipeline. Mỗi tab tối thiểu ba cột, cột đầu đánh dấu
`is_phat_sinh = true` để `POST /phat-sinh` biết thả đơn vào đâu.

Gợi ý: Tiếp nhận → Đang xử lý → Hoàn thành.

**Lưu ý quan trọng:** `is_phat_sinh` hiện dùng để tìm cột đích. Có **hai** cột cùng
cờ đó thì `POST /phat-sinh` phải biết chọn cột nào — xem 2.2.

### 2.2 Backend: cho `/phat-sinh` nhận loại

`POST /production/projects/:id/phat-sinh` đang lọc
`stages.filter(s => s.is_phat_sinh === true)` rồi lấy cột đầu tiên. Khi có hai tab
thì phải nhận thêm tham số:

- Thân yêu cầu thêm `board_tab` (`'ps_khong_chi_phi'` | `'ps_co_chi_phi'`).
- Chọn cột có `is_phat_sinh = true` **và** `board_tab` khớp, trong đúng công ty.
- Không truyền `board_tab`, hoặc không tìm thấy cột khớp → **trả lỗi 400 nói rõ**,
  đừng đoán lấy cột đầu tiên. Đoán sai thì đơn rơi nhầm luồng và người nhầm sẽ ôm việc.
- Gán người phụ trách từ `production_pipeline_stage_default_staff` của cột đó
  (`is_primary = true`).

### 2.3 Frontend: trang mới

Route `/sx/phat-sinh`, thêm vào khối `<Route path="/sx" element={<ProductionLayout />}>`
trong `App.jsx` và vào sidebar của mô-đun Sản xuất.

- Hai tab ở đầu trang, mỗi tab render `KanbanView` với bộ cột lọc theo `board_tab`
  tương ứng — **dùng lại đúng component và cách lọc của `sxTachCongNo.js`**, đừng
  viết Kanban thứ hai.
- Kéo thẻ đổi cột: dùng lại đúng đường đã có (`PATCH /production/projects/:id/stage`).
- Thẻ hiển thị: mã đơn, tên, **đơn gốc** (`source_project_id` → mã đơn gốc, bấm vào
  mở được), người phụ trách, hạn.
- Nút **Tạo phát sinh** ngay trên trang: chọn đơn gốc → chọn tab → gọi `/phat-sinh`
  với `board_tab` của tab đang mở.

### 2.4 Tạo từ Không gian chung

Anh yêu cầu tạo được cả từ Không gian chung. Dùng lại đúng hộp thoại của 2.3, mở từ
đó, truyền sẵn đơn gốc đang xem. Không viết luồng tạo thứ hai.

---

## 3. Thứ tự làm

1. Khai cột cho hai tab của HCB (dữ liệu). Làm trước để các bước sau có cái mà thử.
2. Sửa `POST /phat-sinh` nhận `board_tab` + gán người phụ trách. Có test thuần cho
   phần chọn cột: đúng loại, sai loại, không có cột khớp.
3. Trang `/sx/phat-sinh` với hai tab + Kanban + kéo thả.
4. Nút tạo trên trang.
5. Mở hộp thoại tạo từ Không gian chung.

Bước 1–2 xong là đã dùng được bằng Kanban sẵn có; bước 3 chỉ là gom lại cho dễ nhìn.

---

## 4. Những chỗ dễ sai

- **Đừng thêm cột `loai_phat_sinh` vào `projects`.** Cột nó đứng đã là câu trả lời.
- **Đừng gắn cứng tên Sang / Công Trương vào code.** Anh đã nói rõ phải đổi được
  theo công ty. Để trong `production_pipeline_stage_default_staff`.
- **Đừng để `/phat-sinh` tự đoán cột** khi thiếu `board_tab`.
- **Đừng viết Kanban mới.** Dùng `KanbanView` đang chạy.
- Hai file sẽ sửa có kiểu xuống dòng khác nhau: `production.js` CRLF, `App.jsx` cần
  kiểm trước khi sửa. Trong git cả repo là LF; máy Windows bật `core.autocrlf=true`.

---

## 5. Chưa rõ, cần hỏi lại khi làm tới

Anh chọn "hai luồng việc riêng" nhưng chưa mô tả mỗi luồng làm gì khác nhau. Hiện
đặc tả này coi hai luồng **giống hệt nhau về thao tác**, chỉ khác bộ cột và người
phụ trách. Nếu luồng "có chi phí" cần thêm bước nhập tiền, duyệt chi, hay nối sang
sổ chi phí thì nói trước khi làm bước 3 — thêm sau sẽ phải sửa lại thẻ và hộp thoại.
