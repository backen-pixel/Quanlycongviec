-- Ngày hoàn thiện sản xuất (đồng bộ từ delivery_date − 2 ngày khi Sale lưu ngày giao)

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS production_finish_date date;

COMMENT ON COLUMN projects.production_finish_date IS
  'Ngày hoàn thiện SX — đồng bộ từ delivery_date trừ 2 ngày khi Sale lưu ngày giao';

-- Backfill: chỉ khi đã có delivery_date và chưa có finish date
UPDATE projects
SET production_finish_date = (delivery_date - INTERVAL '2 days')::date
WHERE delivery_date IS NOT NULL
  AND production_finish_date IS NULL;
