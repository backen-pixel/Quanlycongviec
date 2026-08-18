-- 532: Cột «lắp đặt tạm» trên pipeline VC/LĐ + ghi chú cho bên VC/LĐ theo từng xưởng
--
-- Bối cảnh: khi Sale setup kế hoạch SX & VC/LĐ trên CRM, dự án được đặt tạm vào cột VC
-- đã tích «lắp đặt tạm» để bên VC/LĐ thấy trước. Lúc xưởng hoàn thành và bàn giao thật,
-- dự án chỉ chuyển sang cột tiếp nhận — không tạo mới trên bảng VC.

ALTER TABLE logistics_pipeline_stages
  ADD COLUMN IF NOT EXISTS is_temp_install_staging BOOLEAN DEFAULT false;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS vc_notes TEXT,
  ADD COLUMN IF NOT EXISTS vc_temp_staged BOOLEAN DEFAULT false;

-- Mỗi công ty VC chỉ nên có một cột tạm
CREATE UNIQUE INDEX IF NOT EXISTS uq_logistics_stages_temp_staging_company
  ON logistics_pipeline_stages (company_id)
  WHERE is_temp_install_staging = true AND company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_projects_vc_temp_staged
  ON projects (vc_temp_staged)
  WHERE vc_temp_staged = true;

COMMENT ON COLUMN logistics_pipeline_stages.is_temp_install_staging IS
  'Cột chứa dự án lắp đặt tạm — dự án vào đây khi Sale setup kế hoạch SX & VC/LĐ, trước khi xưởng bàn giao thật';
COMMENT ON COLUMN projects.vc_notes IS
  'Ghi chú cho bên VC/LĐ, điền theo từng xưởng SX (mỗi xưởng gắn một công ty VC/LĐ)';
COMMENT ON COLUMN projects.vc_temp_staged IS
  'Dự án đang ở cột lắp đặt tạm trên bảng VC — chưa bàn giao thật từ xưởng';
