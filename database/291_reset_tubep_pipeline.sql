-- 291_reset_tubep_pipeline.sql
-- Xóa toàn bộ cột pipeline phân loại «Tủ bếp» và thay bằng bộ 20 cột mới.
--
-- Tự bootstrap bảng/cột nếu DB chưa chạy migration 53 / 97 / 101 / 251.
-- Idempotent: chạy lại an toàn (xóa + seed lại Tủ bếp).

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- BƯỚC 0: Đảm bảo schema tối thiểu
-- ═══════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'companies'
  ) THEN
    RAISE EXCEPTION
      'Bảng companies không tồn tại — bạn đang chạy trên DATABASE SAI. '
      'Mở đúng Supabase project app đang dùng → SQL Editor → chạy lại file này.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS workshop_project_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  applies_to TEXT NOT NULL DEFAULT 'both' CHECK (applies_to IN ('production', 'logistics', 'both')),
  order_index INT NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS workshop_project_types_company_name_uq
  ON workshop_project_types (company_id, lower(name));

CREATE TABLE IF NOT EXISTS production_pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT DEFAULT '#0f766e',
  icon TEXT,
  order_index INT NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  workflow_stage_id UUID,
  bucket_slug TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE production_pipeline_stages
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE production_pipeline_stages
  ADD COLUMN IF NOT EXISTS workshop_type_id UUID REFERENCES workshop_project_types(id) ON DELETE CASCADE;

ALTER TABLE production_pipeline_stages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all" ON production_pipeline_stages;
CREATE POLICY "service_all" ON production_pipeline_stages FOR ALL USING (true);

CREATE INDEX IF NOT EXISTS idx_production_pipeline_stages_company
  ON production_pipeline_stages(company_id);

CREATE INDEX IF NOT EXISTS idx_production_pipeline_stages_workshop_type
  ON production_pipeline_stages (company_id, workshop_type_id)
  WHERE workshop_type_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'workflow_stages'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_schema = 'public'
       AND table_name = 'production_pipeline_stages'
       AND constraint_name = 'production_pipeline_stages_workflow_stage_id_fkey'
  ) THEN
    ALTER TABLE production_pipeline_stages
      ADD CONSTRAINT production_pipeline_stages_workflow_stage_id_fkey
      FOREIGN KEY (workflow_stage_id) REFERENCES workflow_stages(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- BƯỚC 1: Xóa cột Tủ bếp cũ + seed 20 cột mới
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_company   RECORD;
  v_prod_ws   UUID;
  v_tubep_id  UUID;
  v_deleted   INT;
BEGIN
  v_prod_ws := NULL;
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'workflow_stages'
  ) THEN
    SELECT id INTO v_prod_ws FROM workflow_stages WHERE slug = 'production' LIMIT 1;
  END IF;

  DELETE FROM production_pipeline_stages p
   USING workshop_project_types wpt
   WHERE p.workshop_type_id = wpt.id
     AND lower(wpt.name) = lower('Tủ bếp');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE '[291] Đã xóa % cột pipeline Tủ bếp.', v_deleted;

  FOR v_company IN SELECT id FROM companies LOOP
    SELECT id INTO v_tubep_id
      FROM workshop_project_types
      WHERE company_id = v_company.id AND lower(name) = lower('Tủ bếp')
      LIMIT 1;
    IF v_tubep_id IS NULL THEN
      INSERT INTO workshop_project_types (company_id, name, applies_to, order_index, is_active)
      VALUES (v_company.id, 'Tủ bếp', 'production', 100, true)
      RETURNING id INTO v_tubep_id;
    END IF;

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
    ) AS s(idx, name, color, icon);
  END LOOP;
END $$;

COMMIT;
