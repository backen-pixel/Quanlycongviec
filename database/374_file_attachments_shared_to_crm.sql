-- SX/VC chia sẻ file_attachments (tài liệu xưởng) sang tab Tài liệu CRM (bên đặt hàng).

ALTER TABLE file_attachments
  ADD COLUMN IF NOT EXISTS shared_to_crm BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN file_attachments.shared_to_crm IS
  'Xưởng bật → đồng bộ sang lead_documents để CRM (bên đặt hàng) xem trên deal.';

CREATE INDEX IF NOT EXISTS idx_file_attachments_shared_crm
  ON file_attachments (entity_type, entity_id)
  WHERE shared_to_crm = true;

ALTER TABLE lead_documents
  ADD COLUMN IF NOT EXISTS source_file_attachment_id UUID REFERENCES file_attachments(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_documents_source_file_attachment
  ON lead_documents (source_file_attachment_id)
  WHERE source_file_attachment_id IS NOT NULL;

COMMENT ON COLUMN lead_documents.source_file_attachment_id IS
  'Mirror tài liệu xưởng (file_attachments) khi shared_to_crm=true.';
