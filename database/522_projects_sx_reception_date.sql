-- Ngày tiếp nhận xưởng (tính từ lúc setup: <12h = hôm đó, ≥12h = hôm sau; bỏ CN/lễ).
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS sx_reception_date date;

COMMENT ON COLUMN projects.sx_reception_date IS
  'Ngày xưởng tiếp nhận đơn — setup <12h VN = ngày đó, ≥12h = ngày làm kế tiếp (bỏ CN + kpi_holidays)';
