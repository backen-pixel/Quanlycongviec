-- 333: Module "Tính toán" — đăng ký module + bộ schema
--
-- Cấu trúc:
--   calc_categories       Danh mục sản phẩm tính toán (vd: Tủ bếp, Tủ áo, Vách CNC)
--   calc_product_types    Loại trong danh mục (vd: Tủ trên, Tủ dưới, Tủ kệ)
--   calc_variables        Biến đầu vào của loại (rộng, cao, sâu, kt_chuan, ty_le_dieu_chinh, …)
--   calc_formulas         Công thức (AST blocks JSON) — block-based editor
--   calc_rules            Rule điều kiện → áp công thức (priority asc, rule khớp đầu tiên thắng)
--   calc_runs             Lịch sử tính (manual hoặc từ file 3D)
--   calc_3d_imports       Lưu file 3D đã upload + danh sách item parsed ra
--
-- Mọi bảng dùng UUID PK + RLS service-all để khớp pattern hiện có.

BEGIN;

-- 1) Đăng ký module_key 'tinhtoan' vào danh sách module có thể giới hạn theo khối.
-- Không cần ALTER constraint vì ecosystem_module_scopes.module_key đang là VARCHAR free-form,
-- helper KNOWN_MODULE_KEYS phía backend kiểm soát danh sách hợp lệ.
COMMENT ON COLUMN ecosystem_module_scopes.module_key IS
  'crm | production | logistics | projects | tasks | customers | tinhtoan';

-- 2) Danh mục sản phẩm tính toán
CREATE TABLE IF NOT EXISTS calc_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(64),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  icon VARCHAR(40),
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_calc_categories_active ON calc_categories(is_active);
CREATE INDEX IF NOT EXISTS idx_calc_categories_company ON calc_categories(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_calc_categories_code_company
  ON calc_categories(LOWER(code), COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE code IS NOT NULL;

ALTER TABLE calc_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_calc_categories" ON calc_categories;
CREATE POLICY "service_all_calc_categories" ON calc_categories FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE calc_categories IS 'Module Tính toán: danh mục sản phẩm (vd: Tủ bếp, Tủ áo, Vách CNC).';

-- 3) Loại sản phẩm trong danh mục
CREATE TABLE IF NOT EXISTS calc_product_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES calc_categories(id) ON DELETE CASCADE,
  code VARCHAR(64),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  default_unit VARCHAR(16) NOT NULL DEFAULT 'mm',  -- mm | cm | m
  result_unit VARCHAR(32),                          -- vd: VND, m2, m3, kg
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  match_keywords TEXT[],                            -- từ khoá map item từ file 3D về loại này
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_calc_product_types_category ON calc_product_types(category_id);
CREATE INDEX IF NOT EXISTS idx_calc_product_types_active ON calc_product_types(is_active);
CREATE UNIQUE INDEX IF NOT EXISTS uq_calc_product_types_code_in_cat
  ON calc_product_types(category_id, LOWER(code))
  WHERE code IS NOT NULL;

ALTER TABLE calc_product_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_calc_product_types" ON calc_product_types;
CREATE POLICY "service_all_calc_product_types" ON calc_product_types FOR ALL USING (true) WITH CHECK (true);

COMMENT ON COLUMN calc_product_types.match_keywords IS
  'Từ khoá map item từ file 3D (vd: ["tu tren","upper cab","wall unit"]).';

-- 4) Biến đầu vào của loại — rộng, cao, sâu, kích thước chuẩn, % điều chỉnh, đơn giá, …
CREATE TABLE IF NOT EXISTS calc_variables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_type_id UUID NOT NULL REFERENCES calc_product_types(id) ON DELETE CASCADE,
  var_key VARCHAR(64) NOT NULL,        -- mã dùng trong công thức (rong, cao, sau, kt_chuan, ty_le, don_gia, …)
  label VARCHAR(200) NOT NULL,
  data_type VARCHAR(16) NOT NULL DEFAULT 'number', -- number | percent | text | bool
  unit VARCHAR(16),                    -- mm | cm | m | % | VND | …
  default_value NUMERIC,
  min_value NUMERIC,
  max_value NUMERIC,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  is_dimension BOOLEAN NOT NULL DEFAULT FALSE,  -- true = lấy từ file 3D
  dim_axis VARCHAR(8),                          -- W | H | D — gợi ý map từ kích thước file 3D
  sort_order INT NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_calc_variables_type ON calc_variables(product_type_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_calc_variables_key_in_type
  ON calc_variables(product_type_id, LOWER(var_key));

ALTER TABLE calc_variables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_calc_variables" ON calc_variables;
CREATE POLICY "service_all_calc_variables" ON calc_variables FOR ALL USING (true) WITH CHECK (true);

COMMENT ON COLUMN calc_variables.var_key IS
  'Mã biến (ASCII, không dấu) dùng trong AST công thức — ví dụ: rong, cao, sau, kt_chuan, ty_le.';
COMMENT ON COLUMN calc_variables.is_dimension IS
  'TRUE = biến lấy từ kích thước item file 3D (W/H/D).';

-- 5) Công thức — AST blocks (Blockly-style)
CREATE TABLE IF NOT EXISTS calc_formulas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_type_id UUID NOT NULL REFERENCES calc_product_types(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  ast JSONB NOT NULL DEFAULT '{}'::jsonb,     -- AST node tree
  expression_text TEXT,                        -- preview text để debug (auto-gen từ AST)
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_calc_formulas_type ON calc_formulas(product_type_id);
CREATE INDEX IF NOT EXISTS idx_calc_formulas_active ON calc_formulas(is_active);

ALTER TABLE calc_formulas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_calc_formulas" ON calc_formulas;
CREATE POLICY "service_all_calc_formulas" ON calc_formulas FOR ALL USING (true) WITH CHECK (true);

COMMENT ON COLUMN calc_formulas.ast IS
  'AST node-tree dạng {type, op, args:[...]} — eval bởi backend/src/helpers/calcEngine.js.';

-- 6) Rule điều kiện → công thức
CREATE TABLE IF NOT EXISTS calc_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_type_id UUID NOT NULL REFERENCES calc_product_types(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  priority INT NOT NULL DEFAULT 100,           -- thấp = ưu tiên cao
  condition_ast JSONB NOT NULL DEFAULT '{}'::jsonb,  -- AST boolean
  condition_text TEXT,
  formula_id UUID REFERENCES calc_formulas(id) ON DELETE SET NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,    -- rule khớp khi không rule nào trên trùng (no-op condition)
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_calc_rules_type ON calc_rules(product_type_id);
CREATE INDEX IF NOT EXISTS idx_calc_rules_priority ON calc_rules(product_type_id, priority);

ALTER TABLE calc_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_calc_rules" ON calc_rules;
CREATE POLICY "service_all_calc_rules" ON calc_rules FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE calc_rules IS
  'Rule điều kiện → công thức. Backend chạy theo priority ASC, rule khớp đầu tiên thắng.';

-- 7) Lịch sử tính
CREATE TABLE IF NOT EXISTS calc_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_type_id UUID REFERENCES calc_product_types(id) ON DELETE SET NULL,
  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  matched_rule_id UUID REFERENCES calc_rules(id) ON DELETE SET NULL,
  applied_formula_id UUID REFERENCES calc_formulas(id) ON DELETE SET NULL,
  result NUMERIC,
  result_unit VARCHAR(32),
  breakdown JSONB,                            -- chi tiết từng bước AST
  source VARCHAR(16) NOT NULL DEFAULT 'manual', -- manual | import_3d | api
  import_id UUID,                             -- FK → calc_3d_imports.id (lazy)
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_calc_runs_type ON calc_runs(product_type_id);
CREATE INDEX IF NOT EXISTS idx_calc_runs_user ON calc_runs(created_by);
CREATE INDEX IF NOT EXISTS idx_calc_runs_import ON calc_runs(import_id);

ALTER TABLE calc_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_calc_runs" ON calc_runs;
CREATE POLICY "service_all_calc_runs" ON calc_runs FOR ALL USING (true) WITH CHECK (true);

-- 8) Import file 3D
CREATE TABLE IF NOT EXISTS calc_3d_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  format VARCHAR(16) NOT NULL,        -- skp | dxf | dwg | ifc | obj | gltf | csv | xlsx | json | xml
  status VARCHAR(16) NOT NULL DEFAULT 'parsed', -- pending | parsed | failed
  parse_error TEXT,
  raw_meta JSONB,                     -- header gốc của parser
  items JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{name, w,h,d, qty, raw, matched_type_id?}]
  total_result NUMERIC,
  total_currency VARCHAR(8) DEFAULT 'VND',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_calc_3d_imports_user ON calc_3d_imports(created_by);
CREATE INDEX IF NOT EXISTS idx_calc_3d_imports_status ON calc_3d_imports(status);

ALTER TABLE calc_3d_imports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_calc_3d_imports" ON calc_3d_imports;
CREATE POLICY "service_all_calc_3d_imports" ON calc_3d_imports FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE calc_3d_imports IS
  'File 3D upload: parser strategy theo .format → items[]; mỗi item map về calc_product_types & tính giá trị.';

COMMIT;
