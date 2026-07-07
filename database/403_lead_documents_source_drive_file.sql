-- Liên kết lead_documents với drive_files để đồng bộ file Drive CRM → tab Tài liệu SX.

ALTER TABLE lead_documents
  ADD COLUMN IF NOT EXISTS source_drive_file_id UUID REFERENCES drive_files(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_documents_source_drive_file
  ON lead_documents (source_drive_file_id)
  WHERE source_drive_file_id IS NOT NULL;

COMMENT ON COLUMN lead_documents.source_drive_file_id IS
  'Mirror từ drive_files khi upload/link Drive trên deal CRM — hiển thị ở tab Tài liệu SX.';
