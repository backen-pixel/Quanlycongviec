-- ════════════════════════════════════════════════════════════
-- 434: Procurement Lite — nhà cung cấp + yêu cầu mua gắn Project/Đơn SX
-- Mục tiêu: theo dõi hạng mục cần mua (nội bộ/ngoài), ngày cam kết, QC, Next Action.
-- KHÔNG phải PO/RFQ/kho đầy đủ.
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tax_code TEXT,
  contact_person TEXT,
  contact_phone TEXT,
  notes TEXT,
  is_internal_company BOOLEAN NOT NULL DEFAULT false,
  internal_company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_company ON suppliers(company_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON suppliers(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_company_name_uq
  ON suppliers (company_id, lower(trim(name)))
  WHERE is_active = true;

COMMENT ON TABLE suppliers IS
  'Procurement Lite: nhà cung cấp (ngoài) hoặc map sang công ty nội bộ hệ sinh thái — scoped theo company_id quản lý.';

CREATE TABLE IF NOT EXISTS purchase_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  description TEXT,
  source_type TEXT NOT NULL DEFAULT 'external'
    CHECK (source_type IN ('internal', 'external')),
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  requested_date DATE,
  supplier_committed_date DATE,
  expected_price NUMERIC(18, 2),
  actual_price NUMERIC(18, 2),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft', 'requested', 'confirmed', 'received',
      'qc_pass', 'qc_fail', 'delayed', 'done'
    )),
  qc_status TEXT
    CHECK (qc_status IS NULL OR qc_status IN ('pending', 'pass', 'fail')),
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  delay_reason TEXT,
  next_action TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_requests_project ON purchase_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_company ON purchase_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_tenant ON purchase_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_status ON purchase_requests(company_id, status);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_order ON purchase_requests(order_id)
  WHERE order_id IS NOT NULL;

COMMENT ON TABLE purchase_requests IS
  'Procurement Lite: 1 dòng = 1 hạng mục cần mua cho Project/Đơn SX. Theo dõi nguồn, NCC, ngày cam kết, QC, Next Action.';

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_suppliers" ON suppliers;
CREATE POLICY "service_all_suppliers" ON suppliers FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE purchase_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_purchase_requests" ON purchase_requests;
CREATE POLICY "service_all_purchase_requests" ON purchase_requests FOR ALL USING (true) WITH CHECK (true);
