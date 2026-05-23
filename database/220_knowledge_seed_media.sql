-- 220_knowledge_seed_media.sql
-- Bổ sung ảnh bìa, YouTube và media đính kèm cho dữ liệu mẫu (seed 218).
-- Chỉ chạy được sau 217 + 218 + 219.
-- Idempotent: dùng UPDATE WHERE id, chạy lại không nhân đôi.

BEGIN;

-- 1. Bài: Làm quen giao diện hệ thống
UPDATE knowledge_lessons SET
  cover_image_url = 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=1200&q=80',
  video_url       = 'https://www.youtube.com/watch?v=Tn6-PIqc4UM',
  video_type      = 'youtube',
  attachments     = '[
    {"type":"image","url":"https://images.unsplash.com/photo-1551434678-e076c223a692?w=1200&q=80","caption":"Sơ đồ giao diện dashboard"},
    {"type":"link","url":"https://www.figma.com/","caption":"Tham khảo design system"}
  ]'::jsonb
WHERE id = 'b0000001-0000-0000-0000-000000000001';

-- 2. Bài: Đổi mật khẩu và bảo mật
UPDATE knowledge_lessons SET
  cover_image_url = 'https://images.unsplash.com/photo-1555949963-aa79dcee981c?w=1200&q=80',
  attachments     = '[
    {"type":"image","url":"https://images.unsplash.com/photo-1614064548237-096d0f6fce5b?w=1200&q=80","caption":"Ví dụ mật khẩu mạnh"}
  ]'::jsonb
WHERE id = 'b0000001-0000-0000-0000-000000000002';

-- 3. Bài: Tạo Lead mới
UPDATE knowledge_lessons SET
  cover_image_url = 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=1200&q=80',
  video_url       = 'https://www.youtube.com/watch?v=mlOXkmrm7Ck',
  video_type      = 'youtube',
  attachments     = '[
    {"type":"image","url":"https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80","caption":"Kanban board các giai đoạn Lead"},
    {"type":"youtube","url":"https://www.youtube.com/watch?v=ePXuuTcaV2w","caption":"Video phụ: kỹ năng tiếp nhận KH"}
  ]'::jsonb
WHERE id = 'b0000001-0000-0000-0000-000000000003';

-- 4. Bài: Chuyển Lead → Deal
UPDATE knowledge_lessons SET
  cover_image_url = 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&q=80',
  attachments     = '[
    {"type":"image","url":"https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=1200&q=80","caption":"Pipeline Deal đầy đủ 5 giai đoạn"}
  ]'::jsonb
WHERE id = 'b0000001-0000-0000-0000-000000000004';

-- 5. Bài: Tạo Báo giá
UPDATE knowledge_lessons SET
  cover_image_url = 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1200&q=80',
  attachments     = '[
    {"type":"image","url":"https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=1200&q=80","caption":"Mẫu báo giá xuất PDF"},
    {"type":"link","url":"https://docs.google.com/spreadsheets/","caption":"Template tính chiết khấu"}
  ]'::jsonb
WHERE id = 'b0000001-0000-0000-0000-000000000005';

-- 6. Bài: Hiểu KPI
UPDATE knowledge_lessons SET
  cover_image_url = 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&q=80',
  video_url       = 'https://www.youtube.com/watch?v=B91M0DECrCk',
  video_type      = 'youtube',
  attachments     = '[
    {"type":"image","url":"https://images.unsplash.com/photo-1543286386-713bdd548da4?w=1200&q=80","caption":"Mẫu KPI Scorecard"}
  ]'::jsonb
WHERE id = 'b0000001-0000-0000-0000-000000000006';

-- 7. Bài: Đọc Dashboard CRM
UPDATE knowledge_lessons SET
  cover_image_url = 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80',
  attachments     = '[
    {"type":"image","url":"https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&q=80","caption":"Widget KPI tổng quan"},
    {"type":"image","url":"https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?w=1200&q=80","caption":"Kanban board"}
  ]'::jsonb
WHERE id = 'b0000001-0000-0000-0000-000000000007';

-- 8. Bài: Bàn giao Deal → SX
UPDATE knowledge_lessons SET
  cover_image_url = 'https://images.unsplash.com/photo-1565793298595-6a879b1d9492?w=1200&q=80',
  attachments     = '[
    {"type":"image","url":"https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?w=1200&q=80","caption":"Xưởng sản xuất tủ bếp"}
  ]'::jsonb
WHERE id = 'b0000001-0000-0000-0000-000000000008';

-- ─── BÀI TẬP — Thêm hình minh họa & video ──────────────────────────────────

-- Quiz "Kiểm tra: Tạo Lead" — thêm ảnh minh hoạ cho câu 2 (Kanban)
UPDATE knowledge_exercises SET
  image_url   = 'https://images.unsplash.com/photo-1559136555-9303baea8ebd?w=1200&q=80',
  attachments = '[
    {"type":"image","url":"https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&q=80","caption":"Tham khảo: Kanban Lead"}
  ]'::jsonb,
  questions   = '{
    "items": [
      {
        "id": "q1",
        "question": "Lead trong CRM là gì?",
        "type": "single",
        "options": ["Khách hàng đã chốt mua", "Khách hàng tiềm năng — đã liên hệ nhưng chưa cam kết", "Sản phẩm mới ra mắt", "Nhân viên kinh doanh"],
        "correct": [1]
      },
      {
        "id": "q2",
        "question": "Trên Kanban như hình minh hoạ, làm thế nào để di chuyển Lead giữa các cột?",
        "image_url": "https://images.unsplash.com/photo-1559136555-9303baea8ebd?w=1200&q=80",
        "type": "single",
        "options": ["Xóa rồi tạo lại ở cột mới", "Chỉ admin mới di chuyển được", "Kéo thả card hoặc bấm vào pipeline trong chi tiết", "Gửi email yêu cầu IT"],
        "correct": [2]
      },
      {
        "id": "q3",
        "question": "Những thông tin nào BẮT BUỘC khi tạo Lead? (chọn nhiều)",
        "type": "multiple",
        "options": ["Tiêu đề Lead", "Khách hàng", "Mã số thuế", "Nguồn Lead"],
        "correct": [0, 1]
      },
      {
        "id": "q4",
        "question": "Ghi hoạt động (cuộc gọi, gặp mặt) trong CRM giúp ích gì?",
        "type": "single",
        "options": ["Không có ích, chỉ tốn thời gian", "Để admin giám sát", "Đồng đội nắm tình hình khi tiếp nhận và có lịch sử KH rõ ràng", "Tự động báo giá"],
        "correct": [2]
      }
    ]
  }'::jsonb
WHERE id = 'c0000001-0000-0000-0000-000000000001';

-- Checklist "Tạo báo giá mẫu" — thêm video hướng dẫn
UPDATE knowledge_exercises SET
  video_url  = 'https://www.youtube.com/watch?v=mlOXkmrm7Ck',
  video_type = 'youtube',
  attachments = '[
    {"type":"link","url":"https://docs.google.com/document/","caption":"Mẫu báo giá tham khảo"}
  ]'::jsonb
WHERE id = 'c0000001-0000-0000-0000-000000000003';

-- Quiz giao diện — thêm ảnh
UPDATE knowledge_exercises SET
  image_url = 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=1200&q=80'
WHERE id = 'c0000001-0000-0000-0000-000000000005';

COMMIT;
