-- Gán công ty module Sản xuất mặc định theo từng loại Lead/Deal (CRM).
-- Khi deal chuyển Thắng / cột Sản xuất mà không gửi production_company_id, backend dùng giá trị này nếu hợp lệ.

ALTER TABLE crm_lead_types
  ADD COLUMN IF NOT EXISTS default_production_company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS crm_lead_types_default_production_co_idx
  ON crm_lead_types (default_production_company_id)
  WHERE default_production_company_id IS NOT NULL;

COMMENT ON COLUMN crm_lead_types.default_production_company_id IS
  'Công ty xưởng (module Sản xuất) mặc định khi chốt deal loại này — dùng khi không chọn tay production_company_id.';
