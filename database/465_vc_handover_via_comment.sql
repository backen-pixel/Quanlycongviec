-- 465: Bàn giao VC/LĐ qua bình luận (thay modal chọn công ty ở module Sản xuất)
--   - crm_lead_comments: bình luận tương tác (state-machine) chọn công ty VC/LĐ + ngày lấy hàng
--   - lead_members: mốc ẩn lịch sử trò chuyện trước khi thành viên VC/LĐ được thêm vào deal
--   - projects: trạng thái luồng bàn giao VC để hiển thị badge trên thẻ SX
--   - event_types: loại sự kiện "Lấy hàng" (pickup) cho module Vận chuyển/Lắp đặt
-- Idempotent.

BEGIN;

-- Bình luận tương tác: comment_type='vc_handover', metadata giữ state + lựa chọn.
ALTER TABLE crm_lead_comments
  ADD COLUMN IF NOT EXISTS comment_type TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN crm_lead_comments.comment_type IS
  'Loại bình luận đặc biệt (vd: vc_handover = bình luận tương tác chọn công ty VC/LĐ). NULL = bình luận thường.';
COMMENT ON COLUMN crm_lead_comments.metadata IS
  'Dữ liệu cấu trúc cho bình luận tương tác (state, project_id, logistics_company_id, service_type, pickup_at, event_id, xác nhận 2 bên...).';

-- Ẩn lịch sử: thành viên VC/LĐ mới thêm không thấy bình luận/chat trước mốc này.
ALTER TABLE lead_members
  ADD COLUMN IF NOT EXISTS history_cutoff_at TIMESTAMPTZ;

COMMENT ON COLUMN lead_members.history_cutoff_at IS
  'Nếu set: thành viên chỉ thấy bình luận/tin nhắn có created_at >= mốc này (ẩn lịch sử trước khi vào deal).';

-- Trạng thái luồng bàn giao VC theo bình luận trên thẻ SX.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS vc_handover_status TEXT;

COMMENT ON COLUMN projects.vc_handover_status IS
  'Luồng bàn giao VC qua bình luận: pending (chờ sale chọn cty) | selected | scheduled | confirmed.';

-- Loại sự kiện "Lấy hàng" cho module VC/LĐ (nếu bảng event_types tồn tại).
INSERT INTO event_types (name, slug, icon, color, stage_slug, is_system, sort_order)
SELECT 'Lấy hàng', 'pickup', '📦', '#0EA5E9', 'shipping', TRUE, 6
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'event_types')
  AND NOT EXISTS (SELECT 1 FROM event_types WHERE slug = 'pickup');

COMMIT;
