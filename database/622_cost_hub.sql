-- 622: Sổ chi phí trung tâm + công thức theo module (Kế toán).
-- Additive. Không sửa bảng cũ trừ cột mới NULL.
-- Seed danh mục/nguồn/công thức theo công ty làm lúc mở setup (JS), không hardcode số tiền.

BEGIN;

-- ── Cột nguồn VC / COGS dòng thương mại ──────────────────────
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS logistics_cost NUMERIC;

COMMENT ON COLUMN projects.logistics_cost IS
  'Phí vận chuyển / lắp (VC) — đẩy lên sổ chi phí source vc.shipping. Tách khỏi production_value.';

ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC;
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC;
ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC;

COMMENT ON COLUMN quotation_items.cost_price IS
  'Giá vốn dòng báo giá (COGS). NULL = lấy products.cost_price nếu có product_id.';
COMMENT ON COLUMN order_items.cost_price IS
  'Giá vốn dòng đơn hàng (COGS). NULL = lấy products.cost_price nếu có product_id.';
COMMENT ON COLUMN invoice_items.cost_price IS
  'Giá vốn dòng hóa đơn (COGS). NULL = lấy products.cost_price nếu có product_id.';

-- ── Nhóm chi phí ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cost_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cost_categories_company_code
  ON cost_categories (company_id, lower(code));
CREATE INDEX IF NOT EXISTS idx_cost_categories_company
  ON cost_categories (company_id) WHERE is_active = TRUE;

ALTER TABLE cost_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_cost_categories" ON cost_categories;
CREATE POLICY "service_all_cost_categories" ON cost_categories FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE cost_categories IS
  'Nhóm chi phí của công ty (NVL, gia công, phí VC, mua hàng, …).';

-- ── Định nghĩa nguồn module ──────────────────────────────────
CREATE TABLE IF NOT EXISTS cost_source_defs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source_key TEXT NOT NULL,
  module_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  default_category_id UUID REFERENCES cost_categories(id) ON DELETE SET NULL,
  auto_push BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cost_source_defs_company_key
  ON cost_source_defs (company_id, source_key);
CREATE INDEX IF NOT EXISTS idx_cost_source_defs_company
  ON cost_source_defs (company_id) WHERE is_active = TRUE;

ALTER TABLE cost_source_defs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_cost_source_defs" ON cost_source_defs;
CREATE POLICY "service_all_cost_source_defs" ON cost_source_defs FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE cost_source_defs IS
  'Nguồn chi phí chuẩn hóa (sx.production_value, purchasing.po, …) + map nhóm + auto_push.';

-- ── Sổ dòng ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cost_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL,
  source_key TEXT NOT NULL,
  module_key TEXT NOT NULL,
  category_id UUID REFERENCES cost_categories(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  source_table TEXT,
  source_row_id UUID,
  origin TEXT NOT NULL DEFAULT 'auto' CHECK (origin IN ('auto', 'manual')),
  is_void BOOLEAN NOT NULL DEFAULT FALSE,
  void_reason TEXT,
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cost_entries_source
  ON cost_entries (source_table, source_row_id, source_key)
  WHERE source_row_id IS NOT NULL AND source_table IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cost_entries_project
  ON cost_entries (project_id) WHERE is_void = FALSE;
CREATE INDEX IF NOT EXISTS idx_cost_entries_lead
  ON cost_entries (lead_id) WHERE lead_id IS NOT NULL AND is_void = FALSE;
CREATE INDEX IF NOT EXISTS idx_cost_entries_company_date
  ON cost_entries (company_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_cost_entries_source_key
  ON cost_entries (company_id, source_key) WHERE is_void = FALSE;

ALTER TABLE cost_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_cost_entries" ON cost_entries;
CREATE POLICY "service_all_cost_entries" ON cost_entries FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE cost_entries IS
  'Sổ chi phí: mỗi dòng nguồn module upsert 1 dòng (idempotent). is_void khi nguồn hủy.';

-- ── Công thức ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cost_formulas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  ast JSONB NOT NULL DEFAULT '{"type":"num","value":0}'::jsonb,
  expr_text TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cost_formulas_company_code
  ON cost_formulas (company_id, lower(code));
CREATE INDEX IF NOT EXISTS idx_cost_formulas_company
  ON cost_formulas (company_id) WHERE is_active = TRUE;

ALTER TABLE cost_formulas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_cost_formulas" ON cost_formulas;
CREATE POLICY "service_all_cost_formulas" ON cost_formulas FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE cost_formulas IS
  'Công thức chi phí (AST an toàn). Biến: cat.<code>, src.<source_key>, crm.doanh_thu, entries.total, mã công thức trước.';

COMMIT;
