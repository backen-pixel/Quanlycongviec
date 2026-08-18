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

![Nút «Kế hoạch SX & VC/LĐ» trên chi tiết deal](/uploads/knowledge-screenshots/sx-vc-03-nut-ke-hoach.png)

## 3. Vì sao cần cột «lắp đặt tạm»

Tổ VC/LĐ cần biết trước để xếp xe và thợ. Nhưng nếu cho họ nhận việc ngay khi Sale mới lên kế hoạch thì dễ đi lấy hàng trước khi xưởng làm xong.

Cột lắp đặt tạm giải quyết cả hai: **thấy trước, nhưng chưa được chạy**. Thẻ ở cột này bị **khoá chuyển cột** cho tới khi xưởng bàn giao và Sale xác nhận.

![Bảng Lắp đặt — cột lắp đặt tạm với thẻ badge TẠM](/uploads/knowledge-screenshots/sx-vc-07-board-cot-tam.png)

## 4. Ba từ cần nhớ

- **Cột lắp đặt tạm** — chỗ đậu tạm của dự án trên bảng Lắp đặt, trước khi bàn giao thật.
- **Badge 🔒 TẠM** — nhãn tím trên thẻ: xưởng chưa bàn giao, chưa được kéo thẻ.
- **Xác nhận lần hai** — Sale kiểm lại thông tin cũ rồi bấm bàn giao. Hệ thống **không tạo dự án VC/LĐ mới**, chỉ chuyển thẻ sang cột tiếp nhận.

---

Bài sau: cách bật cột lắp đặt tạm (việc chỉ làm một lần cho mỗi công ty VC/LĐ).$md1$,
  '/uploads/knowledge-screenshots/sx-vc-07-board-cot-tam.png',
  $att1$[
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-03-nut-ke-hoach.png","caption":"Nút Kế hoạch SX & VC/LĐ trên chi tiết deal"},
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-07-board-cot-tam.png","caption":"Cột lắp đặt tạm trên bảng Lắp đặt"},
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

![Cột «Dự án sắp tới» đã bật LĐ tạm](/uploads/knowledge-screenshots/sx-vc-01-cot-lap-dat-tam.png)

## 2. Cách khác: dùng form sửa giai đoạn

1. Bấm **Sửa** ở giai đoạn muốn chọn.
2. Tích ô **Nơi để dự án lắp đặt tạm**.
3. Bấm **Lưu**.

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
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-01-cot-lap-dat-tam.png","caption":"Pill «LĐ tạm» đã bật ở cột Dự án sắp tới"},
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-02-tich-o-lap-dat-tam.png","caption":"Ô tích Nơi để dự án lắp đặt tạm"}
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

![Header deal: nút Kế hoạch SX & VC/LĐ và khối Dự án sản xuất](/uploads/knowledge-screenshots/sx-vc-03-nut-ke-hoach.png)

## 2. Điền form theo số thứ tự

Form có **số ở từng ô** — điền lần lượt từ trên xuống, không bỏ bước.

1. **CÔNG TY SX** và **PHÂN LOẠI** — ví dụ HCB · Tủ bếp. Mỗi xưởng sẽ thành một thẻ riêng trên Kanban sản xuất.
2. **DEADLINE LẮP ĐẶT (VC/LĐ) & HOÀN THIỆN (SX)** — chọn ngày lắp. Ngày hoàn thiện của xưởng **tự tính** = ngày lắp trừ 2 ngày. Lắp nhiều ngày thì chọn thêm các ngày còn lại.
3. **LẤY HÀNG (VC)** — ngày và giờ xe tới xưởng lấy hàng.

![Bước 1–2: chọn xưởng, phân loại và deadline lắp đặt](/uploads/knowledge-screenshots/sx-vc-04b-form-cac-buoc.png)

Ở ô giờ có hai nút bấm nhanh: **Sáng** đặt 08:00, **Chiều** đặt 14:00. Không cần gõ giờ tay, chỉ bấm một nút. Muốn giờ khác thì vẫn sửa được bình thường.

![Các bước điền ngày và giờ trong form kế hoạch](/uploads/knowledge-screenshots/sx-vc-04-form-ngay-gio.png)

4. **CÔNG TY VC / LẮP ĐẶT** — chọn công ty vận chuyển/lắp đặt cho xưởng này. Chọn xong, dự án được đặt sẵn vào cột lắp đặt tạm của đúng công ty đó.
5. **GHI CHÚ CHO BÊN VC / LẮP ĐẶT** — dặn dò riêng cho tổ VC/LĐ. Ô này chỉ hiện **sau khi** đã chọn công ty VC/LĐ.
6. Bấm **Thêm dự án**, hoặc **Lưu lịch** nếu đang sửa kế hoạch cũ.

![Bước 4–5: chọn công ty VC/LĐ và nhập ghi chú](/uploads/knowledge-screenshots/sx-vc-05-chon-vc-ghi-chu.png)

## 3. Ghi chú nên viết gì

Viết đúng những thứ ảnh hưởng tới xe và thợ:

- Hàng dễ vỡ, gọi khách trước 30 phút.
- Thang máy nhỏ, cần 2 thợ mang tay.
- Chỗ đậu xe: mặt tiền sảnh B, sau 18h mới được đậu.
- Nhà chưa xong điện, chỉ lắp phần tủ dưới.

Ghi chú theo **từng xưởng**: mỗi xưởng gắn một công ty VC/LĐ, nên nhập riêng cho từng thẻ.

## 4. Sửa lại về sau

Đổi ngày hay bổ sung ghi chú: khối **Dự án sản xuất** → **Sửa lịch**. Vẫn đúng ô ghi chú đó, sửa xong bấm **Lưu lịch**. Bên xưởng cũng sửa được ngày ngay trên **trang dự án SX** — cả hai đường đều lưu về cùng một chỗ.

![Modal Sửa lịch lắp đặt — công ty VC/LĐ, ghi chú, ngày lắp, ngày lấy hàng](/uploads/knowledge-screenshots/sx-vc-06-sua-lich.png)

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
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-04b-form-cac-buoc.png","caption":"Form kế hoạch — bước 1 và 2"},
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-04-form-ngay-gio.png","caption":"Ô ngày và giờ, nút Sáng / Chiều"},
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-05-chon-vc-ghi-chu.png","caption":"Chọn công ty VC/LĐ và ghi chú"},
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-06-sua-lich.png","caption":"Modal Sửa lịch lắp đặt"}
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

![Thẻ ở cột tạm: badge TẠM kèm ghi chú VC/LĐ](/uploads/knowledge-screenshots/sx-vc-07b-the-tam-ghi-chu.png)

Sale sửa ngày hoặc sửa ghi chú thì hệ thống gửi lại thông báo «🚚 Kế hoạch lắp đặt vừa cập nhật» cho VC/LĐ, đồng thời gửi «📅 Lịch sản xuất / lắp đặt vừa đổi» cho người phụ trách SX và ghi một dòng vào **tab Bình luận của deal** ghi rõ ngày cũ → ngày mới. Lưu lại mà công ty, ngày và ghi chú **không đổi** thì không gửi trùng — khỏi làm ồn cả tổ.

Xưởng cũng sửa ngày được từ trang dự án SX; lúc đó bình luận vẫn được ghi và Sale đọc trong tab Bình luận của deal.

## 2. Thẻ TẠM bị khoá — và vì sao vậy

Thẻ ở cột lắp đặt tạm **không kéo sang cột khác được**. Nút «Chuyển cột nhanh» và «Chuyển LĐ» cũng mờ đi. Bấm vào sẽ báo: chờ xưởng SX bàn giao và Sale CRM xác nhận lại thông tin.

Lý do: hàng chưa chắc xong. Nếu tổ VC/LĐ kéo thẻ và đi lấy hàng sớm thì mất chuyến xe.

Khoá này chỉ mở khi **đủ hai việc**: xưởng bấm bàn giao **và** Sale xác nhận lại. Trường hợp gấp, admin có thể ép chuyển sau khi xác nhận với xưởng.

![Bảng Lắp đặt — cột lắp đặt tạm](/uploads/knowledge-screenshots/sx-vc-07-board-cot-tam.png)

## 3. Xưởng SX hoàn thiện: bấm bàn giao

1. Trên **Kanban SX**, kéo thẻ dự án vào **cột bàn giao VC** — ví dụ cột «ĐƠN HÀNG ĐÃ CHUẨN BỊ XONG».
2. Hoặc mở **trang dự án SX** rồi bấm đúng bước đó trên thanh giai đoạn phía trên.

Hệ thống báo lại: đã gửi thông báo cho Sale CRM phụ trách deal. **Xưởng không phải chọn công ty VC/LĐ** — việc đó Sale đã làm ở bài 3.

![Trang dự án SX — bấm bước bàn giao trên thanh giai đoạn](/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png)

## 4. Sale xác nhận lần hai

1. Sale nhận **thông báo chuông** và một thẻ **Bàn giao Lắp đặt** trong Deal → tab **Bình luận**.
2. Trong thẻ có khối xanh **«Thông tin VC/LĐ đã điền khi lập kế hoạch — xác nhận hoặc sửa lại»**: công ty VC/LĐ, ngày lắp dự kiến và ghi chú đã **điền sẵn** từ bài 3.
3. Đọc lại, sửa nếu khách đổi ngày, rồi bấm **Chọn & bàn giao**.

![Thẻ Bàn giao Lắp đặt trong tab Bình luận của deal](/uploads/knowledge-screenshots/sx-vc-09-the-ban-giao.png)

Cuộn xuống cuối thẻ để kiểm ngày lắp, giờ lắp và 3 sự kiện sẽ tạo, rồi bấm **Chọn & bàn giao**.

![Cuối thẻ bàn giao — ngày lắp, giờ lắp và nút Chọn & bàn giao](/uploads/knowledge-screenshots/sx-vc-09b-chon-ban-giao.png)

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
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-07b-the-tam-ghi-chu.png","caption":"Thẻ TẠM kèm ghi chú VC/LĐ"},
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-07-board-cot-tam.png","caption":"Cột lắp đặt tạm"},
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-08-sx-ban-giao.png","caption":"Xưởng bấm bước bàn giao"},
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-09-the-ban-giao.png","caption":"Thẻ Bàn giao Lắp đặt — Sale xác nhận"},
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-09b-chon-ban-giao.png","caption":"Cuối thẻ bàn giao — nút Chọn & bàn giao"}
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

Bài này bạn **làm thật trên hệ thống**, sau đó bài kiểm tra cuối sẽ hỏi lại những gì bạn nhìn thấy. Không làm thì rất khó trả lời đúng.

## 1. Chọn deal để thực hành

Ưu tiên một **deal thật đang ở bước Đã ký hợp đồng** mà bạn phụ trách — làm thật luôn, khỏi tạo rác.

Không có deal nào phù hợp thì tạo một deal thực hành, đặt tiêu đề theo mẫu **THUCHANH - tên bạn - ngày** để dễ tìm, và nhắn admin xoá sau khi học xong. Đừng dùng tên khách thật.

## 2. Đề bài — làm đúng các yêu cầu sau

1. Mở chi tiết deal → bấm **Thiết lập kế hoạch SX & VC/LĐ**.
2. Chọn **công ty SX** và **phân loại** đúng loại hàng của deal.
3. Đặt **ngày lắp** là **thứ Hai tuần sau**, và chọn thêm **ngày thứ Ba liền kề** để mô phỏng lắp 2 ngày.
4. Giờ lắp: bấm nút nhanh **Sáng**. Kiểm tra ô giờ nhảy thành **08:00**.
5. **Lấy hàng VC**: chọn đúng ngày lắp đầu tiên, giờ bấm nút **Chiều** rồi sửa lại cho hợp lý với xưởng nếu cần.
6. Chọn **công ty VC / lắp đặt** — chọn công ty đã được bật cột lắp đặt tạm ở bài 2.
7. Nhập **ghi chú cho bên VC/LĐ** đúng 2 dòng, ví dụ: «Hàng dễ vỡ, gọi khách trước 30 phút» và «Thang máy nhỏ, cần 2 thợ mang tay».
8. Bấm **Thêm dự án** (hoặc **Lưu lịch**) để chốt.

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
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-04b-form-cac-buoc.png","caption":"Form kế hoạch — điền theo số thứ tự"},
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-07b-the-tam-ghi-chu.png","caption":"Kết quả cần thấy: thẻ TẠM kèm ghi chú"},
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-09-the-ban-giao.png","caption":"Thẻ Bàn giao Lắp đặt để xác nhận lần hai"},
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
  '11 câu trắc nghiệm về luồng và cách điền form kế hoạch (bài 1 đến bài 3). Đạt 70% là qua, được làm lại tối đa 3 lượt. Sau khi nộp có phần giải thích cho từng câu.',
  'quiz',
  $q1${"items":[
    {"id":"k1","question":"Ai là người điền kế hoạch SX & VC/LĐ trên deal?","type":"single","options":["Xưởng sản xuất","Sale CRM phụ trách deal","Tổ vận chuyển/lắp đặt","Kế toán"],"correct":[1],"explanation":"Sale điền một lần, các bên còn lại dùng chung thông tin đó."},
    {"id":"k2","question":"Thời điểm nên lập kế hoạch là khi nào?","type":"single","options":["Khi deal vừa sang bước Đã ký hợp đồng","Khi xưởng đã làm xong hàng","Khi xe đã tới nhà khách","Sau khi nghiệm thu"],"correct":[0],"explanation":"Làm sớm để tổ VC/LĐ có thời gian xếp xe và thợ."},
    {"id":"k3","question":"Cột «lắp đặt tạm» dùng để làm gì?","type":"single","options":["Chứa dự án đã hoàn thiện","Cho tổ VC/LĐ thấy trước dự án nhưng chưa được chạy","Lưu dự án bị huỷ","Thay cho cột nghiệm thu"],"correct":[1],"explanation":"Thấy trước để chuẩn bị, nhưng thẻ bị khoá tới khi bàn giao thật."},
    {"id":"k4","question":"Mỗi công ty VC/LĐ được bật bao nhiêu cột lắp đặt tạm?","type":"single","options":["Không giới hạn","Đúng một cột — bật cột mới thì cột cũ tự tắt","Hai cột","Tuỳ số xưởng"],"correct":[1],"explanation":"Hệ thống tự bỏ cờ ở cột cũ khi bạn bật cột mới."},
    {"id":"k5","question":"Bật cột lắp đặt tạm ở đâu?","type":"single","options":["CRM → Cài đặt pipeline Lead","Lắp đặt → Cài đặt Pipeline Lắp đặt","Sản xuất → Cấu hình xưởng","Kiến thức → Quản trị"],"correct":[1],"explanation":"Đường dẫn /vc/pipeline-settings, chọn công ty rồi bật pill LĐ tạm."},
    {"id":"k6","question":"Ngày hoàn thiện của xưởng được tính thế nào khi bạn chọn ngày lắp?","type":"single","options":["Bằng đúng ngày lắp","Tự tính bằng ngày lắp trừ 2 ngày","Phải nhập tay, không tự tính","Bằng ngày lắp cộng 2 ngày"],"correct":[1],"explanation":"Hệ thống tự lùi 2 ngày để xưởng có thời gian đóng gói."},
    {"id":"k7","question":"Hai nút bấm nhanh ở ô giờ đặt giờ nào?","type":"single","options":["Sáng 07:00 và Chiều 13:00","Sáng 08:00 và Chiều 14:00","Sáng 09:00 và Chiều 15:00","Sáng 08:30 và Chiều 13:30"],"correct":[1],"explanation":"Bấm Sáng ra 08:00, bấm Chiều ra 14:00; vẫn sửa tay được nếu cần giờ khác."},
    {"id":"k8","question":"Vì sao bạn không thấy ô «Ghi chú cho bên VC / lắp đặt»?","type":"single","options":["Do chưa chọn Công ty VC / lắp đặt","Do chưa nhập ngày lắp","Do tài khoản không có quyền","Do deal chưa có báo giá"],"correct":[0],"explanation":"Ô ghi chú chỉ hiện sau khi đã chọn công ty VC/LĐ."},
    {"id":"k9","question":"Nội dung nào nên viết vào ghi chú cho VC/LĐ?","type":"single","options":["Giá bán và công nợ của khách","Thang máy nhỏ cần 2 thợ, chỗ đậu xe, hàng dễ vỡ","Lịch nghỉ phép của Sale","Mật khẩu tài khoản"],"correct":[1],"explanation":"Chỉ ghi những thứ ảnh hưởng tới xe, thợ và cách vào nhà khách."},
    {"id":"k10","question":"Cần đổi ngày lắp sau khi đã lưu kế hoạch thì làm ở đâu?","type":"single","options":["Tạo lại deal mới","Trên CRM: khối Dự án sản xuất → Sửa lịch → Lưu lịch (bên xưởng cũng sửa được trên trang dự án SX)","Chỉ admin hệ thống sửa được","Không sửa được nữa"],"correct":[1],"explanation":"Sửa lịch dùng chung ô ghi chú và các ngày. Cả CRM và trang dự án SX đều lưu về cùng một chỗ."},
    {"id":"k11","question":"Sau khi bấm Lưu lịch với ngày mới, ai biết là lịch đã đổi?","type":"single","options":["Không ai — phải tự nhắn Zalo cho nhau","Deal có thêm dòng bình luận ghi ngày cũ → ngày mới; người phụ trách SX và nhân viên VC/LĐ đều nhận thông báo","Chỉ kế toán nhận thông báo","Chỉ người vừa bấm lưu thấy"],"correct":[1],"explanation":"Hệ thống dịch lại 3 mốc lịch, ghi bình luận vào deal và gửi thông báo cho phụ trách SX («📅 Lịch sản xuất / lắp đặt vừa đổi») và cho VC/LĐ («🚚 Kế hoạch lắp đặt vừa cập nhật»). Lưu mà không đổi gì thì không gửi."}
  ]}$q1$::jsonb,
  70,
  3,
  15,
  1,
  '/uploads/knowledge-screenshots/sx-vc-04b-form-cac-buoc.png',
  $ea1$[{"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-04b-form-cac-buoc.png","caption":"Form kế hoạch theo số thứ tự"}]$ea1$::jsonb
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
  'Làm xong đề bài ở bài 5 rồi mới vào đây. 13 câu hỏi về đúng những gì bạn thấy trên hệ thống khi thao tác. Đạt 80% là qua, tối đa 3 lượt, 20 phút. Đạt bài này là nhận chứng nhận của khoá.',
  'quiz',
  $q2${"items":[
    {"id":"m1","question":"Sau khi bấm nút nhanh «Sáng» ở ô giờ lắp, ô giờ hiện giá trị nào?","type":"single","options":["07:30","08:00","09:00","Không đổi"],"correct":[1],"explanation":"Nút Sáng đặt 08:00, nút Chiều đặt 14:00."},
    {"id":"m2","question":"Ngay sau khi lưu kế hoạch, thẻ dự án xuất hiện ở đâu trên bảng Lắp đặt?","type":"single","options":["Cột Chờ giao hàng","Cột lắp đặt tạm đã cấu hình","Cột Nghiệm thu","Chưa xuất hiện, phải chờ xưởng bàn giao"],"correct":[1],"explanation":"Dự án được đặt sẵn vào cột lắp đặt tạm của công ty VC/LĐ đã chọn."},
    {"id":"m3","question":"Thẻ ở cột lắp đặt tạm có nhãn gì?","type":"single","options":["Badge 🔒 TẠM màu tím","Badge ĐÃ GIAO màu xanh","Badge GẤP màu đỏ","Không có nhãn nào"],"correct":[0],"explanation":"Badge TẠM báo xưởng chưa bàn giao thật."},
    {"id":"m4","question":"Bạn thử kéo thẻ TẠM sang cột khác — kết quả đúng là gì?","type":"single","options":["Thẻ chuyển bình thường","Hệ thống chặn và báo chờ xưởng bàn giao, Sale xác nhận","Thẻ bị xoá","Dự án bị tạo trùng"],"correct":[1],"explanation":"Thẻ TẠM bị khoá chuyển cột; nút chuyển cột nhanh cũng mờ đi."},
    {"id":"m5","question":"Trên tab Lịch, kế hoạch vừa lưu tạo ra mấy mốc dự kiến?","type":"single","options":["1 mốc","2 mốc","3 mốc: Lấy hàng, Lắp đặt, Hoàn thiện sản xuất","Không có mốc nào"],"correct":[2],"explanation":"Hai mốc ở module Lắp đặt và một mốc Hoàn thiện sản xuất ở module Sản xuất."},
    {"id":"m6","question":"Mở thẻ sự kiện Lấy hàng hoặc Lắp đặt, bạn thấy ghi chú VC/LĐ ở dạng nào?","type":"single","options":["Khối vàng 🚚 Ghi chú VC/LĐ","Chỉ thấy trong file PDF","Phải mở chi tiết dự án mới thấy","Không hiển thị ghi chú"],"correct":[0],"explanation":"Ghi chú được đưa vào mô tả sự kiện và hiển thị thành khối vàng riêng."},
    {"id":"m7","question":"Ai nhận thông báo «🚚 Kế hoạch lắp đặt sắp tới»?","type":"single","options":["Toàn bộ nhân viên công ty VC/LĐ","Nhân viên phụ trách VC, thợ lắp và người xác nhận bàn giao","Chỉ admin hệ thống","Chỉ kế toán"],"correct":[1],"explanation":"Chỉ người phụ trách nhận, tránh làm ồn cả tổ."},
    {"id":"m8","question":"Bạn lưu lại kế hoạch mà không đổi công ty, ngày và ghi chú. Hệ thống làm gì?","type":"single","options":["Gửi lại thông báo mỗi lần lưu","Không gửi thông báo trùng","Xoá mốc lịch cũ","Tạo thêm dự án mới"],"correct":[1],"explanation":"Thông báo chỉ gửi lại khi thông tin kế hoạch thực sự thay đổi."},
    {"id":"m9","question":"Sau khi xưởng kéo thẻ vào cột bàn giao VC, việc gì xảy ra ở phía CRM?","type":"single","options":["Dự án VC/LĐ mới được tạo tự động","Sale nhận thông báo và có thẻ Bàn giao Lắp đặt trong tab Bình luận","Thẻ tự rời cột tạm ngay","Deal tự chuyển sang Hoàn thành"],"correct":[1],"explanation":"Xưởng chỉ báo xong; quyền quyết định bàn giao vẫn ở Sale."},
    {"id":"m10","question":"Trong thẻ Bàn giao Lắp đặt, khối xanh chứa gì?","type":"single","options":["Ô trống phải nhập lại từ đầu","Công ty VC/LĐ, ngày lắp và ghi chú đã điền sẵn từ lúc lập kế hoạch","Danh sách công nợ","Báo giá của deal"],"correct":[1],"explanation":"Đây là bước xác nhận lại thông tin cũ, không phải nhập mới."},
    {"id":"m11","question":"Sau khi Sale bấm «Chọn & bàn giao», hệ thống làm gì với dự án?","type":"single","options":["Tạo một dự án VC/LĐ mới","Chuyển dự án đang có sang cột tiếp nhận và bỏ badge TẠM","Xoá dự án cũ rồi tạo lại","Giữ nguyên ở cột tạm"],"correct":[1],"explanation":"Không bao giờ tạo dự án trùng — chỉ chuyển cột thẻ hiện có."},
    {"id":"m12","question":"Thẻ vẫn còn badge TẠM dù xưởng đã bấm bàn giao. Nguyên nhân thường gặp nhất?","type":"single","options":["Sale chưa xác nhận thẻ Bàn giao Lắp đặt","Mạng chậm","Thiếu ảnh minh hoạ","Chưa nghiệm thu công trình"],"correct":[0],"explanation":"Cần đủ hai việc: xưởng bàn giao và Sale xác nhận lại thông tin."},
    {"id":"m13","question":"Bạn đổi ngày lắp rồi bấm Lưu lịch. Dấu vết để lại trong deal là gì?","type":"single","options":["Không có gì, chỉ ngày trên dự án đổi","Một dòng bình luận ghi rõ ngày cũ → ngày mới trong tab Bình luận","Một file PDF được tạo","Deal bị chuyển giai đoạn"],"correct":[1],"explanation":"Ví dụ «📅 Nguyễn Văn A đã cập nhật lịch dự án TB-2026-687 — ngày lắp đặt: 28/08 → 31/08». Đồng thời phụ trách SX và NV VC/LĐ đều nhận thông báo."}
  ]}$q2$::jsonb,
  80,
  3,
  20,
  1,
  '/uploads/knowledge-screenshots/sx-vc-07b-the-tam-ghi-chu.png',
  $ea2$[{"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-07b-the-tam-ghi-chu.png","caption":"Kết quả cần quan sát: thẻ TẠM kèm ghi chú VC/LĐ"}]$ea2$::jsonb
) ON CONFLICT (id) DO UPDATE SET
  lesson_id = EXCLUDED.lesson_id, title = EXCLUDED.title, instructions = EXCLUDED.instructions,
  type = EXCLUDED.type, questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, image_url = EXCLUDED.image_url,
  attachments = EXCLUDED.attachments, updated_at = now();

COMMIT;
