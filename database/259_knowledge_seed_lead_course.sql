-- 259
-- Khoá Lead — Quản lý Khách hàng Tiềm năng
-- Seed Lead — 5 trụ, giọng giảng viên, 10–20 câu/bài
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
  'Khoá đào tạo chuẩn cho nhân viên kinh doanh ngành tủ bếp nhôm và cửa nhôm. Trật tự tâm lý: Tư tưởng → Tư duy → Nguồn lực → Vận hành → Báo cáo & Sửa chữa. Dành cho người mới — không cần kiến thức kỹ thuật.',
  '🎯',
  10,
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, icon = EXCLUDED.icon, is_active = true;

UPDATE knowledge_categories SET
  deadline_mode = 'relative',
  deadline_duration_days = 30,
  deadline_note = 'Hoàn thành toàn bộ khoá trong 30 ngày kể từ bài học đầu tiên',
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
  'Bài 1: Vai trò của bạn — Vì sao phải quản lý Lead',
  'Hiểu vì sao công ty bắt buộc CRM, vai trò nhân viên kinh doanh và lợi ích cho bản thân.',
  $md_b2000001_0000_0000_0000_000000000001$# Bài 1: Vai trò của bạn — Vì sao phải quản lý Lead

> _Chị Hoa nhắn fanpage hỏi giá tủ bếp — đó là một Lead. Nếu không ghi vào hệ thống, ai cũng có thể "quên" và khách mất._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Bạn là người đầu tiên nắm giữ cơ hội bán hàng — chịu trách nhiệm chăm sóc đến khi khách đồng ý mua hoặc từ chối rõ ràng.

- CRM không phải để "giám sát" — mà để **không mất khách**, **không tranh cãi nội bộ**, **tính KPI công bằng**.
- Mỗi Lead có **một người phụ trách chính** — bạn là chủ sở hữu cơ hội đó.
- Ghi trên hệ thống = đồng nghiệp có thể hỗ trợ khi bạn nghỉ phép.

## 2. Tư duy — Cách nghĩ trước khi làm

- **Lead** _(khách đã liên hệ, chưa cam kết mua)_ — ví dụ: hỏi giá tủ bếp qua Zalo.
- **Deal** _(đã thống nhất mua, đang làm hợp đồng)_ — ví dụ: chốt 68 triệu, hẹn ký HĐ.
- **Khách hàng** _(đã ký HĐ và đặt cọc)_ — ví dụ: đã chuyển 50% tiền cọc.

**Mental model:** Hãy tưởng tượng Lead như "hạt giống" — bạn tưới nước (gọi, tư vấn) cho đến khi nảy mầm (Deal) hoặc héo (Mất Lead).

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** **CRM → Bảng Lead** — nơi mọi Lead của công ty được hiển thị.

- Bảng Kanban (kéo thẻ theo giai đoạn)
- Chi tiết Lead (tab Tổng quan, Nhiệm vụ, Hoạt động, Tài liệu)
- Bảng điểm KPI (xem điểm tháng của bạn)

**Dữ liệu cần đủ:** Tiêu đề Lead, SĐT khách, người phụ trách, giai đoạn pipeline.


![Hiểu vì sao công ty bắt buộc CRM, vai trò nhân viên kinh doanh và lợi ích cho bản thân.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-01.png)
## 4. Vận hành — Làm theo từng bước

1. Đăng nhập CRM → mở **Bảng Lead**.
2. Xem Lead được giao cho bạn (bộ lọc **Lead của tôi**).
3. Mở một Lead → đọc lịch sử trước khi gọi khách.
4. Mọi cuộc gọi, ghi chú đều lưu trên hệ thống — không ghi sổ tay riêng.


> **Mẹo của mentor:** Trước khi gọi khách, dành 30 giây đọc lịch sử Lead trên app — khách sẽ cảm thấy bạn chuyên nghiệp hơn.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi

**Tự kiểm sau khi làm:**
- Tôi đã mở được Bảng Lead?
- Tôi biết Lead nào do mình phụ trách?
- Tôi hiểu khác biệt Lead / Deal / Khách hàng?


**Lỗi thường gặp:**
- Ghi sổ tay riêng → đồng nghiệp không nắm được.
- Tạo Lead trùng SĐT → tranh cãi ai được tính KPI.


**Sửa thế nào:**
- Chuyển sang CRM ngay từ hôm nay.
- Luôn Quét trùng SĐT trước khi tạo Lead mới (Bài 5).


**Tín hiệu KPI bạn theo dõi:** Chưa có KPI riêng ở bài này — nền tảng để hiểu các chỉ số ở Bài 10.

## Tóm tắt 30 giây

Lead = khách tiềm năng; bạn là người phụ trách; mọi thao tác trên CRM — không sổ tay.$md_b2000001_0000_0000_0000_000000000001$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-01.png',
  $att_b2000001_0000_0000_0000_000000000001$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-01.png","caption":"Hiểu vì sao công ty bắt buộc CRM, vai trò nhân viên kinh doanh và lợi ích cho bản thân."}]$att_b2000001_0000_0000_0000_000000000001$::jsonb,
  12,
  ARRAY['lead', 'bai-1', '5-tru'],
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
  'Bài 2: Tiếp nhận Lead — 5 kênh và quy tắc vàng',
  'Nắm 5 kênh tiếp nhận, thông tin tối thiểu và quy tắc Quét trùng SĐT.',
  $md_b2000001_0000_0000_0000_000000000002$# Bài 2: Tiếp nhận Lead — 5 kênh và quy tắc vàng

> _Khách gọi tổng đài hỏi cửa nhôm Xingfa — bạn có 5 phút để tạo Lead đúng chuẩn, không trùng khách cũ._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Bạn là "cửa ngõ" — ai tiếp nhận đúng, cả công ty chăm sóc khách suôn sẻ.

- Tiếp nhận chậm hoặc sai → khách chuyển sang đối thủ.
- Quét trùng SĐT = tôn trọng đồng nghiệp đã chăm sóc trước.

## 2. Tư duy — Cách nghĩ trước khi làm

- **Nguồn Lead** _(kênh khách đến)_: Fanpage/Zalo, Tổng đài, Website, Showroom, Giới thiệu.
- Lead **Hot** _(vừa liên hệ, cần phản hồi nhanh)_ vs Lead **ấm** _(đã tư vấn vài ngày)_.

**Mental model:** Tiếp nhận = nhận "gói hàng" — kiểm tra nhãn (SĐT, nguồn) trước khi đặt lên kệ (pipeline).

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** **Bảng Lead → + Lead mới**

- Form tạo Lead (Tiêu đề, Khách hàng, SĐT)
- Nút **Quét trùng**
- Danh mục Nguồn, Loại sản phẩm

**Dữ liệu cần đủ:** Tiêu đề Lead + Khách hàng (có SĐT) — tối thiểu bắt buộc.


![Nắm 5 kênh tiếp nhận, thông tin tối thiểu và quy tắc Quét trùng SĐT.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-02.png)
## 4. Vận hành — Làm theo từng bước

1. **Bảng Lead → + Lead mới**.
2. Nhập **Tiêu đề** rõ: Tên — Khu vực — Sản phẩm (vd: Chị Lan Q7 — Cửa 2 cánh).
3. Chọn hoặc **+ Tạo nhanh** Khách hàng, nhập **SĐT**.
4. Bấm **Quét trùng** — nếu trùng → mở Lead cũ, **không** tạo mới.
5. Chọn Nguồn, Loại sản phẩm → **Lưu**.
6. Gọi lại khách đúng hẹn (Lead Hot: trong 5 phút).


> **Mẹo của mentor:** Tiêu đề Lead giống "nhãn trên hộp" — đặt tên rõ, 6 tháng sau bạn vẫn nhận ra ngay.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi

**Tự kiểm sau khi làm:**
- Đã Quét trùng trước Lưu?
- Tiêu đề có tên + khu vực + SP?
- SĐT đủ 10 số?
- Chọn đúng Nguồn?


**Lỗi thường gặp:**
- Tạo Lead mới khi SĐT đã tồn tại.
- Tiêu đề "Khách mới" hoặc để trống.


**Sửa thế nào:**
- Trùng SĐT → mở Lead cũ, thêm ghi chú.
- Sửa tiêu đề ngay trong chi tiết Lead.


**Tín hiệu KPI bạn theo dõi:** Nguồn Lead dùng để thống kê hiệu quả kênh marketing.

## Tóm tắt 30 giây

Quét trùng → tiêu đề rõ → đủ SĐT → chọn Nguồn → Lưu → gọi lại đúng hẹn.$md_b2000001_0000_0000_0000_000000000002$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-02.png',
  $att_b2000001_0000_0000_0000_000000000002$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-02.png","caption":"Nắm 5 kênh tiếp nhận, thông tin tối thiểu và quy tắc Quét trùng SĐT."}]$att_b2000001_0000_0000_0000_000000000002$::jsonb,
  12,
  ARRAY['lead', 'bai-2', '5-tru'],
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
  'Bài 3: Bảng Lead và pipeline — Di chuyển khách qua từng giai đoạn',
  'Kanban, kéo thẻ, pipeline Lead, điều kiện chuyển cột và tab Deadline.',
  $md_b2000001_0000_0000_0000_000000000003$# Bài 3: Bảng Lead và pipeline — Di chuyển khách qua từng giai đoạn

> _Sáng mở Kanban — thấy 3 Lead cột **Mới** cần gọi trước 10h. Pipeline giúp bạn biết khách đang ở đâu._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Pipeline phản ánh **tiến độ thật** — không phải để "trang trí bảng".

- Mỗi cột = một giai đoạn chăm sóc.
- Kéo thẻ sai = báo cáo sai, KPI sai.

## 2. Tư duy — Cách nghĩ trước khi làm

- **Pipeline** _(các giai đoạn Lead trên bảng)_
- **Kanban** _(bảng kéo thả theo cột)_

**Mental model:** Pipeline như **cầu thang** — khách leo từng bậc: Mới → Liên hệ → Tư vấn → Báo giá → Đồng ý.

| Giai đoạn | Việc bạn thường làm |
|---|---|
| Mới | Gọi lần 1 |
| Đã liên hệ | Trao đổi nhu cầu |
| Đang tư vấn | Đo đạc, tư vấn mẫu |
| Đã báo giá | Gửi báo giá, theo dõi |
| Đã đồng ý | Chuẩn bị chuyển Deal |

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** **CRM → Bảng Lead → Kanban**

- Tab Kanban
- Tab Deadline
- Ô Tìm kiếm (tên, SĐT, mã Lead)

**Dữ liệu cần đủ:** Giai đoạn hiện tại, badge SLA, người phụ trách.


![Kanban, kéo thẻ, pipeline Lead, điều kiện chuyển cột và tab Deadline.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-03.png)
## 4. Vận hành — Làm theo từng bước

1. Mở **Kanban**.
2. Kéo thẻ khi **đã hoàn thành việc** tương ứng giai đoạn.
3. Nếu bị chặn — đọc thông báo (nhiệm vụ chưa xong).
4. Sau cuộc gọi: ghi hoạt động + kéo thẻ nếu đủ điều kiện.


> **Mẹo của mentor:** Kéo thẻ **sau** khi làm việc — không kéo trước để "đẹp bảng".

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi

**Tự kiểm sau khi làm:**
- Thẻ đang ở cột khớp việc thật?
- Đã ghi hoạt động sau cuộc gọi?


**Lỗi thường gặp:**
- Kéo cột chỉ để đẹp bảng.
- Không ghi hoạt động sau gọi.


**Sửa thế nào:**
- Kéo lại cột đúng + bổ sung ghi chú.


**Tín hiệu KPI bạn theo dõi:** Tab Deadline và badge đỏ = Lead trễ SLA.

## Tóm tắt 30 giây

Kanban phản ánh tiến độ thật; kéo thẻ = đổi giai đoạn có điều kiện.$md_b2000001_0000_0000_0000_000000000003$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-03.png',
  $att_b2000001_0000_0000_0000_000000000003$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-03.png","caption":"Kanban, kéo thẻ, pipeline Lead, điều kiện chuyển cột và tab Deadline."}]$att_b2000001_0000_0000_0000_000000000003$::jsonb,
  10,
  ARRAY['lead', 'bai-3', '5-tru'],
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
  'Bài 4: Sáu thông tin bắt buộc — Nền tảng KPI Đầy đủ thông tin',
  '6 trường bắt buộc, KPI Đầy đủ thông tin, quy tắc chặn điểm.',
  $md_b2000001_0000_0000_0000_000000000004$# Bài 4: Sáu thông tin bắt buộc — Nền tảng KPI Đầy đủ thông tin

> _Lead của anh Minh thiếu email — chỉ số **Đầy đủ thông tin** tụt, có thể bị **quy tắc chặn điểm**._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Hồ sơ Lead đầy đủ = bạn và xưởng làm việc không bị "mù" thông tin.

- Thiếu địa chỉ → khó khảo sát/lắp.
- Thiếu nguồn → marketing không biết kênh nào hiệu quả.

## 2. Tư duy — Cách nghĩ trước khi làm

- **KPI Đầy đủ thông tin** _(tỷ lệ Lead có đủ 6 trường)_
- **Quy tắc chặn điểm** _(dưới ngưỡng → điểm KPI tháng bị giới hạn)_

**Mental model:** 6 trường như **6 mảnh ghép** — thiếu một mảnh, bức tranh khách hàng không hoàn chỉnh.

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** Chi tiết Lead → tab **Tổng quan**

- Form 6 trường bắt buộc
- Bảng điểm KPI

**Dữ liệu cần đủ:** SĐT, Email, Địa chỉ lắp đặt, Nguồn, Loại SP, Mức ưu tiên.


![6 trường bắt buộc, KPI Đầy đủ thông tin, quy tắc chặn điểm.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-04.png)
## 4. Vận hành — Làm theo từng bước

1. Mở chi tiết Lead → tab Tổng quan.
2. Bổ sung trường còn thiếu.
3. Email: nhập thật hoặc ghi chú "KH không dùng email".
4. Cuối tuần tự kiểm 5 Lead của bạn.


> **Mẹo của mentor:** Điền đủ 6 trường **ngay khi tạo Lead** — sửa sau tốn gấp đôi thời gian.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi

**Tự kiểm sau khi làm:**
- SĐT 10 số?
- Email hoặc ghi chú?
- Địa chỉ đến quận/huyện?
- Nguồn + Loại SP + Ưu tiên?


**Lỗi thường gặp:**
- Để trống email vì "khách không có".
- Chọn nguồn "Khác" cho mọi Lead.


**Sửa thế nào:**
- Bổ sung ngay trong Tổng quan.


**Tín hiệu KPI bạn theo dõi:** Công ty thường yêu cầu ≥ **80%** Lead đủ 6 trường.

## Tóm tắt 30 giây

Đủ 6 trường = nền tảng chăm sóc và KPI minh bạch.$md_b2000001_0000_0000_0000_000000000004$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-04.png',
  $att_b2000001_0000_0000_0000_000000000004$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-04.png","caption":"6 trường bắt buộc, KPI Đầy đủ thông tin, quy tắc chặn điểm."}]$att_b2000001_0000_0000_0000_000000000004$::jsonb,
  10,
  ARRAY['lead', 'bai-4', '5-tru'],
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
  'Bài 5: Nhiệm vụ trên Lead — Việc cần làm có hạn',
  'Tạo, giao, hoàn thành nhiệm vụ CRM và gate trước khi kéo cột.',
  $md_b2000001_0000_0000_0000_000000000005$# Bài 5: Nhiệm vụ trên Lead — Việc cần làm có hạn

> _Nhiệm vụ "Gọi KH lần 1" quá hạn — badge đỏ trên thẻ Lead. Nhiệm vụ là **lời hẹn** bạn với khách và với hệ thống._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Nhiệm vụ biến "nhớ trong đầu" thành **cam kết có hạn** trên hệ thống.

- Quên nhiệm vụ = quên khách.
- Gate nhiệm vụ bảo vệ quy trình — không kéo cột khi chưa làm việc.

## 2. Tư duy — Cách nghĩ trước khi làm

- **Nhiệm vụ** _(việc cần làm, có hạn)_ vs **Hoạt động** _(đã làm rồi — ghi nhận)_

**Mental model:** Nhiệm vụ = **hẹn giờ báo thức**; hoàn thành = tắt báo thức + ghi lại đã làm gì.

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** Chi tiết Lead → tab **Nhiệm vụ**

- Tạo nhiệm vụ
- Chuyển trạng thái Đang làm / Hoàn thành
- Popup ghi chú khi hoàn thành

**Dữ liệu cần đủ:** Tiêu đề nhiệm vụ, hạn, người phụ trách, ghi chú kết quả.


![Tạo, giao, hoàn thành nhiệm vụ CRM và gate trước khi kéo cột.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-05.png)
## 4. Vận hành — Làm theo từng bước

1. Tab **Nhiệm vụ** → **+ Tạo nhiệm vụ**.
2. Đặt tiêu đề rõ: "Gọi KH lần 1", "Gửi báo giá".
3. Chọn **hạn** cụ thể.
4. Làm việc → chuyển **Đang làm** → **Hoàn thành** + ghi chú kết quả.
5. Kiểm tra nhiệm vụ chặn trước khi kéo cột Kanban.


> **Mẹo của mentor:** Một Lead nên có **1–3 nhiệm vụ mở** — quá nhiều = loạn, quá ít = quên.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi

**Tự kiểm sau khi làm:**
- Nhiệm vụ có hạn?
- Đã ghi chú khi hoàn thành?
- Không tick xong khi chưa gọi?


**Lỗi thường gặp:**
- Tick hoàn thành khi chưa gọi.
- Không đặt hạn.


**Sửa thế nào:**
- Mở lại + ghi chú thật + hoàn thành lại đúng.


**Tín hiệu KPI bạn theo dõi:** KPI **Đúng hạn** đo % nhiệm vụ xử lý đúng SLA.

## Tóm tắt 30 giây

Tạo nhiệm vụ có hạn → làm → hoàn thành + ghi chú → mới kéo cột nếu gate yêu cầu.$md_b2000001_0000_0000_0000_000000000005$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-05.png',
  $att_b2000001_0000_0000_0000_000000000005$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-05.png","caption":"Tạo, giao, hoàn thành nhiệm vụ CRM và gate trước khi kéo cột."}]$att_b2000001_0000_0000_0000_000000000005$::jsonb,
  10,
  ARRAY['lead', 'bai-5', '5-tru'],
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
  'Bài 6: Minh chứng — Ghi chú và file khi hoàn thành nhiệm vụ',
  'Quy định ghi chú + đính kèm; phân loại Nhiệm vụ / Hoạt động / Tài liệu.',
  $md_b2000001_0000_0000_0000_000000000006$# Bài 6: Minh chứng — Ghi chú và file khi hoàn thành nhiệm vụ

> _Ghi chú "đã gọi" không số điện thoại — **không đạt**. Minh chứng chứng minh bạn **thật sự** đã làm._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Minh chứng bảo vệ **bạn** (tranh chấp KPI) và **khách** (lịch sử chăm sóc).

- Không minh chứng = không chứng minh được đã làm.
- Screenshot Zalo, ảnh đo = bằng chứng công việc.

## 2. Tư duy — Cách nghĩ trước khi làm

- **Ghi chú nhiệm vụ** _(kết quả cụ thể khi hoàn thành)_
- **Tài liệu** _(file PDF, ảnh đo, HĐ)_
- **Hoạt động** _(timeline gọi/gặp)_

| Loại | Lưu ở đâu | Ví dụ |
|---|---|---|
| Cuộc gọi | Hoạt động / Nhiệm vụ | "14h gọi, hẹn đo thứ 5" |
| File | Tài liệu | Báo giá PDF, ảnh đo |
| Trao đổi nội bộ | Chat / Ghi chú | @mention đồng nghiệp |

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** Tab **Nhiệm vụ**, **Hoạt động**, **Tài liệu** trên chi tiết Lead

- Popup hoàn thành nhiệm vụ
- Upload file
- Timeline hoạt động

**Dữ liệu cần đủ:** Ghi chú có: ai, lúc mấy giờ, KH phản hồi gì.


![Quy định ghi chú + đính kèm; phân loại Nhiệm vụ / Hoạt động / Tài liệu.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-06.png)
## 4. Vận hành — Làm theo từng bước

1. Khi Hoàn thành nhiệm vụ: ghi **kết quả cụ thể** (không chỉ "đã gọi").
2. Đính kèm **ảnh/Zalo** nếu công ty yêu cầu.
3. HĐ PDF → tab **Tài liệu**, tên file có nghĩa (vd: BG_ChịLan_2026-03.pdf).
4. Cuộc gọi → **Hoạt động** hoặc ghi chú nhiệm vụ.


> **Mẹo của mentor:** Ghi chú tốt: *"15h30 gọi chị Lan, hẹn đo đạc thứ 5 sáng, KH đồng ý"* — ai đọc cũng hiểu.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi

**Tự kiểm sau khi làm:**
- Ghi chú có thời gian + nội dung?
- File đúng tab?
- Tên file có nghĩa?


**Lỗi thường gặp:**
- Ghi "đã gọi" không chi tiết.
- Lưu HĐ PDF vào chat riêng.


**Sửa thế nào:**
- Bổ sung ghi chú + upload lại file đúng tab.


**Tín hiệu KPI bạn theo dõi:** Minh chứng liên quan KPI chất lượng và đối soát.

## Tóm tắt 30 giây

Hoàn thành nhiệm vụ = ghi chú cụ thể + file đúng chỗ; không tick cho qua.$md_b2000001_0000_0000_0000_000000000006$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-06.png',
  $att_b2000001_0000_0000_0000_000000000006$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-06.png","caption":"Quy định ghi chú + đính kèm; phân loại Nhiệm vụ / Hoạt động / Tài liệu."}]$att_b2000001_0000_0000_0000_000000000006$::jsonb,
  10,
  ARRAY['lead', 'bai-6', '5-tru'],
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
  'Bài 7: Lịch sử tương tác và SLA — Phản hồi đúng hạn',
  '5 kênh ghi nhận, quy tắc 5 phút Lead Hot, tab Deadline.',
  $md_b2000001_0000_0000_0000_000000000007$# Bài 7: Lịch sử tương tác và SLA — Phản hồi đúng hạn

> _Lead Hot vừa nhắn fanpage — quy tắc **5 phút**: gọi ngay, ghi hoạt động, tăng tỉ lệ chốt._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** SLA là **lời hứa thời gian** công ty với khách — bạn là người thực hiện.

- Trễ SLA → khách lạnh, đối thủ chen vào.
- Timeline đầy đủ = sếp và đồng nghiệp hiểu bạn đang làm gì.

## 2. Tư duy — Cách nghĩ trước khi làm

- **SLA** _(hạn xử lý cam kết)_ — vd: Mới → Liên hệ trong 1 ngày
- **5 kênh ghi nhận:** Gọi, Gặp, Email/Tin nhắn, Đổi giai đoạn, Hệ thống

**Mental model:** SLA như **đồng hồ đếm ngược** — badge đỏ = sắp hết giờ.

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** Bảng Lead (badge SLA) + tab **Deadline** + timeline **Hoạt động**

- Tab Deadline
- Badge đỏ trên thẻ
- Timeline hoạt động

**Dữ liệu cần đủ:** Mốc hạn, loại hoạt động, thời gian.


![5 kênh ghi nhận, quy tắc 5 phút Lead Hot, tab Deadline.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-07.png)
## 4. Vận hành — Làm theo từng bước

1. Lead Hot: gọi trong **5 phút** từ khi nhận.
2. Mỗi tương tác → ghi **Hoạt động** (gọi/gặp/email).
3. Mở tab **Deadline** mỗi sáng — ưu tiên badge đỏ.
4. Đổi giai đoạn cũng được ghi nhận trên timeline.


> **Mẹo của mentor:** Sáng vào ca: mở Deadline trước, xử lý Lead đỏ trước — 10 phút đầu quyết định cả ngày.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi

**Tự kiểm sau khi làm:**
- Lead Hot đã gọi trong 5 phút?
- Timeline có ghi nhận?
- Lead đỏ đã xử lý?


**Lỗi thường gặp:**
- Quên ghi hoạt động sau gọi.
- Bỏ qua tab Deadline.


**Sửa thế nào:**
- Bổ sung hoạt động + xử lý Lead trễ ngay.


**Tín hiệu KPI bạn theo dõi:** KPI **Đúng hạn** và badge SLA.

## Tóm tắt 30 giây

Lead Hot = 5 phút; mọi tương tác ghi timeline; Deadline = ưu tiên hàng ngày.$md_b2000001_0000_0000_0000_000000000007$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-07.png',
  $att_b2000001_0000_0000_0000_000000000007$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-07.png","caption":"5 kênh ghi nhận, quy tắc 5 phút Lead Hot, tab Deadline."}]$att_b2000001_0000_0000_0000_000000000007$::jsonb,
  10,
  ARRAY['lead', 'bai-7', '5-tru'],
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
  'Bài 8: KPI Lead — Đọc bảng điểm và sửa điểm thấp',
  'Chỉ số Đầy đủ thông tin, Đúng hạn, Chuyển Deal; Ledger và quy tắc chặn điểm.',
  $md_b2000001_0000_0000_0000_000000000008$# Bài 8: KPI Lead — Đọc bảng điểm và sửa điểm thấp

> _Cuối tháng mở **Bảng điểm** — KPI Đầy đủ thông tin 72%, dưới ngưỡng 80% → **quy tắc chặn điểm**._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** KPI không phải để "phạt" — mà để bạn **biết chỗ cần sửa** và công bằng với đồng nghiệp.

- Cùng quy tắc trên CRM = công bằng.
- Ledger = sổ ghi tự động cộng/trừ điểm khi làm đúng/sai.

## 2. Tư duy — Cách nghĩ trước khi làm

- **KPI Đầy đủ thông tin**
- **KPI Đúng hạn**
- **Chuyển Deal**
- **Ledger** _(sổ ghi sự kiện điểm)_

**Mental model:** Bảng điểm như **bảng điểm học** — biết môn nào yếu để ôn.

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** **CRM → Bảng điểm** (Scorecard tháng)

- Bảng điểm KPI
- Ledger sự kiện
- Báo cáo theo tháng

**Dữ liệu cần đủ:** Tỷ lệ %, điểm cộng/trừ, ngưỡng chặn.


![Chỉ số Đầy đủ thông tin, Đúng hạn, Chuyển Deal; Ledger và quy tắc chặn điểm.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-08.png)
## 4. Vận hành — Làm theo từng bước

1. Cuối tuần: mở **Bảng điểm** → xem 4 chỉ số chính.
2. Chỉ số đỏ → lập **kế hoạch tuần sau** (vd: bổ sung 6 trường cho 5 Lead).
3. Không tick giả, không bỏ qua minh chứng.
4. Tháng mới: đặt mục tiêu cụ thể từng chỉ số.


> **Mẹo của mentor:** Sửa KPI bằng **hành vi hàng ngày** — không phải làm đùng cuối tháng.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi

**Tự kiểm sau khi làm:**
- Tôi biết 4 chỉ số KPI Lead?
- Tôi biết ngưỡng chặn điểm?
- Tôi có kế hoạch sửa chỉ số thấp?


**Lỗi thường gặp:**
- Chỉ nhìn tổng điểm, không xem từng chỉ số.
- Lặp lại sai sót tháng sau.


**Sửa thế nào:**
- Kế hoạch cụ thể: tuần này bổ sung 6 trường cho X Lead.


**Tín hiệu KPI bạn theo dõi:** Đầy đủ thông tin ≥80%; Đúng hạn; Chuyển Deal; Tiếp xúc thành công.

## Tóm tắt 30 giây

Bảng điểm = gương soi hành vi; sửa từng chỉ số bằng thao tác CRM đúng ngày.$md_b2000001_0000_0000_0000_000000000008$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-08.png',
  $att_b2000001_0000_0000_0000_000000000008$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-08.png","caption":"Chỉ số Đầy đủ thông tin, Đúng hạn, Chuyển Deal; Ledger và quy tắc chặn điểm."}]$att_b2000001_0000_0000_0000_000000000008$::jsonb,
  10,
  ARRAY['lead', 'bai-8', '5-tru'],
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
  'Bài 9: Chi tiết Lead — Bốn tab và nút quan trọng',
  'Tổng quan, Nhiệm vụ, Hoạt động, Tài liệu; nút Chuyển Deal, Sửa, Mất/Mở lại.',
  $md_b2000001_0000_0000_0000_000000000009$# Bài 9: Chi tiết Lead — Bốn tab và nút quan trọng

> _Mở chi tiết Lead — bốn tab như **bốn ngăn tủ**: mỗi thứ đúng ngăn, tìm nhanh, handover dễ._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Chi tiết Lead là **trung tâm điều khiển** mọi việc với một khách.

- Lộn tab = đồng nghiệp không tìm được file.
- Nút header = hành động lớn (Chuyển Deal, Mất Lead).

## 2. Tư duy — Cách nghĩ trước khi làm

| Tab | Dùng để |
|---|---|
| Tổng quan | 6 thông tin bắt buộc, phụ trách |
| Nhiệm vụ | Việc cần làm có hạn |
| Hoạt động | Timeline gọi/gặp |
| Tài liệu | PDF, ảnh, HĐ |

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** Click thẻ Lead → **Chi tiết Lead**

- 4 tab
- Nút header: Chuyển Deal, Sửa, Mất/Mở lại

**Dữ liệu cần đủ:** Toàn bộ hồ sơ một khách.


![Tổng quan, Nhiệm vụ, Hoạt động, Tài liệu; nút Chuyển Deal, Sửa, Mất/Mở lại.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-09.png)
## 4. Vận hành — Làm theo từng bước

1. **Tổng quan**: kiểm tra 6 trường + phụ trách.
2. **Nhiệm vụ**: xem việc đang mở.
3. **Hoạt động**: đọc lịch sử trước khi gọi.
4. **Tài liệu**: upload/lấy báo giá, ảnh đo.
5. **Chuyển Deal** (header) khi đủ điều kiện (Bài 10).


> **Mẹo của mentor:** Trước mỗi cuộc gọi: tab Hoạt động → 30 giây nắm lịch sử.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi

**Tự kiểm sau khi làm:**
- Biết 4 tab?
- Biết nút Chuyển Deal ở header?
- File đúng tab Tài liệu?


**Lỗi thường gặp:**
- Ghi chú gọi vào Tài liệu.
- Không đọc Hoạt động trước khi gọi.


**Sửa thế nào:**
- Chuyển ghi chú sang Hoạt động; upload file đúng tab.


**Tín hiệu KPI bạn theo dõi:** Hồ sơ đầy đủ trên đúng tab → KPI Đầy đủ thông tin.

## Tóm tắt 30 giây

4 tab — đúng chỗ đúng việc; header = hành động lớn; đọc Hoạt động trước khi gọi.$md_b2000001_0000_0000_0000_000000000009$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-09.png',
  $att_b2000001_0000_0000_0000_000000000009$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-09.png","caption":"Tổng quan, Nhiệm vụ, Hoạt động, Tài liệu; nút Chuyển Deal, Sửa, Mất/Mở lại."}]$att_b2000001_0000_0000_0000_000000000009$::jsonb,
  10,
  ARRAY['lead', 'bai-9', '5-tru'],
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
  'Bài 10: Chuyển Lead thành Deal — Cột mốc quan trọng',
  'Điều kiện chuyển, popup pipeline Deal, không hoàn tác, checklist trước chuyển.',
  $md_b2000001_0000_0000_0000_000000000010$# Bài 10: Chuyển Lead thành Deal — Cột mốc quan trọng

> _Chị Lan đồng ý mua 68 triệu — bấm **Chuyển Deal**. Đây là cột mốc: Lead → Deal, **một chiều**, kiểm tra kỹ trước khi xác nhận._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Chuyển Deal = bạn xác nhận khách **đã chốt mua** — trách nhiệm chuyển sang giai đoạn HĐ và thu tiền.

- Chuyển sớm = Deal ảo, KPI sai.
- Chuyển muộn = chậm doanh thu.

## 2. Tư duy — Cách nghĩ trước khi làm

- Chuyển Deal khi: KH **đồng ý mua** + thống nhất **SP, giá, phạm vi**
- **Không hoàn tác** — sai phải xử lý qua Deal (Thua) hoặc admin

**Mental model:** Chuyển Deal như **cửa một chiều** — qua rồi không lùi, chỉ tiến (Thắng) hoặc nhánh (Thua).

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** Chi tiết Lead → nút **Chuyển Deal** (header)

- Popup chọn pipeline Deal
- Checklist 6 trường + báo giá

**Dữ liệu cần đủ:** Cam kết mua, file báo giá, đủ 6 trường.


![Điều kiện chuyển, popup pipeline Deal, không hoàn tác, checklist trước chuyển.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-10.png)
## 4. Vận hành — Làm theo từng bước

1. Xác nhận KH đồng ý mua (có ghi nhận: ghi chú/Zalo).
2. Kiểm tra **đủ 6 trường**.
3. Có **báo giá / file** trên Tài liệu.
4. Bấm **Chuyển Deal** → chọn pipeline → **Xác nhận**.
5. Sang **Bảng Deal** — tiếp tục chăm sóc giai đoạn HĐ.


> **Mẹo của mentor:** Nghi ngờ 1% — **chưa chuyển**. Hỏi lại khách hoặc sếp trước khi bấm Xác nhận.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi

**Tự kiểm sau khi làm:**
- KH đồng ý có ghi nhận?
- Đủ 6 trường?
- Có báo giá?
- Đúng pipeline Deal?


**Lỗi thường gặp:**
- Chuyển khi chưa đồng ý.
- Thiếu 6 trường vẫn chuyển.


**Sửa thế nào:**
- Chưa chuyển — bổ sung hồ sơ trước.


**Tín hiệu KPI bạn theo dõi:** Chỉ số **Chuyển Deal** trên Bảng điểm.

## Tóm tắt 30 giây

Đủ điều kiện → Chuyển Deal → một chiều → tiếp tục trên Bảng Deal.$md_b2000001_0000_0000_0000_000000000010$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-10.png',
  $att_b2000001_0000_0000_0000_000000000010$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-10.png","caption":"Điều kiện chuyển, popup pipeline Deal, không hoàn tác, checklist trước chuyển."}]$att_b2000001_0000_0000_0000_000000000010$::jsonb,
  10,
  ARRAY['lead', 'bai-10', '5-tru'],
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
  'Bài 11: Tình huống đặc biệt — Trùng, mất, mở lại, blocklist',
  'Xử lý Lead trùng SĐT, đánh dấu Mất, Mở lại, blocklist — không xóa lịch sử.',
  $md_b2000001_0000_0000_0000_000000000011$# Bài 11: Tình huống đặc biệt — Trùng, mất, mở lại, blocklist

> _Khách gọi lại sau 3 tháng "mất" — **Mở lại** Lead, không tạo mới. Lịch sử cũ vẫn có giá trị._

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Xử lý đặc biệt đúng = bảo vệ **dữ liệu công ty** và **công bằng KPI**.

- Xóa Lead = mất lịch sử phân tích.
- Blocklist = tôn trọng khách không muốn liên hệ.

## 2. Tư duy — Cách nghĩ trước khi làm

- **Trùng SĐT** → mở Lead cũ
- **Mất Lead** → đánh dấu + lý do (không xóa)
- **Mở lại** → KH quay lại
- **Blocklist** → khách từ chối liên hệ — báo admin

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** Chi tiết Lead → nút **Mất / Mở lại**

- Quét trùng
- Đánh dấu Mất + lý do
- Blocklist (admin)

**Dữ liệu cần đủ:** Lý do mất, thời gian mở lại.


![Xử lý Lead trùng SĐT, đánh dấu Mất, Mở lại, blocklist — không xóa lịch sử.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-11.png)
## 4. Vận hành — Làm theo từng bước

1. Trùng SĐT → **Quét trùng** → mở Lead cũ.
2. KH không mua → **Mất** + chọn lý do (giá, đối thủ…).
3. KH quay lại → **Mở lại** Lead cũ.
4. KH yêu cầu không gọi → báo admin **blocklist**.


> **Mẹo của mentor:** Không bao giờ tạo Lead mới khi SĐT đã có — dù khách "quên" mình từng hỏi.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi

**Tự kiểm sau khi làm:**
- Trùng → mở cũ?
- Mất có lý do?
- Blocklist đã báo admin?


**Lỗi thường gặp:**
- Xóa Lead thay vì Mất.
- Tạo mới khi trùng SĐT.


**Sửa thế nào:**
- Mất + lý do; gộp trên Lead cũ.


**Tín hiệu KPI bạn theo dõi:** Lý do Mất giúp công ty cải thiện sản phẩm/giá.

## Tóm tắt 30 giây

Trùng → gộp; Mất → lý do; Mở lại → tiếp tục; Blocklist → báo admin — không xóa lịch sử.$md_b2000001_0000_0000_0000_000000000011$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-11.png',
  $att_b2000001_0000_0000_0000_000000000011$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-11.png","caption":"Xử lý Lead trùng SĐT, đánh dấu Mất, Mở lại, blocklist — không xóa lịch sử."}]$att_b2000001_0000_0000_0000_000000000011$::jsonb,
  10,
  ARRAY['lead', 'bai-11', '5-tru'],
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
  'Bài 12: Ôn tập hành trình Lead — Từ tiếp nhận đến chuyển Deal',
  'Tổng hợp 5 trụ trên một hành trình khách thật — checklist end-to-end.',
  $md_b2000001_0000_0000_0000_000000000012$# Bài 12: Ôn tập hành trình Lead — Từ tiếp nhận đến chuyển Deal

> _Chị Mai — hỏi tủ bếp qua fanpage → tạo Lead → gọi → báo giá → đồng ý → chuyển Deal. **Một hành trình, năm trụ.**_

## 1. Tư tưởng — Vì sao bài này quan trọng

**Vai trò của bạn:** Bạn nắm trọn **chuỗi giá trị**: không bỏ sót bước, không nhảy cóc.

- Mỗi bước phục vụ bước sau.
- CRM ghi lại toàn bộ hành trình cho công ty và cho bạn.

## 2. Tư duy — Cách nghĩ trước khi làm

**Mental model:** **Tư tưởng** (vai trò) → **Tư duy** (Lead vs Deal) → **Nguồn lực** (Bảng Lead, tab) → **Vận hành** (tạo, gọi, nhiệm vụ, minh chứng) → **Báo cáo** (KPI, sửa lỗi) → **Chuyển Deal**.

## 3. Nguồn lực — Bạn có sẵn gì trong tay

**Màn hình chính:** Toàn bộ CRM Lead: Bảng Lead, Chi tiết, Bảng điểm

- Kanban
- 4 tab
- Nhiệm vụ
- Bảng điểm

**Dữ liệu cần đủ:** Hành trình đầy đủ trên hệ thống.


![Tổng hợp 5 trụ trên một hành trình khách thật — checklist end-to-end.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-12.png)
## 4. Vận hành — Làm theo từng bước

1. **Tiếp nhận**: Quét trùng → tạo Lead → 6 trường.
2. **Chăm sóc**: Nhiệm vụ + hoạt động + SLA.
3. **Minh chứng**: Ghi chú + file đúng tab.
4. **Theo dõi**: Kanban + Deadline + KPI.
5. **Chuyển Deal**: Checklist → Xác nhận.


> **Mẹo của mentor:** In checklist Bài 10 — dán cạnh màn hình đến khi thành thói quen.

## 5. Báo cáo & Sửa chữa — Tự kiểm và sửa lỗi

**Tự kiểm sau khi làm:**
- Tôi làm được end-to-end không cần hỏi?
- Tôi biết sửa lỗi thường gặp?
- Tôi đọc được Bảng điểm?


**Lỗi thường gặp:**
- Nhảy thẳng chuyển Deal.
- Bỏ qua minh chứng và KPI.


**Tín hiệu KPI bạn theo dõi:** Toàn bộ chỉ số Lead trên Bảng điểm.

## Tóm tắt 30 giây

Hành trình Lead = 5 trụ nối liền; thiếu một trụ = hồ sơ và KPI lỗ hổng.$md_b2000001_0000_0000_0000_000000000012$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-12.png',
  $att_b2000001_0000_0000_0000_000000000012$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-12.png","caption":"Tổng hợp 5 trụ trên một hành trình khách thật — checklist end-to-end."}]$att_b2000001_0000_0000_0000_000000000012$::jsonb,
  10,
  ARRAY['lead', 'bai-12', '5-tru'],
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

> _Bài thi tổng kết — đo lại toàn bộ 5 trụ: Tư tưởng, Tư duy, Nguồn lực, Vận hành, Báo cáo & Sửa chữa._

## 1. Mục đích

Đo tổng hợp 5 trụ. Sau khi nộp, hệ thống mở phần **giải thích** cho câu sai — đọc kỹ trước khi thi lại.

## 2. Quy định

- **20 câu** trắc nghiệm — phủ đủ 5 trụ

- Điểm đạt: **80%**

- Thời gian: **30 phút**

- Tối đa **3 lượt**

- **Điều kiện mở:** đạt **toàn bộ bài tập** trong khoá


![Bài thi tổng kết khoá — đạt yêu cầu để nhận chứng nhận.](https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-13.png)
## 3. Trước khi thi

Ôn lại các bài học bắt buộc và làm lại bài tập chưa đạt. Đặc biệt 2 trụ hay sai: **Vận hành** (thao tác phần mềm) và **Báo cáo & Sửa chữa** (KPI / lỗi thường gặp).

## 4. Sau khi thi

Nếu đạt — bạn nhận **chứng nhận** điện tử. Nếu chưa đạt — đọc giải thích, ôn lại và thi lại.$md_b2000001_0000_0000_0000_000000000013$,
  NULL,
  NULL,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-13.png',
  $att_b2000001_0000_0000_0000_000000000013$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-13.png","caption":"Bài thi tổng kết khoá — đạt yêu cầu để nhận chứng nhận."}]$att_b2000001_0000_0000_0000_000000000013$::jsonb,
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
  passing_score, max_attempts, time_limit_minutes, sort_order,
  image_url, attachments
) VALUES (
  'c2000001-0000-0000-0000-000000000001',
  'b2000001-0000-0000-0000-000000000001',
  'Kiểm tra: Vai trò của bạn — Vì sao phải quản lý Lead',
  '16 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000001_0000_0000_0000_000000000001${"items":[{"id":"tt1","question":"Vì sao công ty bắt buộc dùng CRM thay sổ tay?","type":"single","options":["Tốn thời gian","Lưu lịch sử, nhắc hẹn, tính KPI công bằng","Chỉ để admin giám sát","Không có lý do"],"correct":[1],"explanation":"CRM giúp minh bạch và đo lường hiệu quả."},{"id":"tt2","question":"Một Lead có bao nhiêu người phụ trách chính?","type":"single","options":["Không giới hạn","Một người","Chỉ admin","Hai người bắt buộc"],"correct":[1],"explanation":"Tránh trách nhiệm chồng chéo."},{"id":"tt3","question":"Thành viên hỗ trợ trên Lead dùng để?","type":"single","options":["Thay phụ trách chính","Hỗ trợ cùng team, phụ trách chính vẫn chịu KPI","Ẩn Lead","Xóa KPI"],"correct":[1],"explanation":"Phụ trách chính không đổi."},{"id":"td4","question":"Lead là gì?","type":"single","options":["Khách đã ký HĐ","Khách tiềm năng đã tiếp xúc, chưa cam kết mua","Sản phẩm mới","Nhân viên mới"],"correct":[1],"explanation":"Lead chưa có cam kết mua."},{"id":"td5","question":"Deal là gì?","type":"single","options":["Khách mới nhắn tin","Đã thống nhất mua, đang hoàn tất HĐ","Đã thanh toán 100%","Lead bị xóa"],"correct":[1],"explanation":"Deal = giai đoạn sau khi chốt mua."},{"id":"td6","question":"Chị Hoa hỏi giá qua fanpage — phân loại?","type":"single","options":["Deal","Lead","Khách hàng","Báo giá PDF"],"correct":[1],"explanation":"Mới hỏi giá = Lead."},{"id":"td7","question":"Khi Lead \"chín\", bước tiếp theo?","type":"single","options":["Xóa Lead","Chuyển thành Deal","Tạo nhân viên","In phiếu lương"],"correct":[1],"explanation":"Chuyển Deal khi đủ điều kiện (Bài 11)."},{"id":"nl8","question":"Đường dẫn xem Lead?","type":"single","options":["Công việc → Dự án","CRM → Bảng Lead","Kiến thức","Xưởng SX"],"correct":[1],"explanation":"Lead nằm trong CRM."},{"id":"nl9","question":"Bộ lọc \"Lead của tôi\" giúp?","type":"single","options":["Ẩn hết Lead","Chỉ xem Lead bạn phụ trách","Xóa Lead","In HĐ"],"correct":[1],"explanation":"Lọc theo người phụ trách."},{"id":"nl10","question":"Mỗi thẻ trên Kanban đại diện?","type":"single","options":["Một nhân viên","Một Lead","Một báo cáo","Một file PDF"],"correct":[1],"explanation":"Một thẻ = một Lead."},{"id":"vh11","question":"Trước khi gọi khách, nên làm gì trên CRM?","type":"single","options":["Xóa Lead","Đọc lịch sử Lead trên app","Đổi mật khẩu","In báo cáo"],"correct":[1],"explanation":"Nắm ngữ cảnh trước khi liên hệ."},{"id":"vh12","question":"Ghi chú cuộc gọi nên lưu ở đâu?","type":"single","options":["Sổ tay","Hoạt động / Nhiệm vụ trên Lead","Email cá nhân","Không cần ghi"],"correct":[1],"explanation":"Lịch sử tập trung trên CRM."},{"id":"vh13","question":"Đồng nghiệp nghỉ phép — CRM giúp gì?","type":"single","options":["Không giúp","Người thay thế đọc được lịch sử Lead","Tự xóa Lead","Khóa tài khoản"],"correct":[1],"explanation":"Handover mượt mà."},{"id":"bc14","question":"Ghi sổ tay riêng thay CRM — hậu quả?","type":"single","options":["Không ảnh hưởng","Đồng nghiệp không nắm, KPI không đối soát","Tự thăng chức","Khách hài lòng hơn"],"correct":[1],"explanation":"Mất minh bạch."},{"id":"bc15","question":"Tạo Lead trùng SĐT — vấn đề?","type":"single","options":["Không sao","Tranh KPI, khó quản lý một khách","Tự động thưởng","Khách vui"],"correct":[1],"explanation":"Một SĐT — một luồng chăm sóc."},{"id":"bc16","question":"Tự kiểm sau bài 1: bạn cần biết?","type":"single","options":["Chỉ mật khẩu","Khác biệt Lead/Deal/KH và đường vào Bảng Lead","Chỉ in PDF","Chỉ chat nội bộ"],"correct":[1],"explanation":"Nền tảng tư duy."}]}$j_c2000001_0000_0000_0000_000000000001$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-01.png',
  $eax_c2000001_0000_0000_0000_000000000001$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-01.png","caption":"Hiểu vì sao công ty bắt buộc CRM, vai trò nhân viên kinh doanh và lợi ích cho bản thân."}]$eax_c2000001_0000_0000_0000_000000000001$::jsonb
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
  'c2000001-0000-0000-0000-000000000002',
  'b2000001-0000-0000-0000-000000000002',
  'Kiểm tra: Tiếp nhận Lead — 5 kênh và quy tắc vàng',
  '15 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000001_0000_0000_0000_000000000002${"items":[{"id":"tt1","question":"Vì sao phải Quét trùng SĐT trước Lưu?","type":"single","options":["Tốn thời gian","Tránh trùng khách, tranh KPI","Bắt buộc in PDF","Chỉ admin"],"correct":[1],"explanation":"Một SĐT — một luồng chăm sóc."},{"id":"tt2","question":"Tiếp nhận chậm với Lead Hot — rủi ro?","type":"single","options":["Không sao","Khách chuyển sang đối thủ","Tự thưởng","Tự xóa Lead"],"correct":[1],"explanation":"Phản hồi nhanh tăng tỉ lệ chốt."},{"id":"td3","question":"Có bao nhiêu kênh tiếp nhận chính?","type":"single","options":["3","4","5","7"],"correct":[2],"explanation":"Fanpage, tổng đài, web, showroom, giới thiệu."},{"id":"td4","question":"Lead Hot cần phản hồi trong?","type":"single","options":["1 tuần","5 phút (quy tắc công ty)","1 tháng","Không cần"],"correct":[1],"explanation":"Quy tắc 5 phút."},{"id":"td5","question":"Nguồn Lead dùng để?","type":"single","options":["Trang trí","Thống kê hiệu quả kênh marketing","Xóa Lead","Tính thuế"],"correct":[1],"explanation":"Báo cáo theo nguồn."},{"id":"nl6","question":"Thông tin BẮT BUỘC tối thiểu khi tạo Lead?","type":"single","options":["Mã số thuế","Tiêu đề + Khách hàng","Bản vẽ 3D","Hợp đồng"],"correct":[1],"explanation":"Hệ thống yêu cầu tiêu đề và khách."},{"id":"nl7","question":"Nút Quét trùng nằm ở đâu?","type":"single","options":["Cài đặt","Form tạo Lead mới","Báo cáo SX","Chat"],"correct":[1],"explanation":"Trong form trước khi Lưu."},{"id":"nl8","question":"Nút + Lead mới thường ở?","type":"single","options":["Thanh trên Bảng Lead","Footer","Cài đặt","Dashboard SX"],"correct":[0],"explanation":"Thanh công cụ Bảng Lead."},{"id":"vh9","question":"Trước Lưu Lead mới phải?","type":"single","options":["In PDF","Quét trùng SĐT","Ký HĐ","Bàn giao xưởng"],"correct":[1],"explanation":"Bước bắt buộc."},{"id":"vh10","question":"Nếu Quét trùng có kết quả?","type":"single","options":["Tạo mới","Mở Lead cũ, thêm ghi chú","Đổi SĐT giả","Xóa khách"],"correct":[1],"explanation":"Không nhân đôi khách."},{"id":"vh11","question":"Tiêu đề Lead tốt nhất?","type":"single","options":["\"KH\"","\"Chị Lan Q7 — Cửa 2 cánh\"","Để trống","Chỉ ngày"],"correct":[1],"explanation":"Nhận diện nhanh."},{"id":"vh12","question":"Sau Lưu, Lead mới thường ở cột?","type":"single","options":["Thắng","Mới (đầu pipeline)","Đã xóa","Không hiện"],"correct":[1],"explanation":"Giai đoạn đầu pipeline."},{"id":"bc13","question":"Tạo Lead trùng SĐT — sửa thế nào?","type":"single","options":["Xóa Lead mới","Gộp chăm sóc trên Lead cũ","Đổi SĐT","Báo cáo giả"],"correct":[1],"explanation":"Một khách một luồng."},{"id":"bc14","question":"Tiêu đề \"Khách mới\" — vấn đề?","type":"single","options":["Tốt","Đồng nghiệp không nhận ra Lead","Tự thưởng","KPI tăng"],"correct":[1],"explanation":"Tiêu đề phải có ngữ nghĩa."},{"id":"bc15","question":"Checklist: trước Lưu cần?","type":"single","options":["Quét trùng + tiêu đề rõ + Nguồn","Chỉ SĐT","Chỉ ảnh","Không cần"],"correct":[0],"explanation":"Ba bước tối thiểu."}]}$j_c2000001_0000_0000_0000_000000000002$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-02.png',
  $eax_c2000001_0000_0000_0000_000000000002$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-02.png","caption":"Nắm 5 kênh tiếp nhận, thông tin tối thiểu và quy tắc Quét trùng SĐT."}]$eax_c2000001_0000_0000_0000_000000000002$::jsonb
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
  'c2000001-0000-0001-0000-000000000002',
  'b2000001-0000-0000-0000-000000000002',
  'Thực hành trên phần mềm',
  'Đánh dấu khi bạn đã thực hành được trên phần mềm thật.',
  'checklist',
  $j_c2000001_0000_0001_0000_000000000002${"items":[{"id":"c1","text":"Bấm Quét trùng trước khi Lưu"},{"id":"c2","text":"Tiêu đề có tên + khu vực + sản phẩm"},{"id":"c3","text":"SĐT đủ 10 số"},{"id":"c4","text":"Chọn đúng Nguồn"},{"id":"c5","text":"Chọn Loại sản phẩm"},{"id":"c6","text":"Lead hiện ở cột Mới sau Lưu"}]}$j_c2000001_0000_0001_0000_000000000002$::jsonb,
  80,
  NULL,
  NULL,
  2,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-02.png',
  $eax_c2000001_0000_0001_0000_000000000002$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-02.png","caption":"Nắm 5 kênh tiếp nhận, thông tin tối thiểu và quy tắc Quét trùng SĐT."}]$eax_c2000001_0000_0001_0000_000000000002$::jsonb
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
  'c2000001-0000-0000-0000-000000000003',
  'b2000001-0000-0000-0000-000000000003',
  'Kiểm tra: Bảng Lead và pipeline — Di chuyển khách qua từng giai đoạn',
  '14 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000001_0000_0000_0000_000000000003${"items":[{"id":"tt1","question":"Pipeline Lead giúp gì?","type":"single","options":["Tính lương","Theo dõi giai đoạn chăm sóc khách","In HĐ","Chat nội bộ"],"correct":[1],"explanation":"Pipeline = quy trình giai đoạn."},{"id":"tt2","question":"Kéo thẻ sai giai đoạn — hậu quả?","type":"single","options":["Không sao","Báo cáo và KPI sai","Tự thưởng","Khách vui"],"correct":[1],"explanation":"Dữ liệu phải khớp thực tế."},{"id":"td3","question":"Một thẻ Kanban là?","type":"single","options":["Một Lead","Một file","Một nhân viên","Một KPI tháng"],"correct":[0],"explanation":"Mỗi thẻ = một Lead."},{"id":"td4","question":"Kéo thẻ sang cột khác khi?","type":"single","options":["Rảnh","Đã hoàn thành việc tương ứng giai đoạn","Cuối tháng","Admin yêu cầu"],"correct":[1],"explanation":"Giai đoạn khớp việc thật."},{"id":"td5","question":"Cột \"Đã đồng ý\" thường dẫn tới?","type":"single","options":["Xóa","Chuyển Deal","Nghỉ phép","Tạo NV"],"correct":[1],"explanation":"Khách đồng ý mua → Deal."},{"id":"nl6","question":"Tab Kanban nằm ở?","type":"single","options":["Bảng Lead","Cài đặt","Kiến thức","Báo cáo SX"],"correct":[0],"explanation":"Trong màn Bảng Lead."},{"id":"nl7","question":"Tab Deadline dùng để?","type":"single","options":["Xem Lead theo mốc hạn","Xóa Lead","Tạo báo giá","In HĐ"],"correct":[0],"explanation":"Ưu tiên Lead trễ SLA."},{"id":"nl8","question":"Tìm Lead theo?","type":"single","options":["Chỉ màu","Tên, SĐT, mã","Chỉ email công ty","Không tìm được"],"correct":[1],"explanation":"Ô tìm trên thanh công cụ."},{"id":"vh9","question":"Kéo thẻ Lead để?","type":"single","options":["Xóa","Đổi giai đoạn pipeline","In lương","Tạo NV"],"correct":[1],"explanation":"Kanban = quản lý giai đoạn."},{"id":"vh10","question":"Bị chặn khi kéo thường do?","type":"single","options":["Nhiệm vụ bắt buộc chưa xong","Trời mưa","Đã thắng","VIP"],"correct":[0],"explanation":"Gate nhiệm vụ."},{"id":"vh11","question":"Sau kéo cột nên?","type":"single","options":["Im lặng","Ghi hoạt động nếu chưa có","Xóa SĐT","Đổi công ty"],"correct":[1],"explanation":"Lịch sử phải khớp."},{"id":"bc12","question":"Badge đỏ trên thẻ?","type":"single","options":["Quá hạn SLA","Đã cọc","Đã SX","Nghỉ phép"],"correct":[0],"explanation":"Cần xử lý gấp."},{"id":"bc13","question":"Kéo thẻ không ghi hoạt động — sửa?","type":"single","options":["Bỏ qua","Bổ sung ghi chú hoạt động","Xóa Lead","Đổi pass"],"correct":[1],"explanation":"Lịch sử phải đầy đủ."},{"id":"bc14","question":"Chế độ Deadline giúp?","type":"single","options":["Nhóm theo hạn xử lý","Xóa Lead","Tạo HĐ","Chat"],"correct":[0],"explanation":"Ưu tiên trễ SLA."}]}$j_c2000001_0000_0000_0000_000000000003$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-03.png',
  $eax_c2000001_0000_0000_0000_000000000003$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-03.png","caption":"Kanban, kéo thẻ, pipeline Lead, điều kiện chuyển cột và tab Deadline."}]$eax_c2000001_0000_0000_0000_000000000003$::jsonb
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
  'c2000001-0000-0000-0000-000000000004',
  'b2000001-0000-0000-0000-000000000004',
  'Kiểm tra: Sáu thông tin bắt buộc — Nền tảng KPI Đầy đủ thông tin',
  '12 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000001_0000_0000_0000_000000000004${"items":[{"id":"tt1","question":"KPI \"Đầy đủ thông tin\" đo gì?","type":"single","options":["Số cuộc gọi","% Lead đủ 6 trường","Doanh số","Số file PDF"],"correct":[1],"explanation":"Tỷ lệ hoàn thiện hồ sơ."},{"id":"tt2","question":"Quy tắc chặn điểm khi?","type":"single","options":["Luôn luôn","KPI Đầy đủ thông tin dưới ngưỡng công ty","Trời mưa","Mới vào"],"correct":[1],"explanation":"Bảo vệ chất lượng dữ liệu."},{"id":"td3","question":"Có bao nhiêu trường bắt buộc?","type":"single","options":["3","4","6","10"],"correct":[2],"explanation":"Sáu trường theo quy định."},{"id":"td4","question":"Trường KHÔNG thuộc 6 trường?","type":"single","options":["SĐT","Ngày sinh khách","Nguồn","Loại sản phẩm"],"correct":[1],"explanation":"Ngày sinh không nằm trong bộ 6."},{"id":"nl5","question":"6 trường gồm?","type":"single","options":["SĐT, Email, Địa chỉ, Nguồn, Loại SP, Ưu tiên","Chỉ SĐT","Chỉ tên","Chỉ ảnh"],"correct":[0],"explanation":"Bộ 6 trường chuẩn."},{"id":"nl6","question":"Xem 6 trường ở tab?","type":"single","options":["Tổng quan","Chat","Blocklist","Lương"],"correct":[0],"explanation":"Tab Tổng quan chi tiết Lead."},{"id":"vh7","question":"Thiếu địa chỉ lắp đặt ảnh hưởng?","type":"single","options":["Không","Khó khảo sát/lắp và trừ KPI","Tự chuyển Deal","Xóa Lead"],"correct":[1],"explanation":"Địa chỉ cần cho khảo sát."},{"id":"vh8","question":"Nên kiểm tra 6 trường khi nào?","type":"single","options":["Cuối năm","Ngay khi tạo Lead và trước chuyển Deal","Sau SX","Không cần"],"correct":[1],"explanation":"Sớm = ít sửa lại."},{"id":"vh9","question":"Email khách không có — làm gì?","type":"single","options":["Để trống","Ghi chú \"KH không dùng email\"","Nhập email giả","Xóa Lead"],"correct":[1],"explanation":"Ghi nhận rõ ràng."},{"id":"bc10","question":"KPI Đầy đủ thông tin thấp — sửa?","type":"single","options":["Bỏ qua","Bổ sung 6 trường cho Lead thiếu","Tắt CRM","Xóa Lead"],"correct":[1],"explanation":"Hành động cụ thể."},{"id":"bc11","question":"Chọn nguồn \"Khác\" mọi Lead — vấn đề?","type":"single","options":["Tốt","Marketing không phân tích được kênh","Tự thưởng","Khách vui"],"correct":[1],"explanation":"Nguồn phải chính xác."},{"id":"bc12","question":"Tự kiểm cuối tuần?","type":"single","options":["5 Lead của tôi đủ 6 trường","Chỉ 1 Lead","Không cần","Chỉ admin"],"correct":[0],"explanation":"Thói quen tốt."}]}$j_c2000001_0000_0000_0000_000000000004$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-04.png',
  $eax_c2000001_0000_0000_0000_000000000004$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-04.png","caption":"6 trường bắt buộc, KPI Đầy đủ thông tin, quy tắc chặn điểm."}]$eax_c2000001_0000_0000_0000_000000000004$::jsonb
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
  'c2000001-0000-0001-0000-000000000004',
  'b2000001-0000-0000-0000-000000000004',
  'Thực hành trên phần mềm',
  'Đánh dấu khi bạn đã thực hành được trên phần mềm thật.',
  'checklist',
  $j_c2000001_0000_0001_0000_000000000004${"items":[{"id":"c1","text":"Mở 1 Lead của tôi trên app"},{"id":"c2","text":"SĐT đủ 10 số"},{"id":"c3","text":"Email hợp lệ hoặc ghi chú"},{"id":"c4","text":"Địa chỉ đến quận/huyện"},{"id":"c5","text":"Nguồn từ danh mục"},{"id":"c6","text":"Loại SP + Mức ưu tiên đã chọn"}]}$j_c2000001_0000_0001_0000_000000000004$::jsonb,
  80,
  NULL,
  NULL,
  2,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-04.png',
  $eax_c2000001_0000_0001_0000_000000000004$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-04.png","caption":"6 trường bắt buộc, KPI Đầy đủ thông tin, quy tắc chặn điểm."}]$eax_c2000001_0000_0001_0000_000000000004$::jsonb
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
  'c2000001-0000-0000-0000-000000000005',
  'b2000001-0000-0000-0000-000000000005',
  'Kiểm tra: Nhiệm vụ trên Lead — Việc cần làm có hạn',
  '12 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000001_0000_0000_0000_000000000005${"items":[{"id":"tt1","question":"Nhiệm vụ trên Lead giúp gì?","type":"single","options":["Tính lương","Nhắc việc có hạn, gate quy trình","Xóa khách","In PDF"],"correct":[1],"explanation":"Cam kết có hạn."},{"id":"tt2","question":"Gate nhiệm vụ bảo vệ?","type":"single","options":["Quy trình — không kéo cột khi chưa làm","Mật khẩu","Ảnh sản phẩm","Chat"],"correct":[0],"explanation":"Chất lượng quy trình."},{"id":"td3","question":"Nhiệm vụ khác Hoạt động?","type":"single","options":["Giống hệt","Nhiệm vụ = việc sắp làm; Hoạt động = đã làm","Chỉ admin","Không dùng"],"correct":[1],"explanation":"Tương lai vs quá khứ."},{"id":"td4","question":"Tab Nhiệm vụ dùng để?","type":"single","options":["Tính lương","Tạo và hoàn thành việc cần làm","Xóa Lead","Đổi pass"],"correct":[1],"explanation":"Task gắn Lead."},{"id":"nl5","question":"Tạo nhiệm vụ ở tab?","type":"single","options":["Nhiệm vụ","Blocklist","Lương","Chat công ty"],"correct":[0],"explanation":"Tab Nhiệm vụ chi tiết Lead."},{"id":"nl6","question":"Popup khi Hoàn thành thường yêu cầu?","type":"single","options":["Chỉ tick","Ghi chú kết quả","Xóa Lead","Đổi SĐT"],"correct":[1],"explanation":"Ghi nhận đã làm gì."},{"id":"vh7","question":"Tạo nhiệm vụ nên?","type":"single","options":["Không hạn","Có hạn cụ thể","Chỉ cuối năm","Chỉ admin"],"correct":[1],"explanation":"Hạn = cam kết."},{"id":"vh8","question":"Trước kéo cột Kanban nên?","type":"single","options":["Bỏ qua","Kiểm tra nhiệm vụ chặn","Xóa Lead","In PDF"],"correct":[1],"explanation":"Gate nhiệm vụ."},{"id":"vh9","question":"Tiêu đề nhiệm vụ tốt?","type":"single","options":["\"Việc\"","\"Gọi KH lần 1\"","Để trống","123"],"correct":[1],"explanation":"Rõ việc cần làm."},{"id":"bc10","question":"Tick hoàn thành khi chưa gọi?","type":"single","options":["Được","Vi phạm — trừ KPI","Bắt buộc","Chỉ cuối tuần"],"correct":[1],"explanation":"Gian lận tiến độ."},{"id":"bc11","question":"Nhiệm vụ quá hạn — sửa?","type":"single","options":["Bỏ qua","Xử lý ngay + ghi chú + cập nhật Lead","Xóa Lead","Đổi khách"],"correct":[1],"explanation":"Ưu tiên SLA."},{"id":"bc12","question":"KPI Đúng hạn đo?","type":"single","options":["% nhiệm vụ xử lý đúng SLA","Số email","Chiều cao tủ","Màu sơn"],"correct":[0],"explanation":"Cam kết thời gian."}]}$j_c2000001_0000_0000_0000_000000000005$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-05.png',
  $eax_c2000001_0000_0000_0000_000000000005$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-05.png","caption":"Tạo, giao, hoàn thành nhiệm vụ CRM và gate trước khi kéo cột."}]$eax_c2000001_0000_0000_0000_000000000005$::jsonb
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
  'c2000001-0000-0001-0000-000000000005',
  'b2000001-0000-0000-0000-000000000005',
  'Thực hành trên phần mềm',
  'Đánh dấu khi bạn đã thực hành được trên phần mềm thật.',
  'checklist',
  $j_c2000001_0000_0001_0000_000000000005${"items":[{"id":"c1","text":"Tạo nhiệm vụ có hạn cụ thể"},{"id":"c2","text":"Ghi chú kết quả khi hoàn thành"},{"id":"c3","text":"Không tick xong khi chưa gọi"},{"id":"c4","text":"Kiểm tra nhiệm vụ chặn trước khi kéo cột"}]}$j_c2000001_0000_0001_0000_000000000005$::jsonb,
  80,
  NULL,
  NULL,
  2,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-05.png',
  $eax_c2000001_0000_0001_0000_000000000005$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-05.png","caption":"Tạo, giao, hoàn thành nhiệm vụ CRM và gate trước khi kéo cột."}]$eax_c2000001_0000_0001_0000_000000000005$::jsonb
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
  'c2000001-0000-0000-0000-000000000006',
  'b2000001-0000-0000-0000-000000000006',
  'Kiểm tra: Minh chứng — Ghi chú và file khi hoàn thành nhiệm vụ',
  '13 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000001_0000_0000_0000_000000000006${"items":[{"id":"tt1","question":"Mục đích quy định minh chứng?","type":"single","options":["Làm khó","Minh bạch và đo chất lượng","Giảm Lead","Tăng thuế"],"correct":[1],"explanation":"Bảo vệ khách và công bằng KPI."},{"id":"tt2","question":"Không minh chứng — rủi ro?","type":"single","options":["Không sao","Không chứng minh được đã làm","Tự thưởng","Khách vui"],"correct":[1],"explanation":"Tranh cãi KPI."},{"id":"td3","question":"Ghi chú cuộc gọi nên ở?","type":"single","options":["Tài liệu","Hoạt động / Nhiệm vụ","Blocklist","Xóa"],"correct":[1],"explanation":"Phân loại đúng kênh."},{"id":"td4","question":"HĐ PDF ký lưu ở?","type":"single","options":["Chat","Tài liệu","Không lưu","Email riêng"],"correct":[1],"explanation":"Tập trung hồ sơ."},{"id":"td5","question":"Tên file tốt?","type":"single","options":["a.pdf","HD_ChịLan_2026-03.pdf","1.jpg","tmp"],"correct":[1],"explanation":"Tên có ngữ nghĩa."},{"id":"nl6","question":"Popup hoàn thành yêu cầu?","type":"single","options":["Chỉ tick","Ghi chú + file (nếu cấu hình)","Xóa Lead","Đổi pass"],"correct":[1],"explanation":"Minh chứng khi hoàn thành."},{"id":"nl7","question":"Screenshot Zalo nên lưu?","type":"single","options":["Chat riêng","Đính kèm nhiệm vụ / tài liệu Lead","Xóa","Chỉ máy cá nhân"],"correct":[1],"explanation":"Để đối soát KPI."},{"id":"vh8","question":"Ghi chú \"đã gọi\" không SĐT — đánh giá?","type":"single","options":["Đạt","Không đạt — thiếu nội dung","Tốt nhất","Không cần"],"correct":[1],"explanation":"Phải có thông tin kiểm chứng."},{"id":"vh9","question":"File ảnh đo đạc gắn?","type":"single","options":["Lead / nhiệm vụ khảo sát","Email cá nhân","Không lưu","Blocklist"],"correct":[0],"explanation":"Gắn đúng ngữ cảnh."},{"id":"vh10","question":"Hoạt động khác ghi chú?","type":"single","options":["Giống hệt","Có loại + thời gian timeline","Chỉ admin","Không dùng"],"correct":[1],"explanation":"Timeline truy vết."},{"id":"bc11","question":"Tick hoàn thành khi chưa gọi?","type":"single","options":["Được","Vi phạm — trừ KPI","Bắt buộc","Chỉ cuối tuần"],"correct":[1],"explanation":"Gian lận tiến độ."},{"id":"bc12","question":"Không tuân thủ lâu ngày?","type":"single","options":["Thưởng","KPI thấp, mất uy tín","Tự thăng chức","Không ảnh hưởng"],"correct":[1],"explanation":"KPI gắn hành vi."},{"id":"bc13","question":"Ai đọc được ghi chú nhiệm vụ?","type":"single","options":["Chỉ bạn","Team có quyền trên Lead","KH tự động","Không ai"],"correct":[1],"explanation":"Hỗ trợ handover."}]}$j_c2000001_0000_0000_0000_000000000006$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-06.png',
  $eax_c2000001_0000_0000_0000_000000000006$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-06.png","caption":"Quy định ghi chú + đính kèm; phân loại Nhiệm vụ / Hoạt động / Tài liệu."}]$eax_c2000001_0000_0000_0000_000000000006$::jsonb
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
  'c2000001-0000-0002-0000-000000000006',
  'b2000001-0000-0000-0000-000000000006',
  'Tự luận: Áp dụng và cam kết',
  'Bài tự luận — trình bày trung thực, tối thiểu 200 từ.',
  'essay',
  $j_c2000001_0000_0002_0000_000000000006${"prompt":"Mô tả 1 tình huống bạn đã tuân thủ đúng quy định (ghi chú + file) và 1 tình huống từng thiếu sót. Nêu bài học và cam kết tháng tới (tối thiểu 200 từ)."}$j_c2000001_0000_0002_0000_000000000006$::jsonb,
  70,
  2,
  NULL,
  3,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-06.png',
  $eax_c2000001_0000_0002_0000_000000000006$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-06.png","caption":"Quy định ghi chú + đính kèm; phân loại Nhiệm vụ / Hoạt động / Tài liệu."}]$eax_c2000001_0000_0002_0000_000000000006$::jsonb
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
  'c2000001-0000-0000-0000-000000000007',
  'b2000001-0000-0000-0000-000000000007',
  'Kiểm tra: Lịch sử tương tác và SLA — Phản hồi đúng hạn',
  '12 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000001_0000_0000_0000_000000000007${"items":[{"id":"tt1","question":"SLA là gì?","type":"single","options":["Hạn xử lý cam kết","Loại cửa","Mã Lead","Thuế"],"correct":[0],"explanation":"Cam kết thời gian."},{"id":"tt2","question":"Trễ SLA — rủi ro?","type":"single","options":["Không sao","Khách lạnh, mất cơ hội","Tự thưởng","Tự xóa Lead"],"correct":[1],"explanation":"Thời gian = cơ hội."},{"id":"td3","question":"Quy tắc 5 phút với Lead Hot?","type":"single","options":["Gọi trong 5 phút","Nghỉ 5 phút","Xóa sau 5 phút","Không áp dụng"],"correct":[0],"explanation":"Phản hồi nhanh."},{"id":"td4","question":"Hoạt động ghi nhận?","type":"single","options":["Chỉ gọi","Gọi, gặp, email, đổi giai đoạn…","Chỉ KPI","Chỉ chat nội bộ"],"correct":[1],"explanation":"Timeline đầy đủ."},{"id":"nl5","question":"Badge đỏ trên thẻ?","type":"single","options":["Quá hạn SLA","Đã thắng","Đã xóa","VIP"],"correct":[0],"explanation":"Cần xử lý gấp."},{"id":"nl6","question":"Tab Deadline dùng để?","type":"single","options":["Nhóm theo hạn xử lý","Xóa Lead","Tạo HĐ","Chat"],"correct":[0],"explanation":"Ưu tiên trễ SLA."},{"id":"vh7","question":"Lead Hot nhận lúc 9h00 — gọi trước?","type":"single","options":["9h30","9h05","10h00","Ngày mai"],"correct":[1],"explanation":"Trong 5 phút."},{"id":"vh8","question":"Sau cuộc gọi nên?","type":"single","options":["Chỉ kéo thẻ","Ghi hoạt động + kéo thẻ nếu đủ","Xóa Lead","Đổi SĐT"],"correct":[1],"explanation":"Lịch sử phải có nội dung."},{"id":"vh9","question":"Sáng vào ca nên mở?","type":"single","options":["Deadline trước","Chỉ chat","Chỉ lương","Blocklist"],"correct":[0],"explanation":"Ưu tiên Lead trễ."},{"id":"bc10","question":"Quên ghi hoạt động — sửa?","type":"single","options":["Bỏ qua","Bổ sung hoạt động với thời gian thật","Xóa Lead","Đổi khách"],"correct":[1],"explanation":"Timeline phải đầy đủ."},{"id":"bc11","question":"Lead trễ SLA — ưu tiên?","type":"single","options":["Cuối tuần","Xử lý ngay trong ca","Tháng sau","Không cần"],"correct":[1],"explanation":"Badge đỏ = gấp."},{"id":"bc12","question":"Đổi giai đoạn có ghi timeline?","type":"single","options":["Không","Có — là một loại hoạt động","Chỉ admin","Chỉ Deal"],"correct":[1],"explanation":"Hệ thống ghi nhận."}]}$j_c2000001_0000_0000_0000_000000000007$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-07.png',
  $eax_c2000001_0000_0000_0000_000000000007$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-07.png","caption":"5 kênh ghi nhận, quy tắc 5 phút Lead Hot, tab Deadline."}]$eax_c2000001_0000_0000_0000_000000000007$::jsonb
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
  'c2000001-0000-0000-0000-000000000008',
  'b2000001-0000-0000-0000-000000000008',
  'Kiểm tra: KPI Lead — Đọc bảng điểm và sửa điểm thấp',
  '13 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000001_0000_0000_0000_000000000008${"items":[{"id":"tt1","question":"KPI công bằng khi?","type":"single","options":["Mọi người cùng quy tắc trên CRM","Sổ tay riêng","Ẩn số liệu","Không ghi"],"correct":[0],"explanation":"Cùng hệ thống."},{"id":"tt2","question":"Mục đích KPI Lead?","type":"single","options":["Phạt nhân viên","Đo hành vi, giúp sửa chỗ yếu","Trang trí","Tính thuế"],"correct":[1],"explanation":"Cải thiện liên tục."},{"id":"td3","question":"KPI Lead gồm?","type":"single","options":["Chỉ doanh số","Đầy đủ thông tin, Đúng hạn, chuyển Deal…","Chỉ cuộc gọi","Chỉ Facebook"],"correct":[1],"explanation":"Nhiều chỉ số hành vi."},{"id":"td4","question":"Ledger KPI là?","type":"single","options":["Sổ ghi sự kiện cộng/trừ điểm","Loại cửa","Mã HĐ","Tên KH"],"correct":[0],"explanation":"Tự động khi làm đúng/sai."},{"id":"td5","question":"Quy tắc chặn điểm khi KPI Đầy đủ thông tin thấp?","type":"single","options":["Không","Có — điểm tháng bị giới hạn","Chỉ admin","Chỉ năm"],"correct":[1],"explanation":"Khuyến khích nhập liệu."},{"id":"nl6","question":"Xem điểm KPI ở?","type":"single","options":["CRM → Bảng điểm","Chỉ sếp","Không có","Zalo"],"correct":[0],"explanation":"Scorecard tháng."},{"id":"nl7","question":"KPI \"Đúng hạn\" đo?","type":"single","options":["% nhiệm vụ/Lead xử lý đúng SLA","Số email","Chiều cao tủ","Màu sơn"],"correct":[0],"explanation":"Cam kết thời gian."},{"id":"vh8","question":"Cuối tuần nên?","type":"single","options":["Mở Bảng điểm, xem chỉ số","Bỏ qua","Xóa Lead","Tắt CRM"],"correct":[0],"explanation":"Tự kiểm định kỳ."},{"id":"vh9","question":"Chỉ số đỏ — làm gì?","type":"single","options":["Bỏ qua","Lập kế hoạch sửa tuần sau","Tick giả","Đổi khách"],"correct":[1],"explanation":"Hành động cụ thể."},{"id":"vh10","question":"Cải thiện KPI tháng sau?","type":"single","options":["Lặp sai sót","Kế hoạch cụ thể từng chỉ số","Không làm gì","Tắt CRM"],"correct":[1],"explanation":"Đo được mới sửa được."},{"id":"bc11","question":"KPI 72% Đầy đủ thông tin (ngưỡng 80%) — sửa?","type":"single","options":["Bỏ qua","Bổ sung 6 trường cho Lead thiếu","Xóa Lead","Báo cáo giả"],"correct":[1],"explanation":"Hành động trực tiếp."},{"id":"bc12","question":"Lead chuyển Deal ảnh hưởng KPI?","type":"single","options":["Không","Có — chỉ số chuyển đổi","Chỉ xưởng","Chỉ vận chuyển"],"correct":[1],"explanation":"Đo năng suất sales."},{"id":"bc13","question":"Tick giả cuối tháng — hậu quả?","type":"single","options":["Thưởng","Ledger trừ điểm, mất uy tín","Tự thăng chức","Không sao"],"correct":[1],"explanation":"Hệ thống ghi nhận."}]}$j_c2000001_0000_0000_0000_000000000008$::jsonb,
  80,
  3,
  15,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-08.png',
  $eax_c2000001_0000_0000_0000_000000000008$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-08.png","caption":"Chỉ số Đầy đủ thông tin, Đúng hạn, Chuyển Deal; Ledger và quy tắc chặn điểm."}]$eax_c2000001_0000_0000_0000_000000000008$::jsonb
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
  'c2000001-0000-0002-0000-000000000008',
  'b2000001-0000-0000-0000-000000000008',
  'Tự luận: Áp dụng và cam kết',
  'Bài tự luận — trình bày trung thực, tối thiểu 200 từ.',
  'essay',
  $j_c2000001_0000_0002_0000_000000000008${"prompt":"Xem Bảng điểm KPI tháng của bạn (hoặc giả định). Chỉ số nào thấp nhất? Kế hoạch 3 bước cụ thể để cải thiện tháng tới (tối thiểu 200 từ)."}$j_c2000001_0000_0002_0000_000000000008$::jsonb,
  70,
  2,
  NULL,
  3,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-08.png',
  $eax_c2000001_0000_0002_0000_000000000008$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-08.png","caption":"Chỉ số Đầy đủ thông tin, Đúng hạn, Chuyển Deal; Ledger và quy tắc chặn điểm."}]$eax_c2000001_0000_0002_0000_000000000008$::jsonb
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
  'c2000001-0000-0000-0000-000000000009',
  'b2000001-0000-0000-0000-000000000009',
  'Kiểm tra: Chi tiết Lead — Bốn tab và nút quan trọng',
  '10 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000001_0000_0000_0000_000000000009${"items":[{"id":"tt1","question":"Chi tiết Lead là gì?","type":"single","options":["Trung tâm điều khiển mọi việc với một khách","Chỉ xem KPI","Chỉ chat","Chỉ in PDF"],"correct":[0],"explanation":"Hub thông tin."},{"id":"td2","question":"Tab Tổng quan hiển thị?","type":"single","options":["6 thông tin bắt buộc + phụ trách","Chỉ logo","Chỉ KPI năm","Chỉ chat"],"correct":[0],"explanation":"Kiểm tra nhanh hồ sơ."},{"id":"td3","question":"Hoạt động khác ghi chú?","type":"single","options":["Giống hệt","Có loại + thời gian timeline","Chỉ admin","Không dùng"],"correct":[1],"explanation":"Timeline truy vết."},{"id":"nl4","question":"Chuyển Deal ở đâu?","type":"single","options":["Footer","Nút header chi tiết Lead","Cài đặt","Báo cáo"],"correct":[1],"explanation":"Khi đủ điều kiện."},{"id":"nl5","question":"Tab Tài liệu lưu?","type":"single","options":["PDF, ảnh, HĐ","Chỉ chat","Chỉ KPI","Chỉ lương"],"correct":[0],"explanation":"Hồ sơ file."},{"id":"vh6","question":"Trước gọi khách nên mở tab?","type":"single","options":["Hoạt động","Blocklist","Lương","Chat công ty"],"correct":[0],"explanation":"Nắm lịch sử."},{"id":"vh7","question":"Ghi chú cuộc gọi nên?","type":"single","options":["Tài liệu","Hoạt động / Nhiệm vụ","Xóa","Email riêng"],"correct":[1],"explanation":"Phân loại đúng."},{"id":"vh8","question":"HĐ PDF ký lưu?","type":"single","options":["Chat","Tài liệu","Không lưu","Email riêng"],"correct":[1],"explanation":"Tập trung hồ sơ."},{"id":"bc9","question":"Ghi chú gọi vào Tài liệu — sửa?","type":"single","options":["Giữ nguyên","Chuyển sang Hoạt động","Xóa Lead","Đổi pass"],"correct":[1],"explanation":"Đúng tab."},{"id":"bc10","question":"Không đọc lịch sử trước gọi — rủi ro?","type":"single","options":["Khách hài lòng hơn","Hỏi lại thông tin đã trao đổi","Tự thưởng","KPI tăng"],"correct":[1],"explanation":"Mất chuyên nghiệp."}]}$j_c2000001_0000_0000_0000_000000000009$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-09.png',
  $eax_c2000001_0000_0000_0000_000000000009$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-09.png","caption":"Tổng quan, Nhiệm vụ, Hoạt động, Tài liệu; nút Chuyển Deal, Sửa, Mất/Mở lại."}]$eax_c2000001_0000_0000_0000_000000000009$::jsonb
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
  'c2000001-0000-0000-0000-000000000010',
  'b2000001-0000-0000-0000-000000000010',
  'Kiểm tra: Chuyển Lead thành Deal — Cột mốc quan trọng',
  '11 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000001_0000_0000_0000_000000000010${"items":[{"id":"tt1","question":"Chuyển Deal khi?","type":"single","options":["Mới tạo Lead","KH đồng ý mua + thống nhất SP/giá","Chưa gọi","Cuối năm"],"correct":[1],"explanation":"Đủ điều kiện nghiệp vụ."},{"id":"tt2","question":"Chuyển sớm — hậu quả?","type":"single","options":["Deal ảo, KPI sai","Tự thưởng","Khách vui","Không sao"],"correct":[0],"explanation":"Dữ liệu phải thật."},{"id":"td3","question":"Sau chuyển Deal?","type":"single","options":["Mất lịch sử","Giữ lịch sử, sang pipeline Deal","Xóa Lead","Tạo SĐT mới"],"correct":[1],"explanation":"Chuyển một chiều, giữ dữ liệu."},{"id":"td4","question":"Chuyển Deal hoàn tác?","type":"single","options":["Có","Không — kiểm tra kỹ trước Xác nhận","Tự động","Chỉ admin mọi lúc"],"correct":[1],"explanation":"Một chiều."},{"id":"nl5","question":"Nút Chuyển Deal ở?","type":"single","options":["Header chi tiết Lead","Footer","Cài đặt","Chat"],"correct":[0],"explanation":"Header."},{"id":"nl6","question":"Trước chuyển cần file?","type":"single","options":["Báo giá trên Tài liệu","Chỉ ảnh cá nhân","Không cần","Chỉ chat"],"correct":[0],"explanation":"Minh chứng chốt."},{"id":"vh7","question":"Bước 1 trước chuyển?","type":"single","options":["Xác nhận KH đồng ý mua","Xóa Lead","In lương","Tạo NV"],"correct":[0],"explanation":"Cam kết rõ ràng."},{"id":"vh8","question":"Sau Xác nhận làm gì?","type":"single","options":["Mở Bảng Deal tiếp tục","Xóa CRM","Nghỉ phép","Blocklist"],"correct":[0],"explanation":"Pipeline Deal."},{"id":"vh9","question":"Nghi ngờ chưa chốt — làm gì?","type":"single","options":["Vẫn chuyển","Chưa chuyển, hỏi lại KH/sếp","Xóa Lead","Tick giả"],"correct":[1],"explanation":"Cẩn trọng."},{"id":"bc10","question":"Thiếu 6 trường vẫn chuyển — sửa?","type":"single","options":["Bổ sung trước khi chuyển","Bỏ qua","Xóa Deal","Báo cáo giả"],"correct":[0],"explanation":"Hồ sơ đầy đủ."},{"id":"bc11","question":"Checklist trước chuyển gồm?","type":"single","options":["Đồng ý mua + 6 trường + báo giá + pipeline","Chỉ SĐT","Chỉ ảnh","Không cần"],"correct":[0],"explanation":"Checklist chuẩn."}]}$j_c2000001_0000_0000_0000_000000000010$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-10.png',
  $eax_c2000001_0000_0000_0000_000000000010$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-10.png","caption":"Điều kiện chuyển, popup pipeline Deal, không hoàn tác, checklist trước chuyển."}]$eax_c2000001_0000_0000_0000_000000000010$::jsonb
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
  'c2000001-0000-0001-0000-000000000010',
  'b2000001-0000-0000-0000-000000000010',
  'Thực hành trên phần mềm',
  'Đánh dấu khi bạn đã thực hành được trên phần mềm thật.',
  'checklist',
  $j_c2000001_0000_0001_0000_000000000010${"items":[{"id":"c1","text":"KH đồng ý mua có ghi nhận"},{"id":"c2","text":"Đủ 6 thông tin"},{"id":"c3","text":"Đã báo giá / file"},{"id":"c4","text":"Đã chọn đúng pipeline Deal"},{"id":"c5","text":"Đã kiểm tra không trùng Deal"}]}$j_c2000001_0000_0001_0000_000000000010$::jsonb,
  80,
  NULL,
  NULL,
  2,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-10.png',
  $eax_c2000001_0000_0001_0000_000000000010$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-10.png","caption":"Điều kiện chuyển, popup pipeline Deal, không hoàn tác, checklist trước chuyển."}]$eax_c2000001_0000_0001_0000_000000000010$::jsonb
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
  'c2000001-0000-0000-0000-000000000011',
  'b2000001-0000-0000-0000-000000000011',
  'Kiểm tra: Tình huống đặc biệt — Trùng, mất, mở lại, blocklist',
  '11 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000001_0000_0000_0000_000000000011${"items":[{"id":"tt1","question":"Vì sao không xóa Lead?","type":"single","options":["Mất lịch sử phân tích","Tự thưởng","Khách vui","Nhanh hơn"],"correct":[0],"explanation":"Dữ liệu = tài sản."},{"id":"tt2","question":"Blocklist là gì?","type":"single","options":["Khách từ chối liên hệ — báo admin","Xóa Lead","Chuyển Deal","Tạo NV"],"correct":[0],"explanation":"Tôn trọng khách."},{"id":"td3","question":"Lead trùng SĐT?","type":"single","options":["Tạo mới","Gộp chăm sóc trên Lead cũ","Ẩn","Block"],"correct":[1],"explanation":"Một khách một luồng."},{"id":"td4","question":"Lead \"Mất\"?","type":"single","options":["Xóa","Đánh dấu mất + lý do","Chuyển Deal","Tạo NV"],"correct":[1],"explanation":"Giữ lịch sử."},{"id":"nl5","question":"Quét trùng dùng khi?","type":"single","options":["Trước tạo Lead mới","Sau khi SX","Cuối năm","Không dùng"],"correct":[0],"explanation":"Tránh trùng."},{"id":"nl6","question":"Mở lại Lead khi?","type":"single","options":["KH quay lại sau thời gian","Mới vào công ty","Trời mưa","Cuối tuần"],"correct":[0],"explanation":"Tiếp tục luồng cũ."},{"id":"vh7","question":"KH không mua — làm gì?","type":"single","options":["Xóa Lead","Mất + lý do","Tạo Lead mới","Block ngay"],"correct":[1],"explanation":"Ghi nhận lý do."},{"id":"vh8","question":"KH cấm gọi — làm gì?","type":"single","options":["Vẫn gọi","Báo admin blocklist","Tạo Lead mới","Xóa SĐT"],"correct":[1],"explanation":"Tuân thủ."},{"id":"vh9","question":"KH gọi lại sau 3 tháng mất?","type":"single","options":["Tạo mới","Mở lại Lead cũ","Xóa cũ","Bỏ qua"],"correct":[1],"explanation":"Giữ lịch sử."},{"id":"bc10","question":"Tạo mới khi trùng SĐT — sửa?","type":"single","options":["Gộp trên Lead cũ","Giữ 2 Lead","Xóa cũ","Báo cáo giả"],"correct":[0],"explanation":"Một luồng."},{"id":"bc11","question":"Mất không ghi lý do — vấn đề?","type":"single","options":["Marketing không phân tích được","Tốt","Tự thưởng","Khách vui"],"correct":[0],"explanation":"Lý do = bài học."}]}$j_c2000001_0000_0000_0000_000000000011$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-11.png',
  $eax_c2000001_0000_0000_0000_000000000011$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-11.png","caption":"Xử lý Lead trùng SĐT, đánh dấu Mất, Mở lại, blocklist — không xóa lịch sử."}]$eax_c2000001_0000_0000_0000_000000000011$::jsonb
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
  'c2000001-0000-0000-0000-000000000012',
  'b2000001-0000-0000-0000-000000000012',
  'Kiểm tra: Ôn tập hành trình Lead — Từ tiếp nhận đến chuyển Deal',
  '10 câu — phân bổ đủ 5 trụ (Tư tưởng / Tư duy / Nguồn lực / Vận hành / Báo cáo). Đọc giải thích sau khi nộp để củng cố.',
  'quiz',
  $j_c2000001_0000_0000_0000_000000000012${"items":[{"id":"tt1","question":"Hành trình Lead phục vụ?","type":"single","options":["Chỉ KPI","Khách và công ty — không mất cơ hội","Chỉ admin","Chỉ xưởng"],"correct":[1],"explanation":"Chuỗi giá trị."},{"id":"tt2","question":"Thiếu một trụ — hậu quả?","type":"single","options":["Hồ sơ và KPI lỗ hổng","Tự thưởng","Không sao","Khách vui"],"correct":[0],"explanation":"5 trụ liên kết."},{"id":"td3","question":"Thứ tự đúng?","type":"single","options":["Chuyển Deal → Tạo Lead","Tạo Lead → Chăm sóc → Chuyển Deal","Chỉ KPI","Chỉ chat"],"correct":[1],"explanation":"Quy trình chuẩn."},{"id":"td4","question":"Lead vs Deal cuối hành trình?","type":"single","options":["Giống nhau","Lead chưa chốt → Deal đã chốt","Deal trước Lead","Không liên quan"],"correct":[1],"explanation":"Cột mốc chuyển."},{"id":"nl5","question":"Công cụ end-to-end?","type":"single","options":["Bảng Lead + Chi tiết + Bảng điểm","Chỉ Excel","Chỉ Zalo","Chỉ sổ tay"],"correct":[0],"explanation":"Trên CRM."},{"id":"vh6","question":"Bước 1 hành trình?","type":"single","options":["Quét trùng + tạo Lead","Chuyển Deal","In lương","Blocklist"],"correct":[0],"explanation":"Tiếp nhận."},{"id":"vh7","question":"Trước chuyển Deal?","type":"single","options":["Checklist Bài 10","Chỉ SĐT","Không cần","Xóa Lead"],"correct":[0],"explanation":"Đủ điều kiện."},{"id":"vh8","question":"Minh chứng ở bước nào?","type":"single","options":["Chăm sóc — ghi chú + file","Chỉ cuối năm","Không cần","Chỉ admin"],"correct":[0],"explanation":"Trong vận hành."},{"id":"bc9","question":"KPI thấp cuối hành trình — sửa?","type":"single","options":["Bảng điểm + kế hoạch hành vi","Bỏ qua","Tick giả","Tắt CRM"],"correct":[0],"explanation":"Báo cáo & sửa."},{"id":"bc10","question":"Nhảy cóc chuyển Deal — sửa?","type":"single","options":["Chưa chuyển, bổ sung hồ sơ","Giữ Deal ảo","Xóa Lead","Báo cáo giả"],"correct":[0],"explanation":"Sửa trước cột mốc."}]}$j_c2000001_0000_0000_0000_000000000012$::jsonb,
  70,
  3,
  NULL,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-12.png',
  $eax_c2000001_0000_0000_0000_000000000012$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-12.png","caption":"Tổng hợp 5 trụ trên một hành trình khách thật — checklist end-to-end."}]$eax_c2000001_0000_0000_0000_000000000012$::jsonb
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
  'c2000001-0000-0000-0000-000000000099',
  'b2000001-0000-0000-0000-000000000013',
  'Bài thi tổng kết khoá',
  '20 câu — 30 phút — đạt 80% — tối đa 3 lượt. Phủ đủ 5 trụ.',
  'quiz',
  $j_c2000001_0000_0000_0000_000000000099${"items":[{"id":"fq1","question":"Lead là gì?","type":"single","options":["Khách đã ký HĐ","Khách tiềm năng chưa cam kết mua","Nhân viên mới","File PDF"],"correct":[1],"explanation":"Lead chưa chốt."},{"id":"fq2","question":"Deal khác Lead ở?","type":"single","options":["Đã chốt mua","Chưa liên hệ","Là nhân viên","Là file"],"correct":[0],"explanation":"Deal sau khi thống nhất mua."},{"id":"fq3","question":"Vì sao dùng CRM?","type":"single","options":["Lưu lịch sử, KPI công bằng","Chỉ giám sát","Tốn thời gian","Không lý do"],"correct":[0],"explanation":"Tư tưởng."},{"id":"fq4","question":"Một Lead — bao nhiêu phụ trách chính?","type":"single","options":["Một","Không giới hạn","Hai bắt buộc","Không có"],"correct":[0],"explanation":"Tư duy."},{"id":"fq5","question":"Quét trùng trước?","type":"single","options":["Lưu Lead mới","Tạo Deal","In PDF","Blocklist"],"correct":[0],"explanation":"Vận hành."},{"id":"fq6","question":"6 trường bắt buộc — KPI nào?","type":"single","options":["Đầy đủ thông tin","Màu tủ","Giờ nghỉ","Loại xe"],"correct":[0],"explanation":"Báo cáo."},{"id":"fq7","question":"SLA là?","type":"single","options":["Hạn xử lý cam kết","Mã SP","Tên xưởng","VAT"],"correct":[0],"explanation":"Tư duy."},{"id":"fq8","question":"Lead Hot — gọi trong?","type":"single","options":["5 phút","1 tuần","1 tháng","Không cần"],"correct":[0],"explanation":"Vận hành."},{"id":"fq9","question":"Chuyển Deal khi?","type":"single","options":["KH đồng ý mua","Mới tạo Lead","Chưa gọi","Không bao giờ"],"correct":[0],"explanation":"Vận hành."},{"id":"fq10","question":"Kéo Kanban khi?","type":"single","options":["Đã hoàn thành việc giai đoạn","Rảnh","Cuối năm","Admin bảo"],"correct":[0],"explanation":"Vận hành."},{"id":"fq11","question":"Minh chứng khi hoàn thành nhiệm vụ?","type":"single","options":["Ghi chú + file nếu yêu cầu","Chỉ tick","Xóa Lead","Đổi pass"],"correct":[0],"explanation":"Vận hành."},{"id":"fq12","question":"Xem KPI ở?","type":"single","options":["CRM → Bảng điểm","Chỉ sếp","Zalo","Không có"],"correct":[0],"explanation":"Nguồn lực."},{"id":"fq13","question":"Trùng SĐT?","type":"single","options":["Mở Lead cũ","Tạo mới","Xóa","Block"],"correct":[0],"explanation":"Báo cáo & sửa."},{"id":"fq14","question":"Lead Mất?","type":"single","options":["Đánh dấu + lý do","Xóa","Chuyển Deal","Tạo NV"],"correct":[0],"explanation":"Báo cáo & sửa."},{"id":"fq15","question":"HĐ PDF lưu tab?","type":"single","options":["Tài liệu","Chat","Blocklist","Lương"],"correct":[0],"explanation":"Nguồn lực."},{"id":"fq16","question":"Bảng Lead ở menu?","type":"single","options":["CRM → Bảng Lead","Công việc","Kiến thức","Xưởng"],"correct":[0],"explanation":"Nguồn lực."},{"id":"fq17","question":"Quy tắc chặn điểm khi?","type":"single","options":["KPI Đầy đủ thông tin < ngưỡng","Trời mưa","Mới vào","Cuối tuần"],"correct":[0],"explanation":"Báo cáo."},{"id":"fq18","question":"Tick hoàn thành chưa gọi?","type":"single","options":["Vi phạm KPI","Được","Bắt buộc","Tốt"],"correct":[0],"explanation":"Báo cáo & sửa."},{"id":"fq19","question":"5 kênh tiếp nhận?","type":"single","options":["5","2","10","1"],"correct":[0],"explanation":"Tư duy."},{"id":"fq20","question":"Sau chuyển Deal?","type":"single","options":["Giữ lịch sử, sang pipeline Deal","Mất lịch sử","Xóa Lead","Tạo SĐT mới"],"correct":[0],"explanation":"Tư duy."}]}$j_c2000001_0000_0000_0000_000000000099$::jsonb,
  80,
  3,
  30,
  1,
  'https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-13.png',
  $eax_c2000001_0000_0000_0000_000000000099$[{"type":"image","url":"https://kdxypztstbeovyedmvem.supabase.co/storage/v1/object/public/attachments/knowledge/lead-13.png","caption":"Bài thi tổng kết khoá — đạt yêu cầu để nhận chứng nhận."}]$eax_c2000001_0000_0000_0000_000000000099$::jsonb
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, image_url = EXCLUDED.image_url,
  attachments = EXCLUDED.attachments, updated_at = now();
COMMIT;
