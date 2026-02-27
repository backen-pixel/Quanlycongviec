-- ═══════════════════════════════════════════════════
-- 07: Project stage assignments + quotation files + seed templates
-- ═══════════════════════════════════════════════════

-- ─── Add per-stage responsible person to projects ──
ALTER TABLE projects ADD COLUMN IF NOT EXISTS consulting_person_id UUID REFERENCES users(id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS design_person_id UUID REFERENCES users(id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS quotation_person_id UUID REFERENCES users(id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contract_person_id UUID REFERENCES users(id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS production_person_id UUID REFERENCES users(id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS shipping_person_id UUID REFERENCES users(id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS installation_person_id UUID REFERENCES users(id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS care_person_id UUID REFERENCES users(id);

-- ─── Stage transition notes + files ──
CREATE TABLE IF NOT EXISTS stage_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) NOT NULL,
  from_stage_id UUID REFERENCES workflow_stages(id),
  to_stage_id UUID REFERENCES workflow_stages(id),
  notes TEXT,
  attachments JSONB DEFAULT '[]',
  transitioned_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transitions_project ON stage_transitions(project_id);

-- ─── Quotation files on projects ──
ALTER TABLE projects ADD COLUMN IF NOT EXISTS quotation_files JSONB DEFAULT '[]';

-- ─── RLS ──
ALTER TABLE stage_transitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all_transitions ON stage_transitions;
CREATE POLICY allow_all_transitions ON stage_transitions FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════
-- SEED DEFAULT TASK TEMPLATES (is_active = false → cần kích hoạt)
-- ═══════════════════════════════════════════════════
-- Chạy SAU khi đã có workflow_stages

INSERT INTO task_templates (stage_id, title, priority, order_index, checklist_items, assignee_role, is_active)
SELECT s.id, t.title, t.priority, t.idx, t.checklist::jsonb, t.role, false
FROM workflow_stages s
CROSS JOIN (VALUES
  -- Tư vấn
  ('consulting', 'Tiếp nhận yêu cầu khách hàng', 'high', 0, '["Ghi nhận thông tin KH","Xác định nhu cầu","Hẹn lịch khảo sát"]', 'sales'),
  ('consulting', 'Khảo sát hiện trạng', 'high', 1, '["Đo đạc kích thước","Chụp ảnh hiện trạng","Ghi nhận vị trí điện nước"]', 'sales'),
  ('consulting', 'Tư vấn phương án & chất liệu', 'medium', 2, '["Tư vấn kiểu dáng","Tư vấn chất liệu","Tư vấn phụ kiện"]', 'sales'),
  -- Thiết kế
  ('design', 'Thiết kế bản vẽ 2D', 'high', 0, '["Bản vẽ mặt bằng","Bản vẽ mặt đứng","Bản vẽ chi tiết"]', 'designer'),
  ('design', 'Thiết kế 3D render', 'medium', 1, '["Render góc 1","Render góc 2","Render toàn cảnh"]', 'designer'),
  ('design', 'Khách duyệt bản thiết kế', 'high', 2, '["Gửi bản vẽ cho KH","KH xác nhận","Chỉnh sửa nếu cần"]', 'designer'),
  -- Báo giá
  ('quotation', 'Bóc tách vật tư chi tiết', 'high', 0, '["Liệt kê panel","Liệt kê phụ kiện","Liệt kê phần cứng"]', 'sales'),
  ('quotation', 'Lập báo giá', 'high', 1, '["Tính giá vật tư","Tính giá nhân công","Tổng hợp báo giá"]', 'sales'),
  ('quotation', 'Gửi & thương lượng báo giá', 'medium', 2, '["Gửi báo giá cho KH","Thương lượng giá","Chốt giá cuối"]', 'sales'),
  -- Hợp đồng
  ('contract', 'Soạn hợp đồng', 'high', 0, '["Soạn điều khoản","Review pháp lý","In hợp đồng"]', 'manager'),
  ('contract', 'Ký hợp đồng', 'high', 1, '["Hẹn KH ký","KH ký HĐ","Lưu bản gốc"]', 'sales'),
  ('contract', 'Thu tiền đặt cọc', 'urgent', 2, '["Xác nhận số tiền cọc","Thu tiền","Xuất phiếu thu"]', 'sales'),
  -- Sản xuất
  ('production', 'Đặt mua vật tư', 'high', 0, '["Đặt hàng NCC","Kiểm tra tồn kho","Nhận vật tư"]', 'production'),
  ('production', 'Gia công CNC / Cắt', 'high', 1, '["Cắt panel","Gia công CNC","Kiểm tra kích thước"]', 'production'),
  ('production', 'Lắp ráp thành phẩm', 'medium', 2, '["Lắp khung","Lắp cánh","Lắp phụ kiện"]', 'production'),
  ('production', 'Sơn / dán bề mặt', 'medium', 3, '["Xử lý bề mặt","Sơn/dán","Kiểm tra hoàn thiện"]', 'production'),
  ('production', 'KCS - Kiểm tra chất lượng', 'high', 4, '["Kiểm tra kích thước","Kiểm tra bề mặt","Đóng gói"]', 'production'),
  -- Vận chuyển
  ('shipping', 'Đóng gói sản phẩm', 'medium', 0, '["Bọc xốp","Đóng kiện","Dán nhãn"]', 'production'),
  ('shipping', 'Sắp xếp vận chuyển', 'medium', 1, '["Book xe","Xếp hàng lên xe","Kiểm tra đầy đủ"]', 'driver'),
  ('shipping', 'Giao hàng đến công trình', 'high', 2, '["Vận chuyển","Dỡ hàng","KH xác nhận nhận hàng"]', 'driver'),
  -- Lắp đặt
  ('installation', 'Chuẩn bị công trình', 'medium', 0, '["Kiểm tra mặt bằng","Chuẩn bị dụng cụ","Bảo vệ sàn/tường"]', 'installer'),
  ('installation', 'Lắp đặt tại công trình', 'high', 1, '["Lắp tủ dưới","Lắp tủ trên","Lắp mặt bàn","Lắp phụ kiện"]', 'installer'),
  ('installation', 'Nghiệm thu với khách hàng', 'urgent', 2, '["KH kiểm tra","Xử lý tồn đọng","KH ký nghiệm thu"]', 'installer'),
  -- CSKH
  ('customer-care', 'Gọi hỏi thăm sau lắp đặt (3 ngày)', 'medium', 0, '["Gọi điện","Ghi nhận phản hồi"]', 'customer_care'),
  ('customer-care', 'Kiểm tra bảo hành (nếu có)', 'high', 1, '["Tiếp nhận yêu cầu BH","Xử lý BH","Xác nhận KH hài lòng"]', 'customer_care'),
  ('customer-care', 'Thu tiền còn lại', 'urgent', 2, '["Gửi hóa đơn","Thu tiền","Xuất phiếu thu"]', 'customer_care')
) AS t(stage_slug, title, priority, idx, checklist, role)
WHERE s.slug = t.stage_slug
ON CONFLICT DO NOTHING;
