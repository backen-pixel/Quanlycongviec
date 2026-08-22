-- 554
-- Khoá «Thao tác chi tiết CRM» — từng nút trên trang Lead/Deal
-- 6 bài (bài 6 = thi cuối + checklist). Ảnh tái sử dụng screenshot Kiến thức đã có.
-- Idempotent: ON CONFLICT DO UPDATE
-- Sinh: python scripts/knowledge/build_detail_button_seeds.py

BEGIN;
INSERT INTO knowledge_categories (id, name, slug, description, icon, sort_order, is_active)
VALUES (
  'd2000006-0000-0000-0000-000000000001',
  'Thao tác chi tiết CRM — từng nút trên Lead / Deal',
  'thao-tac-chi-tiet-crm',
  'Dành cho Sale CRM. Học từng nút trên trang chi tiết Lead/Deal: header, cột Thông tin, và từng tab. Nút kế hoạch SX & VC/LĐ trỏ sang khoá riêng.',
  '🖱️',
  41,
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
  certificate_template = $ct${"signature_name": "Ban điều hành TuBep Pro", "signature_title": "Phụ trách đào tạo vận hành", "footer_note": "Chứng nhận đã nắm từng nút trên trang chi tiết Lead/Deal CRM.", "accent_color": "#2563eb"}$ct$::jsonb
WHERE id = 'd2000006-0000-0000-0000-000000000001';

-- BAI HOC
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000006-0000-0000-0000-000000000001',
  'd2000006-0000-0000-0000-000000000001',
  'Bài 1: Toàn cảnh trang chi tiết Lead / Deal',
  'Ba vùng màn hình: header nút, cột trái Thông tin, hàng tab bên phải.',
  $md_b2000006_0000_0000_0000_000000000001$# Bài 1: Toàn cảnh trang chi tiết Lead / Deal

> _Mở một thẻ trên Kanban là vào trang này. Mọi nút quan trọng của Sale nằm ở đây — không nằm ở menu trái._

## 1. Ba vùng trên một màn hình

Trang chi tiết (`/crm/leads/:id`) dùng chung cho **Lead** và **Deal**. Nhìn 3 vùng:

1. **Header trên** — tên khách, nút thao tác (Chuyển Deal, Tạo sự kiện, Import Excel, kế hoạch SX & VC/LĐ…).
2. **Cột trái Thông tin** — SĐT, giá trị, nguồn, người phụ trách, deadline thẻ, stepper giai đoạn.
3. **Cột phải — hàng tab** — Công việc, Không gian chung, Đặt hàng, Tài liệu, Drive, Ghi chú & HĐ, Thành viên, Bình luận, Ghi âm.

![Trang chi tiết Lead — header và cột trái](/uploads/knowledge-screenshots/guide-06-chi-tiet-lead.png)

## 2. Hàng tab bên phải

Mỗi tab là một nhóm nút — bài sau đi từng nhóm.

![Hàng tab trên chi tiết Lead/Deal](/uploads/knowledge-screenshots/lead-09-chi-tiet-tab.png)

- **Công việc** — nhiệm vụ theo mẫu pipeline, phiếu khảo sát.
- **Không gian chung** — giao việc cho thành viên, kể cả khối SX / VC.
- **Đặt hàng** — lệnh đặt hàng gắn deal (tab riêng CRM, không có trên SX/VC).
- **Tài liệu / Drive** — file trên hệ thống và Google Drive.
- **Ghi chú & HĐ** — ghi chú nội bộ và hoạt động.
- **Thành viên** — ai được xem deal này.
- **Bình luận** — trao đổi + thẻ bàn giao VC/LĐ.
- **Ghi âm** — file ghi âm cuộc gọi gắn deal.
- Tab **Facebook / Zalo OA** chỉ hiện khi deal đến từ kênh đó.
- Tab **Điểm chéo & KH** chỉ hiện khi deal đã ở cột Hoàn thành.

Deal còn có **dải CRM · Sản xuất · VC/LĐ** dưới header — bấm để nhảy sang trang chi tiết xưởng hoặc lắp đặt của cùng đơn.

## 3. Lead khác Deal thế nào trên cùng trang

- **Lead:** có nút xanh **Chuyển Deal**. Chưa có kế hoạch SX & VC/LĐ.
- **Deal:** có nút vàng **Trả về Lead**, nút cam **Thiết lập kế hoạch SX & VC/LĐ** (hoặc **Kế hoạch SX & VC/LĐ** nếu đã tạo dự án), và có thể có **Tạo đơn hàng phát sinh**.

## 4. Lỗi hay gặp

- Tìm nút ở sidebar — sai chỗ. Nút thao tác deal nằm **trên trang chi tiết**.
- Nhầm tab Công việc với Không gian chung: Công việc = checklist theo mẫu; Không gian chung = giao việc cho người.

---

Bài sau: từng nút trên header và cột trái.
$md_b2000006_0000_0000_0000_000000000001$,
  '/uploads/knowledge-screenshots/guide-06-chi-tiet-lead.png',
  $att_b2000006_0000_0000_0000_000000000001$[{"type": "image", "url": "/uploads/knowledge-screenshots/guide-06-chi-tiet-lead.png", "caption": "Header và cột trái"}, {"type": "image", "url": "/uploads/knowledge-screenshots/lead-09-chi-tiet-tab.png", "caption": "Hàng tab bên phải"}, {"type": "image", "url": "/uploads/knowledge-screenshots/lead-04-tong-quan.png", "caption": "Cột Thông tin"}]$att_b2000006_0000_0000_0000_000000000001$::jsonb,
  8,
  ARRAY['chi-tiet', 'crm', 'bai-1'],
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
  'b2000006-0000-0000-0000-000000000002',
  'd2000006-0000-0000-0000-000000000001',
  'Bài 2: Nút header và cột trái Thông tin',
  'Từng nút trên thanh hành động và cột Thông tin: Chuyển Deal, sự kiện, khảo sát, Excel, kế hoạch SX, đơn phát sinh, stepper, deadline.',
  $md_b2000006_0000_0000_0000_000000000002$# Bài 2: Nút header và cột trái Thông tin

> _Sale mở deal đã ký — hàng nút trên header là bàn phím tắt của cả ca._

## 1. Nút trên header (trái → phải, đúng nhãn phần mềm)

1. **Hướng dẫn chi tiết** — bật tour từng vùng trên trang. Dùng khi mới vào.
2. **Chuyển Deal** (xanh, chỉ Lead) — mở popup «Chuyển Lead sang Deal». Điền người phụ trách nếu hệ thống yêu cầu rồi xác nhận.
3. **Trả về Lead** (vàng, chỉ Deal) — trả deal về Lead, chọn lại người phụ trách. Nếu deal đã có dự án SX, hệ thống **gỡ liên kết** dự án khỏi deal (không xóa xưởng).
4. **Chuyển người phụ trách** — đổi công ty / khu vực / Sale. Có trên header và trong cột Thông tin.
5. **Tạo sự kiện** — lịch gắn đúng lead/deal này (gặp khách, khảo sát).
6. **Thêm phiếu khảo sát** / **Sửa phiếu khảo sát** — nhảy sang tab Công việc và mở form phiếu. Nút cam đậm = chưa điền; cam nhạt = đã có phiếu.
7. **Import Excel** — nhập báo giá từ file Excel vào deal.
8. **Thiết lập kế hoạch SX & VC/LĐ** (cam, Deal chưa có dự án) hoặc **Kế hoạch SX & VC/LĐ** (đã có dự án, sửa lịch). **Cách điền form nằm ở khoá «Kế hoạch SX & VC/LĐ»** — khoá này chỉ dạy **chỗ bấm**.
9. **Tạo đơn hàng phát sinh** (Deal khách hàng) — tạo deal + dự án SX mới, hiện ở cột đầu tab Khách hàng.

![Nút cam kế hoạch SX & VC/LĐ trên header deal](/uploads/knowledge-screenshots/sx-vc-03-nut-ke-hoach.png)

## 2. Cột trái — bấm từng dòng

- Sửa **tên** bằng icon bút cạnh tiêu đề → **Lưu** / **Hủy**.
- Click từng dòng Thông tin: Giá trị, Tiền cọc, Nguồn, Loại, Công ty, Khu vực, Ngày dự kiến chốt, Theo dõi tiếp, Mô tả.
- **Đặt** / **Sửa** deadline thẻ — hạn trên Kanban, khác hạn giai đoạn.
- **Bàn giao Sản xuất (thủ công)** — khi deal đã thắng mà chưa ra dự án, bấm rồi **Xác nhận bàn giao Sản xuất**.
- Khối dự án SX: **Mở SX**, **Sửa lịch**, **+ Thêm dự án SX**, **Chuyển công ty SX** (đúng quyền).

## 3. Stepper giai đoạn

Hàng vòng tròn dưới header. Bấm vòng khác cột = chuyển giai đoạn. Hệ thống có thể chặn và mở popup: chọn người, đặt deadline, lý do thua, hoặc cảnh báo nhiệm vụ chưa xong.

Deal **thua** có banner đỏ **Hồi lại deal**.

![Stepper giai đoạn deal](/uploads/knowledge-screenshots/deal-02-pipeline.png)

## 4. Lỗi hay gặp

- Bấm Chuyển Deal khi còn thiếu người phụ trách — đọc popup, đừng đóng tắt.
- Tìm «Thiết lập kế hoạch» trên Lead — nút chỉ hiện trên **Deal**.
- Import Excel nhầm file khách — dùng mẫu báo giá của công ty.

---

Luồng điền kế hoạch SX & VC/LĐ: học khoá **Kế hoạch SX & VC/LĐ**. Bài sau: tab Công việc.
$md_b2000006_0000_0000_0000_000000000002$,
  '/uploads/knowledge-screenshots/sx-vc-03-nut-ke-hoach.png',
  $att_b2000006_0000_0000_0000_000000000002$[{"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-03-nut-ke-hoach.png", "caption": "Header deal — nút kế hoạch"}, {"type": "image", "url": "/uploads/knowledge-screenshots/deal-02-pipeline.png", "caption": "Stepper giai đoạn"}, {"type": "image", "url": "/uploads/knowledge-screenshots/guide-06-chi-tiet-lead.png", "caption": "Cột trái Thông tin"}]$att_b2000006_0000_0000_0000_000000000002$::jsonb,
  14,
  ARRAY['chi-tiet', 'crm', 'bai-2'],
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
  'b2000006-0000-0000-0000-000000000003',
  'd2000006-0000-0000-0000-000000000001',
  'Bài 3: Tab Công việc — mẫu, thêm việc, xong hết',
  'Gắn mẫu, Thêm việc, Xong hết, đổi List/Deadline/Planner/Lịch, phiếu khảo sát và giao việc CRM.',
  $md_b2000006_0000_0000_0000_000000000003$# Bài 3: Tab Công việc — mẫu, thêm việc, xong hết

> _Phiếu khảo sát và checklist bán hàng sống ở tab này — không phải tab Bình luận._

## 1. Mở tab

Trên chi tiết Lead/Deal bấm **Công việc**. Deal có thể thấy nút gạt **CRM / SX** để xem pack nhiệm vụ bán hàng hoặc pack xưởng.

![Tab Công việc](/uploads/knowledge-screenshots/lead-05-nhiem-vu.png)

## 2. Từng nút trên thanh tab

1. **Gắn mẫu** — mở panel chọn bộ mẫu CRM của pipeline. Bấm tên mẫu để gắn việc vào deal.
2. **Bổ sung thiếu CRM** / **Bổ sung thiếu SX** — thêm việc còn thiếu so với mẫu (khi deal đã chuyển xưởng).
3. Đổi kiểu xem: **List** · **Deadline** · **Planner** · **Lịch**.
4. Trong từng nhóm: **Thêm việc** — tạo thêm 1 việc dưới giai đoạn.
5. **Xong hết** — đánh dấu hoàn thành cả nhóm. Chỉ bấm khi thật sự xong.

## 3. Từng dòng việc

- Ô tròn = hoàn thành 1 việc.
- Bấm tên việc = sửa (hạn, người, mô tả).
- Đính file, checklist con, ghi chú, **+ Ngày hẹn**.
- **Giao việc CRM** — mở bảng giao việc khối bán hàng.
- Phiếu khảo sát trên việc: **Sửa phiếu** / **Xóa phiếu**.
- **Khôi phục từ mẫu** nếu việc bị xóa nhầm.

Header **Thêm phiếu khảo sát** cũng nhảy vào đây và mở form.

## 4. Lỗi hay gặp

- Bấm Xong hết cả nhóm khi còn việc khách chưa chốt — KPI sai.
- Gắn nhầm mẫu pipeline khác công ty — chọn đúng công ty trên deal trước.
- Tìm phiếu khảo sát ở tab Ghi chú — phiếu nằm Công việc / nút header.

---

Bài sau: Không gian chung và Thành viên.
$md_b2000006_0000_0000_0000_000000000003$,
  '/uploads/knowledge-screenshots/lead-05-nhiem-vu.png',
  $att_b2000006_0000_0000_0000_000000000003$[{"type": "image", "url": "/uploads/knowledge-screenshots/lead-05-nhiem-vu.png", "caption": "Tab Công việc trên chi tiết"}]$att_b2000006_0000_0000_0000_000000000003$::jsonb,
  12,
  ARRAY['chi-tiet', 'crm', 'bai-3'],
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
  'b2000006-0000-0000-0000-000000000004',
  'd2000006-0000-0000-0000-000000000001',
  'Bài 4: Không gian chung và Thành viên',
  'Giao việc cho người (kể cả SX/VC), lọc Bán hàng / Xưởng / Lắp đặt, thêm thành viên xem deal.',
  $md_b2000006_0000_0000_0000_000000000004$# Bài 4: Không gian chung và Thành viên

> _Muốn xưởng thấy một việc Sale giao — vào Không gian chung, không nhắn Zalo riêng._

## 1. Tab Không gian chung

Bấm **Không gian chung**. Đây là nơi **giao việc cho người**, khác tab Công việc (checklist mẫu).

![Không gian chung](/uploads/knowledge-screenshots/collab-01.png)

### Nút trên tab

1. Lọc **Tất cả** · **Bán hàng** · **Xưởng** · **Lắp đặt** — xem việc theo khối.
2. **Giao việc** (link) — mở bảng giao việc đầy đủ.
3. **Thêm** — form «Giao việc mới»: chọn người, mô tả, hạn, ảnh, khối. **Lưu** / **Hủy**.
4. Trên từng dòng: **Sửa**, **Xóa**, **Thêm ảnh**.

Nếu deal là đơn phát sinh: có link **Mở deal nguồn**.

## 2. Tab Thành viên

Bấm **Thành viên**. Ai không có trong list thì **không vào được** deal này (trừ admin đúng quyền).

1. **Thêm thành viên** — chọn người trong hệ sinh thái.
2. **Chọn tất cả** / **Bỏ chọn**.
3. **+ Thêm N người vào danh sách** rồi lưu.
4. Đổi vai trò hoặc **Xóa** từng người.

Badge số trên tab (xanh / teal / cam) = số thành viên theo khối CRM / SX / VC.

Khi lập kế hoạch SX & VC/LĐ, hệ thống **tự thêm** người phụ trách VC vào Thành viên — kiểm lại tab này sau khi lưu kế hoạch.

## 3. Lỗi hay gặp

- Giao việc trong tab Công việc rồi tưởng xưởng nhận — xưởng nhận ở **Không gian chung** / bảng Giao việc SX.
- Thêm nhầm người ngoài công ty — xóa ngay trên tab Thành viên.

---

Bài sau: Tài liệu, Drive, ghi chú, bình luận.
$md_b2000006_0000_0000_0000_000000000004$,
  '/uploads/knowledge-screenshots/collab-01.png',
  $att_b2000006_0000_0000_0000_000000000004$[{"type": "image", "url": "/uploads/knowledge-screenshots/collab-01.png", "caption": "Không gian chung trên deal"}, {"type": "image", "url": "/uploads/knowledge-screenshots/collab-05.png", "caption": "Giao việc trong không gian chung"}]$att_b2000006_0000_0000_0000_000000000004$::jsonb,
  10,
  ARRAY['chi-tiet', 'crm', 'bai-4'],
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
  'b2000006-0000-0000-0000-000000000005',
  'd2000006-0000-0000-0000-000000000001',
  'Bài 5: Tài liệu, Drive, Ghi chú, Bình luận, Ghi âm',
  'Upload/chia sẻ file, ghi chú nội bộ, bình luận (kể cả Chọn & bàn giao), nghe ghi âm.',
  $md_b2000006_0000_0000_0000_000000000005$# Bài 5: Tài liệu, Drive, Ghi chú, Bình luận, Ghi âm

> _File và lời nói với khách phải nằm trên deal — xưởng mở đúng tab là thấy._

## 1. Tab Tài liệu

1. **Nhập văn bản** — tạo tài liệu chữ (biên bản, ghi nhớ).
2. **Upload file** — PDF, ảnh, CAD…
3. **Tải tất cả (N)** — gói ZIP.
4. Từng file: **Mở**, **In**, **Tải**, bánh răng **chia sẻ sang khối SX / VC**, **Xóa**.

File chưa chia sẻ thì xưởng **không thấy** dù đã có trên CRM.

![Tài liệu trên deal](/uploads/knowledge-screenshots/deal-05-hop-dong.png)

## 2. Tab Drive

**Thư mục**, **Tải lên từ máy**, **Doc**, **Sheet**, **Liên kết file Drive**, **Tải xuống**, **Xóa**, **Chọn tất cả**. Dùng khi file sống trên Google Drive công ty.

## 3. Tab Ghi chú & HĐ

- Ô soạn thảo → **Gửi (Ctrl+Enter)**.
- **Sửa** / **Lưu** / **Hủy** ghi chú cũ.
- **Chia sẻ sang khối khác** nếu xưởng/VC cần đọc.
- **Thêm** (Hoạt động) — ghi cuộc gọi, gặp mặt.

## 4. Tab Bình luận

- Gửi bình luận, **@mention**, **Trả lời**, **Sửa**, **Xóa**.
- Deal có thể có mẫu trả lời nhanh.
- Khi xưởng bàn giao: thẻ **Bàn giao Lắp đặt**. Sale đọc thông tin rồi bấm **Chọn & bàn giao**. Chi tiết luồng nằm ở khoá **Kế hoạch SX & VC/LĐ**.

![Nút Chọn & bàn giao trên thẻ bàn giao](/uploads/knowledge-screenshots/sx-vc-09b-chon-ban-giao.png)

## 5. Tab Ghi âm

Danh sách file ghi âm gắn deal. Upload thường làm ở trang **Cuộc gọi & ghi âm**, rồi file hiện lại đây.

Tab **Facebook / Zalo OA** (nếu có): trả lời khách, đính Drive, **Gửi**.

## 6. Lỗi hay gặp

- Upload hợp đồng nhưng không bật chia sẻ SX — xưởng bảo «không có bản vẽ».
- Thảo luận giá trong kênh khách (Facebook/Zalo) thay vì Ghi chú nội bộ.

---

Bài 6: tab Đặt hàng, điểm chéo, và thực hành cả trang.
$md_b2000006_0000_0000_0000_000000000005$,
  '/uploads/knowledge-screenshots/deal-05-hop-dong.png',
  $att_b2000006_0000_0000_0000_000000000005$[{"type": "image", "url": "/uploads/knowledge-screenshots/deal-05-hop-dong.png", "caption": "Tài liệu trên deal"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-09b-chon-ban-giao.png", "caption": "Chọn & bàn giao"}, {"type": "image", "url": "/uploads/knowledge-screenshots/lead-09-chi-tiet-tab.png", "caption": "Hàng tab"}]$att_b2000006_0000_0000_0000_000000000005$::jsonb,
  12,
  ARRAY['chi-tiet', 'crm', 'bai-5'],
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
  'b2000006-0000-0000-0000-000000000006',
  'd2000006-0000-0000-0000-000000000001',
  'Bài 6: Đặt hàng, điểm chéo và thực hành cả trang',
  'Tab Đặt hàng, Điểm chéo & KH, phiếu tự kiểm toàn bộ nút chi tiết, rồi thi cuối.',
  $md_b2000006_0000_0000_0000_000000000006$# Bài 6: Đặt hàng, điểm chéo và thực hành cả trang

> _Hai tab còn lại chỉ có trên CRM, rồi bạn tự chạy một vòng trên deal thật._

## 1. Tab Đặt hàng (chỉ CRM)

Trang chi tiết SX/VC **không** có tab này.

1. **Thêm** / **Thêm mới** — tạo lệnh đặt hàng gắn deal.
2. Chip trạng thái (**Tất cả** và từng trạng thái PO) — lọc list.
3. Từng dòng: **Xem**, **Sửa**, **Xóa**.
4. Form: **Lưu** / **Hủy**.

Không nhầm với **Tạo đơn hàng phát sinh** trên header (tạo **deal mới**), còn tab này là **PO mua hàng** trong deal đang mở.

## 2. Tab Điểm chéo & KH

Chỉ hiện khi deal ở cột **Hoàn thành**. Dùng để nhập/xem điểm chéo sau nghiệm thu — không phải chỗ bán hàng hàng ngày.

## 3. Đề bài thực hành

Mở một deal bạn phụ trách (ưu tiên deal test **THUCHANH - tên bạn - ngày** nếu không muốn đụng khách thật):

1. Đọc header: gọi tên từng nút đang hiện (Lead khác Deal).
2. Cột trái: mở **Sửa** deadline thẻ rồi **Hủy** nếu không đổi thật.
3. Tab Công việc → List → chỉ cần thấy **Thêm việc**.
4. Không gian chung → **Thêm** → xem form → **Hủy**.
5. Thành viên → xác nhận bạn có trong list.
6. Tài liệu → thấy **Upload file**.
7. Bình luận → cuộn tìm thẻ bàn giao nếu deal đã qua xưởng.
8. Đặt hàng → thấy nút **Thêm**.
9. Nếu deal có dải CRM · SX · VC: bấm **Sản xuất** xem trang xưởng, **Quay lại** deal.

## 4. Phiếu tự kiểm

Tick hết mục bài tập checklist dưới bài này rồi làm **Bài kiểm tra cuối**.

Deal thực hành đặt tên **THUCHANH - …** — nhắn admin xóa sau, đừng để lệch báo cáo.

## 5. Nhắc lại ranh giới hai khoá

- Khoá này: **chỗ bấm** trên trang chi tiết CRM.
- Khoá **Kế hoạch SX & VC/LĐ**: điền form ngày lắp, cột tạm, Chọn & bàn giao.

---

Đạt bài kiểm tra cuối để nhận chứng nhận khoá thao tác chi tiết CRM.
$md_b2000006_0000_0000_0000_000000000006$,
  '/uploads/knowledge-screenshots/lead-09-chi-tiet-tab.png',
  $att_b2000006_0000_0000_0000_000000000006$[{"type": "image", "url": "/uploads/knowledge-screenshots/lead-09-chi-tiet-tab.png", "caption": "Hàng tab CRM"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-03-nut-ke-hoach.png", "caption": "Header kế hoạch"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-09b-chon-ban-giao.png", "caption": "Chọn & bàn giao"}]$att_b2000006_0000_0000_0000_000000000006$::jsonb,
  25,
  ARRAY['chi-tiet', 'crm', 'bai-6'],
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

UPDATE knowledge_lessons SET is_final_exam = true WHERE id = 'b2000006-0000-0000-0000-000000000006';

-- BAI TAP
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order,
  image_url, attachments
) VALUES (
  'c2000006-0000-0000-0000-000000000001',
  'b2000006-0000-0000-0000-000000000001',
  'Bài kiểm tra: Toàn cảnh trang chi tiết Lead / Deal',
  '10 câu — một số câu có ảnh. Đạt 70%, tối đa 3 lượt.',
  'quiz',
  $j_c2000006_0000_0000_0000_000000000001${"items": [{"id": "c1", "question": "Trang chi tiết Lead/Deal có mấy vùng chính?", "type": "single", "options": ["1 vùng giữa", "3 vùng: header, cột trái Thông tin, hàng tab phải", "Chỉ Kanban", "Chỉ sidebar"], "correct": [1], "explanation": "Header + Thông tin + tab phải."}, {"id": "c2", "question": "Lead và Deal dùng trang chi tiết nào?", "type": "single", "options": ["Hai trang khác nhau", "Cùng /crm/leads/:id, khác nút header", "Chỉ Deal có trang chi tiết", "Trong module SX"], "correct": [1], "explanation": "Cùng LeadDetail, nút hiện tùy loại."}, {"id": "c3", "question": "Nhìn ảnh. Hàng tab nằm ở đâu?", "type": "single", "options": ["Menu trái sidebar", "Cột phải trang chi tiết", "App Switcher", "Trang Kiến thức"], "correct": [1], "explanation": "Hàng tab cột phải.", "image_url": "/uploads/knowledge-screenshots/lead-09-chi-tiet-tab.png"}, {"id": "c4", "question": "Tab Đặt hàng dùng để làm gì?", "type": "single", "options": ["Đổi mật khẩu", "Lệnh đặt hàng gắn deal", "Gửi duyệt xưởng", "Bật cột LĐ tạm"], "correct": [1], "explanation": "Tab riêng CRM."}, {"id": "c5", "question": "Dải CRM · Sản xuất · VC/LĐ trên deal dùng để?", "type": "single", "options": ["Xóa deal", "Nhảy sang chi tiết cùng đơn ở module khác", "In PDF lương", "Đổi pass"], "correct": [1], "explanation": "DealModulePathStrip."}, {"id": "c6", "question": "Nút Chuyển Deal hiện khi nào?", "type": "single", "options": ["Mọi deal", "Khi bản ghi đang là Lead", "Chỉ admin", "Khi đã thua"], "correct": [1], "explanation": "Chỉ Lead."}, {"id": "c7", "question": "Tab Điểm chéo & KH hiện khi nào?", "type": "single", "options": ["Luôn luôn", "Khi deal ở cột Hoàn thành", "Khi còn là Lead", "Trên Kanban"], "correct": [1], "explanation": "Chỉ cột Hoàn thành."}, {"id": "c8", "question": "Muốn giao việc cho thợ xưởng từ deal — vào tab nào?", "type": "single", "options": ["Đặt hàng", "Không gian chung", "Ghi âm", "Facebook"], "correct": [1], "explanation": "Không gian chung."}, {"id": "c9", "question": "Tìm nút Import Excel ở đâu?", "type": "single", "options": ["Sidebar CRM", "Header trang chi tiết", "Tab Ghi âm", "Cài đặt mật khẩu"], "correct": [1], "explanation": "Header."}, {"id": "c10", "question": "Công việc khác Không gian chung thế nào?", "type": "single", "options": ["Giống nhau", "Công việc = mẫu pipeline; Không gian chung = giao việc cho người", "Công việc chỉ VC", "Không gian chung chỉ admin"], "correct": [1], "explanation": "Hai tab khác việc."}]}$j_c2000006_0000_0000_0000_000000000001$::jsonb,
  70,
  3,
  15,
  1,
  '/uploads/knowledge-screenshots/guide-06-chi-tiet-lead.png',
  $eax_c2000006_0000_0000_0000_000000000001$[{"type": "image", "url": "/uploads/knowledge-screenshots/guide-06-chi-tiet-lead.png", "caption": "Header và cột trái"}, {"type": "image", "url": "/uploads/knowledge-screenshots/lead-09-chi-tiet-tab.png", "caption": "Hàng tab bên phải"}, {"type": "image", "url": "/uploads/knowledge-screenshots/lead-04-tong-quan.png", "caption": "Cột Thông tin"}]$eax_c2000006_0000_0000_0000_000000000001$::jsonb
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
  'c2000006-0000-0000-0000-000000000002',
  'b2000006-0000-0000-0000-000000000002',
  'Bài kiểm tra: Nút header và cột trái Thông tin',
  '12 câu — một số câu có ảnh. Đạt 70%, tối đa 3 lượt.',
  'quiz',
  $j_c2000006_0000_0000_0000_000000000002${"items": [{"id": "h1", "question": "Nút Chuyển Deal màu xanh dùng khi nào?", "type": "single", "options": ["Deal đã thắng", "Bản ghi đang là Lead", "Xóa Lead", "In hợp đồng"], "correct": [1], "explanation": "Chỉ Lead."}, {"id": "h2", "question": "Nhìn ảnh. Nút cam trên header deal là nút nào?", "type": "single", "options": ["Import Excel", "Thiết lập kế hoạch SX & VC/LĐ", "Trả về Lead", "Tạo sự kiện"], "correct": [1], "explanation": "Nút cam kế hoạch.", "image_url": "/uploads/knowledge-screenshots/sx-vc-03-nut-ke-hoach.png"}, {"id": "h3", "question": "Nút «Kế hoạch SX & VC/LĐ» (không chữ Thiết lập) nghĩa là gì?", "type": "single", "options": ["Chưa có dự án", "Đã có dự án — bấm để sửa lịch", "Xóa dự án", "Chỉ admin thấy"], "correct": [1], "explanation": "Đổi nhãn khi đã có project_id."}, {"id": "h4", "question": "Trả về Lead khi deal đã có dự án SX thì sao?", "type": "single", "options": ["Xóa xưởng", "Gỡ liên kết dự án khỏi deal", "Tạo thêm Lead", "Không cho bấm"], "correct": [1], "explanation": "Không xóa project."}, {"id": "h5", "question": "Thêm phiếu khảo sát bấm xong hệ thống làm gì?", "type": "single", "options": ["Mở tab Công việc và form phiếu", "Gửi email khách", "Tạo dự án VC", "Đổi pass"], "correct": [0], "explanation": "Nhảy tab Công việc."}, {"id": "h6", "question": "Import Excel trên header nhập gì?", "type": "single", "options": ["Danh sách nhân viên", "Báo giá từ file Excel vào deal", "Lịch nghỉ", "KPI tháng"], "correct": [1], "explanation": "Excel quotation."}, {"id": "h7", "question": "Tạo đơn hàng phát sinh dùng khi nào?", "type": "single", "options": ["Lead mới", "Deal khách hàng — tạo deal + dự án SX phát sinh", "Xóa PO", "Đăng xuất"], "correct": [1], "explanation": "Spawned customer order."}, {"id": "h8", "question": "Bàn giao Sản xuất thủ công nằm ở đâu?", "type": "single", "options": ["Sidebar", "Cột trái Thông tin khi deal đã thắng", "Tab Ghi âm", "App Switcher"], "correct": [1], "explanation": "LeadInfoPanel."}, {"id": "h9", "question": "Bấm vòng stepper giai đoạn có thể bị chặn vì?", "type": "single", "options": ["Mạng 5G", "Nhiệm vụ chặn / thiếu người / thiếu deadline / lý do thua", "Thiếu ảnh đại diện", "Chưa học khoá này"], "correct": [1], "explanation": "Popup chặn."}, {"id": "h10", "question": "Cách điền form kế hoạch SX & VC/LĐ học ở đâu?", "type": "single", "options": ["Bài này đã đủ", "Khoá Kiến thức «Kế hoạch SX & VC/LĐ»", "Tab Đặt hàng", "Zalo nhóm"], "correct": [1], "explanation": "Tránh trùng khóa 534."}, {"id": "h11", "question": "Nút Hướng dẫn chi tiết làm gì?", "type": "single", "options": ["Xóa deal", "Bật tour từng vùng trên trang", "In PDF", "Chuyển SX"], "correct": [1], "explanation": "Product tour."}, {"id": "h12", "question": "Đặt deadline thẻ khác deadline giai đoạn thế nào?", "type": "single", "options": ["Giống nhau", "Deadline thẻ = hạn trên Kanban; giai đoạn = hạn bước pipeline", "Chỉ kế toán thấy", "Không có deadline thẻ"], "correct": [1], "explanation": "Hai loại hạn."}]}$j_c2000006_0000_0000_0000_000000000002$::jsonb,
  70,
  3,
  15,
  1,
  '/uploads/knowledge-screenshots/sx-vc-03-nut-ke-hoach.png',
  $eax_c2000006_0000_0000_0000_000000000002$[{"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-03-nut-ke-hoach.png", "caption": "Header deal — nút kế hoạch"}, {"type": "image", "url": "/uploads/knowledge-screenshots/deal-02-pipeline.png", "caption": "Stepper giai đoạn"}, {"type": "image", "url": "/uploads/knowledge-screenshots/guide-06-chi-tiet-lead.png", "caption": "Cột trái Thông tin"}]$eax_c2000006_0000_0000_0000_000000000002$::jsonb
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
  'c2000006-0000-0000-0000-000000000003',
  'b2000006-0000-0000-0000-000000000003',
  'Bài kiểm tra: Tab Công việc — mẫu, thêm việc, xong hết',
  '10 câu — một số câu có ảnh. Đạt 70%, tối đa 3 lượt.',
  'quiz',
  $j_c2000006_0000_0000_0000_000000000003${"items": [{"id": "t1", "question": "Tab Công việc chứa gì?", "type": "single", "options": ["Lệnh đặt hàng", "Nhiệm vụ theo mẫu pipeline, phiếu khảo sát", "Ghi âm cuộc gọi", "Pipeline settings"], "correct": [1], "explanation": "CRMTasksTab."}, {"id": "t2", "question": "Nút Gắn mẫu dùng để?", "type": "single", "options": ["Xóa deal", "Chọn bộ mẫu CRM gắn việc vào deal", "Tạo sự kiện lịch", "Đổi pass"], "correct": [1], "explanation": "Template panel."}, {"id": "t3", "question": "Xong hết nghĩa là gì?", "type": "single", "options": ["Xóa nhóm việc", "Đánh dấu hoàn thành cả nhóm việc", "Gửi email", "Chuyển Deal"], "correct": [1], "explanation": "Bulk complete."}, {"id": "t4", "question": "Bổ sung thiếu SX bấm khi nào?", "type": "single", "options": ["Lead mới", "Deal đã có pack xưởng — thêm việc còn thiếu so với mẫu", "Xóa dự án", "In HĐ"], "correct": [1], "explanation": "Backfill SX."}, {"id": "t5", "question": "List / Deadline / Planner / Lịch là gì?", "type": "single", "options": ["4 module khác", "4 cách xem cùng danh sách việc", "4 pipeline", "4 công ty"], "correct": [1], "explanation": "View switcher."}, {"id": "t6", "question": "Thêm việc tạo ra gì?", "type": "single", "options": ["Deal mới", "Một nhiệm vụ trong nhóm đang mở", "Dự án VC", "User mới"], "correct": [1], "explanation": "Add task."}, {"id": "t7", "question": "Phiếu khảo sát mở từ đâu?", "type": "single", "options": ["Chỉ Cài đặt", "Nút header hoặc việc trong tab Công việc", "Tab Đặt hàng", "Thùng rác"], "correct": [1], "explanation": "Survey fill."}, {"id": "t8", "question": "Giao việc CRM trên một dòng việc dẫn tới?", "type": "single", "options": ["Đăng xuất", "Bảng giao việc khối bán hàng", "Module kế toán", "Facebook ads"], "correct": [1], "explanation": "Assignments."}, {"id": "t9", "question": "Bấm Xong hết khi khách chưa chốt — rủi ro?", "type": "single", "options": ["Không sao", "Checklist/KPI tính đã xong dù việc thật chưa xong", "Tăng lương", "Tự tạo Lead"], "correct": [1], "explanation": "Lỗi hay gặp."}, {"id": "t10", "question": "Deal gạt CRM / SX trên tab Công việc để?", "type": "single", "options": ["Đổi công ty", "Xem pack việc bán hàng hoặc pack xưởng", "Ẩn header", "In PDF"], "correct": [1], "explanation": "Hai pack việc."}]}$j_c2000006_0000_0000_0000_000000000003$::jsonb,
  70,
  3,
  15,
  1,
  '/uploads/knowledge-screenshots/lead-05-nhiem-vu.png',
  $eax_c2000006_0000_0000_0000_000000000003$[{"type": "image", "url": "/uploads/knowledge-screenshots/lead-05-nhiem-vu.png", "caption": "Tab Công việc trên chi tiết"}]$eax_c2000006_0000_0000_0000_000000000003$::jsonb
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
  'c2000006-0000-0000-0000-000000000004',
  'b2000006-0000-0000-0000-000000000004',
  'Bài kiểm tra: Không gian chung và Thành viên',
  '10 câu — một số câu có ảnh. Đạt 70%, tối đa 3 lượt.',
  'quiz',
  $j_c2000006_0000_0000_0000_000000000004${"items": [{"id": "s1", "question": "Không gian chung khác Công việc ở điểm nào?", "type": "single", "options": ["Giống nhau", "Không gian chung = giao việc cho người; Công việc = checklist mẫu", "Không gian chung chỉ KPI", "Công việc chỉ admin"], "correct": [1], "explanation": "Hai tab."}, {"id": "s2", "question": "Nút Thêm trên Không gian chung mở gì?", "type": "single", "options": ["Form Giao việc mới", "Xóa deal", "Pipeline settings", "Đổi pass"], "correct": [0], "explanation": "Form giao việc."}, {"id": "s3", "question": "Lọc Bán hàng / Xưởng / Lắp đặt để làm gì?", "type": "single", "options": ["Đổi module App Switcher", "Lọc việc giao theo khối", "Ẩn header", "Tạo Lead"], "correct": [1], "explanation": "Module chips."}, {"id": "s4", "question": "Tab Thành viên quyết định điều gì?", "type": "single", "options": ["Giá bán", "Ai được xem deal", "Màu Kanban", "Múi giờ"], "correct": [1], "explanation": "Membership."}, {"id": "s5", "question": "Ba badge số trên tab Thành viên là gì?", "type": "single", "options": ["KPI tuần", "Số thành viên CRM / SX / VC", "Số PO", "Số cuộc gọi"], "correct": [1], "explanation": "Đếm theo khối."}, {"id": "s6", "question": "Sau khi lưu kế hoạch VC/LĐ nên kiểm tab nào?", "type": "single", "options": ["Đặt hàng", "Thành viên — người phụ trách VC đã được thêm", "Thùng rác", "KPI giám đốc"], "correct": [1], "explanation": "Tự thêm member."}, {"id": "s7", "question": "Xóa thành viên bấm ở đâu?", "type": "single", "options": ["Sidebar", "Dòng người trên tab Thành viên", "App Switcher", "Login"], "correct": [1], "explanation": "Xóa member."}, {"id": "s8", "question": "Link Giao việc trên Không gian chung dẫn tới?", "type": "single", "options": ["Trang chủ", "Bảng giao việc của khối", "Cài đặt theme", "Facebook"], "correct": [1], "explanation": "Assignments board."}, {"id": "s9", "question": "Deal phát sinh có nút gì thêm?", "type": "single", "options": ["Xóa công ty", "Mở deal nguồn", "Đổi pass", "Import nhân viên"], "correct": [1], "explanation": "Deal nguồn."}, {"id": "s10", "question": "Giao việc xưởng chỉ trên Zalo — sai vì?", "type": "single", "options": ["Zalo nhanh hơn", "Xưởng không thấy trên hệ thống, mất vết", "Bắt buộc Zalo", "KPI tăng"], "correct": [1], "explanation": "Ghi trên app."}]}$j_c2000006_0000_0000_0000_000000000004$::jsonb,
  70,
  3,
  15,
  1,
  '/uploads/knowledge-screenshots/collab-01.png',
  $eax_c2000006_0000_0000_0000_000000000004$[{"type": "image", "url": "/uploads/knowledge-screenshots/collab-01.png", "caption": "Không gian chung trên deal"}, {"type": "image", "url": "/uploads/knowledge-screenshots/collab-05.png", "caption": "Giao việc trong không gian chung"}]$eax_c2000006_0000_0000_0000_000000000004$::jsonb
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
  'c2000006-0000-0000-0000-000000000005',
  'b2000006-0000-0000-0000-000000000005',
  'Bài kiểm tra: Tài liệu, Drive, Ghi chú, Bình luận, Ghi âm',
  '12 câu — một số câu có ảnh. Đạt 70%, tối đa 3 lượt.',
  'quiz',
  $j_c2000006_0000_0000_0000_000000000005${"items": [{"id": "d1", "question": "Xưởng không thấy file trên deal — nguyên nhân hay gặp?", "type": "single", "options": ["Mạng chậm", "File chưa chia sẻ sang khối SX", "Thiếu KPI", "Sai mật khẩu"], "correct": [1], "explanation": "Visibility."}, {"id": "d2", "question": "Tải tất cả (N) làm gì?", "type": "single", "options": ["Xóa file", "Tải ZIP toàn bộ tài liệu tab", "Gửi Zalo", "Tạo Lead"], "correct": [1], "explanation": "ZIP."}, {"id": "d3", "question": "Nhập văn bản khác Upload file ở chỗ nào?", "type": "single", "options": ["Giống", "Nhập văn bản = tài liệu chữ trên hệ thống; Upload = file máy", "Nhập văn bản xóa deal", "Upload chỉ admin"], "correct": [1], "explanation": "Hai cách thêm."}, {"id": "d4", "question": "Tab Drive dùng khi nào?", "type": "single", "options": ["File trên Google Drive công ty gắn deal", "Đổi pipeline", "Tính lương", "Chặn SĐT"], "correct": [0], "explanation": "Drive."}, {"id": "d5", "question": "Gửi ghi chú nhanh bằng phím?", "type": "single", "options": ["Esc", "Ctrl+Enter", "F5", "Alt+F4"], "correct": [1], "explanation": "Composer."}, {"id": "d6", "question": "Nhìn ảnh. Nút trên thẻ bàn giao để xác nhận là nút nào?", "type": "single", "options": ["Để sau", "Chọn & bàn giao", "Xóa dự án", "Import Excel"], "correct": [1], "explanation": "Nút xác nhận.", "image_url": "/uploads/knowledge-screenshots/sx-vc-09b-chon-ban-giao.png"}, {"id": "d7", "question": "Chọn & bàn giao học kỹ ở khoá nào?", "type": "single", "options": ["Khoá này đủ", "Kế hoạch SX & VC/LĐ", "KPI giám đốc", "MISA"], "correct": [1], "explanation": "Khóa 534."}, {"id": "d8", "question": "Tab Ghi âm chứa gì?", "type": "single", "options": ["Báo giá Excel", "File ghi âm cuộc gọi gắn deal", "Pipeline", "Thùng rác"], "correct": [1], "explanation": "Voice recordings."}, {"id": "d9", "question": "Tab Facebook / Zalo hiện khi nào?", "type": "single", "options": ["Luôn", "Khi deal/lead đến từ kênh inbox đó", "Chỉ admin", "Khi deal thua"], "correct": [1], "explanation": "inboxChannel."}, {"id": "d10", "question": "Thêm hoạt động (gọi/gặp) bấm ở tab nào?", "type": "single", "options": ["Đặt hàng", "Ghi chú & HĐ → Thêm", "Ghim", "App Switcher"], "correct": [1], "explanation": "Add activity."}, {"id": "d11", "question": "Chia sẻ ghi chú sang khối khác để?", "type": "single", "options": ["Xóa ghi chú", "Xưởng/VC đọc được ghi chú CRM", "Đổi Sale", "In lương"], "correct": [1], "explanation": "Share note."}, {"id": "d12", "question": "Trả lời / Sửa / Xóa trên Bình luận dùng khi?", "type": "single", "options": ["Xóa deal", "Thao tác từng comment", "Đổi công ty", "Bật cột LĐ tạm"], "correct": [1], "explanation": "Comment actions."}]}$j_c2000006_0000_0000_0000_000000000005$::jsonb,
  70,
  3,
  15,
  1,
  '/uploads/knowledge-screenshots/deal-05-hop-dong.png',
  $eax_c2000006_0000_0000_0000_000000000005$[{"type": "image", "url": "/uploads/knowledge-screenshots/deal-05-hop-dong.png", "caption": "Tài liệu trên deal"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-09b-chon-ban-giao.png", "caption": "Chọn & bàn giao"}, {"type": "image", "url": "/uploads/knowledge-screenshots/lead-09-chi-tiet-tab.png", "caption": "Hàng tab"}]$eax_c2000006_0000_0000_0000_000000000005$::jsonb
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
  'c2000006-0000-0000-0000-000000000006',
  'b2000006-0000-0000-0000-000000000006',
  'Bài kiểm tra cuối: Từng nút trên chi tiết CRM',
  'Làm xong phiếu tự kiểm trên một deal thật (hoặc deal THUCHANH) rồi mới vào đây. 15 câu — một số có ảnh. Đạt 80%, tối đa 3 lượt, 25 phút.',
  'quiz',
  $j_c2000006_0000_0000_0000_000000000006${"items": [{"id": "f1", "question": "Tab Đặt hàng có trên trang chi tiết SX không?", "type": "single", "options": ["Có", "Không — chỉ trang chi tiết CRM", "Chỉ VC có", "Chỉ admin thấy trên SX"], "correct": [1], "explanation": "Chỉ CRM."}, {"id": "f2", "question": "Thêm trên tab Đặt hàng tạo ra gì?", "type": "single", "options": ["Deal phát sinh", "Lệnh đặt hàng (PO) gắn deal đang mở", "User mới", "Cột Kanban"], "correct": [1], "explanation": "PO."}, {"id": "f3", "question": "Tạo đơn hàng phát sinh (header) khác tab Đặt hàng thế nào?", "type": "single", "options": ["Giống", "Header tạo deal+dự án mới; tab Đặt hàng là PO trong deal hiện tại", "Cả hai xóa Lead", "Cả hai chỉ in PDF"], "correct": [1], "explanation": "Dễ nhầm tên."}, {"id": "f4", "question": "Tab Điểm chéo & KH hiện khi?", "type": "single", "options": ["Lead mới", "Deal ở cột Hoàn thành", "Mọi Deal", "Trang login"], "correct": [1], "explanation": "Hoàn thành."}, {"id": "f5", "question": "Nhìn ảnh header. Nút cam là nút nào?", "type": "single", "options": ["Trả về Lead", "Thiết lập kế hoạch SX & VC/LĐ", "Import Excel", "Ghi âm"], "correct": [1], "explanation": "Kế hoạch.", "image_url": "/uploads/knowledge-screenshots/sx-vc-03-nut-ke-hoach.png"}, {"id": "f6", "question": "Muốn xưởng thấy bản vẽ — làm gì?", "type": "single", "options": ["Chỉ upload CRM, không chia sẻ", "Upload tab Tài liệu rồi chia sẻ sang khối SX", "Gửi USB", "Đổi tên deal"], "correct": [1], "explanation": "Share SX."}, {"id": "f7", "question": "Không gian chung nút Thêm là?", "type": "single", "options": ["Xóa thành viên", "Giao việc mới cho người", "Import Excel", "Bàn giao VC"], "correct": [1], "explanation": "Giao việc."}, {"id": "f8", "question": "Xong hết trên tab Công việc nên bấm khi?", "type": "single", "options": ["Đầu ca cho vui", "Nhóm việc thật sự đã xong", "Khi khách chưa chốt", "Mỗi giờ một lần"], "correct": [1], "explanation": "Thật sự xong."}, {"id": "f9", "question": "Chọn & bàn giao nằm tab nào?", "type": "single", "options": ["Đặt hàng", "Bình luận (thẻ bàn giao sau khi xưởng xong)", "Ghi âm", "Điểm chéo"], "correct": [1], "explanation": "Bình luận."}, {"id": "f10", "question": "Dải CRM · Sản xuất · VC/LĐ bấm Sản xuất thì?", "type": "single", "options": ["Xóa deal", "Mở trang chi tiết dự án xưởng cùng đơn", "Đăng xuất", "Mở KPI"], "correct": [1], "explanation": "Path strip."}, {"id": "f11", "question": "Phiếu khảo sát không thấy trên Ghi chú vì?", "type": "single", "options": ["Bug", "Phiếu nằm tab Công việc / nút header", "Chỉ Zalo có", "Đã xóa vĩnh viễn"], "correct": [1], "explanation": "Công việc."}, {"id": "f12", "question": "Hồi lại deal bấm khi nào?", "type": "single", "options": ["Deal đang thắng", "Deal/lead đang thua — banner đỏ", "Lead mới", "PO mới"], "correct": [1], "explanation": "Lost banner."}, {"id": "f13", "question": "Ghim trên chi tiết (nếu có) để làm gì?", "type": "single", "options": ["Xóa thẻ", "Ghim thẻ trên Kanban cho dễ tìm", "Đổi công ty", "Tạo PO"], "correct": [1], "explanation": "Pin."}, {"id": "f14", "question": "Nhìn ảnh. Nút Chọn & bàn giao dùng để?", "type": "single", "options": ["Tạo dự án VC mới", "Xác nhận bàn giao — chuyển thẻ khỏi cột tạm", "Xóa ghi chú", "Import Excel"], "correct": [1], "explanation": "Không tạo dự án mới.", "image_url": "/uploads/knowledge-screenshots/sx-vc-09b-chon-ban-giao.png"}, {"id": "f15", "question": "Sau khoá này, form ngày lắp / cột LĐ tạm học tiếp ở?", "type": "single", "options": ["Khoá Kế hoạch SX & VC/LĐ", "Khoá KPI", "Không cần", "Tab Đặt hàng"], "correct": [0], "explanation": "Khóa 534."}]}$j_c2000006_0000_0000_0000_000000000006$::jsonb,
  80,
  3,
  25,
  1,
  '/uploads/knowledge-screenshots/lead-09-chi-tiet-tab.png',
  $eax_c2000006_0000_0000_0000_000000000006$[{"type": "image", "url": "/uploads/knowledge-screenshots/lead-09-chi-tiet-tab.png", "caption": "Hàng tab CRM"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-03-nut-ke-hoach.png", "caption": "Header kế hoạch"}, {"type": "image", "url": "/uploads/knowledge-screenshots/sx-vc-09b-chon-ban-giao.png", "caption": "Chọn & bàn giao"}]$eax_c2000006_0000_0000_0000_000000000006$::jsonb
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
  'c2000006-0000-0001-0000-000000000006',
  'b2000006-0000-0000-0000-000000000006',
  'Phiếu tự kiểm — thao tác trên deal thật',
  'Đánh dấu khi bạn đã làm được trên phần mềm. Không cần tạo dữ liệu rác — Hủy form nếu chỉ xem.',
  'checklist',
  $j_c2000006_0000_0001_0000_000000000006${"items": [{"id": "c1", "text": "Mở chi tiết một deal: nhận ra 3 vùng header / Thông tin / tab"}, {"id": "c2", "text": "Chỉ đúng nút Chuyển Deal (Lead) hoặc Trả về Lead / kế hoạch SX (Deal) trên header"}, {"id": "c3", "text": "Mở tab Công việc: thấy Gắn mẫu hoặc Thêm việc"}, {"id": "c4", "text": "Mở Không gian chung: bấm Thêm (có thể Hủy nếu không giao thật)"}, {"id": "c5", "text": "Mở Thành viên: biết chỗ thêm người"}, {"id": "c6", "text": "Mở Tài liệu: thấy Upload file / Nhập văn bản"}, {"id": "c7", "text": "Mở Bình luận: biết chỗ thẻ Chọn & bàn giao sẽ hiện sau khi xưởng bàn giao"}, {"id": "c8", "text": "Mở Đặt hàng: thấy Thêm / Thêm mới (không bắt buộc tạo PO thật)"}]}$j_c2000006_0000_0001_0000_000000000006$::jsonb,
  80,
  NULL,
  NULL,
  2,
  '/uploads/knowledge-screenshots/lead-09-chi-tiet-tab.png',
  $eax_c2000006_0000_0001_0000_000000000006$[]$eax_c2000006_0000_0001_0000_000000000006$::jsonb
) ON CONFLICT (id) DO UPDATE SET
  lesson_id = EXCLUDED.lesson_id, title = EXCLUDED.title, instructions = EXCLUDED.instructions,
  type = EXCLUDED.type, questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, image_url = EXCLUDED.image_url,
  attachments = EXCLUDED.attachments, updated_at = now();

COMMIT;
