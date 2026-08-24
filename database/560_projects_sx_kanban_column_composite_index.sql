-- 560: Index gộp cho câu truy vấn phân trang cột Kanban Sản xuất
-- (GET /production/projects?view=kanban&sx_kanban_column_id=...): lọc theo company_id +
-- sx_kanban_column_id rồi ORDER BY deadline ASC NULLS LAST, created_at DESC. Trước đây chỉ có
-- idx_projects_sx_kanban_column_id (đơn cột) — DB phải lọc theo cột rồi sort riêng, không tận
-- dụng được index cho phần ORDER BY khi có thêm điều kiện company_id.
--
-- Idempotent — chạy lại an toàn.

CREATE INDEX IF NOT EXISTS idx_projects_sx_kanban_col_company_deadline
  ON projects (company_id, sx_kanban_column_id, deadline ASC NULLS LAST, created_at DESC)
  WHERE sx_kanban_column_id IS NOT NULL;

COMMENT ON INDEX idx_projects_sx_kanban_col_company_deadline IS
  'Tăng tốc phân trang từng cột Kanban SX (GET /production/projects?view=kanban&sx_kanban_column_id=...): lọc company_id + cột, sort theo deadline/created_at.';
