-- 639: Phân vùng khoá đối tác theo HỆ SINH THÁI → CÔNG TY → PAGE
--   external_api_keys.tenant_id        — hệ sinh thái khoá được phép đọc
--   external_api_keys.allowed_page_ids — ràng cứng vào một số page Facebook
--   partner_api_audit                  — ghi lại phạm vi đã áp cho từng lượt gọi
-- Additive. Idempotent.

BEGIN;

ALTER TABLE external_api_keys
  ADD COLUMN IF NOT EXISTS tenant_id        uuid REFERENCES tenants(id),
  ADD COLUMN IF NOT EXISTS allowed_page_ids text[];

CREATE INDEX IF NOT EXISTS idx_eak_tenant ON external_api_keys(tenant_id);

-- Suy ra hệ sinh thái cho khoá đã gắn công ty (khoá chưa gắn thì để trống →
-- middleware fail-closed sẽ từ chối, đúng ý đồ).
UPDATE external_api_keys k
SET tenant_id = c.tenant_id
FROM companies c
WHERE k.tenant_id IS NULL
  AND k.company_id IS NOT NULL
  AND c.id = k.company_id
  AND c.tenant_id IS NOT NULL;

ALTER TABLE partner_api_audit
  ADD COLUMN IF NOT EXISTS tenant_id   uuid,
  ADD COLUMN IF NOT EXISTS company_ids text[],
  ADD COLUMN IF NOT EXISTS page_ids    text[];

COMMIT;
