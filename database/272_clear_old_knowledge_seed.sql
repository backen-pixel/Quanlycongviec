-- 272_clear_old_knowledge_seed.sql
-- Xoá khoá học mẫu cũ (218/220/222): 4 danh mục + bài học + bài tập (CASCADE).
-- Giữ: d2000001 (Lead), d2000002 (Deal), d2000003 (Hướng dẫn CRM).
-- Chạy sau 217–261, trước 259/262/263.
-- Idempotent.

BEGIN;

DELETE FROM knowledge_categories
WHERE id IN (
  'a0000001-0000-0000-0000-000000000001',
  'a0000001-0000-0000-0000-000000000002',
  'a0000001-0000-0000-0000-000000000003',
  'a0000001-0000-0000-0000-000000000004'
);

COMMIT;
