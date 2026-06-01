-- 262
-- Khoá Deal
-- Seed Deal — 5 trụ, 12–14 câu/bài
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
  'Khoá đào tạo quản lý Deal sau Lead: pipeline, báo giá, HĐ, Thắng/Thua, bàn giao xưởng. Trật tự 5 trụ — dành người mới, giọng giảng viên.',
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
  'Bài 1: Vai trò Deal — Sau khi khách đã chốt mua',
  'Vì sao có giai đoạn Deal, trách nhiệm sales và mục tiêu ký HĐ + thu tiền.',
  $md_b2000002_0000_0000_0000_000000000001$# Bài 1: Vai trò Deal — Sau khi khách đã chốt mua

> _Anh Minh đã chốt 2 bộ cửa nhôm 38 triệu — đây là **Deal**: không còn "hỏi giá", mà là **hoàn tất hợp đồng và thu tiền**._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Deal = bạn chịu trách nhiệm đưa khách từ **lời hứa mua** đến **tiền vào công ty**.

- Lead = nuôi cơ hội; Deal = thu hoạch.
- Deal Thua cũng có giá trị — giúp công ty học vì sao mất khách.

## 2. Tư duy — Cách nghĩ trước khi làm

- **Deal** _(đã thống nhất mua, đang làm HĐ)_
- **Lead** _(chưa chốt)_
- **Thắng** _(đã HĐ + cọc, bàn giao xưởng)_

**Mental model:** Deal như **đường đua cuối** — Lead đã vào vòng trong, giờ về đích (Thắng) hoặc trượt (Thua).

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** **CRM → Bảng Deal**

- Kanban Deal
- Chi tiết Deal (tab Báo giá, HĐ, Tài liệu)
- Pipeline 6 giai đoạn mẫu

**Dữ liệu cần đủ:** Giá chốt, phạm vi SP, người phụ trách.


![Vì sao có giai đoạn Deal, trách nhiệm sales và mục tiêu ký HĐ + thu tiền.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-01.png)
## 4. Vận hành — Làm theo từng bước

1. Sau **Chuyển Deal** từ Lead → mở **Bảng Deal**.
2. Tìm Deal của bạn (bộ lọc tương tự Lead).
3. Đọc lịch sử Lead đã chuyển sang — không bắt đầu lại từ đầu.


> **Mẹo của mentor:** Deal kế thừa toàn bộ lịch sử Lead — đừng hỏi khách lại thông tin đã trao đổi.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi

**Tự kiểm sau khi làm:**
- Tôi biết Deal khác Lead?
- Tôi mở được Bảng Deal?


**Tín hiệu KPI bạn theo dõi:** Tỉ lệ Thắng/Thua, doanh số Deal.

## Tóm tắt 30 giây

Deal = giai đoạn sau chốt mua; mục tiêu HĐ + tiền; kế thừa lịch sử Lead.$md_b2000002_0000_0000_0000_000000000001$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-01.png',
  $att_b2000002_0000_0000_0000_000000000001$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-01.png","caption":"Vì sao có giai đoạn Deal, trách nhiệm sales và mục tiêu ký HĐ + thu tiền."}]$att_b2000002_0000_0000_0000_000000000001$::jsonb,
  10,
  ARRAY['deal', 'bai-1', '5-tru'],
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
  'Bài 2: Pipeline Deal — Sáu giai đoạn trên bảng',
  'Kanban Deal, 6 cột mẫu, kéo thẻ đúng giai đoạn, gate nhiệm vụ.',
  $md_b2000002_0000_0000_0000_000000000002$# Bài 2: Pipeline Deal — Sáu giai đoạn trên bảng

> _Deal mới → Báo giá → Đàm phán → Ký HĐ → **Thắng** hoặc **Thua**. Mỗi cột = một việc bạn phải làm thật._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Pipeline Deal là **bản đồ tiền** — sếp và bạn biết doanh số đang ở đâu.

- Kéo Thắng sớm = báo cáo doanh thu ảo.
- Thua có lý do = công ty cải thiện giá/dịch vụ.

## 2. Tư duy — Cách nghĩ trước khi làm

**Mental model:** Mỗi cột = **cổng kiểm** — có thể bị chặn nếu nhiệm vụ/báo giá chưa xong.

| Giai đoạn | Việc thường làm |
|---|---|
| Deal mới | Kiểm tra hồ sơ chuyển từ Lead |
| Báo giá | Gửi BG chính thức PDF |
| Đàm phán | Điều chỉnh giá/phụ kiện |
| Ký HĐ | Soạn HĐ, thu cọc |
| Thắng | Bàn giao xưởng |
| Thua | Chọn lý do mất |

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** **CRM → Bảng Deal → Kanban**

- Kéo thẻ
- Tab chi tiết Deal
- Gate nhiệm vụ

**Dữ liệu cần đủ:** Giai đoạn, giá, file HĐ.


![Kanban Deal, 6 cột mẫu, kéo thẻ đúng giai đoạn, gate nhiệm vụ.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-02.png)
## 4. Vận hành — Làm theo từng bước

1. Mở Kanban Deal.
2. Kéo thẻ **sau** khi hoàn thành việc cột hiện tại.
3. Đọc thông báo nếu bị chặn.
4. Thua: **bắt buộc** chọn lý do.


> **Mẹo của mentor:** Thắng chỉ khi **đã thu cọc** và upload chứng từ — không kéo cho "đẹp bảng".

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi


**Lỗi thường gặp:**
- Kéo Thắng chưa cọc.
- Thua không lý do.


**Tín hiệu KPI bạn theo dõi:** Tỉ lệ thắng, thời gian mỗi giai đoạn.

## Tóm tắt 30 giây

6 giai đoạn mẫu; kéo = việc đã làm; Thắng/Thua có quy tắc.$md_b2000002_0000_0000_0000_000000000002$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-02.png',
  $att_b2000002_0000_0000_0000_000000000002$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-02.png","caption":"Kanban Deal, 6 cột mẫu, kéo thẻ đúng giai đoạn, gate nhiệm vụ."}]$att_b2000002_0000_0000_0000_000000000002$::jsonb,
  10,
  ARRAY['deal', 'bai-2', '5-tru'],
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
  'Tạo/gửi báo giá PDF, lưu tab Báo giá & Tài liệu, version và xác nhận khách.',
  $md_b2000002_0000_0000_0000_000000000003$# Bài 3: Báo giá chính thức trên Deal

> _Sau đo đạc — gửi **báo giá chính thức PDF** cho chị Lan. File này là cơ sở pháp lý và KPI._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Báo giá = **cam kết số liệu** giữa bạn và khách — sai một dòng, tranh cãi cả đơn.

- BG miệng không đủ — cần PDF trên hệ thống.
- BG trên Deal liên kết với HĐ sau này.

## 2. Tư duy — Cách nghĩ trước khi làm

- **Báo giá sơ bộ** (Lead) vs **Báo giá chính thức** (Deal, sau đo đạc)

**Mental model:** BG chính thức = **hợp đồng nháp** — mọi thứ phải khớp HĐ.

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** Chi tiết Deal → tab **Báo giá** / **Tài liệu**

- Tạo báo giá
- Upload PDF
- Gửi link/email (nếu có)

**Dữ liệu cần đủ:** Diện tích, vật liệu, phụ kiện, tổng tiền, điều khoản cọc.


![Tạo/gửi báo giá PDF, lưu tab Báo giá & Tài liệu, version và xác nhận khách.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-03.png)
## 4. Vận hành — Làm theo từng bước

1. Tab **Báo giá** → tạo hoặc upload PDF.
2. Tên file rõ: `BG_ChịLan_2026-03.pdf`.
3. Ghi **Hoạt động**: "Đã gửi BG, KH xác nhận qua Zalo".
4. Kéo cột **Báo giá** khi KH đã nhận.


> **Mẹo của mentor:** Sau khi KH đồng ý BG — screenshot Zalo đính kèm Deal (minh chứng).

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi


**Lỗi thường gặp:**
- BG miệng không lưu file.
- Số tiền BG khác HĐ.


**Tín hiệu KPI bạn theo dõi:** Thời gian từ Deal mới → Báo giá.

## Tóm tắt 30 giây

BG chính thức = PDF trên Deal; khớp HĐ; minh chứng gửi/nhận.$md_b2000002_0000_0000_0000_000000000003$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-03.png',
  $att_b2000002_0000_0000_0000_000000000003$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-03.png","caption":"Tạo/gửi báo giá PDF, lưu tab Báo giá & Tài liệu, version và xác nhận khách."}]$att_b2000002_0000_0000_0000_000000000003$::jsonb,
  10,
  ARRAY['deal', 'bai-3', '5-tru'],
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
  'Bài 4: Đàm phán và điều chỉnh trên Deal',
  'Giảm giá, tặng phụ kiện, ghi nhận đàm phán, cập nhật BG và timeline.',
  $md_b2000002_0000_0000_0000_000000000004$# Bài 4: Đàm phán và điều chỉnh trên Deal

> _KH muốn giảm 2 triệu hoặc tặng thêm bản lề — mọi thỏa thuận phải **ghi trên Deal**, không chỉ nói miệng._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Đàm phán = cân **lợi nhuận công ty** và **chốt đơn** — ghi sai = xưởng làm sai, lỗ vốn.

- Thay đổi giá phải có phê duyệt (nếu quy định) và file cập nhật.

## 2. Tư duy — Cách nghĩ trước khi làm

**Mental model:** Mỗi lần đàm phán = **phiên bản mới** của BG — version cũ vẫn lưu để đối chiếu.

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** Chi tiết Deal — Báo giá, Hoạt động, Chat nội bộ

- Cập nhật BG
- @mention sếp phê duyệt
- Timeline đàm phán

**Dữ liệu cần đủ:** Giá cũ/mới, phụ kiện tặng, người duyệt.


![Giảm giá, tặng phụ kiện, ghi nhận đàm phán, cập nhật BG và timeline.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-04.png)
## 4. Vận hành — Làm theo từng bước

1. Ghi **Hoạt động** mỗi vòng đàm phán.
2. Cập nhật BG PDF hoặc bản revision.
3. Cần phê duyệt → chat @sếp trước khi hứa khách.
4. Kéo **Đàm phán** khi đang trao đổi.


> **Mẹo của mentor:** Không hứa giảm giá trên điện thoại trước khi sếp OK — ghi chú "chờ duyệt".

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi


**Lỗi thường gặp:**
- Hứa miệng không ghi.
- BG cũ và mới lẫn lộn.


**Tín hiệu KPI bạn theo dõi:** Tỉ lệ chốt sau đàm phán.

## Tóm tắt 30 giây

Đàm phán = ghi hoạt động + BG cập nhật + phê duyệt khi cần.$md_b2000002_0000_0000_0000_000000000004$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-04.png',
  $att_b2000002_0000_0000_0000_000000000004$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-04.png","caption":"Giảm giá, tặng phụ kiện, ghi nhận đàm phán, cập nhật BG và timeline."}]$att_b2000002_0000_0000_0000_000000000004$::jsonb,
  10,
  ARRAY['deal', 'bai-4', '5-tru'],
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
  'Soạn HĐ, thu cọc (vd 50%), upload chứng từ, cột Ký HĐ.',
  $md_b2000002_0000_0000_0000_000000000005$# Bài 5: Ký hợp đồng và thu cọc

> _Chị Lan ký HĐ, chuyển 50% cọc — upload **ảnh chuyển khoản + HĐ scan** lên Deal trước khi kéo **Thắng**._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Cọc = **cam kết pháp lý** — không cọc mà kéo Thắng = xưởng làm hàng không tiền.

- HĐ + cọc bảo vệ công ty và khách.

## 2. Tư duy — Cách nghĩ trước khi làm

- **Ký HĐ** _(cột pipeline)_ vs **Thắng** _(đủ cọc + bàn giao SX)_

**Mental model:** Cọc như **cọc giữ chỗ** — chưa cọc = chưa chắc chắn.

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** Deal → Tài liệu (HĐ, chứng từ cọc)

- Upload HĐ scan
- Upload ảnh CK
- Tab báo giá đối chiếu

**Dữ liệu cần đủ:** Số tiền cọc, % theo quy định công ty, ngày ký.


![Soạn HĐ, thu cọc (vd 50%), upload chứng từ, cột Ký HĐ.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-05.png)
## 4. Vận hành — Làm theo từng bước

1. Soạn/ký HĐ — số khớp BG.
2. Thu cọc theo % công ty (vd 50%).
3. Upload HĐ + chứng từ lên **Tài liệu**.
4. Ghi Hoạt động ngày ký + số tiền.
5. Kéo **Ký HĐ** — chưa Thắng nếu chưa đủ cọc.


> **Mẹo của mentor:** Ảnh chuyển khoản mờ — yêu cầu KH gửi lại; không kéo Thắng.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi


**Lỗi thường gặp:**
- Thắng chưa cọc.
- HĐ khác BG.


**Tín hiệu KPI bạn theo dõi:** Doanh số cọc tháng.

## Tóm tắt 30 giây

HĐ khớp BG; cọc có chứng từ; Thắng chỉ khi đủ điều kiện công ty.$md_b2000002_0000_0000_0000_000000000005$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-05.png',
  $att_b2000002_0000_0000_0000_000000000005$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-05.png","caption":"Soạn HĐ, thu cọc (vd 50%), upload chứng từ, cột Ký HĐ."}]$att_b2000002_0000_0000_0000_000000000005$::jsonb,
  10,
  ARRAY['deal', 'bai-5', '5-tru'],
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
  'Bài 6: Deal Thắng — Tạo dự án sản xuất',
  'Popup tạo dự án xưởng, bàn giao BOM/bản vẽ, checklist Thắng.',
  $md_b2000002_0000_0000_0000_000000000006$# Bài 6: Deal Thắng — Tạo dự án sản xuất

> _Kéo **Thắng** — popup **tạo dự án sản xuất**. Sales chấm dứt, xưởng bắt đầu — handoff phải đủ file._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Thắng = bạn **bàn giao** trách nhiệm cho xưởng — thiếu bản vẽ = delay SX.

- Handoff tốt = khách hài lòng, ít khiếu nại.

## 2. Tư duy — Cách nghĩ trước khi làm

**Mental model:** Thắng như **passing baton** — chạy đến đích và đưa gậy cho xưởng.

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** Popup Thắng + module **Xưởng / Dự án**

- Tạo dự án từ Deal
- Upload bản vẽ, BOM
- Chat @xưởng

**Dữ liệu cần đủ:** HĐ, cọc, bản vẽ, lịch giao.


![Popup tạo dự án xưởng, bàn giao BOM/bản vẽ, checklist Thắng.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-06.png)
## 4. Vận hành — Làm theo từng bước

1. Kiểm tra checklist: HĐ, cọc, BG, bản vẽ.
2. Kéo **Thắng** → điền popup tạo dự án.
3. Upload đủ file kỹ thuật.
4. @mention bộ phận SX trong chat Deal.


> **Mẹo của mentor:** Gọi cho xưởng 2 phút sau Thắng — xác nhận đã nhận đủ file.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi


**Lỗi thường gặp:**
- Thắng thiếu bản vẽ.
- Không tạo dự án popup.


**Tín hiệu KPI bạn theo dõi:** Doanh số Thắng, thời gian handoff.

## Tóm tắt 30 giây

Thắng = đủ cọc/HĐ + popup dự án + file kỹ thuật + thông báo xưởng.$md_b2000002_0000_0000_0000_000000000006$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-06.png',
  $att_b2000002_0000_0000_0000_000000000006$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-06.png","caption":"Popup tạo dự án xưởng, bàn giao BOM/bản vẽ, checklist Thắng."}]$att_b2000002_0000_0000_0000_000000000006$::jsonb,
  10,
  ARRAY['deal', 'bai-6', '5-tru'],
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
  'Bài 7: Deal Thua — Ghi lý do và học từ thất bại',
  'Chọn lý do thua, phân tích, không xóa Deal, báo cáo cho team.',
  $md_b2000002_0000_0000_0000_000000000007$# Bài 7: Deal Thua — Ghi lý do và học từ thất bại

> _KH chọn đối thủ rẻ hơn — kéo **Thua**, chọn lý do **Giá cao**. Dữ liệu này giúp công ty điều chỉnh chiến lược._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Thua trung thực = **bảo vệ uy tín** — Deal ảo Thắng tệ hơn Thua thật.

- Lý do Thua = feedback cho sản phẩm và pricing.

## 2. Tư duy — Cách nghĩ trước khi làm

- **Thua có lý do** vs **Deal bỏ quên** (không cập nhật)

**Mental model:** Thua = **kết thúc có học** — không phải thất bại cá nhân.

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** Kanban Deal → cột **Thua**

- Popup chọn lý do
- Ghi chú chi tiết
- Báo cáo thua theo tháng

**Dữ liệu cần đủ:** Lý do chuẩn: giá, đối thủ, timing, khác…


![Chọn lý do thua, phân tích, không xóa Deal, báo cáo cho team.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-07.png)
## 4. Vận hành — Làm theo từng bước

1. Xác nhận KH không mua.
2. Kéo **Thua** → chọn **lý do** từ danh sách.
3. Ghi Hoạt động chi tiết (đối thủ, giá, phản hồi KH).
4. Không xóa Deal.


> **Mẹo của mentor:** Thua vì giá — ghi rõ đối thủ báo bao nhiêu; marketing cần số liệu thật.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi


**Lỗi thường gặp:**
- Thua không lý do.
- Giữ Deal mãi ở Đàm phán.


**Tín hiệu KPI bạn theo dõi:** Tỉ lệ thua theo lý do.

## Tóm tắt 30 giây

Thua = lý do bắt buộc + ghi chú + giữ lịch sử.$md_b2000002_0000_0000_0000_000000000007$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-07.png',
  $att_b2000002_0000_0000_0000_000000000007$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-07.png","caption":"Chọn lý do thua, phân tích, không xóa Deal, báo cáo cho team."}]$att_b2000002_0000_0000_0000_000000000007$::jsonb,
  10,
  ARRAY['deal', 'bai-7', '5-tru'],
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
  'Task Deal, gate trước khi kéo cột, minh chứng tương tự Lead.',
  $md_b2000002_0000_0000_0000_000000000008$# Bài 8: Nhiệm vụ và gate trên Deal

> _Deal cũng có **nhiệm vụ gate** — chưa upload cọc thì không kéo sang cột tiếp theo._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Gate Deal bảo vệ **doanh thu thật** — không cho nhảy cóc Thắng.

- Task Deal: "Thu cọc", "Gửi bản vẽ", "Xác nhận ngày giao".

## 2. Tư duy — Cách nghĩ trước khi làm

**Mental model:** Giống Lead — **nhiệm vụ = hẹn**, **hoàn thành = minh chứng**.

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** Chi tiết Deal → tab **Nhiệm vụ**

- Tạo/hoàn thành task
- Gate khi kéo Kanban

**Dữ liệu cần đủ:** Hạn, file đính kèm, ghi chú.


![Task Deal, gate trước khi kéo cột, minh chứng tương tự Lead.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-08.png)
## 4. Vận hành — Làm theo từng bước

1. Tạo nhiệm vụ theo từng giai đoạn Deal.
2. Hoàn thành + ghi chú + file.
3. Kéo cột sau khi gate OK.


> **Mẹo của mentor:** Deal phức tạp hơn Lead — luôn có 2–3 task mở cho đến Thắng.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi


**Lỗi thường gặp:**
- Tick task chưa thu cọc.


**Tín hiệu KPI bạn theo dõi:** Đúng hạn task Deal.

## Tóm tắt 30 giây

Task Deal + gate + minh chứng — song song quy tắc Lead.$md_b2000002_0000_0000_0000_000000000008$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-08.png',
  $att_b2000002_0000_0000_0000_000000000008$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-08.png","caption":"Task Deal, gate trước khi kéo cột, minh chứng tương tự Lead."}]$att_b2000002_0000_0000_0000_000000000008$::jsonb,
  10,
  ARRAY['deal', 'bai-8', '5-tru'],
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
  'Bài 9: Tài liệu Deal — HĐ, vẽ, cọc, phân loại',
  'Lưu đúng loại file, tên chuẩn, tập trung hồ sơ một Deal.',
  $md_b2000002_0000_0000_0000_000000000009$# Bài 9: Tài liệu Deal — HĐ, vẽ, cọc, phân loại

> _Một Deal có thể có 10+ file — **HĐ**, **BG**, **ảnh đo**, **CK cọc**. Sai tab = xưởng không tìm thấy._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Tài liệu Deal = **hồ sơ pháp lý và kỹ thuật** — thiếu file = rủi ro tranh chấp.

- Tập trung một Deal — không rải email cá nhân.

## 2. Tư duy — Cách nghĩ trước khi làm

| Loại | Ví dụ | Tab |
|---|---|---|
| Báo giá | BG_*.pdf | Báo giá/Tài liệu |
| HĐ | HD_*.pdf | Tài liệu |
| Cọc | CK_*.jpg | Tài liệu |
| Bản vẽ | VE_*.pdf | Tài liệu |

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** Deal → **Tài liệu** (+ tab Báo giá)

- Upload
- Phân loại
- Tải xuống cho xưởng

**Dữ liệu cần đủ:** Tên file có nghĩa, ngày version.


![Lưu đúng loại file, tên chuẩn, tập trung hồ sơ một Deal.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-09.png)
## 4. Vận hành — Làm theo từng bước

1. Mỗi file upload ngay khi có.
2. Đặt tên: `Loại_TênKH_YYYY-MM.ext`.
3. Không lưu chat riêng làm kho chính.


> **Mẹo của mentor:** Cuối tuần: mở 3 Deal đang chạy — kiểm tra đủ 4 loại file chưa.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi


**Lỗi thường gặp:**
- File trong chat, không Tài liệu.
- Tên a.pdf.


**Tín hiệu KPI bạn theo dõi:** Handoff đủ file.

## Tóm tắt 30 giây

Mọi file Deal trên Tài liệu — tên rõ — đủ loại trước Thắng.$md_b2000002_0000_0000_0000_000000000009$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-09.png',
  $att_b2000002_0000_0000_0000_000000000009$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-09.png","caption":"Lưu đúng loại file, tên chuẩn, tập trung hồ sơ một Deal."}]$att_b2000002_0000_0000_0000_000000000009$::jsonb,
  10,
  ARRAY['deal', 'bai-9', '5-tru'],
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
  'Bài 10: KPI Deal — Doanh số, tỉ lệ thắng, đúng hạn',
  'Đọc Scorecard Deal, Ledger, kế hoạch cải thiện tỉ lệ thắng.',
  $md_b2000002_0000_0000_0000_000000000010$# Bài 10: KPI Deal — Doanh số, tỉ lệ thắng, đúng hạn

> _Tháng này: 5 Deal Thắng, 3 Thua (2 vì giá) — **Bảng điểm** cho bạn biết chỗ cần đàm phán tốt hơn._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** KPI Deal đo **kết quả kinh doanh** — không chỉ số cuộc gọi.

- Thua có lý do giúp bạn và công ty học — không che giấu.

## 2. Tư duy — Cách nghĩ trước khi làm

- **Doanh số Thắng**
- **Tỉ lệ thắng** (Thắng / (Thắng+Thua))
- **Thời gian chu kỳ Deal**

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** **CRM → Bảng điểm** (lọc Deal)

- Scorecard
- Báo cáo Thua theo lý do

**Dữ liệu cần đủ:** Số tiền cọc, ngày Thắng, lý do Thua.


![Đọc Scorecard Deal, Ledger, kế hoạch cải thiện tỉ lệ thắng.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-10.png)
## 4. Vận hành — Làm theo từng bước

1. Cuối tuần xem KPI Deal.
2. Thua vì giá → trao đổi team giải pháp.
3. Không kéo Thắng ảo để đẹp số.


> **Mẹo của mentor:** So sánh tỉ lệ thắng theo **nguồn Lead** — kênh nào cần lọc sớm.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi


**Lỗi thường gặp:**
- Chỉ nhìn doanh số, bỏ qua tỉ lệ thua.


**Tín hiệu KPI bạn theo dõi:** Doanh số, tỉ lệ thắng, SLA giai đoạn.

## Tóm tắt 30 giây

Bảng điểm Deal = doanh số + tỉ lệ thắng + thời gian; Thua có lý do = dữ liệu vàng.$md_b2000002_0000_0000_0000_000000000010$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-10.png',
  $att_b2000002_0000_0000_0000_000000000010$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-10.png","caption":"Đọc Scorecard Deal, Ledger, kế hoạch cải thiện tỉ lệ thắng."}]$att_b2000002_0000_0000_0000_000000000010$::jsonb,
  10,
  ARRAY['deal', 'bai-10', '5-tru'],
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
  'Bài 11: Bàn giao xưởng — Đủ thông tin trước sản xuất',
  'BOM, bản vẽ, lịch giao, liên hệ lắp đặt — checklist handoff.',
  $md_b2000002_0000_0000_0000_000000000011$# Bài 11: Bàn giao xưởng — Đủ thông tin trước sản xuất

> _Xưởng hỏi: "Bản vẽ đâu? Ngày giao đâu?" — checklist bàn giao tránh delay 2 tuần._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Sales **không kết thúc** ở Thắng — hỗ trợ xưởng đến khi hàng giao đúng hẹn.

- Handoff kém = sales bị KH gọi la dù đã cọc.

## 2. Tư duy — Cách nghĩ trước khi làm

**Mental model:** Handoff = **biên bản bàn giao** — thiếu mục nào ký nhận mục đó.

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** Deal Thắng + **Dự án xưởng**

- Chat @xưởng
- Upload BOM/bản vẽ
- Lịch giao trong dự án

**Dữ liệu cần đủ:** Địa chỉ lắp, SĐT lắp, ngày hẹn, yêu cầu đặc biệt.


![BOM, bản vẽ, lịch giao, liên hệ lắp đặt — checklist handoff.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-11.png)
## 4. Vận hành — Làm theo từng bước

1. Checklist: bản vẽ, BOM, HĐ, cọc, địa chỉ lắp, ngày giao.
2. Tạo dự án popup đầy đủ.
3. Gọi/ chat xưởng xác nhận.
4. Theo dõi đến khi giao — cập nhật KH.


> **Mẹo của mentor:** Copy địa chỉ lắp từ Lead — đã có sẵn nếu đủ 6 trường từ đầu.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi


**Lỗi thường gặp:**
- Thiếu địa chỉ lắp.
- Không ngày giao.


**Tín hiệu KPI bạn theo dõi:** Thời gian handoff, khiếu nại sau giao.

## Tóm tắt 30 giây

Checklist handoff đủ kỹ thuật + logistics; xác nhận xưởng; theo dõi đến giao hàng.$md_b2000002_0000_0000_0000_000000000011$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-11.png',
  $att_b2000002_0000_0000_0000_000000000011$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-11.png","caption":"BOM, bản vẽ, lịch giao, liên hệ lắp đặt — checklist handoff."}]$att_b2000002_0000_0000_0000_000000000011$::jsonb,
  10,
  ARRAY['deal', 'bai-11', '5-tru'],
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
  'Bài 12: Ôn tập Deal — Từ chuyển Lead đến Thắng/Thua',
  'Hành trình Deal end-to-end qua 5 trụ; checklist tổng.',
  $md_b2000002_0000_0000_0000_000000000012$# Bài 12: Ôn tập Deal — Từ chuyển Lead đến Thắng/Thua

> _Một Deal đi trọn: **Chuyển từ Lead** → BG → Đàm phán → HĐ + cọc → **Thắng** + xưởng — hoặc **Thua** có lý do._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Bạn nắm **dòng tiền** — mỗi cột pipeline gắn với hành động và file.

- Deal sai một bước = delay cả chuỗi SX.

## 2. Tư duy — Cách nghĩ trước khi làm

**Mental model:** Lead (nuôi) → Deal (thu hoạch) → Thắng (bàn giao) hoặc Thua (học).

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** Bảng Deal + Chi tiết + Bảng điểm + Dự án xưởng

- Kanban
- Tài liệu
- Task
- Scorecard


![Hành trình Deal end-to-end qua 5 trụ; checklist tổng.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-12.png)
## 4. Vận hành — Làm theo từng bước

1. Chuyển Deal (đủ điều kiện Lead).
2. BG chính thức → Đàm phán → HĐ + cọc.
3. Thắng + popup dự án + handoff xưởng.
4. Hoặc Thua + lý do.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi

**Tự kiểm sau khi làm:**
- Làm end-to-end được?
- Đọc KPI Deal?
- Handoff checklist?


**Tín hiệu KPI bạn theo dõi:** Toàn bộ chỉ số Deal.

## Tóm tắt 30 giây

Deal = 5 trụ từ pipeline đến Thắng/Thua; file và KPI không tách rời.$md_b2000002_0000_0000_0000_000000000012$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-12.png',
  $att_b2000002_0000_0000_0000_000000000012$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-12.png","caption":"Hành trình Deal end-to-end qua 5 trụ; checklist tổng."}]$att_b2000002_0000_0000_0000_000000000012$::jsonb,
  10,
  ARRAY['deal', 'bai-12', '5-tru'],
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

> _Bài thi tổng kết — đo lại toàn bộ 5 trụ: Tư tưởng, Tư duy, Nguồn lực, Vận hành, Báo cáo & Sửa chữa._

## 1. Mục đích

Đo tổng hợp 5 trụ. Sau khi nộp, hệ thống mở phần **giải thích** cho câu sai — đọc kỹ trước khi thi lại.

## 2. Quy định

- **20 câu** trắc nghiệm — phủ đủ 5 trụ

- Điểm đạt: **80%**

- Thời gian: **30 phút**

- Tối đa **3 lượt**

- **Điều kiện mở:** đạt **toàn bộ bài tập** trong khoá


![Bài thi tổng kết khoá — đạt yêu cầu để nhận chứng nhận.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-13.png)
## 3. Trước khi thi

Ôn lại các bài học bắt buộc và làm lại bài tập chưa đạt. Đặc biệt 2 trụ hay sai: **Vận hành** (thao tác phần mềm) và **Báo cáo & Sửa chữa** (KPI / lỗi thường gặp).

## 4. Sau khi thi

Nếu đạt — bạn nhận **chứng nhận** điện tử. Nếu chưa đạt — đọc giải thích, ôn lại và thi lại.$md_b2000002_0000_0000_0000_000000000013$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-13.png',
  $att_b2000002_0000_0000_0000_000000000013$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-13.png","caption":"Bài thi tổng kết khoá — đạt yêu cầu để nhận chứng nhận."}]$att_b2000002_0000_0000_0000_000000000013$::jsonb,
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
  passing_score, max_attempts, time_limit_minutes, sort_order,
  image_url, attachments
) VALUES (
  'c2000002-0000-0000-0000-000000000001',
  'b2000002-0000-0000-0000-000000000001',
  'Kiểm tra: Vai trò Deal — Sau khi khách đã chốt mua',
  '14 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000002_0000_0000_0000_000000000001${"items":[{"id":"tt1","question":"Vì sao tách Deal khỏi Lead?","type":"single","options":["Quản lý giai đoạn HĐ và thu tiền riêng","Làm khó nhân viên","Xóa Lead","Chỉ admin"],"correct":[0],"explanation":"Tư tưởng."},{"id":"tt2","question":"Deal Thua có giá trị?","type":"single","options":["Có — phân tích lý do mất","Không","Chỉ Thắng","Xóa luôn"],"correct":[0],"explanation":"Tư tưởng."},{"id":"td3","question":"Deal là gì?","type":"single","options":["Đã thống nhất mua, đang hoàn tất HĐ","Khách mới hỏi giá","Đã SX xong","Nhân viên mới"],"correct":[0],"explanation":"Tư duy."},{"id":"td4","question":"Deal khác Lead?","type":"single","options":["Deal sau chốt mua","Giống hệt","Lead sau Deal","Không liên quan"],"correct":[0],"explanation":"Tư duy."},{"id":"td5","question":"Thắng nghĩa là?","type":"single","options":["HĐ + cọc, bàn giao xưởng","Mới hỏi giá","Chưa gọi","Blocklist"],"correct":[0],"explanation":"Tư duy."},{"id":"nl6","question":"Bảng Deal ở?","type":"single","options":["CRM → Bảng Deal","Công việc","Kiến thức","Lương"],"correct":[0],"explanation":"Nguồn lực."},{"id":"nl7","question":"Deal kế thừa?","type":"single","options":["Lịch sử Lead","Không gì","Chỉ chat","Chỉ KPI"],"correct":[0],"explanation":"Nguồn lực."},{"id":"nl8","question":"Pipeline Deal mẫu?","type":"single","options":["6 giai đoạn đến Thắng/Thua","Không có","1 cột","Chỉ Lead"],"correct":[0],"explanation":"Nguồn lực."},{"id":"vh9","question":"Sau Chuyển Deal mở?","type":"single","options":["Bảng Deal","Blocklist","Lương","Chat công ty"],"correct":[0],"explanation":"Vận hành."},{"id":"vh10","question":"Mục tiêu Deal?","type":"single","options":["Ký HĐ + thu tiền","Chỉ hỏi giá","Xóa khách","Tạo Lead mới"],"correct":[0],"explanation":"Vận hành."},{"id":"vh11","question":"Hỏi lại thông tin Lead cũ?","type":"single","options":["Không — đọc lịch sử trước","Nên hỏi lại","Xóa Lead","Tạo mới"],"correct":[0],"explanation":"Vận hành."},{"id":"vh12","question":"Deal ảo (chưa chốt)?","type":"single","options":["Trừ KPI, sửa ngay","Tốt","Thưởng","Không sao"],"correct":[0],"explanation":"Vận hành."},{"id":"bc13","question":"KPI Deal gồm?","type":"single","options":["Thắng/Thua, doanh số","Chỉ màu tủ","Chỉ giờ nghỉ","Chỉ Facebook"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc14","question":"Deal Thua — làm gì?","type":"single","options":["Ghi lý do","Im lặng","Xóa","Tạo Lead trùng"],"correct":[0],"explanation":"Báo cáo."}]}$j_c2000002_0000_0000_0000_000000000001$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-01.png',
  $eax_c2000002_0000_0000_0000_000000000001$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-01.png","caption":"Vì sao có giai đoạn Deal, trách nhiệm sales và mục tiêu ký HĐ + thu tiền."}]$eax_c2000002_0000_0000_0000_000000000001$::jsonb
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
  'c2000002-0000-0000-0000-000000000002',
  'b2000002-0000-0000-0000-000000000002',
  'Kiểm tra: Pipeline Deal — Sáu giai đoạn trên bảng',
  '14 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000002_0000_0000_0000_000000000002${"items":[{"id":"tt1","question":"Pipeline Deal giúp?","type":"single","options":["Theo dõi tiến độ HĐ và tiền","Tính lương","Chat","Xóa Deal"],"correct":[0],"explanation":"Tư tưởng."},{"id":"tt2","question":"Thua có lý do — vì sao?","type":"single","options":["Phân tích cải thiện","Làm khó","Xóa KPI","Không cần"],"correct":[0],"explanation":"Tư tưởng."},{"id":"td3","question":"Kéo thẻ Deal để?","type":"single","options":["Đổi giai đoạn","Xóa","In lương","Tạo Lead"],"correct":[0],"explanation":"Tư duy."},{"id":"td4","question":"Thắng khi?","type":"single","options":["HĐ + cọc đủ quy định","Mới chuyển Deal","Chưa báo giá","Chưa gọi"],"correct":[0],"explanation":"Tư duy."},{"id":"td5","question":"Thua phải?","type":"single","options":["Chọn lý do","Im lặng","Xóa Deal","Tạo Lead trùng"],"correct":[0],"explanation":"Tư duy."},{"id":"nl6","question":"Kanban Deal ở?","type":"single","options":["Bảng Deal","Bảng Lead","Lương","Blocklist"],"correct":[0],"explanation":"Nguồn lực."},{"id":"nl7","question":"Gate nhiệm vụ trên Deal?","type":"single","options":["Có — giống Lead","Không bao giờ","Chỉ admin","Chỉ chat"],"correct":[0],"explanation":"Nguồn lực."},{"id":"nl8","question":"6 giai đoạn mẫu kết thúc?","type":"single","options":["Thắng hoặc Thua","Chỉ Thắng","Chỉ Lead","Không kết thúc"],"correct":[0],"explanation":"Nguồn lực."},{"id":"vh9","question":"Kéo Thắng chưa cọc?","type":"single","options":["Sai — báo cáo ảo","Đúng","Bắt buộc","Tốt"],"correct":[0],"explanation":"Vận hành."},{"id":"vh10","question":"Bị chặn khi kéo?","type":"single","options":["Đọc thông báo, hoàn thành nhiệm vụ","Bỏ qua","Xóa Deal","Đổi pass"],"correct":[0],"explanation":"Vận hành."},{"id":"vh11","question":"Thua — bước bắt buộc?","type":"single","options":["Chọn lý do","Xóa","Tạo Lead mới","Chat nội bộ"],"correct":[0],"explanation":"Vận hành."},{"id":"vh12","question":"Deal mới cột đầu?","type":"single","options":["Kiểm tra hồ sơ từ Lead","Thắng ngay","Thua ngay","Xóa"],"correct":[0],"explanation":"Vận hành."},{"id":"bc13","question":"Kéo ảo — sửa?","type":"single","options":["Kéo lại đúng + bổ sung minh chứng","Giữ nguyên","Xóa Deal","Báo cáo giả"],"correct":[0],"explanation":"Báo cáo."},{"id":"bc14","question":"Thua không lý do — hậu quả?","type":"single","options":["Mất dữ liệu phân tích","Thưởng","Không sao","Tự thăng chức"],"correct":[0],"explanation":"Báo cáo."}]}$j_c2000002_0000_0000_0000_000000000002$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-02.png',
  $eax_c2000002_0000_0000_0000_000000000002$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-02.png","caption":"Kanban Deal, 6 cột mẫu, kéo thẻ đúng giai đoạn, gate nhiệm vụ."}]$eax_c2000002_0000_0000_0000_000000000002$::jsonb
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
  'c2000002-0000-0000-0000-000000000003',
  'b2000002-0000-0000-0000-000000000003',
  'Kiểm tra: Báo giá chính thức trên Deal',
  '12 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000002_0000_0000_0000_000000000003${"items":[{"id":"tt1","question":"BG chính thức quan trọng vì?","type":"single","options":["Cam kết số liệu, cơ sở HĐ","Trang trí","Chỉ admin","Không cần"],"correct":[0],"explanation":"Tư tưởng."},{"id":"tt2","question":"BG miệng — rủi ro?","type":"single","options":["Tranh cãi, không đối soát","Tốt hơn PDF","Tự thưởng","Khách vui"],"correct":[0],"explanation":"Tư tưởng."},{"id":"td3","question":"BG sơ bộ vs chính thức?","type":"single","options":["Chính thức sau đo đạc trên Deal","Giống nhau","Chỉ Lead","Không có"],"correct":[0],"explanation":"Tư duy."},{"id":"td4","question":"BG khớp HĐ?","type":"single","options":["Bắt buộc","Không cần","Chỉ tên","Chỉ ngày"],"correct":[0],"explanation":"Tư duy."},{"id":"td5","question":"File BG lưu?","type":"single","options":["Tab Báo giá / Tài liệu Deal","Chat riêng","Email cá nhân","Không lưu"],"correct":[0],"explanation":"Tư duy."},{"id":"nl6","question":"Tên file BG tốt?","type":"single","options":["BG_ChịLan_2026-03.pdf","a.pdf","1.jpg","tmp"],"correct":[0],"explanation":"Nguồn lực."},{"id":"nl7","question":"Tab Báo giá trên?","type":"single","options":["Chi tiết Deal","Bảng Lead","Lương","Blocklist"],"correct":[0],"explanation":"Nguồn lực."},{"id":"nl8","question":"Minh chứng gửi BG?","type":"single","options":["Screenshot Zalo / Hoạt động","Không cần","Chỉ miệng","Xóa Deal"],"correct":[0],"explanation":"Nguồn lực."},{"id":"vh9","question":"Sau gửi BG — ghi?","type":"single","options":["Hoạt động + file","Im lặng","Xóa Deal","Thua ngay"],"correct":[0],"explanation":"Vận hành."},{"id":"vh10","question":"Kéo cột Báo giá khi?","type":"single","options":["KH đã nhận BG","Chưa tạo BG","Mới Lead","Blocklist"],"correct":[0],"explanation":"Vận hành."},{"id":"vh11","question":"Số tiền BG khác HĐ — sửa?","type":"single","options":["Sửa BG hoặc HĐ cho khớp trước ký","Bỏ qua","Ký luôn","Xóa Deal"],"correct":[0],"explanation":"Báo cáo."},{"id":"vh12","question":"Không lưu PDF — sửa?","type":"single","options":["Upload + ghi hoạt động","BG miệng","Thua","Tạo Lead mới"],"correct":[0],"explanation":"Báo cáo."}]}$j_c2000002_0000_0000_0000_000000000003$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-03.png',
  $eax_c2000002_0000_0000_0000_000000000003$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-03.png","caption":"Tạo/gửi báo giá PDF, lưu tab Báo giá & Tài liệu, version và xác nhận khách."}]$eax_c2000002_0000_0000_0000_000000000003$::jsonb
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
  'c2000002-0000-0000-0000-000000000004',
  'b2000002-0000-0000-0000-000000000004',
  'Kiểm tra: Đàm phán và điều chỉnh trên Deal',
  '12 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000002_0000_0000_0000_000000000004${"items":[{"id":"tt1","question":"Đàm phán phải ghi vì?","type":"single","options":["Xưởng và kế toán cần số đúng","Không cần","Chỉ chat riêng","Xóa Deal"],"correct":[0],"explanation":"Tư tưởng."},{"id":"tt2","question":"Hứa giảm giá miệng — rủi ro?","type":"single","options":["Lỗ vốn, tranh cãi","Tốt","Thưởng","Khách vui"],"correct":[0],"explanation":"Tư tưởng."},{"id":"td3","question":"Mỗi vòng đàm phán?","type":"single","options":["Ghi Hoạt động + BG nếu đổi","Im lặng","Thua ngay","Xóa"],"correct":[0],"explanation":"Tư duy."},{"id":"td4","question":"BG revision?","type":"single","options":["Lưu version, khớp HĐ cuối","Xóa bản cũ","Chỉ miệng","Không cần"],"correct":[0],"explanation":"Tư duy."},{"id":"td5","question":"Giảm giá lớn?","type":"single","options":["Phê duyệt sếp trước","Tự quyết","Không ghi","Blocklist"],"correct":[0],"explanation":"Tư duy."},{"id":"nl6","question":"Ghi đàm phán ở?","type":"single","options":["Hoạt động Deal","Chỉ sổ tay","Blocklist","Lương"],"correct":[0],"explanation":"Nguồn lực."},{"id":"nl7","question":"@mention sếp khi?","type":"single","options":["Cần duyệt giá/ tặng","Mọi lúc","Không bao giờ","Cuối năm"],"correct":[0],"explanation":"Nguồn lực."},{"id":"nl8","question":"Cột Đàm phán khi?","type":"single","options":["Đang trao đổi giá/phụ kiện","Đã Thắng","Mới Lead","Blocklist"],"correct":[0],"explanation":"Nguồn lực."},{"id":"vh9","question":"Chưa duyệt — hứa khách?","type":"single","options":["Ghi \"chờ duyệt\", chưa chốt","Hứa luôn","Thua","Xóa"],"correct":[0],"explanation":"Vận hành."},{"id":"vh10","question":"Sau thỏa thuận?","type":"single","options":["Cập nhật BG + hoạt động","Im lặng","Thua","Lead mới"],"correct":[0],"explanation":"Vận hành."},{"id":"vh11","question":"BG cũ/mới lẫn — sửa?","type":"single","options":["Đánh dấu version, file rõ tên","Xóa Deal","BG miệng","Bỏ qua"],"correct":[0],"explanation":"Báo cáo."},{"id":"vh12","question":"Không ghi đàm phán — sửa?","type":"single","options":["Bổ sung timeline + BG","Thua","Xóa","Báo cáo giả"],"correct":[0],"explanation":"Báo cáo."}]}$j_c2000002_0000_0000_0000_000000000004$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-04.png',
  $eax_c2000002_0000_0000_0000_000000000004$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-04.png","caption":"Giảm giá, tặng phụ kiện, ghi nhận đàm phán, cập nhật BG và timeline."}]$eax_c2000002_0000_0000_0000_000000000004$::jsonb
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
  'c2000002-0000-0000-0000-000000000005',
  'b2000002-0000-0000-0000-000000000005',
  'Kiểm tra: Ký hợp đồng và thu cọc',
  '12 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000002_0000_0000_0000_000000000005${"items":[{"id":"tt1","question":"Cọc quan trọng vì?","type":"single","options":["Cam kết pháp lý, bảo vệ công ty","Trang trí","Không cần","Chỉ admin"],"correct":[0],"explanation":"Tư tưởng."},{"id":"tt2","question":"Thắng chưa cọc?","type":"single","options":["Sai — rủi ro tài chính","Đúng","Bắt buộc","Tốt"],"correct":[0],"explanation":"Tư tưởng."},{"id":"td3","question":"Ký HĐ vs Thắng?","type":"single","options":["Thắng sau khi đủ cọc + điều kiện","Giống nhau","Thắng trước HĐ","Không liên quan"],"correct":[0],"explanation":"Tư duy."},{"id":"td4","question":"HĐ số tiền?","type":"single","options":["Khớp BG cuối","Tùy ý","Chỉ miệng","Không cần"],"correct":[0],"explanation":"Tư duy."},{"id":"td5","question":"Chứng từ cọc lưu?","type":"single","options":["Tài liệu Deal","Chat riêng","Xóa","Email cá nhân"],"correct":[0],"explanation":"Tư duy."},{"id":"nl6","question":"Upload HĐ scan ở?","type":"single","options":["Tài liệu Deal","Lead","Lương","Blocklist"],"correct":[0],"explanation":"Nguồn lực."},{"id":"nl7","question":"% cọc theo?","type":"single","options":["Quy định công ty","Tùy nhân viên","Không cần","100% luôn"],"correct":[0],"explanation":"Nguồn lực."},{"id":"nl8","question":"Ảnh CK mờ?","type":"single","options":["Yêu cầu KH gửi lại","Vẫn Thắng","Xóa Deal","Thua"],"correct":[0],"explanation":"Nguồn lực."},{"id":"vh9","question":"Sau thu cọc?","type":"single","options":["Upload + ghi Hoạt động","Im lặng","Thua","Lead mới"],"correct":[0],"explanation":"Vận hành."},{"id":"vh10","question":"Kéo Thắng khi?","type":"single","options":["Đủ cọc + HĐ theo quy định","Mới Deal","Chưa BG","Blocklist"],"correct":[0],"explanation":"Vận hành."},{"id":"vh11","question":"HĐ khác BG — sửa?","type":"single","options":["Sửa cho khớp trước ký","Ký luôn","Thua","Xóa"],"correct":[0],"explanation":"Báo cáo."},{"id":"vh12","question":"Thắng ảo — sửa?","type":"single","options":["Kéo lại + bổ sung cọc","Giữ Thắng","Báo cáo giả","Xóa KPI"],"correct":[0],"explanation":"Báo cáo."}]}$j_c2000002_0000_0000_0000_000000000005$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-05.png',
  $eax_c2000002_0000_0000_0000_000000000005$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-05.png","caption":"Soạn HĐ, thu cọc (vd 50%), upload chứng từ, cột Ký HĐ."}]$eax_c2000002_0000_0000_0000_000000000005$::jsonb
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
  'c2000002-0000-0000-0000-000000000006',
  'b2000002-0000-0000-0000-000000000006',
  'Kiểm tra: Deal Thắng — Tạo dự án sản xuất',
  '12 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000002_0000_0000_0000_000000000006${"items":[{"id":"tt1","question":"Thắng — vai trò sales?","type":"single","options":["Bàn giao đủ cho xưởng","Xóa Deal","Lead mới","Blocklist"],"correct":[0],"explanation":"Tư tưởng."},{"id":"tt2","question":"Handoff kém?","type":"single","options":["Delay SX, khiếu nại","Tốt","Thưởng","Không sao"],"correct":[0],"explanation":"Tư tưởng."},{"id":"td3","question":"Thắng giống?","type":"single","options":["Passing baton cho xưởng","Kết thúc CRM","Xóa khách","Chỉ KPI"],"correct":[0],"explanation":"Tư duy."},{"id":"td4","question":"Popup Thắng?","type":"single","options":["Tạo dự án SX","Xóa Deal","Tạo Lead","Lương"],"correct":[0],"explanation":"Tư duy."},{"id":"td5","question":"File kỹ thuật?","type":"single","options":["Bản vẽ, BOM trên Deal/Tài liệu","Chỉ miệng","Chat riêng","Không cần"],"correct":[0],"explanation":"Tư duy."},{"id":"nl6","question":"Sau Thắng — module?","type":"single","options":["Xưởng / Dự án","Chỉ Lead","Blocklist","Lương"],"correct":[0],"explanation":"Nguồn lực."},{"id":"nl7","question":"@xưởng khi?","type":"single","options":["Sau Thắng + upload file","Không bao giờ","Trước Lead","Cuối năm"],"correct":[0],"explanation":"Nguồn lực."},{"id":"nl8","question":"Checklist Thắng gồm?","type":"single","options":["HĐ, cọc, BG, bản vẽ","Chỉ SĐT","Chỉ chat","Không cần"],"correct":[0],"explanation":"Nguồn lực."},{"id":"vh9","question":"Thiếu bản vẽ — kéo Thắng?","type":"single","options":["Không — bổ sung trước","Vẫn kéo","Thua","Xóa"],"correct":[0],"explanation":"Vận hành."},{"id":"vh10","question":"Sau popup?","type":"single","options":["Xác nhận xưởng nhận","Im lặng","Lead mới","Blocklist"],"correct":[0],"explanation":"Vận hành."},{"id":"vh11","question":"Thắng thiếu file — sửa?","type":"single","options":["Upload + thông báo xưởng","Bỏ qua","Thua","Báo cáo giả"],"correct":[0],"explanation":"Báo cáo."},{"id":"vh12","question":"Không tạo dự án — sửa?","type":"single","options":["Chạy lại popup / liên hệ admin","Bỏ qua","Xóa Deal","Lead mới"],"correct":[0],"explanation":"Báo cáo."}]}$j_c2000002_0000_0000_0000_000000000006$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-06.png',
  $eax_c2000002_0000_0000_0000_000000000006$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-06.png","caption":"Popup tạo dự án xưởng, bàn giao BOM/bản vẽ, checklist Thắng."}]$eax_c2000002_0000_0000_0000_000000000006$::jsonb
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
  'c2000002-0000-0001-0000-000000000006',
  'b2000002-0000-0000-0000-000000000006',
  'Thực hành trên phần mềm',
  'Đánh dấu khi bạn đã thực hành được trên phần mềm thật.',
  'checklist',
  $j_c2000002_0000_0001_0000_000000000006${"items":[{"id":"c1","text":"HĐ + cọc đủ trên Tài liệu"},{"id":"c2","text":"Đã kéo Thắng + popup dự án"},{"id":"c3","text":"Bản vẽ/BOM đã upload"},{"id":"c4","text":"Đã @xưởng hoặc gọi xác nhận"}]}$j_c2000002_0000_0001_0000_000000000006$::jsonb,
  80,
  NULL,
  NULL,
  2,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-06.png',
  $eax_c2000002_0000_0001_0000_000000000006$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-06.png","caption":"Popup tạo dự án xưởng, bàn giao BOM/bản vẽ, checklist Thắng."}]$eax_c2000002_0000_0001_0000_000000000006$::jsonb
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
  'c2000002-0000-0000-0000-000000000007',
  'b2000002-0000-0000-0000-000000000007',
  'Kiểm tra: Deal Thua — Ghi lý do và học từ thất bại',
  '12 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000002_0000_0000_0000_000000000007${"items":[{"id":"tt1","question":"Thua trung thực?","type":"single","options":["Tốt hơn Deal ảo Thắng","Xấu","Xóa ngay","Không ghi"],"correct":[0],"explanation":"Tư tưởng."},{"id":"tt2","question":"Lý do Thua giúp?","type":"single","options":["Công ty cải thiện giá/SP","Làm khó","Xóa KPI","Không cần"],"correct":[0],"explanation":"Tư tưởng."},{"id":"td3","question":"Thua vs bỏ quên?","type":"single","options":["Thua = cập nhật lý do","Giống nhau","Bỏ quên tốt hơn","Xóa Deal"],"correct":[0],"explanation":"Tư duy."},{"id":"td4","question":"Thua — bắt buộc?","type":"single","options":["Chọn lý do","Im lặng","Xóa","Lead mới"],"correct":[0],"explanation":"Tư duy."},{"id":"td5","question":"Ghi chi tiết Thua?","type":"single","options":["Đối thủ, giá, phản hồi KH","Chỉ \"thua\"","Không ghi","Blocklist"],"correct":[0],"explanation":"Tư duy."},{"id":"nl6","question":"Popup Thua ở?","type":"single","options":["Kéo cột Thua Kanban","Lead","Lương","Chat công ty"],"correct":[0],"explanation":"Nguồn lực."},{"id":"nl7","question":"Lý do chuẩn?","type":"single","options":["Giá, đối thủ, timing…","Chỉ \"khác\"","Không có","Tùy ý text"],"correct":[0],"explanation":"Nguồn lực."},{"id":"nl8","question":"Deal Thua có xóa?","type":"single","options":["Không — giữ lịch sử","Xóa ngay","Tạo Lead trùng","Blocklist"],"correct":[0],"explanation":"Nguồn lực."},{"id":"vh9","question":"KH chọn đối thủ — làm?","type":"single","options":["Thua + lý do + ghi giá đối thủ","Thắng","Im lặng","Xóa"],"correct":[0],"explanation":"Vận hành."},{"id":"vh10","question":"Deal nằm Đàm phán 2 tháng?","type":"single","options":["Cập nhật Thua hoặc tiếp tục có kế hoạch","Bỏ quên","Thắng ảo","Xóa"],"correct":[0],"explanation":"Vận hành."},{"id":"vh11","question":"Thua không lý do — sửa?","type":"single","options":["Mở Deal, chọn lý do","Xóa","Thắng","Báo cáo giả"],"correct":[0],"explanation":"Báo cáo."},{"id":"vh12","question":"Giữ Deal ảo Thắng — sửa?","type":"single","options":["Kéo lại + sửa trạng thái thật","Giữ nguyên","Thưởng","Không sao"],"correct":[0],"explanation":"Báo cáo."}]}$j_c2000002_0000_0000_0000_000000000007$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-07.png',
  $eax_c2000002_0000_0000_0000_000000000007$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-07.png","caption":"Chọn lý do thua, phân tích, không xóa Deal, báo cáo cho team."}]$eax_c2000002_0000_0000_0000_000000000007$::jsonb
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
  'c2000002-0000-0000-0000-000000000008',
  'b2000002-0000-0000-0000-000000000008',
  'Kiểm tra: Nhiệm vụ và gate trên Deal',
  '12 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000002_0000_0000_0000_000000000008${"items":[{"id":"tt1","question":"Gate Deal bảo vệ?","type":"single","options":["Doanh thu và quy trình thật","Chỉ admin","Chat","Màu tủ"],"correct":[0],"explanation":"Tư tưởng."},{"id":"tt2","question":"Task Deal ví dụ?","type":"single","options":["Thu cọc, gửi bản vẽ","Tính lương","Blocklist","Lead mới"],"correct":[0],"explanation":"Tư tưởng."},{"id":"td3","question":"Gate giống Lead?","type":"single","options":["Có — nhiệm vụ chặn kéo cột","Không bao giờ","Chỉ Thua","Chỉ chat"],"correct":[0],"explanation":"Tư duy."},{"id":"td4","question":"Hoàn thành task Deal?","type":"single","options":["Ghi chú + file nếu cần","Chỉ tick","Xóa Deal","Thua"],"correct":[0],"explanation":"Tư duy."},{"id":"td5","question":"Nhiệm vụ vs hoạt động Deal?","type":"single","options":["Task = sắp làm; Hoạt động = đã làm","Giống hệt","Không dùng","Chỉ admin"],"correct":[0],"explanation":"Tư duy."},{"id":"nl6","question":"Tab nhiệm vụ Deal?","type":"single","options":["Chi tiết Deal","Lead","Lương","Blocklist"],"correct":[0],"explanation":"Nguồn lực."},{"id":"nl7","question":"Gate chặn khi?","type":"single","options":["Task bắt buộc chưa xong","Trời mưa","VIP","Cuối tuần"],"correct":[0],"explanation":"Nguồn lực."},{"id":"nl8","question":"File cọc gắn?","type":"single","options":["Task thu cọc / Tài liệu","Chat riêng","Xóa","Email cá nhân"],"correct":[0],"explanation":"Nguồn lực."},{"id":"vh9","question":"Chưa cọc — kéo Thắng?","type":"single","options":["Không — hoàn thành task trước","Vẫn kéo","Thua","Lead mới"],"correct":[0],"explanation":"Vận hành."},{"id":"vh10","question":"Bị chặn — làm?","type":"single","options":["Đọc thông báo, làm task","Bỏ qua","Xóa Deal","Báo cáo giả"],"correct":[0],"explanation":"Vận hành."},{"id":"vh11","question":"Tick giả task — sửa?","type":"single","options":["Mở lại + minh chứng thật","Giữ tick","Thưởng","Không sao"],"correct":[0],"explanation":"Báo cáo."},{"id":"vh12","question":"KPI task Deal?","type":"single","options":["Đúng hạn","Màu sơn","Giờ nghỉ","Facebook"],"correct":[0],"explanation":"Báo cáo."}]}$j_c2000002_0000_0000_0000_000000000008$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-08.png',
  $eax_c2000002_0000_0000_0000_000000000008$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-08.png","caption":"Task Deal, gate trước khi kéo cột, minh chứng tương tự Lead."}]$eax_c2000002_0000_0000_0000_000000000008$::jsonb
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
  'c2000002-0000-0000-0000-000000000009',
  'b2000002-0000-0000-0000-000000000009',
  'Kiểm tra: Tài liệu Deal — HĐ, vẽ, cọc, phân loại',
  '12 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000002_0000_0000_0000_000000000009${"items":[{"id":"tt1","question":"Tài liệu Deal quan trọng?","type":"single","options":["Hồ sơ pháp lý + kỹ thuật","Trang trí","Chỉ admin","Không cần"],"correct":[0],"explanation":"Tư tưởng."},{"id":"tt2","question":"File rải email cá nhân?","type":"single","options":["Mất tập trung, handoff khó","Tốt","Thưởng","Bắt buộc"],"correct":[0],"explanation":"Tư tưởng."},{"id":"td3","question":"HĐ scan lưu?","type":"single","options":["Tài liệu Deal","Chat riêng","Lead","Xóa"],"correct":[0],"explanation":"Tư duy."},{"id":"td4","question":"Tên file tốt?","type":"single","options":["HD_ChịLan_2026-03.pdf","a.pdf","1.jpg","tmp"],"correct":[0],"explanation":"Tư duy."},{"id":"td5","question":"BG vs HĐ tab?","type":"single","options":["Cùng hồ sơ Deal — Báo giá/Tài liệu","Không lưu","Chỉ miệng","Blocklist"],"correct":[0],"explanation":"Tư duy."},{"id":"nl6","question":"Upload khi?","type":"single","options":["Ngay khi có file","Cuối năm","Sau Thua","Không"],"correct":[0],"explanation":"Nguồn lực."},{"id":"nl7","question":"Bản vẽ cho xưởng?","type":"single","options":["Tài liệu Deal","Zalo riêng","Không gửi","Lead"],"correct":[0],"explanation":"Nguồn lực."},{"id":"nl8","question":"4 loại file trước Thắng?","type":"single","options":["BG, HĐ, cọc, bản vẽ (theo SP)","Chỉ SĐT","Chỉ chat","Không cần"],"correct":[0],"explanation":"Nguồn lực."},{"id":"vh9","question":"File mới từ KH?","type":"single","options":["Upload + ghi hoạt động","Im lặng","Thua","Xóa Deal"],"correct":[0],"explanation":"Vận hành."},{"id":"vh10","question":"Xưởng không thấy file?","type":"single","options":["Kiểm tra Tài liệu Deal + @mention","Bỏ qua","Thắng lại","Lead mới"],"correct":[0],"explanation":"Vận hành."},{"id":"vh11","question":"a.pdf — sửa?","type":"single","options":["Đổi tên có nghĩa","Giữ","Xóa Deal","Thua"],"correct":[0],"explanation":"Báo cáo."},{"id":"vh12","question":"File chỉ trong chat — sửa?","type":"single","options":["Upload lại Tài liệu","Bỏ qua","Báo cáo giả","Blocklist"],"correct":[0],"explanation":"Báo cáo."}]}$j_c2000002_0000_0000_0000_000000000009$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-09.png',
  $eax_c2000002_0000_0000_0000_000000000009$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-09.png","caption":"Lưu đúng loại file, tên chuẩn, tập trung hồ sơ một Deal."}]$eax_c2000002_0000_0000_0000_000000000009$::jsonb
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
  'c2000002-0000-0000-0000-000000000010',
  'b2000002-0000-0000-0000-000000000010',
  'Kiểm tra: KPI Deal — Doanh số, tỉ lệ thắng, đúng hạn',
  '12 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000002_0000_0000_0000_000000000010${"items":[{"id":"tt1","question":"KPI Deal đo?","type":"single","options":["Kết quả kinh doanh","Chỉ màu tủ","Giờ nghỉ","Facebook"],"correct":[0],"explanation":"Tư tưởng."},{"id":"tt2","question":"Thua có lý do — KPI?","type":"single","options":["Dữ liệu để cải thiện","Vô dụng","Xóa","Phạt cá nhân"],"correct":[0],"explanation":"Tư tưởng."},{"id":"td3","question":"Tỉ lệ thắng?","type":"single","options":["Thắng / (Thắng+Thua)","Chỉ Lead","Chỉ chat","Không có"],"correct":[0],"explanation":"Tư duy."},{"id":"td4","question":"Doanh số Thắng?","type":"single","options":["Tiền cọc/HĐ đã ghi nhận","BG miệng","Lead mới","Blocklist"],"correct":[0],"explanation":"Tư duy."},{"id":"td5","question":"Thắng ảo KPI?","type":"single","options":["Làm sai số liệu — tránh","Tốt","Thưởng","Bắt buộc"],"correct":[0],"explanation":"Tư duy."},{"id":"nl6","question":"Xem KPI Deal?","type":"single","options":["Bảng điểm CRM","Chỉ sếp","Zalo","Không"],"correct":[0],"explanation":"Nguồn lực."},{"id":"nl7","question":"Báo cáo Thua theo?","type":"single","options":["Lý do","Màu mắt","Giờ nghỉ","Chat"],"correct":[0],"explanation":"Nguồn lực."},{"id":"nl8","question":"Ledger Deal?","type":"single","options":["Sự kiện cộng/trừ điểm","Loại cửa","Mã HĐ","Tên KH"],"correct":[0],"explanation":"Nguồn lực."},{"id":"vh9","question":"Thua vì giá — hành động?","type":"single","options":["Trao đổi team, điều chỉnh chiến lược","Bỏ qua","Thắng ảo","Xóa"],"correct":[0],"explanation":"Vận hành."},{"id":"vh10","question":"Cuối tuần Deal KPI?","type":"single","options":["Xem Scorecard + kế hoạch","Bỏ qua","Tick giả","Tắt CRM"],"correct":[0],"explanation":"Vận hành."},{"id":"vh11","question":"Chỉ nhìn doanh số — thiếu?","type":"single","options":["Tỉ lệ thua và thời gian chu kỳ","Không thiếu","Chat","Lead"],"correct":[0],"explanation":"Báo cáo."},{"id":"vh12","question":"KPI thấp — sửa?","type":"single","options":["Kế hoạch hành vi cụ thể","Báo cáo giả","Tắt CRM","Thua không lý do"],"correct":[0],"explanation":"Báo cáo."}]}$j_c2000002_0000_0000_0000_000000000010$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-10.png',
  $eax_c2000002_0000_0000_0000_000000000010$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-10.png","caption":"Đọc Scorecard Deal, Ledger, kế hoạch cải thiện tỉ lệ thắng."}]$eax_c2000002_0000_0000_0000_000000000010$::jsonb
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
  'c2000002-0000-0000-0000-000000000011',
  'b2000002-0000-0000-0000-000000000011',
  'Kiểm tra: Bàn giao xưởng — Đủ thông tin trước sản xuất',
  '12 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000002_0000_0000_0000_000000000011${"items":[{"id":"tt1","question":"Sales kết thúc ở Thắng?","type":"single","options":["Không — hỗ trợ đến giao hàng","Có","Xóa Deal","Lead mới"],"correct":[0],"explanation":"Tư tưởng."},{"id":"tt2","question":"Handoff kém?","type":"single","options":["KH gọi la, delay","Tốt","Thưởng","Không sao"],"correct":[0],"explanation":"Tư tưởng."},{"id":"td3","question":"Handoff giống?","type":"single","options":["Biên bản bàn giao","Chat riêng","Blocklist","Thua"],"correct":[0],"explanation":"Tư duy."},{"id":"td4","question":"Địa chỉ lắp từ?","type":"single","options":["Lead (6 trường) nếu đã nhập","Đoán","Không cần","Blocklist"],"correct":[0],"explanation":"Tư duy."},{"id":"td5","question":"BOM là?","type":"single","options":["Danh mục vật tư sản xuất","Mã Lead","Chat","KPI"],"correct":[0],"explanation":"Tư duy."},{"id":"nl6","question":"Handoff file?","type":"single","options":["Bản vẽ, BOM, HĐ, cọc","Chỉ SĐT","Chỉ chat","Không"],"correct":[0],"explanation":"Nguồn lực."},{"id":"nl7","question":"Xác nhận xưởng?","type":"single","options":["Chat/call sau Thắng","Không cần","Cuối năm","Thua"],"correct":[0],"explanation":"Nguồn lực."},{"id":"nl8","question":"Lịch giao ghi?","type":"single","options":["Dự án / Deal hoạt động","Miệng","Xóa","Lead"],"correct":[0],"explanation":"Nguồn lực."},{"id":"vh9","question":"Thiếu bản vẽ — giao xưởng?","type":"single","options":["Bổ sung trước handoff","Vẫn giao","Thua","Blocklist"],"correct":[0],"explanation":"Vận hành."},{"id":"vh10","question":"Sau handoff — sales?","type":"single","options":["Theo dõi tiến độ, cập nhật KH","Im lặng","Xóa CRM","Lead mới"],"correct":[0],"explanation":"Vận hành."},{"id":"vh11","question":"Thiếu ngày giao — sửa?","type":"single","options":["Thỏa thuận KH + ghi dự án","Bỏ qua","Thắng lại","Báo cáo giả"],"correct":[0],"explanation":"Báo cáo."},{"id":"vh12","question":"Xưởng không nhận file — sửa?","type":"single","options":["Upload Tài liệu + @mention lại","Thua","Xóa Deal","Lead mới"],"correct":[0],"explanation":"Báo cáo."}]}$j_c2000002_0000_0000_0000_000000000011$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-11.png',
  $eax_c2000002_0000_0000_0000_000000000011$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-11.png","caption":"BOM, bản vẽ, lịch giao, liên hệ lắp đặt — checklist handoff."}]$eax_c2000002_0000_0000_0000_000000000011$::jsonb
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
  'c2000002-0000-0001-0000-000000000011',
  'b2000002-0000-0000-0000-000000000011',
  'Thực hành trên phần mềm',
  'Đánh dấu khi bạn đã thực hành được trên phần mềm thật.',
  'checklist',
  $j_c2000002_0000_0001_0000_000000000011${"items":[{"id":"c1","text":"Bản vẽ + BOM trên Deal"},{"id":"c2","text":"Địa chỉ + SĐT lắp đúng"},{"id":"c3","text":"Ngày giao đã thỏa thuận"},{"id":"c4","text":"Xưởng xác nhận đã nhận"}]}$j_c2000002_0000_0001_0000_000000000011$::jsonb,
  80,
  NULL,
  NULL,
  2,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-11.png',
  $eax_c2000002_0000_0001_0000_000000000011$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-11.png","caption":"BOM, bản vẽ, lịch giao, liên hệ lắp đặt — checklist handoff."}]$eax_c2000002_0000_0001_0000_000000000011$::jsonb
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
  'c2000002-0000-0000-0000-000000000012',
  'b2000002-0000-0000-0000-000000000012',
  'Kiểm tra: Ôn tập Deal — Từ chuyển Lead đến Thắng/Thua',
  '12 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000002_0000_0000_0000_000000000012${"items":[{"id":"tt1","question":"Deal — dòng tiền?","type":"single","options":["Mỗi cột gắn hành động + file","Chỉ Kanban","Chỉ chat","Lead"],"correct":[0],"explanation":"Tư tưởng."},{"id":"tt2","question":"Deal sai bước?","type":"single","options":["Delay cả chuỗi SX","Không sao","Thưởng","Khách vui"],"correct":[0],"explanation":"Tư tưởng."},{"id":"td3","question":"Hành trình Deal?","type":"single","options":["Lead→BG→HĐ→Thắng/Thua","Thắng→Lead","Chỉ chat","Blocklist"],"correct":[0],"explanation":"Tư duy."},{"id":"td4","question":"Thua cuối hành trình?","type":"single","options":["Lý do bắt buộc","Xóa","Im lặng","Lead trùng"],"correct":[0],"explanation":"Tư duy."},{"id":"td5","question":"Thắng cuối?","type":"single","options":["Handoff xưởng","Xóa CRM","Chỉ KPI","Blocklist"],"correct":[0],"explanation":"Tư duy."},{"id":"nl6","question":"Công cụ end-to-end?","type":"single","options":["Bảng Deal + Tài liệu + Scorecard","Excel","Zalo","Sổ tay"],"correct":[0],"explanation":"Nguồn lực."},{"id":"nl7","question":"Popup Thắng?","type":"single","options":["Tạo dự án SX","Xóa Deal","Lead","Lương"],"correct":[0],"explanation":"Nguồn lực."},{"id":"nl8","question":"File trước Thắng?","type":"single","options":["BG, HĐ, cọc, bản vẽ","Chỉ SĐT","Không","Chat"],"correct":[0],"explanation":"Nguồn lực."},{"id":"vh9","question":"Bước 1 Deal?","type":"single","options":["Kiểm tra hồ sơ chuyển từ Lead","Thắng ngay","Thua","Blocklist"],"correct":[0],"explanation":"Vận hành."},{"id":"vh10","question":"Thiếu cọc — Thắng?","type":"single","options":["Không — bổ sung trước","Vẫn Thắng","Thua","Lead"],"correct":[0],"explanation":"Vận hành."},{"id":"vh11","question":"KPI thấp — sửa?","type":"single","options":["Bảng điểm + hành vi","Thắng ảo","Báo cáo giả","Tắt CRM"],"correct":[0],"explanation":"Báo cáo."},{"id":"vh12","question":"Thua không lý do — sửa?","type":"single","options":["Chọn lý do + ghi chú","Xóa","Thắng","Lead mới"],"correct":[0],"explanation":"Báo cáo."}]}$j_c2000002_0000_0000_0000_000000000012$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-12.png',
  $eax_c2000002_0000_0000_0000_000000000012$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-12.png","caption":"Hành trình Deal end-to-end qua 5 trụ; checklist tổng."}]$eax_c2000002_0000_0000_0000_000000000012$::jsonb
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
  'c2000002-0000-0000-0000-000000000099',
  'b2000002-0000-0000-0000-000000000013',
  'Bài thi tổng kết khoá',
  '20 câu — 30 phút — đạt 80% — tối đa 3 lượt. Phủ đủ 5 trụ.',
  'quiz',
  $j_c2000002_0000_0000_0000_000000000099${"items":[{"id":"fq1","question":"Deal là gì?","type":"single","options":["Đã thống nhất mua, đang HĐ","Khách mới hỏi giá","Đã SX xong","Lead"],"correct":[0],"explanation":"Tư duy."},{"id":"fq2","question":"Thắng khi?","type":"single","options":["HĐ + cọc + handoff","Mới Deal","Chưa BG","Blocklist"],"correct":[0],"explanation":"Vận hành."},{"id":"fq3","question":"Thua phải?","type":"single","options":["Lý do","Im lặng","Xóa","Lead mới"],"correct":[0],"explanation":"Báo cáo."},{"id":"fq4","question":"BG chính thức?","type":"single","options":["PDF trên Deal sau đo","Miệng","Lead only","Không"],"correct":[0],"explanation":"Vận hành."},{"id":"fq5","question":"Cọc chứng từ?","type":"single","options":["Tài liệu Deal","Chat riêng","Xóa","Email"],"correct":[0],"explanation":"Nguồn lực."},{"id":"fq6","question":"Pipeline Deal mẫu?","type":"single","options":["6 giai đoạn","Không","1 cột","Lead"],"correct":[0],"explanation":"Tư duy."},{"id":"fq7","question":"Gate Deal?","type":"single","options":["Task chặn kéo cột","Không","Chỉ admin","Chat"],"correct":[0],"explanation":"Vận hành."},{"id":"fq8","question":"Handoff gồm?","type":"single","options":["Bản vẽ, BOM, lịch giao","Chỉ SĐT","Chat","Blocklist"],"correct":[0],"explanation":"Vận hành."},{"id":"fq9","question":"Popup Thắng?","type":"single","options":["Tạo dự án SX","Xóa Deal","Lead","Lương"],"correct":[0],"explanation":"Nguồn lực."},{"id":"fq10","question":"KPI Deal?","type":"single","options":["Doanh số, tỉ lệ thắng","Màu tủ","Giờ nghỉ","Facebook"],"correct":[0],"explanation":"Báo cáo."},{"id":"fq11","question":"HĐ khớp BG?","type":"single","options":["Bắt buộc","Không","Tùy ý","Miệng"],"correct":[0],"explanation":"Tư duy."},{"id":"fq12","question":"Đàm phán ghi?","type":"single","options":["Hoạt động + BG cập nhật","Im lặng","Thua","Xóa"],"correct":[0],"explanation":"Vận hành."},{"id":"fq13","question":"Thắng ảo?","type":"single","options":["Sai KPI — tránh","Tốt","Thưởng","Bắt buộc"],"correct":[0],"explanation":"Báo cáo."},{"id":"fq14","question":"Bảng Deal?","type":"single","options":["CRM → Bảng Deal","Lead","Lương","Blocklist"],"correct":[0],"explanation":"Nguồn lực."},{"id":"fq15","question":"Deal kế thừa?","type":"single","options":["Lịch sử Lead","Không","Chat","KPI only"],"correct":[0],"explanation":"Tư duy."},{"id":"fq16","question":"File tên a.pdf?","type":"single","options":["Sửa tên có nghĩa","OK","Xóa Deal","Thua"],"correct":[0],"explanation":"Báo cáo."},{"id":"fq17","question":"Giảm giá lớn?","type":"single","options":["Phê duyệt sếp","Tự ý","Không ghi","Blocklist"],"correct":[0],"explanation":"Vận hành."},{"id":"fq18","question":"Sales sau Thắng?","type":"single","options":["Theo dõi đến giao hàng","Xóa CRM","Lead mới","Im lặng"],"correct":[0],"explanation":"Tư tưởng."},{"id":"fq19","question":"Thua vì giá — dùng?","type":"single","options":["Phân tích pricing","Xóa","Thắng","Báo cáo giả"],"correct":[0],"explanation":"Báo cáo."},{"id":"fq20","question":"5 trụ Deal?","type":"single","options":["TT, TD, NL, VH, BC","Chỉ Kanban","Chỉ chat","Lead only"],"correct":[0],"explanation":"Tư tưởng."}]}$j_c2000002_0000_0000_0000_000000000099$::jsonb,
  80,
  3,
  30,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-13.png',
  $eax_c2000002_0000_0000_0000_000000000099$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/deal-13.png","caption":"Bài thi tổng kết khoá — đạt yêu cầu để nhận chứng nhận."}]$eax_c2000002_0000_0000_0000_000000000099$::jsonb
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, image_url = EXCLUDED.image_url,
  attachments = EXCLUDED.attachments, updated_at = now();
COMMIT;
