  -- 329: Liên kết file giữa crm_task_attachments ↔ crm_assignment_files (đồng bộ Giao việc ↔ tab Nhiệm vụ)
  BEGIN;

  ALTER TABLE crm_task_attachments
    ADD COLUMN IF NOT EXISTS source_assignment_file_id BIGINT
    REFERENCES crm_assignment_files(id) ON DELETE SET NULL;

  ALTER TABLE crm_assignment_files
    ADD COLUMN IF NOT EXISTS source_task_attachment_id UUID
    REFERENCES crm_task_attachments(id) ON DELETE SET NULL;

  CREATE INDEX IF NOT EXISTS idx_crm_task_att_source_asn_file
    ON crm_task_attachments (source_assignment_file_id)
    WHERE source_assignment_file_id IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_crm_asn_files_source_task_att
    ON crm_assignment_files (source_task_attachment_id)
    WHERE source_task_attachment_id IS NOT NULL;

  COMMENT ON COLUMN crm_task_attachments.source_assignment_file_id IS
    'File Giao việc mirror từ attachment này (crm_assignment_files.id)';
  COMMENT ON COLUMN crm_assignment_files.source_task_attachment_id IS
    'Attachment tab Nhiệm vụ mirror từ file Giao việc này';

  COMMIT;
