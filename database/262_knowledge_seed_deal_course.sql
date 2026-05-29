-- 262_knowledge_seed_deal_course.sql
-- Khoá học "Deal — Quản lý Cơ hội Bán hàng"
-- Ngành: TỦ BẾP NHÔM / CỬA NHÔM
-- 1 danh mục + 12 bài học + 15 bài tập + bài thi tổng kết
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

-- ══════════════════════════════════════════════════════════════════════════
-- DANH MỤC DEAL
-- ══════════════════════════════════════════════════════════════════════════
INSERT INTO knowledge_categories (id, name, slug, description, icon, sort_order, is_active)
VALUES (
  'd2000002-0000-0000-0000-000000000001',
  'Deal — Cơ hội bán hàng',
  'deal-co-hoi-ban-hang',
  'Khoá đào tạo quản lý Deal sau khi chuyển từ Lead: pipeline mặc định 6 giai đoạn (báo giá — đàm phán — ký HĐ — thắng/thua), bàn giao sản xuất và điểm Deal. Mỗi công ty có thể tự cấu hình pipeline riêng với số giai đoạn khác nhau — 6 giai đoạn trong khoá là minh hoạ tượng trưng. Ngành tủ bếp nhôm / cửa nhôm.',
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

-- ══════════════════════════════════════════════════════════════════════════
-- BÀI 01 — Khái niệm Deal
-- ══════════════════════════════════════════════════════════════════════════
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  cover_image_url, duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000002-0000-0000-0000-000000000001',
  'd2000002-0000-0000-0000-000000000001',
  'Bài 1: Deal là gì? Khác Lead ở đâu?',
  'Định nghĩa Deal, điều kiện chuyển từ Lead, mã định danh và trách nhiệm người phụ trách.',
  $md$# Bài 1 — Khái niệm Deal

## 1. Deal là gì?

**Deal** (cơ hội bán hàng) là khách hàng đã **thống nhất mua** về mặt nguyên tắc: đã rõ sản phẩm, phạm vi và mức giá. Giai đoạn tiếp theo là hoàn tất hợp đồng, thu cọc và triển khai sản xuất — lắp đặt.

**Ví dụ ngành tủ bếp nhôm:**
- Chị Lan Q7 đã chốt tủ bếp chữ L 3.2m, mặt đá, giá 72 triệu → **Deal**
- Anh Minh Bình Dương chốt 2 bộ cửa nhôm Xingfa, 38 triệu → **Deal**

## 2. Phân biệt Lead — Deal — Khách hàng

| | Lead | Deal | Khách hàng |
|---|---|---|---|
| Cam kết mua | Chưa | Đã thống nhất | Đã ký HĐ + cọc |
| Vị trí trên CRM | Tab **Lead** | Tab **Deal** | Danh bạ **Customer** |
| Mục tiêu | Tư vấn, báo giá | Chốt HĐ, thu tiền | Chăm sóc sau bán |

## 3. Sau khi chuyển Lead → Deal

- **Mã giữ nguyên** (vd: `LEAD-2026-047`) — toàn bộ lịch sử, ghi chú, file được giữ
- Deal xuất hiện ở **Menu CRM → Bảng Deal**
- Pipeline Deal mặc định có **6 giai đoạn** — chi tiết Bài 2. Lưu ý: mỗi công ty có thể bật **nhiều pipeline khác nhau** (vd: pipeline B2B, pipeline showroom, pipeline dự án thầu) với số giai đoạn riêng. Khoá học này dùng pipeline 6 giai đoạn làm **ví dụ tượng trưng**.
- Hệ thống tự tạo **nhiệm vụ Deal** (soạn HĐ, thu cọc, …)

## 4. Người phụ trách Deal

- **Phụ trách chính**: chịu KPI Deal, liên hệ KH, đẩy giai đoạn
- **Chủ sở hữu Deal**: thường trưởng nhóm, giám sát
- Mọi thao tác trên Deal đều được **ghi nhận** vào lịch sử

## 5. Tóm tắt

1. Deal = đã chốt mua, chưa hoặc đang hoàn tất HĐ
2. Chỉ chuyển Lead → Deal khi đủ điều kiện (xem khoá Lead Bài 11)
3. Không có nút hoàn tác — kiểm tra kỹ trước khi chuyển
$md$,
  'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&q=80',
  8, ARRAY['deal','co-ban'], true, 1, true, now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, content_md = EXCLUDED.content_md,
  cover_image_url = EXCLUDED.cover_image_url, duration_minutes = EXCLUDED.duration_minutes,
  tags = EXCLUDED.tags, is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();

-- ══════════════════════════════════════════════════════════════════════════
-- BÀI 02 — Pipeline Deal (6 giai đoạn — minh hoạ)
-- ══════════════════════════════════════════════════════════════════════════
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  cover_image_url, duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000002-0000-0000-0000-000000000002',
  'd2000002-0000-0000-0000-000000000001',
  'Bài 2: Bảng Deal và 6 giai đoạn pipeline (mẫu)',
  'Kanban Deal, ý nghĩa từng cột, quy tắc kéo thẻ và chế độ xem. 6 giai đoạn dưới đây là pipeline mặc định — mỗi công ty có thể cấu hình pipeline riêng.',
  $md$# Bài 2 — Bảng Deal và pipeline

**Menu trái → CRM → Bảng Deal**

> ⚠️ **Quan trọng — đọc trước:** Mỗi công ty có thể tạo **nhiều pipeline Deal khác nhau** (B2B, showroom, dự án thầu, …) với số giai đoạn và tên cột tuỳ chỉnh. Sáu giai đoạn dưới đây là **pipeline mặc định mang tính minh hoạ** — bạn cần kiểm tra **cấu hình pipeline của công ty bạn** với trưởng nhóm/admin để biết số cột và tên cột thực tế. Nguyên tắc làm việc (kéo thẻ, gate, ghi chú) áp dụng cho **mọi pipeline**.

## 1. Sáu giai đoạn pipeline mẫu

| STT | Giai đoạn (mẫu) | Ý nghĩa thực tế (tủ bếp / cửa nhôm) |
|---|---|---|
| 1 | **Deal mới** | Vừa chuyển từ Lead, chuẩn bị báo giá chính thức |
| 2 | **Báo giá** | Đã gửi báo giá / bản vẽ, chờ KH phản hồi |
| 3 | **Đàm phán** | Thương lượng giá, phụ kiện, lịch lắp |
| 4 | **Ký hợp đồng** | Soạn HĐ, KH ký, thu cọc |
| 5 | **Thắng** | Hoàn tất — chuyển sang sản xuất |
| 6 | **Thua** | KH hủy / chọn đối thủ — ghi rõ lý do |

> 📌 Trong tài liệu khoá học này, các bài sau (3, 4, 5, …) tham chiếu đến **các giai đoạn chính** của pipeline mẫu (báo giá, đàm phán, ký HĐ, thắng, thua). Khi áp dụng vào công ty bạn, hãy ánh xạ sang tên cột tương ứng trong pipeline thực tế.

## 2. Pipeline thực tế của công ty bạn

Cách kiểm tra pipeline đang dùng:

1. Mở **Bảng Deal** — đếm số cột Kanban hiển thị
2. Đối chiếu tên cột với 6 giai đoạn mẫu → ghi nhớ ánh xạ
3. Nếu có nhiều pipeline (vd: chọn pipeline ở menu thả xuống đầu trang) — học viên cần nắm rõ **mỗi pipeline phục vụ loại đơn nào**

## 3. Thao tác trên Kanban (áp dụng mọi pipeline)

- **Kéo thẻ** sang cột tiếp theo khi đủ điều kiện
- Một số cột yêu cầu **hoàn thành nhiệm vụ bắt buộc** hoặc **điền form sự kiện** (Bài 8)
- Kéo vào cột **Thắng** (cột có cờ `is_won = true`) → hệ thống mở **hộp thoại tạo dự án** (Bài 9)
- Kéo vào cột **Thua** (cột có cờ `is_lost = true`) → bắt buộc chọn **lý do thua**

## 4. Chế độ xem

- **Kanban** — theo dõi tiến độ trực quan (khuyến nghị hàng ngày)
- **Danh sách** — lọc, sắp xếp theo giá trị, deadline
- **Deadline** — Deal sắp / quá hạn

## 5. Lưu ý chung

- Deal **không còn** trên bảng Lead
- Mỗi Deal nên có **giá trị ước tính** (estimated value) cập nhật khi chốt giá
- Thời gian ở mỗi giai đoạn được **ghi nhận** — dùng cho báo cáo SLA
- Pipeline có thể bị **đổi cấu hình** bởi admin → đọc thông báo nội bộ và cập nhật quy trình cá nhân
$md$,
  'https://images.unsplash.com/photo-1553877522-43269d4ea984?w=1200&q=80',
  10, ARRAY['deal','pipeline','kanban'], true, 2, true, now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, content_md = EXCLUDED.content_md,
  cover_image_url = EXCLUDED.cover_image_url, duration_minutes = EXCLUDED.duration_minutes,
  tags = EXCLUDED.tags, is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();

-- ══════════════════════════════════════════════════════════════════════════
-- BÀI 03 — Deal mới & Báo giá
-- ══════════════════════════════════════════════════════════════════════════
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000002-0000-0000-0000-000000000003',
  'd2000002-0000-0000-0000-000000000001',
  'Bài 3: Giai đoạn Deal mới và Báo giá',
  'Checklist sau khi chuyển Deal, soạn báo giá chuẩn, đính kèm bản vẽ và cập nhật giá trị Deal.',
  $md$# Bài 3 — Deal mới & Báo giá

## 1. Việc cần làm ngay khi Deal ở cột "Deal mới"

Trong **24 giờ** đầu:

1. Kiểm tra lại **6 thông tin bắt buộc** (kế thừa từ Lead)
2. Xác nhận **giá trị ước tính** trên thẻ Deal
3. Tạo nhiệm vụ **"Soạn báo giá chính thức"** nếu chưa có
4. Liên hệ KH xác nhận lại phạm vi (kích thước, mẫu nhôm, phụ kiện)

## 2. Chuyển sang "Báo giá"

Khi đã:
- Gửi báo giá PDF / bản vẽ qua Zalo, email hoặc ghi nhận hoạt động **"Gửi báo giá"**
- Đính kèm file báo giá vào tab **Tài liệu** Deal

**Thao tác:** Kéo thẻ sang cột **Báo giá** + ghi chú ngắn: ngày gửi, kênh gửi.

## 3. Ví dụ tiêu đề ghi chú chuẩn

> "Đã gửi BG tủ bếp 72tr + bản vẽ 3D qua Zalo 09/05. Hẹn phản hồi 12/05."

## 4. Sai sót thường gặp

| Sai sót | Hậu quả |
|---|---|
| Báo giá miệng, không lưu file | Không chứng minh được khi tranh chấp |
| Không cập nhật giá trị Deal | Báo cáo doanh số sai |
| Để Deal mới quá 3 ngày không xử lý | Cảnh báo SLA, trừ KPI |
$md$,
  8, ARRAY['deal','bao-gia'], true, 3, true, now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, content_md = EXCLUDED.content_md,
  duration_minutes = EXCLUDED.duration_minutes, tags = EXCLUDED.tags,
  is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();

-- ══════════════════════════════════════════════════════════════════════════
-- BÀI 04 — Đàm phán
-- ══════════════════════════════════════════════════════════════════════════
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000002-0000-0000-0000-000000000004',
  'd2000002-0000-0000-0000-000000000001',
  'Bài 4: Đàm phán và chốt điều kiện',
  'Thương lượng giá, phụ kiện, lịch thi công; ghi nhận từng vòng đàm phán trên Deal.',
  $md$# Bài 4 — Đàm phán

## 1. Khi nào chuyển sang "Đàm phán"

- KH đã xem báo giá và **phản hồi** (đồng ý / muốn giảm / đổi spec)
- Có ít nhất **1 hoạt động** ghi nhận cuộc trao đổi sau khi gửi BG

## 2. Nội dung cần thống nhất trước "Ký hợp đồng"

| Hạng mục | Ví dụ tủ bếp nhôm |
|---|---|
| Giá cuối | 68 triệu (đã gồm lắp đặt) |
| Phụ kiện | Bản lề Blum, tay nâng |
| Thời gian SX + lắp | 25 ngày kể từ cọc |
| Thanh toán | 50% cọc — 50% nghiệm thu |
| Bảo hành | 2 năm khung, 1 năm phụ kiện |

## 3. Ghi nhận trên hệ thống

- Mỗi lần gọi / gặp: tạo **Hoạt động** hoặc **Ghi chú** trên Deal
- Nếu đổi giá: cập nhật **Giá trị ước tính** + đính kèm BG mới
- Không hứa miệng ngoài hệ thống — trưởng nhóm dựa vào lịch sử để hỗ trợ

## 4. Xử lý KH muốn giảm giá quá sâu

1. Ghi rõ mức KH yêu cầu và mức công ty chấp nhận
2. Báo trưởng nhóm trước khi cam kết
3. Nếu không chốt được → cân nhắc chuyển **Thua** với lý do rõ ràng (Bài 11)
$md$,
  8, ARRAY['deal','dam-phan'], true, 4, true, now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, content_md = EXCLUDED.content_md,
  duration_minutes = EXCLUDED.duration_minutes, tags = EXCLUDED.tags,
  is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();

-- ══════════════════════════════════════════════════════════════════════════
-- BÀI 05 — Ký HĐ & thu cọc
-- ══════════════════════════════════════════════════════════════════════════
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000002-0000-0000-0000-000000000005',
  'd2000002-0000-0000-0000-000000000001',
  'Bài 5: Ký hợp đồng và thu đặt cọc',
  'Quy trình cột Ký hợp đồng, hồ sơ bắt buộc, nhiệm vụ thu cọc và liên kết Customer.',
  $md$# Bài 5 — Ký hợp đồng & thu cọc

## 1. Cột "Ký hợp đồng"

Deal vào cột này khi:
- KH **đồng ý ký** (có xác nhận bằng tin nhắn / email / biên bản)
- Đang trong quy trình soạn HĐ, thu cọc

## 2. Hồ sơ bắt buộc trên Deal

| Tài liệu | Ghi chú |
|---|---|
| Hợp đồng đã ký (PDF/ảnh) | Tab Tài liệu, loại "Hợp đồng" |
| Biên lai / ảnh chuyển khoản cọc | Loại "Thanh toán" |
| Bản vẽ thiết kế chốt | Loại "Thiết kế" |

## 3. Nhiệm vụ thường gặp

- Soạn và gửi HĐ cho KH ký
- Thu **% cọc** theo chính sách công ty
- Xác nhận với kế toán (nếu có quy trình nội bộ)
- Hoàn thành nhiệm vụ kèm **ghi chú + file** (Bài 7)

## 4. Liên kết Customer

Deal phải gắn **Customer** chính thức — thông tin xuất HĐ, địa chỉ lắp đặt dùng cho sản xuất sau này.

> ⚠️ Không kéo Deal sang **Thắng** nếu chưa có HĐ + cọc (trừ khi trưởng nhóm phê duyệt ngoại lệ).
$md$,
  10, ARRAY['deal','hop-dong','coc'], true, 5, true, now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, content_md = EXCLUDED.content_md,
  duration_minutes = EXCLUDED.duration_minutes, tags = EXCLUDED.tags,
  is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();

-- ══════════════════════════════════════════════════════════════════════════
-- BÀI 06 — Nhiệm vụ Deal
-- ══════════════════════════════════════════════════════════════════════════
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000002-0000-0000-0000-000000000006',
  'd2000002-0000-0000-0000-000000000001',
  'Bài 6: Nhiệm vụ trên Deal',
  'Tab Nhiệm vụ, nhiệm vụ tự động khi chuyển giai đoạn, phân công và deadline.',
  $md$# Bài 6 — Nhiệm vụ trên Deal

## 1. Truy cập

Mở **chi tiết Deal** → tab **Nhiệm vụ** (hoặc icon checklist trên thẻ Kanban).

## 2. Nhiệm vụ tự động

Khi chuyển Lead → Deal hoặc kéo sang giai đoạn mới, hệ thống có thể tạo:
- Xác nhận thông tin đơn hàng
- Soạn hợp đồng
- Thu đặt cọc
- Gửi bản vẽ cho xưởng (trước bàn giao SX)

## 3. Tạo nhiệm vụ thủ công

- Tiêu đề rõ ràng (vd: "Gọi KH xác nhận ngày đo lại")
- **Người thực hiện** + **Hạn** (deadline)
- Gắn với Deal để báo cáo theo đơn

## 4. Quy tắc quan trọng

- Nhiệm vụ **bắt buộc** chưa xong → có thể **chặn** kéo sang giai đoạn tiếp (tùy cấu hình công ty)
- Nhiệm vụ quá hạn → cảnh báo trên dashboard CRM
$md$,
  7, ARRAY['deal','nhiem-vu'], true, 6, true, now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, content_md = EXCLUDED.content_md,
  duration_minutes = EXCLUDED.duration_minutes, tags = EXCLUDED.tags,
  is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();

-- ══════════════════════════════════════════════════════════════════════════
-- BÀI 07 ⭐ — Hoàn thành nhiệm vụ Deal
-- ══════════════════════════════════════════════════════════════════════════
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000002-0000-0000-0000-000000000007',
  'd2000002-0000-0000-0000-000000000001',
  'Bài 7 ⭐: Quy định hoàn thành nhiệm vụ Deal (KPI)',
  'Bắt buộc ghi chú + file mới được hoàn thành; ảnh hưởng KPI nếu vi phạm.',
  $md$# Bài 7 ⭐ — Hoàn thành nhiệm vụ Deal

> Quy định này **giống Lead**: nhiệm vụ Deal chỉ được đánh dấu **Hoàn thành** khi có **ghi chú** và **file đính kèm** (nếu nhiệm vụ yêu cầu minh chứng).

## 1. Quy trình hoàn thành đúng

1. Mở nhiệm vụ trên Deal
2. Nhập **ghi chú** mô tả kết quả (bắt buộc)
3. **Upload file** minh chứng (HĐ, ảnh CK, biên bản…)
4. Bấm **Hoàn thành**

## 2. Ví dụ nhiệm vụ "Thu cọc 50%"

| ✅ Đúng | ❌ Sai |
|---|---|
| Ghi chú: "KH CK 36tr ngày 10/05, ref xxx" + ảnh sao kê | Chỉ bấm Hoàn thành, không ghi gì |
| File PDF biên nhận | "Đã thu" một dòng chung chung |

## 3. Hậu quả KPI

- Hoàn thành **không đủ minh chứng** → nhiệm vụ có thể bị **từ chối** hoặc **trừ điểm**
- Nhiệm vụ quá hạn chưa xong → trừ KPI theo bảng công ty
- Lặp lại vi phạm → trưởng nhóm can thiệp

## 4. Mẹo

- Chụp ảnh màn hình chuyển khoản ngay khi KH gửi
- Đặt tên file rõ: `DEAL-047_HopDong_Ky_20260510.pdf`
$md$,
  10, ARRAY['deal','nhiem-vu','kpi','quan-trong'], true, 7, true, now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, content_md = EXCLUDED.content_md,
  duration_minutes = EXCLUDED.duration_minutes, tags = EXCLUDED.tags,
  is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();

-- ══════════════════════════════════════════════════════════════════════════
-- BÀI 08 — Tài liệu & phê duyệt
-- ══════════════════════════════════════════════════════════════════════════
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000002-0000-0000-0000-000000000008',
  'd2000002-0000-0000-0000-000000000001',
  'Bài 8: Tài liệu Deal và phê duyệt giai đoạn',
  'Tab Tài liệu, loại file, gate chuyển stage và form sự kiện khi kéo thẻ.',
  $md$# Bài 8 — Tài liệu & phê duyệt

## 1. Tab Tài liệu

- Upload HĐ, báo giá, bản vẽ, ảnh hiện trường
- Chọn **loại tài liệu** để báo cáo và tìm kiếm
- Tài liệu Lead **được sao chép** sang Deal khi chuyển

## 2. Gate chuyển giai đoạn (stage gate)

Một số công ty bật **cổng kiểm tra** khi kéo Deal:
- Thiếu file bắt buộc → **không cho** sang cột tiếp
- Phải điền **form sự kiện** (ngày ký, số tiền cọc, …)

## 3. Tab Phê duyệt (nếu có)

- Trưởng nhóm duyệt mức giảm giá / ngoại lệ
- Sale theo dõi trạng thái: chờ duyệt / đã duyệt / từ chối

## 4. Thực hành

Trước khi kéo Deal sang **Ký hợp đồng** hoặc **Thắng**, mở checklist:
- [ ] BG / bản vẽ chốt đã upload
- [ ] HĐ (nếu đã ký) đã upload
- [ ] Cọc đã ghi nhận + file
$md$,
  8, ARRAY['deal','tai-lieu','phe-duyet'], true, 8, true, now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, content_md = EXCLUDED.content_md,
  duration_minutes = EXCLUDED.duration_minutes, tags = EXCLUDED.tags,
  is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();

-- ══════════════════════════════════════════════════════════════════════════
-- BÀI 09 — Deal Thắng → Dự án
-- ══════════════════════════════════════════════════════════════════════════
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000002-0000-0000-0000-000000000009',
  'd2000002-0000-0000-0000-000000000001',
  'Bài 9: Deal Thắng — Tạo dự án sản xuất',
  'Modal tạo dự án khi kéo Thắng, chọn luồng xưởng, bộ nhiệm vụ mẫu.',
  $md$# Bài 9 — Deal Thắng → Dự án

## 1. Khi kéo Deal vào cột "Thắng"

Hệ thống hiển thị **hộp thoại tạo dự án** (không tự tạo ngầm):
- Chọn **loại xưởng** / luồng sản xuất (tủ bếp, cửa nhôm, …)
- Chọn **bộ nhiệm vụ mẫu** (template)
- Xác nhận thông tin: tên công trình, địa chỉ, deadline SX

## 2. Sau khi tạo dự án

- Deal liên kết **project_id**
- Tab **Sản xuất** / **Vận chuyển** trên Deal (hoặc mở từ link dự án)
- KPI **chốt Deal thắng** được cộng điểm

## 3. Điều kiện nên đạt trước "Thắng"

- HĐ + cọc (theo quy định công ty)
- Bản vẽ thiết kế chốt
- Ngày bắt đầu thi công / SX dự kiến (nếu đã thống nhất với KH)

## 4. Lưu ý

- Tạo nhầm dự án → liên hệ admin / PM, **không** tự xóa Deal
- Một Deal thắng thường tương ứng **một dự án** chính
$md$,
  10, ARRAY['deal','thang','san-xuat'], true, 9, true, now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, content_md = EXCLUDED.content_md,
  duration_minutes = EXCLUDED.duration_minutes, tags = EXCLUDED.tags,
  is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();

-- ══════════════════════════════════════════════════════════════════════════
-- BÀI 10 — Bàn giao sản xuất
-- ══════════════════════════════════════════════════════════════════════════
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000002-0000-0000-0000-000000000010',
  'd2000002-0000-0000-0000-000000000001',
  'Bài 10: Bàn giao Deal cho bộ phận sản xuất',
  'Xác nhận bàn giao SX, ngày công trình, đồng bộ pipeline CRM và xưởng.',
  $md$# Bài 10 — Bàn giao sản xuất

## 1. Mục đích

Sale **xác nhận đã bàn giao** đủ hồ sơ cho xưởng — tránh xưởng nhận đơn thiếu bản vẽ / sai spec.

## 2. Thao tác trên chi tiết Deal

- Điền **ngày bắt đầu công trình** (nếu có)
- **Ngày dự kiến bắt đầu / kết thúc sản xuất**
- Bấm **Xác nhận bàn giao sản xuất** (sx handover)

## 3. Sau bàn giao

- Trạng thái được ghi **sx_handover_at**
- Pipeline xưởng có thể đồng bộ theo cấu hình công ty
- Sale vẫn theo dõi Deal đến khi nghiệm thu (phối hợp lắp đặt)

## 4. Checklist bàn giao

- [ ] Bản vẽ thiết kế bản chốt (file PDF)
- [ ] Thông số kỹ thuật trong ghi chú Deal
- [ ] Địa chỉ lắp đặt chính xác
- [ ] Liên hệ KH tại công trình
$md$,
  8, ARRAY['deal','ban-giao','san-xuat'], true, 10, true, now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, content_md = EXCLUDED.content_md,
  duration_minutes = EXCLUDED.duration_minutes, tags = EXCLUDED.tags,
  is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();

-- ══════════════════════════════════════════════════════════════════════════
-- BÀI 11 — Deal thua
-- ══════════════════════════════════════════════════════════════════════════
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000002-0000-0000-0000-000000000011',
  'd2000002-0000-0000-0000-000000000001',
  'Bài 11: Deal thua — Ghi nhận và học kinh nghiệm',
  'Lý do thua bắt buộc, phân loại, báo cáo và không xóa lịch sử.',
  $md$# Bài 11 — Deal thua

## 1. Khi nào chuyển "Thua"

- KH chọn đối thủ, hủy công trình, trì hoãn vô thời hạn
- Đàm phán thất bại sau nhiều vòng

## 2. Thao tác bắt buộc

Kéo Deal vào cột **Thua** → chọn **lý do** (dropdown công ty) + **ghi chú** chi tiết.

Ví dụ lý do:
- Giá cao hơn đối thủ
- KH hoãn công trình 6 tháng
- Spec không đáp ứng được

## 3. Vì sao phải ghi đúng

- Báo cáo **tỷ lệ thua** theo nguồn / sản phẩm
- R&D và marketing điều chỉnh chiến lược
- Tránh "Deal ma" — treo mãi ở Đàm phán

## 4. Sau khi thua

- Deal **không xóa** — lưu lịch sử
- Có thể tạo Lead mới nếu KH quay lại sau (link Customer cũ)
$md$,
  6, ARRAY['deal','thua'], true, 11, true, now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, content_md = EXCLUDED.content_md,
  duration_minutes = EXCLUDED.duration_minutes, tags = EXCLUDED.tags,
  is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();

-- ══════════════════════════════════════════════════════════════════════════
-- BÀI 12 — Điểm Deal
-- ══════════════════════════════════════════════════════════════════════════
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000002-0000-0000-0000-000000000012',
  'd2000002-0000-0000-0000-000000000001',
  'Bài 12: Điểm Deal — Đánh giá chéo và sao khách hàng',
  'Tab Điểm Deal, chấm chéo module, đánh giá KH và ảnh hưởng thưởng/phạt.',
  $md$# Bài 12 — Điểm Deal

## 1. Tab Điểm Deal

Trên chi tiết Deal (sau khi có dự án / hoàn thành một phần):
- **Điểm chéo**: xưởng chấm sale, logistics chấm xưởng, … (thang 1–5 sao)
- **Sao khách hàng**: ghi nhận phản hồi KH sau lắp đặt

## 2. Mục đích

- Cải thiện phối hợp giữa **Kinh doanh — Sản xuất — Lắp đặt**
- Dữ liệu cho **thưởng / phạt** theo bảng công ty (vd: trung bình ≥4.5 sao → thưởng % giá trị Deal)

## 3. Ai chấm, khi nào

- Sau nghiệm thu công trình hoặc theo mốc công ty quy định
- Mỗi module **chỉ chấm 1 lần** / tiêu chí (có thể sửa trong thời hạn)

## 4. Sale cần làm gì

- Nhắc KH khảo sát / ghi **sao KH** nếu được phép nhập hộ
- Phản hồi điểm chéo thấp — cải thiện handover (Bài 10)
$md$,
  7, ARRAY['deal','diem-deal','kpi'], true, 12, true, now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, content_md = EXCLUDED.content_md,
  duration_minutes = EXCLUDED.duration_minutes, tags = EXCLUDED.tags,
  is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();

-- ══════════════════════════════════════════════════════════════════════════
-- BÀI 13 — Bài thi tổng kết
-- ══════════════════════════════════════════════════════════════════════════
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  cover_image_url, duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000002-0000-0000-0000-000000000013',
  'd2000002-0000-0000-0000-000000000001',
  'Bài 13 🏆: Bài thi tổng kết — Deal Master Certification',
  'Giới thiệu bài thi cuối khoá Deal. Bắt buộc đạt 85% để nhận chứng nhận.',
  $md$# Bài 13 🏆 — Bài thi tổng kết khoá Deal

## Cấu trúc bài thi

- **15 câu** trắc nghiệm — phủ Bài 1 → Bài 12
- **Điểm đạt:** 85%
- **Thời gian:** 25 phút
- **Số lần làm:** tối đa 2

## Phân bổ nội dung

| Chủ đề | Số câu |
|---|---|
| Khái niệm & pipeline | 3 |
| Báo giá — Đàm phán — HĐ | 4 |
| Nhiệm vụ & KPI | 3 |
| Thắng / Thua / SX | 3 |
| Điểm Deal | 2 |

## Lưu ý

- Hoàn thành **tất cả bài học và bài tập** trước (khoá tuần tự)
- Pass bài thi → đủ điều kiện **chứng nhận khoá Deal** (nếu admin đã cấu hình huy chương)
$md$,
  'https://images.unsplash.com/photo-1606326608606-aa0b62935f2b?w=1200&q=80',
  5, ARRAY['deal','final-exam','certification'], true, 13, true, now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, content_md = EXCLUDED.content_md,
  cover_image_url = EXCLUDED.cover_image_url, duration_minutes = EXCLUDED.duration_minutes,
  tags = EXCLUDED.tags, is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();

COMMIT;

-- ══════════════════════════════════════════════════════════════════════════
-- BÀI TẬP DEAL
-- ══════════════════════════════════════════════════════════════════════════
BEGIN;

-- Ex 01 Quiz L1 — Khái niệm Deal (case-based)
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000002-0000-0000-0000-000000000001',
  'b2000002-0000-0000-0000-000000000001',
  'Bài kiểm tra: Khái niệm Deal — Tình huống thực tế',
  '8 câu phân biệt Lead/Deal/Customer trong các tình huống ngành tủ bếp & cửa nhôm.',
  'quiz',
  $j${"items":[
    {"id":"q1","question":"Tình huống: Anh Tuấn nhắn fanpage hỏi báo giá tủ bếp 3.6m chữ L, sau 2 cuộc gọi tư vấn đã đồng ý mẫu nhôm Xingfa, giá 68 triệu, hẹn ký HĐ thứ 5 nhưng CHƯA chuyển khoản cọc. Đây là?","type":"single","options":[
       "Vẫn là Lead vì chưa thanh toán",
       "Là Deal — đã thống nhất sản phẩm, giá, sẵn sàng ký HĐ",
       "Là Khách hàng — có thể chuyển sang xưởng SX",
       "Phải tạo bản ghi mới hoàn toàn vì chuyển giai đoạn"
     ],"correct":[1]},
    {"id":"q2","question":"Tình huống: Chị Hoa vừa điền form website hỏi giá cửa nhôm Xingfa 12 cánh, chưa nói chuyện với nhân viên. Đây là?","type":"single","options":[
       "Lead — mới tiếp xúc, chưa cam kết",
       "Deal — đã có nhu cầu cụ thể",
       "Customer — đã có hồ sơ trong hệ thống",
       "Bỏ qua không tạo bản ghi"
     ],"correct":[0]},
    {"id":"q3","question":"Tình huống: Anh Bình đã ký HĐ tủ bếp 95 triệu, chuyển khoản cọc 50% từ tuần trước, đang chờ xưởng giao. Đây là?","type":"single","options":[
       "Vẫn là Deal cho đến khi giao xong",
       "Là Customer — đã có quan hệ mua bán chính thức (Deal vẫn lưu trong CRM, KH có hồ sơ Customer)",
       "Là Lead vì chưa lắp đặt xong",
       "Cần xoá Lead/Deal để chỉ còn Customer"
     ],"correct":[1]},
    {"id":"q4","question":"Sau khi chuyển Lead → Deal, mã định danh hệ thống xử lý thế nào?","type":"single","options":[
       "Sinh mã DEAL-XXX hoàn toàn mới, mã LEAD-XXX bị xoá",
       "Giữ nguyên mã LEAD-XXX, hệ thống tự nhận đây là Deal khi mở chi tiết",
       "Tạo bản ghi clone với mã mới, bản gốc Lead vẫn tồn tại song song",
       "Mã chỉ hiển thị cho admin, người dùng thường không thấy"
     ],"correct":[1]},
    {"id":"q5","question":"Một Deal có thể được phụ trách bởi bao nhiêu người ở vai trò 'phụ trách CHÍNH' (chịu KPI)?","type":"single","options":["Toàn phòng cùng phụ trách","Đúng 1 người","2-3 người luân phiên","Không cần phụ trách chính"],"correct":[1]},
    {"id":"q6","question":"Phát biểu nào ĐÚNG về vai trò 'chủ sở hữu Deal' (deal owner)? (chọn nhiều)","type":"multiple","options":[
       "Thường là trưởng nhóm / quản lý phụ trách giám sát",
       "Có thể khác với người phụ trách chính",
       "Là khách hàng cuối — quyết định mua",
       "Có thể can thiệp/hỗ trợ khi sale phụ trách nghỉ phép"
     ],"correct":[0,1,3]},
    {"id":"q7","question":"Vì sao Lead → Deal KHÔNG phải là 'chuyển trạng thái' đơn thuần mà là quyết định chiến lược? (chọn nhiều)","type":"multiple","options":[
       "Pipeline Deal có quy định khác (gate, nhiệm vụ tự động, KPI riêng)",
       "Không có nút Hoàn tác chuyển ngược",
       "Tài liệu, lịch sử Lead được sao chép sang — sai sót về spec sẽ kéo theo SX",
       "Hệ thống tự động ký HĐ thay sale"
     ],"correct":[0,1,2]},
    {"id":"q8","question":"Khi Deal đang chạy mà KH yêu cầu thay đổi phạm vi lớn (ví dụ: đổi từ tủ bếp 3.6m sang 5.2m + thêm cửa nhôm), nguyên tắc xử lý đúng là?","type":"single","options":[
       "Xoá Deal cũ, tạo Lead mới hoàn toàn",
       "Giữ Deal, cập nhật lại scope + giá trị ước tính, ghi nhận hoạt động và đính kèm BG mới",
       "Tạo Deal thứ 2 với cùng KH, không cần ghi chú Deal cũ",
       "Không làm gì, đợi KH ký HĐ rồi mới sửa"
     ],"correct":[1]}
  ]}$j$::jsonb,
  80, 2, 1
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, instructions=EXCLUDED.instructions, questions=EXCLUDED.questions, passing_score=EXCLUDED.passing_score, max_attempts=EXCLUDED.max_attempts, updated_at=now();

-- Ex 02 Quiz L2 — Pipeline Deal (đa pipeline, gate)
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000002-0000-0000-0000-000000000002',
  'b2000002-0000-0000-0000-000000000002',
  'Bài kiểm tra: Pipeline Deal — Đa pipeline & gate',
  '8 câu về cấu hình pipeline, cờ is_won/is_lost, ánh xạ pipeline thực tế của công ty.',
  'quiz',
  $j${"items":[
    {"id":"q1","question":"Phát biểu nào ĐÚNG về pipeline Deal trong hệ thống? (chọn nhiều)","type":"multiple","options":[
       "Mỗi công ty có thể tạo nhiều pipeline khác nhau (B2B, showroom, dự án thầu …)",
       "Số giai đoạn và tên cột do admin công ty cấu hình, không cố định",
       "Pipeline mẫu 6 giai đoạn trong khoá học là tượng trưng để học nguyên lý",
       "Mọi công ty bắt buộc dùng đúng 6 cột giống hệt nhau"
     ],"correct":[0,1,2]},
    {"id":"q2","question":"Khi xác định 'cột Thắng' trong pipeline, hệ thống dựa vào?","type":"single","options":[
       "Tên cột phải là 'Thắng'",
       "Cờ is_won = true (cột nào có cờ này là cột Thắng, dù tên bất kỳ)",
       "Cột cuối cùng theo order_index",
       "Người phụ trách quyết định"
     ],"correct":[1]},
    {"id":"q3","question":"Bạn vào công ty mới, Bảng Deal hiển thị 8 cột thay vì 6. Cách xử lý đúng?","type":"single","options":[
       "Báo lỗi với IT vì khoá học dạy 6 cột",
       "Xác nhận với trưởng nhóm/admin cấu hình pipeline thực tế và ánh xạ sang 6 giai đoạn mẫu",
       "Tự ẩn 2 cột không quen",
       "Không dùng pipeline mới, dùng Excel"
     ],"correct":[1]},
    {"id":"q4","question":"Khi kéo Deal sang giai đoạn mới mà bị chặn bằng popup 'Thiếu tài liệu bắt buộc', nguyên nhân thường là?","type":"single","options":[
       "Stage gate được bật — yêu cầu file bắt buộc trước khi chuyển cột",
       "Lỗi mạng",
       "Người dùng không có quyền kéo thẻ",
       "Hệ thống đang bảo trì"
     ],"correct":[0]},
    {"id":"q5","question":"Khi nào nên cập nhật giá trị ước tính (estimated value) của Deal? (chọn nhiều)","type":"multiple","options":[
       "Khi chốt giá cuối với KH",
       "Khi KH yêu cầu thay đổi phạm vi (thêm/bớt cửa, đổi mặt đá)",
       "Khi đàm phán giảm/tăng giá",
       "Mỗi tuần làm tròn một lần để báo cáo đẹp"
     ],"correct":[0,1,2]},
    {"id":"q6","question":"Một Deal cửa nhôm bị treo ở cột 'Đàm phán' suốt 35 ngày, KH không phản hồi. Hành động đúng theo quy trình?","type":"single","options":[
       "Cứ để đó, có thể KH sẽ quay lại",
       "Liên hệ lần cuối, nếu không có phản hồi rõ ràng thì chuyển 'Thua' với lý do cụ thể",
       "Tự đổi sang 'Ký hợp đồng' để báo cáo đẹp",
       "Xoá Deal khỏi hệ thống"
     ],"correct":[1]},
    {"id":"q7","question":"Chế độ xem nào KHÔNG có trên CRM Deal?","type":"single","options":["Kanban","Danh sách","Deadline","Bản đồ vệ tinh 3D"],"correct":[3]},
    {"id":"q8","question":"Trong pipeline mẫu (Deal mới → Báo giá → Đàm phán → Ký HĐ → Thắng/Thua), thứ tự nào ĐÚNG khi KH 'muốn nhưng đang chờ duyệt ngân sách'?","type":"single","options":[
       "Để ở Deal mới đến khi có quyết định",
       "Đẩy thẳng sang Ký HĐ để giữ chỗ",
       "Đặt ở Đàm phán — đã đàm phán giá nhưng chưa quyết định cuối",
       "Chuyển Thua tạm thời, có gì tạo Deal mới"
     ],"correct":[2]}
  ]}$j$::jsonb,
  80, 2, 1
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, instructions=EXCLUDED.instructions, questions=EXCLUDED.questions, passing_score=EXCLUDED.passing_score, max_attempts=EXCLUDED.max_attempts, updated_at=now();

-- Ex 03 Quiz L3 — Báo giá Deal (case scenarios)
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000002-0000-0000-0000-000000000003',
  'b2000002-0000-0000-0000-000000000003',
  'Bài kiểm tra: Báo giá Deal — Tình huống',
  '7 câu về quy trình báo giá ngành tủ bếp/cửa nhôm và minh chứng trên CRM.',
  'quiz',
  $j${"items":[
    {"id":"q1","question":"Trong 24 giờ đầu khi Deal vào cột 'Deal mới', những việc BẮT BUỘC làm là? (chọn nhiều)","type":"multiple","options":[
       "Kiểm tra lại 6 thông tin bắt buộc kế thừa từ Lead",
       "Xác nhận giá trị ước tính trên thẻ Deal",
       "Liên hệ KH xác nhận lại phạm vi (kích thước, mẫu nhôm, phụ kiện)",
       "Xoá Customer cũ để tạo lại từ đầu"
     ],"correct":[0,1,2]},
    {"id":"q2","question":"Tình huống: Sale gọi điện thông báo giá mới cho KH (giảm 5%) qua điện thoại, KH đồng ý nhưng sale không log gì trên CRM. 2 tuần sau KH đòi giá ban đầu. Hệ quả?","type":"single","options":[
       "Trưởng nhóm có thể bảo vệ sale vì đã có chứng cứ",
       "Không có log → không chứng minh được — sale chịu rủi ro tranh chấp/giảm KPI",
       "KH luôn đúng dù có log hay không",
       "Hệ thống tự ghi cuộc gọi"
     ],"correct":[1]},
    {"id":"q3","question":"Báo giá đã gửi cho KH cần được lưu ở đâu để làm minh chứng?","type":"single","options":[
       "Máy cá nhân của sale",
       "Tab Tài liệu của Deal, kèm loại 'Báo giá' và ghi chú ngày/kênh gửi",
       "Nhóm chat Zalo nội bộ",
       "Email cá nhân — không cần đẩy lên CRM"
     ],"correct":[1]},
    {"id":"q4","question":"Khi nào chuyển Deal sang cột 'Báo giá'?","type":"single","options":[
       "Vừa tạo Deal là chuyển luôn",
       "Đã gửi báo giá / bản vẽ và ghi nhận hoạt động trên Deal",
       "Khi KH gọi lần đầu",
       "Chỉ khi KH ký HĐ"
     ],"correct":[1]},
    {"id":"q5","question":"Mẫu ghi chú 'Đã gửi BG tủ bếp 72tr + bản vẽ 3D qua Zalo 09/05. Hẹn phản hồi 12/05.' đạt yêu cầu vì? (chọn nhiều)","type":"multiple","options":[
       "Có ngày gửi cụ thể",
       "Có kênh gửi",
       "Có cam kết thời gian phản hồi",
       "Có emoji trang trí"
     ],"correct":[0,1,2]},
    {"id":"q6","question":"Để Deal mới quá 3 ngày không xử lý sẽ gây?","type":"single","options":[
       "Không vấn đề gì",
       "Cảnh báo SLA, có thể trừ KPI và bị trưởng nhóm can thiệp",
       "Hệ thống tự gửi BG thay sale",
       "Tự chuyển Thắng"
     ],"correct":[1]},
    {"id":"q7","question":"KH yêu cầu báo giá 2 phương án (tủ bếp 3.6m và 4.2m). Cách xử lý đúng trên CRM?","type":"single","options":[
       "Tạo 2 Deal riêng để báo cáo gấp đôi",
       "Lưu cả 2 phương án trong tab Tài liệu, ghi chú rõ KH đang cân nhắc — KH chốt phương án nào thì cập nhật giá trị ước tính",
       "Chỉ lưu phương án đắt hơn",
       "Bỏ qua phương án thứ 2"
     ],"correct":[1]}
  ]}$j$::jsonb,
  80, 2, 1
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, instructions=EXCLUDED.instructions, questions=EXCLUDED.questions, passing_score=EXCLUDED.passing_score, max_attempts=EXCLUDED.max_attempts, updated_at=now();

-- Ex 04 Quiz L4 — Đàm phán (negotiation case)
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000002-0000-0000-0000-000000000004',
  'b2000002-0000-0000-0000-000000000004',
  'Bài kiểm tra: Đàm phán Deal — Quyết định & ranh giới',
  '7 câu về xử lý đàm phán giá, quy trình duyệt giảm giá và bám đuổi KH ngần ngại.',
  'quiz',
  $j${"items":[
    {"id":"q1","question":"Trước khi chuyển sang 'Ký HĐ' cần đã thống nhất đầy đủ các điểm nào? (chọn nhiều)","type":"multiple","options":[
       "Giá cuối (đã bao gồm/chưa bao gồm phần nào)",
       "Lịch sản xuất, lắp đặt, nghiệm thu",
       "Phương thức thanh toán & tỷ lệ cọc",
       "Phạm vi bảo hành và điều kiện loại trừ"
     ],"correct":[0,1,2,3]},
    {"id":"q2","question":"KH yêu cầu giảm 12% (vượt mức tự duyệt 5% của sale). Hành động đúng?","type":"single","options":[
       "Hứa với KH ngay để chốt",
       "Mở yêu cầu phê duyệt giảm giá trên Deal — chờ trưởng nhóm/giám đốc duyệt trước khi cam kết với KH",
       "Tự ý duyệt vì sợ mất KH",
       "Báo KH 'không bao giờ giảm được'"
     ],"correct":[1]},
    {"id":"q3","question":"KH 'im lặng' sau 3 lần liên hệ. Sale nên?","type":"single","options":[
       "Tiếp tục gọi mỗi ngày 5 lần",
       "Tạo nhiệm vụ follow-up cuối cùng kèm hạn rõ ràng, sau đó nếu không phản hồi thì cân nhắc Thua với lý do 'Mất liên lạc'",
       "Treo Deal vô thời hạn",
       "Tự chuyển Thắng"
     ],"correct":[1]},
    {"id":"q4","question":"Sau mỗi cuộc đàm phán cần?","type":"single","options":[
       "Ghi log hoạt động: nội dung trao đổi, ai quyết định gì, deadline tiếp theo",
       "Chỉ nhắn Zalo nội bộ trong nhóm sale",
       "Không ghi vì sợ đối thủ thấy",
       "Chỉ ghi cuối tuần một lần"
     ],"correct":[0]},
    {"id":"q5","question":"Tình huống: KH tủ bếp đồng ý giá 95tr nhưng đòi thêm 'tặng bộ phụ kiện inox 304' trị giá ~6tr. Cách xử lý chuyên nghiệp?","type":"single","options":[
       "Đồng ý ngay để giữ KH",
       "Từ chối thẳng",
       "Quy đổi yêu cầu thành chiết khấu/quà tặng có giá trị tương đương, kiểm tra biên lợi nhuận và xin duyệt nếu vượt mức tự quyết",
       "Chuyển Deal cho người khác"
     ],"correct":[2]},
    {"id":"q6","question":"Nguyên tắc 'không cam kết miệng vượt thẩm quyền' có ý nghĩa gì? (chọn nhiều)","type":"multiple","options":[
       "Bảo vệ công ty khỏi cam kết không thể thực hiện",
       "Bảo vệ chính sale khỏi tranh chấp với KH",
       "Đảm bảo mọi cam kết đều có chứng từ/ phê duyệt",
       "Chỉ áp dụng cho sale mới"
     ],"correct":[0,1,2]},
    {"id":"q7","question":"Khi đàm phán bế tắc dù đã giảm giá tối đa, đúng nhất là?","type":"single","options":[
       "Tiếp tục giảm giá vô hạn",
       "Đề xuất phương án thay thế (chia kỳ thanh toán, đổi mẫu nhôm rẻ hơn, tách scope)",
       "Đổ lỗi cho KH",
       "Treo Deal và quên"
     ],"correct":[1]}
  ]}$j$::jsonb,
  80, 2, 1
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, instructions=EXCLUDED.instructions, questions=EXCLUDED.questions, passing_score=EXCLUDED.passing_score, max_attempts=EXCLUDED.max_attempts, updated_at=now();

-- Ex 05 Quiz L5 — Ký HĐ & cọc
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000002-0000-0000-0000-000000000005',
  'b2000002-0000-0000-0000-000000000005',
  'Bài kiểm tra: Ký HĐ & cọc — Hồ sơ chuẩn',
  '7 câu về hồ sơ ký HĐ, gắn Customer chính thức và quy trình thu cọc.',
  'quiz',
  $j${"items":[
    {"id":"q1","question":"Hồ sơ tối thiểu gắn vào Deal trước khi kéo Thắng theo quy định? (chọn nhiều)","type":"multiple","options":[
       "HĐ đã ký 2 bên (đủ chữ ký + dấu nếu là pháp nhân)",
       "Chứng từ cọc (ảnh chuyển khoản / phiếu thu)",
       "Bản vẽ chốt cuối cùng + bảng thông số kỹ thuật",
       "Phiếu khảo sát hiện trường (nếu thuộc phạm vi lắp đặt)"
     ],"correct":[0,1,2,3]},
    {"id":"q2","question":"Tình huống: HĐ đã ký nhưng KH chưa chuyển cọc, sale kéo Deal sang Thắng để 'báo cáo trước'. Hậu quả?","type":"single","options":[
       "Không sao, miễn KH ký rồi",
       "Vi phạm quy trình — Deal Thắng nhưng chưa có chứng từ cọc gây sai số liệu doanh thu, có thể bị trừ KPI và phải hoàn nguyên",
       "Hệ thống tự khóa Deal",
       "Trưởng nhóm sẽ ký thay cọc"
     ],"correct":[1]},
    {"id":"q3","question":"Trên Deal, Customer chính thức cần được gắn khi nào?","type":"single","options":[
       "Ngay khi tạo Deal",
       "Trước khi ký HĐ — cần xác minh thông tin pháp lý (CCCD/MST), địa chỉ, người đại diện",
       "Sau khi lắp đặt",
       "Không cần — chỉ cần Lead"
     ],"correct":[1]},
    {"id":"q4","question":"KH yêu cầu chia làm 3 lần thanh toán: cọc 30% + 50% trước SX + 20% nghiệm thu. Phải làm gì trên CRM?","type":"single","options":[
       "Chỉ ghi tổng số tiền",
       "Ghi rõ điều khoản thanh toán trong HĐ + tạo nhiệm vụ theo từng kỳ thanh toán + đính kèm chứng từ mỗi đợt",
       "Đợi KH tự nhắc",
       "Chỉ thu lần đầu rồi bỏ qua"
     ],"correct":[1]},
    {"id":"q5","question":"Cột 'Ký hợp đồng' (chưa Thắng) có nghĩa là?","type":"single","options":[
       "KH đã thanh toán toàn bộ",
       "Đang trong quá trình hoàn thiện HĐ và thu cọc — chưa đủ điều kiện chốt Thắng",
       "Deal đã thua",
       "Đã hoàn tất giao hàng"
     ],"correct":[1]},
    {"id":"q6","question":"Nhiệm vụ 'Thu cọc 50%' đánh dấu hoàn thành cần?","type":"single","options":[
       "Tick xong là được",
       "Ghi chú số tiền thực thu + ngày + đính kèm phiếu thu/biên nhận",
       "Chỉ báo miệng cho kế toán",
       "Không cần ghi chú"
     ],"correct":[1]},
    {"id":"q7","question":"Phát biểu nào ĐÚNG về 'số HĐ' trên Deal?","type":"single","options":[
       "Là số do sale tự bịa cho dễ nhớ",
       "Phải là mã HĐ chính thức theo quy tắc đánh số của công ty, dùng để đối soát với kế toán/SX",
       "Không quan trọng",
       "Hệ thống tự sinh, không cần kiểm tra"
     ],"correct":[1]}
  ]}$j$::jsonb,
  80, 2, 1
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, instructions=EXCLUDED.instructions, questions=EXCLUDED.questions, passing_score=EXCLUDED.passing_score, max_attempts=EXCLUDED.max_attempts, updated_at=now();

-- Ex 06 Checklist L7 — Hoàn thành nhiệm vụ Deal đúng quy định
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000002-0000-0000-0000-000000000006',
  'b2000002-0000-0000-0000-000000000007',
  'Tự cam kết: Hoàn thành nhiệm vụ Deal đúng quy định',
  'Đọc kỹ và cam kết tuân thủ — vi phạm các quy định này có thể bị trừ KPI nghiêm khắc.',
  'checklist',
  $j${"items":[
    {"id":"c1","text":"Tôi cam kết: nhiệm vụ Deal không có ghi chú nội dung sẽ KHÔNG được coi là hoàn thành hợp lệ — kể cả khi đã tick"},
    {"id":"c2","text":"Tôi hiểu nhiệm vụ thuộc nhóm 'cần minh chứng' (thu cọc, gửi BG, ký HĐ, khảo sát) BẮT BUỘC đính kèm file — không có file = không hoàn thành"},
    {"id":"c3","text":"Tôi sẽ đặt tên file theo chuẩn: [Mã Deal]_[Loại tài liệu]_[Ngày] (ví dụ: DEAL-1023_BAOGIA_2026-05-29.pdf) để dễ tra cứu khi cần đối soát"},
    {"id":"c4","text":"Tôi cam kết: KHÔNG giả lập hoàn thành nhiệm vụ (ghi chú đối phó, file rác) — đây là hành vi gian lận quy trình"},
    {"id":"c5","text":"Tôi hiểu việc bỏ qua nhiệm vụ bắt buộc gắn với gate sẽ chặn tiến độ Deal và ảnh hưởng cả team SX/Kế toán"},
    {"id":"c6","text":"Tôi sẽ ghi rõ kết quả (ví dụ: 'KH đã chuyển cọc 30tr, mã GD VCB 9X12') thay vì 'OK' / 'xong' chung chung"},
    {"id":"c7","text":"Tôi biết KPI có thể bị trừ điểm nếu nhiệm vụ trễ hạn không có lý do chính đáng được trưởng nhóm phê duyệt"}
  ]}$j$::jsonb,
  100, 1, 2
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, instructions=EXCLUDED.instructions, questions=EXCLUDED.questions, passing_score=EXCLUDED.passing_score, max_attempts=EXCLUDED.max_attempts, updated_at=now();

-- Ex 07 Quiz L8 — Tài liệu & gate
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000002-0000-0000-0000-000000000007',
  'b2000002-0000-0000-0000-000000000008',
  'Bài kiểm tra: Tài liệu Deal & Stage Gate',
  '7 câu về quản lý tài liệu, kế thừa từ Lead, và xử lý khi gate chặn.',
  'quiz',
  $j${"items":[
    {"id":"q1","question":"Khi Lead chuyển thành Deal, tài liệu Lead xử lý thế nào?","type":"single","options":[
       "Bị xoá để tránh rác",
       "Được sao chép / liên kết sang Deal — vẫn truy cập được lịch sử khảo sát, BG ban đầu",
       "Chỉ admin xem được",
       "Tự động zip lại không mở được"
     ],"correct":[1]},
    {"id":"q2","question":"Stage gate trên pipeline Deal có thể làm gì? (chọn nhiều)","type":"multiple","options":[
       "Chặn kéo thẻ qua cột mới nếu thiếu file bắt buộc",
       "Yêu cầu phê duyệt giảm giá vượt mức tự quyết",
       "Yêu cầu hoàn thành nhiệm vụ bắt buộc trước khi chuyển giai đoạn",
       "Tự xoá Deal"
     ],"correct":[0,1,2]},
    {"id":"q3","question":"Tình huống: Bạn cần chuyển Deal sang Thắng, nhưng popup báo 'Thiếu chứng từ cọc' dù KH đã chuyển khoản. Cách xử lý đúng?","type":"single","options":[
       "Yêu cầu admin tắt gate để mình kéo qua",
       "Chụp/lấy ảnh chuyển khoản từ KH, upload vào tab Tài liệu với loại 'Chứng từ cọc' rồi mới kéo Thắng",
       "Bỏ qua, ghi chú 'KH đã chuyển'",
       "Tạo Deal khác để né"
     ],"correct":[1]},
    {"id":"q4","question":"Trước khi kéo Thắng, danh mục tài liệu cần kiểm tra gồm? (chọn nhiều)","type":"multiple","options":[
       "Bản vẽ chốt + bảng thông số kỹ thuật cuối cùng",
       "HĐ + chứng từ cọc theo quy định",
       "Phiếu khảo sát hiện trường (nếu có lắp đặt)",
       "Ảnh selfie của sale với KH"
     ],"correct":[0,1,2]},
    {"id":"q5","question":"Tab 'Phê duyệt' trên Deal dùng để?","type":"single","options":[
       "Duyệt các ngoại lệ: giảm giá vượt thẩm quyền, tặng kèm vượt định mức, kéo dài tiến độ",
       "Chat với khách hàng",
       "In hoá đơn điện tử",
       "Chỉnh sửa pipeline"
     ],"correct":[0]},
    {"id":"q6","question":"Tình huống: tài liệu trên Deal có 2 phiên bản bản vẽ (v3 và v4) khác nhau, sale upload nhầm. Hậu quả nguy hiểm nhất là?","type":"single","options":[
       "Không vấn đề",
       "Xưởng SX có thể làm theo bản v3 cũ — gây sai sản phẩm, đền bù KH",
       "Hệ thống tự xoá v3",
       "Chỉ làm xấu giao diện"
     ],"correct":[1]},
    {"id":"q7","question":"Quy tắc phiên bản tài liệu chuẩn nhất là?","type":"single","options":[
       "Để tên giống nhau, ai tải về thì biết",
       "Đánh phiên bản rõ trong tên (v1/v2/...) + đánh dấu file 'chính thức cuối cùng' + ghi chú thay đổi",
       "Chỉ giữ phiên bản đầu",
       "Lưu trên máy cá nhân là đủ"
     ],"correct":[1]}
  ]}$j$::jsonb,
  80, 2, 1
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, instructions=EXCLUDED.instructions, questions=EXCLUDED.questions, passing_score=EXCLUDED.passing_score, max_attempts=EXCLUDED.max_attempts, updated_at=now();

-- Ex 08 Quiz L9 — Deal Thắng → Tạo Dự án
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000002-0000-0000-0000-000000000008',
  'b2000002-0000-0000-0000-000000000009',
  'Bài kiểm tra: Deal Thắng → Tạo dự án',
  '7 câu về luồng tạo dự án từ Deal và xử lý sai sót.',
  'quiz',
  $j${"items":[
    {"id":"q1","question":"Khi kéo Deal sang cột Thắng, hệ thống thường?","type":"single","options":[
       "Tự xoá Deal",
       "Mở modal/wizard tạo dự án — kế thừa thông tin từ Deal",
       "Gửi SMS marketing hàng loạt",
       "Khoá CRM cho đến cuối ngày"
     ],"correct":[1]},
    {"id":"q2","question":"Trong modal tạo dự án thường cần chọn? (chọn nhiều)","type":"multiple","options":[
       "Luồng / xưởng phụ trách (xưởng nhôm A, xưởng tủ bếp B…)",
       "Bộ nhiệm vụ mẫu (template) phù hợp loại sản phẩm",
       "Thông tin công trình (địa chỉ, thời gian, người liên hệ)",
       "Màu giao diện CRM"
     ],"correct":[0,1,2]},
    {"id":"q3","question":"Sau khi tạo dự án thành công, Deal sẽ?","type":"single","options":[
       "Mất hết lịch sử",
       "Có project_id liên kết — vẫn truy cập 2 chiều giữa Deal và dự án sản xuất",
       "Tự chuyển lại Lead",
       "Bị khoá vĩnh viễn"
     ],"correct":[1]},
    {"id":"q4","question":"Tình huống: Sale chọn nhầm template tủ bếp cho Deal cửa nhôm. Hậu quả & cách xử lý?","type":"single","options":[
       "Bỏ qua, xưởng tự biết",
       "Xưởng nhận bộ nhiệm vụ sai → sai luồng SX → liên hệ admin/PM để hỗ trợ chuyển template hoặc tạo lại dự án đúng + ghi nhận lỗi",
       "Tự xoá dự án trên DB",
       "Đổ lỗi cho hệ thống"
     ],"correct":[1]},
    {"id":"q5","question":"Trước khi xác nhận tạo dự án, sale cần check lại điều gì? (chọn nhiều)","type":"multiple","options":[
       "Bản vẽ và spec đã đúng phiên bản chốt",
       "Ngày bắt đầu/dự kiến hoàn thành đã thống nhất với KH",
       "Người phụ trách phía xưởng đã được phân công",
       "Cập nhật avatar của sale"
     ],"correct":[0,1,2]},
    {"id":"q6","question":"Sai sót khi tạo dự án có thể gây hệ luỵ tới các bộ phận nào? (chọn nhiều)","type":"multiple","options":[
       "Sản xuất (làm sai sản phẩm)",
       "Kế toán (đối soát doanh thu sai)",
       "Lắp đặt (sai địa chỉ/lịch)",
       "Chăm sóc khách hàng (báo cáo bảo hành sai)"
     ],"correct":[0,1,2,3]},
    {"id":"q7","question":"Sau khi dự án được tạo, vai trò của sale Deal là?","type":"single","options":[
       "Hết trách nhiệm — chuyển hoàn toàn cho xưởng",
       "Vẫn là điểm liên lạc chính với KH, phối hợp PM/xưởng đến nghiệm thu",
       "Ngưng truy cập Deal",
       "Tự chuyển sang Lead khác"
     ],"correct":[1]}
  ]}$j$::jsonb,
  80, 2, 1
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, instructions=EXCLUDED.instructions, questions=EXCLUDED.questions, passing_score=EXCLUDED.passing_score, max_attempts=EXCLUDED.max_attempts, updated_at=now();

-- Ex 09 Quiz L10 — Bàn giao sản xuất
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000002-0000-0000-0000-000000000009',
  'b2000002-0000-0000-0000-000000000010',
  'Bài kiểm tra: Bàn giao sản xuất — Trách nhiệm chuyển giao',
  '7 câu về bộ hồ sơ bàn giao xưởng và trách nhiệm sale sau bàn giao.',
  'quiz',
  $j${"items":[
    {"id":"q1","question":"Mục đích chính của bước 'Bàn giao sản xuất' là?","type":"single","options":[
       "Sale ngừng làm việc với Deal",
       "Xác nhận xưởng/PM đã nhận đủ hồ sơ + thông tin để bắt đầu sản xuất đúng yêu cầu KH",
       "Xoá Customer khỏi CRM",
       "Đóng Deal khỏi báo cáo"
     ],"correct":[1]},
    {"id":"q2","question":"Bộ hồ sơ bàn giao tủ bếp/cửa nhôm tối thiểu gồm? (chọn nhiều)","type":"multiple","options":[
       "Bản vẽ chốt cuối cùng (đã ký xác nhận với KH)",
       "Bảng thông số kỹ thuật (vật liệu, màu, phụ kiện)",
       "Địa chỉ lắp đặt + người liên hệ + thời gian khung",
       "Phiếu khảo sát hiện trường (kích thước thực tế)"
     ],"correct":[0,1,2,3]},
    {"id":"q3","question":"Tình huống: Sale bàn giao thiếu phụ kiện tay nắm 'mạ vàng' KH yêu cầu (đã ghi trong báo giá nhưng chưa kèm vào bảng spec). Hậu quả?","type":"single","options":[
       "Không sao",
       "Xưởng làm theo spec → giao thiếu → KH khiếu nại, có thể phải làm lại + chịu phí",
       "Hệ thống tự bổ sung",
       "KH sẽ tự mua bù"
     ],"correct":[1]},
    {"id":"q4","question":"Khi xưởng phát hiện thông tin bàn giao mâu thuẫn (ví dụ: bản vẽ ghi 3.6m nhưng phiếu khảo sát ghi 3.8m), quy trình đúng là?","type":"single","options":[
       "Xưởng tự chọn 1 con số làm theo",
       "Sale phải xác minh lại với KH ngay lập tức và cập nhật phiên bản chốt + thông báo xưởng — không sản xuất khi chưa thống nhất",
       "Bỏ qua mâu thuẫn",
       "Đổi xưởng khác"
     ],"correct":[1]},
    {"id":"q5","question":"Sau khi đã bàn giao chính thức, vai trò của sale là?","type":"single","options":[
       "Không liên quan nữa",
       "Đầu mối liên lạc với KH, theo dõi tiến độ SX, lắp đặt, nghiệm thu, hỗ trợ thanh toán đợt cuối",
       "Tự khoá tài khoản CRM",
       "Tự chuyển Deal sang Thua"
     ],"correct":[1]},
    {"id":"q6","question":"Sale CHƯA được ghi nhận hoàn thành nhiệm vụ 'Bàn giao SX' khi?","type":"single","options":[
       "Khi xưởng đã ký nhận hồ sơ + checklist được phê duyệt",
       "Khi mới gửi email cho xưởng nhưng chưa có xác nhận / chưa đầy đủ tài liệu",
       "Khi KH đã nghiệm thu",
       "Khi đã thu nốt tiền"
     ],"correct":[1]},
    {"id":"q7","question":"Cập nhật tiến độ SX trên Deal/Dự án giúp ích gì cho sale? (chọn nhiều)","type":"multiple","options":[
       "Phản hồi KH chính xác khi bị hỏi",
       "Phát hiện sớm trễ tiến độ để xử lý",
       "Phối hợp lịch lắp đặt",
       "Tăng KPI ngẫu nhiên không cần làm gì"
     ],"correct":[0,1,2]}
  ]}$j$::jsonb,
  80, 2, 1
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, instructions=EXCLUDED.instructions, questions=EXCLUDED.questions, passing_score=EXCLUDED.passing_score, max_attempts=EXCLUDED.max_attempts, updated_at=now();

-- Ex 10 Quiz L11 — Deal Thua (loss reasons)
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000002-0000-0000-0000-000000000010',
  'b2000002-0000-0000-0000-000000000011',
  'Bài kiểm tra: Deal Thua — Phân tích & cải thiện',
  '6 câu về phân loại lý do thua, chống bóp méo dữ liệu và bài học rút ra.',
  'quiz',
  $j${"items":[
    {"id":"q1","question":"Khi chuyển Deal sang Thua, BẮT BUỘC cần?","type":"single","options":[
       "Lý do thua được phân loại từ danh mục chuẩn + ghi chú tình huống cụ thể",
       "Không cần gì — chỉ cần kéo cột",
       "Phải xoá Customer",
       "Phải gọi điện báo admin"
     ],"correct":[0]},
    {"id":"q2","question":"Phát biểu nào ĐÚNG về Deal đã chuyển Thua?","type":"single","options":[
       "Bị xoá vĩnh viễn khỏi DB",
       "Vẫn lưu giữ lịch sử trên hệ thống để phục vụ báo cáo, phân tích chiến lược",
       "Tự ẩn với mọi người trong công ty",
       "Tự chuyển ngược về Lead"
     ],"correct":[1]},
    {"id":"q3","question":"Nhóm các lý do thua nào được coi là 'có thể cải thiện ở mức công ty'? (chọn nhiều)","type":"multiple","options":[
       "Giá cao hơn đối thủ (chiến lược giá)",
       "Tiến độ giao hàng không phù hợp (năng lực SX)",
       "Sale phản hồi chậm (kỷ luật quy trình)",
       "KH chuyển nhà sang nước khác"
     ],"correct":[0,1,2]},
    {"id":"q4","question":"Hành vi nào sau đây là GIAN LẬN DỮ LIỆU và bị nghiêm cấm?","type":"single","options":[
       "Ghi lý do thua chi tiết khi mất KH",
       "Bóp méo lý do (ví dụ: ghi 'KH đổi ý' thay vì 'sale báo giá sai → KH huỷ') để tránh trách nhiệm",
       "Liên hệ KH lần cuối trước khi chuyển Thua",
       "Phân loại lý do thua theo danh mục chuẩn"
     ],"correct":[1]},
    {"id":"q5","question":"Với KH đã thua vì 'thời điểm chưa phù hợp', cách xử lý chuyên nghiệp về sau?","type":"single","options":[
       "Xoá khỏi danh sách và quên",
       "Đặt nhiệm vụ chăm sóc lại sau 3-6 tháng (re-engage), giữ Customer trong DB",
       "Spam KH mỗi tuần",
       "Báo công an"
     ],"correct":[1]},
    {"id":"q6","question":"Báo cáo phân tích lý do thua hàng tháng giúp công ty làm gì? (chọn nhiều)","type":"multiple","options":[
       "Phát hiện vấn đề lặp lại (giá, chất lượng, dịch vụ)",
       "Điều chỉnh chiến lược sản phẩm/giá",
       "Đào tạo lại đội sale ở khâu yếu",
       "Tăng số Lead bằng cách giả lập"
     ],"correct":[0,1,2]}
  ]}$j$::jsonb,
  80, 2, 1
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, instructions=EXCLUDED.instructions, questions=EXCLUDED.questions, passing_score=EXCLUDED.passing_score, max_attempts=EXCLUDED.max_attempts, updated_at=now();

-- Ex 11 Quiz L12 — Điểm Deal & đánh giá chéo
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000002-0000-0000-0000-000000000011',
  'b2000002-0000-0000-0000-000000000012',
  'Bài kiểm tra: Điểm Deal & đánh giá chéo',
  '7 câu về cơ chế chấm điểm chéo giữa các module và sao khách hàng.',
  'quiz',
  $j${"items":[
    {"id":"q1","question":"Điểm chéo (cross-module score) là?","type":"single","options":[
       "Module này chấm điểm module kia trên cùng 1 Deal (ví dụ: SX chấm Sale, Kế toán chấm SX)",
       "KH tự chấm tất cả",
       "Sale tự chấm chính mình",
       "Random theo hệ thống"
     ],"correct":[0]},
    {"id":"q2","question":"Sao khách hàng (customer rating) thường được dùng để?","type":"single","options":[
       "Ghi nhận phản hồi của KH sau lắp đặt/nghiệm thu",
       "Thay thế HĐ pháp lý",
       "Tự xoá Deal",
       "Tính thuế"
     ],"correct":[0]},
    {"id":"q3","question":"Sale có thể tác động tích cực đến điểm chéo bằng cách? (chọn nhiều)","type":"multiple","options":[
       "Bàn giao đầy đủ hồ sơ + spec đúng cho xưởng",
       "Phối hợp tốt với kế toán cho việc thanh toán đúng tiến độ",
       "Phản hồi nhanh khi PM/SX hỏi thông tin",
       "Tặng quà cá nhân cho người chấm điểm"
     ],"correct":[0,1,2]},
    {"id":"q4","question":"Điểm chéo thấp lặp lại nhiều lần với 1 sale có thể dẫn tới?","type":"single","options":[
       "Không ảnh hưởng gì",
       "Cảnh báo về kỷ luật quy trình → đào tạo lại / xem xét KPI",
       "Tự động sa thải tức thì",
       "Tăng lương"
     ],"correct":[1]},
    {"id":"q5","question":"Khách hàng đánh giá 1 sao kèm phản ánh 'sản phẩm bị xước'. Bộ phận nào cần xem xét điểm chéo? (chọn nhiều)","type":"multiple","options":[
       "Sản xuất (chất lượng gia công)",
       "Lắp đặt (gây xước trong khi thi công)",
       "Kiểm tra trước khi xuất xưởng (QC)",
       "Marketing"
     ],"correct":[0,1,2]},
    {"id":"q6","question":"Phát biểu nào SAI về điểm chéo?","type":"single","options":[
       "Là công cụ phản ánh chất lượng phối hợp liên phòng ban",
       "Có thể ảnh hưởng đến đánh giá / thưởng theo quy chế",
       "Có thể bị tự thao túng để bản thân được điểm cao mà không bị phát hiện",
       "Cần được sử dụng công bằng và minh bạch"
     ],"correct":[2]},
    {"id":"q7","question":"Mục đích cuối cùng của hệ thống điểm chéo + sao KH là?","type":"single","options":[
       "Phạt nhân viên",
       "Cải thiện chất lượng dịch vụ chung và xây dựng văn hoá phối hợp giữa các phòng ban",
       "Tạo áp lực cho sale",
       "Để admin có thêm việc"
     ],"correct":[1]}
  ]}$j$::jsonb,
  80, 2, 1
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, instructions=EXCLUDED.instructions, questions=EXCLUDED.questions, passing_score=EXCLUDED.passing_score, max_attempts=EXCLUDED.max_attempts, updated_at=now();

-- Ex 12 Quiz L6 — Nhiệm vụ trên Deal
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000002-0000-0000-0000-000000000012',
  'b2000002-0000-0000-0000-000000000006',
  'Bài kiểm tra: Nhiệm vụ trên Deal — Tự động & thủ công',
  '7 câu về cơ chế nhiệm vụ tự động, nhiệm vụ chặn gate và quản lý SLA.',
  'quiz',
  $j${"items":[
    {"id":"q1","question":"Nhiệm vụ Deal được hiển thị tập trung ở đâu?","type":"single","options":[
       "Tab 'Nhiệm vụ' trong chi tiết Deal — kèm trạng thái, người phụ trách, hạn",
       "Chỉ trong email cá nhân",
       "Tab Kế toán",
       "Không có chỗ nào"
     ],"correct":[0]},
    {"id":"q2","question":"Nhiệm vụ tự động (auto-task) thường được sinh ra khi? (chọn nhiều)","type":"multiple","options":[
       "Chuyển Lead → Deal",
       "Chuyển giai đoạn (vd: vào Báo giá → tạo task 'Theo dõi phản hồi BG sau 48h')",
       "Khi giá trị Deal vượt ngưỡng (cần phê duyệt thêm)",
       "Khi sale đăng nhập"
     ],"correct":[0,1,2]},
    {"id":"q3","question":"Nhiệm vụ 'bắt buộc + chưa hoàn thành' liên quan tới gate sẽ?","type":"single","options":[
       "Chặn việc kéo Deal sang giai đoạn tiếp theo cho đến khi hoàn thành đúng quy định",
       "Tự Thắng",
       "Xoá Deal",
       "Khoá CRM"
     ],"correct":[0]},
    {"id":"q4","question":"Khi tạo nhiệm vụ thủ công cho Deal, ít nhất phải có?","type":"single","options":[
       "Tiêu đề + người phụ trách + hạn xử lý + (nên có) mô tả ngắn gọn",
       "Chỉ tiêu đề là đủ",
       "Chỉ file đính kèm",
       "Không cần gì"
     ],"correct":[0]},
    {"id":"q5","question":"Tình huống: Sale có 6 nhiệm vụ Deal trễ hạn 5 ngày. Hậu quả?","type":"single","options":[
       "Không có gì",
       "Có thể bị cảnh báo SLA, trừ KPI và bị quản lý nhắc nhở; ảnh hưởng tiến độ Deal",
       "Hệ thống tự xoá nhiệm vụ",
       "KH bị phạt"
     ],"correct":[1]},
    {"id":"q6","question":"Khi nhiệm vụ 'chuyển KH lên kỹ thuật khảo sát' không thể thực hiện đúng hạn vì lý do khách quan, sale phải?","type":"single","options":[
       "Im lặng để tránh bị phát hiện",
       "Cập nhật trạng thái + ghi rõ lý do + tạo nhiệm vụ tiếp nối với hạn mới + báo người phụ trách",
       "Tự xoá nhiệm vụ",
       "Đổi nhiệm vụ sang người khác mà không thông báo"
     ],"correct":[1]},
    {"id":"q7","question":"Nguyên tắc 'không hoàn thành đối phó' với nhiệm vụ Deal yêu cầu? (chọn nhiều)","type":"multiple","options":[
       "Ghi chú thực chất kết quả công việc",
       "Đính kèm minh chứng nếu có",
       "Không tick xong khi chưa thực sự làm",
       "Để trống ghi chú là cách tiết kiệm thời gian"
     ],"correct":[0,1,2]}
  ]}$j$::jsonb,
  80, 2, 1
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, instructions=EXCLUDED.instructions, questions=EXCLUDED.questions, passing_score=EXCLUDED.passing_score, max_attempts=EXCLUDED.max_attempts, updated_at=now();

-- Ex 13 FINAL EXAM
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, time_limit_minutes, sort_order,
  image_url
) VALUES (
  'c2000002-0000-0000-0000-000000000013',
  'b2000002-0000-0000-0000-000000000013',
  '🏆 BÀI THI TỔNG KẾT — Deal Master Certification',
  '20 câu tình huống tổng hợp Bài 1–12. Đạt 90%. 30 phút. Tối đa 2 lần. Không tra cứu tài liệu.',
  'quiz',
  $j${"items":[
    {"id":"q1","question":"Tình huống: Chị Lan đã đồng ý mua tủ bếp 72tr, hẹn ký HĐ tuần sau, CHƯA cọc. Sale nên phân loại?","type":"single","options":[
       "Lead — chưa cam kết",
       "Deal — đã thống nhất mua, đang trong quy trình chốt HĐ",
       "Customer — đã có quan hệ mua bán",
       "Không cần tạo bản ghi"
     ],"correct":[1]},
    {"id":"q2","question":"Pipeline 6 giai đoạn trong khoá học có ý nghĩa gì?","type":"single","options":[
       "Quy định bắt buộc mọi công ty phải dùng giống hệt",
       "Pipeline mẫu / tượng trưng — công ty có thể cấu hình pipeline riêng với số giai đoạn và tên cột khác",
       "Do nhân viên tự đặt",
       "Chỉ dùng cho Lead"
     ],"correct":[1]},
    {"id":"q3","question":"Cột 'Thắng' trên pipeline được xác định bằng?","type":"single","options":[
       "Tên cột phải là 'Thắng'",
       "Cờ is_won = true",
       "Cột cuối cùng",
       "Người phụ trách quyết định"
     ],"correct":[1]},
    {"id":"q4","question":"Tình huống: Sale gửi BG 85tr qua Zalo, KH đồng ý nhưng sale không log trên CRM. 2 tuần sau KH đòi giá 78tr. Hệ quả?","type":"single","options":[
       "Sale được bảo vệ vì đã gọi điện",
       "Không có log → không chứng minh được cam kết → sale chịu rủi ro tranh chấp/KPI",
       "KH luôn sai",
       "Hệ thống tự ghi"
     ],"correct":[1]},
    {"id":"q5","question":"Trước khi chuyển sang 'Ký HĐ' cần đã thống nhất? (chọn nhiều)","type":"multiple","options":[
       "Giá cuối và phạm vi bảo hành",
       "Lịch SX/lắp đặt",
       "Phương thức thanh toán & tỷ lệ cọc",
       "Màu sơn xe của sale"
     ],"correct":[0,1,2]},
    {"id":"q6","question":"KH yêu cầu giảm 15% (vượt mức tự duyệt 5%). Hành động đúng?","type":"single","options":[
       "Hứa ngay để giữ KH",
       "Mở yêu cầu phê duyệt trên Deal — chờ duyệt trước khi cam kết với KH",
       "Tự ý duyệt",
       "Từ chối thẳng"
     ],"correct":[1]},
    {"id":"q7","question":"Nhiệm vụ 'Thu cọc 50%' được đánh dấu hoàn thành khi?","type":"single","options":[
       "Tick xong",
       "Ghi chú số tiền + ngày + đính kèm phiếu thu/chứng từ chuyển khoản",
       "Báo miệng cho kế toán",
       "KH nói 'đã chuyển' qua điện thoại"
     ],"correct":[1]},
    {"id":"q8","question":"Tình huống: HĐ đã ký, chưa có chứng từ cọc, sale kéo Deal sang Thắng. Hậu quả?","type":"single","options":[
       "Không sao",
       "Vi phạm quy trình — sai số liệu doanh thu, có thể bị trừ KPI",
       "Hệ thống tự khóa",
       "Trưởng nhóm ký thay"
     ],"correct":[1]},
    {"id":"q9","question":"Kéo Deal sang Thắng, hệ thống mở modal tạo dự án. Sale chọn nhầm template tủ bếp cho Deal cửa nhôm. Xử lý?","type":"single","options":[
       "Bỏ qua",
       "Liên hệ admin/PM để chuyển template hoặc tạo lại dự án đúng + ghi nhận lỗi",
       "Tự xoá dự án trên DB",
       "Đổ lỗi hệ thống"
     ],"correct":[1]},
    {"id":"q10","question":"Bàn giao SX thiếu spec phụ kiện đã ghi trong BG. Hậu quả nguy hiểm nhất?","type":"single","options":[
       "Không vấn đề",
       "Xưởng làm thiếu → KH khiếu nại → làm lại + chi phí",
       "Hệ thống tự bổ sung",
       "KH tự mua bù"
     ],"correct":[1]},
    {"id":"q11","question":"Bản vẽ Deal có v3 và v4 khác nhau, sale upload nhầm. Rủi ro lớn nhất?","type":"single","options":[
       "Giao diện xấu",
       "Xưởng SX theo bản cũ → sai sản phẩm → đền bù KH",
       "Hệ thống tự xoá v3",
       "Không ảnh hưởng"
     ],"correct":[1]},
    {"id":"q12","question":"Deal treo ở Đàm phán 40 ngày, KH không phản hồi sau 3 lần liên hệ. Hành động đúng?","type":"single","options":[
       "Để mãi",
       "Follow-up cuối cùng có hạn → nếu không phản hồi thì chuyển Thua với lý do 'Mất liên lạc'",
       "Tự chuyển Thắng",
       "Xoá Deal"
     ],"correct":[1]},
    {"id":"q13","question":"Chuyển Deal Thua, hành vi GIAN LẬN DỮ LIỆU là?","type":"single","options":[
       "Ghi lý do chi tiết",
       "Bóp méo lý do để tránh trách nhiệm cá nhân",
       "Liên hệ KH lần cuối",
       "Phân loại theo danh mục chuẩn"
     ],"correct":[1]},
    {"id":"q14","question":"Sau Lead→Deal, mã LEAD-XXX?","type":"single","options":["Đổi sang DEAL-XXX","Giữ nguyên","Xoá","Chỉ admin thấy"],"correct":[1]},
    {"id":"q15","question":"Stage gate có thể? (chọn nhiều)","type":"multiple","options":[
       "Chặn kéo thẻ nếu thiếu file bắt buộc",
       "Yêu cầu phê duyệt giảm giá vượt mức",
       "Yêu cầu hoàn thành nhiệm vụ bắt buộc",
       "Tự xoá Deal"
     ],"correct":[0,1,2]},
    {"id":"q16","question":"Tình huống: Bản vẽ ghi 3.6m, phiếu khảo sát ghi 3.8m. Quy trình đúng?","type":"single","options":[
       "Xưởng tự chọn 1 số",
       "Sale xác minh với KH ngay, cập nhật phiên bản chốt — không SX khi chưa thống nhất",
       "Bỏ qua",
       "Đổi xưởng"
     ],"correct":[1]},
    {"id":"q17","question":"Điểm chéo thấp lặp lại với 1 sale có thể?","type":"single","options":[
       "Không ảnh hưởng",
       "Cảnh báo kỷ luật quy trình → đào tạo lại / xem xét KPI",
       "Tự động sa thải",
       "Tăng lương"
     ],"correct":[1]},
    {"id":"q18","question":"Sau bàn giao SX chính thức, vai trò sale là?","type":"single","options":[
       "Hết trách nhiệm",
       "Đầu mối KH, theo dõi SX/lắp/nghiệm thu đến khi hoàn tất",
       "Khoá CRM",
       "Tự chuyển Thua"
     ],"correct":[1]},
    {"id":"q19","question":"Popup 'Thiếu chứng từ cọc' khi kéo Thắng dù KH đã chuyển khoản. Xử lý?","type":"single","options":[
       "Yêu cầu admin tắt gate",
       "Upload ảnh chuyển khoản vào tab Tài liệu loại 'Chứng từ cọc' rồi kéo Thắng",
       "Bỏ qua",
       "Tạo Deal khác"
     ],"correct":[1]},
    {"id":"q20","question":"Để nhận chứng nhận khoá Deal, cần?","type":"single","options":[
       "Chỉ pass bài thi này",
       "Pass bài thi + pass TẤT CẢ bài tập trong khoá (theo cấu hình chứng nhận)",
       "Chỉ hoàn thành bài học",
       "Admin cấp thủ công không cần làm bài"
     ],"correct":[1]}
  ]}$j$::jsonb,
  90, 2, 30, 1,
  'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?w=1200&q=80'
) ON CONFLICT (id) DO UPDATE SET
  title=EXCLUDED.title, instructions=EXCLUDED.instructions, questions=EXCLUDED.questions,
  passing_score=EXCLUDED.passing_score, max_attempts=EXCLUDED.max_attempts,
  time_limit_minutes=EXCLUDED.time_limit_minutes, updated_at=now();

COMMIT;

-- Kiểm tra:
-- SELECT COUNT(*) FROM knowledge_lessons WHERE category_id='d2000002-0000-0000-0000-000000000001';
-- SELECT COUNT(*) FROM knowledge_exercises WHERE lesson_id IN (SELECT id FROM knowledge_lessons WHERE category_id='d2000002-0000-0000-0000-000000000001');
