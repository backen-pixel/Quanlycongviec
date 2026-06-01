-- 263
-- Hướng dẫn CRM
-- Seed CRM guide — 5 trụ, 12 câu/bài
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
  'Thao tác CRM trên phần mềm: đăng nhập, Lead, Deal, Dashboard, Chat, Mobile. Trật tự 5 trụ — dành người mới non-tech, giọng giảng viên.',
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
  'b2000003-0000-0000-0000-000000000001',
  'd2000003-0000-0000-0000-000000000001',
  'HD 1: Vì sao phải thao tác trên phần mềm CRM',
  'Tư tưởng: mọi việc quan trọng ghi trên hệ thống — không sổ tay.',
  $md_b2000003_0000_0000_0000_000000000001$# HD 1: Vì sao phải thao tác trên phần mềm CRM

> _Buổi sáng đồng nghiệp nghỉ — bạn mở CRM là thấy hết lịch sử khách của họ. Đó là lý do **phải dùng app**._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Phần mềm CRM là **công cụ làm việc chính** — không phải phụ trợ.

- Ghi trên app = KPI công bằng, handover dễ.
- Thao tác ngoài app = dữ liệu công ty bị thiếu.

## 2. Tư duy — Cách nghĩ trước khi làm

**Mental model:** CRM = **sổ công ty** — ai cũng đọc được phần mình có quyền.

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** Trình duyệt → địa chỉ công ty → **Đăng nhập**

- App Switcher
- Sidebar
- Module CRM


![Tư tưởng: mọi việc quan trọng ghi trên hệ thống — không sổ tay.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-01.png)
## 4. Vận hành — Làm theo từng bước

1. Đăng nhập tài khoản **cá nhân**.
2. App Switcher → **CRM**.
3. Ghim (Pin) module CRM.


> **Mẹo của mentor:** Mỗi thao tác quan trọng — hỏi: "Đã ghi trên CRM chưa?"

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi


**Lỗi thường gặp:**
- Ghi sổ tay riêng.
- Dùng chung tài khoản.

## Tóm tắt 30 giây

Phần mềm CRM là nơi làm việc chính — không thay bằng sổ tay.$md_b2000003_0000_0000_0000_000000000001$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-01.png',
  $att_b2000003_0000_0000_0000_000000000001$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-01.png","caption":"Tư tưởng: mọi việc quan trọng ghi trên hệ thống — không sổ tay."}]$att_b2000003_0000_0000_0000_000000000001$::jsonb,
  8,
  ARRAY['huong-dan', 'phan-mem', '5-tru', 'hd-1'],
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
  'b2000003-0000-0000-0000-000000000002',
  'd2000003-0000-0000-0000-000000000001',
  'HD 2: Đăng nhập và làm quen giao diện',
  'Sidebar, App Switcher, ba vùng màn hình, ghim module.',
  $md_b2000003_0000_0000_0000_000000000002$# HD 2: Đăng nhập và làm quen giao diện

> _Lần đầu vào CRM — đừng lo "mất menu". **App Switcher** (biểu tượng lưới) mở mọi module._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Biết đường trong app = **tiết kiệm 10 phút mỗi ngày**.

- Giao diện ổn định — học một lần, dùng lâu dài.

## 2. Tư duy — Cách nghĩ trước khi làm

- **Sidebar** _(menu trái)_
- **App Switcher** _(lưới góc trên — chuyển module)_

| Vùng | Việc bạn làm |
|---|---|
| Sidebar trái | Chọn CRM, Cài đặt |
| Thanh trên | Tìm, thông báo, tài khoản |
| Giữa | Bảng Lead, chi tiết… |

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** Toàn màn hình sau đăng nhập

- Sidebar
- App Switcher
- Pin module
- Thanh tìm kiếm


![Sidebar, App Switcher, ba vùng màn hình, ghim module.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-02.png)
## 4. Vận hành — Làm theo từng bước

1. Nhập URL công ty → **Đăng nhập** (email + mật khẩu).
2. **App Switcher** → **CRM**.
3. **Pin** module CRM.
4. **CRM → Bảng Lead** — thấy Kanban.


> **Mẹo của mentor:** Bookmark URL CRM trên trình duyệt — vào nhanh hơn.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi


**Lỗi thường gặp:**
- Tưởng mất menu — không biết App Switcher.

## Tóm tắt 30 giây

Ba vùng màn hình; App Switcher mở CRM; Pin tiết kiệm thao tác.$md_b2000003_0000_0000_0000_000000000002$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-02.png',
  $att_b2000003_0000_0000_0000_000000000002$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-02.png","caption":"Sidebar, App Switcher, ba vùng màn hình, ghim module."}]$att_b2000003_0000_0000_0000_000000000002$::jsonb,
  8,
  ARRAY['huong-dan', 'phan-mem', '5-tru', 'hd-2'],
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
  'b2000003-0000-0000-0000-000000000003',
  'd2000003-0000-0000-0000-000000000001',
  'HD 3: Bảo mật tài khoản',
  'Mật khẩu mạnh, đổi định kỳ, đăng xuất thiết bị lạ.',
  $md_b2000003_0000_0000_0000_000000000003$# HD 3: Bảo mật tài khoản

> _CRM chứa SĐT khách — lộ mật khẩu = người lạ xem Lead của bạn._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Bảo mật = **bảo vệ khách hàng** và uy tín cá nhân.

- Một tài khoản một người — không chia sẻ.

## 2. Tư duy — Cách nghĩ trước khi làm

**Mental model:** Mật khẩu CRM như **chìa khóo kho** — không dán lên màn hình.

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** **Cài đặt → Đổi mật khẩu / Thiết bị đăng nhập**

- Đổi mật khẩu
- Danh sách thiết bị
- Đăng xuất thiết bị lạ


![Mật khẩu mạnh, đổi định kỳ, đăng xuất thiết bị lạ.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-03.png)
## 4. Vận hành — Làm theo từng bước

1. Mật khẩu ≥ **8 ký tự**, hoa + thường + số.
2. **Cài đặt → Đổi mật khẩu** khi nghi ngờ lộ.
3. **Thiết bị đăng nhập** → đăng xuất thiết bị lạ.
4. Không gửi mật khẩu qua Zalo.


> **Mẹo của mentor:** Đổi mật khẩu 3 tháng/lần — đặt nhắc trên điện thoại.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi


**Lỗi thường gặp:**
- Ghi pass trên giấy dán màn hình.
- Chia sẻ pass qua chat.

## Tóm tắt 30 giây

Mật khẩu riêng — đổi định kỳ — kiểm tra thiết bị — không chia sẻ.$md_b2000003_0000_0000_0000_000000000003$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-03.png',
  $att_b2000003_0000_0000_0000_000000000003$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-03.png","caption":"Mật khẩu mạnh, đổi định kỳ, đăng xuất thiết bị lạ."}]$att_b2000003_0000_0000_0000_000000000003$::jsonb,
  8,
  ARRAY['huong-dan', 'phan-mem', '5-tru', 'hd-3'],
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
  'b2000003-0000-0000-0000-000000000004',
  'd2000003-0000-0000-0000-000000000001',
  'HD 4: Bảng Lead — Kanban, lọc, tìm kiếm',
  'Menu CRM → Bảng Lead; kéo thẻ; Lead của tôi; badge SLA.',
  $md_b2000003_0000_0000_0000_000000000004$# HD 4: Bảng Lead — Kanban, lọc, tìm kiếm

> _Sáng vào ca — **Bảng Lead → Kanban → Lead của tôi** — 3 click, thấy việc cả ngày._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Bảng Lead là **bàn làm việc hàng ngày** của sales.

- Kanban = biết khách đang ở giai đoạn nào.

## 2. Tư duy — Cách nghĩ trước khi làm

- **Kanban** _(kéo thẻ)_ vs **Danh sách** _(xem nhanh nhiều dòng)_

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** **CRM → Bảng Lead**

- Tab Kanban
- Bộ lọc Lead của tôi
- Ô tìm kiếm
- Tab Deadline


![Menu CRM → Bảng Lead; kéo thẻ; Lead của tôi; badge SLA.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-04.png)
## 4. Vận hành — Làm theo từng bước

1. **Menu → CRM → Bảng Lead**.
2. Tab **Kanban**.
3. Lọc **Lead của tôi**.
4. Click thẻ → chi tiết.
5. Kéo thẻ khi đủ điều kiện.


> **Mẹo của mentor:** Badge đỏ = ưu tiên — xử lý trước cafe sáng.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi


**Lỗi thường gặp:**
- Không lọc Lead của tôi — nhầm Lead người khác.

## Tóm tắt 30 giây

Bảng Lead = bàn làm việc; Kanban + lọc + badge đỏ SLA.$md_b2000003_0000_0000_0000_000000000004$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-04.png',
  $att_b2000003_0000_0000_0000_000000000004$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-04.png","caption":"Menu CRM → Bảng Lead; kéo thẻ; Lead của tôi; badge SLA."}]$att_b2000003_0000_0000_0000_000000000004$::jsonb,
  10,
  ARRAY['huong-dan', 'phan-mem', '5-tru', 'hd-4'],
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
  'b2000003-0000-0000-0000-000000000005',
  'd2000003-0000-0000-0000-000000000001',
  'HD 5: Tạo Lead mới và Quét trùng SĐT',
  'Nút + Lead mới, form, Quét trùng, Lưu.',
  $md_b2000003_0000_0000_0000_000000000005$# HD 5: Tạo Lead mới và Quét trùng SĐT

> _Chị Hoa nhắn Zalo — **+ Lead mới** nhưng **Quét trùng** trước — SĐT đã có Lead cũ._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Tạo Lead đúng = **một khách một luồng** trên hệ thống.

- Trùng SĐT → KPI và chăm sóc loạn.

## 2. Tư duy — Cách nghĩ trước khi làm

**Mental model:** Quét trùng = **tra cứu thư viện** trước khi thêm sách mới.

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** **Bảng Lead → + Lead mới**

- Form tiêu đề + Khách hàng
- Quét trùng
- Nguồn, Loại SP


![Nút + Lead mới, form, Quét trùng, Lưu.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-05.png)
## 4. Vận hành — Làm theo từng bước

1. **+ Lead mới**.
2. Tiêu đề: Tên — Khu vực — SP.
3. SĐT → **Quét trùng**.
4. Trùng → mở cũ; không trùng → Nguồn, Loại SP → **Lưu**.


> **Mẹo của mentor:** Copy tiêu đề mẫu từ Lead đẹp — paste sửa nhanh.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi


**Lỗi thường gặp:**
- Bỏ qua Quét trùng.
- Tiêu đề trống.

## Tóm tắt 30 giây

+ Lead mới → Quét trùng bắt buộc → tiêu đề rõ → Lưu.$md_b2000003_0000_0000_0000_000000000005$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-05.png',
  $att_b2000003_0000_0000_0000_000000000005$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-05.png","caption":"Nút + Lead mới, form, Quét trùng, Lưu."}]$att_b2000003_0000_0000_0000_000000000005$::jsonb,
  10,
  ARRAY['huong-dan', 'phan-mem', '5-tru', 'hd-5'],
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
  'b2000003-0000-0000-0000-000000000006',
  'd2000003-0000-0000-0000-000000000001',
  'HD 6: Chi tiết Lead — Bốn tab trên phần mềm',
  'Tổng quan, Nhiệm vụ, Hoạt động, Tài liệu; nút header.',
  $md_b2000003_0000_0000_0000_000000000006$# HD 6: Chi tiết Lead — Bốn tab trên phần mềm

> _Click thẻ Lead — **4 tab** như 4 ngăn tủ. Ghi nhầm ngăn = đồng nghiệp không tìm file._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Chi tiết Lead = **màn hình làm việc chính** với một khách.

- Đúng tab = handover và KPI đúng.

## 2. Tư duy — Cách nghĩ trước khi làm

| Tab | Dùng cho |
|---|---|
| Tổng quan | 6 trường, phụ trách |
| Nhiệm vụ | Việc có hạn |
| Hoạt động | Gọi/gặp đã làm |
| Tài liệu | PDF, ảnh |

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** Click thẻ → Chi tiết Lead

- 4 tab
- Nút Chuyển Deal, Sửa, Mất/Mở lại


![Tổng quan, Nhiệm vụ, Hoạt động, Tài liệu; nút header.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-06.png)
## 4. Vận hành — Làm theo từng bước

1. **Tổng quan**: kiểm 6 trường.
2. **Nhiệm vụ**: tạo/hoàn thành task.
3. **Hoạt động**: ghi gọi/gặp.
4. **Tài liệu**: upload PDF/ảnh.
5. **Chuyển Deal** header khi đủ (khoá nghiệp vụ).


> **Mẹo của mentor:** Phím tắt: bookmark chi tiết Lead hay dùng.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi


**Lỗi thường gặp:**
- Ghi gọi vào Tài liệu.
- Không đọc Hoạt động trước gọi.

## Tóm tắt 30 giây

Tổng quan / Nhiệm vụ / Hoạt động / Tài liệu — đúng tab đúng việc.$md_b2000003_0000_0000_0000_000000000006$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-06.png',
  $att_b2000003_0000_0000_0000_000000000006$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-06.png","caption":"Tổng quan, Nhiệm vụ, Hoạt động, Tài liệu; nút header."}]$att_b2000003_0000_0000_0000_000000000006$::jsonb,
  10,
  ARRAY['huong-dan', 'phan-mem', '5-tru', 'hd-6'],
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
  'b2000003-0000-0000-0000-000000000007',
  'd2000003-0000-0000-0000-000000000001',
  'HD 7: Nhiệm vụ và Hoạt động — Thao tác trên app',
  'Tạo task, hoàn thành + popup ghi chú, timeline hoạt động.',
  $md_b2000003_0000_0000_0000_000000000007$# HD 7: Nhiệm vụ và Hoạt động — Thao tác trên app

> _Bấm **Hoàn thành** nhiệm vụ — popup bắt ghi chú. Đây là **minh chứng** trên phần mềm._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** App **bắt buộc** ghi kết quả — không tick cho qua.

- Popup = nhắc bạn làm đúng quy trình.

## 2. Tư duy — Cách nghĩ trước khi làm

- **+ Hoạt động** _(ghi việc đã làm)_ vs **Nhiệm vụ** _(việc sắp làm)_

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** Tab **Nhiệm vụ** và **Hoạt động**

- + Tạo nhiệm vụ
- Hoàn thành + popup
- + Hoạt động
- Đính kèm file


![Tạo task, hoàn thành + popup ghi chú, timeline hoạt động.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-07.png)
## 4. Vận hành — Làm theo từng bước

1. Nhiệm vụ: **+ Tạo** → hạn → **Hoàn thành** → điền popup.
2. Hoạt động: **+ Hoạt động** → loại Gọi/Gặp → nội dung.
3. Đính kèm ảnh/Zalo nếu cần.
4. Kiểm tra timeline đã hiện.


> **Mẹo của mentor:** Sau mỗi cuộc gọi — 1 phút ghi Hoạt động, không tích tụ cuối ngày.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi


**Lỗi thường gặp:**
- Tick xong không ghi popup.
- Gom ghi cuối ngày — hay quên.

## Tóm tắt 30 giây

Hoàn thành task = popup ghi chú; Hoạt động ngay sau gọi/gặp.$md_b2000003_0000_0000_0000_000000000007$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-07.png',
  $att_b2000003_0000_0000_0000_000000000007$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-07.png","caption":"Tạo task, hoàn thành + popup ghi chú, timeline hoạt động."}]$att_b2000003_0000_0000_0000_000000000007$::jsonb,
  10,
  ARRAY['huong-dan', 'phan-mem', '5-tru', 'hd-7'],
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
  'b2000003-0000-0000-0000-000000000008',
  'd2000003-0000-0000-0000-000000000001',
  'HD 8: Bảng Deal và Kanban Deal',
  'CRM → Bảng Deal, kéo thẻ, Thắng/Thua popup.',
  $md_b2000003_0000_0000_0000_000000000008$# HD 8: Bảng Deal và Kanban Deal

> _Sau **Chuyển Deal** — mở **Bảng Deal**. Kanban Deal có cột **Thắng / Thua** — thao tác khác Lead._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Bảng Deal = **bàn làm việc giai đoạn HĐ và tiền**.

- Thắng/Thua có popup riêng — không kéo bừa.

## 2. Tư duy — Cách nghĩ trước khi làm

- Kanban **Deal** vs Kanban **Lead** — pipeline khác nhau

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** **CRM → Bảng Deal → Kanban**

- Kéo thẻ Deal
- Popup Thắng (dự án SX)
- Popup Thua (lý do)


![CRM → Bảng Deal, kéo thẻ, Thắng/Thua popup.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-08.png)
## 4. Vận hành — Làm theo từng bước

1. **CRM → Bảng Deal**.
2. Lọc Deal của tôi.
3. Kéo theo giai đoạn.
4. Thắng → popup tạo dự án.
5. Thua → chọn lý do.


> **Mẹo của mentor:** Deal và Lead — bookmark cả hai menu.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi


**Lỗi thường gặp:**
- Kéo Thắng chưa popup.
- Thua không chọn lý do.

## Tóm tắt 30 giây

Bảng Deal Kanban; Thắng = popup dự án; Thua = lý do bắt buộc.$md_b2000003_0000_0000_0000_000000000008$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-08.png',
  $att_b2000003_0000_0000_0000_000000000008$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-08.png","caption":"CRM → Bảng Deal, kéo thẻ, Thắng/Thua popup."}]$att_b2000003_0000_0000_0000_000000000008$::jsonb,
  10,
  ARRAY['huong-dan', 'phan-mem', '5-tru', 'hd-8'],
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
  'b2000003-0000-0000-0000-000000000009',
  'd2000003-0000-0000-0000-000000000001',
  'HD 9: Chi tiết Deal — Báo giá, Tài liệu, Thắng/Thua',
  'Tab trên Deal, upload HĐ/cọc, thao tác header.',
  $md_b2000003_0000_0000_0000_000000000009$# HD 9: Chi tiết Deal — Báo giá, Tài liệu, Thắng/Thua

> _Chi tiết Deal — tab **Báo giá**, **Tài liệu** (HĐ, CK), **Nhiệm vụ**. Upload **trước** kéo Thắng._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Deal chi tiết = **hồ sơ pháp lý + kỹ thuật** trên app.

- Thiếu file trên app = xưởng không thấy.

## 2. Tư duy — Cách nghĩ trước khi làm

- Tab **Báo giá** vs tab **Tài liệu** — BG có thể tạo trong app; HĐ/cọc thường upload Tài liệu

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** Click thẻ Deal → chi tiết

- Tab Báo giá
- Tài liệu upload
- Nhiệm vụ gate
- Header Thắng/Thua


![Tab trên Deal, upload HĐ/cọc, thao tác header.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-09.png)
## 4. Vận hành — Làm theo từng bước

1. Tạo/upload **BG** tab Báo giá.
2. Upload **HĐ + CK** tab Tài liệu.
3. Hoàn thành **nhiệm vụ** gate.
4. Kéo **Thắng** + popup.


> **Mẹo của mentor:** Tên file: `HD_TenKH_YYYY-MM.pdf` — xưởng tìm nhanh.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi


**Lỗi thường gặp:**
- Thắng trước upload.
- File chỉ gửi Zalo không lên app.

## Tóm tắt 30 giây

Upload đủ trên Deal → task → Thắng popup; Thua = lý do.$md_b2000003_0000_0000_0000_000000000009$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-09.png',
  $att_b2000003_0000_0000_0000_000000000009$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-09.png","caption":"Tab trên Deal, upload HĐ/cọc, thao tác header."}]$att_b2000003_0000_0000_0000_000000000009$::jsonb,
  10,
  ARRAY['huong-dan', 'phan-mem', '5-tru', 'hd-9'],
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
  'b2000003-0000-0000-0000-000000000010',
  'd2000003-0000-0000-0000-000000000001',
  'HD 10: Dashboard CRM — Đọc số liệu nhanh',
  'Tab Lead/Deal, KPI tổng, lọc thời gian — báo cáo trên app.',
  $md_b2000003_0000_0000_0000_000000000010$# HD 10: Dashboard CRM — Đọc số liệu nhanh

> _Sếp hỏi "Tháng này bao nhiêu Lead mới?" — **Dashboard CRM** trả lời trong 10 giây._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Dashboard = **bảng tin số liệu** — biết mình đang đi nhanh hay chậm.

- Số trên dashboard lấy từ CRM — ghi đúng app thì dashboard đúng.

## 2. Tư duy — Cách nghĩ trước khi làm

**Mental model:** Dashboard phản ánh **hành vi trên app** — garbage in, garbage out.

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** **CRM → Dashboard** (hoặc từ App Switcher)

- Tab Lead/Deal
- Lọc tháng/quý
- Ô KPI
- Link "Xem tất cả" → Bảng Lead/Deal


![Tab Lead/Deal, KPI tổng, lọc thời gian — báo cáo trên app.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-10.png)
## 4. Vận hành — Làm theo từng bước

1. Mở Dashboard đầu tuần.
2. Xem Lead mới, Deal Thắng, SLA.
3. Click **Xem tất cả** → sang Bảng chi tiết.
4. So sánh với **Bảng điểm** cá nhân.


> **Mẹo của mentor:** Dashboard team — đừng so sánh số người khác để tranh; dùng để tự cải thiện.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi


**Lỗi thường gặp:**
- Số dashboard thấp vì không ghi CRM.
- Chỉ nhìn tổng không drill-down.

## Tóm tắt 30 giây

Dashboard đọc nhanh KPI; click xem chi tiết; số đúng khi ghi CRM đúng.$md_b2000003_0000_0000_0000_000000000010$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-10.png',
  $att_b2000003_0000_0000_0000_000000000010$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-10.png","caption":"Tab Lead/Deal, KPI tổng, lọc thời gian — báo cáo trên app."}]$att_b2000003_0000_0000_0000_000000000010$::jsonb,
  10,
  ARRAY['huong-dan', 'phan-mem', '5-tru', 'hd-10'],
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
  'b2000003-0000-0000-0000-000000000011',
  'd2000003-0000-0000-0000-000000000001',
  'HD 11: Chat, Sự kiện và Đang hoạt động',
  'Chat theo Lead/Deal, lịch nội bộ, ai đang online.',
  $md_b2000003_0000_0000_0000_000000000011$# HD 11: Chat, Sự kiện và Đang hoạt động

> _@mention đồng nghiệp trong **chat Deal** — họ thấy ngay context khách, không cần kể lại._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Chat CRM gắn **Lead/Deal** — không thay thế ghi chú chính thức.

- Quyết định giá/HĐ vẫn phải lên tab Tài liệu/Hoạt động.

## 2. Tư duy — Cách nghĩ trước khi làm

- **Chat nội bộ** _(trao đổi nhanh)_ vs **Hoạt động/Tài liệu** _(hồ sơ chính thức)_

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** Panel chat trên chi tiết Lead/Deal; menu **Sự kiện**; **Đang hoạt động**

- @mention
- RSVP sự kiện
- Danh sách online


![Chat theo Lead/Deal, lịch nội bộ, ai đang online.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-11.png)
## 4. Vận hành — Làm theo từng bước

1. Chat hỏi nội bộ — @tên.
2. Thỏa thuận với KH → ghi **Hoạt động** + file.
3. Sự kiện: RSVP đúng hạn.
4. Online: biết ai đang hỗ trợ KH.


> **Mẹo của mentor:** Chat "chốt giá 65tr" — copy sang Hoạt động + BG, không để chỉ trong chat.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi


**Lỗi thường gặp:**
- Chỉ chat, không ghi hồ sơ chính.
- Bỏ lỡ RSVP.

## Tóm tắt 30 giây

Chat @mention tiện nội bộ; cam kết KH phải lên Hoạt động/Tài liệu.$md_b2000003_0000_0000_0000_000000000011$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-11.png',
  $att_b2000003_0000_0000_0000_000000000011$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-11.png","caption":"Chat theo Lead/Deal, lịch nội bộ, ai đang online."}]$att_b2000003_0000_0000_0000_000000000011$::jsonb,
  10,
  ARRAY['huong-dan', 'phan-mem', '5-tru', 'hd-11'],
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
  'b2000003-0000-0000-0000-000000000012',
  'd2000003-0000-0000-0000-000000000001',
  'HD 12: CRM Mobile và Ôn tập thao tác',
  'App di động cơ bản; checklist end-to-end Lead + Deal trên app.',
  $md_b2000003_0000_0000_0000_000000000012$# HD 12: CRM Mobile và Ôn tập thao tác

> _Đi khảo sát — **CRM Mobile**: ghi Hoạt động + chụp ảnh upload ngay tại hiện trường._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Mobile = **CRM trong túi** — không đợi về văn phòng mới ghi.

- Ghi muộn = hay quên, KPI và KH đều thiệt.

## 2. Tư duy — Cách nghĩ trước khi làm

**Mental model:** Mobile và web **cùng dữ liệu** — ghi mobile, đồng nghiệp web thấy ngay.

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** App CRM Mobile (iOS/Android)

- Xem Lead/Deal
- Ghi hoạt động
- Chụp ảnh upload
- Nhiệm vụ


![App di động cơ bản; checklist end-to-end Lead + Deal trên app.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-12.png)
## 4. Vận hành — Làm theo từng bước

1. **Checklist ôn tập web**: Đăng nhập → Lead Kanban → Tạo/Quét trùng → 4 tab → Task/Hoạt động.
2. **Deal**: Bảng Deal → upload → Thắng popup.
3. **Mobile**: Mở Lead tại hiện trường → Hoạt động + ảnh.
4. **Báo cáo**: Dashboard + Bảng điểm.


> **Mẹo của mentor:** Cuối khoá — tự làm checklist một lần không nhìn tài liệu.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi

**Tự kiểm sau khi làm:**
- Làm end-to-end web?
- Dùng mobile ghi hiện trường?
- Biết sửa lỗi thường gặp?

## Tóm tắt 30 giây

Mobile ghi tại chỗ; ôn tập = thuần thao tác web + mobile + báo cáo.$md_b2000003_0000_0000_0000_000000000012$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-12.png',
  $att_b2000003_0000_0000_0000_000000000012$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-12.png","caption":"App di động cơ bản; checklist end-to-end Lead + Deal trên app."}]$att_b2000003_0000_0000_0000_000000000012$::jsonb,
  10,
  ARRAY['huong-dan', 'phan-mem', '5-tru', 'hd-12'],
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
  'b2000003-0000-0000-0000-000000000013',
  'd2000003-0000-0000-0000-000000000001',
  'HD 13: Bài thi tổng kết — Thao tác CRM',
  'Bài thi tổng kết khoá — đạt yêu cầu để nhận chứng nhận.',
  $md_b2000003_0000_0000_0000_000000000013$# HD 13: Bài thi tổng kết — Thao tác CRM

> _Bài thi tổng kết — đo lại toàn bộ 5 trụ: Tư tưởng, Tư duy, Nguồn lực, Vận hành, Báo cáo & Sửa chữa._

## 1. Mục đích

Đo tổng hợp 5 trụ. Sau khi nộp, hệ thống mở phần **giải thích** cho câu sai — đọc kỹ trước khi thi lại.

## 2. Quy định

- **20 câu** trắc nghiệm — phủ đủ 5 trụ

- Điểm đạt: **80%**

- Thời gian: **30 phút**

- Tối đa **3 lượt**

- **Điều kiện mở:** đạt **toàn bộ bài tập** trong khoá


![Bài thi tổng kết khoá — đạt yêu cầu để nhận chứng nhận.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-13.png)
## 3. Trước khi thi

Ôn lại các bài học bắt buộc và làm lại bài tập chưa đạt. Đặc biệt 2 trụ hay sai: **Vận hành** (thao tác phần mềm) và **Báo cáo & Sửa chữa** (KPI / lỗi thường gặp).

## 4. Sau khi thi

Nếu đạt — bạn nhận **chứng nhận** điện tử. Nếu chưa đạt — đọc giải thích, ôn lại và thi lại.$md_b2000003_0000_0000_0000_000000000013$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-13.png',
  $att_b2000003_0000_0000_0000_000000000013$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-13.png","caption":"Bài thi tổng kết khoá — đạt yêu cầu để nhận chứng nhận."}]$att_b2000003_0000_0000_0000_000000000013$::jsonb,
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

UPDATE knowledge_lessons SET is_final_exam = true WHERE id = 'b2000003-0000-0000-0000-000000000013';
-- BÀI TẬP
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order,
  image_url, attachments
) VALUES (
  'c2000003-0000-0000-0000-000000000001',
  'b2000003-0000-0000-0000-000000000001',
  'Kiểm tra: Vì sao phải thao tác trên phần mềm CRM',
  '12 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000003_0000_0000_0000_000000000001${"items":[{"id":"tt1","question":"Vì sao thao tác trên CRM?","type":"single","options":["Lưu lịch sử, KPI, handover","Chỉ giám sát","Tốn thời gian","Không lý do"],"correct":[0],"explanation":"Tư tưởng."},{"id":"tt2","question":"Ghi sổ tay thay CRM?","type":"single","options":["Mất minh bạch","Tốt hơn","Bắt buộc","Thưởng"],"correct":[0],"explanation":"Tư tưởng."},{"id":"td3","question":"CRM giống?","type":"single","options":["Sổ công ty dùng chung","Chat riêng","Excel cá nhân","Blocklist"],"correct":[0],"explanation":"Tư duy."},{"id":"td4","question":"Thao tác ngoài app?","type":"single","options":["Dữ liệu công ty thiếu","Tốt","Thưởng","Bắt buộc"],"correct":[0],"explanation":"Tư duy."},{"id":"nl5","question":"Module CRM mở qua?","type":"single","options":["App Switcher","Email","Zalo","Blocklist"],"correct":[0],"explanation":"Nguồn lực."},{"id":"nl6","question":"Sidebar?","type":"single","options":["Menu trái","Giữa màn hình","Dưới","Không có"],"correct":[0],"explanation":"Nguồn lực."},{"id":"vh7","question":"Pin module?","type":"single","options":["Vào thẳng lần sau","Xóa CRM","Khóa","Đổi pass"],"correct":[0],"explanation":"Nguồn lực."},{"id":"vh8","question":"Đăng nhập dùng?","type":"single","options":["Tài khoản cá nhân","Chung team","Khách hàng","Không cần"],"correct":[0],"explanation":"Vận hành."},{"id":"bc9","question":"Sau đăng nhập — CRM?","type":"single","options":["App Switcher → CRM","Tắt máy","Chỉ chat","Blocklist"],"correct":[0],"explanation":"Vận hành."},{"id":"bc10","question":"Thao tác quan trọng — tự hỏi?","type":"single","options":["Đã ghi CRM chưa?","In PDF chưa?","Nghỉ chưa?","Chat chưa?"],"correct":[0],"explanation":"Vận hành."},{"id":"bc11","question":"Dùng chung tài khoản?","type":"single","options":["Vi phạm — không biết ai làm","Tốt","Thưởng","Bắt buộc"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc12","question":"Quên ghi CRM — sửa?","type":"single","options":["Bổ sung ngay trên app","Bỏ qua","Xóa khách","Báo cáo giả"],"correct":[0],"explanation":"Báo cáo."}]}$j_c2000003_0000_0000_0000_000000000001$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-01.png',
  $eax_c2000003_0000_0000_0000_000000000001$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-01.png","caption":"Tư tưởng: mọi việc quan trọng ghi trên hệ thống — không sổ tay."}]$eax_c2000003_0000_0000_0000_000000000001$::jsonb
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, image_url = EXCLUDED.image_url,
  attachments = EXCLUDED.attachments, updated_at = now();
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order,
  image_url, attachments
) VALUES (
  'c2000003-0000-0000-0000-000000000002',
  'b2000003-0000-0000-0000-000000000002',
  'Kiểm tra: Đăng nhập và làm quen giao diện',
  '12 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000003_0000_0000_0000_000000000002${"items":[{"id":"tt1","question":"App Switcher dùng để?","type":"single","options":["Chuyển module (CRM, Công việc…)","Đăng xuất","In BG","Xóa Lead"],"correct":[0],"explanation":"Tư duy."},{"id":"tt2","question":"Sidebar ở?","type":"single","options":["Bên trái","Giữa","Phải","Dưới"],"correct":[0],"explanation":"Nguồn lực."},{"id":"td3","question":"Pin module?","type":"single","options":["Vào thẳng lần sau","Xóa","Khóa","Đổi email"],"correct":[0],"explanation":"Nguồn lực."},{"id":"td4","question":"Nội dung giữa hiển thị?","type":"single","options":["Trang đang chọn (vd Bảng Lead)","Chỉ logo","Chỉ chat","Chỉ KPI"],"correct":[0],"explanation":"Tư duy."},{"id":"nl5","question":"Vào CRM lần đầu?","type":"single","options":["App Switcher → CRM","Cài đặt trước","Tắt trình duyệt","Chỉ mobile"],"correct":[0],"explanation":"Vận hành."},{"id":"nl6","question":"Xác nhận CRM OK?","type":"single","options":["Mở Bảng Lead thấy Kanban","Chỉ logo","Lỗi 404","Blocklist"],"correct":[0],"explanation":"Vận hành."},{"id":"vh7","question":"Thanh trên có?","type":"single","options":["Tìm, thông báo, tài khoản","Chỉ logo","Chỉ chat","Không"],"correct":[0],"explanation":"Nguồn lực."},{"id":"vh8","question":"Bookmark URL?","type":"single","options":["Vào nhanh","Cấm","Xóa CRM","Thua"],"correct":[0],"explanation":"Mẹo mentor."},{"id":"bc9","question":"Tưởng mất menu — sửa?","type":"single","options":["Mở App Switcher","Cài lại Windows","Xóa Lead","Thua"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc10","question":"Không Pin module?","type":"single","options":["Mất vài click mỗi ngày","Không sao","Thưởng","Bắt buộc"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc11","question":"Đăng nhập cần?","type":"single","options":["Email + mật khẩu công ty","Chỉ tên","Không","SĐT khách"],"correct":[0],"explanation":"Vận hành."},{"id":"bc12","question":"CRM nằm trong?","type":"single","options":["Hệ thống module (App Switcher)","Email","Zalo","Excel"],"correct":[0],"explanation":"Tư tưởng."}]}$j_c2000003_0000_0000_0000_000000000002$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-02.png',
  $eax_c2000003_0000_0000_0000_000000000002$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-02.png","caption":"Sidebar, App Switcher, ba vùng màn hình, ghim module."}]$eax_c2000003_0000_0000_0000_000000000002$::jsonb
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, image_url = EXCLUDED.image_url,
  attachments = EXCLUDED.attachments, updated_at = now();
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order,
  image_url, attachments
) VALUES (
  'c2000003-0000-0000-0000-000000000003',
  'b2000003-0000-0000-0000-000000000003',
  'Kiểm tra: Bảo mật tài khoản',
  '12 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000003_0000_0000_0000_000000000003${"items":[{"id":"tt1","question":"CRM chứa dữ liệu nhạy cảm?","type":"single","options":["SĐT, lịch sử KH","Chỉ logo","Chỉ ảnh SP","Video"],"correct":[0],"explanation":"Tư tưởng."},{"id":"tt2","question":"Chia sẻ pass Zalo?","type":"single","options":["Vi phạm bảo mật","OK","Thưởng","Bắt buộc"],"correct":[0],"explanation":"Tư tưởng."},{"id":"td3","question":"Mật khẩu CRM như?","type":"single","options":["Chìa khóa kho","Tên KH","Mã Lead","BG"],"correct":[0],"explanation":"Tư duy."},{"id":"td4","question":"Một tài khoản?","type":"single","options":["Một người","Cả team","Khách","Không giới hạn"],"correct":[0],"explanation":"Tư duy."},{"id":"nl5","question":"Pass tối thiểu?","type":"single","options":["8 ký tự","4","6","2"],"correct":[0],"explanation":"Nguồn lực."},{"id":"nl6","question":"Đổi pass ở?","type":"single","options":["Cài đặt → Đổi mật khẩu","Bảng Lead","Kanban","Blocklist"],"correct":[0],"explanation":"Nguồn lực."},{"id":"vh7","question":"Thiết bị lạ — làm?","type":"single","options":["Đăng xuất + đổi pass","Bỏ qua","Tạo Lead","Thua"],"correct":[0],"explanation":"Vận hành."},{"id":"vh8","question":"Nghi ngờ lộ pass?","type":"single","options":["Đổi ngay","Chờ năm sau","Chat pass mới","Xóa CRM"],"correct":[0],"explanation":"Vận hành."},{"id":"bc9","question":"Ghi pass giấy dán màn hình?","type":"single","options":["Không","Nên","Bắt buộc","Thưởng"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc10","question":"Pass trên chat — sửa?","type":"single","options":["Đổi pass ngay","Giữ","Chia tiếp","Bỏ qua"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc11","question":"Đổi pass định kỳ?","type":"single","options":["3 tháng hoặc khi nghi ngờ","Không bao giờ","10 năm","Mỗi giờ"],"correct":[0],"explanation":"Vận hành."},{"id":"bc12","question":"Thiết bị đăng nhập xem ở?","type":"single","options":["Cài đặt","Lead","Deal","Chat"],"correct":[0],"explanation":"Nguồn lực."}]}$j_c2000003_0000_0000_0000_000000000003$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-03.png',
  $eax_c2000003_0000_0000_0000_000000000003$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-03.png","caption":"Mật khẩu mạnh, đổi định kỳ, đăng xuất thiết bị lạ."}]$eax_c2000003_0000_0000_0000_000000000003$::jsonb
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, image_url = EXCLUDED.image_url,
  attachments = EXCLUDED.attachments, updated_at = now();
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order,
  image_url, attachments
) VALUES (
  'c2000003-0000-0000-0000-000000000004',
  'b2000003-0000-0000-0000-000000000004',
  'Kiểm tra: Bảng Lead — Kanban, lọc, tìm kiếm',
  '12 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000003_0000_0000_0000_000000000004${"items":[{"id":"tt1","question":"Bảng Lead là?","type":"single","options":["Bàn làm việc sales hàng ngày","Chỉ KPI","Chỉ chat","Lương"],"correct":[0],"explanation":"Tư tưởng."},{"id":"tt2","question":"Kanban giúp?","type":"single","options":["Biết giai đoạn khách","Tính lương","Xóa","Blocklist"],"correct":[0],"explanation":"Tư tưởng."},{"id":"td3","question":"Kanban vs Danh sách?","type":"single","options":["Kanban kéo thẻ; Danh sách xem nhiều dòng","Giống","Không có","Lead only"],"correct":[0],"explanation":"Tư duy."},{"id":"td4","question":"Mỗi thẻ Kanban?","type":"single","options":["Một Lead","Một NV","Một file","KPI tháng"],"correct":[0],"explanation":"Tư duy."},{"id":"nl5","question":"Vào Bảng Lead?","type":"single","options":["CRM → Bảng Lead","Công việc","Kiến thức","Xưởng"],"correct":[0],"explanation":"Nguồn lực."},{"id":"nl6","question":"Lọc Lead của tôi?","type":"single","options":["Lead bạn phụ trách","Ẩn hết","Xóa","In HĐ"],"correct":[0],"explanation":"Nguồn lực."},{"id":"vh7","question":"Badge đỏ?","type":"single","options":["Sắp/quá hạn SLA","Đã ký HĐ","VIP","Đã xóa"],"correct":[0],"explanation":"Nguồn lực."},{"id":"vh8","question":"Click thẻ?","type":"single","options":["Mở chi tiết Lead","Xóa","Email auto","Tạo NV"],"correct":[0],"explanation":"Vận hành."},{"id":"bc9","question":"Kéo thẻ?","type":"single","options":["Đổi giai đoạn","In PDF","Chat","Lương"],"correct":[0],"explanation":"Vận hành."},{"id":"bc10","question":"Tab Deadline?","type":"single","options":["Nhóm theo hạn","Xóa","BG","Blocklist"],"correct":[0],"explanation":"Nguồn lực."},{"id":"bc11","question":"Nhầm Lead người khác — sửa?","type":"single","options":["Bật lọc Lead của tôi","Sửa Lead họ","Xóa","Thua"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc12","question":"Tìm Lead theo?","type":"single","options":["Tên, SĐT, mã","Chỉ màu","Không","Email công ty"],"correct":[0],"explanation":"Vận hành."}]}$j_c2000003_0000_0000_0000_000000000004$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-04.png',
  $eax_c2000003_0000_0000_0000_000000000004$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-04.png","caption":"Menu CRM → Bảng Lead; kéo thẻ; Lead của tôi; badge SLA."}]$eax_c2000003_0000_0000_0000_000000000004$::jsonb
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, image_url = EXCLUDED.image_url,
  attachments = EXCLUDED.attachments, updated_at = now();
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order,
  image_url, attachments
) VALUES (
  'c2000003-0000-0000-0000-000000000005',
  'b2000003-0000-0000-0000-000000000005',
  'Kiểm tra: Tạo Lead mới và Quét trùng SĐT',
  '12 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000003_0000_0000_0000_000000000005${"items":[{"id":"tt1","question":"Quét trùng vì?","type":"single","options":["Một KH một luồng","Làm khó","In PDF","Blocklist"],"correct":[0],"explanation":"Tư tưởng."},{"id":"tt2","question":"Trùng SĐT — KPI?","type":"single","options":["Loạn nếu tạo mới","Tốt","Thưởng","Không"],"correct":[0],"explanation":"Tư tưởng."},{"id":"td3","question":"Quét trùng như?","type":"single","options":["Tra thư viện trước thêm sách","Xóa KH","Thua","Chat"],"correct":[0],"explanation":"Tư duy."},{"id":"td4","question":"Trùng — làm?","type":"single","options":["Mở Lead cũ","Tạo mới","Đổi SĐT giả","Xóa"],"correct":[0],"explanation":"Tư duy."},{"id":"nl5","question":"+ Lead mới ở?","type":"single","options":["Thanh trên Bảng Lead","Footer","Cài đặt","SX"],"correct":[0],"explanation":"Nguồn lực."},{"id":"nl6","question":"Tối thiểu form?","type":"single","options":["Tiêu đề + Khách hàng","MST","HĐ","3D"],"correct":[0],"explanation":"Nguồn lực."},{"id":"vh7","question":"Trước Lưu?","type":"single","options":["Quét trùng","In PDF","Ký HĐ","SX"],"correct":[0],"explanation":"Vận hành."},{"id":"vh8","question":"Tiêu đề tốt?","type":"single","options":["Tên + khu vực + SP","Trống","\"KH\"","Chỉ ngày"],"correct":[0],"explanation":"Vận hành."},{"id":"bc9","question":"Sau Lưu — cột?","type":"single","options":["Mới (đầu pipeline)","Thắng","Xóa","Deal"],"correct":[0],"explanation":"Vận hành."},{"id":"bc10","question":"Bỏ Quét trùng — sửa?","type":"single","options":["Gộp Lead trùng + ghi chú","Giữ 2 Lead","Xóa","Thua"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc11","question":"Tiêu đề trống — sửa?","type":"single","options":["Sửa trong chi tiết Lead","Bỏ qua","Xóa","Blocklist"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc12","question":"Nguồn + Loại SP?","type":"single","options":["Chọn trước Lưu","Không cần","Sau 1 năm","Admin only"],"correct":[0],"explanation":"Vận hành."}]}$j_c2000003_0000_0000_0000_000000000005$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-05.png',
  $eax_c2000003_0000_0000_0000_000000000005$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-05.png","caption":"Nút + Lead mới, form, Quét trùng, Lưu."}]$eax_c2000003_0000_0000_0000_000000000005$::jsonb
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, image_url = EXCLUDED.image_url,
  attachments = EXCLUDED.attachments, updated_at = now();
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order,
  image_url, attachments
) VALUES (
  'c2000003-0000-0001-0000-000000000005',
  'b2000003-0000-0000-0000-000000000005',
  'Thực hành trên phần mềm',
  'Đánh dấu khi bạn đã thực hành được trên phần mềm thật.',
  'checklist',
  $j_c2000003_0000_0001_0000_000000000005${"items":[{"id":"c1","text":"Quét trùng trước Lưu"},{"id":"c2","text":"Tiêu đề rõ"},{"id":"c3","text":"SĐT 10 số"},{"id":"c4","text":"Nguồn + Loại SP"},{"id":"c5","text":"Lead ở cột Mới"}]}$j_c2000003_0000_0001_0000_000000000005$::jsonb,
  80,
  NULL,
  NULL,
  2,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-05.png',
  $eax_c2000003_0000_0001_0000_000000000005$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-05.png","caption":"Nút + Lead mới, form, Quét trùng, Lưu."}]$eax_c2000003_0000_0001_0000_000000000005$::jsonb
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, image_url = EXCLUDED.image_url,
  attachments = EXCLUDED.attachments, updated_at = now();
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order,
  image_url, attachments
) VALUES (
  'c2000003-0000-0000-0000-000000000006',
  'b2000003-0000-0000-0000-000000000006',
  'Kiểm tra: Chi tiết Lead — Bốn tab trên phần mềm',
  '12 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000003_0000_0000_0000_000000000006${"items":[{"id":"tt1","question":"Chi tiết Lead?","type":"single","options":["Màn hình chính với 1 KH","Chỉ KPI","Chat","Lương"],"correct":[0],"explanation":"Tư tưởng."},{"id":"tt2","question":"Sai tab?","type":"single","options":["Handover khó","Tốt","Thưởng","Bắt buộc"],"correct":[0],"explanation":"Tư tưởng."},{"id":"td3","question":"Ghi chú gọi?","type":"single","options":["Hoạt động / Nhiệm vụ","Tài liệu","Blocklist","Xóa"],"correct":[0],"explanation":"Tư duy."},{"id":"td4","question":"HĐ PDF?","type":"single","options":["Tài liệu","Chat","Không lưu","Email"],"correct":[0],"explanation":"Tư duy."},{"id":"nl5","question":"Tab Tổng quan?","type":"single","options":["6 trường + phụ trách","Chỉ chat","KPI năm","Logo"],"correct":[0],"explanation":"Nguồn lực."},{"id":"nl6","question":"Chuyển Deal nút?","type":"single","options":["Header chi tiết","Footer","Cài đặt","Báo cáo"],"correct":[0],"explanation":"Nguồn lực."},{"id":"vh7","question":"Tab Nhiệm vụ?","type":"single","options":["Tạo/hoàn thành task","Tính lương","Xóa","Blocklist"],"correct":[0],"explanation":"Nguồn lực."},{"id":"vh8","question":"Trước gọi — tab?","type":"single","options":["Hoạt động","Blocklist","Lương","Chat cty"],"correct":[0],"explanation":"Vận hành."},{"id":"bc9","question":"Upload ảnh đo?","type":"single","options":["Tài liệu","Chat riêng","Xóa","Lead khác"],"correct":[0],"explanation":"Vận hành."},{"id":"bc10","question":"Mất Lead nút?","type":"single","options":["Header (tùy quyền)","Footer","SX","Blocklist"],"correct":[0],"explanation":"Vận hành."},{"id":"bc11","question":"Ghi gọi vào Tài liệu — sửa?","type":"single","options":["Chuyển Hoạt động","Giữ","Xóa Lead","Thua"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc12","question":"Không đọc lịch sử — sửa?","type":"single","options":["Mở Hoạt động trước gọi","Bỏ qua","Xóa","Lead mới"],"correct":[0],"explanation":"Báo cáo."}]}$j_c2000003_0000_0000_0000_000000000006$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-06.png',
  $eax_c2000003_0000_0000_0000_000000000006$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-06.png","caption":"Tổng quan, Nhiệm vụ, Hoạt động, Tài liệu; nút header."}]$eax_c2000003_0000_0000_0000_000000000006$::jsonb
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, image_url = EXCLUDED.image_url,
  attachments = EXCLUDED.attachments, updated_at = now();
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order,
  image_url, attachments
) VALUES (
  'c2000003-0000-0000-0000-000000000007',
  'b2000003-0000-0000-0000-000000000007',
  'Kiểm tra: Nhiệm vụ và Hoạt động — Thao tác trên app',
  '12 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000003_0000_0000_0000_000000000007${"items":[{"id":"tt1","question":"Popup hoàn thành?","type":"single","options":["Nhắc minh chứng","Làm khó","Xóa","Blocklist"],"correct":[0],"explanation":"Tư tưởng."},{"id":"tt2","question":"Tick không ghi?","type":"single","options":["Vi phạm quy trình","OK","Thưởng","Bắt buộc"],"correct":[0],"explanation":"Tư tưởng."},{"id":"td3","question":"Hoạt động vs Nhiệm vụ?","type":"single","options":["Đã làm vs sắp làm","Giống","Không dùng","Admin"],"correct":[0],"explanation":"Tư duy."},{"id":"td4","question":"+ Hoạt động dùng?","type":"single","options":["Ghi gọi/gặp đã xong","Tạo Lead","Thua","Lương"],"correct":[0],"explanation":"Tư duy."},{"id":"nl5","question":"Tạo nhiệm vụ tab?","type":"single","options":["Nhiệm vụ","Blocklist","Lương","Chat cty"],"correct":[0],"explanation":"Nguồn lực."},{"id":"nl6","question":"Popup yêu cầu?","type":"single","options":["Ghi chú (+ file nếu cấu hình)","Chỉ tick","Xóa","Pass"],"correct":[0],"explanation":"Nguồn lực."},{"id":"vh7","question":"Timeline ở?","type":"single","options":["Tab Hoạt động","Tài liệu","Blocklist","Lương"],"correct":[0],"explanation":"Nguồn lực."},{"id":"vh8","question":"Sau gọi — làm?","type":"single","options":["+ Hoạt động ngay","Cuối tuần","Không ghi","Thua"],"correct":[0],"explanation":"Vận hành."},{"id":"bc9","question":"Hoàn thành task?","type":"single","options":["Popup + ghi chú","Chỉ tick","Xóa Lead","Blocklist"],"correct":[0],"explanation":"Vận hành."},{"id":"bc10","question":"Ảnh Zalo?","type":"single","options":["Đính kèm task/tài liệu","Chat riêng","Xóa","Email"],"correct":[0],"explanation":"Vận hành."},{"id":"bc11","question":"Gom ghi cuối ngày?","type":"single","options":["Hay quên — ghi ngay","Tốt","Thưởng","Bắt buộc"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc12","question":"Tick giả — sửa?","type":"single","options":["Mở lại + ghi thật","Giữ","Thưởng","Thua"],"correct":[0],"explanation":"Báo cáo."}]}$j_c2000003_0000_0000_0000_000000000007$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-07.png',
  $eax_c2000003_0000_0000_0000_000000000007$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-07.png","caption":"Tạo task, hoàn thành + popup ghi chú, timeline hoạt động."}]$eax_c2000003_0000_0000_0000_000000000007$::jsonb
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, image_url = EXCLUDED.image_url,
  attachments = EXCLUDED.attachments, updated_at = now();
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order,
  image_url, attachments
) VALUES (
  'c2000003-0000-0001-0000-000000000007',
  'b2000003-0000-0000-0000-000000000007',
  'Thực hành trên phần mềm',
  'Đánh dấu khi bạn đã thực hành được trên phần mềm thật.',
  'checklist',
  $j_c2000003_0000_0001_0000_000000000007${"items":[{"id":"c1","text":"Tạo nhiệm vụ có hạn"},{"id":"c2","text":"Hoàn thành + điền popup"},{"id":"c3","text":"Ghi hoạt động sau gọi"},{"id":"c4","text":"Timeline hiển thị đúng"}]}$j_c2000003_0000_0001_0000_000000000007$::jsonb,
  80,
  NULL,
  NULL,
  2,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-07.png',
  $eax_c2000003_0000_0001_0000_000000000007$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-07.png","caption":"Tạo task, hoàn thành + popup ghi chú, timeline hoạt động."}]$eax_c2000003_0000_0001_0000_000000000007$::jsonb
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, image_url = EXCLUDED.image_url,
  attachments = EXCLUDED.attachments, updated_at = now();
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order,
  image_url, attachments
) VALUES (
  'c2000003-0000-0000-0000-000000000008',
  'b2000003-0000-0000-0000-000000000008',
  'Kiểm tra: Bảng Deal và Kanban Deal',
  '12 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000003_0000_0000_0000_000000000008${"items":[{"id":"tt1","question":"Bảng Deal?","type":"single","options":["Bàn việc HĐ + tiền","Lead","Lương","Chat"],"correct":[0],"explanation":"Tư tưởng."},{"id":"tt2","question":"Thắng/Thua?","type":"single","options":["Popup riêng","Kéo bừa","Không có","Lead"],"correct":[0],"explanation":"Tư tưởng."},{"id":"td3","question":"Kanban Deal vs Lead?","type":"single","options":["Pipeline khác","Giống","Không có","Blocklist"],"correct":[0],"explanation":"Tư duy."},{"id":"td4","question":"Sau Chuyển Deal mở?","type":"single","options":["Bảng Deal","Lead only","Blocklist","Lương"],"correct":[0],"explanation":"Tư duy."},{"id":"nl5","question":"Bảng Deal menu?","type":"single","options":["CRM → Bảng Deal","Công việc","Kiến thức","SX"],"correct":[0],"explanation":"Nguồn lực."},{"id":"nl6","question":"Thắng popup?","type":"single","options":["Tạo dự án SX","Xóa","Lead","Blocklist"],"correct":[0],"explanation":"Nguồn lực."},{"id":"vh7","question":"Thua popup?","type":"single","options":["Chọn lý do","Im lặng","Xóa","Lead mới"],"correct":[0],"explanation":"Nguồn lực."},{"id":"vh8","question":"Kéo Deal?","type":"single","options":["Đổi giai đoạn","Xóa","In lương","Blocklist"],"correct":[0],"explanation":"Vận hành."},{"id":"bc9","question":"Lọc Deal?","type":"single","options":["Deal của tôi","Ẩn hết","Xóa","Thua"],"correct":[0],"explanation":"Vận hành."},{"id":"bc10","question":"Thắng không popup?","type":"single","options":["Sai — chạy popup","OK","Thưởng","Bắt buộc"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc11","question":"Thua không lý do — sửa?","type":"single","options":["Mở Deal chọn lý do","Xóa","Thắng","Lead"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc12","question":"Gate task Deal?","type":"single","options":["Có thể chặn kéo","Không","Lead only","Chat"],"correct":[0],"explanation":"Vận hành."}]}$j_c2000003_0000_0000_0000_000000000008$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-08.png',
  $eax_c2000003_0000_0000_0000_000000000008$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-08.png","caption":"CRM → Bảng Deal, kéo thẻ, Thắng/Thua popup."}]$eax_c2000003_0000_0000_0000_000000000008$::jsonb
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, image_url = EXCLUDED.image_url,
  attachments = EXCLUDED.attachments, updated_at = now();
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order,
  image_url, attachments
) VALUES (
  'c2000003-0000-0000-0000-000000000009',
  'b2000003-0000-0000-0000-000000000009',
  'Kiểm tra: Chi tiết Deal — Báo giá, Tài liệu, Thắng/Thua',
  '12 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000003_0000_0000_0000_000000000009${"items":[{"id":"tt1","question":"Deal chi tiết?","type":"single","options":["Hồ sơ pháp lý + kỹ thuật","Chỉ chat","Lead","Lương"],"correct":[0],"explanation":"Tư tưởng."},{"id":"tt2","question":"File chỉ Zalo?","type":"single","options":["Xưởng không thấy trên app","Tốt","Thưởng","Bắt buộc"],"correct":[0],"explanation":"Tư tưởng."},{"id":"td3","question":"BG tab?","type":"single","options":["Báo giá","Blocklist","Lương","Chat cty"],"correct":[0],"explanation":"Tư duy."},{"id":"td4","question":"HĐ scan tab?","type":"single","options":["Tài liệu","Lead","Chat","Xóa"],"correct":[0],"explanation":"Tư duy."},{"id":"nl5","question":"Trước Thắng?","type":"single","options":["Upload HĐ + cọc","Kéo luôn","Thua","Lead"],"correct":[0],"explanation":"Vận hành."},{"id":"nl6","question":"Popup Thắng sau?","type":"single","options":["Tạo dự án","Xóa Deal","Blocklist","Lead"],"correct":[0],"explanation":"Vận hành."},{"id":"vh7","question":"Nhiệm vụ Deal?","type":"single","options":["Gate kéo cột","Không","Lead only","Chat"],"correct":[0],"explanation":"Nguồn lực."},{"id":"vh8","question":"Tên file HĐ?","type":"single","options":["HD_TenKH_YYYY-MM.pdf","a.pdf","1.jpg","tmp"],"correct":[0],"explanation":"Vận hành."},{"id":"bc9","question":"Thắng trước upload — sửa?","type":"single","options":["Upload + kéo lại đúng","Giữ Thắng","Thua","Xóa"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc10","question":"CK ảnh mờ?","type":"single","options":["Yêu cầu KH gửi lại","Vẫn Thắng","Xóa","Lead"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc11","question":"Tab Nhiệm vụ Deal?","type":"single","options":["Task gate","Lương","Blocklist","Lead"],"correct":[0],"explanation":"Nguồn lực."},{"id":"bc12","question":"Thua trên app?","type":"single","options":["Kéo cột + chọn lý do","Xóa","Im lặng","Lead mới"],"correct":[0],"explanation":"Vận hành."}]}$j_c2000003_0000_0000_0000_000000000009$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-09.png',
  $eax_c2000003_0000_0000_0000_000000000009$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-09.png","caption":"Tab trên Deal, upload HĐ/cọc, thao tác header."}]$eax_c2000003_0000_0000_0000_000000000009$::jsonb
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, image_url = EXCLUDED.image_url,
  attachments = EXCLUDED.attachments, updated_at = now();
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order,
  image_url, attachments
) VALUES (
  'c2000003-0000-0001-0000-000000000009',
  'b2000003-0000-0000-0000-000000000009',
  'Thực hành trên phần mềm',
  'Đánh dấu khi bạn đã thực hành được trên phần mềm thật.',
  'checklist',
  $j_c2000003_0000_0001_0000_000000000009${"items":[{"id":"c1","text":"BG trên tab Báo giá/Tài liệu"},{"id":"c2","text":"HĐ + CK uploaded"},{"id":"c3","text":"Nhiệm vụ gate xong"},{"id":"c4","text":"Thắng + popup dự án"}]}$j_c2000003_0000_0001_0000_000000000009$::jsonb,
  80,
  NULL,
  NULL,
  2,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-09.png',
  $eax_c2000003_0000_0001_0000_000000000009$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-09.png","caption":"Tab trên Deal, upload HĐ/cọc, thao tác header."}]$eax_c2000003_0000_0001_0000_000000000009$::jsonb
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, image_url = EXCLUDED.image_url,
  attachments = EXCLUDED.attachments, updated_at = now();
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order,
  image_url, attachments
) VALUES (
  'c2000003-0000-0000-0000-000000000010',
  'b2000003-0000-0000-0000-000000000010',
  'Kiểm tra: Dashboard CRM — Đọc số liệu nhanh',
  '12 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000003_0000_0000_0000_000000000010${"items":[{"id":"tt1","question":"Dashboard phản ánh?","type":"single","options":["Hành vi ghi trên CRM","Sổ tay","Zalo","Blocklist"],"correct":[0],"explanation":"Tư tưởng."},{"id":"tt2","question":"Số dashboard sai?","type":"single","options":["Thường do ghi CRM sai/thiếu","Lỗi trời","Thưởng","Bắt buộc"],"correct":[0],"explanation":"Tư tưởng."},{"id":"td3","question":"Garbage in garbage out?","type":"single","options":["Ghi sai → dashboard sai","Không","Chat","Lead"],"correct":[0],"explanation":"Tư duy."},{"id":"td4","question":"Dashboard vs Bảng Lead?","type":"single","options":["Dashboard tổng; Bảng chi tiết","Giống","Không","Blocklist"],"correct":[0],"explanation":"Tư duy."},{"id":"nl5","question":"Dashboard menu?","type":"single","options":["CRM → Dashboard","Lead","Lương","Blocklist"],"correct":[0],"explanation":"Nguồn lực."},{"id":"nl6","question":"Xem tất cả Lead?","type":"single","options":["Link sang Bảng Lead","Xóa","Thua","Chat"],"correct":[0],"explanation":"Nguồn lực."},{"id":"vh7","question":"Lọc thời gian?","type":"single","options":["Tháng/quý","Không","Màu tủ","Blocklist"],"correct":[0],"explanation":"Nguồn lực."},{"id":"vh8","question":"Đầu tuần nên?","type":"single","options":["Mở Dashboard + Bảng điểm","Bỏ qua","Xóa CRM","Thua"],"correct":[0],"explanation":"Vận hành."},{"id":"bc9","question":"SLA trên Dashboard?","type":"single","options":["Có thể hiện Lead trễ","Không","Lead only","Chat"],"correct":[0],"explanation":"Vận hành."},{"id":"bc10","question":"Số thấp — sửa?","type":"single","options":["Ghi CRM đúng + xử Lead trễ","Báo cáo giả","Tắt CRM","Thua"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc11","question":"Chỉ nhìn tổng — thiếu?","type":"single","options":["Drill-down Bảng chi tiết","Không thiếu","Chat","Blocklist"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc12","question":"Bảng điểm cá nhân?","type":"single","options":["So với Dashboard tuần","Không liên quan","Xóa","Lead"],"correct":[0],"explanation":"Vận hành."}]}$j_c2000003_0000_0000_0000_000000000010$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-10.png',
  $eax_c2000003_0000_0000_0000_000000000010$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-10.png","caption":"Tab Lead/Deal, KPI tổng, lọc thời gian — báo cáo trên app."}]$eax_c2000003_0000_0000_0000_000000000010$::jsonb
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, image_url = EXCLUDED.image_url,
  attachments = EXCLUDED.attachments, updated_at = now();
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order,
  image_url, attachments
) VALUES (
  'c2000003-0000-0000-0000-000000000011',
  'b2000003-0000-0000-0000-000000000011',
  'Kiểm tra: Chat, Sự kiện và Đang hoạt động',
  '12 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000003_0000_0000_0000_000000000011${"items":[{"id":"tt1","question":"Chat CRM gắn?","type":"single","options":["Lead/Deal context","Chỉ công ty","Blocklist","Lương"],"correct":[0],"explanation":"Tư tưởng."},{"id":"tt2","question":"Chat thay hồ sơ chính?","type":"single","options":["Không","Có","Bắt buộc","Thưởng"],"correct":[0],"explanation":"Tư tưởng."},{"id":"td3","question":"Chat vs Hoạt động?","type":"single","options":["Chat nội bộ nhanh; Hoạt động hồ sơ KH","Giống","Không","Blocklist"],"correct":[0],"explanation":"Tư duy."},{"id":"td4","question":"Chốt giá trong chat?","type":"single","options":["Copy sang Hoạt động + BG","Đủ rồi","Xóa","Thua"],"correct":[0],"explanation":"Tư duy."},{"id":"nl5","question":"@mention dùng?","type":"single","options":["Hỏi đồng nghiệp trên Deal","Xóa","Blocklist","Lương"],"correct":[0],"explanation":"Nguồn lực."},{"id":"nl6","question":"Sự kiện nội bộ?","type":"single","options":["RSVP trên app","Không cần","Lead","Thua"],"correct":[0],"explanation":"Nguồn lực."},{"id":"vh7","question":"Đang hoạt động?","type":"single","options":["Ai online/xử lý KH","Lương","Blocklist","BG"],"correct":[0],"explanation":"Nguồn lực."},{"id":"vh8","question":"Thỏa thuận KH sau chat?","type":"single","options":["Ghi Hoạt động + file","Chỉ chat","Thua","Xóa"],"correct":[0],"explanation":"Vận hành."},{"id":"bc9","question":"Bỏ RSVP — sửa?","type":"single","options":["RSVP trễ + tham dự nếu còn","Bỏ qua","Thua","Lead"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc10","question":"Chỉ chat không hồ sơ — sửa?","type":"single","options":["Bổ sung Hoạt động/Tài liệu","OK","Thưởng","Blocklist"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc11","question":"Chat trên chi tiết Deal?","type":"single","options":["Có panel chat","Không","Lead only","Blocklist"],"correct":[0],"explanation":"Nguồn lực."},{"id":"bc12","question":"Online list giúp?","type":"single","options":["Biết ai hỗ trợ","Lương","Thua","Xóa"],"correct":[0],"explanation":"Vận hành."}]}$j_c2000003_0000_0000_0000_000000000011$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-11.png',
  $eax_c2000003_0000_0000_0000_000000000011$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-11.png","caption":"Chat theo Lead/Deal, lịch nội bộ, ai đang online."}]$eax_c2000003_0000_0000_0000_000000000011$::jsonb
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, image_url = EXCLUDED.image_url,
  attachments = EXCLUDED.attachments, updated_at = now();
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order,
  image_url, attachments
) VALUES (
  'c2000003-0000-0000-0000-000000000012',
  'b2000003-0000-0000-0000-000000000012',
  'Kiểm tra: CRM Mobile và Ôn tập thao tác',
  '12 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000003_0000_0000_0000_000000000012${"items":[{"id":"tt1","question":"Mobile CRM?","type":"single","options":["CRM trong túi","Khác hệ","Không dùng","Blocklist"],"correct":[0],"explanation":"Tư tưởng."},{"id":"tt2","question":"Ghi muộn?","type":"single","options":["Hay quên, KPI/KH thiệt","Tốt","Thưởng","Bắt buộc"],"correct":[0],"explanation":"Tư tưởng."},{"id":"td3","question":"Mobile vs web?","type":"single","options":["Cùng dữ liệu","Riêng","Không sync","Lead only"],"correct":[0],"explanation":"Tư duy."},{"id":"td4","question":"Hiện trường nên?","type":"single","options":["Hoạt động + ảnh ngay","Về VP","Thua","Chat riêng"],"correct":[0],"explanation":"Vận hành."},{"id":"nl5","question":"Ôn tập gồm?","type":"single","options":["Lead + Deal + Dashboard","Chỉ chat","Blocklist","Lương"],"correct":[0],"explanation":"Tư duy."},{"id":"nl6","question":"Mobile xem Lead?","type":"single","options":["Có","Không","Admin only","Deal only"],"correct":[0],"explanation":"Nguồn lực."},{"id":"vh7","question":"Ảnh hiện trường?","type":"single","options":["Upload Tài liệu/Hoạt động","Chỉ gallery máy","Xóa","Email"],"correct":[0],"explanation":"Vận hành."},{"id":"vh8","question":"Checklist cuối khoá?","type":"single","options":["Tự làm không nhìn tài liệu","Bỏ qua","Thua","Lead mới"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc9","question":"Quên ghi hiện trường — sửa?","type":"single","options":["Bổ sung ngay khi nhớ","Bỏ qua","Thua","Xóa"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc10","question":"End-to-end Lead?","type":"single","options":["Tạo→tab→task→Kanban","Chỉ chat","Blocklist","Thua"],"correct":[0],"explanation":"Vận hành."},{"id":"bc11","question":"End-to-end Deal?","type":"single","options":["Upload→Thắng popup","Lead only","Xóa","Blocklist"],"correct":[0],"explanation":"Vận hành."},{"id":"bc12","question":"Bảng điểm ôn tập?","type":"single","options":["Xem KPI cá nhân","Không","Chat","Lead"],"correct":[0],"explanation":"Báo cáo."}]}$j_c2000003_0000_0000_0000_000000000012$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-12.png',
  $eax_c2000003_0000_0000_0000_000000000012$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-12.png","caption":"App di động cơ bản; checklist end-to-end Lead + Deal trên app."}]$eax_c2000003_0000_0000_0000_000000000012$::jsonb
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, image_url = EXCLUDED.image_url,
  attachments = EXCLUDED.attachments, updated_at = now();
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order,
  image_url, attachments
) VALUES (
  'c2000003-0000-0001-0000-000000000012',
  'b2000003-0000-0000-0000-000000000012',
  'Thực hành trên phần mềm',
  'Đánh dấu khi bạn đã thực hành được trên phần mềm thật.',
  'checklist',
  $j_c2000003_0000_0001_0000_000000000012${"items":[{"id":"c1","text":"Đăng nhập web + mobile"},{"id":"c2","text":"Tạo Lead + Quét trùng"},{"id":"c3","text":"4 tab + task + hoạt động"},{"id":"c4","text":"Bảng Deal + upload + Thắng popup"},{"id":"c5","text":"Mở Dashboard + Bảng điểm"}]}$j_c2000003_0000_0001_0000_000000000012$::jsonb,
  80,
  NULL,
  NULL,
  2,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-12.png',
  $eax_c2000003_0000_0001_0000_000000000012$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-12.png","caption":"App di động cơ bản; checklist end-to-end Lead + Deal trên app."}]$eax_c2000003_0000_0001_0000_000000000012$::jsonb
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, image_url = EXCLUDED.image_url,
  attachments = EXCLUDED.attachments, updated_at = now();
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order,
  image_url, attachments
) VALUES (
  'c2000003-0000-0000-0000-000000000099',
  'b2000003-0000-0000-0000-000000000013',
  'Bài thi tổng kết khoá',
  '20 câu — 30 phút — đạt 80% — tối đa 3 lượt. Phủ đủ 5 trụ.',
  'quiz',
  $j_c2000003_0000_0000_0000_000000000099${"items":[{"id":"fq1","question":"Thao tác quan trọng?","type":"single","options":["Trên CRM","Sổ tay","Zalo KH","Excel"],"correct":[0],"explanation":"Tư tưởng."},{"id":"fq2","question":"App Switcher?","type":"single","options":["Chuyển module","Xóa","Thua","Blocklist"],"correct":[0],"explanation":"Nguồn lực."},{"id":"fq3","question":"Quét trùng?","type":"single","options":["Trước Lưu Lead","Sau 1 năm","Deal","Thua"],"correct":[0],"explanation":"Vận hành."},{"id":"fq4","question":"4 tab Lead?","type":"single","options":["Tổng quan, NV, HD, TL","Chỉ chat","2 tab","Blocklist"],"correct":[0],"explanation":"Nguồn lực."},{"id":"fq5","question":"Hoàn thành task?","type":"single","options":["Popup ghi chú","Chỉ tick","Xóa","Thua"],"correct":[0],"explanation":"Vận hành."},{"id":"fq6","question":"Bảng Deal?","type":"single","options":["CRM → Bảng Deal","Lead","Lương","Blocklist"],"correct":[0],"explanation":"Nguồn lực."},{"id":"fq7","question":"Thắng Deal?","type":"single","options":["Popup dự án SX","Xóa","Lead","Blocklist"],"correct":[0],"explanation":"Vận hành."},{"id":"fq8","question":"Thua Deal?","type":"single","options":["Lý do bắt buộc","Im lặng","Xóa","Lead mới"],"correct":[0],"explanation":"Báo cáo."},{"id":"fq9","question":"Pass CRM?","type":"single","options":["Không chia sẻ","Zalo OK","Dán màn hình","Chung team"],"correct":[0],"explanation":"Báo cáo."},{"id":"fq10","question":"Dashboard?","type":"single","options":["Số từ CRM","Sổ tay","Zalo","Blocklist"],"correct":[0],"explanation":"Báo cáo."},{"id":"fq11","question":"Chat vs hồ sơ?","type":"single","options":["Chat nội bộ; KH lên Hoạt động/TL","Giống","Chỉ chat","Blocklist"],"correct":[0],"explanation":"Tư duy."},{"id":"fq12","question":"Mobile?","type":"single","options":["Ghi tại chỗ","Khác data","Không","Lead only"],"correct":[0],"explanation":"Vận hành."},{"id":"fq13","question":"Kanban Lead?","type":"single","options":["Kéo giai đoạn","In PDF","Lương","Blocklist"],"correct":[0],"explanation":"Vận hành."},{"id":"fq14","question":"Badge đỏ?","type":"single","options":["SLA","Thắng","VIP","Xóa"],"correct":[0],"explanation":"Nguồn lực."},{"id":"fq15","question":"Pin module?","type":"single","options":["Vào nhanh","Xóa CRM","Thua","Blocklist"],"correct":[0],"explanation":"Nguồn lực."},{"id":"fq16","question":"Upload HĐ Deal?","type":"single","options":["Tài liệu","Chat riêng","Lead","Xóa"],"correct":[0],"explanation":"Vận hành."},{"id":"fq17","question":"Thiết bị lạ?","type":"single","options":["Đăng xuất + đổi pass","Bỏ qua","Thua","Lead"],"correct":[0],"explanation":"Báo cáo."},{"id":"fq18","question":"5 trụ?","type":"single","options":["TT, TD, NL, VH, BC","Chỉ Kanban","Chat","Lead"],"correct":[0],"explanation":"Tư tưởng."},{"id":"fq19","question":"Ghi sai tab?","type":"single","options":["Sửa đúng tab","OK","Thưởng","Thua"],"correct":[0],"explanation":"Báo cáo."},{"id":"fq20","question":"Ôn tập cuối?","type":"single","options":["Checklist end-to-end","Bỏ qua","Blocklist","Thua"],"correct":[0],"explanation":"Báo cáo."}]}$j_c2000003_0000_0000_0000_000000000099$::jsonb,
  80,
  3,
  30,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-13.png',
  $eax_c2000003_0000_0000_0000_000000000099$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/guide-13.png","caption":"Bài thi tổng kết khoá — đạt yêu cầu để nhận chứng nhận."}]$eax_c2000003_0000_0000_0000_000000000099$::jsonb
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, image_url = EXCLUDED.image_url,
  attachments = EXCLUDED.attachments, updated_at = now();
COMMIT;
