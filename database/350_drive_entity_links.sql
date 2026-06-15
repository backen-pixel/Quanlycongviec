-- 350_drive_entity_links.sql
-- Module Drive: liên kết file Drive với entity CRM (lead/deal/task/project/customer/...).
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS drive_entity_links (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id       UUID NOT NULL REFERENCES drive_files(id) ON DELETE CASCADE,
  -- entity_type: 'lead' | 'deal' | 'task' | 'project' | 'customer' | 'crm_assignment' | 'work_task' | ...
  entity_type   VARCHAR(32) NOT NULL,
  entity_id     UUID NOT NULL,
  note          TEXT,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_drive_entity_links
  ON drive_entity_links(file_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_drive_entity_links_entity
  ON drive_entity_links(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_drive_entity_links_file
  ON drive_entity_links(file_id);

COMMENT ON TABLE drive_entity_links IS
  'Module Drive: file gắn vào lead/task/project/... — không sao chép file, chỉ link metadata.';

COMMIT;
