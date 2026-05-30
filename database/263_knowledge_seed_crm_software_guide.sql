-- 263
-- Hướng dẫn CRM
-- Seed CRM guide — generated
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
  'd2000003-0000-0000-0000-000000000001',
  'Hướng dẫn CRM — Toàn bộ phần mềm',
  'huong-dan-crm-lead-deal',
  'Hướng dẫn thao tác CRM: đăng nhập, Lead, Deal, Dashboard, Sự kiện, Chat, Mobile. Dành cho nhân viên mới — làm được ngay trên hệ thống.',
  '🖥️',
  5,
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, icon = EXCLUDED.icon, is_active = true;

UPDATE knowledge_categories SET
  deadline_mode = 'relative',
  deadline_duration_days = 21,
  deadline_note = 'Hoàn thành hướng dẫn CRM trong 21 ngày',
  require_all_exercises_passed = true
WHERE id = 'd2000003-0000-0000-0000-000000000001';

-- BÀI HỌC
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  video_url, video_type, cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000003-0000-0000-0000-00000000000a',
  'd2000003-0000-0000-0000-000000000001',
  'HD 0A: Đăng nhập và làm quen giao diện',
  'Đăng nhập, sidebar, App Switcher, ghim module hay dùng.',
  $md_b2000003_0000_0000_0000_00000000000a$# HD 0A — Đăng nhập và giao diện

## 1. Tình huống

Bạn là nhân viên kinh doanh mới — buổi đầu cần đăng nhập CRM và biết đường vào **Bảng Lead**, **Bảng Deal**.

## 2. Thuật ngữ

- **Sidebar** _(thanh menu bên trái)_: chứa toàn bộ chức năng.

- **App Switcher** _(biểu tượng lưới góc trên)_: chuyển nhanh giữa Công việc, CRM, Xưởng, Kiến thức.

## 3. Ba vùng màn hình

| Vùng | Việc bạn làm |

|---|---|

| Sidebar | Chọn menu CRM, Cài đặt |

| Thanh trên | Tìm kiếm, thông báo, tài khoản |

| Nội dung giữa | Bảng Lead, chi tiết khách… |

## 4. Trên phần mềm — bạn cần làm gì

1. Mở trình duyệt → nhập địa chỉ công ty → **Đăng nhập** (email + mật khẩu).

2. Bấm **App Switcher** → chọn **CRM**.

3. Bấm **Pin** trên module CRM để lần sau vào thẳng CRM.

4. Mở **CRM → Bảng Lead** để xác nhận thấy cột Kanban.

## 5. Sai lầm thường gặp

- Đăng nhập sai tài khoản cá nhân (dùng chung máy).

- Không biết App Switcher nên tưởng “mất menu”.

## 6. Tóm tắt 30 giây

Đăng nhập → App Switcher → CRM → ghim module → vào Bảng Lead.

## 7. Tự kiểm tra

- App Switcher dùng để làm gì?

- Ghim module giúp gì khi đăng nhập lần sau?$md_b2000003_0000_0000_0000_00000000000a$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80',
  '[]'::jsonb,
  6,
  ARRAY['huong-dan', 'onboarding'],
  true,
  0,
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
  'b2000003-0000-0000-0000-00000000000b',
  'd2000003-0000-0000-0000-000000000001',
  'HD 0B: Bảo mật tài khoản',
  'Đổi mật khẩu, quy tắc mật khẩu mạnh, đăng xuất thiết bị lạ.',
  $md_b2000003_0000_0000_0000_00000000000b$# HD 0B — Bảo mật tài khoản

## 1. Tình huống

Tài khoản CRM chứa số điện thoại khách hàng — nếu lộ mật khẩu, đồng nghiệp hoặc người lạ có thể xem Lead của bạn.

## 2. Quy tắc mật khẩu

- Tối thiểu **8 ký tự**, có chữ hoa, chữ thường, số.

- **Không** chia sẻ qua Zalo/chat.

- Đổi định kỳ **3 tháng** hoặc khi nghi ngờ lộ.

## 3. Trên phần mềm

1. **Cài đặt → Đổi mật khẩu** → nhập mật khẩu cũ + mới → **Lưu**.

2. **Cài đặt → Thiết bị đăng nhập** → xem danh sách → **Đăng xuất** thiết bị lạ.

## 4. Sai lầm thường gặp

- Ghi mật khẩu trên giấy dán màn hình.

- Dùng chung tài khoản cho cả team.

## 5. Tóm tắt

Mật khẩu riêng, đổi định kỳ, kiểm tra thiết bị đăng nhập.

## 6. Tự kiểm tra

- Khi nào cần đổi mật khẩu ngay?$md_b2000003_0000_0000_0000_00000000000b$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80',
  '[]'::jsonb,
  5,
  ARRAY['huong-dan', 'bao-mat'],
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
  'b2000003-0000-0000-0000-000000000001',
  'd2000003-0000-0000-0000-000000000001',
  'HD 1: Truy cập Bảng Lead',
  'Menu CRM → Bảng Lead, Kanban, lọc, tìm kiếm.',
  $md_b2000003_0000_0000_0000_000000000001$# HD 1 — Bảng Lead

## 1. Tình huống

Sáng vào ca, bạn cần xem khách mới từ fanpage đêm qua — mở **Bảng Lead**.

## 2. Thuật ngữ

- **Lead** _(khách tiềm năng, chưa chốt mua)_

- **Kanban** _(bảng kéo thả theo cột giai đoạn)_

## 3. Đường dẫn

**Menu trái → CRM → Bảng Lead** (hoặc Dashboard CRM → ô Lead → Xem tất cả).

## 4. Thao tác

1. Bật tab **Kanban**.

2. Bộ lọc **Lead của tôi**.

3. Click thẻ → mở chi tiết.

4. Kéo thẻ sang cột khác khi đủ điều kiện.

## 5. Lưu ý

- Badge đỏ = sắp/quá hạn **SLA** _(hạn xử lý cam kết)_.

## 6. Tóm tắt

Bảng Lead = nơi quản lý mọi khách đang tư vấn.$md_b2000003_0000_0000_0000_000000000001$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80',
  '[]'::jsonb,
  8,
  ARRAY['huong-dan', 'lead'],
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
  'b2000003-0000-0000-0000-000000000002',
  'd2000003-0000-0000-0000-000000000001',
  'HD 2: Tạo Lead mới và Quét trùng',
  'Nút + Lead mới, form bắt buộc, Quét trùng SĐT.',
  $md_b2000003_0000_0000_0000_000000000002$# HD 2 — Tạo Lead & Quét trùng

## 1. Tình huống

Chị Hoa nhắn Zalo hỏi tủ bếp — bạn tạo Lead mới nhưng **phải quét trùng SĐT** trước.

## 2. Thao tác

1. **Bảng Lead → + Lead mới**.

2. Nhập **Tiêu đề** (vd: Chị Hoa Q5 — Tủ bếp 3.6m chữ L).

3. Chọn hoặc **+ Tạo nhanh** Khách hàng, nhập **SĐT**.

4. Bấm **Quét trùng** — nếu trùng → mở Lead cũ, **không** tạo mới.

5. Điền Nguồn, Loại sản phẩm → **Lưu**.

## 3. Lưu ý

- Trùng SĐT mà tạo mới → trừ KPI, khó quản lý.

## 4. Tóm tắt

Quét trùng trước Lưu; tiêu đề rõ ràng; đủ SĐT.$md_b2000003_0000_0000_0000_000000000002$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80',
  '[]'::jsonb,
  8,
  ARRAY['huong-dan', 'lead', 'tao-moi'],
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
  'b2000003-0000-0000-0000-000000000003',
  'd2000003-0000-0000-0000-000000000001',
  'HD 3: Kanban Lead — Kéo thẻ và tìm kiếm',
  'Kéo đổi giai đoạn, tìm nhanh, tab Deadline.',
  $md_b2000003_0000_0000_0000_000000000003$# HD 3 — Kanban Lead

## 1. Tình huống

Cần chuyển Lead "Chị Hoa" sang **Đã liên hệ** sau cuộc gọi.

## 2. Thao tác

1. Giữ chuột → kéo sang cột đích.
2. Nếu bị chặn — đọc thông báo (nhiệm vụ chưa xong).
3. Ô **Tìm kiếm**: tên, SĐT, mã Lead.

## 3. Tóm tắt

Kéo thẻ = đổi giai đoạn có điều kiện.$md_b2000003_0000_0000_0000_000000000003$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80',
  $att_b2000003_0000_0000_0000_000000000003$[]$att_b2000003_0000_0000_0000_000000000003$::jsonb,
  8,
  ARRAY['huong-dan', 'lead', 'kanban'],
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
  'b2000003-0000-0000-0000-000000000004',
  'd2000003-0000-0000-0000-000000000001',
  'HD 4: Chi tiết Lead — Các tab',
  'Tổng quan, Nhiệm vụ, Hoạt động, Tài liệu.',
  $md_b2000003_0000_0000_0000_000000000004$# HD 4 — Chi tiết Lead

## Tab chính

- **Tổng quan**: 6 thông tin bắt buộc, phụ trách.
- **Nhiệm vụ**: task CRM.
- **Hoạt động**: timeline gọi/gặp.
- **Tài liệu**: PDF, ảnh.

## Nút header

**Chuyển Deal**, **Sửa**, **Mất/Mở lại** (tùy quyền).$md_b2000003_0000_0000_0000_000000000004$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80',
  $att_b2000003_0000_0000_0000_000000000004$[]$att_b2000003_0000_0000_0000_000000000004$::jsonb,
  8,
  ARRAY['huong-dan', 'lead'],
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
  'b2000003-0000-0000-0000-000000000005',
  'd2000003-0000-0000-0000-000000000001',
  'HD 5: Nhiệm vụ Lead trên phần mềm',
  'Tạo, hoàn thành, ghi chú + file',
  $md_b2000003_0000_0000_0000_000000000005$# HD 5: Nhiệm vụ Lead trên phần mềm

## 1. Tình huống

Bạn cần thao tác: Tạo, hoàn thành, ghi chú + file.

## 2. Trên phần mềm

1. Mở đúng menu CRM.
2. Làm theo thứ tự trong bài.
3. Kiểm tra lịch sử đã lưu.

## 3. Tóm tắt

Thao tác trên app — không thay thế khoá nghiệp vụ Lead/Deal.$md_b2000003_0000_0000_0000_000000000005$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80',
  $att_b2000003_0000_0000_0000_000000000005$[]$att_b2000003_0000_0000_0000_000000000005$::jsonb,
  8,
  ARRAY['huong-dan'],
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
  'b2000003-0000-0000-0000-000000000006',
  'd2000003-0000-0000-0000-000000000001',
  'HD 6: Hoạt động và ghi chú Lead',
  '+ Hoạt động, timeline',
  $md_b2000003_0000_0000_0000_000000000006$# HD 6: Hoạt động và ghi chú Lead

## 1. Tình huống

Bạn cần thao tác: + Hoạt động, timeline.

## 2. Trên phần mềm

1. Mở đúng menu CRM.
2. Làm theo thứ tự trong bài.
3. Kiểm tra lịch sử đã lưu.

## 3. Tóm tắt

Thao tác trên app — không thay thế khoá nghiệp vụ Lead/Deal.$md_b2000003_0000_0000_0000_000000000006$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80',
  $att_b2000003_0000_0000_0000_000000000006$[]$att_b2000003_0000_0000_0000_000000000006$::jsonb,
  8,
  ARRAY['huong-dan'],
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
  'b2000003-0000-0000-0000-000000000007',
  'd2000003-0000-0000-0000-000000000001',
  'HD 7: Tài liệu Lead — Upload',
  'Loại tài liệu, tên file chuẩn',
  $md_b2000003_0000_0000_0000_000000000007$# HD 7: Tài liệu Lead — Upload

## 1. Tình huống

Bạn cần thao tác: Loại tài liệu, tên file chuẩn.

## 2. Trên phần mềm

1. Mở đúng menu CRM.
2. Làm theo thứ tự trong bài.
3. Kiểm tra lịch sử đã lưu.

## 3. Tóm tắt

Thao tác trên app — không thay thế khoá nghiệp vụ Lead/Deal.$md_b2000003_0000_0000_0000_000000000007$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80',
  $att_b2000003_0000_0000_0000_000000000007$[]$att_b2000003_0000_0000_0000_000000000007$::jsonb,
  8,
  ARRAY['huong-dan'],
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
  'b2000003-0000-0000-0000-000000000008',
  'd2000003-0000-0000-0000-000000000001',
  'HD 8: Chuyển Lead → Deal (popup)',
  'Popup pipeline Deal',
  $md_b2000003_0000_0000_0000_000000000008$# HD 8: Chuyển Lead → Deal (popup)

## 1. Tình huống

Bạn cần thao tác: Popup pipeline Deal.

## 2. Trên phần mềm

1. Mở đúng menu CRM.
2. Làm theo thứ tự trong bài.
3. Kiểm tra lịch sử đã lưu.

## 3. Tóm tắt

Thao tác trên app — không thay thế khoá nghiệp vụ Lead/Deal.$md_b2000003_0000_0000_0000_000000000008$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80',
  $att_b2000003_0000_0000_0000_000000000008$[]$att_b2000003_0000_0000_0000_000000000008$::jsonb,
  8,
  ARRAY['huong-dan'],
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
  'b2000003-0000-0000-0000-000000000009',
  'd2000003-0000-0000-0000-000000000001',
  'HD 9: Bảng Deal và Kanban',
  'CRM → Bảng Deal',
  $md_b2000003_0000_0000_0000_000000000009$# HD 9: Bảng Deal và Kanban

## 1. Tình huống

Bạn cần thao tác: CRM → Bảng Deal.

## 2. Trên phần mềm

1. Mở đúng menu CRM.
2. Làm theo thứ tự trong bài.
3. Kiểm tra lịch sử đã lưu.

## 3. Tóm tắt

Thao tác trên app — không thay thế khoá nghiệp vụ Lead/Deal.$md_b2000003_0000_0000_0000_000000000009$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80',
  $att_b2000003_0000_0000_0000_000000000009$[]$att_b2000003_0000_0000_0000_000000000009$::jsonb,
  8,
  ARRAY['huong-dan'],
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
  'b2000003-0000-0000-0000-000000000010',
  'd2000003-0000-0000-0000-000000000001',
  'HD 10: Chi tiết Deal — Tab',
  'Báo giá, HĐ, Thắng/Thua',
  $md_b2000003_0000_0000_0000_000000000010$# HD 10: Chi tiết Deal — Tab

## 1. Tình huống

Bạn cần thao tác: Báo giá, HĐ, Thắng/Thua.

## 2. Trên phần mềm

1. Mở đúng menu CRM.
2. Làm theo thứ tự trong bài.
3. Kiểm tra lịch sử đã lưu.

## 3. Tóm tắt

Thao tác trên app — không thay thế khoá nghiệp vụ Lead/Deal.$md_b2000003_0000_0000_0000_000000000010$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80',
  $att_b2000003_0000_0000_0000_000000000010$[]$att_b2000003_0000_0000_0000_000000000010$::jsonb,
  8,
  ARRAY['huong-dan'],
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
  'b2000003-0000-0000-0000-000000000011',
  'd2000003-0000-0000-0000-000000000001',
  'HD 11: Kéo Deal Thắng / Thua',
  'Lý do thua, tạo dự án',
  $md_b2000003_0000_0000_0000_000000000011$# HD 11: Kéo Deal Thắng / Thua

## 1. Tình huống

Bạn cần thao tác: Lý do thua, tạo dự án.

## 2. Trên phần mềm

1. Mở đúng menu CRM.
2. Làm theo thứ tự trong bài.
3. Kiểm tra lịch sử đã lưu.

## 3. Tóm tắt

Thao tác trên app — không thay thế khoá nghiệp vụ Lead/Deal.$md_b2000003_0000_0000_0000_000000000011$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80',
  $att_b2000003_0000_0000_0000_000000000011$[]$att_b2000003_0000_0000_0000_000000000011$::jsonb,
  8,
  ARRAY['huong-dan'],
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
  'b2000003-0000-0000-0000-000000000012',
  'd2000003-0000-0000-0000-000000000001',
  'HD 12: Ôn tập Lead & Deal trên app',
  'Lộ trình thao tác',
  $md_b2000003_0000_0000_0000_000000000012$# HD 12: Ôn tập Lead & Deal trên app

## 1. Tình huống

Bạn cần thao tác: Lộ trình thao tác.

## 2. Trên phần mềm

1. Mở đúng menu CRM.
2. Làm theo thứ tự trong bài.
3. Kiểm tra lịch sử đã lưu.

## 3. Tóm tắt

Thao tác trên app — không thay thế khoá nghiệp vụ Lead/Deal.$md_b2000003_0000_0000_0000_000000000012$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80',
  $att_b2000003_0000_0000_0000_000000000012$[]$att_b2000003_0000_0000_0000_000000000012$::jsonb,
  8,
  ARRAY['huong-dan'],
  true,
  13,
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
  'b2000003-0000-0000-0000-000000000013',
  'd2000003-0000-0000-0000-000000000001',
  'HD 13: Dashboard CRM',
  'Tab Lead/Deal, KPI, lọc',
  $md_b2000003_0000_0000_0000_000000000013$# HD 13: Dashboard CRM

## 1. Tình huống

Bạn cần thao tác: Tab Lead/Deal, KPI, lọc.

## 2. Trên phần mềm

1. Mở đúng menu CRM.
2. Làm theo thứ tự trong bài.
3. Kiểm tra lịch sử đã lưu.

## 3. Tóm tắt

Thao tác trên app — không thay thế khoá nghiệp vụ Lead/Deal.$md_b2000003_0000_0000_0000_000000000013$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80',
  $att_b2000003_0000_0000_0000_000000000013$[]$att_b2000003_0000_0000_0000_000000000013$::jsonb,
  8,
  ARRAY['huong-dan'],
  true,
  14,
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
  'b2000003-0000-0000-0000-000000000014',
  'd2000003-0000-0000-0000-000000000001',
  'HD 14: Sự kiện nội bộ',
  'Lịch, RSVP',
  $md_b2000003_0000_0000_0000_000000000014$# HD 14: Sự kiện nội bộ

## 1. Tình huống

Bạn cần thao tác: Lịch, RSVP.

## 2. Trên phần mềm

1. Mở đúng menu CRM.
2. Làm theo thứ tự trong bài.
3. Kiểm tra lịch sử đã lưu.

## 3. Tóm tắt

Thao tác trên app — không thay thế khoá nghiệp vụ Lead/Deal.$md_b2000003_0000_0000_0000_000000000014$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80',
  $att_b2000003_0000_0000_0000_000000000014$[]$att_b2000003_0000_0000_0000_000000000014$::jsonb,
  8,
  ARRAY['huong-dan'],
  true,
  15,
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
  'b2000003-0000-0000-0000-000000000015',
  'd2000003-0000-0000-0000-000000000001',
  'HD 15: Nhóm chat CRM',
  'Chat theo Lead/Deal',
  $md_b2000003_0000_0000_0000_000000000015$# HD 15: Nhóm chat CRM

## 1. Tình huống

Bạn cần thao tác: Chat theo Lead/Deal.

## 2. Trên phần mềm

1. Mở đúng menu CRM.
2. Làm theo thứ tự trong bài.
3. Kiểm tra lịch sử đã lưu.

## 3. Tóm tắt

Thao tác trên app — không thay thế khoá nghiệp vụ Lead/Deal.$md_b2000003_0000_0000_0000_000000000015$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80',
  $att_b2000003_0000_0000_0000_000000000015$[]$att_b2000003_0000_0000_0000_000000000015$::jsonb,
  8,
  ARRAY['huong-dan'],
  true,
  16,
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
  'b2000003-0000-0000-0000-000000000016',
  'd2000003-0000-0000-0000-000000000001',
  'HD 16: Đang hoạt động / Online',
  'Ai đang xử lý KH',
  $md_b2000003_0000_0000_0000_000000000016$# HD 16: Đang hoạt động / Online

## 1. Tình huống

Bạn cần thao tác: Ai đang xử lý KH.

## 2. Trên phần mềm

1. Mở đúng menu CRM.
2. Làm theo thứ tự trong bài.
3. Kiểm tra lịch sử đã lưu.

## 3. Tóm tắt

Thao tác trên app — không thay thế khoá nghiệp vụ Lead/Deal.$md_b2000003_0000_0000_0000_000000000016$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80',
  $att_b2000003_0000_0000_0000_000000000016$[]$att_b2000003_0000_0000_0000_000000000016$::jsonb,
  8,
  ARRAY['huong-dan'],
  true,
  17,
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
  'b2000003-0000-0000-0000-000000000017',
  'd2000003-0000-0000-0000-000000000001',
  'HD 17: Bảng tin CRM',
  'Feed hoạt động',
  $md_b2000003_0000_0000_0000_000000000017$# HD 17: Bảng tin CRM

## 1. Tình huống

Bạn cần thao tác: Feed hoạt động.

## 2. Trên phần mềm

1. Mở đúng menu CRM.
2. Làm theo thứ tự trong bài.
3. Kiểm tra lịch sử đã lưu.

## 3. Tóm tắt

Thao tác trên app — không thay thế khoá nghiệp vụ Lead/Deal.$md_b2000003_0000_0000_0000_000000000017$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80',
  $att_b2000003_0000_0000_0000_000000000017$[]$att_b2000003_0000_0000_0000_000000000017$::jsonb,
  8,
  ARRAY['huong-dan'],
  true,
  18,
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
  'b2000003-0000-0000-0000-000000000018',
  'd2000003-0000-0000-0000-000000000001',
  'HD 18: Ghi âm / Voice (nếu bật)',
  'Ghi âm gắn Lead',
  $md_b2000003_0000_0000_0000_000000000018$# HD 18: Ghi âm / Voice (nếu bật)

## 1. Tình huống

Bạn cần thao tác: Ghi âm gắn Lead.

## 2. Trên phần mềm

1. Mở đúng menu CRM.
2. Làm theo thứ tự trong bài.
3. Kiểm tra lịch sử đã lưu.

## 3. Tóm tắt

Thao tác trên app — không thay thế khoá nghiệp vụ Lead/Deal.$md_b2000003_0000_0000_0000_000000000018$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80',
  $att_b2000003_0000_0000_0000_000000000018$[]$att_b2000003_0000_0000_0000_000000000018$::jsonb,
  8,
  ARRAY['huong-dan'],
  true,
  19,
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
  'b2000003-0000-0000-0000-000000000019',
  'd2000003-0000-0000-0000-000000000001',
  'HD 19: CRM Mobile — Thao tác cơ bản',
  'App di động',
  $md_b2000003_0000_0000_0000_000000000019$# HD 19: CRM Mobile — Thao tác cơ bản

## 1. Tình huống

Bạn cần thao tác: App di động.

## 2. Trên phần mềm

1. Mở đúng menu CRM.
2. Làm theo thứ tự trong bài.
3. Kiểm tra lịch sử đã lưu.

## 3. Tóm tắt

Thao tác trên app — không thay thế khoá nghiệp vụ Lead/Deal.$md_b2000003_0000_0000_0000_000000000019$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80',
  $att_b2000003_0000_0000_0000_000000000019$[]$att_b2000003_0000_0000_0000_000000000019$::jsonb,
  8,
  ARRAY['huong-dan'],
  true,
  20,
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
  'b2000003-0000-0000-0000-000000000022',
  'd2000003-0000-0000-0000-000000000001',
  'HD 20: Bài thi tổng kết — Thao tác CRM',
  'Bài thi tổng kết khoá — đạt yêu cầu để nhận chứng nhận.',
  $md_b2000003_0000_0000_0000_000000000022$# HD 20: Bài thi tổng kết — Thao tác CRM

## Mục đích

Kiểm tra tổng hợp kiến thức toàn khoá. Đọc kỹ từng câu; sau khi nộp, xem **giải thích** cho câu sai.

## Quy định

- **25 câu** trắc nghiệm

- Điểm đạt: **80%**

- Thời gian: **30 phút**

- Tối đa **3 lượt**

- **Điều kiện mở:** đạt **toàn bộ bài tập** trong khoá

## Trước khi thi

Ôn lại các bài học bắt buộc và làm lại bài tập chưa đạt.$md_b2000003_0000_0000_0000_000000000022$,
  NULL,
  NULL,
  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80',
  $att_b2000003_0000_0000_0000_000000000022$[]$att_b2000003_0000_0000_0000_000000000022$::jsonb,
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

UPDATE knowledge_lessons SET is_final_exam = true WHERE id = 'b2000003-0000-0000-0000-000000000022';
-- BÀI TẬP
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order
) VALUES (
  'c2000003-0000-0000-0000-00000000000a',
  'b2000003-0000-0000-0000-00000000000a',
  'Kiểm tra: Giao diện',
  '5 câu trắc nghiệm — đọc kỹ đáp án sau khi nộp.',
  'quiz',
  $j_c2000003_0000_0000_0000_00000000000a${"items":[{"id":"q1","question":"App Switcher dùng để làm gì?","type":"single","options":["Đăng xuất","Chuyển nhanh giữa các module (CRM, Công việc…)","Gửi email","In báo giá"],"correct":[1],"explanation":"App Switcher là lối tắt giữa các phần mềm con trong hệ thống."},{"id":"q2","question":"Nút Pin trên module có tác dụng gì?","type":"single","options":["Xóa module","Ghim để lần sau đăng nhập vào thẳng module đó","Khóa màn hình","Đổi mật khẩu"],"correct":[1],"explanation":"Ghim giúp tiết kiệm thao tác mỗi ngày."},{"id":"q3","question":"Sidebar nằm ở đâu?","type":"single","options":["Giữa màn hình","Bên trái","Bên phải","Dưới cùng"],"correct":[1],"explanation":"Sidebar là menu chính bên trái."},{"id":"q4","question":"Muốn vào CRM lần đầu sau đăng nhập, bước hợp lý nhất?","type":"single","options":["Vào Cài đặt trước","App Switcher → chọn CRM","Tắt trình duyệt","Chỉ dùng điện thoại"],"correct":[1],"explanation":"CRM là module riêng, mở qua App Switcher."},{"id":"q5","question":"Khu vực nội dung giữa màn hình hiển thị gì?","type":"single","options":["Chỉ logo","Trang đang chọn (vd Bảng Lead)","Chỉ chat","Chỉ KPI"],"correct":[1],"explanation":"Nội dung thay đổi theo menu bạn chọn."}]}$j_c2000003_0000_0000_0000_00000000000a$::jsonb,
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
  'c2000003-0000-0000-0000-00000000000b',
  'b2000003-0000-0000-0000-00000000000b',
  'Kiểm tra: Bảo mật',
  '5 câu trắc nghiệm — đọc kỹ đáp án sau khi nộp.',
  'quiz',
  $j_c2000003_0000_0000_0000_00000000000b${"items":[{"id":"q1","question":"Mật khẩu mạnh tối thiểu bao nhiêu ký tự?","type":"single","options":["4","6","8","12"],"correct":[2],"explanation":"Quy định công ty: tối thiểu 8 ký tự."},{"id":"q2","question":"Thấy thiết bị lạ trong danh sách đăng nhập, nên làm gì?","type":"single","options":["Bỏ qua","Đăng xuất thiết bị đó và đổi mật khẩu","Gửi mật khẩu cho IT","Tạo Lead mới"],"correct":[1],"explanation":"Ngắt phiên lạ và đổi mật khẩu để bảo vệ dữ liệu."},{"id":"q3","question":"Có nên chia sẻ mật khẩu CRM qua Zalo không?","type":"single","options":["Có, tiện","Không, vi phạm bảo mật","Chỉ chia cho sếp","Chỉ cuối tuần"],"correct":[1],"explanation":"Mật khẩu là thông tin cá nhân, không chia sẻ."},{"id":"q4","question":"Đường dẫn đổi mật khẩu?","type":"single","options":["CRM → Bảng Lead","Cài đặt → Đổi mật khẩu","Báo giá → PDF","Dashboard → Kanban"],"correct":[1],"explanation":"Đổi mật khẩu nằm trong Cài đặt tài khoản."},{"id":"q5","question":"Tài khoản CRM chứa dữ liệu gì nhạy cảm?","type":"single","options":["Chỉ logo","SĐT và lịch sử khách hàng","Chỉ ảnh sản phẩm","Chỉ video"],"correct":[1],"explanation":"Lead/Deal gắn thông tin liên hệ khách."}]}$j_c2000003_0000_0000_0000_00000000000b$::jsonb,
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
  'c2000003-0000-0000-0000-000000000001',
  'b2000003-0000-0000-0000-000000000001',
  'Kiểm tra: Bảng Lead',
  '6 câu trắc nghiệm — đọc kỹ đáp án sau khi nộp.',
  'quiz',
  $j_c2000003_0000_0000_0000_000000000001${"items":[{"id":"q1","question":"Đường dẫn vào Bảng Lead?","type":"single","options":["Công việc → Dự án","CRM → Bảng Lead","Kiến thức → Thư viện","Cài đặt → Nhân viên"],"correct":[1],"explanation":"Lead nằm trong module CRM."},{"id":"q2","question":"Mỗi thẻ trên Kanban đại diện cho?","type":"single","options":["Một nhân viên","Một Lead","Một báo cáo tháng","Một file PDF"],"correct":[1],"explanation":"Một thẻ = một cơ hội Lead."},{"id":"q3","question":"Chế độ xem nào kéo thả giữa các cột?","type":"single","options":["Danh sách","Kanban","Lịch","PDF"],"correct":[1],"explanation":"Kanban hỗ trợ kéo đổi giai đoạn."},{"id":"q4","question":"Bộ lọc \"Lead của tôi\" giúp gì?","type":"single","options":["Ẩn hết Lead","Chỉ xem Lead bạn phụ trách","Xóa Lead","In hợp đồng"],"correct":[1],"explanation":"Lọc theo người phụ trách chính."},{"id":"q5","question":"Click thẻ Lead sẽ?","type":"single","options":["Xóa Lead","Mở chi tiết Lead","Gửi email tự động","Tạo nhân viên mới"],"correct":[1],"explanation":"Click để xem và cập nhật."},{"id":"q6","question":"Badge SLA màu đỏ thường báo hiệu?","type":"single","options":["Đã ký HĐ","Sắp hoặc quá hạn xử lý","Khách VIP","Đã xóa"],"correct":[1],"explanation":"SLA = cam kết thời gian phản hồi/xử lý."}]}$j_c2000003_0000_0000_0000_000000000001$::jsonb,
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
  'c2000003-0000-0000-0000-000000000002',
  'b2000003-0000-0000-0000-000000000002',
  'Kiểm tra: Tạo Lead',
  '6 câu trắc nghiệm — đọc kỹ đáp án sau khi nộp.',
  'quiz',
  $j_c2000003_0000_0000_0000_000000000002${"items":[{"id":"q1","question":"Trước khi Lưu Lead mới, bước bắt buộc?","type":"single","options":["In PDF","Quét trùng SĐT","Ký hợp đồng","Bàn giao xưởng"],"correct":[1],"explanation":"Quét trùng tránh nhân đôi khách."},{"id":"q2","question":"Nếu Quét trùng có kết quả?","type":"single","options":["Tạo Lead mới luôn","Mở Lead cũ và cập nhật ghi chú","Xóa SĐT","Đổi tên công ty"],"correct":[1],"explanation":"Một SĐT nên một luồng chăm sóc."},{"id":"q3","question":"Trường tối thiểu khi tạo Lead?","type":"single","options":["Mã số thuế","Tiêu đề + Khách hàng","Ảnh 3D","Hợp đồng"],"correct":[1],"explanation":"Hệ thống yêu cầu tiêu đề và liên kết khách."},{"id":"q4","question":"Nút tạo Lead mới thường ở đâu?","type":"single","options":["Góc dưới trái","Thanh trên Bảng Lead (+ Lead mới)","Trong Cài đặt","Trong Báo cáo SX"],"correct":[1],"explanation":"Nút + ở thanh công cụ Bảng Lead."},{"id":"q5","question":"Tiêu đề Lead nên?","type":"single","options":["Để trống","Mô tả tên KH + khu vực + sản phẩm","Chỉ số 1","Chỉ ngày tháng"],"correct":[1],"explanation":"Tiêu đề giúp đồng nghiệp nhận diện nhanh."},{"id":"q6","question":"Sau Lưu, Lead mới thường nằm cột?","type":"single","options":["Thắng","Mới (cột đầu pipeline)","Đã xóa","Không hiện"],"correct":[1],"explanation":"Lead mới vào giai đoạn đầu."}]}$j_c2000003_0000_0000_0000_000000000002$::jsonb,
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
  'c2000003-0000-0000-0000-000000000003',
  'b2000003-0000-0000-0000-000000000003',
  'Kiểm tra: Kanban Lead — Kéo thẻ và tìm kiếm',
  '6 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000003_0000_0000_0000_000000000003${"items":[{"id":"q1","question":"Kéo thẻ Lead để?","type":"single","options":["Xóa","Đổi giai đoạn pipeline","In lương","Tạo NV"],"correct":[1],"explanation":"Kanban = quản lý giai đoạn."},{"id":"q2","question":"Tìm Lead theo?","type":"single","options":["Chỉ màu","Tên, SĐT, mã","Chỉ email công ty","Không tìm được"],"correct":[1],"explanation":"Ô tìm trên thanh công cụ."},{"id":"q3","question":"Tab Deadline giúp?","type":"single","options":["Xóa Lead","Nhóm theo hạn xử lý","Tạo HĐ","Chat"],"correct":[1],"explanation":"Ưu tiên trễ SLA."},{"id":"q4","question":"Bị chặn khi kéo thường do?","type":"single","options":["Nhiệm vụ bắt buộc","Trời mưa","Đã thắng","VIP"],"correct":[0],"explanation":"Gate nhiệm vụ."},{"id":"q5","question":"Sau kéo cột nên?","type":"single","options":["Im lặng","Ghi hoạt động nếu chưa có","Xóa SĐT","Đổi công ty"],"correct":[1],"explanation":"Lịch sử phải khớp."},{"id":"q6","question":"Badge đỏ trên thẻ?","type":"single","options":["Quá hạn SLA","Đã cọc","Đã SX","Nghỉ phép"],"correct":[0],"explanation":"Cần xử lý gấp."}]}$j_c2000003_0000_0000_0000_000000000003$::jsonb,
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
  'c2000003-0000-0000-0000-000000000004',
  'b2000003-0000-0000-0000-000000000004',
  'Kiểm tra: Chi tiết Lead — Các tab',
  '6 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000003_0000_0000_0000_000000000004${"items":[{"id":"q1","question":"Ghi chú cuộc gọi nên ở?","type":"single","options":["Tài liệu","Hoạt động / Nhiệm vụ","Blocklist","Xóa"],"correct":[1],"explanation":"Phân loại đúng kênh."},{"id":"q2","question":"HĐ PDF ký lưu ở?","type":"single","options":["Chat","Tài liệu","Không lưu","Email riêng"],"correct":[1],"explanation":"Tập trung hồ sơ."},{"id":"q3","question":"Tab Nhiệm vụ dùng để?","type":"single","options":["Tính lương","Tạo và hoàn thành việc cần làm","Xóa Lead","Đổi pass"],"correct":[1],"explanation":"Task gắn Lead."},{"id":"q4","question":"Chuyển Deal ở đâu?","type":"single","options":["Footer","Nút header chi tiết Lead","Cài đặt","Báo cáo"],"correct":[1],"explanation":"Khi đủ điều kiện."},{"id":"q5","question":"Tổng quan hiển thị?","type":"single","options":["6 thông tin bắt buộc + phụ trách","Chỉ logo","Chỉ KPI năm","Chỉ chat"],"correct":[0],"explanation":"Kiểm tra nhanh hồ sơ."},{"id":"q6","question":"Hoạt động khác ghi chú?","type":"single","options":["Giống hệt","Có loại + thời gian chuẩn timeline","Chỉ admin","Không dùng"],"correct":[1],"explanation":"Timeline truy vết."}]}$j_c2000003_0000_0000_0000_000000000004$::jsonb,
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
  'c2000003-0000-0000-0000-000000000005',
  'b2000003-0000-0000-0000-000000000005',
  'Kiểm tra: Nhiệm vụ Lead trên phần mềm',
  '6 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000003_0000_0000_0000_000000000005${"items":[{"id":"q1","question":"HD 5: Nhiệm vụ Lead trên phần mềm — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q2","question":"HD 5: Nhiệm vụ Lead trên phần mềm — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q3","question":"HD 5: Nhiệm vụ Lead trên phần mềm — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q4","question":"HD 5: Nhiệm vụ Lead trên phần mềm — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q5","question":"HD 5: Nhiệm vụ Lead trên phần mềm — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q6","question":"HD 5: Nhiệm vụ Lead trên phần mềm — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."}]}$j_c2000003_0000_0000_0000_000000000005$::jsonb,
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
  'c2000003-0000-0000-0000-000000000006',
  'b2000003-0000-0000-0000-000000000006',
  'Kiểm tra: Hoạt động và ghi chú Lead',
  '6 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000003_0000_0000_0000_000000000006${"items":[{"id":"q1","question":"HD 6: Hoạt động và ghi chú Lead — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q2","question":"HD 6: Hoạt động và ghi chú Lead — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q3","question":"HD 6: Hoạt động và ghi chú Lead — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q4","question":"HD 6: Hoạt động và ghi chú Lead — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q5","question":"HD 6: Hoạt động và ghi chú Lead — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q6","question":"HD 6: Hoạt động và ghi chú Lead — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."}]}$j_c2000003_0000_0000_0000_000000000006$::jsonb,
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
  'c2000003-0000-0000-0000-000000000007',
  'b2000003-0000-0000-0000-000000000007',
  'Kiểm tra: Tài liệu Lead — Upload',
  '6 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000003_0000_0000_0000_000000000007${"items":[{"id":"q1","question":"HD 7: Tài liệu Lead — Upload — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q2","question":"HD 7: Tài liệu Lead — Upload — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q3","question":"HD 7: Tài liệu Lead — Upload — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q4","question":"HD 7: Tài liệu Lead — Upload — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q5","question":"HD 7: Tài liệu Lead — Upload — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q6","question":"HD 7: Tài liệu Lead — Upload — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."}]}$j_c2000003_0000_0000_0000_000000000007$::jsonb,
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
  'c2000003-0000-0000-0000-000000000008',
  'b2000003-0000-0000-0000-000000000008',
  'Kiểm tra: Chuyển Lead → Deal (popup)',
  '6 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000003_0000_0000_0000_000000000008${"items":[{"id":"q1","question":"HD 8: Chuyển Lead → Deal (popup) — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q2","question":"HD 8: Chuyển Lead → Deal (popup) — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q3","question":"HD 8: Chuyển Lead → Deal (popup) — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q4","question":"HD 8: Chuyển Lead → Deal (popup) — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q5","question":"HD 8: Chuyển Lead → Deal (popup) — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q6","question":"HD 8: Chuyển Lead → Deal (popup) — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."}]}$j_c2000003_0000_0000_0000_000000000008$::jsonb,
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
  'c2000003-0000-0000-0000-000000000009',
  'b2000003-0000-0000-0000-000000000009',
  'Kiểm tra: Bảng Deal và Kanban',
  '6 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000003_0000_0000_0000_000000000009${"items":[{"id":"q1","question":"HD 9: Bảng Deal và Kanban — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q2","question":"HD 9: Bảng Deal và Kanban — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q3","question":"HD 9: Bảng Deal và Kanban — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q4","question":"HD 9: Bảng Deal và Kanban — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q5","question":"HD 9: Bảng Deal và Kanban — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q6","question":"HD 9: Bảng Deal và Kanban — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."}]}$j_c2000003_0000_0000_0000_000000000009$::jsonb,
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
  'c2000003-0000-0000-0000-000000000010',
  'b2000003-0000-0000-0000-000000000010',
  'Kiểm tra: Chi tiết Deal — Tab',
  '6 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000003_0000_0000_0000_000000000010${"items":[{"id":"q1","question":"HD 10: Chi tiết Deal — Tab — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q2","question":"HD 10: Chi tiết Deal — Tab — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q3","question":"HD 10: Chi tiết Deal — Tab — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q4","question":"HD 10: Chi tiết Deal — Tab — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q5","question":"HD 10: Chi tiết Deal — Tab — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q6","question":"HD 10: Chi tiết Deal — Tab — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."}]}$j_c2000003_0000_0000_0000_000000000010$::jsonb,
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
  'c2000003-0000-0000-0000-000000000011',
  'b2000003-0000-0000-0000-000000000011',
  'Kiểm tra: Kéo Deal Thắng / Thua',
  '6 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000003_0000_0000_0000_000000000011${"items":[{"id":"q1","question":"HD 11: Kéo Deal Thắng / Thua — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q2","question":"HD 11: Kéo Deal Thắng / Thua — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q3","question":"HD 11: Kéo Deal Thắng / Thua — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q4","question":"HD 11: Kéo Deal Thắng / Thua — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q5","question":"HD 11: Kéo Deal Thắng / Thua — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q6","question":"HD 11: Kéo Deal Thắng / Thua — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."}]}$j_c2000003_0000_0000_0000_000000000011$::jsonb,
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
  'c2000003-0000-0000-0000-000000000012',
  'b2000003-0000-0000-0000-000000000012',
  'Kiểm tra: Ôn tập Lead & Deal trên app',
  '6 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000003_0000_0000_0000_000000000012${"items":[{"id":"q1","question":"HD 12: Ôn tập Lead & Deal trên app — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q2","question":"HD 12: Ôn tập Lead & Deal trên app — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q3","question":"HD 12: Ôn tập Lead & Deal trên app — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q4","question":"HD 12: Ôn tập Lead & Deal trên app — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q5","question":"HD 12: Ôn tập Lead & Deal trên app — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q6","question":"HD 12: Ôn tập Lead & Deal trên app — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."}]}$j_c2000003_0000_0000_0000_000000000012$::jsonb,
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
  'c2000003-0000-0000-0000-000000000013',
  'b2000003-0000-0000-0000-000000000013',
  'Kiểm tra: Dashboard CRM',
  '6 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000003_0000_0000_0000_000000000013${"items":[{"id":"q1","question":"HD 13: Dashboard CRM — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q2","question":"HD 13: Dashboard CRM — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q3","question":"HD 13: Dashboard CRM — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q4","question":"HD 13: Dashboard CRM — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q5","question":"HD 13: Dashboard CRM — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q6","question":"HD 13: Dashboard CRM — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."}]}$j_c2000003_0000_0000_0000_000000000013$::jsonb,
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
  'c2000003-0000-0000-0000-000000000014',
  'b2000003-0000-0000-0000-000000000014',
  'Kiểm tra: Sự kiện nội bộ',
  '6 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000003_0000_0000_0000_000000000014${"items":[{"id":"q1","question":"HD 14: Sự kiện nội bộ — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q2","question":"HD 14: Sự kiện nội bộ — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q3","question":"HD 14: Sự kiện nội bộ — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q4","question":"HD 14: Sự kiện nội bộ — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q5","question":"HD 14: Sự kiện nội bộ — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q6","question":"HD 14: Sự kiện nội bộ — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."}]}$j_c2000003_0000_0000_0000_000000000014$::jsonb,
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
  'c2000003-0000-0000-0000-000000000015',
  'b2000003-0000-0000-0000-000000000015',
  'Kiểm tra: Nhóm chat CRM',
  '6 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000003_0000_0000_0000_000000000015${"items":[{"id":"q1","question":"HD 15: Nhóm chat CRM — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q2","question":"HD 15: Nhóm chat CRM — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q3","question":"HD 15: Nhóm chat CRM — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q4","question":"HD 15: Nhóm chat CRM — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q5","question":"HD 15: Nhóm chat CRM — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q6","question":"HD 15: Nhóm chat CRM — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."}]}$j_c2000003_0000_0000_0000_000000000015$::jsonb,
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
  'c2000003-0000-0000-0000-000000000016',
  'b2000003-0000-0000-0000-000000000016',
  'Kiểm tra: Đang hoạt động / Online',
  '6 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000003_0000_0000_0000_000000000016${"items":[{"id":"q1","question":"HD 16: Đang hoạt động / Online — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q2","question":"HD 16: Đang hoạt động / Online — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q3","question":"HD 16: Đang hoạt động / Online — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q4","question":"HD 16: Đang hoạt động / Online — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q5","question":"HD 16: Đang hoạt động / Online — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q6","question":"HD 16: Đang hoạt động / Online — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."}]}$j_c2000003_0000_0000_0000_000000000016$::jsonb,
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
  'c2000003-0000-0000-0000-000000000017',
  'b2000003-0000-0000-0000-000000000017',
  'Kiểm tra: Bảng tin CRM',
  '6 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000003_0000_0000_0000_000000000017${"items":[{"id":"q1","question":"HD 17: Bảng tin CRM — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q2","question":"HD 17: Bảng tin CRM — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q3","question":"HD 17: Bảng tin CRM — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q4","question":"HD 17: Bảng tin CRM — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q5","question":"HD 17: Bảng tin CRM — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q6","question":"HD 17: Bảng tin CRM — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."}]}$j_c2000003_0000_0000_0000_000000000017$::jsonb,
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
  'c2000003-0000-0000-0000-000000000018',
  'b2000003-0000-0000-0000-000000000018',
  'Kiểm tra: Ghi âm / Voice (nếu bật)',
  '6 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000003_0000_0000_0000_000000000018${"items":[{"id":"q1","question":"HD 18: Ghi âm / Voice (nếu bật) — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q2","question":"HD 18: Ghi âm / Voice (nếu bật) — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q3","question":"HD 18: Ghi âm / Voice (nếu bật) — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q4","question":"HD 18: Ghi âm / Voice (nếu bật) — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q5","question":"HD 18: Ghi âm / Voice (nếu bật) — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q6","question":"HD 18: Ghi âm / Voice (nếu bật) — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."}]}$j_c2000003_0000_0000_0000_000000000018$::jsonb,
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
  'c2000003-0000-0000-0000-000000000019',
  'b2000003-0000-0000-0000-000000000019',
  'Kiểm tra: CRM Mobile — Thao tác cơ bản',
  '6 câu trắc nghiệm. Đọc phần giải thích sau khi nộp để củng cố kiến thức.',
  'quiz',
  $j_c2000003_0000_0000_0000_000000000019${"items":[{"id":"q1","question":"HD 19: CRM Mobile — Thao tác cơ bản — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q2","question":"HD 19: CRM Mobile — Thao tác cơ bản — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q3","question":"HD 19: CRM Mobile — Thao tác cơ bản — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q4","question":"HD 19: CRM Mobile — Thao tác cơ bản — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q5","question":"HD 19: CRM Mobile — Thao tác cơ bản — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."},{"id":"q6","question":"HD 19: CRM Mobile — Thao tác cơ bản — khẳng định đúng?","type":"single","options":["Làm trên CRM, ghi lịch sử","Chỉ sổ tay","Không cần đăng nhập","Chỉ admin"],"correct":[0],"explanation":"Mọi thao tác quan trọng phải trên hệ thống."}]}$j_c2000003_0000_0000_0000_000000000019$::jsonb,
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
  'c2000003-0000-0000-0000-000000000099',
  'b2000003-0000-0000-0000-000000000022',
  'Bài thi tổng kết khoá',
  '25 câu — 30 phút — đạt 80% — tối đa 3 lượt.',
  'quiz',
  $j_c2000003_0000_0000_0000_000000000099${"items":[{"id":"fq1","question":"Câu 1: Thao tác CRM đúng?","type":"single","options":["Quét trùng SĐT trước khi tạo Lead mới","Tạo Lead trùng SĐT để nhanh","Không cần ghi hoạt động","Deal Thua không cần lý do"],"correct":[0],"explanation":"Quy trình chuẩn trên phần mềm."},{"id":"fq2","question":"Câu 2: Thao tác CRM đúng?","type":"single","options":["Quét trùng SĐT trước khi tạo Lead mới","Tạo Lead trùng SĐT để nhanh","Không cần ghi hoạt động","Deal Thua không cần lý do"],"correct":[0],"explanation":"Quy trình chuẩn trên phần mềm."},{"id":"fq3","question":"Câu 3: Thao tác CRM đúng?","type":"single","options":["Quét trùng SĐT trước khi tạo Lead mới","Tạo Lead trùng SĐT để nhanh","Không cần ghi hoạt động","Deal Thua không cần lý do"],"correct":[0],"explanation":"Quy trình chuẩn trên phần mềm."},{"id":"fq4","question":"Câu 4: Thao tác CRM đúng?","type":"single","options":["Quét trùng SĐT trước khi tạo Lead mới","Tạo Lead trùng SĐT để nhanh","Không cần ghi hoạt động","Deal Thua không cần lý do"],"correct":[0],"explanation":"Quy trình chuẩn trên phần mềm."},{"id":"fq5","question":"Câu 5: Thao tác CRM đúng?","type":"single","options":["Quét trùng SĐT trước khi tạo Lead mới","Tạo Lead trùng SĐT để nhanh","Không cần ghi hoạt động","Deal Thua không cần lý do"],"correct":[0],"explanation":"Quy trình chuẩn trên phần mềm."},{"id":"fq6","question":"Câu 6: Thao tác CRM đúng?","type":"single","options":["Quét trùng SĐT trước khi tạo Lead mới","Tạo Lead trùng SĐT để nhanh","Không cần ghi hoạt động","Deal Thua không cần lý do"],"correct":[0],"explanation":"Quy trình chuẩn trên phần mềm."},{"id":"fq7","question":"Câu 7: Thao tác CRM đúng?","type":"single","options":["Quét trùng SĐT trước khi tạo Lead mới","Tạo Lead trùng SĐT để nhanh","Không cần ghi hoạt động","Deal Thua không cần lý do"],"correct":[0],"explanation":"Quy trình chuẩn trên phần mềm."},{"id":"fq8","question":"Câu 8: Thao tác CRM đúng?","type":"single","options":["Quét trùng SĐT trước khi tạo Lead mới","Tạo Lead trùng SĐT để nhanh","Không cần ghi hoạt động","Deal Thua không cần lý do"],"correct":[0],"explanation":"Quy trình chuẩn trên phần mềm."},{"id":"fq9","question":"Câu 9: Thao tác CRM đúng?","type":"single","options":["Quét trùng SĐT trước khi tạo Lead mới","Tạo Lead trùng SĐT để nhanh","Không cần ghi hoạt động","Deal Thua không cần lý do"],"correct":[0],"explanation":"Quy trình chuẩn trên phần mềm."},{"id":"fq10","question":"Câu 10: Thao tác CRM đúng?","type":"single","options":["Quét trùng SĐT trước khi tạo Lead mới","Tạo Lead trùng SĐT để nhanh","Không cần ghi hoạt động","Deal Thua không cần lý do"],"correct":[0],"explanation":"Quy trình chuẩn trên phần mềm."},{"id":"fq11","question":"Câu 11: Thao tác CRM đúng?","type":"single","options":["Quét trùng SĐT trước khi tạo Lead mới","Tạo Lead trùng SĐT để nhanh","Không cần ghi hoạt động","Deal Thua không cần lý do"],"correct":[0],"explanation":"Quy trình chuẩn trên phần mềm."},{"id":"fq12","question":"Câu 12: Thao tác CRM đúng?","type":"single","options":["Quét trùng SĐT trước khi tạo Lead mới","Tạo Lead trùng SĐT để nhanh","Không cần ghi hoạt động","Deal Thua không cần lý do"],"correct":[0],"explanation":"Quy trình chuẩn trên phần mềm."},{"id":"fq13","question":"Câu 13: Thao tác CRM đúng?","type":"single","options":["Quét trùng SĐT trước khi tạo Lead mới","Tạo Lead trùng SĐT để nhanh","Không cần ghi hoạt động","Deal Thua không cần lý do"],"correct":[0],"explanation":"Quy trình chuẩn trên phần mềm."},{"id":"fq14","question":"Câu 14: Thao tác CRM đúng?","type":"single","options":["Quét trùng SĐT trước khi tạo Lead mới","Tạo Lead trùng SĐT để nhanh","Không cần ghi hoạt động","Deal Thua không cần lý do"],"correct":[0],"explanation":"Quy trình chuẩn trên phần mềm."},{"id":"fq15","question":"Câu 15: Thao tác CRM đúng?","type":"single","options":["Quét trùng SĐT trước khi tạo Lead mới","Tạo Lead trùng SĐT để nhanh","Không cần ghi hoạt động","Deal Thua không cần lý do"],"correct":[0],"explanation":"Quy trình chuẩn trên phần mềm."},{"id":"fq16","question":"Câu 16: Thao tác CRM đúng?","type":"single","options":["Quét trùng SĐT trước khi tạo Lead mới","Tạo Lead trùng SĐT để nhanh","Không cần ghi hoạt động","Deal Thua không cần lý do"],"correct":[0],"explanation":"Quy trình chuẩn trên phần mềm."},{"id":"fq17","question":"Câu 17: Thao tác CRM đúng?","type":"single","options":["Quét trùng SĐT trước khi tạo Lead mới","Tạo Lead trùng SĐT để nhanh","Không cần ghi hoạt động","Deal Thua không cần lý do"],"correct":[0],"explanation":"Quy trình chuẩn trên phần mềm."},{"id":"fq18","question":"Câu 18: Thao tác CRM đúng?","type":"single","options":["Quét trùng SĐT trước khi tạo Lead mới","Tạo Lead trùng SĐT để nhanh","Không cần ghi hoạt động","Deal Thua không cần lý do"],"correct":[0],"explanation":"Quy trình chuẩn trên phần mềm."},{"id":"fq19","question":"Câu 19: Thao tác CRM đúng?","type":"single","options":["Quét trùng SĐT trước khi tạo Lead mới","Tạo Lead trùng SĐT để nhanh","Không cần ghi hoạt động","Deal Thua không cần lý do"],"correct":[0],"explanation":"Quy trình chuẩn trên phần mềm."},{"id":"fq20","question":"Câu 20: Thao tác CRM đúng?","type":"single","options":["Quét trùng SĐT trước khi tạo Lead mới","Tạo Lead trùng SĐT để nhanh","Không cần ghi hoạt động","Deal Thua không cần lý do"],"correct":[0],"explanation":"Quy trình chuẩn trên phần mềm."},{"id":"fq21","question":"Câu 21: Thao tác CRM đúng?","type":"single","options":["Quét trùng SĐT trước khi tạo Lead mới","Tạo Lead trùng SĐT để nhanh","Không cần ghi hoạt động","Deal Thua không cần lý do"],"correct":[0],"explanation":"Quy trình chuẩn trên phần mềm."},{"id":"fq22","question":"Câu 22: Thao tác CRM đúng?","type":"single","options":["Quét trùng SĐT trước khi tạo Lead mới","Tạo Lead trùng SĐT để nhanh","Không cần ghi hoạt động","Deal Thua không cần lý do"],"correct":[0],"explanation":"Quy trình chuẩn trên phần mềm."},{"id":"fq23","question":"Câu 23: Thao tác CRM đúng?","type":"single","options":["Quét trùng SĐT trước khi tạo Lead mới","Tạo Lead trùng SĐT để nhanh","Không cần ghi hoạt động","Deal Thua không cần lý do"],"correct":[0],"explanation":"Quy trình chuẩn trên phần mềm."},{"id":"fq24","question":"Câu 24: Thao tác CRM đúng?","type":"single","options":["Quét trùng SĐT trước khi tạo Lead mới","Tạo Lead trùng SĐT để nhanh","Không cần ghi hoạt động","Deal Thua không cần lý do"],"correct":[0],"explanation":"Quy trình chuẩn trên phần mềm."},{"id":"fq25","question":"Câu 25: Thao tác CRM đúng?","type":"single","options":["Quét trùng SĐT trước khi tạo Lead mới","Tạo Lead trùng SĐT để nhanh","Không cần ghi hoạt động","Deal Thua không cần lý do"],"correct":[0],"explanation":"Quy trình chuẩn trên phần mềm."}]}$j_c2000003_0000_0000_0000_000000000099$::jsonb,
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
