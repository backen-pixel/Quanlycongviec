-- Ngày đặt hàng và ngày giao hàng trên dự án SX (hiển thị Kanban + chi tiết thẻ)

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS order_date DATE,
  ADD COLUMN IF NOT EXISTS delivery_date DATE;

COMMENT ON COLUMN projects.order_date IS 'Ngày đặt hàng (kế hoạch SX)';
COMMENT ON COLUMN projects.delivery_date IS 'Ngày giao hàng dự kiến cho khách';

-- Backfill từ đơn hàng liên kết (nếu có)
UPDATE projects p
SET order_date = o.order_date
FROM (
  SELECT DISTINCT ON (project_id) project_id, order_date
  FROM orders
  WHERE project_id IS NOT NULL AND order_date IS NOT NULL
  ORDER BY project_id, created_at DESC
) o
WHERE p.id = o.project_id AND p.order_date IS NULL;

UPDATE projects p
SET delivery_date = o.delivery_date
FROM (
  SELECT DISTINCT ON (project_id) project_id, delivery_date
  FROM orders
  WHERE project_id IS NOT NULL AND delivery_date IS NOT NULL
  ORDER BY project_id, created_at DESC
) o
WHERE p.id = o.project_id AND p.delivery_date IS NULL;
