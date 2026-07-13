-- 423: Kế toán — nhiều STK công ty + lịch thanh toán theo giai đoạn deal + lịch sử thực thu

-- ─────────────────────────────────────────────────────
-- 1. Tài khoản ngân hàng theo công ty
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_holder TEXT,
  branch TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_bank_accounts_company
  ON company_bank_accounts (company_id) WHERE is_active = true;

COMMENT ON TABLE company_bank_accounts IS 'Nhiều số tài khoản ngân hàng theo công ty (module kế toán)';

-- Chỉ 1 default / công ty (partial unique)
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_bank_accounts_default
  ON company_bank_accounts (company_id)
  WHERE is_default = true AND is_active = true;

-- ─────────────────────────────────────────────────────
-- 2. Lịch thanh toán theo giai đoạn (deal)
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_payment_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  planned_amount NUMERIC,
  sort_order INT NOT NULL DEFAULT 0,
  payment_method TEXT CHECK (payment_method IS NULL OR payment_method IN ('cash', 'transfer')),
  bank_account_id UUID REFERENCES company_bank_accounts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'partial', 'paid')),
  received_amount NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_payment_stages_lead
  ON crm_payment_stages (lead_id, sort_order);

COMMENT ON TABLE crm_payment_stages IS 'Kế hoạch thanh toán theo giai đoạn (Cọc 1, Cọc 2, còn lại…) trên deal';

-- ─────────────────────────────────────────────────────
-- 3. Lịch sử thực thu theo deal
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_deal_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  stage_id UUID REFERENCES crm_payment_stages(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT CHECK (payment_method IS NULL OR payment_method IN ('cash', 'transfer')),
  bank_account_id UUID REFERENCES company_bank_accounts(id) ON DELETE SET NULL,
  reference_number TEXT,
  notes TEXT,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  mirrored_payment_record_id UUID REFERENCES payment_records(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_deal_payments_lead
  ON crm_deal_payments (lead_id, payment_date DESC);

CREATE INDEX IF NOT EXISTS idx_crm_deal_payments_stage
  ON crm_deal_payments (stage_id);

COMMENT ON TABLE crm_deal_payments IS 'Lịch sử thực thu trên deal kế toán; có thể gắn giai đoạn + STK + mirror HĐ';

ALTER TABLE company_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_payment_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_deal_payments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "service_all" ON company_bank_accounts FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service_all" ON crm_payment_stages FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service_all" ON crm_deal_payments FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
