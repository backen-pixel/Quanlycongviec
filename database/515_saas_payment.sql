-- ════════════════════════════════════════════════════════════
-- 515: Thanh toán đăng ký gói SaaS
-- ════════════════════════════════════════════════════════════

ALTER TABLE saas_purchases ADD COLUMN IF NOT EXISTS payment_method VARCHAR(32);
ALTER TABLE saas_purchases ADD COLUMN IF NOT EXISTS payment_status VARCHAR(32) NOT NULL DEFAULT 'awaiting';
ALTER TABLE saas_purchases ADD COLUMN IF NOT EXISTS payment_reference TEXT;
ALTER TABLE saas_purchases ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_saas_purchases_payment ON saas_purchases(payment_status, payment_method);

COMMENT ON COLUMN saas_purchases.payment_method IS 'bank_transfer | momo | vnpay | vietqr | invoice | free';
COMMENT ON COLUMN saas_purchases.payment_status IS 'awaiting | paid | waived';
