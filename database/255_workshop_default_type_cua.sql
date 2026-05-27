-- 255_workshop_default_type_cua.sql
-- Tự sinh phân loại 📦 «Cửa» + bộ pipeline xưởng mặc định cho MỌI công ty.
--   Pipeline có 11 cột (giống Cánh kính):
--     1) Tiếp nhận
--     2) Thiết kế và lập kế hoạch
--     3) Kiểm tra đặt kính
--     4) Chuẩn bị vật tư
--     5) Phát vật tư
--     6) Sản xuất
--     7) Vệ sinh đóng gói
--     8) Thu tiền
--     9) Chờ giao hàng
--    10) Đợi thanh toán
--    11) Nợ quá hạn
--
-- Idempotent: chạy lại an toàn — phân loại đã có và cột đã có (theo
-- company_id + workshop_type_id + name) sẽ bỏ qua. Cùng pattern với
-- 252_workshop_default_kitchen_glass_pipelines.sql.
--
-- Phụ thuộc:
--   97_workshop_project_types.sql            — bảng workshop_project_types
--   53_production_pipeline_stages.sql        — bảng production_pipeline_stages
--   251_production_pipeline_workshop_type.sql — cột workshop_type_id

BEGIN;

DO $$
DECLARE
  v_company   RECORD;
  v_prod_ws   UUID;
  v_cua_id    UUID;
BEGIN
  -- workflow_stages.production: tất cả cột pipeline xưởng map vào
  SELECT id INTO v_prod_ws FROM workflow_stages WHERE slug = 'production' LIMIT 1;

  FOR v_company IN SELECT id FROM companies LOOP
    -- ─── Phân loại: Cửa ─────────────────────────────────────────────────
    SELECT id INTO v_cua_id
      FROM workshop_project_types
      WHERE company_id = v_company.id AND lower(name) = lower('Cửa')
      LIMIT 1;
    IF v_cua_id IS NULL THEN
      INSERT INTO workshop_project_types (company_id, name, applies_to, order_index, is_active)
      VALUES (v_company.id, 'Cửa', 'production', 102, true)
      RETURNING id INTO v_cua_id;
    END IF;

    -- ─── Pipeline cho Cửa (11 cột) ──────────────────────────────────────
    -- order_index dùng dải 1201–1211 (tránh đè cột hiện có; user reorder sau).
    INSERT INTO production_pipeline_stages
      (company_id, workshop_type_id, name, color, icon, order_index,
       is_active, workflow_stage_id, bucket_slug)
    SELECT v_company.id, v_cua_id, s.name, s.color, s.icon,
           1200 + s.idx, true, v_prod_ws, NULL
    FROM (VALUES
      (1,  'Tiếp nhận',                '#6366F1', '📥'),
      (2,  'Thiết kế và lập kế hoạch', '#8B5CF6', '📐'),
      (3,  'Kiểm tra đặt kính',        '#0EA5E9', '🔍'),
      (4,  'Chuẩn bị vật tư',          '#06B6D4', '📦'),
      (5,  'Phát vật tư',              '#14B8A6', '📤'),
      (6,  'Sản xuất',                 '#F59E0B', '🏭'),
      (7,  'Vệ sinh đóng gói',         '#FB923C', '🧹'),
      (8,  'Thu tiền',                 '#16A34A', '💰'),
      (9,  'Chờ giao hàng',            '#64748B', '⏳'),
      (10, 'Đợi thanh toán',           '#D97706', '💵'),
      (11, 'Nợ quá hạn',               '#DC2626', '⚠️')
    ) AS s(idx, name, color, icon)
    WHERE NOT EXISTS (
      SELECT 1 FROM production_pipeline_stages p
       WHERE p.company_id = v_company.id
         AND p.workshop_type_id = v_cua_id
         AND lower(p.name) = lower(s.name)
    );
  END LOOP;

  RAISE NOTICE '[255] Đã seed phân loại «Cửa» + 11 bước pipeline cho mọi công ty.';
END $$;

COMMIT;

-- ─── Báo cáo nhanh sau khi chạy ──────────────────────────────────────────
-- SELECT c.name AS company,
--        wpt.name AS phan_loai,
--        COUNT(p.id) AS so_cot
-- FROM companies c
-- LEFT JOIN workshop_project_types wpt ON wpt.company_id = c.id
--   AND lower(wpt.name) = lower('Cửa')
-- LEFT JOIN production_pipeline_stages p ON p.company_id = c.id
--   AND p.workshop_type_id = wpt.id
-- GROUP BY c.name, wpt.name
-- ORDER BY c.name;
