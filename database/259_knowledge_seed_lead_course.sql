-- 259_knowledge_seed_lead_course.sql
-- Khoá học "Lead — Quản lý Khách hàng Tiềm năng"
-- Ngành: TỦ BẾP NHÔM / CỬA NHÔM
-- 1 danh mục + 12 bài học + 17 bài tập
-- Văn phong: chuyên nghiệp, súc tích, không thuật ngữ kỹ thuật phần mềm.
-- Idempotent: ON CONFLICT DO UPDATE — chạy lại sẽ ghi đè nội dung mới nhất.

BEGIN;

-- Đảm bảo cột cần thiết (từ migration 219 + 221)
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
-- DANH MỤC
-- ══════════════════════════════════════════════════════════════════════════
INSERT INTO knowledge_categories (id, name, slug, description, icon, sort_order, is_active)
VALUES (
  'd2000001-0000-0000-0000-000000000001',
  'Lead — Khách hàng tiềm năng',
  'lead-khach-hang-tiem-nang',
  'Khoá đào tạo chuẩn cho nhân viên kinh doanh ngành tủ bếp nhôm và cửa nhôm. Hướng dẫn quy trình chăm sóc khách hàng tiềm năng từ tiếp nhận đến chuyển đơn, đảm bảo tuân thủ quy định ghi nhận minh chứng và bảo vệ điểm KPI cá nhân.',
  '🎯',
  10,
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  is_active = true;

-- Deadline khoá Lead: 30 ngày kể từ ngày bắt đầu học (cần migration 261)
UPDATE knowledge_categories SET
  deadline_mode = 'relative',
  deadline_duration_days = 30,
  deadline_note = 'Hoàn thành toàn bộ khoá trong 30 ngày kể từ khi bắt đầu bài học đầu tiên',
  require_all_exercises_passed = true
WHERE id = 'd2000001-0000-0000-0000-000000000001';

-- ══════════════════════════════════════════════════════════════════════════
-- BÀI 01 — Khái niệm Lead
-- ══════════════════════════════════════════════════════════════════════════
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  video_url, video_type, cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000001-0000-0000-0000-000000000001',
  'd2000001-0000-0000-0000-000000000001',
  'Bài 1: Khái niệm Lead trong ngành tủ bếp / cửa nhôm',
  'Định nghĩa Lead, phân biệt Lead - Deal - Khách hàng, vai trò người phụ trách và lý do bắt buộc dùng phần mềm CRM.',
  $md$# Bài 1 — Khái niệm Lead

## 1. Lead là gì?

**Lead** là khách hàng đã chủ động tiếp xúc với công ty và có khả năng phát sinh nhu cầu mua sản phẩm, nhưng **chưa có cam kết mua**.

Trong ngành tủ bếp nhôm / cửa nhôm, Lead xuất hiện khi:

- Khách hàng nhắn tin fanpage hỏi giá tủ bếp
- Khách gọi tổng đài hỏi mẫu cửa nhôm Xingfa
- Khách điền form trên website yêu cầu báo giá
- Khách đến showroom xem mẫu, để lại số điện thoại
- Khách hàng cũ giới thiệu người thân hỏi sản phẩm

## 2. Phân biệt Lead — Deal — Khách hàng

| Phân loại | Tình trạng | Ví dụ thực tế |
|---|---|---|
| **Lead** | Mới tiếp xúc, **chưa cam kết** | Chị Hoa Q5 nhắn fanpage hỏi giá tủ bếp 3.6m chữ L |
| **Deal** | Đã thoả thuận sản phẩm/giá, **chuẩn bị ký HĐ** | Chị Hoa đã chốt mẫu, chốt giá 68 triệu, hẹn ký thứ 5 |
| **Khách hàng** | **Đã ký hợp đồng** và đặt cọc | Chị Hoa đã ký HĐ và chuyển khoản 50% |

> Khi Lead "chín muồi" (đã thống nhất sản phẩm, giá, lịch lắp đặt), nhân viên kinh doanh sẽ thực hiện thao tác **chuyển Lead thành Deal**. Quy trình này được hướng dẫn chi tiết tại Bài 11.

## 3. Vai trò người phụ trách

Mỗi Lead có **một người phụ trách chính** — chịu trách nhiệm toàn bộ quá trình chăm sóc khách hàng đó:

- Tiếp nhận và phản hồi yêu cầu
- Tư vấn sản phẩm, gửi báo giá
- Đặt lịch đo đạc, theo dõi quá trình
- Cập nhật ghi chú sau mỗi lần liên hệ
- Chịu trách nhiệm **điểm KPI** liên quan đến Lead đó

Ngoài ra có thể có **chủ sở hữu Lead** (thường là trưởng nhóm) và **thành viên hỗ trợ** (nhân viên cùng team).

## 4. Vì sao công ty bắt buộc dùng phần mềm CRM?

Với khối lượng 50-100 Lead/tháng/nhân viên, ghi chép thủ công sẽ gây ra:

| Vấn đề khi không dùng CRM | Giải pháp của CRM |
|---|---|
| Bỏ sót khách, không gọi lại đúng hẹn | Phần mềm tự nhắc theo deadline |
| Nhân viên nghỉ phép, đồng nghiệp không biết tiếp nhận thế nào | Toàn bộ lịch sử lưu trong hệ thống |
| Không có số liệu chính xác để báo cáo | Báo cáo tự động theo nguồn, theo nhân viên |
| Không kiểm soát chất lượng tư vấn | Mọi ghi chú, file đều được lưu |
| Khó tính lương thưởng công bằng | KPI tự chấm theo tiêu chí thống nhất |

## 5. Lead trong hệ thống

Trên phần mềm, bạn truy cập module Lead theo đường dẫn:

**Menu trái** → **CRM** → **Bảng Lead**

Tại đây hiển thị toàn bộ Lead được giao cho bạn dưới dạng các thẻ kéo thả theo từng giai đoạn (chi tiết tại Bài 3).

## 6. Tóm tắt

1. Lead = khách hàng tiềm năng đã tiếp xúc, **chưa cam kết mua**
2. Mỗi Lead có **một người phụ trách chính** chịu trách nhiệm KPI
3. **Mọi thao tác trên Lead** đều được hệ thống ghi nhận và chấm điểm
4. Việc tuân thủ quy trình CRM là **bắt buộc** đối với nhân viên kinh doanh

## 7. Kiểm tra hiểu

Trước khi sang bài tiếp theo, hãy chắc chắn bạn có thể trả lời:

- Lead khác Deal ở điểm nào?
- Một Lead có bao nhiêu người phụ trách chính?
- Tại sao công ty bắt buộc dùng CRM thay vì sổ tay cá nhân?
$md$,
  'https://www.youtube.com/watch?v=PqQiU_HKlSY',
  'youtube',
  'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80',
  $j$[
    {"type":"image","url":"https://images.unsplash.com/photo-1556912173-3bb406ef7e77?w=1200&q=80","caption":"Showroom tủ bếp nhôm"}
  ]$j$::jsonb,
  6,
  ARRAY['lead','co-ban','newbie'],
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

-- ══════════════════════════════════════════════════════════════════════════
-- BÀI 02 — Tạo Lead mới
-- ══════════════════════════════════════════════════════════════════════════
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000001-0000-0000-0000-000000000002',
  'd2000001-0000-0000-0000-000000000001',
  'Bài 2: Tiếp nhận và tạo Lead mới',
  'Năm kênh tiếp nhận Lead, thông tin bắt buộc khi tạo Lead, các thao tác tự động của hệ thống và những sai sót cần tránh.',
  $md$# Bài 2 — Tiếp nhận và tạo Lead mới

Khi nhận được yêu cầu từ khách hàng — qua điện thoại, fanpage, đến showroom hay từ form website — nhân viên kinh doanh **bắt buộc** ghi nhận Lead vào hệ thống **trong vòng 5 phút**. Không được để cuối ngày mới ghi.

## 1. Năm kênh tiếp nhận Lead

| Kênh | Đặc điểm | Người ghi nhận |
|---|---|---|
| 1. **Khách gọi điện / đến showroom** | Khách chủ động liên hệ | Nhân viên tiếp nhận tự ghi |
| 2. **Form trên website** | Khách điền yêu cầu báo giá online | Hệ thống tự tạo Lead |
| 3. **Fanpage Facebook** | Khách nhắn hỏi, bấm "Quan tâm" quảng cáo | Hệ thống tự tạo qua Facebook Lead Ads |
| 4. **Từ khách hàng cũ** | KH đã mua giới thiệu hoặc quay lại mua thêm | Nhân viên ghi từ hồ sơ KH cũ |
| 5. **Nhập từ file Excel** | Marketing chia danh sách event/triển lãm | Trưởng nhóm phân chia |

Bài này tập trung vào **kênh 1** — tạo Lead thủ công, vì đây là tình huống phổ biến nhất với nhân viên kinh doanh.

## 2. Quy trình tạo Lead thủ công

### Bước 1: Mở module Lead
**Menu trái** → **CRM** → **Bảng Lead**

### Bước 2: Bấm nút "+ Lead mới"
Nút màu xanh, vị trí góc trên bên phải bảng.

### Bước 3: Điền form thông tin

**Trường bắt buộc** (hệ thống không cho lưu nếu thiếu):

- **Tiêu đề Lead** — đặt tên ngắn gọn, dễ tìm. Ví dụ:
  - *"Chị Hoa Q5 — Tủ bếp chữ L 3.6m"*
  - *"Anh Minh Vinhomes — Cửa nhôm Xingfa 4500"*
- **Khách hàng** — chọn từ danh bạ hoặc tạo mới (họ tên đầy đủ)

**Trường bắt buộc theo quy định KPI** (xem chi tiết Bài 4):

- **Số điện thoại** (10 chữ số)
- **Email**
- **Địa chỉ lắp đặt** (chi tiết quận/huyện)
- **Nguồn Lead** (Facebook / Zalo / Website / Showroom / Giới thiệu / Triển lãm)
- **Loại sản phẩm** (Tủ bếp nhôm / Cửa nhôm Xingfa / Vách kính / Lan can / …)
- **Mức độ ưu tiên**:
  - **Hot** — KH có nhu cầu gấp, dự kiến chốt trong tuần
  - **Warm** — KH quan tâm thật, đang so sánh các đơn vị
  - **Cold** — KH mới hỏi tham khảo, chưa rõ thời gian

### Bước 4: Bấm "Lưu"

Hệ thống thực hiện tự động:

- Sinh mã Lead theo định dạng `LEAD-YYYY-NNN` (ví dụ: `LEAD-2026-047`)
- Gán nhân viên đang đăng nhập làm **người phụ trách chính**
- Đặt Lead vào cột **"Mới"** trên bảng Kanban
- Tạo các nhiệm vụ ban đầu từ mẫu của công ty (gọi xác nhận, gửi catalogue, …)
- Bắt đầu đếm thời gian để chấm KPI

## 3. Ba sai sót nghiêm trọng cần tránh

### 3.1. Để trống số điện thoại
**Hậu quả:** Khi nhân viên khác tiếp nhận (do bạn nghỉ phép, nghỉ việc) sẽ không liên hệ được khách → mất cơ hội. Lead bị tính thiếu thông tin → trừ điểm KPI A3.

### 3.2. Đặt tiêu đề không rõ ràng
| Không đạt | Đạt yêu cầu |
|---|---|
| "Khách hỏi" | "Chị Hoa Q5 — Tủ bếp chữ L 3.6m" |
| "Lead mới" | "Anh Minh Vinhomes — Cửa Xingfa hệ 55" |
| "FB" | "FB Chú Tâm Bình Thạnh — Bộ tủ bếp đá Granite" |

### 3.3. Tạo trùng Lead
Khách gọi nhiều lần → tạo nhiều Lead cùng số điện thoại. Đây là vi phạm quy định data, gây nhiễu báo cáo.

**Quy định bắt buộc:** Trước khi tạo Lead mới, bấm nút **"Quét trùng"** trên bảng. Nếu số điện thoại đã tồn tại:
- Mở Lead cũ → tiếp tục cập nhật
- **Không tạo Lead mới** trong mọi trường hợp

Trường hợp ngoại lệ (2 người dùng chung số): ghi chú rõ trong nội dung Lead và báo trưởng nhóm.

## 4. Hướng dẫn tạo Lead trên điện thoại

App di động có chức năng **quét OCR**: chụp ảnh số điện thoại khách viết trên giấy → tự động đọc và điền vào form. Áp dụng tại các sự kiện triển lãm, công trình thực tế.

## 5. Quy chuẩn thời gian phản hồi

| Mức độ | Thời gian gọi lại tối đa |
|---|---|
| Lead **Hot** | Trong vòng **5 phút** kể từ khi tạo |
| Lead **Warm** | Trong vòng **30 phút** |
| Lead **Cold** | Trong vòng **2 giờ** (trong giờ hành chính) |

Việc gọi lại đúng thời gian quy định ảnh hưởng trực tiếp đến KPI B1 (Tiếp xúc thành công).

## 6. Tóm tắt

- Có **5 kênh** tiếp nhận Lead, trong đó nhân viên thường thao tác kênh 1 (gọi điện/showroom)
- Bắt buộc tối thiểu: **Tiêu đề + Khách hàng**; bắt buộc theo KPI: **SĐT, Email, Địa chỉ, Nguồn, Loại sản phẩm, Mức độ ưu tiên**
- **Quét trùng trước khi tạo** — không tạo Lead trùng số điện thoại
- Tuân thủ thời gian phản hồi theo mức độ ưu tiên
$md$,
  'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=1200&q=80',
  $j$[
    {"type":"image","url":"https://images.unsplash.com/photo-1556909114-d3d3aab32b96?w=1200&q=80","caption":"Form tạo Lead mới"}
  ]$j$::jsonb,
  10,
  ARRAY['lead','tao-lead','quy-trinh'],
  true,
  2,
  true,
  now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, content_md = EXCLUDED.content_md,
  cover_image_url = EXCLUDED.cover_image_url, attachments = EXCLUDED.attachments,
  duration_minutes = EXCLUDED.duration_minutes, tags = EXCLUDED.tags,
  is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();

-- ══════════════════════════════════════════════════════════════════════════
-- BÀI 03 — Bảng Lead (Kanban)
-- ══════════════════════════════════════════════════════════════════════════
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  video_url, video_type, cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000001-0000-0000-0000-000000000003',
  'd2000001-0000-0000-0000-000000000001',
  'Bài 3: Bảng Lead và quy trình chuyển giai đoạn',
  'Cấu trúc bảng Kanban, các giai đoạn chuẩn ngành tủ bếp/cửa nhôm, thao tác kéo thả và các trường hợp bị chặn.',
  $md$# Bài 3 — Bảng Lead và chuyển giai đoạn

## 1. Cấu trúc bảng Lead

Bảng Lead hiển thị theo dạng **Kanban** — chia thành nhiều cột, mỗi cột tương ứng với một **giai đoạn** trong quá trình bán hàng. Mỗi thẻ trên bảng là **một Lead** cụ thể.

```
┌─────────┬─────────────┬──────────────┬──────────────┬──────────────┬─────────┐
│  Mới    │ Đã liên hệ  │ Đã đo đạc    │ Đã báo giá   │ Đang thương  │  Mất    │
│         │             │              │              │ lượng        │         │
├─────────┼─────────────┼──────────────┼──────────────┼──────────────┼─────────┤
│ Chị Hoa │  Anh Minh   │  Cô Thuỷ     │  Chú Tâm     │  Chị Lan     │  Anh    │
│ Q5      │  Vinhomes   │  Hà Đông     │  Bình Thạnh  │  Phú Mỹ      │  Hùng   │
│         │             │              │              │  Hưng        │  Q7     │
│ Anh Đức │  Cô Phương  │              │              │              │         │
│ Tân Bình│  Q1         │              │              │              │         │
└─────────┴─────────────┴──────────────┴──────────────┴──────────────┴─────────┘
```

## 2. Các giai đoạn chuẩn ngành tủ bếp / cửa nhôm

Tên cột có thể khác nhau giữa các công ty, nhưng quy trình tiêu chuẩn gồm:

| Giai đoạn | Tình trạng | Điều kiện chuyển sang giai đoạn này |
|---|---|---|
| **Mới** | Vừa tạo Lead | Tự động |
| **Đã liên hệ** | Đã gọi/nhắn lần đầu | Có 1 ghi nhận hoạt động + ghi chú nội dung |
| **Đã đo đạc** | Đã đến công trình đo | Có biên bản đo + ảnh hiện trạng |
| **Đã báo giá** | Đã gửi báo giá chính thức | Có file báo giá PDF đính kèm |
| **Đang thương lượng** | KH phản hồi giá, đang mặc cả | Có ghi chú nội dung thương lượng |
| **Đã đồng ý** | KH đồng ý chốt | Sẵn sàng chuyển Deal |
| **Mất** | KH không mua | Bắt buộc nhập lý do |

## 3. Thao tác kéo thả

### Trên máy tính
1. **Bấm và giữ** chuột trái vào thẻ Lead
2. **Kéo** sang cột giai đoạn mới
3. **Thả** chuột — hệ thống tự lưu

### Trên điện thoại
Nhấn giữ thẻ → kéo đến cột mục tiêu → thả.

## 4. Các trường hợp hệ thống chặn kéo thả

Hệ thống **không cho phép** chuyển giai đoạn trong các trường hợp:

| Tình huống | Xử lý |
|---|---|
| Còn nhiệm vụ bắt buộc chưa hoàn thành (vd: chưa xác nhận giá) | Hoàn thành nhiệm vụ trước khi kéo |
| Bạn không phải người phụ trách Lead | Liên hệ người phụ trách hoặc trưởng nhóm |
| Lead đã ở trạng thái "Mất" | Bấm nút **"Mở lại Lead"** trước |
| Kéo vào cột "Đã đồng ý" | Hệ thống hỏi xác nhận **chuyển thành Deal** (xem Bài 11) |

Khi bị chặn, hệ thống hiển thị thông báo **chỉ rõ nguyên nhân**. Đọc kỹ thông báo và xử lý trước khi thao tác lại.

## 5. Các chế độ xem khác

Ngoài Kanban, bảng Lead có nhiều chế độ xem khác:

| Chế độ | Phù hợp khi |
|---|---|
| **Danh sách** | Cần sắp xếp, lọc theo nhiều tiêu chí (như Excel) |
| **Lịch** | Xem theo ngày hẹn gọi lại / đo đạc |
| **Hạn chót** | Xem Lead nào sắp đến hạn xử lý |
| **Bình luận** | Xem các comment trao đổi nội bộ |
| **Kế hoạch** | Lên lịch công việc tuần tới |

Chuyển chế độ bằng các nút phía trên bảng.

## 6. Bộ lọc

Phía trên bảng có thanh lọc nhanh:

- **Nhân viên phụ trách** (mặc định: chính bạn)
- **Nguồn Lead** (Facebook / Zalo / Showroom / …)
- **Giai đoạn** (chỉ xem 1 cột cụ thể)
- **Khu vực** (theo quận/huyện)
- **Loại sản phẩm** (Tủ bếp / Cửa nhôm / Vách kính)
- **Chỉ Lead có SĐT** — khuyến nghị **bật mặc định** để lọc Lead không có thông tin liên hệ

## 7. Tab Lead vs Tab Deal

Phía trên cùng bảng có 2 tab:

- **Tab Lead** — các cơ hội chưa qualified (giai đoạn Mới → Đang thương lượng)
- **Tab Deal** — các cơ hội đã chuyển sang Deal (đang ký HĐ → Hoàn tất)

Hai tab tách biệt, không lẫn vào nhau.

## 8. Đồng bộ thời gian thực

Khi đồng nghiệp hoặc trưởng nhóm thực hiện thao tác trên bảng (kéo thẻ, sửa Lead, gán nhân viên), bảng của bạn **tự động cập nhật** mà không cần tải lại trang.

## 9. Tóm tắt

- Bảng Lead theo mô hình **Kanban** — mỗi cột là một giai đoạn
- Thao tác kéo thả chuyển giai đoạn, hệ thống tự lưu
- Hệ thống **chặn** khi vi phạm quy trình — đọc kỹ thông báo lý do
- Sử dụng các chế độ xem và bộ lọc phù hợp với nhu cầu công việc
$md$,
  'https://www.youtube.com/watch?v=k7sZ7m_qkLY',
  'youtube',
  'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1200&q=80',
  $j$[
    {"type":"image","url":"https://images.unsplash.com/photo-1572177812156-58036aae439c?w=1200&q=80","caption":"Bảng Kanban Lead"}
  ]$j$::jsonb,
  10,
  ARRAY['lead','kanban','quy-trinh'],
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

-- ══════════════════════════════════════════════════════════════════════════
-- BÀI 04 — 6 thông tin bắt buộc (KPI A3)
-- ══════════════════════════════════════════════════════════════════════════
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000001-0000-0000-0000-000000000004',
  'd2000001-0000-0000-0000-000000000001',
  'Bài 4: Quy định 6 thông tin bắt buộc trên Lead (KPI A3)',
  'Sáu trường thông tin bắt buộc phải có đầy đủ trên mỗi Lead. Quy tắc chấm KPI A3 và quy tắc cap điểm tháng.',
  $md$# Bài 4 — Quy định 6 thông tin bắt buộc

## 1. Quy định

Mỗi Lead phải có **đầy đủ 6 thông tin** dưới đây. Lead thiếu bất kỳ thông tin nào sẽ bị tính là **"Lead thiếu thông tin"** và ảnh hưởng đến KPI A3 của nhân viên phụ trách.

| # | Trường | Yêu cầu chi tiết |
|---|---|---|
| 1 | **Số điện thoại** | 10 chữ số, đúng định dạng Việt Nam |
| 2 | **Email** | Định dạng email hợp lệ |
| 3 | **Địa chỉ lắp đặt** | Chi tiết đến số nhà / quận / huyện |
| 4 | **Nguồn Lead** | Chọn từ danh sách (Facebook, Zalo, Website, Showroom, Giới thiệu, Triển lãm, …) |
| 5 | **Loại sản phẩm** | Tủ bếp nhôm / Cửa nhôm Xingfa / Vách kính / Lan can / … |
| 6 | **Mức độ ưu tiên** | Hot / Warm / Cold |

## 2. Lý do của quy định

Mỗi trường thông tin phục vụ một mục đích nghiệp vụ cụ thể:

| Trường | Mục đích |
|---|---|
| Số điện thoại | Đảm bảo có thể liên hệ khách hàng |
| Email | Gửi báo giá, hợp đồng, biên bản đo đạc qua mail |
| Địa chỉ lắp đặt | Đội đo đạc và kỹ thuật biết vị trí công trình |
| Nguồn Lead | Marketing biết kênh nào hiệu quả để phân bổ ngân sách |
| Loại sản phẩm | Phân bổ Lead đến đúng team chuyên môn (tủ bếp/cửa) |
| Mức độ ưu tiên | Sắp xếp thứ tự gọi lại trong ngày |

## 3. Cách tính KPI A3

Cuối tháng, hệ thống tính:

```
A3 = (Số Lead đầy đủ 6 thông tin) / (Tổng số Lead trong tháng) × 100%
```

| Mức | Đánh giá |
|---|---|
| ≥ 95% | Xuất sắc |
| 80% — 94% | Đạt yêu cầu |
| < 80% | **Không đạt — áp dụng quy tắc cap điểm** |

## 4. Quy tắc CAP điểm tháng

> **Khi A3 < 80% trong tháng, toàn bộ điểm KPI tổng của tháng đó bị giới hạn tối đa 70 điểm.**

Quy tắc này nghiêm khắc nhằm đảm bảo nhân viên không bỏ qua việc ghi nhận thông tin khách hàng. Dù các KPI khác cao đến đâu, nếu A3 < 80% thì tổng cũng chỉ tối đa 70.

## 5. Cách tự kiểm tra Lead của mình

### Cách 1: Xem trên bảng Lead
- Chuyển sang chế độ **Danh sách**
- Thêm cột **"Đầy đủ thông tin"** (icon ✅ hoặc ⚠️)
- Lọc các Lead ⚠️ → mở từng Lead bổ sung

### Cách 2: Xem trong Bảng điểm KPI
- **Menu CRM** → **Bảng điểm** → tab **A3**
- Hệ thống hiển thị danh sách Lead còn thiếu, chỉ rõ thiếu trường nào

## 6. Quy định xử lý các trường hợp đặc biệt

### 6.1. Khách hàng từ chối cung cấp email
- Vẫn ghi nhận Lead nhưng cố gắng xin lại ở lần liên hệ thứ 2
- Nếu sau 3 lần vẫn từ chối: báo trưởng nhóm để miễn trừ trường email

### 6.2. Khách hàng chưa quyết định địa điểm lắp đặt
- Ghi nhận địa chỉ tạm (vd: "Q1, sẽ xác nhận sau khi chốt căn hộ")
- Cập nhật khi có thông tin chính thức

### 6.3. Mức độ ưu tiên ban đầu chưa rõ
- Mặc định để **Cold** khi mới tạo
- Sau cuộc gọi đầu tiên, cập nhật mức độ thật:
  - KH hỏi *"khi nào có thể lắp được?"* → **Hot**
  - KH bảo *"để tôi cân nhắc"* → **Warm**
  - KH hỏi giá tham khảo → **Cold**

## 7. Khuyến nghị thực hành

- Sau mỗi cuộc gọi, dành **30 giây** cập nhật thông tin còn thiếu
- Cuối mỗi tuần, lọc các Lead còn thiếu thông tin và xử lý
- Cài đặt nhắc nhở cá nhân lúc 17:00 hàng ngày: "Kiểm tra Lead có đầy đủ thông tin chưa?"

## 8. Tóm tắt

1. **6 trường bắt buộc**: SĐT, Email, Địa chỉ, Nguồn, Loại sản phẩm, Mức độ
2. KPI A3 = % Lead đầy đủ thông tin
3. A3 < 80% → **CAP điểm tháng tối đa 70**
4. Tự kiểm tra hàng tuần, xử lý sớm
$md$,
  'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&q=80',
  $j$[]$j$::jsonb,
  8,
  ARRAY['lead','kpi','quy-dinh'],
  true,
  4,
  true,
  now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, content_md = EXCLUDED.content_md,
  cover_image_url = EXCLUDED.cover_image_url, attachments = EXCLUDED.attachments,
  duration_minutes = EXCLUDED.duration_minutes, tags = EXCLUDED.tags,
  is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();

-- ══════════════════════════════════════════════════════════════════════════
-- BÀI 05 — Nhiệm vụ trên Lead
-- ══════════════════════════════════════════════════════════════════════════
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000001-0000-0000-0000-000000000005',
  'd2000001-0000-0000-0000-000000000001',
  'Bài 5: Nhiệm vụ trên Lead — cách tạo và quản lý',
  'Khái niệm nhiệm vụ CRM, ba cách tạo, các trạng thái, deadline và cờ chặn giai đoạn.',
  $md$# Bài 5 — Nhiệm vụ trên Lead

## 1. Khái niệm

**Nhiệm vụ** (task) là một công việc cụ thể cần thực hiện trong quá trình chăm sóc Lead. Mỗi Lead thường có nhiều nhiệm vụ, ví dụ với một Lead tủ bếp:

- Gọi xác nhận thông tin trong vòng 5 phút
- Gửi catalogue mẫu tủ bếp qua Zalo
- Đặt lịch đo đạc tại công trình
- Đến đo đạc, chụp ảnh hiện trạng
- Soạn báo giá theo bản vẽ
- Gửi báo giá qua email
- Theo dõi phản hồi sau 2 ngày
- Soạn hợp đồng
- Nhận đặt cọc 50%

## 2. Ba cách tạo nhiệm vụ

### Cách 1: Tạo thủ công từng nhiệm vụ
- Mở chi tiết Lead → tab **"Nhiệm vụ"** → bấm **"+ Thêm"**
- Nhập nội dung, hạn chót, người thực hiện
- Bấm Lưu

### Cách 2: Sinh từ mẫu nhiệm vụ
Trưởng nhóm đã cấu hình sẵn các **mẫu chuẩn** cho từng giai đoạn. Ví dụ mẫu "Tủ bếp — Lead Hot" gồm 5 nhiệm vụ:

1. Gọi xác nhận trong 5 phút
2. Gửi catalogue trong 30 phút
3. Đặt lịch đo trong ngày
4. Đo đạc trong 2 ngày
5. Báo giá trong 1 ngày sau đo

Thao tác: tab Nhiệm vụ → **"Lấy từ mẫu"** → chọn mẫu phù hợp → hệ thống tạo toàn bộ nhiệm vụ một lúc.

### Cách 3: Tự động sinh khi chuyển giai đoạn
Khi kéo Lead sang giai đoạn mới (ví dụ từ "Đã liên hệ" sang "Đã đo đạc"), hệ thống **tự thêm** các nhiệm vụ phù hợp với giai đoạn đó. Nhân viên không cần thao tác.

## 3. Các trạng thái nhiệm vụ

```
Chưa làm  →  Đang làm  →  Hoàn thành
                  ↓
              Đã huỷ
```

| Trạng thái | Ý nghĩa |
|---|---|
| **Chưa làm** | Mặc định khi tạo |
| **Đang làm** | Tự động chuyển khi nhân viên mở nhiệm vụ |
| **Hoàn thành** | Khi bấm "Hoàn thành" (xem Bài 6 về điều kiện) |
| **Đã huỷ** | Khi không cần thực hiện nữa (kèm lý do) |

## 4. Hạn chót — quan trọng cho KPI

Mỗi nhiệm vụ có **ngày và giờ phải hoàn thành**. Hệ thống xử lý hạn chót như sau:

| Thời điểm | Hành động |
|---|---|
| Trước hạn 3 ngày | Thông báo nhắc trên app + email |
| Trước hạn 1 ngày | Thông báo khẩn (đỏ) |
| Quá hạn | **Trừ 1 điểm KPI mỗi 24h** cho đến khi hoàn thành |
| Quá hạn > 7 ngày | Trưởng nhóm nhận báo cáo |

**Khuyến nghị:** Không bao giờ để nhiệm vụ quá hạn. Nếu không kịp, **sửa deadline trước khi quá hạn** (có ghi lại log).

## 5. Nhiệm vụ "chặn giai đoạn"

Một số nhiệm vụ được đánh dấu **"chặn giai đoạn"** — nghĩa là Lead **không thể chuyển sang giai đoạn tiếp** nếu nhiệm vụ này chưa hoàn thành.

Ví dụ trong quy trình tủ bếp:

| Giai đoạn | Nhiệm vụ chặn |
|---|---|
| Đã đo đạc | "Đến đo đạc tại công trình" — phải hoàn thành mới chuyển được |
| Đã báo giá | "Gửi báo giá có dấu xác nhận của trưởng phòng" |
| Đã đồng ý | "Nhận đặt cọc tối thiểu 50%" |

Đây là cơ chế **kiểm soát chất lượng quy trình** — đảm bảo nhân viên không nhảy bước.

## 6. Hoàn thành nhiều nhiệm vụ cùng lúc

Khi có nhiều nhiệm vụ cần đóng cuối ngày:

- Tab Nhiệm vụ → tick chọn nhiều nhiệm vụ
- Bấm **"Hoàn thành đã chọn"**

**Lưu ý:** Một số nhiệm vụ yêu cầu ghi chú và file đính kèm mới hoàn thành được. Hệ thống sẽ pass các nhiệm vụ đủ điều kiện và **trả lại** các nhiệm vụ còn thiếu để bạn bổ sung. Chi tiết xem Bài 6.

## 7. Phân loại nhiệm vụ theo giai đoạn

Khi tạo nhiệm vụ, có thể gán nó thuộc giai đoạn nào — giúp lọc và báo cáo:

- Nhiệm vụ "Gọi xác nhận" → giai đoạn "Đã liên hệ"
- Nhiệm vụ "Đo đạc" → giai đoạn "Đã đo đạc"
- Nhiệm vụ "Gửi báo giá" → giai đoạn "Đã báo giá"

## 8. Lịch trình mẫu trong ngày

| Thời gian | Hoạt động |
|---|---|
| 09:00 | Mở app, xem danh sách nhiệm vụ hôm nay |
| 09:15 — 11:30 | Thực hiện các nhiệm vụ ưu tiên Hot |
| 13:30 — 15:00 | Gửi báo giá, soạn hợp đồng |
| 15:00 — 16:30 | Đi đo đạc (nếu có lịch) |
| 16:30 — 17:00 | Cập nhật ghi chú, upload file cho các việc đã làm |
| 17:00 | Đóng các nhiệm vụ trong ngày |

## 9. Tóm tắt

- Nhiệm vụ = công việc cụ thể cần làm cho 1 Lead
- **3 cách tạo**: thủ công / từ mẫu / tự động khi chuyển giai đoạn
- Đặt **hạn chót thực tế**; quá hạn = trừ điểm
- Một số nhiệm vụ **chặn giai đoạn** — bắt buộc hoàn thành trước khi chuyển
- Bài 6 sẽ hướng dẫn **chi tiết** cách hoàn thành nhiệm vụ đúng quy định
$md$,
  'https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=1200&q=80',
  $j$[
    {"type":"image","url":"https://images.unsplash.com/photo-1611224923853-80b023f02d71?w=1200&q=80","caption":"Danh sách nhiệm vụ trên Lead"}
  ]$j$::jsonb,
  10,
  ARRAY['lead','task','quy-trinh'],
  true,
  5,
  true,
  now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, content_md = EXCLUDED.content_md,
  cover_image_url = EXCLUDED.cover_image_url, attachments = EXCLUDED.attachments,
  duration_minutes = EXCLUDED.duration_minutes, tags = EXCLUDED.tags,
  is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();

-- ══════════════════════════════════════════════════════════════════════════
-- BÀI 06 ⭐ — Quy định hoàn thành nhiệm vụ
-- ══════════════════════════════════════════════════════════════════════════
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000001-0000-0000-0000-000000000006',
  'd2000001-0000-0000-0000-000000000001',
  'Bài 6 ⭐ : Quy định bắt buộc về ghi chú và file minh chứng khi hoàn thành nhiệm vụ',
  'BÀI QUAN TRỌNG NHẤT. Quy định ba cờ bắt buộc, quy trình hoàn thành đúng và hậu quả khi vi phạm.',
  $md$# Bài 6 ⭐ — Quy định hoàn thành nhiệm vụ

> **Đây là bài học bắt buộc và quan trọng nhất của khoá đào tạo. Nhân viên không nắm vững quy định này sẽ bị mất điểm KPI nghiêm trọng.**

## 1. Quy định chung

Đối với các nhiệm vụ được đánh dấu **"bắt buộc minh chứng"**, hệ thống yêu cầu nhân viên phải có **ghi chú** và/hoặc **file đính kèm** trước khi đóng nhiệm vụ. Trường hợp thiếu, hệ thống sẽ **từ chối** và giữ nhiệm vụ ở trạng thái cũ.

Thông báo hệ thống khi vi phạm:

```
❌ Nhiệm vụ này yêu cầu ghi chú khách hàng 
   và/hoặc minh chứng liên hệ mới hoàn thành được.
```

## 2. Lý do có quy định này

Quy định nhằm đảm bảo:

| Mục tiêu | Cụ thể |
|---|---|
| **Minh bạch** | Mọi tương tác với khách hàng đều có bằng chứng kiểm tra được |
| **Chất lượng dịch vụ** | Đo lường thực chất, không chỉ số lượng |
| **Bàn giao công việc** | Nhân viên kế nhiệm đọc được lịch sử đầy đủ |
| **Công bằng KPI** | Điểm số dựa trên hành động thực, không phải thao tác bấm phím |

## 3. Ba loại cờ minh chứng

Trưởng nhóm hoặc admin cấu hình một trong ba cờ cho từng mẫu nhiệm vụ:

### 3.1. Cờ "Bắt buộc ghi chú khách hàng"
- Yêu cầu: trường **"Ghi chú task"** không được để trống
- Hệ thống từ chối nếu ghi chú là "Done", "OK", "Xong" hoặc tương tự
- Ghi chú phải **mô tả thực chất** nội dung tương tác

### 3.2. Cờ "Bắt buộc minh chứng liên hệ"
- Yêu cầu: phải có **ghi chú** HOẶC **file đính kèm**
- File minh chứng có thể là: ảnh chụp tin nhắn Zalo, ảnh chụp Facebook Messenger, ảnh chụp lịch sử cuộc gọi, file ghi âm, PDF báo giá đã gửi

### 3.3. Cờ "Bắt buộc cả ghi chú và file"
- Yêu cầu: phải có **đầy đủ cả hai**
- Áp dụng cho các nhiệm vụ quan trọng: ký hợp đồng, nhận cọc, đo đạc tại công trình

## 4. Quy trình chuẩn để hoàn thành nhiệm vụ

### Bước 1: Mở nhiệm vụ
Vào chi tiết Lead → tab **Nhiệm vụ** → bấm vào dòng nhiệm vụ cần xử lý.

### Bước 2: Viết ghi chú khách hàng

Mở khung **"Ghi chú task"** và viết theo cấu trúc:

```
[Thời gian] - [Hành động] - [Kết quả]
```

**Ví dụ ghi chú đạt yêu cầu:**

> *"14h30 ngày 27/5 — Đã gọi anh Minh 0901xxx, anh đồng ý mẫu cửa nhôm Xingfa hệ 55 màu vân gỗ, giá 6.8 triệu/m². Hẹn đo đạc tại căn hộ Vinhomes Q9 vào 9h sáng thứ 7 (1/6). Anh yêu cầu thêm 2 cửa lùa cho phòng ngủ."*

> *"10h ngày 28/5 — Đến căn hộ chị Hoa Q5, đo đạc tủ bếp chữ L kích thước 3.6m × 2.1m. Chốt mẫu T-403 (vân gỗ óc chó), mặt đá Quartz trắng kem. Gửi báo giá trong ngày."*

**Ví dụ ghi chú không đạt:**

| ❌ Không đạt | Lý do |
|---|---|
| "Done" | Quá ngắn, không có nội dung |
| "OK" | Không mô tả gì |
| "Đã gọi" | Không nói gì đã trao đổi, kết quả ra sao |
| "Khách đồng ý" | Đồng ý gì? Giá bao nhiêu? Hẹn khi nào? |

### Bước 3: Đính kèm file minh chứng

- Bấm biểu tượng kẹp giấy 📎
- Chọn file từ máy tính / chụp ảnh trực tiếp trên điện thoại
- Có thể đính kèm nhiều file cùng lúc

**Các loại file minh chứng phù hợp với từng nhiệm vụ:**

| Loại nhiệm vụ | File minh chứng |
|---|---|
| Gọi điện | Ảnh chụp lịch sử cuộc gọi (có hiện SĐT khách + thời gian) |
| Nhắn Zalo/Messenger | Screenshot đoạn chat |
| Gửi email báo giá | File PDF báo giá + screenshot email đã gửi |
| Đo đạc công trình | Ảnh hiện trạng + biên bản đo có chữ ký KH |
| Ký hợp đồng | Bản scan hợp đồng đã ký |
| Nhận cọc | Biên lai chuyển khoản / phiếu thu |

### Bước 4: Bấm "Hoàn thành"

Sau khi đủ ghi chú và file:
- Bấm nút **"Hoàn thành"**
- Trạng thái chuyển sang ✅ Hoàn thành
- KPI cộng **+1 điểm** nếu đúng hạn

## 5. Dấu hiệu nhận biết nhiệm vụ bắt buộc minh chứng

Trên giao diện, các nhiệm vụ bắt buộc minh chứng hiển thị badge cảnh báo:

- 🛡 — bắt buộc minh chứng liên hệ
- 📝 — bắt buộc ghi chú khách hàng
- 🔒 — bắt buộc cả ghi chú và file

Khi thấy các icon này, chuẩn bị sẵn nội dung trước khi bấm Hoàn thành.

## 6. Hậu quả khi không tuân thủ

| Hành vi | Hậu quả |
|---|---|
| Bấm Hoàn thành khi thiếu minh chứng | Bị từ chối, nhiệm vụ vẫn ở trạng thái cũ |
| Bỏ kệ nhiệm vụ bị từ chối | Quá hạn → -1 điểm KPI mỗi 24h |
| Ghi chú giả ("Done", "OK") | Hệ thống vẫn từ chối, đồng thời ghi log để trưởng nhóm review |
| Upload file không liên quan (ảnh meme, ảnh trắng) | Trưởng nhóm phát hiện qua audit → báo cáo kỷ luật |
| Nhờ đồng nghiệp đóng hộ | Hệ thống lưu tên người bấm — không thoát trách nhiệm |

## 7. Hoàn thành hàng loạt — xử lý lỗi

Khi tick chọn 10 nhiệm vụ và bấm "Hoàn thành đã chọn", nếu 3 nhiệm vụ thiếu minh chứng:

- 7 nhiệm vụ đủ điều kiện → đóng thành công
- 3 nhiệm vụ thiếu → **vẫn ở trạng thái cũ**, hệ thống hiển thị danh sách
- Mở từng nhiệm vụ, bổ sung và hoàn thành riêng

## 8. Quy chuẩn ghi chú theo từng loại nhiệm vụ

### 8.1. Gọi điện khách hàng

```
Thời gian gọi: [giờ ngày]
Người nghe: [Khách trực tiếp / người thân / không nghe máy]
Nội dung trao đổi: [tóm tắt 2-3 câu]
Kết quả: [khách đồng ý / cần suy nghĩ / từ chối]
Bước tiếp theo: [hẹn gì, làm gì]
```

### 8.2. Đo đạc công trình

```
Thời gian: [giờ ngày]
Địa điểm: [địa chỉ chi tiết]
Người tiếp: [tên KH + quan hệ]
Kích thước đo: [chi tiết các phép đo]
Mẫu chọn: [mã sản phẩm + màu]
Yêu cầu đặc biệt: [nếu có]
```

### 8.3. Gửi báo giá

```
Thời gian gửi: [giờ ngày]
Kênh: [Email / Zalo / Facebook]
Sản phẩm báo giá: [tên + số lượng + đơn giá]
Tổng giá trị: [số tiền]
Hiệu lực: [đến ngày nào]
```

## 9. Câu chuyện thực tế

Trong quá trình triển khai CRM tại các đơn vị tủ bếp/cửa nhôm, các trưởng phòng kinh doanh nhận xét:

> *"Ban đầu nhân viên phản đối quy định ghi chú vì thấy mất thời gian. Sau 3 tháng triển khai, chính nhân viên là người ủng hộ — vì khi tiếp nhận khách của đồng nghiệp nghỉ phép, họ đọc được toàn bộ lịch sử, không phải hỏi lại khách từ đầu. Khách cũng đánh giá cao tính chuyên nghiệp của đơn vị."*

## 10. Câu hỏi thường gặp

**Hỏi:** *"Tôi gọi mà khách không nghe máy, vẫn phải ghi chú không?"*
**Đáp:** Có. Ghi chú: *"Gọi 3 lần lúc 9h/14h/16h ngày 27/5, KH không nghe máy. Đã nhắn Zalo, đợi phản hồi."* Đính kèm screenshot tin nhắn Zalo.

**Hỏi:** *"Tôi chỉ vừa nhắn Zalo, chưa gọi điện, có hoàn thành nhiệm vụ 'Liên hệ KH' được không?"*
**Đáp:** Được, miễn là có screenshot tin nhắn Zalo và ghi chú nội dung.

**Hỏi:** *"Tôi hoàn thành nhiệm vụ đúng quy trình nhưng vẫn bị từ chối, làm sao?"*
**Đáp:** Đọc thông báo lỗi chi tiết. Nếu vẫn không hiểu, chụp màn hình gửi cho trưởng nhóm hoặc bộ phận hỗ trợ hệ thống.

## 11. Tóm tắt

> **Trước khi bấm "Hoàn thành" bất kỳ nhiệm vụ nào, luôn tự kiểm tra:**
> 1. Đã ghi chú đầy đủ theo cấu trúc chưa?
> 2. Đã đính kèm file minh chứng (nếu cần) chưa?
> 3. Ghi chú có mô tả thực chất nội dung không?

- Có **3 cờ kiểm soát**: ghi chú / minh chứng / cả hai
- Vi phạm = bị từ chối + có khả năng trừ điểm KPI
- Quy trình đúng: **ghi chú → đính kèm → hoàn thành**
- **Không có cách lách**, mọi thao tác đều có log
$md$,
  'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=1200&q=80',
  $j$[
    {"type":"image","url":"https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=1200&q=80","caption":"Quy trình hoàn thành nhiệm vụ đúng quy định"},
    {"type":"image","url":"https://images.unsplash.com/photo-1557804506-669a67965ba0?w=1200&q=80","caption":"Ví dụ ghi chú đạt chuẩn"}
  ]$j$::jsonb,
  15,
  ARRAY['lead','task','minh-chung','quan-trong','quy-dinh'],
  true,
  6,
  true,
  now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, content_md = EXCLUDED.content_md,
  cover_image_url = EXCLUDED.cover_image_url, attachments = EXCLUDED.attachments,
  duration_minutes = EXCLUDED.duration_minutes, tags = EXCLUDED.tags,
  is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();

-- ══════════════════════════════════════════════════════════════════════════
-- BÀI 07 — Ghi chú & tài liệu
-- ══════════════════════════════════════════════════════════════════════════
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000001-0000-0000-0000-000000000007',
  'd2000001-0000-0000-0000-000000000001',
  'Bài 7: Quản lý ghi chú và tài liệu trên Lead',
  'Phân biệt ba nơi lưu trữ, quy tắc đặt tên file, đồng bộ và bảo mật.',
  $md$# Bài 7 — Quản lý ghi chú và tài liệu

Trên mỗi Lead có **ba nơi** lưu ghi chú và file, mỗi nơi có chức năng riêng. Nhân viên cần phân biệt rõ để sử dụng đúng.

## 1. Ba nơi lưu trữ

### 1.1. Ghi chú trong nhiệm vụ
- **Mục đích:** ghi nhận chi tiết thao tác cụ thể
- **Vị trí:** trong từng nhiệm vụ, khung "Ghi chú task"
- **Ví dụ:** *"Đã gọi anh Minh 14h30, anh đồng ý đo đạc thứ 7"*

### 1.2. File đính kèm nhiệm vụ
- **Mục đích:** lưu file/ảnh liên quan đến nhiệm vụ cụ thể
- **Vị trí:** trong từng nhiệm vụ, biểu tượng 📎
- **Ví dụ:** screenshot Zalo, ảnh đo đạc, lịch sử cuộc gọi

### 1.3. Tài liệu chính thức của Lead
- **Mục đích:** lưu các tài liệu áp dụng cho toàn Lead, không thuộc nhiệm vụ cụ thể
- **Vị trí:** tab **"Tài liệu"** trên chi tiết Lead
- **Ví dụ:** báo giá PDF chính thức, hợp đồng đã ký, bản vẽ kỹ thuật, biên bản nghiệm thu

## 2. Bảng phân loại

| Nội dung | Nơi lưu |
|---|---|
| "14h30 — Đã gọi KH, KH đồng ý giá" | Ghi chú nhiệm vụ |
| Screenshot Zalo cuộc trò chuyện | File nhiệm vụ |
| Báo giá PDF chính thức (có dấu) | Tài liệu Lead |
| Bản vẽ thiết kế tủ bếp | Tài liệu Lead |
| Ảnh chụp hiện trạng công trình | File nhiệm vụ đo đạc |
| Hợp đồng scan đã ký | Tài liệu Lead |
| Biên bản đo đạc viết tay | File nhiệm vụ đo đạc |

## 3. Cách upload file

### 3.1. Trên máy tính
- **Kéo thả** file từ máy vào khung upload, hoặc
- Bấm 📎 → chọn file từ máy tính

### 3.2. Trên điện thoại
- **Chụp ảnh trực tiếp** từ app (camera tích hợp)
- Hoặc chọn ảnh có sẵn trong thư viện
- Có thể chọn **nhiều ảnh cùng lúc** (đo đạc thường có 5-10 ảnh)

### 3.3. Định dạng được hỗ trợ

| Loại | Định dạng |
|---|---|
| Ảnh | jpg, jpeg, png, webp, gif |
| Tài liệu | pdf, docx, xlsx, pptx |
| Video | mp4, mov (tối đa 100 MB/file) |
| Nén | zip, rar |

## 4. Quy tắc đặt tên file

### 4.1. Quy chuẩn chung
Format: `[Loại]_[KH/SP]_[ngày].đuôi`

### 4.2. Ví dụ áp dụng

| ❌ Không đạt | ✅ Đạt chuẩn |
|---|---|
| `IMG_0001.jpg` | `DoDac_chiHoa_27-05-2026_01.jpg` |
| `Untitled.pdf` | `BaoGia_TuBep_chiHoa_68tr_v1.pdf` |
| `Photo.png` | `Zalo_anhMinh_xacnhanlich.png` |
| `Scan.pdf` | `HopDong_chiHoa_kysoNgay30-05.pdf` |
| `1.jpg` | `MatBang_phongkhach_chuLong_truocLap.jpg` |

### 4.3. Lợi ích
- Sau 3 tháng, vẫn dễ tìm lại
- Đồng nghiệp tiếp nhận hiểu ngay nội dung file
- Tránh nhầm lẫn khi gửi cho khách hàng

## 5. Cơ chế đồng bộ

Hệ thống có **đồng bộ hai chiều**:
- Upload file vào nhiệm vụ → tự xuất hiện trong tab Tài liệu Lead
- Không cần upload hai lần
- Có thể xoá bản trong nhiệm vụ mà vẫn giữ trong Tài liệu Lead (và ngược lại)

## 6. Bảo mật và phân quyền

| Vai trò | Quyền truy cập file |
|---|---|
| Người phụ trách Lead | Xem, sửa, xoá toàn bộ |
| Thành viên Lead | Xem, thêm file mới |
| Trưởng nhóm | Xem, sửa toàn bộ Lead trong nhóm |
| Admin công ty | Xem toàn bộ trong công ty |
| Nhân viên công ty khác | Không truy cập được |

## 7. Lưu trữ và sao lưu

- File lưu trên hệ thống lưu trữ đám mây của công ty
- Sao lưu tự động hàng ngày
- Khi xoá Lead, file chuyển vào **thùng rác 30 ngày** — admin có thể khôi phục

## 8. Khuyến nghị

- Đặt **quy tắc đặt tên thống nhất** trong nhóm, tránh mỗi người một kiểu
- Upload file ngay khi vừa tạo (vd: chụp xong là upload, không để cuối ngày)
- Định kỳ dọn dẹp file rác (ảnh chụp nhầm, file thử)

## 9. Tóm tắt

- **Ba nơi lưu**: ghi chú nhiệm vụ / file nhiệm vụ / tài liệu Lead
- Việc cụ thể → ghi/upload trong nhiệm vụ
- Tài liệu chính thức → tab Tài liệu Lead
- **Đặt tên file theo quy chuẩn** để dễ tìm và bảo trì
$md$,
  'https://images.unsplash.com/photo-1568667256549-094345857637?w=1200&q=80',
  $j$[]$j$::jsonb,
  8,
  ARRAY['lead','tai-lieu','quy-tac'],
  false,
  7,
  true,
  now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, content_md = EXCLUDED.content_md,
  cover_image_url = EXCLUDED.cover_image_url, attachments = EXCLUDED.attachments,
  duration_minutes = EXCLUDED.duration_minutes, tags = EXCLUDED.tags,
  is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();

-- ══════════════════════════════════════════════════════════════════════════
-- BÀI 08 — Hoạt động và lịch sử
-- ══════════════════════════════════════════════════════════════════════════
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000001-0000-0000-0000-000000000008',
  'd2000001-0000-0000-0000-000000000001',
  'Bài 8: Lịch sử tương tác và các kênh ghi nhận',
  'Năm kênh ghi nhận trên Lead, quy chuẩn "lần đầu chạm" và quy tắc 5 phút.',
  $md$# Bài 8 — Lịch sử tương tác

Khi nhân viên bàn giao công việc (nghỉ phép, nghỉ việc, đổi vị trí), nhân viên kế nhiệm cần đọc được **toàn bộ lịch sử** tương tác với khách hàng. Hệ thống cung cấp 5 kênh ghi nhận:

## 1. Lịch sử hoạt động

Tab **"Hoạt động"** ghi lại các tương tác chính:

| Loại hoạt động | Khi nào dùng |
|---|---|
| Cuộc gọi | Sau mỗi cuộc gọi điện |
| Email | Sau khi gửi/nhận email với KH |
| Cuộc họp | Gặp mặt tại văn phòng KH hoặc showroom |
| Đo đạc | Đi đo tại công trình |
| Ghi chú khác | Các trao đổi khác (Zalo, Facebook) |

**Ví dụ ghi nhận đúng:**

```
[Cuộc gọi] 14h30 ngày 27/5/2026
Khách hàng: Chị Hoa Q5
Nội dung: Tư vấn 2 mẫu tủ bếp T-403 và T-512. 
         Chị chọn T-403. Hẹn đo đạc 9h thứ 7 (1/6).
Kết quả: Hot, dự kiến chốt trong tuần.
```

## 2. Ghi âm cuộc gọi

Nếu công ty trang bị tổng đài thông minh, mỗi cuộc gọi sẽ có **file ghi âm tự động**:

- Tab **"Ghi âm"** trên chi tiết Lead
- Bấm ▶️ để nghe lại
- Hữu ích khi cần xác minh nội dung trao đổi
- Một số hệ thống có **chuyển ngữ (transcript)** tự động

## 3. Chat nội bộ

Tab **"Chat"** dành cho **trao đổi giữa nhân viên** về Lead này.

> ⚠️ Đây **không phải** chat với khách hàng. Đây là kênh nội bộ giữa các nhân viên trong công ty.

**Ví dụ sử dụng:**

> *Nhân viên A:* "Khách này từng làm việc với mình 6 tháng trước, hỏi cửa nhôm cho biệt thự. Ai có kinh nghiệm tư vấn biệt thự, hỗ trợ giúp."
>
> *Trưởng phòng:* "Anh Phong từng phụ trách dự án biệt thự Phú Mỹ Hưng, tag @phong vào team."

## 4. Bình luận

Khác với chat ở chỗ có thể **trả lời từng comment (thread)**, gắn phản ứng (reaction) và tag tên đồng nghiệp.

Phù hợp khi cần **thảo luận có cấu trúc** về Lead phức tạp.

## 5. Thành viên và quyền truy cập

| Vai trò | Quyền |
|---|---|
| **Người phụ trách chính** | Toàn quyền |
| **Chủ sở hữu** (thường là trưởng nhóm) | Xem, sửa, chuyển nhân viên |
| **Thành viên hỗ trợ** | Xem, thêm ghi chú, tham gia chat |
| **Quan sát** (read-only) | Chỉ xem |

Hệ thống ghi nhận **"đã xem"** — biết ai vừa mở Lead lần cuối, lúc nào.

## 6. Quy tắc "Lần đầu chạm" (First Touch)

Hệ thống ghi nhận thời điểm **tương tác đầu tiên** với Lead — gọi là **"Lần đầu chạm"**:

```
Lần đầu chạm = thời điểm có hoạt động hoặc cuộc gọi đầu tiên
```

Chỉ số này tính từ thời điểm Lead được tạo:

| Thời gian phản hồi | Đánh giá |
|---|---|
| < 5 phút | Xuất sắc |
| 5 — 30 phút | Tốt |
| 30 phút — 2 giờ | Đạt |
| > 2 giờ | Không đạt — ảnh hưởng KPI B1 |

## 7. Quy tắc 5 phút

> **Khi nhận được Lead Hot, nhân viên kinh doanh phải gọi điện trong vòng 5 phút.**

**Lý do:**
- Khách hàng mới hỏi giá thường so sánh **2-3 đơn vị** cùng lúc
- Đơn vị phản hồi nhanh nhất chiếm **70% cơ hội**
- Nghiên cứu cho thấy tỷ lệ chốt đơn **cao gấp 9 lần** nếu gọi trong 5 phút so với sau 30 phút
- Trong ngành tủ bếp/cửa nhôm, giá trị đơn hàng cao (50-200 triệu), khách hàng kỹ tính — phản hồi nhanh thể hiện sự chuyên nghiệp

## 8. Phân biệt khi nào dùng kênh nào

| Tình huống | Kênh phù hợp |
|---|---|
| Ghi nhận đã gọi điện cho KH | Hoạt động + Ghi âm |
| Trao đổi nhanh với đồng đội | Chat nội bộ |
| Hỏi ý kiến trưởng nhóm có cấu trúc | Bình luận (tag @) |
| Lưu file PDF báo giá chính thức | Tài liệu Lead |
| Ghi chú việc làm cụ thể trong ngày | Ghi chú trong Nhiệm vụ |

## 9. Khuyến nghị thực hành

- **Ghi nhận hoạt động ngay** sau mỗi tương tác, không để cuối ngày
- Khi tiếp nhận Lead từ đồng nghiệp, **dành 10 phút đọc lịch sử** trước khi gọi KH
- Sử dụng **Chat nội bộ** thay vì gọi điện nhau cho mỗi câu hỏi nhỏ

## 10. Tóm tắt

- **5 kênh** ghi nhận: Hoạt động / Ghi âm / Chat nội bộ / Bình luận / Thành viên
- **Lần đầu chạm** ảnh hưởng trực tiếp KPI
- **Quy tắc 5 phút** với Lead Hot — bắt buộc tuân thủ
- Phân biệt rõ **chat nội bộ** với chat khách hàng
$md$,
  'https://images.unsplash.com/photo-1556761175-b413da4baf72?w=1200&q=80',
  $j$[]$j$::jsonb,
  9,
  ARRAY['lead','hoat-dong','quy-tac'],
  false,
  8,
  true,
  now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, content_md = EXCLUDED.content_md,
  cover_image_url = EXCLUDED.cover_image_url, attachments = EXCLUDED.attachments,
  duration_minutes = EXCLUDED.duration_minutes, tags = EXCLUDED.tags,
  is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();

-- ══════════════════════════════════════════════════════════════════════════
-- BÀI 09 — Hạn chót và SLA
-- ══════════════════════════════════════════════════════════════════════════
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000001-0000-0000-0000-000000000009',
  'd2000001-0000-0000-0000-000000000001',
  'Bài 9: Quản lý hạn chót và quy định SLA',
  'Hai loại hạn chót, cơ chế nhắc nhở, bảng SLA chuẩn và quy trình tránh trừ điểm.',
  $md$# Bài 9 — Quản lý hạn chót và SLA

**SLA** (Service Level Agreement) là **cam kết về thời gian xử lý** mà mỗi nhân viên phải tuân thủ. Vi phạm SLA = trừ KPI.

## 1. Hai loại hạn chót

### 1.1. Hạn của nhiệm vụ
- Mỗi nhiệm vụ có ngày + giờ phải hoàn thành
- Ví dụ: "Gửi báo giá cho chị Hoa trước 17h ngày 28/5"
- Quá hạn = trừ 1 điểm KPI mỗi 24h

### 1.2. Thời gian "treo" của Lead ở một giai đoạn
- Mỗi giai đoạn có quy định thời gian tối đa Lead được phép ở lại
- Ví dụ: Lead vào giai đoạn "Đã liên hệ" lúc 9h → nếu sau 5 ngày vẫn chưa chuyển giai đoạn → là **"treo"**
- Mặc định công ty cấu hình **7 ngày tối đa/giai đoạn**

## 2. Bảng SLA chuẩn ngành tủ bếp / cửa nhôm

| Giai đoạn | Thời gian tối đa | Lý do |
|---|---|---|
| Mới → Đã liên hệ | **1 ngày** | Khách cần phản hồi nhanh |
| Đã liên hệ → Đã đo đạc | **5 ngày** | Sắp xếp lịch đo |
| Đã đo đạc → Đã báo giá | **3 ngày** | Soạn báo giá kỹ thuật |
| Đã báo giá → Đã đồng ý | **14 ngày** | KH cần thời gian quyết định, so sánh |
| Đã đồng ý → Chuyển Deal | **3 ngày** | Hoàn tất hồ sơ |

## 3. Hệ thống cảnh báo bằng màu sắc

Mỗi nhiệm vụ/Lead hiển thị màu trạng thái:

| Màu | Tình trạng | Hành động cần |
|---|---|---|
| 🟢 Xanh | Còn nhiều thời gian (> 3 ngày) | Theo dõi bình thường |
| 🟡 Vàng | Sắp đến hạn (1-3 ngày) | Lên kế hoạch xử lý |
| 🟠 Cam | Cận hạn (< 1 ngày) | Ưu tiên xử lý ngay |
| 🔴 Đỏ | Đã quá hạn | Xử lý khẩn cấp |

## 4. Cơ chế nhắc nhở

| Thời điểm | Hình thức |
|---|---|
| 8h sáng hàng ngày | Email tổng hợp công việc trong ngày |
| Trước hạn 3 ngày | Thông báo nhẹ trên app |
| Trước hạn 1 ngày | Thông báo khẩn (đỏ) |
| Quá hạn | Thông báo đỏ + email báo cáo cho trưởng nhóm |
| Quá hạn 7 ngày | Báo cáo cấp cao hơn |

## 5. Tin nhắn Zalo tự động

Khi Lead vào một số giai đoạn (theo cấu hình của công ty), hệ thống có thể **tự động gửi tin Zalo** đến khách hàng. Ví dụ khi Lead chuyển sang "Đã liên hệ":

```
Chào anh/chị {Tên KH},

Em là {Tên NV} từ Công ty {Tên công ty}. 
Em đã nhận yêu cầu của anh/chị về {Loại sản phẩm}. 
Em sẽ liên hệ tư vấn chi tiết trong vòng {X} phút.

Trân trọng,
{Tên NV}
SĐT: {SĐT NV}
```

Mẫu tin này do trưởng nhóm/marketing cấu hình. Nhân viên chỉ cần kéo Lead đúng cột là tin tự gửi.

## 6. Trang theo dõi SLA cho trưởng nhóm

Trưởng nhóm và cấp quản lý có trang **"Cảnh báo SLA"**:
- Hiển thị Lead và nhiệm vụ sắp/đã quá hạn
- Sắp xếp theo "còn bao lâu / đã quá bao lâu"
- Có thể gửi nhắc nhở hàng loạt

Khuyến nghị: nhân viên nên **chủ động** kiểm tra trang này hàng ngày, không đợi trưởng nhóm nhắc.

## 7. Quy trình phòng tránh vi phạm SLA

### 7.1. Lập kế hoạch hàng ngày
- Mỗi sáng 9h, mở app và xem danh sách công việc
- Sắp xếp theo độ ưu tiên: đỏ → cam → vàng → xanh
- Khoá lịch các nhiệm vụ quan trọng vào thời gian phù hợp

### 7.2. Đặt deadline thực tế
- Không đặt "gọi KH 14h" rồi 16h mới gọi
- Đặt deadline có buffer thời gian phù hợp với khối lượng công việc

### 7.3. Sửa deadline đúng cách
Khi chắc chắn không kịp xử lý:
- Mở nhiệm vụ → đổi ngày hạn **TRƯỚC** khi quá hạn
- Ghi lý do trong ghi chú
- **Không sửa deadline khi đã quá hạn** — vẫn bị ghi log và trừ điểm

### 7.4. Xử lý Lead "treo" lâu do khách hàng
Một số Lead khách hàng yêu cầu chờ (vd: chờ duyệt ngân sách 2 tuần):
- Chuyển Lead sang giai đoạn phù hợp (vd: "Đang theo dõi")
- Đặt nhắc cá nhân để gọi lại đúng thời điểm
- Không để Lead "treo" tại giai đoạn cũ gây trừ điểm

## 8. Tóm tắt

- Có **2 loại hạn**: hạn nhiệm vụ + hạn Lead ở giai đoạn
- Mỗi giai đoạn ngành tủ bếp/cửa nhôm có **SLA chuẩn riêng**
- Hệ thống cảnh báo bằng **màu sắc** và thông báo
- **Chủ động sửa deadline** trước khi quá hạn — không để bị động
$md$,
  'https://images.unsplash.com/photo-1495364141860-b0d03eccd065?w=1200&q=80',
  $j$[]$j$::jsonb,
  9,
  ARRAY['lead','sla','deadline'],
  true,
  9,
  true,
  now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, content_md = EXCLUDED.content_md,
  cover_image_url = EXCLUDED.cover_image_url, attachments = EXCLUDED.attachments,
  duration_minutes = EXCLUDED.duration_minutes, tags = EXCLUDED.tags,
  is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();

-- ══════════════════════════════════════════════════════════════════════════
-- BÀI 10 ⭐ — KPI
-- ══════════════════════════════════════════════════════════════════════════
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000001-0000-0000-0000-000000000010',
  'd2000001-0000-0000-0000-000000000001',
  'Bài 10 ⭐ : Hệ thống KPI và quy tắc cộng/trừ điểm',
  'BÀI QUAN TRỌNG. Hai cơ chế chấm điểm, bảng quy tắc chi tiết, quy tắc CAP và ví dụ thực tế.',
  $md$# Bài 10 ⭐ — Hệ thống KPI

> **Đây là bài quan trọng thứ hai của khoá. Nhân viên hiểu rõ cơ chế KPI sẽ chủ động bảo vệ điểm số và có chiến lược làm việc hiệu quả.**

## 1. KPI là gì?

**KPI** (Key Performance Indicator) là **chỉ số đo lường hiệu suất công việc**. Cuối mỗi tháng, hệ thống tự động chấm điểm cho nhân viên kinh doanh dựa trên hoạt động trong tháng.

| Mức điểm | Đánh giá | Ý nghĩa |
|---|---|---|
| 90 — 100 | Xuất sắc | Tăng lương, thưởng cao |
| 70 — 89 | Đạt yêu cầu | Lương thưởng bình thường |
| 50 — 69 | Cần cải thiện | Cảnh báo, có chương trình hỗ trợ |
| < 50 | Không đạt | Xét lại vị trí, có thể chấm dứt HĐ |

## 2. Hai cơ chế chấm điểm

### 2.1. Cơ chế sự kiện (real-time)
- Mỗi hành động → cộng/trừ điểm ngay lập tức
- Lưu trong **sổ cái sự kiện**
- Có thể xem lại từng dòng tại tab "Sổ KPI" trên chi tiết Lead

### 2.2. Cơ chế bảng tỷ lệ (cuối tháng)
- Cuối tháng tính tỷ lệ theo công thức (vd: % nhiệm vụ đúng hạn)
- Cập nhật vào **bảng điểm tháng** lúc 1h sáng mỗi đêm
- Có thể tính lại thủ công nếu cần

## 3. Bảng quy tắc cộng/trừ điểm (cơ chế sự kiện)

| Hành động | Điểm |
|---|---|
| Hoàn thành nhiệm vụ **đúng hạn** | **+1** |
| Hoàn thành nhiệm vụ **trễ** | **-1** + thêm -1 mỗi 24h trễ |
| Hoàn thành **sớm hơn 50% thời hạn** | **+2** (bonus) |
| Nhiệm vụ **quá hạn** chưa hoàn thành | **-1** mỗi 24h để treo |
| Lead **treo** một giai đoạn quá SLA | **-1** khi đóng giai đoạn |
| **Thắng Deal** (ký hợp đồng + nhận cọc) | **+10** |
| **Mất Deal** | **-1** |
| Chuyển Lead → Deal | **+3** |

## 4. Các chỉ số KPI tháng (cơ chế bảng tỷ lệ)

| Mã | Tên đầy đủ | Công thức | Trọng số |
|---|---|---|---|
| **A1** | Số Lead tạo mới | Đếm số Lead | Tham khảo |
| **A2** | Tỷ lệ thắng Deal | Win / (Win + Lost) | Cao |
| **A3** | Lead đầy đủ thông tin | Lead 6 trường đầy đủ / tổng Lead | Cao |
| **A4** | Nhiệm vụ đúng hạn | Nhiệm vụ đúng hạn / tổng nhiệm vụ | **Rất cao** |
| **A5** | Thời gian treo Lead | Trung bình ngày/giai đoạn | Trung bình |
| **A6** | Vi phạm SLA | Đếm số Lead/nhiệm vụ quá hạn | Trung bình |
| **B1** | Tiếp xúc thành công | % Lead có minh chứng liên hệ | Cao |
| **B6** | Lead chuyển Deal | Số Lead → Deal trong tháng | Cao |

## 5. Quy tắc CAP đặc biệt

> **Khi A4 (nhiệm vụ đúng hạn) < 80%, toàn bộ điểm KPI tổng của tháng đó bị giới hạn tối đa 70.**

Quy tắc này tương tự A3 (xem Bài 4). Lý do: hai chỉ số **A3 (đầy đủ thông tin)** và **A4 (đúng hạn)** thể hiện **kỷ luật cơ bản**. Không kỷ luật → các chỉ số khác cao bao nhiêu cũng không tin được.

## 6. Ví dụ thực tế

### Ví dụ 1: Nhân viên An — kết quả tốt

**Số liệu tháng 5:**
- Tạo 20 Lead mới, 18 Lead có đủ 6 thông tin
- Thực hiện 50 nhiệm vụ: 45 đúng hạn, 5 trễ trong vòng 24h
- Chuyển 6 Lead sang Deal
- Thắng 2 Deal (1 tủ bếp 85tr, 1 cửa nhôm 45tr)

**Tính điểm:**

| Chỉ số | Giá trị |
|---|---|
| A3 (đầy đủ thông tin) | 18/20 = 90% ✅ |
| A4 (đúng hạn) | 45/50 = 90% ✅ |
| Sổ cái sự kiện: 45 × (+1) + 5 × (-1) | **+40 điểm** |
| Bonus thắng Deal: 2 × (+10) | **+20 điểm** |
| Bonus chuyển Deal: 6 × (+3) | **+18 điểm** |

➡️ **Tổng cộng: ~ 78 điểm** — Đạt yêu cầu khá

### Ví dụ 2: Nhân viên Bình — vi phạm quy định

**Tình huống:**
- 10 nhiệm vụ cần minh chứng (gọi điện + ghi chú + file)
- Bình bấm Hoàn thành nhưng không upload file → **8 nhiệm vụ bị từ chối**
- Bình không xử lý tiếp → 8 nhiệm vụ treo 3 ngày

**Tính điểm:**

| Chỉ số | Giá trị |
|---|---|
| A4 (đúng hạn) | 2/10 = **20%** 🚨 |
| A3 (đầy đủ) | 10 Lead có nhiệm vụ chưa pass = **0%** 🚨 |
| Sổ cái sự kiện: +2 - 8 - 24 | **-30 điểm** |
| **CAP rule áp dụng** | Tổng tháng tối đa 70 |

➡️ Tháng đó Bình mất **rất nhiều điểm**, dù các Lead có tiềm năng vẫn không chuyển hoá được vì vi phạm quy định.

## 7. Bonus và streak

- **Bonus hoàn thành sớm:** Nhiệm vụ hoàn thành khi mới 50% thời hạn → +1 bonus
- **Streak không vi phạm:** 30 ngày liên tục không có vi phạm SLA → +5 điểm

## 8. Nơi xem điểm KPI

### 8.1. Bảng điểm cá nhân (chính)
**Menu CRM** → **Bảng điểm**

Hiển thị đầy đủ các chỉ số A1, A2, A3, A4, A5, A6, B1, B6 và tổng điểm tháng.

### 8.2. Sổ KPI từng Lead
Mở chi tiết Lead → tab **"Sổ KPI"**

Xem từng dòng cộng/trừ điểm phát sinh từ Lead này.

### 8.3. Bảng điểm cả công ty (admin)
**Menu CRM** → **Bảng điểm công ty**

So sánh điểm các nhân viên (chỉ admin/trưởng phòng).

## 9. Tính lại điểm

Nếu thấy điểm chưa cập nhật hoặc nghi ngờ sai:
- Vào Bảng điểm → bấm nút **"Tính lại"** ở góc
- Hệ thống tính lại trong 1-2 phút
- Nếu vẫn sai → báo bộ phận hỗ trợ kèm screenshot

## 10. Quy trình tối ưu hoá KPI hàng ngày

| Thời gian | Hoạt động |
|---|---|
| 09:00 | Mở Bảng điểm — kiểm tra A4 (đúng hạn) tháng này |
| 09:15 — 11:30 | Xử lý nhiệm vụ ưu tiên (Hot, Cận hạn) |
| 13:30 — 15:00 | Đo đạc / gặp khách (theo lịch) |
| 15:00 — 16:30 | Soạn báo giá / hợp đồng |
| 16:30 — 17:00 | **Cập nhật ghi chú + upload file** cho công việc đã làm |
| 17:00 | Đóng các nhiệm vụ trong ngày |
| 17:15 | Kiểm tra: A4 vẫn ≥ 80% chưa? |

## 11. Câu hỏi thường gặp

**Hỏi:** *"Tháng này tôi bệnh nghỉ phép 5 ngày, KPI sẽ bị ảnh hưởng thế nào?"*
**Đáp:** Trưởng phòng có thể áp dụng **miễn trừ** cho thời gian nghỉ phép có lý do chính đáng. Báo HR và trưởng nhóm trước.

**Hỏi:** *"Tôi tiếp nhận Lead giữa tháng từ đồng nghiệp, KPI tính sao?"*
**Đáp:** Hệ thống chỉ tính các hành động **từ ngày bạn nhận** trở đi. Hành động trước đó của đồng nghiệp không ảnh hưởng KPI của bạn.

**Hỏi:** *"Tôi không đồng ý với điểm chấm, khiếu nại như thế nào?"*
**Đáp:** Gặp trực tiếp trưởng phòng kinh doanh kèm bằng chứng cụ thể (screenshot, dữ liệu). Mọi khiếu nại sẽ được xem xét trong vòng 7 ngày làm việc.

## 12. Tóm tắt

- **Hai cơ chế** chấm điểm: sổ cái sự kiện (real-time) + bảng tỷ lệ (cuối tháng)
- **Đúng hạn = +1, Trễ = -1** — quy tắc đơn giản nhất
- A3, B1 cần **minh chứng từ nhiệm vụ** (xem Bài 6)
- **A4 < 80% → CAP điểm tháng max 70** — quy tắc nghiêm khắc nhất
- Theo dõi điểm **hàng ngày**, không đợi cuối tháng
$md$,
  'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&q=80',
  $j$[
    {"type":"image","url":"https://images.unsplash.com/photo-1543286386-713bdd548da4?w=1200&q=80","caption":"Bảng điểm KPI tháng"}
  ]$j$::jsonb,
  15,
  ARRAY['lead','kpi','quy-dinh','quan-trong'],
  true,
  10,
  true,
  now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, content_md = EXCLUDED.content_md,
  cover_image_url = EXCLUDED.cover_image_url, attachments = EXCLUDED.attachments,
  duration_minutes = EXCLUDED.duration_minutes, tags = EXCLUDED.tags,
  is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();

-- ══════════════════════════════════════════════════════════════════════════
-- BÀI 11 — Chuyển Lead → Deal
-- ══════════════════════════════════════════════════════════════════════════
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  video_url, video_type, cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000001-0000-0000-0000-000000000011',
  'd2000001-0000-0000-0000-000000000001',
  'Bài 11: Chuyển Lead thành Deal',
  'Điều kiện chuyển, quy trình thực hiện, các hành động tự động và lưu ý không có chức năng hoàn tác.',
  $md$# Bài 11 — Chuyển Lead thành Deal

Khi một Lead đã đáp ứng đủ điều kiện chốt đơn, nhân viên kinh doanh thực hiện thao tác **chuyển Lead thành Deal** để chính thức đưa vào quy trình bán hàng và sản xuất.

## 1. Điều kiện chuyển

### 1.1. Bắt buộc đáp ứng
- ✅ Khách hàng đã **đồng ý mua** (có ghi nhận cụ thể trong hoạt động/ghi chú)
- ✅ Đã thống nhất **3 yếu tố cốt lõi**:
  - Sản phẩm cụ thể (mẫu, mã, kích thước)
  - Số lượng (mét dài / cái)
  - Giá tổng
- ✅ Khách hàng đã tồn tại trong **danh bạ Customer** (có hồ sơ chính thức)
- ✅ Lead đầy đủ **6 thông tin bắt buộc** (xem Bài 4)

### 1.2. Khuyến nghị nên có
- Bản vẽ thiết kế đã được KH duyệt
- Lịch thi công dự kiến đã thống nhất
- Phương thức thanh toán đã thoả thuận

### 1.3. Trường hợp KHÔNG được chuyển
- ❌ KH chỉ mới **hỏi giá tham khảo**
- ❌ KH bảo *"để tôi cân nhắc"* — vẫn ở giai đoạn Lead
- ❌ Chưa có thông tin Customer chính thức trong hệ thống
- ❌ Đang tranh chấp giá, chưa thống nhất

## 2. Hai cách chuyển

### Cách 1: Kéo thẻ vào cột "Đã đồng ý"
- Trên bảng Kanban Lead, kéo thẻ vào cột "Đã đồng ý"
- Hệ thống hiển thị hộp thoại xác nhận: *"Bạn có muốn chuyển Lead này thành Deal?"*
- Điền thông tin trong hộp thoại:
  - Pipeline Deal (nếu công ty có nhiều)
  - Người phụ trách Deal
  - Người chủ sở hữu Deal
- Bấm **"Xác nhận chuyển Deal"**

### Cách 2: Nút "Chuyển Deal" trên chi tiết Lead
- Mở chi tiết Lead
- Nút **"Chuyển Deal"** ở góc phải trên
- Hiển thị hộp thoại tương tự cách 1

## 3. Các hành động tự động của hệ thống

Sau khi nhân viên xác nhận chuyển, hệ thống thực hiện đồng thời:

| Thứ tự | Hành động |
|---|---|
| 1 | Đổi loại từ Lead → Deal (giữ nguyên mã `LEAD-XXX`) |
| 2 | Đặt Deal vào cột đầu tiên của pipeline Deal |
| 3 | Bắt đầu đếm lại thời gian ở cột mới |
| 4 | Gán đúng người phụ trách + chủ sở hữu Deal |
| 5 | Gửi thông báo cho người phụ trách qua app |
| 6 | Sao chép toàn bộ tài liệu Lead sang Deal |
| 7 | Tự động tạo các nhiệm vụ mới cho Deal (xác nhận đơn, soạn hợp đồng, nhận cọc, …) |
| 8 | Ghi nhận sự kiện "Chuyển Lead → Deal" vào lịch sử hoạt động |
| 9 | Cộng **+3 điểm KPI** cho người phụ trách (chỉ số B6) |
| 10 | Cập nhật bảng tổng quan công ty real-time |

## 4. Điểm cần lưu ý

### 4.1. Mã định danh giữ nguyên
Sau khi chuyển, Lead → Deal vẫn dùng **cùng mã** (vd: `LEAD-2026-047`). Toàn bộ lịch sử tương tác, ghi chú, file, hoạt động đều **được giữ nguyên**. Khi truy cập lại với mã này, hệ thống tự nhận đây là Deal.

### 4.2. Vị trí hiển thị sau chuyển
- **Tab Lead** không còn hiển thị (do đã chuyển sang Deal)
- **Tab Deal** xuất hiện
- Chi tiết Deal có thêm các tab mới: "Phê duyệt", "Điểm Deal", "Sản xuất", "Vận chuyển"

### 4.3. KHÔNG CÓ CHỨC NĂNG HOÀN TÁC

> ⚠️ Hệ thống **không có nút "Hoàn tác chuyển Deal"**. Sau khi đã chuyển, không thể tự động chuyển ngược lại Lead.

**Quy trình xử lý nếu lỡ chuyển nhầm:**
- Báo trưởng phòng / admin trong vòng 24h
- Admin can thiệp qua công cụ quản trị nội bộ
- Hoặc tạo Lead mới và liên kết với Deal cũ

➡️ **Khuyến nghị: Luôn kiểm tra kỹ checklist 7 mục (xem bài tập) trước khi bấm chuyển.**

## 5. Các lỗi thường gặp khi chuyển

### 5.1. "Phải có khách hàng trong danh bạ"
**Nguyên nhân:** Lead chưa được liên kết với hồ sơ Customer chính thức.
**Xử lý:**
- Vào tab Khách hàng → tạo Customer mới
- Quay lại Lead → liên kết với Customer vừa tạo
- Thực hiện chuyển lại

### 5.2. "Pipeline Deal chưa có giai đoạn nào"
**Nguyên nhân:** Admin chưa cấu hình pipeline Deal cho công ty.
**Xử lý:** Báo admin cấu hình → thực hiện sau.

### 5.3. "Bạn không có quyền chuyển Lead này"
**Nguyên nhân:** Bạn không phải người phụ trách Lead.
**Xử lý:** Nhờ người phụ trách hoặc trưởng nhóm thực hiện.

### 5.4. "Lead còn nhiệm vụ chặn chưa hoàn thành"
**Nguyên nhân:** Có nhiệm vụ cờ "chặn giai đoạn" chưa đóng.
**Xử lý:** Hoàn thành các nhiệm vụ đó (với đủ minh chứng) → chuyển lại.

## 6. Quy định về chuyển hàng loạt

Hiện tại hệ thống **không hỗ trợ chuyển nhiều Lead cùng lúc**. Lý do:
- Mỗi Deal cần xác nhận thông tin riêng (pipeline, người phụ trách, ghi chú đặc biệt)
- Chuyển hàng loạt dễ gây sai sót, khó kiểm soát chất lượng dữ liệu

## 7. Sau khi chuyển — các bước tiếp theo

Khi đã có Deal:
1. Hệ thống tự tạo các nhiệm vụ mới — bắt đầu xử lý theo thứ tự
2. Soạn và ký hợp đồng chính thức
3. Nhận cọc tối thiểu 50%
4. Bàn giao hồ sơ cho bộ phận sản xuất
5. Theo dõi tiến độ sản xuất qua tab "Sản xuất"
6. Theo dõi vận chuyển + lắp đặt qua tab "Vận chuyển"
7. Nghiệm thu cuối + thu nốt tiền

## 8. Tóm tắt

- Chuyển khi KH **đã đồng ý** + thống nhất sản phẩm/giá
- Bắt buộc có **Customer** trong danh bạ
- Hệ thống tự động thực hiện 10 hành động sau khi chuyển
- Mã giữ nguyên, lịch sử giữ nguyên
- **+3 điểm KPI** cho mỗi lần chuyển thành công
- **Không có hoàn tác** — kiểm tra kỹ trước khi bấm
$md$,
  'https://www.youtube.com/watch?v=mlOXkmrm7Ck',
  'youtube',
  'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=1200&q=80',
  $j$[]$j$::jsonb,
  10,
  ARRAY['lead','deal','chuyen-deal','quy-trinh'],
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

-- ══════════════════════════════════════════════════════════════════════════
-- BÀI 12 — Tình huống đặc biệt
-- ══════════════════════════════════════════════════════════════════════════
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000001-0000-0000-0000-000000000012',
  'd2000001-0000-0000-0000-000000000001',
  'Bài 12: Xử lý các tình huống đặc biệt (trùng lặp, mất Lead, mở lại, blocklist)',
  'Quy trình xử lý Lead trùng, đánh dấu chăm sóc, ghi nhận mất Lead, mở lại Lead và quản lý số spam.',
  $md$# Bài 12 — Xử lý các tình huống đặc biệt

Trong thực tế kinh doanh, không phải mọi Lead đều đi theo quy trình chuẩn. Bài này hướng dẫn xử lý các trường hợp ngoại lệ.

## 1. Lead trùng (cùng số điện thoại)

### 1.1. Nguyên nhân
- Khách gọi điện nhiều lần, mỗi lần nhân viên khác tiếp nhận và tạo Lead
- Khách vừa nhắn fanpage vừa gọi điện
- Đồng nghiệp không kiểm tra trùng trước khi tạo

### 1.2. Cách phát hiện
- Mở bảng Lead → menu ⋯ → bấm **"Quét trùng"**
- Hệ thống liệt kê các Lead có cùng SĐT hoặc email
- Hoặc xem cảnh báo "Trùng" trên thẻ Lead

### 1.3. Quy trình xử lý

| Tình huống | Hành động |
|---|---|
| 2 Lead cùng SĐT, cùng nhân viên phụ trách | **Merge** (gộp) — giữ Lead có nhiều ghi chú hơn |
| 2 Lead cùng SĐT, khác nhân viên | Báo trưởng nhóm phân xử |
| Cùng SĐT nhưng 2 KH khác nhau (vd: 2 anh em) | Ghi chú rõ trong Lead, không merge |
| 1 KH có 2 nhu cầu riêng (tủ bếp + cửa) | Tạo 2 Lead riêng, liên kết qua "Lead liên quan" |

## 2. Đánh dấu chăm sóc (Care Mark)

### 2.1. Mục đích
Khi gọi chăm sóc KH cũ định kỳ, đánh dấu để tránh gọi quá nhiều trong thời gian ngắn.

### 2.2. Cách sử dụng
- Mở Lead → bấm **"Đánh dấu đã chăm sóc"**
- Dấu có hiệu lực **30 ngày**
- Trong 30 ngày: Lead không hiển thị trong danh sách "Cần chăm sóc"

### 2.3. Nơi xem
**Menu CRM** → **Chăm sóc khách hàng cũ**

## 3. Mất Lead (Lost)

### 3.1. Khi nào đánh dấu mất
- KH thông báo không mua nữa
- KH đã chọn đối thủ
- KH thay đổi kế hoạch
- Không liên hệ được KH sau **3 lần** gọi + nhắn Zalo

### 3.2. Quy trình
- Kéo Lead sang cột **"Mất"**
- Hộp thoại yêu cầu chọn **lý do** (bắt buộc)

### 3.3. Bảng lý do mất chuẩn

| Lý do | Ảnh hưởng KPI | Ghi chú |
|---|---|---|
| Giá cao hơn đối thủ | -1 | Cần phân tích đối thủ |
| Đối thủ rẻ hơn cho cùng chất lượng | -1 | Báo marketing |
| KH thay đổi nhu cầu | 0 | Không trừ điểm |
| KH ngân sách không đủ | 0 | Không trừ điểm |
| Không liên hệ được | -1 | Cần cải tiến cách follow-up |
| Sản phẩm không phù hợp với yêu cầu | 0 | Báo bộ phận sản phẩm |
| Lý do khác | -1 | Bắt buộc ghi chú chi tiết |

### 3.4. Quy định ghi chú lý do mất
- Tối thiểu **3 câu** mô tả tình huống cụ thể
- Đính kèm screenshot tin nhắn cuối với KH (nếu có)
- Báo cáo định kỳ về lý do mất để cải tiến quy trình

## 4. Mở lại Lead

### 4.1. Khi nào
- KH cũ "mất" 3-6 tháng quay lại hỏi
- KH ban đầu mất do "không liên hệ được", nay liên hệ lại
- Phát hiện đánh giá "mất" sai

### 4.2. Quy trình
- Mở chi tiết Lead → bấm **"Mở lại Lead"** (quyền: chủ sở hữu hoặc admin)
- Hệ thống:
  - Chuyển Lead về cột **"Mới"**
  - Reset bộ đếm thời gian giai đoạn
  - Ghi nhận sự kiện "Mở lại Lead" vào lịch sử
  - Gán lại nhân viên (có thể đổi)

## 5. Quản lý số điện thoại spam

### 5.1. Các loại spam
- Đối thủ test cảnh báo phản hồi
- Bot Facebook tự động
- Số sai do KH bấm nhầm
- Telesales bán dịch vụ không liên quan

### 5.2. Quy trình chặn
- Trên Lead spam: bấm **"Chặn số này"**
- Hệ thống thêm SĐT vào **danh sách đen**
- Từ thời điểm này, **mọi Lead Facebook auto** với SĐT này sẽ bị chặn không tạo

### 5.3. Quản lý danh sách
**Menu CRM** → **Số điện thoại chặn**

Tại đây có thể xem, thêm, xoá số trong blocklist.

## 6. Xoá Lead

### 6.1. Quyền xoá
- Người phụ trách
- Trưởng nhóm
- Admin công ty

### 6.2. Quy trình
- Mở chi tiết Lead → ⋯ → **"Xoá Lead"**
- Hệ thống chuyển Lead vào **thùng rác 30 ngày**
- Trong 30 ngày: admin có thể khôi phục
- Sau 30 ngày: xoá vĩnh viễn

### 6.3. Khi nào nên xoá
- Lead tạo nhầm (KH ảo, test data)
- Lead trùng đã merge xong
- Lead spam đã chặn số

**Không nên xoá:** Lead "mất" thật — vẫn cần lưu cho báo cáo và mở lại sau.

## 7. Lead con (1 KH nhiều đơn)

### 7.1. Trường hợp áp dụng
KH lớn (chung cư, biệt thự, văn phòng) đặt nhiều đơn hàng cùng lúc:
- Đơn cha: "Hợp đồng tổng Chung cư Vinhomes Q9 — 50 căn"
- Đơn con: từng căn (50 đơn con riêng biệt)

### 7.2. Cách tổ chức
- Tạo Deal cha trước
- Mỗi căn → tạo Deal con, liên kết qua trường "Deal cha"
- Deal con **không hiển thị** trên bảng Kanban chính
- Xem trong tab "Đơn hàng" của Deal cha

### 7.3. Ưu điểm
- Quản lý dễ dàng các dự án lớn
- Báo cáo tổng hợp theo Deal cha
- Theo dõi tiến độ từng căn riêng biệt

## 8. Khuyến nghị duy trì chất lượng dữ liệu

| Tần suất | Hoạt động |
|---|---|
| Hàng ngày | Quét trùng SĐT khi tạo Lead mới |
| Hàng tuần (sáng thứ 2) | Quét trùng toàn bộ Lead trong tuần |
| Sau mỗi cuộc gọi CSKH | Đánh dấu "Đã chăm sóc" |
| Khi gặp số spam | Chặn ngay, không xoá Lead |
| Cuối tháng | Báo cáo lý do mất → phản hồi marketing/sản phẩm |

## 9. Tóm tắt

- **Quét trùng** trước khi tạo Lead — không tạo trùng SĐT
- **Care mark** giữ 30 ngày để tránh gọi chăm sóc quá nhiều
- **Mất Lead** bắt buộc ghi lý do cụ thể, đính kèm minh chứng
- **Mở lại Lead** khi KH cũ quay lại
- **Chặn số spam** thay vì xoá Lead nhiều lần
- **Lead con** cho khách hàng nhiều đơn cùng lúc
$md$,
  'https://images.unsplash.com/photo-1521791136064-7986c2920216?w=1200&q=80',
  $j$[]$j$::jsonb,
  9,
  ARRAY['lead','duplicate','lost','quy-trinh'],
  false,
  12,
  true,
  now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, content_md = EXCLUDED.content_md,
  cover_image_url = EXCLUDED.cover_image_url, attachments = EXCLUDED.attachments,
  duration_minutes = EXCLUDED.duration_minutes, tags = EXCLUDED.tags,
  is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();

-- ══════════════════════════════════════════════════════════════════════════
-- BÀI 13 ⭐⭐ — Bài thi tổng kết khoá học
-- ══════════════════════════════════════════════════════════════════════════
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000001-0000-0000-0000-000000000013',
  'd2000001-0000-0000-0000-000000000001',
  'Bài 13 🏆 : Bài thi tổng kết — Lead Master Certification',
  'Bài thi cuối khoá. Tổng hợp kiến thức từ Bài 1 đến Bài 12. Bắt buộc đạt 85% để nhận chứng nhận hoàn thành khoá học.',
  $md$# Bài 13 🏆 — Bài thi tổng kết

> **Chúc mừng bạn đã hoàn thành 12 bài học của khoá đào tạo "Lead — Khách hàng tiềm năng".** Bây giờ là bước cuối cùng: **Bài thi tổng kết**.

## 1. Mục đích

Bài thi này:
- **Đánh giá tổng hợp** kiến thức bạn đã tiếp thu từ Bài 1 đến Bài 12
- **Xác nhận năng lực** vận hành quy trình Lead trên hệ thống CRM của công ty
- **Là điều kiện bắt buộc** để được cấp Chứng nhận Lead Master

## 2. Cấu trúc bài thi

| Hạng mục | Chi tiết |
|---|---|
| Số câu hỏi | **20 câu** trắc nghiệm |
| Phạm vi | Toàn bộ 12 bài học |
| Thời gian làm bài | **30 phút** |
| Điểm đạt | **85/100** (đạt 17/20 câu trở lên) |
| Số lượt được làm | Tối đa **2 lượt** |
| Khoảng cách giữa 2 lượt | Tối thiểu 30 phút (khuyến nghị xem lại bài học) |

## 3. Phân bổ câu hỏi theo chủ đề

| Chủ đề | Số câu | Bài liên quan |
|---|---|---|
| Khái niệm Lead & tiếp nhận | 3 | Bài 1, 2 |
| Bảng Kanban & quy trình | 2 | Bài 3 |
| 6 thông tin bắt buộc & KPI A3 | 2 | Bài 4 |
| Nhiệm vụ — tạo, quản lý | 2 | Bài 5 |
| **Quy định minh chứng (cờ task)** | 3 | Bài 6 ⭐ |
| Tài liệu & hoạt động | 2 | Bài 7, 8 |
| SLA & deadline | 2 | Bài 9 |
| **Hệ thống KPI** | 2 | Bài 10 ⭐ |
| Chuyển Deal & tình huống đặc biệt | 2 | Bài 11, 12 |

## 4. Lưu ý quan trọng trước khi làm

### 4.1. Chuẩn bị tinh thần
- Tìm không gian yên tĩnh, tránh bị gián đoạn trong 30 phút
- Tắt thông báo điện thoại, đóng các tab không liên quan
- Chuẩn bị giấy bút ghi chú nếu cần

### 4.2. Ôn tập trước
Trước khi bấm "Bắt đầu", khuyến nghị xem lại 2 bài quan trọng nhất:
- **Bài 6** — Quy định hoàn thành nhiệm vụ (ghi chú + file)
- **Bài 10** — Hệ thống KPI và quy tắc cộng/trừ điểm

### 4.3. Quy chuẩn làm bài
- Đọc kỹ câu hỏi và TẤT CẢ các đáp án trước khi chọn
- Một số câu là "chọn nhiều đáp án" — chú ý dấu hiệu trong đề
- Có thể bỏ qua câu khó, quay lại sau (trong cùng lượt)
- Khi hết thời gian, hệ thống tự nộp bài

### 4.4. Trường hợp không đạt
- Sau lượt 1 không đạt: được làm lại lượt 2 sau **tối thiểu 30 phút**
- Sau lượt 2 vẫn không đạt: liên hệ trưởng phòng để được hỗ trợ đào tạo bổ sung
- Sau khi đào tạo bổ sung, admin có thể mở lại lượt thi (xét duyệt từng trường hợp)

## 5. Sau khi đạt bài thi

Hệ thống sẽ **tự động cấp Chứng nhận Lead Master** ngay lập tức với:

- 🏅 **Huy chương** của khoá học
- 📜 **Số chứng nhận** dạng `CN-2026-XXXXXX`
- 🔐 **Mã xác minh** 10 ký tự để xác thực
- 📅 Ngày cấp + ảnh huy chương
- 🖨️ Có thể **in ra giấy A4 ngang** để treo bàn làm việc

Chứng nhận này được lưu vĩnh viễn trong profile của bạn và hiển thị công khai trong **Mạng nội bộ** — đồng nghiệp có thể thấy thành tích của bạn.

## 6. Cam kết

> *"Tôi xác nhận đã đọc kỹ và hiểu toàn bộ 12 bài học. Tôi cam kết áp dụng đúng quy trình, ghi nhận đầy đủ minh chứng và tuân thủ các quy định về KPI trong quá trình làm việc."*

Sau khi hoàn thành bài thi và nhận chứng nhận, bạn chính thức trở thành **Lead Master** — chuyên viên kinh doanh được cấp chứng nhận của công ty.

Chúc bạn làm bài tốt!
$md$,
  'https://images.unsplash.com/photo-1606326608606-aa0b62935f2b?w=1200&q=80',
  $j$[
    {"type":"image","url":"https://images.unsplash.com/photo-1546410531-bb4caa6b424d?w=1200&q=80","caption":"Bài thi tổng kết Lead Master"}
  ]$j$::jsonb,
  5,
  ARRAY['lead','final-exam','certification','quan-trong'],
  true,
  13,
  true,
  now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, summary = EXCLUDED.summary, content_md = EXCLUDED.content_md,
  cover_image_url = EXCLUDED.cover_image_url, attachments = EXCLUDED.attachments,
  duration_minutes = EXCLUDED.duration_minutes, tags = EXCLUDED.tags,
  is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();

COMMIT;

-- ══════════════════════════════════════════════════════════════════════════
-- BÀI TẬP
-- ══════════════════════════════════════════════════════════════════════════
BEGIN;

-- ─── Ex 01: Quiz L1 ─────────────────────────────────────────────────────
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000001-0000-0000-0000-000000000001',
  'b2000001-0000-0000-0000-000000000001',
  'Bài kiểm tra: Khái niệm Lead',
  '5 câu trắc nghiệm về định nghĩa, phân biệt Lead/Deal/KH và vai trò người phụ trách.',
  'quiz',
  $j${
    "items": [
      {"id":"q1","question":"Theo định nghĩa, Lead là gì?","type":"single",
       "options":[
         "Khách hàng đã ký hợp đồng và đặt cọc",
         "Khách hàng tiềm năng đã tiếp xúc nhưng chưa cam kết mua",
         "Sản phẩm mới ra mắt",
         "Nhân viên mới vào công ty"],
       "correct":[1]},
      {"id":"q2","question":"Trường hợp nào sau đây là Lead?","type":"single",
       "options":[
         "Chị Hoa Q5 nhắn fanpage hỏi giá tủ bếp 3.6m chữ L",
         "Chị Hoa đã ký HĐ và chuyển khoản đặt cọc 50%",
         "Anh Tâm đã lắp xong tủ bếp 6 tháng trước",
         "Nhân viên giao hàng đến giao tủ bếp"],
       "correct":[0]},
      {"id":"q3","question":"Mỗi Lead có bao nhiêu người phụ trách CHÍNH?","type":"single",
       "options":["Cả phòng cùng phụ trách","Không có ai cụ thể","1 người","3-5 người"],
       "correct":[2]},
      {"id":"q4","question":"Lợi ích của việc dùng phần mềm CRM thay cho sổ tay? (chọn nhiều)","type":"multiple",
       "options":[
         "Phần mềm tự nhắc đúng hạn, không bỏ sót",
         "Đồng nghiệp tiếp nhận thấy toàn bộ lịch sử khi mình nghỉ",
         "Báo cáo tự động chính xác, không phải đếm tay",
         "KPI chấm minh bạch, công bằng"],
       "correct":[0,1,2,3]},
      {"id":"q5","question":"Vai trò 'chủ sở hữu Lead' thường là ai?","type":"single",
       "options":["Khách hàng","Trưởng nhóm kinh doanh","Bộ phận sản xuất","Kế toán"],
       "correct":[1]}
    ]
  }$j$::jsonb,
  70, null, 1
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, sort_order = EXCLUDED.sort_order, updated_at = now();

-- ─── Ex 02: Quiz L2 ─────────────────────────────────────────────────────
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000001-0000-0000-0000-000000000002',
  'b2000001-0000-0000-0000-000000000002',
  'Bài kiểm tra: Tiếp nhận và tạo Lead',
  '6 câu về 5 kênh tiếp nhận, thông tin bắt buộc và sai sót cần tránh.',
  'quiz',
  $j${
    "items": [
      {"id":"q1","question":"Có bao nhiêu kênh chính để Lead vào hệ thống?","type":"single",
       "options":["3","4","5","6"],"correct":[2]},
      {"id":"q2","question":"Thông tin BẮT BUỘC TỐI THIỂU khi tạo Lead?","type":"multiple",
       "options":["Tiêu đề Lead","Khách hàng","Mã số thuế","Tài khoản ngân hàng"],
       "correct":[0,1]},
      {"id":"q3","question":"Trước khi tạo Lead mới, bắt buộc phải làm gì?","type":"single",
       "options":[
         "Báo cáo trưởng nhóm",
         "Bấm 'Quét trùng' để kiểm tra SĐT có tồn tại chưa",
         "Tạo Customer trước",
         "Gọi điện khách trước"],
       "correct":[1]},
      {"id":"q4","question":"Tiêu đề Lead nào đạt yêu cầu?","type":"single",
       "options":[
         "Khách hỏi",
         "FB",
         "Chị Hoa Q5 — Tủ bếp chữ L 3.6m",
         "Lead mới"],
       "correct":[2]},
      {"id":"q5","question":"Sau khi tạo Lead, hệ thống tự động thực hiện những gì?","type":"multiple",
       "options":[
         "Sinh mã LEAD-YYYY-NNN",
         "Gán người phụ trách chính",
         "Đặt vào cột 'Mới'",
         "Tự gửi báo giá cho khách"],
       "correct":[0,1,2]},
      {"id":"q6","question":"Quy chuẩn thời gian phản hồi cho Lead HOT?","type":"single",
       "options":["Trong vòng 5 phút","Trong vòng 30 phút","Trong vòng 2 giờ","Trong vòng 1 ngày"],
       "correct":[0]}
    ]
  }$j$::jsonb,
  70, null, 1
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, sort_order = EXCLUDED.sort_order, updated_at = now();

-- ─── Ex 03: Checklist L2 ────────────────────────────────────────────────
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000001-0000-0000-0000-000000000003',
  'b2000001-0000-0000-0000-000000000002',
  'Checklist: 8 bước tạo Lead chuẩn',
  'Đánh dấu các bước bạn đã thực hành thành thạo. Mục tiêu: 8/8 sau 1 tuần.',
  'checklist',
  $j${
    "items": [
      {"id":"c1","text":"Bấm 'Quét trùng' kiểm tra SĐT trước khi tạo"},
      {"id":"c2","text":"Đặt tiêu đề theo format: [Tên KH] [Khu vực] — [Sản phẩm + kích thước]"},
      {"id":"c3","text":"Chọn đúng Customer trong danh bạ hoặc tạo mới"},
      {"id":"c4","text":"Nhập đầy đủ 10 số điện thoại"},
      {"id":"c5","text":"Chọn đúng Nguồn Lead từ danh sách"},
      {"id":"c6","text":"Chọn Loại sản phẩm (Tủ bếp / Cửa nhôm / Vách kính / ...)"},
      {"id":"c7","text":"Đặt Mức độ ưu tiên dựa trên cuộc trao đổi đầu tiên"},
      {"id":"c8","text":"Phản hồi KH trong thời gian quy định theo mức độ"}
    ]
  }$j$::jsonb,
  70, null, 2
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, sort_order = EXCLUDED.sort_order, updated_at = now();

-- ─── Ex 04: Quiz L3 ─────────────────────────────────────────────────────
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order,
  image_url
) VALUES (
  'c2000001-0000-0000-0000-000000000004',
  'b2000001-0000-0000-0000-000000000003',
  'Bài kiểm tra: Bảng Lead và chuyển giai đoạn',
  '7 câu về Kanban, các giai đoạn và quy trình chuyển.',
  'quiz',
  $j${
    "items": [
      {"id":"q1","question":"Một thẻ trên bảng Kanban biểu diễn gì?","type":"single",
       "options":["Một khách hàng đã mua","Một Lead hoặc Deal","Một nhiệm vụ","Một báo cáo"],
       "correct":[1]},
      {"id":"q2","question":"Khi kéo Lead vào cột 'Đã đồng ý', hệ thống làm gì?","type":"single",
       "options":[
         "Báo lỗi không cho kéo",
         "Hiển thị hộp thoại xác nhận chuyển thành Deal",
         "Xoá Lead",
         "Gửi email cho khách"],
       "correct":[1]},
      {"id":"q3","question":"Trường hợp nào KHÔNG kéo được Lead sang giai đoạn mới? (chọn nhiều)","type":"multiple",
       "options":[
         "Còn nhiệm vụ bắt buộc chưa hoàn thành",
         "Bạn không phải người phụ trách Lead",
         "Lead đã ở trạng thái Mất (cần Mở lại trước)",
         "Trời mưa to"],
       "correct":[0,1,2]},
      {"id":"q4","question":"Mặc định, Lead nên ở mỗi giai đoạn tối đa bao nhiêu ngày?","type":"single",
       "options":["1 ngày","3 ngày","7 ngày","30 ngày"],"correct":[2]},
      {"id":"q5","question":"Chế độ xem nào KHÔNG có trên bảng Lead?","type":"single",
       "options":["Kanban","Danh sách","Lịch","Bản đồ địa lý 3D"],"correct":[3]},
      {"id":"q6","question":"Khi đồng nghiệp kéo thẻ ở máy khác, bạn có cần F5 không?","type":"single",
       "options":[
         "Có, F5 mới thấy",
         "Không, hệ thống đồng bộ thời gian thực",
         "Chỉ thấy sau 1 giờ",
         "Phải đăng xuất đăng nhập lại"],
       "correct":[1]},
      {"id":"q7","question":"Bộ lọc nào nên BẬT MẶC ĐỊNH để tránh Lead spam?","type":"single",
       "options":[
         "Chỉ Lead có SĐT",
         "Chỉ Lead Hot",
         "Chỉ Lead Cold",
         "Chỉ Lead tạo hôm nay"],
       "correct":[0]}
    ]
  }$j$::jsonb,
  70, null, 1,
  'https://images.unsplash.com/photo-1572177812156-58036aae439c?w=1200&q=80'
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score, image_url = EXCLUDED.image_url,
  max_attempts = EXCLUDED.max_attempts, sort_order = EXCLUDED.sort_order, updated_at = now();

-- ─── Ex 05: Quiz L4 ─────────────────────────────────────────────────────
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000001-0000-0000-0000-000000000005',
  'b2000001-0000-0000-0000-000000000004',
  'Bài kiểm tra: 6 thông tin bắt buộc',
  '5 câu về quy định 6 trường thông tin và quy tắc cap điểm.',
  'quiz',
  $j${
    "items": [
      {"id":"q1","question":"Có bao nhiêu trường thông tin BẮT BUỘC trên mỗi Lead?","type":"single",
       "options":["3","4","6","10"],"correct":[2]},
      {"id":"q2","question":"Trường nào KHÔNG nằm trong 6 thông tin bắt buộc?","type":"single",
       "options":["Số điện thoại","Email","Địa chỉ lắp đặt","Ngày sinh khách hàng"],
       "correct":[3]},
      {"id":"q3","question":"Quy tắc CAP áp dụng khi A3 dưới bao nhiêu %?","type":"single",
       "options":["50%","70%","80%","90%"],"correct":[2]},
      {"id":"q4","question":"Khi A3 dưới ngưỡng, điểm KPI tháng tối đa là bao nhiêu?","type":"single",
       "options":["50","60","70","100"],"correct":[2]},
      {"id":"q5","question":"Khi KH từ chối cung cấp email, nên xử lý thế nào?","type":"single",
       "options":[
         "Bỏ trống vĩnh viễn",
         "Tự bịa một email giả",
         "Xin lại lần liên hệ thứ 2, sau 3 lần xin trưởng nhóm miễn trừ",
         "Báo sếp huỷ Lead"],
       "correct":[2]}
    ]
  }$j$::jsonb,
  70, null, 1
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, sort_order = EXCLUDED.sort_order, updated_at = now();

-- ─── Ex 06: Checklist L4 ────────────────────────────────────────────────
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000001-0000-0000-0000-000000000006',
  'b2000001-0000-0000-0000-000000000004',
  'Tự kiểm tra: 6 thông tin Lead của bạn',
  'Mở 1 Lead bất kỳ → tự kiểm tra đủ 6 trường thông tin chưa.',
  'checklist',
  $j${
    "items": [
      {"id":"c1","text":"Số điện thoại đầy đủ 10 chữ số, định dạng đúng"},
      {"id":"c2","text":"Email định dạng hợp lệ"},
      {"id":"c3","text":"Địa chỉ lắp đặt chi tiết đến quận/huyện"},
      {"id":"c4","text":"Nguồn Lead đã chọn từ danh sách chuẩn"},
      {"id":"c5","text":"Loại sản phẩm đã chọn (Tủ bếp / Cửa nhôm / ...)"},
      {"id":"c6","text":"Mức độ ưu tiên đã đặt sau cuộc trao đổi đầu tiên"}
    ]
  }$j$::jsonb,
  70, null, 2
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, sort_order = EXCLUDED.sort_order, updated_at = now();

-- ─── Ex 07: Checklist L5 ────────────────────────────────────────────────
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000001-0000-0000-0000-000000000007',
  'b2000001-0000-0000-0000-000000000005',
  'Checklist: 10 thói quen vận hành nhiệm vụ',
  'Các thói quen chuẩn của nhân viên kinh doanh ngành tủ bếp/cửa nhôm.',
  'checklist',
  $j${
    "items": [
      {"id":"c1","text":"9h sáng mở app, xem danh sách nhiệm vụ ưu tiên trong ngày"},
      {"id":"c2","text":"Chuyển nhiệm vụ sang 'Đang làm' trước khi thực hiện"},
      {"id":"c3","text":"Đọc lịch sử ghi chú cũ trước khi gọi/gặp KH"},
      {"id":"c4","text":"Ghi chú nội dung ngay sau khi tương tác (trong 5 phút)"},
      {"id":"c5","text":"Đính kèm minh chứng (Zalo screenshot, ảnh đo đạc, ...) đầy đủ"},
      {"id":"c6","text":"Chỉ bấm Hoàn thành khi đã đủ ghi chú + file"},
      {"id":"c7","text":"Kiểm tra nhiệm vụ có cờ chặn giai đoạn trước khi kéo Lead"},
      {"id":"c8","text":"Tạo nhiệm vụ tiếp theo khi đóng nhiệm vụ hiện tại"},
      {"id":"c9","text":"16h review các Lead cần follow-up trong ngày"},
      {"id":"c10","text":"Trước khi nghỉ, không để nhiệm vụ nào quá hạn"}
    ]
  }$j$::jsonb,
  70, null, 1
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, sort_order = EXCLUDED.sort_order, updated_at = now();

-- ─── Ex 08: ⭐ Quiz NGHIÊM L6 ───────────────────────────────────────────
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order
) VALUES (
  'c2000001-0000-0000-0000-000000000008',
  'b2000001-0000-0000-0000-000000000006',
  '⭐ Kiểm tra NGHIÊM: Quy định hoàn thành nhiệm vụ',
  'Bài kiểm tra bắt buộc của khoá. 8 câu, đạt 80%, giới hạn 15 phút, tối đa 3 lượt.',
  'quiz',
  $j${
    "items": [
      {"id":"q1","question":"Mục đích chính của quy định bắt buộc ghi chú + file?","type":"multiple",
       "options":[
         "Đảm bảo minh bạch — mọi tương tác có bằng chứng",
         "Đo lường chất lượng dịch vụ, không chỉ số lượng",
         "Gây khó dễ cho nhân viên",
         "Giúp đồng nghiệp tiếp nhận có lịch sử đầy đủ"],
       "correct":[0,1,3]},
      {"id":"q2","question":"Ghi chú nào ĐẠT YÊU CẦU?","type":"single",
       "options":[
         "Done",
         "OK",
         "14h30 — Đã gọi anh Minh, anh đồng ý mẫu cửa Xingfa hệ 55 màu vân gỗ 6.8tr/m², hẹn đo đạc 9h thứ 7",
         "Khách đồng ý rồi"],
       "correct":[2]},
      {"id":"q3","question":"Cờ 'Bắt buộc ghi chú khách hàng' yêu cầu gì?","type":"single",
       "options":[
         "Phải có ít nhất 1 file đính kèm",
         "Trường ghi chú task không được trống, phải mô tả thực chất",
         "Phải có chữ ký KH",
         "Phải có hợp đồng"],
       "correct":[1]},
      {"id":"q4","question":"Khi bấm Hoàn thành mà thiếu minh chứng, hệ thống làm gì?","type":"single",
       "options":[
         "Vẫn cho qua",
         "Hiển thị thông báo lỗi và giữ nhiệm vụ ở trạng thái cũ",
         "Tự ghi chú giùm",
         "Gửi email khiếu nại cho trưởng phòng"],
       "correct":[1]},
      {"id":"q5","question":"Nếu bỏ kệ nhiệm vụ bị từ chối quá hạn 5 ngày, KPI bị?","type":"single",
       "options":[
         "Không sao cả",
         "-5 điểm (1 điểm mỗi 24h)",
         "Bị khoá tài khoản",
         "Phải đào tạo lại"],
       "correct":[1]},
      {"id":"q6","question":"Hoàn thành hàng loạt 10 nhiệm vụ, 3 nhiệm vụ thiếu minh chứng. Kết quả?","type":"single",
       "options":[
         "Cả 10 cùng bị fail",
         "Cả 10 cùng pass",
         "7 pass + 3 giữ ở trạng thái cũ để bổ sung",
         "Hệ thống treo"],
       "correct":[2]},
      {"id":"q7","question":"Quy tắc 5 phút: gọi Lead Hot trong 5 phút tăng tỷ lệ chốt gấp mấy lần so với gọi sau 30 phút?","type":"single",
       "options":["2 lần","5 lần","9 lần","20 lần"],
       "correct":[2]},
      {"id":"q8","question":"File minh chứng phù hợp cho nhiệm vụ 'Đo đạc công trình' là gì?","type":"multiple",
       "options":[
         "Ảnh hiện trạng",
         "Biên bản đo có chữ ký KH",
         "Ảnh meme vui",
         "Screenshot Zalo hẹn lịch đo"],
       "correct":[0,1,3]}
    ]
  }$j$::jsonb,
  80, 3, 15, 1
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, updated_at = now();

-- ─── Ex 09: Essay L6 ────────────────────────────────────────────────────
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000001-0000-0000-0000-000000000009',
  'b2000001-0000-0000-0000-000000000006',
  'Tự luận: Trải nghiệm tuân thủ quy định',
  'Chia sẻ trải nghiệm thực tế của bạn trong quá trình áp dụng quy định ghi chú và minh chứng.',
  'essay',
  $j${
    "prompt": "Viết bài tự luận tối thiểu 200 từ với cấu trúc:\n\n1) Mô tả 1 tình huống cụ thể bạn (hoặc đồng nghiệp) đã HOÀN THÀNH nhiệm vụ đúng quy định (có ghi chú đầy đủ + file minh chứng). Kết quả ra sao? Khách hàng có nhận xét gì?\n\n2) Mô tả 1 tình huống bạn (hoặc đồng nghiệp) ĐÃ VI PHẠM — quên ghi chú, không upload file, hoặc ghi chú quá ngắn. Hậu quả? KPI tháng đó bị ảnh hưởng như thế nào?\n\n3) Bài học rút ra và cam kết cải thiện trong tháng tới.\n\nViết theo tinh thần chuyên nghiệp, nghiêm túc, không kể chuyện hài."
  }$j$::jsonb,
  null, null, 2
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, sort_order = EXCLUDED.sort_order, updated_at = now();

-- ─── Ex 10: Quiz L7 ─────────────────────────────────────────────────────
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000001-0000-0000-0000-000000000010',
  'b2000001-0000-0000-0000-000000000007',
  'Bài kiểm tra: Quản lý ghi chú và tài liệu',
  '5 câu về 3 nơi lưu trữ và quy tắc đặt tên file.',
  'quiz',
  $j${
    "items": [
      {"id":"q1","question":"Ghi chú '14h30 đã gọi KH, hẹn ký HĐ thứ 5' nên lưu ở đâu?","type":"single",
       "options":["Ghi chú trong Nhiệm vụ","Tài liệu Lead","Chat nội bộ","Bình luận"],
       "correct":[0]},
      {"id":"q2","question":"Hợp đồng PDF đã ký nên lưu ở đâu?","type":"single",
       "options":["Ghi chú task","Email","Tài liệu Lead","Chat"],
       "correct":[2]},
      {"id":"q3","question":"Tên file nào đạt chuẩn quy định?","type":"single",
       "options":[
         "IMG_0001.jpg",
         "Untitled.pdf",
         "BaoGia_TuBep_chiHoa_68tr_v1.pdf",
         "Photo.png"],
       "correct":[2]},
      {"id":"q4","question":"Cơ chế đồng bộ 2 chiều giữa nhiệm vụ và tài liệu Lead?","type":"single",
       "options":[
         "Không có, phải upload 2 lần",
         "Upload 1 lần ở nhiệm vụ, tự xuất hiện ở Tài liệu Lead",
         "Chỉ admin sync được",
         "Tuỳ ngày trong tuần"],
       "correct":[1]},
      {"id":"q5","question":"Định dạng nào KHÔNG được hệ thống chấp nhận?","type":"single",
       "options":["jpg","pdf","exe","mp4"],
       "correct":[2]}
    ]
  }$j$::jsonb,
  70, null, 1
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, sort_order = EXCLUDED.sort_order, updated_at = now();

-- ─── Ex 11: Quiz L8 ─────────────────────────────────────────────────────
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000001-0000-0000-0000-000000000011',
  'b2000001-0000-0000-0000-000000000008',
  'Bài kiểm tra: Lịch sử tương tác',
  '5 câu về 5 kênh ghi nhận và quy tắc 5 phút.',
  'quiz',
  $j${
    "items": [
      {"id":"q1","question":"Có bao nhiêu kênh ghi nhận tương tác trên Lead?","type":"single",
       "options":["3","4","5","6"],"correct":[2]},
      {"id":"q2","question":"Quy tắc 5 phút là gì?","type":"single",
       "options":[
         "Mỗi cuộc gọi tối đa 5 phút",
         "Gọi điện Lead Hot trong vòng 5 phút từ khi nhận",
         "Nghỉ 5 phút giữa các cuộc gọi",
         "Ghi chú trong 5 phút"],
       "correct":[1]},
      {"id":"q3","question":"Chat nội bộ khác chat khách hàng ở điểm nào?","type":"single",
       "options":[
         "Chat nội bộ chỉ giữa nhân viên trong công ty",
         "Chat nội bộ chỉ admin xem được",
         "Không khác nhau",
         "Chat nội bộ phải trả phí"],
       "correct":[0]},
      {"id":"q4","question":"Bình luận hỗ trợ chức năng nào?","type":"multiple",
       "options":[
         "Trả lời từng comment (thread)",
         "Phản ứng (reaction)",
         "Tag tên đồng nghiệp @user",
         "In ra giấy tự động"],
       "correct":[0,1,2]},
      {"id":"q5","question":"Chỉ số 'Lần đầu chạm' ảnh hưởng đến KPI nào?","type":"single",
       "options":["A1 - Số lead tạo mới","B1 - Tiếp xúc thành công","A2 - Tỷ lệ thắng Deal","B6 - Lead chuyển Deal"],
       "correct":[1]}
    ]
  }$j$::jsonb,
  70, null, 1
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, sort_order = EXCLUDED.sort_order, updated_at = now();

-- ─── Ex 12: Quiz L9 ─────────────────────────────────────────────────────
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000001-0000-0000-0000-000000000012',
  'b2000001-0000-0000-0000-000000000009',
  'Bài kiểm tra: Hạn chót và SLA',
  '6 câu về hai loại hạn chót, SLA chuẩn và quy trình tránh trừ điểm.',
  'quiz',
  $j${
    "items": [
      {"id":"q1","question":"Hệ thống nhắc trước hạn bao lâu (thông báo nhẹ)?","type":"single",
       "options":["1 giờ","3 ngày","1 tuần","1 tháng"],"correct":[1]},
      {"id":"q2","question":"SLA chuẩn cho giai đoạn 'Mới → Đã liên hệ' trong ngành tủ bếp?","type":"single",
       "options":["1 ngày","3 ngày","7 ngày","14 ngày"],
       "correct":[0]},
      {"id":"q3","question":"SLA chuẩn cho giai đoạn 'Đã báo giá → Đã đồng ý'?","type":"single",
       "options":["3 ngày","7 ngày","14 ngày","30 ngày"],
       "correct":[2]},
      {"id":"q4","question":"Nhiệm vụ quá hạn 5 ngày bị trừ bao nhiêu điểm KPI?","type":"single",
       "options":["-1","-3","-5 (1 điểm mỗi 24h)","-10"],"correct":[2]},
      {"id":"q5","question":"Cách ĐÚNG để xử lý khi biết trước không kịp deadline?","type":"single",
       "options":[
         "Cứ để trễ, không sao",
         "Sửa deadline TRƯỚC khi quá hạn, có ghi lý do",
         "Xoá nhiệm vụ",
         "Nhờ đồng nghiệp đóng hộ"],
       "correct":[1]},
      {"id":"q6","question":"Khi Lead vào giai đoạn 'Đã liên hệ', hệ thống có thể tự gửi gì?","type":"single",
       "options":["Hợp đồng PDF","Tin nhắn Zalo tự động (theo template cấu hình)","Email báo lương","Không có gì"],
       "correct":[1]}
    ]
  }$j$::jsonb,
  70, null, 1
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, sort_order = EXCLUDED.sort_order, updated_at = now();

-- ─── Ex 13: ⭐ Quiz NGHIÊM L10 ──────────────────────────────────────────
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order
) VALUES (
  'c2000001-0000-0000-0000-000000000013',
  'b2000001-0000-0000-0000-000000000010',
  '⭐ Kiểm tra NGHIÊM: Hệ thống KPI',
  'Bài kiểm tra bắt buộc. 10 câu, đạt 80%, giới hạn 15 phút, tối đa 3 lượt.',
  'quiz',
  $j${
    "items": [
      {"id":"q1","question":"Hệ thống KPI có MẤY cơ chế chấm điểm?","type":"single",
       "options":[
         "1 (chỉ sổ cái sự kiện)",
         "2 (sổ cái sự kiện + bảng tỷ lệ tháng)",
         "3",
         "Không chấm tự động"],
       "correct":[1]},
      {"id":"q2","question":"Sổ cái sự kiện ghi điểm khi nào?","type":"single",
       "options":[
         "Real-time, ngay khi có hành động",
         "Mỗi giờ một lần",
         "Đêm 1h sáng mỗi ngày",
         "Cuối tháng"],
       "correct":[0]},
      {"id":"q3","question":"Bảng tỷ lệ tháng được cập nhật khi nào?","type":"single",
       "options":[
         "Real-time",
         "Mỗi giờ",
         "Đêm khoảng 1h sáng",
         "Khi admin bấm tay"],
       "correct":[2]},
      {"id":"q4","question":"Hoàn thành nhiệm vụ ĐÚNG HẠN cộng bao nhiêu điểm?","type":"single",
       "options":["+0.5","+1","+2","+5"],"correct":[1]},
      {"id":"q5","question":"Thắng 1 Deal (ký HĐ + nhận cọc) cộng bao nhiêu điểm?","type":"single",
       "options":["+3","+5","+10","+20"],"correct":[2]},
      {"id":"q6","question":"Quy tắc CAP nói gì?","type":"single",
       "options":[
         "A4 < 80% → tổng điểm tháng tối đa 70",
         "Mỗi tháng max 100",
         "Không có quy tắc cap",
         "Cap khi nghỉ phép"],
       "correct":[0]},
      {"id":"q7","question":"Nhân viên An làm 50 nhiệm vụ, 45 đúng hạn. A4 = ?","type":"single",
       "options":["80%","85%","90%","95%"],"correct":[2]},
      {"id":"q8","question":"Nếu thấy điểm KPI sai, cần làm gì TRƯỚC TIÊN?","type":"single",
       "options":[
         "Khiếu nại trưởng phòng",
         "Vào Bảng điểm bấm 'Tính lại'",
         "Nghỉ việc",
         "Báo HR"],
       "correct":[1]},
      {"id":"q9","question":"Bonus đặc biệt: hoàn thành sớm > 50% thời hạn cộng bao nhiêu?","type":"single",
       "options":["0","+1","+2","+10"],"correct":[1]},
      {"id":"q10","question":"Khuyến nghị mở Bảng điểm KPI với tần suất nào?","type":"single",
       "options":[
         "Cuối tháng",
         "Mỗi tuần",
         "Mỗi ngày (sáng 9h)",
         "Không bao giờ"],
       "correct":[2]}
    ]
  }$j$::jsonb,
  80, 3, 15, 1
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, updated_at = now();

-- ─── Ex 14: Essay L10 ───────────────────────────────────────────────────
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000001-0000-0000-0000-000000000014',
  'b2000001-0000-0000-0000-000000000010',
  'Tự luận: Đánh giá KPI tháng và kế hoạch cải thiện',
  'Tự đánh giá KPI cá nhân tháng vừa rồi và lập kế hoạch cụ thể.',
  'essay',
  $j${
    "prompt": "Mở Bảng điểm KPI tại Menu CRM → Bảng điểm. Viết bài tự đánh giá tối thiểu 250 từ với cấu trúc:\n\n1) Điểm KPI tổng tháng vừa rồi: bao nhiêu? Mức đánh giá nào (Xuất sắc / Đạt yêu cầu / Cần cải thiện / Không đạt)?\n\n2) Phân tích từng chỉ số:\n   - A3 (Đầy đủ thông tin) — bao nhiêu %?\n   - A4 (Đúng hạn) — bao nhiêu %? Có bị áp quy tắc CAP không?\n   - A2 (Tỷ lệ thắng Deal) — bao nhiêu %?\n   - B1 (Tiếp xúc thành công) — bao nhiêu %?\n   - B6 (Lead chuyển Deal) — bao nhiêu?\n\n3) Xác định 1-2 chỉ số YẾU NHẤT. Phân tích nguyên nhân.\n\n4) Lập KẾ HOẠCH cải thiện cho tháng tới — cụ thể, có thể đo lường được:\n   - Sẽ làm gì khác đi?\n   - Mục tiêu cụ thể cho từng chỉ số?\n   - Thời gian biểu hàng ngày sẽ thay đổi thế nào?\n\nViết nghiêm túc, trung thực, không tô hồng kết quả."
  }$j$::jsonb,
  null, null, 2
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, sort_order = EXCLUDED.sort_order, updated_at = now();

-- ─── Ex 15: Quiz L11 ────────────────────────────────────────────────────
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000001-0000-0000-0000-000000000015',
  'b2000001-0000-0000-0000-000000000011',
  'Bài kiểm tra: Chuyển Lead thành Deal',
  '6 câu về điều kiện chuyển, quy trình và lưu ý quan trọng.',
  'quiz',
  $j${
    "items": [
      {"id":"q1","question":"Khi nào NÊN chuyển Lead thành Deal?","type":"single",
       "options":[
         "Khi mới tạo Lead xong",
         "Khi KH chỉ mới hỏi giá tham khảo",
         "Khi KH đã đồng ý mua + thống nhất 3 yếu tố: sản phẩm, số lượng, giá",
         "Khi rảnh"],
       "correct":[2]},
      {"id":"q2","question":"Trước khi chuyển, BẮT BUỘC phải có gì?","type":"single",
       "options":[
         "Báo giá PDF",
         "Khách hàng tồn tại trong danh bạ Customer",
         "Hợp đồng đã ký",
         "Tiền cọc đã chuyển"],
       "correct":[1]},
      {"id":"q3","question":"Mã định danh có thay đổi sau khi chuyển không?","type":"single",
       "options":[
         "Có, sinh mã mới hoàn toàn",
         "Không, giữ nguyên (vẫn LEAD-2026-047)",
         "Đổi sang format DEAL-...",
         "Bị xoá khỏi hệ thống"],
       "correct":[1]},
      {"id":"q4","question":"Sau khi chuyển, KPI cộng bao nhiêu điểm (chỉ số B6)?","type":"single",
       "options":["+1","+3","+5","+10"],"correct":[1]},
      {"id":"q5","question":"Sau khi chuyển, hệ thống tự động làm gì?","type":"multiple",
       "options":[
         "Đổi loại từ Lead sang Deal",
         "Tự tạo các nhiệm vụ mới cho Deal",
         "Sao chép tài liệu Lead sang Deal",
         "Tự gửi hợp đồng cho khách hàng"],
       "correct":[0,1,2]},
      {"id":"q6","question":"Có nút 'Hoàn tác chuyển Deal' không?","type":"single",
       "options":[
         "Có, nút Revert",
         "KHÔNG — phải nhờ admin can thiệp",
         "Có, sau 24h tự hoàn tác",
         "Tự động sau 1 tuần nếu chưa ký HĐ"],
       "correct":[1]}
    ]
  }$j$::jsonb,
  70, null, 1
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, sort_order = EXCLUDED.sort_order, updated_at = now();

-- ─── Ex 16: Checklist L11 ───────────────────────────────────────────────
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000001-0000-0000-0000-000000000016',
  'b2000001-0000-0000-0000-000000000011',
  'Checklist: 7 điều kiểm tra trước khi chuyển Deal',
  'Vì không có chức năng Hoàn tác, kiểm tra kỹ trước khi bấm xác nhận.',
  'checklist',
  $j${
    "items": [
      {"id":"c1","text":"KH đã đồng ý mua (có ghi nhận cụ thể trong hoạt động)"},
      {"id":"c2","text":"Đã thống nhất 3 yếu tố: sản phẩm cụ thể, số lượng, giá tổng"},
      {"id":"c3","text":"Khách hàng đã có trong danh bạ Customer chính thức"},
      {"id":"c4","text":"Lead đầy đủ 6 trường thông tin bắt buộc (theo Bài 4)"},
      {"id":"c5","text":"Mọi nhiệm vụ Lead có cờ chặn đã hoàn thành đầy đủ"},
      {"id":"c6","text":"Đã chọn đúng pipeline Deal + đúng người phụ trách"},
      {"id":"c7","text":"Đã thông báo trưởng nhóm trước khi thực hiện"}
    ]
  }$j$::jsonb,
  70, null, 2
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, sort_order = EXCLUDED.sort_order, updated_at = now();

-- ─── Ex 17: Quiz L12 ────────────────────────────────────────────────────
INSERT INTO knowledge_exercises (id, lesson_id, title, instructions, type, questions, passing_score, max_attempts, sort_order)
VALUES (
  'c2000001-0000-0000-0000-000000000017',
  'b2000001-0000-0000-0000-000000000012',
  'Bài kiểm tra: Tình huống đặc biệt',
  '5 câu về xử lý trùng lặp, mất Lead, mở lại và quản lý spam.',
  'quiz',
  $j${
    "items": [
      {"id":"q1","question":"Đánh dấu 'Đã chăm sóc' (Care Mark) có hiệu lực bao lâu?","type":"single",
       "options":["7 ngày","15 ngày","30 ngày","Vô thời hạn"],
       "correct":[2]},
      {"id":"q2","question":"Lead đã 'Mất' có thể được mở lại không?","type":"single",
       "options":[
         "Không, mất là mất vĩnh viễn",
         "Có (chủ sở hữu hoặc admin bấm 'Mở lại Lead')",
         "Phải tạo Lead mới hoàn toàn",
         "Chỉ trong vòng 24h sau khi mất"],
       "correct":[1]},
      {"id":"q3","question":"Khi đánh dấu Lead 'Mất', BẮT BUỘC phải làm gì?","type":"single",
       "options":[
         "Báo cáo trưởng phòng",
         "Chọn lý do mất từ danh sách",
         "Gửi email cho KH xin lỗi",
         "Không cần làm gì"],
       "correct":[1]},
      {"id":"q4","question":"Lý do mất nào KHÔNG bị trừ điểm KPI?","type":"single",
       "options":[
         "Giá cao hơn đối thủ",
         "Đối thủ rẻ hơn cho cùng chất lượng",
         "KH ngân sách không đủ",
         "Không liên hệ được KH"],
       "correct":[2]},
      {"id":"q5","question":"Cách XỬ LÝ TỐI ƯU với số điện thoại spam?","type":"single",
       "options":[
         "Xoá Lead nhiều lần khi spam tạo Lead mới",
         "Bấm 'Chặn số' để thêm vào danh sách đen",
         "Báo công an",
         "Bỏ qua, không làm gì"],
       "correct":[1]}
    ]
  }$j$::jsonb,
  70, null, 1
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, sort_order = EXCLUDED.sort_order, updated_at = now();

-- ─── Ex 18 🏆 BÀI THI TỔNG KẾT ──────────────────────────────────────────
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order,
  image_url
) VALUES (
  'c2000001-0000-0000-0000-000000000018',
  'b2000001-0000-0000-0000-000000000013',
  '🏆 BÀI THI TỔNG KẾT — Lead Master Certification',
  'Bài thi cuối khoá. 20 câu trắc nghiệm tổng hợp từ Bài 1 đến Bài 12. Đạt 85/100 (17/20 câu) trong 30 phút. Tối đa 2 lượt. Nộp bài đạt yêu cầu = TỰ ĐỘNG nhận chứng nhận Lead Master.',
  'quiz',
  $j${
    "items": [
      {"id":"q01","question":"Lead khác Customer ở điểm cốt lõi nào?","type":"single",
       "options":[
         "Lead có giá trị thấp hơn",
         "Lead chưa cam kết mua, Customer đã ký hợp đồng",
         "Lead không có số điện thoại",
         "Lead chỉ có ở Facebook"],
       "correct":[1]},

      {"id":"q02","question":"Khi tạo Lead, hệ thống BẮT BUỘC TỐI THIỂU thông tin nào?","type":"multiple",
       "options":["Tiêu đề Lead","Khách hàng","Mã số thuế","Tài khoản ngân hàng"],
       "correct":[0,1]},

      {"id":"q03","question":"Quy chuẩn thời gian phản hồi cho Lead HOT là?","type":"single",
       "options":["Trong vòng 5 phút","Trong vòng 30 phút","Trong vòng 2 giờ","Trong vòng 1 ngày"],
       "correct":[0]},

      {"id":"q04","question":"Trên bảng Kanban, mỗi cột tương ứng với?","type":"single",
       "options":["Một nhân viên","Một giai đoạn (stage)","Một loại sản phẩm","Một khu vực địa lý"],
       "correct":[1]},

      {"id":"q05","question":"Hệ thống KHÔNG cho kéo Lead sang giai đoạn mới trong trường hợp nào?","type":"multiple",
       "options":[
         "Còn nhiệm vụ bắt buộc chưa hoàn thành",
         "Bạn không phải người phụ trách Lead",
         "Lead đang ở trạng thái Mất (cần Mở lại trước)",
         "Lead có nhiều hơn 5 tài liệu đính kèm"],
       "correct":[0,1,2]},

      {"id":"q06","question":"Có MẤY trường thông tin BẮT BUỘC trên mỗi Lead (KPI A3)?","type":"single",
       "options":["3","4","6","10"],"correct":[2]},

      {"id":"q07","question":"Khi A3 < 80%, hậu quả là gì?","type":"single",
       "options":[
         "Không sao cả, chỉ là cảnh báo",
         "Tổng điểm KPI tháng bị CAP tối đa 70",
         "Bị trừ lương tự động",
         "Bị khoá tài khoản"],
       "correct":[1]},

      {"id":"q08","question":"Ba cách tạo nhiệm vụ trên Lead bao gồm?","type":"multiple",
       "options":[
         "Tạo thủ công từng nhiệm vụ",
         "Sinh từ mẫu (template) của trưởng nhóm",
         "Tự động sinh khi chuyển giai đoạn",
         "Email cho admin để admin tạo hộ"],
       "correct":[0,1,2]},

      {"id":"q09","question":"Nhiệm vụ 'chặn giai đoạn' (blocker) có tác dụng gì?","type":"single",
       "options":[
         "Khoá Lead lại, không ai sửa được",
         "Lead không thể chuyển sang giai đoạn tiếp nếu nhiệm vụ chưa hoàn thành",
         "Tự động xoá nhiệm vụ sau 7 ngày",
         "Chỉ admin mới thấy"],
       "correct":[1]},

      {"id":"q10","question":"BÀI 6 ⭐ — Cờ 'Bắt buộc minh chứng liên hệ' yêu cầu gì?","type":"single",
       "options":[
         "Chỉ cần ghi chú là đủ",
         "Phải có GHI CHÚ HOẶC FILE đính kèm (1 trong 2)",
         "Phải có cả ghi chú VÀ file (đầy đủ cả hai)",
         "Phải có chữ ký khách hàng"],
       "correct":[1]},

      {"id":"q11","question":"BÀI 6 ⭐ — Ghi chú nào ĐẠT YÊU CẦU?","type":"single",
       "options":[
         "Done",
         "Khách đồng ý rồi",
         "14h30 — Đã gọi anh Minh, anh chốt mẫu cửa Xingfa hệ 55 vân gỗ 6.8tr/m², hẹn đo đạc 9h thứ 7",
         "OK"],
       "correct":[2]},

      {"id":"q12","question":"BÀI 6 ⭐ — Bấm Hoàn thành hàng loạt 10 nhiệm vụ, 3 thiếu minh chứng. Kết quả?","type":"single",
       "options":[
         "Cả 10 cùng fail",
         "Cả 10 cùng pass",
         "7 pass + 3 giữ ở trạng thái cũ để bổ sung",
         "Hệ thống treo"],
       "correct":[2]},

      {"id":"q13","question":"Hợp đồng PDF đã ký nên LƯU Ở ĐÂU?","type":"single",
       "options":["Ghi chú task","Email cá nhân","Tài liệu Lead","Chat nội bộ"],
       "correct":[2]},

      {"id":"q14","question":"Chỉ số 'Lần đầu chạm' (First Touch) ảnh hưởng đến KPI nào?","type":"single",
       "options":["A1 - Số Lead tạo mới","B1 - Tiếp xúc thành công","A2 - Tỷ lệ thắng Deal","B6 - Lead chuyển Deal"],
       "correct":[1]},

      {"id":"q15","question":"SLA chuẩn ngành tủ bếp/cửa nhôm cho giai đoạn 'Đã báo giá → Đã đồng ý' là?","type":"single",
       "options":["3 ngày","7 ngày","14 ngày","30 ngày"],
       "correct":[2]},

      {"id":"q16","question":"Cách XỬ LÝ ĐÚNG khi biết trước không kịp deadline nhiệm vụ?","type":"single",
       "options":[
         "Cứ để trễ, không sao",
         "Sửa deadline TRƯỚC khi quá hạn, ghi lý do trong ghi chú",
         "Xoá nhiệm vụ",
         "Nhờ đồng nghiệp đóng hộ"],
       "correct":[1]},

      {"id":"q17","question":"BÀI 10 ⭐ — Khi A4 (đúng hạn) < 80%, hậu quả là gì?","type":"single",
       "options":[
         "Bị trừ 10 điểm cố định",
         "Tổng điểm KPI tháng bị CAP tối đa 70",
         "Không sao",
         "Bị giảm cấp bậc nhân viên"],
       "correct":[1]},

      {"id":"q18","question":"BÀI 10 ⭐ — Thắng 1 Deal (ký HĐ + nhận cọc) cộng bao nhiêu điểm KPI?","type":"single",
       "options":["+3","+5","+10","+20"],
       "correct":[2]},

      {"id":"q19","question":"Trước khi chuyển Lead → Deal, ĐIỀU KIỆN BẮT BUỘC nào sau đây?","type":"multiple",
       "options":[
         "KH đã đồng ý mua (có ghi nhận cụ thể)",
         "Đã thống nhất sản phẩm, số lượng, giá",
         "Khách hàng tồn tại trong danh bạ Customer",
         "Đã có ảnh chụp KH đến showroom"],
       "correct":[0,1,2]},

      {"id":"q20","question":"Sau khi chuyển Lead → Deal, có nút HOÀN TÁC không?","type":"single",
       "options":[
         "Có, nút Revert ở góc phải",
         "KHÔNG có hoàn tác — cần admin can thiệp nếu chuyển nhầm",
         "Có, tự hoàn tác sau 24h nếu chưa ký HĐ",
         "Tự hoàn tác sau 1 tuần"],
       "correct":[1]}
    ]
  }$j$::jsonb,
  85, 2, 30, 1,
  'https://images.unsplash.com/photo-1606326608606-aa0b62935f2b?w=1200&q=80'
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, instructions = EXCLUDED.instructions, type = EXCLUDED.type,
  questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score, image_url = EXCLUDED.image_url,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, updated_at = now();

COMMIT;

-- ══════════════════════════════════════════════════════════════════════════
-- TỔNG KẾT
-- ══════════════════════════════════════════════════════════════════════════
-- ✅ 1 danh mục : "🎯 Lead — Khách hàng tiềm năng" (ngành tủ bếp/cửa nhôm)
-- ✅ 13 bài học (12 bài kiến thức + 1 bài giới thiệu bài thi tổng kết)
-- ✅ 18 bài tập : 12 quiz + 4 checklist + 2 essay
--    - Bài 6  ⭐  : Quiz NGHIÊM (80%, 15 phút, 3 lượt) — Quy định minh chứng
--    - Bài 10 ⭐  : Quiz NGHIÊM (80%, 15 phút, 3 lượt) — Hệ thống KPI
--    - Bài 13 🏆 : BÀI THI TỔNG KẾT (85%, 30 phút, 2 lượt) — 20 câu tổng hợp
--    - Còn lại    : Quiz tiêu chuẩn (70%)
--
-- ⚙️ Khi cờ require_all_exercises_passed = true (mặc định):
--    Học viên BẮT BUỘC pass bài thi tổng kết (Ex 18) mới được cấp chứng nhận.
--
-- File dùng ON CONFLICT DO UPDATE → chạy lại sẽ ghi đè nội dung mới nhất.
--
-- Áp dụng:
--   Supabase Dashboard → SQL Editor → New query → paste toàn bộ → Run
--
-- Kiểm tra:
--   SELECT 'lessons',COUNT(*) FROM knowledge_lessons WHERE category_id='d2000001-0000-0000-0000-000000000001'
--   UNION ALL SELECT 'exercises',COUNT(*) FROM knowledge_exercises
--     WHERE lesson_id IN (SELECT id FROM knowledge_lessons WHERE category_id='d2000001-0000-0000-0000-000000000001');
