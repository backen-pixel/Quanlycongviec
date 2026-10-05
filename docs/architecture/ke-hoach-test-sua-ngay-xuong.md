# Kế hoạch test — sửa ngày ở xưởng

Áp dụng cho hai commit vừa đẩy: `58ea0102` (vá 4 lỗi production) và `ad88a162`
(ghi lịch lắp nhiều đợt + nhánh dự phòng chỉ bỏ đúng cột lỗi).

---

## 0. Luật an toàn — đọc trước khi chạy bất cứ thứ gì

Dự án này **không có môi trường staging**. Mọi script chạy từ `backend/` đều nối
thẳng vào **database production** qua `.env`. Chính vì vậy:

- **Cấm** mọi câu `UPDATE` / `DELETE` không có `where` bám vào một id cụ thể.
- **Cấm** chạm vào bất kỳ dự án có thật nào. Test ghi chỉ được tạo và sửa dữ liệu
  **do chính nó tạo ra**, mã dự án bắt đầu bằng `ZZTEST-`.
- Mọi test có ghi phải dọn sạch trong `finally`, kể cả khi assert thất bại.
- Trước mỗi câu ghi, kiểm lại `code` của dòng sắp ghi có đúng tiền tố `ZZTEST-`
  không; không đúng thì ném lỗi, không ghi.
- Một bước lỗi thì **dừng và báo lại**, không tự đổi cách làm rồi chạy tiếp.

Lý do luật này tồn tại: ngày 05/10/2026 một hàm đồng bộ đã ghi `delivery_date = NULL`
lên nhiều dự án cùng lúc bằng một câu `UPDATE ... WHERE id IN (...)`. Đó đúng là
thứ mình đang đi sửa — đừng lặp lại nó bằng chính test.

---

## Tầng 1 — Unit test thuần, không chạm DB

Đây là tầng quan trọng nhất và cũng rẻ nhất. Hai đoạn logic vừa sửa đang **nằm
lẫn trong hàm lớn** nên không test được; việc đầu tiên là tách chúng ra thành hàm
thuần rồi export.

### T1.1 — Tách và test `cotThieuTuLoi(message)`

Trong `backend/src/routes/projects.js`, nhánh dự phòng của `PUT /:id` đang tự dò
tên cột trong thông điệp lỗi. Tách phần dò đó ra một hàm thuần (đặt trong
`backend/src/helpers/projectDeliveryDates.js` hoặc một helper mới), export ra, rồi
để route gọi lại hàm đó. Không đổi hành vi, chỉ đổi chỗ đặt.

Các ca phải đúng:

| Thông điệp lỗi | Kỳ vọng |
|---|---|
| `column projects.install_occurrence_dates does not exist` | `'install_occurrence_dates'` |
| `column projects.vc_notes does not exist` | `'vc_notes'` |
| `Could not find the 'logistics_cost' column of 'projects' in the schema cache` | `'logistics_cost'` |
| `column projects.delivery_date does not exist` | `'delivery_date'` |
| `duplicate key value violates unique constraint "x"` | `null` |
| `column projects.khong_co_trong_danh_sach does not exist` | `null` |

Hai dòng cuối là quan trọng nhất: khi không nhận ra cột, route **phải ném lỗi ra
ngoài**, không được âm thầm chạy lại. Viết thêm một ca khẳng định điều đó.

Dạng thông điệp thứ ba là dạng PostgREST hay trả về thật — nó cũng chứa chữ
`column` nên nhánh cũ vẫn lọt vào, phải xử đúng.

### T1.2 — Tách và test phần tính patch của `syncPlacementFamilyDates`

Trong `backend/src/helpers/placeProjectAtWorkshops.js`, tách đoạn đầu của
`syncPlacementFamilyDates` (phần dựng biến `patch` từ `dates` và cờ
`choPhepXoaNgay`) ra hàm thuần `tinhPatchNgayGiaDinh(dates, { choPhepXoaNgay })`,
export ra để test. Phần truy vấn DB giữ nguyên.

Các ca:

- `{ delivery_date: '2026-10-20' }`, `choPhepXoaNgay: false`
  → patch có `delivery_date = '2026-10-20'` và `production_deadline = '2026-10-20'`.
- `{ delivery_date: null }`, `choPhepXoaNgay: false`
  → patch **không chứa** khoá `delivery_date`. Đây là chốt chặn chính, ca này mà
  hỏng là dữ liệu bị xoá trắng.
- `{ delivery_date: null }`, `choPhepXoaNgay: true`
  → patch có `delivery_date = null`. Người dùng cố ý xoá thì phải xoá được.
- `{ production_finish_date: null }`, `choPhepXoaNgay: false` → không chứa khoá đó.
- `{}` → patch rỗng, và hàm gọi ngoài phải thoát sớm không chạm DB.
- `{ delivery_date: '20/10/2026' }` (sai định dạng) → coi như không có ngày, và
  với `choPhepXoaNgay: false` thì **không** được biến thành `null` rồi ghi đè.

### T1.3 — `layTheoLo` lọc id rác

`backend/src/helpers/supabaseLo.js`. Gọi với `ids = ['null', 'undefined', 'NaN', '', null, undefined]`
→ phải trả `[]` **mà không gọi DB lần nào** (sau khi lọc thì danh sách rỗng nên
hàm thoát sớm). Test này không cần mạng.

Thêm ca: `['null', '<một uuid hợp lệ>']` → chỉ còn 1 id được gửi đi. Nếu muốn
kiểm phần gửi đi mà không chạm DB thì chèn một stub thay cho `supabase`.

### T1.4 — Mở rộng `sx-install-anchor-deadline.js`

Test này đã có và đã qua. Bổ sung ca xoá: gửi `{ delivery_date: '' }` và
`{ delivery_date: null }` → `installAnchorPersistPatch` phải trả
`install_occurrence_dates: []` chứ không phải bỏ qua khoá.

**Cách chạy tầng 1:** mỗi file một lệnh `node tests/<ten>.js`, theo đúng kiểu các
test sẵn có. Thêm script vào `backend/package.json` dạng `"test:ngay-xuong": "node tests/..."`.

---

## Tầng 2 — Đọc database, tuyệt đối không ghi

Viết một script `backend/scripts/kiem-tra-ngay-xuong.js` chỉ `SELECT`, in bảng kết quả.

1. **Cột đã có chưa** — `projects.source_project_id`, `projects.install_occurrence_dates`
   (phải là `ARRAY`), `production_pipeline_stages.is_phat_sinh`, chỉ mục `uq_drive_acl_cot`.
   Cả bốn đều phải có; migration 649 đã chạy ngày 05/10.
2. **Lệch ngày giữa đơn gốc và bản sao ở xưởng** — đếm số cặp trong
   `project_workshop_placements` mà `delivery_date` của hai bên khác nhau.
   Mốc trước khi sửa: **3/10 cặp lệch**. Sau khi sửa và dùng một thời gian, con số
   này phải **không tăng**.
3. **Đơn gốc bị NULL trong khi bản sao có ngày** — hiện là **2** (`TB-2026-909`,
   `TB-2026-740`). Con số này phải **không tăng**. Tăng là dấu hiệu chốt chặn hỏng.
4. **Quy kết có `ad_id` mà thiếu `lead_id`** — mốc 04/10 là 156/512. Chỉ để theo dõi,
   không phải lỗi.
5. **Phân tích quảng cáo có đang chạy không** — `max(tinh_luc)` của `fb_ad_analysis`
   phải cách hiện tại **dưới 2 tiếng**. Trước khi sửa nó đứng im từ 29/09.

Script này nên chạy được bất cứ lúc nào, kể cả về sau, để canh hồi quy.

---

## Tầng 3 — Test có ghi, nhưng chỉ trên dữ liệu tự tạo

Chỉ làm sau khi tầng 1 và 2 đều xanh. Viết `backend/tests/sx-dong-bo-ngay-live.js`,
chạy tay, **không** đưa vào CI.

Kịch bản:

1. Tạo 2 dự án mới mã `ZZTEST-GOC-<timestamp>` và `ZZTEST-XUONG-<timestamp>`,
   cùng `company_id` với nhau, `delivery_date = '2026-12-01'`.
2. Tạo một dòng `project_workshop_placements` nối hai dự án đó.
3. Gọi `PUT /projects/<id đơn gốc>` với `{ install_date: '2026-12-10T14:00:00+07:00' }`
   — **chỉ gửi `install_date`**, đây đúng là ca đã hỏng: trước khi sửa, bản sao
   không đổi theo.
   - Khẳng định: đơn gốc có `delivery_date = '2026-12-10'`.
   - Khẳng định: **bản sao cũng có `delivery_date = '2026-12-10'`**.
4. Gọi lại với `{ install_date: null }`.
   - Khẳng định: cả hai cùng về `null` — xoá có chủ ý thì phải lan.
5. Đặt lại ngày cho cả hai, rồi gọi `PUT` với một trường **không liên quan đến ngày**
   (ví dụ `{ notes: 'x' }`).
   - Khẳng định: `delivery_date` của **cả hai vẫn nguyên**. Đây là ca bắt lỗi xoá
     trắng ngoài ý muốn.
6. `finally`: xoá dòng placement rồi xoá hai dự án test. Trước mỗi lệnh xoá phải
   kiểm `code` bắt đầu bằng `ZZTEST-`.

Nếu bước 6 không xoá được (quyền `rm`/delete bị chặn), **dừng và báo**, đừng để
lại rác mang mã khác.

---

## Tầng 4 — Người kiểm bằng tay trên giao diện

Cursor không làm được phần này, để người dùng làm sau khi Render build xong.

1. **Đổi ngày ở xưởng** — mở một đơn có bản sao ở xưởng khác, đổi ngày lắp, tải lại
   trang. Ngày mới phải đứng yên, bản sao phải đổi theo.
2. **Lịch lắp nhiều đợt** — khai báo một dự án lắp 2 ngày, lưu, tải lại. Danh sách
   ngày phải còn. Đường ghi này trước giờ bị vứt bỏ nên chưa từng chạy thật.
3. **Nhận xét tự động** — vào tab Chiến dịch quảng cáo. Nếu còn băng đỏ "số liệu đã
   cũ" thì bấm *Phân tích lại ngay*; sau đó băng đỏ phải biến mất.
4. **Chia sẻ Drive** — chia sẻ một thư mục cho một người. Trước đây mỗi lần chia sẻ
   là một lỗi `ON CONFLICT` vào log dù giao diện vẫn chạy; giờ phải sạch log.

---

## Tiêu chí đạt

- Tầng 1: tất cả ca xanh, **đặc biệt là ca `delivery_date: null` + `choPhepXoaNgay: false`**.
- Tầng 2: bốn cột/chỉ mục đều có; số cặp lệch không tăng; số đơn gốc NULL vẫn là 2;
  `fb_ad_analysis` cách hiện tại dưới 2 tiếng.
- Tầng 3: cả 5 khẳng định đúng, và dữ liệu test được dọn sạch.
- Tầng 4: bốn mục người dùng xác nhận.

Đạt hết thì mới phục hồi ngày cho `TB-2026-909` (06/10) và `TB-2026-740` (03/09).

---

## Việc KHÔNG nằm trong kế hoạch này

- Không sửa thêm chức năng nào khác trong lúc test.
- Không đụng tới 19 đơn đã chốt đang để giá 0 — việc riêng, cần người xác nhận số.
- Không tự phục hồi hai ngày bị xoá. Chờ tầng 4 xong và người dùng đồng ý.
