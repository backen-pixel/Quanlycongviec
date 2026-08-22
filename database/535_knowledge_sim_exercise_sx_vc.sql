-- 535
-- Bài kiểm tra mô phỏng thao tác cho khoá «Kế hoạch SX & VC/LĐ»
-- Thêm loại bài tập 'simulation' và seed sân tập CRM · Sản xuất · VC/LĐ · Lịch.
-- Cấu hình nằm ở questions.scenario (dữ liệu giả) + questions.steps (bước chấm điểm).
-- Frontend: frontend/src/components/KnowledgeSimulationPlayer.jsx
-- Chấm điểm: backend/src/routes/knowledge.js → gradeSimulation()
-- Lưu ý: Postgres không cho dùng giá trị enum mới trong cùng transaction vừa thêm nó,
--        nên file chia 2 phần bằng mốc @@SPLIT@@ (apply-migration-535.js chạy lần lượt).

ALTER TYPE knowledge_exercise_type ADD VALUE IF NOT EXISTS 'simulation';

-- @@SPLIT@@

BEGIN;

-- ═══ BÀI KIỂM TRA 3 — SÂN TẬP MÔ PHỎNG (gắn Bài 5) ═══
INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order,
  image_url, attachments
) VALUES (
  'c2000005-0000-0000-0000-000000000003',
  'b2000005-0000-0000-0000-000000000005',
  'Bài kiểm tra 3: Sân tập mô phỏng — thao tác trên CRM · Sản xuất · VC/LĐ',
  'Bài thao tác thật trên sân tập giả lập: bạn có 4 không gian làm việc (CRM, Sản xuất, VC/Lắp đặt, Lịch) và phải chạy trọn một ca theo đề bài. Hệ thống chấm từng bước, đạt 80% là qua, tối đa 5 lượt. Có 5 bước gắn nhãn «bắt buộc» — trượt một bước bắt buộc là chưa đạt dù tổng điểm cao. Sân tập KHÔNG ghi dữ liệu vào hệ thống thật nên cứ thử thoải mái.',
  'simulation',
  $sim${
  "mode": "simulation",
  "brief": "Điền 3 mục rồi bấm **Thêm dự án**:\n\n• Công ty SX: **Xưởng HCB**\n• Công ty VC/LĐ: **VC Phúc Đạt**\n• Ngày giờ: lắp **2 ngày liền nhau** (sau hôm nay) lúc **Sáng**. Ngày lấy hàng / vận chuyển: lúc **Chiều** — **vẫn không được sau ngày lắp đặt** (cùng ngày hoặc trước)",
  "scenario": {
    "deal": {
      "code": "DEAL-MP-2026-01",
      "project_code": "TB-MP-001",
      "title": "Tủ bếp nhà chị Lan — Q7",
      "customer": "Chị Lan",
      "phone": "0909 111 222",
      "address": "25 Nguyễn Lương Bằng, Q7",
      "stage": "Đã ký hợp đồng"
    },
    "sx_companies": [
      { "id": "hcb", "name": "Xưởng HCB" },
      { "id": "tanbinh", "name": "Xưởng Tân Bình" }
    ],
    "classifications": [
      { "id": "tu-bep", "name": "Tủ bếp" },
      { "id": "tu-ao", "name": "Tủ áo" }
    ],
    "vc_companies": [
      { "id": "phuc-dat", "name": "VC Phúc Đạt", "temp_column": "Dự án sắp tới", "intake_column": "Chờ giao hàng" },
      { "id": "an-thinh", "name": "VC An Thịnh", "temp_column": null, "intake_column": "Chờ giao hàng" }
    ],
    "sx_columns": ["Chờ tiếp nhận", "Đang sản xuất", "Đơn hàng đã chuẩn bị xong"],
    "sx_handover_column": "Đơn hàng đã chuẩn bị xong",
    "vc_columns": ["Dự án sắp tới", "Chờ giao hàng", "Đang giao", "Lắp đặt", "Nghiệm thu"]
  },
  "steps": [
    { "id": "sx_company", "label": "Chọn công ty SX «Xưởng HCB»", "points": 1, "hint": "Bước 1 của form kế hoạch", "check": { "type": "equals", "field": "sx_company", "value": "hcb" } },
    { "id": "classification", "label": "Chọn phân loại «Tủ bếp»", "points": 1, "hint": "Bước 1 của form kế hoạch", "check": { "type": "equals", "field": "classification", "value": "tu-bep" } },
    { "id": "install_two_days", "label": "Chọn 2 ngày lắp liền nhau", "points": 2, "hint": "Bấm 2 ô ngày cạnh nhau ở bước 2", "check": { "type": "consecutive_days", "field": "install_dates", "value": 2 } },
    { "id": "install_future", "label": "Ngày lắp phải ở tương lai", "points": 1, "hint": "Không chọn ngày đã qua hoặc hôm nay", "check": { "type": "after_today", "field": "install_dates" } },
    { "id": "install_shift", "label": "Giờ lắp bấm nút «Sáng» (08:00)", "points": 1, "hint": "Nút Sáng ra 08:00, nút Chiều ra 14:00", "check": { "type": "equals", "field": "install_time", "value": "08:00" } },
    { "id": "pickup_not_after", "label": "Ngày lấy hàng / vận chuyển không được sau ngày lắp đặt", "points": 1, "hint": "Ngày VC đi lấy hàng được chọn, nhưng vẫn không được sau ngày lắp. Cùng ngày hoặc trước thì đạt.", "check": { "type": "not_after_field", "field": "pickup_date", "other": "install_dates" } },
    { "id": "pickup_shift", "label": "Giờ lấy hàng bấm nút «Chiều» (14:00)", "points": 1, "hint": "Bước 3 của form kế hoạch", "check": { "type": "equals", "field": "pickup_time", "value": "14:00" } },
    { "id": "vc_company", "label": "Chọn công ty VC/LĐ có cột lắp đặt tạm («VC Phúc Đạt»)", "points": 2, "required": true, "hint": "Công ty chưa bật cột tạm thì tổ VC/LĐ không thấy trước", "check": { "type": "equals", "field": "vc_company", "value": "phuc-dat" } },
    { "id": "vc_notes", "label": "Ghi chú cho VC/LĐ ít nhất 1 dòng", "points": 2, "hint": "Ghi thứ ảnh hưởng tới xe và thợ: thang máy, chỗ đậu xe, hàng dễ vỡ", "check": { "type": "min_lines", "field": "vc_notes", "value": 1 } },
    { "id": "saved", "label": "Bấm «Thêm dự án» để lưu kế hoạch", "points": 1, "required": true, "hint": "Bước 6 của form kế hoạch", "check": { "type": "true", "field": "saved" } },
    { "id": "temp_seen", "label": "Mở bảng VC/LĐ và thấy thẻ ở cột lắp đặt tạm", "points": 1, "hint": "Tab «VC / Lắp đặt» sau khi lưu", "check": { "type": "true", "field": "temp_card_seen" } },
    { "id": "drag_blocked", "label": "Thử chuyển thẻ TẠM sang cột khác và thấy bị chặn", "points": 2, "hint": "Bấm «Chuyển thẻ vào đây» ở một cột khác khi thẻ còn badge TẠM", "check": { "type": "true", "field": "drag_blocked_seen" } },
    { "id": "events_seen", "label": "Mở tab Lịch xem 3 mốc dự kiến", "points": 1, "hint": "Lấy hàng · Lắp đặt · Hoàn thiện sản xuất", "check": { "type": "true", "field": "events_seen" } },
    { "id": "sx_handover", "label": "Xưởng chuyển thẻ vào cột «Đơn hàng đã chuẩn bị xong»", "points": 2, "required": true, "hint": "Tab Sản xuất", "check": { "type": "true", "field": "sx_handover" } },
    { "id": "sale_confirm", "label": "Sale bấm «Chọn & bàn giao» trong tab Bình luận", "points": 2, "required": true, "hint": "Xác nhận lần hai — kiểm lại thông tin đã điền", "check": { "type": "true", "field": "sale_confirm" } },
    { "id": "final_column", "label": "Thẻ nằm ở cột «Chờ giao hàng» và hết badge TẠM", "points": 2, "required": true, "hint": "Bàn giao chỉ chuyển cột, không tạo dự án mới", "check": { "type": "equals", "field": "final_column", "value": "Chờ giao hàng" } }
  ]
}$sim$::jsonb,
  80,
  5,
  NULL,
  2,
  '/uploads/knowledge-screenshots/sx-vc-07b-the-tam-ghi-chu.png',
  $ea3$[
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-04b-form-cac-buoc.png","caption":"Form kế hoạch — chọn xưởng, phân loại, bấm ngày lắp"},
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-05-chon-vc-ghi-chu.png","caption":"Chọn công ty vận chuyển / lắp đặt, ghi chú rồi Thêm dự án"},
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-07b-the-tam-ghi-chu.png","caption":"Kết quả cần đạt: thẻ TẠM kèm ghi chú VC/LĐ"},
    {"type":"image","url":"/uploads/knowledge-screenshots/sx-vc-09b-chon-ban-giao.png","caption":"Bước cuối trên hệ thống thật: Chọn & bàn giao"}
  ]$ea3$::jsonb
) ON CONFLICT (id) DO UPDATE SET
  lesson_id = EXCLUDED.lesson_id, title = EXCLUDED.title, instructions = EXCLUDED.instructions,
  type = EXCLUDED.type, questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, image_url = EXCLUDED.image_url,
  attachments = EXCLUDED.attachments, updated_at = now();

-- Bài 5 nhắc học viên vào sân tập (idempotent: chỉ nối thêm một lần)
UPDATE knowledge_lessons SET
  content_md = content_md || $add$

## 7. Sân tập mô phỏng — làm thật trước khi làm trên hệ thống

Nếu bạn chưa có deal thật để thực hành, mở **Bài kiểm tra 3: Sân tập mô phỏng** ở cuối bài này. Sân tập dựng lại 4 không gian làm việc — **CRM · Sản xuất · VC/Lắp đặt · Lịch** — với dữ liệu giả:

- Bấm đúng thứ tự như hệ thống thật: lập kế hoạch → thẻ vào cột lắp đặt tạm → thử kéo thẻ TẠM (bị chặn) → xưởng bàn giao → Sale bấm «Chọn & bàn giao» → thẻ sang cột «Chờ giao hàng».
- Mỗi bước được **chấm điểm riêng**; nộp bài xong bạn thấy bước nào đạt, bước nào sai và sai vì sao.
- Sân tập **không tạo dự án, sự kiện hay thông báo thật**, nên cứ bấm sai thoải mái. Có nút «Làm mới sân tập» để chạy lại từ đầu.

Đạt 80% ở sân tập là bạn đã sẵn sàng làm trên dữ liệu thật.
$add$,
  updated_at = now()
WHERE id = 'b2000005-0000-0000-0000-000000000005'
  AND content_md NOT LIKE '%Sân tập mô phỏng — làm thật trước khi làm%';

COMMIT;
