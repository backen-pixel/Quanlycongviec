-- Phạm vi chia sẻ tài liệu theo module xưởng (SX / VC / Công việc dự án)
-- allowed_share_modules: JSON mảng chuỗi, ví dụ ["production","logistics","workshop"]
-- NULL hoặc [] = áp dụng tất cả module (tương thích dữ liệu cũ khi đã bật shared_to_workshop)

ALTER TABLE lead_documents
  ADD COLUMN IF NOT EXISTS allowed_share_modules JSONB DEFAULT NULL;

COMMENT ON COLUMN lead_documents.allowed_share_modules IS
  'Khi shared_to_workshop=true: giới hạn hiển thị ở module production | logistics | workshop (JSON array). NULL = cả ba.';

ALTER TABLE file_attachments
  ADD COLUMN IF NOT EXISTS allowed_companies JSONB DEFAULT NULL;

ALTER TABLE file_attachments
  ADD COLUMN IF NOT EXISTS allowed_share_modules JSONB DEFAULT NULL;

COMMENT ON COLUMN file_attachments.allowed_companies IS
  'Giới hạn xem file đính kèm task theo company_id user (JSON array UUID). NULL = không giới hạn.';

COMMENT ON COLUMN file_attachments.allowed_share_modules IS
  'Giới hạn xem file đính kèm task theo module: production | logistics | workshop. NULL = mọi module.';
