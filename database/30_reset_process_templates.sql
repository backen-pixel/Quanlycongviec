-- ═══════════════════════════════════════════════════════════════════════
-- RESET & SEED: Quản lý Quy trình (đã gộp VC & LĐ → delivery)
-- Chạy trên Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. XÓA DỮ LIỆU CŨ (đúng thứ tự dependency) ───
DELETE FROM flow_step_processes;
DELETE FROM workflow_flow_steps;
DELETE FROM workflow_flows;
DELETE FROM company_template_checklists;
DELETE FROM company_template_tasks;
DELETE FROM company_template_sets;
DELETE FROM company_process_checklists;
DELETE FROM company_process_tasks;
DELETE FROM company_processes;

-- ─── 2. RESET WORKFLOW STAGES (7 giai đoạn mới) ───
DELETE FROM workflow_stages;
INSERT INTO workflow_stages (slug, name, color, icon, order_index, is_active) VALUES
  ('consulting',    'Tư vấn',                '#8B5CF6', '💬', 1, true),
  ('design',        'Thiết kế',              '#EC4899', '🎨', 2, true),
  ('quotation',     'Báo giá',               '#F59E0B', '💰', 3, true),
  ('contract',      'Hợp đồng',             '#10B981', '📝', 4, true),
  ('production',    'Sản xuất',              '#F97316', '🏭', 5, true),
  ('delivery',      'Vận chuyển & Lắp đặt', '#06B6D4', '🚚', 6, true),
  ('customer-care', 'Chăm sóc KH',          '#EF4444', '❤️', 7, true);

-- ─── 3. RESET HỆ SINH THÁI (Khối + Công ty mẫu) ───
DELETE FROM ecosystem_units;
DELETE FROM ecosystem_levels;

INSERT INTO ecosystem_levels (id, name, icon, color, depth, is_active) VALUES
  (gen_random_uuid(), 'Khối',    '🏢', '#3B82F6', 0, true),
  (gen_random_uuid(), 'Công ty', '🏭', '#10B981', 1, true);

-- Tạo 4 khối
DO $$
DECLARE
  lvl_khoi UUID;
  lvl_cty  UUID;
  khoi_kd  UUID;
  khoi_sx  UUID;
  khoi_vc  UUID;
  khoi_cs  UUID;
BEGIN
  SELECT id INTO lvl_khoi FROM ecosystem_levels WHERE name = 'Khối' LIMIT 1;
  SELECT id INTO lvl_cty  FROM ecosystem_levels WHERE name = 'Công ty' LIMIT 1;

  -- 4 Khối
  INSERT INTO ecosystem_units (id, name, short_name, code, level_id, parent_id, is_active, order_index)
  VALUES (gen_random_uuid(), 'Khối Kinh Doanh', 'KD', 'KD', lvl_khoi, NULL, true, 1) RETURNING id INTO khoi_kd;
  
  INSERT INTO ecosystem_units (id, name, short_name, code, level_id, parent_id, is_active, order_index)
  VALUES (gen_random_uuid(), 'Khối Sản Xuất', 'SX', 'SX', lvl_khoi, NULL, true, 2) RETURNING id INTO khoi_sx;
  
  INSERT INTO ecosystem_units (id, name, short_name, code, level_id, parent_id, is_active, order_index)
  VALUES (gen_random_uuid(), 'Khối Vận Chuyển & Lắp Đặt', 'VCLD', 'VCLD', lvl_khoi, NULL, true, 3) RETURNING id INTO khoi_vc;
  
  INSERT INTO ecosystem_units (id, name, short_name, code, level_id, parent_id, is_active, order_index)
  VALUES (gen_random_uuid(), 'Khối Chăm Sóc KH', 'CSKH', 'CSKH', lvl_khoi, NULL, true, 4) RETURNING id INTO khoi_cs;

  -- Công ty mẫu dưới mỗi khối
  INSERT INTO ecosystem_units (name, short_name, code, level_id, parent_id, is_active, order_index) VALUES
    ('Công ty Tư vấn & Bán hàng', 'TVBH', 'TVBH', lvl_cty, khoi_kd, true, 1),
    ('Công ty Thiết kế Nội thất', 'TKNT', 'TKNT', lvl_cty, khoi_kd, true, 2),
    ('Công ty Sản xuất Tủ bếp',   'SXTB', 'SXTB', lvl_cty, khoi_sx, true, 1),
    ('Công ty Vận chuyển & Lắp đặt', 'VCLD1', 'VCLD1', lvl_cty, khoi_vc, true, 1),
    ('Công ty Bảo hành & CSKH',   'BHCS', 'BHCS', lvl_cty, khoi_cs, true, 1);
END $$;

-- ─── 4. QUY TRÌNH NỘI BỘ (company_processes) ───
-- Tư vấn & Bán hàng
DO $$
DECLARE cty_id UUID; proc_id UUID;
BEGIN
  SELECT id INTO cty_id FROM ecosystem_units WHERE code = 'TVBH' LIMIT 1;

  INSERT INTO company_processes (id, name, description, color, icon, order_index, company_unit_id, is_active)
  VALUES (gen_random_uuid(), 'Tiếp nhận & Tư vấn', 'Quy trình tiếp nhận KH và tư vấn sản phẩm', '#8B5CF6', '💬', 1, cty_id, true) RETURNING id INTO proc_id;
  INSERT INTO company_process_checklists (process_id, title, is_required, order_index) VALUES
    (proc_id, 'Tiếp nhận thông tin KH (tên, SĐT, nhu cầu)', true, 1),
    (proc_id, 'Tư vấn sản phẩm phù hợp', true, 2),
    (proc_id, 'Ghi nhận kích thước & yêu cầu đặc biệt', true, 3),
    (proc_id, 'Hẹn lịch khảo sát thực tế (nếu cần)', false, 4),
    (proc_id, 'Gửi catalog / hình ảnh mẫu', false, 5);

  INSERT INTO company_processes (id, name, description, color, icon, order_index, company_unit_id, is_active)
  VALUES (gen_random_uuid(), 'Báo giá & Hợp đồng', 'Quy trình lập báo giá và ký hợp đồng', '#F59E0B', '💰', 2, cty_id, true) RETURNING id INTO proc_id;
  INSERT INTO company_process_checklists (process_id, title, is_required, order_index) VALUES
    (proc_id, 'Bóc tách vật tư từ bản vẽ', true, 1),
    (proc_id, 'Lập báo giá chi tiết', true, 2),
    (proc_id, 'Gửi báo giá cho KH', true, 3),
    (proc_id, 'Thương lượng & chốt giá', true, 4),
    (proc_id, 'Soạn hợp đồng', true, 5),
    (proc_id, 'KH ký hợp đồng', true, 6),
    (proc_id, 'Thu tiền đặt cọc', true, 7);
END $$;

-- Thiết kế
DO $$
DECLARE cty_id UUID; proc_id UUID;
BEGIN
  SELECT id INTO cty_id FROM ecosystem_units WHERE code = 'TKNT' LIMIT 1;

  INSERT INTO company_processes (id, name, description, color, icon, order_index, company_unit_id, is_active)
  VALUES (gen_random_uuid(), 'Thiết kế', 'Quy trình thiết kế từ sơ bộ đến kỹ thuật', '#EC4899', '🎨', 1, cty_id, true) RETURNING id INTO proc_id;
  INSERT INTO company_process_checklists (process_id, title, is_required, order_index) VALUES
    (proc_id, 'Thiết kế bản vẽ 2D sơ bộ', true, 1),
    (proc_id, 'Thiết kế 3D render', true, 2),
    (proc_id, 'Gửi bản vẽ cho KH duyệt', true, 3),
    (proc_id, 'Chỉnh sửa theo feedback', false, 4),
    (proc_id, 'Hoàn thiện bản vẽ kỹ thuật', true, 5),
    (proc_id, 'Xuất bản vẽ CNC', true, 6);
END $$;

-- Sản xuất
DO $$
DECLARE cty_id UUID; proc_id UUID;
BEGIN
  SELECT id INTO cty_id FROM ecosystem_units WHERE code = 'SXTB' LIMIT 1;

  INSERT INTO company_processes (id, name, description, color, icon, order_index, company_unit_id, is_active)
  VALUES (gen_random_uuid(), 'Sản xuất Tủ bếp', 'Quy trình sản xuất từ nguyên liệu đến thành phẩm', '#F97316', '🏭', 1, cty_id, true) RETURNING id INTO proc_id;
  INSERT INTO company_process_checklists (process_id, title, is_required, order_index) VALUES
    (proc_id, 'Đặt mua nguyên vật liệu', true, 1),
    (proc_id, 'Kiểm tra NVL nhập kho', true, 2),
    (proc_id, 'Cắt CNC theo bản vẽ', true, 3),
    (proc_id, 'Dán cạnh / phủ bề mặt', true, 4),
    (proc_id, 'Lắp ráp khung tủ', true, 5),
    (proc_id, 'Lắp phụ kiện (bản lề, ray trượt...)', true, 6),
    (proc_id, 'Sơn / hoàn thiện bề mặt', false, 7),
    (proc_id, 'Kiểm tra chất lượng (QC)', true, 8),
    (proc_id, 'Đóng gói sản phẩm', true, 9);
END $$;

-- Vận chuyển & Lắp đặt
DO $$
DECLARE cty_id UUID; proc_id UUID;
BEGIN
  SELECT id INTO cty_id FROM ecosystem_units WHERE code = 'VCLD1' LIMIT 1;

  INSERT INTO company_processes (id, name, description, color, icon, order_index, company_unit_id, is_active)
  VALUES (gen_random_uuid(), 'Vận chuyển & Lắp đặt', 'Quy trình giao hàng và lắp đặt tại công trình', '#06B6D4', '🚚', 1, cty_id, true) RETURNING id INTO proc_id;
  INSERT INTO company_process_checklists (process_id, title, is_required, order_index) VALUES
    (proc_id, 'Kiểm tra hàng trước khi xuất kho', true, 1),
    (proc_id, 'Sắp xếp xe vận chuyển', true, 2),
    (proc_id, 'Giao hàng đến công trình', true, 3),
    (proc_id, 'Kiểm tra hiện trạng công trình', true, 4),
    (proc_id, 'Lắp đặt tủ bếp', true, 5),
    (proc_id, 'Lắp đặt mặt đá / thiết bị', true, 6),
    (proc_id, 'Căn chỉnh & hoàn thiện', true, 7),
    (proc_id, 'Nghiệm thu với khách hàng', true, 8),
    (proc_id, 'Chụp ảnh hoàn thiện', true, 9),
    (proc_id, 'KH ký biên bản nghiệm thu', true, 10);
END $$;

-- Chăm sóc KH
DO $$
DECLARE cty_id UUID; proc_id UUID;
BEGIN
  SELECT id INTO cty_id FROM ecosystem_units WHERE code = 'BHCS' LIMIT 1;

  INSERT INTO company_processes (id, name, description, color, icon, order_index, company_unit_id, is_active)
  VALUES (gen_random_uuid(), 'Bảo hành & CSKH', 'Quy trình chăm sóc sau bán hàng', '#EF4444', '❤️', 1, cty_id, true) RETURNING id INTO proc_id;
  INSERT INTO company_process_checklists (process_id, title, is_required, order_index) VALUES
    (proc_id, 'Gọi điện hỏi thăm sau 3 ngày lắp đặt', true, 1),
    (proc_id, 'Gọi điện hỏi thăm sau 1 tháng', true, 2),
    (proc_id, 'Ghi nhận phản hồi / khiếu nại', true, 3),
    (proc_id, 'Xử lý bảo hành (nếu có)', false, 4),
    (proc_id, 'Đề xuất cross-sell / upsell', false, 5),
    (proc_id, 'Xin review / đánh giá từ KH', false, 6);
END $$;
