-- 543: Kanban Dự án — luồng thực hiện mặc định (có thể chỉnh trong Workflow Settings)
-- Đơn hàng → Thiết kế → Duyệt → Đo đạc → Sản xuất → Chuẩn bị vật tư → Giao hàng → Lắp đặt → Nghiệm thu → Bảo hành
-- Lưu ý: không deactivate slug sx-sample-* / gắn pipeline nhà máy.

-- Upsert 10 giai đoạn mặc định (company_id NULL = global)
INSERT INTO workflow_stages (name, slug, description, order_index, color, icon, is_active, company_id)
VALUES
  ('Đơn hàng', 'order', 'Đơn hàng đã chốt / khởi tạo dự án', 1, '#6366F1', '📝', true, NULL),
  ('Thiết kế', 'design', 'Thiết kế / bản vẽ', 2, '#8B5CF6', '🎨', true, NULL),
  ('Duyệt', 'approve', 'Khách / nội bộ duyệt thiết kế', 3, '#A855F7', '✅', true, NULL),
  ('Đo đạc', 'measure', 'Đo đạc hiện trường', 4, '#06B6D4', '📐', true, NULL),
  ('Sản xuất', 'production', 'Sản xuất tại xưởng', 5, '#F97316', '🏭', true, NULL),
  ('Chuẩn bị vật tư', 'materials', 'Chuẩn bị / mua vật tư', 6, '#EAB308', '📦', true, NULL),
  ('Giao hàng', 'delivery', 'Giao hàng / vận chuyển', 7, '#3B82F6', '🚛', true, NULL),
  ('Lắp đặt', 'installation', 'Lắp đặt tại công trình', 8, '#0EA5E9', '🔧', true, NULL),
  ('Nghiệm thu', 'acceptance', 'Khách nghiệm thu', 9, '#22C55E', '📋', true, NULL),
  ('Bảo hành', 'warranty', 'Bảo hành / CSKH', 10, '#EF4444', '🛡️', true, NULL)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  order_index = EXCLUDED.order_index,
  color = EXCLUDED.color,
  icon = EXCLUDED.icon,
  is_active = true;

-- Ẩn stage dự án cũ (không đụng sx-sample-*, production pipeline)
UPDATE workflow_stages
SET is_active = false
WHERE company_id IS NULL
  AND slug IN (
    'consulting',
    'quotation',
    'contract',
    'planning',
    'quality-check',
    'packaging',
    'khong-chot',
    'shipping',
    'customer-care',
    'customer-care-864dd6e6'
  );
