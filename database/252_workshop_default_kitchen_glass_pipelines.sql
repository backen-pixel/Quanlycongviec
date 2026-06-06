-- 252_workshop_default_kitchen_glass_pipelines.sql
-- Tự sinh 2 phân loại + bộ pipeline xưởng mặc định cho MỌI công ty:
--   📦 Tủ bếp        (20 cột — migration 291)
--   📦 Cánh kính     (12 cột — migration 292)
--
-- Idempotent: chạy nhiều lần an toàn — phân loại đã có và cột đã có (theo
-- company_id + workshop_type_id + name) sẽ bỏ qua. Chỉ thêm phần thiếu.
--
-- Phụ thuộc:
--   97_workshop_project_types.sql           — bảng workshop_project_types
--   53_production_pipeline_stages.sql       — bảng production_pipeline_stages
--   251_production_pipeline_workshop_type.sql — cột workshop_type_id

BEGIN;

DO $$
DECLARE
  v_company   RECORD;
  v_prod_ws   UUID;
  v_tubep_id  UUID;
  v_kinh_id   UUID;
  v_max_order INT;
BEGIN
  -- workflow_stage 'production' để mọi cột pipeline xưởng map vào (nhất quán
  -- với hành vi pipeline-settings: cột pipeline xưởng = giai đoạn workflow «Sản xuất»).
  SELECT id INTO v_prod_ws FROM workflow_stages WHERE slug = 'production' LIMIT 1;

  FOR v_company IN SELECT id FROM companies LOOP
    -- ─── Phân loại 1: Tủ bếp ─────────────────────────────────────────────
    SELECT id INTO v_tubep_id
      FROM workshop_project_types
      WHERE company_id = v_company.id AND lower(name) = lower('Tủ bếp')
      LIMIT 1;
    IF v_tubep_id IS NULL THEN
      INSERT INTO workshop_project_types (company_id, name, applies_to, order_index, is_active)
      VALUES (v_company.id, 'Tủ bếp', 'production', 100, true)
      RETURNING id INTO v_tubep_id;
    END IF;

    -- ─── Phân loại 2: Cánh kính ──────────────────────────────────────────
    SELECT id INTO v_kinh_id
      FROM workshop_project_types
      WHERE company_id = v_company.id AND lower(name) = lower('Cánh kính')
      LIMIT 1;
    IF v_kinh_id IS NULL THEN
      INSERT INTO workshop_project_types (company_id, name, applies_to, order_index, is_active)
      VALUES (v_company.id, 'Cánh kính', 'production', 101, true)
      RETURNING id INTO v_kinh_id;
    END IF;

    -- ─── Pipeline cho Tủ bếp (20 cột) ────────────────────────────────────
    -- order_index dùng dải 1001–1020 (tránh đè cột hiện có; user reorder sau).
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

    -- ─── Pipeline cho Cánh kính ──────────────────────────────────────────
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
-- SELECT c.name AS company,
--        wpt.name AS phan_loai,
--        COUNT(p.id) AS so_cot
-- FROM companies c
-- LEFT JOIN workshop_project_types wpt ON wpt.company_id = c.id
--   AND lower(wpt.name) IN (lower('Tủ bếp'), lower('Cánh kính'))
-- LEFT JOIN production_pipeline_stages p ON p.company_id = c.id
--   AND p.workshop_type_id = wpt.id
-- GROUP BY c.name, wpt.name
-- ORDER BY c.name, wpt.name;
