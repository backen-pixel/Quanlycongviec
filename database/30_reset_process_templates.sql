-- ═══════════════════════════════════════════════════════════════════════
-- RESET & SEED: Quy trình + Bộ mẫu + Luồng
-- GIỮ NGUYÊN: ecosystem_units, ecosystem_levels, workflow_stages, 
--              tasks, projects, companies
-- Chạy trên Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. XÓA DỮ LIỆU CŨ ───
-- Luồng
DELETE FROM flow_step_processes;
DELETE FROM workflow_flow_steps;
DELETE FROM workflow_flows;
-- Bộ mẫu công ty
DELETE FROM company_template_checklists;
DELETE FROM company_template_tasks;
DELETE FROM company_template_sets;
-- Quy trình nội bộ
DELETE FROM company_process_checklists;
DELETE FROM company_process_tasks;
DELETE FROM company_processes;

-- ─── 2. SEED QUY TRÌNH NỘI BỘ theo 3 khối ───

-- ════════════════════════════════════════════
-- KHỐI KINH DOANH (tất cả công ty thuộc khối KD)
-- ════════════════════════════════════════════
DO $$
DECLARE
  cty RECORD;
  proc_id UUID;
BEGIN
  -- Lặp tất cả công ty thuộc Khối KD (level depth=1, parent là khối có tên chứa 'Kinh Doanh')
  FOR cty IN
    SELECT u.id FROM ecosystem_units u
    JOIN ecosystem_units parent ON u.parent_id = parent.id
    WHERE parent.name ILIKE '%Kinh Doanh%' AND u.is_active = true
  LOOP
    -- QT1: Tiếp nhận & Tư vấn
    INSERT INTO company_processes (id, name, description, color, icon, order_index, company_unit_id, is_active)
    VALUES (gen_random_uuid(), 'Tiếp nhận & Tư vấn', 'Tiếp nhận KH, tư vấn sản phẩm, khảo sát nhu cầu', '#8B5CF6', '💬', 1, cty.id, true)
    RETURNING id INTO proc_id;
    INSERT INTO company_process_checklists (process_id, title, is_required, order_index) VALUES
      (proc_id, 'Tiếp nhận thông tin KH (tên, SĐT, nhu cầu)', true, 1),
      (proc_id, 'Tư vấn sản phẩm & vật liệu phù hợp', true, 2),
      (proc_id, 'Ghi nhận kích thước & yêu cầu đặc biệt', true, 3),
      (proc_id, 'Hẹn lịch khảo sát thực tế (nếu cần)', false, 4),
      (proc_id, 'Gửi catalog / hình ảnh mẫu cho KH', false, 5);

    -- QT2: Thiết kế
    INSERT INTO company_processes (id, name, description, color, icon, order_index, company_unit_id, is_active)
    VALUES (gen_random_uuid(), 'Thiết kế', 'Thiết kế bản vẽ 2D/3D, KH duyệt, xuất bản vẽ kỹ thuật', '#EC4899', '🎨', 2, cty.id, true)
    RETURNING id INTO proc_id;
    INSERT INTO company_process_checklists (process_id, title, is_required, order_index) VALUES
      (proc_id, 'Thiết kế bản vẽ 2D sơ bộ', true, 1),
      (proc_id, 'Thiết kế 3D render', true, 2),
      (proc_id, 'Gửi bản vẽ cho KH duyệt', true, 3),
      (proc_id, 'Chỉnh sửa theo feedback KH', false, 4),
      (proc_id, 'Hoàn thiện bản vẽ kỹ thuật', true, 5),
      (proc_id, 'Xuất bản vẽ CNC cho sản xuất', true, 6);

    -- QT3: Báo giá & Hợp đồng
    INSERT INTO company_processes (id, name, description, color, icon, order_index, company_unit_id, is_active)
    VALUES (gen_random_uuid(), 'Báo giá & Hợp đồng', 'Bóc tách vật tư, lập báo giá, ký HĐ, thu cọc', '#F59E0B', '💰', 3, cty.id, true)
    RETURNING id INTO proc_id;
    INSERT INTO company_process_checklists (process_id, title, is_required, order_index) VALUES
      (proc_id, 'Bóc tách vật tư từ bản vẽ', true, 1),
      (proc_id, 'Lập báo giá chi tiết', true, 2),
      (proc_id, 'Gửi báo giá cho KH', true, 3),
      (proc_id, 'Thương lượng & chốt giá cuối', true, 4),
      (proc_id, 'Soạn hợp đồng', true, 5),
      (proc_id, 'KH ký hợp đồng', true, 6),
      (proc_id, 'Thu tiền đặt cọc', true, 7);
  END LOOP;
END $$;

-- ════════════════════════════════════════════
-- KHỐI SẢN XUẤT
-- ════════════════════════════════════════════
DO $$
DECLARE
  cty RECORD;
  proc_id UUID;
BEGIN
  FOR cty IN
    SELECT u.id FROM ecosystem_units u
    JOIN ecosystem_units parent ON u.parent_id = parent.id
    WHERE parent.name ILIKE '%Sản Xuất%' AND u.is_active = true
  LOOP
    -- QT: Sản xuất Tủ bếp
    INSERT INTO company_processes (id, name, description, color, icon, order_index, company_unit_id, is_active)
    VALUES (gen_random_uuid(), 'Sản xuất', 'Quy trình sản xuất từ NVL đến thành phẩm đóng gói', '#F97316', '🏭', 1, cty.id, true)
    RETURNING id INTO proc_id;
    INSERT INTO company_process_checklists (process_id, title, is_required, order_index) VALUES
      (proc_id, 'Đặt mua nguyên vật liệu', true, 1),
      (proc_id, 'Kiểm tra NVL nhập kho', true, 2),
      (proc_id, 'Cắt CNC theo bản vẽ kỹ thuật', true, 3),
      (proc_id, 'Dán cạnh / phủ bề mặt', true, 4),
      (proc_id, 'Lắp ráp khung tủ', true, 5),
      (proc_id, 'Lắp phụ kiện (bản lề, ray trượt, giảm chấn...)', true, 6),
      (proc_id, 'Sơn / hoàn thiện bề mặt (nếu có)', false, 7),
      (proc_id, 'Kiểm tra chất lượng (QC)', true, 8),
      (proc_id, 'Đóng gói & dán nhãn', true, 9);
  END LOOP;
END $$;

-- ════════════════════════════════════════════
-- KHỐI VẬN CHUYỂN & LẮP ĐẶT
-- ════════════════════════════════════════════
DO $$
DECLARE
  cty RECORD;
  proc_id UUID;
BEGIN
  FOR cty IN
    SELECT u.id FROM ecosystem_units u
    JOIN ecosystem_units parent ON u.parent_id = parent.id
    WHERE (parent.name ILIKE '%Vận Chuyển%' OR parent.name ILIKE '%Lắp Đặt%' OR parent.name ILIKE '%VCLD%' OR parent.name ILIKE '%Giao hàng%') AND u.is_active = true
  LOOP
    -- QT: Vận chuyển & Lắp đặt
    INSERT INTO company_processes (id, name, description, color, icon, order_index, company_unit_id, is_active)
    VALUES (gen_random_uuid(), 'Vận chuyển & Lắp đặt', 'Giao hàng, lắp đặt, nghiệm thu tại công trình', '#06B6D4', '🚚', 1, cty.id, true)
    RETURNING id INTO proc_id;
    INSERT INTO company_process_checklists (process_id, title, is_required, order_index) VALUES
      (proc_id, 'Kiểm tra hàng trước khi xuất kho', true, 1),
      (proc_id, 'Sắp xếp xe vận chuyển', true, 2),
      (proc_id, 'Giao hàng đến công trình', true, 3),
      (proc_id, 'Kiểm tra hiện trạng công trình', true, 4),
      (proc_id, 'Lắp đặt tủ bếp theo bản vẽ', true, 5),
      (proc_id, 'Lắp đặt mặt đá / thiết bị', true, 6),
      (proc_id, 'Căn chỉnh & hoàn thiện chi tiết', true, 7),
      (proc_id, 'Nghiệm thu với khách hàng', true, 8),
      (proc_id, 'Chụp ảnh hoàn thiện công trình', true, 9),
      (proc_id, 'KH ký biên bản nghiệm thu', true, 10);

    -- QT: Bảo hành & CSKH
    INSERT INTO company_processes (id, name, description, color, icon, order_index, company_unit_id, is_active)
    VALUES (gen_random_uuid(), 'Bảo hành & CSKH', 'Chăm sóc sau bán hàng, xử lý bảo hành', '#EF4444', '❤️', 2, cty.id, true)
    RETURNING id INTO proc_id;
    INSERT INTO company_process_checklists (process_id, title, is_required, order_index) VALUES
      (proc_id, 'Gọi điện hỏi thăm sau 3 ngày lắp đặt', true, 1),
      (proc_id, 'Gọi điện hỏi thăm sau 1 tháng', true, 2),
      (proc_id, 'Ghi nhận phản hồi / khiếu nại (nếu có)', true, 3),
      (proc_id, 'Xử lý bảo hành (nếu có)', false, 4),
      (proc_id, 'Đề xuất cross-sell / upsell', false, 5),
      (proc_id, 'Xin review / đánh giá từ KH', false, 6);
  END LOOP;
END $$;
