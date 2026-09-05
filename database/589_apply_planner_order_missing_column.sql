-- 589: Áp dụng nốt cột planner_order (database/25 chưa từng chạy trên project này)
--
-- CÁCH TÌM RA: sau khi các lỗi 42703 ồn ào nhất được sửa (sync_paused 87 lần,
-- responsible_person_id 44 lần), tiếng ồn giảm đủ để lộ ra những cột thiếu
-- HIẾM hơn — vốn vẫn luôn ở đó nhưng bị che.
--
-- Quét toàn bộ 24 giờ log, đây là DANH SÁCH ĐẦY ĐỦ các cột thiếu:
--   facebook_contacts.sync_paused        87 lần  -> database/587 (thêm cột)
--   projects.responsible_person_id       44 lần  -> database/587 (thêm cột)
--   projects.sx_intake                    3 lần  -> sửa code, KHÔNG thêm cột
--                                                   (cố ý là field enrich)
--   tasks.planner_order                   1 lần  -> file này
--   crm_activities.content                1 lần  -> sửa code (cột đúng: description)
--
-- VÌ SAO ĐÂY KHÔNG PHẢI CHỈ LÀ RÁC LOG:
-- Câu gây lỗi là truy vấn của trang Planner (routes/tasks.js:647-659):
--   SELECT id, title, status, priority, due_date, planner_order, assignee_id,
--          project_id, task_type
--     FROM tasks WHERE assignee_id IS NOT NULL
--    ORDER BY planner_order ASC ...
-- Cột thiếu làm CẢ câu hỏng, nên trang Planner không lấy được việc nào. Thêm
-- nữa routes/tasks.js:718 và :723 GHI planner_order khi kéo-thả sắp xếp — các
-- thao tác đó cũng đang hỏng.
--
-- Nội dung lấy đúng từ database/25_planner_order.sql, chỉ đổi tên chỉ mục cho
-- rõ ràng hơn.
--
-- AN TOÀN: DEFAULT 0 nên mọi dòng cũ đọc ra 0 — đã kiểm chứng sau khi chạy:
-- 0 task có giá trị khác 0, tức không dòng nào bị đổi nghĩa.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS planner_order INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_tasks_assignee_planner_order
  ON public.tasks (assignee_id, planner_order);

ANALYZE public.tasks;

COMMENT ON COLUMN public.tasks.planner_order IS
  'Thứ tự thủ công trên trang Planner (kéo-thả). Xem database/25 và 589';
