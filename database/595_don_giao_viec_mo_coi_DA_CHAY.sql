-- ══════════════════════════════════════════════════════════════════════════
-- 595 — Dọn bản «Giao việc» MỒ CÔI do lỗi 23505 sinh ra
-- ĐÃ CHẠY 08/09/2026 trên qlycv, anh B.A duyệt.
--
-- Nguồn gốc: helpers/crmTaskAssignmentSync.js có nhánh dự phòng so khớp CHUỖI:
--     if (error && /crm_task_id/.test(error.message))  → bỏ crm_task_id, INSERT lại
--   Lỗi 23505 trên unique index `idx_crm_assignments_crm_task_id` cũng chứa chữ
--   "crm_task_id" nên lọt vào nhánh này ⇒ mỗi lần đâm unique lại đẻ thêm MỘT bản
--   giao việc không gắn task nào. (Đã sửa ở patch 0005: chỉ nhận nhánh này khi
--   SQLSTATE = 42703; gặp 23505 thì lấy bản đã có ra UPDATE.)
--
-- Số đo lúc chạy:
--   • 142 crm_assignments có crm_task_id IS NULL
--   • 124 trong đó có «bản thật» cùng lead + tiêu đề + người nhận, cách < 5 giây
--     (sáng cùng ngày đếm được 122 — 2 bản mới sinh trong lúc chờ deploy)
--   • 18 bản còn lại là giao việc tạo tay hợp lệ — KHÔNG đụng
--   • 0 bản có bình luận
--   • 3 bản có tổng 16 tệp đính kèm — ĐÃ KIỂM: cả 16 file_url đều đã có sẵn
--     trên bản thật ⇒ xoá không mất tệp nào
--
-- Kết quả: crm_assignments 3.208 → 3.084 · mồ côi còn 18.
-- ══════════════════════════════════════════════════════════════════════════

-- ── Bước 1: sao lưu ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS backup_giao_viec_mo_coi_20260908 AS
WITH orphan AS (SELECT * FROM crm_assignments WHERE crm_task_id IS NULL),
matched AS (
  SELECT o.*,
    (SELECT b.id FROM crm_assignments b
      WHERE b.crm_task_id IS NOT NULL AND b.id <> o.id
        AND b.lead_id IS NOT DISTINCT FROM o.lead_id
        AND b.title = o.title
        AND b.assignee_id IS NOT DISTINCT FROM o.assignee_id
        AND abs(extract(epoch FROM (b.created_at - o.created_at))) < 5
      ORDER BY abs(extract(epoch FROM (b.created_at - o.created_at))) LIMIT 1) AS ban_that_id
  FROM orphan o)
SELECT * FROM matched WHERE ban_that_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS backup_giao_viec_mo_coi_files_20260908 AS
  SELECT f.* FROM crm_assignment_files f
   WHERE f.assignment_id IN (SELECT id FROM backup_giao_viec_mo_coi_20260908);

CREATE TABLE IF NOT EXISTS backup_giao_viec_mo_coi_nguoi_20260908 AS
  SELECT a.* FROM crm_assignment_assignees a
   WHERE a.assignment_id IN (SELECT id FROM backup_giao_viec_mo_coi_20260908);

-- ── Bước 2: kiểm tra tệp đính kèm không bị mất ───────────────────────────
-- Đã chạy, kết quả 16/16 file trùng file_url với bản thật:
--   with bm as (select id, ban_that_id from backup_giao_viec_mo_coi_20260908)
--   select count(*) filter (where exists (
--            select 1 from crm_assignment_files g
--             where g.assignment_id = bm.ban_that_id and g.file_url = f.file_url))
--     from crm_assignment_files f join bm on bm.id = f.assignment_id;

-- ── Bước 3: xoá ──────────────────────────────────────────────────────────
BEGIN;
DELETE FROM crm_assignment_files     WHERE assignment_id IN (SELECT id FROM backup_giao_viec_mo_coi_20260908);
DELETE FROM crm_assignment_assignees WHERE assignment_id IN (SELECT id FROM backup_giao_viec_mo_coi_20260908);
DELETE FROM crm_assignments          WHERE id            IN (SELECT id FROM backup_giao_viec_mo_coi_20260908);
COMMIT;

-- ── Khôi phục nếu cần (3 bảng sao lưu, giữ ít nhất 1 tháng) ──────────────
-- INSERT INTO crm_assignments SELECT <mọi cột trừ ban_that_id> FROM backup_giao_viec_mo_coi_20260908;
-- INSERT INTO crm_assignment_assignees SELECT * FROM backup_giao_viec_mo_coi_nguoi_20260908;
-- INSERT INTO crm_assignment_files     SELECT * FROM backup_giao_viec_mo_coi_files_20260908;
