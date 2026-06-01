-- 278
-- Hướng dẫn kênh nội bộ
-- Seed collab guide — Sự kiện, Chat, Bảng tin, Ghi âm
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
  'd2000004-0000-0000-0000-000000000001',
  'Hướng dẫn — Sự kiện, Chat, Bảng tin & Ghi âm',
  'huong-dan-su-kien-chat-bang-tin',
  'Thao tác 4 kênh nội bộ: Sự kiện, Nhóm chat (trang đầy đủ & bong bóng), Bảng tin nội bộ, Cuộc gọi & ghi âm. Khung 5 trụ — giọng giảng viên, có ảnh minh họa.',
  '💬',
  8,
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, icon = EXCLUDED.icon, is_active = true;

UPDATE knowledge_categories SET
  deadline_mode = 'relative',
  deadline_duration_days = 14,
  deadline_note = 'Hoàn thành khoá trong 14 ngày',
  require_all_exercises_passed = true
WHERE id = 'd2000004-0000-0000-0000-000000000001';

-- BÀI HỌC
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  video_url, video_type, cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000004-0000-0000-0000-000000000001',
  'd2000004-0000-0000-0000-000000000001',
  'TT 1: Vì sao cần 4 kênh nội bộ trên CRM',
  'Sự kiện, chat, bảng tin, ghi âm — một hệ sinh thái, không thay bằng Zalo riêng.',
  $md_b2000004_0000_0000_0000_000000000001$# TT 1: Vì sao cần 4 kênh nội bộ trên CRM

> _Anh Tuấn hỏi giá trên Zalo cá nhân — đồng nghiệp không thấy, sếp không đo KPI. **Mọi việc quan trọng phải trên app.**_

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Bạn là **mắt xích** giữa khách hàng và công ty — ghi nhận trên hệ thống = minh bạch.

- **Sự kiện** — lịch gặp khách, họp, khảo sát có chứng cứ.
- **Chat** — trao đổi nhanh, gắn Lead/Deal, không mất tin.
- **Bảng tin** — thông báo chính thức, văn hóa công ty.
- **Ghi âm** — cuộc gọi có file, đối soát tranh chấp.

## 2. Tư duy — Cách nghĩ trước khi làm

- **Trang đầy đủ** _(menu Sidebar)_ vs **Bong bóng / thanh nhanh** _(góc màn hình)_

**Mental model:** Zalo cá nhân = **sổ tay riêng**; CRM = **sổ công ty** — hai thứ khác nhau.

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** Sidebar CRM → **Sự kiện · Nhóm chat · Bảng tin nội bộ · Cuộc gọi & ghi âm**

- Sidebar trái
- Thanh nhanh (SX/VC)
- Bong bóng chat góc phải
- Thông báo chuông


![Sự kiện, chat, bảng tin, ghi âm — một hệ sinh thái, không thay bằng Zalo riêng.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-01.png)
## 4. Vận hành — Làm theo từng bước

1. Mở CRM → nhìn Sidebar — tìm 4 mục trên.
2. Hỏi bản thân: việc này thuộc **Sự kiện**, **Chat**, **Bảng tin** hay **Ghi âm**?
3. Ghi trên app **trước khi** chuyển sang Zalo cá nhân.


> **Mẹo của mentor:** Quy tắc 30 giây: không tìm thấy trên CRM trong 30 giây → hỏi mentor đường menu.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi


**Lỗi thường gặp:**
- Chỉ chat Zalo, không ghi CRM.
- Tạo sự kiện ngoài lịch công ty.


**Tín hiệu KPI bạn theo dõi:** Tỉ lệ cuộc gọi có ghi âm gắn Lead; sự kiện hoàn thành đúng hạn.

## Tóm tắt 30 giây

4 kênh nội bộ thay Zalo riêng — mọi việc quan trọng trên CRM.$md_b2000004_0000_0000_0000_000000000001$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-01.png',
  $att_b2000004_0000_0000_0000_000000000001$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-01.png","caption":"Sự kiện, chat, bảng tin, ghi âm — một hệ sinh thái, không thay bằng Zalo riêng."}]$att_b2000004_0000_0000_0000_000000000001$::jsonb,
  8,
  ARRAY['collab', 'noi-bo', '5-tru', 'tt-1'],
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
  'b2000004-0000-0000-0000-000000000002',
  'd2000004-0000-0000-0000-000000000001',
  'TT 2: Đường vào — Sidebar và thanh nhanh',
  'Menu trái CRM; thanh nhanh ở dashboard SX/VC.',
  $md_b2000004_0000_0000_0000_000000000002$# TT 2: Đường vào — Sidebar và thanh nhanh

> _Cùng một tính năng — mở được từ **Sidebar** hoặc **icon hàng loạt** trên dashboard Xưởng._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Biết **2 đường vào** = tiết kiệm thời gian mỗi ngày.

- Sidebar ổn định trên mọi trang CRM.

## 2. Tư duy — Cách nghĩ trước khi làm

| Cách mở | Khi nào dùng |
|---|---|
| **Sidebar → Sự kiện** | Làm việc sâu, lọc lịch |
| **Thanh nhanh (icon)** | Đang ở dashboard SX/VC, cần mở nhanh |

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** **CRM → Sidebar** hoặc **Xưởng SX / VC → Dashboard → thanh icon**

- Sự kiện
- Bảng tin
- Tin nhắn
- Có gì mới (cập nhật phần mềm)


![Menu trái CRM; thanh nhanh ở dashboard SX/VC.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-02.png)
## 4. Vận hành — Làm theo từng bước

1. Sidebar → **Sự kiện** (`/crm/events`).
2. Sidebar → **Nhóm chat** (`/crm/messenger`).
3. Sidebar → **Bảng tin nội bộ** (`/social`).
4. Sidebar → **Cuộc gọi & ghi âm** (`/tools/voice-recordings`).
5. Thử **Xưởng VC → Dashboard** → icon Bảng tin / Sự kiện.


> **Mẹo của mentor:** Bookmark 4 URL trên trình duyệt nếu hay dùng.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi


**Lỗi thường gặp:**
- Tìm mãi vì không biết Sidebar.

## Tóm tắt 30 giây

Sidebar CRM + thanh nhanh SX/VC — cùng 4 kênh.$md_b2000004_0000_0000_0000_000000000002$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-02.png',
  $att_b2000004_0000_0000_0000_000000000002$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-02.png","caption":"Menu trái CRM; thanh nhanh ở dashboard SX/VC."}]$att_b2000004_0000_0000_0000_000000000002$::jsonb,
  8,
  ARRAY['collab', 'noi-bo', '5-tru', 'tt-2'],
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
  'b2000004-0000-0000-0000-000000000003',
  'd2000004-0000-0000-0000-000000000001',
  'TT 3: Sự kiện — trang đầy đủ & lịch tháng',
  'CRM → Sự kiện; tab Lịch; lọc khối Kinh doanh / SX / VC.',
  $md_b2000004_0000_0000_0000_000000000003$# TT 3: Sự kiện — trang đầy đủ & lịch tháng

> _Sáng mai có **3 cuộc khảo sát** — mở **Sự kiện → Lịch** là thấy cả tuần._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Sự kiện = **cam kết thời gian** với khách và nội bộ — có ngày giờ, có người tham gia.

- Không dùng lịch giấy — tránh trùng lịch team.

## 2. Tư duy — Cách nghĩ trước khi làm

- **Lịch tháng** _(nhìn tổng)_ vs **Feed danh sách** _(lọc chi tiết)_

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** **CRM → Sự kiện** (`/crm/events`)

- Tab Lịch
- Lọc khối (Kinh doanh, SX, VC, Chung)
- Lọc công ty / nhân viên (admin)
- Tìm kiếm


![CRM → Sự kiện; tab Lịch; lọc khối Kinh doanh / SX / VC.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-03.png)
## 4. Vận hành — Làm theo từng bước

1. Sidebar → **Sự kiện**.
2. Tab **Lịch** — xem tháng hiện tại.
3. Lọc **Khối Kinh doanh** nếu bạn sales.
4. Click một ô ngày — xem sự kiện trong ngày.
5. Badge màu = trạng thái (kế hoạch / đang / xong).


> **Mẹo của mentor:** Màu đỏ / quá hạn — xử lý trước khi tạo sự kiện mới.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi


**Lỗi thường gặp:**
- Không lọc khối — nhầm sự kiện xưởng.


**Tín hiệu KPI bạn theo dõi:** Sự kiện hoàn thành đúng trạng thái.

## Tóm tắt 30 giây

Sự kiện → Lịch tháng + lọc khối — biết việc cả tuần.$md_b2000004_0000_0000_0000_000000000003$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-03.png',
  $att_b2000004_0000_0000_0000_000000000003$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-03.png","caption":"CRM → Sự kiện; tab Lịch; lọc khối Kinh doanh / SX / VC."}]$att_b2000004_0000_0000_0000_000000000003$::jsonb,
  10,
  ARRAY['collab', 'noi-bo', '5-tru', 'tt-3'],
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
  'b2000004-0000-0000-0000-000000000004',
  'd2000004-0000-0000-0000-000000000001',
  'TT 4: Sự kiện — tạo, tham gia, bình luận',
  'Tạo sự kiện; xác nhận tham gia; bình luận; đổi trạng thái.',
  $md_b2000004_0000_0000_0000_000000000004$# TT 4: Sự kiện — tạo, tham gia, bình luận

> _Khách hẹn **14h khảo sát** — tạo sự kiện gắn địa chỉ, mời đồng nghiệp, họ **xác nhận tham gia** trên app._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Người tạo sự kiện **chịu trách nhiệm** cập nhật trạng thái sau khi làm xong.

- Bình luận trên sự kiện = biên bản ngắn, không mất trên Zalo.

## 2. Tư duy — Cách nghĩ trước khi làm

- **planned** → **in_progress** → **completed** / **cancelled**

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** Trang Sự kiện — nút **+ Tạo sự kiện**

- Form tạo
- Danh sách tham gia
- Bình luận
- Gắn Lead/Deal (khi có)


![Tạo sự kiện; xác nhận tham gia; bình luận; đổi trạng thái.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-04.png)
## 4. Vận hành — Làm theo từng bước

1. **+ Tạo sự kiện** — tiêu đề, giờ, địa điểm, khối.
2. Chọn **người tham gia**.
3. Gửi — thành viên nhận thông báo.
4. Người được mời → **Xác nhận / Từ chối**.
5. Sau buổi gặp → đổi **Hoàn thành** + ghi **bình luận** kết quả.


> **Mẹo của mentor:** Hủy sự kiện phải ghi lý do — tránh hiểu nhầm với khách.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi


**Lỗi thường gặp:**
- Quên đổi trạng thái completed.
- Chỉ chat, không bình luận trên sự kiện.

## Tóm tắt 30 giây

Tạo sự kiện, mời người, xác nhận, hoàn thành + bình luận.$md_b2000004_0000_0000_0000_000000000004$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-04.png',
  $att_b2000004_0000_0000_0000_000000000004$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-04.png","caption":"Tạo sự kiện; xác nhận tham gia; bình luận; đổi trạng thái."}]$att_b2000004_0000_0000_0000_000000000004$::jsonb,
  10,
  ARRAY['collab', 'noi-bo', '5-tru', 'tt-4'],
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
  'b2000004-0000-0000-0000-000000000005',
  'd2000004-0000-0000-0000-000000000001',
  'TT 5: Cuộc gọi & ghi âm — trang đầy đủ',
  'Sidebar → Cuộc gọi & ghi âm; danh sách file; lọc theo nhân viên.',
  $md_b2000004_0000_0000_0000_000000000005$# TT 5: Cuộc gọi & ghi âm — trang đầy đủ

> _Khách khiếu nại «anh hứa giá X» — mở **Ghi âm**, nghe lại, **đối soát** trong 1 phút._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Ghi âm bảo vệ **bạn và công ty** — không phải để «bắt bẻ» nhau.

- Cuộc gọi quan trọng nên có file trên hệ thống.

## 2. Tư duy — Cách nghĩ trước khi làm

- **Ghi trực tiếp trên web** vs **Upload file** từ máy / tổng đài

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** **Cuộc gọi & ghi âm** (`/tools/voice-recordings`)

- Danh sách bản ghi
- Nghe / tải
- Ghi mới (mic)
- Upload
- Lọc nhân viên (admin)


![Sidebar → Cuộc gọi & ghi âm; danh sách file; lọc theo nhân viên.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-05.png)
## 4. Vận hành — Làm theo từng bước

1. Sidebar → **Cuộc gọi & ghi âm**.
2. Xem danh sách — sắp xếp mới nhất.
3. Bấm **Play** nghe thử.
4. Admin: lọc theo **nhân viên** để hỗ trợ.
5. Ghi chú SĐT / hướng gọi đến-đi nếu có.


> **Mẹo của mentor:** Sau cuộc gọi quan trọng — upload hoặc ghi ngay, đừng để cuối ngày.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi


**Lỗi thường gặp:**
- Không ghi âm — tranh cãi không chứng cứ.


**Tín hiệu KPI bạn theo dõi:** Tỉ lệ cuộc gọi sales có file gắn Lead.

## Tóm tắt 30 giây

Trang ghi âm — danh sách, nghe, ghi/upload; admin lọc NV.$md_b2000004_0000_0000_0000_000000000005$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-05.png',
  $att_b2000004_0000_0000_0000_000000000005$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-05.png","caption":"Sidebar → Cuộc gọi & ghi âm; danh sách file; lọc theo nhân viên."}]$att_b2000004_0000_0000_0000_000000000005$::jsonb,
  10,
  ARRAY['collab', 'noi-bo', '5-tru', 'tt-5'],
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
  'b2000004-0000-0000-0000-000000000006',
  'd2000004-0000-0000-0000-000000000001',
  'TT 6: Ghi âm — gắn Lead, lịch âm thanh',
  'Liên kết bản ghi với Lead/Deal; lịch theo ngày; quét SĐT.',
  $md_b2000004_0000_0000_0000_000000000006$# TT 6: Ghi âm — gắn Lead, lịch âm thanh

> _File ghi âm **không gắn Lead** = đồng nghiệp mở Lead không nghe được cuộc gọi đó._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Gắn Lead = **nối giọng nói với hành trình khách**.

- Một khách — một timeline: nhiệm vụ + ghi âm + sự kiện.

## 2. Tư duy — Cách nghĩ trước khi làm

**Mental model:** Ghi âm là **Hoạt động có file đính kèm** — phải nằm đúng Lead.

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** Trang ghi âm — cột **Gắn Lead** / **Liên kết CRM**

- Tìm Lead theo SĐT
- Lịch âm thanh (calendar panel)
- Ghi chú cuộc gọi


![Liên kết bản ghi với Lead/Deal; lịch theo ngày; quét SĐT.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-06.png)
## 4. Vận hành — Làm theo từng bước

1. Sau ghi/upload → **Gắn Lead** (tìm mã hoặc SĐT).
2. Mở Lead → tab **Hoạt động** — thấy file.
3. Dùng **lịch** trên trang ghi âm xem theo ngày.
4. Ghi **ghi chú** ngắn: khách hỏi gì, cam kết gì.


> **Mẹo của mentor:** Quét SĐT trùng Lead trước khi gắn — tránh gắn nhầm khách.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi


**Lỗi thường gặp:**
- File nổi không gắn Lead.
- Gắn nhầm SĐT.

## Tóm tắt 30 giây

Gắn mọi file quan trọng vào Lead; kiểm trên Hoạt động.$md_b2000004_0000_0000_0000_000000000006$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-06.png',
  $att_b2000004_0000_0000_0000_000000000006$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-06.png","caption":"Liên kết bản ghi với Lead/Deal; lịch theo ngày; quét SĐT."}]$att_b2000004_0000_0000_0000_000000000006$::jsonb,
  10,
  ARRAY['collab', 'noi-bo', '5-tru', 'tt-6'],
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
  'b2000004-0000-0000-0000-000000000007',
  'd2000004-0000-0000-0000-000000000001',
  'TT 7: Nhóm chat — trang đầy đủ',
  '/crm/messenger — danh sách hội thoại, nhóm, tìm kiếm.',
  $md_b2000004_0000_0000_0000_000000000007$# TT 7: Nhóm chat — trang đầy đủ

> _Cần hỏi kỹ thuật **ngay** — mở **Nhóm chat** toàn màn hình, tìm nhóm «Kỹ thuật Q7», gửi ảnh hiện trường._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Chat nội bộ **không thay** ghi chú trên Lead — bổ sung trao đổi nhanh.

- Tin quan trọng vẫn tóm tắt lên Lead sau chat.

## 2. Tư duy — Cách nghĩ trước khi làm

- **Trang /crm/messenger** _(nhiều hội thoại)_ vs **Bong bóng** _(1–2 cửa sổ nhỏ)_

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** **Nhóm chat** (`/crm/messenger`) — layout 3 cột

- Danh sách hội thoại
- Khung chat giữa
- Panel thành viên / media
- Tìm kiếm
- Ghim hội thoại


![/crm/messenger — danh sách hội thoại, nhóm, tìm kiếm.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-07.png)
## 4. Vận hành — Làm theo từng bước

1. Sidebar → **Nhóm chat**.
2. Chọn hội thoại bên trái.
3. Gõ tin + **Enter** gửi.
4. Đính kèm **ảnh / file** (icon kẹp).
5. **Ghim** hội thoại hay dùng lên đầu.


> **Mẹo của mentor:** Tên nhóm rõ ràng — «Kỹ thuật Q7» tốt hơn «Nhóm 1».

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi


**Lỗi thường gặp:**
- Chỉ chat, không tóm tắt lên Lead.

## Tóm tắt 30 giây

Nhóm chat toàn màn — 3 cột; gửi tin, file, ghim.$md_b2000004_0000_0000_0000_000000000007$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-07.png',
  $att_b2000004_0000_0000_0000_000000000007$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-07.png","caption":"/crm/messenger — danh sách hội thoại, nhóm, tìm kiếm."}]$att_b2000004_0000_0000_0000_000000000007$::jsonb,
  10,
  ARRAY['collab', 'noi-bo', '5-tru', 'tt-7'],
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
  'b2000004-0000-0000-0000-000000000008',
  'd2000004-0000-0000-0000-000000000001',
  'TT 8: Chat Lead, phòng ban & trạng thái online',
  'Chat gắn Lead; chat phòng ban; chấm xanh online; thông báo.',
  $md_b2000004_0000_0000_0000_000000000008$# TT 8: Chat Lead, phòng ban & trạng thái online

> _Mở Lead **Chị Lan** → tab chat — thấy **online** → gửi tin ngay, khách không bị bỏ rơi._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Chat Lead = **trao đổi trong ngữ cảnh khách** — không lẫn nhóm chém gió.

- Online/offline giúp biết ai phản hồi được.

## 2. Tư duy — Cách nghĩ trước khi làm

- **Chat Lead** _(gắn mã Lead)_ · **Chat phòng ban** _(theo phòng ban)_ · **Nhóm nội bộ** _(tự tạo)_

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** Lead detail → chat · Messenger → **Phòng ban** · **Đang hoạt động**

- Lead chat tab
- Dept chat
- Online dot xanh
- Thông báo push/chuông


![Chat gắn Lead; chat phòng ban; chấm xanh online; thông báo.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-08.png)
## 4. Vận hành — Làm theo từng bước

1. Mở **Lead** → panel/tab chat.
2. Hoặc Messenger → chọn **Lead** / **Phòng ban**.
3. Nhìn **chấm xanh** = đang online.
4. Đọc **thông báo** — bấm mở đúng hội thoại.
5. Trả lời trong **5–15 phút** giờ hành chính.


> **Mẹo của mentor:** Không spam @all — chỉ khi khẩn cấp thật.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi


**Lỗi thường gặp:**
- Chat Lead nhưng không cập nhật stage Lead.

## Tóm tắt 30 giây

Phân loại chat Lead/dept/nhóm; online; trả lời qua thông báo.$md_b2000004_0000_0000_0000_000000000008$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-08.png',
  $att_b2000004_0000_0000_0000_000000000008$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-08.png","caption":"Chat gắn Lead; chat phòng ban; chấm xanh online; thông báo."}]$att_b2000004_0000_0000_0000_000000000008$::jsonb,
  10,
  ARRAY['collab', 'noi-bo', '5-tru', 'tt-8'],
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
  'b2000004-0000-0000-0000-000000000009',
  'd2000004-0000-0000-0000-000000000001',
  'TT 9: Bong bóng chat — MessengerDock',
  'Icon góc phải; mở nhiều cửa sổ nhỏ; không rời trang Lead.',
  $md_b2000004_0000_0000_0000_000000000009$# TT 9: Bong bóng chat — MessengerDock

> _Đang kéo Kanban — khách nhắn **Zalo nội bộ app** — bong bóng **bật lên góc phải**, trả lời **không mất Kanban**._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Bong bóng = **đa nhiệm** — CRM vẫn mở phía sau.

- Dùng khi cần trả lời nhanh, không cần full messenger.

## 2. Tư duy — Cách nghĩ trước khi làm

**Mental model:** Bong bóng giống **Facebook Messenger mini** — cùng tin nhắn với trang đầy đủ.

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** Góc **phải dưới** — icon tròn chat + thanh dock

- Launcher «Tìm nhân viên & nhóm chat»
- Cửa sổ thu nhỏ
- Lead chat bubble
- Dept bubble
- Toast tin mới


![Icon góc phải; mở nhiều cửa sổ nhỏ; không rời trang Lead.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-09.png)
## 4. Vận hành — Làm theo từng bước

1. Ở bất kỳ trang CRM → bấm **icon chat góc phải**.
2. Tìm nhân viên / nhóm → mở **cửa sổ bong bóng**.
3. **Thu nhỏ / đóng** từng cửa sổ.
4. Kéo nhiều bong bóng — xếp cạnh nhau.
5. **Mở rộng** → sang trang /crm/messenger nếu cần.


> **Mẹo của mentor:** Đóng bong bóng không = rời phòng chat — tin vẫn lưu.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi


**Lỗi thường gặp:**
- Tưởng đóng bong bóng = mất tin.
- Không thấy icon — bị che modal.

## Tóm tắt 30 giây

MessengerDock góc phải — chat nhanh không rời trang.$md_b2000004_0000_0000_0000_000000000009$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-09.png',
  $att_b2000004_0000_0000_0000_000000000009$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-09.png","caption":"Icon góc phải; mở nhiều cửa sổ nhỏ; không rời trang Lead."}]$att_b2000004_0000_0000_0000_000000000009$::jsonb,
  10,
  ARRAY['collab', 'noi-bo', '5-tru', 'tt-9'],
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
  'b2000004-0000-0000-0000-000000000010',
  'd2000004-0000-0000-0000-000000000001',
  'TT 10: Bảng tin nội bộ — trang đầy đủ',
  '/social — feed công ty; lọc phạm vi; đọc thông báo chính thức.',
  $md_b2000004_0000_0000_0000_000000000010$# TT 10: Bảng tin nội bộ — trang đầy đủ

> _Công ty đăng **chính sách nghỉ Tết** trên **Bảng tin** — ai không vào đọc = lỡ thông tin chính thức._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Bảng tin = **loa phường có lưu lịch sử** — khác chat riêng.

- HR / admin đăng; nhân viên đọc và tương tác.

## 2. Tư duy — Cách nghĩ trước khi làm

- **Bảng tin /social** _(post công ty)_ vs **Có gì mới /updates** _(cập nhật phần mềm)_

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** **Bảng tin nội bộ** (`/social`)

- Feed bài viết
- Lọc công ty (admin)
- Hồ sơ xã hội /social/u/…
- Sidebar Kiến thức


![/social — feed công ty; lọc phạm vi; đọc thông báo chính thức.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-10.png)
## 4. Vận hành — Làm theo từng bước

1. Sidebar → **Bảng tin nội bộ**.
2. Cuộn feed — đọc bài **ghim / mới**.
3. Admin: lọc **công ty** nếu nhiều chi nhánh.
4. Bấm **avatar** → xem hồ sơ đồng nghiệp.
5. Check **1 lần/ngày** đầu ca.


> **Mẹo của mentor:** Bài quan trọng — reaction hoặc comment «Đã đọc» để admin biết.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi


**Lỗi thường gặp:**
- Nhầm /updates với /social.

## Tóm tắt 30 giây

/social = bảng tin công ty; khác «Có gì mới» phần mềm.$md_b2000004_0000_0000_0000_000000000010$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-10.png',
  $att_b2000004_0000_0000_0000_000000000010$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-10.png","caption":"/social — feed công ty; lọc phạm vi; đọc thông báo chính thức."}]$att_b2000004_0000_0000_0000_000000000010$::jsonb,
  10,
  ARRAY['collab', 'noi-bo', '5-tru', 'tt-10'],
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
  'b2000004-0000-0000-0000-000000000011',
  'd2000004-0000-0000-0000-000000000001',
  'TT 11: Bảng tin — đăng bài, reaction, chia sẻ chat',
  'Tạo post; ảnh/video; reaction; comment; share sang messenger.',
  $md_b2000004_0000_0000_0000_000000000011$# TT 11: Bảng tin — đăng bài, reaction, chia sẻ chat

> _Xưởng hoàn thành **20 bộ tủ** — đăng ảnh lên bảng tin + **share vào nhóm chat** — cả công ty vui._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Đăng bài **đúng chuẩn công ty** — văn hóa tích cực, không lộ bí mật khách.

- Reaction giúp admin đo mức độ tiếp cận.

## 2. Tư duy — Cách nghĩ trước khi làm

- **Comment** _(thảo luận)_ · **Reaction** _(cảm xúc nhanh)_ · **Share chat** _(đẩy sang nhóm)_

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** Ô **Tạo bài viết** đầu feed

- Text + ảnh/video
- Reaction (👍❤️…)
- Comment
- Share to Messenger
- Ẩn bài / báo cáo (nếu cần)


![Tạo post; ảnh/video; reaction; comment; share sang messenger.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-11.png)
## 4. Vận hành — Làm theo từng bước

1. **Tạo bài viết** — nội dung + ảnh (nếu có).
2. Chọn **phạm vi** (công ty / nhóm).
3. Đăng → đồng nghiệp **reaction / comment**.
4. Menu **⋯** → **Chia sẻ sang chat** nếu cần.
5. Không đăng **SĐT khách / giá kín**.


> **Mẹo của mentor:** Ảnh nén vừa — feed load nhanh hơn.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi


**Lỗi thường gặp:**
- Lộ SĐT khách trên bảng tin.
- Comment toxic — dùng báo cáo.

## Tóm tắt 30 giây

Đăng bài, tương tác, share chat — bảo mật khách hàng.$md_b2000004_0000_0000_0000_000000000011$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-11.png',
  $att_b2000004_0000_0000_0000_000000000011$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-11.png","caption":"Tạo post; ảnh/video; reaction; comment; share sang messenger."}]$att_b2000004_0000_0000_0000_000000000011$::jsonb,
  10,
  ARRAY['collab', 'noi-bo', '5-tru', 'tt-11'],
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
  'b2000004-0000-0000-0000-000000000012',
  'd2000004-0000-0000-0000-000000000001',
  'TT 12: Tổng hợp — 4 kênh trên một ca làm việc',
  'Checklist ca làm: sự kiện → chat → bảng tin → ghi âm.',
  $md_b2000004_0000_0000_0000_000000000012$# TT 12: Tổng hợp — 4 kênh trên một ca làm việc

> _Một **ca sales điển hình**: đọc bảng tin → xem lịch sự kiện → gọi khách (ghi âm) → chat kỹ thuật bong bóng._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Pro dùng **cả 4 kênh** trong ngày — không bỏ sót.

- Mỗi kênh một việc — không trùng lặp Zalo riêng.

## 2. Tư duy — Cách nghĩ trước khi làm

| Việc | Kênh |
|---|---|
| Hẹn khảo sát | **Sự kiện** |
| Hỏi nhanh đồng nghiệp | **Chat / bong bóng** |
| Thông báo công ty | **Bảng tin** |
| Gọi khách | **Ghi âm + gắn Lead** |

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** Sidebar + thanh nhanh + bong bóng

- 4 URL đã học
- Thông báo chuông
- ModuleQuickActions


![Checklist ca làm: sự kiện → chat → bảng tin → ghi âm.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-12.png)
## 4. Vận hành — Làm theo từng bước

1. **Đầu ca:** /social — 2 phút.
2. **Lịch:** /crm/events — sự kiện hôm nay.
3. **Làm việc:** Lead + bong bóng chat.
4. **Sau gọi:** ghi âm gắn Lead.
5. **Cuối ca:** cập nhật sự kiện completed.


> **Mẹo của mentor:** In checklist này dán cạnh màn hình tuần đầu.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi

**Tự kiểm sau khi làm:**
- Đủ 4 kênh trong ngày?
- File ghi âm đã gắn Lead?
- Sự kiện đã completed?

## Tóm tắt 30 giây

4 kênh phối hợp trong một ca — checklist đầu/cuối ca.$md_b2000004_0000_0000_0000_000000000012$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-12.png',
  $att_b2000004_0000_0000_0000_000000000012$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-12.png","caption":"Checklist ca làm: sự kiện → chat → bảng tin → ghi âm."}]$att_b2000004_0000_0000_0000_000000000012$::jsonb,
  10,
  ARRAY['collab', 'noi-bo', '5-tru', 'tt-12'],
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
  'b2000004-0000-0000-0000-000000000013',
  'd2000004-0000-0000-0000-000000000001',
  'TT 13: Bài thi tổng kết — Kênh nội bộ',
  'Bài thi tổng kết khoá — đạt yêu cầu để nhận chứng nhận.',
  $md_b2000004_0000_0000_0000_000000000013$# TT 13: Bài thi tổng kết — Kênh nội bộ

> _Bài thi tổng kết — đo lại toàn bộ 5 trụ: Tư tưởng, Tư duy, Nguồn lực, Vận hành, Báo cáo & Sửa chữa._

## 1. Mục đích

Đo tổng hợp 5 trụ. Sau khi nộp, hệ thống mở phần **giải thích** cho câu sai — đọc kỹ trước khi thi lại.

## 2. Quy định

- **20 câu** trắc nghiệm — phủ đủ 5 trụ

- Điểm đạt: **80%**

- Thời gian: **30 phút**

- Tối đa **3 lượt**

- **Điều kiện mở:** đạt **toàn bộ bài tập** trong khoá


![Bài thi tổng kết khoá — đạt yêu cầu để nhận chứng nhận.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-13.png)
## 3. Trước khi thi

Ôn lại các bài học bắt buộc và làm lại bài tập chưa đạt. Đặc biệt 2 trụ hay sai: **Vận hành** (thao tác phần mềm) và **Báo cáo & Sửa chữa** (KPI / lỗi thường gặp).

## 4. Sau khi thi

Nếu đạt — bạn nhận **chứng nhận** điện tử. Nếu chưa đạt — đọc giải thích, ôn lại và thi lại.$md_b2000004_0000_0000_0000_000000000013$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-13.png',
  $att_b2000004_0000_0000_0000_000000000013$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-13.png","caption":"Bài thi tổng kết khoá — đạt yêu cầu để nhận chứng nhận."}]$att_b2000004_0000_0000_0000_000000000013$::jsonb,
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

UPDATE knowledge_lessons SET is_final_exam = true WHERE id = 'b2000004-0000-0000-0000-000000000013';
-- BÀI TẬP
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order,
  image_url, attachments
) VALUES (
  'c2000004-0000-0000-0000-000000000001',
  'b2000004-0000-0000-0000-000000000001',
  'Kiểm tra: Vì sao cần 4 kênh nội bộ trên CRM',
  '12 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000004_0000_0000_0000_000000000001${"items":[{"id":"tt1","question":"Vì sao dùng kênh nội bộ CRM?","type":"single","options":["Lưu lịch sử công ty, handover","Chỉ giám sát","Tốn pin","Không lý do"],"correct":[0],"explanation":"Tư tưởng."},{"id":"tt2","question":"Zalo cá nhân thay CRM?","type":"single","options":["Mất minh bạch team","Tốt hơn","Bắt buộc","Thưởng"],"correct":[0],"explanation":"Tư tưởng."},{"id":"td3","question":"Ghi âm cuộc gọi giúp?","type":"single","options":["Đối soát nội dung, tranh chấp","Nghe nhạc","Xóa Lead","In BG"],"correct":[0],"explanation":"Tư tưởng."},{"id":"td4","question":"Trang đầy đủ vs bong bóng?","type":"single","options":["Cùng dữ liệu, khác cách mở","Khác hệ thống","Không liên quan","Chỉ admin"],"correct":[0],"explanation":"Tư duy."},{"id":"nl5","question":"Bảng tin dùng cho?","type":"single","options":["Thông báo chính thức công ty","Chat khách","In HĐ","Xóa Deal"],"correct":[0],"explanation":"Tư duy."},{"id":"nl6","question":"4 mục Sidebar?","type":"single","options":["Sự kiện, Nhóm chat, Bảng tin, Ghi âm","Lead, Deal, KPI, BG","Chỉ chat","Chỉ email"],"correct":[0],"explanation":"Nguồn lực."},{"id":"vh7","question":"Bong bóng chat ở?","type":"single","options":["Góc phải màn hình","Giữa","Sidebar","Email"],"correct":[0],"explanation":"Nguồn lực."},{"id":"vh8","question":"Thanh nhanh SX/VC có?","type":"single","options":["Bảng tin, Sự kiện, Tin nhắn","Chỉ thùng rác","Chỉ KPI","Không có"],"correct":[0],"explanation":"Nguồn lực."},{"id":"bc9","question":"Việc quan trọng — làm trước?","type":"single","options":["Ghi trên CRM","Zalo riêng","Sổ tay","Bỏ qua"],"correct":[0],"explanation":"Vận hành."},{"id":"bc10","question":"Không tìm thấy menu — sửa?","type":"single","options":["Hỏi mentor / Sidebar","Xóa app","Đổi pass","Thua Lead"],"correct":[0],"explanation":"Vận hành."},{"id":"bc11","question":"Chỉ Zalo không CRM — hậu quả?","type":"single","options":["Đồng nghiệp mù, KPI không đối soát","Tốt","Thưởng","Nhanh hơn"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc12","question":"Tự kiểm bài 1?","type":"single","options":["Biết 4 kênh + đường Sidebar","Chỉ biết chat","Chỉ biết Lead","Không cần"],"correct":[0],"explanation":"Báo cáo."}]}$j_c2000004_0000_0000_0000_000000000001$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-01.png',
  $eax_c2000004_0000_0000_0000_000000000001$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-01.png","caption":"Sự kiện, chat, bảng tin, ghi âm — một hệ sinh thái, không thay bằng Zalo riêng."}]$eax_c2000004_0000_0000_0000_000000000001$::jsonb
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
  'c2000004-0000-0001-0000-000000000001',
  'b2000004-0000-0000-0000-000000000001',
  'Thực hành trên phần mềm',
  'Đánh dấu khi bạn đã thực hành được trên phần mềm thật.',
  'checklist',
  $j_c2000004_0000_0001_0000_000000000001${"items":[{"id":"c1","text":"Mở Sidebar CRM — chỉ ra 4 mục: Sự kiện, Nhóm chat, Bảng tin, Ghi âm."},{"id":"c2","text":"Giải thích cho đồng nghiệp khác biệt trang đầy đủ vs bong bóng."}]}$j_c2000004_0000_0001_0000_000000000001$::jsonb,
  80,
  NULL,
  NULL,
  2,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-01.png',
  $eax_c2000004_0000_0001_0000_000000000001$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-01.png","caption":"Sự kiện, chat, bảng tin, ghi âm — một hệ sinh thái, không thay bằng Zalo riêng."}]$eax_c2000004_0000_0001_0000_000000000001$::jsonb
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
  'c2000004-0000-0000-0000-000000000002',
  'b2000004-0000-0000-0000-000000000002',
  'Kiểm tra: Đường vào — Sidebar và thanh nhanh',
  '12 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000004_0000_0000_0000_000000000002${"items":[{"id":"tt1","question":"Sidebar Sự kiện mở?","type":"single","options":["/crm/events","/social","/login","/kpi"],"correct":[0],"explanation":"Nguồn lực."},{"id":"tt2","question":"Nhóm chat trang đầy đủ?","type":"single","options":["/crm/messenger","/social","/events","/tools"],"correct":[0],"explanation":"Nguồn lực."},{"id":"td3","question":"Bảng tin nội bộ?","type":"single","options":["/social","/crm/leads","/updates","/login"],"correct":[0],"explanation":"Nguồn lực."},{"id":"td4","question":"Ghi âm?","type":"single","options":["/tools/voice-recordings","/crm/events","/messenger","/kpi"],"correct":[0],"explanation":"Nguồn lực."},{"id":"nl5","question":"Thanh nhanh có ở?","type":"single","options":["Dashboard SX/VC","Chỉ mobile","Email","Blocklist"],"correct":[0],"explanation":"Tư duy."},{"id":"nl6","question":"Icon Bảng tin thanh nhanh?","type":"single","options":["Mở /social","Xóa Lead","In BG","Đăng xuất"],"correct":[0],"explanation":"Vận hành."},{"id":"vh7","question":"Sidebar vs thanh nhanh?","type":"single","options":["Cùng đích, khác vị trí","Khác app","Không liên quan","Chỉ admin"],"correct":[0],"explanation":"Tư duy."},{"id":"vh8","question":"Bookmark URL?","type":"single","options":["Vào nhanh","Cấm","Xóa CRM","Thua"],"correct":[0],"explanation":"Mẹo."},{"id":"bc9","question":"Không thấy menu?","type":"single","options":["Cuộn Sidebar / App Switcher","Cài Windows","Xóa Deal","Thua"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc10","question":"Có gì mới (Megaphone)?","type":"single","options":["Release notes phần mềm","Bảng tin nội bộ","Ghi âm","Lead"],"correct":[0],"explanation":"Phân biệt."},{"id":"bc11","question":"2 đường vào giúp?","type":"single","options":["Tiết kiệm click","Tranh KPI","Xóa chat","In PDF"],"correct":[0],"explanation":"Tư tưởng."},{"id":"bc12","question":"Tự kiểm bài 2?","type":"single","options":["Mở được 4 URL từ Sidebar","Chỉ 1 URL","Không cần","Chỉ mobile"],"correct":[0],"explanation":"Báo cáo."}]}$j_c2000004_0000_0000_0000_000000000002$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-02.png',
  $eax_c2000004_0000_0000_0000_000000000002$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-02.png","caption":"Menu trái CRM; thanh nhanh ở dashboard SX/VC."}]$eax_c2000004_0000_0000_0000_000000000002$::jsonb
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
  'c2000004-0000-0001-0000-000000000002',
  'b2000004-0000-0000-0000-000000000002',
  'Thực hành trên phần mềm',
  'Đánh dấu khi bạn đã thực hành được trên phần mềm thật.',
  'checklist',
  $j_c2000004_0000_0001_0000_000000000002${"items":[{"id":"c1","text":"Mở lần lượt 4 URL từ Sidebar."},{"id":"c2","text":"Mở dashboard VC → bấm icon Bảng tin → vào /social."}]}$j_c2000004_0000_0001_0000_000000000002$::jsonb,
  80,
  NULL,
  NULL,
  2,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-02.png',
  $eax_c2000004_0000_0001_0000_000000000002$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-02.png","caption":"Menu trái CRM; thanh nhanh ở dashboard SX/VC."}]$eax_c2000004_0000_0001_0000_000000000002$::jsonb
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
  'c2000004-0000-0000-0000-000000000003',
  'b2000004-0000-0000-0000-000000000003',
  'Kiểm tra: Sự kiện — trang đầy đủ & lịch tháng',
  '12 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000004_0000_0000_0000_000000000003${"items":[{"id":"tt1","question":"Sự kiện dùng để?","type":"single","options":["Lên lịch gặp khách, họp, khảo sát","Chat Zalo","In BG","Xóa Lead"],"correct":[0],"explanation":"Tư tưởng."},{"id":"tt2","question":"Trang Sự kiện?","type":"single","options":["/crm/events","/social","/crm/messenger","/kpi"],"correct":[0],"explanation":"Nguồn lực."},{"id":"td3","question":"Tab mặc định hay dùng?","type":"single","options":["Lịch tháng","Chỉ chat","Chỉ KPI","Blocklist"],"correct":[0],"explanation":"Nguồn lực."},{"id":"td4","question":"Lọc khối Kinh doanh?","type":"single","options":["Chỉ sự kiện CRM/sales","Chỉ SX","Chỉ VC","Xóa hết"],"correct":[0],"explanation":"Vận hành."},{"id":"nl5","question":"Trạng thái «Đã lên kế hoạch»?","type":"single","options":["Chưa bắt đầu","Đã hủy","Đã xong","Lead mới"],"correct":[0],"explanation":"Tư duy."},{"id":"nl6","question":"Click ô ngày trên lịch?","type":"single","options":["Xem sự kiện ngày đó","Xóa tháng","Đăng xuất","In PDF"],"correct":[0],"explanation":"Vận hành."},{"id":"vh7","question":"Sự kiện trùng lịch giấy?","type":"single","options":["Dễ trùng, mất đồng bộ","Tốt hơn","Bắt buộc","Thưởng"],"correct":[0],"explanation":"Tư tưởng."},{"id":"vh8","question":"Admin lọc công ty?","type":"single","options":["Xem sự kiện theo công ty","Xóa user","In lương","Blocklist"],"correct":[0],"explanation":"Nguồn lực."},{"id":"bc9","question":"Feed vs Lịch?","type":"single","options":["Lịch = tổng tháng; feed = danh sách lọc","Giống hệt","Không liên quan","Chỉ mobile"],"correct":[0],"explanation":"Tư duy."},{"id":"bc10","question":"Quá hạn — ưu tiên?","type":"single","options":["Xử lý / cập nhật trạng thái trước","Bỏ qua","Tạo mới","Xóa CRM"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc11","question":"Không lọc khối — lỗi?","type":"single","options":["Nhầm sự kiện khối khác","Tốt","Thưởng","Nhanh hơn"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc12","question":"Tự kiểm bài 3?","type":"single","options":["Mở Lịch + lọc khối","Chỉ feed","Không cần","Chỉ chat"],"correct":[0],"explanation":"Báo cáo."}]}$j_c2000004_0000_0000_0000_000000000003$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-03.png',
  $eax_c2000004_0000_0000_0000_000000000003$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-03.png","caption":"CRM → Sự kiện; tab Lịch; lọc khối Kinh doanh / SX / VC."}]$eax_c2000004_0000_0000_0000_000000000003$::jsonb
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
  'c2000004-0000-0001-0000-000000000003',
  'b2000004-0000-0000-0000-000000000003',
  'Thực hành trên phần mềm',
  'Đánh dấu khi bạn đã thực hành được trên phần mềm thật.',
  'checklist',
  $j_c2000004_0000_0001_0000_000000000003${"items":[{"id":"c1","text":"Mở /crm/events → tab Lịch."},{"id":"c2","text":"Lọc khối Kinh doanh → xem sự kiện hôm nay."}]}$j_c2000004_0000_0001_0000_000000000003$::jsonb,
  80,
  NULL,
  NULL,
  2,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-03.png',
  $eax_c2000004_0000_0001_0000_000000000003$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-03.png","caption":"CRM → Sự kiện; tab Lịch; lọc khối Kinh doanh / SX / VC."}]$eax_c2000004_0000_0001_0000_000000000003$::jsonb
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
  'c2000004-0000-0000-0000-000000000004',
  'b2000004-0000-0000-0000-000000000004',
  'Kiểm tra: Sự kiện — tạo, tham gia, bình luận',
  '12 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000004_0000_0000_0000_000000000004${"items":[{"id":"tt1","question":"Tạo sự kiện cần tối thiểu?","type":"single","options":["Tiêu đề + thời gian","Chỉ ảnh","Chỉ chat","MST"],"correct":[0],"explanation":"Vận hành."},{"id":"tt2","question":"Người được mời làm gì?","type":"single","options":["Xác nhận / Từ chối trên app","Chỉ Zalo","In PDF","Xóa Lead"],"correct":[0],"explanation":"Vận hành."},{"id":"td3","question":"Sau buổi gặp?","type":"single","options":["Đổi Hoàn thành + bình luận","Bỏ qua","Xóa sự kiện","Chỉ KPI"],"correct":[0],"explanation":"Vận hành."},{"id":"td4","question":"Bình luận sự kiện lưu ở?","type":"single","options":["Trên app, gắn sự kiện","Zalo riêng","Sổ tay","Email cá nhân"],"correct":[0],"explanation":"Tư tưởng."},{"id":"nl5","question":"Hủy sự kiện?","type":"single","options":["Ghi lý do (cancelled)","Im lặng","Xóa Lead","Thưởng"],"correct":[0],"explanation":"Báo cáo."},{"id":"nl6","question":"Gắn Lead lên sự kiện?","type":"single","options":["Liên kết CRM khi có","Cấm","Chỉ Deal","Chỉ admin"],"correct":[0],"explanation":"Nguồn lực."},{"id":"vh7","question":"in_progress nghĩa?","type":"single","options":["Đang thực hiện","Đã hủy","Lead mới","Đã xong"],"correct":[0],"explanation":"Tư duy."},{"id":"vh8","question":"Người tạo chịu trách nhiệm?","type":"single","options":["Cập nhật trạng thái cuối","Không ai","Chỉ admin","Khách hàng"],"correct":[0],"explanation":"Tư tưởng."},{"id":"bc9","question":"Thông báo mời sự kiện?","type":"single","options":["Chuông / thông báo app","Chỉ email ngoài","Không có","SMS bắt buộc"],"correct":[0],"explanation":"Nguồn lực."},{"id":"bc10","question":"Comment thay Zalo?","type":"single","options":["Lịch sử tập trung","Không nên","Cấm","Chậm hơn"],"correct":[0],"explanation":"Tư duy."},{"id":"bc11","question":"Quên completed?","type":"single","options":["Báo cáo sai, đồng nghiệp mù","Không sao","Thưởng","Tự xóa"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc12","question":"Tự kiểm bài 4?","type":"single","options":["Tạo + mời + đổi trạng thái","Chỉ xem lịch","Không cần","Chỉ chat"],"correct":[0],"explanation":"Báo cáo."}]}$j_c2000004_0000_0000_0000_000000000004$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-04.png',
  $eax_c2000004_0000_0000_0000_000000000004$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-04.png","caption":"Tạo sự kiện; xác nhận tham gia; bình luận; đổi trạng thái."}]$eax_c2000004_0000_0000_0000_000000000004$::jsonb
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
  'c2000004-0000-0001-0000-000000000004',
  'b2000004-0000-0000-0000-000000000004',
  'Thực hành trên phần mềm',
  'Đánh dấu khi bạn đã thực hành được trên phần mềm thật.',
  'checklist',
  $j_c2000004_0000_0001_0000_000000000004${"items":[{"id":"c1","text":"Tạo sự kiện thử (ngày mai)."},{"id":"c2","text":"Thêm bình luận sau khi đổi Hoàn thành."}]}$j_c2000004_0000_0001_0000_000000000004$::jsonb,
  80,
  NULL,
  NULL,
  2,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-04.png',
  $eax_c2000004_0000_0001_0000_000000000004$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-04.png","caption":"Tạo sự kiện; xác nhận tham gia; bình luận; đổi trạng thái."}]$eax_c2000004_0000_0001_0000_000000000004$::jsonb
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
  'c2000004-0000-0000-0000-000000000005',
  'b2000004-0000-0000-0000-000000000005',
  'Kiểm tra: Cuộc gọi & ghi âm — trang đầy đủ',
  '12 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000004_0000_0000_0000_000000000005${"items":[{"id":"tt1","question":"Ghi âm giúp?","type":"single","options":["Đối soát nội dung cuộc gọi","Nghe nhạc","Xóa Lead","In BG"],"correct":[0],"explanation":"Tư tưởng."},{"id":"tt2","question":"Đường dẫn trang?","type":"single","options":["/tools/voice-recordings","/social","/crm/events","/kpi"],"correct":[0],"explanation":"Nguồn lực."},{"id":"td3","question":"Admin lọc?","type":"single","options":["Theo nhân viên","Theo màu tóc","Theo Lead only","Không lọc"],"correct":[0],"explanation":"Nguồn lực."},{"id":"td4","question":"Ghi trên web vs upload?","type":"single","options":["Cùng lưu danh sách","Khác app","Upload cấm","Chỉ mobile"],"correct":[0],"explanation":"Tư duy."},{"id":"nl5","question":"Sau cuộc gọi quan trọng?","type":"single","options":["Ghi/upload sớm","Chờ tuần sau","Chỉ Zalo","Xóa"],"correct":[0],"explanation":"Vận hành."},{"id":"nl6","question":"Play trên trang?","type":"single","options":["Nghe trực tiếp","Chỉ tải về","Chỉ admin","Cấm"],"correct":[0],"explanation":"Vận hành."},{"id":"vh7","question":"Không ghi âm — rủi ro?","type":"single","options":["Tranh cãi không bằng chứng","Tốt hơn","Thưởng","Nhanh"],"correct":[0],"explanation":"Báo cáo."},{"id":"vh8","question":"Menu Sidebar?","type":"single","options":["Cuộc gọi & ghi âm","Chỉ Deal","Chỉ chat","Chỉ KPI"],"correct":[0],"explanation":"Nguồn lực."},{"id":"bc9","question":"Ghi chú SĐT?","type":"single","options":["Tìm lại dễ hơn","Cấm","Chỉ admin","Không cần"],"correct":[0],"explanation":"Vận hành."},{"id":"bc10","question":"Gọi đến / gọi đi?","type":"single","options":["Phân loại hướng cuộc gọi","Không có","Chỉ chat","Lead stage"],"correct":[0],"explanation":"Tư duy."},{"id":"bc11","question":"Cuối ngày mới upload?","type":"single","options":["Dễ quên — nên làm ngay","Tốt","Bắt buộc","Thưởng"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc12","question":"Tự kiểm bài 5?","type":"single","options":["Mở trang + nghe 1 file","Chỉ sidebar","Không cần","Chỉ chat"],"correct":[0],"explanation":"Báo cáo."}]}$j_c2000004_0000_0000_0000_000000000005$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-05.png',
  $eax_c2000004_0000_0000_0000_000000000005$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-05.png","caption":"Sidebar → Cuộc gọi & ghi âm; danh sách file; lọc theo nhân viên."}]$eax_c2000004_0000_0000_0000_000000000005$::jsonb
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
  'c2000004-0000-0001-0000-000000000005',
  'b2000004-0000-0000-0000-000000000005',
  'Thực hành trên phần mềm',
  'Đánh dấu khi bạn đã thực hành được trên phần mềm thật.',
  'checklist',
  $j_c2000004_0000_0001_0000_000000000005${"items":[{"id":"c1","text":"Mở /tools/voice-recordings."},{"id":"c2","text":"Nghe thử một bản ghi (hoặc xem danh sách)."}]}$j_c2000004_0000_0001_0000_000000000005$::jsonb,
  80,
  NULL,
  NULL,
  2,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-05.png',
  $eax_c2000004_0000_0001_0000_000000000005$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-05.png","caption":"Sidebar → Cuộc gọi & ghi âm; danh sách file; lọc theo nhân viên."}]$eax_c2000004_0000_0001_0000_000000000005$::jsonb
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
  'c2000004-0000-0000-0000-000000000006',
  'b2000004-0000-0000-0000-000000000006',
  'Kiểm tra: Ghi âm — gắn Lead, lịch âm thanh',
  '12 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000004_0000_0000_0000_000000000006${"items":[{"id":"tt1","question":"Gắn Lead để?","type":"single","options":["Đồng nghiệp thấy trên timeline KH","Xóa file","In BG","Thưởng"],"correct":[0],"explanation":"Tư tưởng."},{"id":"tt2","question":"Xem file từ Lead?","type":"single","options":["Tab Hoạt động / Tài liệu","Chỉ chat","Chỉ KPI","Blocklist"],"correct":[0],"explanation":"Nguồn lực."},{"id":"td3","question":"Lịch trên trang ghi âm?","type":"single","options":["Xem bản ghi theo ngày","Tạo sự kiện","Chat","In lương"],"correct":[0],"explanation":"Nguồn lực."},{"id":"td4","question":"File không gắn Lead?","type":"single","options":["Mất ngữ cảnh","Tốt","Bắt buộc","Thưởng"],"correct":[0],"explanation":"Báo cáo."},{"id":"nl5","question":"Gắn nhầm SĐT?","type":"single","options":["Sửa link — gắn đúng Lead","Xóa Lead","Bỏ qua","Thua"],"correct":[0],"explanation":"Báo cáo."},{"id":"nl6","question":"Ghi chú sau gọi?","type":"single","options":["Cam kết / câu hỏi khách","Không cần","Chỉ emoji","MST"],"correct":[0],"explanation":"Vận hành."},{"id":"vh7","question":"Timeline KH gồm?","type":"single","options":["NV + ghi âm + sự kiện","Chỉ chat Zalo","Chỉ BG","Chỉ email"],"correct":[0],"explanation":"Tư duy."},{"id":"vh8","question":"Tìm Lead gắn?","type":"single","options":["SĐT / mã Lead","Chỉ tên công ty","Chỉ KPI","Random"],"correct":[0],"explanation":"Vận hành."},{"id":"bc9","question":"Deal cũng gắn được?","type":"single","options":["Có — pipeline Deal","Không","Chỉ admin","Chỉ SX"],"correct":[0],"explanation":"Nguồn lực."},{"id":"bc10","question":"Quét SĐT trước gắn?","type":"single","options":["Tránh nhầm khách","Cấm","Chậm","Không cần"],"correct":[0],"explanation":"Vận hành."},{"id":"bc11","question":"File nổi — sửa?","type":"single","options":["Gắn lại đúng Lead","Xóa CRM","Bỏ qua","Chat Zalo"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc12","question":"Tự kiểm bài 6?","type":"single","options":["Gắn thử 1 file + xem trên Lead","Chỉ nghe","Không cần","Chỉ lịch"],"correct":[0],"explanation":"Báo cáo."}]}$j_c2000004_0000_0000_0000_000000000006$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-06.png',
  $eax_c2000004_0000_0000_0000_000000000006$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-06.png","caption":"Liên kết bản ghi với Lead/Deal; lịch theo ngày; quét SĐT."}]$eax_c2000004_0000_0000_0000_000000000006$::jsonb
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
  'c2000004-0000-0001-0000-000000000006',
  'b2000004-0000-0000-0000-000000000006',
  'Thực hành trên phần mềm',
  'Đánh dấu khi bạn đã thực hành được trên phần mềm thật.',
  'checklist',
  $j_c2000004_0000_0001_0000_000000000006${"items":[{"id":"c1","text":"Gắn một bản ghi (hoặc mô phỏng) vào Lead."},{"id":"c2","text":"Mở Lead → kiểm tra tab Hoạt động/Tài liệu."}]}$j_c2000004_0000_0001_0000_000000000006$::jsonb,
  80,
  NULL,
  NULL,
  2,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-06.png',
  $eax_c2000004_0000_0001_0000_000000000006$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-06.png","caption":"Liên kết bản ghi với Lead/Deal; lịch theo ngày; quét SĐT."}]$eax_c2000004_0000_0001_0000_000000000006$::jsonb
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
  'c2000004-0000-0000-0000-000000000007',
  'b2000004-0000-0000-0000-000000000007',
  'Kiểm tra: Nhóm chat — trang đầy đủ',
  '12 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000004_0000_0000_0000_000000000007${"items":[{"id":"tt1","question":"Trang chat đầy đủ?","type":"single","options":["/crm/messenger","/social","/events","/voice"],"correct":[0],"explanation":"Nguồn lực."},{"id":"tt2","question":"Chat thay ghi chú Lead?","type":"single","options":["Không — bổ sung, vẫn tóm tắt Lead","Thay hoàn toàn","Cấm Lead","Chỉ admin"],"correct":[0],"explanation":"Tư tưởng."},{"id":"td3","question":"Layout 3 cột?","type":"single","options":["Danh sách | chat | info","Chỉ 1 cột","Chỉ KPI","Chỉ lịch"],"correct":[0],"explanation":"Nguồn lực."},{"id":"td4","question":"Ghim hội thoại?","type":"single","options":["Lên đầu danh sách","Xóa nhóm","Khóa Lead","In PDF"],"correct":[0],"explanation":"Vận hành."},{"id":"nl5","question":"Gửi ảnh hiện trường?","type":"single","options":["Đính kèm file trong chat","Chỉ email","Chỉ bảng tin","Cấm"],"correct":[0],"explanation":"Vận hành."},{"id":"nl6","question":"Trang vs bong bóng?","type":"single","options":["Trang = nhiều room; bong bóng = nhanh","Khác app","Không liên quan","Chỉ mobile"],"correct":[0],"explanation":"Tư duy."},{"id":"vh7","question":"Tìm kiếm trên trang?","type":"single","options":["Tìm nhân viên / nhóm","Tìm Lead only","Không có","Chỉ admin"],"correct":[0],"explanation":"Nguồn lực."},{"id":"vh8","question":"Enter gửi tin?","type":"single","options":["Gửi message","Đăng xuất","Xóa Deal","In BG"],"correct":[0],"explanation":"Vận hành."},{"id":"bc9","question":"Tên nhóm mơ hồ?","type":"single","options":["Khó tìm — đặt tên rõ","Tốt","Bắt buộc","Thưởng"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc10","question":"Tin quan trọng sau chat?","type":"single","options":["Tóm tắt lên Lead","Bỏ qua","Chỉ Zalo","Xóa chat"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc11","question":"Sidebar mở chat?","type":"single","options":["Nhóm chat","Chỉ Deal","Chỉ KPI","Blocklist"],"correct":[0],"explanation":"Nguồn lực."},{"id":"bc12","question":"Tự kiểm bài 7?","type":"single","options":["Mở /crm/messenger + gửi tin thử","Chỉ bong bóng","Không cần","Chỉ bảng tin"],"correct":[0],"explanation":"Báo cáo."}]}$j_c2000004_0000_0000_0000_000000000007$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-07.png',
  $eax_c2000004_0000_0000_0000_000000000007$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-07.png","caption":"/crm/messenger — danh sách hội thoại, nhóm, tìm kiếm."}]$eax_c2000004_0000_0000_0000_000000000007$::jsonb
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
  'c2000004-0000-0001-0000-000000000007',
  'b2000004-0000-0000-0000-000000000007',
  'Thực hành trên phần mềm',
  'Đánh dấu khi bạn đã thực hành được trên phần mềm thật.',
  'checklist',
  $j_c2000004_0000_0001_0000_000000000007${"items":[{"id":"c1","text":"Mở /crm/messenger."},{"id":"c2","text":"Gửi một tin (hoặc mở hội thoại có sẵn)."}]}$j_c2000004_0000_0001_0000_000000000007$::jsonb,
  80,
  NULL,
  NULL,
  2,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-07.png',
  $eax_c2000004_0000_0001_0000_000000000007$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-07.png","caption":"/crm/messenger — danh sách hội thoại, nhóm, tìm kiếm."}]$eax_c2000004_0000_0001_0000_000000000007$::jsonb
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
  'c2000004-0000-0000-0000-000000000008',
  'b2000004-0000-0000-0000-000000000008',
  'Kiểm tra: Chat Lead, phòng ban & trạng thái online',
  '12 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000004_0000_0000_0000_000000000008${"items":[{"id":"tt1","question":"Chat Lead mở từ?","type":"single","options":["Trang chi tiết Lead","Chỉ bảng tin","Chỉ KPI","Blocklist"],"correct":[0],"explanation":"Nguồn lực."},{"id":"tt2","question":"Chấm xanh?","type":"single","options":["Đang online","Offline","Lead Hot","Deal thua"],"correct":[0],"explanation":"Nguồn lực."},{"id":"td3","question":"Chat phòng ban?","type":"single","options":["Theo phòng ban công ty","Theo khách hàng","Chỉ admin","Chỉ Zalo"],"correct":[0],"explanation":"Tư duy."},{"id":"td4","question":"Thông báo tin nhắn?","type":"single","options":["Mở đúng hội thoại","Xóa Lead","In PDF","KPI"],"correct":[0],"explanation":"Vận hành."},{"id":"nl5","question":"Chat Lead vs nhóm chung?","type":"single","options":["Lead = ngữ cảnh KH cụ thể","Giống hệt","Không liên quan","Cấm Lead"],"correct":[0],"explanation":"Tư duy."},{"id":"nl6","question":"Trang Đang hoạt động?","type":"single","options":["Ai online trong công ty","Chỉ KPI","Chỉ BG","Blocklist"],"correct":[0],"explanation":"Nguồn lực."},{"id":"vh7","question":"Spam @all?","type":"single","options":["Chỉ khi khẩn cấp","Luôn luôn","Cấm chat","Thưởng"],"correct":[0],"explanation":"Báo cáo."},{"id":"vh8","question":"Chat xong — Lead?","type":"single","options":["Cập nhật stage/ghi chú nếu cần","Bỏ qua","Xóa Lead","Chỉ chat"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc9","question":"Offline đồng nghiệp?","type":"single","options":["Để tin — họ đọc sau","Gọi liên tục","Xóa nhóm","Thua"],"correct":[0],"explanation":"Vận hành."},{"id":"bc10","question":"3 loại chat?","type":"single","options":["Lead, phòng ban, nhóm","Chỉ Zalo","Chỉ email","Chỉ bảng tin"],"correct":[0],"explanation":"Tư duy."},{"id":"bc11","question":"Phản hồi giờ HC?","type":"single","options":["5–15 phút mục tiêu","1 tuần","Không cần","1 năm"],"correct":[0],"explanation":"Vận hành."},{"id":"bc12","question":"Tự kiểm bài 8?","type":"single","options":["Mở chat Lead + thấy online","Chỉ trang messenger","Không cần","Chỉ ghi âm"],"correct":[0],"explanation":"Báo cáo."}]}$j_c2000004_0000_0000_0000_000000000008$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-08.png',
  $eax_c2000004_0000_0000_0000_000000000008$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-08.png","caption":"Chat gắn Lead; chat phòng ban; chấm xanh online; thông báo."}]$eax_c2000004_0000_0000_0000_000000000008$::jsonb
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
  'c2000004-0000-0001-0000-000000000008',
  'b2000004-0000-0000-0000-000000000008',
  'Thực hành trên phần mềm',
  'Đánh dấu khi bạn đã thực hành được trên phần mềm thật.',
  'checklist',
  $j_c2000004_0000_0001_0000_000000000008${"items":[{"id":"c1","text":"Mở một Lead → tìm chat."},{"id":"c2","text":"Xem trang Đang hoạt động (Sidebar)."}]}$j_c2000004_0000_0001_0000_000000000008$::jsonb,
  80,
  NULL,
  NULL,
  2,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-08.png',
  $eax_c2000004_0000_0001_0000_000000000008$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-08.png","caption":"Chat gắn Lead; chat phòng ban; chấm xanh online; thông báo."}]$eax_c2000004_0000_0001_0000_000000000008$::jsonb
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
  'c2000004-0000-0000-0000-000000000009',
  'b2000004-0000-0000-0000-000000000009',
  'Kiểm tra: Bong bóng chat — MessengerDock',
  '12 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000004_0000_0000_0000_000000000009${"items":[{"id":"tt1","question":"Bong bóng ở đâu?","type":"single","options":["Góc phải màn hình","Sidebar trái","Giữa Kanban","Email"],"correct":[0],"explanation":"Nguồn lực."},{"id":"tt2","question":"Cùng dữ liệu trang đầy đủ?","type":"single","options":["Cùng hệ thống chat","Khác app","Không sync","Chỉ admin"],"correct":[0],"explanation":"Tư duy."},{"id":"td3","question":"Launcher mở?","type":"single","options":["Danh sách NV & nhóm","Chỉ Lead","Chỉ KPI","Blocklist"],"correct":[0],"explanation":"Vận hành."},{"id":"td4","question":"Đóng bong bóng?","type":"single","options":["Tin vẫn lưu","Mất hết tin","Xóa Lead","Đăng xuất"],"correct":[0],"explanation":"Tư duy."},{"id":"nl5","question":"Khi nào dùng bong bóng?","type":"single","options":["Đa nhiệm trên Kanban/Lead","Chỉ in PDF","Chỉ KPI","Không bao giờ"],"correct":[0],"explanation":"Tư tưởng."},{"id":"nl6","question":"Mở rộng từ bong bóng?","type":"single","options":["Sang /crm/messenger","Sang Zalo","Xóa chat","Blocklist"],"correct":[0],"explanation":"Vận hành."},{"id":"vh7","question":"Nhiều cửa sổ?","type":"single","options":["Xếp cạnh nhau được","Chỉ 1","Cấm","Chỉ admin"],"correct":[0],"explanation":"Vận hành."},{"id":"vh8","question":"Toast tin mới?","type":"single","options":["Thông báo nhanh","Xóa Lead","In BG","KPI"],"correct":[0],"explanation":"Nguồn lực."},{"id":"bc9","question":"Icon bị che?","type":"single","options":["Đóng modal/popup trước","Cài lại Windows","Xóa Deal","Thua"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc10","question":"Dept bubble?","type":"single","options":["Chat phòng ban thu nhỏ","Chỉ bảng tin","Chỉ ghi âm","KPI"],"correct":[0],"explanation":"Nguồn lực."},{"id":"bc11","question":"Kanban + chat?","type":"single","options":["Bong bóng giữ Kanban","Phải thoát CRM","Cấm","Chỉ mobile"],"correct":[0],"explanation":"Vận hành."},{"id":"bc12","question":"Tự kiểm bài 9?","type":"single","options":["Mở launcher + 1 bong bóng","Chỉ trang messenger","Không cần","Chỉ sự kiện"],"correct":[0],"explanation":"Báo cáo."}]}$j_c2000004_0000_0000_0000_000000000009$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-09.png',
  $eax_c2000004_0000_0000_0000_000000000009$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-09.png","caption":"Icon góc phải; mở nhiều cửa sổ nhỏ; không rời trang Lead."}]$eax_c2000004_0000_0000_0000_000000000009$::jsonb
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
  'c2000004-0000-0001-0000-000000000009',
  'b2000004-0000-0000-0000-000000000009',
  'Thực hành trên phần mềm',
  'Đánh dấu khi bạn đã thực hành được trên phần mềm thật.',
  'checklist',
  $j_c2000004_0000_0001_0000_000000000009${"items":[{"id":"c1","text":"Bấm icon chat góc phải → mở launcher."},{"id":"c2","text":"Mở một bong bóng → thu nhỏ → mở lại."}]}$j_c2000004_0000_0001_0000_000000000009$::jsonb,
  80,
  NULL,
  NULL,
  2,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-09.png',
  $eax_c2000004_0000_0001_0000_000000000009$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-09.png","caption":"Icon góc phải; mở nhiều cửa sổ nhỏ; không rời trang Lead."}]$eax_c2000004_0000_0001_0000_000000000009$::jsonb
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
  'c2000004-0000-0000-0000-000000000010',
  'b2000004-0000-0000-0000-000000000010',
  'Kiểm tra: Bảng tin nội bộ — trang đầy đủ',
  '12 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000004_0000_0000_0000_000000000010${"items":[{"id":"tt1","question":"Bảng tin URL?","type":"single","options":["/social","/updates","/crm/events","/messenger"],"correct":[0],"explanation":"Nguồn lực."},{"id":"tt2","question":"Bảng tin vs Có gì mới?","type":"single","options":["Social = công ty; Updates = tính năng app","Giống nhau","Không liên quan","Chỉ admin"],"correct":[0],"explanation":"Tư duy."},{"id":"td3","question":"Ai thường đăng?","type":"single","options":["HR / admin / lãnh đạo","Chỉ khách","Chỉ bot","Không ai"],"correct":[0],"explanation":"Tư tưởng."},{"id":"td4","question":"Đọc khi nào?","type":"single","options":["Đầu ca hàng ngày","1 năm/lần","Không cần","Chỉ Tết"],"correct":[0],"explanation":"Vận hành."},{"id":"nl5","question":"Feed gồm?","type":"single","options":["Bài viết + media","Chỉ chat","Chỉ KPI","Chỉ Lead"],"correct":[0],"explanation":"Nguồn lực."},{"id":"nl6","question":"Hồ sơ đồng nghiệp?","type":"single","options":["/social/u/{id}","/crm/leads","/login","/kpi"],"correct":[0],"explanation":"Nguồn lực."},{"id":"vh7","question":"Admin lọc công ty?","type":"single","options":["Xem đúng chi nhánh","Xóa user","In lương","Blocklist"],"correct":[0],"explanation":"Vận hành."},{"id":"vh8","question":"Bỏ lỡ bảng tin?","type":"single","options":["Lỡ chính sách công ty","Thưởng","Thăng chức","KPI tăng"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc9","question":"Sidebar mở?","type":"single","options":["Bảng tin nội bộ","Chỉ Deal","Chỉ ghi âm","Blocklist"],"correct":[0],"explanation":"Nguồn lực."},{"id":"bc10","question":"Loa phường có lịch sử?","type":"single","options":["Bài cũ vẫn xem được","Xóa hết","Chỉ 1 ngày","Chỉ chat"],"correct":[0],"explanation":"Tư duy."},{"id":"bc11","question":"Nhầm /updates?","type":"single","options":["Đọc thêm /social","Bỏ qua","Xóa app","Thua"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc12","question":"Tự kiểm bài 10?","type":"single","options":["Mở /social + đọc 1 bài","Chỉ updates","Không cần","Chỉ chat"],"correct":[0],"explanation":"Báo cáo."}]}$j_c2000004_0000_0000_0000_000000000010$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-10.png',
  $eax_c2000004_0000_0000_0000_000000000010$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-10.png","caption":"/social — feed công ty; lọc phạm vi; đọc thông báo chính thức."}]$eax_c2000004_0000_0000_0000_000000000010$::jsonb
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
  'c2000004-0000-0001-0000-000000000010',
  'b2000004-0000-0000-0000-000000000010',
  'Thực hành trên phần mềm',
  'Đánh dấu khi bạn đã thực hành được trên phần mềm thật.',
  'checklist',
  $j_c2000004_0000_0001_0000_000000000010${"items":[{"id":"c1","text":"Mở /social — đọc 1 bài mới nhất."},{"id":"c2","text":"Phân biệt với /updates (Có gì mới)."}]}$j_c2000004_0000_0001_0000_000000000010$::jsonb,
  80,
  NULL,
  NULL,
  2,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-10.png',
  $eax_c2000004_0000_0001_0000_000000000010$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-10.png","caption":"/social — feed công ty; lọc phạm vi; đọc thông báo chính thức."}]$eax_c2000004_0000_0001_0000_000000000010$::jsonb
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
  'c2000004-0000-0000-0000-000000000011',
  'b2000004-0000-0000-0000-000000000011',
  'Kiểm tra: Bảng tin — đăng bài, reaction, chia sẻ chat',
  '12 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000004_0000_0000_0000_000000000011${"items":[{"id":"tt1","question":"Tạo bài ở?","type":"single","options":["Ô đầu feed /social","Chỉ admin PC","Chỉ KPI","Lead form"],"correct":[0],"explanation":"Nguồn lực."},{"id":"tt2","question":"Reaction để?","type":"single","options":["Phản hồi nhanh","Xóa bài","In PDF","KPI"],"correct":[0],"explanation":"Tư duy."},{"id":"td3","question":"Share sang chat?","type":"single","options":["Đẩy link/post vào nhóm chat","Xóa post","Chỉ email","Cấm"],"correct":[0],"explanation":"Vận hành."},{"id":"td4","question":"Không đăng?","type":"single","options":["SĐT khách, giá kín, bí mật","Ảnh team building","Thành tích","Chính sách"],"correct":[0],"explanation":"Báo cáo."},{"id":"nl5","question":"Comment vs reaction?","type":"single","options":["Comment dài; reaction nhanh","Giống nhau","Không liên quan","Cấm comment"],"correct":[0],"explanation":"Tư duy."},{"id":"nl6","question":"Phạm vi bài?","type":"single","options":["Công ty / nhóm chọn được","Chỉ public internet","Chỉ admin","Random"],"correct":[0],"explanation":"Vận hành."},{"id":"vh7","question":"Ảnh quá nặng?","type":"single","options":["Feed chậm — nén ảnh","Tốt","Thưởng","Bắt buộc"],"correct":[0],"explanation":"Báo cáo."},{"id":"vh8","question":"Bài toxic?","type":"single","options":["Ẩn / báo cáo admin","Share thêm","Thưởng","In ra"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc9","question":"Share messenger modal?","type":"single","options":["Chọn nhóm gửi","Tự gửi khách","Xóa Lead","KPI"],"correct":[0],"explanation":"Nguồn lực."},{"id":"bc10","question":"Văn hóa đăng?","type":"single","options":["Tích cực, không lộ KH","Đăng pass","Spam","Chửi"],"correct":[0],"explanation":"Tư tưởng."},{"id":"bc11","question":"Admin đo tiếp cận?","type":"single","options":["Reaction / comment count","Chỉ chat","Chỉ KPI Lead","Không"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc12","question":"Tự kiểm bài 11?","type":"single","options":["Reaction 1 bài + xem share chat","Chỉ đọc","Không cần","Chỉ ghi âm"],"correct":[0],"explanation":"Báo cáo."}]}$j_c2000004_0000_0000_0000_000000000011$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-11.png',
  $eax_c2000004_0000_0000_0000_000000000011$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-11.png","caption":"Tạo post; ảnh/video; reaction; comment; share sang messenger."}]$eax_c2000004_0000_0000_0000_000000000011$::jsonb
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
  'c2000004-0000-0001-0000-000000000011',
  'b2000004-0000-0000-0000-000000000011',
  'Thực hành trên phần mềm',
  'Đánh dấu khi bạn đã thực hành được trên phần mềm thật.',
  'checklist',
  $j_c2000004_0000_0001_0000_000000000011${"items":[{"id":"c1","text":"Reaction hoặc comment một bài."},{"id":"c2","text":"Mở menu share → xem chia sẻ sang chat (không bắt gửi)."}]}$j_c2000004_0000_0001_0000_000000000011$::jsonb,
  80,
  NULL,
  NULL,
  2,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-11.png',
  $eax_c2000004_0000_0001_0000_000000000011$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-11.png","caption":"Tạo post; ảnh/video; reaction; comment; share sang messenger."}]$eax_c2000004_0000_0001_0000_000000000011$::jsonb
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
  'c2000004-0000-0000-0000-000000000012',
  'b2000004-0000-0000-0000-000000000012',
  'Kiểm tra: Tổng hợp — 4 kênh trên một ca làm việc',
  '12 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000004_0000_0000_0000_000000000012${"items":[{"id":"tt1","question":"Hẹn khảo sát — kênh?","type":"single","options":["Sự kiện","Chỉ chat","Chỉ bảng tin","Chỉ KPI"],"correct":[0],"explanation":"Tư duy."},{"id":"tt2","question":"Thông báo công ty?","type":"single","options":["Bảng tin","Chat Lead","Ghi âm","Deal"],"correct":[0],"explanation":"Tư duy."},{"id":"td3","question":"Gọi khách — kênh?","type":"single","options":["Ghi âm + Lead","Chỉ chat","Chỉ sự kiện","Blocklist"],"correct":[0],"explanation":"Tư duy."},{"id":"td4","question":"Hỏi nhanh đồng nghiệp?","type":"single","options":["Chat / bong bóng","Bảng tin","Chỉ KPI","Email ngoài"],"correct":[0],"explanation":"Tư duy."},{"id":"nl5","question":"Đầu ca đọc?","type":"single","options":["/social","/login","/blocklist","/trash"],"correct":[0],"explanation":"Vận hành."},{"id":"nl6","question":"Sau gọi?","type":"single","options":["Ghi âm gắn Lead","Chỉ Zalo","Xóa Lead","In BG"],"correct":[0],"explanation":"Vận hành."},{"id":"vh7","question":"Cuối ca sự kiện?","type":"single","options":["Completed + comment","Bỏ qua","Xóa","Chỉ chat"],"correct":[0],"explanation":"Vận hành."},{"id":"vh8","question":"Thanh nhanh VC?","type":"single","options":["Icon Bảng tin, Sự kiện, Chat","Chỉ thùng rác","Chỉ KPI","Không"],"correct":[0],"explanation":"Nguồn lực."},{"id":"bc9","question":"4 kênh + Zalo riêng?","type":"single","options":["CRM trước, Zalo bổ sung","Chỉ Zalo","Bỏ CRM","Cấm chat"],"correct":[0],"explanation":"Tư tưởng."},{"id":"bc10","question":"Pro bỏ sót bảng tin?","type":"single","options":["Lỡ chính sách","Thưởng","KPI tăng","Nhanh hơn"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc11","question":"Checklist cuối ca?","type":"single","options":["Sự kiện + ghi âm + Lead","Chỉ chat","Không cần","Chỉ login"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc12","question":"Tự kiểm bài 12?","type":"single","options":["Làm checklist 1 ca thật","Chỉ đọc","Không cần","Chỉ thi"],"correct":[0],"explanation":"Báo cáo."}]}$j_c2000004_0000_0000_0000_000000000012$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-12.png',
  $eax_c2000004_0000_0000_0000_000000000012$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-12.png","caption":"Checklist ca làm: sự kiện → chat → bảng tin → ghi âm."}]$eax_c2000004_0000_0000_0000_000000000012$::jsonb
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
  'c2000004-0000-0001-0000-000000000012',
  'b2000004-0000-0000-0000-000000000012',
  'Thực hành trên phần mềm',
  'Đánh dấu khi bạn đã thực hành được trên phần mềm thật.',
  'checklist',
  $j_c2000004_0000_0001_0000_000000000012${"items":[{"id":"c1","text":"Một ca: đọc /social → xem /crm/events → dùng bong bóng chat → kiểm ghi âm."},{"id":"c2","text":"Tick đủ 4 kênh trên checklist giấy."}]}$j_c2000004_0000_0001_0000_000000000012$::jsonb,
  80,
  NULL,
  NULL,
  2,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-12.png',
  $eax_c2000004_0000_0001_0000_000000000012$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-12.png","caption":"Checklist ca làm: sự kiện → chat → bảng tin → ghi âm."}]$eax_c2000004_0000_0001_0000_000000000012$::jsonb
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
  'c2000004-0000-0000-0000-000000000099',
  'b2000004-0000-0000-0000-000000000013',
  'Bài thi tổng kết khoá',
  '20 câu — 30 phút — đạt 80% — tối đa 3 lượt. Phủ đủ 5 trụ.',
  'quiz',
  $j_c2000004_0000_0000_0000_000000000099${"items":[{"id":"fq1","question":"4 kênh nội bộ gồm?","type":"single","options":["Sự kiện, Chat, Bảng tin, Ghi âm","Lead, Deal, KPI, BG","Chỉ Zalo","Email"],"correct":[0],"explanation":"Tổng hợp."},{"id":"fq2","question":"Trang Sự kiện?","type":"single","options":["/crm/events","/social","/tools/voice-recordings","/kpi"],"correct":[0],"explanation":"Sự kiện."},{"id":"fq3","question":"Trang chat đầy đủ?","type":"single","options":["/crm/messenger","/social","/events","/login"],"correct":[0],"explanation":"Chat."},{"id":"fq4","question":"Bong bóng chat?","type":"single","options":["Góc phải — MessengerDock","Sidebar","Giữa Kanban","Email"],"correct":[0],"explanation":"Chat."},{"id":"fq5","question":"Bảng tin nội bộ?","type":"single","options":["/social","/updates","/crm/leads","/tools"],"correct":[0],"explanation":"Bảng tin."},{"id":"fq6","question":"Ghi âm?","type":"single","options":["/tools/voice-recordings","/social","/events","/messenger"],"correct":[0],"explanation":"Ghi âm."},{"id":"fq7","question":"Bảng tin vs Có gì mới?","type":"single","options":["Social=công ty; Updates=app","Giống nhau","Không liên quan","Chỉ admin"],"correct":[0],"explanation":"Phân biệt."},{"id":"fq8","question":"Sau cuộc gọi quan trọng?","type":"single","options":["Ghi âm + gắn Lead","Chỉ chat","Chỉ bảng tin","Bỏ qua"],"correct":[0],"explanation":"Ghi âm."},{"id":"fq9","question":"Sự kiện sau buổi gặp?","type":"single","options":["Completed + bình luận","Xóa","Chỉ Zalo","KPI"],"correct":[0],"explanation":"Sự kiện."},{"id":"fq10","question":"Chat Lead mở từ?","type":"single","options":["Chi tiết Lead","Chỉ bảng tin","Chỉ KPI","Blocklist"],"correct":[0],"explanation":"Chat."},{"id":"fq11","question":"Thanh nhanh dashboard VC?","type":"single","options":["Bảng tin, Sự kiện, Chat","Chỉ thùng rác","Chỉ Lead","Không có"],"correct":[0],"explanation":"Nguồn lực."},{"id":"fq12","question":"Đóng bong bóng?","type":"single","options":["Tin vẫn lưu","Mất tin","Xóa Lead","Logout"],"correct":[0],"explanation":"Chat."},{"id":"fq13","question":"Không ghi CRM — hậu quả?","type":"single","options":["Mất minh bạch team","Thưởng","Nhanh hơn","KPI tăng"],"correct":[0],"explanation":"Tư tưởng."},{"id":"fq14","question":"Reaction bảng tin?","type":"single","options":["Phản hồi nhanh","Xóa post","In PDF","KPI Lead"],"correct":[0],"explanation":"Bảng tin."},{"id":"fq15","question":"Share post sang chat?","type":"single","options":["Chọn nhóm messenger","Gửi khách SMS","Xóa Deal","Blocklist"],"correct":[0],"explanation":"Bảng tin."},{"id":"fq16","question":"Tab Lịch sự kiện?","type":"single","options":["Xem tháng","Chỉ chat","Chỉ KPI","In lương"],"correct":[0],"explanation":"Sự kiện."},{"id":"fq17","question":"Online dot xanh?","type":"single","options":["Đang hoạt động","Lead Hot","Deal thua","Offline forever"],"correct":[0],"explanation":"Chat."},{"id":"fq18","question":"Không lộ trên bảng tin?","type":"single","options":["SĐT khách, giá kín","Ảnh team","Chính sách","Thành tích"],"correct":[0],"explanation":"Bảo mật."},{"id":"fq19","question":"Checklist đầu ca?","type":"single","options":["Đọc /social + /crm/events","Chỉ login","Chỉ KPI","Blocklist"],"correct":[0],"explanation":"Vận hành."},{"id":"fq20","question":"Điều kiện thi tổng kết?","type":"single","options":["Đạt bài tập các bài trước","Chỉ login","Chỉ admin","Không cần"],"correct":[0],"explanation":"Quy định."}]}$j_c2000004_0000_0000_0000_000000000099$::jsonb,
  80,
  3,
  30,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-13.png',
  $eax_c2000004_0000_0000_0000_000000000099$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/collab-13.png","caption":"Bài thi tổng kết khoá — đạt yêu cầu để nhận chứng nhận."}]$eax_c2000004_0000_0000_0000_000000000099$::jsonb
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, image_url = EXCLUDED.image_url,
  attachments = EXCLUDED.attachments, updated_at = now();
COMMIT;
