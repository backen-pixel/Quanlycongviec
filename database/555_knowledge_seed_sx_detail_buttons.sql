-- 555
-- Khoá «Thao tác chi tiết Sản xuất» — từng nút trên trang dự án xưởng
-- Cùng khung 6 bài với CRM và VC. Idempotent ON CONFLICT DO UPDATE
-- Sinh: python scripts/knowledge/build_detail_button_seeds.py

BEGIN;
INSERT INTO knowledge_categories (id, name, slug, description, icon, sort_order, is_active)
VALUES (
  'd2000007-0000-0000-0000-000000000001',
  'Thao tác chi tiết Sản xuất — từng nút trên dự án xưởng',
  'thao-tac-chi-tiet-sx',
  'Dành cho xưởng. Học từng nút trên trang chi tiết dự án SX (cùng khung với VC/LĐ và CRM).',
  '🏭',
  42,
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
  certificate_template = $ct${"signature_name": "Ban điều hành TuBep Pro", "signature_title": "Phụ trách đào tạo vận hành", "footer_note": "Chứng nhận đã nắm từng nút trên trang chi tiết dự án Sản xuất.", "accent_color": "#0f766e"}$ct$::jsonb
WHERE id = 'd2000007-0000-0000-0000-000000000001';

-- BAI HOC
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000007-0000-0000-0000-000000000001',
  'd2000007-0000-0000-0000-000000000001',
  'Bài 1: Toàn cảnh trang chi tiết Sản xuất',
  'Ba vùng giống CRM: header, cột trái Thông tin, hàng tab. Trang /sx/projects/:id.',
  $md_b2000007_0000_0000_0000_000000000001$# Bài 1: Toàn cảnh trang chi tiết Sản xuất

> _Cùng một kiểu trang với CRM — học một lần, sang module kia vẫn biết chỗ bấm._

## 1. Ba vùng

Trang `/sx/projects/:id` (file `ProductionDetail`, badge **SX**).

1. **Header** — tên dự án/deal, nút riêng module, **Dự án đầy đủ**, **CRM deal**.
2. **Cột trái Thông tin** — ngày, địa chỉ, đội ngũ Sản xuất.
3. **Hàng tab phải** — Công việc, Không gian chung, Tài liệu, Drive, Ghi chú, Bình luận, Sự cố, Thành viên. Thêm tab **Vật tư / Mua hàng** và **Gửi duyệt** (chỉ xưởng).



SX và VC **dùng chung giao diện**. Khác nhau ở vài nút header và 2 tab chỉ xưởng (Vật tư, Gửi duyệt).

![Minh họa luồng xưởng / lắp đặt](/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png)

## 2. Tab có trên cả SX và VC

- **Công việc** — mẫu nhiệm vụ xưởng hoặc VC/LĐ.
- **Không gian chung** — giao việc cho người (nếu có CRM deal).
- **Tài liệu / Drive / Ghi chú / Bình luận** — giống CRM, file theo khối.
- **Sự cố** — **Báo sự cố**, **Gửi báo cáo**, **Đã xử lý**.
- **Thành viên** — ai xem được dự án/deal.

Không có tab Đặt hàng, Ghi âm, Facebook (những tab đó chỉ CRM).

## 3. Lỗi hay gặp

- Tìm nút **Đặt xưởng khác** trên VC — không có, chỉ SX.
- Tìm tab **Vật tư** trên VC — không có.

---

Bài sau: nút header và cột trái đúng module Sản xuất.
$md_b2000007_0000_0000_0000_000000000001$,
  '/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png',
  $att_b2000007_0000_0000_0000_000000000001$[{"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png", "caption": "Minh họa Sản xuất"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-03-nut-ke-hoach.png", "caption": "Deal CRM cùng đơn — để đối chiếu"}]$att_b2000007_0000_0000_0000_000000000001$::jsonb,
  8,
  ARRAY['chi-tiet', 'sx', 'bai-1'],
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
  'b2000007-0000-0000-0000-000000000002',
  'd2000007-0000-0000-0000-000000000001',
  'Bài 2: Nút header và cột trái Sản xuất',
  'Từng nút riêng module trên header và Thông tin — SX có Đặt xưởng / bàn giao VC; VC có LĐ tạm và đội lắp.',
  $md_b2000007_0000_0000_0000_000000000002$# Bài 2: Nút header và cột trái Sản xuất

> _Nhìn đúng badge SX trước khi bấm — đừng thao tác nhầm module._

## 1. Header

1. **Quay lại** — về Dashboard xưởng, sáng đúng thẻ.
2. Badge **SX**.
3. Sửa tên deal (icon bút) → **Lưu** / **Hủy**.
4. **Đặt xưởng khác** — mở form chọn công ty SX + phân loại + ngày, rồi **Tạo dự án**. Dùng khi đặt hàng thêm xưởng (vd. Metalla → HCB).
5. **Dự án đầy đủ** — `/projects/:id`.
6. **CRM deal** — về chi tiết CRM.
7. Dải **CRM · Sản xuất · VC/LĐ**.
8. Chip pipeline: công ty, phân loại xưởng, khu vực.
9. Stepper cột xưởng — bấm cột **Đơn hàng đã chuẩn bị xong** để bàn giao VC (mở popup **Bàn giao sang VC**).

Nút **Đặt xưởng khác** và popup **Bàn giao sang VC** chỉ có trên **Sản xuất**.

![Bàn giao / kế hoạch liên quan](/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png)

## 2. Cột trái Thông tin

- **Giá trị sản xuất**, **Tiền cọc**, công nợ.
- **Ngày hoàn thiện sản xuất**, **Ngày lắp đặt** (hoàn thiện thường = lắp trừ 2 ngày).
- **Địa chỉ lắp đặt**, tên khác.
- **Phân công Sản xuất** (chọn người). Đội SX hiện chip.
- Khối **Đặt xưởng**: link dự án đã đặt, **Xem bình luận thông báo**.

- **Địa chỉ lắp đặt** có trên cả hai (sửa được khi đúng quyền).

## 3. Stepper

Bấm cột trên stepper = chuyển giai đoạn. Có thể bị chặn: nhiệm vụ chưa xong, thiếu deadline.

- **SX:** cột bàn giao VC mở modal **🚚 Bàn giao sang VC** → **Xác nhận bàn giao**. Việc này **báo Sale**, không tự chuyển thẻ VC khỏi cột tạm.
- **VC:** nếu còn **Lắp đặt tạm**, chuyển cột bị chặn cho tới khi Sale bấm **Chọn & bàn giao** trên CRM.

Chi tiết luồng kế hoạch: khoá **Kế hoạch SX & VC/LĐ**.

## 4. Lỗi hay gặp

- Xưởng tưởng bấm cột xong là VC chạy xe — chưa, cần Sale xác nhận trên CRM.
- VC cố kéo thẻ TẠM — hệ thống chặn là **đúng**.

---

Bài sau: tab Công việc (cùng nút Thêm việc / Xong hết như CRM).
$md_b2000007_0000_0000_0000_000000000002$,
  '/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png',
  $att_b2000007_0000_0000_0000_000000000002$[{"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png", "caption": "Xưởng — bước bàn giao"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-07b-the-tam-ghi-chu.png", "caption": "Thẻ TẠM phía VC"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-09-the-ban-giao.png", "caption": "Sale xác nhận trên CRM"}]$att_b2000007_0000_0000_0000_000000000002$::jsonb,
  14,
  ARRAY['chi-tiet', 'sx', 'bai-2'],
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
  'b2000007-0000-0000-0000-000000000003',
  'd2000007-0000-0000-0000-000000000001',
  'Bài 3: Tab Công việc — mẫu, thêm việc, xong hết',
  'Cùng nút với CRM: **Gắn mẫu** / **Bổ sung thiếu SX**, Thêm việc, Xong hết, List/Deadline/Planner/Lịch.',
  $md_b2000007_0000_0000_0000_000000000003$# Bài 3: Tab Công việc — mẫu, thêm việc, xong hết

> _Thanh nút giống CRM — chỉ khác bộ mẫu Sản xuất._

## 1. Mở tab Công việc

Cùng component với CRM. Trên Sản xuất bạn thấy việc của khối mình.

## 2. Từng nút (cùng tên với CRM)

1. **Gắn mẫu** / **Bổ sung thiếu SX** — gắn đúng bộ mẫu Sản xuất.
2. **List** · **Deadline** · **Planner** · **Lịch** — đổi cách xem.
3. **Thêm việc** — thêm 1 việc trong nhóm.
4. **Xong hết** — hoàn thành cả nhóm khi thật sự xong.
5. Từng dòng: hoàn thành, hạn, file, checklist, **Giao việc Sản xuất**.

Nếu dự án chưa gắn CRM deal, có panel mẫu xưởng/VC thay thế — vẫn **Gắn mẫu**, **Thêm việc**.

## 3. Lỗi hay gặp

- Gắn mẫu CRM trên trang xưởng — chọn mẫu **Sản xuất**.
- Bấm Xong hết khi việc ngoài hiện trường chưa xong.

---

Bài sau: Không gian chung và Thành viên (giống CRM).
$md_b2000007_0000_0000_0000_000000000003$,
  '/uploads/knowledge-screenshots/lead-05-nhiem-vu.png',
  $att_b2000007_0000_0000_0000_000000000003$[{"type": "image", "url": "/uploads/knowledge-screenshots/lead-05-nhiem-vu.png", "caption": "Tab Công việc — cùng UI CRM"}]$att_b2000007_0000_0000_0000_000000000003$::jsonb,
  12,
  ARRAY['chi-tiet', 'sx', 'bai-3'],
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
  'b2000007-0000-0000-0000-000000000004',
  'd2000007-0000-0000-0000-000000000001',
  'Bài 4: Không gian chung và Thành viên',
  'Cùng nút với CRM: Thêm giao việc, lọc khối, thêm thành viên.',
  $md_b2000007_0000_0000_0000_000000000004$# Bài 4: Không gian chung và Thành viên

> _Cùng tab với CRM — trên Sản xuất lọc mặc định nghiêng về khối mình._

## 1. Không gian chung

Hiện khi dự án gắn CRM deal.

1. Lọc **Tất cả** · **Bán hàng** · **Xưởng** · **Lắp đặt**.
2. **Giao việc** — bảng giao việc khối.
3. **Thêm** — form Giao việc mới → **Lưu** / **Hủy**.
4. **Sửa** / **Xóa** / **Thêm ảnh** trên dòng.

Trên VC, việc mới thường gắn khối **Lắp đặt**. Trên SX — khối **Xưởng**.

![Không gian chung](/uploads/knowledge-screenshots/collab-01.png)

## 2. Thành viên

1. **Thêm thành viên**, **Chọn tất cả** / **Bỏ chọn**, **+ Thêm N người**.
2. Đổi vai / **Xóa**.
3. Link **Mở trang Giao việc**, **Mở Không gian chung**.

Thợ không có trong Thành viên thì **không thấy** dự án (trừ đúng quyền công ty).

## 3. Lỗi hay gặp

- Giao việc Zalo thay vì **Thêm** — mất vết.
- Thêm nhầm người công ty khác — xóa trên tab Thành viên.

---

Bài sau: Tài liệu, Drive, ghi chú, bình luận, sự cố.
$md_b2000007_0000_0000_0000_000000000004$,
  '/uploads/knowledge-screenshots/collab-01.png',
  $att_b2000007_0000_0000_0000_000000000004$[{"type": "image", "url": "/uploads/knowledge-screenshots/collab-01.png", "caption": "Không gian chung"}, {"type": "image", "url": "/uploads/knowledge-screenshots/collab-05.png", "caption": "Giao việc"}]$att_b2000007_0000_0000_0000_000000000004$::jsonb,
  10,
  ARRAY['chi-tiet', 'sx', 'bai-4'],
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
  'b2000007-0000-0000-0000-000000000005',
  'd2000007-0000-0000-0000-000000000001',
  'Bài 5: Tài liệu, Drive, Ghi chú, Bình luận, Sự cố',
  'Cùng nút file/ghi chú với CRM, thêm Báo sự cố. Bình luận chứa dấu vết bàn giao.',
  $md_b2000007_0000_0000_0000_000000000005$# Bài 5: Tài liệu, Drive, Ghi chú, Bình luận, Sự cố

> _File bản vẽ phải chia sẻ đúng khối — Sản xuất mới thấy._

## 1. Tài liệu

1. **Upload file xưởng** (nhãn gần giống CRM **Upload file**).
2. **Nhập văn bản**, **Tải tất cả (N)**.
3. Từng file: **Tải**, **Chia sẻ CRM**, bánh răng chia sẻ khối, **Xóa**, phóng to ảnh.

Sale upload trên CRM mà **chưa chia sẻ SX/VC** thì tab này trống.

## 2. Drive / Ghi chú / Bình luận

Cùng nút CRM: thư mục Drive, Gửi ghi chú, bình luận **Trả lời / Sửa / Xóa**.

Xưởng **không** bấm **Chọn & bàn giao** — nút đó của Sale trên CRM. Xưởng chỉ việc chuyển cột bàn giao (bài 2).

![Thẻ bàn giao phía Sale — để biết kết quả](/uploads/knowledge-screenshots/sx-vc-09-the-ban-giao.png)

## 3. Tab Sự cố (có trên SX và VC, không có trên CRM chi tiết)

1. **Báo sự cố** — mở form.
2. **Gửi báo cáo**.
3. **Đã xử lý** khi xong.

## 4. Lỗi hay gặp

- Báo sự cố trên Zalo nhóm — không vào báo cáo xưởng.
- Tìm Chọn & bàn giao trên trang VC — không có; Sale bấm trên CRM.

---

Bài 6: nút riêng module + thực hành.
$md_b2000007_0000_0000_0000_000000000005$,
  '/uploads/knowledge-screenshots/deal-05-hop-dong.png',
  $att_b2000007_0000_0000_0000_000000000005$[{"type": "image", "url": "/uploads/knowledge-screenshots/deal-05-hop-dong.png", "caption": "Tài liệu"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-09-the-ban-giao.png", "caption": "Kết quả bàn giao phía Sale"}]$att_b2000007_0000_0000_0000_000000000005$::jsonb,
  12,
  ARRAY['chi-tiet', 'sx', 'bai-5'],
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

INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000007-0000-0000-0000-000000000006',
  'd2000007-0000-0000-0000-000000000001',
  'Bài 6: Nút riêng Sản xuất và thực hành cả trang',
  'Nút chỉ có trên Sản xuất, phiếu tự kiểm, thi cuối nhận chứng nhận.',
  $md_b2000007_0000_0000_0000_000000000006$# Bài 6: Nút riêng Sản xuất và thực hành cả trang

> _Ba nút chỉ xưởng: Đặt xưởng khác, Vật tư, Gửi duyệt — cộng bước bàn giao VC._

## 1. Tab Vật tư / Mua hàng (chỉ SX)

- **Thêm hạng mục**, sửa/xóa dòng, **Thêm NCC nhanh**, lưu.

## 2. Tab Gửi duyệt (chỉ SX)

- **Gửi yêu cầu duyệt** / **Gửi yêu cầu**.
- Người duyệt: **Duyệt** / **Từ chối**.

## 3. Đặt xưởng khác + bàn giao VC (nhắc bài 2)

- Header **Đặt xưởng khác** → form → **Tạo dự án**.
- Stepper cột hoàn thiện → popup **Bàn giao sang VC** → **Xác nhận bàn giao**.
- **Chuyển phân loại** nếu cột yêu cầu đổi loại hàng.

Sale mới bấm **Chọn & bàn giao** trên CRM. Học luồng đủ ở khoá **Kế hoạch SX & VC/LĐ**.

## 4. Đề bài thực hành

Mở `/sx/projects/...`:

1. Badge **SX**, chip công ty / phân loại.
2. Header: **Đặt xưởng khác** (chỉ xem, đừng tạo rác trừ deal THUCHANH), **CRM deal**, **Dự án đầy đủ**.
3. Cột trái: **Phân công Sản xuất**.
4. Công việc: **Thêm việc** hoặc **Bổ sung thiếu SX**.
5. Vật tư: thấy **Thêm hạng mục** (Hủy nếu không nhập thật).
6. Gửi duyệt: thấy **Gửi yêu cầu** (không gửi duyệt giả trên đơn khách).
7. Sự cố: **Báo sự cố**.
8. Biết cột nào là bàn giao VC — không bấm trên đơn khách nếu chưa đến bước.

## 5. Thi cuối

Tick checklist rồi làm bài kiểm tra 80%.
$md_b2000007_0000_0000_0000_000000000006$,
  '/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png',
  $att_b2000007_0000_0000_0000_000000000006$[{"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png", "caption": "Thực hành Sản xuất"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-09b-chon-ban-giao.png", "caption": "Sale xác nhận trên CRM — biết kết quả"}]$att_b2000007_0000_0000_0000_000000000006$::jsonb,
  25,
  ARRAY['chi-tiet', 'sx', 'bai-6'],
  true,
  6,
  true,
  now()
) ON CONFLICT (id) DO UPDATE SET
  category_id = EXCLUDED.category_id, title = EXCLUDED.title, summary = EXCLUDED.summary,
  content_md = EXCLUDED.content_md, cover_image_url = EXCLUDED.cover_image_url,
  attachments = EXCLUDED.attachments, duration_minutes = EXCLUDED.duration_minutes,
  tags = EXCLUDED.tags, is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();

UPDATE knowledge_lessons SET is_final_exam = true WHERE id = 'b2000007-0000-0000-0000-000000000006';

-- BAI TAP
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order,
  image_url, attachments
) VALUES (
  'c2000007-0000-0000-0000-000000000001',
  'b2000007-0000-0000-0000-000000000001',
  'Bài kiểm tra: Toàn cảnh trang chi tiết Sản xuất',
  '10 câu — một số có ảnh. Đạt 70%, tối đa 3 lượt.',
  'quiz',
  $j_c2000007_0000_0000_0000_000000000001${"items": [{"id": "w1", "question": "Trang chi tiết SX và VC có giống nhau không?", "type": "single", "options": ["Hai app khác hẳn", "Cùng giao diện ProductionDetail, khác vài nút và tab", "VC không có trang chi tiết", "Chỉ khác màu logo"], "correct": [1], "explanation": "moduleKey sx/vc."}, {"id": "w2", "question": "Tab Đặt hàng có trên chi tiết xưởng không?", "type": "single", "options": ["Có", "Không — tab đó chỉ CRM", "Chỉ VC có", "Chỉ khi thắng deal"], "correct": [1], "explanation": "Chỉ CRM."}, {"id": "w3", "question": "Tab Vật tư / Mua hàng có trên VC không?", "type": "single", "options": ["Có", "Không — chỉ Sản xuất", "Luôn có", "Chỉ thợ lắp thấy"], "correct": [1], "explanation": "SX-only tab."}, {"id": "w4", "question": "Ba vùng trang chi tiết là?", "type": "single", "options": ["Sidebar / login / KPI", "Header, cột trái Thông tin, hàng tab phải", "Chỉ Kanban", "Chỉ lịch"], "correct": [1], "explanation": "Giống CRM."}, {"id": "w5", "question": "Nút CRM deal trên header dùng để?", "type": "single", "options": ["Xóa deal", "Mở trang chi tiết CRM cùng đơn", "Tạo Lead", "Đổi pass"], "correct": [1], "explanation": "Link /crm/leads/:id."}, {"id": "w6", "question": "Sự cố tab dùng để?", "type": "single", "options": ["Tính lương", "Báo sự cố xưởng/công trình, gửi báo cáo, đánh dấu đã xử lý", "Import Excel", "Ghim Kanban"], "correct": [1], "explanation": "Incidents."}, {"id": "w7", "question": "Dải CRM · Sản xuất · VC/LĐ để?", "type": "single", "options": ["Xóa dự án", "Nhảy module cùng đơn", "Đổi công ty kế toán", "Mở Kiến thức"], "correct": [1], "explanation": "Path strip."}, {"id": "w8", "question": "Banner Lắp đặt tạm xuất hiện trên module nào?", "type": "single", "options": ["CRM", "VC khi Sale đã lên kế hoạch, xưởng chưa bàn giao", "Mọi SX", "Kế toán"], "correct": [1], "explanation": "vc_temp_staged."}, {"id": "w9", "question": "Đường dẫn trang này là?", "type": "single", "options": ["/sx/projects/:id", "/crm/dashboard", "/knowledge", "/login"], "correct": [0], "explanation": "Route module."}, {"id": "w10", "question": "Học chỗ bấm Chọn & bàn giao (Sale) ở khoá nào?", "type": "single", "options": ["Khoá này đủ cho Sale", "Kế hoạch SX & VC/LĐ (khoá CRM Sale xác nhận)", "KPI", "MISA"], "correct": [1], "explanation": "Ranh giới."}]}$j_c2000007_0000_0000_0000_000000000001$::jsonb,
  70,
  3,
  15,
  1,
  '/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png',
  $eax_c2000007_0000_0000_0000_000000000001$[{"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png", "caption": "Minh họa Sản xuất"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-03-nut-ke-hoach.png", "caption": "Deal CRM cùng đơn — để đối chiếu"}]$eax_c2000007_0000_0000_0000_000000000001$::jsonb
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
  'c2000007-0000-0000-0000-000000000002',
  'b2000007-0000-0000-0000-000000000002',
  'Bài kiểm tra: Nút header và cột trái Sản xuất',
  '12 câu — một số có ảnh. Đạt 70%, tối đa 3 lượt.',
  'quiz',
  $j_c2000007_0000_0000_0000_000000000002${"items": [{"id": "h1", "question": "Nút Đặt xưởng khác có trên VC không?", "type": "single", "options": ["Có", "Không — chỉ Sản xuất", "Chỉ thợ lắp", "Chỉ khi TẠM"], "correct": [1], "explanation": "SX-only."}, {"id": "h2", "question": "Đặt xưởng khác dùng khi nào?", "type": "single", "options": ["Xóa dự án", "Tạo thêm dự án ở công ty/xưởng khác", "Đổi pass", "In HĐ"], "correct": [1], "explanation": "Place to other workshop."}, {"id": "h3", "question": "Dự án đầy đủ mở trang nào?", "type": "single", "options": ["/crm/leads", "/projects/:id", "/knowledge", "/login"], "correct": [1], "explanation": "ProjectDetail."}, {"id": "h4", "question": "Nhìn ảnh xưởng. Cột khoanh đỏ thường là bước nào?", "type": "single", "options": ["Xóa thẻ", "Bàn giao — đơn hàng đã chuẩn bị xong", "Tạo Lead", "Import Excel"], "correct": [1], "explanation": "Handover column.", "image_url": "/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png"}, {"id": "h5", "question": "Xưởng bấm bàn giao VC thì Sale phải làm gì?", "type": "single", "options": ["Không gì", "Xác nhận thẻ Chọn & bàn giao trên CRM (tab Bình luận)", "Tạo dự án VC mới tay", "Xóa thẻ TẠM"], "correct": [1], "explanation": "Khóa 534."}, {"id": "h6", "question": "Trên VC, Ngày lấy hàng nằm ở đâu?", "type": "single", "options": ["Sidebar", "Cột trái Thông tin", "Tab Đặt hàng", "KPI"], "correct": [1], "explanation": "WorkshopInfoPanel VC."}, {"id": "h7", "question": "Phân công Sản xuất (chọn người) là nút/select của module nào?", "type": "single", "options": ["VC", "Sản xuất (cột trái)", "Kế toán", "Kiến thức"], "correct": [1], "explanation": "SX team."}, {"id": "h8", "question": "Banner Lắp đặt tạm nghĩa là?", "type": "single", "options": ["Được kéo cột tự do", "Sale đã lên kế hoạch, chưa bàn giao thật — không kéo cột", "Deal đã thua", "Hết hàng"], "correct": [1], "explanation": "Lock."}, {"id": "h9", "question": "Stepper bị chặn thường vì?", "type": "single", "options": ["Thiếu ảnh đại diện", "Nhiệm vụ chặn hoặc thiếu deadline", "Sai múi giờ máy", "Chưa học bài 1"], "correct": [1], "explanation": "Blocking tasks / deadline."}, {"id": "h10", "question": "Nút CRM deal để?", "type": "single", "options": ["Xóa CRM", "Mở chi tiết Lead/Deal cùng đơn", "Tạo PO", "Đổi theme"], "correct": [1], "explanation": "Link CRM."}, {"id": "h11", "question": "Chip phân loại xưởng trên header SX cho biết?", "type": "single", "options": ["Màu áo thợ", "Pipeline đang theo công ty + loại hàng", "KPI tháng", "Mật khẩu"], "correct": [1], "explanation": "workshop_type."}, {"id": "h12", "question": "Người vận chuyển phụ trách chọn ở đâu?", "type": "single", "options": ["Tab Đặt hàng CRM", "Cột trái Thông tin trang VC", "App Switcher", "Thùng rác"], "correct": [1], "explanation": "VC select."}]}$j_c2000007_0000_0000_0000_000000000002$::jsonb,
  70,
  3,
  15,
  1,
  '/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png',
  $eax_c2000007_0000_0000_0000_000000000002$[{"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png", "caption": "Xưởng — bước bàn giao"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-07b-the-tam-ghi-chu.png", "caption": "Thẻ TẠM phía VC"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-09-the-ban-giao.png", "caption": "Sale xác nhận trên CRM"}]$eax_c2000007_0000_0000_0000_000000000002$::jsonb
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
  'c2000007-0000-0000-0000-000000000003',
  'b2000007-0000-0000-0000-000000000003',
  'Bài kiểm tra: Tab Công việc — mẫu, thêm việc, xong hết',
  '10 câu — một số có ảnh. Đạt 70%, tối đa 3 lượt.',
  'quiz',
  $j_c2000007_0000_0000_0000_000000000003${"items": [{"id": "t1", "question": "Tab Công việc SX/VC khác CRM chủ yếu ở?", "type": "single", "options": ["Màu nút Xóa", "Bộ mẫu và nhãn Giao việc theo khối", "Không có Thêm việc", "Không có List"], "correct": [1], "explanation": "Cùng CRMTasksTab."}, {"id": "t2", "question": "Thêm việc làm gì?", "type": "single", "options": ["Tạo deal", "Thêm nhiệm vụ trong nhóm đang mở", "Xóa dự án", "Đổi công ty"], "correct": [1], "explanation": "Giống CRM."}, {"id": "t3", "question": "Xong hết nên bấm khi?", "type": "single", "options": ["Đầu ca", "Nhóm việc thật sự đã xong", "Khi thẻ còn TẠM", "Mỗi giờ"], "correct": [1], "explanation": "Giống CRM."}, {"id": "t4", "question": "Gắn mẫu VC/LĐ dùng trên trang nào?", "type": "single", "options": ["Chỉ CRM lead", "Chi tiết dự án VC/LĐ (hoặc pack VC trên deal)", "KPI", "Thùng rác"], "correct": [1], "explanation": "VC templates."}, {"id": "t5", "question": "List / Deadline / Planner / Lịch là?", "type": "single", "options": ["4 khoá học", "4 cách xem cùng list việc", "4 xưởng", "4 Sale"], "correct": [1], "explanation": "View switcher."}, {"id": "t6", "question": "Giao việc Sản xuất trên dòng việc mở gì?", "type": "single", "options": ["Login", "Bảng giao việc của khối", "MISA", "Facebook"], "correct": [1], "explanation": "Assignments."}, {"id": "t7", "question": "Bổ sung thiếu SX có trên VC không?", "type": "single", "options": ["Luôn", "Đó là nút pack xưởng — trên VC dùng Gắn mẫu VC/LĐ", "Bắt buộc VC", "Xóa việc"], "correct": [1], "explanation": "Khác nhãn."}, {"id": "t8", "question": "Không có CRM deal thì tab Công việc?", "type": "single", "options": ["Trống vĩnh viễn", "Dùng panel mẫu xưởng/VC: Gắn mẫu, Thêm việc", "Tự tạo Lead", "Đổi sang Đặt hàng"], "correct": [1], "explanation": "Workshop fallback."}, {"id": "t9", "question": "Học viên CRM và xưởng cùng thấy Thêm việc vì?", "type": "single", "options": ["Copy nhầm", "Hai module dùng cùng tab Công việc", "Bug", "Chỉ admin thấy"], "correct": [1], "explanation": "Shared UI."}, {"id": "t10", "question": "Phiếu khảo sát Sale nằm tab Công việc CRM — xưởng có phải điền không?", "type": "single", "options": ["Bắt buộc mọi thợ", "Đó là phiếu Sale; xưởng làm việc mẫu xưởng", "Xóa phiếu", "Chỉ VC điền"], "correct": [1], "explanation": "Đúng vai."}]}$j_c2000007_0000_0000_0000_000000000003$::jsonb,
  70,
  3,
  15,
  1,
  '/uploads/knowledge-screenshots/lead-05-nhiem-vu.png',
  $eax_c2000007_0000_0000_0000_000000000003$[{"type": "image", "url": "/uploads/knowledge-screenshots/lead-05-nhiem-vu.png", "caption": "Tab Công việc — cùng UI CRM"}]$eax_c2000007_0000_0000_0000_000000000003$::jsonb
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
  'c2000007-0000-0000-0000-000000000004',
  'b2000007-0000-0000-0000-000000000004',
  'Bài kiểm tra: Không gian chung và Thành viên',
  '10 câu — một số có ảnh. Đạt 70%, tối đa 3 lượt.',
  'quiz',
  $j_c2000007_0000_0000_0000_000000000004${"items": [{"id": "s1", "question": "Không gian chung trên SX/VC có khi nào?", "type": "single", "options": ["Luôn", "Khi dự án gắn CRM deal", "Chỉ admin", "Khi thẻ TẠM"], "correct": [1], "explanation": "crmLeadId."}, {"id": "s2", "question": "Nút Thêm mở form nào?", "type": "single", "options": ["Xóa dự án", "Giao việc mới", "Đặt xưởng", "Import Excel"], "correct": [1], "explanation": "Giống CRM."}, {"id": "s3", "question": "Lọc Xưởng / Lắp đặt để?", "type": "single", "options": ["Đổi App Switcher", "Lọc việc theo khối", "Xóa file", "Tạo PO"], "correct": [1], "explanation": "Chips."}, {"id": "s4", "question": "Thành viên quyết định?", "type": "single", "options": ["Giá SX", "Ai xem được dự án/deal", "Màu cột", "Ca làm"], "correct": [1], "explanation": "Membership."}, {"id": "s5", "question": "Thợ không có trong Thành viên thì?", "type": "single", "options": ["Vẫn thấy mọi deal", "Không vào được (trừ đúng quyền)", "Tự được thêm lúc login", "Chỉ mất KPI"], "correct": [1], "explanation": "Access."}, {"id": "s6", "question": "Giao việc chỉ Zalo — sai vì?", "type": "single", "options": ["Nhanh hơn", "Mất vết trên hệ thống", "Bắt buộc", "Tăng KPI"], "correct": [1], "explanation": "Ghi app."}, {"id": "s7", "question": "Sửa / Xóa dòng giao việc ở đâu?", "type": "single", "options": ["Login", "Từng dòng tab Không gian chung", "Thùng rác tổng", "KPI"], "correct": [1], "explanation": "Row actions."}, {"id": "s8", "question": "Mở trang Giao việc từ Thành viên để?", "type": "single", "options": ["Đăng xuất", "Sang bảng giao việc đầy đủ", "Xóa user", "Đổi pass"], "correct": [1], "explanation": "Navigate."}, {"id": "s9", "question": "Form Giao việc mới cần?", "type": "single", "options": ["Chỉ tiêu đề trống", "Người nhận, mô tả, hạn — rồi Lưu", "Mã số thuế", "Ảnh đại diện công ty"], "correct": [1], "explanation": "Form."}, {"id": "s10", "question": "CRM và SX thấy cùng Không gian chung vì?", "type": "single", "options": ["Hai deal khác", "Cùng deal — giao chéo khối", "Bug", "Chỉ khi thua"], "correct": [1], "explanation": "Shared workspace."}]}$j_c2000007_0000_0000_0000_000000000004$::jsonb,
  70,
  3,
  15,
  1,
  '/uploads/knowledge-screenshots/collab-01.png',
  $eax_c2000007_0000_0000_0000_000000000004$[{"type": "image", "url": "/uploads/knowledge-screenshots/collab-01.png", "caption": "Không gian chung"}, {"type": "image", "url": "/uploads/knowledge-screenshots/collab-05.png", "caption": "Giao việc"}]$eax_c2000007_0000_0000_0000_000000000004$::jsonb
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
  'c2000007-0000-0000-0000-000000000005',
  'b2000007-0000-0000-0000-000000000005',
  'Bài kiểm tra: Tài liệu, Drive, Ghi chú, Bình luận, Sự cố',
  '12 câu — một số có ảnh. Đạt 70%, tối đa 3 lượt.',
  'quiz',
  $j_c2000007_0000_0000_0000_000000000005${"items": [{"id": "d1", "question": "Xưởng không thấy bản vẽ CRM — hay vì?", "type": "single", "options": ["Hết dung lượng Zalo", "File chưa chia sẻ sang khối SX", "Sai mật khẩu", "Thiếu KPI"], "correct": [1], "explanation": "Share."}, {"id": "d2", "question": "Tải tất cả làm gì?", "type": "single", "options": ["Xóa", "ZIP tài liệu", "Tạo Lead", "Đổi cột"], "correct": [1], "explanation": "ZIP."}, {"id": "d3", "question": "Tab Sự cố có trên chi tiết CRM không?", "type": "single", "options": ["Có, tên Ghi âm", "Không — Sự cố ở trang SX/VC", "Chỉ Lead", "Chỉ khi thắng"], "correct": [1], "explanation": "SX/VC."}, {"id": "d4", "question": "Báo sự cố các bước?", "type": "single", "options": ["Xóa dự án", "Báo sự cố → điền → Gửi báo cáo; xong thì Đã xử lý", "Import Excel", "Chuyển Deal"], "correct": [1], "explanation": "Incident CRUD."}, {"id": "d5", "question": "Chọn & bàn giao ai bấm, ở đâu?", "type": "single", "options": ["Thợ VC trên trang VC", "Sale trên CRM tab Bình luận", "Kế toán tab Đặt hàng", "Admin theme"], "correct": [1], "explanation": "Khóa 534."}, {"id": "d6", "question": "Nhập văn bản tạo gì?", "type": "single", "options": ["User", "Tài liệu chữ trên hệ thống", "Cột Kanban", "PO"], "correct": [1], "explanation": "Text doc."}, {"id": "d7", "question": "Chia sẻ CRM trên file xưởng để?", "type": "single", "options": ["Xóa file", "Sale đọc được file từ khối xưởng", "Đổi xưởng", "In lương"], "correct": [1], "explanation": "Share reverse."}, {"id": "d8", "question": "Ghi chú Gửi nhanh?", "type": "single", "options": ["F1", "Ctrl+Enter", "Shift+F5", "Esc"], "correct": [1], "explanation": "Giống CRM."}, {"id": "d9", "question": "Drive tab dùng khi?", "type": "single", "options": ["File Google Drive gắn dự án", "Đổi pipeline", "KPI", "Login"], "correct": [0], "explanation": "Drive."}, {"id": "d10", "question": "Bình luận Trả lời / Sửa / Xóa là?", "type": "single", "options": ["Xóa dự án", "Thao tác từng comment", "Bàn giao VC tự động", "Tạo sự kiện"], "correct": [1], "explanation": "Comments."}, {"id": "d11", "question": "Sự cố không ghi trên app thì?", "type": "single", "options": ["Vẫn vào báo cáo", "Mất vết, quản lý không thấy", "KPI tăng", "Tự tạo Lead"], "correct": [1], "explanation": "Ghi app."}, {"id": "d12", "question": "Upload file xưởng khác Upload CRM?", "type": "single", "options": ["Khác chỗ bấm, cùng ý: đưa file vào đơn", "Xóa deal", "Chỉ PDF", "Chỉ admin VC"], "correct": [0], "explanation": "Cùng ý."}]}$j_c2000007_0000_0000_0000_000000000005$::jsonb,
  70,
  3,
  15,
  1,
  '/uploads/knowledge-screenshots/deal-05-hop-dong.png',
  $eax_c2000007_0000_0000_0000_000000000005$[{"type": "image", "url": "/uploads/knowledge-screenshots/deal-05-hop-dong.png", "caption": "Tài liệu"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-09-the-ban-giao.png", "caption": "Kết quả bàn giao phía Sale"}]$eax_c2000007_0000_0000_0000_000000000005$::jsonb
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
  'c2000007-0000-0000-0000-000000000006',
  'b2000007-0000-0000-0000-000000000006',
  'Bài kiểm tra cuối: Từng nút trên chi tiết Sản xuất',
  'Làm xong phiếu tự kiểm rồi vào đây. 15 câu, một số có ảnh. Đạt 80%, tối đa 3 lượt, 25 phút.',
  'quiz',
  $j_c2000007_0000_0000_0000_000000000006${"items": [{"id": "f1", "question": "Tab Vật tư có trên VC không?", "type": "single", "options": ["Có", "Không — chỉ SX", "Chỉ khi TẠM", "Thay Gửi duyệt"], "correct": [1], "explanation": "SX-only."}, {"id": "f2", "question": "Gửi duyệt các nút?", "type": "single", "options": ["Xóa dự án", "Gửi yêu cầu duyệt; người duyệt Duyệt hoặc Từ chối", "Import Excel", "Chuyển Deal"], "correct": [1], "explanation": "Approvals."}, {"id": "f3", "question": "Đặt xưởng khác tạo ra?", "type": "single", "options": ["Lead mới", "Dự án SX thêm ở xưởng/công ty khác", "PO CRM", "User"], "correct": [1], "explanation": "Place."}, {"id": "f4", "question": "Nhìn ảnh. Cột bàn giao xưởng thường tên gần với?", "type": "single", "options": ["Lead mới", "Đơn hàng đã chuẩn bị xong", "Thùng rác", "KPI"], "correct": [1], "explanation": "Handover.", "image_url": "/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png"}, {"id": "f5", "question": "Sau khi xưởng xác nhận bàn giao VC, ai bấm Chọn & bàn giao?", "type": "single", "options": ["Mọi thợ", "Sale trên CRM", "Tài xế", "Khách"], "correct": [1], "explanation": "Sale."}, {"id": "f6", "question": "Thêm hạng mục nằm tab nào?", "type": "single", "options": ["Thành viên", "Vật tư / Mua hàng", "Ghi âm", "Đặt hàng CRM"], "correct": [1], "explanation": "Procurement."}, {"id": "f7", "question": "Chuyển phân loại hiện khi?", "type": "single", "options": ["Login", "Cột stepper có cờ đổi loại xưởng", "Mọi cột", "Tab Drive"], "correct": [1], "explanation": "is_switch_workshop_type."}, {"id": "f8", "question": "Phân công Sản xuất ở?", "type": "single", "options": ["App Switcher", "Cột trái Thông tin", "Thùng rác", "KPI giám đốc"], "correct": [1], "explanation": "Select."}, {"id": "f9", "question": "Báo sự cố tab?", "type": "single", "options": ["CRM Đặt hàng", "Sự cố", "Facebook", "MISA"], "correct": [1], "explanation": "Incidents."}, {"id": "f10", "question": "Không gian chung Thêm?", "type": "single", "options": ["Xóa xưởng", "Giao việc mới", "Tạo Lead", "Duyệt"], "correct": [1], "explanation": "Assign."}, {"id": "f11", "question": "File CRM xưởng không thấy — làm?", "type": "single", "options": ["Đổi pass", "Nhờ Sale chia sẻ sang khối SX", "Xóa deal", "Tạo PO"], "correct": [1], "explanation": "Share."}, {"id": "f12", "question": "Form ngày lắp / cột tạm học ở?", "type": "single", "options": ["Tab Vật tư", "Khoá Kế hoạch SX & VC/LĐ", "Gửi duyệt", "Theme"], "correct": [1], "explanation": "534."}, {"id": "f13", "question": "Xong hết tab Công việc khi?", "type": "single", "options": ["Đầu ca", "Việc nhóm thật sự xong", "Thẻ TẠM", "Mỗi giờ"], "correct": [1], "explanation": "Done."}, {"id": "f14", "question": "Popup Bàn giao sang VC có nút?", "type": "single", "options": ["Xóa công ty", "Xác nhận bàn giao", "Import Excel", "Chuyển Deal"], "correct": [1], "explanation": "Confirm."}, {"id": "f15", "question": "Gửi yêu cầu duyệt trên đơn khách khi chưa đến bước — nên?", "type": "single", "options": ["Cứ gửi", "Không — chỉ thực hành trên deal THUCHANH hoặc đơn đúng bước", "Gửi 3 lần", "Xóa dự án"], "correct": [1], "explanation": "Không rác."}]}$j_c2000007_0000_0000_0000_000000000006$::jsonb,
  80,
  3,
  25,
  1,
  '/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png',
  $eax_c2000007_0000_0000_0000_000000000006$[{"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png", "caption": "Thực hành Sản xuất"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-09b-chon-ban-giao.png", "caption": "Sale xác nhận trên CRM — biết kết quả"}]$eax_c2000007_0000_0000_0000_000000000006$::jsonb
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
  'c2000007-0000-0001-0000-000000000006',
  'b2000007-0000-0000-0000-000000000006',
  'Phiếu tự kiểm — thao tác trên dự án thật',
  'Đánh dấu khi đã làm được trên phần mềm. Hủy form nếu chỉ xem, đừng tạo dữ liệu rác.',
  'checklist',
  $j_c2000007_0000_0001_0000_000000000006${"items": [{"id": "c1", "text": "Mở chi tiết dự án SX: badge SX, 3 vùng màn hình"}, {"id": "c2", "text": "Header: chỉ Đặt xưởng khác, CRM deal, Dự án đầy đủ"}, {"id": "c3", "text": "Cột trái: chỉ Phân công Sản xuất / ngày hoàn thiện"}, {"id": "c4", "text": "Tab Công việc: thấy Thêm việc hoặc Bổ sung thiếu SX"}, {"id": "c5", "text": "Tab Vật tư: thấy Thêm hạng mục (không lưu rác)"}, {"id": "c6", "text": "Tab Gửi duyệt: thấy Gửi yêu cầu (không gửi giả trên đơn khách)"}, {"id": "c7", "text": "Tab Sự cố: thấy Báo sự cố"}, {"id": "c8", "text": "Hiểu: xưởng bàn giao cột → Sale mới Chọn & bàn giao trên CRM"}]}$j_c2000007_0000_0001_0000_000000000006$::jsonb,
  80,
  NULL,
  NULL,
  2,
  '/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png',
  $eax_c2000007_0000_0001_0000_000000000006$[]$eax_c2000007_0000_0001_0000_000000000006$::jsonb
) ON CONFLICT (id) DO UPDATE SET
  lesson_id = EXCLUDED.lesson_id, title = EXCLUDED.title, instructions = EXCLUDED.instructions,
  type = EXCLUDED.type, questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, image_url = EXCLUDED.image_url,
  attachments = EXCLUDED.attachments, updated_at = now();

COMMIT;
