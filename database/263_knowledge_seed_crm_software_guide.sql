-- 263_knowledge_seed_crm_software_guide.sql
-- Danh mục "Hướng dẫn sử dụng CRM — Lead & Deal"
-- Thao tác thực tế trên phần mềm (menu, nút bấm, tab)
-- 1 danh mục + 12 bài + 12 bài tập
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
-- DANH MỤC HƯỚNG DẪN PHẦN MỀM
-- ══════════════════════════════════════════════════════════════════════════
INSERT INTO knowledge_categories (id, name, slug, description, icon, sort_order, is_active)
VALUES (
  'd2000003-0000-0000-0000-000000000001',
  'Hướng dẫn CRM — Lead & Deal',
  'huong-dan-crm-lead-deal',
  'Hướng dẫn thao tác trên phần mềm: từng màn hình, nút bấm, tab và quy trình Lead/Deal. Dành cho nhân viên mới cần làm được ngay trên hệ thống.',
  '🖥️',
  5,
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, icon = EXCLUDED.icon, is_active = true;

UPDATE knowledge_categories SET
  deadline_mode = 'relative',
  deadline_duration_days = 14,
  deadline_note = 'Hoàn thành hướng dẫn CRM trong 14 ngày',
  require_all_exercises_passed = true
WHERE id = 'd2000003-0000-0000-0000-000000000001';

-- ══════════════════════════════════════════════════════════════════════════
-- PHẦN A — LEAD TRÊN PHẦN MỀM
-- ══════════════════════════════════════════════════════════════════════════

INSERT INTO knowledge_lessons (id, category_id, title, summary, content_md, cover_image_url, duration_minutes, tags, is_required, sort_order, is_published, published_at)
VALUES (
  'b2000003-0000-0000-0000-000000000001',
  'd2000003-0000-0000-0000-000000000001',
  'HD 1: Truy cập Bảng Lead và giao diện chính',
  'Đường dẫn menu, thanh công cụ, chế độ xem Kanban/Danh sách/Lịch.',
  $md$# HD 1 — Truy cập Bảng Lead

## 1. Đường dẫn

**Menu trái** → **CRM** → **Bảng Lead**

Hoặc từ **Dashboard CRM** → ô "Lead" → **Xem tất cả**.

## 2. Giao diện chính

| Khu vực | Chức năng |
|---|---|
| **Thanh trên** | Nút **+ Lead mới**, ô **Tìm kiếm**, bộ **Lọc** |
| **Tab chế độ xem** | Kanban / Danh sách / Lịch / Deadline |
| **Cột Kanban** | Mỗi cột = 1 giai đoạn Lead (Mới, Đã liên hệ, …) |
| **Thẻ Lead** | Tên, SĐT rút gọn, nguồn, người phụ trách, badge SLA |

## 3. Thao tác nhanh

- **Click thẻ** → mở **chi tiết Lead** (tab mới hoặc panel phải tùy cấu hình)
- **Kéo thẻ** sang cột khác → đổi giai đoạn (có thể bị chặn nếu còn nhiệm vụ)
- **Icon ☰ trên thẻ** → menu: Gọi, Nhắn, Tạo nhiệm vụ

## 4. Bộ lọc hay dùng

- **Lead của tôi** — chỉ Lead bạn phụ trách
- **Chỉ có SĐT** — ẩn Lead thiếu số (khuyến nghị bật)
- **Theo nguồn** — Fanpage, Showroom, Website…

## 5. Thực hành

1. Đăng nhập → vào Bảng Lead
2. Bật chế độ **Kanban**
3. Tìm 1 Lead của bạn → mở chi tiết
$md$,
  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80',
  6, ARRAY['huong-dan','lead','phan-mem'], true, 1, true, now()
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, content_md=EXCLUDED.content_md, is_published=true, updated_at=now();

INSERT INTO knowledge_lessons (id, category_id, title, summary, content_md, duration_minutes, tags, is_required, sort_order, is_published, published_at)
VALUES (
  'b2000003-0000-0000-0000-000000000002',
  'd2000003-0000-0000-0000-000000000001',
  'HD 2: Tạo Lead mới và Quét trùng',
  'Nút + Lead mới, form bắt buộc, nút Quét trùng SĐT, gắn Customer.',
  $md$# HD 2 — Tạo Lead & Quét trùng

## 1. Mở form tạo Lead

**Bảng Lead** → nút **+ Lead mới** (góc phải trên, màu xanh).

## 2. Trường bắt buộc tối thiểu

- **Tiêu đề Lead** — vd: "Chị Hoa Q5 — Tủ bếp 3.6m chữ L"
- **Khách hàng** — chọn Customer có sẵn hoặc **+ Tạo nhanh**

## 3. Quét trùng (BẮT BUỘC)

Trước khi **Lưu**:
1. Nhập **Số điện thoại** vào form Customer
2. Bấm **Quét trùng** (hoặc icon 🔍 cạnh SĐT)
3. Nếu có kết quả trùng → **mở Lead cũ**, không tạo mới
4. Nếu không trùng → tiếp tục điền và **Lưu**

## 4. Trường nên điền ngay

| Trường | Ghi chú |
|---|---|
| Nguồn Lead | Fanpage / Showroom / … |
| Loại sản phẩm | Tủ bếp / Cửa nhôm |
| Người phụ trách | Mặc định là bạn |
| Giai đoạn | Thường "Mới" |

## 5. Sau khi Lưu

- Lead xuất thẻ cột **Mới**
- Hệ thống có thể tạo **nhiệm vụ** "Liên hệ lần đầu"
- Ghi **Hoạt động** "Tạo Lead" trong lịch sử

## 6. Lỗi thường gặp

| Lỗi | Cách xử lý |
|---|---|
| "Thiếu tiêu đề" | Điền tiêu đề mô tả rõ |
| "SĐT trùng" | Mở Lead cũ, thêm ghi chú |
| Không thấy Lead vừa tạo | Kiểm tra bộ lọc "Lead của tôi" |
$md$,
  8, ARRAY['huong-dan','lead','tao-moi'], true, 2, true, now()
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, content_md=EXCLUDED.content_md, is_published=true, updated_at=now();

INSERT INTO knowledge_lessons (id, category_id, title, summary, content_md, duration_minutes, tags, is_required, sort_order, is_published, published_at)
VALUES (
  'b2000003-0000-0000-0000-000000000003',
  'd2000003-0000-0000-0000-000000000001',
  'HD 3: Kanban Lead — Kéo thẻ, lọc, tìm kiếm',
  'Kéo đổi giai đoạn, popup chuyển Deal, bộ lọc và tìm nhanh.',
  $md$# HD 3 — Kanban Lead

## 1. Kéo thẻ đổi giai đoạn

1. Giữ chuột trên thẻ Lead
2. Kéo sang cột đích (vd: **Đã liên hệ** → **Đang tư vấn**)
3. Thả chuột

**Nếu bị chặn:** đọc thông báo đỏ — thường do nhiệm vụ bắt buộc chưa xong.

## 2. Kéo vào "Chuyển Deal"

- Kéo vào cột **Chuyển Deal** (hoặc **Đã đồng ý** tùy cấu hình)
- Popup **"Chuyển Lead thành Deal?"**
- Chọn pipeline Deal, người phụ trách → **Xác nhận**

## 3. Tìm kiếm

- Ô **Tìm kiếm** trên thanh công cụ
- Gõ: tên KH, SĐT, mã `LEAD-2026-XXX`
- Enter → lọc thẻ hiển thị

## 4. Chế độ Deadline

Tab **Deadline** → Lead nhóm theo: Quá hạn / Hôm nay / Tuần này / Không hạn

## 5. Mẹo

- Sắp xếp cột theo **thời gian cập nhật** để ưu tiên Lead lâu không chăm
- Badge đỏ trên thẻ = **SLA quá hạn**
$md$,
  7, ARRAY['huong-dan','lead','kanban'], true, 3, true, now()
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, content_md=EXCLUDED.content_md, is_published=true, updated_at=now();

INSERT INTO knowledge_lessons (id, category_id, title, summary, content_md, duration_minutes, tags, is_required, sort_order, is_published, published_at)
VALUES (
  'b2000003-0000-0000-0000-000000000004',
  'd2000003-0000-0000-0000-000000000001',
  'HD 4: Trang chi tiết Lead — Các tab',
  'Tổng quan, Nhiệm vụ, Hoạt động, Ghi chú, Tài liệu, KPI, Chat.',
  $md$# HD 4 — Chi tiết Lead (các tab)

Mở Lead → màn hình chi tiết. Các tab thường gặp:

## 1. Tổng quan

- 6 thông tin bắt buộc (SĐT, email, địa chỉ, nguồn, loại SP, ưu tiên)
- Người phụ trách / Chủ sở hữu
- Giai đoạn hiện tại + thời gian ở giai đoạn

## 2. Nhiệm vụ

- Danh sách task CRM gắn Lead
- Nút **+ Nhiệm vụ** → đặt tiêu đề, hạn, người làm
- Tick hoàn thành → popup **ghi chú + file** (nếu bắt buộc)

## 3. Hoạt động

- Timeline: gọi, gặp, email, đổi giai đoạn
- Nút **+ Hoạt động** → chọn loại, thời gian, mô tả

## 4. Ghi chú

- Ghi chú nội bộ, @mention đồng nghiệp
- Không thay thế Hoạt động có lịch hẹn

## 5. Tài liệu

- **Upload** báo giá, ảnh hiện trường, bản vẽ
- Chọn **loại tài liệu** khi upload

## 6. KPI / Chat (nếu bật)

- **KPI:** điểm cộng/trừ liên quan Lead
- **Chat:** hội thoại Fanpage/Zalo tích hợp (nếu có)

## 7. Nút hành động trên header

- **Chuyển Deal** — khi đủ điều kiện
- **Mất / Mở lại** — đánh dấu thua hoặc kích hoạt lại
- **Sửa** — cập nhật thông tin
$md$,
  10, ARRAY['huong-dan','lead','chi-tiet'], true, 4, true, now()
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, content_md=EXCLUDED.content_md, is_published=true, updated_at=now();

INSERT INTO knowledge_lessons (id, category_id, title, summary, content_md, duration_minutes, tags, is_required, sort_order, is_published, published_at)
VALUES (
  'b2000003-0000-0000-0000-000000000005',
  'd2000003-0000-0000-0000-000000000001',
  'HD 5: Nhiệm vụ Lead trên phần mềm',
  'Tạo, giao, hoàn thành nhiệm vụ; popup ghi chú + đính kèm file.',
  $md$# HD 5 — Nhiệm vụ Lead trên phần mềm

## 1. Tạo nhiệm vụ

**Chi tiết Lead** → tab **Nhiệm vụ** → **+ Nhiệm vụ**

| Trường | Ví dụ |
|---|---|
| Tiêu đề | "Gọi KH xác nhận ngày đo" |
| Hạn | 16:00 hôm nay |
| Người thực hiện | Bạn hoặc đồng nghiệp |
| Bắt buộc | Tick nếu công ty yêu cầu |

## 2. Hoàn thành nhiệm vụ

1. Click nhiệm vụ → **Hoàn thành**
2. Popup yêu cầu:
   - **Ghi chú kết quả** (bắt buộc)
   - **Đính kèm file** (nếu loại nhiệm vụ yêu cầu minh chứng)
3. **Lưu** → nhiệm vụ chuyển trạng thái xong

## 3. Xem nhiệm vụ toàn công ty

**Menu** → **CRM** → **Nhiệm vụ** (hoặc **Công việc của tôi**)

Lọc theo: Quá hạn / Hôm nay / Lead cụ thể

## 4. Cảnh báo

- Nhiệm vụ quá hạn → icon đỏ trên Dashboard
- Nhiệm vụ bắt buộc chưa xong → **không kéo** Lead sang giai đoạn mới
$md$,
  8, ARRAY['huong-dan','lead','nhiem-vu'], true, 5, true, now()
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, content_md=EXCLUDED.content_md, is_published=true, updated_at=now();

INSERT INTO knowledge_lessons (id, category_id, title, summary, content_md, duration_minutes, tags, is_required, sort_order, is_published, published_at)
VALUES (
  'b2000003-0000-0000-0000-000000000006',
  'd2000003-0000-0000-0000-000000000001',
  'HD 6: Chuyển Lead → Deal trên phần mềm',
  'Hai cách chuyển, popup xác nhận, kiểm tra sau chuyển.',
  $md$# HD 6 — Chuyển Lead → Deal (thao tác)

## Cách 1: Từ Kanban

1. **Bảng Lead** → Kanban
2. Kéo thẻ vào cột **Chuyển Deal**
3. Popup → chọn **Pipeline Deal**, **Người phụ trách Deal**
4. **Xác nhận chuyển Deal**

## Cách 2: Từ chi tiết Lead

1. Mở Lead → nút **Chuyển Deal** (header phải)
2. Điền popup tương tự → Xác nhận

## Sau khi chuyển — kiểm tra

| Kiểm tra | Kỳ vọng |
|---|---|
| Bảng Lead | Lead **biến mất** (đã sang Deal) |
| **CRM → Bảng Deal** | Thấy thẻ cùng mã `LEAD-XXX` |
| Chi tiết Deal | Tab Tài liệu có file copy từ Lead |
| Nhiệm vụ | Có task Deal mới (soạn HĐ, …) |

## Lưu ý phần mềm

- **Không có nút Hoàn tác** — kiểm tra checklist trước khi Xác nhận
- Nếu popup báo lỗi → đọc message (thiếu Customer, thiếu trường bắt buộc…)
$md$,
  7, ARRAY['huong-dan','lead','deal','chuyen-doi'], true, 6, true, now()
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, content_md=EXCLUDED.content_md, is_published=true, updated_at=now();

-- ══════════════════════════════════════════════════════════════════════════
-- PHẦN B — DEAL TRÊN PHẦN MỀM
-- ══════════════════════════════════════════════════════════════════════════

INSERT INTO knowledge_lessons (id, category_id, title, summary, content_md, cover_image_url, duration_minutes, tags, is_required, sort_order, is_published, published_at)
VALUES (
  'b2000003-0000-0000-0000-000000000007',
  'd2000003-0000-0000-0000-000000000001',
  'HD 7: Truy cập Bảng Deal và giao diện',
  'Menu Deal, Kanban (số cột tuỳ pipeline công ty), giá trị Deal, badge SLA.',
  $md$# HD 7 — Bảng Deal

## 1. Đường dẫn

**Menu trái** → **CRM** → **Bảng Deal**

## 2. Khác với Bảng Lead

- Chỉ hiển thị bản ghi `type = deal`
- Pipeline mặc định **6 giai đoạn** (Deal mới → … → Thắng/Thua) — đây là **pipeline mẫu**. Công ty có thể bật **nhiều pipeline khác nhau** với số cột tuỳ chỉnh; đầu trang Bảng Deal có **menu chọn pipeline** nếu công ty bật ≥ 2 pipeline.
- Thẻ hiển thị **Giá trị ước tính** (VNĐ)

## 3. Chế độ xem

Giống Lead: **Kanban**, **Danh sách**, **Deadline**

## 4. Thao tác nhanh

- Click thẻ → chi tiết Deal
- Kéo thẻ → đổi giai đoạn (có gate / form sự kiện)
- Kéo **Thắng** → modal **Tạo dự án** (HD 10)

## 5. Lọc thường dùng

- Deal của tôi
- Deal > 50 triệu
- Deal quá hạn SLA
$md$,
  'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&q=80',
  6, ARRAY['huong-dan','deal','phan-mem'], true, 7, true, now()
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, content_md=EXCLUDED.content_md, is_published=true, updated_at=now();

INSERT INTO knowledge_lessons (id, category_id, title, summary, content_md, duration_minutes, tags, is_required, sort_order, is_published, published_at)
VALUES (
  'b2000003-0000-0000-0000-000000000008',
  'd2000003-0000-0000-0000-000000000001',
  'HD 8: Kanban Deal — Kéo thẻ & form sự kiện',
  'Popup khi đổi stage, gate thiếu file, cột Thắng/Thua.',
  $md$# HD 8 — Kanban Deal

## 1. Kéo thẻ bình thường

Kéo **Deal mới** → **Báo giá** → **Đàm phán** → **Ký hợp đồng**

Một số bước mở **form sự kiện** (điền ngày, số tiền, ghi chú) → **Lưu** mới chuyển cột.

## 2. Stage gate (cổng kiểm tra)

Nếu công ty bật gate:
- Thiếu file HĐ / BG → thông báo **"Thiếu tài liệu bắt buộc"**
- Vào tab **Tài liệu** upload → thử kéo lại

## 3. Cột Thắng

- Kéo vào **Thắng** → **Modal tạo dự án** (không tự đóng Deal)
- Điền form → **Tạo dự án** → Deal liên kết project

## 4. Cột Thua

- Bắt buộc chọn **Lý do thua** dropdown
- Ghi chú bổ sung → **Xác nhận**

## 5. DealStageEventModal

Khi popup hiện — điền đủ trường có dấu * → tránh kẹt pipeline
$md$,
  8, ARRAY['huong-dan','deal','kanban'], true, 8, true, now()
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, content_md=EXCLUDED.content_md, is_published=true, updated_at=now();

INSERT INTO knowledge_lessons (id, category_id, title, summary, content_md, duration_minutes, tags, is_required, sort_order, is_published, published_at)
VALUES (
  'b2000003-0000-0000-0000-000000000009',
  'd2000003-0000-0000-0000-000000000001',
  'HD 9: Chi tiết Deal — Tài liệu, Phê duyệt, Sản xuất',
  'Các tab mở rộng sau khi chuyển từ Lead; upload HĐ; link dự án.',
  $md$# HD 9 — Chi tiết Deal (tab nâng cao)

## Tab có trên Deal (không có trên Lead thuần)

| Tab | Chức năng |
|---|---|
| **Tài liệu** | HĐ, BG, bản vẽ — nút Upload |
| **Phê duyệt** | Yêu cầu giảm giá / ngoại lệ — chờ trưởng nhóm |
| **Sản xuất** | Link **Dự án** xưởng (sau Deal Thắng) |
| **Vận chuyển** | Theo dõi giao/lắp (nếu bật module) |
| **Điểm Deal** | Chấm chéo + sao KH |

## Upload tài liệu

1. Tab **Tài liệu** → **+ Thêm tài liệu**
2. Chọn file → **Loại** (Hợp đồng / Thanh toán / Thiết kế)
3. **Lưu**

## Phê duyệt

- Sale tạo **yêu cầu phê duyệt** (vd: giảm 5%)
- Trưởng nhóm vào tab → **Duyệt** / **Từ chối**
- Sale nhận thông báo app

## Sản xuất

- Sau **Tạo dự án** → tab hiện link mở **Production Detail**
- Theo dõi tiến độ xưởng (read-only hoặc comment tùy quyền)
$md$,
  9, ARRAY['huong-dan','deal','chi-tiet'], true, 9, true, now()
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, content_md=EXCLUDED.content_md, is_published=true, updated_at=now();

INSERT INTO knowledge_lessons (id, category_id, title, summary, content_md, duration_minutes, tags, is_required, sort_order, is_published, published_at)
VALUES (
  'b2000003-0000-0000-0000-000000000010',
  'd2000003-0000-0000-0000-000000000001',
  'HD 10: Deal Thắng — Modal tạo dự án',
  'Các bước trong modal: luồng xưởng, template nhiệm vụ, xác nhận.',
  $md$# HD 10 — Modal tạo dự án (Deal Thắng)

## Kích hoạt modal

**Kanban Deal** → kéo thẻ vào **Thắng** → modal full màn hình (hoặc lớn).

## Các bước trong modal

1. **Xác nhận thông tin Deal** — tên công trình, KH, địa chỉ
2. **Chọn loại xưởng / workshop type** — Tủ bếp / Cửa nhôm …
3. **Chọn bộ nhiệm vụ mẫu** (template set)
4. **Deadline sản xuất** (nếu có)
5. Bấm **Tạo dự án**

## Sau khi Tạo

- Toast **"Đã tạo dự án …"**
- Deal có field **project_id**
- Có thể mở dự án từ tab Sản xuất

## Lỗi thường gặp

| Message | Xử lý |
|---|---|
| Thiếu địa chỉ lắp | Sửa Customer / Deal |
| Chưa chọn template | Chọn bộ NV mẫu |
| Không có quyền | Liên hệ admin |
$md$,
  8, ARRAY['huong-dan','deal','san-xuat'], true, 10, true, now()
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, content_md=EXCLUDED.content_md, is_published=true, updated_at=now();

INSERT INTO knowledge_lessons (id, category_id, title, summary, content_md, duration_minutes, tags, is_required, sort_order, is_published, published_at)
VALUES (
  'b2000003-0000-0000-0000-000000000011',
  'd2000003-0000-0000-0000-000000000001',
  'HD 11: Bàn giao SX & Điểm Deal trên phần mềm',
  'Nút xác nhận bàn giao, ngày công trình, tab chấm điểm chéo.',
  $md$# HD 11 — Bàn giao SX & Điểm Deal

## 1. Bàn giao sản xuất (Sale)

**Chi tiết Deal** → section **Bàn giao sản xuất** (hoặc tab Sản xuất):

1. Điền **Ngày bắt đầu công trình**
2. **Ngày dự kiến SX** bắt đầu / kết thúc
3. Bấm **Xác nhận bàn giao**

Trạng thái `sx_handover_at` được ghi — xưởng nhận tín hiệu handover.

## 2. Tab Điểm Deal

- **+ Chấm điểm chéo** — chọn module nguồn → module đích → 1–5 sao
- **+ Đánh giá KH** — nhập sao + feedback (nếu được quyền)

## 3. Báo cáo

**CRM** → **Báo cáo Lead/Deal** (hoặc KPI Deal Dashboard) — xem hiệu suất cá nhân

## 4. Checklist cuối ngày trên app

- [ ] Cập nhật giai đoạn Deal đúng thực tế
- [ ] Upload file mới (HĐ, CK)
- [ ] Hoàn thành nhiệm vụ quá hạn
$md$,
  7, ARRAY['huong-dan','deal','ban-giao','diem-deal'], true, 11, true, now()
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, content_md=EXCLUDED.content_md, is_published=true, updated_at=now();

INSERT INTO knowledge_lessons (id, category_id, title, summary, content_md, cover_image_url, duration_minutes, tags, is_required, sort_order, is_published, published_at)
VALUES (
  'b2000003-0000-0000-0000-000000000012',
  'd2000003-0000-0000-0000-000000000001',
  'HD 12 🏆: Bài kiểm tra thao tác CRM',
  'Giới thiệu bài thi thực hành phần mềm Lead & Deal.',
  $md$# HD 12 🏆 — Bài kiểm tra thao tác CRM

- **18 câu** tình huống thực tế — đường dẫn menu, nút bấm, quy trình Lead & Deal
- **Đạt 90%**
- **25 phút**, tối đa 2 lần
- Không tra cứu tài liệu trong khi làm bài

Ôn lại HD 1–11 trước khi làm bài.
$md$,
  'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1200&q=80',
  3, ARRAY['huong-dan','final-exam'], true, 12, true, now()
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, content_md=EXCLUDED.content_md, is_published=true, updated_at=now();

COMMIT;

-- ══════════════════════════════════════════════════════════════════════════
-- BÀI TẬP HƯỚNG DẪN (nâng độ khó — tình huống thao tác thực tế)
-- ══════════════════════════════════════════════════════════════════════════
BEGIN;

-- Ex 01 Quiz HD1 — Giao diện Bảng Lead
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000003-0000-0000-0000-000000000001', 'b2000003-0000-0000-0000-000000000001',
  'Quiz: Giao diện Bảng Lead — Thao tác & điều hướng',
  '7 câu về menu, chế độ xem và thao tác trên Bảng Lead.',
  'quiz',
  $j${"items":[
    {"id":"q1","question":"Đường dẫn chính xác để vào Bảng Lead trên CRM?","type":"single","options":[
       "Menu CRM → Bảng Lead",
       "Menu Kế toán → Hoá đơn",
       "Menu Sản xuất → Dự án",
       "Không có màn hình Lead trên CRM"
     ],"correct":[0]},
    {"id":"q2","question":"Chế độ xem nào có trên Bảng Lead? (chọn nhiều)","type":"multiple","options":[
       "Kanban (cột pipeline)",
       "Danh sách (bảng)",
       "Deadline (nhóm theo hạn)",
       "Bản đồ vệ tinh 3D"
     ],"correct":[0,1,2]},
    {"id":"q3","question":"Tình huống: Bạn cần tạo Lead mới cho KH gọi điện hỏi giá cửa nhôm. Thao tác đúng?","type":"single","options":[
       "Vào CRM → Bảng Lead → bấm 'Lead mới' góc phải trên → điền form",
       "Tạo Customer trước, không cần Lead",
       "Ghi vào sổ tay, không cần CRM",
       "Vào tab Deal tạo trực tiếp"
     ],"correct":[0]},
    {"id":"q4","question":"Click vào thẻ Lead trên Kanban sẽ?","type":"single","options":[
       "Mở trang chi tiết Lead (các tab: Nhiệm vụ, Hoạt động, Tài liệu…)",
       "Xoá Lead ngay lập tức",
       "Khoá tài khoản người dùng",
       "Gửi email marketing hàng loạt"
     ],"correct":[0]},
    {"id":"q5","question":"Chế độ xem 'Deadline' trên Bảng Lead giúp gì?","type":"single","options":[
       "Nhóm Lead theo mốc hạn xử lý — phát hiện Lead trễ SLA",
       "In hoá đơn điện tử",
       "Chat nội bộ",
       "Xoá Lead quá hạn tự động"
     ],"correct":[0]},
    {"id":"q6","question":"Tìm Lead nhanh trên Bảng Lead bằng cách?","type":"single","options":[
       "Dùng ô tìm kiếm trên toolbar (theo tên, SĐT, mã Lead…)",
       "Chỉ gọi admin hỗ trợ",
       "Không có chức năng tìm kiếm",
       "Nhấn F12 trên trình duyệt"
     ],"correct":[0]},
    {"id":"q7","question":"Màu sắc/thẻ trên Kanban Lead thường phản ánh?","type":"single","options":[
       "Giai đoạn pipeline, người phụ trách, trạng thái SLA",
       "Màu sắc yêu thích của sale",
       "Không có ý nghĩa gì",
       "Chỉ admin mới thấy màu"
     ],"correct":[0]}
  ]}$j$::jsonb, 80, 2, 1
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, instructions=EXCLUDED.instructions, questions=EXCLUDED.questions, passing_score=EXCLUDED.passing_score, max_attempts=EXCLUDED.max_attempts, updated_at=now();

-- Ex 02 Quiz HD2 — Tạo Lead & Quét trùng
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000003-0000-0000-0000-000000000002', 'b2000003-0000-0000-0000-000000000002',
  'Quiz: Tạo Lead & Quét trùng — Quy trình chuẩn',
  '7 câu về tạo Lead, quét trùng SĐT và trường bắt buộc.',
  'quiz',
  $j${"items":[
    {"id":"q1","question":"Bước BẮT BUỘC trước khi bấm 'Lưu' Lead mới?","type":"single","options":[
       "Quét trùng SĐT/email — kiểm tra KH đã tồn tại chưa",
       "Xoá Customer cũ",
       "Đổi mật khẩu CRM",
       "Tắt CRM rồi bật lại"
     ],"correct":[0]},
    {"id":"q2","question":"Trường bắt buộc tối thiểu khi tạo Lead? (chọn nhiều)","type":"multiple","options":[
       "Tiêu đề (mô tả nhu cầu)",
       "Khách hàng (Customer liên kết hoặc tạo mới)",
       "Mã vận đơn",
       "Số CMND bắt buộc mọi trường hợp"
     ],"correct":[0,1]},
    {"id":"q3","question":"Tình huống: Quét trùng phát hiện SĐT 0901234567 đã có Lead đang xử lý. Hành động đúng?","type":"single","options":[
       "Tạo Lead mới trùng SĐT để báo cáo số lượng",
       "Mở Lead cũ, cập nhật hoạt động mới — không tạo trùng",
       "Xoá SĐT khỏi Lead cũ",
       "Bỏ qua cảnh báo"
     ],"correct":[1]},
    {"id":"q4","question":"Lead mới sau khi Lưu thường nằm ở cột pipeline nào?","type":"single","options":[
       "Cột đầu tiên (Mới / Lead mới)",
       "Cột Thắng",
       "Cột Thua",
       "Không hiển thị trên Kanban"
     ],"correct":[0]},
    {"id":"q5","question":"Tiêu đề Lead chuẩn nhất cho KH hỏi tủ bếp nhôm 3.6m chữ L?","type":"single","options":[
       "Chị Hoa — Tủ bếp nhôm 3.6m chữ L, Q.7",
       "Khách",
       "Để trống",
       "123"
     ],"correct":[0]},
    {"id":"q6","question":"Tạo Lead mà không quét trùng SĐT có thể gây? (chọn nhiều)","type":"multiple","options":[
       "2 sale cùng gọi 1 KH → trải nghiệm KH tệ",
       "Dữ liệu báo cáo bị phình (Lead ảo)",
       "Mất lịch sử chăm sóc trước đó",
       "Tự động tăng lương"
     ],"correct":[0,1,2]},
    {"id":"q7","question":"Nguồn Lead (Lead Source) nên được chọn khi tạo vì?","type":"single","options":[
       "Phục vụ báo cáo hiệu quả kênh marketing (Fanpage, Zalo, Giới thiệu…)",
       "Chỉ để trang trí form",
       "Không quan trọng",
       "Admin mới cần, sale không cần"
     ],"correct":[0]}
  ]}$j$::jsonb, 80, 2, 1
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, instructions=EXCLUDED.instructions, questions=EXCLUDED.questions, passing_score=EXCLUDED.passing_score, max_attempts=EXCLUDED.max_attempts, updated_at=now();

-- Ex 03 Quiz HD3 — Kanban Lead
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000003-0000-0000-0000-000000000003', 'b2000003-0000-0000-0000-000000000003',
  'Quiz: Kanban Lead — Kéo thẻ & xử lý gate',
  '7 câu về thao tác kéo thẻ Lead trên Kanban và xử lý khi bị chặn.',
  'quiz',
  $j${"items":[
    {"id":"q1","question":"Kéo Lead vào cột 'Chuyển Deal' trên Kanban sẽ?","type":"single","options":[
       "Mở popup xác nhận chuyển Lead → Deal",
       "Tự xoá Lead",
       "Khoá tài khoản người dùng",
       "Gửi email spam"
     ],"correct":[0]},
    {"id":"q2","question":"Kéo Lead sang giai đoạn mới bị popup chặn. Nguyên nhân thường gặp nhất?","type":"single","options":[
       "Nhiệm vụ bắt buộc chưa hoàn thành (gate)",
       "Trời nắng",
       "Cuối tuần",
       "Màu thẻ không đúng"
     ],"correct":[0]},
    {"id":"q3","question":"Tình huống: Lead bị chặn vì nhiệm vụ 'Gọi tư vấn lần 1' chưa hoàn thành. Cách xử lý?","type":"single","options":[
       "Yêu cầu admin tắt gate",
       "Vào tab Nhiệm vụ → hoàn thành đúng quy định (ghi chú + file nếu cần) → kéo lại",
       "Tạo Lead mới để né",
       "Bỏ qua gate"
     ],"correct":[1]},
    {"id":"q4","question":"Tab 'Deadline' trên Bảng Lead dùng để?","type":"single","options":[
       "Nhóm Lead theo mốc hạn xử lý — ưu tiên Lead sắp/trễ hạn",
       "In hoá đơn",
       "Chat nội bộ",
       "Xoá Lead quá hạn"
     ],"correct":[0]},
    {"id":"q5","question":"Kéo Lead sang cột 'Thua' trên Kanban cần?","type":"single","options":[
       "Chọn lý do thua từ danh mục + ghi chú tình huống",
       "Không cần gì — chỉ kéo",
       "Ảnh hộ chiếu KH",
       "Video quảng cáo"
     ],"correct":[0]},
    {"id":"q6","question":"Form sự kiện (event form) hiện khi kéo thẻ sang một số cột yêu cầu?","type":"single","options":[
       "Điền đầy đủ trường bắt buộc (*) rồi bấm Lưu trước khi chuyển giai đoạn",
       "Bỏ qua form",
       "Tắt máy tính",
       "Xoá Lead"
     ],"correct":[0]},
    {"id":"q7","question":"Lead treo ở cột 'Đang tư vấn' 20 ngày không cập nhật. Hành động đúng trên CRM?","type":"single","options":[
       "Để yên",
       "Cập nhật hoạt động, tạo nhiệm vụ follow-up — nếu không phản hồi thì chuyển Thua có lý do",
       "Tự chuyển Deal",
       "Xoá Lead"
     ],"correct":[1]}
  ]}$j$::jsonb, 80, 2, 1
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, instructions=EXCLUDED.instructions, questions=EXCLUDED.questions, passing_score=EXCLUDED.passing_score, max_attempts=EXCLUDED.max_attempts, updated_at=now();

-- Ex 04 Checklist HD4 — Tab chi tiết Lead
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000003-0000-0000-0000-000000000004', 'b2000003-0000-0000-0000-000000000004',
  'Cam kết: Thành thạo tab chi tiết Lead',
  'Cam kết nắm vững các tab trên trang chi tiết Lead — thiếu 1 tab = sai quy trình.',
  'checklist',
  $j${"items":[
    {"id":"c1","text":"Tôi biết tab Nhiệm vụ: tạo task, gán người, đặt hạn, hoàn thành kèm ghi chú + file minh chứng"},
    {"id":"c2","text":"Tôi biết tab Hoạt động: ghi log cuộc gọi, gặp mặt, Zalo — mỗi tương tác quan trọng phải log"},
    {"id":"c3","text":"Tôi biết tab Tài liệu: upload BG, bản vẽ, ảnh khảo sát — đặt tên file rõ ràng"},
    {"id":"c4","text":"Tôi biết nút 'Chuyển Deal' trên header chi tiết Lead — dùng khi KH đã sẵn sàng cam kết mua"},
    {"id":"c5","text":"Tôi cam kết: không bỏ qua tab Hoạt động — mọi cam kết với KH phải có log trên CRM"},
    {"id":"c6","text":"Tôi hiểu: thiếu log hoạt động = không chứng minh được đã làm việc → rủi ro KPI"}
  ]}$j$::jsonb, 100, 1, 2
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, instructions=EXCLUDED.instructions, questions=EXCLUDED.questions, passing_score=EXCLUDED.passing_score, max_attempts=EXCLUDED.max_attempts, updated_at=now();

-- Ex 05 Quiz HD5 — Nhiệm vụ Lead
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000003-0000-0000-0000-000000000005', 'b2000003-0000-0000-0000-000000000005',
  'Quiz: Nhiệm vụ Lead — Hoàn thành đúng quy định KPI',
  '7 câu về tạo, hoàn thành nhiệm vụ Lead và hậu quả vi phạm.',
  'quiz',
  $j${"items":[
    {"id":"q1","question":"Hoàn thành nhiệm vụ Lead trên CRM yêu cầu?","type":"single","options":[
       "Ghi chú nội dung kết quả (+ file đính kèm nếu nhiệm vụ yêu cầu minh chứng)",
       "Chỉ tick checkbox",
       "Không cần làm gì thêm",
       "Xoá Lead"
     ],"correct":[0]},
    {"id":"q2","question":"Tạo nhiệm vụ thủ công cho Lead ở đâu?","type":"single","options":[
       "Tab Nhiệm vụ trong chi tiết Lead → '+ Tạo nhiệm vụ'",
       "Chỉ qua email",
       "Tab Kế toán",
       "Không thể tạo thủ công"
     ],"correct":[0]},
    {"id":"q3","question":"Nhiệm vụ bắt buộc chưa hoàn thành có thể?","type":"single","options":[
       "Chặn việc kéo Lead sang giai đoạn tiếp theo (gate)",
       "Tự chuyển Lead sang Deal",
       "Xoá CRM",
       "Không ảnh hưởng gì"
     ],"correct":[0]},
    {"id":"q4","question":"Tình huống: Nhiệm vụ 'Gửi báo giá' yêu cầu file minh chứng, sale tick xong nhưng không upload BG. Hệ quả?","type":"single","options":[
       "Không sao",
       "Nhiệm vụ không hợp lệ → gate vẫn chặn → có thể bị trừ KPI",
       "Hệ thống tự upload",
       "Trưởng nhóm tự upload thay"
     ],"correct":[1]},
    {"id":"q5","question":"Xem tất cả nhiệm vụ được giao cho mình trên CRM?","type":"single","options":[
       "CRM → Nhiệm vụ / Công việc của tôi",
       "Chỉ trưởng nhóm xem được",
       "Không xem được trên app",
       "Chỉ tab Deal"
     ],"correct":[0]},
    {"id":"q6","question":"Nhiệm vụ Lead trễ hạn 5 ngày không có lý do chính đáng có thể? (chọn nhiều)","type":"multiple","options":[
       "Bị cảnh báo SLA trên hệ thống",
       "Bị trừ KPI theo quy chế",
       "Trưởng nhóm nhắc nhở/can thiệp",
       "Tự động tăng lương"
     ],"correct":[0,1,2]},
    {"id":"q7","question":"Ghi chú hoàn thành nhiệm vụ ĐẠT chuẩn?","type":"single","options":[
       "'OK' / 'xong'",
       "'Đã gửi BG 72tr qua Zalo 09/05, hẹn KH phản hồi 12/05. File BG đính kèm.'",
       "Để trống",
       "Chỉ emoji"
     ],"correct":[1]}
  ]}$j$::jsonb, 80, 2, 1
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, instructions=EXCLUDED.instructions, questions=EXCLUDED.questions, passing_score=EXCLUDED.passing_score, max_attempts=EXCLUDED.max_attempts, updated_at=now();

-- Ex 06 Quiz HD6 — Chuyển Lead→Deal
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000003-0000-0000-0000-000000000006', 'b2000003-0000-0000-0000-000000000006',
  'Quiz: Chuyển Lead→Deal — Thao tác & hậu quả',
  '7 câu về quy trình chuyển Lead sang Deal trên app.',
  'quiz',
  $j${"items":[
    {"id":"q1","question":"Cách chuyển Lead → Deal trên CRM? (chọn nhiều)","type":"multiple","options":[
       "Kéo thẻ Lead trên Kanban vào cột 'Chuyển Deal'",
       "Bấm nút 'Chuyển Deal' trên header chi tiết Lead",
       "Tự động khi vừa tạo Lead",
       "Xoá Customer rồi tạo Deal mới"
     ],"correct":[0,1]},
    {"id":"q2","question":"Sau khi chuyển Deal, Lead còn hiển thị trên Bảng Lead không?","type":"single","options":[
       "Không — Lead biến mất khỏi Bảng Lead, xuất hiện trên Bảng Deal",
       "Có — hiển thị cả 2 nơi",
       "Chỉ admin thấy Lead cũ",
       "Tạo 2 bản ghi song song"
     ],"correct":[0]},
    {"id":"q3","question":"Mã LEAD-XXX sau khi chuyển Deal?","type":"single","options":[
       "Giữ nguyên trên Deal — không đổi mã",
       "Đổi sang DEAL-XXX mới",
       "Bị xoá",
       "Chỉ hiển thị số thứ tự"
     ],"correct":[0]},
    {"id":"q4","question":"Hệ thống có nút 'Hoàn tác' chuyển Deal → Lead không?","type":"single","options":[
       "Không — chuyển Deal là quyết định một chiều, cần cân nhắc kỹ trước khi bấm",
       "Có — 1 click hoàn tác",
       "Có — chỉ cuối tuần",
       "Admin hoàn tác bằng F5"
     ],"correct":[0]},
    {"id":"q5","question":"Tài liệu đã upload trên Lead khi chuyển Deal?","type":"single","options":[
       "Được sao chép/liên kết sang Deal — vẫn truy cập được",
       "Bị xoá",
       "Chỉ admin thấy",
       "Chỉ giữ file PDF"
     ],"correct":[0]},
    {"id":"q6","question":"Tình huống: Sale chuyển Lead sang Deal khi KH mới hỏi giá lần đầu, chưa cam kết gì. Hậu quả?","type":"single","options":[
       "Không sao",
       "Sai quy trình — Deal KPI bị áp dụng sớm, dữ liệu pipeline Deal bị méo",
       "Hệ thống tự hoàn tác",
       "KH tự ký HĐ"
     ],"correct":[1]},
    {"id":"q7","question":"Trước khi bấm 'Chuyển Deal' nên kiểm tra? (chọn nhiều)","type":"multiple","options":[
       "KH đã thống nhất mua / sẵn sàng ký HĐ",
       "Thông tin bắt buộc trên Lead đã đầy đủ",
       "Nhiệm vụ bắt buộc trước chuyển Deal đã hoàn thành",
       "Đã xoá Customer"
     ],"correct":[0,1,2]}
  ]}$j$::jsonb, 80, 2, 1
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, instructions=EXCLUDED.instructions, questions=EXCLUDED.questions, passing_score=EXCLUDED.passing_score, max_attempts=EXCLUDED.max_attempts, updated_at=now();

-- Ex 07 Quiz HD7 — Bảng Deal
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000003-0000-0000-0000-000000000007', 'b2000003-0000-0000-0000-000000000007',
  'Quiz: Bảng Deal — Giao diện & pipeline',
  '7 câu về Bảng Deal, pipeline cấu hình và thông tin trên thẻ Deal.',
  'quiz',
  $j${"items":[
    {"id":"q1","question":"Đường dẫn vào Bảng Deal?","type":"single","options":[
       "CRM → Bảng Deal",
       "CRM → Bảng Lead only",
       "Menu Sản xuất only",
       "Không có màn hình Deal"
     ],"correct":[0]},
    {"id":"q2","question":"Thông tin nào thường hiển thị trên thẻ Deal Kanban?","type":"single","options":[
       "Giá trị ước tính, người phụ trách, SLA/deadline",
       "Mật khẩu KH",
       "Video quảng cáo",
       "Không hiển thị gì thêm ngoài tên"
     ],"correct":[0]},
    {"id":"q3","question":"Kéo Deal sang cột Thắng trên Kanban sẽ?","type":"single","options":[
       "Mở modal/wizard tạo dự án sản xuất",
       "Tự xoá Deal",
       "Khoá app",
       "Gửi SMS hàng loạt"
     ],"correct":[0]},
    {"id":"q4","question":"Chế độ xem trên Bảng Deal giống Bảng Lead?","type":"single","options":[
       "Có — Kanban / Danh sách / Deadline",
       "Chỉ bản đồ",
       "Chỉ chat",
       "Không xem được"
     ],"correct":[0]},
    {"id":"q5","question":"Pipeline 6 giai đoạn trong khoá học có ý nghĩa gì?","type":"single","options":[
       "Pipeline mẫu/tượng trưng — công ty có thể cấu hình nhiều pipeline khác nhau",
       "Bắt buộc cố định 6 cột với mọi công ty",
       "Do nhân viên tự đặt mỗi ngày",
       "Không liên quan CRM"
     ],"correct":[0]},
    {"id":"q6","question":"Công ty có 2 pipeline Deal (Showroom + Dự án thầu). Trên Bảng Deal bạn thấy?","type":"single","options":[
       "Dropdown/bộ lọc chọn pipeline — mỗi pipeline có cột riêng",
       "Chỉ 1 pipeline duy nhất",
       "Phải tạo 2 tài khoản CRM",
       "Không thể có nhiều pipeline"
     ],"correct":[0]},
    {"id":"q7","question":"Tình huống: Deal giá trị 120tr nhưng thẻ Kanban hiển thị 85tr. Nguyên nhân có thể?","type":"single","options":[
       "Sale chưa cập nhật giá trị ước tính sau khi đàm phán/chốt giá mới",
       "Hệ thống tự tính sai",
       "Deal bị lỗi — phải xoá",
       "Giá trị không thể thay đổi"
     ],"correct":[0]}
  ]}$j$::jsonb, 80, 2, 1
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, instructions=EXCLUDED.instructions, questions=EXCLUDED.questions, passing_score=EXCLUDED.passing_score, max_attempts=EXCLUDED.max_attempts, updated_at=now();

-- Ex 08 Quiz HD8 — Kanban Deal & gate
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000003-0000-0000-0000-000000000008', 'b2000003-0000-0000-0000-000000000008',
  'Quiz: Kanban Deal — Gate, Thua & upload tài liệu',
  '7 câu về kéo thẻ Deal, xử lý gate và upload HĐ.',
  'quiz',
  $j${"items":[
    {"id":"q1","question":"Stage gate chặn kéo Deal khi?","type":"single","options":[
       "Thiếu file bắt buộc (HĐ, cọc, BG chốt…) hoặc nhiệm vụ bắt buộc chưa xong",
       "Trời mưa",
       "Cuối tháng",
       "Màu thẻ không đúng"
     ],"correct":[0]},
    {"id":"q2","question":"Kéo Deal sang cột Thua trên Kanban cần?","type":"single","options":[
       "Chọn lý do thua từ danh mục + ghi chú cụ thể",
       "Ảnh hộ chiếu KH",
       "Video TikTok",
       "Không cần gì"
     ],"correct":[0]},
    {"id":"q3","question":"Form sự kiện (event form) khi kéo Deal sang một số cột?","type":"single","options":[
       "Phải điền đầy đủ trường bắt buộc (*) → bấm Lưu → mới chuyển giai đoạn",
       "Bỏ qua form",
       "Tắt máy",
       "Xoá Deal"
     ],"correct":[0]},
    {"id":"q4","question":"Upload HĐ đã ký cho Deal ở đâu?","type":"single","options":[
       "Tab Tài liệu trong chi tiết Deal → chọn loại 'Hợp đồng'",
       "Tab Chat",
       "Tab KPI only",
       "Không upload được trên app"
     ],"correct":[0]},
    {"id":"q5","question":"Tình huống: Popup 'Thiếu chứng từ cọc' khi kéo Deal sang Thắng. KH đã chuyển khoản nhưng sale chưa upload. Xử lý?","type":"single","options":[
       "Yêu cầu admin tắt gate",
       "Chụp/lấy ảnh chuyển khoản → upload tab Tài liệu loại 'Chứng từ cọc' → kéo lại",
       "Bỏ qua popup",
       "Tạo Deal mới"
     ],"correct":[1]},
    {"id":"q6","question":"Deal treo ở cột 'Đàm phán' 30 ngày không cập nhật. Thao tác đúng trên CRM?","type":"single","options":[
       "Để yên",
       "Log hoạt động follow-up → nếu KH không phản hồi thì chuyển Thua có lý do",
       "Tự kéo Thắng",
       "Xoá Deal"
     ],"correct":[1]},
    {"id":"q7","question":"Cột 'Thắng' trên pipeline Deal được xác định bằng?","type":"single","options":[
       "Tên cột phải là 'Thắng'",
       "Cờ is_won = true trên cấu hình pipeline",
       "Cột cuối cùng",
       "Người phụ trách quyết định"
     ],"correct":[1]}
  ]}$j$::jsonb, 80, 2, 1
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, instructions=EXCLUDED.instructions, questions=EXCLUDED.questions, passing_score=EXCLUDED.passing_score, max_attempts=EXCLUDED.max_attempts, updated_at=now();

-- Ex 09 Quiz HD9 — Tab Deal nâng cao
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000003-0000-0000-0000-000000000009', 'b2000003-0000-0000-0000-000000000009',
  'Quiz: Tab Deal nâng cao — Phê duyệt, SX, Điểm',
  '7 câu về các tab chỉ có trên Deal (không có trên Lead thuần).',
  'quiz',
  $j${"items":[
    {"id":"q1","question":"Tab nào CHỈ có trên Deal, KHÔNG có trên Lead thuần? (chọn nhiều)","type":"multiple","options":[
       "Phê duyệt (giảm giá, ngoại lệ)",
       "Sản xuất (bàn giao xưởng, link dự án)",
       "Điểm Deal (chấm chéo, sao KH)",
       "Tạo Lead mới"
     ],"correct":[0,1,2]},
    {"id":"q2","question":"Upload HĐ + chứng từ cọc trên Deal?","type":"single","options":[
       "Tab Tài liệu — chọn đúng loại tài liệu (Hợp đồng / Chứng từ cọc)",
       "Tab Chat only",
       "Header only — không có tab Tài liệu",
       "Không upload được"
     ],"correct":[0]},
    {"id":"q3","question":"Yêu cầu phê duyệt giảm giá vượt mức tự quyết — ai duyệt trên tab Phê duyệt?","type":"single","options":[
       "Trưởng nhóm / Giám đốc theo quy định công ty",
       "Khách hàng tự duyệt",
       "Giao nhận",
       "Hệ thống tự duyệt luôn"
     ],"correct":[0]},
    {"id":"q4","question":"Tab Sản xuất trên Deal sau khi Thắng hiển thị?","type":"single","options":[
       "Link dự án xưởng + thông tin bàn giao SX",
       "Xoá Deal",
       "Chuyển lại Lead",
       "Không thay đổi gì"
     ],"correct":[0]},
    {"id":"q5","question":"Tình huống: Sale cần giảm giá 10% (vượt mức tự duyết 5%). Thao tác trên app?","type":"single","options":[
       "Hứa KH trước, duyệt sau",
       "Tab Phê duyệt → tạo yêu cầu giảm giá → chờ duyệt → mới cam kết với KH",
       "Tự tick duyệt",
       "Không cần duyệt"
     ],"correct":[1]},
    {"id":"q6","question":"Tab Điểm Deal dùng để? (chọn nhiều)","type":"multiple","options":[
       "Chấm điểm chéo giữa các module (SX chấm Sale…)",
       "Ghi nhận sao/feedback khách hàng",
       "Chat nội bộ",
       "In hoá đơn"
     ],"correct":[0,1]},
    {"id":"q7","question":"Phê duyệt giảm giá bị từ chối. Sale nên?","type":"single","options":[
       "Vẫn hứa giá đã xin với KH",
       "Thông báo KH giá theo mức được duyệt hoặc đề xuất phương án thay thế",
       "Xoá Deal",
       "Bỏ qua"
     ],"correct":[1]}
  ]}$j$::jsonb, 80, 2, 1
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, instructions=EXCLUDED.instructions, questions=EXCLUDED.questions, passing_score=EXCLUDED.passing_score, max_attempts=EXCLUDED.max_attempts, updated_at=now();

-- Ex 10 Quiz HD10 — Modal tạo dự án
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000003-0000-0000-0000-000000000010', 'b2000003-0000-0000-0000-000000000010',
  'Quiz: Modal tạo dự án — Deal Thắng',
  '7 câu về wizard tạo dự án khi kéo Deal sang Thắng.',
  'quiz',
  $j${"items":[
    {"id":"q1","question":"Modal tạo dự án mở khi nào?","type":"single","options":[
       "Kéo Deal sang cột Thắng (is_won) trên Kanban",
       "Tạo Lead mới",
       "Đăng nhập CRM",
       "Cuối tuần"
     ],"correct":[0]},
    {"id":"q2","question":"Trong modal tạo dự án cần chọn? (chọn nhiều)","type":"multiple","options":[
       "Loại xưởng/luồng SX (tủ bếp, cửa nhôm…)",
       "Template nhiệm vụ mẫu phù hợp sản phẩm",
       "Thông tin công trình (địa chỉ, ngày, người liên hệ)",
       "Màu theme điện thoại"
     ],"correct":[0,1,2]},
    {"id":"q3","question":"Sau bấm 'Tạo dự án' thành công, Deal sẽ?","type":"single","options":[
       "Có project_id liên kết — truy cập 2 chiều Deal ↔ Dự án",
       "Mất hết lịch sử",
       "Tự chuyển lại Lead",
       "Không thay đổi gì"
     ],"correct":[0]},
    {"id":"q4","question":"Thiếu địa chỉ lắp đặt khi tạo dự án. Xử lý?","type":"single","options":[
       "Sửa thông tin Customer/Deal (tab thông tin) trước khi tạo dự án",
       "Bỏ qua — xưởng tự tìm",
       "Xoá Deal",
       "Tắt CRM"
     ],"correct":[0]},
    {"id":"q5","question":"Chọn nhầm template tủ bếp cho Deal cửa nhôm. Hậu quả?","type":"single","options":[
       "Không sao",
       "Xưởng nhận bộ nhiệm vụ sai → sai luồng SX → liên hệ admin/PM sửa",
       "Hệ thống tự sửa",
       "Deal tự xoá"
     ],"correct":[1]},
    {"id":"q6","question":"Trước khi xác nhận tạo dự án nên kiểm tra? (chọn nhiều)","type":"multiple","options":[
       "Bản vẽ/spec đúng phiên bản chốt",
       "Ngày bắt đầu/dự kiến hoàn thành đã thống nhất KH",
       "Người phụ trách xưởng đã được phân công",
       "Avatar của sale"
     ],"correct":[0,1,2]},
    {"id":"q7","question":"Tạo nhầm dự án — sale KHÔNG nên?","type":"single","options":[
       "Liên hệ admin/PM để hỗ trợ",
       "Tự xoá dự án trực tiếp trên DB hoặc bỏ qua",
       "Ghi nhận lỗi để rút kinh nghiệm",
       "Thông báo xưởng nếu đã tạo"
     ],"correct":[1]}
  ]}$j$::jsonb, 80, 2, 1
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, instructions=EXCLUDED.instructions, questions=EXCLUDED.questions, passing_score=EXCLUDED.passing_score, max_attempts=EXCLUDED.max_attempts, updated_at=now();

-- Ex 11 Checklist HD11 — Bàn giao & Điểm Deal
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000003-0000-0000-0000-000000000011', 'b2000003-0000-0000-0000-000000000011',
  'Cam kết: Bàn giao SX & Điểm Deal — Checklist cuối ngày',
  'Cam kết thành thạo thao tác bàn giao sản xuất và quản lý điểm Deal.',
  'checklist',
  $j${"items":[
    {"id":"c1","text":"Tôi biết nút 'Xác nhận bàn giao SX' trên tab Sản xuất Deal — chỉ bấm khi hồ sơ đã đầy đủ"},
    {"id":"c2","text":"Tôi biết điền ngày bắt đầu công trình + ngày SX dự kiến trước khi xác nhận bàn giao"},
    {"id":"c3","text":"Tôi biết tab Điểm Deal: chấm điểm chéo module + ghi nhận sao/feedback KH"},
    {"id":"c4","text":"Tôi có checklist cuối ngày: cập nhật giai đoạn Deal, upload file mới, hoàn thành NV quá hạn"},
    {"id":"c5","text":"Tôi cam kết: không bấm 'Xác nhận bàn giao' khi thiếu bản vẽ chốt/spec — đây là vi phạm quy trình nghiêm trọng"},
    {"id":"c6","text":"Tôi hiểu: bàn giao thiếu hồ sơ → xưởng làm sai → KH khiếu nại → ảnh hưởng điểm chéo và KPI"}
  ]}$j$::jsonb, 100, 1, 2
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, instructions=EXCLUDED.instructions, questions=EXCLUDED.questions, passing_score=EXCLUDED.passing_score, max_attempts=EXCLUDED.max_attempts, updated_at=now();

-- Ex 12 FINAL EXAM — Bài thi thao tác CRM
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, time_limit_minutes, sort_order)
VALUES (
  'c2000003-0000-0000-0000-000000000012', 'b2000003-0000-0000-0000-000000000012',
  '🏆 Bài thi thao tác CRM Lead & Deal',
  '18 câu tình huống tổng hợp HD 1–11. Đạt 90%. 25 phút. Tối đa 2 lần. Không tra cứu.',
  'quiz',
  $j${"items":[
    {"id":"q1","question":"Vào Bảng Lead trên CRM?","type":"single","options":["CRM → Bảng Lead","Sản xuất","Kế toán only","Không có"],"correct":[0]},
    {"id":"q2","question":"Tạo Lead mới, bước BẮT BUỘC trước Lưu?","type":"single","options":["Quét trùng SĐT","Xoá CRM","Đổi pass","Tắt app"],"correct":[0]},
    {"id":"q3","question":"Quét trùng phát hiện SĐT đã có Lead đang xử lý. Xử lý?","type":"single","options":["Tạo Lead mới trùng","Mở Lead cũ, cập nhật hoạt động","Xoá SĐT","Bỏ qua"],"correct":[1]},
    {"id":"q4","question":"Hoàn thành nhiệm vụ Lead đúng quy định KPI?","type":"single","options":["Ghi chú kết quả + file nếu yêu cầu minh chứng","Chỉ tick","Không log","Xoá Lead"],"correct":[0]},
    {"id":"q5","question":"Chuyển Lead→Deal trên app? (chọn nhiều)","type":"multiple","options":["Kéo Kanban vào Chuyển Deal","Nút Chuyển Deal trên header","Tự khi tạo Lead","Email"],"correct":[0,1]},
    {"id":"q6","question":"Sau chuyển Deal, Lead còn trên Bảng Lead?","type":"single","options":["Không","Có","Chỉ admin","2 bản"],"correct":[0]},
    {"id":"q7","question":"Có nút Hoàn tác chuyển Deal→Lead?","type":"single","options":["Không — quyết định một chiều","Có 1 click","Cuối tuần","Admin F5"],"correct":[0]},
    {"id":"q8","question":"Vào Bảng Deal?","type":"single","options":["CRM → Bảng Deal","Lead only","Không có","Tab KPI"],"correct":[0]},
    {"id":"q9","question":"Pipeline 6 giai đoạn trong khoá?","type":"single","options":["Mẫu/tượng trưng — công ty cấu hình riêng","Bắt buộc 6 cột mọi công ty","Nhân viên tự đặt","Không liên quan"],"correct":[0]},
    {"id":"q10","question":"Kéo Deal Thắng?","type":"single","options":["Mở modal tạo dự án","Tự xoá","Chuyển Lead","Khoá app"],"correct":[0]},
    {"id":"q11","question":"Upload HĐ Deal?","type":"single","options":["Tab Tài liệu — loại Hợp đồng","Chat only","Không upload","Header"],"correct":[0]},
    {"id":"q12","question":"Popup 'Thiếu chứng từ cọc' khi kéo Thắng, KH đã chuyển khoản. Xử lý?","type":"single","options":["Tắt gate","Upload ảnh CK vào Tài liệu loại Chứng từ cọc rồi kéo lại","Bỏ qua","Tạo Deal mới"],"correct":[1]},
    {"id":"q13","question":"Gate chặn kéo Deal khi?","type":"single","options":["Thiếu file bắt buộc hoặc NV bắt buộc chưa xong","Màu thẻ","Ngày lẻ","Wifi"],"correct":[0]},
    {"id":"q14","question":"Deal Thua trên app cần?","type":"single","options":["Lý do từ danh mục + ghi chú","Xoá vĩnh viễn","Ẩn","Lead auto"],"correct":[0]},
    {"id":"q15","question":"Giảm giá 12% vượt mức tự duyệt 5%. Thao tác?","type":"single","options":["Hứa KH trước","Tab Phê duyệt → tạo yêu cầu → chờ duyệt","Tự duyệt","Không cần"],"correct":[1]},
    {"id":"q16","question":"Bàn giao SX trên Deal?","type":"single","options":["Nút xác nhận + điền ngày công trình/SX","Tự động xoá Deal","Chỉ admin","Không có"],"correct":[0]},
    {"id":"q17","question":"Tab Điểm Deal?","type":"single","options":["Chấm chéo module + sao/feedback KH","Chỉ chat","Xoá Deal","In HĐ"],"correct":[0]},
    {"id":"q18","question":"Nhiệm vụ 'Gửi BG' yêu cầu file, sale tick không upload. Hệ quả?","type":"single","options":["Không sao","NV không hợp lệ → gate chặn → trừ KPI","Hệ thống tự upload","Trưởng nhóm upload thay"],"correct":[1]}
  ]}$j$::jsonb,
  90, 2, 25, 1
) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, instructions=EXCLUDED.instructions, questions=EXCLUDED.questions, passing_score=EXCLUDED.passing_score, max_attempts=EXCLUDED.max_attempts, time_limit_minutes=EXCLUDED.time_limit_minutes, updated_at=now();

COMMIT;

-- Kiểm tra:
-- SELECT COUNT(*) FROM knowledge_lessons WHERE category_id='d2000003-0000-0000-0000-000000000001';
-- SELECT COUNT(*) FROM knowledge_exercises WHERE lesson_id IN (SELECT id FROM knowledge_lessons WHERE category_id='d2000003-0000-0000-0000-000000000001');
