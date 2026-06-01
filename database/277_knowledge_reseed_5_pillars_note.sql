-- 277_knowledge_reseed_5_pillars_note.sql
-- Cập nhật nội dung Kiến thức theo khung 5 trụ (Tư tưởng → Tư duy → Nguồn lực → Vận hành → Báo cáo & Sửa chữa).
--
-- Bước 1 (repo): node scripts/knowledge/build-seeds.js
-- Bước 2 (DB): chạy lần lượt (idempotent — ON CONFLICT DO UPDATE):
--   259_knowledge_seed_lead_course.sql
--   262_knowledge_seed_deal_course.sql
--   263_knowledge_seed_crm_software_guide.sql
--
-- Tùy chọn — reset tiến độ học viên trước khi seed (XÓA progress + bài nộp):
--   257_clear_knowledge_lessons_and_exercises.sql
--
-- File này chỉ đánh dấu migration; không thay đổi schema.

BEGIN;

UPDATE knowledge_categories SET updated_at = now()
WHERE id IN (
  'd2000001-0000-0000-0000-000000000001',
  'd2000002-0000-0000-0000-000000000001',
  'd2000003-0000-0000-0000-000000000001'
);

COMMIT;
