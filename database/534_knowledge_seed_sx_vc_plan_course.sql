-- 534
-- Khoá «Kế hoạch SX & VC/LĐ» — từ ký hợp đồng đến bàn giao
-- 5 bài học (bài 5 = thực hành mô phỏng) + 2 bài kiểm tra trắc nghiệm, cấp chứng nhận khi hoàn thành.
-- Migration 535 bổ sung bài kiểm tra 3 dạng 'simulation' (sân tập CRM · SX · VC/LĐ) trên bài 5;
-- nếu chạy lại file này thì chạy lại 535 để nối lại mục sân tập vào nội dung bài 5.
-- Ảnh minh hoạ nằm trên Supabase Storage (bucket attachments/knowledge/sx-vc-*.png);
-- upload bằng backend/scripts/upload-knowledge-sx-vc-images.js, tham chiếu qua /uploads/knowledge-screenshots/...
-- Idempotent: ON CONFLICT DO UPDATE

BEGIN;

-- ═══ DANH MỤC (khoá học) ═══
INSERT INTO knowledge_categories (id, name, slug, description, icon, sort_order, is_active)
VALUES (
  'd2000005-0000-0000-0000-000000000001',
  'Kế hoạch SX & VC/LĐ — từ ký hợp đồng đến bàn giao',
  'ke-hoach-sx-vc-ld',
  'Dành cho Sale CRM, xưởng sản xuất và tổ vận chuyển/lắp đặt. Học cách lập kế hoạch một lần ngay khi ký hợp đồng, hiểu cột «lắp đặt tạm», và bước xác nhận lần hai sau khi xưởng hoàn thiện. Ngôn ngữ đơn giản, có ảnh từng bước, bài cuối là thực hành mô phỏng.',
  '🚚',
  40,
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, slug = EXCLUDED.slug, description = EXCLUDED.description,
  icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order, is_active = true;

UPDATE knowledge_categories SET
  require_all_exercises_passed = true,
  deadline_mode = 'relative',
  deadline_duration_days = 14,
  deadline_note = 'Hoàn thành khoá trong 14 ngày kể từ khi mở bài đầu tiên',
  certificate_template = $ct$
{
  "signature_name": "Ban điều hành TuBep Pro",
  "signature_title": "Phụ trách đào tạo vận hành",
  "footer_note": "Chứng nhận đã nắm luồng thiết lập kế hoạch Sản xuất & Vận chuyển/Lắp đặt và bước xác nhận bàn giao.",
  "accent_color": "#0d9488"
}
$ct$::jsonb
WHERE id = 'd2000005-0000-0000-0000-000000000001';

-- ═══ BÀI 1 ═══
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000005-0000-0000-0000-000000000001',
  'd2000005-0000-0000-0000-000000000001',
  'Bài 1: Toàn cảnh — một đơn hàng đi qua những ai',
  'Hiểu 5 chặng từ lúc khách ký hợp đồng đến khi thợ lắp xong, và vì sao có cột «lắp đặt tạm».',
  $md1$# Bài 1: Toàn cảnh — một đơn hàng đi qua những ai

Chị Lan vừa ký hợp đồng tủ bếp sáng nay. Từ giờ tới ngày thợ lắp xong, có **bốn nhóm người** cùng làm: Sale CRM, xưởng sản xuất, tổ vận chuyển/lắp đặt (gọi tắt **VC/LĐ**), và admin cấu hình hệ thống.

Trước đây mỗi bên tự hỏi nhau qua Zalo: xưởng xong chưa, xe mấy giờ tới, nhà khách có thang máy không. Bây giờ **Sale điền một lần trên hệ thống**, các bên còn lại đọc cùng một chỗ.

## 1. Năm chặng của một đơn hàng

1. **Chuẩn bị một lần** — admin bật cột «lắp đặt tạm» cho từng công ty VC/LĐ. Làm một lần, dùng mãi.
2. **Sale lập kế hoạch** ngay khi deal sang bước **Đã ký hợp đồng**: chọn xưởng, ngày lắp, ngày lấy hàng, công ty VC/LĐ và ghi chú.
3. **VC/LĐ xem trước** — dự án hiện ở cột lắp đặt tạm kèm badge **🔒 TẠM**, có thông báo và mốc lịch dự kiến để chuẩn bị xe, thợ.
4. **Xưởng hoàn thiện** — kéo thẻ vào cột bàn giao. Sale nhận thông báo.
5. **Sale xác nhận lần hai** — kiểm lại thông tin đã điền rồi bấm bàn giao. Thẻ rời cột tạm sang cột tiếp nhận, VC/LĐ bắt đầu chạy theo lịch.

## 2. Ai làm gì

- **Sale CRM**: người duy nhất điền kế hoạch, và là người xác nhận lần hai.
- **Xưởng SX**: làm hàng, xong thì bấm bàn giao. Xưởng **không** phải chọn công ty VC/LĐ.
- **VC/LĐ**: xem trước để chuẩn bị, chờ bàn giao thật mới chạy.
- **Admin**: bật cột lắp đặt tạm, cấu hình nhân viên phụ trách của công ty VC/LĐ.

Ảnh dưới chụp deal test **ZZ TEST HOC TAP — Tủ bếp chị Lan (Q7)**. Nhìn 3 khung màu:

- **Khung 1 (xanh dương)** — tên deal dùng để minh họa.
- **Khung 2 (tím)** — deal đang ở bước **Đã ký hợp đồng**. Đây là lúc Sale phải lập kế hoạch.
- **Khung 3 (đỏ)** — nút cam **Thiết lập kế hoạch SX & VC/LĐ**. Bấm nút này để mở form.

![Nút «Thiết lập kế hoạch SX & VC/LĐ» trên chi tiết deal — 3 khung khoanh](/uploads/knowledge-screenshots/sx-vc-03-nut-ke-hoach.png)

## 3. Vì sao cần cột «lắp đặt tạm»

Tổ VC/LĐ cần biết trước để xếp xe và thợ. Nhưng nếu cho họ nhận việc ngay khi Sale mới lên kế hoạch thì dễ đi lấy hàng trước khi xưởng làm xong.

Cột lắp đặt tạm giải quyết cả hai: **thấy trước, nhưng chưa được chạy**. Thẻ ở cột này bị **khoá chuyển cột** cho tới khi xưởng bàn giao và Sale xác nhận.

Ảnh bảng Lắp đặt của cùng dự án test **TB-2026-691**. Nhìn 4 khung:

- **Khung 1** — cột **Dự án sắp tới** đã được chọn làm cột lắp đặt tạm.
- **Khung 2** — thẻ dự án vừa lên kế hoạch nằm đúng cột đó.
- **Khung 3** — badge **TẠM**: thẻ chưa kéo sang cột khác được.
- **Khung 4** — dòng **Ghi chú VC/LĐ** Sale đã nhập lúc lập kế hoạch.

![Bảng Lắp đặt — cột lắp đặt tạm với thẻ badge TẠM](/uploads/knowledge-screenshots/sx-vc-07-board-cot-tam.png)

## 4. Ba từ cần nhớ

- **Cột lắp đặt tạm** — chỗ đậu tạm của dự án trên bảng Lắp đặt, trước khi bàn giao thật.
- **Badge 🔒 TẠM** — nhãn tím trên thẻ: xưởng chưa bàn giao, chưa được kéo thẻ.
- **Xác nhận lần hai** — Sale kiểm lại thông tin cũ rồi bấm bàn giao. Hệ thống **không tạo dự án VC/LĐ mới**, chỉ chuyển thẻ sang cột tiếp nhận.

---

Bài sau: cách bật cột lắp đặt tạm (việc chỉ làm một lần cho mỗi công ty VC/LĐ).$md1$,
  '/uploads/knowledge-screenshots/sx-vc-07-board-cot-tam.png',
  $att1$[
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-03-nut-ke-hoach.png","caption":"Deal test — nút Thiết lập kế hoạch SX & VC/LĐ (khung 3)"},
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-07-board-cot-tam.png","caption":"Bảng Lắp đặt — cột tạm, badge TẠM và ghi chú (khung 1–4)"},
    {"type":"file","url":"/uploads/knowledge-screenshots/sx-vc-huong-dan-ke-hoach.pdf","caption":"Bản PDF đầy đủ: Thiết lập kế hoạch Sản xuất & VC/LĐ"}
  ]$att1$::jsonb,
  8,
  ARRAY['ke-hoach', 'tong-quan', 'vc-ld'],
  true,
  1,
  true,
  now()
) ON CONFLICT (id) DO UPDATE SET
  category_id = EXCLUDED.category_id, title = EXCLUDED.title, summary = EXCLUDED.summary,
  content_md = EXCLUDED.content_md, cover_image_url = EXCLUDED.cover_image_url,
  attachments = EXCLUDED.attachments, duration_minutes = EXCLUDED.duration_minutes,
  tags = EXCLUDED.tags, is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();

-- ═══ BÀI 2 ═══
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000005-0000-0000-0000-000000000002',
  'd2000005-0000-0000-0000-000000000001',
  'Bài 2: Chuẩn bị một lần — bật cột «lắp đặt tạm»',
  'Admin bật cột chứa dự án chưa bàn giao cho từng công ty VC/LĐ. Chỉ làm một lần.',
  $md2$# Bài 2: Chuẩn bị một lần — bật cột «lắp đặt tạm»

Việc này do **admin hoặc quản lý VC/LĐ** làm, mỗi công ty vận chuyển/lắp đặt làm **một lần**. Chưa bật thì luồng vẫn chạy, chỉ là tổ VC/LĐ không thấy dự án trước khi xưởng bàn giao.

## 1. Làm theo từng bước

1. Vào module **Lắp đặt** → **Cài đặt Pipeline Lắp đặt** (đường dẫn `/vc/pipeline-settings`).
2. Ở ô phía trên, chọn đúng **Công ty** VC/LĐ cần cấu hình.
3. Tìm giai đoạn muốn dùng làm chỗ đậu tạm — thường là cột đầu như **Dự án sắp tới**.
4. Bấm pill **LĐ tạm** ở giai đoạn đó. Pill sáng tím và hiện badge **🔧 Lắp đặt tạm** là xong.

Ảnh dưới chụp công ty **Nhôm Kính Phúc Đạt**. Đi theo 4 khung:

- **Khung 1** — chọn đúng công ty VC/LĐ trước khi bật.
- **Khung 2** — cột **Dự án sắp tới** là chỗ đậu tạm.
- **Khung 3** — pill **LĐ tạm**: bấm để bật/tắt.
- **Khung 4** — nhãn **Lắp đặt tạm** xuất hiện khi đã bật đúng.

![Cột «Dự án sắp tới» đã bật LĐ tạm — 4 khung khoanh](/uploads/knowledge-screenshots/sx-vc-01-cot-lap-dat-tam.png)

## 2. Cách khác: dùng form sửa giai đoạn

1. Bấm **Sửa** ở giai đoạn muốn chọn.
2. Tích ô **Nơi để dự án lắp đặt tạm**.
3. Bấm **Lưu**.

Ảnh form sửa cột **Dự án sắp tới**:

- **Khung 1** — chỗ cần tích.
- **Khung 2** — đúng ô **Nơi để dự án lắp đặt tạm**. Dòng chữ dưới ô nói rõ: Sale lập kế hoạch thì dự án vào cột này ngay; xưởng bàn giao thì chỉ chuyển cột, **không tạo dự án mới**.
- **Khung 3** — bấm **Lưu** để chốt.

![Ô tích «Nơi để dự án lắp đặt tạm» trong form sửa giai đoạn](/uploads/knowledge-screenshots/sx-vc-02-tich-o-lap-dat-tam.png)

## 3. Ba điều cần nhớ

- Mỗi công ty VC/LĐ chỉ có **một** cột lắp đặt tạm. Bật cột mới thì cột cũ **tự tắt** — không cần bỏ tay.
- Nên chọn **cột đầu tiên** của bảng, đừng chọn cột giữa quy trình như «Đang giao» để khỏi lẫn với việc thật.
- Làm cho **từng công ty VC/LĐ**. Công ty nào chưa bật thì tổ đó không thấy dự án sớm.

## 4. Kiểm tra đã bật đúng chưa

- Mở **Lắp đặt → Kanban**, chọn công ty vừa cấu hình.
- Cột vừa bật có badge **🔧 Lắp đặt tạm** ở tiêu đề cột.
- Khi Sale lập kế hoạch xong, thẻ dự án sẽ xuất hiện ở đúng cột này.

---

Bài sau: phần việc chính của Sale — điền kế hoạch ngay khi ký hợp đồng.$md2$,
  '/uploads/knowledge-screenshots/sx-vc-01-cot-lap-dat-tam.png',
  $att2$[
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-01-cot-lap-dat-tam.png","caption":"Cài đặt pipeline — chọn công ty, cột Dự án sắp tới, pill LĐ tạm"},
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-02-tich-o-lap-dat-tam.png","caption":"Form sửa giai đoạn — ô tích Nơi để dự án lắp đặt tạm rồi Lưu"}
  ]$att2$::jsonb,
  6,
  ARRAY['cau-hinh', 'vc-ld', 'admin'],
  true,
  2,
  true,
  now()
) ON CONFLICT (id) DO UPDATE SET
  category_id = EXCLUDED.category_id, title = EXCLUDED.title, summary = EXCLUDED.summary,
  content_md = EXCLUDED.content_md, cover_image_url = EXCLUDED.cover_image_url,
  attachments = EXCLUDED.attachments, duration_minutes = EXCLUDED.duration_minutes,
  tags = EXCLUDED.tags, is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();

-- ═══ BÀI 3 ═══
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000005-0000-0000-0000-000000000003',
  'd2000005-0000-0000-0000-000000000001',
  'Bài 3: Sale lập kế hoạch ngay khi ký hợp đồng',
  'Điền form kế hoạch theo số thứ tự: xưởng, ngày lắp, ngày lấy hàng, công ty VC/LĐ và ghi chú.',
  $md3$# Bài 3: Sale lập kế hoạch ngay khi ký hợp đồng

Đây là việc quan trọng nhất của Sale trong luồng này. Điền **một lần**, cả xưởng và tổ VC/LĐ dùng chung.

Thời điểm làm: khi deal vừa sang giai đoạn **Đã ký hợp đồng**. Làm sớm thì tổ VC/LĐ có thời gian xếp xe và thợ.

## 1. Mở form kế hoạch

1. Vào **CRM → Pipeline**, bấm vào thẻ deal để mở **chi tiết Deal**.
2. Trên thanh tiêu đề, bấm **Thiết lập kế hoạch SX & VC/LĐ**. Deal đã có dự án rồi thì nút hiện là **Kế hoạch SX & VC/LĐ**.
3. Cần thêm xưởng thứ hai cho cùng deal: dùng **+ Thêm dự án SX** ở khối **Dự án sản xuất**.

Ảnh deal test: khung **1** là deal minh họa, khung **2** là bước **Đã ký hợp đồng**, khung **3** là nút cam cần bấm.

![Header deal: nút Thiết lập kế hoạch SX & VC/LĐ (khung 3)](/uploads/knowledge-screenshots/sx-vc-03-nut-ke-hoach.png)

## 2. Điền form theo số thứ tự trên ảnh

Form có **số ở từng ô** — điền lần lượt từ trên xuống, không bỏ bước.

**Phần trên form** (ảnh khung 1–3):

1. **CÔNG TY SX** — khung **1**: chọn xưởng, ví dụ **HCB**.
2. **PHÂN LOẠI** — khung **2**: chọn loại hàng, ví dụ **Tủ bếp**. Mỗi xưởng thành một thẻ riêng trên Kanban sản xuất.
3. **DEADLINE LẮP ĐẶT** — khung **3**: bấm ngày lắp trên lịch. Lắp nhiều ngày thì bấm thêm ô.

![Bước 1–3: chọn xưởng, phân loại và bấm ngày lắp](/uploads/knowledge-screenshots/sx-vc-04b-form-cac-buoc.png)

**Phần ngày giờ** (ảnh tiếp):

- **Khung đỏ — Giờ lắp**: hai nút **Sáng** (08:00) và **Chiều** (14:00). Không cần gõ giờ tay.
- **Khung xanh — Hoàn thiện SX**: **tự tính** = ngày lắp trừ 2 ngày. Ảnh minh họa: lắp 27/08 thì hoàn thiện 25/08.
- **Khung xanh lá — Lấy hàng VC**: ngày xe tới xưởng. Có thể cùng ngày lắp, không được trước ngày lắp. Giờ cũng dùng nút Sáng / Chiều.

![Ô ngày và giờ — Sáng / Chiều, hoàn thiện SX tự tính, lấy hàng VC](/uploads/knowledge-screenshots/sx-vc-04-form-ngay-gio.png)

**Phần chốt kế hoạch** (ảnh cuối form):

4. **Khung 1 — CÔNG TY VC / LẮP ĐẶT**: chọn công ty đã bật cột lắp đặt tạm. Ảnh dùng **Công ty Nhôm Kính Phúc Đạt**.
5. **Khung 2 — GHI CHÚ CHO BÊN VC / LẮP ĐẶT**: ô này chỉ hiện **sau khi** đã chọn công ty. Viết dặn dò cho xe và thợ.
6. **Khung 3** — tích ô xác nhận thông tin đúng.
7. Bấm **Thêm dự án** (deal chưa có dự án) hoặc **Lưu lịch** trên popup **Sửa lịch lắp đặt**.

Popup **Sửa lịch lắp đặt** giống form thật: cột trái là **Công ty vận chuyển / lắp đặt**, **Ghi chú cho bên vận chuyển / lắp đặt**, khối **Deadline lắp đặt (VC/LĐ) & hoàn thiện (SX)**, khối **Lấy hàng (VC)**; cột phải là **Lịch sự kiện VC/LĐ**. Nút cuối là **Hủy** và **Lưu lịch**.

![Chọn công ty VC/LĐ, ghi chú, rồi Thêm dự án / Lưu lịch](/uploads/knowledge-screenshots/sx-vc-05-chon-vc-ghi-chu.png)

## 3. Ghi chú nên viết gì

Viết đúng những thứ ảnh hưởng tới xe và thợ:

- Hàng dễ vỡ, gọi khách trước 30 phút.
- Thang máy nhỏ, cần 2 thợ mang tay.
- Chỗ đậu xe: mặt tiền sảnh B, sau 18h mới được đậu.
- Nhà chưa xong điện, chỉ lắp phần tủ dưới.

Ghi chú theo **từng xưởng**: mỗi xưởng gắn một công ty VC/LĐ, nên nhập riêng cho từng thẻ.

## 4. Sửa lại về sau

Đổi ngày hay bổ sung ghi chú: khối **Dự án sản xuất** → **Sửa lịch**. Vẫn đúng ô ghi chú đó, sửa xong bấm **Lưu lịch**. Bên xưởng cũng sửa được ngày ngay trên **trang dự án SX** — cả hai đường đều lưu về cùng một chỗ.

Ảnh **Sửa lịch** của dự án **TB-2026-691**. Đi theo 5 khung:

- **Khung 1** — công ty VC/LĐ.
- **Khung 2** — ghi chú cho VC/LĐ (cùng ô lúc lập kế hoạch).
- **Khung 3** — ngày lắp và nút **Sáng / Chiều**.
- **Khung 4** — ngày lấy hàng VC.
- **Khung 5** — bấm **Lưu lịch**.

![Modal Sửa lịch lắp đặt — 5 khung khoanh](/uploads/knowledge-screenshots/sx-vc-06-sua-lich.png)

Bấm **Lưu lịch** xong, hệ thống tự làm 3 việc để không ai bị hụt thông tin:

- **Dịch lại 3 mốc lịch dự kiến** (lấy hàng, lắp đặt, hoàn thiện SX) sang ngày mới.
- **Ghi một dòng vào tab Bình luận của deal**, ví dụ: «📅 Nguyễn Văn A đã cập nhật lịch dự án TB-2026-687 — ngày lắp đặt: 28/08 → 31/08 · hoàn thiện SX: 26/08 → 29/08». Đây là dấu vết để cả xưởng và Sale đối chiếu về sau.
- **Gửi thông báo**: người phụ trách SX nhận «📅 Lịch sản xuất / lắp đặt vừa đổi», nhân viên VC/LĐ nhận «🚚 Kế hoạch lắp đặt vừa cập nhật».

Mở modal rồi bấm lưu mà **không đổi gì** thì không ghi bình luận và không gửi thông báo — khỏi làm ồn.

## 5. Lỗi hay gặp ở bước này

- **Không thấy ô ghi chú** — chưa chọn Công ty VC/lắp đặt. Chọn công ty thì ô hiện ra.
- **Chọn sai công ty VC/LĐ** — thẻ sẽ nằm ở cột tạm của công ty khác, tổ đúng không thấy. Mở **Sửa lịch** chọn lại.
- **Ngày lắp để trống** — không có mốc lịch nào được tạo, tổ VC/LĐ không biết khi nào đi.

---

Làm **Bài kiểm tra 1** ở cuối bài này trước khi qua bài 4.$md3$,
  '/uploads/knowledge-screenshots/sx-vc-05-chon-vc-ghi-chu.png',
  $att3$[
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-03-nut-ke-hoach.png","caption":"Deal test — nút Thiết lập kế hoạch (khung 3)"},
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-04b-form-cac-buoc.png","caption":"Form kế hoạch — xưởng, phân loại, bấm ngày lắp"},
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-04-form-ngay-gio.png","caption":"Giờ lắp Sáng/Chiều, hoàn thiện SX tự tính, lấy hàng VC"},
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-05-chon-vc-ghi-chu.png","caption":"Công ty vận chuyển / lắp đặt, ghi chú, Thêm dự án"},
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-06-sua-lich.png","caption":"Sửa lịch — 5 khung khoanh"}
  ]$att3$::jsonb,
  14,
  ARRAY['ke-hoach', 'sale-crm', 'thao-tac'],
  true,
  3,
  true,
  now()
) ON CONFLICT (id) DO UPDATE SET
  category_id = EXCLUDED.category_id, title = EXCLUDED.title, summary = EXCLUDED.summary,
  content_md = EXCLUDED.content_md, cover_image_url = EXCLUDED.cover_image_url,
  attachments = EXCLUDED.attachments, duration_minutes = EXCLUDED.duration_minutes,
  tags = EXCLUDED.tags, is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();

-- ═══ BÀI 4 ═══
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000005-0000-0000-0000-000000000004',
  'd2000005-0000-0000-0000-000000000001',
  'Bài 4: Sau khi lưu — thẻ TẠM, thông báo, và xác nhận lần hai',
  'Hệ thống tự làm gì sau khi Sale lưu; xưởng bấm bàn giao; Sale xác nhận lại thông tin để thẻ rời cột tạm.',
  $md4$# Bài 4: Sau khi lưu — thẻ TẠM, thông báo, và xác nhận lần hai

## 1. Bốn việc hệ thống tự làm ngay khi Sale lưu

Không cần chờ xưởng, ngay lúc bấm lưu:

1. **Tạo dự án ở xưởng SX** theo xưởng và phân loại đã chọn.
2. **Đặt dự án vào cột lắp đặt tạm** của công ty VC/LĐ, thẻ có badge **🔒 TẠM** kèm dòng **Ghi chú VC/LĐ**.
3. **Tạo 3 mốc lịch dự kiến** trên tab **Lịch**: Lấy hàng (dự kiến), Lắp đặt (dự kiến) ở module Lắp đặt, và Hoàn thiện sản xuất (dự kiến) ở module Sản xuất. Người phụ trách VC, thợ lắp và người xác nhận bàn giao được gắn sẵn làm thành viên.
4. **Gửi thông báo chuông** cho nhân viên phụ trách VC/LĐ: «🚚 Kế hoạch lắp đặt sắp tới — TB-xxxx · lắp đặt 27/08 · lấy hàng 27/08 · ghi chú: …». Bấm vào thông báo là mở thẳng bảng Lắp đặt và sáng đúng thẻ.

Ngoài ra nhân viên phụ trách VC/LĐ được thêm vào tab **Thành viên** của deal để đọc được trao đổi liên quan.

Ảnh thẻ **TB-2026-691** phóng to. Đi theo 3 khung:

- **Khung 1** — mã dự án.
- **Khung 2** — badge **TẠM** (kèm khóa): chưa kéo thả được.
- **Khung 3** — **Ghi chú VC/LĐ** Sale đã nhập.

![Thẻ ở cột tạm: mã dự án, badge TẠM, ghi chú VC/LĐ](/uploads/knowledge-screenshots/sx-vc-07b-the-tam-ghi-chu.png)

Sale sửa ngày hoặc sửa ghi chú thì hệ thống gửi lại thông báo «🚚 Kế hoạch lắp đặt vừa cập nhật» cho VC/LĐ, đồng thời gửi «📅 Lịch sản xuất / lắp đặt vừa đổi» cho người phụ trách SX và ghi một dòng vào **tab Bình luận của deal** ghi rõ ngày cũ → ngày mới. Lưu lại mà công ty, ngày và ghi chú **không đổi** thì không gửi trùng — khỏi làm ồn cả tổ.

Xưởng cũng sửa ngày được từ trang dự án SX; lúc đó bình luận vẫn được ghi và Sale đọc trong tab Bình luận của deal.

## 2. Thẻ TẠM bị khoá — và vì sao vậy

Thẻ ở cột lắp đặt tạm **không kéo sang cột khác được**. Nút «Chuyển cột nhanh» và «Chuyển LĐ» cũng mờ đi. Bấm vào sẽ báo: chờ xưởng SX bàn giao và Sale CRM xác nhận lại thông tin.

Lý do: hàng chưa chắc xong. Nếu tổ VC/LĐ kéo thẻ và đi lấy hàng sớm thì mất chuyến xe.

Khoá này chỉ mở khi **đủ hai việc**: xưởng bấm bàn giao **và** Sale xác nhận lại. Trường hợp gấp, admin có thể ép chuyển sau khi xác nhận với xưởng.

Ảnh bảng Lắp đặt — khung **1** cột tạm, khung **2** thẻ vừa lên kế hoạch, khung **3** badge TẠM bị khóa, khung **4** dòng ghi chú.

![Bảng Lắp đặt — cột lắp đặt tạm với 4 khung khoanh](/uploads/knowledge-screenshots/sx-vc-07-board-cot-tam.png)

## 3. Xưởng SX hoàn thiện: bấm bàn giao

1. Trên **Kanban SX**, kéo thẻ dự án vào **cột bàn giao VC** — ví dụ cột «ĐƠN HÀNG ĐÃ CHUẨN BỊ XONG».
2. Hoặc mở **trang dự án SX** rồi bấm đúng bước đó trên thanh giai đoạn phía trên.

Hệ thống báo lại: đã gửi thông báo cho Sale CRM phụ trách deal. **Xưởng không phải chọn công ty VC/LĐ** — việc đó Sale đã làm ở bài 3.

Ảnh trang dự án **TB-2026-691**: khung đỏ khoanh bước **ĐƠN HÀNG ĐÃ CHUẨN BỊ XONG**. Xưởng bấm đúng bước này để báo hoàn thiện và gửi thẻ bàn giao cho Sale.

![Trang dự án SX — bấm bước bàn giao trên thanh giai đoạn](/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png)

## 4. Sale xác nhận lần hai

1. Sale nhận **thông báo chuông** và một thẻ **Bàn giao Lắp đặt** trong Deal → tab **Bình luận**.
2. Trong thẻ có khối **«Thông tin VC/LĐ đã điền khi lập kế hoạch — xác nhận hoặc sửa lại»**: công ty VC/LĐ, ngày lắp dự kiến và ghi chú đã **điền sẵn** từ bài 3.
3. Đọc lại, sửa nếu khách đổi ngày, rồi bấm **Chọn & bàn giao**.

Ảnh nửa trên thẻ bàn giao của deal test. Đi theo 5 khung:

- **Khung 1** — thẻ **Bàn giao Lắp đặt** do xưởng gửi lên.
- **Khung 2** — đọc lại thông tin VC/LĐ đã điền lúc lập kế hoạch.
- **Khung 3** — dòng quan trọng: **không tạo dự án mới**, chỉ rời cột lắp đặt tạm.
- **Khung 4** — xác nhận đúng công ty VC/LĐ.
- **Khung 5** — sửa ghi chú nếu có thay đổi.

![Thẻ Bàn giao Lắp đặt — nửa trên, 5 khung khoanh](/uploads/knowledge-screenshots/sx-vc-09-the-ban-giao.png)

Cuộn xuống cuối thẻ. Ảnh nửa dưới:

- **Khung 6** — ngày lắp đã chọn (bấm thêm ngày nếu lắp nhiều ngày).
- **Khung 7** — giờ lắp từng ngày: chọn **Sáng / Chiều**.
- **Khung 8** — 3 sự kiện sẽ tạo sau khi VC/LĐ xác nhận (Giao hàng xưởng · VC tới nơi LĐ · Lắp đặt).
- **Khung 9** — bấm **Chọn & bàn giao** thì thẻ rời cột lắp đặt tạm.

![Cuối thẻ bàn giao — ngày lắp, giờ lắp, 3 sự kiện, nút Chọn & bàn giao](/uploads/knowledge-screenshots/sx-vc-09b-chon-ban-giao.png)

Hai điều cần nhớ:

- **Không tạo dự án VC/LĐ mới.** Xác nhận chỉ chuyển dự án đang ở cột tạm sang cột tiếp nhận và bỏ badge TẠM.
- Chỉ **Sale CRM phụ trách deal** bấm được. Người khác chỉ xem.

## 5. VC/LĐ nhận việc thật

- Thẻ rời cột lắp đặt tạm sang **cột tiếp nhận** — ví dụ «Chờ giao hàng». Badge TẠM mất, thẻ kéo được bình thường.
- Ghi chú VC/LĐ vẫn giữ trên thẻ, trong chi tiết dự án và trên thẻ sự kiện lịch.
- **Phụ trách VC/LĐ xác nhận** trên thẻ bàn giao. Đủ hai bên (xưởng và VC/LĐ) thì hệ thống tạo các **sự kiện lịch bàn giao chính thức**, khác với mốc **(dự kiến)** đã có từ lúc lập kế hoạch.
- Từ đây kéo thẻ theo tiến độ thật: Đang giao → Đã giao → Lắp đặt → Nghiệm thu → Hoàn thiện.

## 6. Lỗi hay gặp

- **VC/LĐ không thấy dự án** — chưa bật cột lắp đặt tạm, hoặc đang xem sai công ty trên bảng Lắp đặt.
- **Không nhận được thông báo** — công ty VC/LĐ chưa cấu hình nhân viên phụ trách hoặc người xác nhận bàn giao. Chỉ người phụ trách nhận, không gửi cho cả công ty.
- **Thợ không thấy mốc trên tab Lịch** — nhân viên thường chỉ thấy sự kiện mình là thành viên. Gán họ làm thợ lắp của dự án.
- **Thẻ vẫn còn badge TẠM sau khi xưởng bàn giao** — Sale chưa bấm xác nhận trong tab Bình luận.
- **Xưởng nói không biết lịch đã đổi** — mở tab Bình luận của deal tìm dòng «📅 … đã cập nhật lịch dự án …», và kiểm chuông thông báo của đúng người phụ trách SX (thông báo chỉ gửi cho người này, không gửi cả xưởng).
- **Lo bị tạo hai dự án VC/LĐ** — không xảy ra: bàn giao chỉ chuyển cột dự án đang có.

---

Làm **Bài 5** để tự chạy trọn một ca và làm bài kiểm tra cuối.$md4$,
  '/uploads/knowledge-screenshots/sx-vc-09-the-ban-giao.png',
  $att4$[
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-07b-the-tam-ghi-chu.png","caption":"Thẻ TB-2026-691 — mã, badge TẠM, ghi chú"},
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-07-board-cot-tam.png","caption":"Bảng Lắp đặt — cột tạm và thẻ bị khóa"},
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png","caption":"Xưởng bấm ĐƠN HÀNG ĐÃ CHUẨN BỊ XONG"},
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-09-the-ban-giao.png","caption":"Thẻ bàn giao — đọc lại thông tin đã điền"},
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-09b-chon-ban-giao.png","caption":"Cuối thẻ — 3 sự kiện và nút Chọn & bàn giao"}
  ]$att4$::jsonb,
  14,
  ARRAY['ban-giao', 'thong-bao', 'vc-ld', 'san-xuat'],
  true,
  4,
  true,
  now()
) ON CONFLICT (id) DO UPDATE SET
  category_id = EXCLUDED.category_id, title = EXCLUDED.title, summary = EXCLUDED.summary,
  content_md = EXCLUDED.content_md, cover_image_url = EXCLUDED.cover_image_url,
  attachments = EXCLUDED.attachments, duration_minutes = EXCLUDED.duration_minutes,
  tags = EXCLUDED.tags, is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();

-- ═══ BÀI 5 — THỰC HÀNH MÔ PHỎNG ═══
INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  'b2000005-0000-0000-0000-000000000005',
  'd2000005-0000-0000-0000-000000000001',
  'Bài 5: Thực hành mô phỏng — tự chạy trọn một ca',
  'Đề bài thao tác trên hệ thống theo yêu cầu, tự đối chiếu phiếu kiểm, rồi làm bài kiểm tra cuối để nhận chứng nhận.',
  $md5$# Bài 5: Thực hành mô phỏng — tự chạy trọn một ca

Bài này bạn **làm thật trên hệ thống**, sau đó bài kiểm tra cuối sẽ hỏi lại những gì bạn nhìn thấy — nhiều câu có **ảnh khoanh vùng số** từ dự án test TB-2026-691. Không làm thì rất khó trả lời đúng.

## 1. Chọn deal để thực hành

Ưu tiên một **deal thật đang ở bước Đã ký hợp đồng** mà bạn phụ trách — làm thật luôn, khỏi tạo rác.

Không có deal nào phù hợp thì tạo một deal thực hành, đặt tiêu đề theo mẫu **THUCHANH - tên bạn - ngày** để dễ tìm, và nhắn admin xoá sau khi học xong. Đừng dùng tên khách thật.

## 2. Đề bài — làm đúng các yêu cầu sau

1. Mở chi tiết deal → bấm **Thiết lập kế hoạch SX & VC/LĐ** (khung **3** trên ảnh deal, giống bài 3).
2. Chọn **công ty SX** và **phân loại** đúng loại hàng của deal.
3. Đặt **ngày lắp** là **thứ Hai tuần sau**, và chọn thêm **ngày thứ Ba liền kề** để mô phỏng lắp 2 ngày.
4. Giờ lắp: bấm nút nhanh **Sáng**. Kiểm tra ô giờ nhảy thành **08:00**.
5. **Lấy hàng VC**: chọn đúng ngày lắp đầu tiên, giờ bấm nút **Chiều** rồi sửa lại cho hợp lý với xưởng nếu cần.
6. Chọn **công ty VC / lắp đặt** — chọn công ty đã được bật cột lắp đặt tạm ở bài 2.
7. Nhập **ghi chú cho bên VC/LĐ** đúng 2 dòng, ví dụ: «Hàng dễ vỡ, gọi khách trước 30 phút» và «Thang máy nhỏ, cần 2 thợ mang tay».
8. Bấm **Thêm dự án** (hoặc **Sửa lịch** → **Lưu lịch** nếu đang sửa) để chốt.

## 3. Sau khi lưu — đi kiểm 5 chỗ

1. **Bảng Lắp đặt** → chọn đúng công ty VC/LĐ: thẻ dự án nằm ở **cột lắp đặt tạm**, có badge **🔒 TẠM** và dòng **Ghi chú VC/LĐ** đúng nội dung bạn nhập.
2. **Thử kéo thẻ** sang cột khác: hệ thống phải **chặn** và báo chờ xưởng bàn giao và Sale xác nhận. Bị chặn là đúng.
3. **Tab Lịch**: có 3 mốc **(dự kiến)** — Lấy hàng, Lắp đặt, Hoàn thiện sản xuất. Mở thẻ sự kiện Lấy hàng hoặc Lắp đặt, phải thấy khối vàng **🚚 Ghi chú VC/LĐ**.
4. **Chuông thông báo** của người phụ trách VC/LĐ: có tin «🚚 Kế hoạch lắp đặt sắp tới». Bấm vào phải mở bảng Lắp đặt và sáng đúng thẻ.
5. **Tab Thành viên** của deal: nhân viên phụ trách VC/LĐ đã được thêm vào.
6. **Thử đổi lịch:** mở **Sửa lịch**, đổi ngày lắp sang một ngày khác rồi **Lưu lịch**. Sau đó mở **tab Bình luận** của deal — phải có dòng «📅 … đã cập nhật lịch dự án … ngày lắp đặt: … → …». Người phụ trách SX cũng nhận thông báo «📅 Lịch sản xuất / lắp đặt vừa đổi». Đổi lại về ngày cũ nếu bạn đang làm trên deal thật.

## 4. Mô phỏng nốt phần bàn giao

1. Nhờ xưởng (hoặc tự làm nếu bạn có quyền SX) kéo thẻ dự án vào **cột bàn giao VC** trên Kanban SX.
2. Về deal → tab **Bình luận**: xuất hiện thẻ **Bàn giao Lắp đặt** với khối xanh chứa **thông tin đã điền sẵn**.
3. Đọc lại rồi bấm **Chọn & bàn giao**.
4. Quay lại bảng Lắp đặt: thẻ đã **rời cột tạm** sang cột tiếp nhận, **badge TẠM mất**, và giờ kéo thẻ được bình thường.

## 5. Phiếu tự kiểm — tick đủ mới làm bài kiểm tra

- Đã chọn xưởng SX và phân loại
- Ngày lắp 2 ngày liên tiếp, giờ lắp 08:00 bằng nút Sáng
- Đã chọn ngày và giờ lấy hàng VC
- Đã chọn công ty VC/LĐ có cột lắp đặt tạm
- Ghi chú VC/LĐ 2 dòng đã lưu và hiện trên thẻ Kanban
- Đã thử đổi ngày lắp và thấy dòng bình luận «📅 … đã cập nhật lịch …» trong deal
- Thẻ có badge 🔒 TẠM và **không** kéo được sang cột khác
- Tab Lịch có 3 mốc dự kiến, thẻ sự kiện hiện ghi chú VC/LĐ
- Người phụ trách VC/LĐ nhận được thông báo kế hoạch
- Xưởng bấm bàn giao → Sale bấm **Chọn & bàn giao** → thẻ sang cột tiếp nhận, không có dự án trùng

## 6. Dọn dẹp

Nếu bạn tạo deal thực hành **THUCHANH - …**, nhắn admin xoá deal và dự án đó cùng các sự kiện dự kiến kèm theo, để báo cáo không bị lệch số.

---

Xong phiếu tự kiểm thì làm **Bài kiểm tra 2 — thực hành mô phỏng** ngay dưới. Đạt bài này là bạn nhận **chứng nhận** của khoá.$md5$,
  '/uploads/knowledge-screenshots/sx-vc-07b-the-tam-ghi-chu.png',
  $att5$[
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-04b-form-cac-buoc.png","caption":"Form kế hoạch — điền theo khung số trên ảnh"},
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-05-chon-vc-ghi-chu.png","caption":"Chọn công ty VC/LĐ, ghi chú rồi Thêm dự án"},
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-07b-the-tam-ghi-chu.png","caption":"Kết quả cần thấy: thẻ TẠM kèm ghi chú"},
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-09-the-ban-giao.png","caption":"Thẻ Bàn giao Lắp đặt — đọc lại thông tin"},
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-09b-chon-ban-giao.png","caption":"Cuối thẻ — bấm Chọn & bàn giao"},
    {"type":"file","url":"/uploads/knowledge-screenshots/sx-vc-huong-dan-ke-hoach.pdf","caption":"Bản PDF đầy đủ để mở song song khi thực hành"}
  ]$att5$::jsonb,
  30,
  ARRAY['thuc-hanh', 'mo-phong', 'thi-cuoi', 'chung-nhan'],
  true,
  5,
  true,
  now()
) ON CONFLICT (id) DO UPDATE SET
  category_id = EXCLUDED.category_id, title = EXCLUDED.title, summary = EXCLUDED.summary,
  content_md = EXCLUDED.content_md, cover_image_url = EXCLUDED.cover_image_url,
  attachments = EXCLUDED.attachments, duration_minutes = EXCLUDED.duration_minutes,
  tags = EXCLUDED.tags, is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();

UPDATE knowledge_lessons SET is_final_exam = true
WHERE id = 'b2000005-0000-0000-0000-000000000005';

-- ═══ BÀI KIỂM TRA 1 (gắn Bài 3) ═══
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order,
  image_url, attachments
) VALUES (
  'c2000005-0000-0000-0000-000000000001',
  'b2000005-0000-0000-0000-000000000003',
  'Bài kiểm tra 1: Lập kế hoạch SX & VC/LĐ',
  '13 câu — một số câu có ảnh khoanh vùng từ deal test TB-2026-691. Nhìn khung số trên ảnh rồi chọn đáp án. Đạt 70% là qua, tối đa 3 lượt.',
  'quiz',
  $q1${"items":[
    {"id":"k1","question":"Ai là người điền kế hoạch SX & VC/LĐ trên deal?","type":"single","options":["Xưởng sản xuất","Sale CRM phụ trách deal","Tổ vận chuyển/lắp đặt","Kế toán"],"correct":[1],"explanation":"Sale điền một lần, các bên còn lại dùng chung thông tin đó."},
    {"id":"k2","question":"Nhìn ảnh deal test. Khung 2 (tím) cho thấy deal đang ở bước nào — đây là lúc nên lập kế hoạch?","type":"single","image_url":"/uploads/knowledge-screenshots/sx-vc-03-nut-ke-hoach.png","options":["Deal mới","Đã ký hợp đồng","Sản xuất","Hoá đơn"],"correct":[1],"explanation":"Khung 2 khoanh bước Đã ký hợp đồng. Làm sớm để tổ VC/LĐ xếp xe và thợ."},
    {"id":"k12","question":"Nhìn ảnh deal test. Khung 3 (đỏ) là nút nào?","type":"single","image_url":"/uploads/knowledge-screenshots/sx-vc-03-nut-ke-hoach.png","options":["Trả về Lead","Tạo sự kiện","Thiết lập kế hoạch SX & VC/LĐ","Import Excel"],"correct":[2],"explanation":"Nút cam trên header deal — bấm để mở form kế hoạch."},
    {"id":"k3","question":"Nhìn ảnh bảng Lắp đặt. Khung 1 (xanh) là cột gì?","type":"single","image_url":"/uploads/knowledge-screenshots/sx-vc-07-board-cot-tam.png","options":["Cột Chờ giao hàng","Cột lắp đặt tạm (Dự án sắp tới)","Cột Đang giao","Cột Nghiệm thu"],"correct":[1],"explanation":"Cột Dự án sắp tới đã được chọn làm nơi để dự án lắp đặt tạm."},
    {"id":"k4","question":"Mỗi công ty VC/LĐ được bật bao nhiêu cột lắp đặt tạm?","type":"single","options":["Không giới hạn","Đúng một cột — bật cột mới thì cột cũ tự tắt","Hai cột","Tuỳ số xưởng"],"correct":[1],"explanation":"Hệ thống tự bỏ cờ ở cột cũ khi bạn bật cột mới."},
    {"id":"k5","question":"Nhìn ảnh cài đặt pipeline. Khung 3 (xanh lá) là pill nào — bấm để bật cột tạm?","type":"single","image_url":"/uploads/knowledge-screenshots/sx-vc-01-cot-lap-dat-tam.png","options":["Cột LĐ","Trigger - VC","LĐ tạm","Ẩn cột"],"correct":[2],"explanation":"Pill LĐ tạm ở giai đoạn Dự án sắp tới. Bật xong có nhãn Lắp đặt tạm (khung 4)."},
    {"id":"k13","question":"Nhìn ảnh form sửa giai đoạn. Ô tích khung 2 dùng để làm gì?","type":"single","image_url":"/uploads/knowledge-screenshots/sx-vc-02-tich-o-lap-dat-tam.png","options":["Đổi màu cột","Đặt cột này là nơi để dự án lắp đặt tạm","Xoá cột","Gắn trigger CRM"],"correct":[1],"explanation":"Tích «Nơi để dự án lắp đặt tạm» rồi bấm Lưu (khung 3)."},
    {"id":"k6","question":"Nhìn ảnh form kế hoạch. Ô «Ngày hoàn thiện» (khung xanh) được tính thế nào?","type":"single","image_url":"/uploads/knowledge-screenshots/sx-vc-04-form-ngay-gio.png","options":["Bằng đúng ngày lắp","Tự tính bằng ngày lắp trừ 2 ngày","Phải nhập tay, không tự tính","Bằng ngày lắp cộng 2 ngày"],"correct":[1],"explanation":"Ảnh minh họa: lắp 27/08 thì hoàn thiện SX tự ra 25/08."},
    {"id":"k7","question":"Nhìn ảnh. Hai nút Sáng / Chiều ở khung đỏ đặt giờ nào?","type":"single","image_url":"/uploads/knowledge-screenshots/sx-vc-04-form-ngay-gio.png","options":["Sáng 07:00 và Chiều 13:00","Sáng 08:00 và Chiều 14:00","Sáng 09:00 và Chiều 15:00","Sáng 08:30 và Chiều 13:30"],"correct":[1],"explanation":"Bấm Sáng ra 08:00, bấm Chiều ra 14:00; vẫn sửa tay được nếu cần giờ khác."},
    {"id":"k8","question":"Nhìn ảnh cuối form. Khung 2 (tím) là ô nào — vì sao đôi khi không thấy?","type":"single","image_url":"/uploads/knowledge-screenshots/sx-vc-05-chon-vc-ghi-chu.png","options":["Ô ghi chú cho VC/LĐ — chỉ hiện sau khi đã chọn công ty (khung 1)","Ô ngày lắp — chỉ hiện khi có báo giá","Ô mật khẩu — chỉ admin thấy","Ô công nợ — chỉ kế toán thấy"],"correct":[0],"explanation":"Chọn công ty VC/LĐ trước thì ô ghi chú mới hiện."},
    {"id":"k9","question":"Nội dung nào nên viết vào ghi chú cho VC/LĐ (khung 2 trên ảnh)?","type":"single","image_url":"/uploads/knowledge-screenshots/sx-vc-05-chon-vc-ghi-chu.png","options":["Giá bán và công nợ của khách","Thang máy nhỏ cần 2 thợ, chỗ đậu xe, hàng dễ vỡ","Lịch nghỉ phép của Sale","Mật khẩu tài khoản"],"correct":[1],"explanation":"Ảnh minh họa đúng kiểu ghi chú: hàng dễ vỡ, gọi khách, thang máy nhỏ, chỗ đậu xe."},
    {"id":"k10","question":"Nhìn ảnh popup Sửa lịch lắp đặt (2 cột: form trái, lịch sự kiện VC/LĐ phải). Sau khi đổi ngày, bấm nút nào?","type":"single","image_url":"/uploads/knowledge-screenshots/sx-vc-06-sua-lich.png","options":["Hủy","Lưu lịch","Tạo sự kiện","Trả về Lead"],"correct":[1],"explanation":"Popup giống hệ thống thật: Công ty vận chuyển / lắp đặt, Ghi chú, Deadline lắp đặt, Lấy hàng (VC). Chốt bằng Lưu lịch."},
    {"id":"k11","question":"Sau khi bấm Lưu lịch với ngày mới, ai biết là lịch đã đổi?","type":"single","options":["Không ai — phải tự nhắn Zalo cho nhau","Deal có thêm dòng bình luận ghi ngày cũ → ngày mới; người phụ trách SX và nhân viên VC/LĐ đều nhận thông báo","Chỉ kế toán nhận thông báo","Chỉ người vừa bấm lưu thấy"],"correct":[1],"explanation":"Hệ thống dịch lại 3 mốc lịch, ghi bình luận vào deal và gửi thông báo cho phụ trách SX («📅 Lịch sản xuất / lắp đặt vừa đổi») và cho VC/LĐ («🚚 Kế hoạch lắp đặt vừa cập nhật»). Lưu mà không đổi gì thì không gửi."}
  ]}$q1$::jsonb,
  70,
  3,
  18,
  1,
  '/uploads/knowledge-screenshots/sx-vc-04b-form-cac-buoc.png',
  $ea1$[
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-03-nut-ke-hoach.png","caption":"Deal test — nút Thiết lập kế hoạch"},
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-04b-form-cac-buoc.png","caption":"Form kế hoạch — xưởng, phân loại, ngày lắp"},
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-05-chon-vc-ghi-chu.png","caption":"Công ty VC/LĐ và ghi chú"}
  ]$ea1$::jsonb
) ON CONFLICT (id) DO UPDATE SET
  lesson_id = EXCLUDED.lesson_id, title = EXCLUDED.title, instructions = EXCLUDED.instructions,
  type = EXCLUDED.type, questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, image_url = EXCLUDED.image_url,
  attachments = EXCLUDED.attachments, updated_at = now();

-- ═══ BÀI KIỂM TRA 2 (gắn Bài 5 — thực hành mô phỏng) ═══
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order,
  image_url, attachments
) VALUES (
  'c2000005-0000-0000-0000-000000000002',
  'b2000005-0000-0000-0000-000000000005',
  'Bài kiểm tra 2: Thực hành mô phỏng — kiểm chứng thao tác',
  'Làm xong đề bài ở bài 5 rồi mới vào đây. 15 câu — nhiều câu có ảnh khoanh vùng từ dự án test TB-2026-691. Đạt 80% là qua, tối đa 3 lượt, 20 phút.',
  'quiz',
  $q2${"items":[
    {"id":"m1","question":"Nhìn ảnh. Sau khi bấm nút «Sáng» ở khung đỏ (Giờ lắp), ô giờ hiện giá trị nào?","type":"single","image_url":"/uploads/knowledge-screenshots/sx-vc-04-form-ngay-gio.png","options":["07:30","08:00","09:00","Không đổi"],"correct":[1],"explanation":"Nút Sáng đặt 08:00, nút Chiều đặt 14:00."},
    {"id":"m2","question":"Nhìn ảnh bảng Lắp đặt. Ngay sau khi lưu kế hoạch, thẻ TB-2026-691 nằm ở cột nào (khung 1)?","type":"single","image_url":"/uploads/knowledge-screenshots/sx-vc-07-board-cot-tam.png","options":["Cột Chờ giao hàng","Cột lắp đặt tạm «Dự án sắp tới»","Cột Nghiệm thu","Chưa xuất hiện, phải chờ xưởng bàn giao"],"correct":[1],"explanation":"Dự án được đặt sẵn vào cột lắp đặt tạm của công ty VC/LĐ đã chọn."},
    {"id":"m3","question":"Nhìn ảnh thẻ phóng to. Khung 2 (đỏ) là nhãn gì?","type":"single","image_url":"/uploads/knowledge-screenshots/sx-vc-07b-the-tam-ghi-chu.png","options":["Badge 🔒 TẠM — thẻ bị khoá kéo thả","Badge ĐÃ GIAO màu xanh","Badge GẤP màu đỏ","Không có nhãn nào"],"correct":[0],"explanation":"Badge TẠM báo xưởng chưa bàn giao thật, chưa kéo sang cột khác được."},
    {"id":"m4","question":"Bạn thử kéo thẻ TẠM sang cột khác — kết quả đúng là gì?","type":"single","image_url":"/uploads/knowledge-screenshots/sx-vc-07-board-cot-tam.png","options":["Thẻ chuyển bình thường","Hệ thống chặn và báo chờ xưởng bàn giao, Sale xác nhận","Thẻ bị xoá","Dự án bị tạo trùng"],"correct":[1],"explanation":"Khung 3 trên ảnh: nhãn TẠM — chưa kéo đi được."},
    {"id":"m14","question":"Nhìn ảnh thẻ phóng to. Khung 3 (xanh lá) hiển thị gì?","type":"single","image_url":"/uploads/knowledge-screenshots/sx-vc-07b-the-tam-ghi-chu.png","options":["Giá bán của deal","Ghi chú VC/LĐ Sale đã nhập lúc lập kế hoạch","Mật khẩu tài khoản","Danh sách công nợ"],"correct":[1],"explanation":"Dòng «Ghi chú VC/LĐ: Hàng dễ vỡ — gọi khách trước 30 phút…» hiện ngay trên thẻ."},
    {"id":"m5","question":"Trên tab Lịch, kế hoạch vừa lưu tạo ra mấy mốc dự kiến?","type":"single","options":["1 mốc","2 mốc","3 mốc: Lấy hàng, Lắp đặt, Hoàn thiện sản xuất","Không có mốc nào"],"correct":[2],"explanation":"Hai mốc ở module Lắp đặt và một mốc Hoàn thiện sản xuất ở module Sản xuất."},
    {"id":"m6","question":"Mở thẻ sự kiện Lấy hàng hoặc Lắp đặt, bạn thấy ghi chú VC/LĐ ở dạng nào?","type":"single","options":["Khối vàng 🚚 Ghi chú VC/LĐ","Chỉ thấy trong file PDF","Phải mở chi tiết dự án mới thấy","Không hiển thị ghi chú"],"correct":[0],"explanation":"Ghi chú được đưa vào mô tả sự kiện và hiển thị thành khối vàng riêng."},
    {"id":"m7","question":"Ai nhận thông báo «🚚 Kế hoạch lắp đặt sắp tới»?","type":"single","options":["Toàn bộ nhân viên công ty VC/LĐ","Nhân viên phụ trách VC, thợ lắp và người xác nhận bàn giao","Chỉ admin hệ thống","Chỉ kế toán"],"correct":[1],"explanation":"Chỉ người phụ trách nhận, tránh làm ồn cả tổ."},
    {"id":"m8","question":"Bạn lưu lại kế hoạch mà không đổi công ty, ngày và ghi chú. Hệ thống làm gì?","type":"single","options":["Gửi lại thông báo mỗi lần lưu","Không gửi thông báo trùng","Xoá mốc lịch cũ","Tạo thêm dự án mới"],"correct":[1],"explanation":"Thông báo chỉ gửi lại khi thông tin kế hoạch thực sự thay đổi."},
    {"id":"m9","question":"Nhìn ảnh trang dự án SX. Xưởng bấm bước khoanh đỏ để làm gì?","type":"single","image_url":"/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png","options":["Tạo dự án VC/LĐ mới","Báo hoàn thiện — gửi thẻ Bàn giao Lắp đặt cho Sale trong tab Bình luận","Tự chuyển thẻ khỏi cột tạm ngay","Xoá dự án"],"correct":[1],"explanation":"Bước «ĐƠN HÀNG ĐÃ CHUẨN BỊ XONG» chỉ báo xong; Sale mới là người xác nhận bàn giao."},
    {"id":"m10","question":"Nhìn ảnh thẻ bàn giao. Khung 2 chứa gì?","type":"single","image_url":"/uploads/knowledge-screenshots/sx-vc-09-the-ban-giao.png","options":["Ô trống phải nhập lại từ đầu","Thông tin VC/LĐ đã điền khi lập kế hoạch — xác nhận hoặc sửa lại","Danh sách công nợ","Báo giá của deal"],"correct":[1],"explanation":"Công ty, ngày lắp và ghi chú đã điền sẵn. Đây là bước xác nhận lại, không phải nhập mới."},
    {"id":"m15","question":"Nhìn ảnh thẻ bàn giao. Khung 3 (tím) nhắc điều gì?","type":"single","image_url":"/uploads/knowledge-screenshots/sx-vc-09-the-ban-giao.png","options":["Phải tạo thêm một dự án VC/LĐ mới","Không tạo dự án mới — chỉ rời cột lắp đặt tạm","Phải xoá thẻ TẠM bằng tay","Phải gửi Zalo cho xưởng"],"correct":[1],"explanation":"Bàn giao chỉ chuyển dự án đang có sang cột tiếp nhận."},
    {"id":"m11","question":"Nhìn ảnh cuối thẻ. Khung 9 là nút nào — bấm xong hệ thống làm gì?","type":"single","image_url":"/uploads/knowledge-screenshots/sx-vc-09b-chon-ban-giao.png","options":["Để sau — giữ nguyên cột tạm","Chọn & bàn giao — chuyển dự án đang có sang cột tiếp nhận, bỏ badge TẠM","Tạo sự kiện — chỉ ghi lịch, không chuyển cột","Xóa — huỷ dự án"],"correct":[1],"explanation":"Không tạo dự án trùng. Khung 8 trên cùng ảnh là 3 sự kiện sẽ tạo sau khi VC/LĐ xác nhận."},
    {"id":"m12","question":"Thẻ vẫn còn badge TẠM dù xưởng đã bấm bàn giao. Nguyên nhân thường gặp nhất?","type":"single","options":["Sale chưa xác nhận thẻ Bàn giao Lắp đặt","Mạng chậm","Thiếu ảnh minh hoạ","Chưa nghiệm thu công trình"],"correct":[0],"explanation":"Cần đủ hai việc: xưởng bàn giao và Sale xác nhận lại thông tin."},
    {"id":"m13","question":"Bạn đổi ngày lắp rồi bấm Lưu lịch. Dấu vết để lại trong deal là gì?","type":"single","image_url":"/uploads/knowledge-screenshots/sx-vc-06-sua-lich.png","options":["Không có gì, chỉ ngày trên dự án đổi","Một dòng bình luận ghi rõ ngày cũ → ngày mới trong tab Bình luận","Một file PDF được tạo","Deal bị chuyển giai đoạn"],"correct":[1],"explanation":"Ví dụ «📅 Khoa IT đã cập nhật lịch dự án TB-2026-691 — giờ lắp: 14:00 → 08:00». Đồng thời phụ trách SX và NV VC/LĐ đều nhận thông báo."}
  ]}$q2$::jsonb,
  80,
  3,
  25,
  1,
  '/uploads/knowledge-screenshots/sx-vc-07b-the-tam-ghi-chu.png',
  $ea2$[
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-07b-the-tam-ghi-chu.png","caption":"Thẻ TẠM kèm ghi chú VC/LĐ"},
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png","caption":"Xưởng bấm bước bàn giao"},
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-09-the-ban-giao.png","caption":"Thẻ bàn giao — xác nhận thông tin"},
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-09b-chon-ban-giao.png","caption":"Nút Chọn & bàn giao"}
  ]$ea2$::jsonb
) ON CONFLICT (id) DO UPDATE SET
  lesson_id = EXCLUDED.lesson_id, title = EXCLUDED.title, instructions = EXCLUDED.instructions,
  type = EXCLUDED.type, questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, image_url = EXCLUDED.image_url,
  attachments = EXCLUDED.attachments, updated_at = now();

COMMIT;
