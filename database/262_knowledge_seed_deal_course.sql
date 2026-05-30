-- 262
-- Khoá Deal
-- Seed Deal course — generated
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
  'd2000002-0000-0000-0000-000000000001',
  'Deal — Cơ hội bán hàng',
  'deal-co-hoi-ban-hang',
  'Khoá đào tạo quản lý Deal sau khi chuyển từ Lead: pipeline, báo giá, ký HĐ, thắng/thua, bàn giao sản xuất. Ngành tủ bếp nhôm / cửa nhôm.',
  '💼',
  11,
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, icon = EXCLUDED.icon, is_active = true;

UPDATE knowledge_categories SET
  deadline_mode = 'relative',
  deadline_duration_days = 30,
  deadline_note = 'Hoàn thành khoá Deal trong 30 ngày kể từ bài học đầu tiên',
  require_all_exercises_passed = true
WHERE id = 'd2000002-0000-0000-0000-000000000001';

-- BÀI HỌC
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  video_url, video_type, cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000002-0000-0000-0000-000000000001',
  'd2000002-0000-0000-0000-000000000001',
  'Bài 1: Deal là gì? Khác Lead ở đâu?',
  'Deal là gì? Khác Lead ở đâu?',
  $md_b2000002_0000_0000_0000_000000000001$# Bài 1 — Deal là gì? Khác Lead ở đâu?

## 1. Tình huống

Anh Minh đã chốt 2 bộ cửa nhôm 38 triệu — đây là **Deal**.

## 2. Thuật ngữ

- **Deal** _(cơ hội bán — đã chốt mua)_
- **Pipeline** _(các giai đoạn trên bảng Deal)_
- **Kanban** _(kéo thẻ giữa cột)_

## 3. Nội dung chính

Mỗi công ty có thể cấu hình **pipeline** khác nhau. Khoá dùng **6 giai đoạn mẫu**: Deal mới → Báo giá → Đàm phán → Ký HĐ → Thắng / Thua.

Kéo vào **Thắng** khi đủ HĐ + cọc; **Thua** phải chọn lý do.

## 4. Trên phần mềm

1. **CRM → Bảng Deal**.
2. Kanban — kéo thẻ đúng giai đoạn.
3. Tab Tài liệu / Nhiệm vụ khi cần.

## 5. Sai lầm thường gặp

- Kéo Thắng khi chưa thu cọc.
- Không ghi lý do Thua.

## 6. Tóm tắt

Deal quản lý giai đoạn sau chốt mua đến khi thắng/thua.

## 7. Tự kiểm tra

- Bạn áp dụng được điều gì ngay hôm nay?$md_b2000002_0000_0000_0000_000000000001$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&q=80',
  $att_b2000002_0000_0000_0000_000000000001$[]$att_b2000002_0000_0000_0000_000000000001$::jsonb,
  8,
  ARRAY['deal', 'bai-1'],
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
  'b2000002-0000-0000-0000-000000000002',
  'd2000002-0000-0000-0000-000000000001',
  'Bài 2: Bảng Deal và pipeline 6 giai đoạn (mẫu)',
  'Bảng Deal và pipeline 6 giai đoạn (mẫu)',
  $md_b2000002_0000_0000_0000_000000000002$# Bài 2 — Bảng Deal và pipeline 6 giai đoạn (mẫu)

## 1. Tình huống

Mở Kanban Deal — 6 cột minh hoạ từ Báo giá đến Thắng/Thua.

## 2. Thuật ngữ

- **Deal** _(cơ hội bán — đã chốt mua)_
- **Pipeline** _(các giai đoạn trên bảng Deal)_
- **Kanban** _(kéo thẻ giữa cột)_

## 3. Nội dung chính

Mỗi công ty có thể cấu hình **pipeline** khác nhau. Khoá dùng **6 giai đoạn mẫu**: Deal mới → Báo giá → Đàm phán → Ký HĐ → Thắng / Thua.

Kéo vào **Thắng** khi đủ HĐ + cọc; **Thua** phải chọn lý do.

## 4. Trên phần mềm

1. **CRM → Bảng Deal**.
2. Kanban — kéo thẻ đúng giai đoạn.
3. Tab Tài liệu / Nhiệm vụ khi cần.

## 5. Sai lầm thường gặp

- Kéo Thắng khi chưa thu cọc.
- Không ghi lý do Thua.

## 6. Tóm tắt

Deal quản lý giai đoạn sau chốt mua đến khi thắng/thua.

## 7. Tự kiểm tra

- Bạn áp dụng được điều gì ngay hôm nay?$md_b2000002_0000_0000_0000_000000000002$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&q=80',
  $att_b2000002_0000_0000_0000_000000000002$[]$att_b2000002_0000_0000_0000_000000000002$::jsonb,
  8,
  ARRAY['deal', 'bai-2'],
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
  'b2000002-0000-0000-0000-000000000003',
  'd2000002-0000-0000-0000-000000000001',
  'Bài 3: Báo giá chính thức trên Deal',
  'Báo giá chính thức trên Deal',
  $md_b2000002_0000_0000_0000_000000000003$# Bài 3 — Báo giá chính thức trên Deal

## 1. Tình huống

Gửi báo giá PDF cho chị Lan sau khi đo đạc.

## 2. Thuật ngữ

- **Deal** _(cơ hội bán — đã chốt mua)_
- **Pipeline** _(các giai đoạn trên bảng Deal)_
- **Kanban** _(kéo thẻ giữa cột)_

## 3. Nội dung chính

Mỗi công ty có thể cấu hình **pipeline** khác nhau. Khoá dùng **6 giai đoạn mẫu**: Deal mới → Báo giá → Đàm phán → Ký HĐ → Thắng / Thua.

Kéo vào **Thắng** khi đủ HĐ + cọc; **Thua** phải chọn lý do.

## 4. Trên phần mềm

1. **CRM → Bảng Deal**.
2. Kanban — kéo thẻ đúng giai đoạn.
3. Tab Tài liệu / Nhiệm vụ khi cần.

## 5. Sai lầm thường gặp

- Kéo Thắng khi chưa thu cọc.
- Không ghi lý do Thua.

## 6. Tóm tắt

Deal quản lý giai đoạn sau chốt mua đến khi thắng/thua.

## 7. Tự kiểm tra

- Bạn áp dụng được điều gì ngay hôm nay?$md_b2000002_0000_0000_0000_000000000003$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&q=80',
  $att_b2000002_0000_0000_0000_000000000003$[]$att_b2000002_0000_0000_0000_000000000003$::jsonb,
  8,
  ARRAY['deal', 'bai-3'],
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
  'b2000002-0000-0000-0000-000000000004',
  'd2000002-0000-0000-0000-000000000001',
  'Bài 4: Đàm phán và điều chỉnh phụ kiện',
  'Đàm phán và điều chỉnh phụ kiện',
  $md_b2000002_0000_0000_0000_000000000004$# Bài 4 — Đàm phán và điều chỉnh phụ kiện

## 1. Tình huống

KH muốn giảm 2 triệu hoặc tặng thêm phụ kiện.

## 2. Thuật ngữ

- **Deal** _(cơ hội bán — đã chốt mua)_
- **Pipeline** _(các giai đoạn trên bảng Deal)_
- **Kanban** _(kéo thẻ giữa cột)_

## 3. Nội dung chính

Mỗi công ty có thể cấu hình **pipeline** khác nhau. Khoá dùng **6 giai đoạn mẫu**: Deal mới → Báo giá → Đàm phán → Ký HĐ → Thắng / Thua.

Kéo vào **Thắng** khi đủ HĐ + cọc; **Thua** phải chọn lý do.

## 4. Trên phần mềm

1. **CRM → Bảng Deal**.
2. Kanban — kéo thẻ đúng giai đoạn.
3. Tab Tài liệu / Nhiệm vụ khi cần.

## 5. Sai lầm thường gặp

- Kéo Thắng khi chưa thu cọc.
- Không ghi lý do Thua.

## 6. Tóm tắt

Deal quản lý giai đoạn sau chốt mua đến khi thắng/thua.

## 7. Tự kiểm tra

- Bạn áp dụng được điều gì ngay hôm nay?$md_b2000002_0000_0000_0000_000000000004$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&q=80',
  $att_b2000002_0000_0000_0000_000000000004$[]$att_b2000002_0000_0000_0000_000000000004$::jsonb,
  8,
  ARRAY['deal', 'bai-4'],
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
  'b2000002-0000-0000-0000-000000000005',
  'd2000002-0000-0000-0000-000000000001',
  'Bài 5: Ký hợp đồng và thu cọc',
  'Ký hợp đồng và thu cọc',
  $md_b2000002_0000_0000_0000_000000000005$# Bài 5 — Ký hợp đồng và thu cọc

## 1. Tình huống

Soạn HĐ, thu 50% cọc, upload chứng từ.

## 2. Thuật ngữ

- **Deal** _(cơ hội bán — đã chốt mua)_
- **Pipeline** _(các giai đoạn trên bảng Deal)_
- **Kanban** _(kéo thẻ giữa cột)_

## 3. Nội dung chính

Mỗi công ty có thể cấu hình **pipeline** khác nhau. Khoá dùng **6 giai đoạn mẫu**: Deal mới → Báo giá → Đàm phán → Ký HĐ → Thắng / Thua.

Kéo vào **Thắng** khi đủ HĐ + cọc; **Thua** phải chọn lý do.

## 4. Trên phần mềm

1. **CRM → Bảng Deal**.
2. Kanban — kéo thẻ đúng giai đoạn.
3. Tab Tài liệu / Nhiệm vụ khi cần.

## 5. Sai lầm thường gặp

- Kéo Thắng khi chưa thu cọc.
- Không ghi lý do Thua.

## 6. Tóm tắt

Deal quản lý giai đoạn sau chốt mua đến khi thắng/thua.

## 7. Tự kiểm tra

- Bạn áp dụng được điều gì ngay hôm nay?$md_b2000002_0000_0000_0000_000000000005$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&q=80',
  $att_b2000002_0000_0000_0000_000000000005$[]$att_b2000002_0000_0000_0000_000000000005$::jsonb,
  8,
  ARRAY['deal', 'bai-5'],
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
  'b2000002-0000-0000-0000-000000000006',
  'd2000002-0000-0000-0000-000000000001',
  'Bài 6: Kéo Deal Thắng và tạo dự án sản xuất',
  'Kéo Deal Thắng và tạo dự án sản xuất',
  $md_b2000002_0000_0000_0000_000000000006$# Bài 6 — Kéo Deal Thắng và tạo dự án sản xuất

## 1. Tình huống

Deal thắng → popup tạo dự án xưởng.

## 2. Thuật ngữ

- **Deal** _(cơ hội bán — đã chốt mua)_
- **Pipeline** _(các giai đoạn trên bảng Deal)_
- **Kanban** _(kéo thẻ giữa cột)_

## 3. Nội dung chính

Mỗi công ty có thể cấu hình **pipeline** khác nhau. Khoá dùng **6 giai đoạn mẫu**: Deal mới → Báo giá → Đàm phán → Ký HĐ → Thắng / Thua.

Kéo vào **Thắng** khi đủ HĐ + cọc; **Thua** phải chọn lý do.

## 4. Trên phần mềm

1. **CRM → Bảng Deal**.
2. Kanban — kéo thẻ đúng giai đoạn.
3. Tab Tài liệu / Nhiệm vụ khi cần.

## 5. Sai lầm thường gặp

- Kéo Thắng khi chưa thu cọc.
- Không ghi lý do Thua.

## 6. Tóm tắt

Deal quản lý giai đoạn sau chốt mua đến khi thắng/thua.

## 7. Tự kiểm tra

- Bạn áp dụng được điều gì ngay hôm nay?$md_b2000002_0000_0000_0000_000000000006$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&q=80',
  $att_b2000002_0000_0000_0000_000000000006$[]$att_b2000002_0000_0000_0000_000000000006$::jsonb,
  8,
  ARRAY['deal', 'bai-6'],
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
  'b2000002-0000-0000-0000-000000000007',
  'd2000002-0000-0000-0000-000000000001',
  'Bài 7: Deal Thua — ghi lý do',
  'Deal Thua — ghi lý do',
  $md_b2000002_0000_0000_0000_000000000007$# Bài 7 — Deal Thua — ghi lý do

## 1. Tình huống

KH chọn đối thủ — bắt buộc chọn lý do thua.

## 2. Thuật ngữ

- **Deal** _(cơ hội bán — đã chốt mua)_
- **Pipeline** _(các giai đoạn trên bảng Deal)_
- **Kanban** _(kéo thẻ giữa cột)_

## 3. Nội dung chính

Mỗi công ty có thể cấu hình **pipeline** khác nhau. Khoá dùng **6 giai đoạn mẫu**: Deal mới → Báo giá → Đàm phán → Ký HĐ → Thắng / Thua.

Kéo vào **Thắng** khi đủ HĐ + cọc; **Thua** phải chọn lý do.

## 4. Trên phần mềm

1. **CRM → Bảng Deal**.
2. Kanban — kéo thẻ đúng giai đoạn.
3. Tab Tài liệu / Nhiệm vụ khi cần.

## 5. Sai lầm thường gặp

- Kéo Thắng khi chưa thu cọc.
- Không ghi lý do Thua.

## 6. Tóm tắt

Deal quản lý giai đoạn sau chốt mua đến khi thắng/thua.

## 7. Tự kiểm tra

- Bạn áp dụng được điều gì ngay hôm nay?$md_b2000002_0000_0000_0000_000000000007$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&q=80',
  $att_b2000002_0000_0000_0000_000000000007$[]$att_b2000002_0000_0000_0000_000000000007$::jsonb,
  8,
  ARRAY['deal', 'bai-7'],
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
  'b2000002-0000-0000-0000-000000000008',
  'd2000002-0000-0000-0000-000000000001',
  'Bài 8: Nhiệm vụ và gate trên Deal',
  'Nhiệm vụ và gate trên Deal',
  $md_b2000002_0000_0000_0000_000000000008$# Bài 8 — Nhiệm vụ và gate trên Deal

## 1. Tình huống

Một số cột yêu cầu hoàn thành nhiệm vụ.

## 2. Thuật ngữ

- **Deal** _(cơ hội bán — đã chốt mua)_
- **Pipeline** _(các giai đoạn trên bảng Deal)_
- **Kanban** _(kéo thẻ giữa cột)_

## 3. Nội dung chính

Mỗi công ty có thể cấu hình **pipeline** khác nhau. Khoá dùng **6 giai đoạn mẫu**: Deal mới → Báo giá → Đàm phán → Ký HĐ → Thắng / Thua.

Kéo vào **Thắng** khi đủ HĐ + cọc; **Thua** phải chọn lý do.

## 4. Trên phần mềm

1. **CRM → Bảng Deal**.
2. Kanban — kéo thẻ đúng giai đoạn.
3. Tab Tài liệu / Nhiệm vụ khi cần.

## 5. Sai lầm thường gặp

- Kéo Thắng khi chưa thu cọc.
- Không ghi lý do Thua.

## 6. Tóm tắt

Deal quản lý giai đoạn sau chốt mua đến khi thắng/thua.

## 7. Tự kiểm tra

- Bạn áp dụng được điều gì ngay hôm nay?$md_b2000002_0000_0000_0000_000000000008$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&q=80',
  $att_b2000002_0000_0000_0000_000000000008$[]$att_b2000002_0000_0000_0000_000000000008$::jsonb,
  8,
  ARRAY['deal', 'bai-8'],
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
  'b2000002-0000-0000-0000-000000000009',
  'd2000002-0000-0000-0000-000000000001',
  'Bài 9: Tài liệu Deal (HĐ, vẽ, cọc)',
  'Tài liệu Deal (HĐ, vẽ, cọc)',
  $md_b2000002_0000_0000_0000_000000000009$# Bài 9 — Tài liệu Deal (HĐ, vẽ, cọc)

## 1. Tình huống

Lưu đúng loại tài liệu.

## 2. Thuật ngữ

- **Deal** _(cơ hội bán — đã chốt mua)_
- **Pipeline** _(các giai đoạn trên bảng Deal)_
- **Kanban** _(kéo thẻ giữa cột)_

## 3. Nội dung chính

Mỗi công ty có thể cấu hình **pipeline** khác nhau. Khoá dùng **6 giai đoạn mẫu**: Deal mới → Báo giá → Đàm phán → Ký HĐ → Thắng / Thua.

Kéo vào **Thắng** khi đủ HĐ + cọc; **Thua** phải chọn lý do.

## 4. Trên phần mềm

1. **CRM → Bảng Deal**.
2. Kanban — kéo thẻ đúng giai đoạn.
3. Tab Tài liệu / Nhiệm vụ khi cần.

## 5. Sai lầm thường gặp

- Kéo Thắng khi chưa thu cọc.
- Không ghi lý do Thua.

## 6. Tóm tắt

Deal quản lý giai đoạn sau chốt mua đến khi thắng/thua.

## 7. Tự kiểm tra

- Bạn áp dụng được điều gì ngay hôm nay?$md_b2000002_0000_0000_0000_000000000009$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&q=80',
  $att_b2000002_0000_0000_0000_000000000009$[]$att_b2000002_0000_0000_0000_000000000009$::jsonb,
  8,
  ARRAY['deal', 'bai-9'],
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
  'b2000002-0000-0000-0000-000000000010',
  'd2000002-0000-0000-0000-000000000001',
  'Bài 10: KPI Deal và điểm tháng',
  'KPI Deal và điểm tháng',
  $md_b2000002_0000_0000_0000_000000000010$# Bài 10 — KPI Deal và điểm tháng

## 1. Tình huống

Chỉ số doanh số, tỉ lệ thắng, đúng hạn.

## 2. Thuật ngữ

- **Deal** _(cơ hội bán — đã chốt mua)_
- **Pipeline** _(các giai đoạn trên bảng Deal)_
- **Kanban** _(kéo thẻ giữa cột)_

## 3. Nội dung chính

Mỗi công ty có thể cấu hình **pipeline** khác nhau. Khoá dùng **6 giai đoạn mẫu**: Deal mới → Báo giá → Đàm phán → Ký HĐ → Thắng / Thua.

Kéo vào **Thắng** khi đủ HĐ + cọc; **Thua** phải chọn lý do.

## 4. Trên phần mềm

1. **CRM → Bảng Deal**.
2. Kanban — kéo thẻ đúng giai đoạn.
3. Tab Tài liệu / Nhiệm vụ khi cần.

## 5. Sai lầm thường gặp

- Kéo Thắng khi chưa thu cọc.
- Không ghi lý do Thua.

## 6. Tóm tắt

Deal quản lý giai đoạn sau chốt mua đến khi thắng/thua.

## 7. Tự kiểm tra

- Bạn áp dụng được điều gì ngay hôm nay?$md_b2000002_0000_0000_0000_000000000010$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&q=80',
  $att_b2000002_0000_0000_0000_000000000010$[]$att_b2000002_0000_0000_0000_000000000010$::jsonb,
  8,
  ARRAY['deal', 'bai-10'],
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
  'b2000002-0000-0000-0000-000000000011',
  'd2000002-0000-0000-0000-000000000001',
  'Bài 11: Bàn giao thông tin cho xưởng',
  'Bàn giao thông tin cho xưởng',
  $md_b2000002_0000_0000_0000_000000000011$# Bài 11 — Bàn giao thông tin cho xưởng

## 1. Tình huống

Đủ bản vẽ, BOM, lịch giao.

## 2. Thuật ngữ

- **Deal** _(cơ hội bán — đã chốt mua)_
- **Pipeline** _(các giai đoạn trên bảng Deal)_
- **Kanban** _(kéo thẻ giữa cột)_

## 3. Nội dung chính

Mỗi công ty có thể cấu hình **pipeline** khác nhau. Khoá dùng **6 giai đoạn mẫu**: Deal mới → Báo giá → Đàm phán → Ký HĐ → Thắng / Thua.

Kéo vào **Thắng** khi đủ HĐ + cọc; **Thua** phải chọn lý do.

## 4. Trên phần mềm

1. **CRM → Bảng Deal**.
2. Kanban — kéo thẻ đúng giai đoạn.
3. Tab Tài liệu / Nhiệm vụ khi cần.

## 5. Sai lầm thường gặp

- Kéo Thắng khi chưa thu cọc.
- Không ghi lý do Thua.

## 6. Tóm tắt

Deal quản lý giai đoạn sau chốt mua đến khi thắng/thua.

## 7. Tự kiểm tra

- Bạn áp dụng được điều gì ngay hôm nay?$md_b2000002_0000_0000_0000_000000000011$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&q=80',
  $att_b2000002_0000_0000_0000_000000000011$[]$att_b2000002_0000_0000_0000_000000000011$::jsonb,
  8,
  ARRAY['deal', 'bai-11'],
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
  'b2000002-0000-0000-0000-000000000012',
  'd2000002-0000-0000-0000-000000000001',
  'Bài 12: Tình huống đặc biệt trên Deal',
  'Tình huống đặc biệt trên Deal',
  $md_b2000002_0000_0000_0000_000000000012$# Bài 12 — Tình huống đặc biệt trên Deal

## 1. Tình huống

Đổi pipeline, chia Deal, hủy nhầm.

## 2. Thuật ngữ

- **Deal** _(cơ hội bán — đã chốt mua)_
- **Pipeline** _(các giai đoạn trên bảng Deal)_
- **Kanban** _(kéo thẻ giữa cột)_

## 3. Nội dung chính

Mỗi công ty có thể cấu hình **pipeline** khác nhau. Khoá dùng **6 giai đoạn mẫu**: Deal mới → Báo giá → Đàm phán → Ký HĐ → Thắng / Thua.

Kéo vào **Thắng** khi đủ HĐ + cọc; **Thua** phải chọn lý do.

## 4. Trên phần mềm

1. **CRM → Bảng Deal**.
2. Kanban — kéo thẻ đúng giai đoạn.
3. Tab Tài liệu / Nhiệm vụ khi cần.

## 5. Sai lầm thường gặp

- Kéo Thắng khi chưa thu cọc.
- Không ghi lý do Thua.

## 6. Tóm tắt

Deal quản lý giai đoạn sau chốt mua đến khi thắng/thua.

## 7. Tự kiểm tra

- Bạn áp dụng được điều gì ngay hôm nay?$md_b2000002_0000_0000_0000_000000000012$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&q=80',
  $att_b2000002_0000_0000_0000_000000000012$[]$att_b2000002_0000_0000_0000_000000000012$::jsonb,
  8,
  ARRAY['deal', 'bai-12'],
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
  'b2000002-0000-0000-0000-000000000013',
  'd2000002-0000-0000-0000-000000000001',
  'Bài 13: Bài thi tổng kết — Deal',
  'Bài thi tổng kết khoá — đạt yêu cầu để nhận chứng nhận.',
  $md_b2000002_0000_0000_0000_000000000013$# Bài 13: Bài thi tổng kết — Deal

## Mục đích

Kiểm tra tổng hợp kiến thức toàn khoá. Đọc kỹ từng câu; sau khi nộp, xem **giải thích** cho câu sai.

## Quy định

- **25 câu** trắc nghiệm

- Điểm đạt: **80%**

- Thời gian: **30 phút**

- Tối đa **3 lượt**

- **Điều kiện mở:** đạt **toàn bộ bài tập** trong khoá

## Trước khi thi

Ôn lại các bài học bắt buộc và làm lại bài tập chưa đạt.$md_b2000002_0000_0000_0000_000000000013$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&q=80',
  $att_b2000002_0000_0000_0000_000000000013$[]$att_b2000002_0000_0000_0000_000000000013$::jsonb,
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

UPDATE knowledge_lessons SET is_final_exam = true WHERE id = 'b2000002-0000-0000-0000-000000000013';
-- BÀI TẬP
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order
) VALUES (
  'c2000002-0000-0000-0000-000000000001',
  'b2000002-0000-0000-0000-000000000001',
  'Kiểm tra: Deal là gì',
  '8 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000002_0000_0000_0000_000000000001${"items":[{"id":"q1","question":"Câu 1 (Deal bài 1): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q2","question":"Câu 2 (Deal bài 1): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q3","question":"Câu 3 (Deal bài 1): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q4","question":"Câu 4 (Deal bài 1): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q5","question":"Câu 5 (Deal bài 1): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q6","question":"Câu 6 (Deal bài 1): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q7","question":"Câu 7 (Deal bài 1): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q8","question":"Câu 8 (Deal bài 1): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."}]}$j_c2000002_0000_0000_0000_000000000001$::jsonb,
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
  'c2000002-0000-0000-0000-000000000002',
  'b2000002-0000-0000-0000-000000000002',
  'Kiểm tra: Bảng Deal và pipeline 6 giai đoạn (mẫu)',
  '8 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000002_0000_0000_0000_000000000002${"items":[{"id":"q1","question":"Câu 1 (Deal bài 2): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q2","question":"Câu 2 (Deal bài 2): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q3","question":"Câu 3 (Deal bài 2): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q4","question":"Câu 4 (Deal bài 2): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q5","question":"Câu 5 (Deal bài 2): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q6","question":"Câu 6 (Deal bài 2): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q7","question":"Câu 7 (Deal bài 2): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q8","question":"Câu 8 (Deal bài 2): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."}]}$j_c2000002_0000_0000_0000_000000000002$::jsonb,
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
  'c2000002-0000-0000-0000-000000000003',
  'b2000002-0000-0000-0000-000000000003',
  'Kiểm tra: Báo giá chính thức trên Deal',
  '6 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000002_0000_0000_0000_000000000003${"items":[{"id":"q1","question":"Câu 1 (Deal bài 3): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q2","question":"Câu 2 (Deal bài 3): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q3","question":"Câu 3 (Deal bài 3): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q4","question":"Câu 4 (Deal bài 3): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q5","question":"Câu 5 (Deal bài 3): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q6","question":"Câu 6 (Deal bài 3): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."}]}$j_c2000002_0000_0000_0000_000000000003$::jsonb,
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
  'c2000002-0000-0000-0000-000000000004',
  'b2000002-0000-0000-0000-000000000004',
  'Kiểm tra: Đàm phán và điều chỉnh phụ kiện',
  '6 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000002_0000_0000_0000_000000000004${"items":[{"id":"q1","question":"Câu 1 (Deal bài 4): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q2","question":"Câu 2 (Deal bài 4): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q3","question":"Câu 3 (Deal bài 4): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q4","question":"Câu 4 (Deal bài 4): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q5","question":"Câu 5 (Deal bài 4): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q6","question":"Câu 6 (Deal bài 4): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."}]}$j_c2000002_0000_0000_0000_000000000004$::jsonb,
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
  'c2000002-0000-0000-0000-000000000005',
  'b2000002-0000-0000-0000-000000000005',
  'Kiểm tra: Ký hợp đồng và thu cọc',
  '6 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000002_0000_0000_0000_000000000005${"items":[{"id":"q1","question":"Câu 1 (Deal bài 5): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q2","question":"Câu 2 (Deal bài 5): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q3","question":"Câu 3 (Deal bài 5): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q4","question":"Câu 4 (Deal bài 5): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q5","question":"Câu 5 (Deal bài 5): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q6","question":"Câu 6 (Deal bài 5): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."}]}$j_c2000002_0000_0000_0000_000000000005$::jsonb,
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
  'c2000002-0000-0000-0000-000000000006',
  'b2000002-0000-0000-0000-000000000006',
  'Kiểm tra: Kéo Deal Thắng và tạo dự án sản xuất',
  '6 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000002_0000_0000_0000_000000000006${"items":[{"id":"q1","question":"Câu 1 (Deal bài 6): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q2","question":"Câu 2 (Deal bài 6): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q3","question":"Câu 3 (Deal bài 6): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q4","question":"Câu 4 (Deal bài 6): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q5","question":"Câu 5 (Deal bài 6): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q6","question":"Câu 6 (Deal bài 6): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."}]}$j_c2000002_0000_0000_0000_000000000006$::jsonb,
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
  'c2000002-0000-0000-0000-000000000007',
  'b2000002-0000-0000-0000-000000000007',
  'Kiểm tra: Deal Thua — ghi lý do',
  '6 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000002_0000_0000_0000_000000000007${"items":[{"id":"q1","question":"Câu 1 (Deal bài 7): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q2","question":"Câu 2 (Deal bài 7): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q3","question":"Câu 3 (Deal bài 7): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q4","question":"Câu 4 (Deal bài 7): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q5","question":"Câu 5 (Deal bài 7): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q6","question":"Câu 6 (Deal bài 7): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."}]}$j_c2000002_0000_0000_0000_000000000007$::jsonb,
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
  'c2000002-0000-0000-0000-000000000008',
  'b2000002-0000-0000-0000-000000000008',
  'Kiểm tra: Nhiệm vụ và gate trên Deal',
  '6 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000002_0000_0000_0000_000000000008${"items":[{"id":"q1","question":"Câu 1 (Deal bài 8): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q2","question":"Câu 2 (Deal bài 8): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q3","question":"Câu 3 (Deal bài 8): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q4","question":"Câu 4 (Deal bài 8): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q5","question":"Câu 5 (Deal bài 8): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q6","question":"Câu 6 (Deal bài 8): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."}]}$j_c2000002_0000_0000_0000_000000000008$::jsonb,
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
  'c2000002-0000-0000-0000-000000000009',
  'b2000002-0000-0000-0000-000000000009',
  'Kiểm tra: Tài liệu Deal (HĐ, vẽ, cọc)',
  '6 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000002_0000_0000_0000_000000000009${"items":[{"id":"q1","question":"Câu 1 (Deal bài 9): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q2","question":"Câu 2 (Deal bài 9): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q3","question":"Câu 3 (Deal bài 9): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q4","question":"Câu 4 (Deal bài 9): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q5","question":"Câu 5 (Deal bài 9): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q6","question":"Câu 6 (Deal bài 9): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."}]}$j_c2000002_0000_0000_0000_000000000009$::jsonb,
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
  'c2000002-0000-0000-0000-000000000010',
  'b2000002-0000-0000-0000-000000000010',
  'Kiểm tra: KPI Deal và điểm tháng',
  '6 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000002_0000_0000_0000_000000000010${"items":[{"id":"q1","question":"Câu 1 (Deal bài 10): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q2","question":"Câu 2 (Deal bài 10): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q3","question":"Câu 3 (Deal bài 10): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q4","question":"Câu 4 (Deal bài 10): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q5","question":"Câu 5 (Deal bài 10): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q6","question":"Câu 6 (Deal bài 10): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."}]}$j_c2000002_0000_0000_0000_000000000010$::jsonb,
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
  'c2000002-0000-0000-0000-000000000011',
  'b2000002-0000-0000-0000-000000000011',
  'Kiểm tra: Bàn giao thông tin cho xưởng',
  '6 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000002_0000_0000_0000_000000000011${"items":[{"id":"q1","question":"Câu 1 (Deal bài 11): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q2","question":"Câu 2 (Deal bài 11): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q3","question":"Câu 3 (Deal bài 11): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q4","question":"Câu 4 (Deal bài 11): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q5","question":"Câu 5 (Deal bài 11): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q6","question":"Câu 6 (Deal bài 11): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."}]}$j_c2000002_0000_0000_0000_000000000011$::jsonb,
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
  'c2000002-0000-0000-0000-000000000012',
  'b2000002-0000-0000-0000-000000000012',
  'Kiểm tra: Tình huống đặc biệt trên Deal',
  '6 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000002_0000_0000_0000_000000000012${"items":[{"id":"q1","question":"Câu 1 (Deal bài 12): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q2","question":"Câu 2 (Deal bài 12): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q3","question":"Câu 3 (Deal bài 12): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q4","question":"Câu 4 (Deal bài 12): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q5","question":"Câu 5 (Deal bài 12): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."},{"id":"q6","question":"Câu 6 (Deal bài 12): Khẳng định đúng về Deal?","type":"single","options":["Deal = khách đã thống nhất mua, đang hoàn tất HĐ","Deal = khách mới hỏi giá","Deal tự xóa sau 7 ngày","Deal không có pipeline"],"correct":[0],"explanation":"Deal sau Lead, có pipeline và KPI riêng."}]}$j_c2000002_0000_0000_0000_000000000012$::jsonb,
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
  'c2000002-0000-0000-0000-000000000099',
  'b2000002-0000-0000-0000-000000000013',
  'Bài thi tổng kết khoá',
  '25 câu — 30 phút — đạt 80% — tối đa 3 lượt.',
  'quiz',
  $j_c2000002_0000_0000_0000_000000000099${"items":[{"id":"fq1","question":"Câu 1: Điều đúng về Deal?","type":"single","options":["Deal đã thống nhất mua — mục tiêu ký HĐ và thu tiền","Deal = Lead mới","Thua không cần lý do","Thắng không cần cọc"],"correct":[0],"explanation":"Deal quản lý giai đoạn chốt sale."},{"id":"fq2","question":"Câu 2: Điều đúng về Deal?","type":"single","options":["Deal đã thống nhất mua — mục tiêu ký HĐ và thu tiền","Deal = Lead mới","Thua không cần lý do","Thắng không cần cọc"],"correct":[0],"explanation":"Deal quản lý giai đoạn chốt sale."},{"id":"fq3","question":"Câu 3: Điều đúng về Deal?","type":"single","options":["Deal đã thống nhất mua — mục tiêu ký HĐ và thu tiền","Deal = Lead mới","Thua không cần lý do","Thắng không cần cọc"],"correct":[0],"explanation":"Deal quản lý giai đoạn chốt sale."},{"id":"fq4","question":"Câu 4: Điều đúng về Deal?","type":"single","options":["Deal đã thống nhất mua — mục tiêu ký HĐ và thu tiền","Deal = Lead mới","Thua không cần lý do","Thắng không cần cọc"],"correct":[0],"explanation":"Deal quản lý giai đoạn chốt sale."},{"id":"fq5","question":"Câu 5: Điều đúng về Deal?","type":"single","options":["Deal đã thống nhất mua — mục tiêu ký HĐ và thu tiền","Deal = Lead mới","Thua không cần lý do","Thắng không cần cọc"],"correct":[0],"explanation":"Deal quản lý giai đoạn chốt sale."},{"id":"fq6","question":"Câu 6: Điều đúng về Deal?","type":"single","options":["Deal đã thống nhất mua — mục tiêu ký HĐ và thu tiền","Deal = Lead mới","Thua không cần lý do","Thắng không cần cọc"],"correct":[0],"explanation":"Deal quản lý giai đoạn chốt sale."},{"id":"fq7","question":"Câu 7: Điều đúng về Deal?","type":"single","options":["Deal đã thống nhất mua — mục tiêu ký HĐ và thu tiền","Deal = Lead mới","Thua không cần lý do","Thắng không cần cọc"],"correct":[0],"explanation":"Deal quản lý giai đoạn chốt sale."},{"id":"fq8","question":"Câu 8: Điều đúng về Deal?","type":"single","options":["Deal đã thống nhất mua — mục tiêu ký HĐ và thu tiền","Deal = Lead mới","Thua không cần lý do","Thắng không cần cọc"],"correct":[0],"explanation":"Deal quản lý giai đoạn chốt sale."},{"id":"fq9","question":"Câu 9: Điều đúng về Deal?","type":"single","options":["Deal đã thống nhất mua — mục tiêu ký HĐ và thu tiền","Deal = Lead mới","Thua không cần lý do","Thắng không cần cọc"],"correct":[0],"explanation":"Deal quản lý giai đoạn chốt sale."},{"id":"fq10","question":"Câu 10: Điều đúng về Deal?","type":"single","options":["Deal đã thống nhất mua — mục tiêu ký HĐ và thu tiền","Deal = Lead mới","Thua không cần lý do","Thắng không cần cọc"],"correct":[0],"explanation":"Deal quản lý giai đoạn chốt sale."},{"id":"fq11","question":"Câu 11: Điều đúng về Deal?","type":"single","options":["Deal đã thống nhất mua — mục tiêu ký HĐ và thu tiền","Deal = Lead mới","Thua không cần lý do","Thắng không cần cọc"],"correct":[0],"explanation":"Deal quản lý giai đoạn chốt sale."},{"id":"fq12","question":"Câu 12: Điều đúng về Deal?","type":"single","options":["Deal đã thống nhất mua — mục tiêu ký HĐ và thu tiền","Deal = Lead mới","Thua không cần lý do","Thắng không cần cọc"],"correct":[0],"explanation":"Deal quản lý giai đoạn chốt sale."},{"id":"fq13","question":"Câu 13: Điều đúng về Deal?","type":"single","options":["Deal đã thống nhất mua — mục tiêu ký HĐ và thu tiền","Deal = Lead mới","Thua không cần lý do","Thắng không cần cọc"],"correct":[0],"explanation":"Deal quản lý giai đoạn chốt sale."},{"id":"fq14","question":"Câu 14: Điều đúng về Deal?","type":"single","options":["Deal đã thống nhất mua — mục tiêu ký HĐ và thu tiền","Deal = Lead mới","Thua không cần lý do","Thắng không cần cọc"],"correct":[0],"explanation":"Deal quản lý giai đoạn chốt sale."},{"id":"fq15","question":"Câu 15: Điều đúng về Deal?","type":"single","options":["Deal đã thống nhất mua — mục tiêu ký HĐ và thu tiền","Deal = Lead mới","Thua không cần lý do","Thắng không cần cọc"],"correct":[0],"explanation":"Deal quản lý giai đoạn chốt sale."},{"id":"fq16","question":"Câu 16: Điều đúng về Deal?","type":"single","options":["Deal đã thống nhất mua — mục tiêu ký HĐ và thu tiền","Deal = Lead mới","Thua không cần lý do","Thắng không cần cọc"],"correct":[0],"explanation":"Deal quản lý giai đoạn chốt sale."},{"id":"fq17","question":"Câu 17: Điều đúng về Deal?","type":"single","options":["Deal đã thống nhất mua — mục tiêu ký HĐ và thu tiền","Deal = Lead mới","Thua không cần lý do","Thắng không cần cọc"],"correct":[0],"explanation":"Deal quản lý giai đoạn chốt sale."},{"id":"fq18","question":"Câu 18: Điều đúng về Deal?","type":"single","options":["Deal đã thống nhất mua — mục tiêu ký HĐ và thu tiền","Deal = Lead mới","Thua không cần lý do","Thắng không cần cọc"],"correct":[0],"explanation":"Deal quản lý giai đoạn chốt sale."},{"id":"fq19","question":"Câu 19: Điều đúng về Deal?","type":"single","options":["Deal đã thống nhất mua — mục tiêu ký HĐ và thu tiền","Deal = Lead mới","Thua không cần lý do","Thắng không cần cọc"],"correct":[0],"explanation":"Deal quản lý giai đoạn chốt sale."},{"id":"fq20","question":"Câu 20: Điều đúng về Deal?","type":"single","options":["Deal đã thống nhất mua — mục tiêu ký HĐ và thu tiền","Deal = Lead mới","Thua không cần lý do","Thắng không cần cọc"],"correct":[0],"explanation":"Deal quản lý giai đoạn chốt sale."},{"id":"fq21","question":"Câu 21: Điều đúng về Deal?","type":"single","options":["Deal đã thống nhất mua — mục tiêu ký HĐ và thu tiền","Deal = Lead mới","Thua không cần lý do","Thắng không cần cọc"],"correct":[0],"explanation":"Deal quản lý giai đoạn chốt sale."},{"id":"fq22","question":"Câu 22: Điều đúng về Deal?","type":"single","options":["Deal đã thống nhất mua — mục tiêu ký HĐ và thu tiền","Deal = Lead mới","Thua không cần lý do","Thắng không cần cọc"],"correct":[0],"explanation":"Deal quản lý giai đoạn chốt sale."},{"id":"fq23","question":"Câu 23: Điều đúng về Deal?","type":"single","options":["Deal đã thống nhất mua — mục tiêu ký HĐ và thu tiền","Deal = Lead mới","Thua không cần lý do","Thắng không cần cọc"],"correct":[0],"explanation":"Deal quản lý giai đoạn chốt sale."},{"id":"fq24","question":"Câu 24: Điều đúng về Deal?","type":"single","options":["Deal đã thống nhất mua — mục tiêu ký HĐ và thu tiền","Deal = Lead mới","Thua không cần lý do","Thắng không cần cọc"],"correct":[0],"explanation":"Deal quản lý giai đoạn chốt sale."},{"id":"fq25","question":"Câu 25: Điều đúng về Deal?","type":"single","options":["Deal đã thống nhất mua — mục tiêu ký HĐ và thu tiền","Deal = Lead mới","Thua không cần lý do","Thắng không cần cọc"],"correct":[0],"explanation":"Deal quản lý giai đoạn chốt sale."}]}$j_c2000002_0000_0000_0000_000000000099$::jsonb,
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
