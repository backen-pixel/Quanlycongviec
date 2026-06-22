-- Kho ảnh chung theo công ty (Drive) — mỗi công ty tối đa 1 root shared_kind = company_images.
CREATE UNIQUE INDEX IF NOT EXISTS uq_drive_roots_company_images
  ON drive_roots(company_id)
  WHERE shared_kind = 'company_images';

COMMENT ON INDEX uq_drive_roots_company_images IS
  'Mỗi công ty một Drive kho ảnh chung (CRM/_Kho ảnh chung).';
