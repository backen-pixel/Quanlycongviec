-- Tham số tính KPI (vd. SLA phút cho A1) — chỉnh trên UI Cài đặt KPI, không cần sửa code.

ALTER TABLE kpi_definitions
  ADD COLUMN IF NOT EXISTS calc_params JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN kpi_definitions.calc_params IS
  'Tham số engine tính KPI. A1: {"sla_minutes":15}. Các KPI khác: xem tài liệu / UI.';

UPDATE kpi_definitions
SET calc_params = jsonb_build_object('sla_minutes', 15)
WHERE code = 'A1'
  AND (calc_params IS NULL OR calc_params = '{}'::jsonb);
