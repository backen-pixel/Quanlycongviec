-- 259
-- Khoá Lead — Quản lý Khách hàng Tiềm năng
-- Seed Lead course — generated
-- Sinh tự động bởi scripts/knowledge/build-seeds.js — không sửa tay; chạy lại script để cập nhật.
-- Idempotent: ON CONFLICT DO UPDATE

BEGIN;

ALTER TABLE knowledge_lessons
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT,
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_required BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE knowledge_exercises
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS video_type TEXT,
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS time_limit_minutes INT;

-- DANH MỤC
INSERT INTO knowledge_categories (id, name, slug, description, icon, sort_order, is_active)
VALUES (
  'd2000001-0000-0000-0000-000000000001',
  'Lead — Khách hàng tiềm năng',
  'lead-khach-hang-tiem-nang',
  'Khoá đào tạo chuẩn cho nhân viên kinh doanh ngành tủ bếp nhôm và cửa nhôm. Hướng dẫn quy trình chăm sóc khách hàng tiềm năng từ tiếp nhận đến chuyển đơn, tuân thủ ghi nhận minh chứng và bảo vệ điểm KPI cá nhân.',
  '🎯',
  10,
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, icon = EXCLUDED.icon, is_active = true;

UPDATE knowledge_categories SET
  deadline_mode = 'relative',
  deadline_duration_days = 30,
  deadline_note = 'Hoàn thành toàn bộ khoá trong 30 ngày kể từ khi bắt đầu bài học đầu tiên',
  require_all_exercises_passed = true
WHERE id = 'd2000001-0000-0000-0000-000000000001';

-- BÀI HỌC
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  video_url, video_type, cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000001-0000-0000-0000-000000000001',
  'd2000001-0000-0000-0000-000000000001',
  'Bài 1: Khái niệm Lead trong ngành tủ bếp / cửa nhôm',
  'Định nghĩa Lead, phân biệt Lead — Deal — Khách hàng, vai trò người phụ trách.',
  $md_b2000001_0000_0000_0000_000000000001$# Bài 1 — Khái niệm Lead

## 1. Tình huống

Chị Hoa nhắn fanpage hỏi giá tủ bếp 3.6m chữ L — đây là **Lead**: khách đã liên hệ, chưa cam kết mua.

## 2. Thuật ngữ

- **Lead** _(khách tiềm năng — đã tiếp xúc, chưa chốt mua)_
- **Deal** _(đã thống nhất mua, đang làm hợp đồng)_
- **Khách hàng** _(đã ký HĐ và đặt cọc)_

## 3. Nội dung chính

| Phân loại | Tình trạng | Ví dụ |
|---|---|---|
| Lead | Chưa cam kết | Hỏi giá tủ bếp |
| Deal | Đã chốt mua | Đã chốt giá 68 triệu, hẹn ký HĐ |
| Khách hàng | Đã ký + cọc | Đã chuyển 50% |

Mỗi Lead có **một người phụ trách chính** — chịu trách nhiệm chăm sóc và **KPI** _(chỉ số hiệu quả)_ cá nhân.

## 4. Trên phần mềm — bạn cần làm gì

1. **Menu CRM → Bảng Lead**.
2. Mỗi thẻ = một Lead.
3. Mọi ghi chú, file, cuộc gọi được lưu trên hệ thống.

## 5. Sai lầm thường gặp

- Ghi sổ tay riêng → đồng nghiệp không nắm được khi nghỉ phép.
- Tạo Lead trùng SĐT.

## 6. Tóm tắt 30 giây

Lead = khách tiềm năng; một người phụ trách; bắt buộc dùng CRM.

## 7. Tự kiểm tra

- Lead khác Deal ở điểm nào?
- Ai chịu KPI của Lead?$md_b2000001_0000_0000_0000_000000000001$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80',
  $att_b2000001_0000_0000_0000_000000000001$[]$att_b2000001_0000_0000_0000_000000000001$::jsonb,
  8,
  ARRAY['lead', 'co-ban', 'newbie'],
  true,
  1,
  true,
  now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, content_md = EXCLUDED.content_md,
  video_url = EXCLUDED.video_url, video_type = EXCLUDED.video_type,
  cover_image_url = EXCLUDED.cover_image_url, attachments = EXCLUDED.attachments,
  duration_minutes = EXCLUDED.duration_minutes, tags = EXCLUDED.tags,
  is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  video_url, video_type, cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000001-0000-0000-0000-000000000002',
  'd2000001-0000-0000-0000-000000000001',
  'Bài 2: Tiếp nhận và tạo Lead mới',
  '5 kênh tiếp nhận, thông tin bắt buộc, quét trùng SĐT.',
  $md_b2000001_0000_0000_0000_000000000002$# Bài 2 — Tiếp nhận Lead

## 1. Tình huống

Khách gọi tổng đài hỏi cửa nhôm Xingfa — bạn tiếp nhận và tạo Lead trong vòng vài phút.

## 2. Thuật ngữ

- **Nguồn Lead** _(kênh khách đến: fanpage, showroom, giới thiệu…)_

## 3. Nội dung chính

**5 kênh chính:** Fanpage/Zalo, Tổng đài, Website/form, Showroom, Giới thiệu.

**Thông tin tối thiểu:** Tiêu đề Lead + Khách hàng (có SĐT).

## 4. Trên phần mềm — bạn cần làm gì

1. **Bảng Lead → + Lead mới**.
2. Nhập tiêu đề rõ (Tên — Khu vực — Sản phẩm).
3. **Quét trùng SĐT** trước Lưu.
4. Chọn Nguồn, Loại sản phẩm.

## 5. Sai lầm thường gặp

- Tạo Lead mới khi SĐT đã tồn tại.
- Tiêu đề chung chung "Khách mới".

## 6. Tóm tắt 30 giây

Quét trùng → điền đủ → Lưu → gọi lại đúng hẹn.

## 7. Tự kiểm tra

- Kênh nào bạn hay nhận nhất?
- Bước bắt buộc trước Lưu?$md_b2000001_0000_0000_0000_000000000002$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80',
  $att_b2000001_0000_0000_0000_000000000002$[]$att_b2000001_0000_0000_0000_000000000002$::jsonb,
  8,
  ARRAY['lead', 'tiep-nhan'],
  true,
  2,
  true,
  now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, content_md = EXCLUDED.content_md,
  video_url = EXCLUDED.video_url, video_type = EXCLUDED.video_type,
  cover_image_url = EXCLUDED.cover_image_url, attachments = EXCLUDED.attachments,
  duration_minutes = EXCLUDED.duration_minutes, tags = EXCLUDED.tags,
  is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  video_url, video_type, cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000001-0000-0000-0000-000000000003',
  'd2000001-0000-0000-0000-000000000001',
  'Bài 3: Bảng Lead và quy trình chuyển giai đoạn',
  'Kanban, kéo thẻ, pipeline Lead, điều kiện chuyển cột.',
  $md_b2000001_0000_0000_0000_000000000003$# Bài 3 — Bảng Lead & Pipeline

## 1. Tình huống

Sáng mở Kanban — thấy 3 Lead cột **Mới** cần gọi trước 10h.

## 2. Thuật ngữ

- **Pipeline** _(quy trình các giai đoạn Lead trên bảng)_
- **Kanban** _(bảng kéo thả theo cột)_

## 3. Nội dung chính

Lead di chuyển: **Mới → Đã liên hệ → Đang tư vấn → Đã báo giá → Đã đồng ý** (tên cột có thể khác theo công ty).

Kéo thẻ = đổi giai đoạn; có thể bị chặn nếu nhiệm vụ bắt buộc chưa xong.

## 4. Trên phần mềm — bạn cần làm gì

1. **CRM → Bảng Lead → Kanban**.
2. Kéo thẻ khi đủ điều kiện nghiệp vụ.
3. Đọc thông báo nếu bị chặn.

## 5. Sai lầm thường gặp

- Kéo cột chỉ để "đẹp bảng" không có việc thật.
- Không ghi hoạt động sau cuộc gọi.

## 6. Tóm tắt 30 giây

Kanban phản ánh tiến độ thật; mỗi lần kéo phải có việc đã làm.

## 7. Tự kiểm tra

- Kéo thẻ để làm gì?
- Khi nào bị chặn?$md_b2000001_0000_0000_0000_000000000003$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80',
  $att_b2000001_0000_0000_0000_000000000003$[]$att_b2000001_0000_0000_0000_000000000003$::jsonb,
  8,
  ARRAY['lead', 'pipeline', 'kanban'],
  true,
  3,
  true,
  now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, content_md = EXCLUDED.content_md,
  video_url = EXCLUDED.video_url, video_type = EXCLUDED.video_type,
  cover_image_url = EXCLUDED.cover_image_url, attachments = EXCLUDED.attachments,
  duration_minutes = EXCLUDED.duration_minutes, tags = EXCLUDED.tags,
  is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  video_url, video_type, cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000001-0000-0000-0000-000000000004',
  'd2000001-0000-0000-0000-000000000001',
  'Bài 4: Sáu thông tin bắt buộc trên Lead (KPI Đầy đủ thông tin)',
  '6 trường bắt buộc, chỉ số KPI Đầy đủ thông tin, quy tắc chặn điểm.',
  $md_b2000001_0000_0000_0000_000000000004$# Bài 4 — Sáu thông tin bắt buộc

## 1. Tình huống

Lead của anh Minh thiếu email — chỉ số **Đầy đủ thông tin** tụt, có thể bị **quy tắc chặn điểm**.

## 2. Thuật ngữ

- **KPI Đầy đủ thông tin** _(tỷ lệ Lead có đủ 6 trường — trước đây gọi A3)_
- **Quy tắc chặn điểm** _(nếu dưới ngưỡng, điểm KPI tháng bị giới hạn)_

## 3. Nội dung chính

**6 trường:** SĐT, Email, Địa chỉ lắp đặt, Nguồn, Loại sản phẩm, Mức ưu tiên.

Công ty thường yêu cầu ≥ **80%** Lead đủ 6 trường.

## 4. Trên phần mềm — bạn cần làm gì

1. Mở chi tiết Lead → tab Tổng quan.
2. Bổ sung trường còn thiếu.
3. Cuối tuần tự kiểm 5 Lead của bạn.

## 5. Sai lầm thường gặp

- Để trống email vì "khách không có".
- Chọn nguồn "Khác" cho mọi Lead.

## 6. Tóm tắt 30 giây

Đủ 6 trường = nền tảng chăm sóc và KPI minh bạch.

## 7. Tự kiểm tra

- Kể tên 6 trường?
- KPI Đầy đủ thông tin là gì?$md_b2000001_0000_0000_0000_000000000004$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80',
  $att_b2000001_0000_0000_0000_000000000004$[]$att_b2000001_0000_0000_0000_000000000004$::jsonb,
  8,
  ARRAY['lead', 'kpi'],
  true,
  4,
  true,
  now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, content_md = EXCLUDED.content_md,
  video_url = EXCLUDED.video_url, video_type = EXCLUDED.video_type,
  cover_image_url = EXCLUDED.cover_image_url, attachments = EXCLUDED.attachments,
  duration_minutes = EXCLUDED.duration_minutes, tags = EXCLUDED.tags,
  is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  video_url, video_type, cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000001-0000-0000-0000-000000000005',
  'd2000001-0000-0000-0000-000000000001',
  'Bài 5: Nhiệm vụ trên Lead',
  'Tạo, giao, hoàn thành nhiệm vụ CRM.',
  $md_b2000001_0000_0000_0000_000000000005$# Bài 5: Nhiệm vụ trên Lead

## 1. Tình huống

Tình huống ngành tủ bếp/cửa nhôm — Tạo, giao, hoàn thành nhiệm vụ CRM.

## 2. Thuật ngữ

Thuật ngữ xem các bài trước. Bài này tập trung **quy trình và KPI**.

## 3. Nội dung chính

**Nhiệm vụ** _(việc cần làm, có hạn)_: "Gọi KH lần 1", "Gửi báo giá", "Hẹn đo đạc".

Tạo tại tab **Nhiệm vụ** → đặt **hạn** → chuyển **Đang làm** → **Hoàn thành** khi xong.

## 4. Trên phần mềm — bạn cần làm gì

1. Mở **CRM → Bảng Lead** hoặc chi tiết Lead.
2. Thực hiện đúng thứ tự.
3. Kiểm tra lịch sử đã lưu.

Thao tác màn hình: khoá **Hướng dẫn CRM**.

## 5. Sai lầm thường gặp

- Chỉ làm ngoài app.
- Bỏ qua ghi chú/minh chứng.
- Chuyển Deal khi chưa đủ điều kiện.

## 6. Tóm tắt 30 giây

Tuân thủ = bảo vệ khách, đồng nghiệp và điểm KPI.

## 7. Tự kiểm tra

- Điều gì bạn sẽ áp dụng ngay hôm nay?$md_b2000001_0000_0000_0000_000000000005$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80',
  $att_b2000001_0000_0000_0000_000000000005$[]$att_b2000001_0000_0000_0000_000000000005$::jsonb,
  8,
  ARRAY['lead', 'bai-5'],
  true,
  5,
  true,
  now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, content_md = EXCLUDED.content_md,
  video_url = EXCLUDED.video_url, video_type = EXCLUDED.video_type,
  cover_image_url = EXCLUDED.cover_image_url, attachments = EXCLUDED.attachments,
  duration_minutes = EXCLUDED.duration_minutes, tags = EXCLUDED.tags,
  is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  video_url, video_type, cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000001-0000-0000-0000-000000000006',
  'd2000001-0000-0000-0000-000000000001',
  'Bài 6: Ghi chú và file minh chứng khi hoàn thành nhiệm vụ',
  'Quy định bắt buộc ghi chú + đính kèm.',
  $md_b2000001_0000_0000_0000_000000000006$# Bài 6: Ghi chú và file minh chứng khi hoàn thành nhiệm vụ

## 1. Tình huống

Tình huống ngành tủ bếp/cửa nhôm — Quy định bắt buộc ghi chú + đính kèm.

## 2. Thuật ngữ

Thuật ngữ xem các bài trước. Bài này tập trung **quy trình và KPI**.

## 3. Nội dung chính

Popup khi Hoàn thành: ghi **kết quả cụ thể** (ai, lúc mấy giờ, KH phản hồi gì) + **ảnh/Zalo** nếu công ty yêu cầu.

Ghi chú "đã gọi" không đủ — phải có nội dung kiểm chứng.

## 4. Trên phần mềm — bạn cần làm gì

1. Mở **CRM → Bảng Lead** hoặc chi tiết Lead.
2. Thực hiện đúng thứ tự.
3. Kiểm tra lịch sử đã lưu.

Thao tác màn hình: khoá **Hướng dẫn CRM**.

## 5. Sai lầm thường gặp

- Chỉ làm ngoài app.
- Bỏ qua ghi chú/minh chứng.
- Chuyển Deal khi chưa đủ điều kiện.

## 6. Tóm tắt 30 giây

Tuân thủ = bảo vệ khách, đồng nghiệp và điểm KPI.

## 7. Tự kiểm tra

- Điều gì bạn sẽ áp dụng ngay hôm nay?$md_b2000001_0000_0000_0000_000000000006$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80',
  $att_b2000001_0000_0000_0000_000000000006$[]$att_b2000001_0000_0000_0000_000000000006$::jsonb,
  8,
  ARRAY['lead', 'bai-6'],
  true,
  6,
  true,
  now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, content_md = EXCLUDED.content_md,
  video_url = EXCLUDED.video_url, video_type = EXCLUDED.video_type,
  cover_image_url = EXCLUDED.cover_image_url, attachments = EXCLUDED.attachments,
  duration_minutes = EXCLUDED.duration_minutes, tags = EXCLUDED.tags,
  is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  video_url, video_type, cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000001-0000-0000-0000-000000000007',
  'd2000001-0000-0000-0000-000000000001',
  'Bài 7: Ghi chú và tài liệu trên Lead',
  '3 nơi lưu: Nhiệm vụ, Tài liệu, Hoạt động.',
  $md_b2000001_0000_0000_0000_000000000007$# Bài 7: Ghi chú và tài liệu trên Lead

## 1. Tình huống

Tình huống ngành tủ bếp/cửa nhôm — 3 nơi lưu: Nhiệm vụ, Tài liệu, Hoạt động.

## 2. Thuật ngữ

Thuật ngữ xem các bài trước. Bài này tập trung **quy trình và KPI**.

## 3. Nội dung chính

| Loại | Lưu ở đâu | Ví dụ |
|---|---|---|
| Cuộc gọi | Hoạt động / Nhiệm vụ | "14h gọi, hẹn đo thứ 5" |
| File | Tài liệu | Báo giá PDF, ảnh đo |
| Trao đổi nội bộ | Ghi chú / Chat | @mention đồng nghiệp |

## 4. Trên phần mềm — bạn cần làm gì

1. Mở **CRM → Bảng Lead** hoặc chi tiết Lead.
2. Thực hiện đúng thứ tự.
3. Kiểm tra lịch sử đã lưu.

Thao tác màn hình: khoá **Hướng dẫn CRM**.

## 5. Sai lầm thường gặp

- Chỉ làm ngoài app.
- Bỏ qua ghi chú/minh chứng.
- Chuyển Deal khi chưa đủ điều kiện.

## 6. Tóm tắt 30 giây

Tuân thủ = bảo vệ khách, đồng nghiệp và điểm KPI.

## 7. Tự kiểm tra

- Điều gì bạn sẽ áp dụng ngay hôm nay?$md_b2000001_0000_0000_0000_000000000007$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80',
  $att_b2000001_0000_0000_0000_000000000007$[]$att_b2000001_0000_0000_0000_000000000007$::jsonb,
  8,
  ARRAY['lead', 'bai-7'],
  true,
  7,
  true,
  now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, content_md = EXCLUDED.content_md,
  video_url = EXCLUDED.video_url, video_type = EXCLUDED.video_type,
  cover_image_url = EXCLUDED.cover_image_url, attachments = EXCLUDED.attachments,
  duration_minutes = EXCLUDED.duration_minutes, tags = EXCLUDED.tags,
  is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  video_url, video_type, cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000001-0000-0000-0000-000000000008',
  'd2000001-0000-0000-0000-000000000001',
  'Bài 8: Lịch sử tương tác',
  '5 kênh ghi nhận, quy tắc 5 phút với Lead Hot.',
  $md_b2000001_0000_0000_0000_000000000008$# Bài 8: Lịch sử tương tác

## 1. Tình huống

Tình huống ngành tủ bếp/cửa nhôm — 5 kênh ghi nhận, quy tắc 5 phút với Lead Hot.

## 2. Thuật ngữ

Thuật ngữ xem các bài trước. Bài này tập trung **quy trình và KPI**.

## 3. Nội dung chính

**5 kênh:** Gọi, Gặp, Email/Tin nhắn, Đổi giai đoạn, Hệ thống.

**Lead Hot:** gọi trong **5 phút** từ khi nhận — tăng tỉ lệ chốt.

## 4. Trên phần mềm — bạn cần làm gì

1. Mở **CRM → Bảng Lead** hoặc chi tiết Lead.
2. Thực hiện đúng thứ tự.
3. Kiểm tra lịch sử đã lưu.

Thao tác màn hình: khoá **Hướng dẫn CRM**.

## 5. Sai lầm thường gặp

- Chỉ làm ngoài app.
- Bỏ qua ghi chú/minh chứng.
- Chuyển Deal khi chưa đủ điều kiện.

## 6. Tóm tắt 30 giây

Tuân thủ = bảo vệ khách, đồng nghiệp và điểm KPI.

## 7. Tự kiểm tra

- Điều gì bạn sẽ áp dụng ngay hôm nay?$md_b2000001_0000_0000_0000_000000000008$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80',
  $att_b2000001_0000_0000_0000_000000000008$[]$att_b2000001_0000_0000_0000_000000000008$::jsonb,
  8,
  ARRAY['lead', 'bai-8'],
  true,
  8,
  true,
  now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, content_md = EXCLUDED.content_md,
  video_url = EXCLUDED.video_url, video_type = EXCLUDED.video_type,
  cover_image_url = EXCLUDED.cover_image_url, attachments = EXCLUDED.attachments,
  duration_minutes = EXCLUDED.duration_minutes, tags = EXCLUDED.tags,
  is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  video_url, video_type, cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000001-0000-0000-0000-000000000009',
  'd2000001-0000-0000-0000-000000000001',
  'Bài 9: Hạn chót và SLA',
  'SLA = hạn xử lý cam kết.',
  $md_b2000001_0000_0000_0000_000000000009$# Bài 9: Hạn chót và SLA

## 1. Tình huống

Tình huống ngành tủ bếp/cửa nhôm — SLA = hạn xử lý cam kết.

## 2. Thuật ngữ

Thuật ngữ xem các bài trước. Bài này tập trung **quy trình và KPI**.

## 3. Nội dung chính

**SLA** ví dụ: Mới → Đã liên hệ trong **1 ngày**; Đã báo giá → phản hồi trong **7 ngày**.

Tab **Deadline** và badge đỏ giúp ưu tiên.

## 4. Trên phần mềm — bạn cần làm gì

1. Mở **CRM → Bảng Lead** hoặc chi tiết Lead.
2. Thực hiện đúng thứ tự.
3. Kiểm tra lịch sử đã lưu.

Thao tác màn hình: khoá **Hướng dẫn CRM**.

## 5. Sai lầm thường gặp

- Chỉ làm ngoài app.
- Bỏ qua ghi chú/minh chứng.
- Chuyển Deal khi chưa đủ điều kiện.

## 6. Tóm tắt 30 giây

Tuân thủ = bảo vệ khách, đồng nghiệp và điểm KPI.

## 7. Tự kiểm tra

- Điều gì bạn sẽ áp dụng ngay hôm nay?$md_b2000001_0000_0000_0000_000000000009$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80',
  $att_b2000001_0000_0000_0000_000000000009$[]$att_b2000001_0000_0000_0000_000000000009$::jsonb,
  8,
  ARRAY['lead', 'bai-9'],
  true,
  9,
  true,
  now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, content_md = EXCLUDED.content_md,
  video_url = EXCLUDED.video_url, video_type = EXCLUDED.video_type,
  cover_image_url = EXCLUDED.cover_image_url, attachments = EXCLUDED.attachments,
  duration_minutes = EXCLUDED.duration_minutes, tags = EXCLUDED.tags,
  is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  video_url, video_type, cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000001-0000-0000-0000-000000000010',
  'd2000001-0000-0000-0000-000000000001',
  'Bài 10: Hệ thống KPI Lead',
  'Ledger + bảng tỷ lệ tháng.',
  $md_b2000001_0000_0000_0000_000000000010$# Bài 10: Hệ thống KPI Lead

## 1. Tình huống

Tình huống ngành tủ bếp/cửa nhôm — Ledger + bảng tỷ lệ tháng.

## 2. Thuật ngữ

Thuật ngữ xem các bài trước. Bài này tập trung **quy trình và KPI**.

## 3. Nội dung chính

Chỉ số chính: **Đầy đủ thông tin**, **Đúng hạn**, **Chuyển Deal**, **Tiếp xúc thành công**.

Xem tại **CRM → Bảng điểm**. **Quy tắc chặn điểm** khi Đầy đủ thông tin < 80%.

## 4. Trên phần mềm — bạn cần làm gì

1. Mở **CRM → Bảng Lead** hoặc chi tiết Lead.
2. Thực hiện đúng thứ tự.
3. Kiểm tra lịch sử đã lưu.

Thao tác màn hình: khoá **Hướng dẫn CRM**.

## 5. Sai lầm thường gặp

- Chỉ làm ngoài app.
- Bỏ qua ghi chú/minh chứng.
- Chuyển Deal khi chưa đủ điều kiện.

## 6. Tóm tắt 30 giây

Tuân thủ = bảo vệ khách, đồng nghiệp và điểm KPI.

## 7. Tự kiểm tra

- Điều gì bạn sẽ áp dụng ngay hôm nay?$md_b2000001_0000_0000_0000_000000000010$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80',
  $att_b2000001_0000_0000_0000_000000000010$[]$att_b2000001_0000_0000_0000_000000000010$::jsonb,
  8,
  ARRAY['lead', 'bai-10'],
  true,
  10,
  true,
  now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, content_md = EXCLUDED.content_md,
  video_url = EXCLUDED.video_url, video_type = EXCLUDED.video_type,
  cover_image_url = EXCLUDED.cover_image_url, attachments = EXCLUDED.attachments,
  duration_minutes = EXCLUDED.duration_minutes, tags = EXCLUDED.tags,
  is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  video_url, video_type, cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000001-0000-0000-0000-000000000011',
  'd2000001-0000-0000-0000-000000000001',
  'Bài 11: Chuyển Lead thành Deal',
  'Điều kiện chuyển, không hoàn tác.',
  $md_b2000001_0000_0000_0000_000000000011$# Bài 11: Chuyển Lead thành Deal

## 1. Tình huống

Tình huống ngành tủ bếp/cửa nhôm — Điều kiện chuyển, không hoàn tác.

## 2. Thuật ngữ

Thuật ngữ xem các bài trước. Bài này tập trung **quy trình và KPI**.

## 3. Nội dung chính

Chuyển khi KH **đồng ý mua** + thống nhất **sản phẩm, giá, phạm vi**.

**Chuyển Deal** trên header → chọn pipeline → **Xác nhận**. **Không hoàn tác** — kiểm tra kỹ.

## 4. Trên phần mềm — bạn cần làm gì

1. Mở **CRM → Bảng Lead** hoặc chi tiết Lead.
2. Thực hiện đúng thứ tự.
3. Kiểm tra lịch sử đã lưu.

Thao tác màn hình: khoá **Hướng dẫn CRM**.

## 5. Sai lầm thường gặp

- Chỉ làm ngoài app.
- Bỏ qua ghi chú/minh chứng.
- Chuyển Deal khi chưa đủ điều kiện.

## 6. Tóm tắt 30 giây

Tuân thủ = bảo vệ khách, đồng nghiệp và điểm KPI.

## 7. Tự kiểm tra

- Điều gì bạn sẽ áp dụng ngay hôm nay?$md_b2000001_0000_0000_0000_000000000011$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80',
  $att_b2000001_0000_0000_0000_000000000011$[]$att_b2000001_0000_0000_0000_000000000011$::jsonb,
  8,
  ARRAY['lead', 'bai-11'],
  true,
  11,
  true,
  now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, content_md = EXCLUDED.content_md,
  video_url = EXCLUDED.video_url, video_type = EXCLUDED.video_type,
  cover_image_url = EXCLUDED.cover_image_url, attachments = EXCLUDED.attachments,
  duration_minutes = EXCLUDED.duration_minutes, tags = EXCLUDED.tags,
  is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  video_url, video_type, cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000001-0000-0000-0000-000000000012',
  'd2000001-0000-0000-0000-000000000001',
  'Bài 12: Tình huống đặc biệt',
  'Trùng, mất, mở lại, blocklist.',
  $md_b2000001_0000_0000_0000_000000000012$# Bài 12: Tình huống đặc biệt

## 1. Tình huống

Tình huống ngành tủ bếp/cửa nhôm — Trùng, mất, mở lại, blocklist.

## 2. Thuật ngữ

Thuật ngữ xem các bài trước. Bài này tập trung **quy trình và KPI**.

## 3. Nội dung chính

- **Trùng SĐT:** mở Lead cũ.
- **Mất Lead:** đánh dấu + lý do, không xóa.
- **Mở lại:** khi KH quay lại sau thời gian.
- **Blocklist:** khách không muốn liên hệ — báo admin.

## 4. Trên phần mềm — bạn cần làm gì

1. Mở **CRM → Bảng Lead** hoặc chi tiết Lead.
2. Thực hiện đúng thứ tự.
3. Kiểm tra lịch sử đã lưu.

Thao tác màn hình: khoá **Hướng dẫn CRM**.

## 5. Sai lầm thường gặp

- Chỉ làm ngoài app.
- Bỏ qua ghi chú/minh chứng.
- Chuyển Deal khi chưa đủ điều kiện.

## 6. Tóm tắt 30 giây

Tuân thủ = bảo vệ khách, đồng nghiệp và điểm KPI.

## 7. Tự kiểm tra

- Điều gì bạn sẽ áp dụng ngay hôm nay?$md_b2000001_0000_0000_0000_000000000012$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80',
  $att_b2000001_0000_0000_0000_000000000012$[]$att_b2000001_0000_0000_0000_000000000012$::jsonb,
  8,
  ARRAY['lead', 'bai-12'],
  true,
  12,
  true,
  now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, content_md = EXCLUDED.content_md,
  video_url = EXCLUDED.video_url, video_type = EXCLUDED.video_type,
  cover_image_url = EXCLUDED.cover_image_url, attachments = EXCLUDED.attachments,
  duration_minutes = EXCLUDED.duration_minutes, tags = EXCLUDED.tags,
  is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  video_url, video_type, cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000001-0000-0000-0000-000000000013',
  'd2000001-0000-0000-0000-000000000001',
  'Bài 13: Bài thi tổng kết — Lead',
  'Bài thi tổng kết khoá — đạt yêu cầu để nhận chứng nhận.',
  $md_b2000001_0000_0000_0000_000000000013$# Bài 13: Bài thi tổng kết — Lead

## Mục đích

Kiểm tra tổng hợp kiến thức toàn khoá. Đọc kỹ từng câu; sau khi nộp, xem **giải thích** cho câu sai.

## Quy định

- **25 câu** trắc nghiệm

- Điểm đạt: **80%**

- Thời gian: **30 phút**

- Tối đa **3 lượt**

- **Điều kiện mở:** đạt **toàn bộ bài tập** trong khoá

## Trước khi thi

Ôn lại các bài học bắt buộc và làm lại bài tập chưa đạt.$md_b2000001_0000_0000_0000_000000000013$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80',
  $att_b2000001_0000_0000_0000_000000000013$[]$att_b2000001_0000_0000_0000_000000000013$::jsonb,
  30,
  ARRAY['thi-cuoi', 'chung-nhan'],
  true,
  99,
  true,
  now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, content_md = EXCLUDED.content_md,
  video_url = EXCLUDED.video_url, video_type = EXCLUDED.video_type,
  cover_image_url = EXCLUDED.cover_image_url, attachments = EXCLUDED.attachments,
  duration_minutes = EXCLUDED.duration_minutes, tags = EXCLUDED.tags,
  is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();

UPDATE knowledge_lessons SET is_final_exam = true WHERE id = 'b2000001-0000-0000-0000-000000000013';
-- BÀI TẬP
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order
) VALUES (
  'c2000001-0000-0000-0000-000000000001',
  'b2000001-0000-0000-0000-000000000001',
  'Kiểm tra: Khái niệm Lead',
  '8 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000001_0000_0000_0000_000000000001${"items":[{"id":"q1","question":"Lead là gì?","type":"single","options":["Khách đã ký HĐ","Khách tiềm năng đã tiếp xúc, chưa cam kết mua","Sản phẩm mới","Nhân viên mới"],"correct":[1],"explanation":"Lead chưa có cam kết mua — chỉ mới quan tâm."},{"id":"q2","question":"Deal là gì?","type":"single","options":["Khách mới nhắn tin","Đã thống nhất mua, đang hoàn tất HĐ","Đã thanh toán 100%","Lead bị xóa"],"correct":[1],"explanation":"Deal = giai đoạn sau khi chốt mua."},{"id":"q3","question":"Một Lead có bao nhiêu người phụ trách chính?","type":"single","options":["Không giới hạn","Một người","Chỉ admin","Hai người bắt buộc"],"correct":[1],"explanation":"Tránh trách nhiệm chồng chéo."},{"id":"q4","question":"Vì sao công ty bắt buộc CRM thay sổ tay?","type":"single","options":["Tốn thời gian","Lưu lịch sử, nhắc hẹn, tính KPI công bằng","Chỉ để admin giám sát","Không có lý do"],"correct":[1],"explanation":"CRM giúp minh bạch và đo lường."},{"id":"q5","question":"Chị Hoa hỏi giá qua fanpage — phân loại?","type":"single","options":["Deal","Lead","Khách hàng","Báo giá PDF"],"correct":[1],"explanation":"Mới hỏi giá = Lead."},{"id":"q6","question":"Đường dẫn xem Lead?","type":"single","options":["Công việc → Dự án","CRM → Bảng Lead","Kiến thức","Xưởng SX"],"correct":[1],"explanation":"Lead nằm trong CRM."},{"id":"q7","question":"Khi Lead \"chín\", bước tiếp theo?","type":"single","options":["Xóa Lead","Chuyển thành Deal","Tạo nhân viên","In phiếu lương"],"correct":[1],"explanation":"Chuyển Deal khi đủ điều kiện (Bài 11)."},{"id":"q8","question":"Thành viên hỗ trợ trên Lead dùng để?","type":"single","options":["Thay phụ trách chính","Hỗ trợ cùng team, phụ trách chính vẫn chịu KPI","Ẩn Lead","Xóa KPI"],"correct":[1],"explanation":"Phụ trách chính không đổi."}]}$j_c2000001_0000_0000_0000_000000000001$::jsonb,
  70,
  3,
  NULL,
  1
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, updated_at = now();
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order
) VALUES (
  'c2000001-0000-0000-0000-000000000002',
  'b2000001-0000-0000-0000-000000000002',
  'Kiểm tra: Tiếp nhận Lead',
  '6 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000001_0000_0000_0000_000000000002${"items":[{"id":"q1","question":"Có bao nhiêu kênh tiếp nhận chính trong bài?","type":"single","options":["3","4","5","7"],"correct":[2],"explanation":"Năm kênh: mạng xã hội, tổng đài, web, showroom, giới thiệu."},{"id":"q2","question":"Thông tin BẮT BUỘC tối thiểu?","type":"single","options":["Mã số thuế","Tiêu đề + Khách hàng","Bản vẽ 3D","Hợp đồng"],"correct":[1],"explanation":"Hệ thống yêu cầu tiêu đề và liên kết khách."},{"id":"q3","question":"Trước Lưu Lead mới phải?","type":"single","options":["In PDF","Quét trùng SĐT","Ký HĐ","Bàn giao xưởng"],"correct":[1],"explanation":"Tránh trùng khách."},{"id":"q4","question":"Nếu Quét trùng có kết quả?","type":"single","options":["Tạo mới","Mở Lead cũ, thêm ghi chú","Đổi SĐT giả","Xóa khách"],"correct":[1],"explanation":"Một SĐT — một luồng chăm sóc."},{"id":"q5","question":"Tiêu đề Lead tốt nhất?","type":"single","options":["\"KH\"","\"Chị Lan Q7 — Cửa 2 cánh\"","Để trống","Chỉ ngày"],"correct":[1],"explanation":"Tiêu đề giúp nhận diện nhanh."},{"id":"q6","question":"Nguồn Lead dùng để?","type":"single","options":["Trang trí","Thống kê hiệu quả kênh marketing","Xóa Lead","Tính thuế"],"correct":[1],"explanation":"Báo cáo theo nguồn."}]}$j_c2000001_0000_0000_0000_000000000002$::jsonb,
  70,
  3,
  NULL,
  1
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, updated_at = now();
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order
) VALUES (
  'c2000001-0000-0000-0000-000000000003',
  'b2000001-0000-0000-0000-000000000002',
  'Thực hành: Tạo Lead chuẩn',
  'Đánh dấu khi bạn đã thực hành được trên phần mềm thật.',
  'checklist',
  $j_c2000001_0000_0000_0000_000000000003${"items":[{"id":"c1","text":"Bấm Quét trùng trước khi Lưu"},{"id":"c2","text":"Tiêu đề có tên + khu vực + sản phẩm"},{"id":"c3","text":"SĐT đủ 10 số"},{"id":"c4","text":"Chọn đúng Nguồn"},{"id":"c5","text":"Chọn Loại sản phẩm"},{"id":"c6","text":"Lead hiện ở cột Mới sau Lưu"}]}$j_c2000001_0000_0000_0000_000000000003$::jsonb,
  80,
  NULL,
  NULL,
  1
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, updated_at = now();
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order
) VALUES (
  'c2000001-0000-0000-0000-000000000004',
  'b2000001-0000-0000-0000-000000000003',
  'Kiểm tra: Bảng Lead',
  '8 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000001_0000_0000_0000_000000000004${"items":[{"id":"q1","question":"Một thẻ Kanban là?","type":"single","options":["Một Lead","Một file","Một nhân viên","Một KPI tháng"],"correct":[0],"explanation":"Mỗi thẻ = một Lead."},{"id":"q2","question":"Pipeline Lead là?","type":"single","options":["Danh sách nhân viên","Các giai đoạn chăm sóc khách tiềm năng","Bảng lương","Kho vật tư"],"correct":[1],"explanation":"Pipeline = quy trình giai đoạn."},{"id":"q3","question":"Kéo thẻ sang cột khác khi?","type":"single","options":["Rảnh","Đã hoàn thành việc tương ứng giai đoạn","Cuối tháng","Admin yêu cầu"],"correct":[1],"explanation":"Giai đoạn phải khớp thực tế."},{"id":"q4","question":"Thông báo đỏ khi kéo thường do?","type":"single","options":["Mạng chậm","Nhiệm vụ bắt buộc chưa hoàn thành","Khách VIP","Đã ký HĐ"],"correct":[1],"explanation":"Gate nhiệm vụ bảo vệ quy trình."},{"id":"q5","question":"Chế độ Deadline dùng để?","type":"single","options":["Xem Lead theo mốc hạn","Xóa Lead","Tạo báo giá","In HĐ"],"correct":[0],"explanation":"Ưu tiên Lead trễ SLA."},{"id":"q6","question":"Tab Kanban nằm ở?","type":"single","options":["Bảng Lead","Cài đặt","Kiến thức","Báo cáo SX"],"correct":[0],"explanation":"Trong màn Bảng Lead."},{"id":"q7","question":"Sau cuộc gọi nên?","type":"single","options":["Chỉ kéo thẻ","Ghi hoạt động + kéo thẻ nếu đủ điều kiện","Xóa Lead","Đổi SĐT"],"correct":[1],"explanation":"Lịch sử phải có nội dung."},{"id":"q8","question":"Cột \"Đã đồng ý\" thường dẫn tới?","type":"single","options":["Xóa","Chuyển Deal","Nghỉ phép","Tạo nhân viên"],"correct":[1],"explanation":"Khách đồng ý mua → Deal."}]}$j_c2000001_0000_0000_0000_000000000004$::jsonb,
  70,
  3,
  NULL,
  1
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, updated_at = now();
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order
) VALUES (
  'c2000001-0000-0000-0000-000000000005',
  'b2000001-0000-0000-0000-000000000004',
  'Kiểm tra: 6 thông tin bắt buộc',
  '6 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000001_0000_0000_0000_000000000005${"items":[{"id":"q1","question":"Có bao nhiêu trường bắt buộc?","type":"single","options":["3","4","6","10"],"correct":[2],"explanation":"Sáu trường theo quy định công ty."},{"id":"q2","question":"Trường KHÔNG thuộc 6 trường?","type":"single","options":["SĐT","Ngày sinh khách","Nguồn","Loại sản phẩm"],"correct":[1],"explanation":"Ngày sinh không nằm trong bộ 6."},{"id":"q3","question":"KPI \"Đầy đủ thông tin\" đo gì?","type":"single","options":["Số cuộc gọi","% Lead đủ 6 trường","Doanh số","Số file PDF"],"correct":[1],"explanation":"Tỷ lệ hoàn thiện hồ sơ Lead."},{"id":"q4","question":"Quy tắc chặn điểm áp dụng khi?","type":"single","options":["Luôn luôn","Khi KPI Đầy đủ thông tin dưới ngưỡng công ty","Khi trời mưa","Khi mới vào"],"correct":[1],"explanation":"Bảo vệ chất lượng dữ liệu."},{"id":"q5","question":"Thiếu địa chỉ lắp đặt ảnh hưởng?","type":"single","options":["Không","Khó khảo sát/lắp và trừ KPI","Tự động chuyển Deal","Xóa Lead"],"correct":[1],"explanation":"Địa chỉ cần cho khảo sát."},{"id":"q6","question":"Nên kiểm tra 6 trường khi nào?","type":"single","options":["Cuối năm","Ngay khi tạo Lead và trước chuyển Deal","Sau khi SX xong","Không cần"],"correct":[1],"explanation":"Sớm = ít sửa lại."}]}$j_c2000001_0000_0000_0000_000000000005$::jsonb,
  70,
  3,
  NULL,
  1
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, updated_at = now();
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order
) VALUES (
  'c2000001-0000-0000-0000-000000000006',
  'b2000001-0000-0000-0000-000000000004',
  'Tự kiểm: 6 trường trên Lead thật',
  'Đánh dấu khi bạn đã thực hành được trên phần mềm thật.',
  'checklist',
  $j_c2000001_0000_0000_0000_000000000006${"items":[{"id":"c1","text":"Mở 1 Lead của tôi trên app"},{"id":"c2","text":"SĐT đủ 10 số"},{"id":"c3","text":"Email hợp lệ hoặc ghi chú \"KH không dùng email\""},{"id":"c4","text":"Địa chỉ đến quận/huyện"},{"id":"c5","text":"Nguồn chọn từ danh mục"},{"id":"c6","text":"Loại SP + Mức ưu tiên đã chọn"}]}$j_c2000001_0000_0000_0000_000000000006$::jsonb,
  80,
  NULL,
  NULL,
  1
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, updated_at = now();
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order
) VALUES (
  'c2000001-0000-0000-0000-000000000007',
  'b2000001-0000-0000-0000-000000000005',
  'Thực hành: Nhiệm vụ Lead',
  'Đánh dấu khi bạn đã thực hành được trên phần mềm thật.',
  'checklist',
  $j_c2000001_0000_0000_0000_000000000007${"items":[{"id":"c1","text":"Tạo nhiệm vụ có hạn cụ thể"},{"id":"c2","text":"Ghi chú kết quả khi hoàn thành"},{"id":"c3","text":"Đính kèm minh chứng nếu yêu cầu"},{"id":"c4","text":"Không tick xong khi chưa gọi"},{"id":"c5","text":"Kiểm tra nhiệm vụ chặn trước khi kéo cột"}]}$j_c2000001_0000_0000_0000_000000000007$::jsonb,
  80,
  NULL,
  NULL,
  1
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, updated_at = now();
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order
) VALUES (
  'c2000001-0000-0000-0000-000000000008',
  'b2000001-0000-0000-0000-000000000006',
  'Kiểm tra bắt buộc',
  '8 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000001_0000_0000_0000_000000000008${"items":[{"id":"q1","question":"Khi hoàn thành nhiệm vụ bắt buộc, hệ thống thường yêu cầu?","type":"single","options":["Chỉ tick","Ghi chú + file minh chứng (nếu cấu hình)","Xóa Lead","Đổi mật khẩu"],"correct":[1],"explanation":"Minh chứng chứng minh đã làm."},{"id":"q2","question":"Ghi chú \"đã gọi\" không số điện thoại — đánh giá?","type":"single","options":["Đạt","Không đạt — thiếu nội dung","Tốt nhất","Không cần"],"correct":[1],"explanation":"Ghi chú phải có thông tin kiểm chứng."},{"id":"q3","question":"Screenshot Zalo nên lưu?","type":"single","options":["Chat riêng","Đính kèm nhiệm vụ / tài liệu Lead","Xóa","Chỉ máy cá nhân"],"correct":[1],"explanation":"Để đồng nghiệp và KPI đối soát."},{"id":"q4","question":"Tick hoàn thành khi chưa gọi?","type":"single","options":["Được","Vi phạm — trừ KPI","Bắt buộc","Chỉ cuối tuần"],"correct":[1],"explanation":"Gian lận tiến độ."},{"id":"q5","question":"Mục đích quy định minh chứng?","type":"single","options":["Làm khó","Minh bạch và đo chất lượng","Giảm Lead","Tăng thuế"],"correct":[1],"explanation":"Bảo vệ khách và công bằng KPI."},{"id":"q6","question":"Ai đọc được ghi chú nhiệm vụ?","type":"single","options":["Chỉ bạn","Team có quyền trên Lead","Khách hàng tự động","Không ai"],"correct":[1],"explanation":"Hỗ trợ handover."},{"id":"q7","question":"File ảnh đo đạc nên gắn?","type":"single","options":["Lead / nhiệm vụ khảo sát","Email cá nhân","Không lưu","Blocklist"],"correct":[0],"explanation":"Gắn đúng ngữ cảnh công việc."},{"id":"q8","question":"Không tuân thủ lâu ngày hậu quả?","type":"single","options":["Thưởng","KPI thấp, mất uy tín","Tự thăng chức","Không ảnh hưởng"],"correct":[1],"explanation":"KPI gắn hành vi."}]}$j_c2000001_0000_0000_0000_000000000008$::jsonb,
  80,
  3,
  15,
  1
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, updated_at = now();
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order
) VALUES (
  'c2000001-0000-0000-0000-000000000009',
  'b2000001-0000-0000-0000-000000000006',
  'Tự luận: Áp dụng quy định',
  'Bài tự luận — trình bày trung thực, tối thiểu 200 từ.',
  'essay',
  $j_c2000001_0000_0000_0000_000000000009${"prompt":"Mô tả 1 tình huống bạn đã tuân thủ đúng quy định (ghi chú + file) và 1 tình huống từng thiếu sót. Nêu bài học và cam kết tháng tới (tối thiểu 200 từ, 3 mục rõ ràng)."}$j_c2000001_0000_0000_0000_000000000009$::jsonb,
  70,
  2,
  NULL,
  1
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, updated_at = now();
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order
) VALUES (
  'c2000001-0000-0000-0000-000000000010',
  'b2000001-0000-0000-0000-000000000007',
  'Kiểm tra: Ghi chú và tài liệu trên Lead',
  '3 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000001_0000_0000_0000_000000000010${"items":[{"id":"q1","question":"Ghi chú cuộc gọi nên ở?","type":"single","options":["Tài liệu","Hoạt động / Nhiệm vụ","Blocklist","Xóa Lead"],"correct":[1],"explanation":"Ghi chú tương tác thuộc hoạt động/nhiệm vụ."},{"id":"q2","question":"Hợp đồng PDF ký nên?","type":"single","options":["Chat","Tài liệu Lead","Email cá nhân","Không lưu"],"correct":[1],"explanation":"Hồ sơ tập trung tab Tài liệu."},{"id":"q3","question":"Tên file tốt?","type":"single","options":["a.pdf","HD_ChịLan_2026-03.pdf","1.jpg","tmp"],"correct":[1],"explanation":"Tên có ngữ nghĩa."}]}$j_c2000001_0000_0000_0000_000000000010$::jsonb,
  70,
  3,
  NULL,
  1
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, updated_at = now();
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order
) VALUES (
  'c2000001-0000-0000-0000-000000000011',
  'b2000001-0000-0000-0000-000000000008',
  'Kiểm tra: Lịch sử tương tác',
  '2 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000001_0000_0000_0000_000000000011${"items":[{"id":"q1","question":"Quy tắc 5 phút với Lead Hot?","type":"single","options":["Gọi trong 5 phút","Nghỉ 5 phút","Xóa sau 5 phút","Không áp dụng"],"correct":[0],"explanation":"Phản hồi nhanh tăng tỉ lệ chốt."},{"id":"q2","question":"Hoạt động ghi nhận?","type":"single","options":["Chỉ gọi","Gọi, gặp, email, đổi giai đoạn…","Chỉ KPI","Chỉ chat nội bộ"],"correct":[1],"explanation":"Timeline đầy đủ."}]}$j_c2000001_0000_0000_0000_000000000011$::jsonb,
  70,
  3,
  NULL,
  1
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, updated_at = now();
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order
) VALUES (
  'c2000001-0000-0000-0000-000000000012',
  'b2000001-0000-0000-0000-000000000009',
  'Kiểm tra: Hạn chót và SLA',
  '2 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000001_0000_0000_0000_000000000012${"items":[{"id":"q1","question":"SLA là?","type":"single","options":["Hạn xử lý cam kết","Loại cửa","Mã Lead","Thuế"],"correct":[0],"explanation":"SLA = cam kết thời gian."},{"id":"q2","question":"Badge đỏ trên thẻ?","type":"single","options":["Quá hạn SLA","Đã thắng","Đã xóa","VIP"],"correct":[0],"explanation":"Cần xử lý gấp."}]}$j_c2000001_0000_0000_0000_000000000012$::jsonb,
  70,
  3,
  NULL,
  1
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, updated_at = now();
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order
) VALUES (
  'c2000001-0000-0000-0000-000000000013',
  'b2000001-0000-0000-0000-000000000010',
  'Kiểm tra bắt buộc',
  '8 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000001_0000_0000_0000_000000000013${"items":[{"id":"q1","question":"KPI Lead gồm?","type":"single","options":["Chỉ doanh số","Đầy đủ thông tin, Đúng hạn, chuyển Deal…","Chỉ số cuộc gọi","Chỉ Facebook"],"correct":[1],"explanation":"Nhiều chỉ số hành vi."},{"id":"q2","question":"KPI \"Đúng hạn\" đo?","type":"single","options":["% nhiệm vụ/Lead xử lý đúng SLA","Số email","Chiều cao tủ","Màu sơn"],"correct":[0],"explanation":"Trước đây có thể gọi A4."},{"id":"q3","question":"Xem điểm KPI ở?","type":"single","options":["CRM → Bảng điểm","Chỉ sếp","Không có","Zalo"],"correct":[0],"explanation":"Scorecard tháng."},{"id":"q4","question":"Quy tắc chặn điểm khi KPI Đầy đủ thông tin thấp?","type":"single","options":["Không","Có — điểm tháng bị giới hạn","Chỉ admin","Chỉ năm"],"correct":[1],"explanation":"Khuyến khích nhập liệu."},{"id":"q5","question":"Ledger KPI là?","type":"single","options":["Sổ ghi sự kiện cộng/trừ điểm","Loại cửa","Mã HĐ","Tên KH"],"correct":[0],"explanation":"Tự động khi làm đúng/sai."},{"id":"q6","question":"Cải thiện KPI tháng sau nên?","type":"single","options":["Lặp lại sai sót","Kế hoạch cụ thể từng chỉ số","Không làm gì","Tắt CRM"],"correct":[1],"explanation":"Hành động đo được."},{"id":"q7","question":"Lead chuyển Deal ảnh hưởng KPI?","type":"single","options":["Không","Có — chỉ số chuyển đổi","Chỉ xưởng","Chỉ vận chuyển"],"correct":[1],"explanation":"Đo năng suất sales."},{"id":"q8","question":"KPI công bằng khi?","type":"single","options":["Mọi người cùng quy tắc trên CRM","Sổ tay riêng","Ẩn số liệu","Không ghi"],"correct":[0],"explanation":"Cùng hệ thống."}]}$j_c2000001_0000_0000_0000_000000000013$::jsonb,
  80,
  3,
  15,
  1
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, updated_at = now();
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order
) VALUES (
  'c2000001-0000-0000-0000-000000000014',
  'b2000001-0000-0000-0000-000000000010',
  'Tự luận: Áp dụng quy định',
  'Bài tự luận — trình bày trung thực, tối thiểu 200 từ.',
  'essay',
  $j_c2000001_0000_0000_0000_000000000014${"prompt":"Mô tả 1 tình huống bạn đã tuân thủ đúng quy định (ghi chú + file) và 1 tình huống từng thiếu sót. Nêu bài học và cam kết tháng tới (tối thiểu 200 từ, 3 mục rõ ràng)."}$j_c2000001_0000_0000_0000_000000000014$::jsonb,
  70,
  2,
  NULL,
  1
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, updated_at = now();
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order
) VALUES (
  'c2000001-0000-0000-0000-000000000015',
  'b2000001-0000-0000-0000-000000000011',
  'Kiểm tra: Chuyển Lead thành Deal',
  '2 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000001_0000_0000_0000_000000000015${"items":[{"id":"q1","question":"Khi nào chuyển Deal?","type":"single","options":["Mới tạo Lead","KH đồng ý mua + thống nhất SP/giá","Chưa gọi","Cuối năm"],"correct":[1],"explanation":"Đủ điều kiện nghiệp vụ."},{"id":"q2","question":"Sau chuyển Deal?","type":"single","options":["Mất lịch sử","Giữ lịch sử, sang pipeline Deal","Xóa Lead","Tạo SĐT mới"],"correct":[1],"explanation":"Chuyển một chiều nhưng giữ dữ liệu."}]}$j_c2000001_0000_0000_0000_000000000015$::jsonb,
  70,
  3,
  NULL,
  1
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, updated_at = now();
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order
) VALUES (
  'c2000001-0000-0000-0000-000000000016',
  'b2000001-0000-0000-0000-000000000011',
  'Checklist trước chuyển Deal',
  'Đánh dấu khi bạn đã thực hành được trên phần mềm thật.',
  'checklist',
  $j_c2000001_0000_0000_0000_000000000016${"items":[{"id":"c1","text":"KH đồng ý mua có ghi nhận"},{"id":"c2","text":"Đủ 6 thông tin"},{"id":"c3","text":"Đã báo giá / file"},{"id":"c4","text":"Đã chọn đúng pipeline Deal"},{"id":"c5","text":"Đã kiểm tra không trùng Deal"}]}$j_c2000001_0000_0000_0000_000000000016$::jsonb,
  80,
  NULL,
  NULL,
  1
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, updated_at = now();
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order
) VALUES (
  'c2000001-0000-0000-0000-000000000017',
  'b2000001-0000-0000-0000-000000000012',
  'Kiểm tra: Tình huống đặc biệt',
  '2 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000001_0000_0000_0000_000000000017${"items":[{"id":"q1","question":"Lead trùng SĐT?","type":"single","options":["Tạo mới","Gộp chăm sóc trên Lead cũ","Ẩn","Block"],"correct":[1],"explanation":"Một khách một luồng."},{"id":"q2","question":"Lead \"Mất\"?","type":"single","options":["Xóa","Đánh dấu mất + lý do","Chuyển Deal","Tạo NV"],"correct":[1],"explanation":"Giữ lịch sử phân tích."}]}$j_c2000001_0000_0000_0000_000000000017$::jsonb,
  70,
  3,
  NULL,
  1
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, updated_at = now();
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order
) VALUES (
  'c2000001-0000-0000-0000-000000000099',
  'b2000001-0000-0000-0000-000000000013',
  'Bài thi tổng kết khoá',
  '25 câu — 30 phút — đạt 80% — tối đa 3 lượt.',
  'quiz',
  $j_c2000001_0000_0000_0000_000000000099${"items":[{"id":"fq1","question":"Câu 1: Deal khác Lead ở?","type":"single","options":["Đã chốt mua","Chưa liên hệ","Là nhân viên","Là file"],"correct":[0],"explanation":"Deal sau khi thống nhất mua."},{"id":"fq2","question":"Câu 2: 6 trường bắt buộc giúp KPI nào?","type":"single","options":["Đầy đủ thông tin","Màu tủ","Giờ nghỉ","Loại xe"],"correct":[0],"explanation":"Tỷ lệ đủ 6 trường."},{"id":"fq3","question":"Câu 3: SLA là?","type":"single","options":["Hạn xử lý cam kết","Mã SP","Tên xưởng","VAT"],"correct":[0],"explanation":"Cam kết thời gian."},{"id":"fq4","question":"Câu 4: Chuyển Deal khi?","type":"single","options":["Mới tạo","KH đồng ý mua","Chưa gọi","Không bao giờ"],"correct":[1],"explanation":"Đủ điều kiện nghiệp vụ."},{"id":"fq5","question":"Câu 5: Quét trùng trước?","type":"single","options":["Tạo Lead","Lưu Lead mới","Xóa KH","In PDF"],"correct":[1],"explanation":"Tránh trùng."},{"id":"fq6","question":"Câu 6: Deal khác Lead ở?","type":"single","options":["Đã chốt mua","Chưa liên hệ","Là nhân viên","Là file"],"correct":[0],"explanation":"Deal sau khi thống nhất mua."},{"id":"fq7","question":"Câu 7: 6 trường bắt buộc giúp KPI nào?","type":"single","options":["Đầy đủ thông tin","Màu tủ","Giờ nghỉ","Loại xe"],"correct":[0],"explanation":"Tỷ lệ đủ 6 trường."},{"id":"fq8","question":"Câu 8: SLA là?","type":"single","options":["Hạn xử lý cam kết","Mã SP","Tên xưởng","VAT"],"correct":[0],"explanation":"Cam kết thời gian."},{"id":"fq9","question":"Câu 9: Chuyển Deal khi?","type":"single","options":["Mới tạo","KH đồng ý mua","Chưa gọi","Không bao giờ"],"correct":[1],"explanation":"Đủ điều kiện nghiệp vụ."},{"id":"fq10","question":"Câu 10: Quét trùng trước?","type":"single","options":["Tạo Lead","Lưu Lead mới","Xóa KH","In PDF"],"correct":[1],"explanation":"Tránh trùng."},{"id":"fq11","question":"Câu 11: Deal khác Lead ở?","type":"single","options":["Đã chốt mua","Chưa liên hệ","Là nhân viên","Là file"],"correct":[0],"explanation":"Deal sau khi thống nhất mua."},{"id":"fq12","question":"Câu 12: 6 trường bắt buộc giúp KPI nào?","type":"single","options":["Đầy đủ thông tin","Màu tủ","Giờ nghỉ","Loại xe"],"correct":[0],"explanation":"Tỷ lệ đủ 6 trường."},{"id":"fq13","question":"Câu 13: SLA là?","type":"single","options":["Hạn xử lý cam kết","Mã SP","Tên xưởng","VAT"],"correct":[0],"explanation":"Cam kết thời gian."},{"id":"fq14","question":"Câu 14: Chuyển Deal khi?","type":"single","options":["Mới tạo","KH đồng ý mua","Chưa gọi","Không bao giờ"],"correct":[1],"explanation":"Đủ điều kiện nghiệp vụ."},{"id":"fq15","question":"Câu 15: Quét trùng trước?","type":"single","options":["Tạo Lead","Lưu Lead mới","Xóa KH","In PDF"],"correct":[1],"explanation":"Tránh trùng."},{"id":"fq16","question":"Câu 16: Deal khác Lead ở?","type":"single","options":["Đã chốt mua","Chưa liên hệ","Là nhân viên","Là file"],"correct":[0],"explanation":"Deal sau khi thống nhất mua."},{"id":"fq17","question":"Câu 17: 6 trường bắt buộc giúp KPI nào?","type":"single","options":["Đầy đủ thông tin","Màu tủ","Giờ nghỉ","Loại xe"],"correct":[0],"explanation":"Tỷ lệ đủ 6 trường."},{"id":"fq18","question":"Câu 18: SLA là?","type":"single","options":["Hạn xử lý cam kết","Mã SP","Tên xưởng","VAT"],"correct":[0],"explanation":"Cam kết thời gian."},{"id":"fq19","question":"Câu 19: Chuyển Deal khi?","type":"single","options":["Mới tạo","KH đồng ý mua","Chưa gọi","Không bao giờ"],"correct":[1],"explanation":"Đủ điều kiện nghiệp vụ."},{"id":"fq20","question":"Câu 20: Quét trùng trước?","type":"single","options":["Tạo Lead","Lưu Lead mới","Xóa KH","In PDF"],"correct":[1],"explanation":"Tránh trùng."},{"id":"fq21","question":"Câu 21: Deal khác Lead ở?","type":"single","options":["Đã chốt mua","Chưa liên hệ","Là nhân viên","Là file"],"correct":[0],"explanation":"Deal sau khi thống nhất mua."},{"id":"fq22","question":"Câu 22: 6 trường bắt buộc giúp KPI nào?","type":"single","options":["Đầy đủ thông tin","Màu tủ","Giờ nghỉ","Loại xe"],"correct":[0],"explanation":"Tỷ lệ đủ 6 trường."},{"id":"fq23","question":"Câu 23: SLA là?","type":"single","options":["Hạn xử lý cam kết","Mã SP","Tên xưởng","VAT"],"correct":[0],"explanation":"Cam kết thời gian."},{"id":"fq24","question":"Câu 24: Chuyển Deal khi?","type":"single","options":["Mới tạo","KH đồng ý mua","Chưa gọi","Không bao giờ"],"correct":[1],"explanation":"Đủ điều kiện nghiệp vụ."},{"id":"fq25","question":"Câu 25: Quét trùng trước?","type":"single","options":["Tạo Lead","Lưu Lead mới","Xóa KH","In PDF"],"correct":[1],"explanation":"Tránh trùng."}]}$j_c2000001_0000_0000_0000_000000000099$::jsonb,
  80,
  3,
  30,
  1
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, updated_at = now();
COMMIT;
