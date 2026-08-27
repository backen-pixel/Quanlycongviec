-- 567
-- Khoá «Đặt xưởng khác» — nút indigo trên trang chi tiết SX (ProductionDetail)
-- 5 bài (bài 5 = thi cuối + checklist). Bài tập dựa trên khoá 534 Kế hoạch SX & VC/LĐ
-- (cùng form ngày/VC). Ảnh tái sử dụng screenshot sx-vc-*.
-- Idempotent: ON CONFLICT DO UPDATE
-- Sinh: python scripts/knowledge/build_place_workshop_seed.py

BEGIN;
INSERT INTO knowledge_categories (id, name, slug, description, icon, sort_order, is_active)
VALUES (
  'd2000009-0000-0000-0000-000000000001',
  'Đặt xưởng khác — từ dự án SX sang xưởng nhận',
  'dat-xuong-khac',
  'Dành cho xưởng sản xuất. Học nút indigo «Đặt xưởng khác» trên trang chi tiết dự án SX: khi nào dùng, ai được bấm, điền form ngày/VC giống khoá Kế hoạch SX & VC/LĐ, rồi kiểm dự án nhận, thành viên và thẻ lắp đặt tạm.',
  '🏭',
  44,
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, slug = EXCLUDED.slug, description = EXCLUDED.description,
  icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order, is_active = true;

UPDATE knowledge_categories SET
  require_all_exercises_passed = true,
  deadline_mode = 'relative',
  deadline_duration_days = 14,
  deadline_note = 'Hoàn thành khoá trong 14 ngày kể từ khi mở bài đầu tiên',
  certificate_template = $ct${"signature_name": "Ban điều hành TuBep Pro", "signature_title": "Phụ trách đào tạo vận hành", "footer_note": "Chứng nhận đã nắm nút Đặt xưởng khác và quy tắc kế hoạch SX & VC/LĐ khi đặt sang xưởng nhận.", "accent_color": "#4f46e5"}$ct$::jsonb
WHERE id = 'd2000009-0000-0000-0000-000000000001';

-- BAI HOC
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000009-0000-0000-0000-000000000001',
  'd2000009-0000-0000-0000-000000000001',
  'Bài 1: Vì sao cần «Đặt xưởng khác»',
  'Phân biệt nút xưởng với kế hoạch Sale trên CRM, và với «Chuyển phân loại» cùng công ty.',
  $md_b2000009_0000_0000_0000_000000000001$# Bài 1: Vì sao cần «Đặt xưởng khác»

Một đơn tủ bếp đôi khi **không làm hết ở một xưởng**. Ví dụ Metalla làm thân tủ, HCB làm cánh kính; hoặc xưởng nhà thiếu công đoạn CNC nên đặt gia công ngoài.

Sale đã lập kế hoạch lần đầu trên CRM (khoá **Kế hoạch SX & VC/LĐ**). Khi đơn **đã có dự án SX** mà cần thêm xưởng thứ hai, người xưởng bấm nút indigo **Đặt xưởng khác** trên trang chi tiết dự án — không tạo deal mới, không xóa dự án đang làm.

## 1. Ba đường dễ lẫn

| Việc cần làm | Bấm đâu | Kết quả |
|---|---|---|
| Lần đầu: chọn xưởng, ngày lắp, VC/LĐ | CRM deal → **Thiết lập kế hoạch SX & VC/LĐ** | Tạo dự án SX + thẻ lắp đặt tạm |
| Thêm xưởng thứ hai / gia công ngoài | Trang SX → **Đặt xưởng khác** | Tạo thêm dự án ở **công ty SX khác** |
| Đổi loại hàng **cùng** công ty (Tủ bếp → Tủ áo) | Stepper cột có cờ chuyển phân loại | Đổi pipeline, **không** tạo xưởng mới |

Ảnh dưới là form kế hoạch phía **Sale** — cùng bảng chọn xưởng, phân loại, ngày. Nút xưởng dùng **cùng form đó**, chỉ khác chỗ bấm và nút chốt là **Tạo dự án**.

![Form kế hoạch SX & VC/LĐ trên CRM — cùng ô xưởng, phân loại, ngày lắp](/uploads/knowledge-screenshots/sx-vc-04b-form-cac-buoc.png)

## 2. Tư tưởng

- **Một deal, nhiều thẻ xưởng.** Mỗi cặp *công ty SX + phân loại* thành một dự án riêng trên Kanban xưởng nhận.
- **Xưởng nguồn không «đẩy việc» bằng Zalo.** Hệ thống tạo dự án, thêm NV mặc định vào thành viên deal, gửi bình luận @.
- **Lịch lắp / VC điền một lần, xưởng nhận dùng chung.** Form Đặt xưởng khác prefill ngày lắp, lấy hàng, công ty VC và ghi chú từ dự án nguồn — sửa nếu xưởng nhận khác lịch.

## 3. Tư duy — khi nào KHÔNG bấm

- Deal **chưa** có dự án SX → Sale dùng **Thiết lập kế hoạch**, không vào trang xưởng để đặt.
- Chỉ muốn đổi cột / phân loại **trong cùng xưởng** → dùng stepper **Chuyển phân loại**, không đặt xưởng khác.
- Đang ở module **VC/LĐ** → nút **không có**. Chỉ trang `/sx/projects/:id`.
- Đặt sang **chính công ty đang mở** → hệ thống từ chối. Phải chọn xưởng khác.

## 4. Ai làm gì sau khi đặt

1. **Xưởng nguồn** — chọn xưởng nhận + phân loại + ngày/VC, bấm **Tạo dự án**.
2. **Xưởng nhận** — thấy thẻ mới trên board mình, làm hàng, bấm cột bàn giao khi xong (như khoá kế hoạch bài 4).
3. **Sale** — đọc bình luận «đã đặt xưởng»; khi xưởng nhận bàn giao thì **Chọn & bàn giao** VC như đơn thường.
4. **VC/LĐ** — nếu form có công ty VC: thẻ vào cột lắp đặt tạm (badge **TẠM**) cho tới khi Sale xác nhận.

---

Bài sau: nút ở đâu, ai thấy, form mở ra những ô nào.
$md_b2000009_0000_0000_0000_000000000001$,
  '/uploads/knowledge-screenshots/sx-vc-04b-form-cac-buoc.png',
  $att_b2000009_0000_0000_0000_000000000001$[{"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-03-nut-ke-hoach.png", "caption": "CRM — nút Thiết lập kế hoạch (lần đầu, phía Sale)"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-04b-form-cac-buoc.png", "caption": "Cùng form xưởng / phân loại / ngày — xưởng dùng lại khi đặt xưởng khác"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png", "caption": "Trang chi tiết SX — chỗ có nút Đặt xưởng khác trên header"}]$att_b2000009_0000_0000_0000_000000000001$::jsonb,
  10,
  ARRAY['dat-xuong', 'sx', 'bai-1'],
  true,
  1,
  true,
  now()
) ON CONFLICT (id) DO UPDATE SET
  category_id = EXCLUDED.category_id, title = EXCLUDED.title, summary = EXCLUDED.summary,
  content_md = EXCLUDED.content_md, cover_image_url = EXCLUDED.cover_image_url,
  attachments = EXCLUDED.attachments, duration_minutes = EXCLUDED.duration_minutes,
  tags = EXCLUDED.tags, is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();

INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000009-0000-0000-0000-000000000002',
  'd2000009-0000-0000-0000-000000000001',
  'Bài 2: Nút ở đâu, ai được bấm, form mở ra gì',
  'Header trang chi tiết SX, quyền admin/NV xưởng cùng công ty, form prefill ngày/VC từ dự án nguồn.',
  $md_b2000009_0000_0000_0000_000000000002$# Bài 2: Nút ở đâu, ai được bấm, form mở ra gì

> _Nhìn badge **SX** trên header. Nút màu indigo, icon nhà máy, chữ **Đặt xưởng khác** — bên trái **Dự án đầy đủ**._

## 1. Nguồn lực — chỗ bấm

1. Vào **Sản xuất** → mở đúng thẻ dự án nguồn (`/sx/projects/:id`).
2. Trên hàng nút header (cùng hàng với tên deal): nút indigo **Đặt xưởng khác**.
3. Không thấy nút: đang ở **VC/LĐ**, hoặc tài khoản không thuộc công ty dự án và không phải admin.

Ảnh trang dự án SX (stepper bàn giao). Nút **Đặt xưởng khác** nằm **phía trên**, cùng hàng header — không nằm trên stepper.

![Trang chi tiết SX — stepper và header dự án](/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png)

## 2. Ai được bấm

Hệ thống cho phép khi **một** trong các điều sau đúng:

- Admin hệ thống hoặc tài khoản admin-like.
- Nhân viên / admin **Sản xuất** đúng **công ty của dự án nguồn**.

NV xưởng công ty khác, Sale-only, thợ VC: **không** thấy nút (trừ admin).

## 3. Form mở ra — cùng bảng CRM

Overlay **Đặt xưởng khác**:

- Cột trái: chọn **công ty SX nhận** (danh sách **đã loại** công ty đang mở) + **phân loại**.
- Ngày lắp, giờ **Sáng / Chiều**, hoàn thiện SX, lấy hàng VC, **công ty VC/LĐ**, ghi chú — giống khoá kế hoạch.
- Cột phải: **Lịch sự kiện VC/LĐ** (xem trước mốc).
- Ngày/VC **điền sẵn** từ dự án nguồn. Sửa nếu xưởng nhận khác lịch.
- Cuối overlay: **Hủy** và **Tạo dự án**.

Không còn công ty SX nào khác → dòng vàng «Không còn công ty SX khác để đặt».

## 4. Khối Đặt xưởng ở cột trái Thông tin

Sau khi đã đặt ít nhất một lần, cột trái hiện khối **Đặt xưởng**:

- **Đã đặt** — link sang dự án xưởng nhận (mã · tên xưởng, phân loại, ngày lắp / hoàn thiện, NV mặc định).
- **Nhận đặt từ** — khi bạn đang mở đúng dự án *nhận*: link về xưởng nguồn.
- **Xem bình luận thông báo →** nhảy tab Bình luận.

## 5. Lỗi hay gặp

- Tìm nút trên `/vc/projects/:id` — không có.
- Form trống công ty — đang tải, hoặc mọi xưởng SX đã đặt hết / chỉ còn đúng công ty mình.
- Bấm **Tạo dự án** mờ — chưa chọn đủ công ty + phân loại, hoặc đang tải phân loại.

---

Bài sau: điền form đúng quy tắc ngày và VC (lấy từ khoá Kế hoạch SX & VC/LĐ).
$md_b2000009_0000_0000_0000_000000000002$,
  '/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png',
  $att_b2000009_0000_0000_0000_000000000002$[{"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png", "caption": "Trang chi tiết SX — header có Đặt xưởng khác (indigo)"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-04-form-ngay-gio.png", "caption": "Form ngày giờ — prefill từ dự án nguồn, vẫn sửa được"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-05-chon-vc-ghi-chu.png", "caption": "Công ty VC/LĐ và ghi chú — cùng ô với kế hoạch Sale"}]$att_b2000009_0000_0000_0000_000000000002$::jsonb,
  12,
  ARRAY['dat-xuong', 'sx', 'bai-2'],
  true,
  2,
  true,
  now()
) ON CONFLICT (id) DO UPDATE SET
  category_id = EXCLUDED.category_id, title = EXCLUDED.title, summary = EXCLUDED.summary,
  content_md = EXCLUDED.content_md, cover_image_url = EXCLUDED.cover_image_url,
  attachments = EXCLUDED.attachments, duration_minutes = EXCLUDED.duration_minutes,
  tags = EXCLUDED.tags, is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();

INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000009-0000-0000-0000-000000000003',
  'd2000009-0000-0000-0000-000000000001',
  'Bài 3: Điền form — cùng quy tắc kế hoạch SX & VC/LĐ',
  'Công ty + phân loại, ngày lắp, giờ Sáng/Chiều, hoàn thiện −2 ngày, lấy hàng không sau ngày lắp, VC và ghi chú.',
  $md_b2000009_0000_0000_0000_000000000003$# Bài 3: Điền form — cùng quy tắc kế hoạch SX & VC/LĐ

Form **Đặt xưởng khác** dùng **cùng bộ ô** với khoá **Kế hoạch SX & VC/LĐ** (bài 3). Học một lần, bấm hai chỗ: Sale trên CRM, xưởng trên header SX.

Nếu chưa học khoá kia: đọc kỹ phần dưới. Đã học rồi: coi đây là **phiếu nhắc** khi đặt xưởng nhận.

## 1. Bắt buộc trước khi Tạo dự án

Mỗi dòng xưởng phải có:

1. **Công ty SX nhận** — khác công ty nguồn.
2. **Phân loại** — ví dụ Tủ bếp, Kính, Đá. Trùng *công ty + phân loại* với lần đặt trước thì hệ thống báo đã đặt.

Có thể thêm nhiều dòng (tối đa **5 xưởng / lần**). Không chọn công ty thì nút **Tạo dự án** mờ.

## 2. Ngày lắp, giờ, hoàn thiện SX

Ảnh form — đi theo khung:

![Bước chọn xưởng, phân loại, bấm ngày lắp](/uploads/knowledge-screenshots/sx-vc-04b-form-cac-buoc.png)

- **DEADLINE LẮP ĐẶT** — bấm ngày trên lịch. Lắp nhiều ngày thì bấm thêm ô.
- **Giờ lắp** — nút **Sáng** = 08:00, **Chiều** = 14:00. Prefill từ dự án nguồn (thường 14:00 nếu nguồn không có giờ).
- **Hoàn thiện SX** — **tự tính** = ngày lắp đầu trừ **2 ngày**. Ảnh: lắp 27/08 → hoàn thiện 25/08.

![Giờ Sáng/Chiều, hoàn thiện tự tính, lấy hàng VC](/uploads/knowledge-screenshots/sx-vc-04-form-ngay-gio.png)

## 3. Lấy hàng VC và công ty lắp đặt

- **Lấy hàng VC** — ngày xe tới xưởng. **Không được sau ngày lắp.** Cùng ngày hoặc trước thì đạt.
- **CÔNG TY VC / LẮP ĐẶT** — chọn công ty đã bật cột lắp đặt tạm (khoá kế hoạch bài 2).
- **GHI CHÚ CHO BÊN VC/LĐ** — chỉ hiện **sau khi** chọn công ty. Viết dặn xe và thợ: thang máy, chỗ đậu, hàng dễ vỡ.

![Chọn công ty VC/LĐ, ghi chú](/uploads/knowledge-screenshots/sx-vc-05-chon-vc-ghi-chu.png)

Đã chọn VC mà **quên ngày lắp** → form chặn. Đã nhập lấy hàng mà quên ngày lắp → cũng chặn.

## 4. Ghi chú nên viết gì (nhắc khoá kế hoạch)

- Hàng dễ vỡ, gọi khách trước 30 phút.
- Thang máy nhỏ, cần 2 thợ mang tay.
- Chỗ đậu xe: mặt tiền sảnh B, sau 18h mới được đậu.

Không viết giá bán, công nợ, mật khẩu.

## 5. Lỗi hay gặp ở bước này

- Đặt trùng HCB + Tủ bếp lần hai → «Đã đặt xưởng này (cùng phân loại) trước đó». Đổi phân loại hoặc mở đúng dự án đã tạo.
- Chọn nhầm **công ty nguồn** — không có trong list; nếu API gửi đúng id nguồn thì server từ chối.
- Không thấy ô ghi chú — chưa chọn công ty VC.
- Ngày lắp để trống nhưng có VC → không chốt được.

---

Làm bài kiểm tra (nhiều câu có ảnh khoá kế hoạch) trước khi qua bài 4.
$md_b2000009_0000_0000_0000_000000000003$,
  '/uploads/knowledge-screenshots/sx-vc-05-chon-vc-ghi-chu.png',
  $att_b2000009_0000_0000_0000_000000000003$[{"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-04b-form-cac-buoc.png", "caption": "Xưởng nhận, phân loại, ngày lắp"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-04-form-ngay-gio.png", "caption": "Sáng 08:00 / Chiều 14:00, hoàn thiện = lắp − 2 ngày"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-05-chon-vc-ghi-chu.png", "caption": "Công ty VC/LĐ và ghi chú"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-06-sua-lich.png", "caption": "Cùng ô khi Sale sửa lịch trên CRM"}]$att_b2000009_0000_0000_0000_000000000003$::jsonb,
  16,
  ARRAY['dat-xuong', 'sx', 'bai-3'],
  true,
  3,
  true,
  now()
) ON CONFLICT (id) DO UPDATE SET
  category_id = EXCLUDED.category_id, title = EXCLUDED.title, summary = EXCLUDED.summary,
  content_md = EXCLUDED.content_md, cover_image_url = EXCLUDED.cover_image_url,
  attachments = EXCLUDED.attachments, duration_minutes = EXCLUDED.duration_minutes,
  tags = EXCLUDED.tags, is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();

INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000009-0000-0000-0000-000000000004',
  'd2000009-0000-0000-0000-000000000001',
  'Bài 4: Sau khi Tạo dự án — kiểm gì, VC tạm ra sao',
  'Dự án nhận, khối Đặt xưởng, bình luận @, thành viên, mốc lịch và badge TẠM như khoá kế hoạch.',
  $md_b2000009_0000_0000_0000_000000000004$# Bài 4: Sau khi Tạo dự án — kiểm gì, VC tạm ra sao

Bấm **Tạo dự án** xong, overlay đóng, tab **Bình luận** mở. Hệ thống không chỉ «tạo thêm một mã».

## 1. Năm việc hệ thống tự làm

1. **Tạo dự án trên board xưởng nhận** — tên thường «Tên deal · HCB» (hoặc short_name xưởng nhận). Mô tả có dòng «Đặt từ dự án TB-xxxx (Metalla)».
2. **Lưu liên kết** nguồn ↔ nhận. Cột trái khối **Đặt xưởng → Đã đặt**.
3. **Gắn ngày / VC** đã điền lên dự án nhận (lắp, hoàn thiện, lấy hàng, ghi chú).
4. **Tạo mốc lịch dự kiến** nếu có ngày — Lấy hàng, Lắp đặt, Hoàn thiện SX — giống khoá kế hoạch bài 4.
5. **Thêm NV mặc định của phân loại xưởng nhận** vào thành viên deal + bình luận:

> 🏭 *Tên bạn* đã đặt xưởng (HCB) · TB-xxxx. @Nguyễn Văn B — vui lòng tiếp nhận dự án gia công «Tên deal».

Phân loại xưởng nhận **chưa setup NV** thì dự án vẫn tạo, nhưng không @ được ai — nhờ admin cấu hình nhân sự phân loại.

## 2. Thẻ TẠM phía VC — nhắc khoá kế hoạch

Nếu form có **công ty VC/LĐ** và ngày lắp:

- Thẻ dự án **nhận** vào **cột lắp đặt tạm**, badge **🔒 TẠM**, dòng **Ghi chú VC/LĐ**.
- Kéo thẻ sang cột khác **bị chặn** cho tới khi xưởng nhận bàn giao **và** Sale bấm **Chọn & bàn giao**.

![Bảng Lắp đặt — cột tạm, badge TẠM](/uploads/knowledge-screenshots/sx-vc-07-board-cot-tam.png)

![Thẻ phóng to — mã, TẠM, ghi chú](/uploads/knowledge-screenshots/sx-vc-07b-the-tam-ghi-chu.png)

**Không tạo thêm một dự án VC mới** lúc Sale xác nhận — chỉ chuyển cột, bỏ badge TẠM. Giống hệt khoá kế hoạch.

## 3. Xưởng nhận làm hàng rồi bàn giao

1. Xưởng nhận kéo / bấm cột **Đơn hàng đã chuẩn bị xong** (hoặc cột bàn giao VC của pipeline họ).
2. Sale nhận thẻ **Bàn giao Lắp đặt** trên deal → đọc lại VC đã điền (lúc đặt hoặc lúc Sale lập kế hoạch) → **Chọn & bàn giao**.

![Xưởng bấm bước bàn giao](/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png)

![Sale xác nhận — không tạo dự án VC mới](/uploads/knowledge-screenshots/sx-vc-09-the-ban-giao.png)

Xưởng nguồn **không** phải chọn công ty VC giúp xưởng nhận nếu đã điền lúc đặt. Xưởng nhận cũng **không** chọn VC lúc bấm cột bàn giao.

## 4. Phía dự án nhận

Mở `/sx/projects/:id` của xưởng nhận: khối **Đặt xưởng** có **Nhận đặt từ** — link về dự án nguồn.

## 5. Lỗi hay gặp

- Tạo xong không thấy thẻ trên board HCB — đang lọc sai công ty / phân loại trên Kanban SX.
- Không có bình luận @ — phân loại chưa có NV mặc định.
- VC không thấy thẻ TẠM — chưa chọn công ty VC trên form, hoặc công ty đó chưa bật cột lắp đặt tạm.
- Tưởng đặt xưởng khác = bàn giao VC xong — **chưa**. Vẫn đủ hai bước: xưởng nhận hoàn thiện + Sale xác nhận.

---

Bài 5: thực hành trên đơn THUCHANH rồi thi cuối.
$md_b2000009_0000_0000_0000_000000000004$,
  '/uploads/knowledge-screenshots/sx-vc-07b-the-tam-ghi-chu.png',
  $att_b2000009_0000_0000_0000_000000000004$[{"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-07-board-cot-tam.png", "caption": "VC — cột lắp đặt tạm sau khi đặt có ngày/VC"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-07b-the-tam-ghi-chu.png", "caption": "Badge TẠM và ghi chú trên thẻ"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png", "caption": "Xưởng nhận bấm cột bàn giao"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-09-the-ban-giao.png", "caption": "Sale Chọn & bàn giao — không tạo dự án VC mới"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-09b-chon-ban-giao.png", "caption": "Nút Chọn & bàn giao cuối thẻ"}]$att_b2000009_0000_0000_0000_000000000004$::jsonb,
  14,
  ARRAY['dat-xuong', 'sx', 'bai-4'],
  true,
  4,
  true,
  now()
) ON CONFLICT (id) DO UPDATE SET
  category_id = EXCLUDED.category_id, title = EXCLUDED.title, summary = EXCLUDED.summary,
  content_md = EXCLUDED.content_md, cover_image_url = EXCLUDED.cover_image_url,
  attachments = EXCLUDED.attachments, duration_minutes = EXCLUDED.duration_minutes,
  tags = EXCLUDED.tags, is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();

INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000009-0000-0000-0000-000000000005',
  'd2000009-0000-0000-0000-000000000001',
  'Bài 5: Thực hành Đặt xưởng khác + thi cuối',
  'Làm trên đơn THUCHANH, đối chiếu phiếu, quiz cuối (có câu khoá kế hoạch SX & VC/LĐ).',
  $md_b2000009_0000_0000_0000_000000000005$# Bài 5: Thực hành Đặt xưởng khác + thi cuối

Bạn **làm trên hệ thống** (đơn thực hành), rồi làm quiz cuối. Nhiều câu có **ảnh khoanh** từ khoá kế hoạch — form giống hệt.

Muốn **tập điền ngày/VC mà không tạo dự án thật**: mở khoá **Kế hoạch SX & VC/LĐ → Bài 5 → Sân tập mô phỏng**. Sân tập dùng cùng ô (HCB, Phúc Đạt, 2 ngày lắp, Sáng / Chiều). Khác chỗ bấm: sân tập chốt **Thêm dự án**; xưởng thật chốt **Tạo dự án**.

## 1. Chọn dự án nguồn

- Ưu tiên dự án **THUCHANH - tên bạn - ngày** đã có trên board SX (nhờ Sale tạo deal thực hành rồi lập kế hoạch lần đầu).
- **Cấm** đặt xưởng khác trên đơn khách đang chạy — tạo thêm thẻ HCB/Metalla thật.

Không có dự án THUCHANH: nhờ Sale/admin tạo deal mẫu, lập kế hoạch SX (khoá kia bài 3), rồi bạn mở trang SX của dự án đó.

## 2. Đề bài — làm đúng

1. Mở `/sx/projects/:id` dự án nguồn → bấm **Đặt xưởng khác**.
2. Chọn **công ty SX nhận khác** công ty đang mở (ví dụ HCB nếu nguồn là Metalla).
3. Chọn **phân loại** đúng loại hàng thực hành (Tủ bếp hoặc loại admin chỉ định).
4. Kiểm tra ngày lắp đã prefill; đặt **2 ngày lắp liền nhau** tuần sau, giờ **Sáng** (08:00).
5. **Lấy hàng VC**: cùng ngày lắp đầu, giờ **Chiều** (14:00) — không sau ngày lắp.
6. Chọn **công ty VC/LĐ đã bật cột tạm** (khoá kế hoạch bài 2).
7. Ghi chú 2 dòng, ví dụ: «Hàng dễ vỡ, gọi khách trước 30 phút» và «Thang máy nhỏ, cần 2 thợ».
8. Bấm **Tạo dự án**. Đọc alert «Đã tạo 1 dự án xưởng…».

## 3. Đi kiểm 7 chỗ

1. Cột trái **Đặt xưởng → Đã đặt**: có link mã dự án nhận.
2. Tab **Bình luận**: dòng «🏭 … đã đặt xưởng … vui lòng tiếp nhận dự án gia công» và @ NV (nếu phân loại có NV).
3. Mở dự án nhận: khối **Nhận đặt từ** trỏ về nguồn.
4. **Bảng Lắp đặt** đúng công ty VC: thẻ **TẠM**, ghi chú đúng 2 dòng.
5. Thử kéo thẻ TẠM — **bị chặn** là đúng.
6. **Tab Lịch**: 3 mốc dự kiến; thẻ sự kiện có ghi chú VC/LĐ.
7. (Tuỳ quyền) xưởng nhận bấm cột bàn giao → Sale **Chọn & bàn giao** → thẻ rời cột tạm. Trên đơn THUCHANH mới làm bước này.

## 4. Dọn dẹp

Nhắn admin xoá deal/dự án **THUCHANH - …** và sự kiện kèm theo, để báo cáo không lệch số.

---

Xong phiếu tự kiểm thì làm **Bài kiểm tra cuối** ngay dưới. Đạt 80% là nhận chứng nhận khoá.
$md_b2000009_0000_0000_0000_000000000005$,
  '/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png',
  $att_b2000009_0000_0000_0000_000000000005$[{"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png", "caption": "Trang SX — bấm Đặt xưởng khác trên header"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-04b-form-cac-buoc.png", "caption": "Điền xưởng nhận, phân loại, ngày lắp"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-05-chon-vc-ghi-chu.png", "caption": "VC/LĐ + ghi chú rồi Tạo dự án"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-07b-the-tam-ghi-chu.png", "caption": "Kết quả VC: thẻ TẠM + ghi chú"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-09b-chon-ban-giao.png", "caption": "Sale xác nhận lần hai — không tạo dự án VC mới"}]$att_b2000009_0000_0000_0000_000000000005$::jsonb,
  25,
  ARRAY['dat-xuong', 'sx', 'bai-5'],
  true,
  5,
  true,
  now()
) ON CONFLICT (id) DO UPDATE SET
  category_id = EXCLUDED.category_id, title = EXCLUDED.title, summary = EXCLUDED.summary,
  content_md = EXCLUDED.content_md, cover_image_url = EXCLUDED.cover_image_url,
  attachments = EXCLUDED.attachments, duration_minutes = EXCLUDED.duration_minutes,
  tags = EXCLUDED.tags, is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();

UPDATE knowledge_lessons SET is_final_exam = true WHERE id = 'b2000009-0000-0000-0000-000000000005';

-- BAI TAP
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order,
  image_url, attachments
) VALUES (
  'c2000009-0000-0000-0000-000000000001',
  'b2000009-0000-0000-0000-000000000001',
  'Bài kiểm tra: Vì sao cần «Đặt xưởng khác»',
  '10 câu — một số có ảnh. Đạt 70%, tối đa 3 lượt.',
  'quiz',
  $j_c2000009_0000_0000_0000_000000000001${"items": [{"id": "p1", "question": "Nút Đặt xưởng khác dùng khi nào?", "type": "single", "options": ["Tạo deal CRM mới", "Thêm dự án SX ở công ty/xưởng khác cho đơn đã có", "Xóa dự án nguồn", "Đổi mật khẩu"], "correct": [1], "explanation": "Gia công ngoài / xưởng thứ hai. Không tạo deal mới."}, {"id": "p2", "question": "Sale lập kế hoạch lần đầu trên màn nào?", "type": "single", "options": ["Trang VC/LĐ", "Chi tiết deal CRM — nút Thiết lập kế hoạch SX & VC/LĐ", "KPI", "Thùng rác"], "correct": [1], "explanation": "Khoá Kế hoạch SX & VC/LĐ. Ảnh nút cam trên header deal.", "image_url": "/uploads/knowledge-screenshots/sx-vc-03-nut-ke-hoach.png"}, {"id": "p3", "question": "Đổi Tủ bếp → Tủ áo trong CÙNG công ty thì bấm gì?", "type": "single", "options": ["Đặt xưởng khác", "Stepper Chuyển phân loại", "Tạo Lead", "Import Excel"], "correct": [1], "explanation": "Cùng công ty thì đổi pipeline, không tạo xưởng mới."}, {"id": "p4", "question": "Nút Đặt xưởng khác có trên trang VC/LĐ không?", "type": "single", "options": ["Có, cùng chỗ header", "Không — chỉ module Sản xuất", "Chỉ khi badge TẠM", "Chỉ thợ lắp"], "correct": [1], "explanation": "moduleKey !== vc. Trang /sx/projects/:id."}, {"id": "p5", "question": "Đặt sang chính công ty của dự án đang mở thì sao?", "type": "single", "options": ["Được, tạo bản sao", "Hệ thống từ chối — phải chọn xưởng khác", "Tự đổi tên deal", "Xóa dự án nguồn"], "correct": [1], "explanation": "Không thể đặt sang chính công ty nguồn."}, {"id": "p6", "question": "Một deal có được nhiều thẻ xưởng không?", "type": "single", "options": ["Không, chỉ một dự án mãi", "Được — mỗi cặp công ty SX + phân loại là một dự án", "Chỉ admin hệ thống", "Chỉ khi thua deal"], "correct": [1], "explanation": "Metalla + HCB cùng một đơn."}, {"id": "p7", "question": "Nhìn ảnh. Ô khung 1 trên form kế hoạch là gì?", "type": "single", "options": ["Công ty kế toán", "Công ty SX (xưởng)", "Mật khẩu", "Nguồn lead"], "correct": [1], "explanation": "Cùng ô khi xưởng đặt xưởng khác.", "image_url": "/uploads/knowledge-screenshots/sx-vc-04b-form-cac-buoc.png"}, {"id": "p8", "question": "Sau khi đặt, ai bấm Chọn & bàn giao VC?", "type": "single", "options": ["Thợ xưởng nhận trên Kanban SX", "Sale CRM trên tab Bình luận deal — như khoá kế hoạch", "Tài xế trên app", "Kế toán tab Đặt hàng"], "correct": [1], "explanation": "Xưởng chỉ báo hoàn thiện; Sale xác nhận lần hai."}, {"id": "p9", "question": "Đơn chưa có dự án SX thì xưởng có nên bấm Đặt xưởng khác không?", "type": "single", "options": ["Có, thay Sale", "Không — Sale lập kế hoạch lần đầu trên CRM", "Bắt buộc VC bấm", "Chỉ khi hết hạn"], "correct": [1], "explanation": "Nút dành cho đơn đã có dự án nguồn."}, {"id": "p10", "question": "Khác nhau nút chốt: Sale trên CRM vs xưởng Đặt xưởng khác?", "type": "single", "options": ["Sale: Thêm dự án / Lưu lịch — Xưởng: Tạo dự án", "Cả hai bấm Xóa deal", "Cả hai bấm Import Excel", "Không có nút chốt"], "correct": [0], "explanation": "Cùng form, khác nhãn nút cuối."}]}$j_c2000009_0000_0000_0000_000000000001$::jsonb,
  70,
  3,
  15,
  1,
  '/uploads/knowledge-screenshots/sx-vc-04b-form-cac-buoc.png',
  $eax_c2000009_0000_0000_0000_000000000001$[{"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-03-nut-ke-hoach.png", "caption": "CRM — nút Thiết lập kế hoạch (lần đầu, phía Sale)"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-04b-form-cac-buoc.png", "caption": "Cùng form xưởng / phân loại / ngày — xưởng dùng lại khi đặt xưởng khác"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png", "caption": "Trang chi tiết SX — chỗ có nút Đặt xưởng khác trên header"}]$eax_c2000009_0000_0000_0000_000000000001$::jsonb
) ON CONFLICT (id) DO UPDATE SET
  lesson_id = EXCLUDED.lesson_id, title = EXCLUDED.title, instructions = EXCLUDED.instructions,
  type = EXCLUDED.type, questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, image_url = EXCLUDED.image_url,
  attachments = EXCLUDED.attachments, updated_at = now();

INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order,
  image_url, attachments
) VALUES (
  'c2000009-0000-0000-0000-000000000002',
  'b2000009-0000-0000-0000-000000000002',
  'Bài kiểm tra: Nút ở đâu, ai được bấm, form mở ra gì',
  '12 câu — một số có ảnh. Đạt 70%, tối đa 3 lượt.',
  'quiz',
  $j_c2000009_0000_0000_0000_000000000002${"items": [{"id": "n1", "question": "Nút Đặt xưởng khác nằm ở đâu?", "type": "single", "options": ["Tab Đặt hàng CRM", "Header trang chi tiết SX, cùng hàng Dự án đầy đủ", "Cột KPI tháng", "Cài đặt pipeline VC"], "correct": [1], "explanation": "ProductionDetail, moduleKey !== vc."}, {"id": "n2", "question": "Màu / vị trí nút đúng là?", "type": "single", "options": ["Cam trên CRM deal", "Indigo trên header SX, icon nhà máy", "Xám trong tab Sự cố", "Xanh lá Dự án đầy đủ"], "correct": [1], "explanation": "bg-indigo-600 — khác nút cam kế hoạch Sale."}, {"id": "n3", "question": "NV SX công ty A mở dự án công ty B (không phải admin) thì?", "type": "single", "options": ["Vẫn bấm được", "Không thấy nút — phải đúng công ty nguồn hoặc admin", "Chỉ xem được form", "Tự đổi công ty dự án"], "correct": [1], "explanation": "canPlaceFromSource: cùng company_id hoặc admin."}, {"id": "n4", "question": "Danh sách công ty trên form có gồm xưởng đang mở không?", "type": "single", "options": ["Có, chọn lại chính mình", "Không — hệ thống lọc đúng công ty nguồn", "Chỉ hiện công ty VC", "Chỉ hiện công ty kế toán"], "correct": [1], "explanation": "filter id !== sourceCid."}, {"id": "n5", "question": "Ngày lắp / lấy hàng khi mở form lấy từ đâu?", "type": "single", "options": ["Luôn trống", "Prefill từ dự án nguồn (ngày lắp, occurrence, pickup, VC, ghi chú)", "Từ KPI tháng trước", "Từ user đang login"], "correct": [1], "explanation": "placeSxInitialRowFromProject."}, {"id": "n6", "question": "Nút chốt trên overlay Đặt xưởng khác tên gì?", "type": "single", "options": ["Thêm dự án", "Tạo dự án", "Chọn & bàn giao", "Lưu lịch"], "correct": [1], "explanation": "Khác CRM (Thêm dự án / Lưu lịch)."}, {"id": "n7", "question": "Khối Đặt xưởng cột trái hiện khi nào?", "type": "single", "options": ["Luôn", "Khi đã có ít nhất một lần đặt hoặc đang là dự án nhận", "Chỉ admin", "Khi thẻ TẠM"], "correct": [1], "explanation": "placed.length hoặc received_from.length."}, {"id": "n8", "question": "Link trong Đã đặt mở trang nào?", "type": "single", "options": ["/crm/dashboard", "/sx/projects/:id của xưởng nhận", "/ketoan", "/login"], "correct": [1], "explanation": "Sang dự án vừa tạo."}, {"id": "n9", "question": "Nhìn ảnh. Hai nút Sáng / Chiều trên form Đặt xưởng khác đặt giờ nào?", "type": "single", "options": ["07:00 và 13:00", "08:00 và 14:00", "09:00 và 15:00", "Không đổi giờ"], "correct": [1], "explanation": "Cùng khoá kế hoạch SX & VC/LĐ.", "image_url": "/uploads/knowledge-screenshots/sx-vc-04-form-ngay-gio.png"}, {"id": "n10", "question": "Ô ghi chú VC/LĐ trên form này khác ô kế hoạch Sale chỗ nào?", "type": "single", "options": ["Khác hẳn, chỉ xưởng thấy", "Cùng ô — ghi chú cho xe và thợ", "Chỉ nhập giá bán", "Chỉ nhập công nợ"], "correct": [1], "explanation": "showVcSetup trên SxMultiTargetPicker.", "image_url": "/uploads/knowledge-screenshots/sx-vc-05-chon-vc-ghi-chu.png"}, {"id": "n11", "question": "Không còn công ty SX khác thì form báo gì?", "type": "single", "options": ["Tạo deal mới", "Dòng vàng: không còn công ty SX khác để đặt", "Xóa dự án nguồn", "Chuyển sang VC"], "correct": [1], "explanation": "placeSxCompanies.length === 0."}, {"id": "n12", "question": "Xem bình luận thông báo trên khối Đặt xưởng để làm gì?", "type": "single", "options": ["Xóa thành viên", "Nhảy tab Bình luận xem dòng «đã đặt xưởng» @ NV nhận", "In phiếu lương", "Đổi pipeline"], "correct": [1], "explanation": "setTab('comments')."}]}$j_c2000009_0000_0000_0000_000000000002$::jsonb,
  70,
  3,
  15,
  1,
  '/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png',
  $eax_c2000009_0000_0000_0000_000000000002$[{"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png", "caption": "Trang chi tiết SX — header có Đặt xưởng khác (indigo)"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-04-form-ngay-gio.png", "caption": "Form ngày giờ — prefill từ dự án nguồn, vẫn sửa được"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-05-chon-vc-ghi-chu.png", "caption": "Công ty VC/LĐ và ghi chú — cùng ô với kế hoạch Sale"}]$eax_c2000009_0000_0000_0000_000000000002$::jsonb
) ON CONFLICT (id) DO UPDATE SET
  lesson_id = EXCLUDED.lesson_id, title = EXCLUDED.title, instructions = EXCLUDED.instructions,
  type = EXCLUDED.type, questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, image_url = EXCLUDED.image_url,
  attachments = EXCLUDED.attachments, updated_at = now();

INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order,
  image_url, attachments
) VALUES (
  'c2000009-0000-0001-0000-000000000002',
  'b2000009-0000-0000-0000-000000000002',
  'Phiếu tự kiểm — thao tác trên dự án thật',
  'Đánh dấu khi đã làm được trên phần mềm. Chỉ tạo dữ liệu trên deal/dự án THUCHANH — hủy form nếu chỉ xem.',
  'checklist',
  $j_c2000009_0000_0001_0000_000000000002${"items": [{"id": "c1", "text": "Mở đúng trang /sx/projects/:id (badge SX, không phải VC)"}, {"id": "c2", "text": "Nhìn thấy nút indigo Đặt xưởng khác trên header (hoặc biết vì sao không thấy: sai công ty / không phải NV SX)"}, {"id": "c3", "text": "Mở overlay, thấy danh sách công ty SX đã loại công ty đang mở"}, {"id": "c4", "text": "Thấy ngày lắp / VC được điền sẵn từ dự án nguồn"}, {"id": "c5", "text": "Đóng overlay bằng Hủy — chưa bấm Tạo dự án trên đơn thật"}]}$j_c2000009_0000_0001_0000_000000000002$::jsonb,
  80,
  NULL,
  NULL,
  2,
  '/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png',
  $eax_c2000009_0000_0001_0000_000000000002$[]$eax_c2000009_0000_0001_0000_000000000002$::jsonb
) ON CONFLICT (id) DO UPDATE SET
  lesson_id = EXCLUDED.lesson_id, title = EXCLUDED.title, instructions = EXCLUDED.instructions,
  type = EXCLUDED.type, questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, image_url = EXCLUDED.image_url,
  attachments = EXCLUDED.attachments, updated_at = now();

INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order,
  image_url, attachments
) VALUES (
  'c2000009-0000-0000-0000-000000000003',
  'b2000009-0000-0000-0000-000000000003',
  'Bài kiểm tra: Form ngày / VC — cùng khoá kế hoạch SX & VC/LĐ',
  '12 câu — ảnh lấy từ khoá Kế hoạch SX & VC/LĐ vì form Đặt xưởng khác dùng cùng ô. Đạt 70%, tối đa 3 lượt.',
  'quiz',
  $j_c2000009_0000_0000_0000_000000000003${"items": [{"id": "f1", "question": "Hai ô bắt buộc trên mỗi dòng Đặt xưởng khác?", "type": "single", "options": ["Giá bán và VAT", "Công ty SX nhận + phân loại", "Mật khẩu và OTP", "Màu áo thợ"], "correct": [1], "explanation": "Thiếu một trong hai thì Tạo dự án mờ / API 400."}, {"id": "f2", "question": "Nhìn ảnh. Ô hoàn thiện SX (khung xanh) tính thế nào?", "type": "single", "options": ["Bằng đúng ngày lắp", "Tự tính = ngày lắp trừ 2 ngày", "Phải nhập tay, không tự tính", "Ngày lắp cộng 2 ngày"], "correct": [1], "explanation": "Giống khoá kế hoạch. Ảnh: 27/08 → 25/08.", "image_url": "/uploads/knowledge-screenshots/sx-vc-04-form-ngay-gio.png"}, {"id": "f3", "question": "Nút Sáng / Chiều (khung đỏ) đặt giờ nào?", "type": "single", "options": ["07:00 và 13:00", "08:00 và 14:00", "09:00 và 15:00", "00:00 và 12:00"], "correct": [1], "explanation": "Cùng khoá Kế hoạch SX & VC/LĐ.", "image_url": "/uploads/knowledge-screenshots/sx-vc-04-form-ngay-gio.png"}, {"id": "f4", "question": "Ngày lấy hàng VC so với ngày lắp?", "type": "single", "options": ["Bắt buộc sau ngày lắp", "Không được sau ngày lắp — cùng ngày hoặc trước", "Bỏ trống mãi", "Phải trước đúng 7 ngày"], "correct": [1], "explanation": "pickup không after install."}, {"id": "f5", "question": "Nhìn ảnh cuối form. Ô ghi chú (khung 2) hiện khi nào?", "type": "single", "options": ["Luôn", "Sau khi đã chọn công ty VC/LĐ (khung 1)", "Chỉ admin", "Khi thẻ TẠM"], "correct": [1], "explanation": "Giống kế hoạch Sale.", "image_url": "/uploads/knowledge-screenshots/sx-vc-05-chon-vc-ghi-chu.png"}, {"id": "f6", "question": "Nội dung nào NÊN viết vào ghi chú VC/LĐ?", "type": "single", "options": ["Giá bán và công nợ", "Thang máy nhỏ, chỗ đậu xe, hàng dễ vỡ", "Lịch nghỉ Sale", "Mật khẩu Wi‑Fi công ty"], "correct": [1], "explanation": "Thứ ảnh hưởng tới xe và thợ.", "image_url": "/uploads/knowledge-screenshots/sx-vc-05-chon-vc-ghi-chu.png"}, {"id": "f7", "question": "Tối đa bao nhiêu xưởng mỗi lần bấm Tạo dự án?", "type": "single", "options": ["Không giới hạn", "5", "2", "20"], "correct": [1], "explanation": "targets.length > 5 → lỗi."}, {"id": "f8", "question": "Đặt lại đúng HCB + Tủ bếp đã đặt trước đó thì sao?", "type": "single", "options": ["Tạo dự án trùng", "Báo đã đặt xưởng này (cùng phân loại) trước đó", "Xóa bản cũ", "Đổi tên deal"], "correct": [1], "explanation": "Khóa theo source + company + workshop_type."}, {"id": "f9", "question": "Đã chọn công ty VC nhưng quên ngày lắp?", "type": "single", "options": ["Vẫn lưu", "Form chặn — đã chọn VC thì phải có ngày lắp", "Tự lấy hôm nay", "Chỉ Sale bị chặn"], "correct": [1], "explanation": "validateSxTargets."}, {"id": "f10", "question": "Nhìn ảnh popup Sửa lịch CRM. Sau khi đổi ngày, Sale bấm nút nào?", "type": "single", "options": ["Hủy", "Lưu lịch", "Tạo sự kiện", "Đặt xưởng khác"], "correct": [1], "explanation": "Xưởng không dùng popup này để đặt; nhắc cùng ô ngày/VC.", "image_url": "/uploads/knowledge-screenshots/sx-vc-06-sua-lich.png"}, {"id": "f11", "question": "Mỗi công ty VC/LĐ được bật bao nhiêu cột lắp đặt tạm?", "type": "single", "options": ["Không giới hạn", "Đúng một cột — bật cột mới thì cột cũ tự tắt", "Hai cột", "Tuỳ số xưởng"], "correct": [1], "explanation": "Khoá kế hoạch bài 2 — vẫn đúng khi đặt xưởng khác."}, {"id": "f12", "question": "Ai điền kế hoạch SX & VC/LĐ lần đầu trên deal?", "type": "single", "options": ["Xưởng sản xuất", "Sale CRM phụ trách deal", "Tổ vận chuyển", "Kế toán"], "correct": [1], "explanation": "Xưởng chỉ đặt thêm xưởng nhận; Sale lập lần đầu.", "image_url": "/uploads/knowledge-screenshots/sx-vc-03-nut-ke-hoach.png"}]}$j_c2000009_0000_0000_0000_000000000003$::jsonb,
  70,
  3,
  18,
  1,
  '/uploads/knowledge-screenshots/sx-vc-05-chon-vc-ghi-chu.png',
  $eax_c2000009_0000_0000_0000_000000000003$[{"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-04b-form-cac-buoc.png", "caption": "Xưởng nhận, phân loại, ngày lắp"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-04-form-ngay-gio.png", "caption": "Sáng 08:00 / Chiều 14:00, hoàn thiện = lắp − 2 ngày"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-05-chon-vc-ghi-chu.png", "caption": "Công ty VC/LĐ và ghi chú"}]$eax_c2000009_0000_0000_0000_000000000003$::jsonb
) ON CONFLICT (id) DO UPDATE SET
  lesson_id = EXCLUDED.lesson_id, title = EXCLUDED.title, instructions = EXCLUDED.instructions,
  type = EXCLUDED.type, questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, image_url = EXCLUDED.image_url,
  attachments = EXCLUDED.attachments, updated_at = now();

INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order,
  image_url, attachments
) VALUES (
  'c2000009-0000-0000-0000-000000000004',
  'b2000009-0000-0000-0000-000000000004',
  'Bài kiểm tra: Sau khi tạo — TẠM, bình luận, bàn giao',
  '12 câu — ảnh khoá kế hoạch SX & VC/LĐ. Đạt 70%, tối đa 3 lượt.',
  'quiz',
  $j_c2000009_0000_0000_0000_000000000004${"items": [{"id": "a1", "question": "Sau Tạo dự án, tab nào thường mở sẵn?", "type": "single", "options": ["KPI", "Bình luận", "Đặt hàng", "Facebook"], "correct": [1], "explanation": "setTab('comments') để thấy dòng đã đặt xưởng."}, {"id": "a2", "question": "Tên dự án xưởng nhận thường có gì?", "type": "single", "options": ["Chỉ mã ngẫu nhiên", "Tên deal / dự án nguồn · short_name xưởng nhận", "Tên Sale", "Số hóa đơn"], "correct": [1], "explanation": "Ví dụ «Tủ bếp chị Lan · HCB»."}, {"id": "a3", "question": "Dòng bình luận đúng mẫu?", "type": "single", "options": ["Đã xóa deal", "🏭 … đã đặt xưởng (HCB) · TB-xxxx. @NV — vui lòng tiếp nhận dự án gia công", "Chỉ gửi Zalo", "Tạo user mới"], "correct": [1], "explanation": "mode workshop_place."}, {"id": "a4", "question": "Nhìn ảnh bảng Lắp đặt. Ngay sau khi đặt có VC, thẻ nằm cột nào (khung 1)?", "type": "single", "options": ["Nghiệm thu", "Cột lắp đặt tạm (ví dụ Dự án sắp tới)", "Thùng rác", "Chưa hiện cho tới khi Sale bấm"], "correct": [1], "explanation": "Giống khoá kế hoạch bài 4.", "image_url": "/uploads/knowledge-screenshots/sx-vc-07-board-cot-tam.png"}, {"id": "a5", "question": "Nhìn ảnh thẻ. Khung 2 là nhãn gì?", "type": "single", "options": ["ĐÃ GIAO", "Badge 🔒 TẠM — chưa kéo cột được", "GẤP", "HỦY"], "correct": [0], "explanation": "Khoá kéo cho tới xưởng nhận bàn giao + Sale xác nhận.", "image_url": "/uploads/knowledge-screenshots/sx-vc-07b-the-tam-ghi-chu.png"}, {"id": "a6", "question": "Kéo thẻ TẠM sang cột khác — kết quả đúng?", "type": "single", "options": ["Chuyển bình thường", "Hệ thống chặn, chờ xưởng bàn giao và Sale xác nhận", "Xóa thẻ", "Tạo dự án trùng"], "correct": [1], "explanation": "Giống khoá kế hoạch."}, {"id": "a7", "question": "Sale bấm Chọn & bàn giao thì hệ thống tạo thêm dự án VC mới?", "type": "single", "options": ["Có, luôn tạo bản sao", "Không — chỉ rời cột tạm, bỏ badge TẠM", "Xóa dự án SX", "Tạo Lead"], "correct": [1], "explanation": "Khung 3 trên thẻ bàn giao.", "image_url": "/uploads/knowledge-screenshots/sx-vc-09-the-ban-giao.png"}, {"id": "a8", "question": "Xưởng nhận bấm cột khoanh đỏ trên ảnh để làm gì?", "type": "single", "options": ["Tạo deal CRM", "Báo hoàn thiện — gửi thẻ bàn giao cho Sale", "Tự bỏ TẠM ngay không cần Sale", "Đặt xưởng khác lần nữa"], "correct": [1], "explanation": "Đơn hàng đã chuẩn bị xong.", "image_url": "/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png"}, {"id": "a9", "question": "NV xưởng nhận vào thành viên deal từ đâu?", "type": "single", "options": ["Toàn bộ phòng SX công ty nhận", "NV mặc định trong setup phân loại xưởng nhận", "Mọi user hệ thống", "Chỉ tài xế"], "correct": [1], "explanation": "staffAllowFallback: false — không lấy cả phòng."}, {"id": "a10", "question": "Không @ được ai sau khi đặt — nguyên nhân hay gặp?", "type": "single", "options": ["Hết dung lượng ảnh", "Phân loại xưởng nhận chưa gán NV mặc định", "Sai múi giờ máy", "Thiếu chữ ký số"], "correct": [1], "explanation": "skipped_no_setup."}, {"id": "a11", "question": "Khối Nhận đặt từ hiện trên trang nào?", "type": "single", "options": ["Chỉ CRM lead chưa thắng", "Trang SX của dự án xưởng nhận", "Trang login", "KPI"], "correct": [1], "explanation": "received_from."}, {"id": "a12", "question": "Nhìn ảnh cuối thẻ bàn giao. Khung 9 là nút nào?", "type": "single", "options": ["Để sau", "Chọn & bàn giao — chuyển cột, bỏ TẠM", "Xóa dự án", "Đặt xưởng khác"], "correct": [1], "explanation": "Việc của Sale, không phải xưởng nguồn.", "image_url": "/uploads/knowledge-screenshots/sx-vc-09b-chon-ban-giao.png"}]}$j_c2000009_0000_0000_0000_000000000004$::jsonb,
  70,
  3,
  15,
  1,
  '/uploads/knowledge-screenshots/sx-vc-07b-the-tam-ghi-chu.png',
  $eax_c2000009_0000_0000_0000_000000000004$[{"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-07-board-cot-tam.png", "caption": "VC — cột lắp đặt tạm sau khi đặt có ngày/VC"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-07b-the-tam-ghi-chu.png", "caption": "Badge TẠM và ghi chú trên thẻ"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png", "caption": "Xưởng nhận bấm cột bàn giao"}]$eax_c2000009_0000_0000_0000_000000000004$::jsonb
) ON CONFLICT (id) DO UPDATE SET
  lesson_id = EXCLUDED.lesson_id, title = EXCLUDED.title, instructions = EXCLUDED.instructions,
  type = EXCLUDED.type, questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, image_url = EXCLUDED.image_url,
  attachments = EXCLUDED.attachments, updated_at = now();

INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order,
  image_url, attachments
) VALUES (
  'c2000009-0000-0000-0000-000000000005',
  'b2000009-0000-0000-0000-000000000005',
  'Bài kiểm tra cuối: Đặt xưởng khác + kế hoạch SX & VC/LĐ',
  '15 câu — ảnh khoá kế hoạch. Đạt 80% là qua, tối đa 3 lượt, 25 phút. Nên làm phiếu tự kiểm trước.',
  'quiz',
  $j_c2000009_0000_0000_0000_000000000005${"items": [{"id": "t1", "question": "Nút indigo trên header SX dùng để?", "type": "single", "options": ["Xóa dự án nguồn", "Đặt thêm dự án ở xưởng/công ty SX khác", "In phiếu lương", "Đổi theme"], "correct": [1], "explanation": "Đặt xưởng khác."}, {"id": "t2", "question": "Nhìn ảnh deal CRM. Khung 3 (đỏ) là nút của AI, lúc nào?", "type": "single", "options": ["Xưởng — mọi lúc", "Sale — lập kế hoạch lần đầu khi Đã ký hợp đồng", "Tài xế — khi TẠM", "Kế toán — cuối tháng"], "correct": [1], "explanation": "Không nhầm với Đặt xưởng khác.", "image_url": "/uploads/knowledge-screenshots/sx-vc-03-nut-ke-hoach.png"}, {"id": "t3", "question": "Sau khi bấm Sáng (khung đỏ), giờ lắp là?", "type": "single", "options": ["07:30", "08:00", "09:00", "Không đổi"], "correct": [1], "explanation": "Cùng sân tập khoá kế hoạch.", "image_url": "/uploads/knowledge-screenshots/sx-vc-04-form-ngay-gio.png"}, {"id": "t4", "question": "Hoàn thiện SX trên ảnh khung xanh?", "type": "single", "options": ["Bằng ngày lắp", "Ngày lắp trừ 2 ngày", "Ngày lắp cộng 2", "Trống"], "correct": [1], "explanation": "27/08 → 25/08.", "image_url": "/uploads/knowledge-screenshots/sx-vc-04-form-ngay-gio.png"}, {"id": "t5", "question": "Công ty nguồn có trong dropdown Đặt xưởng khác không?", "type": "single", "options": ["Có", "Không — đã lọc", "Chỉ hiện ban đêm", "Chỉ admin thấy"], "correct": [1], "explanation": "Không đặt sang chính mình."}, {"id": "t6", "question": "Nhìn ảnh bảng Lắp đặt. Khung 3 trên thẻ là?", "type": "single", "options": ["Được kéo tự do", "Badge TẠM — bị khoá chuyển cột", "Đã nghiệm thu", "Hết hàng"], "correct": [1], "explanation": "Đúng cả khi dự án do Đặt xưởng khác tạo.", "image_url": "/uploads/knowledge-screenshots/sx-vc-07-board-cot-tam.png"}, {"id": "t7", "question": "Ghi chú VC trên thẻ phóng to (khung 3) lấy từ đâu?", "type": "single", "options": ["KPI", "Ô ghi chú lúc lập kế hoạch hoặc lúc Đặt xưởng khác", "Mật khẩu Wi‑Fi", "Tên cột Kanban"], "correct": [1], "explanation": "Cùng ô.", "image_url": "/uploads/knowledge-screenshots/sx-vc-07b-the-tam-ghi-chu.png"}, {"id": "t8", "question": "Chọn & bàn giao (khung 9) do ai bấm?", "type": "single", "options": ["Xưởng nguồn trên header", "Sale trên CRM tab Bình luận", "Mọi thợ VC", "Bot lúc nửa đêm"], "correct": [1], "explanation": "Không tạo dự án VC mới.", "image_url": "/uploads/knowledge-screenshots/sx-vc-09b-chon-ban-giao.png"}, {"id": "t9", "question": "Tối đa bao nhiêu xưởng một lần Tạo dự án?", "type": "single", "options": ["5", "50", "1", "Không giới hạn"], "correct": [0], "explanation": "Server từ chối > 5."}, {"id": "t10", "question": "Đặt trùng cùng công ty + phân loại?", "type": "single", "options": ["Tạo bản sao", "Báo đã đặt trước đó", "Ghi đè dự án nhận", "Xóa nguồn"], "correct": [1], "explanation": "existingKeys."}, {"id": "t11", "question": "Nút Đặt xưởng khác trên VC?", "type": "single", "options": ["Có", "Không", "Chỉ khi TẠM", "Chỉ mobile"], "correct": [1], "explanation": "SX-only."}, {"id": "t12", "question": "NV được @ trong bình luận là?", "type": "single", "options": ["Cả công ty nhận", "NV mặc định setup phân loại xưởng nhận", "Mọi Sale", "Khách hàng"], "correct": [1], "explanation": "Không fallback cả phòng SX."}, {"id": "t13", "question": "Sân tập khoá Kế hoạch SX & VC/LĐ giúp gì cho khoá này?", "type": "single", "options": ["Không liên quan", "Tập điền cùng ô ngày/VC mà không tạo dữ liệu thật", "Xóa deal khách", "Đổi quyền admin"], "correct": [1], "explanation": "Chốt Thêm dự án trên sân tập; thật thì Tạo dự án."}, {"id": "t14", "question": "Đổi phân loại cùng công ty thì?", "type": "single", "options": ["Đặt xưởng khác", "Chuyển phân loại trên stepper", "Tạo Lead", "Xóa cột tạm"], "correct": [1], "explanation": "Không nhầm hai nút."}, {"id": "t15", "question": "Thẻ còn TẠM sau khi xưởng nhận đã bấm bàn giao — vì sao?", "type": "single", "options": ["Sale chưa Chọn & bàn giao", "Thiếu ảnh", "Sai DPI màn hình", "Hết giấy in"], "correct": [0], "explanation": "Đủ hai việc.", "image_url": "/uploads/knowledge-screenshots/sx-vc-09-the-ban-giao.png"}]}$j_c2000009_0000_0000_0000_000000000005$::jsonb,
  80,
  3,
  25,
  1,
  '/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png',
  $eax_c2000009_0000_0000_0000_000000000005$[{"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png", "caption": "Trang SX — bấm Đặt xưởng khác trên header"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-04b-form-cac-buoc.png", "caption": "Điền xưởng nhận, phân loại, ngày lắp"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-05-chon-vc-ghi-chu.png", "caption": "VC/LĐ + ghi chú rồi Tạo dự án"}]$eax_c2000009_0000_0000_0000_000000000005$::jsonb
) ON CONFLICT (id) DO UPDATE SET
  lesson_id = EXCLUDED.lesson_id, title = EXCLUDED.title, instructions = EXCLUDED.instructions,
  type = EXCLUDED.type, questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, image_url = EXCLUDED.image_url,
  attachments = EXCLUDED.attachments, updated_at = now();

INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order,
  image_url, attachments
) VALUES (
  'c2000009-0000-0001-0000-000000000005',
  'b2000009-0000-0000-0000-000000000005',
  'Phiếu tự kiểm — thao tác trên dự án thật',
  'Đánh dấu khi đã làm được trên phần mềm. Chỉ tạo dữ liệu trên deal/dự án THUCHANH — hủy form nếu chỉ xem.',
  'checklist',
  $j_c2000009_0000_0001_0000_000000000005${"items": [{"id": "c1", "text": "Đã mở đúng trang SX dự án THUCHANH (không đụng đơn khách)"}, {"id": "c2", "text": "Bấm Đặt xưởng khác, chọn công ty nhận ≠ nguồn + phân loại"}, {"id": "c3", "text": "2 ngày lắp liền, giờ Sáng 08:00; lấy hàng không sau ngày lắp, giờ Chiều"}, {"id": "c4", "text": "Chọn VC đã bật cột tạm, ghi chú 2 dòng, bấm Tạo dự án"}, {"id": "c5", "text": "Cột trái Đã đặt có link; bình luận có dòng đã đặt xưởng"}, {"id": "c6", "text": "Bảng Lắp đặt: thẻ TẠM + ghi chú; kéo thẻ bị chặn"}, {"id": "c7", "text": "Biết sân tập khoá Kế hoạch SX & VC/LĐ dùng để tập form không tạo dữ liệu"}, {"id": "c8", "text": "Biết Sale mới bấm Chọn & bàn giao — không tạo dự án VC trùng"}]}$j_c2000009_0000_0001_0000_000000000005$::jsonb,
  80,
  NULL,
  NULL,
  2,
  '/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png',
  $eax_c2000009_0000_0001_0000_000000000005$[]$eax_c2000009_0000_0001_0000_000000000005$::jsonb
) ON CONFLICT (id) DO UPDATE SET
  lesson_id = EXCLUDED.lesson_id, title = EXCLUDED.title, instructions = EXCLUDED.instructions,
  type = EXCLUDED.type, questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, image_url = EXCLUDED.image_url,
  attachments = EXCLUDED.attachments, updated_at = now();

COMMIT;
