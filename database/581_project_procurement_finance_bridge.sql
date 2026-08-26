-- 581: Nối Mua hàng -> Project -> chi phí -> công nợ phải trả.
-- Additive only: giữ purchase_requests, purchase_orders và project_expenses làm nguồn hiện hữu.

BEGIN;

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_paid_amount_check') THEN
    ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_paid_amount_check
      CHECK (paid_amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_payment_status_check') THEN
    ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_payment_status_check
      CHECK (payment_status IN ('unpaid', 'partial', 'paid'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_project
  ON purchase_orders(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_due_open
  ON purchase_orders(company_id, due_date)
  WHERE payment_status <> 'paid' AND status <> 'cancelled';

-- Backfill an toàn từ Deal đã gắn Project; không tự suy diễn từ tên/mã.
UPDATE purchase_orders po
SET project_id = lead.project_id
FROM crm_leads lead
WHERE po.project_id IS NULL
  AND po.lead_id = lead.id
  AND lead.project_id IS NOT NULL;

ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS purchase_request_id UUID REFERENCES purchase_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS received_quantity NUMERIC(18, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qc_status TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_order_items_received_quantity_check') THEN
    ALTER TABLE purchase_order_items ADD CONSTRAINT purchase_order_items_received_quantity_check
      CHECK (received_quantity >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_order_items_qc_status_check') THEN
    ALTER TABLE purchase_order_items ADD CONSTRAINT purchase_order_items_qc_status_check
      CHECK (qc_status IS NULL OR qc_status IN ('pending', 'pass', 'fail'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_request
  ON purchase_order_items(purchase_request_id) WHERE purchase_request_id IS NOT NULL;

ALTER TABLE purchase_requests
  ADD COLUMN IF NOT EXISTS purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_requests_purchase_order
  ON purchase_requests(purchase_order_id) WHERE purchase_order_id IS NOT NULL;

ALTER TABLE project_expenses
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_bill_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_expenses_source_type_check') THEN
    ALTER TABLE project_expenses ADD CONSTRAINT project_expenses_source_type_check
      CHECK (source_type IN ('manual', 'purchase_adjustment', 'labor', 'logistics', 'subcontractor', 'overhead', 'other'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_expenses_status_check') THEN
    ALTER TABLE project_expenses ADD CONSTRAINT project_expenses_status_check
      CHECK (status IN ('draft', 'confirmed', 'void'));
  END IF;
END $$;

UPDATE project_expenses expense
SET company_id = project.company_id
FROM projects project
WHERE expense.company_id IS NULL
  AND expense.project_id = project.id;

UPDATE project_expenses expense
SET tenant_id = company.tenant_id
FROM companies company
WHERE expense.tenant_id IS NULL
  AND expense.company_id = company.id;

CREATE INDEX IF NOT EXISTS idx_project_expenses_company_date
  ON project_expenses(company_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_project_expenses_purchase_order
  ON project_expenses(purchase_order_id) WHERE purchase_order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS supplier_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  supplier_invoice_number TEXT,
  bill_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  subtotal NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax_amount NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  paid_amount NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'confirmed', 'partial_paid', 'paid', 'cancelled')),
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS supplier_bills_company_code_uq
  ON supplier_bills(company_id, code);
CREATE INDEX IF NOT EXISTS idx_supplier_bills_project
  ON supplier_bills(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_supplier_bills_po
  ON supplier_bills(purchase_order_id) WHERE purchase_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_supplier_bills_due_open
  ON supplier_bills(company_id, due_date)
  WHERE status IN ('confirmed', 'partial_paid');

CREATE TABLE IF NOT EXISTS supplier_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  supplier_bill_id UUID NOT NULL REFERENCES supplier_bills(id) ON DELETE CASCADE,
  amount NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT,
  reference_number TEXT,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_expenses_supplier_bill_id_fkey') THEN
    ALTER TABLE project_expenses ADD CONSTRAINT project_expenses_supplier_bill_id_fkey
      FOREIGN KEY (supplier_bill_id) REFERENCES supplier_bills(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_supplier_payments_bill ON supplier_payments(supplier_bill_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_project
  ON supplier_payments(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_supplier_payments_company_date
  ON supplier_payments(company_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_project_expenses_supplier_bill
  ON project_expenses(supplier_bill_id) WHERE supplier_bill_id IS NOT NULL;

CREATE OR REPLACE FUNCTION sync_supplier_payable_totals(p_bill_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_bill supplier_bills%ROWTYPE;
  v_paid NUMERIC(18, 2);
  v_po_paid NUMERIC(18, 2);
  v_po_total NUMERIC(18, 2);
BEGIN
  SELECT * INTO v_bill FROM supplier_bills WHERE id = p_bill_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM supplier_payments WHERE supplier_bill_id = p_bill_id;

  UPDATE supplier_bills
  SET paid_amount = v_paid,
      status = CASE
        WHEN status IN ('draft', 'cancelled') THEN status
        WHEN v_paid <= 0 THEN 'confirmed'
        WHEN total > 0 AND v_paid >= total THEN 'paid'
        ELSE 'partial_paid'
      END,
      updated_at = now()
  WHERE id = p_bill_id;

  IF v_bill.purchase_order_id IS NOT NULL THEN
    SELECT COALESCE(SUM(paid_amount), 0) INTO v_po_paid
    FROM supplier_bills
    WHERE purchase_order_id = v_bill.purchase_order_id AND status <> 'cancelled';
    SELECT total INTO v_po_total FROM purchase_orders WHERE id = v_bill.purchase_order_id;
    UPDATE purchase_orders
    SET paid_amount = v_po_paid,
        payment_status = CASE
          WHEN v_po_paid <= 0 THEN 'unpaid'
          WHEN COALESCE(v_po_total, 0) > 0 AND v_po_paid >= v_po_total THEN 'paid'
          ELSE 'partial'
        END,
        updated_at = now()
    WHERE id = v_bill.purchase_order_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION supplier_payments_sync_totals_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM sync_supplier_payable_totals(OLD.supplier_bill_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM sync_supplier_payable_totals(NEW.supplier_bill_id);
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS supplier_payments_sync_totals ON supplier_payments;
CREATE TRIGGER supplier_payments_sync_totals
AFTER INSERT OR UPDATE OR DELETE ON supplier_payments
FOR EACH ROW EXECUTE FUNCTION supplier_payments_sync_totals_trigger();

ALTER TABLE supplier_bills ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_supplier_bills" ON supplier_bills;
CREATE POLICY "service_all_supplier_bills" ON supplier_bills FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_supplier_payments" ON supplier_payments;
CREATE POLICY "service_all_supplier_payments" ON supplier_payments FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE supplier_bills IS
  'Chứng từ phải trả nhà cung cấp, gắn PO và Project; System of Record cho AP trong Business OS.';
COMMENT ON TABLE supplier_payments IS
  'Giao dịch chi tiền nhà cung cấp; tổng được đối chiếu về supplier_bills.paid_amount.';

COMMIT;
