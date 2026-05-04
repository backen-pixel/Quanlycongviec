-- 119: Phạm vi công ty cho báo giá / đơn / hóa đơn / nguồn CRM / KH / sự kiện / ghi âm
-- + backfill dữ liệu cũ NULL → công ty Phúc Đạt (khớp tên / tên ngắn; không có bản ghi thì bỏ qua)

-- ── Cột company_id thương mại (khác sx_company_id trên orders) ──
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

ALTER TABLE crm_sources ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

ALTER TABLE voice_recordings ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE crm_events ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quotations_company_id ON quotations(company_id);
CREATE INDEX IF NOT EXISTS idx_orders_commercial_company_id ON orders(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_company_id ON invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_crm_sources_company_id ON crm_sources(company_id);
CREATE INDEX IF NOT EXISTS idx_customers_company_id ON customers(company_id);
CREATE INDEX IF NOT EXISTS idx_voice_recordings_company_id ON voice_recordings(company_id);
CREATE INDEX IF NOT EXISTS idx_crm_events_company_id ON crm_events(company_id);

COMMENT ON COLUMN quotations.company_id IS 'Công ty thương mại (CRM); ưu tiên đồng bộ từ lead/deal';
COMMENT ON COLUMN orders.company_id IS 'Công ty thương mại (CRM); khác sx_company_id (phân xưởng SX)';
COMMENT ON COLUMN invoices.company_id IS 'Công ty thương mại (CRM)';
COMMENT ON COLUMN crm_sources.company_id IS 'NULL = nguồn dùng chọn toàn hệ thống; có giá trị = riêng công ty';
COMMENT ON COLUMN customers.company_id IS 'Công ty chính (CRM); KH có thể xuất hiện ở nhiều công ty qua lead sau này';

-- ── Hàm tiện ích: UUID công ty Phúc Đạt (một lần trong session migration) ──
DO $$
DECLARE
  phuc_id UUID;
BEGIN
  SELECT id INTO phuc_id FROM companies
  WHERE name ILIKE '%Phúc Đạt%' OR short_name ILIKE '%Phúc Đạt%'
     OR name ILIKE '%Phuc Dat%' OR short_name ILIKE '%Phuc Dat%'
     OR (name ILIKE '%Phúc%' AND name ILIKE '%Đạt%')
  LIMIT 1;

  IF phuc_id IS NULL THEN
    RAISE NOTICE '119: Không tìm thấy công ty Phúc Đạt — bỏ qua backfill NULL';
    RETURN;
  END IF;

  -- Lead/deal chưa gán công ty
  UPDATE crm_leads SET company_id = phuc_id WHERE company_id IS NULL;

  -- Báo giá / đơn / hóa đơn từ lead
  UPDATE quotations q
  SET company_id = l.company_id
  FROM crm_leads l
  WHERE q.lead_id = l.id AND q.company_id IS NULL AND l.company_id IS NOT NULL;

  UPDATE orders o
  SET company_id = l.company_id
  FROM crm_leads l
  WHERE o.lead_id = l.id AND o.company_id IS NULL AND l.company_id IS NOT NULL;

  UPDATE orders o
  SET company_id = q.company_id
  FROM quotations q
  WHERE o.quotation_id = q.id AND o.company_id IS NULL AND q.company_id IS NOT NULL;

  UPDATE invoices i
  SET company_id = o.company_id
  FROM orders o
  WHERE i.order_id = o.id AND i.company_id IS NULL AND o.company_id IS NOT NULL;

  UPDATE invoices i
  SET company_id = q.company_id
  FROM quotations q
  WHERE i.quotation_id = q.id AND i.company_id IS NULL AND q.company_id IS NOT NULL;

  -- Khách hàng: lấy company gần nhất từ lead
  UPDATE customers c
  SET company_id = sub.company_id
  FROM (
    SELECT DISTINCT ON (customer_id) customer_id, company_id
    FROM crm_leads
    WHERE customer_id IS NOT NULL AND company_id IS NOT NULL
    ORDER BY customer_id, created_at DESC NULLS LAST
  ) sub
  WHERE c.id = sub.customer_id AND c.company_id IS NULL;

  UPDATE customers SET company_id = phuc_id WHERE company_id IS NULL;

  UPDATE quotations SET company_id = phuc_id WHERE company_id IS NULL;
  UPDATE orders SET company_id = phuc_id WHERE company_id IS NULL;
  UPDATE invoices SET company_id = phuc_id WHERE company_id IS NULL;

  -- Sự kiện / ghi âm theo lead
  UPDATE crm_events e SET company_id = l.company_id
  FROM crm_leads l WHERE e.lead_id = l.id AND e.company_id IS NULL AND l.company_id IS NOT NULL;

  UPDATE voice_recordings v SET company_id = l.company_id
  FROM crm_leads l WHERE v.lead_id = l.id AND v.company_id IS NULL AND l.company_id IS NOT NULL;

  UPDATE crm_events SET company_id = phuc_id WHERE company_id IS NULL;
  UPDATE voice_recordings SET company_id = phuc_id WHERE company_id IS NULL;

  RAISE NOTICE '119: Backfill Phúc Đạt hoàn tất (company_id = %)', phuc_id;
END $$;
