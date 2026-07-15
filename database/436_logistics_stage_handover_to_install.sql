-- Cờ bàn giao VC → LĐ trên cột pipeline logistics (giống is_handover_to_logistics bên SX).
-- Khi kéo dự án vào cột Vận chuyển có cờ này → nhảy sang cột Lắp đặt đầu tiên của công ty.

ALTER TABLE logistics_pipeline_stages
  ADD COLUMN IF NOT EXISTS is_handover_to_install BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN logistics_pipeline_stages.is_handover_to_install IS
  'Khi dự án vào cột VC (vận chuyển) có cờ này → tự chuyển sang cột Lắp đặt đầu tiên.';
