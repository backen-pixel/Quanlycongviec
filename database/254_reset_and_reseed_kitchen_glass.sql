-- 254_reset_and_reseed_kitchen_glass.sql
-- ⚠️  ALL-IN-ONE — chạy 1 LẦN để cấu hình lại pipeline xưởng từ đầu.
--
-- Tác động (CHỈ module Sản xuất, không động VC/CRM):
--   1. UPDATE projects.workshop_type_id = NULL  → mọi deal về «Chưa phân loại»
--   2. DELETE production_pipeline_stages WHERE company_id IS NOT NULL
--      • Cột Global (company_id IS NULL) GIỮ LẠI để fallback Kanban
--      • Phân loại (workshop_project_types) GIỮ LẠI nguyên vẹn
--      • crm_leads.sx_pipeline_stage_id, tasks.production_stage_id → SET NULL
--      • workshop_task_templates.production_stage_id → CASCADE (xóa template gắn cột vừa xóa)
--   3. RESEED 2 phân loại + bộ pipeline mặc định cho MỌI công ty:
--        📦 Tủ bếp     (20 cột — migration 291)
--        📦 Cánh kính  (12 cột — migration 292)
--
-- Idempotent: chạy lại an toàn, phần đã có sẽ bỏ qua.
--
-- Phụ thuộc: 53, 88, 97, 251

BEGIN;

-- ════════════════════════════════════════════════════════════════════════
-- BƯỚC 1: Đưa toàn bộ deal về «Chưa phân loại»
-- ════════════════════════════════════════════════════════════════════════
UPDATE projects
   SET workshop_type_id = NULL
 WHERE workshop_type_id IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════════
-- BƯỚC 2: Xóa pipeline cũ scope theo công ty
-- ════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
    FROM production_pipeline_stages
   WHERE company_id IS NOT NULL;
  RAISE NOTICE '[BƯỚC 2] Xóa % cột pipeline thuộc công ty.', v_count;
END $$;

DELETE FROM production_pipeline_stages
 WHERE company_id IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════════
-- BƯỚC 3: Reseed Tủ bếp + Cánh kính cho MỌI công ty
-- ════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_company   RECORD;
  v_prod_ws   UUID;
  v_tubep_id  UUID;
  v_kinh_id   UUID;
BEGIN
  SELECT id INTO v_prod_ws FROM workflow_stages WHERE slug = 'production' LIMIT 1;

  FOR v_company IN SELECT id FROM companies LOOP
    -- ─── Phân loại: Tủ bếp ───────────────────────────────────────────────
    SELECT id INTO v_tubep_id
      FROM workshop_project_types
      WHERE company_id = v_company.id AND lower(name) = lower('Tủ bếp')
      LIMIT 1;
    IF v_tubep_id IS NULL THEN
      INSERT INTO workshop_project_types (company_id, name, applies_to, order_index, is_active)
      VALUES (v_company.id, 'Tủ bếp', 'production', 100, true)
      RETURNING id INTO v_tubep_id;
    END IF;

    -- ─── Phân loại: Cánh kính ────────────────────────────────────────────
    SELECT id INTO v_kinh_id
      FROM workshop_project_types
      WHERE company_id = v_company.id AND lower(name) = lower('Cánh kính')
      LIMIT 1;
    IF v_kinh_id IS NULL THEN
      INSERT INTO workshop_project_types (company_id, name, applies_to, order_index, is_active)
      VALUES (v_company.id, 'Cánh kính', 'production', 101, true)
      RETURNING id INTO v_kinh_id;
    END IF;

    -- ─── Pipeline Tủ bếp (20 cột) ────────────────────────────────────────
    INSERT INTO production_pipeline_stages
      (company_id, workshop_type_id, name, color, icon, order_index,
       is_active, workflow_stage_id, bucket_slug)
    SELECT v_company.id, v_tubep_id, s.name, s.color, s.icon,
           1000 + s.idx, true, v_prod_ws, NULL
    FROM (VALUES
      (1,  'Tiếp nhận đơn hàng về SX',           '#6366F1', '📥'),
      (2,  'Thiết kế & lập kế hoạch NVL',        '#8B5CF6', '📐'),
      (3,  'Sản xuất kiểm tra chéo đặt kính',    '#0EA5E9', '🔍'),
      (4,  'CHUẨN BỊ VẬT TƯ, CẮT KÍNH',          '#06B6D4', '📦'),
      (5,  'ĐANG CẮT CÁNH,',                     '#F59E0B', '✂️'),
      (6,  'KẾ HOẠCH SX THÙNG LÁ GHÉP',          '#10B981', '📋'),
      (7,  'KẾ HOẠCH SX THÙNG HỢP KIM',          '#FBBF24', '📋'),
      (8,  'SX THÙNG HỢP KIM + 100 X 16',        '#F97316', '🏭'),
      (9,  'ĐANG SX THÙNG LÁ GHÉP NHỎ',           '#84CC16', '🏭'),
      (10, 'ĐỘI SƠN',                            '#A855F7', '🎨'),
      (11, 'HT NHÔM NGUYÊN TẤM',                 '#22C55E', '🔧'),
      (12, 'HT NHÔM LÁ GHÉP NHỎ',                '#EAB308', '🔧'),
      (13, 'KT KCS SẢN PHẨM, TÍNH CN',           '#14B8A6', '✅'),
      (14, 'ĐƠN HÀNG ĐÃ CHUẨN BỊ XONG',          '#3B82F6', '📦'),
      (15, 'ĐƠN HÀNG NGÀY MAI GIAO',             '#FB923C', '🚚'),
      (16, 'ĐƠN HÀNG ĐÃ GIAO',                   '#10B981', '✔️'),
      (17, 'CHỐT CÔNG NỢ ,',                     '#64748B', '🧾'),
      (18, 'KIỂM TRA CÔNG NỢ',                   '#475569', '🔎'),
      (19, 'Thu tiền',                           '#16A34A', '💰'),
      (20, 'CHUYỂN TÁC VỤ PHÒNG KẾ TOÁN',        '#1E40AF', '📨')
    ) AS s(idx, name, color, icon)
    WHERE NOT EXISTS (
      SELECT 1 FROM production_pipeline_stages p
       WHERE p.company_id = v_company.id
         AND p.workshop_type_id = v_tubep_id
         AND lower(p.name) = lower(s.name)
    );

    -- ─── Pipeline Cánh kính (12 cột) ─────────────────────────────────────
    INSERT INTO production_pipeline_stages
      (company_id, workshop_type_id, name, color, icon, order_index,
       is_active, workflow_stage_id, bucket_slug)
    SELECT v_company.id, v_kinh_id, s.name, s.color, s.icon,
           1100 + s.idx, true, v_prod_ws, NULL
    FROM (VALUES
      (1,  'Tiếp Nhận',                         '#6366F1', '📥'),
      (2,  'Vẽ lên kế hoạch sản xuất',         '#8B5CF6', '📐'),
      (3,  'Kiểm tra và đặt kính.',            '#0EA5E9', '🔍'),
      (4,  'Chuẩn bị Vật tư',                  '#06B6D4', '📦'),
      (5,  'Phát vật tư',                       '#14B8A6', '📤'),
      (6,  'sản xuất',                          '#F59E0B', '🏭'),
      (7,  'vệ sinh đóng gói',                  '#FB923C', '🧹'),
      (8,  'thu tiền',                          '#16A34A', '💰'),
      (9,  'Chờ giao hàng',                     '#64748B', '⏳'),
      (10, 'Đợi thanh toán',                    '#D97706', '💵'),
      (11, 'Hoàn thành',                        '#10B981', '✅'),
      (12, 'Nợ quá hạn không thu tiền được',    '#DC2626', '⚠️')
    ) AS s(idx, name, color, icon)
    WHERE NOT EXISTS (
      SELECT 1 FROM production_pipeline_stages p
       WHERE p.company_id = v_company.id
         AND p.workshop_type_id = v_kinh_id
         AND lower(p.name) = lower(s.name)
    );
  END LOOP;
END $$;

COMMIT;

-- ─── Báo cáo nhanh sau khi chạy ──────────────────────────────────────────
-- SELECT c.name AS cong_ty,
--        wpt.name AS phan_loai,
--        COUNT(p.id) AS so_cot
-- FROM companies c
-- LEFT JOIN workshop_project_types wpt ON wpt.company_id = c.id
--   AND lower(wpt.name) IN (lower('Tủ bếp'), lower('Cánh kính'))
-- LEFT JOIN production_pipeline_stages p ON p.company_id = c.id
--   AND p.workshop_type_id = wpt.id
-- GROUP BY c.name, wpt.name
-- ORDER BY c.name, wpt.name;
--
-- SELECT COUNT(*) FROM projects WHERE workshop_type_id IS NULL;
