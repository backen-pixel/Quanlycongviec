-- 160: Phân khu vực (region) cho báo giá / đơn hàng / hóa đơn
-- Mục tiêu: báo giá kế thừa region_id từ deal (crm_leads.region_id) để lọc / KPI / phân quyền
-- không phải JOIN crm_leads. Cho phép override (region_id có thể khác lead nếu nghiệp vụ cần).
-- Liên quan: 119 (company_id thương mại), 131 (company_regions + crm_leads.region_id)

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES company_regions(id) ON DELETE SET NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES company_regions(id) ON DELETE SET NULL;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES company_regions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quotations_region_id ON quotations(region_id);
CREATE INDEX IF NOT EXISTS idx_orders_region_id ON orders(region_id);
CREATE INDEX IF NOT EXISTS idx_invoices_region_id ON invoices(region_id);

-- Composite cho list/KPI: báo giá theo công ty + khu vực + người tạo
CREATE INDEX IF NOT EXISTS idx_quotations_company_region_creator
  ON quotations(company_id, region_id, created_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_company_region_creator
  ON orders(company_id, region_id, created_by, order_date DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_company_region_creator
  ON invoices(company_id, region_id, created_by, invoice_date DESC);

COMMENT ON COLUMN quotations.region_id IS 'Khu vực CRM. Mặc định kế thừa từ crm_leads.region_id qua lead_id; có thể override.';
COMMENT ON COLUMN orders.region_id   IS 'Khu vực CRM. Kế thừa từ quotation/lead khi tạo.';
COMMENT ON COLUMN invoices.region_id IS 'Khu vực CRM. Kế thừa từ order/quotation khi tạo.';

-- ── Backfill từ lead ──
UPDATE quotations q
SET region_id = l.region_id
FROM crm_leads l
WHERE q.lead_id = l.id
  AND q.region_id IS NULL
  AND l.region_id IS NOT NULL;

UPDATE orders o
SET region_id = l.region_id
FROM crm_leads l
WHERE o.lead_id = l.id
  AND o.region_id IS NULL
  AND l.region_id IS NOT NULL;

-- Order tạo qua quotation: lấy region từ quotation đã backfill ở trên
UPDATE orders o
SET region_id = q.region_id
FROM quotations q
WHERE o.quotation_id = q.id
  AND o.region_id IS NULL
  AND q.region_id IS NOT NULL;

UPDATE invoices i
SET region_id = o.region_id
FROM orders o
WHERE i.order_id = o.id
  AND i.region_id IS NULL
  AND o.region_id IS NOT NULL;

UPDATE invoices i
SET region_id = q.region_id
FROM quotations q
WHERE i.quotation_id = q.id
  AND i.region_id IS NULL
  AND q.region_id IS NOT NULL;

-- ── Backfill cho báo giá MỒ CÔI (không có lead): gán region "Mặc định" của company nếu có ──
-- Chỉ gán khi quotation đã có company_id (migration 119 đã backfill). Tránh tạo quan hệ chéo công ty.
WITH default_region AS (
  SELECT DISTINCT ON (r.company_id) r.company_id, r.id AS region_id
  FROM company_regions r
  WHERE r.is_active = true
  ORDER BY r.company_id, (CASE WHEN r.code = 'DEFAULT' THEN 0 ELSE 1 END), r.order_index NULLS LAST, r.created_at
)
UPDATE quotations q
SET region_id = dr.region_id
FROM default_region dr
WHERE q.company_id = dr.company_id
  AND q.region_id IS NULL;

-- ── View tiện lợi: báo giá kèm thông tin liên kết (deal/company/region/sales/creator) ──
CREATE OR REPLACE VIEW v_quotations_with_scope AS
SELECT
  q.id,
  q.code,
  q.title,
  q.customer_id,
  q.customer_name,
  q.customer_phone,
  q.lead_id,
  q.fulfillment_lead_id,
  q.source_task_id,
  q.company_id,
  q.region_id,
  q.created_by,
  q.approved_by,
  q.subtotal,
  q.discount_amount,
  q.tax_amount,
  q.total,
  q.status,
  q.valid_until,
  q.created_at,
  q.updated_at,
  -- Linked deal info (snapshot khi query)
  l.code        AS lead_code,
  l.title       AS lead_title,
  l.type        AS lead_type,
  l.assigned_to AS lead_assigned_to,
  -- Company / region snapshot
  co.name       AS company_name,
  co.short_name AS company_short_name,
  rg.name       AS region_name,
  rg.code       AS region_code,
  -- Creator snapshot
  cu.full_name  AS creator_name,
  cu.email      AS creator_email,
  -- Flag mồ côi (không gắn deal/lead)
  (q.lead_id IS NULL) AS is_orphan
FROM quotations q
LEFT JOIN crm_leads      l  ON l.id  = q.lead_id
LEFT JOIN companies      co ON co.id = q.company_id
LEFT JOIN company_regions rg ON rg.id = q.region_id
LEFT JOIN users          cu ON cu.id = q.created_by;

COMMENT ON VIEW v_quotations_with_scope IS
  'Báo giá kèm thông tin scope (deal, công ty, khu vực, người tạo) dùng cho list/filter ở UI.';

GRANT SELECT ON v_quotations_with_scope TO service_role;
